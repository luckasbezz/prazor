import { NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { supabaseRpc } from "@/lib/supabase/rest";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/supabase/session";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const accessToken = String(body.accessToken ?? "");
  const refreshToken = String(body.refreshToken ?? "");
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim();
  const expiresIn = Math.max(60, Math.min(Number(body.expiresIn ?? 3600) || 3600, 86400));
  if (!accessToken || !refreshToken) return NextResponse.json({ error: "Este convite não está completo ou já expirou." }, { status: 400 });
  if (name.length < 2) return NextResponse.json({ error: "Informe seu nome." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Crie uma senha com pelo menos 8 caracteres." }, { status: 400 });

  const { url, publishableKey } = getSupabaseConfig();
  const authHeaders = { apikey: publishableKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const verifyResponse = await fetch(`${url}/auth/v1/user`, { headers: authHeaders, cache: "no-store" });
  if (!verifyResponse.ok) return NextResponse.json({ error: "Este convite expirou. Peça um novo convite ao responsável pela empresa." }, { status: 401 });
  const updateResponse = await fetch(`${url}/auth/v1/user`, {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({ password, data: { full_name: name } }),
    cache: "no-store",
  });
  if (!updateResponse.ok) {
    const data = (await updateResponse.json().catch(() => ({}))) as Record<string, unknown>;
    const raw = String(data.message ?? data.msg ?? "").toLowerCase();
    return NextResponse.json({ error: raw.includes("password") ? "A senha não atende aos requisitos de segurança." : "Não foi possível concluir o convite." }, { status: 400 });
  }

  try {
    await supabaseRpc<number>("activate_my_company_invitations", accessToken, {});
  } catch {
    return NextResponse.json({ error: "Sua conta foi criada, mas o acesso à empresa não foi encontrado. Peça um novo convite." }, { status: 409 });
  }

  const result = NextResponse.json({ ok: true, next: "/app" });
  const secure = process.env.NODE_ENV === "production";
  result.cookies.set(ACCESS_COOKIE, accessToken, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: expiresIn });
  result.cookies.set(REFRESH_COOKIE, refreshToken, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return result;
}
