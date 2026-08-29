import { NextResponse } from "next/server";
import { getPrimaryMembership } from "@/lib/prazor-data";
import { operationErrorMessage } from "@/lib/operation-errors";
import { getAuthState } from "@/lib/supabase/session";
import { supabaseRpc } from "@/lib/supabase/rest";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const outcomes = new Set(["replacement", "credit", "mixed"]);
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
  if (!managerRoles.has(context.membership.role)) {
    return NextResponse.json({ error: "Seu perfil possui acesso somente para consulta." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const exchangeRequestId = String(body.id ?? "");
  const outcome = String(body.outcome ?? "");
  const acceptedQuantity = positiveNumber(body.acceptedQuantity);
  const replacementQuantity = nonNegativeNumber(body.replacementQuantity);
  const replacementUnitValue = nonNegativeNumber(body.replacementUnitValue);
  const creditAmount = nonNegativeNumber(body.creditAmount);
  const notes = String(body.notes ?? "").trim();

  if (!UUID_PATTERN.test(exchangeRequestId)) {
    return NextResponse.json({ error: "Solicitação de troca inválida." }, { status: 400 });
  }
  if (!outcomes.has(outcome)) {
    return NextResponse.json({ error: "Selecione como o fornecedor compensou a troca." }, { status: 400 });
  }
  if (acceptedQuantity === null) {
    return NextResponse.json({ error: "Informe uma quantidade aceita maior que zero." }, { status: 400 });
  }
  if (replacementQuantity === null || replacementUnitValue === null || creditAmount === null) {
    return NextResponse.json({ error: "Informe valores de reposição e crédito válidos." }, { status: 400 });
  }
  if (notes.length > 2000) {
    return NextResponse.json({ error: "As observações devem ter até 2.000 caracteres." }, { status: 400 });
  }

  try {
    const resolutionId = await supabaseRpc<string>("complete_exchange_request", auth.accessToken, {
      p_exchange_request_id: exchangeRequestId,
      p_outcome: outcome,
      p_accepted_quantity: acceptedQuantity,
      p_replacement_quantity: replacementQuantity,
      p_replacement_unit_value: replacementUnitValue,
      p_credit_amount: creditAmount,
      p_notes: notes || null,
    });

    return NextResponse.json({
      ok: true,
      resolutionId,
      next: `/app/fornecedores/trocas?visao=solicitacoes&concluida=${encodeURIComponent(exchangeRequestId)}`,
    });
  } catch (error) {
    return NextResponse.json({ error: operationErrorMessage(error) }, { status: 400 });
  }
}

function positiveNumber(value: unknown) {
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeNumber(value: unknown) {
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
