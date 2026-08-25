import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import { ProductForm } from "@/components/product-form";
import { requireAppContext } from "@/lib/app-context";
import { supabaseRest } from "@/lib/supabase/rest";

export const dynamic = "force-dynamic";

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  cost_price: number | string | null;
  sale_price: number | string | null;
  active: boolean;
};

type BarcodeRow = { product_id: string; barcode: string };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default async function ProductsPage() {
  const { auth, context } = await requireAppContext("/app/estoque/produtos");
  const companyId = encodeURIComponent(context.company.id);
  const [products, barcodes] = await Promise.all([
    supabaseRest<ProductRow[]>(`products?select=id,name,sku,unit,cost_price,sale_price,active&company_id=eq.${companyId}&order=name.asc&limit=500`, auth.accessToken),
    supabaseRest<BarcodeRow[]>(`product_barcodes?select=product_id,barcode&company_id=eq.${companyId}&is_primary=eq.true`, auth.accessToken),
  ]);
  const barcodeByProduct = new Map(barcodes.map((item) => [item.product_id, item.barcode]));
  const canManage = ["owner", "admin", "manager"].includes(context.membership.role);

  return (
    <AppFrame active="products" companyName={context.company.name} userLabel={auth.user.user_metadata?.full_name ?? auth.user.email}>
      <div className="app-page operation-page">
        <div className="app-heading-row">
          <div><span>Estoque / Produtos</span><h1>Catálogo de produtos</h1><p>Cadastre os itens que serão controlados por lote e validade.</p></div>
          <div className="app-primary-actions"><Link className="secondary-action link-action" href="/app">← Voltar ao painel</Link><Link className="primary-action link-action" href="/app/estoque/receber">Receber estoque</Link></div>
        </div>

        <section className="catalog-layout">
          <article className="catalog-card">
            <div className="catalog-card-heading"><div><h2>Produtos cadastrados</h2><p>{products.length} {products.length === 1 ? "produto" : "produtos"} nesta empresa</p></div></div>
            {products.length ? (
              <div className="catalog-table">
                <div className="catalog-table-header"><span>Produto</span><span>Código</span><span>Unidade</span><span>Custo</span><span>Situação</span></div>
                {products.map((product) => (
                  <div className="catalog-table-row" key={product.id}>
                    <div><strong>{product.name}</strong><small>{product.sku ?? "Sem SKU"}</small></div>
                    <span>{barcodeByProduct.get(product.id) ?? "—"}</span>
                    <span>{product.unit}</span>
                    <span>{product.cost_price === null ? "—" : money.format(Number(product.cost_price))}</span>
                    <span className={product.active ? "status-active" : "status-inactive"}>{product.active ? "Ativo" : "Inativo"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="catalog-empty"><span>□</span><h3>Seu catálogo começa aqui</h3><p>Cadastre o primeiro produto ao lado. Em seguida, você poderá receber seu primeiro lote.</p></div>
            )}
          </article>

          <aside className="operation-panel">
            {canManage ? <ProductForm /> : <div className="permission-card"><span>Somente leitura</span><h2>Seu acesso permite consultar produtos.</h2><p>Solicite a um gerente o cadastro de novos itens.</p></div>}
          </aside>
        </section>
      </div>
    </AppFrame>
  );
}
