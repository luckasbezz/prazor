import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import { NotificationCenter, type NotificationCenterItem, type NotificationInitialFilters, type NotificationSeverity } from "@/components/notification-center";
import { requireAppContext } from "@/lib/app-context";
import { supabaseRest } from "@/lib/supabase/rest";

export const dynamic = "force-dynamic";

type NotificationRow = {
  id: string;
  notification_type: string;
  severity: string;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};
type BatchRow = { id: string; product_id: string; batch_code: string | null };
type ProductRow = { id: string; name: string; sku: string | null };

const dateTime = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Recife" });
const dateLong = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Recife" });

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { auth, context } = await requireAppContext("/app/notificacoes");
  const companyId = encodeURIComponent(context.company.id);
  const notificationRows = await supabaseRest<NotificationRow[]>(
    `notifications?select=id,notification_type,severity,title,body,entity_type,entity_id,read_at,created_at&company_id=eq.${companyId}&order=created_at.desc&limit=1000`,
    auth.accessToken,
  );

  const entityIds = unique(notificationRows.flatMap((item) => item.entity_id ? [item.entity_id] : []));
  const batches = entityIds.length
    ? await supabaseRest<BatchRow[]>(`batches?select=id,product_id,batch_code&company_id=eq.${companyId}&id=in.(${entityIds.map(encodeURIComponent).join(",")})&limit=1000`, auth.accessToken)
    : [];
  const batchProductIds = batches.map((batch) => batch.product_id);
  const directProductIds = notificationRows.flatMap((item) => item.entity_id && isProductEntity(item.entity_type) ? [item.entity_id] : []);
  const productIds = unique([...batchProductIds, ...directProductIds]);
  const products = productIds.length
    ? await supabaseRest<ProductRow[]>(`products?select=id,name,sku&company_id=eq.${companyId}&id=in.(${productIds.map(encodeURIComponent).join(",")})&limit=1000`, auth.accessToken)
    : [];

  const batchById = new Map(batches.map((batch) => [batch.id, batch]));
  const productById = new Map(products.map((product) => [product.id, product]));
  const now = new Date();
  const todayKey = dateKey(now);
  const yesterdayKey = dateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const items: NotificationCenterItem[] = notificationRows.map((item) => {
    const batch = item.entity_id ? batchById.get(item.entity_id) : undefined;
    const product = batch ? productById.get(batch.product_id) : item.entity_id ? productById.get(item.entity_id) : undefined;
    const itemDateKey = dateKey(new Date(item.created_at));
    return {
      id: item.id,
      title: item.title,
      body: item.body,
      typeLabel: notificationTypeLabel(item.notification_type),
      severity: normalizeSeverity(item.severity),
      readAt: item.read_at,
      createdAt: item.created_at,
      dateKey: itemDateKey,
      dateLabel: itemDateKey === todayKey ? "Hoje" : itemDateKey === yesterdayKey ? "Ontem" : capitalize(dateLong.format(new Date(item.created_at))),
      createdLabel: dateTime.format(new Date(item.created_at)).replace(".", ""),
      contextLabel: contextLabel(product, batch),
      href: entityHref(item, product, batch),
    };
  });

  const unread = items.filter((item) => !item.readAt);
  const criticalUnread = unread.filter((item) => item.severity === "critical");
  const today = items.filter((item) => item.dateKey === todayKey);
  const linked = items.filter((item) => item.href.startsWith("/app/validades/")).length;
  const params = await searchParams;
  const initialFilters: NotificationInitialFilters = {
    query: singleParam(params.busca),
    status: singleParam(params.estado),
    severity: singleParam(params.severidade),
    period: singleParam(params.periodo),
  };

  return (
    <AppFrame active="notifications" companyName={context.company.name} userLabel={auth.user.user_metadata?.full_name ?? auth.user.email} notificationCount={unread.length}>
      <div className="app-page notifications-page">
        <div className="app-heading-row notifications-heading">
          <div><span>Operação / Alertas</span><h1>Central de notificações</h1><p>Uma fila única para entender o risco, abrir a origem e acompanhar o que já foi visto.</p></div>
          <div className="app-primary-actions"><Link className="secondary-action link-action" href="/app/validades">◷ Ver validades</Link><Link className="secondary-action link-action" href="/app/notificacoes/entregas">↗ Ver entregas</Link><Link className="primary-action link-action" href="/app/notificacoes/preferencias">⚙ Configurar alertas</Link></div>
        </div>

        <section className="notification-metric-grid" aria-label="Resumo das notificações">
          <article className="notification-metric notification-metric-unread"><span>Não lidas</span><strong>{unread.length}</strong><small>{unread.length ? "Pedem sua revisão" : "Fila revisada"}</small><i>◇</i></article>
          <article className="notification-metric notification-metric-critical"><span>Críticas não lidas</span><strong>{criticalUnread.length}</strong><small>{criticalUnread.length ? "Prioridade imediata" : "Nenhuma urgência aberta"}</small><i>!</i></article>
          <article className="notification-metric notification-metric-today"><span>Recebidas hoje</span><strong>{today.length}</strong><small>Atualizações no seu fuso</small><i>◷</i></article>
          <article className="notification-metric notification-metric-linked"><span>Com lote vinculado</span><strong>{linked}</strong><small>Acesso direto ao contexto</small><i>↗</i></article>
        </section>

        <div className="real-data-note"><span>●</span> Alertas privados de <strong>{context.company.name}</strong>, isolados por empresa e pelo seu usuário.</div>
        <NotificationCenter items={items} initialFilters={initialFilters} />
      </div>
    </AppFrame>
  );
}

function entityHref(item: NotificationRow, product?: ProductRow, batch?: BatchRow) {
  if (item.entity_id && (batch || isBatchEntity(item.entity_type))) return `/app/validades/${item.entity_id}`;
  if (product) return `/app/estoque/produtos?busca=${encodeURIComponent(product.name)}`;
  if (item.notification_type.toLowerCase().includes("expir") || item.notification_type.toLowerCase().includes("valid")) return "/app/validades";
  return "/app";
}

function contextLabel(product?: ProductRow, batch?: BatchRow) {
  if (!product && !batch) return null;
  const productLabel = product ? `${product.name}${product.sku ? ` · SKU ${product.sku}` : ""}` : "Lote vinculado";
  return batch ? `${productLabel} · ${batch.batch_code ? `Lote ${batch.batch_code}` : "Lote sem código"}` : productLabel;
}

function notificationTypeLabel(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("expir") || normalized.includes("valid")) return "Validade";
  if (normalized.includes("loss") || normalized.includes("perda")) return "Perda";
  if (normalized.includes("stock") || normalized.includes("inventory") || normalized.includes("estoque")) return "Estoque";
  if (normalized.includes("exchange") || normalized.includes("troca")) return "Troca";
  return "Atualização";
}

function normalizeSeverity(value: string): NotificationSeverity {
  return ["critical", "warning", "info", "success"].includes(value) ? value as NotificationSeverity : "info";
}

function isBatchEntity(value: string | null) {
  return Boolean(value && ["batch", "lot", "lote"].includes(value.toLowerCase()));
}

function isProductEntity(value: string | null) {
  return Boolean(value && ["product", "produto"].includes(value.toLowerCase()));
}

function dateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Recife" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function capitalize(value: string) {
  return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function singleParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}
