import { NextResponse } from "next/server";
import { getPrimaryMembership } from "@/lib/prazor-data";
import { getAuthState } from "@/lib/supabase/session";
import { supabaseRest } from "@/lib/supabase/rest";

type NotificationIdRow = { id: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request) {
  const auth = await getAuthState();
  if (auth.status !== "authenticated") {
    return NextResponse.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  }

  const context = await getPrimaryMembership(auth.user.id, auth.accessToken);
  if (!context) {
    return NextResponse.json({ error: "Conclua a configuração da empresa primeiro." }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const companyId = encodeURIComponent(context.company.id);
  const userId = encodeURIComponent(auth.user.id);

  try {
    if (action === "mark_all_read") {
      const readAt = new Date().toISOString();
      const updated = await supabaseRest<NotificationIdRow[]>(
        `notifications?select=id&company_id=eq.${companyId}&user_id=eq.${userId}&read_at=is.null`,
        auth.accessToken,
        { method: "PATCH", body: { read_at: readAt }, prefer: "return=representation" },
      );

      return NextResponse.json({ ok: true, ids: updated.map((item) => item.id), readAt });
    }

    if (action !== "mark_read" && action !== "mark_unread") {
      return NextResponse.json({ error: "Ação de notificação inválida." }, { status: 400 });
    }

    const notificationId = String(body.notificationId ?? "");
    if (!UUID_PATTERN.test(notificationId)) {
      return NextResponse.json({ error: "Notificação inválida." }, { status: 400 });
    }

    const readAt = action === "mark_read" ? new Date().toISOString() : null;
    const updated = await supabaseRest<NotificationIdRow[]>(
      `notifications?select=id&id=eq.${encodeURIComponent(notificationId)}&company_id=eq.${companyId}&user_id=eq.${userId}`,
      auth.accessToken,
      { method: "PATCH", body: { read_at: readAt }, prefer: "return=representation" },
    );

    if (!updated.length) {
      return NextResponse.json({ error: "Notificação não encontrada no seu acesso." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, ids: [notificationId], readAt });
  } catch {
    return NextResponse.json({ error: "Não foi possível atualizar a notificação agora." }, { status: 400 });
  }
}
