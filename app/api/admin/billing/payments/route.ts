import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  MasterAccessError,
  requireBillingMaster,
} from "@/lib/admin/master-billing-access";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value || "").trim();
}

function amountNumber(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function monthParts(competence: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(
    competence
  );

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (
    year < 2000 ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }

  return { year, month };
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
  const day = Math.min(
    Math.max(dueDay, 1),
    lastDayOfMonth(year, month)
  );

  return new Date(
    `${year}-${String(month).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}T12:00:00Z`
  );
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

  console.error(
    "[admin/billing/payments]",
    error
  );

  return NextResponse.json(
    {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao registrar pagamento.",
    },
    { status: 500 }
  );
}

export async function GET(req: NextRequest) {
  try {
    await requireBillingMaster(req);

    const profileId = clean(
      req.nextUrl.searchParams.get("profileId")
    );

    if (!profileId) {
      return NextResponse.json(
        {
          success: false,
          error: "profileId obrigatório.",
        },
        { status: 400 }
      );
    }

    const payments =
      await prisma.admin_billing_payments.findMany({
        where: {
          profile_id: profileId,
        },
        orderBy: [
          {
            due_date: "desc",
          },
          {
            created_at: "desc",
          },
        ],
        take: 60,
      });

    return NextResponse.json({
      success: true,
      payments: payments.map(
        (payment) => ({
          ...payment,
          amount: amountNumber(
            payment.amount
          ),
        })
      ),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireBillingMaster(req);

    const body = await req.json();

    const profileId = clean(
      body.profileId ||
        body.profile_id
    );

    const competence = clean(
      body.competence
    );

    const parts =
      monthParts(competence);

    if (!profileId || !parts) {
      return NextResponse.json(
        {
          success: false,
          error:
            "profileId e competência YYYY-MM são obrigatórios.",
        },
        { status: 400 }
      );
    }

    const profile =
      await prisma.admin_billing_profiles.findUnique({
        where: {
          id: profileId,
        },
      });

    if (!profile) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Cadastro financeiro não encontrado.",
        },
        { status: 404 }
      );
    }

    const amount = Math.max(
      0,
      amountNumber(
        body.amount ??
          profile.monthly_value
      )
    );

    const dueDate = dueDateFor(
      parts.year,
      parts.month,
      profile.due_day
    );

    const paymentMethod =
      clean(
        body.paymentMethod ||
          body.payment_method ||
          profile.payment_method
      ) || "PIX";

    const paidAtRaw = clean(
      body.paidAt ||
        body.paid_at
    );

    const paidAt = paidAtRaw
      ? new Date(paidAtRaw)
      : new Date();

    const payment =
      await prisma.admin_billing_payments.upsert({
        where: {
          profile_id_competence_type: {
            profile_id: profile.id,
            competence,
            type: "MENSALIDADE",
          },
        },
        create: {
          profile_id: profile.id,
          company_id:
            profile.company_id,
          company_user_id:
            profile.company_user_id,
          competence,
          type: "MENSALIDADE",
          due_date: dueDate,
          amount,
          status: "PAGO",
          paid_at: paidAt,
          payment_method:
            paymentMethod,
          notes:
            clean(body.notes) || null,
        },
        update: {
          due_date: dueDate,
          amount,
          status: "PAGO",
          paid_at: paidAt,
          payment_method:
            paymentMethod,
          notes:
            clean(body.notes) || null,
        },
      });

    return NextResponse.json({
      success: true,
      payment: {
        ...payment,
        amount: amountNumber(
          payment.amount
        ),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireBillingMaster(req);

    const id = clean(
      req.nextUrl.searchParams.get("id")
    );

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: "ID obrigatório.",
        },
        { status: 400 }
      );
    }

    const payment =
      await prisma.admin_billing_payments.findUnique({
        where: {
          id,
        },
      });

    if (!payment) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Pagamento não encontrado.",
        },
        { status: 404 }
      );
    }

    await prisma.admin_billing_payments.delete({
      where: {
        id,
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    return jsonError(error);
  }
}
