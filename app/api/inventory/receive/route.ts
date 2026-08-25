import { NextResponse } from "next/server";
import { getAuthState } from "@/lib/supabase/session";
import { getPrimaryMembership } from "@/lib/prazor-data";
import { supabaseRpc } from "@/lib/supabase/rest";
import { operationErrorMessage } from "@/lib/operation-errors";

type ReceiveResult = {
  batch_id: string;
  movement_id: string;
  created_batch: boolean;
};

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
  const productId = String(body.productId ?? "");
  const locationId = String(body.locationId ?? "");
  const batchCode = String(body.batchCode ?? "").trim();
  const expirationDate = String(body.expirationDate ?? "");
  const manufactureDate = String(body.manufactureDate ?? "").trim() || null;
  const supplierId = String(body.supplierId ?? "").trim() || null;
  const quantity = requiredPositiveNumber(body.quantity);
  const costPrice = requiredNonNegativeNumber(body.costPrice);

  if (!productId || !locationId || !batchCode || !expirationDate) {
    return NextResponse.json({ error: "Preencha produto, lote, validade e local de estoque." }, { status: 400 });
  }
  if (quantity === null) {
    return NextResponse.json({ error: "Informe uma quantidade maior que zero." }, { status: 400 });
  }
  if (costPrice === null) {
    return NextResponse.json({ error: "Informe um custo válido para o lote." }, { status: 400 });
  }

  try {
    const result = await supabaseRpc<ReceiveResult>(
      "receive_inventory_lot",
      auth.accessToken,
      {
        p_company_id: context.company.id,
        p_product_id: productId,
        p_stock_location_id: locationId,
        p_batch_code: batchCode,
        p_expiration_date: expirationDate,
        p_quantity: quantity,
        p_cost_price: costPrice,
        p_supplier_id: supplierId,
        p_manufacture_date: manufactureDate,
      },
    );

    return NextResponse.json({
      ok: true,
      batchId: result.batch_id,
      movementId: result.movement_id,
      next: "/app?entrada=registrada",
    });
  } catch (error) {
    return NextResponse.json({ error: operationErrorMessage(error) }, { status: 400 });
  }
}

function normalizedNumber(value: unknown) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  return normalized ? Number(normalized) : Number.NaN;
}

function requiredPositiveNumber(value: unknown) {
  const parsed = normalizedNumber(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function requiredNonNegativeNumber(value: unknown) {
  const parsed = normalizedNumber(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
