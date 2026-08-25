"use client";

import { type FormEvent, useDeferredValue, useMemo, useState } from "react";

export type TeamMemberItem = {
  memberId: string;
  userId: string;
  email: string;
  displayName: string;
  role: "owner" | "admin" | "manager" | "staff";
  status: "invited" | "active" | "suspended";
  branchIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type TeamBranchOption = { id: string; name: string };
export type TeamActivityItem = { id: string; title: string; detail: string; createdAt: string; actorLabel: string };

type Props = {
  initialMembers: TeamMemberItem[];
  branches: TeamBranchOption[];
  activities: TeamActivityItem[];
  currentUserId: string;
  currentRole: TeamMemberItem["role"];
  canManage: boolean;
  canViewAudit: boolean;
};

type Panel = { type: "invite" } | { type: "edit"; member: TeamMemberItem } | null;

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Recife" });

export function TeamManagement({ initialMembers, branches, activities, currentUserId, currentRole, canManage, canViewAudit }: Props) {
  const [view, setView] = useState<"members" | "permissions">("members");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [panel, setPanel] = useState<Panel>(null);
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("pt-BR"));
  const filtered = useMemo(() => initialMembers.filter((member) => {
    const search = `${member.displayName} ${member.email} ${roleLabel(member.role)}`.toLocaleLowerCase("pt-BR");
    return (!deferredQuery || search.includes(deferredQuery))
      && (roleFilter === "all" || member.role === roleFilter)
      && (statusFilter === "all" || member.status === statusFilter);
  }), [deferredQuery, initialMembers, roleFilter, statusFilter]);

  return (
    <section className="team-workspace">
      <div className="team-view-tabs" role="tablist" aria-label="Visualizações da equipe">
        <button className={view === "members" ? "active" : ""} onClick={() => setView("members")} role="tab" type="button">Pessoas <b>{initialMembers.length}</b></button>
        <button className={view === "permissions" ? "active" : ""} onClick={() => setView("permissions")} role="tab" type="button">Mapa de permissões</button>
      </div>

      {view === "members" ? (
        <div className="team-layout">
          <div className="team-main-column">
            <div className="team-toolbar">
              <label className="team-search"><span aria-hidden="true">⌕</span><input aria-label="Buscar pessoa na equipe" onChange={(event) => setQuery(event.target.value)} placeholder="Nome, e-mail ou função" value={query} /></label>
              <select aria-label="Filtrar por função" onChange={(event) => setRoleFilter(event.target.value)} value={roleFilter}><option value="all">Todas as funções</option><option value="owner">Proprietários</option><option value="admin">Administradores</option><option value="manager">Gestores</option><option value="staff">Colaboradores</option></select>
              <select aria-label="Filtrar por situação" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}><option value="all">Todas as situações</option><option value="active">Ativos</option><option value="invited">Convites pendentes</option><option value="suspended">Suspensos</option></select>
              {canManage ? <button className="team-invite-button" onClick={() => setPanel({ type: "invite" })} type="button">＋ Convidar pessoa</button> : <span className="team-read-only">Acesso de consulta</span>}
            </div>

            <div className="team-table-card">
              <div className="team-table-header"><span>Pessoa</span><span>Função</span><span>Escopo</span><span>Situação</span><span /></div>
              {filtered.length ? filtered.map((member) => {
                const editable = canEditMember(member, currentUserId, currentRole, canManage);
                return <div className="team-table-row" key={member.memberId}>
                  <div className="team-person"><i>{initials(member.displayName)}</i><span><strong>{member.displayName}{member.userId === currentUserId ? <em>Você</em> : null}</strong><small>{member.email}</small></span></div>
                  <span className={`team-role team-role-${member.role}`}><i>{roleIcon(member.role)}</i><span><strong>{roleLabel(member.role)}</strong><small>{roleShortDescription(member.role)}</small></span></span>
                  <span className="team-scope"><strong>{scopeLabel(member, branches)}</strong><small>{member.role === "owner" || member.role === "admin" ? "Acesso irrestrito" : member.branchIds.length ? `${member.branchIds.length} ${member.branchIds.length === 1 ? "filial" : "filiais"}` : "Sem escopo operacional"}</small></span>
                  <span className={`team-status ${member.status}`}><i />{statusLabel(member.status)}</span>
                  <button className="team-edit-button" disabled={!editable} onClick={() => setPanel({ type: "edit", member })} title={editable ? "Editar acesso" : member.userId === currentUserId ? "Seu próprio acesso é protegido" : "Somente o proprietário pode alterar este perfil"} type="button">{editable ? "Editar" : "Protegido"}</button>
                </div>;
              }) : <div className="team-empty"><span>⌕</span><h3>Nenhuma pessoa encontrada</h3><p>Ajuste a busca ou os filtros para visualizar outros acessos.</p></div>}
            </div>
          </div>

          <aside className="team-side-column">
            {panel?.type === "invite" ? <InvitePanel branches={branches} currentRole={currentRole} onClose={() => setPanel(null)} /> : panel?.type === "edit" ? <EditPanel branches={branches} currentUserId={currentUserId} member={panel.member} onClose={() => setPanel(null)} /> : <TeamGuidance />}
            <ActivityCard activities={activities} canViewAudit={canViewAudit} />
          </aside>
        </div>
      ) : <PermissionMatrix currentRole={currentRole} />}
    </section>
  );
}

function InvitePanel({ branches, currentRole, onClose }: { branches: TeamBranchOption[]; currentRole: TeamMemberItem["role"]; onClose: () => void }) {
  const [role, setRole] = useState("staff");
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setFeedback(null);
    const form = new FormData(event.currentTarget);
    const branchIds = form.getAll("branchIds").map(String);
    try {
      const response = await fetch("/api/team-members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email"), role, branchIds }) });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok || data.error) { setFeedback({ tone: "error", message: data.error ?? "Não foi possível enviar o convite." }); return; }
      setFeedback({ tone: "success", message: data.message ?? "Convite enviado com sucesso." });
      window.setTimeout(() => window.location.reload(), 900);
    } catch { setFeedback({ tone: "error", message: "Não foi possível acessar o Prazor agora." }); }
    finally { setLoading(false); }
  }

  return <form className="team-form-card" onSubmit={submit}>
    <div className="team-side-heading"><div><span>Novo acesso</span><h2>Convidar pessoa</h2><p>Envie um acesso com responsabilidade e escopo definidos.</p></div><button aria-label="Fechar formulário" onClick={onClose} type="button">×</button></div>
    <label>E-mail profissional<input autoComplete="email" name="email" placeholder="pessoa@empresa.com.br" required type="email" /></label>
    <label>Função<select name="role" onChange={(event) => setRole(event.target.value)} value={role}>{currentRole === "owner" ? <option value="admin">Administrador</option> : null}<option value="manager">Gestor</option><option value="staff">Colaborador</option></select><small>{roleDescription(role)}</small></label>
    {!["admin", "owner"].includes(role) ? <BranchSelector branches={branches} selected={[]} /> : <div className="team-full-access-note"><span>◎</span><div><strong>Acesso a toda a empresa</strong><small>Administradores não possuem restrição por filial.</small></div></div>}
    {feedback ? <p className={`team-feedback ${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.message}</p> : null}
    <div className="team-form-actions"><button className="secondary-action" onClick={onClose} type="button">Cancelar</button><button className="primary-action" disabled={loading} type="submit">{loading ? "Enviando..." : "Enviar convite"}</button></div>
  </form>;
}

function EditPanel({ member, branches, currentUserId, onClose }: { member: TeamMemberItem; branches: TeamBranchOption[]; currentUserId: string; onClose: () => void }) {
  const [role, setRole] = useState(member.role);
  const [status, setStatus] = useState(member.status);
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setFeedback(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/team-members", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId: member.memberId, role, status, branchIds: form.getAll("branchIds").map(String) }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok || data.error) { setFeedback({ tone: "error", message: data.error ?? "Não foi possível atualizar o acesso." }); return; }
      setFeedback({ tone: "success", message: "Acesso atualizado com sucesso." }); window.setTimeout(() => window.location.reload(), 700);
    } catch { setFeedback({ tone: "error", message: "Não foi possível acessar o Prazor agora." }); }
    finally { setLoading(false); }
  }

  async function remove() {
    if (member.userId === currentUserId || !window.confirm(`Remover ${member.displayName} da equipe?`)) return;
    setLoading(true); setFeedback(null);
    try {
      const response = await fetch("/api/team-members", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId: member.memberId }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok || data.error) { setFeedback({ tone: "error", message: data.error ?? "Não foi possível remover esta pessoa." }); return; }
      window.location.reload();
    } catch { setFeedback({ tone: "error", message: "Não foi possível acessar o Prazor agora." }); }
    finally { setLoading(false); }
  }

  return <form className="team-form-card" onSubmit={submit}>
    <div className="team-side-heading"><div><span>Editar acesso</span><h2>{member.displayName}</h2><p>{member.email}</p></div><button aria-label="Fechar formulário" onClick={onClose} type="button">×</button></div>
    <label>Função<select onChange={(event) => setRole(event.target.value as TeamMemberItem["role"])} value={role}><option value="owner">Proprietário</option><option value="admin">Administrador</option><option value="manager">Gestor</option><option value="staff">Colaborador</option></select><small>{roleDescription(role)}</small></label>
    <label>Situação<select onChange={(event) => setStatus(event.target.value as TeamMemberItem["status"])} value={status}><option value="active">Ativo</option>{member.status === "invited" ? <option value="invited">Convite pendente</option> : null}<option value="suspended">Suspenso</option></select><small>{status === "suspended" ? "A pessoa perde o acesso imediatamente." : "A pessoa poderá entrar conforme sua função."}</small></label>
    {!["owner", "admin"].includes(role) ? <BranchSelector branches={branches} selected={member.branchIds} /> : <div className="team-full-access-note"><span>◎</span><div><strong>Acesso a toda a empresa</strong><small>Este perfil não possui restrição por filial.</small></div></div>}
    {feedback ? <p className={`team-feedback ${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.message}</p> : null}
    <button className="team-remove-button" disabled={loading} onClick={remove} type="button">Remover da equipe</button>
    <div className="team-form-actions"><button className="secondary-action" onClick={onClose} type="button">Cancelar</button><button className="primary-action" disabled={loading} type="submit">{loading ? "Salvando..." : "Salvar acesso"}</button></div>
  </form>;
}

function BranchSelector({ branches, selected }: { branches: TeamBranchOption[]; selected: string[] }) {
  return <fieldset className="team-branch-selector"><legend>Filiais permitidas</legend>{branches.length ? <div>{branches.map((branch) => <label key={branch.id}><input defaultChecked={selected.includes(branch.id)} name="branchIds" type="checkbox" value={branch.id} /><span><i>✓</i><strong>{branch.name}</strong></span></label>)}</div> : <p>Nenhuma filial cadastrada. O escopo poderá ser definido quando a primeira unidade for criada.</p>}<small>Sem seleção, gestores e colaboradores não acessam dados operacionais.</small></fieldset>;
}

function TeamGuidance() {
  return <article className="team-guidance-card"><span className="setup-label">Controle de acesso</span><h2>Permissão certa, no lugar certo.</h2><p>Separe responsabilidades sem perder a colaboração entre a equipe.</p><div><span><b>01</b><i><strong>Função</strong><small>Define o que a pessoa pode fazer.</small></i></span><span><b>02</b><i><strong>Escopo</strong><small>Define em quais filiais ela pode atuar.</small></i></span><span><b>03</b><i><strong>Histórico</strong><small>Preserva quem alterou cada acesso.</small></i></span></div></article>;
}

function ActivityCard({ activities, canViewAudit }: { activities: TeamActivityItem[]; canViewAudit: boolean }) {
  return <article className="team-activity-card"><div><span>Auditoria</span><h2>Alterações recentes</h2></div>{canViewAudit ? activities.length ? <div className="team-activity-list">{activities.map((item) => <div key={item.id}><i>✓</i><span><strong>{item.title}</strong><p>{item.detail}</p><small>{item.actorLabel} · {dateTime.format(new Date(item.createdAt))}</small></span></div>)}</div> : <p className="team-activity-empty">Os primeiros convites e ajustes de permissão aparecerão aqui.</p> : <p className="team-activity-empty">O histórico detalhado fica disponível para proprietários e administradores.</p>}</article>;
}

function PermissionMatrix({ currentRole }: { currentRole: TeamMemberItem["role"] }) {
  const rows = [
    ["Painel, validades e notificações", true, true, true, true],
    ["Receber e movimentar estoque", true, true, true, true],
    ["Ajustes de saldo e custo", true, true, true, false],
    ["Fornecedores e trocas", true, true, true, false],
    ["Relatórios gerenciais", true, true, true, false],
    ["Convidar e editar equipe", true, true, false, false],
    ["Alterar administradores", true, false, false, false],
    ["Auditoria completa", true, true, false, false],
  ] as const;
  return <div className="permission-layout"><section className="permission-card"><div className="report-card-heading"><div><span>Governança</span><h2>Mapa de permissões</h2><p>Regras aplicadas no servidor e no banco de dados</p></div><span className={`team-role-chip ${currentRole}`}>Seu perfil: {roleLabel(currentRole)}</span></div><div className="permission-table"><div className="permission-header"><span>Capacidade</span><span>Proprietário</span><span>Administrador</span><span>Gestor</span><span>Colaborador</span></div>{rows.map((row) => <div className="permission-row" key={row[0]}><strong>{row[0]}</strong>{row.slice(1).map((allowed, index) => <span className={allowed ? "allowed" : "denied"} key={index}>{allowed ? "✓" : "—"}</span>)}</div>)}</div></section><aside className="permission-note"><span>Proteção em camadas</span><h2>O menu não é a barreira de segurança.</h2><p>As permissões também são verificadas nas operações e no banco de dados. Mesmo uma requisição manual respeita empresa, função e escopo.</p><ul><li>✓ Isolamento entre empresas</li><li>✓ Último proprietário protegido</li><li>✓ Ações administrativas auditadas</li></ul></aside></div>;
}

function canEditMember(member: TeamMemberItem, currentUserId: string, currentRole: TeamMemberItem["role"], canManage: boolean) {
  if (!canManage || member.userId === currentUserId) return false;
  if (currentRole === "owner") return true;
  return !["owner", "admin"].includes(member.role);
}

function scopeLabel(member: TeamMemberItem, branches: TeamBranchOption[]) {
  if (["owner", "admin"].includes(member.role)) return "Toda a empresa";
  const names = member.branchIds.map((id) => branches.find((branch) => branch.id === id)?.name).filter(Boolean);
  if (!names.length) return "Nenhuma filial";
  if (names.length <= 2) return names.join(" · ");
  return `${names.slice(0, 2).join(" · ")} +${names.length - 2}`;
}

function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((item) => item[0]?.toUpperCase()).join("") || "PE"; }
function roleLabel(role: string) { return ({ owner: "Proprietário", admin: "Administrador", manager: "Gestor", staff: "Colaborador" } as Record<string, string>)[role] ?? "Colaborador"; }
function roleIcon(role: string) { return ({ owner: "◆", admin: "◇", manager: "▦", staff: "○" } as Record<string, string>)[role] ?? "○"; }
function statusLabel(status: string) { return ({ active: "Ativo", invited: "Convite pendente", suspended: "Suspenso" } as Record<string, string>)[status] ?? status; }
function roleShortDescription(role: string) { return ({ owner: "Controle total", admin: "Gestão ampla", manager: "Operação e análise", staff: "Rotina operacional" } as Record<string, string>)[role] ?? "Rotina operacional"; }
function roleDescription(role: string) { return ({ owner: "Controle completo, inclusive sobre administradores.", admin: "Gerencia a operação e a equipe, exceto proprietários e administradores.", manager: "Opera estoque, acompanha fornecedores, trocas e relatórios.", staff: "Executa as rotinas permitidas nas filiais selecionadas." } as Record<string, string>)[role] ?? "Acesso operacional."; }
