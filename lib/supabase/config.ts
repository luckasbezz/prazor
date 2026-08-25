import { env } from "cloudflare:workers";

type SupabaseBindings = {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
};

export type SupabaseConfig = {
  url: string;
  publishableKey: string;
};

export function getSupabaseConfig(): SupabaseConfig {
  const bindings = env as unknown as SupabaseBindings;
  const url = bindings.SUPABASE_URL?.replace(/\/$/, "");
  const publishableKey = bindings.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("A conexão segura com o Prazor ainda não foi configurada.");
  }

  return { url, publishableKey };
}
