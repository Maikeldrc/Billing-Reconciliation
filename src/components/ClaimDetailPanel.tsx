/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  X,
  FileCheck,
  Lock,
  Unlock,
  AlertOctagon,
  Coins,
  History,
  FileText,
  Calendar,
  User,
  Plus,
  Send,
  Wrench,
  CheckCircle2,
  Info,
  Zap,
  Shield,
  RefreshCw,
  Sliders,
  Database
} from "lucide-react";
import { Claim, ClaimStatus, ClaimClassification, ErrorCategory, Payment, Note, AuditLog, FeeSchedule, Payer } from "../types";
import { StatusBadge } from "./StatusBadge";
import { ClassificationBadge } from "./ClassificationBadge";

const COMMON_CPT_DESCRIPTIONS: Record<string, string> = {
  "99453": "RPM - Preparación inicial de dispositivo, educación y entrenamiento del paciente.",
  "99454": "RPM - Suministro de dispositivo con transmisión programada diaria y grabaciones cada 30 días.",
  "99457": "RPM - Monitoreo fisiológico remoto por personal de salud, primeros 20 minutos de revisión mensual.",
  "99458": "RPM - Monitoreo fisiológico remoto, por cada periodo adicional de 20 minutos mensuales.",
  "99490": "CCM - Gestión de cuidado crónico, mínimo 20 minutos de personal clínico al mes bajo dirección médica.",
  "99439": "CCM - Gestión de cuidado crónico, periodo adicional de 20 minutos mensuales.",
  "99491": "CCM - Gestión de cuidado crónico por médico o profesional calificado, primeros 30 minutos.",
  "99484": "BHI - Servicios de integración de salud conductual general, 20 minutos mensuales.",
  "99495": "TCM - Gestión de transición de cuidado médico, complejidad moderada (comunicación en 2 días, visita en 14 días).",
  "99496": "TCM - Gestión de transición de cuidado médico, alta complejidad (comunicación en 2 días, visita en 7 días)."
};

const CARC_CODE_DESCRIPTIONS: Record<string, string> = {
  "CO-45": "Charge exceeds fee schedule (Exceso de Tarifa)",
  "CO-253": "Sequestration (Secuestro de fondos federales)",
  "CO-97": "Bundled service (Servicio incluido en otro procedimiento)",
  "CO-16": "Lacks information (Falta información en reclamo)",
  "PR-1": "Deductible (Deducible del paciente)",
  "PR-2": "Coinsurance (Coaseguro del paciente)",
  "PR-3": "Copay (Copago del paciente)",
  "OA-23": "Prior payer adjudication (Ajuste por decisión de asegurador previo)",
  "CO-18": "Duplicate service (Servicio duplicado)"
};

interface ServiceLine {
  cpt: string;
  units: number;
  charged: number;
  allowed: number;
  adj: number;
  patResp: number;
  paid: number;
  balance: number;
  codes: string[];
}

interface ClaimDetailPanelProps {
  claim: Claim;
  onClose: () => void;
  onUpdate: (updated: Partial<Claim>) => Promise<void>;
  onAddNote: (noteType: Note["note_type"], text: string) => Promise<void>;
  onAddPayment: (pmt: Partial<Payment>) => Promise<void>;
  notes: Note[];
  auditLogs: AuditLog[];
  userRole: string;
  feeSchedules: FeeSchedule[];
  payers: Payer[];
}

export function ClaimDetailPanel({
  claim,
  onClose,
  onUpdate,
  onAddNote,
  onAddPayment,
  notes,
  auditLogs,
  userRole,
  feeSchedules,
  payers = []
}: ClaimDetailPanelProps) {
  // Local form states
  const [status, setStatus] = useState<ClaimStatus>(claim.claim_status);
  const [classification, setClassification] = useState<ClaimClassification>(claim.claim_classification);
  const [billedBy, setBilledBy] = useState<"ITERA" | "Provider">(claim.billed_by);
  const [paymentReceivedBy, setPaymentReceivedBy] = useState<Claim["payment_received_by"]>(claim.payment_received_by);
  
  // Financial field states
  const [billedCharge, setBilledCharge] = useState(claim.billed_charge);
  const [allowedAmount, setAllowedAmount] = useState(claim.allowed_amount);
  const [paidAmount, setPaidAmount] = useState(claim.paid_amount);
  const [insuranceAdjustment, setInsuranceAdjustment] = useState(claim.insurance_adjustment);
  const [deniedAmount, setDeniedAmount] = useState(claim.denied_amount);
  const [writeOffAmount, setWriteOffAmount] = useState(claim.write_off_amount);
  const [uncollectibleAmount, setUncollectibleAmount] = useState(claim.uncollectible_amount);
  const [iteraDirect, setIteraDirect] = useState(claim.itera_direct_collection);
  const [providerDirect, setProviderDirect] = useState(claim.provider_direct_collection);
  const [paymentToPhysician, setPaymentToPhysician] = useState(claim.payment_to_physician);

  // Error & Correction Workflow
  const [errorFlag, setErrorFlag] = useState(claim.error_flag);
  const [errorCategory, setErrorCategory] = useState<ErrorCategory | "">(claim.error_category || "");
  const [locked, setLocked] = useState(claim.locked);
  const [lockReason, setLockReason] = useState(claim.lock_reason);
  const [correctionStatus, setCorrectionStatus] = useState<Claim["correction_status"]>(claim.correction_status);
  const [resubmissionDate, setResubmissionDate] = useState(claim.resubmission_date);
  const [correctedReference, setCorrectedReference] = useState(claim.corrected_claim_reference);

  // EOB / ERA Info
  const [eraReceived, setEraReceived] = useState<"Yes" | "No">(claim.era_received);
  const [eobReceived, setEobReceived] = useState<"Yes" | "No">(claim.eob_received);
  const [paymentDate, setPaymentDate] = useState(claim.payment_date);
  const [checkEftNumber, setCheckEftNumber] = useState(claim.check_or_eft_number);
  const [carcCode, setCarcCode] = useState(claim.carc_code);
  const [rarcCode, setRarcCode] = useState(claim.rarc_code);
  const [denialReason, setDenialReason] = useState(claim.denial_reason);

  // New Note state
  const [newNoteType, setNewNoteType] = useState<Note["note_type"]>("General");
  const [newNoteText, setNewNoteText] = useState("");

  // New Payment logger state
  const [logPaymentAmount, setLogPaymentAmount] = useState<number | "">("");
  const [logPaymentCheck, setLogPaymentCheck] = useState("");
  const [logPaymentSource, setLogPaymentSource] = useState("Manual");

  // Local state for CPT Service Lines Adjudication
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);

  // ERA Quick Entry and Insurance change states
  const [isQuickEntryMode, setIsQuickEntryMode] = useState(true);
  const [isChangingInsurance, setIsChangingInsurance] = useState(false);
  const [newPayerIdState, setNewPayerIdState] = useState(claim.payer_id || "");
  const [insuranceChangeReason, setInsuranceChangeReason] = useState("");
  const [newMemberId, setNewMemberId] = useState("");

  const handleConfirmInsuranceChange = async () => {
    if (!newPayerIdState) {
      alert("Por favor selecciona una aseguradora válida.");
      return;
    }
    const selectedPayer = payers.find(p => p.payer_id === newPayerIdState);
    if (!selectedPayer) {
      alert("La aseguradora seleccionada no es válida.");
      return;
    }
    
    try {
      const timestampStr = new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const noteText = `🔄 TRACER - CAMBIO DE SEGURO DEL PACIENTE:
• Aseguradora Anterior: ${claim.payer_name || 'Sin seguro previo'} (ID: ${claim.payer_id || 'N/A'})
• Nueva Aseguradora: ${selectedPayer.payer_name} (ID: ${selectedPayer.payer_id})
• Motivo del cambio: ${insuranceChangeReason || "Cambio reportado al procesar ERA"}
• ID de Miembro / Referencia: ${newMemberId || "No especificado"}
• Registrado el: ${timestampStr}`;

      await onAddNote("Correction", noteText);
      await onUpdate({
        payer_id: selectedPayer.payer_id,
        payer_name: selectedPayer.payer_name,
      });
      
      setIsChangingInsurance(false);
      setInsuranceChangeReason("");
      setNewMemberId("");
      alert(`¡Seguro del paciente actualizado con éxito a ${selectedPayer.payer_name}! Se ha registrado la traza de auditoría en la pestaña de Notas.`);
    } catch (err: any) {
      alert(`Error al registrar cambio de seguro: ${err.message}`);
    }
  };

  // Helper to parse or auto-initialize service lines for a claim
  const initializeServiceLines = (c: Claim): ServiceLine[] => {
    const codes = c.cpt_hcpcs ? c.cpt_hcpcs.split(/[\s,]+/).map(item => item.trim()).filter(Boolean) : [];
    
    let parsed: ServiceLine[] = [];
    if (c.service_lines_json) {
      try {
        parsed = JSON.parse(c.service_lines_json);
      } catch (err) {
        console.warn("Failed to parse service_lines_json", err);
      }
    }
    
    const result: ServiceLine[] = [];
    
    const dosParts = c.date_of_service_from ? c.date_of_service_from.split("-") : [];
    const claimYear = dosParts[0] ? parseInt(dosParts[0]) : 2026;
    const dosMonth = dosParts[1] ? parseInt(dosParts[1], 10) : 1;
    const isSemester1 = dosMonth >= 1 && dosMonth <= 6;

    codes.forEach((cptCode) => {
      const existing = parsed.find(p => p.cpt === cptCode);
      if (existing) {
        result.push({
          cpt: existing.cpt,
          units: existing.units !== undefined ? existing.units : (c.units || 1),
          charged: existing.charged !== undefined ? existing.charged : 0,
          allowed: existing.allowed !== undefined ? existing.allowed : 0,
          adj: existing.adj !== undefined ? existing.adj : 0,
          patResp: existing.patResp !== undefined ? existing.patResp : 0,
          paid: existing.paid !== undefined ? existing.paid : 0,
          balance: existing.balance !== undefined ? existing.balance : 0,
          codes: existing.codes || []
        });
      } else {
        const fsEntry = feeSchedules?.find(fs => fs.cpt_code === cptCode && fs.year === claimYear);
        const officialRate = fsEntry ? (isSemester1 ? fsEntry.semester1_rate : fsEntry.semester2_rate) : 50;
        const lineUnits = c.units || 1;
        const charged = officialRate * lineUnits;
        
        const isSingleCpt = codes.length === 1;
        const paid = isSingleCpt ? c.paid_amount : 0;
        const allowed = isSingleCpt ? c.allowed_amount : charged;
        const adj = charged - allowed;

        result.push({
          cpt: cptCode,
          units: lineUnits,
          charged: Number(charged.toFixed(2)),
          allowed: Number(allowed.toFixed(2)),
          adj: Number(adj.toFixed(2)),
          patResp: 0,
          paid: Number(paid.toFixed(2)),
          balance: Number((allowed - paid).toFixed(2)),
          codes: c.carc_code ? [c.carc_code] : []
        });
      }
    });
    
    return result;
  };

  // Sync state if claim changes
  useEffect(() => {
    setStatus(claim.claim_status);
    setClassification(claim.claim_classification);
    setBilledBy(claim.billed_by);
    setPaymentReceivedBy(claim.payment_received_by);
    setBilledCharge(claim.billed_charge);
    setAllowedAmount(claim.allowed_amount);
    setPaidAmount(claim.paid_amount);
    setInsuranceAdjustment(claim.insurance_adjustment);
    setDeniedAmount(claim.denied_amount);
    setWriteOffAmount(claim.write_off_amount);
    setUncollectibleAmount(claim.uncollectible_amount);
    setIteraDirect(claim.itera_direct_collection);
    setProviderDirect(claim.provider_direct_collection);
    setPaymentToPhysician(claim.payment_to_physician);
    setErrorFlag(claim.error_flag);
    setErrorCategory(claim.error_category || "");
    setLocked(claim.locked);
    setLockReason(claim.lock_reason);
    setCorrectionStatus(claim.correction_status);
    setResubmissionDate(claim.resubmission_date);
    setCorrectedReference(claim.corrected_claim_reference);
    setEraReceived(claim.era_received);
    setEobReceived(claim.eob_received);
    setPaymentDate(claim.payment_date);
    setCheckEftNumber(claim.check_or_eft_number);
    setCarcCode(claim.carc_code);
    setRarcCode(claim.rarc_code);
    setDenialReason(claim.denial_reason);
    setNewPayerIdState(claim.payer_id || "");
    
    setServiceLines(initializeServiceLines(claim));
  }, [claim, feeSchedules]);

  // Automatically compute totals from Service Lines when they change
  useEffect(() => {
    if (serviceLines.length === 0) return;
    
    const totalCharged = serviceLines.reduce((acc, l) => acc + (l.charged || 0), 0);
    const totalAllowed = serviceLines.reduce((acc, l) => acc + (l.allowed || 0), 0);
    const totalPaid = serviceLines.reduce((acc, l) => acc + (l.paid || 0), 0);
    const totalAdj = serviceLines.reduce((acc, l) => acc + (l.adj || 0), 0);
    const totalDenied = serviceLines.reduce((acc, l) => acc + (l.codes?.length > 0 ? (l.charged - l.paid - l.patResp) : 0), 0);
    
    setBilledCharge(Number(totalCharged.toFixed(2)));
    setAllowedAmount(Number(totalAllowed.toFixed(2)));
    setPaidAmount(Number(totalPaid.toFixed(2)));
    setInsuranceAdjustment(Number(totalAdj.toFixed(2)));
    
    if (totalDenied > 0) {
      setDeniedAmount(Number(totalDenied.toFixed(2)));
    }

    // Auto update collections
    if (paymentReceivedBy === "ITERA") {
      setIteraDirect(Number(totalPaid.toFixed(2)));
      setProviderDirect(0);
    } else if (paymentReceivedBy === "Provider") {
      setProviderDirect(Number(totalPaid.toFixed(2)));
      setIteraDirect(0);
    }
  }, [serviceLines, paymentReceivedBy]);

  const handleUpdateServiceLine = (index: number, field: keyof ServiceLine, value: any) => {
    setServiceLines(prev => {
      const copy = [...prev];
      const line = { ...copy[index] };
      
      if (field === "codes") {
        line.codes = value;
      } else {
        line[field] = value === "" ? "" : (Number(value) || 0);
      }
      
      // Compute adj = charged - allowed
      const chargedNum = Number(line.charged) || 0;
      const allowedNum = Number(line.allowed) || 0;
      const paidNum = Number(line.paid) || 0;
      const patRespNum = Number(line.patResp) || 0;

      line.adj = Number((chargedNum - allowedNum).toFixed(2));
      line.balance = Number((allowedNum - paidNum - patRespNum).toFixed(2));
      
      copy[index] = line;
      return copy;
    });
  };

  // Read-only conditions based on roles
  const canEditClaims = ["Admin", "Billing Manager", "Reconciliation Specialist"].includes(userRole);
  const canCloseClaims = ["Admin", "Billing Manager"].includes(userRole);
  const isReadOnly = !canEditClaims;

  const handleSaveClaim = async () => {
    if (isReadOnly) return;
    try {
      const updates: Partial<Claim> = {
        claim_status: status,
        claim_classification: classification,
        billed_by: billedBy,
        payment_received_by: paymentReceivedBy,
        billed_charge: Number(billedCharge),
        allowed_amount: Number(allowedAmount),
        paid_amount: Number(paidAmount),
        insurance_adjustment: Number(insuranceAdjustment),
        denied_amount: Number(deniedAmount),
        write_off_amount: Number(writeOffAmount),
        uncollectible_amount: Number(uncollectibleAmount),
        itera_direct_collection: Number(iteraDirect),
        provider_direct_collection: Number(providerDirect),
        payment_to_physician: Number(paymentToPhysician),
        error_flag: errorFlag,
        error_category: errorCategory || "",
        locked,
        lock_reason: lockReason,
        correction_status: correctionStatus,
        resubmission_date: resubmissionDate,
        corrected_claim_reference: correctedReference,
        era_received: eraReceived,
        eob_received: eobReceived,
        payment_date: paymentDate,
        check_or_eft_number: checkEftNumber,
        carc_code: carcCode,
        rarc_code: rarcCode,
        denial_reason: denialReason,
        service_lines_json: JSON.stringify(serviceLines)
      };

      await onUpdate(updates);
      alert("¡Claim guardado y conciliado de forma correcta!");
    } catch (err: any) {
      alert(`Error al guardar claim: ${err.message}`);
    }
  };

  const handlePostNote = async () => {
    if (!newNoteText.trim()) return;
    try {
      await onAddNote(newNoteType, newNoteText);
      setNewNoteText("");
      alert("Nota registrada.");
    } catch (err: any) {
      alert(`Error al guardar nota: ${err.message}`);
    }
  };

  const handleLogPayment = async () => {
    if (!logPaymentAmount || Number(logPaymentAmount) <= 0) {
      alert("Registra un valor numérico positivo de cobro.");
      return;
    }
    try {
      const receiver = paymentReceivedBy === "ITERA" || paymentReceivedBy === "Unknown" ? "ITERA" : "Provider";
      await onAddPayment({
        claim_id: claim.claim_id,
        amount: Number(logPaymentAmount),
        check_or_eft_number: logPaymentCheck || `EFT-${Date.now()}`,
        payment_received_by: receiver,
        payment_source: logPaymentSource,
        payment_date: new Date().toISOString().split("T")[0],
        notes: `Registrado manualmente desde el portal de conciliación.`
      });
      setLogPaymentAmount("");
      setLogPaymentCheck("");
      alert("Cobro aplicado correctamente.");
    } catch (err: any) {
      alert(`Error al registrar cobro: ${err.message}`);
    }
  };

  const filteredNotes = notes.filter(n => n.claim_id === claim.claim_id);
  const filteredAudits = auditLogs.filter(a => a.claim_id === claim.claim_id);
  
  const cptCodes = claim.cpt_hcpcs ? claim.cpt_hcpcs.split(/[\s,]+/).map(c => c.trim()).filter(Boolean) : [];

  const formatUSD = (val: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/50 flex justify-end z-50 p-0 md:p-4 overflow-hidden animate-fade-in">
      <div className={`bg-white w-full h-full rounded-none md:rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 transition-all duration-300 ${isQuickEntryMode ? 'max-w-[95vw] lg:max-w-[1450px]' : 'max-w-5xl'}`}>
        
        {/* Detail Panel Header */}
        <div className="bg-slate-900 text-white shrink-0">
          <div className="p-4 flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-950 flex items-center justify-center border border-blue-800/30">
                <FileCheck className="w-5 h-5 text-primary-blue animate-pulse-slow" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base font-mono tracking-wider">{claim.claim_id}</span>
                  <StatusBadge status={claim.claim_status} />
                  <ClassificationBadge classification={claim.claim_classification} />
                </div>
                <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                  Ficha de Auditoría y Conciliación Rápida
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Dynamic Metadata Row (Unified Patient, Doctor, Clinic, Insurance metadata) */}
          <div className="px-5 py-3 bg-slate-950/40 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-slate-300 border-b border-slate-800">
            <div>
              <span className="text-[10px] text-slate-500 font-mono block font-bold uppercase tracking-wider">Paciente</span>
              <span className="font-bold text-white block">{claim.patient_display_name_masked}</span>
              <span className="text-[10px] text-slate-400 font-mono">ID: {claim.patient_id}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-mono block font-bold uppercase tracking-wider">Médico / Clinic</span>
              <span className="font-bold text-white block truncate">{claim.provider_name}</span>
              <span className="text-[10px] text-slate-400 font-mono">NPI: {claim.provider_npi} • {claim.practice_name}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-mono block font-bold uppercase tracking-wider">Aseguradora (Payer)</span>
              <span className="font-bold text-emerald-400 block truncate">{claim.payer_name}</span>
              <span className="text-[10px] text-slate-400 font-mono">ID: {claim.payer_id}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-mono block font-bold uppercase tracking-wider">Detalles de Visita</span>
              <span className="font-bold text-white block">DOS: <span className="font-mono text-slate-300">{claim.date_of_service_from}</span></span>
              <span className="text-[10px] text-slate-400 font-mono">Tipo: {claim.service_type || "N/A"}</span>
            </div>
          </div>
        </div>

        {/* Sub-Header Tab Selector */}
        <div className="bg-slate-900 px-5 py-2.5 flex flex-wrap gap-2 items-center justify-between border-b border-slate-800 text-xs text-slate-300 shrink-0 select-none">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsQuickEntryMode(true)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                isQuickEntryMode
                  ? "bg-primary-blue text-white shadow-sm"
                  : "hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Carga Rápida ERA (Optimizado PC)</span>
            </button>
            <button
              onClick={() => setIsQuickEntryMode(false)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                !isQuickEntryMode
                  ? "bg-primary-blue text-white shadow-sm"
                  : "hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Ficha Completa de Auditoría</span>
            </button>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-[10px] text-slate-400 font-mono">
            <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">Tip: [TAB] para saltar celdas</span>
            <span>Ajustes calculan al instante</span>
          </div>
        </div>

        {/* Conditionally Render Body */}
        {isQuickEntryMode ? (
          <div className="flex-1 overflow-y-auto p-4 lg:p-6 bg-slate-50 font-sans">
            
            {/* ALERT BANNERS */}
            {locked && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex gap-3 text-red-800 text-xs">
                <Lock className="w-4 h-4 text-red-600 shrink-0 mt-0.5 animate-pulse" />
                <div>
                  <h5 className="font-bold uppercase tracking-wider text-rose-800">Claim Bloqueado (Locked)</h5>
                  <p className="mt-1 font-semibold text-slate-700">{lockReason || "Este claim está bloqueado debido a errores financieros o administrativos."}</p>
                </div>
              </div>
            )}
            
            {errorFlag && !locked && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex gap-3 text-amber-800 text-xs">
                <AlertOctagon className="w-4 h-4 text-accent-orange shrink-0 mt-0.5 animate-bounce-subtle" />
                <div>
                  <h5 className="font-bold uppercase tracking-wider text-amber-800">Error en Claim Detectado</h5>
                  <p className="mt-1 font-semibold text-slate-700">Categoría: {errorCategory || "No especificado"}. Requiere corregir antes de re-facturar.</p>
                </div>
              </div>
            )}

            {/* FULL-WIDTH SECTION: Service Lines Capture */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col space-y-3 mb-6 animate-fade-in w-full">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-4.5 h-4.5 text-amber-500 animate-pulse" />
                  <div>
                    <h4 className="font-bold text-slate-800 text-xs">Captura de Líneas del ERA (Service Lines)</h4>
                    <p className="text-[10px] text-slate-400">Digita ágilmente los valores reportados en el ERA sin desplazamientos horizontales.</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setServiceLines(prev => prev.map((line) => {
                        const fsEntry = feeSchedules?.find(fs => fs.cpt_code === line.cpt);
                        const dosMonth = claim.date_of_service_from ? parseInt(claim.date_of_service_from.split("-")[1], 10) : 1;
                        const isSemester1 = dosMonth >= 1 && dosMonth <= 6;
                        const officialRate = fsEntry ? (isSemester1 ? fsEntry.semester1_rate : fsEntry.semester2_rate) : 50;
                        const charged = line.charged || (officialRate * line.units);
                        const allowed = officialRate * line.units;
                        return {
                          ...line,
                          allowed: Number(allowed.toFixed(2)),
                          paid: Number(allowed.toFixed(2)),
                          adj: Number((charged - allowed).toFixed(2)),
                          patResp: 0,
                          balance: 0,
                          codes: []
                        };
                      }));
                      alert("Tarifas sugeridas del FCSO aplicadas.");
                    }}
                    className="text-[9px] font-bold text-primary-blue bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
                  >
                    Auto-FCSO
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setServiceLines(prev => prev.map((line) => ({
                        ...line,
                        allowed: line.charged,
                        paid: line.charged,
                        adj: 0,
                        patResp: 0,
                        balance: 0,
                        codes: []
                      })));
                      setStatus("Paid");
                      alert("Todas las líneas marcadas como Pagadas Completo.");
                    }}
                    className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer"
                  >
                    Pago Completo
                  </button>
                </div>
              </div>

              <div className="w-full">
                <table className="w-full text-left border-collapse text-[10px] font-sans">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase bg-slate-50 text-[9px] tracking-wider select-none">
                      <th className="p-2 w-24">Código CPT</th>
                      <th className="p-2 text-center w-14">Unids</th>
                      <th className="p-2 text-right w-24">Facturado</th>
                      <th className="p-2 text-right w-24">Permitido</th>
                      <th className="p-2 text-right w-24">Pagado ERA</th>
                      <th className="p-2 text-right w-20">Resp. Pat.</th>
                      <th className="p-2 text-right w-24">Adj / Bal</th>
                      <th className="p-2">Códigos CARC / ERA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {serviceLines.map((line, idx) => {
                      const fsEntry = feeSchedules?.find(fs => fs.cpt_code === line.cpt);
                      const desc = fsEntry?.description || COMMON_CPT_DESCRIPTIONS[line.cpt] || "Procedimiento";
                      
                      return (
                        <tr key={`${line.cpt}-${idx}`} className="hover:bg-slate-50/50 transition-colors align-top">
                          <td className="p-2">
                            <span className="font-mono font-bold text-primary-blue text-[11px] block">{line.cpt}</span>
                            <span className="text-[9px] text-slate-400 block max-w-[150px] truncate" title={desc}>
                              {desc}
                            </span>
                          </td>
                          <td className="p-2 text-center">
                            <input
                              type="number"
                              min="1"
                              value={line.units}
                              onChange={(e) => handleUpdateServiceLine(idx, "units", e.target.value)}
                              className="w-12 text-center border border-slate-200 rounded py-1 font-mono font-bold bg-slate-50 focus:bg-white text-[11px]"
                            />
                          </td>
                          <td className="p-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={line.charged}
                              onChange={(e) => handleUpdateServiceLine(idx, "charged", e.target.value)}
                              className="w-20 text-right border border-slate-200 rounded py-1 px-1 font-mono font-bold bg-slate-50 focus:bg-white text-[11px]"
                            />
                          </td>
                          <td className="p-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={line.allowed}
                              onChange={(e) => handleUpdateServiceLine(idx, "allowed", e.target.value)}
                              className="w-20 text-right border border-slate-200 rounded py-1 px-1 font-mono font-bold bg-blue-50/50 focus:bg-white text-[11px]"
                            />
                          </td>
                          <td className="p-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={line.paid}
                              onChange={(e) => handleUpdateServiceLine(idx, "paid", e.target.value)}
                              className="w-20 text-right border border-slate-200 rounded py-1 px-1 font-mono font-bold bg-emerald-50 focus:bg-white text-[11px]"
                            />
                          </td>
                          <td className="p-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={line.patResp}
                              onChange={(e) => handleUpdateServiceLine(idx, "patResp", e.target.value)}
                              className="w-16 text-right border border-slate-200 rounded py-1 px-1 font-mono font-bold bg-slate-50 focus:bg-white text-[11px]"
                            />
                          </td>
                          <td className="p-2 text-right">
                            <div className="font-mono text-[9px] text-slate-500">
                              Adj: <span className="font-bold">{formatUSD(line.adj)}</span>
                            </div>
                            <div className={`font-mono text-[9px] font-bold ${line.balance !== 0 ? "text-amber-600" : "text-slate-400"}`}>
                              Bal: {formatUSD(line.balance)}
                            </div>
                          </td>
                          <td className="p-2 space-y-1">
                            <div className="flex gap-1.5 items-center">
                              <button
                                type="button"
                                onClick={() => {
                                  handleUpdateServiceLine(idx, "allowed", line.charged);
                                  handleUpdateServiceLine(idx, "paid", line.charged);
                                  handleUpdateServiceLine(idx, "patResp", 0);
                                }}
                                className="text-[8px] bg-slate-100 hover:bg-emerald-100 hover:text-emerald-700 px-1.5 py-0.5 rounded font-bold transition-all cursor-pointer"
                              >
                                100% Pago
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleUpdateServiceLine(idx, "allowed", 0);
                                  handleUpdateServiceLine(idx, "paid", 0);
                                  handleUpdateServiceLine(idx, "patResp", 0);
                                  if (!line.codes.includes("CO-45")) {
                                    handleUpdateServiceLine(idx, "codes", [...line.codes, "CO-45"]);
                                  }
                                  setStatus("Denied");
                                }}
                                className="text-[8px] bg-slate-100 hover:bg-rose-100 hover:text-rose-700 px-1.5 py-0.5 rounded font-bold transition-all cursor-pointer"
                              >
                                Denegar CO-45
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-1 pt-1">
                              {["CO-45", "CO-253", "CO-97", "PR-1", "PR-2"].map(code => {
                                const isSelected = line.codes.includes(code);
                                return (
                                  <button
                                    type="button"
                                    key={code}
                                    onClick={() => {
                                      const nextCodes = isSelected
                                        ? line.codes.filter(c => c !== code)
                                        : [...line.codes, code];
                                      handleUpdateServiceLine(idx, "codes", nextCodes);
                                    }}
                                    className={`text-[8px] px-1.5 py-0.5 rounded font-mono border transition-all cursor-pointer ${
                                      isSelected
                                        ? "bg-primary-blue text-white border-primary-blue font-bold shadow-xs"
                                        : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                                    }`}
                                    title={CARC_CODE_DESCRIPTIONS[code]}
                                  >
                                    {code}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* GRID OF BOTTOM CONTROLS: 3 COLUMNS FOR MAXIMUM BALANCE AND SPACE UTILITY */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* CARD 1: Cierre Financiero & Workflow */}
              <div className="space-y-4">
                {/* Resumen Financiero Totalizador del ERA */}
                <div className="bg-slate-900 text-white rounded-xl p-4 shadow-md space-y-4 h-full flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2 mb-3">
                      <Coins className="w-4 h-4 text-amber-400" />
                      <h5 className="font-bold text-[11px] uppercase tracking-wider">Cierre Financiero del ERA</h5>
                    </div>
                    <div className="space-y-2">
                      <div className="bg-slate-800/60 p-2 rounded border border-slate-800 flex justify-between items-center">
                        <span className="text-[9px] text-slate-400 font-mono">TOTAL FACTURADO</span>
                        <span className="text-xs font-bold font-mono text-slate-200">{formatUSD(billedCharge)}</span>
                      </div>
                      <div className="bg-slate-800/60 p-2 rounded border border-slate-800 flex justify-between items-center">
                        <span className="text-[9px] text-slate-400 font-mono">PERMITIDO (ALLOWED)</span>
                        <span className="text-xs font-bold font-mono text-sky-400">{formatUSD(allowedAmount)}</span>
                      </div>
                      <div className="bg-slate-800/60 p-2 rounded border border-slate-800 flex justify-between items-center">
                        <span className="text-[9px] text-slate-400 font-mono font-bold">PAGADO (PAID)</span>
                        <span className="text-xs font-bold font-mono text-emerald-400">{formatUSD(paidAmount)}</span>
                      </div>
                      <div className="bg-slate-800/60 p-2 rounded border border-slate-800 flex justify-between items-center">
                        <span className="text-[9px] text-slate-400 font-mono">AJUSTES (ADJ)</span>
                        <span className="text-xs font-bold font-mono text-amber-500">{formatUSD(insuranceAdjustment)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-slate-800 p-2.5 rounded border border-slate-700/50 flex justify-between items-center mt-2">
                    <span className="text-[9px] text-slate-300 font-mono font-bold">NETO PENDIENTE</span>
                    <span className={`text-sm font-bold font-mono ${billedCharge - paidAmount > 0 ? 'text-amber-400 font-extrabold' : 'text-slate-400'}`}>
                      {formatUSD(Number((billedCharge - paidAmount).toFixed(2)))}
                    </span>
                  </div>
                </div>

                {/* Workflow & Estado */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
                  <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2">
                    <Sliders className="w-4 h-4 text-primary-blue" />
                    <h5 className="font-bold text-slate-800 text-xs">Workflow & Estado</h5>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Estado del Claim</label>
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value as any)}
                        className="w-full p-1.5 border border-slate-200 rounded font-semibold text-slate-700 bg-slate-50 cursor-pointer text-[11px]"
                      >
                        <option value="Paid">Paid (Pagado)</option>
                        <option value="Denied">Denied (Denegado)</option>
                        <option value="Partially Paid">Partially Paid</option>
                        <option value="Pending">Pending (Pendiente)</option>
                        <option value="Pending - More Info">More Info</option>
                        <option value="Unsubmitted">Unsubmitted</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Clasificación</label>
                      <select
                        value={classification}
                        onChange={(e) => setClassification(e.target.value as any)}
                        className="w-full p-1.5 border border-slate-200 rounded font-semibold text-slate-700 bg-slate-50 cursor-pointer text-[11px] text-ellipsis overflow-hidden whitespace-nowrap"
                      >
                        <option value="Clean Claim">Clean Claim</option>
                        <option value="Clinical Denial">Clinical Denial</option>
                        <option value="Administrative Denial">Administrative Denial</option>
                        <option value="Technical Error">Technical Error</option>
                        <option value="Eligibility Error">Eligibility Error</option>
                        <option value="Underpaid">Underpaid</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* CARD 2: Pago, Depósito ERA & Seguro/Cambiar Seguro */}
              <div className="space-y-4">
                {/* Datos de Depósito del Cheque / EFT */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
                  <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2">
                    <Calendar className="w-4 h-4 text-primary-blue" />
                    <h5 className="font-bold text-slate-800 text-xs">Pago y Depósito ERA</h5>
                  </div>
                  
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase">¿Recibió ERA / EOB?</label>
                      <div className="flex gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => setEraReceived("Yes")}
                          className={`flex-1 text-center py-1 rounded border text-xs font-bold transition-all cursor-pointer ${
                            eraReceived === "Yes"
                              ? "bg-blue-50 text-primary-blue border-primary-blue"
                              : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          Sí, ERA
                        </button>
                        <button
                          type="button"
                          onClick={() => setEraReceived("No")}
                          className={`flex-1 text-center py-1 rounded border text-xs font-bold transition-all cursor-pointer ${
                            eraReceived === "No"
                              ? "bg-blue-50 text-primary-blue border-primary-blue"
                              : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          No ERA
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Cheque / EFT #</label>
                        <input
                          type="text"
                          placeholder="EFT-483829"
                          value={checkEftNumber}
                          onChange={(e) => setCheckEftNumber(e.target.value)}
                          className="w-full p-1.5 border border-slate-200 rounded font-mono font-bold text-slate-700 text-xs bg-slate-50 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fecha de Pago</label>
                        <input
                          type="date"
                          value={paymentDate}
                          onChange={(e) => setPaymentDate(e.target.value)}
                          className="w-full p-1 border border-slate-200 rounded font-mono font-bold text-slate-700 text-xs bg-slate-50 focus:bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Receptor de Cobro</label>
                      <select
                        value={paymentReceivedBy}
                        onChange={(e) => setPaymentReceivedBy(e.target.value as any)}
                        className="w-full p-1.5 border border-slate-200 rounded font-semibold text-slate-700 bg-slate-50 text-xs cursor-pointer"
                      >
                        <option value="ITERA">ITERA (Banco de ITERA)</option>
                        <option value="Provider">Provider (Directo en Clínica)</option>
                        <option value="Split">Split (Monto dividido)</option>
                        <option value="Unknown">Unknown (Sin clasificar)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Seguro y Cambio de Seguro (Trazable) */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-4 h-4 text-emerald-600" />
                      <h5 className="font-bold text-slate-800 text-xs">Aseguradora Registrada</h5>
                    </div>
                    <span className="bg-emerald-50 text-emerald-700 font-mono font-bold text-[9px] px-1.5 py-0.5 rounded border border-emerald-100">
                      Elegible
                    </span>
                  </div>

                  {!isChangingInsurance ? (
                    <button
                      type="button"
                      onClick={() => {
                        setNewPayerIdState(claim.payer_id);
                        setIsChangingInsurance(true);
                      }}
                      className="w-full text-center text-xs font-bold text-primary-blue bg-blue-50 border border-blue-200 hover:bg-blue-100 py-2 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>¿Cambió de Seguro? Reportar</span>
                    </button>
                  ) : (
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2 text-xs">
                      <div className="font-bold text-slate-700 text-[11px] flex items-center justify-between">
                        <span>Reportar Cambio de Seguro</span>
                        <button
                          type="button"
                          onClick={() => setIsChangingInsurance(false)}
                          className="text-slate-400 hover:text-slate-600 font-bold"
                        >
                          Cancelar
                        </button>
                      </div>
                      
                      <div>
                        <select
                          value={newPayerIdState}
                          onChange={(e) => setNewPayerIdState(e.target.value)}
                          className="w-full p-1.5 border border-slate-200 bg-white rounded font-medium text-slate-700 text-xs cursor-pointer"
                        >
                          <option value="">-- Seleccionar Nuevo --</option>
                          {payers.map(p => (
                            <option key={p.payer_id} value={p.payer_id}>
                              {p.payer_name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <textarea
                          placeholder="Motivo del cambio de cobertura..."
                          value={insuranceChangeReason}
                          onChange={(e) => setInsuranceChangeReason(e.target.value)}
                          className="w-full p-1.5 border border-slate-200 bg-white rounded text-xs h-10 resize-none"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleConfirmInsuranceChange}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 rounded-lg text-center shadow-xs transition-colors cursor-pointer text-xs"
                      >
                        Aplicar Cambio y Dejar Traza
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* CARD 3: Notas de Seguimiento */}
              <div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3 flex flex-col h-full">
                  <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2">
                    <FileText className="w-4 h-4 text-primary-blue" />
                    <h5 className="font-bold text-slate-800 text-xs">Notas de Seguimiento</h5>
                  </div>

                  <div className="space-y-2 text-xs">
                    <textarea
                      placeholder="Escribe una observación del ERA..."
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded text-xs h-16 resize-none focus:ring-1 focus:ring-primary-blue bg-slate-50/50"
                    />
                    <div className="flex gap-2 items-center justify-between">
                      <select
                        value={newNoteType}
                        onChange={(e) => setNewNoteType(e.target.value as any)}
                        className="text-[10px] p-1 border border-slate-200 rounded bg-slate-50 text-slate-600 font-semibold cursor-pointer"
                      >
                        <option value="General">General</option>
                        <option value="Billing">Billing</option>
                        <option value="Reconciliation">Reconciliation</option>
                        <option value="Denial Follow-up">Denial Follow-up</option>
                      </select>
                      <button
                        type="button"
                        onClick={handlePostNote}
                        disabled={!newNoteText.trim()}
                        className="bg-primary-blue hover:bg-secondary-blue disabled:opacity-50 text-white font-bold px-3 py-1 rounded-lg text-[11px] transition-all cursor-pointer"
                      >
                        Anotar
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2 pt-2 border-t border-slate-100 mt-2 max-h-[160px] min-h-[110px]">
                    {filteredNotes.length === 0 ? (
                      <p className="text-[10px] italic text-slate-400 text-center py-4">Sin anotaciones de seguimiento en este claim.</p>
                    ) : (
                      filteredNotes.map((n) => (
                        <div key={n.note_id} className="bg-slate-50 p-2 rounded border border-slate-200 text-[10px] leading-relaxed">
                          <div className="flex justify-between text-[8px] text-slate-400 font-mono mb-1">
                            <span className="font-bold text-primary-blue uppercase">{n.note_type}</span>
                            <span>{new Date(n.created_at).toLocaleDateString()}</span>
                          </div>
                          <p className="text-slate-700 whitespace-pre-wrap">{n.note_text}</p>
                          <p className="text-[8px] text-right text-slate-400 font-mono mt-0.5">— {n.created_by}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50 grid grid-cols-1 lg:grid-cols-3 gap-6 font-sans">
          
          {/* COLUMN 1 & 2: Financials & Workflow inputs */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* ALERT BANNERS */}
            {locked && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 text-red-800 text-xs">
                <Lock className="w-4 h-4 text-red-600 shrink-0 mt-0.5 animate-pulse" />
                <div>
                  <h5 className="font-bold uppercase tracking-wider text-rose-800">Claim Bloqueado (Locked)</h5>
                  <p className="mt-1 font-semibold text-slate-700">{lockReason || "Este claim está bloqueado debido a errores financieros o administrativos."}</p>
                </div>
              </div>
            )}
            
            {errorFlag && !locked && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-800 text-xs">
                <AlertOctagon className="w-4 h-4 text-accent-orange shrink-0 mt-0.5 animate-bounce-subtle" />
                <div>
                  <h5 className="font-bold uppercase tracking-wider text-amber-800">Error en Claim Detectado</h5>
                  <p className="mt-1 font-semibold text-slate-700">Categoría: {errorCategory || "No especificado"}. Requiere corregir antes de re-facturar.</p>
                </div>
              </div>
            )}

            {/* SECTION A: Claim Metadata Summary */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <FileText className="w-4.5 h-4.5 text-primary-blue" />
                <h4 className="font-bold text-slate-800 text-sm">Resumen Administrativo de Claim</h4>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="block text-slate-400 font-mono">CPT/HCPCS</span>
                  <span className="font-bold text-slate-700 font-mono text-xs">{claim.cpt_hcpcs} (x{claim.units} {claim.units === 1 ? "unidad" : "unidades"})</span>
                </div>
                <div>
                  <span className="block text-slate-400 font-mono">Tipo de Servicio</span>
                  <span className="font-bold text-slate-700 font-mono">{claim.service_type}</span>
                </div>
                <div>
                  <span className="block text-slate-400 font-mono">NPI de Proveedor</span>
                  <span className="font-bold text-slate-700 font-mono">{claim.provider_npi}</span>
                </div>
                <div>
                  <span className="block text-slate-400 font-mono">Aseguradora (Payer)</span>
                  <span className="font-bold text-slate-700">{claim.payer_name}</span>
                </div>
                <div>
                  <span className="block text-slate-400 font-mono">Fecha de Servicio (DOS)</span>
                  <span className="font-bold text-slate-700 font-mono">{claim.date_of_service_from}</span>
                </div>
                <div>
                  <span className="block text-slate-400 font-mono">Mes de Servicio</span>
                  <span className="font-bold text-slate-700 font-mono">{claim.month_of_service}</span>
                </div>
              </div>

              {/* Owner assignment inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Facturado por (Billed Owner)</label>
                  <select
                    disabled={isReadOnly}
                    value={billedBy}
                    onChange={(e) => setBilledBy(e.target.value as any)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 font-semibold text-slate-700"
                  >
                    <option value="ITERA">ITERA (ITERA Health handles claim submission)</option>
                    <option value="Provider">Provider (Medical Practice submitted directly)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Receptor de Cobro (Payment Receiver)</label>
                  <select
                    disabled={isReadOnly}
                    value={paymentReceivedBy}
                    onChange={(e) => setPaymentReceivedBy(e.target.value as any)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 font-semibold text-slate-700"
                  >
                    <option value="ITERA">ITERA (Received directly at ITERA's bank)</option>
                    <option value="Provider">Provider (Received directly at Clinic bank)</option>
                    <option value="Split">Split (Co-pay/insurance portion split collections)</option>
                    <option value="Unknown">Unknown (Missing matching ERA deposit)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* NEW SECTION: CPT SERVICE LINES DETAIL */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <Coins className="w-4.5 h-4.5 text-primary-blue" />
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">Líneas de Servicio a nivel de Código CPT</h4>
                    <p className="text-[10px] text-slate-400">Edición en lote y desglose por código para la conciliación rápida del claim.</p>
                  </div>
                </div>
                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-mono font-bold">
                  {serviceLines.length} {serviceLines.length === 1 ? "Línea" : "Líneas"}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[11px] font-sans">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider bg-slate-50 text-[9px]">
                      <th className="p-2">CPT Code</th>
                      <th className="p-2 text-center w-16">Unidades</th>
                      <th className="p-2 text-right w-24">Facturado (Billed)</th>
                      <th className="p-2 text-right w-24">Permitido (Allowed)</th>
                      <th className="p-2 text-right w-20">Ajuste (Adj)</th>
                      <th className="p-2 text-right w-20">Resp. Pat.</th>
                      <th className="p-2 text-right w-24">Pagado (Paid)</th>
                      <th className="p-2 text-right w-20">Balance</th>
                      <th className="p-2 w-48">Códigos ERA / CARC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {serviceLines.map((line, idx) => {
                      const fsEntry = feeSchedules?.find(fs => fs.cpt_code === line.cpt);
                      const desc = fsEntry?.description || COMMON_CPT_DESCRIPTIONS[line.cpt] || "Servicio médico asociado.";
                      
                      return (
                        <tr key={`${line.cpt}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-2">
                            <span className="font-mono font-bold text-primary-blue text-xs block">{line.cpt}</span>
                            <span className="text-[9px] text-slate-400 block max-w-[140px] truncate" title={desc}>
                              {desc}
                            </span>
                          </td>
                          <td className="p-2 text-center">
                            {isReadOnly ? (
                              <span className="font-mono font-semibold">{line.units}</span>
                            ) : (
                              <input
                                type="number"
                                min="1"
                                value={line.units}
                                onChange={(e) => handleUpdateServiceLine(idx, "units", e.target.value)}
                                className="w-12 text-center border border-slate-200 rounded p-1 font-mono font-bold bg-slate-50 focus:bg-white text-xs"
                              />
                            )}
                          </td>
                          <td className="p-2 text-right">
                            {isReadOnly ? (
                              <span className="font-mono font-semibold">{formatUSD(line.charged)}</span>
                            ) : (
                              <input
                                type="number"
                                step="0.01"
                                value={line.charged}
                                onChange={(e) => handleUpdateServiceLine(idx, "charged", e.target.value)}
                                className="w-20 text-right border border-slate-200 rounded p-1 font-mono font-bold bg-slate-50 focus:bg-white text-xs"
                              />
                            )}
                          </td>
                          <td className="p-2 text-right">
                            {isReadOnly ? (
                              <span className="font-mono font-semibold text-slate-600">{formatUSD(line.allowed)}</span>
                            ) : (
                              <input
                                type="number"
                                step="0.01"
                                value={line.allowed}
                                onChange={(e) => handleUpdateServiceLine(idx, "allowed", e.target.value)}
                                className="w-20 text-right border border-slate-200 rounded p-1 font-mono font-bold bg-slate-50 focus:bg-white text-xs"
                              />
                            )}
                          </td>
                          <td className="p-2 text-right">
                            <span className="font-mono text-slate-500 font-medium">
                              {formatUSD(line.adj)}
                            </span>
                          </td>
                          <td className="p-2 text-right">
                            {isReadOnly ? (
                              <span className="font-mono font-semibold text-slate-600">{formatUSD(line.patResp)}</span>
                            ) : (
                              <input
                                type="number"
                                step="0.01"
                                value={line.patResp}
                                onChange={(e) => handleUpdateServiceLine(idx, "patResp", e.target.value)}
                                className="w-16 text-right border border-slate-200 rounded p-1 font-mono font-bold bg-slate-50 focus:bg-white text-xs"
                              />
                            )}
                          </td>
                          <td className="p-2 text-right">
                            {isReadOnly ? (
                              <span className="font-mono font-bold text-emerald-600">{formatUSD(line.paid)}</span>
                            ) : (
                              <input
                                type="number"
                                step="0.01"
                                value={line.paid}
                                onChange={(e) => handleUpdateServiceLine(idx, "paid", e.target.value)}
                                className="w-20 text-right border border-slate-200 rounded p-1 font-mono font-bold bg-slate-50 focus:bg-white text-xs"
                              />
                            )}
                          </td>
                          <td className="p-2 text-right">
                            <span className={`font-mono font-bold text-xs ${line.balance !== 0 ? "text-amber-600" : "text-slate-400"}`}>
                              {formatUSD(line.balance)}
                            </span>
                          </td>
                          <td className="p-2">
                            {isReadOnly ? (
                              <div className="flex flex-wrap gap-1">
                                {line.codes.length === 0 ? (
                                  <span className="text-slate-400 italic">—</span>
                                ) : (
                                  line.codes.map(c => (
                                    <span
                                      key={c}
                                      className="bg-slate-100 text-slate-700 font-mono text-[9px] px-1 rounded font-bold border border-slate-200"
                                      title={CARC_CODE_DESCRIPTIONS[c]}
                                    >
                                      {c}
                                    </span>
                                  ))
                                )}
                              </div>
                            ) : (
                              <div className="space-y-1.5 w-44">
                                <input
                                  type="text"
                                  placeholder="Ej: CO-45, PR-1"
                                  value={line.codes.join(", ")}
                                  onChange={(e) => {
                                    const parsedCodes = e.target.value
                                      .split(",")
                                      .map(c => c.trim().toUpperCase())
                                      .filter(Boolean);
                                    handleUpdateServiceLine(idx, "codes", parsedCodes);
                                  }}
                                  className="w-full border border-slate-200 rounded p-1 font-mono text-[10px] bg-slate-50 focus:bg-white font-bold"
                                />
                                <div className="flex flex-wrap gap-1">
                                  {["CO-45", "CO-253", "CO-97", "PR-1", "PR-2"].map(code => {
                                    const isSelected = line.codes.includes(code);
                                    return (
                                      <button
                                        type="button"
                                        key={code}
                                        onClick={() => {
                                          const nextCodes = isSelected
                                            ? line.codes.filter(c => c !== code)
                                            : [...line.codes, code];
                                          handleUpdateServiceLine(idx, "codes", nextCodes);
                                        }}
                                        className={`text-[9px] px-1 py-0.5 rounded-sm font-mono border transition-all ${
                                          isSelected
                                            ? "bg-primary-blue text-white border-primary-blue font-bold shadow-xs"
                                            : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                                        }`}
                                        title={CARC_CODE_DESCRIPTIONS[code]}
                                      >
                                        {code}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Fee Schedule explanation alert */}
              <div className="bg-blue-50/40 p-3 rounded-lg border border-blue-100/30 flex gap-2.5 text-[10px] text-slate-600">
                <Info className="w-4 h-4 text-primary-blue shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-slate-800">Cálculo de Honorarios Oficiales FCSO:</span> Este claim fue prestado en el mes <span className="font-mono font-bold">{claim.month_of_service}</span> (Semestre {claim.date_of_service_from ? (parseInt(claim.date_of_service_from.split("-")[1], 10) <= 6 ? "1" : "2") : "1"}).
                  {serviceLines.map((line) => {
                    const fsEntry = feeSchedules?.find(fs => fs.cpt_code === line.cpt);
                    if (fsEntry) {
                      return (
                        <div key={line.cpt} className="mt-1 font-semibold text-slate-700">
                          • Tarifa CPT {line.cpt}: Semestre 1 (${fsEntry.semester1_rate.toFixed(2)}) / Semestre 2 (${fsEntry.semester2_rate.toFixed(2)}). Cargo Facturado Esperado: ${( (claim.date_of_service_from && parseInt(claim.date_of_service_from.split("-")[1], 10) <= 6 ? fsEntry.semester1_rate : fsEntry.semester2_rate) * line.units ).toFixed(2)}.
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            </div>

            {/* SECTION B: Financial Summary Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5 mb-4">
                <Coins className="w-4.5 h-4.5 text-primary-blue" />
                <h4 className="font-bold text-slate-800 text-sm">Conciliación Financiera (KPIs de Claim)</h4>
              </div>

              {/* Live computed displays from parent state if synced, or calculated here */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-blue-50/25 p-4 rounded-xl border border-blue-100/50 mb-4 text-xs font-mono">
                <div>
                  <span className="text-slate-500 block">Billed Charge</span>
                  <span className="text-sm font-bold text-slate-800">{formatUSD(billedCharge)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Allowed Amount</span>
                  <span className="text-sm font-bold text-slate-800">{formatUSD(allowedAmount)}</span>
                </div>
                <div>
                  <span className="text-emerald-600 block">Paid Amount</span>
                  <span className="text-sm font-bold text-emerald-700">{formatUSD(paidAmount)}</span>
                </div>
                <div>
                  <span className="text-rose-600 block font-bold">Uncollectible / Adj</span>
                  <span className="text-sm font-bold text-rose-700">
                    {formatUSD(Number(insuranceAdjustment) + Number(deniedAmount) + Number(writeOffAmount) + Number(uncollectibleAmount))}
                  </span>
                </div>
              </div>

              {/* Editable values for Billing / Reconciliation Staff */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 text-xs">
                <div>
                  <label className="block text-slate-500 font-mono mb-1">Cargo Facturado ($)</label>
                  <input
                    type="number"
                    disabled={isReadOnly}
                    value={billedCharge}
                    onChange={(e) => setBilledCharge(Number(e.target.value))}
                    className="w-full p-1.5 border border-slate-200 rounded bg-slate-50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-mono mb-1">Permitido Aseguradora ($)</label>
                  <input
                    type="number"
                    disabled={isReadOnly}
                    value={allowedAmount}
                    onChange={(e) => setAllowedAmount(Number(e.target.value))}
                    className="w-full p-1.5 border border-slate-200 rounded bg-slate-50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-mono mb-1">Pagado ($)</label>
                  <input
                    type="number"
                    disabled={isReadOnly}
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(Number(e.target.value))}
                    className="w-full p-1.5 border border-slate-200 rounded bg-slate-50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-mono mb-1">Ajuste Contractual ($)</label>
                  <input
                    type="number"
                    disabled={isReadOnly}
                    value={insuranceAdjustment}
                    onChange={(e) => setInsuranceAdjustment(Number(e.target.value))}
                    className="w-full p-1.5 border border-slate-200 rounded bg-slate-50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-rose-500/80 font-mono mb-1">Denegado (Denial) ($)</label>
                  <input
                    type="number"
                    disabled={isReadOnly}
                    value={deniedAmount}
                    onChange={(e) => setDeniedAmount(Number(e.target.value))}
                    className="w-full p-1.5 border border-slate-200 rounded bg-slate-50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-mono mb-1">Castigo (Write-off) ($)</label>
                  <input
                    type="number"
                    disabled={isReadOnly}
                    value={writeOffAmount}
                    onChange={(e) => setWriteOffAmount(Number(e.target.value))}
                    className="w-full p-1.5 border border-slate-200 rounded bg-slate-50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-mono mb-1">Incobrable (Uncollectible) ($)</label>
                  <input
                    type="number"
                    disabled={isReadOnly}
                    value={uncollectibleAmount}
                    onChange={(e) => setUncollectibleAmount(Number(e.target.value))}
                    className="w-full p-1.5 border border-slate-200 rounded bg-slate-50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-blue-600 font-mono mb-1">Cobro Directo ITERA ($)</label>
                  <input
                    type="number"
                    disabled={isReadOnly}
                    value={iteraDirect}
                    onChange={(e) => setIteraDirect(Number(e.target.value))}
                    className="w-full p-1.5 border border-slate-200 rounded bg-slate-50 font-mono font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-sky-600 font-mono mb-1">Cobro Directo Médico ($)</label>
                  <input
                    type="number"
                    disabled={isReadOnly}
                    value={providerDirect}
                    onChange={(e) => setProviderDirect(Number(e.target.value))}
                    className="w-full p-1.5 border border-slate-200 rounded bg-slate-50 font-mono font-semibold"
                  />
                </div>
              </div>

              {/* Physician Payout override field */}
              <div className="pt-4 border-t border-slate-100 mt-4">
                <label className="block text-xs font-semibold text-slate-600 mb-1">PAGO DIRECTO EFECTUADO AL MÉDICO (Payment to Physician) ($)</label>
                <div className="flex gap-3">
                  <input
                    type="number"
                    disabled={isReadOnly}
                    value={paymentToPhysician}
                    onChange={(e) => setPaymentToPhysician(Number(e.target.value))}
                    className="p-1.5 border border-slate-200 rounded bg-slate-50 font-mono text-xs w-48 font-semibold text-dark-blue"
                  />
                  <div className="text-[10px] text-slate-500 self-center">
                    Ajuste manual de distribución de ingresos. El saldo final (Ending A/P) recalculará automáticamente restando este pago.
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION C: Payment / ERA / EOB Information */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <FileCheck className="w-4.5 h-4.5 text-primary-blue" />
                <h4 className="font-bold text-slate-800 text-sm">Información de Pago / ERA / EOB</h4>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-slate-500 mb-1">ERA Recibido</label>
                  <select
                    disabled={isReadOnly}
                    value={eraReceived}
                    onChange={(e) => setEraReceived(e.target.value as any)}
                    className="w-full p-1.5 border border-slate-200 rounded bg-slate-50"
                  >
                    <option value="Yes">Sí (Yes)</option>
                    <option value="No">No (No)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">EOB Recibido</label>
                  <select
                    disabled={isReadOnly}
                    value={eobReceived}
                    onChange={(e) => setEobReceived(e.target.value as any)}
                    className="w-full p-1.5 border border-slate-200 rounded bg-slate-50"
                  >
                    <option value="Yes">Sí (Yes)</option>
                    <option value="No">No (No)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Fecha de Pago</label>
                  <input
                    type="date"
                    disabled={isReadOnly}
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full p-1.5 border border-slate-200 rounded bg-slate-50 text-slate-600 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Cheque / EFT #</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    placeholder="EFT-881273"
                    value={checkEftNumber}
                    onChange={(e) => setCheckEftNumber(e.target.value)}
                    className="w-full p-1.5 border border-slate-200 rounded bg-slate-50 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-500 font-mono mb-1">CARC Code (Payer Adjustment)</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    placeholder="e.g. 16, 96, 2"
                    value={carcCode}
                    onChange={(e) => setCarcCode(e.target.value)}
                    className="w-full p-1.5 border border-slate-200 rounded bg-slate-50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-mono mb-1">RARC Code (Payer Remittance)</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    placeholder="e.g. MA130, N4"
                    value={rarcCode}
                    onChange={(e) => setRarcCode(e.target.value)}
                    className="w-full p-1.5 border border-slate-200 rounded bg-slate-50 font-mono"
                  />
                </div>
                <div className="col-span-1 sm:col-span-3">
                  <label className="block text-slate-500 mb-1">Detalle / Motivo de Denegación (Payer Notes)</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    placeholder="Patient eligibility error / Timely filing expired..."
                    value={denialReason}
                    onChange={(e) => setDenialReason(e.target.value)}
                    className="w-full p-1.5 border border-slate-200 rounded bg-slate-50"
                  />
                </div>
              </div>
            </div>

            {/* SECTION D: Correction & Appeals Workflow */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <Wrench className="w-4.5 h-4.5 text-primary-blue" />
                <h4 className="font-bold text-slate-800 text-sm">Flujo de Corrección y Resubmissions</h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <input
                    type="checkbox"
                    disabled={isReadOnly}
                    checked={errorFlag}
                    onChange={(e) => setErrorFlag(e.target.checked)}
                    id="chk-error-flag"
                    className="rounded border-slate-300 text-primary-blue h-4 w-4"
                  />
                  <label htmlFor="chk-error-flag" className="font-semibold text-slate-700 cursor-pointer">Marcar con Error</label>
                </div>

                <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <input
                    type="checkbox"
                    disabled={isReadOnly}
                    checked={locked}
                    onChange={(e) => setLocked(e.target.checked)}
                    id="chk-lock-flag"
                    className="rounded border-slate-300 text-primary-blue h-4 w-4"
                  />
                  <label htmlFor="chk-lock-flag" className="font-semibold text-slate-700 cursor-pointer">Bloquear Claim (Locked)</label>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Categoría del Error</label>
                  <select
                    disabled={isReadOnly}
                    value={errorCategory}
                    onChange={(e) => setErrorCategory(e.target.value as any)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 text-xs text-slate-700 font-medium"
                  >
                    <option value="">Ninguno (Sin Error)</option>
                    {Object.values(ErrorCategory).map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              {locked && (
                <div>
                  <label className="block text-xs font-semibold text-rose-600 mb-1">Motivo de Bloqueo Administrativo</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    placeholder="Especifica por qué queda congelada la conciliación..."
                    value={lockReason}
                    onChange={(e) => setLockReason(e.target.value)}
                    className="w-full p-2 border border-red-200 bg-rose-50/10 text-xs rounded-lg font-semibold text-slate-800"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-3 border-t border-slate-100">
                <div>
                  <label className="block text-slate-500 mb-1">Fase de Corrección</label>
                  <select
                    disabled={isReadOnly}
                    value={correctionStatus}
                    onChange={(e) => setCorrectionStatus(e.target.value as any)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-700"
                  >
                    <option value="">Sin Cambios</option>
                    <option value="Pending">Pendiente de Revisión</option>
                    <option value="Corrected">Corregido</option>
                    <option value="Ready to Rebill">Listo para Re-facturar</option>
                    <option value="Resubmitted">Re-presentado a Payer (Resubmitted)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-500 mb-1">Fecha de Re-envío</label>
                  <input
                    type="date"
                    disabled={isReadOnly}
                    value={resubmissionDate}
                    onChange={(e) => setResubmissionDate(e.target.value)}
                    className="w-full p-1.5 border border-slate-200 rounded bg-slate-50 font-mono text-slate-600"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 mb-1">Referencia Claim Corregido</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    placeholder="e.g. CLM-2026-013-A"
                    value={correctedReference}
                    onChange={(e) => setCorrectedReference(e.target.value)}
                    className="w-full p-1.5 border border-slate-200 rounded bg-slate-50 font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* COLUMN 3: Payment Logger, Notes panel, Audit logs */}
          <div className="space-y-6">
            
            {/* IN-APP PAYMENT RECIEVED LOGGER */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <Coins className="w-4.5 h-4.5 text-primary-blue" />
                <h4 className="font-bold text-slate-800 text-xs">Registrar Cobro Real (Payment Recieved)</h4>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Agrega cobros recibidos de aseguradoras o copagos de forma directa a la cuenta de conciliación de este claim.
              </p>
              
              <div className="space-y-2.5 text-xs">
                <div>
                  <label className="block text-slate-500 font-mono text-[10px] mb-0.5">Monto del Depósito ($)</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={logPaymentAmount}
                    onChange={(e) => setLogPaymentAmount(e.target.value ? Number(e.target.value) : "")}
                    className="w-full p-1.5 border border-slate-200 rounded bg-slate-50 font-mono font-bold text-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-mono text-[10px] mb-0.5">EFT / Cheque Código de Referencia</label>
                  <input
                    type="text"
                    placeholder="CHK-88122"
                    value={logPaymentCheck}
                    onChange={(e) => setLogPaymentCheck(e.target.value)}
                    className="w-full p-1.5 border border-slate-200 rounded bg-slate-50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 text-[10px] mb-0.5">Canal de Cobro</label>
                  <select
                    value={logPaymentSource}
                    onChange={(e) => setLogPaymentSource(e.target.value)}
                    className="w-full p-1.5 border border-slate-200 rounded bg-slate-50 text-slate-700"
                  >
                    <option value="ERA">ERA (Electronic Remittance)</option>
                    <option value="Manual">Confirmación Manual Banco</option>
                    <option value="Patient Check">Copago Paciente / Cheque</option>
                  </select>
                </div>
                <button
                  onClick={handleLogPayment}
                  className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs p-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Aplicar Cobro Recibido
                </button>
              </div>
            </div>

            {/* SECTION E: Notes logs and creation */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <FileText className="w-4.5 h-4.5 text-primary-blue" />
                <h4 className="font-bold text-slate-800 text-xs">Notas de Auditoría Administrativa</h4>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">Categoría de Nota</label>
                  <select
                    value={newNoteType}
                    onChange={(e) => setNewNoteType(e.target.value as any)}
                    className="w-full p-1.5 border border-slate-200 rounded bg-slate-50 text-slate-700"
                  >
                    <option value="General">General Note</option>
                    <option value="Billing">Billing Note</option>
                    <option value="Reconciliation">Reconciliation Note</option>
                    <option value="Provider">Provider Note</option>
                    <option value="Internal ITERA">Internal ITERA Private Note</option>
                    <option value="Denial Follow-up">Denial Follow-up Action Note</option>
                    <option value="Correction">Correction Log Note</option>
                  </select>
                </div>
                <div>
                  <textarea
                    rows={3}
                    placeholder="Ingresa los comentarios de auditoría..."
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded bg-slate-50 focus:outline-hidden focus:ring-1 focus:ring-primary-blue text-xs text-slate-800"
                  />
                </div>
                <button
                  onClick={handlePostNote}
                  className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar Nota al Historial
                </button>
              </div>

              {/* Feed of Notes */}
              <div className="space-y-3 pt-3 border-t border-slate-100 max-h-64 overflow-y-auto">
                {filteredNotes.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic text-center py-4">No hay comentarios registrados para este claim.</p>
                ) : (
                  filteredNotes.map((n) => {
                    const noteDate = new Date(n.created_at);
                    const formattedDateTime = `${noteDate.toLocaleDateString()} a las ${noteDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                    return (
                      <div key={n.note_id} className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs leading-relaxed transition-all hover:border-slate-300">
                        <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1.5 border-b border-slate-100 pb-1">
                          <span className="font-bold text-primary-blue tracking-wide uppercase px-1.5 py-0.5 bg-blue-50 border border-blue-100 rounded text-[9px]">
                            {n.note_type}
                          </span>
                          <span className="font-mono text-slate-400">{formattedDateTime}</span>
                        </div>
                        <p className="text-slate-700 font-medium whitespace-pre-wrap">{n.note_text}</p>
                        <div className="text-[9px] font-mono text-slate-400 mt-2 flex items-center justify-end gap-1 select-none">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>Registrado por:</span> <span className="font-bold text-slate-600">{n.created_by}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* SECTION F: Audit Trail panel */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <History className="w-4.5 h-4.5 text-primary-blue" />
                <h4 className="font-bold text-slate-800 text-xs">Log de Auditoría HIPAA</h4>
              </div>
              <p className="text-[9px] text-slate-400 leading-normal">
                Control de cambios inalterable exigido por normativas de seguridad de salud para vigilar PHI.
              </p>

              <div className="space-y-2.5 max-h-52 overflow-y-auto pt-1 text-[10px] font-mono text-slate-600">
                {filteredAudits.length === 0 ? (
                  <p className="italic text-center text-slate-400 py-4 font-sans text-xs">Ningún cambio registrado en el historial.</p>
                ) : (
                  filteredAudits.map((a) => (
                    <div key={a.audit_id} className="p-2 border-l-2 border-primary-blue bg-slate-50 rounded-r-lg">
                      <div className="flex justify-between font-bold text-slate-800 text-[9px]">
                        <span className="uppercase text-primary-blue">{a.action_type}</span>
                        <span>{new Date(a.changed_at).toLocaleTimeString()}</span>
                      </div>
                      <div className="mt-1">
                        <span className="text-slate-400">Campo:</span> <span className="font-bold text-slate-700">{a.field_name}</span>
                      </div>
                      {a.previous_value && (
                        <div className="text-slate-400 text-[9px] truncate">
                          Previo: <span className="line-through">{a.previous_value}</span>
                        </div>
                      )}
                      <div className="text-slate-800 font-semibold truncate">
                        Nuevo: {a.new_value}
                      </div>
                      <div className="text-[9px] text-slate-500 italic mt-0.5">
                        Motivo: {a.reason}
                      </div>
                      <div className="text-[8px] text-right text-slate-400 mt-1">— {a.changed_by}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Detail Panel Footer */}
        <div className="bg-slate-100 p-4 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-600 transition-colors"
          >
            Cerrar Panel
          </button>
          
          {canEditClaims && (
            <button
              onClick={handleSaveClaim}
              className="bg-primary-blue hover:bg-secondary-blue px-6 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-all shadow-md shadow-blue-500/10"
            >
              <Send className="w-3.5 h-3.5" />
              Guardar y Recalcular Conciliación
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
