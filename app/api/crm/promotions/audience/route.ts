import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = new Set([
  "GERAL", "MASTER", "ADMIN", "OWNER",
  "SUPERVISOR", "GESTOR", "MANAGER",
]);

function sellerFilter(
  access: Awaited<ReturnType<typeof requireCompanyAccess>>
) {
  return ADMIN_ROLES.has(String(access.userRole || "").toUpperCase())
    ? {}
    : { seller_id: access.userId };
}

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

function normalizeStoredTable(value: unknown): number | null {
  const table = Number(value);
  if (!Number.isInteger(table)) return null;
  if (table < 0) return null;
  if (table > 5) return 5;
  return table;
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

    const customers = await prisma.salesCustomer.findMany({
      where: {
        company_id: access.companyId,
        ...sellerFilter(access),
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
      const calculatedTable = tableFromDistance(customer.distance_km);
      const storedTable = normalizeStoredTable(customer.price_table);
      const table = calculatedTable ?? storedTable;

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
