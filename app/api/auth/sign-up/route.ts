import { NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  readAuthError,
  requestSupabaseSession,
  type SupabaseSession,
} from "@/lib/supabase/session";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (name.length < 2) {
    return NextResponse.json({ error: "Informe seu nome." }, { status: 400 });
  }
  if (!email.includes("@")) {
    return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Crie uma senha com pelo menos 8 caracteres." },
      { status: 400 },
    );
  }

  const confirmationUrl = new URL("/entrar?confirmado=1", request.url).toString();
  const { response, data } = await requestSupabaseSession(
    `/auth/v1/signup?redirect_to=${encodeURIComponent(confirmationUrl)}`,
    { email, password, data: { full_name: name } },
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: readAuthError(data as Record<string, unknown>) },
      { status: response.status || 400 },
    );
  }

  if ("access_token" in data && "refresh_token" in data) {
    const session = data as SupabaseSession;
    const result = NextResponse.json({ ok: true, next: "/onboarding" });
    const secure = process.env.NODE_ENV === "production";
    result.cookies.set(ACCESS_COOKIE, session.access_token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(60, session.expires_in ?? 3600),
    });
    result.cookies.set(REFRESH_COOKIE, session.refresh_token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return result;
  }

  return NextResponse.json({
    ok: true,
    confirmationRequired: true,
    message: "Conta criada. Abra o e-mail de confirmação e depois entre no Prazor.",
  });
}
