import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

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
    ON sales_goals (
      company_id,
      COALESCE(seller_id, '00000000-0000-0000-0000-000000000000'::uuid),
      year,
      month
    )
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

  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();

    if (day !== 0 && day !== 6) {
      days++;
    }
  }

  return Math.max(days, 1);
}

export async function GET(req: NextRequest) {
  try {
    await ensureSalesGoalsTable();

    const access = await requireCompanyAccess(req);
    const company_id = access.companyId;
    const userId = access.userId;
    const role = String(access.userRole || "").toUpperCase();

    if (role === "SUPERVISOR") {
      return NextResponse.json(
        { error: "Supervisor não possui acesso a esta rota operacional." },
        { status: 403 }
      );
    }

    if (!company_id || !userId) {
      return NextResponse.json(
        { error: "Empresa ou usuário não identificado." },
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const now = new Date();

    const year = Number(url.searchParams.get("year") || now.getFullYear());
    const month = Number(url.searchParams.get("month") || now.getMonth() + 1);
    const requestedSellerId = url.searchParams.get("seller_id") || undefined;

    const sellerScope =
      role === "VENDEDOR"
        ? userId
        : role === "GERAL"
          ? requestedSellerId
          : userId;

    const { start, end } = monthRange(year, month);
    const today = todayRange();

    const sellerWhere: any = {
      company_id,
      ...(sellerScope ? { seller_id: sellerScope } : {}),
      delivery_date: {
        gte: start,
        lte: end,
      },
    };

    const todayWhere: any = {
      company_id,
      ...(sellerScope ? { seller_id: sellerScope } : {}),
      delivery_date: {
        gte: today.start,
        lte: today.end,
      },
    };

    const [monthAgg, todayAgg, monthOrders, sellers, goalRows] = await Promise.all([
      prisma.salesOrder.aggregate({
        where: sellerWhere,
        _sum: { total: true },
        _count: { id: true },
        _avg: { total: true },
      }),

      prisma.salesOrder.aggregate({
        where: todayWhere,
        _sum: { total: true },
        _count: { id: true },
      }),

      prisma.salesOrder.findMany({
        where: sellerWhere,
        select: {
          seller_id: true,
          seller_name: true,
          total: true,
          id: true,
        },
      }),

      prisma.company_users.findMany({
        where: {
          company_id,
          active: true,
          ...(role === "GERAL"
            ? {
                role: {
                  in: ["VENDEDOR", "SUPERVISOR", "GERAL", "MASTER", "ADMIN"],
                },
              }
            : {
                user_id: userId,
              }),
        },
        select: {
          user_id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
        },
      }),

      sellerScope
        ? prisma.$queryRawUnsafe<any[]>(
            `
              SELECT seller_id::text AS seller_id, goal_amount
              FROM sales_goals
              WHERE company_id = $1::uuid
                AND year = $2
                AND month = $3
                AND seller_id = $4::uuid
            `,
            company_id,
            year,
            month,
            sellerScope
          )
        : prisma.$queryRawUnsafe<any[]>(
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
          ),
    ]);

    const selectedGoalRow = sellerScope
      ? goalRows.find((goal) => String(goal.seller_id || "") === String(sellerScope))
      : null;

    const generalGoalRow = goalRows.find((goal) => !goal.seller_id);

    const sellerGoalRows = goalRows.filter((goal) => goal.seller_id);

    const teamGoalAmount =
      sellerGoalRows.length > 0
        ? sellerGoalRows.reduce(
            (sum, goal) => sum + Number(goal.goal_amount || 0),
            0
          )
        : Number(generalGoalRow?.goal_amount || 0);

    const goalAmount = sellerScope
      ? Number(selectedGoalRow?.goal_amount || 0)
      : Number(generalGoalRow?.goal_amount || teamGoalAmount || 0);

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
      const key = String(order.seller_id || "sem_vendedor");

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
      goalRows.map((goal) => [
        String(goal.seller_id || "geral"),
        Number(goal.goal_amount || 0),
      ])
    );

    const ranking = Array.from(grouped.values())
      .map((item) => {
        const sellerGoal =
          goalsBySeller.get(String(item.seller_id || "geral")) || 0;

        return {
          ...item,
          goal_amount: sellerGoal,
          goal_percent:
            sellerGoal > 0 ? (item.total_sales / sellerGoal) * 100 : 0,
          average_ticket:
            item.order_count > 0 ? item.total_sales / item.order_count : 0,
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

        /**
         * Meta individual quando existir sellerScope.
         * Meta da equipe quando não existir sellerScope.
         */
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
        team_total_sales: ranking.reduce(
          (sum, item) => sum + item.total_sales,
          0
        ),
        team_order_count: ranking.reduce(
          (sum, item) => sum + item.order_count,
          0
        ),
        team_goal_amount:
          role === "GERAL" && !sellerScope
            ? teamGoalAmount
            : goalAmount,
      },
    });
  } catch (error) {
    console.error("[GET /api/crm/performance]", error);

    return NextResponse.json(
      { error: "Erro ao carregar performance." },
      { status: 500 }
    );
  }
}
