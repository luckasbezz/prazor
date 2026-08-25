import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getAuthState } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  const auth = await getAuthState();
  if (auth.status === "authenticated") redirect("/app");

  return (
    <main className="auth-shell">
      <Link className="brand auth-brand" href="/" aria-label="Voltar ao início do Prazor">
        <span className="brand-mark" aria-hidden="true"><span /></span>
        <span>Prazor</span>
      </Link>
      <section className="auth-card">
        <div className="auth-card-copy">
          <span className="section-label">30 dias para testar</span>
          <h1>Comece antes da próxima perda.</h1>
          <p>Crie sua conta e configure a primeira unidade em poucos minutos.</p>
        </div>
        <AuthForm mode="sign-up" />
        <p className="auth-terms">Ao continuar, você concorda com os termos e a política de privacidade do Prazor.</p>
        <p className="auth-switch">Já tem conta? <Link href="/entrar">Entrar</Link></p>
      </section>
      <aside className="auth-aside signup-aside">
        <span className="auth-aside-badge">Sem cartão de crédito</span>
        <h2>Do primeiro lote ao primeiro prejuízo evitado.</h2>
        <div className="signup-proof-card">
          <small>Seu teste inclui</small>
          <strong>Produtos, lotes, validades e alertas</strong>
          <span>✓ Configuração guiada</span>
          <span>✓ Importação por planilha</span>
          <span>✓ Cancelamento a qualquer momento</span>
        </div>
      </aside>
    </main>
  );
}
