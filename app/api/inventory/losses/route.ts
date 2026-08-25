import { NextResponse } from "next/server";
import { getPrimaryMembership } from "@/lib/prazor-data";
import { operationErrorMessage } from "@/lib/operation-errors";
import { supabaseRpc } from "@/lib/supabase/rest";
import { getAuthState } from "@/lib/supabase/session";

const managerRoles = new Set(["owner", "admin", "manager"]);

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
  const batchId = String(body.batchId ?? "");
  const locationId = String(body.locationId ?? "");
  const reasonId = String(body.reasonId ?? "");
  const notes = String(body.notes ?? "").trim();
  const quantity = requiredPositiveNumber(body.quantity);
  const unitCost = optionalNonNegativeNumber(body.unitCost);

  if (!batchId || !locationId) {
    return NextResponse.json({ error: "Selecione o lote e o local da perda." }, { status: 400 });
  }
  if (!reasonId) {
    return NextResponse.json({ error: "Selecione o motivo da perda ou avaria." }, { status: 400 });
  }
  if (quantity === null) {
    return NextResponse.json({ error: "Informe uma quantidade maior que zero." }, { status: 400 });
  }
  if (notes.length < 3) {
    return NextResponse.json({ error: "Descreva brevemente o que aconteceu." }, { status: 400 });
  }
  if (unitCost === "invalid") {
    return NextResponse.json({ error: "Informe um custo unitário válido." }, { status: 400 });
  }
  if (unitCost !== null && !managerRoles.has(context.membership.role)) {
    return NextResponse.json({ error: "Somente gestores podem alterar o custo calculado da perda." }, { status: 403 });
  }

  try {
    const lossId = await supabaseRpc<string>("record_loss", auth.accessToken, {
      p_company_id: context.company.id,
      p_batch_id: batchId,
      p_stock_location_id: locationId,
      p_quantity: quantity,
      p_reason_id: reasonId,
      p_notes: notes,
      p_unit_cost: unitCost,
    });

    return NextResponse.json({
      ok: true,
      lossId,
      next: "/app/estoque/perdas?perda=registrada",
    });
  } catch (error) {
    return NextResponse.json({ error: operationErrorMessage(error) }, { status: 400 });
  }
}

function requiredPositiveNumber(value: unknown) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  const parsed = normalized ? Number(normalized) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function optionalNonNegativeNumber(value: unknown): number | null | "invalid" {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : "invalid";
}
