"use client";

import { FormEvent, useMemo, useState } from "react";

export type LossBatchOption = {
  id: string;
  productName: string;
  sku: string | null;
  unit: string;
  batchCode: string | null;
  expirationDate: string;
};

export type LossBalanceOption = {
  batchId: string;
  locationId: string;
  quantity: number;
  unitCost: number;
};

export type LossLocationOption = {
  id: string;
  name: string;
  branchName: string;
};

type LossReasonOption = { id: string; name: string };

type LossFormProps = {
  batches: LossBatchOption[];
  balances: LossBalanceOption[];
  locations: LossLocationOption[];
  reasons: LossReasonOption[];
  canOverrideCost: boolean;
  initialBatchId?: string;
  initialLocationId?: string;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function LossForm({ batches, balances, locations, reasons, canOverrideCost, initialBatchId, initialLocationId }: LossFormProps) {
  const [sourceKey, setSourceKey] = useState(initialSourceKey(balances, initialBatchId, initialLocationId));
  const [quantity, setQuantity] = useState("");
  const [overrideCost, setOverrideCost] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const batchById = useMemo(() => new Map(batches.map((batch) => [batch.id, batch])), [batches]);
  const locationById = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations]);
  const sourceOptions = useMemo(
    () => balances.map((balance) => ({
      ...balance,
      batch: batchById.get(balance.batchId),
      location: locationById.get(balance.locationId),
    })).filter((option) => option.batch && option.location),
    [balances, batchById, locationById],
  );
  const selectedSource = sourceOptions.find((option) => sourceKey === keyFor(option.batchId, option.locationId)) ?? sourceOptions[0];
  const effectiveCost = parsedNumber(overrideCost) ?? selectedSource?.unitCost ?? 0;
  const estimatedTotal = Math.max(0, parsedNumber(quantity) ?? 0) * effectiveCost;
  const unavailable = !sourceOptions.length || !reasons.length;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/inventory/losses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: selectedSource?.batchId,
          locationId: selectedSource?.locationId,
          reasonId: form.get("reasonId"),
          quantity,
          unitCost: canOverrideCost ? overrideCost : "",
          notes: form.get("notes"),
        }),
      });
      const data = (await response.json()) as { error?: string; next?: string };

      if (!response.ok || data.error) {
        setError(data.error ?? "Não foi possível registrar a perda.");
        return;
      }

      window.location.assign(data.next ?? "/app/estoque/perdas");
    } catch {
      setError("A conexão foi interrompida. Nenhuma baixa incompleta foi gravada.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="operation-form loss-form" onSubmit={handleSubmit}>
      <div className="form-section-heading"><span>01</span><div><h2>Item afetado</h2><p>Selecione o saldo exato que será baixado.</p></div></div>
      <div className="form-grid two-columns">
        <label className="field-wide">Produto, lote e local
          <select value={sourceKey} onChange={(event) => { setSourceKey(event.target.value); setOverrideCost(""); }} required>
            {sourceOptions.map((option) => (
              <option value={keyFor(option.batchId, option.locationId)} key={keyFor(option.batchId, option.locationId)}>
                {batchLabel(option.batch!)} · {formatQuantity(option.quantity)} {option.batch!.unit} em {option.location!.name}
              </option>
            ))}
          </select>
        </label>
        <label>Quantidade perdida ({selectedSource?.batch?.unit ?? "un"})<input value={quantity} onChange={(event) => setQuantity(event.target.value)} required inputMode="decimal" placeholder="Ex.: 3" /></label>
        <label>Validade do lote<input readOnly value={selectedSource?.batch ? formatDate(selectedSource.batch.expirationDate) : "—"} /></label>
      </div>

      <div className="form-section-heading"><span>02</span><div><h2>Motivo e impacto</h2><p>O custo fica congelado para manter o histórico financeiro correto.</p></div></div>
      <div className="form-grid two-columns">
        <label className="field-wide">Motivo padronizado<select name="reasonId" required defaultValue={reasons[0]?.id ?? ""}>{reasons.map((reason) => <option value={reason.id} key={reason.id}>{reason.name}</option>)}</select></label>
        <label>Custo calculado por unidade<input readOnly value={selectedSource ? money.format(selectedSource.unitCost) : "—"} /></label>
        {canOverrideCost ? <label>Ajustar custo unitário (R$)<input value={overrideCost} onChange={(event) => setOverrideCost(event.target.value)} inputMode="decimal" placeholder="Opcional" /></label> : <label>Impacto estimado<input readOnly value={money.format(estimatedTotal)} /></label>}
        <label className="field-wide">Descrição da ocorrência<textarea name="notes" required minLength={3} maxLength={500} rows={3} placeholder="Ex.: embalagem danificada durante a organização do depósito" /></label>
      </div>

      <div className="loss-value-preview"><span>Impacto estimado</span><strong>{money.format(estimatedTotal)}</strong><small>{formatQuantity(parsedNumber(quantity) ?? 0)} {selectedSource?.batch?.unit ?? "un"} × {money.format(effectiveCost)}</small></div>
      <label className="movement-confirm"><input type="checkbox" required /><span><strong>Confirmo a baixa definitiva deste saldo</strong><small>A perda ficará vinculada ao lote, local, motivo e usuário responsável.</small></span></label>
      <div className="transaction-assurance"><span>✓</span><div><strong>Baixa e prejuízo em uma única transação</strong><small>Se o saldo não estiver mais disponível, o Prazor interrompe toda a operação.</small></div></div>
      {unavailable ? <p className="form-feedback form-error" role="alert">É necessário ter saldo disponível e ao menos um motivo ativo.</p> : null}
      {error && <p className="form-feedback form-error" role="alert">{error}</p>}
      <div className="operation-form-actions"><button className="primary-action loss-submit" disabled={loading || unavailable} type="submit">{loading ? "Registrando perda..." : "Confirmar perda e baixar saldo →"}</button></div>
    </form>
  );
}

function initialSourceKey(balances: LossBalanceOption[], batchId?: string, locationId?: string) {
  const first = balances.find((balance) => balance.batchId === batchId && balance.locationId === locationId)
    ?? balances.find((balance) => balance.batchId === batchId)
    ?? balances[0];
  return first ? keyFor(first.batchId, first.locationId) : "";
}

function keyFor(batchId: string, locationId: string) {
  return `${batchId}:${locationId}`;
}

function batchLabel(batch: LossBatchOption) {
  const reference = batch.batchCode ? `Lote ${batch.batchCode}` : batch.sku ?? "Sem referência";
  return `${batch.productName} · ${reference}`;
}

function parsedNumber(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}
