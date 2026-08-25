import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { AppFrame } from "@/components/app-frame";
import type { ExpiryStatus } from "@/components/expiry-center";
import { requireAppContext } from "@/lib/app-context";
import { supabaseRest } from "@/lib/supabase/rest";

export const dynamic = "force-dynamic";

type BatchRow = {
  id: string;
  product_id: string;
  supplier_id: string | null;
  batch_code: string | null;
  manufacture_date: string | null;
  expiration_date: string;
  received_at: string | null;
  cost_price: number | string | null;
  status: string;
  created_at: string;
};
type ProductRow = { id: string; name: string; sku: string | null; unit: string; cost_price: number | string | null; sale_price: number | string | null };
type SupplierRow = { id: string; name: string; contact_name: string | null; email: string | null; phone: string | null };
type ExpiryRow = { days_to_expiry: number; expiry_status: ExpiryStatus; quantity: number | string; inventory_value: number | string };
type SettingsRow = { expiry_critical_days: number; expiry_attention_days: number; expiry_monitoring_days: number };
type BalanceRow = { stock_location_id: string; quantity: number | string; updated_at: string };
type LocationRow = { id: string; name: string; branch_id: string; location_type: string };
type BranchRow = { id: string; name: string };
type MovementRow = { id: string; from_location_id: string | null; to_location_id: string | null; movement_type: string; quantity: number | string; reason: string | null; reference_id: string | null; created_at: string };
type LossRow = { id: string; stock_location_id: string; reason_id: string | null; quantity: number | string; total_value: number | string | null; notes: string | null; created_at: string };
type LossReasonRow = { id: string; name: string };
type ExchangeItemRow = { id: string; exchange_request_id: string; stock_location_id: string; quantity: number | string; total_value: number | string | null; created_at: string };
type ExchangeRow = { id: string; status: string; protocol: string | null; requested_at: string | null; created_at: string };
type NotificationRow = { id: string; severity: string; title: string; body: string; read_at: string | null; created_at: string };
type AuditRow = { id: number; action: string; created_at: string };

type TimelineEvent = {
  id: string;
  type: "entry" | "movement" | "loss" | "alert" | "exchange" | "audit";
  title: string;
  description: string;
  meta: string;
  createdAt: string;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const quantity = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

const loadBatchDetail = cache(async (batchId: string) => {
  const returnTo = `/app/validades/${encodeURIComponent(batchId)}`;
  const { auth, context } = await requireAppContext(returnTo);
  const companyId = encodeURIComponent(context.company.id);
  const encodedBatchId = encodeURIComponent(batchId);
  const batches = await supabaseRest<BatchRow[]>(
    `batches?select=id,product_id,supplier_id,batch_code,manufacture_date,expiration_date,received_at,cost_price,status,created_at&company_id=eq.${companyId}&id=eq.${encodedBatchId}&limit=1`,
    auth.accessToken,
  );
  const batch = batches[0] ?? null;

  if (!batch) return { auth, context, batch: null };

  const productId = encodeURIComponent(batch.product_id);
  const supplierPromise = batch.supplier_id
    ? supabaseRest<SupplierRow[]>(`suppliers?select=id,name,contact_name,email,phone&company_id=eq.${companyId}&id=eq.${encodeURIComponent(batch.supplier_id)}&limit=1`, auth.accessToken)
    : Promise.resolve([] as SupplierRow[]);
  const [products, suppliers, expiryRows, settingsRows, balances, locations, branches, movements, losses, lossReasons, exchangeItems, exchanges, notifications, audits] = await Promise.all([
    supabaseRest<ProductRow[]>(`products?select=id,name,sku,unit,cost_price,sale_price&company_id=eq.${companyId}&id=eq.${productId}&limit=1`, auth.accessToken),
    supplierPromise,
    supabaseRest<ExpiryRow[]>(`v_batch_expiry?select=days_to_expiry,expiry_status,quantity,inventory_value&company_id=eq.${companyId}&batch_id=eq.${encodedBatchId}&limit=1`, auth.accessToken),
    supabaseRest<SettingsRow[]>(`company_settings?select=expiry_critical_days,expiry_attention_days,expiry_monitoring_days&company_id=eq.${companyId}&limit=1`, auth.accessToken),
    supabaseRest<BalanceRow[]>(`inventory_balances?select=stock_location_id,quantity,updated_at&company_id=eq.${companyId}&batch_id=eq.${encodedBatchId}&quantity=gt.0&order=quantity.desc&limit=500`, auth.accessToken),
    supabaseRest<LocationRow[]>(`stock_locations?select=id,name,branch_id,location_type&company_id=eq.${companyId}&order=name.asc&limit=500`, auth.accessToken),
    supabaseRest<BranchRow[]>(`branches?select=id,name&company_id=eq.${companyId}&order=name.asc&limit=100`, auth.accessToken),
    supabaseRest<MovementRow[]>(`inventory_movements?select=id,from_location_id,to_location_id,movement_type,quantity,reason,reference_id,created_at&company_id=eq.${companyId}&batch_id=eq.${encodedBatchId}&order=created_at.desc&limit=120`, auth.accessToken),
    supabaseRest<LossRow[]>(`losses?select=id,stock_location_id,reason_id,quantity,total_value,notes,created_at&company_id=eq.${companyId}&batch_id=eq.${encodedBatchId}&order=created_at.desc&limit=120`, auth.accessToken),
    supabaseRest<LossReasonRow[]>(`loss_reasons?select=id,name&company_id=eq.${companyId}&limit=200`, auth.accessToken),
    supabaseRest<ExchangeItemRow[]>(`exchange_request_items?select=id,exchange_request_id,stock_location_id,quantity,total_value,created_at&company_id=eq.${companyId}&batch_id=eq.${encodedBatchId}&order=created_at.desc&limit=100`, auth.accessToken),
    supabaseRest<ExchangeRow[]>(`exchange_requests?select=id,status,protocol,requested_at,created_at&company_id=eq.${companyId}&order=created_at.desc&limit=1000`, auth.accessToken),
    supabaseRest<NotificationRow[]>(`notifications?select=id,severity,title,body,read_at,created_at&company_id=eq.${companyId}&entity_id=eq.${encodedBatchId}&order=created_at.desc&limit=100`, auth.accessToken),
    supabaseRest<AuditRow[]>(`audit_logs?select=id,action,created_at&company_id=eq.${companyId}&entity_id=eq.${encodedBatchId}&order=created_at.desc&limit=100`, auth.accessToken),
  ]);

  return {
    auth,
    context,
    batch,
    product: products[0] ?? null,
    supplier: suppliers[0] ?? null,
    expiry: expiryRows[0] ?? null,
    settings: settingsRows[0] ?? null,
    balances,
    locations,
    branches,
    movements,
    losses,
    lossReasons,
    exchangeItems,
    exchanges,
    notifications,
    audits,
  };
});

export async function generateMetadata({ params }: { params: Promise<{ lote: string }> }): Promise<Metadata> {
  const { lote } = await params;
  const data = await loadBatchDetail(lote);
  const product = data.batch ? data.product : null;
  const reference = data.batch?.batch_code ?? "sem código";
  const title = product ? `${product.name} — lote ${reference} | Prazor` : "Lote não encontrado | Prazor";
  const description = product
    ? `Validade, saldos e histórico operacional do lote ${reference} de ${product.name}.`
    : "Detalhe de lote do controle de validade e estoque Prazor.";

  return {
    title,
    description,
    openGraph: { title, description, images: [] },
    twitter: { card: "summary", title, description, images: [] },
  };
}

export default async function BatchDetailPage({ params }: { params: Promise<{ lote: string }> }) {
  const { lote } = await params;
  const data = await loadBatchDetail(lote);
  const { auth, context, batch } = data;

  if (!batch || !("product" in data) || !data.product) {
    return (
      <AppFrame active="expiry" companyName={context.company.name} userLabel={auth.user.user_metadata?.full_name ?? auth.user.email}>
        <div className="app-page batch-detail-page"><section className="operation-empty-card"><span>?</span><h2>Lote não encontrado</h2><p>Ele pode ter sido arquivado ou não estar disponível no seu escopo de acesso.</p><Link className="primary-action link-action" href="/app/validades">Voltar para validades</Link></section></div>
      </AppFrame>
    );
  }

  const { product, supplier, expiry: storedExpiry, settings, balances, locations, branches, movements, losses, lossReasons, exchangeItems, exchanges, notifications, audits } = data;
  const expiry = storedExpiry ?? {
    days_to_expiry: daysBetweenToday(batch.expiration_date),
    expiry_status: fallbackStatus(batch.expiration_date, settings),
    quantity: balances.reduce((total, balance) => total + Number(balance.quantity), 0),
    inventory_value: 0,
  };
  const branchById = new Map(branches.map((branch) => [branch.id, branch.name]));
  const locationById = new Map(locations.map((location) => [location.id, { ...location, branchName: branchById.get(location.branch_id) ?? "Unidade" }]));
  const reasonById = new Map(lossReasons.map((reason) => [reason.id, reason.name]));
  const exchangeById = new Map(exchanges.map((exchange) => [exchange.id, exchange]));
  const visibleBalances = balances.flatMap((balance) => {
    const location = locationById.get(balance.stock_location_id);
    return location ? [{ ...balance, location, numericQuantity: Number(balance.quantity) }] : [];
  });
  const totalBalance = visibleBalances.reduce((total, balance) => total + balance.numericQuantity, 0);
  const unitCost = Number(batch.cost_price ?? product.cost_price ?? 0);
  const inventoryValue = Number(expiry.inventory_value || totalBalance * unitCost);
  const totalLoss = losses.reduce((total, loss) => total + Number(loss.total_value ?? 0), 0);
  const topSource = visibleBalances[0];
  const actionParams = new URLSearchParams({ lote: batch.id });
  if (topSource) actionParams.set("local", topSource.stock_location_id);
  const exchangeParams = new URLSearchParams({ busca: batch.batch_code ?? product.sku ?? product.name });
  const timeline = buildTimeline({ batch, supplier, product, movements, losses, notifications, audits, exchangeItems, exchangeById, locationById, reasonById });
  const recommendation = actionRecommendation(expiry.expiry_status, expiry.days_to_expiry, Boolean(supplier));

  return (
    <AppFrame active="expiry" companyName={context.company.name} userLabel={auth.user.user_metadata?.full_name ?? auth.user.email} expiryCount={["expired", "today", "critical"].includes(expiry.expiry_status) ? 1 : 0}>
      <div className="app-page batch-detail-page">
        <div className="batch-breadcrumb"><Link href="/app/validades">Validades</Link><span>›</span><span>{product.name}</span><span>›</span><strong>{batch.batch_code ? `Lote ${batch.batch_code}` : "Lote sem código"}</strong></div>

        <section className="batch-hero">
          <div className="batch-hero-copy"><div className="batch-hero-kicker"><span className={`batch-status-pill ${statusClass(expiry.expiry_status)}`}>{statusName(expiry.expiry_status)}</span><span>{expiryLabel(expiry.days_to_expiry)}</span></div><h1>{product.name}</h1><p>{batch.batch_code ? `Lote ${batch.batch_code}` : "Lote sem código"}{product.sku ? ` · SKU ${product.sku}` : ""} · validade em {formatDate(batch.expiration_date)}</p></div>
          <div className="app-primary-actions batch-hero-actions"><Link className="secondary-action link-action" href={`/app/estoque/movimentar?${actionParams}`}>↔ Movimentar</Link><Link className="secondary-action link-action batch-loss-action" href={`/app/estoque/perdas?${actionParams}`}>! Registrar perda</Link><Link className="primary-action link-action" href={`/app/fornecedores/trocas?${exchangeParams}`}>⇄ Solicitar troca</Link></div>
        </section>

        <section className="batch-metric-grid" aria-label="Resumo do lote">
          <article><span>Saldo atual</span><strong>{quantity.format(totalBalance)} {product.unit}</strong><small>Em {visibleBalances.length} {visibleBalances.length === 1 ? "local" : "locais"}</small><i>□</i></article>
          <article><span>Valor no estoque</span><strong>{money.format(inventoryValue)}</strong><small>Custo estimado do saldo</small><i>R$</i></article>
          <article className={expiry.days_to_expiry <= 0 ? "danger" : ""}><span>Prazo restante</span><strong>{daysMetric(expiry.days_to_expiry)}</strong><small>Validade: {formatDate(batch.expiration_date)}</small><i>◷</i></article>
          <article><span>Perdas registradas</span><strong>{money.format(totalLoss)}</strong><small>{losses.length} {losses.length === 1 ? "ocorrência" : "ocorrências"}</small><i>!</i></article>
        </section>

        <section className="batch-detail-layout">
          <div className="batch-main-column">
            <article className="batch-card batch-balance-card">
              <div className="batch-card-heading"><div><span>Distribuição</span><h2>Saldo por localização</h2><p>Quantidade acessível em cada unidade e local de estoque.</p></div><strong>{quantity.format(totalBalance)} {product.unit}</strong></div>
              {visibleBalances.length ? <div className="batch-balance-list">{visibleBalances.map((balance) => {
                const share = totalBalance > 0 ? Math.round((balance.numericQuantity / totalBalance) * 100) : 0;
                const localParams = new URLSearchParams({ lote: batch.id, local: balance.stock_location_id });
                return <div className="batch-balance-row" key={balance.stock_location_id}><div className="batch-location-name"><b>{balance.location.name}</b><small>{balance.location.branchName} · {locationTypeName(balance.location.location_type)}</small></div><div className="batch-balance-progress"><span><i style={{ width: `${share}%` }} /></span><small>{share}% do lote</small></div><strong>{quantity.format(balance.numericQuantity)} {product.unit}</strong><div><Link href={`/app/estoque/movimentar?${localParams}`}>Movimentar</Link><Link href={`/app/estoque/perdas?${localParams}`}>Perda</Link></div></div>;
              })}</div> : <div className="batch-inline-empty"><span>□</span><div><strong>Sem saldo disponível</strong><small>O histórico permanece visível mesmo depois de o saldo chegar a zero.</small></div></div>}
            </article>

            <article className="batch-card batch-timeline-card">
              <div className="batch-card-heading"><div><span>Rastreabilidade</span><h2>Linha do tempo do lote</h2><p>Entradas, movimentos, perdas, alertas, trocas e alterações em ordem cronológica.</p></div><small>{timeline.length} eventos</small></div>
              {timeline.length ? <div className="batch-timeline">{timeline.slice(0, 40).map((event) => <div className="batch-timeline-event" key={event.id}><i className={event.type}>{eventIcon(event.type)}</i><div><span><strong>{event.title}</strong><time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time></span><p>{event.description}</p><small>{event.meta}</small></div></div>)}</div> : <div className="batch-inline-empty"><span>◷</span><div><strong>Nenhum evento disponível</strong><small>As próximas alterações aparecerão nesta linha do tempo.</small></div></div>}
            </article>
          </div>

          <aside className="batch-side-column">
            <article className={`batch-recommendation ${statusClass(expiry.expiry_status)}`}><span>Ação recomendada</span><h2>{recommendation.title}</h2><p>{recommendation.description}</p><div><Link href={`/app/estoque/movimentar?${actionParams}`}>{recommendation.primaryAction}</Link><Link href={`/app/estoque/perdas?${actionParams}`}>Registrar perda</Link></div></article>

            <article className="batch-card batch-data-card"><div className="batch-card-heading"><div><span>Identificação</span><h2>Dados do lote</h2></div></div><dl><div><dt>Código do lote</dt><dd>{batch.batch_code ?? "Não informado"}</dd></div><div><dt>Produto / SKU</dt><dd>{product.name}{product.sku ? ` · ${product.sku}` : ""}</dd></div><div><dt>Fabricação</dt><dd>{batch.manufacture_date ? formatDate(batch.manufacture_date) : "Não informada"}</dd></div><div><dt>Recebimento</dt><dd>{formatDateTime(batch.received_at ?? batch.created_at)}</dd></div><div><dt>Validade</dt><dd>{formatDate(batch.expiration_date)}</dd></div><div><dt>Custo unitário</dt><dd>{money.format(unitCost)}</dd></div><div><dt>Preço de venda</dt><dd>{product.sale_price == null ? "Não informado" : money.format(Number(product.sale_price))}</dd></div><div><dt>Situação cadastral</dt><dd>{batch.status === "active" ? "Ativo" : batch.status}</dd></div></dl></article>

            <article className="batch-card batch-supplier-card"><div className="batch-card-heading"><div><span>Origem</span><h2>Fornecedor</h2></div></div>{supplier ? <div className="batch-supplier-details"><strong>{supplier.name}</strong><p>{supplier.contact_name ?? "Contato não informado"}</p>{supplier.email ? <a href={`mailto:${supplier.email}`}>{supplier.email}</a> : null}{supplier.phone ? <a href={`tel:${supplier.phone}`}>{supplier.phone}</a> : null}</div> : <div className="batch-inline-empty compact"><span>—</span><div><strong>Sem fornecedor vinculado</strong><small>O lote foi recebido sem essa informação.</small></div></div>}</article>

            <article className="batch-card batch-exchange-card"><div className="batch-card-heading"><div><span>Recuperação</span><h2>Trocas vinculadas</h2></div><small>{exchangeItems.length}</small></div>{exchangeItems.length ? <div className="batch-exchange-list">{exchangeItems.map((item) => { const exchange = exchangeById.get(item.exchange_request_id); return <div key={item.id}><span className={`exchange-status ${exchange?.status ?? "pending"}`}>{exchangeStatusName(exchange?.status)}</span><strong>{quantity.format(Number(item.quantity))} {product.unit} · {money.format(Number(item.total_value ?? 0))}</strong><small>{exchange?.protocol ? `Protocolo ${exchange.protocol}` : "Protocolo pendente"} · {formatDateTime(exchange?.requested_at ?? item.created_at)}</small></div>; })}</div> : <p className="batch-card-empty-copy">Nenhuma solicitação de troca está vinculada a este lote.</p>}</article>
          </aside>
        </section>
      </div>
    </AppFrame>
  );
}

function buildTimeline({ batch, supplier, product, movements, losses, notifications, audits, exchangeItems, exchangeById, locationById, reasonById }: {
  batch: BatchRow;
  supplier: SupplierRow | null;
  product: ProductRow;
  movements: MovementRow[];
  losses: LossRow[];
  notifications: NotificationRow[];
  audits: AuditRow[];
  exchangeItems: ExchangeItemRow[];
  exchangeById: Map<string, ExchangeRow>;
  locationById: Map<string, LocationRow & { branchName: string }>;
  reasonById: Map<string, string>;
}) {
  const events: TimelineEvent[] = [{ id: `batch-${batch.id}`, type: "entry", title: "Lote recebido", description: `${product.name} entrou no controle de estoque.`, meta: supplier ? `Fornecedor: ${supplier.name}` : "Fornecedor não informado", createdAt: batch.received_at ?? batch.created_at }];
  const lossIds = new Set(losses.map((loss) => loss.id));

  for (const movement of movements) {
    if (movement.movement_type === "loss" && movement.reference_id && lossIds.has(movement.reference_id)) continue;
    const from = movement.from_location_id ? locationById.get(movement.from_location_id)?.name ?? null : null;
    const to = movement.to_location_id ? locationById.get(movement.to_location_id)?.name ?? null : null;
    events.push({ id: `movement-${movement.id}`, type: "movement", title: movementName(movement.movement_type), description: movement.reason ?? "Movimentação registrada sem observação.", meta: `${movementRoute(from, to)} · ${quantity.format(Number(movement.quantity))} ${product.unit}`, createdAt: movement.created_at });
  }
  for (const loss of losses) {
    const location = locationById.get(loss.stock_location_id)?.name ?? "Local não disponível";
    events.push({ id: `loss-${loss.id}`, type: "loss", title: "Perda registrada", description: loss.reason_id ? reasonById.get(loss.reason_id) ?? "Motivo arquivado" : "Motivo não informado", meta: `${location} · ${quantity.format(Number(loss.quantity))} ${product.unit} · ${money.format(Number(loss.total_value ?? 0))}${loss.notes ? ` · ${loss.notes}` : ""}`, createdAt: loss.created_at });
  }
  for (const notification of notifications) {
    events.push({ id: `notification-${notification.id}`, type: "alert", title: notification.title, description: notification.body, meta: `${severityName(notification.severity)} · ${notification.read_at ? "Lida" : "Não lida"}`, createdAt: notification.created_at });
  }
  for (const item of exchangeItems) {
    const exchange = exchangeById.get(item.exchange_request_id);
    events.push({ id: `exchange-${item.id}`, type: "exchange", title: "Troca com fornecedor", description: exchangeStatusName(exchange?.status), meta: `${quantity.format(Number(item.quantity))} ${product.unit} · ${money.format(Number(item.total_value ?? 0))}${exchange?.protocol ? ` · Protocolo ${exchange.protocol}` : ""}`, createdAt: exchange?.requested_at ?? item.created_at });
  }
  for (const audit of audits) {
    events.push({ id: `audit-${audit.id}`, type: "audit", title: "Cadastro do lote alterado", description: auditActionName(audit.action), meta: "Alteração administrativa registrada na auditoria", createdAt: audit.created_at });
  }
  return events.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function actionRecommendation(status: ExpiryStatus, days: number, hasSupplier: boolean) {
  if (status === "expired") return { title: "Retire este saldo da operação.", description: "O lote está vencido. Separe-o do estoque disponível e registre o destino correto para preservar a rastreabilidade.", primaryAction: "Transferir para quarentena" };
  if (status === "today") return { title: "Decida o destino ainda hoje.", description: "Confirme se o lote pode ser consumido, transferido ou precisa ser baixado antes do fechamento.", primaryAction: "Movimentar agora" };
  if (status === "critical") return { title: hasSupplier ? "Priorize giro ou avalie a troca." : "Priorize o giro deste lote.", description: `Restam ${days} dias. Mova o saldo para o ponto de maior saída e acompanhe a quantidade diariamente.`, primaryAction: "Transferir para outro local" };
  if (status === "attention") return { title: "Planeje a próxima ação.", description: "O lote entrou na faixa de atenção. Antecipe a transferência, promoção ou negociação com o fornecedor.", primaryAction: "Planejar movimentação" };
  return { title: "Mantenha o acompanhamento.", description: "O lote está dentro de uma faixa saudável. Preserve o giro por validade e monitore as próximas mudanças de status.", primaryAction: "Movimentar estoque" };
}

function statusClass(status: ExpiryStatus) {
  if (["expired", "today", "critical"].includes(status)) return "critical";
  if (status === "attention") return "attention";
  if (status === "monitoring") return "monitoring";
  return "safe";
}

function statusName(status: ExpiryStatus) {
  return ({ expired: "Vencido", today: "Vence hoje", critical: "Crítico", attention: "Atenção", monitoring: "Monitoramento", safe: "Saudável" } as Record<ExpiryStatus, string>)[status];
}

function expiryLabel(days: number) {
  if (days < 0) return `Vencido há ${Math.abs(days)} ${Math.abs(days) === 1 ? "dia" : "dias"}`;
  if (days === 0) return "O prazo termina hoje";
  if (days === 1) return "Falta 1 dia";
  return `Faltam ${days} dias`;
}

function daysMetric(days: number) {
  if (days < 0) return `−${Math.abs(days)}d`;
  if (days === 0) return "Hoje";
  return `${days}d`;
}

function daysBetweenToday(value: string) {
  const today = new Date();
  const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((new Date(`${value}T00:00:00Z`).getTime() - utcToday) / 86_400_000);
}

function fallbackStatus(value: string, settings: SettingsRow | null): ExpiryStatus {
  const days = daysBetweenToday(value);
  if (days < 0) return "expired";
  if (days === 0) return "today";
  if (settings && days <= settings.expiry_critical_days) return "critical";
  if (settings && days <= settings.expiry_attention_days) return "attention";
  if (settings && days <= settings.expiry_monitoring_days) return "monitoring";
  return "safe";
}

function movementName(type: string) {
  return ({ entry: "Entrada de estoque", sale: "Saída de estoque", transfer: "Transferência", adjustment_in: "Ajuste positivo", adjustment_out: "Ajuste negativo", return: "Retorno ao estoque", loss: "Baixa por perda", exchange: "Envio para troca" } as Record<string, string>)[type] ?? "Movimentação de estoque";
}

function movementRoute(from: string | null, to: string | null) {
  if (from && to) return `${from} → ${to}`;
  if (from) return `Saída de ${from}`;
  if (to) return `Entrada em ${to}`;
  return "Local não informado";
}

function locationTypeName(type: string) {
  return ({ storage: "Depósito", shelf: "Prateleira", sales_floor: "Área de venda", quarantine: "Quarentena", exchange: "Trocas" } as Record<string, string>)[type] ?? "Local de estoque";
}

function exchangeStatusName(status?: string) {
  if (!status) return "Solicitação em preparação";
  return ({ eligible: "Elegível", preparing: "Em preparação", requested: "Solicitada ao fornecedor", accepted: "Aceita", rejected: "Recusada", collected: "Coletada", sent: "Enviada ao fornecedor", completed: "Concluída", cancelled: "Cancelada" } as Record<string, string>)[status] ?? status;
}

function severityName(severity: string) {
  return ({ critical: "Alerta crítico", warning: "Aviso", info: "Informação" } as Record<string, string>)[severity] ?? "Notificação";
}

function auditActionName(action: string) {
  return ({ INSERT: "Cadastro criado", UPDATE: "Informações atualizadas", DELETE: "Registro removido", batch_updated: "Informações atualizadas" } as Record<string, string>)[action] ?? "Alteração registrada";
}

function eventIcon(type: TimelineEvent["type"]) {
  return ({ entry: "+", movement: "↔", loss: "!", alert: "◷", exchange: "⇄", audit: "✓" } as Record<TimelineEvent["type"], string>)[type];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Recife" }).format(new Date(value));
}
