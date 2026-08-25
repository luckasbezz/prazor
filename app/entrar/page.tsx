import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getAuthState } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await getAuthState();
  if (auth.status === "authenticated") redirect("/app");
  const params = await searchParams;
  const confirmed = params.confirmado === "1";
  const expired = params.sessao === "expirada";

  return (
    <main className="auth-shell">
      <Link className="brand auth-brand" href="/" aria-label="Voltar ao início do Prazor">
        <span className="brand-mark" aria-hidden="true"><span /></span>
        <span>Prazor</span>
      </Link>
      <section className="auth-card">
        <div className="auth-card-copy">
          <span className="section-label">Área segura</span>
          <h1>Bem-vindo de volta.</h1>
          <p>Entre para acompanhar os lotes que exigem atenção e orientar sua equipe.</p>
        </div>
        {confirmed && <p className="auth-notice success-notice">E-mail confirmado. Agora você já pode entrar.</p>}
        {expired && <p className="auth-notice">Sua sessão expirou com segurança. Entre novamente.</p>}
        <AuthForm mode="sign-in" />
        <p className="auth-switch">Ainda não tem conta? <Link href="/cadastro">Comece gratuitamente</Link></p>
      </section>
      <aside className="auth-aside">
        <span className="auth-aside-badge">Controle preventivo</span>
        <h2>O trabalho de hoje, organizado pelo risco real.</h2>
        <ul>
          <li><b>01</b> Saiba o que vence primeiro</li>
          <li><b>02</b> Aja antes da perda</li>
          <li><b>03</b> Meça o valor protegido</li>
        </ul>
      </aside>
    </main>
  );
}
