"use client";

import { FormEvent, useMemo, useState } from "react";

export type MovementBatchOption = {
  id: string;
  productName: string;
  sku: string | null;
  unit: string;
  batchCode: string | null;
  expirationDate: string;
};

export type MovementBalanceOption = {
  batchId: string;
  locationId: string;
  quantity: number;
};

export type MovementLocationOption = {
  id: string;
  name: string;
  branchName: string;
};

type MovementFormProps = {
  batches: MovementBatchOption[];
  balances: MovementBalanceOption[];
  locations: MovementLocationOption[];
  canAdjust: boolean;
  initialBatchId?: string;
  initialLocationId?: string;
};

const movementChoices = [
  { value: "sale", label: "Saída", help: "Venda, consumo ou uso interno", icon: "−" },
  { value: "transfer", label: "Transferência", help: "Mover entre locais", icon: "↔" },
  { value: "adjustment_in", label: "Ajuste +", help: "Corrigir saldo para cima", icon: "+" },
  { value: "adjustment_out", label: "Ajuste −", help: "Corrigir saldo para baixo", icon: "±" },
  { value: "return", label: "Retorno", help: "Devolver item ao estoque", icon: "↩" },
] as const;

export function MovementForm({ batches, balances, locations, canAdjust, initialBatchId, initialLocationId }: MovementFormProps) {
  const allowedChoices = canAdjust
    ? movementChoices
    : movementChoices.filter((choice) => !choice.value.startsWith("adjustment_"));
  const [movementType, setMovementType] = useState<(typeof movementChoices)[number]["value"]>("sale");
  const [sourceKey, setSourceKey] = useState(initialSourceKey(balances, initialBatchId, initialLocationId));
  const [inboundBatchId, setInboundBatchId] = useState(batches.some((batch) => batch.id === initialBatchId) ? initialBatchId! : batches[0]?.id ?? "");
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
  const isInbound = movementType === "adjustment_in" || movementType === "return";
  const isTransfer = movementType === "transfer";
  const selectedBatch = isInbound ? batchById.get(inboundBatchId) : selectedSource?.batch;
  const destinationOptions = locations.filter((location) => !selectedSource || location.id !== selectedSource.locationId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);

    const payload = {
      movementType,
      batchId: isInbound ? inboundBatchId : selectedSource?.batchId,
      fromLocationId: isInbound ? "" : selectedSource?.locationId,
      toLocationId: isInbound || isTransfer ? form.get("toLocationId") : "",
      quantity: form.get("quantity"),
      reason: form.get("reason"),
    };

    try {
      const response = await fetch("/api/inventory/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string; next?: string };

      if (!response.ok || data.error) {
        setError(data.error ?? "Não foi possível registrar a movimentação.");
        return;
      }

      window.location.assign(data.next ?? "/app/estoque/movimentar");
    } catch {
      setError("A conexão foi interrompida. Nenhum saldo incompleto foi gravado.");
    } finally {
      setLoading(false);
    }
  }

  const operationUnavailable = isInbound
    ? !batches.length || !locations.length
    : !sourceOptions.length || (isTransfer && !destinationOptions.length);

  return (
    <form className="operation-form movement-form" onSubmit={handleSubmit}>
      <div className="form-section-heading"><span>01</span><div><h2>Tipo de movimentação</h2><p>Escolha o que aconteceu com o estoque.</p></div></div>
      <div className="movement-choice-grid" role="radiogroup" aria-label="Tipo de movimentação">
        {allowedChoices.map((choice) => (
          <button
            aria-checked={movementType === choice.value}
            className={movementType === choice.value ? "active" : ""}
            key={choice.value}
            onClick={() => setMovementType(choice.value)}
            role="radio"
            type="button"
          >
            <b>{choice.icon}</b><span><strong>{choice.label}</strong><small>{choice.help}</small></span>
          </button>
        ))}
      </div>

      <div className="form-section-heading"><span>02</span><div><h2>Lote e local</h2><p>O saldo disponível é verificado novamente ao confirmar.</p></div></div>
      <div className="form-grid two-columns">
        {isInbound ? (
          <label className="field-wide">Produto e lote
            <select value={inboundBatchId} onChange={(event) => setInboundBatchId(event.target.value)} required>
              {batches.map((batch) => <option value={batch.id} key={batch.id}>{batchLabel(batch)}</option>)}
            </select>
          </label>
        ) : (
          <label className="field-wide">Saldo de origem
            <select value={sourceKey} onChange={(event) => setSourceKey(event.target.value)} required>
              {sourceOptions.map((option) => <option value={keyFor(option.batchId, option.locationId)} key={keyFor(option.batchId, option.locationId)}>{batchLabel(option.batch!)} · {formatQuantity(option.quantity)} {option.batch!.unit} em {option.location!.name}</option>)}
            </select>
          </label>
        )}

        {(isInbound || isTransfer) ? (
          <label className="field-wide">Local de destino
            <select name="toLocationId" required defaultValue={destinationOptions[0]?.id ?? ""} key={`${movementType}-${selectedSource?.locationId ?? "in"}`}>
              {destinationOptions.map((location) => <option value={location.id} key={location.id}>{location.name} · {location.branchName}</option>)}
            </select>
          </label>
        ) : null}

        <label>Quantidade ({selectedBatch?.unit ?? "un"})<input name="quantity" required inputMode="decimal" placeholder="Ex.: 5" /></label>
        <label>Validade do lote<input readOnly value={selectedBatch ? formatDate(selectedBatch.expirationDate) : "—"} /></label>
        <label className="field-wide">Motivo da movimentação<textarea name="reason" minLength={3} maxLength={300} required rows={3} placeholder={reasonPlaceholder(movementType)} /></label>
      </div>

      <label className="movement-confirm"><input type="checkbox" required /><span><strong>Confirmo esta alteração de estoque</strong><small>A operação ficará registrada no histórico e não apagará movimentos anteriores.</small></span></label>
      <div className="transaction-assurance"><span>✓</span><div><strong>Saldo protegido contra inconsistências</strong><small>Se a quantidade disponível mudar antes da confirmação, o Prazor interrompe a operação.</small></div></div>
      {operationUnavailable ? <p className="form-feedback form-error" role="alert">Não há lote ou saldo disponível para este tipo de movimentação.</p> : null}
      {error && <p className="form-feedback form-error" role="alert">{error}</p>}
      <div className="operation-form-actions"><button className="primary-action" disabled={loading || operationUnavailable} type="submit">{loading ? "Registrando..." : `Confirmar ${submitLabel(movementType)} →`}</button></div>
    </form>
  );
}

function initialSourceKey(balances: MovementBalanceOption[], batchId?: string, locationId?: string) {
  const first = balances.find((balance) => balance.batchId === batchId && balance.locationId === locationId)
    ?? balances.find((balance) => balance.batchId === batchId)
    ?? balances[0];
  return first ? keyFor(first.batchId, first.locationId) : "";
}

function keyFor(batchId: string, locationId: string) {
  return `${batchId}:${locationId}`;
}

function batchLabel(batch: MovementBatchOption) {
  const reference = batch.batchCode ? `Lote ${batch.batchCode}` : batch.sku ?? "Sem referência";
  return `${batch.productName} · ${reference}`;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function reasonPlaceholder(type: string) {
  if (type === "sale") return "Ex.: venda balcão, consumo interno ou atendimento";
  if (type === "transfer") return "Ex.: reposição da loja ou reorganização do depósito";
  if (type === "return") return "Ex.: devolução do setor para o estoque central";
  return "Explique a divergência ou correção realizada";
}

function submitLabel(type: string) {
  if (type === "sale") return "saída";
  if (type === "transfer") return "transferência";
  if (type === "return") return "retorno";
  return "ajuste";
}
