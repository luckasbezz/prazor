import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import { ExpiryCenter, type ExpiryCenterRow, type ExpiryInitialFilters, type ExpiryLocationFilter, type ExpiryStatus } from "@/components/expiry-center";
import { requireAppContext } from "@/lib/app-context";
import { supabaseRest } from "@/lib/supabase/rest";

export const dynamic = "force-dynamic";

type ExpiryRow = {
  batch_id: string;
  product_id: string;
  product_name: string;
  sku: string | null;
  batch_code: string | null;
  expiration_date: string;
  days_to_expiry: number;
  expiry_status: ExpiryStatus;
  quantity: number | string;
  inventory_value: number | string;
};
type ProductRow = { id: string; unit: string };
type BalanceRow = { batch_id: string; stock_location_id: string; quantity: number | string };
type LocationRow = { id: string; name: string; branch_id: string };
type BranchRow = { id: string; name: string };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default async function ExpiryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { auth, context } = await requireAppContext("/app/validades");
  const companyId = encodeURIComponent(context.company.id);
  const [expiryRows, products, balances, locations, branches] = await Promise.all([
    supabaseRest<ExpiryRow[]>(`v_batch_expiry?select=batch_id,product_id,product_name,sku,batch_code,expiration_date,days_to_expiry,expiry_status,quantity,inventory_value&company_id=eq.${companyId}&quantity=gt.0&order=days_to_expiry.asc&limit=2000`, auth.accessToken),
    supabaseRest<ProductRow[]>(`products?select=id,unit&company_id=eq.${companyId}&active=eq.true&limit=2000`, auth.accessToken),
    supabaseRest<BalanceRow[]>(`inventory_balances?select=batch_id,stock_location_id,quantity&company_id=eq.${companyId}&quantity=gt.0&limit=4000`, auth.accessToken),
    supabaseRest<LocationRow[]>(`stock_locations?select=id,name,branch_id&company_id=eq.${companyId}&active=eq.true&order=name.asc&limit=500`, auth.accessToken),
    supabaseRest<BranchRow[]>(`branches?select=id,name&company_id=eq.${companyId}&active=eq.true&order=name.asc&limit=100`, auth.accessToken),
  ]);

  const unitByProductId = new Map(products.map((product) => [product.id, product.unit]));
  const branchById = new Map(branches.map((branch) => [branch.id, branch.name]));
  const locationFilters: ExpiryLocationFilter[] = locations.map((location) => ({
    id: location.id,
    name: location.name,
    branchName: branchById.get(location.branch_id) ?? "Unidade",
  }));
  const locationById = new Map(locationFilters.map((location) => [location.id, location]));
  const balancesByBatch = new Map<string, BalanceRow[]>();
  for (const balance of balances) {
    const current = balancesByBatch.get(balance.batch_id) ?? [];
    current.push(balance);
    balancesByBatch.set(balance.batch_id, current);
  }

  const rows: ExpiryCenterRow[] = expiryRows.map((row) => ({
    batchId: row.batch_id,
    productName: row.product_name,
    sku: row.sku,
    batchCode: row.batch_code,
    expirationDate: row.expiration_date,
    daysToExpiry: row.days_to_expiry,
    status: row.expiry_status,
    quantity: Number(row.quantity),
    inventoryValue: Number(row.inventory_value),
    unit: unitByProductId.get(row.product_id) ?? "un",
    sources: (balancesByBatch.get(row.batch_id) ?? []).flatMap((balance) => {
      const location = locationById.get(balance.stock_location_id);
      return location ? [{ locationId: location.id, locationName: location.name, branchName: location.branchName, quantity: Number(balance.quantity) }] : [];
    }),
  }));

  const dueNow = rows.filter((row) => row.daysToExpiry <= 0);
  const critical = rows.filter((row) => row.daysToExpiry > 0 && row.status === "critical");
  const attention = rows.filter((row) => row.status === "attention");
  const riskRows = rows.filter((row) => ["expired", "today", "critical", "attention"].includes(row.status));
  const riskValue = riskRows.reduce((total, row) => total + row.inventoryValue, 0);
  const params = await searchParams;
  const initialFilters: ExpiryInitialFilters = {
    query: singleParam(params.busca),
    status: singleParam(params.status),
    locationId: singleParam(params.local),
    sort: singleParam(params.ordem),
  };

  return (
    <AppFrame active="expiry" companyName={context.company.name} userLabel={auth.user.user_metadata?.full_name ?? auth.user.email} expiryCount={dueNow.length + critical.length}>
      <div className="app-page expiry-page">
        <div className="app-heading-row expiry-heading">
          <div><span>Estoque / Validades</span><h1>Central de validades</h1><p>Encontre os lotes que pedem ação e transforme risco em decisão.</p></div>
          <div className="app-primary-actions"><Link className="secondary-action link-action" href="/app/estoque/movimentar">↔ Movimentar</Link><Link className="primary-action link-action" href="/app/estoque/receber">＋ Registrar entrada</Link></div>
        </div>

        <section className="expiry-metric-grid" aria-label="Resumo de validades">
          <article className="expiry-metric expiry-metric-danger"><span>Vencidos ou hoje</span><strong>{dueNow.length}</strong><small>{dueNow.length ? "Exigem decisão imediata" : "Nenhuma urgência imediata"}</small><i>!</i></article>
          <article className="expiry-metric expiry-metric-critical"><span>Faixa crítica</span><strong>{critical.length}</strong><small>Dentro do limite configurado</small><i>◷</i></article>
          <article className="expiry-metric expiry-metric-attention"><span>Em atenção</span><strong>{attention.length}</strong><small>Antecipe a próxima ação</small><i>↗</i></article>
          <article className="expiry-metric expiry-metric-value"><span>Valor em risco</span><strong>{money.format(riskValue)}</strong><small>{riskRows.length} {riskRows.length === 1 ? "lote monitorado" : "lotes monitorados"}</small><i>R$</i></article>
        </section>

        <div className="real-data-note"><span>●</span> Faixas calculadas com as regras de <strong>{context.company.name}</strong> e apenas saldos acessíveis ao seu usuário.</div>
        <ExpiryCenter rows={rows} locations={locationFilters} initialFilters={initialFilters} />
      </div>
    </AppFrame>
  );
}

function singleParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}
