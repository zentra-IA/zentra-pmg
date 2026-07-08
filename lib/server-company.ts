import { cookies, headers } from "next/headers";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function getUserId(req?: NextRequest) {
  if (req) {
    return (
      req.cookies.get("zentra_user_id")?.value ||
      req.headers.get("x-user-id") ||
      null
    );
  }

  const cookieStore = await cookies();
  const headerStore = await headers();

  return (
    cookieStore.get("zentra_user_id")?.value ||
    headerStore.get("x-user-id") ||
    null
  );
}

export async function getCompanyId(req?: NextRequest) {
  if (req) {
    return (
      req.cookies.get("zentra_company_id")?.value ||
      req.headers.get("x-company-id") ||
      process.env.DEFAULT_COMPANY_ID ||
      null
    );
  }

  const cookieStore = await cookies();
  const headerStore = await headers();

  return (
    cookieStore.get("zentra_company_id")?.value ||
    headerStore.get("x-company-id") ||
    process.env.DEFAULT_COMPANY_ID ||
    null
  );
}

export async function getBranchId(req?: NextRequest) {
  if (req) {
    return (
      req.cookies.get("zentra_branch_id")?.value ||
      req.headers.get("x-branch-id") ||
      null
    );
  }

  const cookieStore = await cookies();
  const headerStore = await headers();

  return (
    cookieStore.get("zentra_branch_id")?.value ||
    headerStore.get("x-branch-id") ||
    null
  );
}

export async function requireCompany(req?: NextRequest) {
  const userId = await getUserId(req);
  const companyId = await getCompanyId(req);
  const branchId = await getBranchId(req);

  if (!companyId) {
    throw new Error("Empresa não identificada");
  }

  return {
    userId,
    companyId,
    branchId,
  };
}

export async function requireCompanyAccess(req?: NextRequest) {
  const auth = await requireCompany(req);

  const companyUser = auth.userId
    ? await prisma.company_users.findFirst({
        where: {
          company_id: auth.companyId,
          user_id: auth.userId,
          active: true,
        },
        select: {
          role: true,
          name: true,
          email: true,
          radarMonthlyLimit: true,
        },
      })
    : null;

  const company = await prisma.companies.findUnique({
    where: { id: auth.companyId },
    select: {
      plans: {
        select: {
          name: true,
          plan_features: {
            where: {
              feature: "radar",
              enabled: true,
            },
            select: {
              limit_value: true,
            },
          },
        },
      },
    },
  });

  const userRole = String(companyUser?.role || "GERAL").toUpperCase();
  const planName = String(company?.plans?.name || "").toUpperCase();
  const planRadarLimit = Number(
    company?.plans?.plan_features?.[0]?.limit_value || 0
  );

  return {
    ...auth,
    userRole,
    userName: companyUser?.name || null,
    userEmail: companyUser?.email || null,
    userRadarMonthlyLimit: Number(companyUser?.radarMonthlyLimit || 0),
    planName,
    planRadarLimit,
  };
}

export function canImportRadarContacts(access: {
  userRole?: string | null;
  planName?: string | null;
}) {
  const role = String(access.userRole || "").toUpperCase();

  return [
    "MASTER",
    "SUPERVISOR",
    "GERAL",
  ].includes(role);
}
