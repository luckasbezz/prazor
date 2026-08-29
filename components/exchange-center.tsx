"use client";

import { type FormEvent, useDeferredValue, useMemo, useState } from "react";

type ExchangeAgreement = {
  id: string;
  title: string;
  agreementCode: string | null;
  minimumDays: number;
  exchangeOutcome: "replacement" | "credit" | "either";
  requiresInvoice: boolean;
  requiresPhotos: boolean;
  requiresPriorAuthorization: boolean;
  freightResponsibility: "supplier" | "company" | "shared";
  active: boolean;
  validFrom: string | null;
  validUntil: string | null;
};

export type ExchangeCandidate = {
  id: string;
  batchId: string;
  locationId: string;
  productName: string;
  sku: string | null;
  unit: string;
  batchCode: string | null;
  expirationDate: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  unitValue: number;
  locationName: string;
  branchName: string;
  supplierId: string | null;
  supplierName: string | null;
  supplierActive: boolean;
  agreements: ExchangeAgreement[];
};

export type ExchangeRequestItem = {
  id: string;
  supplierId: string;
  supplierName: string;
  agreementId: string | null;
  agreementSnapshot: Record<string, unknown>;
  status: "eligible" | "preparing" | "requested" | "accepted" | "rejected" | "collected" | "sent" | "completed" | "cancelled";
  protocol: string | null;
  notes: string | null;
  requestedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  batchId: string;
  productName: string;
  sku: string | null;
  unit: string;
  batchCode: string | null;
  expirationDate: string | null;
  locationName: string;
  branchName: string;
  quantity: number;
  unitValue: number;
  totalValue: number;
  resolution: {
    outcome: "replacement" | "credit" | "mixed";
    acceptedQuantity: number;
    rejectedQuantity: number;
    replacementQuantity: number;
    replacementUnitValue: number;
    creditAmount: number;
    recoveredValue: number;
    notes: string | null;
    createdAt: string;
  } | null;
};

export type ExchangeActivityItem = { id: string; title: string; detail: string; createdAt: string; actorLabel: string };
export type ExchangeInitialFilters = { view?: string; query?: string; status?: string };

type ExchangeCenterProps = {
  candidates: ExchangeCandidate[];
  requests: ExchangeRequestItem[];
  activities: ExchangeActivityItem[];
  canManage: boolean;
  canViewAudit: boolean;
  today: string;
  monitoringDays: number;
  initialFilters: ExchangeInitialFilters;
};

type CandidateState = "eligible" | "no_supplier" | "inactive_supplier" | "no_agreement" | "expired" | "late" | "reserved";
type View = "opportunities" | "requests";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const quantityFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Recife" });

export function ExchangeCenter({ candidates, requests, activities, canManage, canViewAudit, today, monitoringDays, initialFilters }: ExchangeCenterProps) {
  const [view, setView] = useState<View>(initialFilters.view === "solicitacoes" ? "requests" : "opportunities");
  const [query, setQuery] = useState(initialFilters.query ?? "");
  const [candidateFilter, setCandidateFilter] = useState(initialFilters.status === "bloqueados" ? "blocked" : initialFilters.status === "elegiveis" ? "eligible" : "all");
  const [requestFilter, setRequestFilter] = useState(initialFilters.status && requestStatusFilters.has(initialFilters.status) ? initialFilters.status : "all");
  const [selectedCandidate, setSelectedCandidate] = useState<ExchangeCandidate | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<ExchangeRequestItem | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("pt-BR"));

  const evaluatedCandidates = useMemo(
    () => candidates.map((candidate) => evaluateCandidate(candidate, today)),
    [candidates, today],
  );
  const eligible = evaluatedCandidates.filter((item) => item.state === "eligible");
  const monitoredEligible = eligible.filter((item) => item.daysToExpiry <= monitoringDays);
  const availableValue = monitoredEligible.reduce((sum, item) => sum + item.candidate.availableQuantity * item.candidate.unitValue, 0);
  const openRequests = requests.filter((item) => !["rejected", "completed", "cancelled"].includes(item.status));
  const reservedValue = openRequests.reduce((sum, item) => sum + item.totalValue, 0);
  const recoveredValue = requests.reduce((sum, item) => sum + (item.resolution?.recoveredValue ?? 0), 0);
  const filteredCandidates = useMemo(() => evaluatedCandidates
    .filter((item) => candidateFilter === "all" || (candidateFilter === "eligible" ? item.state === "eligible" : item.state !== "eligible"))
    .filter((item) => !deferredQuery || candidateSearchText(item.candidate).includes(deferredQuery))
    .sort(compareCandidates), [evaluatedCandidates, candidateFilter, deferredQuery]);
  const filteredRequests = useMemo(() => requests
    .filter((item) => requestFilter === "all" || requestStatusGroup(item.status) === requestFilter)
    .filter((item) => !deferredQuery || requestSearchText(item).includes(deferredQuery)), [requests, requestFilter, deferredQuery]);

  function changeView(nextView: View) {
    setView(nextView);
    setQuery("");
    persistFilters(nextView, "", "all");
  }

  function changeCandidateFilter(nextFilter: string) {
    setCandidateFilter(nextFilter);
    persistFilters(view, query, nextFilter === "eligible" ? "elegiveis" : nextFilter === "blocked" ? "bloqueados" : "all");
  }

  function changeRequestFilter(nextFilter: string) {
    setRequestFilter(nextFilter);
    persistFilters(view, query, nextFilter);
  }

  function changeQuery(value: string) {
    setQuery(value);
    persistFilters(view, value, view === "opportunities" ? candidateFilter : requestFilter);
  }

  return (
    <>
      <section className="exchange-metric-grid" aria-label="Resumo de trocas">
        <article className="exchange-metric exchange-metric-ready"><span>Oportunidades elegíveis</span><strong>{monitoredEligible.length}</strong><small>Nos próximos {monitoringDays} dias</small><i>✓</i></article>
        <article className="exchange-metric exchange-metric-value"><span>Valor recuperável</span><strong>{money.format(availableValue)}</strong><small>Saldo elegível ainda disponível</small><i>R$</i></article>
        <article className="exchange-metric exchange-metric-open"><span>Trocas em andamento</span><strong>{openRequests.length}</strong><small>{money.format(reservedValue)} sob acompanhamento</small><i>⇄</i></article>
        <article className="exchange-metric exchange-metric-done"><span>Valor recuperado</span><strong>{money.format(recoveredValue)}</strong><small>{requests.filter((item) => item.status === "completed").length} trocas concluídas</small><i>↗</i></article>
      </section>

      <section className="exchange-workspace">
        <header className="exchange-workspace-header">
          <div className="exchange-tabs" role="tablist" aria-label="Visões da central de trocas">
            <button aria-selected={view === "opportunities"} className={view === "opportunities" ? "active" : ""} onClick={() => changeView("opportunities")} role="tab" type="button">Oportunidades <b>{evaluatedCandidates.length}</b></button>
            <button aria-selected={view === "requests"} className={view === "requests" ? "active" : ""} onClick={() => changeView("requests")} role="tab" type="button">Solicitações <b>{requests.length}</b></button>
          </div>
          <div className="exchange-toolbar">
            <label className="exchange-search"><span aria-hidden="true">⌕</span><input aria-label="Buscar na central de trocas" onChange={(event) => changeQuery(event.target.value)} placeholder={view === "opportunities" ? "Produto, lote, fornecedor ou local" : "Produto, protocolo ou fornecedor"} value={query} /></label>
            {view === "opportunities" ? (
              <select aria-label="Filtrar oportunidades" onChange={(event) => changeCandidateFilter(event.target.value)} value={candidateFilter}>
                <option value="all">Todas as situações</option><option value="eligible">Somente elegíveis</option><option value="blocked">Com impedimento</option>
              </select>
            ) : (
              <select aria-label="Filtrar solicitações" onChange={(event) => changeRequestFilter(event.target.value)} value={requestFilter}>
                <option value="all">Todas as etapas</option><option value="preparation">Em preparação</option><option value="waiting">Aguardando parceiro</option><option value="approved">Aceitas e em trânsito</option><option value="closed">Encerradas</option>
              </select>
            )}
          </div>
        </header>

        {view === "opportunities" ? (
          <OpportunityList canManage={canManage} items={filteredCandidates} monitoringDays={monitoringDays} onRequest={setSelectedCandidate} />
        ) : (
          <RequestList canManage={canManage} items={filteredRequests} onUpdate={setSelectedRequest} />
        )}
      </section>

      <ExchangeGuidance canManage={canManage} />
      {canViewAudit ? <ExchangeHistory activities={activities} /> : null}
      {selectedCandidate ? <ExchangeRequestPanel candidate={selectedCandidate} onClose={() => setSelectedCandidate(null)} today={today} /> : null}
      {selectedRequest ? <RequestStatusPanel item={selectedRequest} onClose={() => setSelectedRequest(null)} /> : null}
    </>
  );
}

function OpportunityList({ items, canManage, monitoringDays, onRequest }: { items: ReturnType<typeof evaluateCandidate>[]; canManage: boolean; monitoringDays: number; onRequest: (candidate: ExchangeCandidate) => void }) {
  if (!items.length) return <EmptyState icon="✓" title="Nenhuma oportunidade nesta busca" copy="Altere os filtros ou confira se existem lotes com saldo, fornecedor e acordo cadastrados." />;

  return (
    <div className="exchange-opportunity-list">
      {items.map((item) => {
        const { candidate, agreement, daysToExpiry, state } = item;
        const monitored = daysToExpiry <= monitoringDays;
        return (
          <article className={`exchange-opportunity ${state}`} key={candidate.id}>
            <div className="exchange-opportunity-main">
              <div className="exchange-product-icon" aria-hidden="true">□</div>
              <div><span>{candidate.sku ?? "Produto sem SKU"} · {candidate.batchCode ? `Lote ${candidate.batchCode}` : "Lote sem código"}</span><h3>{candidate.productName}</h3><p>{candidate.locationName} · {candidate.branchName}</p></div>
            </div>
            <div className="exchange-opportunity-supplier"><span>Fornecedor</span><strong>{candidate.supplierName ?? "Não informado"}</strong><small>{agreement ? `${agreement.title}${agreement.agreementCode ? ` · ${agreement.agreementCode}` : ""}` : candidate.supplierId ? "Sem acordo vigente" : "Origem não vinculada"}</small></div>
            <div className="exchange-opportunity-deadline"><span>Validade</span><strong>{formatDate(candidate.expirationDate)}</strong><small>{daysCopy(daysToExpiry)}{state === "eligible" && !monitored ? " · fora do radar atual" : ""}</small></div>
            <div className="exchange-opportunity-stock"><span>Disponível para troca</span><strong>{quantityFormat.format(candidate.availableQuantity)} {candidate.unit}</strong><small>{candidate.reservedQuantity > 0 ? `${quantityFormat.format(candidate.reservedQuantity)} ${candidate.unit} já reservados` : money.format(candidate.availableQuantity * candidate.unitValue)}</small></div>
            <div className="exchange-opportunity-action">
              <span className={`exchange-eligibility ${state}`}>{candidateStateLabel(state, agreement)}</span>
              <button disabled={!canManage || state !== "eligible"} onClick={() => onRequest(candidate)} type="button">{state === "eligible" ? "Solicitar troca" : "Ver impedimento"}</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function RequestList({ items, canManage, onUpdate }: { items: ExchangeRequestItem[]; canManage: boolean; onUpdate: (item: ExchangeRequestItem) => void }) {
  if (!items.length) return <EmptyState icon="⇄" title="Nenhuma solicitação encontrada" copy="Quando uma oportunidade elegível for aberta, ela aparecerá aqui com seu protocolo e andamento." />;

  return (
    <div className="exchange-request-list">
      {items.map((item) => (
        <article className="exchange-request-card" key={item.id}>
          <header><div><span className={`exchange-request-status ${item.status}`}>{requestStatusLabel(item.status)}</span><small>TRC-{item.id.slice(0, 8).toUpperCase()}</small></div><strong>{money.format(item.resolution?.recoveredValue ?? item.totalValue)}</strong></header>
          <div className="exchange-request-title"><div className="exchange-product-icon" aria-hidden="true">□</div><div><h3>{item.productName}</h3><p>{item.sku ?? "Sem SKU"} · {item.batchCode ? `Lote ${item.batchCode}` : "Lote sem código"}</p></div></div>
          <dl><div><dt>Fornecedor</dt><dd>{item.supplierName}</dd></div><div><dt>{item.resolution ? "Aceito" : "Quantidade"}</dt><dd>{quantityFormat.format(item.resolution?.acceptedQuantity ?? item.quantity)} {item.unit}</dd></div><div><dt>{item.resolution ? "Compensação" : "Origem"}</dt><dd>{item.resolution ? resolutionOutcomeLabel(item.resolution.outcome) : item.locationName}</dd></div><div><dt>{item.resolution ? "Não aceito" : "Protocolo"}</dt><dd>{item.resolution ? `${quantityFormat.format(item.resolution.rejectedQuantity)} ${item.unit}` : item.protocol ?? "Ainda não informado"}</dd></div></dl>
          <div className="exchange-request-timeline"><span className="done">Preparada</span><i /><span className={["requested", "accepted", "collected", "sent", "completed"].includes(item.status) ? "done" : ""}>Enviada</span><i /><span className={["accepted", "collected", "sent", "completed"].includes(item.status) ? "done" : ""}>Aceita</span><i /><span className={["collected", "sent", "completed"].includes(item.status) ? "done" : ""}>{item.status === "completed" ? "Concluída" : "Em trânsito"}</span></div>
          <footer><small>{item.resolution ? `Concluída em ${formatDateTime(item.resolution.createdAt)}` : `Criada em ${formatDateTime(item.createdAt)}`} · {item.branchName}</small>{canManage && (nextStatuses(item.status).length || canComplete(item.status)) ? <button onClick={() => onUpdate(item)} type="button">{canComplete(item.status) ? "Registrar resultado →" : "Atualizar andamento →"}</button> : null}</footer>
        </article>
      ))}
    </div>
  );
}

function ExchangeRequestPanel({ candidate, onClose, today }: { candidate: ExchangeCandidate; onClose: () => void; today: string }) {
  const evaluation = evaluateCandidate(candidate, today);
  const agreement = evaluation.agreement;
  const [quantity, setQuantity] = useState(String(candidate.availableQuantity));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const parsedQuantity = parseQuantity(quantity);
  const total = (parsedQuantity ?? 0) * candidate.unitValue;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!parsedQuantity || parsedQuantity > candidate.availableQuantity) {
      setError(`Informe uma quantidade de até ${quantityFormat.format(candidate.availableQuantity)} ${candidate.unit}.`);
      return;
    }
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/exchange-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId: candidate.supplierId, batchId: candidate.batchId, locationId: candidate.locationId, quantity: parsedQuantity, notes: form.get("notes") }),
      });
      const data = (await response.json()) as { error?: string; next?: string };
      if (!response.ok || data.error) {
        setError(data.error ?? "Não foi possível preparar a solicitação.");
        return;
      }
      window.location.assign(data.next ?? "/app/fornecedores/trocas?visao=solicitacoes");
    } catch {
      setError("A conexão foi interrompida. Nenhuma reserva incompleta foi gravada.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="exchange-panel-backdrop" role="presentation">
      <form className="exchange-side-panel" onSubmit={submit}>
        <header><div><span>Nova solicitação</span><h2>{candidate.productName}</h2><p>{candidate.supplierName} · {candidate.batchCode ? `Lote ${candidate.batchCode}` : "Lote sem código"}</p></div><button aria-label="Fechar solicitação" onClick={onClose} type="button">×</button></header>
        <section className="exchange-panel-summary"><div><span>Prazo</span><strong>{daysCopy(evaluation.daysToExpiry)}</strong></div><div><span>Disponível</span><strong>{quantityFormat.format(candidate.availableQuantity)} {candidate.unit}</strong></div><div><span>Custo unitário</span><strong>{money.format(candidate.unitValue)}</strong></div></section>
        {agreement ? <section className="exchange-term-card"><span>Condição aplicada</span><h3>{agreement.title}</h3><p>Solicitar com pelo menos <strong>{agreement.minimumDays} dias</strong> de antecedência · {outcomeLabel(agreement.exchangeOutcome)}.</p><ul><li>{agreement.requiresInvoice ? "Nota fiscal exigida" : "Nota fiscal não exigida"}</li><li>{agreement.requiresPhotos ? "Fotos exigidas" : "Fotos não exigidas"}</li><li>{agreement.requiresPriorAuthorization ? "Autorização prévia exigida" : "Sem autorização prévia"}</li><li>Frete: {freightLabel(agreement.freightResponsibility)}</li></ul></section> : null}
        <div className="exchange-panel-fields">
          <label>Quantidade para reservar ({candidate.unit})<input inputMode="decimal" max={candidate.availableQuantity} min="0.001" onChange={(event) => setQuantity(event.target.value)} required step="any" value={quantity} /></label>
          <label>Observações para o fornecedor<textarea maxLength={2000} name="notes" placeholder="Ex.: caixas lacradas e nota fiscal disponível" rows={4} /></label>
        </div>
        <div className="exchange-value-preview"><span>Valor estimado da recuperação</span><strong>{money.format(total)}</strong><small>{quantityFormat.format(parsedQuantity ?? 0)} {candidate.unit} × {money.format(candidate.unitValue)}</small></div>
        <label className="exchange-confirm"><input required type="checkbox" /><span><strong>Confirmo a reserva desta quantidade</strong><small>O saldo continuará físico no local até a coleta, mas não poderá ser reservado em outra troca.</small></span></label>
        {error ? <p className="form-feedback form-error" role="alert">{error}</p> : null}
        <footer><button className="secondary-action" onClick={onClose} type="button">Cancelar</button><button className="primary-action" disabled={loading || evaluation.state !== "eligible"} type="submit">{loading ? "Preparando..." : "Criar solicitação e reservar →"}</button></footer>
      </form>
    </div>
  );
}

function RequestStatusPanel({ item, onClose }: { item: ExchangeRequestItem; onClose: () => void }) {
  const options = nextStatuses(item.status);
  const completionAvailable = canComplete(item.status);
  const agreementOutcome = agreementOutcomeFromSnapshot(item.agreementSnapshot);
  const outcomeOptions = resolutionOutcomeOptions(agreementOutcome);
  const [mode, setMode] = useState<"progress" | "completion">(item.status === "sent" || !options.length ? "completion" : "progress");
  const [status, setStatus] = useState(options[0]?.value ?? "");
  const [protocol, setProtocol] = useState(item.protocol ?? "");
  const [outcome, setOutcome] = useState<"replacement" | "credit" | "mixed">(outcomeOptions[0]?.value ?? "replacement");
  const [acceptedQuantity, setAcceptedQuantity] = useState(String(item.quantity));
  const [replacementQuantity, setReplacementQuantity] = useState(String(item.quantity));
  const [replacementUnitValue, setReplacementUnitValue] = useState(String(item.unitValue));
  const [creditAmount, setCreditAmount] = useState(String(item.totalValue));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const accepted = parseQuantity(acceptedQuantity) ?? 0;
  const rejected = Math.max(0, item.quantity - accepted);
  const replacement = outcome === "replacement" || outcome === "mixed" ? parseNonNegativeNumber(replacementQuantity) ?? 0 : 0;
  const replacementValue = outcome === "replacement" || outcome === "mixed" ? parseNonNegativeNumber(replacementUnitValue) ?? 0 : 0;
  const credit = outcome === "credit" || outcome === "mixed" ? parseNonNegativeNumber(creditAmount) ?? 0 : 0;
  const recovered = replacement * replacementValue + credit;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const completing = mode === "completion";
      if (completing && (accepted <= 0 || accepted > item.quantity)) {
        setError(`A quantidade aceita deve ficar entre 0 e ${quantityFormat.format(item.quantity)} ${item.unit}.`);
        setLoading(false);
        return;
      }
      const response = await fetch(completing ? "/api/exchange-requests/complete" : "/api/exchange-requests", {
        method: completing ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completing ? {
          id: item.id,
          outcome,
          acceptedQuantity: accepted,
          replacementQuantity: replacement,
          replacementUnitValue: replacementValue,
          creditAmount: credit,
          notes: new FormData(event.currentTarget).get("resolutionNotes"),
        } : { id: item.id, status, protocol }),
      });
      const data = (await response.json()) as { error?: string; next?: string };
      if (!response.ok || data.error) {
        setError(data.error ?? (completing ? "Não foi possível concluir a troca." : "Não foi possível atualizar a troca."));
        return;
      }
      window.location.assign(data.next ?? "/app/fornecedores/trocas?visao=solicitacoes");
    } catch {
      setError("A conexão foi interrompida. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="exchange-panel-backdrop" role="presentation">
      <form className="exchange-side-panel exchange-status-panel" onSubmit={submit}>
        <header><div><span>Atualizar andamento</span><h2>TRC-{item.id.slice(0, 8).toUpperCase()}</h2><p>{item.productName} · {item.supplierName}</p></div><button aria-label="Fechar atualização" onClick={onClose} type="button">×</button></header>
        <section className="exchange-current-status"><span>Etapa atual</span><strong className={`exchange-request-status ${item.status}`}>{requestStatusLabel(item.status)}</strong><small>{item.protocol ? `Protocolo ${item.protocol}` : "Aguardando protocolo"}</small></section>
        {completionAvailable && options.length ? <div className="exchange-mode-switch" role="tablist" aria-label="Tipo de atualização"><button aria-selected={mode === "progress"} className={mode === "progress" ? "active" : ""} onClick={() => { setMode("progress"); setError(""); }} role="tab" type="button">Andamento</button><button aria-selected={mode === "completion"} className={mode === "completion" ? "active" : ""} onClick={() => { setMode("completion"); setError(""); }} role="tab" type="button">Resultado final</button></div> : null}
        {mode === "progress" ? <>
          <div className="exchange-status-options" role="radiogroup" aria-label="Próxima etapa">
            {options.map((option) => <label className={status === option.value ? "selected" : ""} key={option.value}><input checked={status === option.value} name="status" onChange={() => setStatus(option.value)} type="radio" value={option.value} /><span><strong>{option.label}</strong><small>{option.copy}</small></span></label>)}
          </div>
          {status === "requested" || item.protocol ? <label className="exchange-protocol-field">Protocolo do fornecedor<input maxLength={120} onChange={(event) => setProtocol(event.target.value)} placeholder="Ex.: SAC-2026-1842" required={status === "requested"} value={protocol} /></label> : null}
          {["collected", "sent"].includes(status) ? <div className="transaction-assurance exchange-movement-assurance"><span>↔</span><div><strong>Esta etapa movimenta o estoque</strong><small>A primeira confirmação de coleta ou envio fará a baixa rastreável do saldo reservado.</small></div></div> : null}
        </> : <>
          <section className="exchange-completion-summary"><div><span>Solicitado</span><strong>{quantityFormat.format(item.quantity)} {item.unit}</strong></div><div><span>Aceito</span><strong>{quantityFormat.format(accepted)} {item.unit}</strong></div><div><span>Não aceito</span><strong>{quantityFormat.format(rejected)} {item.unit}</strong></div></section>
          <div className="exchange-panel-fields exchange-completion-fields">
            <label>Quantidade aceita ({item.unit})<input inputMode="decimal" max={item.quantity} min="0.001" onChange={(event) => setAcceptedQuantity(event.target.value)} required step="any" value={acceptedQuantity} /></label>
          </div>
          <div className="exchange-status-options exchange-outcome-options" role="radiogroup" aria-label="Compensação recebida">
            {outcomeOptions.map((option) => <label className={outcome === option.value ? "selected" : ""} key={option.value}><input checked={outcome === option.value} name="outcome" onChange={() => setOutcome(option.value)} type="radio" value={option.value} /><span><strong>{option.label}</strong><small>{option.copy}</small></span></label>)}
          </div>
          <div className="exchange-panel-fields exchange-recovery-fields">
            {outcome === "replacement" || outcome === "mixed" ? <><label>Quantidade reposta ({item.unit})<input inputMode="decimal" min="0" onChange={(event) => setReplacementQuantity(event.target.value)} required step="any" value={replacementQuantity} /></label><label>Valor unitário da reposição<input inputMode="decimal" min="0" onChange={(event) => setReplacementUnitValue(event.target.value)} required step="0.01" value={replacementUnitValue} /></label></> : null}
            {outcome === "credit" || outcome === "mixed" ? <label>Crédito concedido (R$)<input inputMode="decimal" min="0.01" onChange={(event) => setCreditAmount(event.target.value)} required step="0.01" value={creditAmount} /></label> : null}
            <label className="wide">Observações da conclusão<textarea maxLength={2000} name="resolutionNotes" placeholder="Ex.: crédito confirmado na fatura de agosto" rows={3} /></label>
          </div>
          <div className="exchange-value-preview"><span>Valor efetivamente recuperado</span><strong>{money.format(recovered)}</strong><small>{resolutionCalculationCopy(outcome, replacement, replacementValue, credit)}</small></div>
          <label className="exchange-confirm"><input required type="checkbox" /><span><strong>Confirmo o resultado definitivo</strong><small>A conclusão encerra a reserva. Quantidades não aceitas retornam ao saldo quando já tiverem saído fisicamente.</small></span></label>
        </>}
        {error ? <p className="form-feedback form-error" role="alert">{error}</p> : null}
        <footer><button className="secondary-action" onClick={onClose} type="button">Voltar</button><button className="primary-action" disabled={loading || (mode === "progress" && !status)} type="submit">{loading ? (mode === "completion" ? "Concluindo..." : "Atualizando...") : mode === "completion" ? "Concluir troca →" : "Confirmar nova etapa →"}</button></footer>
      </form>
    </div>
  );
}

function ExchangeGuidance({ canManage }: { canManage: boolean }) {
  return <section className="exchange-guidance"><div><span>Como funciona</span><h2>Do risco ao protocolo, sem perder o saldo de vista.</h2><p>{canManage ? "A equipe prepara a solicitação, informa o protocolo e atualiza cada resposta do parceiro." : "Seu acesso permite acompanhar oportunidades, regras e solicitações existentes."}</p></div><ol><li><b>1</b><span><strong>Elegibilidade automática</strong><small>Fornecedor, acordo, prazo e saldo são conferidos.</small></span></li><li><b>2</b><span><strong>Reserva lógica</strong><small>A quantidade não pode ser prometida duas vezes.</small></span></li><li><b>3</b><span><strong>Baixa rastreável</strong><small>O movimento nasce apenas na coleta ou no envio.</small></span></li></ol></section>;
}

function ExchangeHistory({ activities }: { activities: ExchangeActivityItem[] }) {
  return <section className="exchange-history"><header><div><span>Auditoria</span><h2>Atividade recente</h2></div><small>{activities.length} registros</small></header>{activities.length ? <div>{activities.map((item) => <article key={item.id}><i>✓</i><span><strong>{item.title}</strong><small>{item.detail} · {item.actorLabel}</small></span><time>{formatDateTime(item.createdAt)}</time></article>)}</div> : <p>Nenhuma alteração de troca foi registrada ainda.</p>}</section>;
}

function EmptyState({ icon, title, copy }: { icon: string; title: string; copy: string }) {
  return <div className="exchange-empty"><i>{icon}</i><h3>{title}</h3><p>{copy}</p></div>;
}

function evaluateCandidate(candidate: ExchangeCandidate, today: string) {
  const daysToExpiry = daysBetween(today, candidate.expirationDate);
  const agreement = candidate.agreements.find((item) => item.active && (!item.validFrom || item.validFrom <= today) && (!item.validUntil || item.validUntil >= today)) ?? null;
  let state: CandidateState = "eligible";
  if (!candidate.supplierId) state = "no_supplier";
  else if (!candidate.supplierActive) state = "inactive_supplier";
  else if (!agreement) state = "no_agreement";
  else if (daysToExpiry < 0) state = "expired";
  else if (daysToExpiry < agreement.minimumDays) state = "late";
  else if (candidate.availableQuantity <= 0) state = "reserved";
  return { candidate, agreement, daysToExpiry, state };
}

function candidateStateLabel(state: CandidateState, agreement: ExchangeAgreement | null) {
  if (state === "eligible") return `Elegível${agreement ? ` · ${agreement.minimumDays}d mín.` : ""}`;
  return ({ no_supplier: "Sem fornecedor", inactive_supplier: "Fornecedor inativo", no_agreement: "Sem acordo vigente", expired: "Lote vencido", late: "Prazo ultrapassado", reserved: "Saldo já reservado" } as Record<CandidateState, string>)[state];
}

function nextStatuses(status: ExchangeRequestItem["status"]) {
  const options: Partial<Record<ExchangeRequestItem["status"], { value: string; label: string; copy: string }[]>> = {
    preparing: [{ value: "requested", label: "Enviar ao fornecedor", copy: "Registra o protocolo e inicia a espera pela resposta." }, { value: "cancelled", label: "Cancelar preparação", copy: "Libera a quantidade reservada." }],
    requested: [{ value: "accepted", label: "Fornecedor aceitou", copy: "Mantém a reserva e prepara a retirada." }, { value: "rejected", label: "Fornecedor recusou", copy: "Encerra a solicitação e libera a reserva." }, { value: "cancelled", label: "Cancelar solicitação", copy: "Encerra o fluxo e libera a reserva." }],
    accepted: [{ value: "collected", label: "Material coletado", copy: "Baixa o saldo reservado e registra a movimentação." }, { value: "sent", label: "Material enviado", copy: "Baixa o saldo e marca o despacho ao parceiro." }, { value: "cancelled", label: "Cancelar troca", copy: "Libera a reserva sem movimentar o saldo." }],
    collected: [{ value: "sent", label: "Material despachado", copy: "Registra que o material seguiu para o parceiro." }],
  };
  return options[status] ?? [];
}

function canComplete(status: ExchangeRequestItem["status"]) {
  return ["accepted", "collected", "sent"].includes(status);
}

const requestStatusFilters = new Set(["preparation", "waiting", "approved", "closed"]);

function requestStatusGroup(status: ExchangeRequestItem["status"]) {
  if (["eligible", "preparing"].includes(status)) return "preparation";
  if (status === "requested") return "waiting";
  if (["accepted", "collected", "sent"].includes(status)) return "approved";
  return "closed";
}

function requestStatusLabel(status: ExchangeRequestItem["status"]) {
  return ({ eligible: "Elegível", preparing: "Em preparo", requested: "Aguardando resposta", accepted: "Aceita", rejected: "Recusada", collected: "Coletada", sent: "Enviada", completed: "Concluída", cancelled: "Cancelada" } as Record<ExchangeRequestItem["status"], string>)[status];
}

function requestSearchText(item: ExchangeRequestItem) {
  return `${item.productName} ${item.sku ?? ""} ${item.batchCode ?? ""} ${item.supplierName} ${item.protocol ?? ""} ${item.locationName}`.toLocaleLowerCase("pt-BR");
}

function candidateSearchText(item: ExchangeCandidate) {
  return `${item.productName} ${item.sku ?? ""} ${item.batchCode ?? ""} ${item.supplierName ?? ""} ${item.locationName} ${item.branchName}`.toLocaleLowerCase("pt-BR");
}

function compareCandidates(a: ReturnType<typeof evaluateCandidate>, b: ReturnType<typeof evaluateCandidate>) {
  if (a.state === "eligible" && b.state !== "eligible") return -1;
  if (a.state !== "eligible" && b.state === "eligible") return 1;
  return a.daysToExpiry - b.daysToExpiry;
}

function persistFilters(view: View, query: string, status: string) {
  const params = new URLSearchParams();
  if (view === "requests") params.set("visao", "solicitacoes");
  if (query.trim()) params.set("busca", query.trim());
  if (status && status !== "all") params.set("estado", status);
  const next = params.size ? `${window.location.pathname}?${params}` : window.location.pathname;
  window.history.replaceState(null, "", next);
}

function parseQuantity(value: string) {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeNumber(value: string) {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function daysBetween(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}

function daysCopy(days: number) {
  if (days < 0) return `Vencido há ${Math.abs(days)} ${Math.abs(days) === 1 ? "dia" : "dias"}`;
  if (days === 0) return "Vence hoje";
  return `${days} ${days === 1 ? "dia restante" : "dias restantes"}`;
}

function outcomeLabel(value: ExchangeAgreement["exchangeOutcome"]) {
  return ({ replacement: "reposição", credit: "crédito", either: "reposição ou crédito" } as const)[value];
}

function agreementOutcomeFromSnapshot(snapshot: Record<string, unknown>): ExchangeAgreement["exchangeOutcome"] {
  const value = String(snapshot.exchangeOutcome ?? "either");
  return value === "replacement" || value === "credit" ? value : "either";
}

function resolutionOutcomeOptions(agreement: ExchangeAgreement["exchangeOutcome"]) {
  if (agreement === "replacement") return [{ value: "replacement" as const, label: "Reposição", copy: "O parceiro repôs os itens aceitos." }];
  if (agreement === "credit") return [{ value: "credit" as const, label: "Crédito", copy: "O parceiro concedeu crédito financeiro." }];
  return [
    { value: "replacement" as const, label: "Reposição", copy: "O parceiro repôs os itens aceitos." },
    { value: "credit" as const, label: "Crédito", copy: "O parceiro concedeu crédito financeiro." },
    { value: "mixed" as const, label: "Reposição + crédito", copy: "A compensação combinou as duas modalidades." },
  ];
}

function resolutionOutcomeLabel(value: NonNullable<ExchangeRequestItem["resolution"]>["outcome"]) {
  return ({ replacement: "Reposição", credit: "Crédito", mixed: "Reposição + crédito" } as const)[value];
}

function resolutionCalculationCopy(outcome: "replacement" | "credit" | "mixed", replacement: number, unitValue: number, credit: number) {
  const replacementCopy = `${quantityFormat.format(replacement)} × ${money.format(unitValue)}`;
  if (outcome === "replacement") return replacementCopy;
  if (outcome === "credit") return `Crédito de ${money.format(credit)}`;
  return `${replacementCopy} + ${money.format(credit)} em crédito`;
}

function freightLabel(value: ExchangeAgreement["freightResponsibility"]) {
  return ({ supplier: "por conta do fornecedor", company: "por conta da empresa", shared: "compartilhado" } as const)[value];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function formatDateTime(value: string) {
  return dateTimeFormat.format(new Date(value));
}
