"use client";

import Link from "next/link";
import { useState } from "react";

export type NotificationPreferenceState = {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  thresholds: number[];
  dailySummaryEnabled: boolean;
  dailySummaryTime: string;
  timezone: string;
};

type Feedback = { tone: "success" | "error"; message: string } | null;

const recommended: NotificationPreferenceState = {
  inAppEnabled: true,
  emailEnabled: true,
  thresholds: [0, 1, 3, 7, 15, 30],
  dailySummaryEnabled: true,
  dailySummaryTime: "08:00",
  timezone: "America/Recife",
};

const thresholdOptions = [0, 1, 3, 7, 15, 30, 45, 60, 90];
const timezoneOptions = [
  { value: "America/Recife", label: "Recife · UTC−3" },
  { value: "America/Sao_Paulo", label: "Brasília / São Paulo · UTC−3" },
  { value: "America/Manaus", label: "Manaus · UTC−4" },
  { value: "America/Rio_Branco", label: "Rio Branco · UTC−5" },
  { value: "America/Noronha", label: "Fernando de Noronha · UTC−2" },
];

export function NotificationPreferencesForm({ initial, email, isPersisted }: { initial: NotificationPreferenceState; email: string; isPersisted: boolean }) {
  const [preferences, setPreferences] = useState(() => clonePreference(initial));
  const [saved, setSaved] = useState(() => clonePreference(initial));
  const [persisted, setPersisted] = useState(isPersisted);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const availableThresholds = [...new Set([...thresholdOptions, ...initial.thresholds])].sort((left, right) => left - right);
  const dirty = !persisted || signature(preferences) !== signature(saved);

  function toggleThreshold(day: number) {
    setFeedback(null);
    setPreferences((current) => {
      const selected = current.thresholds.includes(day);
      const thresholds = selected ? current.thresholds.filter((value) => value !== day) : [...current.thresholds, day];
      return { ...current, thresholds: thresholds.sort((left, right) => left - right) };
    });
  }

  function setEmailEnabled(enabled: boolean) {
    setFeedback(null);
    setPreferences((current) => ({ ...current, emailEnabled: enabled, dailySummaryEnabled: enabled ? current.dailySummaryEnabled : false }));
  }

  async function savePreferences() {
    if (!preferences.thresholds.length) {
      setFeedback({ tone: "error", message: "Selecione ao menos uma antecedência para receber alertas." });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/notification-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; preference?: NotificationPreferenceState };
      if (!response.ok || !data.preference) throw new Error(data.error ?? "Não foi possível salvar as preferências.");
      const confirmed = clonePreference(data.preference);
      setPreferences(confirmed);
      setSaved(clonePreference(confirmed));
      setPersisted(true);
      setFeedback({ tone: "success", message: "Preferências salvas. Os próximos alertas usarão esta configuração." });
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Não foi possível salvar as preferências." });
    } finally {
      setSaving(false);
    }
  }

  function restoreRecommended() {
    setFeedback(null);
    setPreferences(clonePreference(recommended));
  }

  return (
    <div className="preference-layout">
      <section className="preference-main-column">
        <article className="preference-card">
          <div className="preference-card-heading"><div><span>1 · Canais</span><h2>Onde você quer ser avisado?</h2><p>As escolhas são individuais e não alteram as preferências da sua equipe.</p></div><small>Seu acesso</small></div>
          <div className="preference-channel-list">
            <label className={`preference-channel ${preferences.inAppEnabled ? "selected" : ""}`}>
              <span className="preference-channel-icon">◇</span>
              <span><strong>Notificações no Prazor</strong><small>Alertas aparecem na central e nos contadores da plataforma.</small><em>Disponível agora</em></span>
              <input checked={preferences.inAppEnabled} onChange={(event) => { setFeedback(null); setPreferences((current) => ({ ...current, inAppEnabled: event.target.checked })); }} type="checkbox" />
            </label>
            <label className={`preference-channel ${preferences.emailEnabled ? "selected" : ""}`}>
              <span className="preference-channel-icon email">@</span>
              <span><strong>E-mail</strong><small>Preferência associada a {email}.</small><em>Fila, resumo e histórico disponíveis</em></span>
              <input checked={preferences.emailEnabled} onChange={(event) => setEmailEnabled(event.target.checked)} type="checkbox" />
            </label>
            <div className="preference-channel disabled" aria-disabled="true">
              <span className="preference-channel-icon whatsapp">W</span>
              <span><strong>WhatsApp</strong><small>Exigirá número verificado e consentimento do usuário.</small><em>Integração em preparação</em></span>
              <span className="preference-coming-soon">Em breve</span>
            </div>
          </div>
        </article>

        <article className="preference-card">
          <div className="preference-card-heading"><div><span>2 · Antecedência</span><h2>Quando o alerta deve chegar?</h2><p>Selecione os marcos que fazem sentido para sua operação.</p></div><small>{preferences.thresholds.length} selecionados</small></div>
          <div className="preference-thresholds" role="group" aria-label="Dias de antecedência">
            {availableThresholds.map((day) => <button aria-pressed={preferences.thresholds.includes(day)} className={preferences.thresholds.includes(day) ? "active" : ""} key={day} onClick={() => toggleThreshold(day)} type="button"><strong>{day}</strong><span>{day === 0 ? "No vencimento" : day === 1 ? "dia antes" : "dias antes"}</span><i>{preferences.thresholds.includes(day) ? "✓" : "+"}</i></button>)}
          </div>
          {!preferences.thresholds.length ? <p className="preference-inline-error">Selecione pelo menos um marco de antecedência.</p> : null}
          <div className="preference-threshold-note"><span>i</span><p><strong>Sem alertas duplicados.</strong> Cada combinação de lote, marco e usuário é registrada uma única vez.</p></div>
        </article>

        <article className="preference-card">
          <div className="preference-card-heading"><div><span>3 · Resumo diário</span><h2>Receba as prioridades em um único horário</h2><p>O resumo reduz interrupções e concentra os alertas do dia.</p></div></div>
          <label className={`preference-summary-toggle ${preferences.dailySummaryEnabled ? "selected" : ""} ${!preferences.emailEnabled ? "disabled" : ""}`}>
            <span><strong>Enviar resumo diário por e-mail</strong><small>{preferences.emailEnabled ? "Agrupa os alertas pendentes em uma mensagem." : "Ative o canal de e-mail para usar o resumo."}</small></span>
            <input checked={preferences.dailySummaryEnabled} disabled={!preferences.emailEnabled} onChange={(event) => { setFeedback(null); setPreferences((current) => ({ ...current, dailySummaryEnabled: event.target.checked })); }} type="checkbox" />
          </label>
          <div className="preference-schedule-grid">
            <label><span>Horário do resumo</span><input disabled={!preferences.dailySummaryEnabled} onChange={(event) => { setFeedback(null); setPreferences((current) => ({ ...current, dailySummaryTime: event.target.value })); }} type="time" value={preferences.dailySummaryTime} /></label>
            <label><span>Fuso horário</span><select onChange={(event) => { setFeedback(null); setPreferences((current) => ({ ...current, timezone: event.target.value })); }} value={preferences.timezone}>{timezoneOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          </div>
        </article>

        <div className="preference-save-bar">
          <div><span className={dirty ? "unsaved" : "saved"}>{dirty ? "Alterações ainda não salvas" : "Configurações sincronizadas"}</span>{feedback ? <p className={feedback.tone} role="status">{feedback.message}</p> : null}</div>
          <div><button className="secondary-action" disabled={saving} onClick={restoreRecommended} type="button">Restaurar recomendado</button><button className="primary-action" disabled={saving || !dirty || !preferences.thresholds.length} onClick={savePreferences} type="button">{saving ? "Salvando…" : "Salvar preferências"}</button></div>
        </div>
      </section>

      <aside className="preference-side-column">
        <article className="preference-preview-card">
          <span>Prévia da sua regra</span>
          <div className="preference-preview-alert"><i>!</i><div><small>Validade · Lote 24A</small><strong>Queijo Minas está perto do vencimento</strong><p>{previewTiming(preferences.thresholds)}</p></div></div>
          <dl>
            <div><dt>Na plataforma</dt><dd>{preferences.inAppEnabled ? "Ativo" : "Desativado"}</dd></div>
            <div><dt>E-mail</dt><dd>{preferences.emailEnabled ? "Ativo na fila" : "Desativado"}</dd></div>
            <div><dt>Resumo</dt><dd>{preferences.dailySummaryEnabled ? `Diário às ${preferences.dailySummaryTime}` : "Desativado"}</dd></div>
            <div><dt>Marcos</dt><dd>{preferences.thresholds.length}</dd></div>
          </dl>
        </article>
        <article className="preference-help-card"><span>Como funciona</span><h3>Você controla a frequência, sem perder urgências.</h3><ul><li><b>1</b>O Prazor identifica o lote no marco escolhido.</li><li><b>2</b>Agrupa ou envia no horário configurado.</li><li><b>3</b>Registra cada tentativa sem duplicar o evento.</li></ul><Link href="/app/notificacoes/entregas">Acompanhar entregas →</Link></article>
      </aside>
    </div>
  );
}

function clonePreference(value: NotificationPreferenceState): NotificationPreferenceState {
  return { ...value, thresholds: [...value.thresholds].sort((left, right) => left - right) };
}

function signature(value: NotificationPreferenceState) {
  return JSON.stringify(value);
}

function previewTiming(thresholds: number[]) {
  if (!thresholds.length) return "Selecione ao menos uma antecedência para ativar esta regra.";
  const largest = Math.max(...thresholds);
  if (largest === 0) return "O primeiro alerta será criado no dia do vencimento.";
  return `O primeiro alerta será criado ${largest} ${largest === 1 ? "dia" : "dias"} antes do vencimento.`;
}
