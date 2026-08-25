import { NextResponse } from "next/server";
import { getAuthState } from "@/lib/supabase/session";
import { getPrimaryMembership } from "@/lib/prazor-data";
import { supabaseRpc } from "@/lib/supabase/rest";
import { operationErrorMessage } from "@/lib/operation-errors";

export async function POST(request: Request) {
  const auth = await getAuthState();
  if (auth.status !== "authenticated") {
    return NextResponse.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  }

  const context = await getPrimaryMembership(auth.user.id, auth.accessToken);
  if (!context) {
    return NextResponse.json({ error: "Conclua a configuração da empresa primeiro." }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  const sku = optionalText(body.sku);
  const barcode = optionalText(body.barcode);
  const unit = String(body.unit ?? "un").trim().toLowerCase();
  const costPrice = optionalNumber(body.costPrice);
  const salePrice = optionalNumber(body.salePrice);

  if (name.length < 2) {
    return NextResponse.json({ error: "Informe o nome completo do produto." }, { status: 400 });
  }
  if (costPrice === "invalid" || salePrice === "invalid") {
    return NextResponse.json({ error: "Informe preços válidos." }, { status: 400 });
  }

  try {
    const productId = await supabaseRpc<string>(
      "create_product_with_barcode",
      auth.accessToken,
      {
        p_company_id: context.company.id,
        p_name: name,
        p_sku: sku,
        p_barcode: barcode,
        p_unit: unit,
        p_cost_price: costPrice,
        p_sale_price: salePrice,
        p_category_id: null,
        p_brand_id: null,
        p_description: optionalText(body.description),
      },
    );

    return NextResponse.json({ ok: true, productId, next: `/app/estoque/receber?produto=${productId}` });
  } catch (error) {
    return NextResponse.json({ error: operationErrorMessage(error) }, { status: 400 });
  }
}

function optionalText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function optionalNumber(value: unknown): number | null | "invalid" {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : "invalid";
}
