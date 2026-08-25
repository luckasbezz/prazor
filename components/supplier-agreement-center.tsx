"use client";

import { type FormEvent, useDeferredValue, useEffect, useMemo, useState } from "react";

export type SupplierItem = {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  contactName: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AgreementItem = {
  id: string;
  supplierId: string;
  title: string;
  agreementCode: string | null;
  minimumDays: number;
  exchangeOutcome: "replacement" | "credit" | "either";
  requiresInvoice: boolean;
  requiresPhotos: boolean;
  requiresPriorAuthorization: boolean;
  freightResponsibility: "supplier" | "company" | "shared";
  notes: string | null;
  active: boolean;
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupplierActivityItem = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  actorLabel: string;
};
export type SupplierInitialFilters = { view?: string; query?: string; status?: string };

type View = "suppliers" | "agreements";
type SupplierFilter = "all" | "active" | "inactive";
type AgreementFilter = "all" | "current" | "expiring" | "upcoming" | "expired" | "inactive";
type AgreementStatus = Exclude<AgreementFilter, "all" | "expiring">;
type Feedback = { tone: "success" | "error"; message: string } | null;
type Panel =
  | { kind: "supplier"; item?: SupplierItem }
  | { kind: "agreement"; item?: AgreementItem; supplierId?: string }
  | null;

const dateOnly = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Recife" });

export function SupplierAgreementCenter({
  initialSuppliers,
  initialAgreements,
  activities,
  canManage,
  canViewAudit,
  today,
  initialFilters = {},
}: {
  initialSuppliers: SupplierItem[];
  initialAgreements: AgreementItem[];
  activities: SupplierActivityItem[];
  canManage: boolean;
  canViewAudit: boolean;
  today: string;
  initialFilters?: SupplierInitialFilters;
}) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [agreements, setAgreements] = useState(initialAgreements);
  const [view, setView] = useState<View>(isView(initialFilters.view) ? initialFilters.view : "suppliers");
  const [query, setQuery] = useState(initialFilters.query ?? "");
  const [supplierFilter, setSupplierFilter] = useState<SupplierFilter>(isSupplierFilter(initialFilters.status) ? initialFilters.status : "all");
  const [agreementFilter, setAgreementFilter] = useState<AgreementFilter>(isAgreementFilter(initialFilters.status) ? initialFilters.status : "all");
  const [panel, setPanel] = useState<Panel>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [updatingIds, setUpdatingIds] = useState<string[]>([]);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const params = new URLSearchParams();
    if (view !== "suppliers") params.set("visao", view);
    if (query.trim()) params.set("busca", query.trim());
    if (view === "suppliers" && supplierFilter !== "all") params.set("estado", supplierFilter);
    if (view === "agreements" && agreementFilter !== "all") params.set("estado", agreementFilter);
    const next = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
    window.history.replaceState(null, "", next);
  }, [agreementFilter, query, supplierFilter, view]);

  const supplierById = useMemo(() => new Map(suppliers.map((item) => [item.id, item])), [suppliers]);
  const metrics = useMemo(() => {
    const activeSuppliers = suppliers.filter((item) => item.active);
    const current = agreements.filter((item) => agreementStatus(item, today) === "current");
    const expiring = current.filter((item) => item.validUntil && daysBetween(today, item.validUntil) <= 30);
    const currentSupplierIds = new Set(current.map((item) => item.supplierId));
    const withoutAgreement = activeSuppliers.filter((item) => !currentSupplierIds.has(item.id)).length;
    const coverage = activeSuppliers.length ? Math.round(((activeSuppliers.length - withoutAgreement) / activeSuppliers.length) * 100) : 0;
    return { activeSuppliers: activeSuppliers.length, current: current.length, expiring: expiring.length, withoutAgreement, coverage };
  }, [agreements, suppliers, today]);

  const filteredSuppliers = useMemo(() => {
    const normalized = normalize(deferredQuery);
    return suppliers.filter((item) => {
      if (supplierFilter === "active" && !item.active) return false;
      if (supplierFilter === "inactive" && item.active) return false;
      return !normalized || normalize(`${item.name} ${item.taxId ?? ""} ${item.contactName ?? ""} ${item.email ?? ""}`).includes(normalized);
    });
  }, [deferredQuery, supplierFilter, suppliers]);

  const filteredAgreements = useMemo(() => {
    const normalized = normalize(deferredQuery);
    return agreements.filter((item) => {
      const status = agreementStatus(item, today);
      const expiring = status === "current" && Boolean(item.validUntil) && daysBetween(today, item.validUntil!) <= 30;
      if (agreementFilter === "expiring" ? !expiring : agreementFilter !== "all" && status !== agreementFilter) return false;
      const supplier = supplierById.get(item.supplierId);
      return !normalized || normalize(`${item.title} ${item.agreementCode ?? ""} ${supplier?.name ?? ""}`).includes(normalized);
    });
  }, [agreementFilter, agreements, deferredQuery, supplierById, today]);

  function upsertSupplier(item: SupplierItem) {
    setSuppliers((current) => sortByName(upsert(current, item)));
    setPanel(null);
    setFeedback({ tone: "success", message: `Fornecedor ${item.name} salvo com sucesso.` });
  }

  function upsertAgreement(item: AgreementItem) {
    setAgreements((current) => upsert(current, item).toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
    setPanel(null);
    setView("agreements");
    setFeedback({ tone: "success", message: "Acordo salvo. As próximas solicitações poderão usar estas condições." });
  }

  async function toggleAgreement(item: AgreementItem) {
    setUpdatingIds((current) => [...current, item.id]);
    setFeedback(null);
    try {
      const saved = await requestAgreement({ ...item, active: !item.active }, "PATCH");
      setAgreements((current) => upsert(current, saved));
      setFeedback({ tone: "success", message: saved.active ? "Acordo reativado." : "Acordo encerrado e preservado no histórico." });
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Não foi possível atualizar o acordo." });
    } finally {
      setUpdatingIds((current) => current.filter((id) => id !== item.id));
    }
  }

  function changeView(next: View) {
    setView(next);
    setQuery("");
    setFeedback(null);
  }

  return (
    <section className="supplier-workspace" aria-label="Gestão de fornecedores e acordos">
      <div className="supplier-metric-grid" aria-label="Resumo de fornecedores">
        <article><span>Fornecedores ativos</span><strong>{metrics.activeSuppliers}</strong><small>Disponíveis para recebimento</small><i>↔</i></article>
        <article className="supplier-metric-covered"><span>Acordos vigentes</span><strong>{metrics.current}</strong><small>Com regra válida hoje</small><i>✓</i></article>
        <article className={metrics.withoutAgreement ? "supplier-metric-warning" : ""}><span>Sem acordo vigente</span><strong>{metrics.withoutAgreement}</strong><small>{metrics.withoutAgreement ? "Precisam de negociação" : "Cobertura completa"}</small><i>!</i></article>
        <article className={metrics.expiring ? "supplier-metric-expiring" : ""}><span>Vencem em 30 dias</span><strong>{metrics.expiring}</strong><small>Renovações a acompanhar</small><i>◷</i></article>
      </div>

      <article className="supplier-coverage-card">
        <div><span>Cobertura operacional</span><strong>{metrics.coverage}%</strong></div>
        <div className="supplier-coverage-copy"><h2>{metrics.coverage === 100 && metrics.activeSuppliers ? "Todos os fornecedores ativos possuem regra vigente" : "Transforme negociações informais em regras rastreáveis"}</h2><p>A cobertura considera fornecedores ativos com pelo menos um acordo válido na data de hoje.</p><span aria-hidden="true"><i style={{ width: `${metrics.coverage}%` }} /></span></div>
        <div className="supplier-coverage-legend"><span><i className="covered" />Cobertos</span><span><i />Pendentes</span></div>
      </article>

      {feedback ? <p className={`supplier-feedback ${feedback.tone}`} role="status">{feedback.message}</p> : null}

      <div className="supplier-main-layout">
        <article className="supplier-list-card">
          <div className="supplier-view-tabs" role="tablist" aria-label="Visualização de fornecedores">
            <button aria-selected={view === "suppliers"} className={view === "suppliers" ? "active" : ""} onClick={() => changeView("suppliers")} role="tab" type="button">Fornecedores <b>{suppliers.length}</b></button>
            <button aria-selected={view === "agreements"} className={view === "agreements" ? "active" : ""} onClick={() => changeView("agreements")} role="tab" type="button">Acordos <b>{agreements.length}</b></button>
          </div>

          <div className="supplier-toolbar">
            <label className="supplier-search"><span aria-hidden="true">⌕</span><input aria-label={`Buscar ${view === "suppliers" ? "fornecedor" : "acordo"}`} onChange={(event) => setQuery(event.target.value)} placeholder={view === "suppliers" ? "Buscar nome, documento ou contato" : "Buscar acordo, código ou fornecedor"} type="search" value={query} /></label>
            {view === "suppliers" ? <select aria-label="Filtrar fornecedores por situação" onChange={(event) => setSupplierFilter(event.target.value as SupplierFilter)} value={supplierFilter}><option value="all">Todos os fornecedores</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select> : <select aria-label="Filtrar acordos por situação" onChange={(event) => setAgreementFilter(event.target.value as AgreementFilter)} value={agreementFilter}><option value="all">Todos os acordos</option><option value="current">Vigentes</option><option value="expiring">Vencem em 30 dias</option><option value="upcoming">Futuros</option><option value="expired">Vencidos</option><option value="inactive">Encerrados</option></select>}
            {canManage ? <div className="supplier-toolbar-actions"><button className="secondary-action" onClick={() => setPanel({ kind: "supplier" })} type="button">＋ Fornecedor</button><button className="primary-action" disabled={!suppliers.some((item) => item.active)} onClick={() => setPanel({ kind: "agreement" })} type="button">＋ Novo acordo</button></div> : <span className="supplier-read-only">Somente leitura</span>}
          </div>

          {view === "suppliers" ? (
            <SupplierList agreements={agreements} canManage={canManage} items={filteredSuppliers} onAgreement={(supplierId) => setPanel({ kind: "agreement", supplierId })} onEdit={(item) => setPanel({ kind: "supplier", item })} today={today} />
          ) : (
            <AgreementList canManage={canManage} items={filteredAgreements} onEdit={(item) => setPanel({ kind: "agreement", item })} onToggle={toggleAgreement} supplierById={supplierById} today={today} updatingIds={updatingIds} />
          )}
        </article>

        <aside className="supplier-side-column">
          {panel?.kind === "supplier" ? <SupplierForm item={panel.item} onCancel={() => setPanel(null)} onSaved={upsertSupplier} /> : panel?.kind === "agreement" ? <AgreementForm item={panel.item} onCancel={() => setPanel(null)} onSaved={upsertAgreement} requestedSupplierId={panel.supplierId} suppliers={suppliers} today={today} /> : <SupplierGuidance canManage={canManage} />}
          <ActivityCard activities={activities} canViewAudit={canViewAudit} />
        </aside>
      </div>
    </section>
  );
}

function SupplierList({ items, agreements, canManage, today, onEdit, onAgreement }: {
  items: SupplierItem[];
  agreements: AgreementItem[];
  canManage: boolean;
  today: string;
  onEdit: (item: SupplierItem) => void;
  onAgreement: (supplierId: string) => void;
}) {
  if (!items.length) return <EmptyState icon="↔" title="Nenhum fornecedor encontrado" copy="Cadastre o primeiro fornecedor ou ajuste os filtros para ampliar o resultado." />;
  return (
    <div className="supplier-table">
      <div className="supplier-table-header"><span>Fornecedor</span><span>Contato</span><span>Acordo vigente</span><span>Situação</span><span>Ações</span></div>
      {items.map((item) => {
        const current = agreements.find((agreement) => agreement.supplierId === item.id && agreementStatus(agreement, today) === "current");
        const activeAgreement = agreements.find((agreement) => agreement.supplierId === item.id && agreement.active);
        const latestAgreement = agreements.find((agreement) => agreement.supplierId === item.id);
        const displayedAgreement = current ?? activeAgreement ?? latestAgreement;
        return <div className="supplier-table-row" key={item.id}>
          <div className="supplier-identity"><span>{initials(item.name)}</span><div><strong>{item.name}</strong><small>{item.taxId ? formatTaxId(item.taxId) : "Documento não informado"}</small></div></div>
          <div className="supplier-contact"><strong>{item.contactName ?? "Sem responsável"}</strong><small>{item.email ?? (item.phone ? formatPhone(item.phone) : "Contato não informado")}</small></div>
          <div className="supplier-agreement-summary">{displayedAgreement ? <><strong className={current ? "" : "missing"}>{current ? `${displayedAgreement.minimumDays} dias` : agreementStatusLabel(agreementStatus(displayedAgreement, today))}</strong><small>{outcomeLabel(displayedAgreement.exchangeOutcome)} · {validityLabel(displayedAgreement)}</small></> : <><strong className="missing">Sem cobertura</strong><small>Nenhuma regra cadastrada</small></>}</div>
          <span className={`supplier-state ${item.active ? "active" : "inactive"}`}>{item.active ? "Ativo" : "Inativo"}</span>
          <div className="supplier-row-actions">{canManage ? <><button onClick={() => onEdit(item)} type="button">Editar</button><button disabled={!item.active || Boolean(activeAgreement)} onClick={() => onAgreement(item.id)} type="button">Criar acordo</button></> : <span>Consulta</span>}</div>
        </div>;
      })}
    </div>
  );
}

function AgreementList({ items, supplierById, canManage, today, updatingIds, onEdit, onToggle }: {
  items: AgreementItem[];
  supplierById: Map<string, SupplierItem>;
  canManage: boolean;
  today: string;
  updatingIds: string[];
  onEdit: (item: AgreementItem) => void;
  onToggle: (item: AgreementItem) => void;
}) {
  if (!items.length) return <EmptyState icon="≡" title="Nenhum acordo encontrado" copy="Registre as condições negociadas para tornar as próximas trocas previsíveis." />;
  return (
    <div className="agreement-list">
      {items.map((item) => {
        const status = agreementStatus(item, today);
        const supplier = supplierById.get(item.supplierId);
        const updating = updatingIds.includes(item.id);
        return <article className="agreement-row" key={item.id}>
          <div className="agreement-row-top"><div><span>{supplier?.name ?? "Fornecedor indisponível"}</span><h3>{item.title}</h3><small>{item.agreementCode ? `Código ${item.agreementCode}` : "Sem código externo"} · Atualizado em {formatDateTime(item.updatedAt)}</small></div><span className={`agreement-state ${status}`}>{agreementStatusLabel(status)}</span></div>
          <div className="agreement-rule-grid"><div><span>Antecedência mínima</span><strong>{item.minimumDays} {item.minimumDays === 1 ? "dia" : "dias"}</strong></div><div><span>Compensação</span><strong>{outcomeLabel(item.exchangeOutcome)}</strong></div><div><span>Vigência</span><strong>{validityLabel(item)}</strong></div><div><span>Frete</span><strong>{freightLabel(item.freightResponsibility)}</strong></div></div>
          <div className="agreement-requirements"><span className={item.requiresInvoice ? "checked" : ""}>{item.requiresInvoice ? "✓" : "—"} Nota fiscal</span><span className={item.requiresPhotos ? "checked" : ""}>{item.requiresPhotos ? "✓" : "—"} Fotos</span><span className={item.requiresPriorAuthorization ? "checked" : ""}>{item.requiresPriorAuthorization ? "✓" : "—"} Autorização prévia</span></div>
          <div className="agreement-row-actions">{item.notes ? <p>{item.notes}</p> : <p>Sem observações adicionais.</p>}{canManage ? <div><button onClick={() => onEdit(item)} type="button">Editar condições</button><button className={item.active ? "danger" : ""} disabled={updating} onClick={() => onToggle(item)} type="button">{updating ? "Salvando…" : item.active ? "Encerrar acordo" : "Reativar acordo"}</button></div> : null}</div>
        </article>;
      })}
    </div>
  );
}

function SupplierForm({ item, onCancel, onSaved }: { item?: SupplierItem; onCancel: () => void; onSaved: (item: SupplierItem) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/suppliers", {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item?.id, ...Object.fromEntries(form.entries()), active: form.get("active") === "on" }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; supplier?: SupplierItem };
      if (!response.ok || !data.supplier) throw new Error(data.error ?? "Não foi possível salvar o fornecedor.");
      onSaved(data.supplier);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar o fornecedor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="supplier-form-card" key={item?.id ?? "new-supplier"} onSubmit={submit}>
      <div className="supplier-side-heading"><div><span>{item ? "Editar fornecedor" : "Novo fornecedor"}</span><h2>{item ? item.name : "Cadastre um parceiro"}</h2><p>Dados usados no recebimento, na negociação e nas trocas.</p></div><button aria-label="Fechar formulário" onClick={onCancel} type="button">×</button></div>
      <div className="supplier-form-grid">
        <label className="wide">Nome do fornecedor<input defaultValue={item?.name ?? ""} maxLength={120} name="name" placeholder="Ex.: Distribuidora Nordeste" required /></label>
        <label>CPF ou CNPJ<input defaultValue={item?.taxId ?? ""} inputMode="numeric" name="taxId" placeholder="Somente números" /></label>
        <label>Responsável comercial<input defaultValue={item?.contactName ?? ""} maxLength={120} name="contactName" placeholder="Nome do contato" /></label>
        <label>E-mail<input defaultValue={item?.email ?? ""} maxLength={254} name="email" placeholder="contato@fornecedor.com" type="email" /></label>
        <label>Telefone<input defaultValue={item?.phone ?? ""} inputMode="tel" name="phone" placeholder="(81) 99999-0000" /></label>
        <label className="wide">Observações<textarea defaultValue={item?.notes ?? ""} maxLength={2000} name="notes" placeholder="Horários, canais preferidos ou detalhes da negociação" rows={3} /></label>
      </div>
      <label className="supplier-active-toggle"><input defaultChecked={item?.active ?? true} name="active" type="checkbox" /><span><strong>Fornecedor ativo</strong><small>Disponível nos fluxos de recebimento e troca.</small></span></label>
      {error ? <p className="form-feedback form-error" role="alert">{error}</p> : null}
      <div className="supplier-form-actions"><button className="secondary-action" disabled={saving} onClick={onCancel} type="button">Cancelar</button><button className="primary-action" disabled={saving} type="submit">{saving ? "Salvando…" : "Salvar fornecedor"}</button></div>
    </form>
  );
}

function AgreementForm({ item, suppliers, requestedSupplierId, today, onCancel, onSaved }: { item?: AgreementItem; suppliers: SupplierItem[]; requestedSupplierId?: string; today: string; onCancel: () => void; onSaved: (item: AgreementItem) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const options = suppliers.filter((supplier) => supplier.active || supplier.id === item?.supplierId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const body = {
        id: item?.id,
        supplierId: form.get("supplierId"),
        title: form.get("title"),
        agreementCode: form.get("agreementCode"),
        minimumDays: Number(form.get("minimumDays")),
        exchangeOutcome: form.get("exchangeOutcome"),
        freightResponsibility: form.get("freightResponsibility"),
        validFrom: form.get("validFrom"),
        validUntil: form.get("validUntil"),
        notes: form.get("notes"),
        requiresInvoice: form.get("requiresInvoice") === "on",
        requiresPhotos: form.get("requiresPhotos") === "on",
        requiresPriorAuthorization: form.get("requiresPriorAuthorization") === "on",
        active: form.get("active") === "on",
      };
      const saved = await requestAgreement(body, item ? "PATCH" : "POST");
      onSaved(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar o acordo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="supplier-form-card agreement-form-card" key={item?.id ?? requestedSupplierId ?? "new-agreement"} onSubmit={submit}>
      <div className="supplier-side-heading"><div><span>{item ? "Editar acordo" : "Novo acordo"}</span><h2>Condições de troca</h2><p>Estas regras prepararão a elegibilidade automática dos lotes.</p></div><button aria-label="Fechar formulário" onClick={onCancel} type="button">×</button></div>
      <div className="supplier-form-grid">
        <label className="wide">Fornecedor<select defaultValue={item?.supplierId ?? requestedSupplierId ?? options[0]?.id ?? ""} name="supplierId" required><option disabled value="">Selecione</option>{options.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
        <label className="wide">Título do acordo<input defaultValue={item?.title ?? "Acordo de troca e devolução"} maxLength={120} name="title" required /></label>
        <label>Código ou referência<input defaultValue={item?.agreementCode ?? ""} maxLength={60} name="agreementCode" placeholder="Ex.: AC-2026-04" /></label>
        <label>Antecedência mínima<input defaultValue={item?.minimumDays ?? 30} inputMode="numeric" max={365} min={0} name="minimumDays" required type="number" /></label>
        <label>Início da vigência<input defaultValue={item?.validFrom ?? today} name="validFrom" type="date" /></label>
        <label>Fim da vigência<input defaultValue={item?.validUntil ?? ""} min={item?.validFrom ?? today} name="validUntil" type="date" /></label>
        <label>Compensação<select defaultValue={item?.exchangeOutcome ?? "replacement"} name="exchangeOutcome"><option value="replacement">Reposição</option><option value="credit">Crédito</option><option value="either">Reposição ou crédito</option></select></label>
        <label>Responsável pelo frete<select defaultValue={item?.freightResponsibility ?? "supplier"} name="freightResponsibility"><option value="supplier">Fornecedor</option><option value="company">Minha empresa</option><option value="shared">Compartilhado</option></select></label>
      </div>
      <fieldset className="agreement-checklist"><legend>Documentos e autorização</legend><label><input defaultChecked={item?.requiresInvoice ?? true} name="requiresInvoice" type="checkbox" /><span><strong>Nota fiscal</strong><small>Comprovação obrigatória da compra.</small></span></label><label><input defaultChecked={item?.requiresPhotos ?? false} name="requiresPhotos" type="checkbox" /><span><strong>Fotos do lote</strong><small>Registro visual antes da solicitação.</small></span></label><label><input defaultChecked={item?.requiresPriorAuthorization ?? true} name="requiresPriorAuthorization" type="checkbox" /><span><strong>Autorização prévia</strong><small>Confirmação antes do envio físico.</small></span></label></fieldset>
      <label className="supplier-notes-field">Observações<textarea defaultValue={item?.notes ?? ""} maxLength={2000} name="notes" placeholder="Condições especiais, exceções e contatos" rows={3} /></label>
      <label className="supplier-active-toggle"><input defaultChecked={item?.active ?? true} name="active" type="checkbox" /><span><strong>Acordo ativo</strong><small>Apenas um acordo pode ficar ativo por fornecedor.</small></span></label>
      {error ? <p className="form-feedback form-error" role="alert">{error}</p> : null}
      <div className="supplier-form-actions"><button className="secondary-action" disabled={saving} onClick={onCancel} type="button">Cancelar</button><button className="primary-action" disabled={saving || !options.length} type="submit">{saving ? "Salvando…" : "Salvar acordo"}</button></div>
    </form>
  );
}

function SupplierGuidance({ canManage }: { canManage: boolean }) {
  return <article className="supplier-guidance-card"><span>Fluxo recomendado</span><h2>Primeiro o parceiro, depois as condições.</h2><ol><li><b>1</b><div><strong>Cadastre o fornecedor</strong><small>Inclua contato e documento para evitar duplicidade.</small></div></li><li><b>2</b><div><strong>Formalize o acordo</strong><small>Defina vigência, antecedência e documentos.</small></div></li><li><b>3</b><div><strong>Use na troca</strong><small>A central cruza cada lote com estas regras automaticamente.</small></div></li></ol><p>{canManage ? "Use os botões acima para começar." : "Seu acesso permite consultar as regras existentes."}</p></article>;
}

function ActivityCard({ activities, canViewAudit }: { activities: SupplierActivityItem[]; canViewAudit: boolean }) {
  return <article className="supplier-activity-card"><div><span>Histórico</span><h2>Alterações recentes</h2></div>{canViewAudit ? activities.length ? <div className="supplier-activity-list">{activities.map((item) => <div key={item.id}><i>✓</i><div><strong>{item.title}</strong><p>{item.detail}</p><small>{item.actorLabel} · {formatDateTime(item.createdAt)}</small></div></div>)}</div> : <p className="supplier-activity-empty">As primeiras alterações de fornecedores e acordos aparecerão aqui.</p> : <p className="supplier-activity-empty">O histórico detalhado fica disponível para responsáveis com papel de administrador.</p>}</article>;
}

function EmptyState({ icon, title, copy }: { icon: string; title: string; copy: string }) {
  return <div className="supplier-empty-state"><span>{icon}</span><h3>{title}</h3><p>{copy}</p></div>;
}

async function requestAgreement(body: Record<string, unknown>, method: "POST" | "PATCH") {
  const response = await fetch("/api/supplier-agreements", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as { error?: string; agreement?: AgreementItem };
  if (!response.ok || !data.agreement) throw new Error(data.error ?? "Não foi possível salvar o acordo.");
  return data.agreement;
}

function agreementStatus(item: AgreementItem, today: string): AgreementStatus {
  if (!item.active) return "inactive";
  if (item.validFrom && item.validFrom > today) return "upcoming";
  if (item.validUntil && item.validUntil < today) return "expired";
  return "current";
}

function agreementStatusLabel(status: AgreementStatus) {
  return ({ current: "Vigente", upcoming: "Futuro", expired: "Vencido", inactive: "Encerrado" } as Record<AgreementStatus, string>)[status];
}

function outcomeLabel(value: AgreementItem["exchangeOutcome"]) {
  return ({ replacement: "Reposição", credit: "Crédito", either: "Reposição ou crédito" } as const)[value];
}

function freightLabel(value: AgreementItem["freightResponsibility"]) {
  return ({ supplier: "Fornecedor", company: "Minha empresa", shared: "Compartilhado" } as const)[value];
}

function validityLabel(item: AgreementItem) {
  if (!item.validFrom && !item.validUntil) return "Prazo indeterminado";
  if (item.validFrom && item.validUntil) return `${formatDate(item.validFrom)} a ${formatDate(item.validUntil)}`;
  if (item.validFrom) return `Desde ${formatDate(item.validFrom)}`;
  return `Até ${formatDate(item.validUntil!)}`;
}

function formatDate(value: string) {
  return dateOnly.format(new Date(`${value}T12:00:00Z`)).replace(".", "");
}

function formatDateTime(value: string) {
  return dateTime.format(new Date(value)).replace(".", "");
}

function daysBetween(left: string, right: string) {
  return Math.max(0, Math.ceil((new Date(`${right}T12:00:00Z`).getTime() - new Date(`${left}T12:00:00Z`).getTime()) / 86_400_000));
}

function formatTaxId(value: string) {
  if (value.length === 14) return value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (value.length === 11) return value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return value;
}

function formatPhone(value: string) {
  if (value.length === 11) return value.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (value.length === 10) return value.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return value;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function upsert<T extends { id: string }>(items: T[], item: T) {
  return items.some((current) => current.id === item.id) ? items.map((current) => current.id === item.id ? item : current) : [item, ...items];
}

function sortByName(items: SupplierItem[]) {
  return items.toSorted((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}

function isView(value?: string): value is View {
  return Boolean(value && ["suppliers", "agreements"].includes(value));
}

function isSupplierFilter(value?: string): value is SupplierFilter {
  return Boolean(value && ["all", "active", "inactive"].includes(value));
}

function isAgreementFilter(value?: string): value is AgreementFilter {
  return Boolean(value && ["all", "current", "expiring", "upcoming", "expired", "inactive"].includes(value));
}
