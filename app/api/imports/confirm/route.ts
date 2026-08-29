import { NextResponse } from "next/server";
import { hashImportRows, type ImportNormalizedRow } from "@/lib/import-catalog";
import { operationErrorMessage } from "@/lib/operation-errors";
import { getPrimaryMembership } from "@/lib/prazor-data";
import { supabaseRpc } from "@/lib/supabase/rest";
import { getAuthState } from "@/lib/supabase/session";

type ImportResult = {
  importId: string;
  totalRows: number;
  createdProducts: number;
  updatedProducts: number;
  receivedLots: number;
  duplicate: boolean;
};

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

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const filename = String(body.filename ?? "").trim();
  const rows = Array.isArray(body.rows) ? body.rows as ImportNormalizedRow[] : [];
  const mapping = body.mapping && typeof body.mapping === "object" && !Array.isArray(body.mapping) ? body.mapping : {};
  if (!filename || filename.length > 180 || rows.length < 1 || rows.length > 500) {
    return NextResponse.json({ error: "A prévia expirou ou contém dados inválidos. Analise a planilha novamente." }, { status: 400 });
  }

  try {
    const sourceHash = await hashImportRows(rows);
    const result = await supabaseRpc<ImportResult>("import_catalog_inventory", auth.accessToken, {
      p_company_id: context.company.id,
      p_filename: filename,
      p_source_hash: sourceHash,
      p_rows: rows,
      p_mapping: mapping,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: operationErrorMessage(error) }, { status: 400 });
  }
}
