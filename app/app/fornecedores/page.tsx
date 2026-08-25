import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import { SupplierAgreementCenter, type AgreementItem, type SupplierActivityItem, type SupplierInitialFilters, type SupplierItem } from "@/components/supplier-agreement-center";
import { requireAppContext } from "@/lib/app-context";
import { supabaseRest } from "@/lib/supabase/rest";

export const dynamic = "force-dynamic";

type SupplierRow = {
  id: string;
  name: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  contact_name: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};
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
  notes: string | null;
  active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
};
type NotificationRow = { id: string };
type AuditRow = {
  id: number;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
};

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { auth, context } = await requireAppContext("/app/fornecedores");
  const companyId = encodeURIComponent(context.company.id);
  const canManage = ["owner", "admin", "manager"].includes(context.membership.role);
  const canViewAudit = ["owner", "admin"].includes(context.membership.role);
  const auditPromise = canViewAudit
    ? supabaseRest<AuditRow[]>(`audit_logs?select=id,actor_user_id,action,entity_type,before_data,after_data,created_at&company_id=eq.${companyId}&entity_type=in.(suppliers,supplier_agreements)&order=created_at.desc&limit=20`, auth.accessToken)
    : Promise.resolve([] as AuditRow[]);
  const [supplierRows, agreementRows, unread, auditRows] = await Promise.all([
    supabaseRest<SupplierRow[]>(`suppliers?select=id,name,tax_id,email,phone,contact_name,notes,active,created_at,updated_at&company_id=eq.${companyId}&order=name.asc&limit=1000`, auth.accessToken),
    supabaseRest<AgreementRow[]>(`supplier_agreements?select=id,supplier_id,title,agreement_code,minimum_days_before_expiration,exchange_outcome,requires_invoice,requires_photos,requires_prior_authorization,freight_responsibility,notes,active,valid_from,valid_until,created_at,updated_at&company_id=eq.${companyId}&order=updated_at.desc&limit=1000`, auth.accessToken),
    supabaseRest<NotificationRow[]>(`notifications?select=id&company_id=eq.${companyId}&user_id=eq.${encodeURIComponent(auth.user.id)}&read_at=is.null&limit=1000`, auth.accessToken),
    auditPromise,
  ]);
  const suppliers: SupplierItem[] = supplierRows.map((row) => ({
    id: row.id,
    name: row.name,
    taxId: row.tax_id,
    email: row.email,
    phone: row.phone,
    contactName: row.contact_name,
    notes: row.notes,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  const agreements: AgreementItem[] = agreementRows.map((row) => ({
    id: row.id,
    supplierId: row.supplier_id,
    title: row.title,
    agreementCode: row.agreement_code,
    minimumDays: row.minimum_days_before_expiration,
    exchangeOutcome: row.exchange_outcome,
    requiresInvoice: row.requires_invoice,
    requiresPhotos: row.requires_photos,
    requiresPriorAuthorization: row.requires_prior_authorization,
    freightResponsibility: row.freight_responsibility,
    notes: row.notes,
    active: row.active,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  const activities: SupplierActivityItem[] = auditRows.map((row) => auditItem(row, auth.user.id));
  const params = await searchParams;
  const initialFilters: SupplierInitialFilters = {
    view: singleParam(params.visao),
    query: singleParam(params.busca),
    status: singleParam(params.estado),
  };

  return (
    <AppFrame active="suppliers" companyName={context.company.name} userLabel={auth.user.user_metadata?.full_name ?? auth.user.email} notificationCount={unread.length}>
      <div className="app-page suppliers-page">
        <div className="app-heading-row suppliers-heading">
          <div><span>Operação / Parceiros</span><h1>Fornecedores e acordos</h1><p>Centralize contatos e transforme condições de troca em regras claras para sua equipe.</p></div>
          <div className="app-primary-actions"><Link className="secondary-action link-action" href="/app/estoque/receber">＋ Receber estoque</Link><Link className="primary-action link-action" href="/app/fornecedores/trocas">⇄ Abrir trocas</Link></div>
        </div>
        <div className="real-data-note"><span>●</span> Dados reais de <strong>{context.company.name}</strong>, protegidos por empresa e papel de acesso.</div>
        <SupplierAgreementCenter activities={activities} canManage={canManage} canViewAudit={canViewAudit} initialAgreements={agreements} initialFilters={initialFilters} initialSuppliers={suppliers} today={dateKeyInRecife(new Date())} />
      </div>
    </AppFrame>
  );
}

function auditItem(row: AuditRow, userId: string): SupplierActivityItem {
  const data = row.after_data ?? row.before_data ?? {};
  const entityLabel = row.entity_type === "suppliers" ? "Fornecedor" : "Acordo";
  const subject = String(data.name ?? data.title ?? "registro");
  return {
    id: String(row.id),
    title: `${entityLabel} ${actionLabel(row.action)}`,
    detail: subject,
    createdAt: row.created_at,
    actorLabel: row.actor_user_id === userId ? "Você" : "Outro responsável",
  };
}

function actionLabel(action: string) {
  if (action === "insert") return "cadastrado";
  if (action === "delete") return "removido";
  return "atualizado";
}

function dateKeyInRecife(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Recife" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function singleParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}
