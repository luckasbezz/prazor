import { supabaseRest } from "./supabase/rest";

export type ReportPeriod = "30" | "90" | "180" | "365" | "all";

export type ReportInventoryRow = {
  id: string;
  productName: string;
  sku: string | null;
  unit: string;
  batchCode: string | null;
  expirationDate: string;
  status: "expired" | "today" | "critical" | "attention" | "monitoring" | "safe";
  branchId: string;
  branchName: string;
  locationName: string;
  quantity: number;
  inventoryValue: number;
  riskValue: number;
};

export type InventoryReportSnapshot = {
  period: ReportPeriod;
  periodLabel: string;
  branchId: string;
  branches: Array<{ id: string; name: string }>;
  inventoryRows: ReportInventoryRow[];
  metrics: {
    inventoryValue: number;
    riskValue: number;
    lossValue: number;
    recoveredValue: number;
    openExchangeValue: number;
    recoveryRate: number;
    lossCount: number;
    completedExchangeCount: number;
    criticalBatchCount: number;
  };
  expiryBands: Array<{ id: string; label: string; value: number; batches: number; tone: string; percent: number }>;
  trend: Array<{ label: string; loss: number; recovered: number; lossPercent: number; recoveredPercent: number }>;
  topRisk: Array<{ productName: string; sku: string | null; batches: number; quantity: number; value: number }>;
  lossReasons: Array<{ label: string; count: number; value: number; percent: number }>;
  movements: Array<{ id: string; label: string; count: number; quantity: number; percent: number }>;
};

type ProductRow = { id: string; name: string; sku: string | null; unit: string; cost_price: number | string | null };
type BatchRow = { id: string; product_id: string; batch_code: string | null; expiration_date: string; cost_price: number | string | null };
type ExpiryRow = { batch_id: string; expiry_status: ReportInventoryRow["status"] };
type BalanceRow = { batch_id: string; stock_location_id: string; quantity: number | string };
type LocationRow = { id: string; name: string; branch_id: string };
type BranchRow = { id: string; name: string };
type LossRow = { id: string; batch_id: string; stock_location_id: string; reason_id: string | null; quantity: number | string; total_value: number | string | null; created_at: string };
type ReasonRow = { id: string; name: string };
type MovementRow = { id: string; movement_type: string; quantity: number | string; from_location_id: string | null; to_location_id: string | null; created_at: string };
type ExchangeRow = { id: string; status: string; completed_at: string | null; created_at: string };
type ExchangeLineRow = { exchange_request_id: string; stock_location_id: string | null; total_value: number | string | null };
type ExchangeResolutionRow = { exchange_request_id: string; recovered_value: number | string; created_at: string };

const riskStatuses = new Set<ReportInventoryRow["status"]>(["expired", "today", "critical", "attention"]);

export async function loadInventoryReport({
  companyId,
  accessToken,
  period,
  branchId,
}: {
  companyId: string;
  accessToken: string;
  period: ReportPeriod;
  branchId: string;
}): Promise<InventoryReportSnapshot> {
  const encodedCompanyId = encodeURIComponent(companyId);
  const [products, batches, expiryRows, balances, locations, branches, losses, reasons, movementRows, exchangeRows, exchangeLines, exchangeResolutions] = await Promise.all([
    supabaseRest<ProductRow[]>(`products?select=id,name,sku,unit,cost_price&company_id=eq.${encodedCompanyId}&limit=3000`, accessToken),
    supabaseRest<BatchRow[]>(`batches?select=id,product_id,batch_code,expiration_date,cost_price&company_id=eq.${encodedCompanyId}&limit=5000`, accessToken),
    supabaseRest<ExpiryRow[]>(`v_batch_expiry?select=batch_id,expiry_status&company_id=eq.${encodedCompanyId}&quantity=gt.0&limit=5000`, accessToken),
    supabaseRest<BalanceRow[]>(`inventory_balances?select=batch_id,stock_location_id,quantity&company_id=eq.${encodedCompanyId}&quantity=gt.0&limit=8000`, accessToken),
    supabaseRest<LocationRow[]>(`stock_locations?select=id,name,branch_id&company_id=eq.${encodedCompanyId}&active=eq.true&order=name.asc&limit=1000`, accessToken),
    supabaseRest<BranchRow[]>(`branches?select=id,name&company_id=eq.${encodedCompanyId}&active=eq.true&order=name.asc&limit=200`, accessToken),
    supabaseRest<LossRow[]>(`losses?select=id,batch_id,stock_location_id,reason_id,quantity,total_value,created_at&company_id=eq.${encodedCompanyId}&order=created_at.desc&limit=5000`, accessToken),
    supabaseRest<ReasonRow[]>(`loss_reasons?select=id,name&company_id=eq.${encodedCompanyId}&limit=500`, accessToken),
    supabaseRest<MovementRow[]>(`inventory_movements?select=id,movement_type,quantity,from_location_id,to_location_id,created_at&company_id=eq.${encodedCompanyId}&order=created_at.desc&limit=8000`, accessToken),
    supabaseRest<ExchangeRow[]>(`exchange_requests?select=id,status,completed_at,created_at&company_id=eq.${encodedCompanyId}&order=created_at.desc&limit=5000`, accessToken),
    supabaseRest<ExchangeLineRow[]>(`exchange_request_items?select=exchange_request_id,stock_location_id,total_value&company_id=eq.${encodedCompanyId}&limit=8000`, accessToken),
    supabaseRest<ExchangeResolutionRow[]>(`exchange_request_resolutions?select=exchange_request_id,recovered_value,created_at&company_id=eq.${encodedCompanyId}&limit=5000`, accessToken),
  ]);

  const productById = new Map(products.map((item) => [item.id, item]));
  const batchById = new Map(batches.map((item) => [item.id, item]));
  const statusByBatchId = new Map(expiryRows.map((item) => [item.batch_id, item.expiry_status]));
  const branchById = new Map(branches.map((item) => [item.id, item.name]));
  const locationById = new Map(locations.map((item) => [item.id, item]));
  const reasonById = new Map(reasons.map((item) => [item.id, item.name]));
  const validBranchId = branches.some((branch) => branch.id === branchId) ? branchId : "all";

  const inventoryRows: ReportInventoryRow[] = balances.flatMap((balance) => {
    const batch = batchById.get(balance.batch_id);
    const product = batch ? productById.get(batch.product_id) : null;
    const location = locationById.get(balance.stock_location_id);
    if (!batch || !product || !location || (validBranchId !== "all" && location.branch_id !== validBranchId)) return [];
    const quantity = Number(balance.quantity);
    const unitCost = Number(batch.cost_price ?? product.cost_price ?? 0);
    const inventoryValue = quantity * unitCost;
    const status = statusByBatchId.get(batch.id) ?? "safe";
    return [{
      id: `${batch.id}:${location.id}`,
      productName: product.name,
      sku: product.sku,
      unit: product.unit,
      batchCode: batch.batch_code,
      expirationDate: batch.expiration_date,
      status,
      branchId: location.branch_id,
      branchName: branchById.get(location.branch_id) ?? "Unidade",
      locationName: location.name,
      quantity,
      inventoryValue,
      riskValue: riskStatuses.has(status) ? inventoryValue : 0,
    }];
  });

  const cutoff = periodCutoff(period);
  const locationMatches = (locationId: string | null) => {
    if (validBranchId === "all") return true;
    return Boolean(locationId && locationById.get(locationId)?.branch_id === validBranchId);
  };
  const dateMatches = (value: string | null) => !cutoff || Boolean(value && new Date(value) >= cutoff);
  const filteredLosses = losses.filter((item) => locationMatches(item.stock_location_id) && dateMatches(item.created_at));
  const filteredMovements = movementRows.filter((item) => {
    const branchMatch = validBranchId === "all" || locationMatches(item.from_location_id) || locationMatches(item.to_location_id);
    return branchMatch && dateMatches(item.created_at);
  });
  const exchangeById = new Map(exchangeRows.map((item) => [item.id, item]));
  const exchangeLineByRequestId = new Map(exchangeLines.map((item) => [item.exchange_request_id, item]));
  const filteredExchangeLines = exchangeLines.filter((line) => locationMatches(line.stock_location_id));
  const recoveredResolutions = exchangeResolutions.filter((resolution) => {
    const request = exchangeById.get(resolution.exchange_request_id);
    const line = exchangeLineByRequestId.get(resolution.exchange_request_id);
    return Boolean(request?.status === "completed" && line && locationMatches(line.stock_location_id) && dateMatches(request.completed_at ?? resolution.created_at));
  });
  const openExchangeLines = filteredExchangeLines.filter((line) => {
    const status = exchangeById.get(line.exchange_request_id)?.status;
    return Boolean(status && !["rejected", "completed", "cancelled"].includes(status));
  });

  const inventoryValue = sum(inventoryRows.map((item) => item.inventoryValue));
  const riskValue = sum(inventoryRows.map((item) => item.riskValue));
  const lossValue = sum(filteredLosses.map((item) => Number(item.total_value ?? 0)));
  const recoveredValue = sum(recoveredResolutions.map((item) => Number(item.recovered_value ?? 0)));
  const resolvedValue = lossValue + recoveredValue;
  const completedExchangeIds = new Set(recoveredResolutions.map((item) => item.exchange_request_id));
  const criticalBatchIds = new Set(inventoryRows.filter((item) => ["expired", "today", "critical"].includes(item.status)).map((item) => item.id.split(":")[0]));

  const expiryDefinitions = [
    { id: "critical", label: "Vencidos e críticos", statuses: ["expired", "today", "critical"], tone: "danger" },
    { id: "attention", label: "Em atenção", statuses: ["attention"], tone: "warning" },
    { id: "monitoring", label: "Monitoramento", statuses: ["monitoring"], tone: "monitoring" },
    { id: "safe", label: "Estoque saudável", statuses: ["safe"], tone: "safe" },
  ];
  const expiryBands = expiryDefinitions.map((definition) => {
    const rows = inventoryRows.filter((item) => definition.statuses.includes(item.status));
    const value = sum(rows.map((item) => item.inventoryValue));
    return {
      id: definition.id,
      label: definition.label,
      value,
      batches: new Set(rows.map((item) => item.id.split(":")[0])).size,
      tone: definition.tone,
      percent: inventoryValue > 0 ? (value / inventoryValue) * 100 : 0,
    };
  });

  const productRisk = new Map<string, { productName: string; sku: string | null; batchIds: Set<string>; quantity: number; value: number }>();
  for (const row of inventoryRows.filter((item) => item.riskValue > 0)) {
    const key = `${row.productName}\u0000${row.sku ?? ""}`;
    const current = productRisk.get(key) ?? { productName: row.productName, sku: row.sku, batchIds: new Set<string>(), quantity: 0, value: 0 };
    current.batchIds.add(row.id.split(":")[0]);
    current.quantity += row.quantity;
    current.value += row.riskValue;
    productRisk.set(key, current);
  }
  const topRisk = [...productRisk.values()]
    .map((item) => ({ productName: item.productName, sku: item.sku, batches: item.batchIds.size, quantity: item.quantity, value: item.value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const lossReasonMap = new Map<string, { count: number; value: number }>();
  for (const loss of filteredLosses) {
    const label = loss.reason_id ? reasonById.get(loss.reason_id) ?? "Motivo arquivado" : "Não informado";
    const current = lossReasonMap.get(label) ?? { count: 0, value: 0 };
    current.count += 1;
    current.value += Number(loss.total_value ?? 0);
    lossReasonMap.set(label, current);
  }
  const lossReasonMax = Math.max(0, ...[...lossReasonMap.values()].map((item) => item.value));
  const lossReasons = [...lossReasonMap.entries()]
    .map(([label, item]) => ({ label, ...item, percent: lossReasonMax > 0 ? (item.value / lossReasonMax) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const movementDefinitions = [
    { id: "entry", label: "Entradas", types: ["entry", "adjustment_in", "return"] },
    { id: "outbound", label: "Saídas", types: ["sale", "adjustment_out"] },
    { id: "transfer", label: "Transferências", types: ["transfer"] },
    { id: "loss", label: "Perdas", types: ["loss"] },
    { id: "exchange", label: "Trocas", types: ["exchange"] },
  ];
  const movementMax = Math.max(0, ...movementDefinitions.map((definition) => filteredMovements.filter((item) => definition.types.includes(item.movement_type)).length));
  const movements = movementDefinitions.map((definition) => {
    const rows = filteredMovements.filter((item) => definition.types.includes(item.movement_type));
    return {
      id: definition.id,
      label: definition.label,
      count: rows.length,
      quantity: sum(rows.map((item) => Number(item.quantity))),
      percent: movementMax > 0 ? (rows.length / movementMax) * 100 : 0,
    };
  });

  const trend = buildTrend(period, filteredLosses, recoveredResolutions, exchangeById);

  return {
    period,
    periodLabel: reportPeriodLabel(period),
    branchId: validBranchId,
    branches,
    inventoryRows,
    metrics: {
      inventoryValue,
      riskValue,
      lossValue,
      recoveredValue,
      openExchangeValue: sum(openExchangeLines.map((item) => Number(item.total_value ?? 0))),
      recoveryRate: resolvedValue > 0 ? Math.round((recoveredValue / resolvedValue) * 100) : 0,
      lossCount: filteredLosses.length,
      completedExchangeCount: completedExchangeIds.size,
      criticalBatchCount: criticalBatchIds.size,
    },
    expiryBands,
    trend,
    topRisk,
    lossReasons,
    movements,
  };
}

export function normalizeReportPeriod(value: string | null | undefined): ReportPeriod {
  return (["30", "90", "180", "365", "all"] as const).includes(value as ReportPeriod) ? value as ReportPeriod : "90";
}

export function reportPeriodLabel(period: ReportPeriod) {
  return ({ "30": "Últimos 30 dias", "90": "Últimos 90 dias", "180": "Últimos 6 meses", "365": "Últimos 12 meses", all: "Todo o histórico" } as const)[period];
}

function periodCutoff(period: ReportPeriod) {
  if (period === "all") return null;
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - Number(period) + 1);
  return cutoff;
}

function buildTrend(period: ReportPeriod, losses: LossRow[], recoveredResolutions: ExchangeResolutionRow[], exchanges: Map<string, ExchangeRow>) {
  const bucketCount = period === "30" ? 5 : period === "90" ? 3 : period === "180" ? 6 : 12;
  const buckets = period === "30" ? weeklyBuckets(bucketCount) : monthlyBuckets(bucketCount);
  for (const loss of losses) {
    const bucket = buckets.find((item) => isWithin(new Date(loss.created_at), item.start, item.end));
    if (bucket) bucket.loss += Number(loss.total_value ?? 0);
  }
  for (const resolution of recoveredResolutions) {
    const request = exchanges.get(resolution.exchange_request_id);
    const date = request ? new Date(request.completed_at ?? resolution.created_at) : null;
    const bucket = date ? buckets.find((item) => isWithin(date, item.start, item.end)) : null;
    if (bucket) bucket.recovered += Number(resolution.recovered_value ?? 0);
  }
  const max = Math.max(0, ...buckets.flatMap((item) => [item.loss, item.recovered]));
  return buckets.map((item) => ({
    label: item.label,
    loss: item.loss,
    recovered: item.recovered,
    lossPercent: max > 0 ? (item.loss / max) * 100 : 0,
    recoveredPercent: max > 0 ? (item.recovered / max) * 100 : 0,
  }));
}

function monthlyBuckets(count: number) {
  const formatter = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "America/Recife" });
  const now = new Date();
  const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return Array.from({ length: count }, (_, index) => {
    const offset = count - index - 1;
    const start = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() - offset, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    return { label: formatter.format(start).replace(".", ""), start, end, loss: 0, recovered: 0 };
  });
}

function weeklyBuckets(count: number) {
  const formatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Recife" });
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  return Array.from({ length: count }, (_, index) => {
    const offset = count - index - 1;
    const bucketEnd = new Date(end);
    bucketEnd.setUTCDate(bucketEnd.getUTCDate() - offset * 7);
    const bucketStart = new Date(bucketEnd);
    bucketStart.setUTCDate(bucketStart.getUTCDate() - 7);
    bucketStart.setUTCHours(0, 0, 0, 0);
    return { label: formatter.format(bucketStart).replace(".", ""), start: bucketStart, end: bucketEnd, loss: 0, recovered: 0 };
  });
}

function isWithin(value: Date, start: Date, end: Date) {
  return value >= start && value < end;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
