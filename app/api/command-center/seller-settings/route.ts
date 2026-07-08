import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function getCompanyId(req: NextRequest) {
  return (
    req.headers.get("x-company-id") ||
    req.cookies.get("company_id")?.value ||
    req.cookies.get("zentra_company_id")?.value ||
    process.env.DEFAULT_COMPANY_ID ||
    ""
  );
}

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

export async function POST(req: NextRequest) {
  try {
    const role = getRole(req);

    if (!canAccess(role)) {
      return NextResponse.json(
        { ok: false, error: "Acesso negado." },
        { status: 403 }
      );
    }

    const companyId = getCompanyId(req);

    if (!companyId) {
      return NextResponse.json(
        { ok: false, error: "Empresa não encontrada." },
        { status: 401 }
      );
    }

    const body = await req.json();

    const sellerId = body.seller_id;
    const goalAmount = Number(body.goal_amount || 0);
    const commissionPercent = Number(body.commission_percent || 0);

    const now = new Date();
    const year = Number(body.year || now.getFullYear());
    const month = Number(body.month || now.getMonth() + 1);

    if (!sellerId) {
      return NextResponse.json(
        { ok: false, error: "Vendedor obrigatório." },
        { status: 400 }
      );
    }

    const currentGoal = await prisma.sales_goals.findFirst({
      where: {
        company_id: companyId,
        seller_id: sellerId,
        year,
        month,
      },
      select: {
        id: true,
      },
    });

    if (currentGoal) {
      await prisma.sales_goals.update({
        where: {
          id: currentGoal.id,
        },
        data: {
          goal_amount: goalAmount,
          updated_at: new Date(),
        },
      });
    } else {
      await prisma.sales_goals.create({
        data: {
          company_id: companyId,
          seller_id: sellerId,
          year,
          month,
          goal_amount: goalAmount,
        },
      });
    }

    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS sales_commissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL,
        seller_id uuid NOT NULL,
        year integer NOT NULL,
        month integer NOT NULL,
        commission_percent numeric(8,2) DEFAULT 0,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        UNIQUE(company_id, seller_id, year, month)
      )
    `;

    await prisma.$executeRaw`
      INSERT INTO sales_commissions (
        company_id,
        seller_id,
        year,
        month,
        commission_percent,
        updated_at
      )
      VALUES (
        ${companyId}::uuid,
        ${sellerId}::uuid,
        ${year},
        ${month},
        ${commissionPercent},
        now()
      )
      ON CONFLICT (company_id, seller_id, year, month)
      DO UPDATE SET
        commission_percent = EXCLUDED.commission_percent,
        updated_at = now()
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/command-center/seller-settings]", error);

    return NextResponse.json(
      { ok: false, error: "Erro ao salvar meta/comissão." },
      { status: 500 }
    );
  }
}
