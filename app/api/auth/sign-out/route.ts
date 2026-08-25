import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/supabase/session";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;

  if (accessToken) {
    const { url, publishableKey } = getSupabaseConfig();
    await fetch(`${url}/auth/v1/logout`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    }).catch(() => null);
  }

  const response = NextResponse.redirect(new URL("/entrar", request.url), 303);
  response.cookies.set(ACCESS_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
