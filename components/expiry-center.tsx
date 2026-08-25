"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

export type ExpiryStatus = "expired" | "today" | "critical" | "attention" | "monitoring" | "safe";

export type ExpirySource = {
  locationId: string;
  locationName: string;
  branchName: string;
  quantity: number;
};

export type ExpiryCenterRow = {
  batchId: string;
  productName: string;
  sku: string | null;
  batchCode: string | null;
  expirationDate: string;
  daysToExpiry: number;
  status: ExpiryStatus;
  quantity: number;
  inventoryValue: number;
  unit: string;
  sources: ExpirySource[];
};

export type ExpiryLocationFilter = {
  id: string;
  name: string;
  branchName: string;
};

type StatusFilter = "all" | "expired" | "critical" | "attention" | "monitoring" | "safe";
type SortOption = "urgency" | "value" | "quantity" | "name";

export type ExpiryInitialFilters = {
  query?: string;
  status?: string;
  locationId?: string;
  sort?: string;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const quantity = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "expired", label: "Vencidos" },
  { value: "critical", label: "Críticos" },
  { value: "attention", label: "Atenção" },
  { value: "monitoring", label: "Monitorar" },
  { value: "safe", label: "Saudáveis" },
];

export function ExpiryCenter({ rows, locations, initialFilters = {} }: { rows: ExpiryCenterRow[]; locations: ExpiryLocationFilter[]; initialFilters?: ExpiryInitialFilters }) {
  const [query, setQuery] = useState(initialFilters.query ?? "");
  const [status, setStatus] = useState<StatusFilter>(isStatusFilter(initialFilters.status) ? initialFilters.status : "all");
  const [locationId, setLocationId] = useState(locations.some((location) => location.id === initialFilters.locationId) ? initialFilters.locationId! : "all");
  const [sort, setSort] = useState<SortOption>(isSortOption(initialFilters.sort) ? initialFilters.sort : "urgency");
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("busca", query.trim());
    if (status !== "all") params.set("status", status);
    if (locationId !== "all") params.set("local", locationId);
    if (sort !== "urgency") params.set("ordem", sort);
    const next = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
    window.history.replaceState(null, "", next);
  }, [locationId, query, sort, status]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = normalize(deferredQuery);
    return rows
      .filter((row) => !normalizedQuery || normalize(`${row.productName} ${row.sku ?? ""} ${row.batchCode ?? ""}`).includes(normalizedQuery))
      .filter((row) => matchesStatus(row.status, status))
      .filter((row) => locationId === "all" || row.sources.some((source) => source.locationId === locationId))
      .sort((left, right) => compareRows(left, right, sort));
  }, [deferredQuery, locationId, rows, sort, status]);

  const hasFilters = Boolean(query.trim() || status !== "all" || locationId !== "all" || sort !== "urgency");

  function clearFilters() {
    setQuery("");
    setStatus("all");
    setLocationId("all");
    setSort("urgency");
  }

  return (
    <>
      <section className="expiry-filter-card" aria-label="Filtros de validade">
        <div className="expiry-search-row">
          <label className="expiry-search-field"><span aria-hidden="true">⌕</span><input aria-label="Buscar produto, SKU ou lote" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produto, SKU ou lote" type="search" value={query} /></label>
          <label className="expiry-select-field"><span>Local</span><select aria-label="Filtrar por local" onChange={(event) => setLocationId(event.target.value)} value={locationId}><option value="all">Todos os locais</option>{locations.map((location) => <option value={location.id} key={location.id}>{location.name} · {location.branchName}</option>)}</select></label>
          <label className="expiry-select-field"><span>Ordenar por</span><select aria-label="Ordenar lotes" onChange={(event) => setSort(event.target.value as SortOption)} value={sort}><option value="urgency">Mais urgentes</option><option value="value">Maior valor em risco</option><option value="quantity">Maior saldo</option><option value="name">Produto A–Z</option></select></label>
        </div>
        <div className="expiry-status-row" role="group" aria-label="Filtrar por faixa de validade">
          {statusOptions.map((option) => <button className={status === option.value ? "active" : ""} onClick={() => setStatus(option.value)} type="button" key={option.value}>{option.label}<b>{rows.filter((row) => matchesStatus(row.status, option.value)).length}</b></button>)}
        </div>
      </section>

      <section className="expiry-results-card">
        <div className="expiry-results-heading"><div><span>Radar de lotes</span><h2>{filteredRows.length} {filteredRows.length === 1 ? "lote encontrado" : "lotes encontrados"}</h2><p>Prioridade calculada pela validade configurada para a empresa.</p></div>{hasFilters ? <button onClick={clearFilters} type="button">Limpar filtros</button> : <small>Dados atualizados em tempo real</small>}</div>
        {filteredRows.length ? (
          <div className="expiry-table">
            <div className="expiry-table-header"><span>Produto e lote</span><span>Saldo</span><span>Localização</span><span>Validade</span><span>Valor em risco</span><span>Ações</span></div>
            {filteredRows.map((row) => {
              const source = preferredSource(row.sources, locationId);
              const params = new URLSearchParams({ lote: row.batchId });
              if (source) params.set("local", source.locationId);
              return (
                <article className="expiry-table-row" key={row.batchId}>
                  <Link className="expiry-product-cell" href={`/app/validades/${row.batchId}`}><i className={`status-dot ${statusClass(row.status)}`} /><span><strong>{row.productName}</strong><small>{row.batchCode ? `Lote ${row.batchCode}` : "Lote sem código"}{row.sku ? ` · SKU ${row.sku}` : ""}</small></span></Link>
                  <div className="expiry-balance-cell"><strong>{quantity.format(row.quantity)} {row.unit}</strong><small>saldo disponível</small></div>
                  <div className="expiry-location-cell"><strong>{source?.locationName ?? "Sem local disponível"}</strong><small>{source ? source.branchName : "—"}{row.sources.length > 1 ? ` · +${row.sources.length - 1} local` : ""}</small></div>
                  <div className="expiry-date-cell"><span className={`expiry-chip ${statusClass(row.status)}`}>{expiryLabel(row.daysToExpiry)}</span><small>{formatDate(row.expirationDate)}</small></div>
                  <strong className="expiry-value-cell">{money.format(row.inventoryValue)}</strong>
                  <div className="expiry-actions-cell"><Link className="detail" href={`/app/validades/${row.batchId}`}>Ver lote</Link><Link href={`/app/estoque/movimentar?${params}`}>Movimentar</Link><Link className="danger" href={`/app/estoque/perdas?${params}`}>Registrar perda</Link></div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="expiry-empty-state"><span>{rows.length ? "⌕" : "✓"}</span><h3>{rows.length ? "Nenhum lote combina com os filtros" : "Nenhum lote com saldo disponível"}</h3><p>{rows.length ? "Ajuste a busca, a faixa ou o local para ampliar o resultado." : "Quando o primeiro lote for recebido, ele aparecerá aqui automaticamente."}</p>{rows.length ? <button className="secondary-action" onClick={clearFilters} type="button">Limpar filtros</button> : <Link className="primary-action link-action" href="/app/estoque/receber">Registrar entrada</Link>}</div>
        )}
      </section>
    </>
  );
}

function matchesStatus(rowStatus: ExpiryStatus, filter: StatusFilter) {
  if (filter === "all") return true;
  if (filter === "critical") return rowStatus === "today" || rowStatus === "critical";
  return rowStatus === filter;
}

function isStatusFilter(value?: string): value is StatusFilter {
  return statusOptions.some((option) => option.value === value);
}

function isSortOption(value?: string): value is SortOption {
  return Boolean(value && ["urgency", "value", "quantity", "name"].includes(value));
}

function compareRows(left: ExpiryCenterRow, right: ExpiryCenterRow, sort: SortOption) {
  if (sort === "value") return right.inventoryValue - left.inventoryValue || left.daysToExpiry - right.daysToExpiry;
  if (sort === "quantity") return right.quantity - left.quantity || left.daysToExpiry - right.daysToExpiry;
  if (sort === "name") return left.productName.localeCompare(right.productName, "pt-BR") || left.daysToExpiry - right.daysToExpiry;
  return left.daysToExpiry - right.daysToExpiry || right.inventoryValue - left.inventoryValue;
}

function preferredSource(sources: ExpirySource[], locationId: string) {
  return sources.find((source) => source.locationId === locationId) ?? [...sources].sort((left, right) => right.quantity - left.quantity)[0];
}

function statusClass(status: ExpiryStatus) {
  if (["expired", "today", "critical"].includes(status)) return "critical";
  if (status === "attention") return "attention";
  if (status === "monitoring") return "monitoring";
  return "safe";
}

function expiryLabel(days: number) {
  if (days < 0) return `Vencido há ${Math.abs(days)}d`;
  if (days === 0) return "Vence hoje";
  if (days === 1) return "Vence amanhã";
  return `${days} dias`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}
