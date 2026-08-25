import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import {
  ExchangeCenter,
  type ExchangeActivityItem,
  type ExchangeCandidate,
  type ExchangeInitialFilters,
  type ExchangeRequestItem,
} from "@/components/exchange-center";
import { requireAppContext } from "@/lib/app-context";
import { supabaseRest } from "@/lib/supabase/rest";

export const dynamic = "force-dynamic";

type ProductRow = { id: string; name: string; sku: string | null; unit: string };
type BatchRow = { id: string; product_id: string; supplier_id: string | null; batch_code: string | null; expiration_date: string; cost_price: number | string | null };
type BalanceRow = { batch_id: string; stock_location_id: string; quantity: number | string };
type LocationRow = { id: string; name: string; branch_id: string };
type BranchRow = { id: string; name: string };
type SupplierRow = { id: string; name: string; active: boolean };
type AgreementRow = {
  id: string;
  supplier_id: string;
  title: string;
  agreement_code: string | null;
  minimum_days_before_expiration: number;
  exchange_outcome: "replacement" | "credit" | "either";
  requires_invoice: boolean;
  requires_photos: boolean;
  requires_prior_authorization: boolean;
  freight_responsibility: "supplier" | "company" | "shared";
  active: boolean;
  valid_from: string | null;
  valid_until: string | null;
};
type RequestRow = {
  id: string;
  supplier_id: string;
  supplier_agreement_id: string | null;
  agreement_snapshot: Record<string, unknown>;
  status: ExchangeRequestItem["status"];
  protocol: string | null;
  notes: string | null;
  requested_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};
type RequestLineRow = { id: string; exchange_request_id: string; batch_id: string; stock_location_id: string | null; quantity: number | string; unit_value: number | string; total_value: number | string | null };
type SettingsRow = { expiry_monitoring_days: number };
type NotificationRow = { id: string };
type AuditRow = { id: number; actor_user_id: string | null; action: string; before_data: Record<string, unknown> | null; after_data: Record<string, unknown> | null; created_at: string };

export default async function ExchangesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { auth, context } = await requireAppContext("/app/fornecedores/trocas");
  const companyId = encodeURIComponent(context.company.id);
  const canManage = ["owner", "admin", "manager"].includes(context.membership.role);
  const canViewAudit = ["owner", "admin"].includes(context.membership.role);
  const auditPromise = canViewAudit
    ? supabaseRest<AuditRow[]>(`audit_logs?select=id,actor_user_id,action,before_data,after_data,created_at&company_id=eq.${companyId}&entity_type=eq.exchange_requests&order=created_at.desc&limit=24`, auth.accessToken)
    : Promise.resolve([] as AuditRow[]);

  const [products, batches, balances, locations, branches, suppliers, agreements, requests, requestLines, settings, unread, auditRows] = await Promise.all([
    supabaseRest<ProductRow[]>(`products?select=id,name,sku,unit&company_id=eq.${companyId}&active=eq.true&order=name.asc&limit=2000`, auth.accessToken),
    supabaseRest<BatchRow[]>(`batches?select=id,product_id,supplier_id,batch_code,expiration_date,cost_price&company_id=eq.${companyId}&status=eq.active&order=expiration_date.asc&limit=3000`, auth.accessToken),
    supabaseRest<BalanceRow[]>(`inventory_balances?select=batch_id,stock_location_id,quantity&company_id=eq.${companyId}&quantity=gt.0&limit=5000`, auth.accessToken),
    supabaseRest<LocationRow[]>(`stock_locations?select=id,name,branch_id&company_id=eq.${companyId}&active=eq.true&order=name.asc&limit=500`, auth.accessToken),
    supabaseRest<BranchRow[]>(`branches?select=id,name&company_id=eq.${companyId}&active=eq.true&order=name.asc&limit=100`, auth.accessToken),
    supabaseRest<SupplierRow[]>(`suppliers?select=id,name,active&company_id=eq.${companyId}&order=name.asc&limit=1000`, auth.accessToken),
    supabaseRest<AgreementRow[]>(`supplier_agreements?select=id,supplier_id,title,agreement_code,minimum_days_before_expiration,exchange_outcome,requires_invoice,requires_photos,requires_prior_authorization,freight_responsibility,active,valid_from,valid_until&company_id=eq.${companyId}&order=updated_at.desc&limit=1000`, auth.accessToken),
    supabaseRest<RequestRow[]>(`exchange_requests?select=id,supplier_id,supplier_agreement_id,agreement_snapshot,status,protocol,notes,requested_at,completed_at,created_at,updated_at&company_id=eq.${companyId}&order=created_at.desc&limit=1500`, auth.accessToken),
    supabaseRest<RequestLineRow[]>(`exchange_request_items?select=id,exchange_request_id,batch_id,stock_location_id,quantity,unit_value,total_value&company_id=eq.${companyId}&limit=3000`, auth.accessToken),
    supabaseRest<SettingsRow[]>(`company_settings?select=expiry_monitoring_days&company_id=eq.${companyId}&limit=1`, auth.accessToken),
    supabaseRest<NotificationRow[]>(`notifications?select=id&company_id=eq.${companyId}&user_id=eq.${encodeURIComponent(auth.user.id)}&read_at=is.null&limit=1000`, auth.accessToken),
    auditPromise,
  ]);

  const productById = new Map(products.map((item) => [item.id, item]));
  const batchById = new Map(batches.map((item) => [item.id, item]));
  const branchById = new Map(branches.map((item) => [item.id, item.name]));
  const locationById = new Map(locations.map((item) => [item.id, { name: item.name, branchName: branchById.get(item.branch_id) ?? "Unidade" }]));
  const supplierById = new Map(suppliers.map((item) => [item.id, item]));
  const agreementBySupplierId = new Map<string, AgreementRow[]>();
  for (const agreement of agreements) {
    const current = agreementBySupplierId.get(agreement.supplier_id) ?? [];
    current.push(agreement);
    agreementBySupplierId.set(agreement.supplier_id, current);
  }

  const activeReservedStatuses = new Set(["preparing", "requested", "accepted"]);
  const requestById = new Map(requests.map((item) => [item.id, item]));
  const reservedBySource = new Map<string, number>();
  for (const line of requestLines) {
    const request = requestById.get(line.exchange_request_id);
    if (!request || !line.stock_location_id || !activeReservedStatuses.has(request.status)) continue;
    const sourceKey = keyFor(line.batch_id, line.stock_location_id);
    reservedBySource.set(sourceKey, (reservedBySource.get(sourceKey) ?? 0) + Number(line.quantity));
  }

  const candidates: ExchangeCandidate[] = balances.flatMap((balance) => {
    const batch = batchById.get(balance.batch_id);
    const product = batch ? productById.get(batch.product_id) : null;
    const location = locationById.get(balance.stock_location_id);
    if (!batch || !product || !location) return [];
    const supplier = batch.supplier_id ? supplierById.get(batch.supplier_id) : null;
    const sourceKey = keyFor(batch.id, balance.stock_location_id);
    const reservedQuantity = reservedBySource.get(sourceKey) ?? 0;
    return [{
      id: sourceKey,
      batchId: batch.id,
      locationId: balance.stock_location_id,
      productName: product.name,
      sku: product.sku,
      unit: product.unit,
      batchCode: batch.batch_code,
      expirationDate: batch.expiration_date,
      quantity: Number(balance.quantity),
      reservedQuantity,
      availableQuantity: Math.max(0, Number(balance.quantity) - reservedQuantity),
      unitValue: Number(batch.cost_price ?? 0),
      locationName: location.name,
      branchName: location.branchName,
      supplierId: supplier?.id ?? null,
      supplierName: supplier?.name ?? null,
      supplierActive: supplier?.active ?? false,
      agreements: (supplier ? agreementBySupplierId.get(supplier.id) ?? [] : []).map((agreement) => ({
        id: agreement.id,
        title: agreement.title,
        agreementCode: agreement.agreement_code,
        minimumDays: agreement.minimum_days_before_expiration,
        exchangeOutcome: agreement.exchange_outcome,
        requiresInvoice: agreement.requires_invoice,
        requiresPhotos: agreement.requires_photos,
        requiresPriorAuthorization: agreement.requires_prior_authorization,
        freightResponsibility: agreement.freight_responsibility,
        active: agreement.active,
        validFrom: agreement.valid_from,
        validUntil: agreement.valid_until,
      })),
    }];
  });

  const lineByRequestId = new Map(requestLines.map((line) => [line.exchange_request_id, line]));
  const exchangeRequests: ExchangeRequestItem[] = requests.flatMap((request) => {
    const line = lineByRequestId.get(request.id);
    const batch = line ? batchById.get(line.batch_id) : null;
    const product = batch ? productById.get(batch.product_id) : null;
    const supplier = supplierById.get(request.supplier_id);
    const location = line?.stock_location_id ? locationById.get(line.stock_location_id) : null;
    if (!line) return [];
    return [{
      id: request.id,
      supplierId: request.supplier_id,
      supplierName: supplier?.name ?? "Fornecedor não disponível",
      agreementId: request.supplier_agreement_id,
      agreementSnapshot: request.agreement_snapshot,
      status: request.status,
      protocol: request.protocol,
      notes: request.notes,
      requestedAt: request.requested_at,
      completedAt: request.completed_at,
      createdAt: request.created_at,
      updatedAt: request.updated_at,
      batchId: line.batch_id,
      productName: product?.name ?? "Produto não disponível",
      sku: product?.sku ?? null,
      unit: product?.unit ?? "un",
      batchCode: batch?.batch_code ?? null,
      expirationDate: batch?.expiration_date ?? null,
      locationName: location?.name ?? "Local não disponível",
      branchName: location?.branchName ?? "Unidade",
      quantity: Number(line.quantity),
      unitValue: Number(line.unit_value),
      totalValue: Number(line.total_value ?? Number(line.quantity) * Number(line.unit_value)),
    }];
  });

  const activities: ExchangeActivityItem[] = auditRows.map((row) => ({
    id: String(row.id),
    title: activityTitle(row),
    detail: activityDetail(row),
    createdAt: row.created_at,
    actorLabel: row.actor_user_id === auth.user.id ? "Você" : "Outro responsável",
  }));
  const params = await searchParams;
  const initialFilters: ExchangeInitialFilters = {
    view: singleParam(params.visao),
    query: singleParam(params.busca),
    status: singleParam(params.estado),
  };

  return (
    <AppFrame active="exchanges" companyName={context.company.name} userLabel={auth.user.user_metadata?.full_name ?? auth.user.email} notificationCount={unread.length}>
      <div className="app-page exchanges-page">
        <div className="app-heading-row exchanges-heading">
          <div><span>Fornecedores / Recuperação</span><h1>Solicitações de troca</h1><p>Transforme lotes em risco em protocolos rastreáveis, respeitando cada acordo.</p></div>
          <div className="app-primary-actions"><Link className="secondary-action link-action" href="/app/fornecedores">↔ Ver acordos</Link><Link className="secondary-action link-action" href="/app/validades">◷ Ver validades</Link></div>
        </div>
        <div className="real-data-note"><span>●</span> Elegibilidade, reserva e etapas calculadas com dados reais de <strong>{context.company.name}</strong>.</div>
        <ExchangeCenter
          activities={activities}
          canManage={canManage}
          canViewAudit={canViewAudit}
          candidates={candidates}
          initialFilters={initialFilters}
          monitoringDays={settings[0]?.expiry_monitoring_days ?? 90}
          requests={exchangeRequests}
          today={dateKeyInRecife(new Date())}
        />
      </div>
    </AppFrame>
  );
}

function keyFor(batchId: string, locationId: string) {
  return `${batchId}:${locationId}`;
}

function activityTitle(row: AuditRow) {
  if (row.action === "insert") return "Solicitação criada";
  const beforeStatus = String(row.before_data?.status ?? "");
  const afterStatus = String(row.after_data?.status ?? "");
  return beforeStatus !== afterStatus ? `Etapa alterada para ${statusLabel(afterStatus)}` : "Solicitação atualizada";
}

function activityDetail(row: AuditRow) {
  const data = row.after_data ?? row.before_data ?? {};
  const protocol = String(data.protocol ?? "").trim();
  return protocol ? `Protocolo ${protocol}` : `Troca ${String(data.id ?? "").slice(0, 8).toUpperCase()}`;
}

function statusLabel(status: string) {
  return ({ preparing: "em preparo", requested: "enviada", accepted: "aceita", rejected: "recusada", collected: "coletada", sent: "despachada", completed: "concluída", cancelled: "cancelada" } as Record<string, string>)[status] ?? "atualizada";
}

function dateKeyInRecife(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Recife" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function singleParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}
