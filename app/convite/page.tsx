import Link from "next/link";
import { redirect } from "next/navigation";
import { InviteAcceptanceForm } from "@/components/invite-acceptance-form";
import { getAuthState } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export default async function InvitePage() {
  const auth = await getAuthState();
  if (auth.status === "authenticated") redirect("/app");

  return (
    <main className="auth-shell invite-shell">
      <Link className="brand auth-brand" href="/" aria-label="Voltar ao início do Prazor"><span className="brand-mark" aria-hidden="true"><span /></span><span>Prazor</span></Link>
      <section className="auth-card">
        <div className="auth-card-copy"><span className="section-label">Convite da equipe</span><h1>Seu espaço já está preparado.</h1><p>Defina sua senha para acessar a empresa com as permissões escolhidas pelo responsável.</p></div>
        <InviteAcceptanceForm />
        <p className="auth-switch">Já ativou sua conta? <Link href="/entrar">Entrar normalmente</Link></p>
      </section>
      <aside className="auth-aside invite-aside"><span className="auth-aside-badge">Acesso protegido</span><h2>Cada pessoa vê e altera apenas o que precisa.</h2><ul><li><b>01</b> Funções definidas por responsabilidade</li><li><b>02</b> Escopo limitado por filial</li><li><b>03</b> Alterações registradas no histórico</li></ul></aside>
    </main>
  );
}
