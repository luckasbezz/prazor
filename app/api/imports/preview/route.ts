import { NextResponse } from "next/server";
import { buildImportPreview, hashImportRows, parseImportFile } from "@/lib/import-catalog";
import { getPrimaryMembership } from "@/lib/prazor-data";
import { supabaseRest } from "@/lib/supabase/rest";
import { getAuthState } from "@/lib/supabase/session";

type ProductRow = { id: string; name: string; sku: string | null; active: boolean };
type BarcodeRow = { product_id: string; barcode: string };
type BranchRow = { id: string; name: string };
type LocationRow = { id: string; branch_id: string; name: string };
type SupplierRow = { id: string; name: string };

export async function POST(request: Request) {
  const auth = await getAuthState();
  if (auth.status !== "authenticated") {
    return NextResponse.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  }

  const context = await getPrimaryMembership(auth.user.id, auth.accessToken);
  if (!context) return NextResponse.json({ error: "Conclua a configuração da empresa primeiro." }, { status: 409 });
  if (!["owner", "admin", "manager"].includes(context.membership.role)) {
    return NextResponse.json({ error: "Seu acesso permite consultar, mas não importar produtos." }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Selecione uma planilha CSV ou XLSX." }, { status: 400 });
    }

    const { headers, rows } = await parseImportFile(file);
    const companyId = encodeURIComponent(context.company.id);
    const [products, barcodes, branches, locations, suppliers] = await Promise.all([
      supabaseRest<ProductRow[]>(`products?select=id,name,sku,active&company_id=eq.${companyId}&limit=5000`, auth.accessToken),
      supabaseRest<BarcodeRow[]>(`product_barcodes?select=product_id,barcode&company_id=eq.${companyId}&limit=5000`, auth.accessToken),
      supabaseRest<BranchRow[]>(`branches?select=id,name&company_id=eq.${companyId}&active=eq.true&limit=500`, auth.accessToken),
      supabaseRest<LocationRow[]>(`stock_locations?select=id,branch_id,name&company_id=eq.${companyId}&active=eq.true&limit=2000`, auth.accessToken),
      supabaseRest<SupplierRow[]>(`suppliers?select=id,name&company_id=eq.${companyId}&active=eq.true&limit=2000`, auth.accessToken),
    ]);
    const preview = buildImportPreview(headers, rows, { products, barcodes, branches, locations, suppliers });
    const normalizedRows = preview.rows.map((row) => row.normalized);
    const sourceHash = await hashImportRows(normalizedRows);

    return NextResponse.json({
      ...preview,
      sourceHash,
      filename: file.name,
      totalRows: preview.rows.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível analisar a planilha.";
    return NextResponse.json({ error: safePreviewError(message) }, { status: 400 });
  }
}

function safePreviewError(message: string) {
  if (/^(A planilha|Envie um arquivo|Não foi possível abrir|O XLSX|A primeira aba|Colunas obrigatórias|Cada importação)/.test(message)) return message;
  return "Não foi possível analisar a planilha. Confira o modelo e tente novamente.";
}
