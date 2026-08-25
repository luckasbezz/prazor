import { NextResponse } from "next/server";
import { getPrimaryMembership } from "@/lib/prazor-data";
import { operationErrorMessage } from "@/lib/operation-errors";
import { supabaseRpc } from "@/lib/supabase/rest";
import { getAuthState } from "@/lib/supabase/session";

const movementTypes = new Set([
  "sale",
  "transfer",
  "adjustment_in",
  "adjustment_out",
  "return",
]);

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
  const movementType = String(body.movementType ?? "");
  const batchId = String(body.batchId ?? "");
  const fromLocationId = optionalId(body.fromLocationId);
  const toLocationId = optionalId(body.toLocationId);
  const reason = String(body.reason ?? "").trim();
  const quantity = requiredPositiveNumber(body.quantity);

  if (!movementTypes.has(movementType)) {
    return NextResponse.json({ error: "Selecione um tipo de movimentação válido." }, { status: 400 });
  }
  if (!batchId) {
    return NextResponse.json({ error: "Selecione o lote que será movimentado." }, { status: 400 });
  }
  if (quantity === null) {
    return NextResponse.json({ error: "Informe uma quantidade maior que zero." }, { status: 400 });
  }
  if (reason.length < 3) {
    return NextResponse.json({ error: "Informe o motivo da movimentação com pelo menos 3 caracteres." }, { status: 400 });
  }

  if (["adjustment_in", "adjustment_out"].includes(movementType) && !managerRoles.has(context.membership.role)) {
    return NextResponse.json({ error: "Somente gestores podem registrar ajustes de estoque." }, { status: 403 });
  }

  const locationError = validateLocations(movementType, fromLocationId, toLocationId);
  if (locationError) {
    return NextResponse.json({ error: locationError }, { status: 400 });
  }

  try {
    const movementId = await supabaseRpc<string>(
      "post_inventory_movement",
      auth.accessToken,
      {
        p_company_id: context.company.id,
        p_batch_id: batchId,
        p_movement_type: movementType,
        p_quantity: quantity,
        p_from_location_id: fromLocationId,
        p_to_location_id: toLocationId,
        p_reason: reason,
        p_reference_type: "manual_stock_movement",
        p_reference_id: null,
      },
    );

    return NextResponse.json({
      ok: true,
      movementId,
      next: "/app/estoque/movimentar?movimento=registrado",
    });
  } catch (error) {
    return NextResponse.json({ error: operationErrorMessage(error) }, { status: 400 });
  }
}

function validateLocations(type: string, from: string | null, to: string | null) {
  if (type === "transfer") {
    if (!from || !to) return "Selecione a origem e o destino da transferência.";
    if (from === to) return "A origem e o destino precisam ser diferentes.";
    return null;
  }

  if (["sale", "adjustment_out"].includes(type)) {
    return from && !to ? null : "Selecione somente o local de origem desta saída.";
  }

  return to && !from ? null : "Selecione somente o local de destino desta entrada.";
}

function optionalId(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function requiredPositiveNumber(value: unknown) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  const parsed = normalized ? Number(normalized) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
