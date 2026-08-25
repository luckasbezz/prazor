import { supabaseRest } from "./supabase/rest";

export type Membership = {
  company_id: string;
  role: "owner" | "admin" | "manager" | "staff";
  status: string;
};

export type Company = {
  id: string;
  name: string;
};

export type Branch = {
  id: string;
  name: string;
};

export type StockLocation = {
  id: string;
  name: string;
};

export async function getPrimaryMembership(userId: string, accessToken: string) {
  const memberships = await supabaseRest<Membership[]>(
    `company_members?select=company_id,role,status&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&order=created_at.asc&limit=1`,
    accessToken,
  );
  const membership = memberships[0] ?? null;

  if (!membership) return null;

  const companies = await supabaseRest<Company[]>(
    `companies?select=id,name&id=eq.${encodeURIComponent(membership.company_id)}&limit=1`,
    accessToken,
  );
  const company = companies[0] ?? null;

  return company ? { membership, company } : null;
}

export async function getFirstBranch(companyId: string, accessToken: string) {
  const branches = await supabaseRest<Branch[]>(
    `branches?select=id,name&company_id=eq.${encodeURIComponent(companyId)}&active=eq.true&order=created_at.asc&limit=1`,
    accessToken,
  );
  return branches[0] ?? null;
}

export async function getFirstLocation(
  companyId: string,
  branchId: string,
  accessToken: string,
) {
  const locations = await supabaseRest<StockLocation[]>(
    `stock_locations?select=id,name&company_id=eq.${encodeURIComponent(companyId)}&branch_id=eq.${encodeURIComponent(branchId)}&active=eq.true&order=created_at.asc&limit=1`,
    accessToken,
  );
  return locations[0] ?? null;
}
