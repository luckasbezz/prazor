import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

type Channel = "email" | "whatsapp";
type DeliveryKind = "instant" | "summary";
type ClaimedDelivery = {
  delivery_id: string;
  company_id: string;
  notification_id: string;
  channel: Channel;
  attempt_count: number;
  delivery_kind: DeliveryKind;
};
type NotificationContext = {
  id: string;
  company_id: string;
  user_id: string;
  title: string;
  body: string;
  severity: string;
  notification_type: string;
  entity_type: string | null;
  entity_id: string | null;
  companies: { name?: string } | Array<{ name?: string }> | null;
};
type HydratedDelivery = {
  delivery: ClaimedDelivery;
  notification: NotificationContext;
};

const jsonHeaders = { "Content-Type": "application/json" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

function parseNamedKeys(name: string): Record<string, string> {
  try {
    return JSON.parse(Deno.env.get(name) || "{}");
  } catch {
    return {};
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function configuredChannels() {
  const channels: Channel[] = [];
  if (Deno.env.get("RESEND_API_KEY") && Deno.env.get("RESEND_FROM_EMAIL")) channels.push("email");
  if (
    Deno.env.get("WHATSAPP_ACCESS_TOKEN") &&
    Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") &&
    Deno.env.get("WHATSAPP_TEMPLATE_NAME") &&
    Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") &&
    Deno.env.get("WHATSAPP_GRAPH_VERSION")
  ) channels.push("whatsapp");
  return channels;
}

function companyName(notification: NotificationContext) {
  if (Array.isArray(notification.companies)) return notification.companies[0]?.name || "sua empresa";
  return notification.companies?.name || "sua empresa";
}

function appUrl() {
  return (Deno.env.get("PRAZOR_APP_URL") || "https://prazor.lucasrsbezerra.chatgpt.site").replace(/\/$/, "");
}

function notificationLink(notification: NotificationContext) {
  const entity = notification.entity_type?.toLowerCase();
  if (notification.entity_id && ["batch", "lot", "lote"].includes(entity || "")) {
    return `${appUrl()}/app/validades/${encodeURIComponent(notification.entity_id)}`;
  }
  return `${appUrl()}/app/notificacoes`;
}

function severityLabel(severity: string) {
  if (severity === "critical") return "Crítico";
  if (severity === "warning") return "Atenção";
  if (severity === "success") return "Concluído";
  return "Informativo";
}

function severityColor(severity: string) {
  if (severity === "critical") return { text: "#a83e31", background: "#fce9e5" };
  if (severity === "warning") return { text: "#91571c", background: "#fff0dc" };
  if (severity === "success") return { text: "#527111", background: "#ebf4d7" };
  return { text: "#5368a4", background: "#ebeffb" };
}

function emailFrame(title: string, intro: string, content: string) {
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f3f5f0;color:#1f2933;font-family:Arial,sans-serif">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f0;padding:28px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;overflow:hidden;border:1px solid #e0e5dc;border-radius:18px;background:#ffffff">
          <tr><td style="padding:24px 28px;background:#141c19;color:#ffffff">
            <div style="font-size:22px;font-weight:800;letter-spacing:-.6px"><span style="color:#c6f43d">●</span> Prazor</div>
            <div style="margin-top:22px;color:#c6f43d;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">Controle de validade</div>
            <h1 style="margin:8px 0 0;font-size:27px;line-height:1.15;letter-spacing:-.8px">${escapeHtml(title)}</h1>
            <p style="margin:11px 0 0;color:#b3beb7;font-size:14px;line-height:1.55">${escapeHtml(intro)}</p>
          </td></tr>
          <tr><td style="padding:26px 28px">${content}</td></tr>
          <tr><td style="border-top:1px solid #edf0eb;padding:20px 28px;color:#7d8791;font-size:11px;line-height:1.55">
            Este aviso foi gerado pelas preferências da sua conta.
            <a href="${appUrl()}/app/notificacoes/preferencias" style="color:#5f7410;font-weight:700">Ajustar preferências</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function renderEmail(items: HydratedDelivery[]) {
  const isSummary = items.length > 1 || items[0].delivery.delivery_kind === "summary";
  const company = companyName(items[0].notification);

  if (!isSummary) {
    const item = items[0].notification;
    const color = severityColor(item.severity);
    const link = notificationLink(item);
    const content = `
      <span style="display:inline-block;border-radius:999px;padding:6px 9px;color:${color.text};background:${color.background};font-size:10px;font-weight:700">${severityLabel(item.severity)}</span>
      <h2 style="margin:15px 0 8px;color:#27313a;font-size:20px;line-height:1.3">${escapeHtml(item.title)}</h2>
      <p style="margin:0;color:#66717c;font-size:14px;line-height:1.65">${escapeHtml(item.body)}</p>
      <a href="${escapeHtml(link)}" style="display:inline-block;margin-top:22px;border-radius:10px;padding:12px 18px;color:#202b0d;background:#c6f43d;font-size:13px;font-weight:800;text-decoration:none">Abrir no Prazor →</a>
      <p style="margin:22px 0 0;color:#939ba3;font-size:11px">Empresa: ${escapeHtml(company)}</p>`;
    return {
      subject: `[Prazor] ${item.title}`.slice(0, 180),
      html: emailFrame(item.title, "Um item da sua operação chegou ao marco configurado.", content),
      text: `${item.title}\n\n${item.body}\n\nAbrir no Prazor: ${link}\nEmpresa: ${company}`,
    };
  }

  const rows = items.map(({ notification }) => {
    const color = severityColor(notification.severity);
    const link = notificationLink(notification);
    return `<tr><td style="border-bottom:1px solid #edf0eb;padding:16px 0">
      <span style="display:inline-block;border-radius:999px;padding:5px 8px;color:${color.text};background:${color.background};font-size:9px;font-weight:700">${severityLabel(notification.severity)}</span>
      <h2 style="margin:10px 0 6px;color:#27313a;font-size:16px;line-height:1.35">${escapeHtml(notification.title)}</h2>
      <p style="margin:0;color:#68737d;font-size:13px;line-height:1.55">${escapeHtml(notification.body)}</p>
      <a href="${escapeHtml(link)}" style="display:inline-block;margin-top:9px;color:#5f7410;font-size:12px;font-weight:800;text-decoration:none">Abrir origem →</a>
    </td></tr>`;
  }).join("");
  const content = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>
    <a href="${appUrl()}/app/notificacoes" style="display:inline-block;margin-top:22px;border-radius:10px;padding:12px 18px;color:#202b0d;background:#c6f43d;font-size:13px;font-weight:800;text-decoration:none">Abrir central de notificações →</a>`;
  return {
    subject: `[Prazor] ${items.length} ${items.length === 1 ? "alerta" : "alertas"} em ${company}`.slice(0, 180),
    html: emailFrame("Seu resumo diário", `${items.length} ${items.length === 1 ? "prioridade pede" : "prioridades pedem"} sua atenção em ${company}.`, content),
    text: items.map(({ notification }) => `${notification.title}\n${notification.body}\n${notificationLink(notification)}`).join("\n\n"),
  };
}

async function idempotencyKey(items: HydratedDelivery[]) {
  const ids = items.map(({ delivery }) => delivery.delivery_id).sort().join(":");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ids));
  const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `prazor-email-${hash}`;
}

async function parseProviderError(response: Response) {
  const raw = await response.text();
  try {
    const parsed = JSON.parse(raw);
    return parsed?.message || parsed?.error?.message || raw.slice(0, 800);
  } catch {
    return raw.slice(0, 800) || `HTTP ${response.status}`;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const publishableKeys = parseNamedKeys("SUPABASE_PUBLISHABLE_KEYS");
  const providedKey = req.headers.get("apikey") || "";
  if (!providedKey || !Object.values(publishableKeys).includes(providedKey)) {
    return json({ error: "unauthorized" }, 401);
  }

  const channels = configuredChannels();
  if (!channels.length) {
    return json({ ok: true, processed: 0, configuredChannels: [], reason: "providers_not_configured" });
  }

  const secretKeys = parseNamedKeys("SUPABASE_SECRET_KEYS");
  const secretKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  if (!supabaseUrl || !secretKey) return json({ error: "supabase_admin_not_configured" }, 500);

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const body = await req.json().catch(() => ({}));
  const requestedLimit = Number(body?.limit || 25);
  const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 25, 50));

  const { data: claimed, error: claimError } = await admin.rpc("claim_notification_deliveries", {
    p_limit: limit,
    p_channels: channels,
  });
  if (claimError) return json({ error: claimError.message }, 500);

  const deliveries = (claimed || []) as ClaimedDelivery[];
  const results: Array<Record<string, unknown>> = [];

  async function finishMany(
    selected: ClaimedDelivery[],
    status: "pending" | "sent" | "failed" | "skipped",
    errorMessage: string | null,
    providerMessageId: string | null = null,
    scheduledFor?: string,
  ) {
    const now = new Date().toISOString();
    const values: Record<string, unknown> = {
      status,
      attempted_at: now,
      last_attempt_at: now,
      error_message: errorMessage,
      provider_message_id: providerMessageId,
      sent_at: status === "sent" ? now : null,
    };
    if (scheduledFor) values.scheduled_for = scheduledFor;
    await admin.from("notification_deliveries").update(values).in("id", selected.map((item) => item.delivery_id));
  }

  function retryDecision(selected: ClaimedDelivery[]) {
    const maxAttempt = Math.max(...selected.map((item) => item.attempt_count));
    if (maxAttempt >= 3) return { status: "failed" as const };
    const minutes = 5 * 2 ** Math.max(0, maxAttempt - 1);
    return { status: "pending" as const, scheduledFor: new Date(Date.now() + minutes * 60_000).toISOString() };
  }

  const hydrated: HydratedDelivery[] = [];
  for (const delivery of deliveries) {
    const { data: notification, error } = await admin
      .from("notifications")
      .select("id,company_id,user_id,title,body,severity,notification_type,entity_type,entity_id,companies(name)")
      .eq("id", delivery.notification_id)
      .maybeSingle();

    if (error || !notification) {
      await finishMany([delivery], "failed", error?.message || "notification_not_found");
      results.push({ id: delivery.delivery_id, status: "failed", reason: "notification_not_found" });
      continue;
    }
    hydrated.push({ delivery, notification: notification as NotificationContext });
  }

  const emailGroups = new Map<string, HydratedDelivery[]>();
  for (const item of hydrated.filter(({ delivery }) => delivery.channel === "email")) {
    const key = item.delivery.delivery_kind === "summary"
      ? `summary:${item.notification.company_id}:${item.notification.user_id}`
      : `instant:${item.delivery.delivery_id}`;
    emailGroups.set(key, [...(emailGroups.get(key) || []), item]);
  }

  for (const items of emailGroups.values()) {
    const selected = items.map(({ delivery }) => delivery);
    try {
      const { data: userData, error: userError } = await admin.auth.admin.getUserById(items[0].notification.user_id);
      const recipient = userData.user?.email?.trim();
      if (userError || !recipient) {
        await finishMany(selected, "skipped", userError?.message || "recipient_email_missing");
        results.push({ ids: selected.map((item) => item.delivery_id), channel: "email", status: "skipped" });
        continue;
      }

      const resendKey = Deno.env.get("RESEND_API_KEY")!;
      const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")!;
      const fromName = Deno.env.get("RESEND_FROM_NAME")?.trim() || "Prazor";
      const email = renderEmail(items);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": await idempotencyKey(items),
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [recipient],
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
      });

      if (!response.ok) {
        const errorMessage = await parseProviderError(response);
        const next = response.status === 429 || response.status >= 500 ? retryDecision(selected) : { status: "failed" as const };
        await finishMany(selected, next.status, `Resend ${response.status}: ${errorMessage}`, null, next.scheduledFor);
        results.push({ ids: selected.map((item) => item.delivery_id), channel: "email", status: next.status, http: response.status });
        continue;
      }

      const provider = await response.json().catch(() => ({}));
      await finishMany(selected, "sent", null, provider?.id || null);
      results.push({ ids: selected.map((item) => item.delivery_id), channel: "email", status: "sent", kind: selected[0].delivery_kind });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const next = retryDecision(selected);
      await finishMany(selected, next.status, message.slice(0, 900), null, next.scheduledFor);
      results.push({ ids: selected.map((item) => item.delivery_id), channel: "email", status: next.status });
    }
  }

  for (const item of hydrated.filter(({ delivery }) => delivery.channel === "whatsapp")) {
    const { delivery, notification } = item;
    try {
      const { data: profile } = await admin.from("profiles").select("phone").eq("id", notification.user_id).maybeSingle();
      const recipient = String(profile?.phone || "").replace(/\D/g, "");
      if (recipient.length < 10) {
        await finishMany([delivery], "skipped", "recipient_whatsapp_missing_or_invalid");
        results.push({ id: delivery.delivery_id, channel: "whatsapp", status: "skipped" });
        continue;
      }

      const graphVersion = Deno.env.get("WHATSAPP_GRAPH_VERSION")!;
      const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
      const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;
      const templateName = Deno.env.get("WHATSAPP_TEMPLATE_NAME")!;
      const language = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE")!;
      const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipient,
          type: "template",
          template: {
            name: templateName,
            language: { code: language },
            components: [{
              type: "body",
              parameters: [
                { type: "text", text: notification.title.slice(0, 900) },
                { type: "text", text: notification.body.slice(0, 900) },
              ],
            }],
          },
        }),
      });

      if (!response.ok) {
        const errorMessage = await parseProviderError(response);
        const next = response.status === 429 || response.status >= 500 ? retryDecision([delivery]) : { status: "failed" as const };
        await finishMany([delivery], next.status, `WhatsApp ${response.status}: ${errorMessage}`, null, next.scheduledFor);
        results.push({ id: delivery.delivery_id, channel: "whatsapp", status: next.status, http: response.status });
        continue;
      }

      const provider = await response.json().catch(() => ({}));
      await finishMany([delivery], "sent", null, provider?.messages?.[0]?.id || null);
      results.push({ id: delivery.delivery_id, channel: "whatsapp", status: "sent" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const next = retryDecision([delivery]);
      await finishMany([delivery], next.status, message.slice(0, 900), null, next.scheduledFor);
      results.push({ id: delivery.delivery_id, channel: "whatsapp", status: next.status });
    }
  }

  return json({ ok: true, processed: deliveries.length, configuredChannels: channels, results });
});
