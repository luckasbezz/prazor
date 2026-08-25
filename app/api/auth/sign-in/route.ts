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
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json({ error: "Informe seu e-mail e sua senha." }, { status: 400 });
  }

  const { response, data } = await requestSupabaseSession(
    "/auth/v1/token?grant_type=password",
    { email, password },
  );

  if (!response.ok || !("access_token" in data)) {
    return NextResponse.json(
      { error: readAuthError(data as Record<string, unknown>) },
      { status: response.status || 400 },
    );
  }

  const session = data as SupabaseSession;
  const result = NextResponse.json({ ok: true, next: "/app" });
  setSessionCookies(result, session);
  return result;
}

function setSessionCookies(response: NextResponse, session: SupabaseSession) {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(ACCESS_COOKIE, session.access_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(60, session.expires_in ?? 3600),
  });
  response.cookies.set(REFRESH_COOKIE, session.refresh_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
