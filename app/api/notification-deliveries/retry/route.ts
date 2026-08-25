import { NextResponse } from "next/server";
import { getPrimaryMembership } from "@/lib/prazor-data";
import { getAuthState } from "@/lib/supabase/session";
import { supabaseRpc } from "@/lib/supabase/rest";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const deliveryId = String(body.deliveryId ?? "");
  if (!UUID_PATTERN.test(deliveryId)) {
    return NextResponse.json({ error: "Entrega inválida." }, { status: 400 });
  }

  try {
    const retried = await supabaseRpc<boolean>("retry_notification_delivery", auth.accessToken, {
      p_delivery_id: deliveryId,
    });
    if (!retried) {
      return NextResponse.json({ error: "Esta entrega não pode ser reenviada no seu acesso." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, deliveryId });
  } catch {
    return NextResponse.json({ error: "Não foi possível recolocar a entrega na fila." }, { status: 400 });
  }
}
