"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

export type NotificationDeliveryStatus = "pending" | "processing" | "sent" | "delivered" | "failed" | "skipped";
export type NotificationDeliveryItem = {
  id: string;
  title: string;
  body: string;
  href: string;
  channel: "email" | "whatsapp";
  status: NotificationDeliveryStatus;
  deliveryKind: "instant" | "summary";
  attemptCount: number;
  createdAt: string;
  scheduledFor: string;
  attemptedAt: string | null;
  sentAt: string | null;
  errorLabel: string | null;
};

type DeliveryFilter = "all" | "queued" | "sent" | "failed";
type KindFilter = "all" | "instant" | "summary";
type Feedback = { tone: "success" | "error"; message: string } | null;
export type NotificationDeliveryInitialFilters = { query?: string; status?: string; kind?: string };

const deliveryFilters: Array<{ value: DeliveryFilter; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "queued", label: "Na fila" },
  { value: "sent", label: "Enviadas" },
  { value: "failed", label: "Com falha" },
];
const dateTime = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Recife" });

export function NotificationDeliveryCenter({ initialItems, initialFilters = {} }: { initialItems: NotificationDeliveryItem[]; initialFilters?: NotificationDeliveryInitialFilters }) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState(initialFilters.query ?? "");
  const [status, setStatus] = useState<DeliveryFilter>(isDeliveryFilter(initialFilters.status) ? initialFilters.status : "all");
  const [kind, setKind] = useState<KindFilter>(isKindFilter(initialFilters.kind) ? initialFilters.kind : "all");
  const [retryingIds, setRetryingIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("busca", query.trim());
    if (status !== "all") params.set("estado", status);
    if (kind !== "all") params.set("tipo", kind);
    const next = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
    window.history.replaceState(null, "", next);
  }, [kind, query, status]);

  const counts = useMemo(() => {
    const queued = items.filter((item) => matchesStatus(item.status, "queued")).length;
    const sent = items.filter((item) => matchesStatus(item.status, "sent")).length;
    const failed = items.filter((item) => matchesStatus(item.status, "failed")).length;
    const attempted = sent + failed;
    return { queued, sent, failed, attempted, successRate: attempted ? Math.round((sent / attempted) * 100) : 0 };
  }, [items]);

  const filtered = useMemo(() => {
    const normalized = normalize(deferredQuery);
    return items.filter((item) => {
      if (normalized && !normalize(`${item.title} ${item.body} ${item.errorLabel ?? ""}`).includes(normalized)) return false;
      if (status !== "all" && !matchesStatus(item.status, status)) return false;
      return kind === "all" || item.deliveryKind === kind;
    });
  }, [deferredQuery, items, kind, status]);

  async function retryDelivery(deliveryId: string) {
    setRetryingIds((current) => [...current, deliveryId]);
    setFeedback(null);
    try {
      const response = await fetch("/api/notification-deliveries/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível reenviar.");
      setItems((current) => current.map((item) => item.id === deliveryId ? {
        ...item,
        status: "pending",
        attemptCount: 0,
        scheduledFor: new Date().toISOString(),
        errorLabel: null,
      } : item));
      setFeedback({ tone: "success", message: "Entrega recolocada na fila. O processador fará uma nova tentativa automaticamente." });
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Não foi possível reenviar." });
    } finally {
      setRetryingIds((current) => current.filter((id) => id !== deliveryId));
    }
  }

  function clearFilters() {
    setQuery("");
    setStatus("all");
    setKind("all");
  }

  const hasFilters = Boolean(query.trim() || status !== "all" || kind !== "all");

  return (
    <section className="delivery-workspace" aria-label="Entregas de notificações">
      <div className="delivery-system-strip">
        <article><i>↻</i><div><span>Processamento</span><strong>A cada 5 minutos</strong><small>Fila automática com recuperação de travamentos</small></div><b className="delivery-system-ok">Ativo</b></article>
        <article><i>◷</i><div><span>Resumo diário</span><strong>No fuso do usuário</strong><small>Alertas agrupados no horário escolhido</small></div><b>Configurável</b></article>
        <article><i>@</i><div><span>Provedor externo</span><strong>Resend preparado</strong><small>Exige credencial e domínio de envio verificado</small></div><b className="delivery-system-attention">Configurar</b></article>
      </div>

      <div className="delivery-metric-grid" aria-label="Resumo das entregas">
        <article><span>Na fila</span><strong>{counts.queued}</strong><small>Pendentes ou em processamento</small><i>◷</i></article>
        <article className="delivery-metric-sent"><span>Enviadas</span><strong>{counts.sent}</strong><small>Aceitas pelo provedor</small><i>✓</i></article>
        <article className="delivery-metric-failed"><span>Com falha</span><strong>{counts.failed}</strong><small>Podem ser reenviadas</small><i>!</i></article>
        <article><span>Taxa de sucesso</span><strong>{counts.attempted ? `${counts.successRate}%` : "—"}</strong><small>{counts.attempted ? `${counts.attempted} tentativas concluídas` : "Aguardando primeiros envios"}</small><i>↗</i></article>
      </div>

      <div className="delivery-list-card">
        <div className="delivery-filter-row">
          <label className="notification-search"><span aria-hidden="true">⌕</span><input aria-label="Buscar nas entregas" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar alerta ou erro" type="search" value={query} /></label>
          <label className="notification-select"><span>Formato</span><select aria-label="Filtrar por formato" onChange={(event) => setKind(event.target.value as KindFilter)} value={kind}><option value="all">Todos</option><option value="instant">Imediato</option><option value="summary">Resumo diário</option></select></label>
        </div>
        <div className="notification-filter-footer">
          <div className="notification-status-tabs" role="group" aria-label="Filtrar por estado da entrega">
            {deliveryFilters.map((filter) => <button className={status === filter.value ? "active" : ""} key={filter.value} onClick={() => setStatus(filter.value)} type="button">{filter.label}<b>{items.filter((item) => filter.value === "all" || matchesStatus(item.status, filter.value)).length}</b></button>)}
          </div>
          {hasFilters ? <button className="delivery-clear-filter" onClick={clearFilters} type="button">Limpar filtros</button> : <small className="delivery-order-note">Mais recentes primeiro</small>}
        </div>

        {feedback ? <p className={`notification-feedback ${feedback.tone}`} role="status">{feedback.message}</p> : null}

        <div className="delivery-results-heading"><div><span>Histórico operacional</span><h2>{filtered.length} {filtered.length === 1 ? "entrega encontrada" : "entregas encontradas"}</h2><p>Cada linha representa um evento único, mesmo quando vários seguem no mesmo resumo.</p></div><Link href="/app/notificacoes/preferencias">Ajustar preferências →</Link></div>

        {filtered.length ? (
          <div className="delivery-list">
            {filtered.map((item) => {
              const retrying = retryingIds.includes(item.id);
              const retryable = item.status === "failed" || item.status === "skipped";
              return (
                <article className="delivery-row" key={item.id}>
                  <span className={`delivery-status-icon status-${item.status}`} aria-hidden="true">{statusIcon(item.status)}</span>
                  <div className="delivery-row-copy">
                    <div className="delivery-row-meta"><span className={`delivery-status-pill status-${item.status}`}>{statusLabel(item.status)}</span><span>{item.channel === "email" ? "E-mail" : "WhatsApp"}</span><span>{item.deliveryKind === "summary" ? "Resumo diário" : "Envio imediato"}</span><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></div>
                    <h3>{item.title}</h3><p>{item.body}</p>
                    <div className="delivery-attempt-line"><span>Tentativas: <b>{item.attemptCount}/3</b></span><span>{timingLabel(item)}</span>{item.errorLabel ? <span className="delivery-error">{item.errorLabel}</span> : null}</div>
                  </div>
                  <div className="delivery-row-actions"><Link href={item.href}>Abrir origem →</Link>{retryable ? <button disabled={retrying} onClick={() => retryDelivery(item.id)} type="button">{retrying ? "Reenviando…" : "Tentar novamente"}</button> : null}</div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="delivery-empty-state"><span>{items.length ? "⌕" : "@"}</span><h3>{items.length ? "Nenhuma entrega combina com os filtros" : "A fila ainda está vazia"}</h3><p>{items.length ? "Ajuste o estado, o formato ou a busca para ampliar o resultado." : "Quando um alerta atingir um marco configurado, sua tentativa de e-mail aparecerá aqui com horário e status."}</p>{items.length ? <button className="secondary-action" onClick={clearFilters} type="button">Limpar filtros</button> : <Link className="primary-action link-action" href="/app/notificacoes/preferencias">Configurar alertas</Link>}</div>
        )}
      </div>
    </section>
  );
}

function matchesStatus(status: NotificationDeliveryStatus, filter: Exclude<DeliveryFilter, "all">) {
  if (filter === "queued") return status === "pending" || status === "processing";
  if (filter === "sent") return status === "sent" || status === "delivered";
  return status === "failed" || status === "skipped";
}

function statusLabel(status: NotificationDeliveryStatus) {
  if (status === "pending") return "Agendada";
  if (status === "processing") return "Processando";
  if (status === "sent") return "Enviada";
  if (status === "delivered") return "Entregue";
  if (status === "skipped") return "Ignorada";
  return "Falhou";
}

function statusIcon(status: NotificationDeliveryStatus) {
  if (status === "sent" || status === "delivered") return "✓";
  if (status === "failed" || status === "skipped") return "!";
  return "◷";
}

function timingLabel(item: NotificationDeliveryItem) {
  if (item.sentAt) return `Enviada em ${formatDate(item.sentAt)}`;
  if (item.status === "processing") return `Iniciada em ${formatDate(item.attemptedAt ?? item.scheduledFor)}`;
  if (item.status === "pending") return `Programada para ${formatDate(item.scheduledFor)}`;
  return item.attemptedAt ? `Última tentativa em ${formatDate(item.attemptedAt)}` : "Sem tentativa registrada";
}

function formatDate(value: string) {
  return dateTime.format(new Date(value)).replace(".", "");
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function isDeliveryFilter(value?: string): value is DeliveryFilter {
  return Boolean(value && ["all", "queued", "sent", "failed"].includes(value));
}

function isKindFilter(value?: string): value is KindFilter {
  return Boolean(value && ["all", "instant", "summary"].includes(value));
}
