import { redirect } from "next/navigation";
import { getPrimaryMembership } from "./prazor-data";
import { getAuthState } from "./supabase/session";

export async function requireAppContext(returnTo: string) {
  const auth = await getAuthState();

  if (auth.status === "refresh-required") {
    redirect(`/api/auth/refresh?return_to=${encodeURIComponent(returnTo)}`);
  }
  if (auth.status !== "authenticated") redirect("/entrar");

  const context = await getPrimaryMembership(auth.user.id, auth.accessToken);
  if (!context) redirect("/onboarding");

  return { auth, context };
}
