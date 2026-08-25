import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  requestSupabaseSession,
  safeReturnTo,
  type SupabaseSession,
} from "@/lib/supabase/session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("return_to"));
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;

  if (!refreshToken) return clearAndRedirect(request, "/entrar");

  const { response, data } = await requestSupabaseSession(
    "/auth/v1/token?grant_type=refresh_token",
    { refresh_token: refreshToken },
  );

  if (!response.ok || !("access_token" in data)) {
    return clearAndRedirect(request, "/entrar?sessao=expirada");
  }

  const session = data as SupabaseSession;
  const result = NextResponse.redirect(new URL(returnTo, request.url), 303);
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

function clearAndRedirect(request: Request, pathname: string) {
  const result = NextResponse.redirect(new URL(pathname, request.url), 303);
  result.cookies.set(ACCESS_COOKIE, "", { path: "/", maxAge: 0 });
  result.cookies.set(REFRESH_COOKIE, "", { path: "/", maxAge: 0 });
  return result;
}
