/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Lock,
  Unlock,
  AlertOctagon,
  Eye,
  CheckCircle2
} from "lucide-react";
import { Claim, ClaimStatus, ClaimClassification } from "../types";
import { StatusBadge } from "./StatusBadge";
import { ClassificationBadge } from "./ClassificationBadge";

interface ClaimsTableProps {
  claims: Claim[];
  selectedClaimIds: string[];
  onSelectClaim: (claimId: string, isSelected: boolean) => void;
  onSelectAllClaims: (claimIds: string[]) => void;
  onViewDetails: (claim: Claim) => void;
}

interface ServiceLineRow {
  row_id: string;
  claim: Claim;
  cpt: string;
  units: number;
  charged: number;
  allowed: number;
  paid: number;
  adj: number;
  patResp: number;
  balance: number;
}

const getServiceLinesForClaim = (claim: Claim): ServiceLineRow[] => {
  const codes = claim.cpt_hcpcs ? claim.cpt_hcpcs.split(/[\s,]+/).map(item => item.trim()).filter(Boolean) : [];
  
  let parsed: any[] = [];
  if (claim.service_lines_json) {
    try {
      parsed = JSON.parse(claim.service_lines_json);
    } catch (err) {
      console.warn("Failed to parse service_lines_json", err);
    }
  }

  if (parsed && parsed.length > 0) {
    return parsed.map((sl, idx) => ({
      row_id: `${claim.claim_id}-${sl.cpt || "unknown"}-${idx}`,
      claim,
      cpt: sl.cpt || claim.cpt_hcpcs || "N/A",
      units: sl.units !== undefined ? sl.units : 1,
      charged: sl.charged !== undefined ? sl.charged : 0,
      allowed: sl.allowed !== undefined ? sl.allowed : 0,
      paid: sl.paid !== undefined ? sl.paid : 0,
      adj: sl.adj !== undefined ? sl.adj : 0,
      patResp: sl.patResp !== undefined ? sl.patResp : 0,
      balance: sl.balance !== undefined ? sl.balance : 0,
    }));
  }

  if (codes.length === 0) {
    return [{
      row_id: `${claim.claim_id}-unknown-0`,
      claim,
      cpt: claim.cpt_hcpcs || "N/A",
      units: claim.units || 1,
      charged: claim.billed_charge,
      allowed: claim.allowed_amount,
      paid: claim.paid_amount,
      adj: claim.insurance_adjustment,
      patResp: 0,
      balance: claim.ar_balance
    }];
  }

  return codes.map((cptCode, idx) => {
    const isFirst = idx === 0;
    return {
      row_id: `${claim.claim_id}-${cptCode}-${idx}`,
      claim,
      cpt: cptCode,
      units: isFirst ? (claim.units || 1) : 1,
      charged: isFirst ? claim.billed_charge : 0,
      allowed: isFirst ? claim.allowed_amount : 0,
      paid: isFirst ? claim.paid_amount : 0,
      adj: isFirst ? claim.insurance_adjustment : 0,
      patResp: 0,
      balance: isFirst ? claim.ar_balance : 0
    };
  });
};

type SortField = "claim_id" | "date_of_service_from" | "billed_charge" | "paid_amount" | "ar_balance" | "ending_ap_to_physician" | "updated_at";
type SortOrder = "asc" | "desc";

export function ClaimsTable({
  claims,
  selectedClaimIds,
  onSelectClaim,
  onSelectAllClaims,
  onViewDetails
}: ClaimsTableProps) {
  const [viewMode, setViewMode] = useState<"patient" | "cpt">("patient");
  const [sortField, setSortField] = useState<SortField>("updated_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Sorting logic
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
    setCurrentPage(1);
  };

  const sortedClaims = [...claims].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];

    if (typeof valA === "string" && typeof valB === "string") {
      return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    if (typeof valA === "number" && typeof valB === "number") {
      return sortOrder === "asc" ? valA - valB : valB - valA;
    }
    return 0;
  });

  // Flatten to service lines
  const serviceLineRows = React.useMemo(() => {
    const rows: ServiceLineRow[] = [];
    claims.forEach((claim) => {
      const sls = getServiceLinesForClaim(claim);
      rows.push(...sls);
    });
    return rows;
  }, [claims]);

  const sortedServiceLines = React.useMemo(() => {
    if (viewMode !== "cpt") return [];
    return [...serviceLineRows].sort((a, b) => {
      let valA: any;
      let valB: any;

      if (sortField === "date_of_service_from") {
        valA = a.claim.date_of_service_from;
        valB = b.claim.date_of_service_from;
      } else if (sortField === "billed_charge") {
        valA = a.charged;
        valB = b.charged;
      } else if (sortField === "paid_amount") {
        valA = a.paid;
        valB = b.paid;
      } else if (sortField === "ar_balance") {
        valA = a.balance;
        valB = b.balance;
      } else if (sortField === "ending_ap_to_physician") {
        valA = a.claim.ending_ap_to_physician;
        valB = b.claim.ending_ap_to_physician;
      } else if (sortField === "updated_at") {
        valA = a.claim.updated_at;
        valB = b.claim.updated_at;
      } else {
        valA = a.claim.claim_id;
        valB = b.claim.claim_id;
      }

      if (typeof valA === "string" && typeof valB === "string") {
        return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (typeof valA === "number" && typeof valB === "number") {
        return sortOrder === "asc" ? valA - valB : valB - valA;
      }
      return 0;
    });
  }, [viewMode, serviceLineRows, sortField, sortOrder]);

  // Pagination logic
  const totalItems = viewMode === "patient" ? sortedClaims.length : sortedServiceLines.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const paginatedClaims = sortedClaims.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const paginatedServiceLines = sortedServiceLines.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSelectAllChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const idsToSelect = viewMode === "patient"
        ? paginatedClaims.map(c => c.claim_id)
        : paginatedServiceLines.map(sl => sl.claim.claim_id);
      const uniqueIds = Array.from(new Set([...selectedClaimIds, ...idsToSelect]));
      onSelectAllClaims(uniqueIds);
    } else {
      const idsToRemove = viewMode === "patient"
        ? paginatedClaims.map(c => c.claim_id)
        : paginatedServiceLines.map(sl => sl.claim.claim_id);
      onSelectAllClaims(selectedClaimIds.filter(id => !idsToRemove.includes(id)));
    }
  };

  const isAllPaginatedSelected =
    viewMode === "patient"
      ? (paginatedClaims.length > 0 && paginatedClaims.every(c => selectedClaimIds.includes(c.claim_id)))
      : (paginatedServiceLines.length > 0 && paginatedServiceLines.every(sl => selectedClaimIds.includes(sl.claim.claim_id)));

  // Numeric currency helper
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Table Sub-header for View Mode Toggle */}
      <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Agrupamiento</span>
          <span className="text-[11px] text-slate-400">({viewMode === "patient" ? "Un reclamo por fila" : "Un código CPT por fila"})</span>
        </div>
        <div className="flex bg-slate-200/60 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => { setViewMode("patient"); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
              viewMode === "patient"
                ? "bg-white text-primary-blue shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Vista Paciente (Reclamos)
          </button>
          <button
            type="button"
            onClick={() => { setViewMode("cpt"); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
              viewMode === "cpt"
                ? "bg-white text-primary-blue shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Vista Detallada (CPTs)
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-widest font-bold select-none">
              <th className="px-4 py-3 text-center w-12">
                <input
                  type="checkbox"
                  checked={isAllPaginatedSelected}
                  onChange={handleSelectAllChange}
                  className="rounded border-slate-300 text-primary-blue focus:ring-primary-blue h-3.5 w-3.5 cursor-pointer"
                />
              </th>
              <th className="px-4 py-3">Paciente</th>
              <th className="px-4 py-3">Proveedor / Médico</th>
              <th onClick={() => handleSort("date_of_service_from")} className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors">
                <div className="flex items-center gap-1">
                  DOS
                  {sortField === "date_of_service_from" && (sortOrder === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                </div>
              </th>
              {viewMode === "cpt" && (
                <th className="px-4 py-3 text-center">Código CPT</th>
              )}
              <th className="px-4 py-3 text-center">Billed By</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Clasificación</th>
              <th onClick={() => handleSort("billed_charge")} className="px-4 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors">
                <div className="flex items-center justify-end gap-1">
                  Billed
                  {sortField === "billed_charge" && (sortOrder === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                </div>
              </th>
              <th onClick={() => handleSort("paid_amount")} className="px-4 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors">
                <div className="flex items-center justify-end gap-1">
                  Paid
                  {sortField === "paid_amount" && (sortOrder === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                </div>
              </th>
              <th onClick={() => handleSort("ar_balance")} className="px-4 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors">
                <div className="flex items-center justify-end gap-1">
                  A/R
                  {sortField === "ar_balance" && (sortOrder === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                </div>
              </th>
              <th onClick={() => handleSort("ending_ap_to_physician")} className="px-4 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors">
                <div className="flex items-center justify-end gap-1">
                  A/P Médico
                  {sortField === "ending_ap_to_physician" && (sortOrder === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                </div>
              </th>
              <th className="px-4 py-3 text-center w-24">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {viewMode === "patient" ? (
              paginatedClaims.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center p-12 text-slate-500 font-sans">
                    No se encontraron claims para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                paginatedClaims.map((claim) => {
                  const isSelected = selectedClaimIds.includes(claim.claim_id);
                  const hasError = claim.error_flag;
                  const isLocked = claim.locked;

                  return (
                    <tr
                      key={claim.claim_id}
                      onClick={() => onViewDetails(claim)}
                      className={`hover:bg-blue-50/20 cursor-pointer transition-colors ${
                        isSelected ? "bg-blue-50/40" : ""
                      } ${isLocked ? "bg-red-50/10" : ""}`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => onSelectClaim(claim.claim_id, e.target.checked)}
                          className="rounded border-slate-300 text-primary-blue focus:ring-primary-blue h-3.5 w-3.5 cursor-pointer"
                        />
                      </td>

                      {/* Masked Patient with flags */}
                      <td className="px-4 py-3 font-sans">
                        <div className="flex items-center gap-1.5">
                          <div className="font-semibold text-slate-700">{claim.patient_display_name_masked}</div>
                          {isLocked && (
                            <Lock className="w-3.5 h-3.5 text-rose-600 shrink-0" title={`Locked: ${claim.lock_reason}`} />
                          )}
                          {hasError && !isLocked && (
                            <AlertOctagon className="w-3.5 h-3.5 text-accent-orange shrink-0 animate-pulse" title={`Blocked Error: ${claim.error_category}`} />
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">ID: {claim.patient_id}</div>
                      </td>

                      {/* Provider */}
                      <td className="px-4 py-3 font-sans">
                        <div className="font-semibold text-slate-700">{claim.provider_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{claim.practice_name}</div>
                      </td>

                      {/* DOS */}
                      <td className="px-4 py-3 font-mono text-slate-500">{claim.date_of_service_from}</td>

                      {/* Billed By */}
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${claim.billed_by === "ITERA" ? "bg-[#1b98e0]/10 text-[#004e89]" : "bg-slate-100 text-slate-600"}`}>
                          {claim.billed_by}
                        </span>
                      </td>

                      {/* Status Badge */}
                      <td className="px-4 py-3">
                        <StatusBadge status={claim.claim_status} />
                      </td>

                      {/* Classification Badge */}
                      <td className="px-4 py-3">
                        <ClassificationBadge classification={claim.claim_classification} />
                      </td>

                      {/* Financial Values */}
                      <td className="px-4 py-3 text-right font-semibold font-mono text-slate-900">
                        {formatCurrency(claim.billed_charge)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold font-mono text-emerald-600">
                        {formatCurrency(claim.paid_amount)}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold font-mono ${claim.ar_balance > 0 ? "text-amber-600" : "text-slate-400"}`}>
                        {formatCurrency(claim.ar_balance)}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold font-mono ${claim.ending_ap_to_physician < 0 ? "text-rose-600" : claim.ending_ap_to_physician > 0 ? "text-primary-blue" : "text-slate-400"}`}>
                        {formatCurrency(claim.ending_ap_to_physician)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onViewDetails(claim)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-slate-200 border border-slate-200 rounded text-[11px] font-bold text-slate-700 hover:text-dark-blue hover:border-dark-blue transition-all shrink-0 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Auditar
                        </button>
                      </td>
                    </tr>
                  );
                })
              )
            ) : (
              paginatedServiceLines.length === 0 ? (
                <tr>
                  <td colSpan={13} className="text-center p-12 text-slate-500 font-sans">
                    No se encontraron líneas de servicio para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                paginatedServiceLines.map((slRow) => {
                  const claim = slRow.claim;
                  const isSelected = selectedClaimIds.includes(claim.claim_id);
                  const hasError = claim.error_flag;
                  const isLocked = claim.locked;

                  // Pro-rate Ending AP based on this service line's share of total billed, or divide equally
                  const numLines = claim.service_lines_json ? JSON.parse(claim.service_lines_json).length : (claim.cpt_hcpcs ? claim.cpt_hcpcs.split(/[\s,]+/).length : 1);
                  const proRatedAp = numLines > 0 ? (claim.ending_ap_to_physician / numLines) : 0;

                  return (
                    <tr
                      key={slRow.row_id}
                      onClick={() => onViewDetails(claim)}
                      className={`hover:bg-blue-50/20 cursor-pointer transition-colors ${
                        isSelected ? "bg-blue-50/40" : ""
                      } ${isLocked ? "bg-red-50/10" : ""}`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => onSelectClaim(claim.claim_id, e.target.checked)}
                          className="rounded border-slate-300 text-primary-blue focus:ring-primary-blue h-3.5 w-3.5 cursor-pointer"
                        />
                      </td>

                      {/* Patient Info */}
                      <td className="px-4 py-3 font-sans">
                        <div className="flex items-center gap-1.5">
                          <div className="font-semibold text-slate-700">{claim.patient_display_name_masked}</div>
                          {isLocked && (
                            <Lock className="w-3.5 h-3.5 text-rose-600 shrink-0" title={`Locked: ${claim.lock_reason}`} />
                          )}
                          {hasError && !isLocked && (
                            <AlertOctagon className="w-3.5 h-3.5 text-accent-orange shrink-0 animate-pulse" title={`Blocked Error: ${claim.error_category}`} />
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">ID: {claim.patient_id}</div>
                      </td>

                      {/* Provider Info */}
                      <td className="px-4 py-3 font-sans">
                        <div className="font-semibold text-slate-700">{claim.provider_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{claim.practice_name}</div>
                      </td>

                      {/* DOS */}
                      <td className="px-4 py-3 font-mono text-slate-500">{claim.date_of_service_from}</td>

                      {/* CPT Code */}
                      <td className="px-4 py-3 text-center font-mono font-bold text-primary-blue text-xs">
                        {slRow.cpt}
                      </td>

                      {/* Billed By */}
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${claim.billed_by === "ITERA" ? "bg-[#1b98e0]/10 text-[#004e89]" : "bg-slate-100 text-slate-600"}`}>
                          {claim.billed_by}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge status={claim.claim_status} />
                      </td>

                      {/* Classification */}
                      <td className="px-4 py-3">
                        <ClassificationBadge classification={claim.claim_classification} />
                      </td>

                      {/* CPT Financial Values */}
                      <td className="px-4 py-3 text-right font-semibold font-mono text-slate-900">
                        {formatCurrency(slRow.charged)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold font-mono text-emerald-600">
                        {formatCurrency(slRow.paid)}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold font-mono ${slRow.balance > 0 ? "text-amber-600" : "text-slate-400"}`}>
                        {formatCurrency(slRow.balance)}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold font-mono ${proRatedAp < 0 ? "text-rose-600" : proRatedAp > 0 ? "text-primary-blue" : "text-slate-400"}`}>
                        {formatCurrency(proRatedAp)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onViewDetails(claim)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-slate-200 border border-slate-200 rounded text-[11px] font-bold text-slate-700 hover:text-dark-blue hover:border-dark-blue transition-all shrink-0 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Auditar
                        </button>
                      </td>
                    </tr>
                  );
                })
              )
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalItems > 0 && (
        <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex items-center justify-between font-sans text-xs">
          <span className="text-slate-500 font-medium">
            Mostrando <span className="font-bold text-slate-700">{(currentPage - 1) * itemsPerPage + 1}</span> a{" "}
            <span className="font-bold text-slate-700">{Math.min(totalItems, currentPage * itemsPerPage)}</span> de{" "}
            <span className="font-bold text-slate-700">{totalItems}</span> registros
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 border border-slate-200 rounded font-semibold text-slate-600 bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Anterior
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setCurrentPage(p)}
                className={`px-3 py-1.5 border rounded font-bold transition-all cursor-pointer ${
                  currentPage === p
                    ? "bg-[#1b98e0] border-[#1b98e0] text-white shadow-xs"
                    : "border-slate-200 text-slate-600 bg-white hover:bg-slate-100"
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 border border-slate-200 rounded font-semibold text-slate-600 bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
