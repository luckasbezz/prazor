import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function namedKey(envName: string, keyName = "default") {
  try {
    return JSON.parse(Deno.env.get(envName) || "{}")[keyName] as string | undefined;
  } catch {
    return undefined;
  }
}

function uniqueIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item)).filter(Boolean))].slice(0, 200);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const publishableKey = namedKey("SUPABASE_PUBLISHABLE_KEYS") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const secretKey = namedKey("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !publishableKey || !secretKey) {
    return json({ error: "supabase_environment_not_configured" }, 500);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  const actor = userData.user;
  if (userError || !actor) return json({ error: "invalid_session" }, 401);

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const companyId = String(body.companyId || "").trim();
  const role = String(body.role || "staff").trim();
  const branchIds = uniqueIds(body.branchIds);
  if (!email.includes("@") || !companyId) return json({ error: "email_and_company_required" }, 400);
  if (!["admin", "manager", "staff"].includes(role)) return json({ error: "invalid_role" }, 400);

  const { data: actorMembership, error: actorMembershipError } = await userClient
    .from("company_members")
    .select("role,status")
    .eq("company_id", companyId)
    .eq("user_id", actor.id)
    .eq("status", "active")
    .maybeSingle();
  if (actorMembershipError || !actorMembership || !["owner", "admin"].includes(actorMembership.role)) {
    return json({ error: "forbidden" }, 403);
  }
  if (role === "admin" && actorMembership.role !== "owner") {
    return json({ error: "owner_required_for_admin" }, 403);
  }

  let targetUserId: string | null = null;
  for (let page = 1; page <= 25 && !targetUserId; page += 1) {
    const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listError) return json({ error: listError.message }, 500);
    targetUserId = listed.users.find((candidate) => candidate.email?.toLowerCase() === email)?.id ?? null;
    if (listed.users.length < 200) break;
  }

  let invited = false;
  if (!targetUserId) {
    const appUrl = (Deno.env.get("PRAZOR_APP_URL") || "https://prazor.lucasrsbezerra.chatgpt.site").replace(/\/$/, "");
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${appUrl}/convite`,
      data: { invited_to: "Prazor" },
    });
    if (inviteError || !inviteData.user) {
      return json({ error: inviteError?.message || "invite_failed" }, 400);
    }
    targetUserId = inviteData.user.id;
    invited = true;
  }

  const { data: memberId, error: memberError } = await userClient.rpc("add_company_member", {
    p_company_id: companyId,
    p_user_id: targetUserId,
    p_role: role,
    p_status: invited ? "invited" : "active",
    p_branch_ids: branchIds,
  });
  if (memberError) return json({ error: memberError.message }, 400);

  return json({
    ok: true,
    invited,
    memberId,
    message: invited
      ? "Convite enviado. O acesso será ativado quando a pessoa definir a senha."
      : "A pessoa já possuía uma conta e foi adicionada à equipe.",
  });
});
