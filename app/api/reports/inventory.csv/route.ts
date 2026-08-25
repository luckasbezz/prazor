import { NextResponse } from "next/server";
import { getPrimaryMembership } from "@/lib/prazor-data";
import { loadInventoryReport, normalizeReportPeriod } from "@/lib/reporting";
import { getAuthState } from "@/lib/supabase/session";

const moneyNumber = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantityNumber = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

export async function GET(request: Request) {
  const auth = await getAuthState();
  if (auth.status !== "authenticated") {
    return NextResponse.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  }

  const context = await getPrimaryMembership(auth.user.id, auth.accessToken);
  if (!context) {
    return NextResponse.json({ error: "Conclua a configuração da empresa primeiro." }, { status: 409 });
  }

  const url = new URL(request.url);
  const report = await loadInventoryReport({
    companyId: context.company.id,
    accessToken: auth.accessToken,
    period: normalizeReportPeriod(url.searchParams.get("periodo")),
    branchId: url.searchParams.get("filial") ?? "all",
  });
  const branchLabel = report.branchId === "all" ? "Todas as filiais" : report.branches.find((item) => item.id === report.branchId)?.name ?? "Todas as filiais";
  const rows = [
    ["Prazor — Relatório gerencial de estoque"],
    ["Empresa", context.company.name],
    ["Período", report.periodLabel],
    ["Filial", branchLabel],
    ["Gerado em", formatDateTime(new Date())],
    [],
    ["RESUMO"],
    ["Valor em estoque", moneyNumber.format(report.metrics.inventoryValue)],
    ["Valor em risco", moneyNumber.format(report.metrics.riskValue)],
    ["Perdas no período", moneyNumber.format(report.metrics.lossValue)],
    ["Recuperado em trocas", moneyNumber.format(report.metrics.recoveredValue)],
    ["Em recuperação", moneyNumber.format(report.metrics.openExchangeValue)],
    ["Taxa de recuperação", `${report.metrics.recoveryRate}%`],
    [],
    ["ESTOQUE ATUAL"],
    ["Produto", "SKU", "Lote", "Validade", "Situação", "Filial", "Local", "Quantidade", "Unidade", "Valor em estoque", "Valor em risco"],
    ...report.inventoryRows
      .sort((a, b) => b.riskValue - a.riskValue || a.productName.localeCompare(b.productName, "pt-BR"))
      .map((item) => [
        item.productName,
        item.sku ?? "",
        item.batchCode ?? "",
        formatDate(item.expirationDate),
        statusLabel(item.status),
        item.branchName,
        item.locationName,
        quantityNumber.format(item.quantity),
        item.unit,
        moneyNumber.format(item.inventoryValue),
        moneyNumber.format(item.riskValue),
      ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
  const dateKey = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="prazor-relatorio-${dateKey}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Recife" }).format(new Date(`${value}T12:00:00Z`));
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Recife" }).format(value);
}

function statusLabel(status: string) {
  return ({ expired: "Vencido", today: "Vence hoje", critical: "Crítico", attention: "Atenção", monitoring: "Monitoramento", safe: "Saudável" } as Record<string, string>)[status] ?? status;
}
