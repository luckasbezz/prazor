import Link from "next/link";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding-form";
import { getAuthState } from "@/lib/supabase/session";
import { getFirstBranch, getFirstLocation, getPrimaryMembership } from "@/lib/prazor-data";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const auth = await getAuthState();
  if (auth.status === "refresh-required") redirect("/api/auth/refresh?return_to=/onboarding");
  if (auth.status !== "authenticated") redirect("/entrar");

  const context = await getPrimaryMembership(auth.user.id, auth.accessToken);
  const branch = context ? await getFirstBranch(context.company.id, auth.accessToken) : null;
  const location = context && branch
    ? await getFirstLocation(context.company.id, branch.id, auth.accessToken)
    : null;

  if (context && branch && location) redirect("/app");

  return (
    <main className="onboarding-shell">
      <header className="onboarding-header">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>Prazor</span>
        </Link>
        <span>Configuração inicial</span>
        <form action="/api/auth/sign-out" method="post"><button type="submit">Sair</button></form>
      </header>
      <section className="onboarding-card">
        <div className="onboarding-intro">
          <span className="section-label">Olá, {auth.user.user_metadata?.full_name ?? auth.user.email}</span>
          <h1>Vamos preparar seu primeiro estoque.</h1>
          <p>Precisamos de três informações para organizar lotes, validades e saldos corretamente.</p>
        </div>
        <div className="onboarding-progress" aria-label="Configuração em três etapas">
          <span className="active" /><span className="active" /><span className="active" />
        </div>
        <OnboardingForm
          initialCompanyName={context?.company.name}
          initialBranchName={branch?.name}
        />
      </section>
    </main>
  );
}
