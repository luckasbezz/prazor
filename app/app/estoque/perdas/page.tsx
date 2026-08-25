import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import {
  LossForm,
  type LossBalanceOption,
  type LossBatchOption,
  type LossLocationOption,
} from "@/components/loss-form";
import { requireAppContext } from "@/lib/app-context";
import { supabaseRest } from "@/lib/supabase/rest";

export const dynamic = "force-dynamic";

type ProductRow = { id: string; name: string; sku: string | null; unit: string; cost_price: number | string | null };
type BatchRow = { id: string; product_id: string; batch_code: string | null; expiration_date: string; cost_price: number | string | null; status: string };
type BalanceRow = { batch_id: string; stock_location_id: string; quantity: number | string };
type LocationRow = { id: string; name: string; branch_id: string };
type BranchRow = { id: string; name: string };
type ReasonRow = { id: string; name: string; active: boolean };
type LossRow = {
  id: string;
  batch_id: string;
  stock_location_id: string;
  reason_id: string | null;
  quantity: number | string;
  unit_cost: number | string;
  total_value: number | string | null;
  notes: string | null;
  created_at: string;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default async function LossesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { auth, context } = await requireAppContext("/app/estoque/perdas");
  const companyId = encodeURIComponent(context.company.id);
  const [products, batches, balances, locations, branches, reasons, losses] = await Promise.all([
    supabaseRest<ProductRow[]>(`products?select=id,name,sku,unit,cost_price&company_id=eq.${companyId}&order=name.asc&limit=1000`, auth.accessToken),
    supabaseRest<BatchRow[]>(`batches?select=id,product_id,batch_code,expiration_date,cost_price,status&company_id=eq.${companyId}&order=expiration_date.asc&limit=1000`, auth.accessToken),
    supabaseRest<BalanceRow[]>(`inventory_balances?select=batch_id,stock_location_id,quantity&company_id=eq.${companyId}&quantity=gt.0&order=updated_at.desc&limit=2000`, auth.accessToken),
    supabaseRest<LocationRow[]>(`stock_locations?select=id,name,branch_id&company_id=eq.${companyId}&active=eq.true&order=name.asc&limit=500`, auth.accessToken),
    supabaseRest<BranchRow[]>(`branches?select=id,name&company_id=eq.${companyId}&active=eq.true&order=name.asc&limit=100`, auth.accessToken),
    supabaseRest<ReasonRow[]>(`loss_reasons?select=id,name,active&company_id=eq.${companyId}&active=eq.true&order=name.asc&limit=100`, auth.accessToken),
    supabaseRest<LossRow[]>(`losses?select=id,batch_id,stock_location_id,reason_id,quantity,unit_cost,total_value,notes,created_at&company_id=eq.${companyId}&order=created_at.desc&limit=100`, auth.accessToken),
  ]);

  const productById = new Map(products.map((product) => [product.id, product]));
  const branchById = new Map(branches.map((branch) => [branch.id, branch.name]));
  const locationOptions: LossLocationOption[] = locations.map((location) => ({
    id: location.id,
    name: location.name,
    branchName: branchById.get(location.branch_id) ?? "Unidade",
  }));
  const locationById = new Map(locationOptions.map((location) => [location.id, location]));
  const allBatchOptions: LossBatchOption[] = batches.flatMap((batch) => {
    const product = productById.get(batch.product_id);
    return product ? [{
      id: batch.id,
      productName: product.name,
      sku: product.sku,
      unit: product.unit,
      batchCode: batch.batch_code,
      expirationDate: batch.expiration_date,
    }] : [];
  });
  const batchById = new Map(allBatchOptions.map((batch) => [batch.id, batch]));
  const batchDataById = new Map(batches.map((batch) => [batch.id, batch]));
  const activeBatchIds = new Set(batches.filter((batch) => batch.status === "active").map((batch) => batch.id));
  const activeBatchOptions = allBatchOptions.filter((batch) => activeBatchIds.has(batch.id));
  const balanceOptions: LossBalanceOption[] = balances.flatMap((balance) => {
    const batch = batchDataById.get(balance.batch_id);
    const product = batch ? productById.get(batch.product_id) : null;
    if (!batch || !product || !activeBatchIds.has(batch.id) || !locationById.has(balance.stock_location_id)) return [];
    return [{
      batchId: balance.batch_id,
      locationId: balance.stock_location_id,
      quantity: Number(balance.quantity),
      unitCost: Number(batch.cost_price ?? product.cost_price ?? 0),
    }];
  });
  const reasonById = new Map(reasons.map((reason) => [reason.id, reason.name]));
  const visibleLosses = losses.filter((loss) => batchById.has(loss.batch_id));
  const totalLoss = visibleLosses.reduce((sum, loss) => sum + Number(loss.total_value ?? 0), 0);
  const largestLoss = visibleLosses.reduce((max, loss) => Math.max(max, Number(loss.total_value ?? 0)), 0);
  const topReason = mostFrequentReason(visibleLosses, reasonById);
  const params = await searchParams;
  const lossRegistered = params.perda === "registrada";
  const initialBatchId = typeof params.lote === "string" ? params.lote : undefined;
  const initialLocationId = typeof params.local === "string" ? params.local : undefined;
  const canOverrideCost = ["owner", "admin", "manager"].includes(context.membership.role);

  return (
    <AppFrame active="losses" companyName={context.company.name} userLabel={auth.user.user_metadata?.full_name ?? auth.user.email}>
      <div className="app-page operation-page loss-page">
        <div className="app-heading-row">
          <div><span>Estoque / Perdas e avarias</span><h1>Registrar perda</h1><p>Baixe o saldo afetado e preserve o impacto financeiro de cada ocorrência.</p></div>
          <div className="app-primary-actions"><Link className="secondary-action link-action" href="/app/estoque/movimentar">Movimentações</Link><Link className="secondary-action link-action" href="/app">← Painel</Link></div>
        </div>

        {lossRegistered ? <div className="operation-success-banner"><span>✓</span><div><strong>Perda registrada com sucesso.</strong><small>O saldo, o movimento e o prejuízo financeiro foram atualizados juntos.</small></div></div> : null}

        <section className="loss-metric-grid" aria-label="Resumo de perdas">
          <article className="loss-metric loss-primary-metric"><span>Prejuízo registrado</span><strong>{money.format(totalLoss)}</strong><small>Nos {visibleLosses.length} registros mais recentes</small></article>
          <article className="loss-metric"><span>Ocorrências</span><strong>{visibleLosses.length}</strong><small>Histórico preservado por lote</small></article>
          <article className="loss-metric"><span>Maior ocorrência</span><strong>{money.format(largestLoss)}</strong><small>Maior impacto individual</small></article>
          <article className="loss-metric"><span>Motivo mais frequente</span><strong className="loss-reason-metric">{topReason}</strong><small>Baseado nos registros exibidos</small></article>
        </section>

        {!activeBatchOptions.length || !balanceOptions.length ? (
          <section className="operation-empty-card"><span>!</span><h2>Nenhum saldo disponível para baixa</h2><p>Registre uma entrada de estoque antes de informar perdas ou avarias.</p><Link className="primary-action link-action" href="/app/estoque/receber">Receber estoque</Link></section>
        ) : (
          <section className="loss-layout">
            <article className="operation-panel loss-panel"><LossForm batches={activeBatchOptions} balances={balanceOptions} locations={locationOptions} reasons={reasons} canOverrideCost={canOverrideCost} initialBatchId={initialBatchId} initialLocationId={initialLocationId} /></article>
            <aside className="movement-insight-card loss-insight-card"><span className="setup-label">Rastreabilidade financeira</span><h2>Cada perda precisa explicar o prejuízo.</h2><div className="movement-safety-list"><div><b>01</b><span><strong>Saldo confirmado</strong><small>A quantidade é validada no momento da baixa.</small></span></div><div><b>02</b><span><strong>Custo congelado</strong><small>O valor histórico não muda com preços futuros.</small></span></div><div><b>03</b><span><strong>Motivo comparável</strong><small>As causas padronizadas alimentam os relatórios.</small></span></div></div></aside>
          </section>
        )}

        <section className="loss-history-card">
          <div className="movement-history-heading"><div><span>Histórico financeiro</span><h2>Perdas recentes</h2><p>Baixas auditáveis por produto, lote, motivo e local</p></div><small>{visibleLosses.length} registros</small></div>
          {visibleLosses.length ? (
            <div className="loss-table">
              <div className="loss-table-header"><span>Data</span><span>Produto e lote</span><span>Motivo</span><span>Local</span><span>Quantidade</span><span>Prejuízo</span></div>
              {visibleLosses.map((loss) => {
                const batch = batchById.get(loss.batch_id)!;
                const location = locationById.get(loss.stock_location_id);
                return (
                  <div className="loss-table-row" key={loss.id}>
                    <span className="movement-date"><strong>{formatDate(loss.created_at)}</strong><small>{formatTime(loss.created_at)}</small></span>
                    <span className="movement-product"><strong>{batch.productName}</strong><small>{batch.batchCode ? `Lote ${batch.batchCode}` : batch.sku ?? "Sem referência"}</small></span>
                    <span className="loss-reason"><strong>{loss.reason_id ? reasonById.get(loss.reason_id) ?? "Motivo arquivado" : "Não informado"}</strong><small>{loss.notes ?? "Sem observação"}</small></span>
                    <span>{location?.name ?? "Local arquivado"}</span>
                    <strong>{formatQuantity(loss.quantity)} {batch.unit}</strong>
                    <strong className="loss-value">{money.format(Number(loss.total_value ?? 0))}</strong>
                  </div>
                );
              })}
            </div>
          ) : <div className="movement-history-empty"><span>✓</span><div><strong>Nenhuma perda registrada</strong><small>Seu histórico financeiro começará na primeira baixa.</small></div></div>}
        </section>
      </div>
    </AppFrame>
  );
}

function mostFrequentReason(losses: LossRow[], reasons: Map<string, string>) {
  if (!losses.length) return "Nenhum";
  const counts = new Map<string, number>();
  for (const loss of losses) {
    const label = loss.reason_id ? reasons.get(loss.reason_id) ?? "Motivo arquivado" : "Não informado";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Nenhum";
}

function formatQuantity(value: number | string) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(Number(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Recife" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Recife" }).format(new Date(value));
}
