import { NextResponse } from "next/server";
import { getPrimaryMembership } from "@/lib/prazor-data";
import { getAuthState } from "@/lib/supabase/session";
import { supabaseRest } from "@/lib/supabase/rest";

type AgreementRow = {
  id: string;
  supplier_id: string;
  title: string;
  agreement_code: string | null;
  minimum_days_before_expiration: number;
  exchange_outcome: "replacement" | "credit" | "either";
  requires_invoice: boolean;
  requires_photos: boolean;
  requires_prior_authorization: boolean;
  freight_responsibility: "supplier" | "company" | "shared";
  notes: string | null;
  active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
};
type SupplierIdRow = { id: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const outcomes = new Set(["replacement", "credit", "either"]);
const freightOptions = new Set(["supplier", "company", "shared"]);
const selectFields = "id,supplier_id,title,agreement_code,minimum_days_before_expiration,exchange_outcome,requires_invoice,requires_photos,requires_prior_authorization,freight_responsibility,notes,active,valid_from,valid_until,created_at,updated_at";

export async function POST(request: Request) {
  return saveAgreement(request, "create");
}

export async function PATCH(request: Request) {
  return saveAgreement(request, "update");
}

async function saveAgreement(request: Request, mode: "create" | "update") {
  const auth = await getAuthState();
  if (auth.status !== "authenticated") {
    return NextResponse.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  }

  const context = await getPrimaryMembership(auth.user.id, auth.accessToken);
  if (!context) {
    return NextResponse.json({ error: "Conclua a configuração da empresa primeiro." }, { status: 409 });
  }
  if (!canManage(context.membership.role)) {
    return NextResponse.json({ error: "Seu perfil possui acesso somente para consulta." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const agreementId = String(body.id ?? "");
  const supplierId = String(body.supplierId ?? "");
  if (mode === "update" && !UUID_PATTERN.test(agreementId)) {
    return NextResponse.json({ error: "Acordo inválido." }, { status: 400 });
  }
  if (!UUID_PATTERN.test(supplierId)) {
    return NextResponse.json({ error: "Selecione um fornecedor válido." }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const agreementCode = optionalText(body.agreementCode);
  const minimumDays = Number(body.minimumDays);
  const exchangeOutcome = String(body.exchangeOutcome ?? "");
  const freightResponsibility = String(body.freightResponsibility ?? "");
  const validFrom = optionalDate(body.validFrom);
  const validUntil = optionalDate(body.validUntil);
  const notes = optionalText(body.notes);
  const active = typeof body.active === "boolean" ? body.active : true;

  if (title.length < 3 || title.length > 120) {
    return NextResponse.json({ error: "Informe um título entre 3 e 120 caracteres." }, { status: 400 });
  }
  if ((agreementCode?.length ?? 0) > 60) {
    return NextResponse.json({ error: "O código do acordo deve ter até 60 caracteres." }, { status: 400 });
  }
  if (!Number.isInteger(minimumDays) || minimumDays < 0 || minimumDays > 365) {
    return NextResponse.json({ error: "A antecedência deve estar entre 0 e 365 dias." }, { status: 400 });
  }
  if (!outcomes.has(exchangeOutcome) || !freightOptions.has(freightResponsibility)) {
    return NextResponse.json({ error: "Revise a forma de compensação e a responsabilidade pelo frete." }, { status: 400 });
  }
  if (validFrom === "invalid" || validUntil === "invalid" || (validFrom && validUntil && validUntil < validFrom)) {
    return NextResponse.json({ error: "A data final deve ser igual ou posterior à data inicial." }, { status: 400 });
  }
  if ((notes?.length ?? 0) > 2000) {
    return NextResponse.json({ error: "As observações devem ter até 2.000 caracteres." }, { status: 400 });
  }

  try {
    const suppliers = await supabaseRest<SupplierIdRow[]>(
      `suppliers?select=id&id=eq.${encodeURIComponent(supplierId)}&company_id=eq.${encodeURIComponent(context.company.id)}&limit=1`,
      auth.accessToken,
    );
    if (!suppliers[0]) return NextResponse.json({ error: "Fornecedor não encontrado nesta empresa." }, { status: 404 });

    const payload = {
      company_id: context.company.id,
      supplier_id: supplierId,
      title,
      agreement_code: agreementCode,
      minimum_days_before_expiration: minimumDays,
      exchange_outcome: exchangeOutcome,
      requires_invoice: Boolean(body.requiresInvoice),
      requires_photos: Boolean(body.requiresPhotos),
      requires_prior_authorization: Boolean(body.requiresPriorAuthorization),
      freight_responsibility: freightResponsibility,
      notes,
      active,
      valid_from: validFrom,
      valid_until: validUntil,
      updated_by: auth.user.id,
      ...(mode === "create" ? { created_by: auth.user.id } : {}),
    };
    const path = mode === "create"
      ? `supplier_agreements?select=${selectFields}`
      : `supplier_agreements?select=${selectFields}&id=eq.${encodeURIComponent(agreementId)}&company_id=eq.${encodeURIComponent(context.company.id)}`;
    const saved = await supabaseRest<AgreementRow[]>(path, auth.accessToken, {
      method: mode === "create" ? "POST" : "PATCH",
      body: payload,
      prefer: "return=representation",
    });
    if (!saved[0]) return NextResponse.json({ error: "Acordo não encontrado no seu acesso." }, { status: 404 });
    return NextResponse.json({ ok: true, agreement: toAgreement(saved[0]) });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("active agreement requires active supplier")) {
      return NextResponse.json({ error: "Reative o fornecedor antes de ativar este acordo." }, { status: 409 });
    }
    if (message.includes("supplier_agreements_one_active_per_supplier_uidx") || message.includes("duplicate")) {
      return NextResponse.json({ error: "Este fornecedor já possui um acordo ativo. Encerre-o antes de ativar outro." }, { status: 409 });
    }
    return NextResponse.json({ error: "Não foi possível salvar o acordo agora." }, { status: 400 });
  }
}

function toAgreement(row: AgreementRow) {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    title: row.title,
    agreementCode: row.agreement_code,
    minimumDays: row.minimum_days_before_expiration,
    exchangeOutcome: row.exchange_outcome,
    requiresInvoice: row.requires_invoice,
    requiresPhotos: row.requires_photos,
    requiresPriorAuthorization: row.requires_prior_authorization,
    freightResponsibility: row.freight_responsibility,
    notes: row.notes,
    active: row.active,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function optionalText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function optionalDate(value: unknown): string | null | "invalid" {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  if (!DATE_PATTERN.test(normalized) || Number.isNaN(new Date(`${normalized}T00:00:00Z`).getTime())) return "invalid";
  return normalized;
}

function canManage(role: string) {
  return ["owner", "admin", "manager"].includes(role);
}
