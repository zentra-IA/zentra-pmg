import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function getCompanyId(req: NextRequest) {
  return (
    req.headers.get("x-company-id") ||
    req.cookies.get("company_id")?.value ||
    process.env.DEFAULT_COMPANY_ID ||
    ""
  );
}

function getUserId(req: NextRequest) {
  return (
    req.headers.get("x-user-id") ||
    req.cookies.get("user_id")?.value ||
    undefined
  );
}

function getRole(req: NextRequest) {
  return (
    req.headers.get("x-user-role") ||
    req.cookies.get("user_role")?.value ||
    req.cookies.get("role")?.value ||
    ""
  ).toUpperCase();
}

async function resolveCompanyId(req: NextRequest) {
  const fromReq = getCompanyId(req);
  if (fromReq) return fromReq;

  const company = await prisma.companies.findFirst({ select: { id: true } });
  return company?.id || "";
}

async function ensureSalesGoalsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS sales_goals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL,
      seller_id uuid NULL,
      year integer NOT NULL,
      month integer NOT NULL,
      goal_amount numeric(14,2) NOT NULL DEFAULT 0,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS sales_goals_company_seller_month_idx
    ON sales_goals (company_id, COALESCE(seller_id, '00000000-0000-0000-0000-000000000000'::uuid), year, month)
  `);
}

function monthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

function todayRange() {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
    end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
  };
}

function businessDaysLeft(year: number, month: number) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(year, month, 0);
  let days = 0;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) days++;
  }

  return Math.max(days, 1);
}

export async function GET(req: NextRequest) {
  try {
    await ensureSalesGoalsTable();

    const company_id = await resolveCompanyId(req);
    if (!company_id) {
      return NextResponse.json({ error: "Empresa não encontrada." }, { status: 401 });
    }

    const url = new URL(req.url);
    const now = new Date();
    const year = Number(url.searchParams.get("year") || now.getFullYear());
    const month = Number(url.searchParams.get("month") || now.getMonth() + 1);
    const role = getRole(req);
    const sessionUserId = getUserId(req);
    const requestedSellerId = url.searchParams.get("seller_id") || undefined;

    const sellerScope =
      role === "VENDEDOR" && sessionUserId
        ? sessionUserId
        : requestedSellerId;

    const { start, end } = monthRange(year, month);
    const today = todayRange();

    const sellerWhere: any = {
      company_id,
      ...(sellerScope ? { seller_id: sellerScope } : {}),
      delivery_date: { gte: start, lte: end },
    };

    const [monthAgg, todayAgg, monthOrders, sellers] = await Promise.all([
      prisma.salesOrder.aggregate({
        where: sellerWhere,
        _sum: { total: true },
        _count: { id: true },
        _avg: { total: true },
      }),
      prisma.salesOrder.aggregate({
        where: {
          company_id,
          ...(sellerScope ? { seller_id: sellerScope } : {}),
          delivery_date: { gte: today.start, lte: today.end },
        },
        _sum: { total: true },
        _count: { id: true },
      }),
      prisma.salesOrder.findMany({
        where: sellerWhere,
        select: { seller_id: true, seller_name: true, total: true, id: true },
      }),
      prisma.company_users.findMany({
        where: {
          company_id,
          active: true,
          role: { in: ["VENDEDOR", "SUPERVISOR", "GERAL", "MASTER"] },
        },
        select: { user_id: true, name: true, email: true, phone: true, role: true },
      }),
    ]);

    const goalRows = await prisma.$queryRawUnsafe<any[]>(
      `
        SELECT seller_id::text AS seller_id, goal_amount
        FROM sales_goals
        WHERE company_id = $1::uuid
          AND year = $2
          AND month = $3
      `,
      company_id,
      year,
      month
    );

    const selectedGoalRow = goalRows.find((g) => String(g.seller_id || "") === String(sellerScope || ""));
    const generalGoalRow = goalRows.find((g) => !g.seller_id);
    const goalAmount = Number((selectedGoalRow || generalGoalRow)?.goal_amount || 0);

    const monthTotal = Number(monthAgg._sum.total || 0);
    const remaining = Math.max(goalAmount - monthTotal, 0);
    const percent = goalAmount > 0 ? Math.min((monthTotal / goalAmount) * 100, 999) : 0;
    const daysLeft = businessDaysLeft(year, month);
    const dailyNeeded = remaining / daysLeft;
    const weeklyNeeded = dailyNeeded * 5;

    const elapsedDays = Math.max(now.getDate(), 1);
    const dailyAverage = monthTotal / elapsedDays;
    const lastDay = new Date(year, month, 0).getDate();
    const projection = dailyAverage * lastDay;

    const grouped = new Map<string, any>();
    for (const order of monthOrders) {
      const key = order.seller_id || "sem_vendedor";
      const current = grouped.get(key) || {
        seller_id: order.seller_id,
        seller_name: order.seller_name || "Sem vendedor",
        total_sales: 0,
        order_count: 0,
      };

      current.total_sales += Number(order.total || 0);
      current.order_count += 1;
      grouped.set(key, current);
    }

    const goalsBySeller = new Map(
      goalRows.map((g) => [String(g.seller_id || "geral"), Number(g.goal_amount || 0)])
    );

    const ranking = Array.from(grouped.values())
      .map((item) => {
        const g = goalsBySeller.get(String(item.seller_id || "geral")) || 0;
        return {
          ...item,
          goal_amount: g,
          goal_percent: g > 0 ? (item.total_sales / g) * 100 : 0,
          average_ticket: item.order_count > 0 ? item.total_sales / item.order_count : 0,
        };
      })
      .sort((a, b) => b.total_sales - a.total_sales);

    const status =
      goalAmount <= 0
        ? "sem_meta"
        : percent >= 100
          ? "meta_batida"
          : projection >= goalAmount
            ? "no_ritmo"
            : "atencao";

    return NextResponse.json({
      scope: {
        company_id,
        seller_id: sellerScope || null,
        role,
        year,
        month,
      },
      sellers,
      seller: {
        total_sales: monthTotal,
        order_count: monthAgg._count.id,
        average_ticket: Number(monthAgg._avg.total || 0),
        today_sales: Number(todayAgg._sum.total || 0),
        today_orders: todayAgg._count.id,
        goal_amount: goalAmount,
        remaining,
        percent,
        days_left: daysLeft,
        daily_needed: dailyNeeded,
        weekly_needed: weeklyNeeded,
        daily_average: dailyAverage,
        projected_month_total: projection,
        status,
      },
      supervisor: {
        ranking,
        team_total_sales: ranking.reduce((sum, item) => sum + item.total_sales, 0),
        team_order_count: ranking.reduce((sum, item) => sum + item.order_count, 0),
      },
    });
  } catch (error) {
    console.error("[GET /api/crm/performance]", error);
    return NextResponse.json({ error: "Erro ao carregar performance." }, { status: 500 });
  }
}
