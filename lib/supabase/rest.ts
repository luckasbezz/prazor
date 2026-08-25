import { getSupabaseConfig } from "./config";

type RestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  prefer?: string;
};

export async function supabaseRest<T>(
  path: string,
  accessToken: string,
  options: RestOptions = {},
): Promise<T> {
  const { url, publishableKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: options.method ?? "GET",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const message = String(details.message ?? details.hint ?? "Falha ao consultar os dados do Prazor.");
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function supabaseRpc<T>(
  functionName: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<T> {
  return supabaseRest<T>(`rpc/${functionName}`, accessToken, {
    method: "POST",
    body,
  });
}
