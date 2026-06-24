/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleSheetsService } from "./src/googleSheetsService";
import { calculateClaimFinancials, validateClaim } from "./src/reconciliationEngine";
import { runReconciliationEngineTests } from "./src/reconciliationEngine.test";
import { Claim, Payment, Note, ClaimStatus, ClaimClassification, ErrorCategory } from "./src/types";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for parsing JSON
  app.use(express.json({ limit: "50mb" }));

  // Initialize our Google Sheets / Memory database service
  const sheetsService = new GoogleSheetsService();
  
  // Try to sync on server start (non-blocking)
  sheetsService.syncWithGoogleSheets().then(res => {
    if (res.success) {
      console.log("Initial Google Sheets sync completed successfully.");
    } else {
      console.warn("Initial Google Sheets sync failed or was bypassed. Operating in-memory mode.");
    }
  });

  // Automatically execute reconciliation engine unit tests on server start for audit/verification
  const testResults = runReconciliationEngineTests();
  const failedTests = testResults.filter(r => !r.success);
  if (failedTests.length > 0) {
    console.error("❌ Reconciliation Engine Unit Tests FAILED:", failedTests);
  } else {
    console.log("✅ All Reconciliation Engine Unit Tests passed successfully.");
  }

  // --- API Routes ---

  // Connection and Diagnostic Status
  app.get("/api/status", (req, res) => {
    const sheetStatus = sheetsService.getConnectionStatus();
    res.json({
      status: "online",
      time: new Date().toISOString(),
      googleSheets: sheetStatus,
      testsRun: testResults.length,
      testsPassed: testResults.length - failedTests.length
    });
  });

  // Force sync from Google Sheets
  app.post("/api/sync", async (req, res) => {
    const result = await sheetsService.syncWithGoogleSheets();
    if (result.success) {
      res.json({ success: true, message: result.message });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  });

  // GET Claims (with filter, search, sorting)
  app.get("/api/claims", async (req, res) => {
    try {
      const claims = await sheetsService.getClaims();
      res.json(claims);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to retrieve claims" });
    }
  });

  // GET Single Claim Detail
  app.get("/api/claims/:id", async (req, res) => {
    try {
      const claims = await sheetsService.getClaims();
      const claim = claims.find(c => c.claim_id === req.params.id);
      if (!claim) {
        return res.status(404).json({ error: "Claim not found" });
      }
      res.json(claim);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to retrieve claim" });
    }
  });

  // POST Create New Claim
  app.post("/api/claims", async (req, res) => {
    try {
      const operatorEmail = req.headers["x-user-email"] as string || "egomez@itera.health";
      const rawClaim = req.body;

      // 1. Generate Claim ID automatically if not provided or placeholder
      if (!rawClaim.claim_id || rawClaim.claim_id.trim() === "" || rawClaim.claim_id === "AUTO_GENERATE") {
        const yearStr = new Date().getFullYear().toString();
        const claims = await sheetsService.getClaims();
        const sameYearClaims = claims.filter(c => c.claim_id.startsWith(`CLM-${yearStr}-`));
        let nextSeq = sameYearClaims.length + 1;
        let candidate = `CLM-${yearStr}-${String(nextSeq).padStart(3, "0")}`;
        while (claims.some(c => c.claim_id === candidate)) {
          nextSeq++;
          candidate = `CLM-${yearStr}-${String(nextSeq).padStart(3, "0")}`;
        }
        rawClaim.claim_id = candidate;
      }

      // 2. Calculate billed_charge using FCSO-style Fee Schedule if applicable
      const serviceDate = rawClaim.date_of_service_from;
      if (serviceDate && rawClaim.cpt_hcpcs) {
        const parts = serviceDate.split("-");
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        const isSemester2 = month >= 7 && month <= 12;

        const feeSchedules = await sheetsService.getFeeSchedules();
        const matched = feeSchedules.find(f => f.cpt_code === rawClaim.cpt_hcpcs && f.year === year);
        if (matched) {
          const rate = isSemester2 ? matched.semester2_rate : matched.semester1_rate;
          rawClaim.billed_charge = rate * (Number(rawClaim.units) || 1);
        }
      }

      // Ensure calculations are run
      const settings = await sheetsService.getSettings();
      const pPercent = Number(settings.find(s => s.setting_key === "PROVIDER_SHARE_PERCENT")?.setting_value || 70);
      const iPercent = Number(settings.find(s => s.setting_key === "ITERA_SHARE_PERCENT")?.setting_value || 30);
      
      const calculated = calculateClaimFinancials(rawClaim, {
        providerSharePercent: pPercent,
        iteraSharePercent: iPercent
      });

      // Validate
      const validationErrors = validateClaim(calculated);
      if (validationErrors.length > 0) {
        return res.status(400).json({ error: "Validation failed", details: validationErrors });
      }

      const created = await sheetsService.createClaim(calculated, operatorEmail);
      res.status(210).json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to create claim" });
    }
  });

  // PUT Update Existing Claim
  app.put("/api/claims/:id", async (req, res) => {
    try {
      const operatorEmail = req.headers["x-user-email"] as string || "egomez@itera.health";
      const rawClaimUpdates = req.body;

      const claims = await sheetsService.getClaims();
      const existing = claims.find(c => c.claim_id === req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Claim not found" });
      }

      // Merge and calculate financials
      const merged = { ...existing, ...rawClaimUpdates };
      
      const settings = await sheetsService.getSettings();
      const pPercent = Number(settings.find(s => s.setting_key === "PROVIDER_SHARE_PERCENT")?.setting_value || 70);
      const iPercent = Number(settings.find(s => s.setting_key === "ITERA_SHARE_PERCENT")?.setting_value || 30);

      const calculated = calculateClaimFinancials(merged, {
        providerSharePercent: pPercent,
        iteraSharePercent: iPercent
      });

      // Validate
      const validationErrors = validateClaim(calculated);
      if (validationErrors.length > 0) {
        return res.status(400).json({ error: "Validation failed", details: validationErrors });
      }

      const updated = await sheetsService.updateClaim(req.params.id, calculated, operatorEmail);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to update claim" });
    }
  });

  // POST Bulk Update Claims
  app.post("/api/claims/bulk-update", async (req, res) => {
    try {
      const operatorEmail = req.headers["x-user-email"] as string || "egomez@itera.health";
      const { claimIds, updates } = req.body;

      if (!claimIds || !Array.isArray(claimIds) || claimIds.length === 0) {
        return res.status(400).json({ error: "No claim IDs provided." });
      }

      // To handle bulk financial updates properly, we fetch, merge, recompute financials, then save each
      const settings = await sheetsService.getSettings();
      const pPercent = Number(settings.find(s => s.setting_key === "PROVIDER_SHARE_PERCENT")?.setting_value || 70);
      const iPercent = Number(settings.find(s => s.setting_key === "ITERA_SHARE_PERCENT")?.setting_value || 30);

      let successCount = 0;
      for (const id of claimIds) {
        const claim = sheetsService.claims.find(c => c.claim_id === id);
        if (claim) {
          const merged = { ...claim, ...updates };
          const recomputed = calculateClaimFinancials(merged, {
            providerSharePercent: pPercent,
            iteraSharePercent: iPercent
          });

          await sheetsService.updateClaim(id, recomputed, operatorEmail);
          successCount++;
        }
      }

      res.json({ success: true, updatedCount: successCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Bulk update failed" });
    }
  });

  // GET Payments
  app.get("/api/payments", async (req, res) => {
    try {
      const payments = await sheetsService.getPayments();
      res.json(payments);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to load payments" });
    }
  });

  // POST Create Payment and link to Claim
  app.post("/api/payments", async (req, res) => {
    try {
      const operatorEmail = req.headers["x-user-email"] as string || "egomez@itera.health";
      const paymentData = req.body as Payment;

      if (!paymentData.claim_id) {
        return res.status(400).json({ error: "Claim ID is required for a payment." });
      }

      // Add payment
      const payment = await sheetsService.createPayment(paymentData);

      // Now we find the claim and add the payment to direct collections
      const claim = sheetsService.claims.find(c => c.claim_id === paymentData.claim_id);
      if (claim) {
        // Increase direct collections depending on who received the payment
        if (paymentData.payment_received_by === "ITERA") {
          claim.itera_direct_collection = Number((claim.itera_direct_collection + paymentData.amount).toFixed(2));
        } else {
          claim.provider_direct_collection = Number((claim.provider_direct_collection + paymentData.amount).toFixed(2));
        }

        // Adjust state variables based on payment
        claim.payment_date = paymentData.payment_date;
        claim.check_or_eft_number = paymentData.check_or_eft_number;
        claim.paid_amount = Number((claim.paid_amount + paymentData.amount).toFixed(2));
        claim.claim_classification = paymentData.payment_received_by === "ITERA" ? ClaimClassification.IteraCollected : ClaimClassification.ProviderCollected;
        
        // Recalculate everything else
        const settings = await sheetsService.getSettings();
        const pPercent = Number(settings.find(s => s.setting_key === "PROVIDER_SHARE_PERCENT")?.setting_value || 70);
        const iPercent = Number(settings.find(s => s.setting_key === "ITERA_SHARE_PERCENT")?.setting_value || 30);

        const calculated = calculateClaimFinancials(claim, {
          providerSharePercent: pPercent,
          iteraSharePercent: iPercent
        });

        // Save
        await sheetsService.updateClaim(claim.claim_id, calculated, operatorEmail);
      }

      res.status(211).json(payment);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to log payment" });
    }
  });

  // GET Notes
  app.get("/api/notes", async (req, res) => {
    try {
      const notes = await sheetsService.getNotes();
      res.json(notes);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to load notes" });
    }
  });

  // POST Create Note for Claim
  app.post("/api/notes", async (req, res) => {
    try {
      const authorEmail = req.headers["x-user-email"] as string || "egomez@itera.health";
      const noteData = req.body as Note;

      if (!noteData.claim_id) {
        return res.status(400).json({ error: "Claim ID is required for a note." });
      }

      const note = await sheetsService.createNote(noteData, authorEmail);

      // Update claim's last_note
      const claim = sheetsService.claims.find(c => c.claim_id === noteData.claim_id);
      if (claim) {
        claim.last_note = noteData.note_text;
        // Simple update
        await sheetsService.updateClaim(claim.claim_id, claim, authorEmail);
      }

      res.status(211).json(note);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to create note" });
    }
  });

  // GET Audit Logs
  app.get("/api/audit-logs", async (req, res) => {
    try {
      const logs = await sheetsService.getAuditLogs();
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to load audit logs" });
    }
  });

  // GET Providers
  app.get("/api/providers", async (req, res) => {
    res.json(await sheetsService.getProviders());
  });

  // GET Payers
  app.get("/api/payers", async (req, res) => {
    res.json(await sheetsService.getPayers());
  });

  // GET Users
  app.get("/api/users", async (req, res) => {
    res.json(await sheetsService.getUsers());
  });

  // GET Settings
  app.get("/api/settings", async (req, res) => {
    res.json(await sheetsService.getSettings());
  });

  // PUT Settings
  app.put("/api/settings", async (req, res) => {
    try {
      const { key, value } = req.body;
      const updated = await sheetsService.updateSettings(key, value);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to update setting" });
    }
  });

  // GET Fee Schedules
  app.get("/api/fee-schedules", async (req, res) => {
    try {
      res.json(await sheetsService.getFeeSchedules());
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to retrieve fee schedules" });
    }
  });

  // POST Create Fee Schedule
  app.post("/api/fee-schedules", async (req, res) => {
    try {
      const created = await sheetsService.createFeeSchedule(req.body);
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to create fee schedule" });
    }
  });

  // PUT Update Fee Schedule
  app.put("/api/fee-schedules/:id", async (req, res) => {
    try {
      const updated = await sheetsService.updateFeeSchedule(req.params.id, req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to update fee schedule" });
    }
  });

  // DELETE Fee Schedule
  app.delete("/api/fee-schedules/:id", async (req, res) => {
    try {
      const success = await sheetsService.deleteFeeSchedule(req.params.id);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to delete fee schedule" });
    }
  });

  // POST Import Claims CSV
  app.post("/api/import-csv", async (req, res) => {
    try {
      const operatorEmail = req.headers["x-user-email"] as string || "egomez@itera.health";
      const { rows } = req.body;

      if (!rows || !Array.isArray(rows)) {
        return res.status(400).json({ error: "Rows are required for CSV import." });
      }

      const settings = await sheetsService.getSettings();
      const pPercent = Number(settings.find(s => s.setting_key === "PROVIDER_SHARE_PERCENT")?.setting_value || 70);
      const iPercent = Number(settings.find(s => s.setting_key === "ITERA_SHARE_PERCENT")?.setting_value || 30);

      const importedClaims: Claim[] = [];
      const errors: { row: number; claimId?: string; errors: string[] }[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        
        // Parse CSV fields
        const claimObj: Partial<Claim> = {
          claim_id: row.claim_id?.trim(),
          patient_id: row.patient_id?.trim() || `PAT-${Math.floor(Math.random() * 10000)}`,
          patient_display_name_masked: row.patient_display_name_masked?.trim() || "P*** N**",
          practice_id: row.practice_id?.trim() || "PRAC_01",
          practice_name: row.practice_name?.trim() || "Metropolitan Care Group",
          provider_id: row.provider_id?.trim() || "PROV_01",
          provider_name: row.provider_name?.trim() || "Dr. Robert Chen",
          provider_npi: row.provider_npi?.trim() || "1982736450",
          payer_id: row.payer_id?.trim() || "PAY_01",
          payer_name: row.payer_name?.trim() || "Medicare Texas (Novitas)",
          service_type: row.service_type?.trim() || "CCM",
          cpt_hcpcs: row.cpt_hcpcs?.trim() || "99490",
          modifiers: row.modifiers?.trim() || "",
          units: Number(row.units || 1),
          date_of_service_from: row.date_of_service_from?.trim() || new Date().toISOString().split("T")[0],
          date_of_service_to: row.date_of_service_to?.trim() || new Date().toISOString().split("T")[0],
          month_of_service: row.month_of_service?.trim() || new Date().toISOString().slice(0, 7),
          billed_by: (row.billed_by?.trim() === "Provider" ? "Provider" : "ITERA") as any,
          payment_received_by: (["ITERA", "Provider", "Split", "Unknown"].includes(row.payment_received_by) ? row.payment_received_by : "Unknown") as any,
          claim_status: (row.claim_status?.trim() || ClaimStatus.Submitted) as any,
          claim_classification: (row.claim_classification?.trim() || ClaimClassification.CleanClaim) as any,
          billed_charge: Number(row.billed_charge || 150),
          allowed_amount: Number(row.allowed_amount || 0),
          paid_amount: Number(row.paid_amount || 0),
          insurance_adjustment: Number(row.insurance_adjustment || 0),
          denied_amount: Number(row.denied_amount || 0),
          write_off_amount: Number(row.write_off_amount || 0),
          uncollectible_amount: Number(row.uncollectible_amount || 0),
          itera_direct_collection: Number(row.itera_direct_collection || 0),
          provider_direct_collection: Number(row.provider_direct_collection || 0),
          payment_to_physician: Number(row.payment_to_physician || 0),
          era_received: (row.era_received === "Yes" ? "Yes" : "No") as any,
          eob_received: (row.eob_received === "Yes" ? "Yes" : "No") as any,
          payment_date: row.payment_date?.trim() || "",
          check_or_eft_number: row.check_or_eft_number?.trim() || "",
          carc_code: row.carc_code?.trim() || "",
          rarc_code: row.rarc_code?.trim() || "",
          denial_reason: row.denial_reason?.trim() || "",
          error_flag: row.error_flag === "true" || row.error_flag === true,
          error_category: row.error_category?.trim() || "",
          locked: row.locked === "true" || row.locked === true,
          lock_reason: row.lock_reason?.trim() || "",
          correction_status: row.correction_status?.trim() || "",
          resubmission_date: row.resubmission_date?.trim() || "",
          corrected_claim_reference: row.corrected_claim_reference?.trim() || "",
          last_note: row.last_note?.trim() || "Imported via CSV file.",
        };

        // Recalculate
        const calculated = calculateClaimFinancials(claimObj, {
          providerSharePercent: pPercent,
          iteraSharePercent: iPercent
        });

        // Validate
        const validationErrors = validateClaim(calculated);
        if (validationErrors.length > 0) {
          errors.push({ row: i + 1, claimId: calculated.claim_id, errors: validationErrors });
        } else {
          try {
            const added = await sheetsService.createClaim(calculated, operatorEmail);
            importedClaims.push(added);
          } catch (err: any) {
            errors.push({ row: i + 1, claimId: calculated.claim_id, errors: [err.message || "Failed to write claim"] });
          }
        }
      }

      res.json({
        success: errors.length === 0,
        importedCount: importedClaims.length,
        errorCount: errors.length,
        errors: errors
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Import process failed" });
    }
  });

  // Vite development middleware vs Static serving for Production
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting in DEVELOPMENT mode with Vite Middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ITERA Claim Reconciliation Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Critical failure during Express server startup:", err);
});
