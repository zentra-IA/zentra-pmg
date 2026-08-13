import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

type NormalizedRole = "GERAL" | "SUPERVISOR" | "VENDEDOR";

function normalizeRole(role?: string | null): NormalizedRole {
  const value = String(role || "").trim().toUpperCase();

  if (["GERAL", "MASTER", "ADMIN", "OWNER"].includes(value)) return "GERAL";
  if (["SUPERVISOR", "GESTOR", "MANAGER"].includes(value)) return "SUPERVISOR";
  return "VENDEDOR";
}

function createToken() {
  return randomBytes(32).toString("hex");
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function getAuthorizedCustomer(
  request: NextRequest,
  customerId: string
) {
  const access = await requireCompanyAccess(request);
  const role = normalizeRole(access.userRole);

  if (role === "SUPERVISOR") {
    throw new Error("FORBIDDEN_SUPERVISOR");
  }

  const where: {
    id: string;
    company_id: string;
    seller_id?: string | null;
  } = {
    id: customerId,
    company_id: access.companyId,
  };

  if (role === "VENDEDOR") {
    where.seller_id = access.userId;
  }

  const customer = await prisma.salesCustomer.findFirst({
    where,
    select: {
      id: true,
      company_id: true,
      seller_id: true,
      legal_name: true,
      trade_name: true,
      status: true,
      price_table: true,
      distance_km: true,
    },
  });

  if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
  if (String(customer.status).trim().toLowerCase() !== "ativo") {
    throw new Error("CUSTOMER_INACTIVE");
  }

  return customer;
}

function assertCustomerClassification(customer: {
  price_table: number | null;
  distance_km: unknown;
}) {
  if (
    customer.price_table === null ||
    customer.price_table === undefined ||
    customer.distance_km === null ||
    customer.distance_km === undefined
  ) {
    throw new Error("CUSTOMER_DISTANCE_NOT_CALCULATED");
  }
}

function numericValuesDiffer(left: unknown, right: unknown) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);

  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
    return String(left ?? "") !== String(right ?? "");
  }

  return Math.abs(leftNumber - rightNumber) > 0.01;
}

function responseError(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN";

  if (message === "FORBIDDEN_SUPERVISOR") {
    return NextResponse.json(
      { error: "Supervisor não possui acesso a esta rota operacional." },
      { status: 403 }
    );
  }

  if (message === "CUSTOMER_NOT_FOUND") {
    return NextResponse.json(
      { error: "Cliente não encontrado ou sem permissão." },
      { status: 404 }
    );
  }

  if (message === "CUSTOMER_INACTIVE") {
    return NextResponse.json(
      { error: "O cliente está inativo." },
      { status: 409 }
    );
  }

  if (message === "CUSTOMER_DISTANCE_NOT_CALCULATED") {
    return NextResponse.json(
      {
        error:
          "Calcule a distância e a tabela de preço do cliente antes de gerar o portal.",
      },
      { status: 409 }
    );
  }

  console.error("[PROMOTION_LINK]", error);
  return NextResponse.json(
    { error: "Erro ao carregar o link do portal." },
    { status: 500 }
  );
}

function buildResponse(request: NextRequest, customer: any, token: string) {
  return {
    success: true,
    customer: {
      id: customer.id,
      name: customer.trade_name || customer.legal_name,
      price_table: customer.price_table,
      distance_km: customer.distance_km,
    },
    promotion_url: new URL(`/ofertas/${token}`, request.nextUrl.origin).toString(),
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ customerId: string }> }
) {
  try {
    const { customerId } = await context.params;
    const customer = await getAuthorizedCustomer(request, customerId);

    assertCustomerClassification(customer);

    const access = await prisma.webPromotionAccess.findUnique({
      where: { customer_id: customer.id },
      select: {
        active: true,
        token_value: true,
        price_table: true,
        distance_km: true,
      },
    });

    if (!access?.active || !access.token_value) {
      return NextResponse.json(
        {
          success: true,
          promotion_url: null,
          message: "Cliente ainda não possui portal permanente.",
        },
        { status: 200 }
      );
    }

    if (
      access.price_table !== customer.price_table ||
      numericValuesDiffer(access.distance_km, customer.distance_km)
    ) {
      await prisma.webPromotionAccess.update({
        where: { customer_id: customer.id },
        data: {
          price_table: customer.price_table,
          distance_km: customer.distance_km,
        },
      });
    }

    return NextResponse.json(
      buildResponse(request, customer, access.token_value)
    );
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ customerId: string }> }
) {
  try {
    const { customerId } = await context.params;
    const customer = await getAuthorizedCustomer(request, customerId);

    assertCustomerClassification(customer);

    const body = await request.json().catch(() => ({}));
    const regenerate = body?.regenerate === true;

    const existing = await prisma.webPromotionAccess.findUnique({
      where: { customer_id: customer.id },
      select: {
        active: true,
        token_value: true,
        price_table: true,
        distance_km: true,
      },
    });

    if (existing?.active && existing.token_value && !regenerate) {
      if (
        existing.price_table !== customer.price_table ||
        numericValuesDiffer(existing.distance_km, customer.distance_km)
      ) {
        await prisma.webPromotionAccess.update({
          where: { customer_id: customer.id },
          data: {
            price_table: customer.price_table,
            distance_km: customer.distance_km,
          },
        });
      }

      return NextResponse.json(
        buildResponse(request, customer, existing.token_value)
      );
    }

    const rawToken = createToken();

    await prisma.webPromotionAccess.upsert({
      where: { customer_id: customer.id },
      create: {
        company_id: customer.company_id,
        seller_id: customer.seller_id,
        customer_id: customer.id,
        token_hash: hashToken(rawToken),
        token_preview: rawToken.slice(0, 8),
        token_value: rawToken,
        price_table: customer.price_table,
        distance_km: customer.distance_km,
        active: true,
      },
      update: {
        company_id: customer.company_id,
        seller_id: customer.seller_id,
        token_hash: hashToken(rawToken),
        token_preview: rawToken.slice(0, 8),
        token_value: rawToken,
        price_table: customer.price_table,
        distance_km: customer.distance_km,
        active: true,
      },
    });

    return NextResponse.json(
      buildResponse(request, customer, rawToken),
      { status: existing ? 200 : 201 }
    );
  } catch (error) {
    return responseError(error);
  }
}
