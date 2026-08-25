import Link from "next/link";
import { redirect } from "next/navigation";
import { AppFrame } from "@/components/app-frame";
import { getAuthState } from "@/lib/supabase/session";
import { getPrimaryMembership } from "@/lib/prazor-data";
import { supabaseRest } from "@/lib/supabase/rest";

export const dynamic = "force-dynamic";

type ExpiryRow = {
  batch_id: string;
  product_name: string;
  sku: string | null;
  batch_code: string | null;
  expiration_date: string;
  days_to_expiry: number;
  expiry_status: "expired" | "critical" | "attention" | "monitoring" | "safe" | "today";
  quantity: number | string;
  inventory_value: number | string;
};

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  severity: string;
  read_at: string | null;
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await getAuthState();
  if (auth.status === "refresh-required") redirect("/api/auth/refresh?return_to=/app");
  if (auth.status !== "authenticated") redirect("/entrar");

  const context = await getPrimaryMembership(auth.user.id, auth.accessToken);
  if (!context) redirect("/onboarding");

  const companyId = encodeURIComponent(context.company.id);
  const [expiryRows, allNotifications] = await Promise.all([
    supabaseRest<ExpiryRow[]>(
      `v_batch_expiry?select=batch_id,product_name,sku,batch_code,expiration_date,days_to_expiry,expiry_status,quantity,inventory_value&company_id=eq.${companyId}&quantity=gt.0&order=days_to_expiry.asc&limit=1000`,
      auth.accessToken,
    ),
    supabaseRest<NotificationRow[]>(
      `notifications?select=id,title,body,severity,read_at&company_id=eq.${companyId}&order=created_at.desc&limit=1000`,
      auth.accessToken,
    ),
  ]);

  const riskRows = expiryRows.filter((row) => ["expired", "today", "critical", "attention"].includes(row.expiry_status));
  const criticalRows = expiryRows.filter((row) => ["expired", "today", "critical"].includes(row.expiry_status));
  const riskValue = riskRows.reduce((sum, row) => sum + Number(row.inventory_value || 0), 0);
  const totalValue = expiryRows.reduce((sum, row) => sum + Number(row.inventory_value || 0), 0);
  const healthyValue = Math.max(0, totalValue - riskValue);
  const healthyPercent = totalValue > 0 ? Math.round((healthyValue / totalValue) * 100) : 100;
  const priorities = expiryRows.slice(0, 6);
  const displayName = auth.user.user_metadata?.full_name?.split(" ")[0] ?? "por aqui";
  const params = await searchParams;
  const entryRegistered = params.entrada === "registrada";
  const unreadNotifications = allNotifications.filter((item) => !item.read_at).length;
  const notifications = allNotifications.slice(0, 4);

  return (
    <AppFrame
      active="dashboard"
      companyName={context.company.name}
      userLabel={auth.user.user_metadata?.full_name ?? auth.user.email}
      notificationCount={unreadNotifications}
      expiryCount={criticalRows.length}
    >
      <div className="app-page">
          <div className="app-heading-row">
            <div><span>Visão geral</span><h1>Bom dia, {displayName}.</h1><p>Estas são as prioridades do seu estoque agora.</p></div>
            <div className="app-primary-actions"><Link className="secondary-action link-action" href="/app/estoque/perdas">! Registrar perda</Link><Link className="secondary-action link-action" href="/app/estoque/movimentar">↔ Movimentar</Link><Link className="primary-action link-action" href="/app/estoque/receber">＋ Registrar entrada</Link></div>
          </div>

          {entryRegistered ? <div className="operation-success-banner"><span>✓</span><div><strong>Entrada registrada com sucesso.</strong><small>O saldo e os indicadores de validade já foram recalculados.</small></div></div> : null}
          <div className="real-data-note"><span>●</span> Painel conectado aos dados reais de <strong>{context.company.name}</strong></div>

          <section className="app-metric-grid" aria-label="Indicadores principais">
            <article className="app-metric danger-metric"><div><span>Valor em risco</span><i>↗</i></div><strong>{currency.format(riskValue)}</strong><small>{riskRows.length} lotes exigem atenção</small></article>
            <article className="app-metric"><div><span>Críticos em até 7 dias</span><i className="orange-signal" /></div><strong>{criticalRows.length}</strong><small>{criticalRows.filter((row) => row.days_to_expiry <= 0).length} vencidos ou vencem hoje</small></article>
            <article className="app-metric"><div><span>Estoque saudável</span><i className="green-signal" /></div><strong>{healthyPercent}%</strong><small>Calculado pelo valor cadastrado</small></article>
            <article className="app-metric"><div><span>Alertas não lidos</span><i className="violet-signal" /></div><strong>{unreadNotifications}</strong><small>Central de notificações ativa</small></article>
          </section>

          <section className="app-dashboard-grid">
            <article className="priority-table-card">
              <div className="app-card-heading"><div><h2>Prioridades de hoje</h2><p>Ordenadas pela proximidade da validade</p></div><Link href="/app/validades">Ver todas →</Link></div>
              {priorities.length ? (
                <div className="priority-table">
                  <div className="priority-table-header"><span>Produto</span><span>Saldo</span><span>Validade</span><span>Em risco</span></div>
                  {priorities.map((row) => (
                    <div className="priority-table-row" key={row.batch_id}>
                      <div className="priority-product"><i className={`status-dot ${statusClass(row.expiry_status)}`} /><span><strong>{row.product_name}</strong><small>{row.batch_code ? `Lote ${row.batch_code}` : row.sku ?? "Sem referência"}</small></span></div>
                      <span>{formatQuantity(row.quantity)} un.</span>
                      <span className={`expiry-chip ${statusClass(row.expiry_status)}`}>{expiryLabel(row.days_to_expiry)}</span>
                      <strong>{currency.format(Number(row.inventory_value || 0))}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="app-empty-state"><span>✓</span><h3>Nenhum lote cadastrado ainda</h3><p>Registre a primeira entrada para ativar as prioridades.</p><Link className="primary-action link-action" href="/app/estoque/receber">Registrar primeiro lote</Link></div>
              )}
            </article>

            <aside className="app-side-column">
              <article className="setup-card">
                <span className="setup-label">Próximo passo</span><h2>Complete a implantação</h2><p>Seu espaço já está seguro e conectado. Agora alimente o primeiro estoque.</p>
                <ul><li className="done">✓ Empresa criada</li><li className="done">✓ Ambiente conectado</li><li className={expiryRows.length ? "done" : ""}>{expiryRows.length ? "✓" : "3"} Cadastrar primeiro lote</li></ul>
                <Link className="primary-action link-action" href={expiryRows.length ? "/app/estoque/movimentar" : "/app/estoque/produtos"}>{expiryRows.length ? "Movimentar estoque" : "Cadastrar produtos"}</Link>
              </article>
              <article className="notification-card"><div className="app-card-heading"><div><h2>Notificações</h2><p>Últimas atualizações</p></div><Link href="/app/notificacoes">Ver todas →</Link></div>
                {notifications.length ? notifications.map((item) => <div className="notification-item" key={item.id}><i className={item.severity} /><span><strong>{item.title}</strong><small>{item.body}</small></span></div>) : <p className="compact-empty">Os alertas aparecerão aqui quando houver lotes para acompanhar.</p>}
              </article>
            </aside>
          </section>
      </div>
    </AppFrame>
  );
}

function formatQuantity(value: number | string) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(Number(value));
}

function statusClass(status: ExpiryRow["expiry_status"]) {
  if (["expired", "today", "critical"].includes(status)) return "critical";
  if (status === "attention") return "attention";
  if (status === "monitoring") return "monitoring";
  return "safe";
}

function expiryLabel(days: number) {
  if (days < 0) return `Vencido há ${Math.abs(days)}d`;
  if (days === 0) return "Vence hoje";
  return `${days} dias`;
}
