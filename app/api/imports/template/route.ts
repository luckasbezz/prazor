import { buildImportTemplate } from "@/lib/import-catalog";
import { getAuthState } from "@/lib/supabase/session";

export async function GET() {
  const auth = await getAuthState();
  if (auth.status !== "authenticated") return new Response("Sessão expirada.", { status: 401 });

  const workbook = buildImportTemplate();
  const body = workbook.slice().buffer as ArrayBuffer;
  return new Response(body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'attachment; filename="modelo-importacao-prazor.xlsx"',
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
