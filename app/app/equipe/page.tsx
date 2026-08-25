import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import { TeamManagement, type TeamActivityItem, type TeamMemberItem } from "@/components/team-management";
import { requireAppContext } from "@/lib/app-context";
import { supabaseRest, supabaseRpc } from "@/lib/supabase/rest";

export const dynamic = "force-dynamic";

type MemberRow = {
  member_id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: TeamMemberItem["role"];
  status: TeamMemberItem["status"];
  branch_ids: string[] | null;
  created_at: string;
  updated_at: string;
};
type BranchRow = { id: string; name: string };
type NotificationRow = { id: string };
type AuditRow = { id: number; actor_user_id: string | null; action: string; entity_type: string; entity_id: string | null; before_data: Record<string, unknown> | null; after_data: Record<string, unknown> | null; created_at: string };

export default async function TeamPage() {
  const { auth, context } = await requireAppContext("/app/equipe");
  const companyId = encodeURIComponent(context.company.id);
  const canManage = ["owner", "admin"].includes(context.membership.role);
  const canViewAudit = ["owner", "admin"].includes(context.membership.role);
  const auditPromise = canViewAudit
    ? supabaseRest<AuditRow[]>(`audit_logs?select=id,actor_user_id,action,entity_type,entity_id,before_data,after_data,created_at&company_id=eq.${companyId}&entity_type=in.(company_members,member_scopes)&order=created_at.desc&limit=30`, auth.accessToken)
    : Promise.resolve([] as AuditRow[]);
  const [memberRows, branches, unread, auditRows] = await Promise.all([
    supabaseRpc<MemberRow[]>("list_company_members", auth.accessToken, { p_company_id: context.company.id }),
    supabaseRest<BranchRow[]>(`branches?select=id,name&company_id=eq.${companyId}&active=eq.true&order=name.asc&limit=300`, auth.accessToken),
    supabaseRest<NotificationRow[]>(`notifications?select=id&company_id=eq.${companyId}&user_id=eq.${encodeURIComponent(auth.user.id)}&read_at=is.null&limit=1000`, auth.accessToken),
    auditPromise,
  ]);
  const members: TeamMemberItem[] = memberRows.map((row) => ({
    memberId: row.member_id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    branchIds: row.branch_ids ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  const activities = auditRows.map((row) => activityItem(row, members, auth.user.id));
  const active = members.filter((item) => item.status === "active").length;
  const pending = members.filter((item) => item.status === "invited").length;
  const leaders = members.filter((item) => ["owner", "admin", "manager"].includes(item.role) && item.status === "active").length;
  const scoped = members.filter((item) => item.branchIds.length > 0).length;

  return (
    <AppFrame active="team" companyName={context.company.name} userLabel={auth.user.user_metadata?.full_name ?? auth.user.email} notificationCount={unread.length}>
      <div className="app-page team-page">
        <div className="app-heading-row team-heading"><div><span>Configurações / Governança</span><h1>Equipe e permissões</h1><p>Convide pessoas, distribua responsabilidades e limite o acesso por filial.</p></div><div className="app-primary-actions"><Link className="secondary-action link-action" href="/app/relatorios">▦ Ver relatórios</Link><Link className="secondary-action link-action" href="/app">← Painel</Link></div></div>
        <section className="team-metric-grid" aria-label="Resumo da equipe">
          <article><span>Pessoas ativas</span><strong>{active}</strong><small>{members.length} acessos cadastrados</small><i className="active">●</i></article>
          <article><span>Convites pendentes</span><strong>{pending}</strong><small>{pending ? "Aguardando definição de senha" : "Nenhum convite aguardando"}</small><i className="pending">↗</i></article>
          <article><span>Lideranças</span><strong>{leaders}</strong><small>Proprietários, administradores e gestores</small><i className="leaders">◆</i></article>
          <article><span>Acessos por filial</span><strong>{scoped}</strong><small>{branches.length} {branches.length === 1 ? "filial disponível" : "filiais disponíveis"}</small><i className="scoped">⌖</i></article>
        </section>
        <div className="real-data-note"><span>●</span> Funções, escopos e bloqueios aplicados aos dados reais de <strong>{context.company.name}</strong>.</div>
        <TeamManagement activities={activities} branches={branches} canManage={canManage} canViewAudit={canViewAudit} currentRole={context.membership.role} currentUserId={auth.user.id} initialMembers={members} />
      </div>
    </AppFrame>
  );
}

function activityItem(row: AuditRow, members: TeamMemberItem[], currentUserId: string): TeamActivityItem {
  const data = row.after_data ?? row.before_data ?? {};
  const memberId = String(row.entity_type === "member_scopes" ? data.member_id ?? "" : data.id ?? row.entity_id ?? "");
  const member = members.find((item) => item.memberId === memberId);
  const name = member?.displayName ?? "Pessoa da equipe";
  let title = "Acesso atualizado";
  if (row.entity_type === "member_scopes") title = row.action === "insert" ? "Filial adicionada ao acesso" : "Escopo de filial atualizado";
  else if (row.action === "insert") title = "Pessoa adicionada à equipe";
  else if (row.action === "delete") title = "Pessoa removida da equipe";
  else if (row.before_data?.status !== row.after_data?.status) title = "Situação de acesso alterada";
  else if (row.before_data?.role !== row.after_data?.role) title = "Função da equipe alterada";
  const actor = row.actor_user_id ? members.find((item) => item.userId === row.actor_user_id) : null;
  return { id: String(row.id), title, detail: name, createdAt: row.created_at, actorLabel: row.actor_user_id === currentUserId ? "Você" : actor?.displayName ?? "Responsável da empresa" };
}
