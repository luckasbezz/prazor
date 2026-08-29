import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import { ImportCenter } from "@/components/import-center";
import { requireAppContext } from "@/lib/app-context";
import { supabaseRest } from "@/lib/supabase/rest";

export const dynamic = "force-dynamic";

type ImportRow = {
  id: string;
  filename: string;
  status: string;
  total_rows: number;
  created_products: number;
  updated_products: number;
  received_lots: number;
  created_at: string;
};

export default async function ImportsPage() {
  const { auth, context } = await requireAppContext("/app/importacoes");
  const imports = await supabaseRest<ImportRow[]>(
    `imports?select=id,filename,status,total_rows,created_products,updated_products,received_lots,created_at&company_id=eq.${encodeURIComponent(context.company.id)}&order=created_at.desc&limit=12`,
    auth.accessToken,
  );
  const canManage = ["owner", "admin", "manager"].includes(context.membership.role);

  return (
    <AppFrame active="imports" companyName={context.company.name} userLabel={auth.user.user_metadata?.full_name ?? auth.user.email}>
      <div className="app-page import-page">
        <div className="app-heading-row">
          <div><span>Catálogo / Importações</span><h1>Importar produtos e lotes</h1><p>Confira a planilha inteira antes de criar produtos ou alterar o estoque.</p></div>
          <div className="app-primary-actions"><Link className="secondary-action link-action" href="/app/estoque/produtos">Ver produtos</Link><Link className="secondary-action link-action" href="/app">← Painel</Link></div>
        </div>
        <ImportCenter
          canManage={canManage}
          history={imports.map((item) => ({ id: item.id, filename: item.filename, status: item.status, totalRows: item.total_rows, createdProducts: item.created_products, updatedProducts: item.updated_products, receivedLots: item.received_lots, createdAt: item.created_at }))}
        />
      </div>
    </AppFrame>
  );
}
