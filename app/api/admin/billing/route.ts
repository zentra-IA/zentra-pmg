import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  MasterAccessError,
  requireBillingMaster,
} from "@/lib/admin/master-billing-access";

export const dynamic = "force-dynamic";

const PLAN_STATUSES = new Set([
  "ATIVO",
  "SUSPENSO",
  "CANCELADO",
]);

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalizePlanStatus(value: unknown) {
  const status = clean(value).toUpperCase();
  return PLAN_STATUSES.has(status) ? status : "ATIVO";
}

function getSaoPauloParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(
    parts.find((item) => item.type === "year")?.value
  );

  const month = Number(
    parts.find((item) => item.type === "month")?.value
  );

  const day = Number(
    parts.find((item) => item.type === "day")?.value
  );

  return { year, month, day };
}

function competenceOf(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(
    Date.UTC(year, month, 0)
  ).getUTCDate();
}

function dueDateFor(
  year: number,
  month: number,
  dueDay: number
) {
  const safeDay = Math.min(
    Math.max(Number(dueDay || 10), 1),
    lastDayOfMonth(year, month)
  );

  return new Date(
    `${year}-${String(month).padStart(2, "0")}-${String(
      safeDay
    ).padStart(2, "0")}T12:00:00-03:00`
  );
}

function dateOnlyKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function diffCalendarDays(a: Date, b: Date) {
  const aKey = dateOnlyKey(a);
  const bKey = dateOnlyKey(b);

  const aMs = Date.parse(`${aKey}T12:00:00Z`);
  const bMs = Date.parse(`${bKey}T12:00:00Z`);

  return Math.round(
    (bMs - aMs) / 86_400_000
  );
}

function billingSituation(
  planStatus: string,
  dueDate: Date,
  paid: boolean
) {
  if (planStatus === "SUSPENSO") {
    return {
      payment_status: "SUSPENSO",
      alert: "SUSPENSO",
      days_until_due: null,
    };
  }

  if (planStatus === "CANCELADO") {
    return {
      payment_status: "CANCELADO",
      alert: "CANCELADO",
      days_until_due: null,
    };
  }

  if (paid) {
    return {
      payment_status: "PAGO",
      alert: "PAGO",
      days_until_due: null,
    };
  }

  const diff = diffCalendarDays(
    new Date(),
    dueDate
  );

  if (diff < 0) {
    return {
      payment_status: "PENDENTE",
      alert: "ATRASADO",
      days_until_due: diff,
    };
  }

  if (diff === 0) {
    return {
      payment_status: "PENDENTE",
      alert: "VENCE_HOJE",
      days_until_due: 0,
    };
  }

  if (diff === 1) {
    return {
      payment_status: "PENDENTE",
      alert: "VENCE_AMANHA",
      days_until_due: 1,
    };
  }

  if (diff <= 3) {
    return {
      payment_status: "PENDENTE",
      alert: "VENCE_EM_ATE_3_DIAS",
      days_until_due: diff,
    };
  }

  return {
    payment_status: "PENDENTE",
    alert: "A_VENCER",
    days_until_due: diff,
  };
}

function moneyNumber(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

async function loadLeadCounts() {
  const grouped = await prisma.leads.groupBy({
    by: ["company_id", "owner_user_id"],
    where: {
      owner_user_id: {
        not: null,
      },
    },
    _count: {
      _all: true,
    },
  });

  const map = new Map<string, number>();

  for (const row of grouped) {
    map.set(
      `${row.company_id}:${row.owner_user_id}`,
      row._count._all
    );
  }

  return map;
}

async function loadCompanyUserCounts() {
  const grouped = await prisma.company_users.groupBy({
    by: ["company_id"],
    _count: {
      _all: true,
    },
  });

  return new Map(
    grouped.map((row) => [
      row.company_id,
      row._count._all,
    ])
  );
}

async function buildDashboard() {
  const { year, month } = getSaoPauloParts();
  const competence = competenceOf(year, month);

  const [
    profiles,
    payments,
    leadCounts,
    companyUserCounts,
  ] = await Promise.all([
    prisma.admin_billing_profiles.findMany({
      include: {
        company_user: true,
        companies: {
          select: {
            id: true,
            name: true,
            active: true,
          },
        },
      },
      orderBy: [
        { due_day: "asc" },
        { created_at: "desc" },
      ],
    }),
    prisma.admin_billing_payments.findMany({
      where: {
        competence,
        type: "MENSALIDADE",
      },
    }),
    loadLeadCounts(),
    loadCompanyUserCounts(),
  ]);

  const paymentByProfile = new Map(
    payments.map((payment) => [
      payment.profile_id,
      payment,
    ])
  );

  const rows = profiles.map((profile) => {
    const payment = paymentByProfile.get(
      profile.id
    );

    const dueDate = dueDateFor(
      year,
      month,
      profile.due_day
    );

    const situation = billingSituation(
      profile.plan_status,
      dueDate,
      payment?.status === "PAGO"
    );

    const user = profile.company_user;

    return {
      id: profile.id,
      company_id: profile.company_id,
      company_user_id: profile.company_user_id,
      company_name: profile.companies?.name || "",
      company_active:
        profile.companies?.active !== false,
      company_users_count:
        companyUserCounts.get(profile.company_id) || 0,
      user_id: user.user_id,
      name: user.name || "",
      email: user.email || "",
      phone: user.phone || "",
      user_active: user.active !== false,
      role: user.role,
      clients_count:
        leadCounts.get(
          `${profile.company_id}:${user.user_id}`
        ) || 0,
      monthly_value: moneyNumber(
        profile.monthly_value
      ),
      signup_fee: moneyNumber(
        profile.signup_fee
      ),
      due_day: profile.due_day,
      payment_method: profile.payment_method,
      plan_status: profile.plan_status,
      joined_at: profile.joined_at,
      document: profile.document,
      address: profile.address,
      notes: profile.notes,
      competence,
      due_date: dueDate,
      current_payment: payment
        ? {
            id: payment.id,
            status: payment.status,
            amount: moneyNumber(payment.amount),
            paid_at: payment.paid_at,
            payment_method:
              payment.payment_method,
            notes: payment.notes,
          }
        : null,
      ...situation,
    };
  });

  const activeRows = rows.filter(
    (row) =>
      row.plan_status === "ATIVO" &&
      row.user_active
  );

  const received = rows.reduce(
    (sum, row) =>
      row.current_payment?.status === "PAGO"
        ? sum +
          moneyNumber(
            row.current_payment.amount
          )
        : sum,
    0
  );

  const expected = activeRows.reduce(
    (sum, row) =>
      sum + moneyNumber(row.monthly_value),
    0
  );

  return {
    competence,
    summary: {
      active_subscriptions:
        activeRows.length,
      expected_revenue: expected,
      received_revenue: received,
      pending_revenue: Math.max(
        0,
        expected - received
      ),
      due_tomorrow: activeRows.filter(
        (row) =>
          row.alert === "VENCE_AMANHA"
      ).length,
      due_today: activeRows.filter(
        (row) =>
          row.alert === "VENCE_HOJE"
      ).length,
      overdue: activeRows.filter(
        (row) => row.alert === "ATRASADO"
      ).length,
      total_clients: activeRows.reduce(
        (sum, row) =>
          sum + row.clients_count,
        0
      ),
    },
    rows,
  };
}

async function buildCompanyView(companyId: string) {
  const company = await prisma.companies.findUnique({
    where: {
      id: companyId,
    },
    select: {
      id: true,
      name: true,
      active: true,
      monthly_value: true,
      due_day: true,
      payment_method: true,
    },
  });

  if (!company) {
    return null;
  }

  const users = await prisma.company_users.findMany({
    where: {
      company_id: companyId,
    },
    orderBy: {
      created_at: "desc",
    },
  });

  const profiles =
    await prisma.admin_billing_profiles.findMany({
      where: {
        company_id: companyId,
      },
      include: {
        payments: {
          orderBy: {
            due_date: "desc",
          },
          take: 18,
        },
      },
    });

  const profileMap = new Map(
    profiles.map((profile) => [
      profile.company_user_id,
      profile,
    ])
  );

  const leadCounts = await loadLeadCounts();

  return {
    company,
    users: users.map((user) => {
      const profile = profileMap.get(user.id);

      return {
        ...user,
        clients_count:
          leadCounts.get(
            `${companyId}:${user.user_id}`
          ) || 0,
        billing: profile
          ? {
              ...profile,
              monthly_value:
                moneyNumber(
                  profile.monthly_value
                ),
              signup_fee:
                moneyNumber(
                  profile.signup_fee
                ),
              payments:
                profile.payments.map(
                  (payment) => ({
                    ...payment,
                    amount:
                      moneyNumber(
                        payment.amount
                      ),
                  })
                ),
            }
          : null,
      };
    }),
  };
}

function jsonError(error: unknown) {
  if (error instanceof MasterAccessError) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: error.status }
    );
  }

  console.error("[admin/billing]", error);

  return NextResponse.json(
    {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro no centro de cobranças.",
    },
    { status: 500 }
  );
}

export async function GET(req: NextRequest) {
  try {
    await requireBillingMaster(req);

    const scope = clean(
      req.nextUrl.searchParams.get("scope")
    ).toLowerCase();

    if (scope === "access") {
      return NextResponse.json({
        success: true,
        allowed: true,
      });
    }

    const companyId = clean(
      req.nextUrl.searchParams.get("companyId")
    );

    if (companyId) {
      const data =
        await buildCompanyView(companyId);

      if (!data) {
        return NextResponse.json(
          {
            success: false,
            error: "Empresa não encontrada.",
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        ...data,
      });
    }

    const dashboard =
      await buildDashboard();

    return NextResponse.json({
      success: true,
      ...dashboard,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireBillingMaster(req);

    const body = await req.json();

    const companyId = clean(
      body.companyId ||
        body.company_id
    );

    const companyUserId = clean(
      body.companyUserId ||
        body.company_user_id
    );

    if (!companyId || !companyUserId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "companyId e companyUserId são obrigatórios.",
        },
        { status: 400 }
      );
    }

    const companyUser =
      await prisma.company_users.findFirst({
        where: {
          id: companyUserId,
          company_id: companyId,
        },
      });

    if (!companyUser) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Usuário não pertence à empresa informada.",
        },
        { status: 404 }
      );
    }

    const monthlyValue = Math.max(
      0,
      moneyNumber(
        body.monthlyValue ??
          body.monthly_value ??
          139
      )
    );

    const signupFee = Math.max(
      0,
      moneyNumber(
        body.signupFee ??
          body.signup_fee ??
          89
      )
    );

    const dueDay = Math.min(
      31,
      Math.max(
        1,
        Number(
          body.dueDay ??
            body.due_day ??
            10
        )
      )
    );

    const joinedAtRaw = clean(
      body.joinedAt ||
        body.joined_at
    );

    const joinedAt = joinedAtRaw
      ? new Date(`${joinedAtRaw}T12:00:00Z`)
      : null;

    const profile =
      await prisma.admin_billing_profiles.upsert({
        where: {
          company_user_id: companyUserId,
        },
        create: {
          company_id: companyId,
          company_user_id:
            companyUserId,
          monthly_value: monthlyValue,
          signup_fee: signupFee,
          due_day: dueDay,
          payment_method:
            clean(
              body.paymentMethod ||
                body.payment_method ||
                "PIX"
            ) || "PIX",
          plan_status:
            normalizePlanStatus(
              body.planStatus ||
                body.plan_status
            ),
          joined_at: joinedAt,
          document:
            clean(body.document) || null,
          address:
            clean(body.address) || null,
          notes:
            clean(body.notes) || null,
        },
        update: {
          monthly_value: monthlyValue,
          signup_fee: signupFee,
          due_day: dueDay,
          payment_method:
            clean(
              body.paymentMethod ||
                body.payment_method ||
                "PIX"
            ) || "PIX",
          plan_status:
            normalizePlanStatus(
              body.planStatus ||
                body.plan_status
            ),
          joined_at: joinedAt,
          document:
            clean(body.document) || null,
          address:
            clean(body.address) || null,
          notes:
            clean(body.notes) || null,
        },
      });

    return NextResponse.json({
      success: true,
      profile: {
        ...profile,
        monthly_value:
          moneyNumber(
            profile.monthly_value
          ),
        signup_fee:
          moneyNumber(
            profile.signup_fee
          ),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
