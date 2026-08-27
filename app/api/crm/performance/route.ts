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

function compareMonth(year: number, month: number, date = new Date()) {
  const target = year * 12 + month;
  const current = date.getFullYear() * 12 + (date.getMonth() + 1);

  if (target < current) return "past";
  if (target > current) return "future";
  return "current";
}

function businessDaysLeft(year: number, month: number) {
  const today = new Date();
  const relation = compareMonth(year, month, today);

  if (relation === "past") return 0;

  const start =
    relation === "future"
      ? new Date(year, month - 1, 1)
      : new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const end = new Date(year, month, 0);
  let days = 0;

  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();

    if (day !== 0 && day !== 6) {
      days++;
    }
  }

  return days;
}

function lastMonths(year: number, month: number, total = 6) {
  const result: Array<{ year: number; month: number }> = [];
  const anchor = new Date(year, month - 1, 1);

  for (let i = total - 1; i >= 0; i -= 1) {
    const date = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    result.push({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
    });
  }

  return result;
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

    const historyMonths = lastMonths(year, month, 6);
    const historyStart = monthRange(
      historyMonths[0].year,
      historyMonths[0].month
    ).start;

    const historyOrders = await prisma.salesOrder.findMany({
      where: {
        company_id,
        ...(sellerScope ? { seller_id: sellerScope } : {}),
        delivery_date: {
          gte: historyStart,
          lte: end,
        },
      },
      select: {
        total: true,
        delivery_date: true,
      },
    });

    const historyGoalConditions = historyMonths
      .map(
        (_, index) =>
          `(year = $${index * 2 + 3} AND month = $${index * 2 + 4})`
      )
      .join(" OR ");

    const historyGoalParams: any[] = [company_id, sellerScope || null];

    for (const item of historyMonths) {
      historyGoalParams.push(item.year, item.month);
    }

    const historyGoalRows = sellerScope
      ? await prisma.$queryRawUnsafe<any[]>(
          `
            SELECT year, month, seller_id::text AS seller_id, goal_amount
            FROM sales_goals
            WHERE company_id = $1::uuid
              AND seller_id = $2::uuid
              AND (${historyGoalConditions})
          `,
          ...historyGoalParams
        )
      : await prisma.$queryRawUnsafe<any[]>(
          `
            SELECT year, month, seller_id::text AS seller_id, goal_amount
            FROM sales_goals
            WHERE company_id = $1::uuid
              AND seller_id IS NULL
              AND (${historyGoalConditions
                .replace(/\$\d+/g, (match) => {
                  const n = Number(match.slice(1));
                  return n <= 2 ? match : `$${n - 1}`;
                })})
          `,
          company_id,
          ...historyGoalParams.slice(2)
        );

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
    const exceeded = Math.max(monthTotal - goalAmount, 0);
    const percent =
      goalAmount > 0
        ? Math.min((monthTotal / goalAmount) * 100, 999)
        : 0;

    const relation = compareMonth(year, month, now);
    const daysLeft = businessDaysLeft(year, month);
    const dailyNeeded =
      relation === "current" && daysLeft > 0
        ? remaining / daysLeft
        : 0;
    const weeklyNeeded = dailyNeeded * 5;

    const lastDay = new Date(year, month, 0).getDate();
    const elapsedDays =
      relation === "past"
        ? lastDay
        : relation === "current"
          ? Math.max(now.getDate(), 1)
          : 0;

    const dailyAverage =
      elapsedDays > 0 ? monthTotal / elapsedDays : 0;

    const projection =
      relation === "past"
        ? monthTotal
        : relation === "current"
          ? dailyAverage * lastDay
          : 0;

    const historySales = new Map<string, number>();

    for (const order of historyOrders) {
      if (!order.delivery_date) continue;

      const d = new Date(order.delivery_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

      historySales.set(
        key,
        (historySales.get(key) || 0) + Number(order.total || 0)
      );
    }

    const historyGoals = new Map<string, number>();

    for (const goal of historyGoalRows || []) {
      const key = `${goal.year}-${String(goal.month).padStart(2, "0")}`;
      historyGoals.set(key, Number(goal.goal_amount || 0));
    }

    const history = historyMonths.map((item) => {
      const key = `${item.year}-${String(item.month).padStart(2, "0")}`;
      const totalSales = historySales.get(key) || 0;
      const goal = historyGoals.get(key) || 0;
      const goalPercent =
        goal > 0 ? Math.min((totalSales / goal) * 100, 999) : 0;

      return {
        key,
        year: item.year,
        month: item.month,
        total_sales: totalSales,
        goal_amount: goal,
        percent: goalPercent,
        remaining: Math.max(goal - totalSales, 0),
        exceeded: Math.max(totalSales - goal, 0),
        status:
          goal <= 0
            ? "sem_meta"
            : totalSales >= goal
              ? "meta_batida"
              : "nao_batida",
      };
    });

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
        exceeded,
        percent,
        period_status: relation,
        days_left: daysLeft,
        daily_needed: dailyNeeded,
        weekly_needed: weeklyNeeded,
        daily_average: dailyAverage,
        projected_month_total: projection,
        status,
      },

      history,

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

export async function POST(req: NextRequest) {
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

    const body = await req.json();

    const now = new Date();
    const year = Number(body?.year || now.getFullYear());
    const month = Number(body?.month || now.getMonth() + 1);
    const goalAmount = Number(body?.goal_amount);

    if (
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2100 ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      return NextResponse.json(
        { error: "Mês/ano inválido." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(goalAmount) || goalAmount < 0) {
      return NextResponse.json(
        { error: "Informe uma meta válida." },
        { status: 400 }
      );
    }

    /*
     * VENDEDOR sempre altera somente a própria meta.
     * Perfis gerais podem definir a própria meta ou, quando a tela passar
     * seller_id explicitamente, a meta daquele vendedor.
     */
    const sellerId =
      role === "VENDEDOR"
        ? userId
        : String(body?.seller_id || userId);

    if (role !== "VENDEDOR" && sellerId !== userId) {
      const seller = await prisma.company_users.findFirst({
        where: {
          company_id,
          user_id: sellerId,
          active: true,
        },
        select: { user_id: true },
      });

      if (!seller) {
        return NextResponse.json(
          { error: "Vendedor não encontrado nesta empresa." },
          { status: 404 }
        );
      }
    }

    const existing = await prisma.sales_goals.findFirst({
      where: {
        company_id,
        seller_id: sellerId,
        year,
        month,
      },
      select: { id: true },
    });

    const goal = existing
      ? await prisma.sales_goals.update({
          where: { id: existing.id },
          data: {
            goal_amount: goalAmount,
            updated_at: new Date(),
          },
        })
      : await prisma.sales_goals.create({
          data: {
            company_id,
            seller_id: sellerId,
            year,
            month,
            goal_amount: goalAmount,
          },
        });

    return NextResponse.json({
      success: true,
      goal: {
        id: goal.id,
        seller_id: goal.seller_id,
        year: goal.year,
        month: goal.month,
        goal_amount: Number(goal.goal_amount || 0),
      },
    });
  } catch (error) {
    console.error("[POST /api/crm/performance]", error);

    return NextResponse.json(
      { error: "Erro ao salvar meta mensal." },
      { status: 500 }
    );
  }
}

