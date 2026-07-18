import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

function toDecimal(value: any) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  let str = String(value).trim().replace(/R\$/gi, "").replace(/\s/g, "");

  if (str.includes(",") && str.includes(".")) {
    str = str.replace(/\./g, "").replace(",", ".");
  } else if (str.includes(",")) {
    str = str.replace(",", ".");
  }

  const n = Number(str);
  return Number.isFinite(n) ? n : 0;
}

function serializeGoal(goal: any) {
  return {
    ...goal,
    goal_amount:
      goal.goal_amount === null || goal.goal_amount === undefined
        ? 0
        : Number(goal.goal_amount),
  };
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const role = String(access.userRole || "").toUpperCase();
    const company_id = access.companyId;
    const user_id = access.userId;

    if (role === "SUPERVISOR") {
      return NextResponse.json(
        { error: "Acesso negado." },
        { status: 403 }
      );
    }

    if (!company_id) {
      return NextResponse.json({ goals: [] });
    }

    const url = new URL(req.url);
    const now = new Date();

    const year = Number(url.searchParams.get("year") || now.getFullYear());
    const month = Number(url.searchParams.get("month") || now.getMonth() + 1);
    const sellerParam = url.searchParams.get("seller_id");

    const goals = await prisma.sales_goals.findMany({
      where: {
        company_id,
        year,
        month,
        ...(role === "VENDEDOR"
          ? { seller_id: user_id }
          : role === "GERAL" && sellerParam
            ? { seller_id: sellerParam }
            : {}),
      },
      orderBy: {
        updated_at: "desc",
      },
    });

    return NextResponse.json({
      goals: goals.map(serializeGoal),
    });
  } catch (error) {
    console.error("[GET /api/crm/goals]", error);
    return NextResponse.json(
      { error: "Erro ao carregar metas." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const role = String(access.userRole || "").toUpperCase();
    const company_id = access.companyId;

    if (role === "SUPERVISOR") {
      return NextResponse.json(
        { error: "Acesso negado." },
        { status: 403 }
      );
    }

    if (!company_id) {
      return NextResponse.json(
        { error: "Empresa não encontrada." },
        { status: 401 }
      );
    }

    if (role === "VENDEDOR") {
      return NextResponse.json(
        { error: "Vendedor não pode alterar metas." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const now = new Date();

    const seller_id = body.seller_id || null;
    const year = Number(body.year || now.getFullYear());
    const month = Number(body.month || now.getMonth() + 1);
    const goal_amount = toDecimal(body.goal_amount);

    const existing = await prisma.sales_goals.findFirst({
      where: {
        company_id,
        seller_id,
        year,
        month,
      },
      select: {
        id: true,
      },
    });

    const goal = existing
      ? await prisma.sales_goals.update({
          where: { id: existing.id },
          data: {
            goal_amount,
            updated_at: new Date(),
          },
        })
      : await prisma.sales_goals.create({
          data: {
            company_id,
            seller_id,
            year,
            month,
            goal_amount,
            created_at: new Date(),
            updated_at: new Date(),
          },
        });

    return NextResponse.json({
      goal: serializeGoal(goal),
    });
  } catch (error) {
    console.error("[POST /api/crm/goals]", error);
    return NextResponse.json(
      { error: "Erro ao salvar meta." },
      { status: 500 }
    );
  }
}
