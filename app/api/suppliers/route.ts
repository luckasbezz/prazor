import { NextResponse } from "next/server";
import { getPrimaryMembership } from "@/lib/prazor-data";
import { getAuthState } from "@/lib/supabase/session";
import { supabaseRest } from "@/lib/supabase/rest";

type SupplierRow = {
  id: string;
  name: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  contact_name: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const selectFields = "id,name,tax_id,email,phone,contact_name,notes,active,created_at,updated_at";

export async function POST(request: Request) {
  return saveSupplier(request, "create");
}

export async function PATCH(request: Request) {
  return saveSupplier(request, "update");
}

async function saveSupplier(request: Request, mode: "create" | "update") {
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
  const supplierId = String(body.id ?? "");
  if (mode === "update" && !UUID_PATTERN.test(supplierId)) {
    return NextResponse.json({ error: "Fornecedor inválido." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const taxId = digitsOrNull(body.taxId);
  const email = optionalText(body.email)?.toLowerCase() ?? null;
  const phone = digitsOrNull(body.phone);
  const contactName = optionalText(body.contactName);
  const notes = optionalText(body.notes);
  const active = typeof body.active === "boolean" ? body.active : true;

  if (name.length < 2 || name.length > 120) {
    return NextResponse.json({ error: "Informe um nome de fornecedor entre 2 e 120 caracteres." }, { status: 400 });
  }
  if (taxId && ![11, 14].includes(taxId.length)) {
    return NextResponse.json({ error: "Informe um CPF ou CNPJ com 11 ou 14 dígitos." }, { status: 400 });
  }
  if (email && (email.length > 254 || !EMAIL_PATTERN.test(email))) {
    return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
  }
  if (phone && (phone.length < 10 || phone.length > 13)) {
    return NextResponse.json({ error: "Informe um telefone com DDD válido." }, { status: 400 });
  }
  if ((contactName?.length ?? 0) > 120 || (notes?.length ?? 0) > 2000) {
    return NextResponse.json({ error: "Revise o tamanho do contato ou das observações." }, { status: 400 });
  }

  const payload = {
    company_id: context.company.id,
    name,
    tax_id: taxId,
    email,
    phone,
    contact_name: contactName,
    notes,
    active,
  };

  try {
    const path = mode === "create"
      ? `suppliers?select=${selectFields}`
      : `suppliers?select=${selectFields}&id=eq.${encodeURIComponent(supplierId)}&company_id=eq.${encodeURIComponent(context.company.id)}`;
    const saved = await supabaseRest<SupplierRow[]>(path, auth.accessToken, {
      method: mode === "create" ? "POST" : "PATCH",
      body: payload,
      prefer: "return=representation",
    });
    if (!saved[0]) return NextResponse.json({ error: "Fornecedor não encontrado no seu acesso." }, { status: 404 });
    return NextResponse.json({ ok: true, supplier: toSupplier(saved[0]) });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("supplier has active agreement")) {
      return NextResponse.json({ error: "Encerre o acordo ativo deste fornecedor antes de desativá-lo." }, { status: 409 });
    }
    if (message.includes("suppliers_company_tax_id_uidx") || message.includes("duplicate")) {
      return NextResponse.json({ error: "Já existe um fornecedor com este CPF ou CNPJ." }, { status: 409 });
    }
    return NextResponse.json({ error: "Não foi possível salvar o fornecedor agora." }, { status: 400 });
  }
}

function toSupplier(row: SupplierRow) {
  return {
    id: row.id,
    name: row.name,
    taxId: row.tax_id,
    email: row.email,
    phone: row.phone,
    contactName: row.contact_name,
    notes: row.notes,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function optionalText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function digitsOrNull(value: unknown) {
  const normalized = String(value ?? "").replace(/\D/g, "");
  return normalized || null;
}

function canManage(role: string) {
  return ["owner", "admin", "manager"].includes(role);
}
