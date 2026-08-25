import { NextResponse } from "next/server";
import { getPrimaryMembership } from "@/lib/prazor-data";
import { operationErrorMessage } from "@/lib/operation-errors";
import { getAuthState } from "@/lib/supabase/session";
import { supabaseRpc } from "@/lib/supabase/rest";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const managerRoles = new Set(["owner", "admin", "manager"]);
const statuses = new Set(["preparing", "requested", "accepted", "rejected", "collected", "sent", "completed", "cancelled"]);

export async function POST(request: Request) {
  const session = await operationSession();
  if (session.response) return session.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const supplierId = String(body.supplierId ?? "");
  const batchId = String(body.batchId ?? "");
  const locationId = String(body.locationId ?? "");
  const quantity = positiveNumber(body.quantity);
  const notes = String(body.notes ?? "").trim();

  if (![supplierId, batchId, locationId].every((value) => UUID_PATTERN.test(value))) {
    return NextResponse.json({ error: "Selecione um lote, fornecedor e local válidos." }, { status: 400 });
  }
  if (quantity === null) {
    return NextResponse.json({ error: "Informe uma quantidade maior que zero." }, { status: 400 });
  }
  if (notes.length > 2000) {
    return NextResponse.json({ error: "As observações devem ter até 2.000 caracteres." }, { status: 400 });
  }

  try {
    const exchangeRequestId = await supabaseRpc<string>("create_exchange_request", session.accessToken!, {
      p_company_id: session.companyId,
      p_supplier_id: supplierId,
      p_batch_id: batchId,
      p_stock_location_id: locationId,
      p_quantity: quantity,
      p_unit_value: 0,
      p_notes: notes || null,
    });

    return NextResponse.json({
      ok: true,
      exchangeRequestId,
      next: `/app/fornecedores/trocas?visao=solicitacoes&criada=${encodeURIComponent(exchangeRequestId)}`,
    });
  } catch (error) {
    return NextResponse.json({ error: operationErrorMessage(error) }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const session = await operationSession();
  if (session.response) return session.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const exchangeRequestId = String(body.id ?? "");
  const status = String(body.status ?? "");
  const protocol = String(body.protocol ?? "").trim();

  if (!UUID_PATTERN.test(exchangeRequestId)) {
    return NextResponse.json({ error: "Solicitação de troca inválida." }, { status: 400 });
  }
  if (!statuses.has(status)) {
    return NextResponse.json({ error: "Selecione uma etapa válida para a troca." }, { status: 400 });
  }
  if (protocol.length > 120) {
    return NextResponse.json({ error: "O protocolo deve ter até 120 caracteres." }, { status: 400 });
  }

  try {
    await supabaseRpc<null>("update_exchange_status", session.accessToken!, {
      p_exchange_request_id: exchangeRequestId,
      p_status: status,
      p_protocol: protocol || null,
    });

    return NextResponse.json({
      ok: true,
      next: `/app/fornecedores/trocas?visao=solicitacoes&atualizada=${encodeURIComponent(exchangeRequestId)}`,
    });
  } catch (error) {
    return NextResponse.json({ error: operationErrorMessage(error) }, { status: 400 });
  }
}

async function operationSession() {
  const auth = await getAuthState();
  if (auth.status !== "authenticated") {
    return { response: NextResponse.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 }) };
  }

  const context = await getPrimaryMembership(auth.user.id, auth.accessToken);
  if (!context) {
    return { response: NextResponse.json({ error: "Conclua a configuração da empresa primeiro." }, { status: 409 }) };
  }
  if (!managerRoles.has(context.membership.role)) {
    return { response: NextResponse.json({ error: "Seu perfil possui acesso somente para consulta." }, { status: 403 }) };
  }

  return { response: null, accessToken: auth.accessToken, companyId: context.company.id };
}

function positiveNumber(value: unknown) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  const parsed = normalized ? Number(normalized) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
