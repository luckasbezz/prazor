import { NextResponse } from "next/server";
import { getPrimaryMembership } from "@/lib/prazor-data";
import { getAuthState } from "@/lib/supabase/session";
import { supabaseRest } from "@/lib/supabase/rest";

type PreferenceRow = {
  email_enabled: boolean;
  in_app_enabled: boolean;
  thresholds: number[];
  daily_summary_enabled: boolean;
  daily_summary_time: string;
  timezone: string;
};

const allowedTimezones = new Set([
  "America/Recife",
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Rio_Branco",
  "America/Noronha",
]);

export async function POST(request: Request) {
  const auth = await getAuthState();
  if (auth.status !== "authenticated") {
    return NextResponse.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  }

  const context = await getPrimaryMembership(auth.user.id, auth.accessToken);
  if (!context) {
    return NextResponse.json({ error: "Conclua a configuração da empresa primeiro." }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.inAppEnabled !== "boolean" || typeof body.emailEnabled !== "boolean" || typeof body.dailySummaryEnabled !== "boolean") {
    return NextResponse.json({ error: "Revise os canais selecionados." }, { status: 400 });
  }

  const thresholds = validateThresholds(body.thresholds);
  if (!thresholds) {
    return NextResponse.json({ error: "Selecione entre 1 e 10 antecedências válidas." }, { status: 400 });
  }

  const dailySummaryTime = String(body.dailySummaryTime ?? "");
  if (!isValidTime(dailySummaryTime)) {
    return NextResponse.json({ error: "Informe um horário válido para o resumo." }, { status: 400 });
  }

  const timezone = String(body.timezone ?? "");
  if (!allowedTimezones.has(timezone)) {
    return NextResponse.json({ error: "Selecione um fuso horário disponível." }, { status: 400 });
  }

  const dailySummaryEnabled = body.emailEnabled && body.dailySummaryEnabled;

  try {
    const saved = await supabaseRest<PreferenceRow[]>(
      "notification_preferences?on_conflict=company_id%2Cuser_id&select=email_enabled,in_app_enabled,thresholds,daily_summary_enabled,daily_summary_time,timezone",
      auth.accessToken,
      {
        method: "POST",
        body: {
          company_id: context.company.id,
          user_id: auth.user.id,
          email_enabled: body.emailEnabled,
          in_app_enabled: body.inAppEnabled,
          thresholds,
          daily_summary_enabled: dailySummaryEnabled,
          daily_summary_time: dailySummaryTime,
          timezone,
        },
        prefer: "resolution=merge-duplicates,return=representation",
      },
    );

    const preference = saved[0];
    if (!preference) {
      return NextResponse.json({ error: "As preferências não puderam ser confirmadas." }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      preference: {
        emailEnabled: preference.email_enabled,
        inAppEnabled: preference.in_app_enabled,
        thresholds: preference.thresholds.map(Number).sort((left, right) => left - right),
        dailySummaryEnabled: preference.daily_summary_enabled,
        dailySummaryTime: preference.daily_summary_time.slice(0, 5),
        timezone: preference.timezone,
      },
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível salvar suas preferências agora." }, { status: 400 });
  }
}

function validateThresholds(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) return null;
  if (value.some((item) => typeof item !== "number" || !Number.isInteger(item) || item < 0 || item > 365)) return null;
  return [...new Set(value)].sort((left, right) => left - right);
}

function isValidTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}
