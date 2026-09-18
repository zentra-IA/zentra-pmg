import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

type CompanyAccess = Awaited<ReturnType<typeof requireCompanyAccess>>;

function clean(value: unknown, max = 120) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeRole(role?: string | null) {
  const value = String(role || "").trim().toUpperCase();

  if (["GERAL", "MASTER", "ADMIN", "OWNER"].includes(value)) {
    return "GERAL";
  }

  if (["SUPERVISOR", "GESTOR", "MANAGER"].includes(value)) {
    return "SUPERVISOR";
  }

  return "VENDEDOR";
}

async function requireAccessibleCustomer(
  access: CompanyAccess,
  customerId: string
) {
  const role = normalizeRole(access.userRole);

  const customer = await prisma.salesCustomer.findFirst({
    where: {
      id: customerId,
      company_id: access.companyId,
      ...(role === "VENDEDOR"
        ? {
            seller_id: access.userId,
          }
        : {}),
    },
    select: {
      id: true,
      seller_id: true,
    },
  });

  if (!customer) {
    throw new Error("CUSTOMER_NOT_FOUND");
  }

  return customer;
}

async function getState(companyId: string, customerId: string) {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      protest_status: string;
      protest_checked_at: Date | null;
      protest_checked_by: string | null;
      boleto_requested: boolean;
      boleto_requested_at: Date | null;
      boleto_requested_by: string | null;
      updated_at: Date;
    }>
  >(
    `SELECT
       protest_status,
       protest_checked_at,
       protest_checked_by,
       boleto_requested,
       boleto_requested_at,
       boleto_requested_by,
       updated_at
     FROM customer_credit_checks
     WHERE company_id = $1::uuid
       AND customer_id = $2::uuid
     LIMIT 1`,
    companyId,
    customerId
  );

  return (
    rows[0] || {
      protest_status: "NOT_CHECKED",
      protest_checked_at: null,
      protest_checked_by: null,
      boleto_requested: false,
      boleto_requested_at: null,
      boleto_requested_by: null,
      updated_at: new Date(),
    }
  );
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const customerId = clean(
      new URL(req.url).searchParams.get("customerId"),
      80
    );

    if (!customerId) {
      return NextResponse.json(
        { success: false, error: "customerId obrigatório." },
        { status: 400 }
      );
    }

    await requireAccessibleCustomer(access, customerId);

    return NextResponse.json({
      success: true,
      credit_check: await getState(access.companyId, customerId),
    });
  } catch (error: any) {
    const notFound = error?.message === "CUSTOMER_NOT_FOUND";

    return NextResponse.json(
      {
        success: false,
        error: notFound
          ? "Cliente não encontrado na sua carteira."
          : error?.message || "Erro ao carregar análise de crédito.",
      },
      { status: notFound ? 404 : 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const body = await req.json().catch(() => ({}));
    const customerId = clean(body?.customerId, 80);
    const action = clean(body?.action, 40);

    if (!customerId) {
      return NextResponse.json(
        { success: false, error: "customerId obrigatório." },
        { status: 400 }
      );
    }

    const customer = await requireAccessibleCustomer(access, customerId);
    const sellerId = customer.seller_id || access.userId || null;

    if (action === "set_protest_result") {
      const result = clean(body?.result, 30);

      if (!["NO_PROTEST", "HAS_PROTEST"].includes(result)) {
        return NextResponse.json(
          { success: false, error: "Resultado de protesto inválido." },
          { status: 400 }
        );
      }

      await prisma.$executeRawUnsafe(
        `INSERT INTO customer_credit_checks (
           company_id,
           seller_id,
           customer_id,
           protest_status,
           protest_checked_at,
           protest_checked_by,
           boleto_requested,
           boleto_requested_at,
           boleto_requested_by,
           created_at,
           updated_at
         )
         VALUES (
           $1::uuid,
           $2::uuid,
           $3::uuid,
           $4,
           now(),
           $5::uuid,
           false,
           NULL,
           NULL,
           now(),
           now()
         )
         ON CONFLICT (company_id, customer_id)
         DO UPDATE SET
           seller_id = EXCLUDED.seller_id,
           protest_status = EXCLUDED.protest_status,
           protest_checked_at = now(),
           protest_checked_by = EXCLUDED.protest_checked_by,
           boleto_requested = false,
           boleto_requested_at = NULL,
           boleto_requested_by = NULL,
           updated_at = now()`,
        access.companyId,
        sellerId,
        customerId,
        result,
        access.userId
      );

      return NextResponse.json({
        success: true,
        credit_check: await getState(access.companyId, customerId),
      });
    }

    if (action === "mark_boleto_requested") {
      const current = await getState(access.companyId, customerId);

      if (current.protest_status !== "NO_PROTEST") {
        return NextResponse.json(
          {
            success: false,
            error:
              "O boleto só pode ser marcado como solicitado após registrar 'Sem protesto'.",
          },
          { status: 409 }
        );
      }

      await prisma.$executeRawUnsafe(
        `UPDATE customer_credit_checks
         SET boleto_requested = true,
             boleto_requested_at = now(),
             boleto_requested_by = $3::uuid,
             updated_at = now()
         WHERE company_id = $1::uuid
           AND customer_id = $2::uuid`,
        access.companyId,
        customerId,
        access.userId
      );

      return NextResponse.json({
        success: true,
        credit_check: await getState(access.companyId, customerId),
      });
    }

    if (action === "mark_boleto_not_requested") {
      await prisma.$executeRawUnsafe(
        `UPDATE customer_credit_checks
         SET boleto_requested = false,
             boleto_requested_at = NULL,
             boleto_requested_by = NULL,
             updated_at = now()
         WHERE company_id = $1::uuid
           AND customer_id = $2::uuid`,
        access.companyId,
        customerId
      );

      return NextResponse.json({
        success: true,
        credit_check: await getState(access.companyId, customerId),
      });
    }

    return NextResponse.json(
      { success: false, error: "Ação inválida." },
      { status: 400 }
    );
  } catch (error: any) {
    const notFound = error?.message === "CUSTOMER_NOT_FOUND";

    return NextResponse.json(
      {
        success: false,
        error: notFound
          ? "Cliente não encontrado na sua carteira."
          : error?.message || "Erro ao salvar análise de crédito.",
      },
      { status: notFound ? 404 : 500 }
    );
  }
}
