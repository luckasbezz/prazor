import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import {
  MovementForm,
  type MovementBalanceOption,
  type MovementBatchOption,
  type MovementLocationOption,
} from "@/components/movement-form";
import { requireAppContext } from "@/lib/app-context";
import { supabaseRest } from "@/lib/supabase/rest";

export const dynamic = "force-dynamic";

type ProductRow = { id: string; name: string; sku: string | null; unit: string };
type BatchRow = { id: string; product_id: string; batch_code: string | null; expiration_date: string; status: string };
type BalanceRow = { batch_id: string; stock_location_id: string; quantity: number | string };
type LocationRow = { id: string; name: string; branch_id: string };
type BranchRow = { id: string; name: string };
type MovementRow = {
  id: string;
  batch_id: string;
  from_location_id: string | null;
  to_location_id: string | null;
  movement_type: string;
  quantity: number | string;
  reason: string | null;
  created_at: string;
};

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { auth, context } = await requireAppContext("/app/estoque/movimentar");
  const companyId = encodeURIComponent(context.company.id);
  const [products, batches, balances, locations, branches, movements] = await Promise.all([
    supabaseRest<ProductRow[]>(`products?select=id,name,sku,unit&company_id=eq.${companyId}&order=name.asc&limit=1000`, auth.accessToken),
    supabaseRest<BatchRow[]>(`batches?select=id,product_id,batch_code,expiration_date,status&company_id=eq.${companyId}&order=expiration_date.asc&limit=1000`, auth.accessToken),
    supabaseRest<BalanceRow[]>(`inventory_balances?select=batch_id,stock_location_id,quantity&company_id=eq.${companyId}&quantity=gt.0&order=updated_at.desc&limit=2000`, auth.accessToken),
    supabaseRest<LocationRow[]>(`stock_locations?select=id,name,branch_id&company_id=eq.${companyId}&active=eq.true&order=name.asc&limit=500`, auth.accessToken),
    supabaseRest<BranchRow[]>(`branches?select=id,name&company_id=eq.${companyId}&active=eq.true&order=name.asc&limit=100`, auth.accessToken),
    supabaseRest<MovementRow[]>(`inventory_movements?select=id,batch_id,from_location_id,to_location_id,movement_type,quantity,reason,created_at&company_id=eq.${companyId}&order=created_at.desc&limit=80`, auth.accessToken),
  ]);

  const productById = new Map(products.map((product) => [product.id, product]));
  const branchById = new Map(branches.map((branch) => [branch.id, branch.name]));
  const locationOptions: MovementLocationOption[] = locations.map((location) => ({
    id: location.id,
    name: location.name,
    branchName: branchById.get(location.branch_id) ?? "Unidade",
  }));
  const locationById = new Map(locationOptions.map((location) => [location.id, location]));
  const allBatchOptions: MovementBatchOption[] = batches.flatMap((batch) => {
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
  const activeBatchIds = new Set(batches.filter((batch) => batch.status === "active").map((batch) => batch.id));
  const batchOptions = allBatchOptions.filter((batch) => activeBatchIds.has(batch.id));
  const batchById = new Map(allBatchOptions.map((batch) => [batch.id, batch]));
  const balanceOptions: MovementBalanceOption[] = balances
    .filter((balance) => activeBatchIds.has(balance.batch_id) && batchById.has(balance.batch_id) && locationById.has(balance.stock_location_id))
    .map((balance) => ({
      batchId: balance.batch_id,
      locationId: balance.stock_location_id,
      quantity: Number(balance.quantity),
    }));
  const visibleMovements = movements.filter((movement) => batchById.has(movement.batch_id));
  const params = await searchParams;
  const movementRegistered = params.movimento === "registrado";
  const initialBatchId = typeof params.lote === "string" ? params.lote : undefined;
  const initialLocationId = typeof params.local === "string" ? params.local : undefined;
  const canAdjust = ["owner", "admin", "manager"].includes(context.membership.role);

  return (
    <AppFrame active="movements" companyName={context.company.name} userLabel={auth.user.user_metadata?.full_name ?? auth.user.email}>
      <div className="app-page operation-page">
        <div className="app-heading-row">
          <div><span>Estoque / Movimentações</span><h1>Movimentar estoque</h1><p>Registre saídas, transferências, ajustes e retornos sem perder a rastreabilidade.</p></div>
          <div className="app-primary-actions"><Link className="secondary-action link-action" href="/app/estoque/receber">Receber estoque</Link><Link className="secondary-action link-action" href="/app">← Painel</Link></div>
        </div>

        {movementRegistered ? <div className="operation-success-banner"><span>✓</span><div><strong>Movimentação registrada com sucesso.</strong><small>O saldo e o histórico operacional já foram atualizados.</small></div></div> : null}

        {!batchOptions.length ? (
          <section className="operation-empty-card"><span>↔</span><h2>Receba um lote antes de movimentar</h2><p>As movimentações precisam estar vinculadas a um lote ativo.</p><Link className="primary-action link-action" href="/app/estoque/receber">Registrar primeira entrada</Link></section>
        ) : (
          <section className="movement-layout">
            <article className="operation-panel movement-panel"><MovementForm batches={batchOptions} balances={balanceOptions} locations={locationOptions} canAdjust={canAdjust} initialBatchId={initialBatchId} initialLocationId={initialLocationId} /></article>
            <aside className="movement-insight-card">
              <span className="setup-label">Controle operacional</span><h2>O saldo muda. O histórico permanece.</h2>
              <div className="movement-safety-list"><div><b>01</b><span><strong>Sem saldo negativo</strong><small>A saída só confirma quando a quantidade está disponível.</small></span></div><div><b>02</b><span><strong>Transferência atômica</strong><small>Origem e destino são atualizados juntos.</small></span></div><div><b>03</b><span><strong>Autoria preservada</strong><small>Data, quantidade e motivo ficam registrados.</small></span></div></div>
            </aside>
          </section>
        )}

        <section className="movement-history-card">
          <div className="movement-history-heading"><div><span>Histórico operacional</span><h2>Movimentações recentes</h2><p>{visibleMovements.length} {visibleMovements.length === 1 ? "registro encontrado" : "registros encontrados"}</p></div><small>Atualizado em tempo real</small></div>
          {visibleMovements.length ? (
            <div className="movement-table">
              <div className="movement-table-header"><span>Data</span><span>Tipo</span><span>Produto e lote</span><span>Origem / destino</span><span>Quantidade</span></div>
              {visibleMovements.map((movement) => {
                const batch = batchById.get(movement.batch_id)!;
                const from = movement.from_location_id ? locationById.get(movement.from_location_id) : null;
                const to = movement.to_location_id ? locationById.get(movement.to_location_id) : null;
                return (
                  <div className="movement-table-row" key={movement.id}>
                    <span className="movement-date"><strong>{formatDate(movement.created_at)}</strong><small>{formatTime(movement.created_at)}</small></span>
                    <span className={`movement-type ${movementClass(movement.movement_type)}`}>{movementLabel(movement.movement_type)}</span>
                    <span className="movement-product"><strong>{batch.productName}</strong><small>{batch.batchCode ? `Lote ${batch.batchCode}` : batch.sku ?? "Sem referência"}</small></span>
                    <span className="movement-route"><strong>{routeLabel(from?.name, to?.name)}</strong><small>{movement.reason ?? "Sem observação"}</small></span>
                    <strong className="movement-quantity">{quantitySignal(movement.movement_type)}{formatQuantity(movement.quantity)} {batch.unit}</strong>
                  </div>
                );
              })}
            </div>
          ) : <div className="movement-history-empty"><span>↔</span><div><strong>Nenhuma movimentação registrada</strong><small>Entradas, saídas e transferências aparecerão aqui.</small></div></div>}
        </section>
      </div>
    </AppFrame>
  );
}

function movementLabel(type: string) {
  return ({ entry: "Entrada", sale: "Saída", transfer: "Transferência", adjustment_in: "Ajuste +", adjustment_out: "Ajuste −", return: "Retorno", loss: "Perda", exchange: "Troca" } as Record<string, string>)[type] ?? "Movimento";
}

function movementClass(type: string) {
  if (["entry", "adjustment_in", "return"].includes(type)) return "inbound";
  if (type === "transfer") return "transfer";
  if (["loss", "adjustment_out"].includes(type)) return "loss";
  return "outbound";
}

function quantitySignal(type: string) {
  return ["entry", "adjustment_in", "return"].includes(type) ? "+" : type === "transfer" ? "" : "−";
}

function routeLabel(from?: string, to?: string) {
  if (from && to) return `${from} → ${to}`;
  if (from) return `De ${from}`;
  if (to) return `Para ${to}`;
  return "Local não informado";
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
