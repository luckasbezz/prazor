import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import { ReceiveForm } from "@/components/receive-form";
import { requireAppContext } from "@/lib/app-context";
import { supabaseRest } from "@/lib/supabase/rest";

export const dynamic = "force-dynamic";

type ProductOption = { id: string; name: string; sku: string | null; unit: string; cost_price: number | string | null };
type SimpleOption = { id: string; name: string };
type LocationOption = SimpleOption & { branch_id: string };

export default async function ReceivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { auth, context } = await requireAppContext("/app/estoque/receber");
  const params = await searchParams;
  const selectedProductId = typeof params.produto === "string" ? params.produto : undefined;
  const companyId = encodeURIComponent(context.company.id);
  const [products, suppliers, locations, branches] = await Promise.all([
    supabaseRest<ProductOption[]>(`products?select=id,name,sku,unit,cost_price&company_id=eq.${companyId}&active=eq.true&order=name.asc&limit=500`, auth.accessToken),
    supabaseRest<SimpleOption[]>(`suppliers?select=id,name&company_id=eq.${companyId}&active=eq.true&order=name.asc&limit=500`, auth.accessToken),
    supabaseRest<LocationOption[]>(`stock_locations?select=id,name,branch_id&company_id=eq.${companyId}&active=eq.true&order=name.asc&limit=500`, auth.accessToken),
    supabaseRest<SimpleOption[]>(`branches?select=id,name&company_id=eq.${companyId}&active=eq.true&order=name.asc&limit=100`, auth.accessToken),
  ]);
  const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));
  const locationOptions = locations.map((location) => ({ ...location, branchName: branchNames.get(location.branch_id) ?? "Unidade" }));
  const canManage = ["owner", "admin", "manager"].includes(context.membership.role);

  return (
    <AppFrame active="receive" companyName={context.company.name} userLabel={auth.user.user_metadata?.full_name ?? auth.user.email}>
      <div className="app-page operation-page">
        <div className="app-heading-row">
          <div><span>Estoque / Entrada</span><h1>Receber estoque</h1><p>Registre lote, validade, quantidade e custo em uma única operação.</p></div>
          <div className="app-primary-actions"><Link className="secondary-action link-action" href="/app/estoque/produtos">Ver produtos</Link><Link className="secondary-action link-action" href="/app">← Painel</Link></div>
        </div>

        {!products.length ? (
          <section className="operation-empty-card"><span>1</span><h2>Cadastre um produto primeiro</h2><p>A entrada precisa estar vinculada a um produto ativo.</p><Link className="primary-action link-action" href="/app/estoque/produtos">Cadastrar primeiro produto</Link></section>
        ) : !canManage ? (
          <section className="operation-empty-card"><span>!</span><h2>Entrada disponível para gestores</h2><p>Seu perfil pode consultar o estoque, mas não publicar recebimentos.</p><Link className="secondary-action link-action" href="/app">Voltar ao painel</Link></section>
        ) : (
          <section className="receive-layout">
            <article className="operation-panel receive-panel"><ReceiveForm products={products} suppliers={suppliers} locations={locationOptions} selectedProductId={selectedProductId} /></article>
            <aside className="receive-summary-card"><span className="setup-label">O que acontece ao confirmar</span><h2>Três registros, uma transação.</h2><ol><li><b>1</b><div><strong>Lote identificado</strong><small>O Prazor cria ou reaproveita o mesmo lote.</small></div></li><li><b>2</b><div><strong>Movimento de entrada</strong><small>Usuário, horário e destino ficam registrados.</small></div></li><li><b>3</b><div><strong>Saldo atualizado</strong><small>O painel recalcula validade e valor em risco.</small></div></li></ol></aside>
          </section>
        )}
      </div>
    </AppFrame>
  );
}
