import { NextRequest, NextResponse } from "next/server";
import { buildCommandCenterDashboard } from "@/lib/command-center/dashboard-service";

export const dynamic = "force-dynamic";

function getRole(req: NextRequest) {
  return (
    req.headers.get("x-user-role") ||
    req.cookies.get("user_role")?.value ||
    req.cookies.get("zentra_user_role")?.value ||
    req.cookies.get("role")?.value ||
    ""
  ).toLowerCase();
}

function canAccess(role: string) {
  return ["supervisor", "geral", "admin", "master", "owner"].includes(role);
}

function getCompanyId(req: NextRequest) {
  return (
    req.headers.get("x-company-id") ||
    req.cookies.get("company_id")?.value ||
    req.cookies.get("zentra_company_id")?.value ||
    process.env.DEFAULT_COMPANY_ID ||
    ""
  );
}

export async function GET(req: NextRequest) {
  try {
    const role = getRole(req);

    if (!canAccess(role)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Acesso negado.",
        },
        {
          status: 403,
        }
      );
    }

    const companyId = getCompanyId(req);

    if (!companyId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Empresa não identificada.",
        },
        {
          status: 401,
        }
      );
    }

    const url = new URL(req.url);

    const dashboard = await buildCommandCenterDashboard({
      companyId,
      period: (url.searchParams.get("period") as any) || "month",
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });

    return NextResponse.json(dashboard);
  } catch (error) {
    console.error("[GET /api/command-center/dashboard]", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Erro ao carregar Command Center.",
      },
      {
        status: 500,
      }
    );
  }
}