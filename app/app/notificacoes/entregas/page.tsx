import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import { NotificationDeliveryCenter, type NotificationDeliveryInitialFilters, type NotificationDeliveryItem, type NotificationDeliveryStatus } from "@/components/notification-delivery-center";
import { requireAppContext } from "@/lib/app-context";
import { supabaseRest } from "@/lib/supabase/rest";

export const dynamic = "force-dynamic";

type DeliveryRow = {
  id: string;
  notification_id: string;
  channel: "email" | "whatsapp";
  status: string;
  delivery_kind: "instant" | "summary";
  attempt_count: number;
  created_at: string;
  scheduled_for: string;
  attempted_at: string | null;
  sent_at: string | null;
  error_message: string | null;
};
type NotificationRow = {
  id: string;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
};
type UnreadRow = { id: string };

export default async function NotificationDeliveriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { auth, context } = await requireAppContext("/app/notificacoes/entregas");
  const companyId = encodeURIComponent(context.company.id);
  const [deliveries, unread] = await Promise.all([
    supabaseRest<DeliveryRow[]>(`notification_deliveries?select=id,notification_id,channel,status,delivery_kind,attempt_count,created_at,scheduled_for,attempted_at,sent_at,error_message&company_id=eq.${companyId}&order=created_at.desc&limit=1000`, auth.accessToken),
    supabaseRest<UnreadRow[]>(`notifications?select=id&company_id=eq.${companyId}&user_id=eq.${encodeURIComponent(auth.user.id)}&read_at=is.null&limit=1000`, auth.accessToken),
  ]);
  const notificationIds = [...new Set(deliveries.map((item) => item.notification_id))];
  const notifications = notificationIds.length ? await supabaseRest<NotificationRow[]>(
    `notifications?select=id,title,body,entity_type,entity_id&id=in.(${notificationIds.map(encodeURIComponent).join(",")})&limit=1000`,
    auth.accessToken,
  ) : [];
  const notificationById = new Map(notifications.map((item) => [item.id, item]));
  const items: NotificationDeliveryItem[] = deliveries.map((delivery) => {
    const notification = notificationById.get(delivery.notification_id);
    return {
      id: delivery.id,
      title: notification?.title ?? "Notificação de outro usuário",
      body: notification?.body ?? "O conteúdo permanece privado; o status da entrega está disponível para a administração.",
      href: notification ? entityHref(notification) : "/app/notificacoes",
      channel: delivery.channel,
      status: normalizeStatus(delivery.status),
      deliveryKind: delivery.delivery_kind,
      attemptCount: delivery.attempt_count,
      createdAt: delivery.created_at,
      scheduledFor: delivery.scheduled_for,
      attemptedAt: delivery.attempted_at,
      sentAt: delivery.sent_at,
      errorLabel: delivery.error_message ? friendlyError(delivery.error_message) : null,
    };
  });
  const params = await searchParams;
  const initialFilters: NotificationDeliveryInitialFilters = {
    query: singleParam(params.busca),
    status: singleParam(params.estado),
    kind: singleParam(params.tipo),
  };

  return (
    <AppFrame active="notifications" companyName={context.company.name} userLabel={auth.user.user_metadata?.full_name ?? auth.user.email} notificationCount={unread.length}>
      <div className="app-page notification-deliveries-page">
        <nav className="preference-breadcrumb" aria-label="Navegação estrutural"><Link href="/app/notificacoes">Notificações</Link><span>›</span><span>Entregas</span></nav>
        <div className="app-heading-row delivery-heading">
          <div><span>Alertas / Entregas</span><h1>E-mails e resumos</h1><p>Acompanhe o agendamento, as tentativas e o resultado de cada alerta externo.</p></div>
          <div className="app-primary-actions"><Link className="secondary-action link-action" href="/app/notificacoes/preferencias">⚙ Preferências</Link><Link className="secondary-action link-action" href="/app/notificacoes">← Voltar para a central</Link></div>
        </div>
        <div className="real-data-note"><span>●</span> Histórico protegido de <strong>{context.company.name}</strong>, com deduplicação e até três tentativas automáticas.</div>
        <NotificationDeliveryCenter initialFilters={initialFilters} initialItems={items} />
      </div>
    </AppFrame>
  );
}

function entityHref(notification: NotificationRow) {
  const entity = notification.entity_type?.toLowerCase();
  if (notification.entity_id && ["batch", "lot", "lote"].includes(entity ?? "")) return `/app/validades/${notification.entity_id}`;
  return "/app/notificacoes";
}

function normalizeStatus(value: string): NotificationDeliveryStatus {
  return ["pending", "processing", "sent", "delivered", "failed", "skipped"].includes(value) ? value as NotificationDeliveryStatus : "failed";
}

function friendlyError(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("recipient_email_missing")) return "Destinatário sem e-mail disponível.";
  if (normalized.includes("provider") || normalized.includes("resend")) return "O provedor recusou ou não concluiu o envio.";
  if (normalized.includes("timeout")) return "A tentativa excedeu o tempo de processamento.";
  if (normalized.includes("notification_not_found")) return "A notificação de origem não está mais disponível.";
  return "A tentativa não foi concluída. Você pode reenviar.";
}

function singleParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}
