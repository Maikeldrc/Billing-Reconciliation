/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Filter, RotateCcw, Search, ChevronDown, ChevronUp } from "lucide-react";
import { ClaimStatus, ClaimClassification, Provider, Payer } from "../types";

export interface FilterState {
  search: string;
  startDate: string;
  endDate: string;
  providerId: string;
  payerId: string;
  serviceType: string;
  billedBy: string;
  paymentReceivedBy: string;
  status: string;
  classification: string;
  monthOfService: string;
  errorFlag: string;
}

interface ClaimFiltersProps {
  filters: FilterState;
  onChange: (updates: Partial<FilterState>) => void;
  onReset: () => void;
  providers: Provider[];
  payers: Payer[];
  availableServiceTypes: string[];
}

export function ClaimFilters({
  filters,
  onChange,
  onReset,
  providers,
  payers,
  availableServiceTypes
}: ClaimFiltersProps) {
  const [showAllFilters, setShowAllFilters] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm mb-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-dark-blue" />
          <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Filtros de Conciliación</h4>
        </div>
        <div className="flex items-center gap-4 self-end md:self-auto">
          <button
            type="button"
            onClick={() => setShowAllFilters(!showAllFilters)}
            className="flex items-center gap-1.5 text-xs text-primary-blue hover:text-dark-blue font-bold uppercase tracking-wider transition-colors cursor-pointer select-none"
          >
            {showAllFilters ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Ocultar Filtros
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                Más Filtros
              </>
            )}
          </button>
          <div className="w-px h-4 bg-slate-200" />
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-accent-orange font-bold uppercase tracking-wider transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restablecer Filtros
          </button>
        </div>
      </div>

      {/* Primary Filters (Always Shown) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {/* Search Input */}
        <div className="relative">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Buscar Reclamación</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="ID, Paciente..."
              value={filters.search}
              onChange={(e) => onChange({ search: e.target.value })}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-primary-blue focus:border-primary-blue bg-slate-50 focus:bg-white text-slate-800 font-medium"
            />
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Estado Claim</label>
          <select
            value={filters.status}
            onChange={(e) => onChange({ status: e.target.value })}
            className="w-full py-1.5 px-2 text-xs rounded border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-primary-blue focus:border-primary-blue bg-slate-50 focus:bg-white text-slate-800 font-medium cursor-pointer"
          >
            <option value="">Todos los Estados</option>
            {Object.values(ClaimStatus).map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        {/* Classification */}
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Clasificación</label>
          <select
            value={filters.classification}
            onChange={(e) => onChange({ classification: e.target.value })}
            className="w-full py-1.5 px-2 text-xs rounded border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-primary-blue focus:border-primary-blue bg-slate-50 focus:bg-white text-slate-800 font-medium cursor-pointer"
          >
            <option value="">Todas las Clasificaciones</option>
            {Object.values(ClaimClassification).map((classification) => (
              <option key={classification} value={classification}>
                {classification}
              </option>
            ))}
          </select>
        </div>

        {/* Provider */}
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Médico / Proveedor</label>
          <select
            value={filters.providerId}
            onChange={(e) => onChange({ providerId: e.target.value })}
            className="w-full py-1.5 px-2 text-xs rounded border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-primary-blue focus:border-primary-blue bg-slate-50 focus:bg-white text-slate-800 font-medium cursor-pointer"
          >
            <option value="">Todos los Proveedores</option>
            {providers.map((p) => (
              <option key={p.provider_id} value={p.provider_id}>
                {p.provider_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Advanced Filters (Collapsible) */}
      {showAllFilters && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-100 transition-all duration-300">
          {/* Payer */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Aseguradora (Payer)</label>
            <select
              value={filters.payerId}
              onChange={(e) => onChange({ payerId: e.target.value })}
              className="w-full py-1.5 px-2 text-xs rounded border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-primary-blue focus:border-primary-blue bg-slate-50 focus:bg-white text-slate-800 font-medium cursor-pointer"
            >
              <option value="">Todas las Aseguradoras</option>
              {payers.map((p) => (
                <option key={p.payer_id} value={p.payer_id}>
                  {p.payer_name}
                </option>
              ))}
            </select>
          </div>

          {/* Service Type */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Tipo de Servicio</label>
            <select
              value={filters.serviceType}
              onChange={(e) => onChange({ serviceType: e.target.value })}
              className="w-full py-1.5 px-2 text-xs rounded border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-primary-blue focus:border-primary-blue bg-slate-50 focus:bg-white text-slate-800 font-medium cursor-pointer"
            >
              <option value="">Todos los Servicios</option>
              {availableServiceTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Billed By */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Facturado por</label>
            <select
              value={filters.billedBy}
              onChange={(e) => onChange({ billedBy: e.target.value })}
              className="w-full py-1.5 px-2 text-xs rounded border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-primary-blue focus:border-primary-blue bg-slate-50 focus:bg-white text-slate-800 font-medium cursor-pointer"
            >
              <option value="">Todos</option>
              <option value="ITERA">ITERA</option>
              <option value="Provider">Provider</option>
            </select>
          </div>

          {/* Payment Received By */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Cobrado por</label>
            <select
              value={filters.paymentReceivedBy}
              onChange={(e) => onChange({ paymentReceivedBy: e.target.value })}
              className="w-full py-1.5 px-2 text-xs rounded border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-primary-blue focus:border-primary-blue bg-slate-50 focus:bg-white text-slate-800 font-medium cursor-pointer"
            >
              <option value="">Todos</option>
              <option value="ITERA">ITERA</option>
              <option value="Provider">Provider</option>
              <option value="Split">Split</option>
              <option value="Unknown">Unknown</option>
            </select>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Fecha Desde</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => onChange({ startDate: e.target.value })}
              className="w-full py-1.5 px-2 text-xs rounded border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-primary-blue focus:border-primary-blue bg-slate-50 focus:bg-white text-slate-800 font-medium cursor-pointer"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Fecha Hasta</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => onChange({ endDate: e.target.value })}
              className="w-full py-1.5 px-2 text-xs rounded border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-primary-blue focus:border-primary-blue bg-slate-50 focus:bg-white text-slate-800 font-medium cursor-pointer"
            />
          </div>

          {/* Month of Service */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Mes de Servicio</label>
            <input
              type="month"
              value={filters.monthOfService}
              onChange={(e) => onChange({ monthOfService: e.target.value })}
              className="w-full py-1.5 px-2 text-xs rounded border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-primary-blue focus:border-primary-blue bg-slate-50 focus:bg-white text-slate-800 font-medium cursor-pointer"
            />
          </div>

          {/* Error Flag */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Errores / Bloqueos</label>
            <select
              value={filters.errorFlag}
              onChange={(e) => onChange({ errorFlag: e.target.value })}
              className="w-full py-1.5 px-2 text-xs rounded border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-primary-blue focus:border-primary-blue bg-slate-50 focus:bg-white text-slate-800 font-medium cursor-pointer"
            >
              <option value="">Todos los claims</option>
              <option value="true">Con Error / Bloqueado</option>
              <option value="false">Sin Error (Limpio)</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
