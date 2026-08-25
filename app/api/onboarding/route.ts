import { NextResponse } from "next/server";
import { getAuthState } from "@/lib/supabase/session";
import { supabaseRest, supabaseRpc } from "@/lib/supabase/rest";
import {
  getFirstBranch,
  getFirstLocation,
  getPrimaryMembership,
  type Branch,
  type StockLocation,
} from "@/lib/prazor-data";

export async function POST(request: Request) {
  const auth = await getAuthState();
  if (auth.status !== "authenticated") {
    return NextResponse.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const companyName = String(body.companyName ?? "").trim();
  const branchName = String(body.branchName ?? "").trim();
  const locationName = String(body.locationName ?? "").trim();

  if (companyName.length < 2 || branchName.length < 2 || locationName.length < 2) {
    return NextResponse.json(
      { error: "Preencha empresa, unidade e local de estoque." },
      { status: 400 },
    );
  }

  try {
    let context = await getPrimaryMembership(auth.user.id, auth.accessToken);

    if (!context) {
      await supabaseRpc<string>("create_company", auth.accessToken, { p_name: companyName });
      context = await getPrimaryMembership(auth.user.id, auth.accessToken);
    }

    if (!context) throw new Error("Não foi possível criar a empresa.");

    let branch = await getFirstBranch(context.company.id, auth.accessToken);
    if (!branch) {
      const created = await supabaseRest<Branch[]>("branches", auth.accessToken, {
        method: "POST",
        prefer: "return=representation",
        body: {
          company_id: context.company.id,
          name: branchName,
          code: "MATRIZ",
          country: "BR",
        },
      });
      branch = created[0] ?? null;
    }

    if (!branch) throw new Error("Não foi possível criar a unidade.");

    let location = await getFirstLocation(context.company.id, branch.id, auth.accessToken);
    if (!location) {
      const created = await supabaseRest<StockLocation[]>("stock_locations", auth.accessToken, {
        method: "POST",
        prefer: "return=representation",
        body: {
          company_id: context.company.id,
          branch_id: branch.id,
          name: locationName,
          location_type: "stock",
        },
      });
      location = created[0] ?? null;
    }

    if (!location) throw new Error("Não foi possível criar o local de estoque.");
    return NextResponse.json({ ok: true, next: "/app" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível concluir a configuração.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
