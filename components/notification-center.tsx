"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

export type NotificationSeverity = "critical" | "warning" | "info" | "success";

export type NotificationCenterItem = {
  id: string;
  title: string;
  body: string;
  typeLabel: string;
  severity: NotificationSeverity;
  readAt: string | null;
  createdAt: string;
  dateKey: string;
  dateLabel: string;
  createdLabel: string;
  contextLabel: string | null;
  href: string;
};

export type NotificationInitialFilters = {
  query?: string;
  status?: string;
  severity?: string;
  period?: string;
};

type StatusFilter = "all" | "unread" | "read";
type SeverityFilter = "all" | NotificationSeverity;
type PeriodFilter = "all" | "today" | "week" | "month";
type Feedback = { tone: "success" | "error"; message: string } | null;

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "unread", label: "Não lidas" },
  { value: "read", label: "Lidas" },
];

export function NotificationCenter({ items, initialFilters = {} }: { items: NotificationCenterItem[]; initialFilters?: NotificationInitialFilters }) {
  const [notifications, setNotifications] = useState(items);
  const [query, setQuery] = useState(initialFilters.query ?? "");
  const [status, setStatus] = useState<StatusFilter>(isStatus(initialFilters.status) ? initialFilters.status : "all");
  const [severity, setSeverity] = useState<SeverityFilter>(isSeverity(initialFilters.severity) ? initialFilters.severity : "all");
  const [period, setPeriod] = useState<PeriodFilter>(isPeriod(initialFilters.period) ? initialFilters.period : "all");
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [markingAll, setMarkingAll] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("busca", query.trim());
    if (status !== "all") params.set("estado", status);
    if (severity !== "all") params.set("severidade", severity);
    if (period !== "all") params.set("periodo", period);
    const next = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
    window.history.replaceState(null, "", next);
  }, [period, query, severity, status]);

  const [now] = useState(Date.now);
  const filtered = useMemo(() => {
    const normalizedQuery = normalize(deferredQuery);
    return notifications.filter((item) => {
      if (normalizedQuery && !normalize(`${item.title} ${item.body} ${item.typeLabel} ${item.contextLabel ?? ""}`).includes(normalizedQuery)) return false;
      if (status === "unread" && item.readAt) return false;
      if (status === "read" && !item.readAt) return false;
      if (severity !== "all" && item.severity !== severity) return false;
      return matchesPeriod(item, period, now);
    });
  }, [deferredQuery, notifications, now, period, severity, status]);

  const groups = useMemo(() => {
    const byDate = new Map<string, { label: string; items: NotificationCenterItem[] }>();
    for (const item of filtered) {
      const existing = byDate.get(item.dateKey) ?? { label: item.dateLabel, items: [] };
      existing.items.push(item);
      byDate.set(item.dateKey, existing);
    }
    return [...byDate.entries()].map(([key, group]) => ({ key, ...group }));
  }, [filtered]);

  const unreadCount = notifications.filter((item) => !item.readAt).length;
  const hasFilters = Boolean(query.trim() || status !== "all" || severity !== "all" || period !== "all");

  function clearFilters() {
    setQuery("");
    setStatus("all");
    setSeverity("all");
    setPeriod("all");
  }

  async function changeReadState(notificationId: string, markAsRead: boolean) {
    setPendingIds((current) => [...current, notificationId]);
    setFeedback(null);
    try {
      const result = await updateNotifications({ action: markAsRead ? "mark_read" : "mark_unread", notificationId });
      const updatedIds = new Set(result.ids);
      setNotifications((current) => current.map((item) => updatedIds.has(item.id) ? { ...item, readAt: result.readAt } : item));
      setFeedback({ tone: "success", message: markAsRead ? "Notificação marcada como lida." : "Notificação devolvida às não lidas." });
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Não foi possível atualizar a notificação." });
    } finally {
      setPendingIds((current) => current.filter((id) => id !== notificationId));
    }
  }

  async function markAllAsRead() {
    setMarkingAll(true);
    setFeedback(null);
    try {
      const result = await updateNotifications({ action: "mark_all_read" });
      const updatedIds = new Set(result.ids);
      setNotifications((current) => current.map((item) => updatedIds.has(item.id) ? { ...item, readAt: result.readAt } : item));
      setFeedback({ tone: "success", message: result.ids.length ? `${result.ids.length} ${result.ids.length === 1 ? "notificação foi marcada" : "notificações foram marcadas"} como lida${result.ids.length === 1 ? "" : "s"}.` : "Todas as notificações já estavam lidas." });
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Não foi possível atualizar as notificações." });
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <section className="notification-workspace" aria-label="Central de notificações">
      <div className="notification-filter-card">
        <div className="notification-filter-row">
          <label className="notification-search"><span aria-hidden="true">⌕</span><input aria-label="Buscar nas notificações" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar alerta, produto ou lote" type="search" value={query} /></label>
          <label className="notification-select"><span>Severidade</span><select aria-label="Filtrar por severidade" onChange={(event) => setSeverity(event.target.value as SeverityFilter)} value={severity}><option value="all">Todas</option><option value="critical">Críticas</option><option value="warning">Avisos</option><option value="info">Informativas</option><option value="success">Concluídas</option></select></label>
          <label className="notification-select"><span>Período</span><select aria-label="Filtrar por período" onChange={(event) => setPeriod(event.target.value as PeriodFilter)} value={period}><option value="all">Todo o histórico</option><option value="today">Hoje</option><option value="week">Últimos 7 dias</option><option value="month">Últimos 30 dias</option></select></label>
        </div>
        <div className="notification-filter-footer">
          <div className="notification-status-tabs" role="group" aria-label="Filtrar por leitura">
            {statusOptions.map((option) => <button className={status === option.value ? "active" : ""} key={option.value} onClick={() => setStatus(option.value)} type="button">{option.label}<b>{notifications.filter((item) => option.value === "all" || (option.value === "unread" ? !item.readAt : item.readAt)).length}</b></button>)}
          </div>
          <button className="notification-bulk-action" disabled={!unreadCount || markingAll} onClick={markAllAsRead} type="button">{markingAll ? "Atualizando…" : "✓ Marcar todas como lidas"}</button>
        </div>
      </div>

      {feedback ? <p className={`notification-feedback ${feedback.tone}`} role="status">{feedback.message}</p> : null}

      <div className="notification-results-heading">
        <div><span>Fila de trabalho</span><h2>{filtered.length} {filtered.length === 1 ? "notificação encontrada" : "notificações encontradas"}</h2><p>Abra a origem do alerta ou organize sua leitura sem perder o contexto.</p></div>
        {hasFilters ? <button onClick={clearFilters} type="button">Limpar filtros</button> : <small>Mais recentes primeiro</small>}
      </div>

      {groups.length ? (
        <div className="notification-groups">
          {groups.map((group) => (
            <section className="notification-date-group" key={group.key} aria-labelledby={`notification-date-${group.key}`}>
              <div className="notification-date-heading"><h3 id={`notification-date-${group.key}`}>{group.label}</h3><span>{group.items.length}</span></div>
              <div className="notification-list">
                {group.items.map((item) => {
                  const pending = pendingIds.includes(item.id);
                  return (
                    <article className={`notification-row severity-${item.severity} ${item.readAt ? "is-read" : "is-unread"}`} key={item.id}>
                      <span className="notification-severity-icon" aria-hidden="true">{severityIcon(item.severity)}</span>
                      <div className="notification-row-copy">
                        <div className="notification-row-meta"><span className={`notification-severity-label ${item.severity}`}>{severityLabel(item.severity)}</span><span>{item.typeLabel}</span><time dateTime={item.createdAt}>{item.createdLabel}</time></div>
                        <h4>{item.title}</h4>
                        <p>{item.body}</p>
                        {item.contextLabel ? <small>{item.contextLabel}</small> : null}
                      </div>
                      <div className="notification-row-actions">
                        <Link href={item.href}>Abrir origem →</Link>
                        <button disabled={pending} onClick={() => changeReadState(item.id, !item.readAt)} type="button">{pending ? "Salvando…" : item.readAt ? "Marcar como não lida" : "Marcar como lida"}</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="notification-empty-state">
          <span>{notifications.length ? "⌕" : "✓"}</span>
          <h3>{notifications.length ? "Nenhuma notificação combina com os filtros" : "Tudo em dia por aqui"}</h3>
          <p>{notifications.length ? "Ajuste a busca, a severidade ou o período para ampliar o resultado." : "Novos alertas de validade e movimentação aparecerão nesta fila automaticamente."}</p>
          {notifications.length ? <button className="secondary-action" onClick={clearFilters} type="button">Limpar filtros</button> : <Link className="primary-action link-action" href="/app/validades">Acompanhar validades</Link>}
        </div>
      )}
    </section>
  );
}

async function updateNotifications(body: Record<string, unknown>) {
  const response = await fetch("/api/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string; ids?: string[]; readAt?: string | null };
  if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar a notificação.");
  return { ids: data.ids ?? [], readAt: data.readAt ?? null };
}

function matchesPeriod(item: NotificationCenterItem, period: PeriodFilter, now: number) {
  if (period === "all") return true;
  if (period === "today") return item.dateLabel === "Hoje";
  const age = now - new Date(item.createdAt).getTime();
  if (period === "week") return age <= 7 * 24 * 60 * 60 * 1000;
  return age <= 30 * 24 * 60 * 60 * 1000;
}

function isStatus(value?: string): value is StatusFilter {
  return Boolean(value && ["all", "unread", "read"].includes(value));
}

function isSeverity(value?: string): value is SeverityFilter {
  return Boolean(value && ["all", "critical", "warning", "info", "success"].includes(value));
}

function isPeriod(value?: string): value is PeriodFilter {
  return Boolean(value && ["all", "today", "week", "month"].includes(value));
}

function severityIcon(severity: NotificationSeverity) {
  if (severity === "critical") return "!";
  if (severity === "warning") return "◷";
  if (severity === "success") return "✓";
  return "i";
}

function severityLabel(severity: NotificationSeverity) {
  if (severity === "critical") return "Crítica";
  if (severity === "warning") return "Aviso";
  if (severity === "success") return "Concluída";
  return "Informativa";
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}
