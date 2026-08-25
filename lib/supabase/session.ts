import { cookies } from "next/headers";
import { getSupabaseConfig } from "./config";

export const ACCESS_COOKIE = "prazor-access-token";
export const REFRESH_COOKIE = "prazor-refresh-token";

export type PrazorUser = {
  id: string;
  email: string;
  user_metadata?: {
    full_name?: string;
  };
};

export type AuthState =
  | { status: "authenticated"; user: PrazorUser; accessToken: string }
  | { status: "refresh-required" }
  | { status: "signed-out" };

export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  user: PrazorUser;
};

export async function getAuthState(): Promise<AuthState> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;

  if (!accessToken) {
    return refreshToken ? { status: "refresh-required" } : { status: "signed-out" };
  }

  const { url, publishableKey } = getSupabaseConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return refreshToken ? { status: "refresh-required" } : { status: "signed-out" };
  }

  const user = (await response.json()) as PrazorUser;
  return { status: "authenticated", user, accessToken };
}

export async function requestSupabaseSession(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<{ response: Response; data: SupabaseSession | Record<string, unknown> }> {
  const { url, publishableKey } = getSupabaseConfig();
  const response = await fetch(`${url}${endpoint}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as
    | SupabaseSession
    | Record<string, unknown>;

  return { response, data };
}

export function readAuthError(data: Record<string, unknown>): string {
  const raw = String(data.msg ?? data.message ?? data.error_description ?? "").toLowerCase();

  if (raw.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (raw.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (raw.includes("user already registered")) return "Já existe uma conta com este e-mail.";
  if (raw.includes("password")) return "A senha não atende aos requisitos de segurança.";
  if (raw.includes("rate limit")) return "Muitas tentativas. Aguarde um pouco e tente novamente.";

  return "Não foi possível concluir a autenticação. Tente novamente.";
}

export function safeReturnTo(value: string | null, fallback = "/app"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;

  try {
    const parsed = new URL(value, "https://prazor.local");
    if (parsed.origin !== "https://prazor.local") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
