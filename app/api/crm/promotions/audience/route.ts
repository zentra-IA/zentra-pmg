import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

function tableFromDistance(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const distance = Number(value);
  if (!Number.isFinite(distance) || distance < 0) return null;

  if (distance < 100) return 0;
  if (distance < 200) return 1;
  if (distance < 300) return 2;
  if (distance < 400) return 3;
  if (distance < 500) return 4;
  return 5;
}

const LABELS = [
  "0 a 100 km",
  "100 a 200 km",
  "200 a 300 km",
  "300 a 400 km",
  "400 a 500 km",
  "Acima de 500 km",
];

export async function GET(request: NextRequest) {
  try {
    const access = await requireCompanyAccess(request);

    if (!access.userId) {
      return NextResponse.json(
        { error: "Vendedor não identificado." },
        { status: 401 }
      );
    }

    const customers = await prisma.salesCustomer.findMany({
      where: {
        company_id: access.companyId,
        seller_id: access.userId,
        status: {
          equals: "ativo",
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        price_table: true,
        distance_km: true,
      },
    });

    const counts = [0, 0, 0, 0, 0, 0];
    const updates: Array<ReturnType<typeof prisma.salesCustomer.update>> = [];

    for (const customer of customers) {
      const table = tableFromDistance(customer.distance_km);

      /*
       * Cliente sem distância calculada não entra em nenhuma tabela.
       * Nunca usamos price_table como fallback, porque um valor antigo
       * poderia colocar um cliente pendente na Tabela 0.
       */
      if (table === null) continue;

      counts[table] += 1;

      if (customer.price_table !== table) {
        updates.push(
          prisma.salesCustomer.update({
            where: { id: customer.id },
            data: { price_table: table },
          })
        );
      }
    }

    if (updates.length) {
      await prisma.$transaction(updates);
    }

    return NextResponse.json({
      total_customers: customers.length,
      classified_customers: counts.reduce((sum, value) => sum + value, 0),
      pending_count:
        customers.length - counts.reduce((sum, value) => sum + value, 0),
      unclassified_customers:
        customers.length - counts.reduce((sum, value) => sum + value, 0),
      tables: counts.map((customer_count, price_table) => ({
        price_table,
        customer_count,
        range_label: LABELS[price_table],
      })),
    });
  } catch (error) {
    console.error("[PROMOTIONS_AUDIENCE_GET]", error);

    return NextResponse.json(
      { error: "Erro ao carregar e classificar o público." },
      { status: 500 }
    );
  }
}
