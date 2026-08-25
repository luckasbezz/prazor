import { NextResponse } from "next/server";
import { getPrimaryMembership } from "@/lib/prazor-data";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { supabaseRpc } from "@/lib/supabase/rest";
import { getAuthState } from "@/lib/supabase/session";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const roles = new Set(["owner", "admin", "manager", "staff"]);
const statuses = new Set(["invited", "active", "suspended"]);

export async function POST(request: Request) {
  const guard = await requireTeamManager();
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const email = String(body.email ?? "").trim().toLowerCase();
  const role = String(body.role ?? "staff");
  const branchIds = validIds(body.branchIds);
  if (!email.includes("@")) return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
  if (!["admin", "manager", "staff"].includes(role)) return NextResponse.json({ error: "Selecione uma função válida." }, { status: 400 });
  if (role === "admin" && guard.context!.membership.role !== "owner") {
    return NextResponse.json({ error: "Somente o proprietário pode convidar administradores." }, { status: 403 });
  }

  const { url, publishableKey } = getSupabaseConfig();
  const response = await fetch(`${url}/functions/v1/invite-member`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${guard.auth!.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, role, branchIds, companyId: guard.context!.company.id }),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) return NextResponse.json({ error: inviteError(data) }, { status: response.status });
  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
  const guard = await requireTeamManager();
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const memberId = String(body.memberId ?? "");
  const role = String(body.role ?? "");
  const status = String(body.status ?? "");
  const branchIds = validIds(body.branchIds);
  if (!UUID_PATTERN.test(memberId)) return NextResponse.json({ error: "Membro inválido." }, { status: 400 });
  if (!roles.has(role) || !statuses.has(status)) return NextResponse.json({ error: "Função ou situação inválida." }, { status: 400 });

  try {
    await supabaseRpc<string>("update_company_member", guard.auth!.accessToken, {
      p_company_id: guard.context!.company.id,
      p_member_id: memberId,
      p_role: role,
      p_status: status,
      p_branch_ids: branchIds,
    });
    return NextResponse.json({ ok: true, memberId });
  } catch (error) {
    return NextResponse.json({ error: teamError(error) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const guard = await requireTeamManager();
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const memberId = String(body.memberId ?? "");
  if (!UUID_PATTERN.test(memberId)) return NextResponse.json({ error: "Membro inválido." }, { status: 400 });

  try {
    const removed = await supabaseRpc<boolean>("remove_company_member", guard.auth!.accessToken, {
      p_company_id: guard.context!.company.id,
      p_member_id: memberId,
    });
    if (!removed) return NextResponse.json({ error: "Membro não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true, memberId });
  } catch (error) {
    return NextResponse.json({ error: teamError(error) }, { status: 400 });
  }
}

async function requireTeamManager() {
  const auth = await getAuthState();
  if (auth.status !== "authenticated") {
    return { response: NextResponse.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 }) };
  }
  const context = await getPrimaryMembership(auth.user.id, auth.accessToken);
  if (!context) return { response: NextResponse.json({ error: "Empresa não encontrada." }, { status: 409 }) };
  if (!["owner", "admin"].includes(context.membership.role)) {
    return { response: NextResponse.json({ error: "Seu perfil possui acesso somente para consulta." }, { status: 403 }) };
  }
  return { auth, context };
}

function validIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).filter((item) => UUID_PATTERN.test(item)))].slice(0, 200);
}

function inviteError(data: Record<string, unknown>) {
  const raw = String(data.error ?? "").toLowerCase();
  if (raw.includes("already") || raw.includes("registered")) return "Esta pessoa já possui uma conta. Atualize a página e verifique a equipe.";
  if (raw.includes("rate") || raw.includes("email")) return "O convite não pôde ser enviado agora. Aguarde alguns minutos e tente novamente.";
  if (raw.includes("owner_required")) return "Somente o proprietário pode convidar administradores.";
  if (raw.includes("forbidden")) return "Seu perfil não pode convidar pessoas.";
  return "Não foi possível enviar o convite.";
}

function teamError(error: unknown) {
  const raw = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (raw.includes("retain at least one active owner")) return "A empresa precisa manter pelo menos um proprietário ativo.";
  if (raw.includes("only an owner")) return "Somente o proprietário pode alterar administradores ou proprietários.";
  if (raw.includes("not authorized") || raw.includes("policy")) return "Seu perfil não pode realizar esta alteração.";
  if (raw.includes("branch")) return "Uma das filiais selecionadas não está disponível.";
  return "Não foi possível atualizar este acesso.";
}
