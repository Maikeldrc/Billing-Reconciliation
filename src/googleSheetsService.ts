/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { google } from "googleapis";
import { Claim, Payment, Note, AuditLog, Provider, Payer, User, Setting, FeeSchedule } from "./types";
import { SEED_CLAIMS, SEED_PAYMENTS, SEED_NOTES, SEED_AUDIT_LOGS, SEED_PROVIDERS, SEED_PAYERS, SEED_USERS, SEED_SETTINGS, SEED_FEE_SCHEDULES } from "./seedData";

/**
 * Service to manage read/write operations to Google Sheets.
 * Falls back to an in-memory database with seed data if Google Sheets environment variables are not configured or fail to connect.
 */
export class GoogleSheetsService {
  private isConfigured: boolean = false;
  private clientEmail?: string;
  private privateKey?: string;
  private sheetId?: string;
  private authClient: any = null;
  private sheets: any = null;

  // In-memory data store for fallback/caching
  public claims: Claim[] = [...SEED_CLAIMS];
  public payments: Payment[] = [...SEED_PAYMENTS];
  public notes: Note[] = [...SEED_NOTES];
  public auditLogs: AuditLog[] = [...SEED_AUDIT_LOGS];
  public providers: Provider[] = [...SEED_PROVIDERS];
  public payers: Payer[] = [...SEED_PAYERS];
  public users: User[] = [...SEED_USERS];
  public settings: Setting[] = [...SEED_SETTINGS];
  public feeSchedules: FeeSchedule[] = [...SEED_FEE_SCHEDULES];

  constructor() {
    this.clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    this.privateKey = process.env.GOOGLE_PRIVATE_KEY;
    this.sheetId = process.env.GOOGLE_SHEET_ID;

    if (this.clientEmail && this.privateKey && this.sheetId) {
      try {
        const formattedKey = this.privateKey.replace(/\\n/g, "\n");
        this.authClient = new google.auth.JWT({
          email: this.clientEmail,
          key: formattedKey,
          scopes: ["https://www.googleapis.com/auth/spreadsheets"]
        });
        this.sheets = google.sheets({ version: "v4", auth: this.authClient });
        this.isConfigured = true;
        console.log("Google Sheets service initialized successfully with credentials.");
      } catch (err) {
        console.error("Failed to initialize Google Sheets service with credentials, falling back to local memory:", err);
        this.isConfigured = false;
      }
    } else {
      console.warn("Google Sheets credentials not fully configured in environment variables. Falling back to in-memory database.");
      this.isConfigured = false;
    }
  }

  public getConnectionStatus() {
    return {
      configured: this.isConfigured,
      hasClientEmail: !!this.clientEmail,
      hasPrivateKey: !!this.privateKey,
      hasSheetId: !!this.sheetId,
      usingFallback: !this.isConfigured
    };
  }

  /**
   * Helper to write a row to a sheet tab
   */
  private async appendRow(tabName: string, rowData: any[]) {
    if (!this.isConfigured) return;
    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.sheetId,
        range: `${tabName}!A:A`,
        valueInputOption: "RAW",
        requestBody: {
          values: [rowData],
        },
      });
    } catch (err) {
      console.error(`Google Sheets: Failed to append row to ${tabName}`, err);
    }
  }

  /**
   * Helper to rewrite all data in a sheet tab
   */
  private async overwriteTab(tabName: string, headers: string[], rows: any[][]) {
    if (!this.isConfigured) return;
    try {
      // Clear sheet
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: this.sheetId,
        range: `${tabName}!A:ZZ`,
      });

      // Write headers and data
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.sheetId,
        range: `${tabName}!A1`,
        valueInputOption: "RAW",
        requestBody: {
          values: [headers, ...rows],
        },
      });
    } catch (err) {
      console.error(`Google Sheets: Failed to overwrite tab ${tabName}`, err);
    }
  }

  /**
   * Sync Google Sheets with Local Store (and vice versa)
   */
  public async syncWithGoogleSheets() {
    if (!this.isConfigured) {
      return { success: true, message: "Using in-memory mock storage (Google Sheets not configured)." };
    }

    try {
      // Try to load tables. If tabs don't exist, we bootstrap them!
      await this.bootstrapSheetsIfEmpty();
      await this.loadAllFromSheets();
      return { success: true, message: "Successfully synchronized with Google Sheets!" };
    } catch (err: any) {
      console.error("Failed to sync with Google Sheets, reverting to in-memory store:", err);
      return { success: false, error: err.message || String(err) };
    }
  }

  /**
   * Create tabs and write headers/seed data if spreadsheet is fresh
   */
  private async bootstrapSheetsIfEmpty() {
    if (!this.isConfigured) return;
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.sheetId,
      });
      const existingTabs = response.data.sheets?.map((s: any) => s.properties.title) || [];
      
      const requiredTabs = [
        { name: "Claims", headers: CLAIMS_HEADERS, seed: this.claims },
        { name: "Payments", headers: PAYMENTS_HEADERS, seed: this.payments },
        { name: "Notes", headers: NOTES_HEADERS, seed: this.notes },
        { name: "Audit_Log", headers: AUDIT_LOGS_HEADERS, seed: this.auditLogs },
        { name: "Providers", headers: PROVIDERS_HEADERS, seed: this.providers },
        { name: "Payers", headers: PAYERS_HEADERS, seed: this.payers },
        { name: "Users", headers: USERS_HEADERS, seed: this.users },
        { name: "Settings", headers: SETTINGS_HEADERS, seed: this.settings },
        { name: "FeeSchedules", headers: FEESCHEDULES_HEADERS, seed: this.feeSchedules }
      ];

      for (const tab of requiredTabs) {
        if (!existingTabs.includes(tab.name)) {
          console.log(`Creating tab "${tab.name}" in Google Sheet...`);
          // Note: Add tab request if missing
          await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.sheetId,
            requestBody: {
              requests: [
                {
                  addSheet: {
                    properties: { title: tab.name }
                  }
                }
              ]
            }
          });
          
          // Seed initial data
          const rows = tab.seed.map((item: any) => mapObjectToRow(tab.name, item));
          await this.overwriteTab(tab.name, tab.headers, rows);
        }
      }
    } catch (err) {
      console.error("Error bootstrapping Google Sheet tabs:", err);
      throw err;
    }
  }

  private async loadAllFromSheets() {
    if (!this.isConfigured) return;

    const tabs = ["Claims", "Payments", "Notes", "Audit_Log", "Providers", "Payers", "Users", "Settings", "FeeSchedules"];
    for (const tab of tabs) {
      try {
        const response = await this.sheets.spreadsheets.values.get({
          spreadsheetId: this.sheetId,
          range: `${tab}!A:ZZ`,
        });

        const rows = response.data.values;
        if (rows && rows.length > 1) {
          const headers = rows[0];
          const dataRows = rows.slice(1);
          const mappedObjects = dataRows.map((row: string[]) => mapRowToObject(tab, headers, row));
          
          // Save in memory
          if (tab === "Claims") this.claims = mappedObjects as Claim[];
          if (tab === "Payments") this.payments = mappedObjects as Payment[];
          if (tab === "Notes") this.notes = mappedObjects as Note[];
          if (tab === "Audit_Log") this.auditLogs = mappedObjects as AuditLog[];
          if (tab === "Providers") this.providers = mappedObjects as Provider[];
          if (tab === "Payers") this.payers = mappedObjects as Payer[];
          if (tab === "Users") this.users = mappedObjects as User[];
          if (tab === "Settings") this.settings = mappedObjects as Setting[];
          if (tab === "FeeSchedules") this.feeSchedules = mappedObjects as FeeSchedule[];
        }
      } catch (err) {
        console.error(`Failed to load tab ${tab} from Google Sheets:`, err);
      }
    }
  }

  // --- External API Integrations ---

  public async getClaims(): Promise<Claim[]> {
    return this.claims;
  }

  public async updateClaim(claimId: string, updatedClaim: Claim, operatorEmail: string): Promise<Claim> {
    const index = this.claims.findIndex(c => c.claim_id === claimId);
    if (index === -1) {
      throw new Error(`Claim with ID ${claimId} not found.`);
    }

    const previous = this.claims[index];
    this.claims[index] = {
      ...updatedClaim,
      updated_at: new Date().toISOString(),
      updated_by: operatorEmail
    };

    // Auto-generate audit logs for differences
    const diffs = getClaimDifferences(previous, this.claims[index]);
    for (const diff of diffs) {
      const auditRecord: AuditLog = {
        audit_id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        claim_id: claimId,
        action_type: "Update",
        field_name: diff.field,
        previous_value: String(diff.prev),
        new_value: String(diff.curr),
        reason: diff.reason || "Field manual modification",
        changed_by: operatorEmail,
        changed_at: new Date().toISOString()
      };
      this.auditLogs.unshift(auditRecord);
      if (this.isConfigured) {
        await this.appendRow("Audit_Log", mapObjectToRow("Audit_Log", auditRecord));
      }
    }

    // Push claim update to Google Sheets if configured
    if (this.isConfigured) {
      const rows = this.claims.map(c => mapObjectToRow("Claims", c));
      await this.overwriteTab("Claims", CLAIMS_HEADERS, rows);
    }

    return this.claims[index];
  }

  public async createClaim(newClaim: Claim, operatorEmail: string): Promise<Claim> {
    const exists = this.claims.some(c => c.claim_id === newClaim.claim_id);
    if (exists) {
      throw new Error(`Claim ID "${newClaim.claim_id}" is already used.`);
    }

    const claimToAdd = {
      ...newClaim,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: operatorEmail
    };

    this.claims.unshift(claimToAdd);

    // Write audit log
    const auditRecord: AuditLog = {
      audit_id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      claim_id: newClaim.claim_id,
      action_type: "Create",
      field_name: "all",
      previous_value: "",
      new_value: "Claim Created",
      reason: "Claim manually imported/created.",
      changed_by: operatorEmail,
      changed_at: new Date().toISOString()
    };
    this.auditLogs.unshift(auditRecord);

    if (this.isConfigured) {
      await this.appendRow("Claims", mapObjectToRow("Claims", claimToAdd));
      await this.appendRow("Audit_Log", mapObjectToRow("Audit_Log", auditRecord));
    }

    return claimToAdd;
  }

  public async bulkUpdateClaims(claimIds: string[], updates: Partial<Claim>, operatorEmail: string): Promise<number> {
    let updatedCount = 0;
    
    for (const id of claimIds) {
      const idx = this.claims.findIndex(c => c.claim_id === id);
      if (idx !== -1) {
        const previous = this.claims[idx];
        const merged = {
          ...previous,
          ...updates,
          updated_at: new Date().toISOString(),
          updated_by: operatorEmail
        } as Claim;
        
        this.claims[idx] = merged;
        updatedCount++;

        // Add bulk update audit record
        const auditRecord: AuditLog = {
          audit_id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          claim_id: id,
          action_type: "Bulk Update",
          field_name: Object.keys(updates).join(", "),
          previous_value: "Various",
          new_value: JSON.stringify(updates),
          reason: "Bulk modification through claims worklist",
          changed_by: operatorEmail,
          changed_at: new Date().toISOString()
        };
        this.auditLogs.unshift(auditRecord);
        if (this.isConfigured) {
          await this.appendRow("Audit_Log", mapObjectToRow("Audit_Log", auditRecord));
        }
      }
    }

    if (this.isConfigured && updatedCount > 0) {
      const rows = this.claims.map(c => mapObjectToRow("Claims", c));
      await this.overwriteTab("Claims", CLAIMS_HEADERS, rows);
    }

    return updatedCount;
  }

  public async getPayments(): Promise<Payment[]> {
    return this.payments;
  }

  public async createPayment(newPayment: Payment): Promise<Payment> {
    const paymentToAdd = {
      ...newPayment,
      payment_id: newPayment.payment_id || `PMT-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.payments.unshift(paymentToAdd);

    if (this.isConfigured) {
      await this.appendRow("Payments", mapObjectToRow("Payments", paymentToAdd));
    }

    return paymentToAdd;
  }

  public async getNotes(): Promise<Note[]> {
    return this.notes;
  }

  public async createNote(newNote: Note, authorEmail: string): Promise<Note> {
    const noteToAdd = {
      ...newNote,
      note_id: `NTE-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      created_by: authorEmail,
      created_at: new Date().toISOString()
    };

    this.notes.unshift(noteToAdd);

    if (this.isConfigured) {
      await this.appendRow("Notes", mapObjectToRow("Notes", noteToAdd));
    }

    return noteToAdd;
  }

  public async getAuditLogs(): Promise<AuditLog[]> {
    return this.auditLogs;
  }

  public async getProviders(): Promise<Provider[]> {
    return this.providers;
  }

  public async getPayers(): Promise<Payer[]> {
    return this.payers;
  }

  public async getUsers(): Promise<User[]> {
    return this.users;
  }

  public async getSettings(): Promise<Setting[]> {
    return this.settings;
  }

  public async getFeeSchedules(): Promise<FeeSchedule[]> {
    return this.feeSchedules;
  }

  public async createFeeSchedule(fs: FeeSchedule): Promise<FeeSchedule> {
    const fsToAdd = {
      ...fs,
      id: fs.id || `FSCH-${Date.now()}`
    };
    this.feeSchedules.push(fsToAdd);
    if (this.isConfigured) {
      const rows = this.feeSchedules.map(f => mapObjectToRow("FeeSchedules", f));
      await this.overwriteTab("FeeSchedules", FEESCHEDULES_HEADERS, rows);
    }
    return fsToAdd;
  }

  public async updateFeeSchedule(id: string, updated: FeeSchedule): Promise<FeeSchedule> {
    const index = this.feeSchedules.findIndex(f => f.id === id);
    if (index === -1) {
      throw new Error(`Fee schedule with ID ${id} not found.`);
    }
    this.feeSchedules[index] = { ...updated, id };
    if (this.isConfigured) {
      const rows = this.feeSchedules.map(f => mapObjectToRow("FeeSchedules", f));
      await this.overwriteTab("FeeSchedules", FEESCHEDULES_HEADERS, rows);
    }
    return this.feeSchedules[index];
  }

  public async deleteFeeSchedule(id: string): Promise<boolean> {
    const index = this.feeSchedules.findIndex(f => f.id === id);
    if (index === -1) {
      return false;
    }
    this.feeSchedules.splice(index, 1);
    if (this.isConfigured) {
      const rows = this.feeSchedules.map(f => mapObjectToRow("FeeSchedules", f));
      await this.overwriteTab("FeeSchedules", FEESCHEDULES_HEADERS, rows);
    }
    return true;
  }

  public async updateSettings(key: string, value: string): Promise<Setting> {
    const index = this.settings.findIndex(s => s.setting_key === key);
    if (index !== -1) {
      this.settings[index].setting_value = value;
      if (this.isConfigured) {
        const rows = this.settings.map(s => mapObjectToRow("Settings", s));
        await this.overwriteTab("Settings", SETTINGS_HEADERS, rows);
      }
      return this.settings[index];
    }
    throw new Error(`Setting ${key} not found.`);
  }
}

// --- Diff Helper ---
function getClaimDifferences(prev: Claim, curr: Claim): { field: string, prev: any, curr: any, reason?: string }[] {
  const diffs: { field: string, prev: any, curr: any, reason?: string }[] = [];
  const fieldsToCheck: Array<keyof Claim> = [
    "claim_status",
    "claim_classification",
    "billed_by",
    "payment_received_by",
    "billed_charge",
    "allowed_amount",
    "paid_amount",
    "insurance_adjustment",
    "denied_amount",
    "write_off_amount",
    "uncollectible_amount",
    "itera_direct_collection",
    "provider_direct_collection",
    "payment_to_physician",
    "locked",
    "lock_reason",
    "error_flag",
    "error_category",
    "correction_status",
    "resubmission_date",
    "corrected_claim_reference"
  ];

  fieldsToCheck.forEach(field => {
    if (prev[field] !== curr[field]) {
      let reason = "";
      if (field === "locked" && curr.locked) reason = curr.lock_reason || "Locked claim due to error";
      if (field === "locked" && !curr.locked) reason = "Unlocked claim";
      if (field === "error_flag" && curr.error_flag) reason = `Marked error: ${curr.error_category}`;
      if (field === "error_flag" && !curr.error_flag) reason = "Cleared error status";
      if (field === "claim_status") reason = `Status transitioned from ${prev.claim_status} to ${curr.claim_status}`;
      if (field === "claim_classification") reason = `Classification transitioned from ${prev.claim_classification} to ${curr.claim_classification}`;
      
      diffs.push({
        field,
        prev: prev[field],
        curr: curr[field],
        reason
      });
    }
  });

  return diffs;
}

// --- Google Sheets Header Columns & Schema Mappers ---

const CLAIMS_HEADERS = [
  "claim_id", "patient_id", "patient_display_name_masked", "practice_id", "practice_name",
  "provider_id", "provider_name", "provider_npi", "payer_id", "payer_name", "service_type",
  "cpt_hcpcs", "modifiers", "units", "date_of_service_from", "date_of_service_to",
  "month_of_service", "billed_by", "payment_received_by", "claim_status", "claim_classification",
  "billed_charge", "allowed_amount", "paid_amount", "insurance_adjustment", "denied_amount",
  "write_off_amount", "uncollectible_amount", "net_collectible_revenue", "itera_direct_collection",
  "provider_direct_collection", "total_collections", "ar_balance", "itera_ar", "provider_ar",
  "account_payable_to_physician", "payment_to_physician", "ending_ap_to_physician",
  "net_itera_revenue", "net_provider_revenue", "era_received", "eob_received", "payment_date",
  "check_or_eft_number", "carc_code", "rarc_code", "denial_reason", "error_flag", "error_category",
  "locked", "lock_reason", "correction_status", "resubmission_date", "corrected_claim_reference",
  "last_note", "service_lines_json", "created_at", "updated_at", "updated_by"
];

const PAYMENTS_HEADERS = [
  "payment_id", "claim_id", "payment_date", "payment_received_by", "payer_name", "amount",
  "check_or_eft_number", "era_id", "eob_id", "payment_source", "notes", "created_at", "updated_at"
];

const NOTES_HEADERS = [
  "note_id", "claim_id", "note_type", "note_text", "created_by", "created_at"
];

const AUDIT_LOGS_HEADERS = [
  "audit_id", "claim_id", "action_type", "field_name", "previous_value", "new_value", "reason", "changed_by", "changed_at"
];

const PROVIDERS_HEADERS = [
  "provider_id", "provider_name", "npi", "practice_id", "practice_name", "active"
];

const PAYERS_HEADERS = [
  "payer_id", "payer_name", "payer_type", "active"
];

const USERS_HEADERS = [
  "user_id", "name", "email", "role", "active"
];

const SETTINGS_HEADERS = [
  "setting_key", "setting_value", "description"
];

const FEESCHEDULES_HEADERS = [
  "id", "cpt_code", "year", "semester1_rate", "semester2_rate", "description"
];

/**
 * Maps a row array from sheets to a TypeScript object record
 */
function mapRowToObject(tabName: string, headers: string[], row: string[]): any {
  const obj: any = {};
  headers.forEach((header, index) => {
    const rawVal = row[index] !== undefined ? row[index] : "";
    
    // Parse boolean, numbers and strings correctly
    if (rawVal === "true") {
      obj[header] = true;
    } else if (rawVal === "false") {
      obj[header] = false;
    } else if (rawVal === "") {
      obj[header] = "";
    } else if (/^\d+(\.\d+)?$/.test(rawVal) && !["claim_id", "patient_id", "provider_npi", "npi", "check_or_eft_number", "carc_code", "rarc_code", "corrected_claim_reference"].includes(header)) {
      obj[header] = Number(rawVal);
    } else {
      obj[header] = rawVal;
    }
  });

  return obj;
}

/**
 * Maps a TypeScript object record to a flat row array for sheets
 */
function mapObjectToRow(tabName: string, obj: any): any[] {
  let headers: string[] = [];
  if (tabName === "Claims") headers = CLAIMS_HEADERS;
  else if (tabName === "Payments") headers = PAYMENTS_HEADERS;
  else if (tabName === "Notes") headers = NOTES_HEADERS;
  else if (tabName === "Audit_Log") headers = AUDIT_LOGS_HEADERS;
  else if (tabName === "Providers") headers = PROVIDERS_HEADERS;
  else if (tabName === "Payers") headers = PAYERS_HEADERS;
  else if (tabName === "Users") headers = USERS_HEADERS;
  else if (tabName === "Settings") headers = SETTINGS_HEADERS;
  else if (tabName === "FeeSchedules") headers = FEESCHEDULES_HEADERS;

  return headers.map(h => {
    const val = obj[h];
    if (val === undefined || val === null) return "";
    return String(val);
  });
}
