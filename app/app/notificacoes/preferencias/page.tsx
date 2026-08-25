import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import { NotificationPreferencesForm, type NotificationPreferenceState } from "@/components/notification-preferences-form";
import { requireAppContext } from "@/lib/app-context";
import { supabaseRest } from "@/lib/supabase/rest";

export const dynamic = "force-dynamic";

type PreferenceRow = {
  email_enabled: boolean;
  in_app_enabled: boolean;
  thresholds: number[];
  daily_summary_enabled: boolean;
  daily_summary_time: string;
  timezone: string;
};
type NotificationRow = { id: string };

const defaultPreference: NotificationPreferenceState = {
  inAppEnabled: true,
  emailEnabled: true,
  thresholds: [0, 1, 3, 7, 15, 30],
  dailySummaryEnabled: true,
  dailySummaryTime: "08:00",
  timezone: "America/Recife",
};

export default async function NotificationPreferencesPage() {
  const { auth, context } = await requireAppContext("/app/notificacoes/preferencias");
  const companyId = encodeURIComponent(context.company.id);
  const userId = encodeURIComponent(auth.user.id);
  const [rows, unread] = await Promise.all([
    supabaseRest<PreferenceRow[]>(`notification_preferences?select=email_enabled,in_app_enabled,thresholds,daily_summary_enabled,daily_summary_time,timezone&company_id=eq.${companyId}&user_id=eq.${userId}&limit=1`, auth.accessToken),
    supabaseRest<NotificationRow[]>(`notifications?select=id&company_id=eq.${companyId}&user_id=eq.${userId}&read_at=is.null&limit=1000`, auth.accessToken),
  ]);
  const row = rows[0];
  const initial: NotificationPreferenceState = row ? {
    inAppEnabled: row.in_app_enabled,
    emailEnabled: row.email_enabled,
    thresholds: row.thresholds.map(Number).sort((left, right) => left - right),
    dailySummaryEnabled: row.daily_summary_enabled,
    dailySummaryTime: row.daily_summary_time.slice(0, 5),
    timezone: row.timezone,
  } : defaultPreference;

  return (
    <AppFrame active="notifications" companyName={context.company.name} userLabel={auth.user.user_metadata?.full_name ?? auth.user.email} notificationCount={unread.length}>
      <div className="app-page notification-preferences-page">
        <nav className="preference-breadcrumb" aria-label="Navegação estrutural"><Link href="/app/notificacoes">Notificações</Link><span>›</span><span>Preferências</span></nav>
        <div className="app-heading-row preference-heading">
          <div><span>Alertas / Preferências</span><h1>Defina como o Prazor avisa você</h1><p>Escolha os canais, a antecedência e o horário que combinam com sua rotina.</p></div>
          <div className="app-primary-actions"><Link className="secondary-action link-action" href="/app/notificacoes/entregas">↗ Histórico de entregas</Link><Link className="secondary-action link-action" href="/app/notificacoes">← Voltar para a central</Link></div>
        </div>
        <div className="real-data-note"><span>●</span> Configuração pessoal para <strong>{context.company.name}</strong>. Outros usuários mantêm as próprias escolhas.</div>
        <NotificationPreferencesForm initial={initial} email={auth.user.email} isPersisted={Boolean(row)} />
      </div>
    </AppFrame>
  );
}
