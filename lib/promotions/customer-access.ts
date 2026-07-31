import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getCustomerPromotionAccess(token: string) {
  if (!token || token.length < 32) return null;

  const access = await prisma.webPromotionAccess.findFirst({
    where: {
      token_hash: hashToken(token),
      token_value: token,
      active: true,
      customer: {
        status: {
          equals: "ativo",
          mode: "insensitive",
        },
      },
    },
    select: {
      id: true,
      company_id: true,
      customer_id: true,
      seller_id: true,
      price_table: true,
      distance_km: true,
      customer: {
        select: {
          id: true,
          company_id: true,
          seller_id: true,
          legal_name: true,
          trade_name: true,
          city: true,
          state: true,
          whatsapp: true,
          price_table: true,
          distance_km: true,
        },
      },
    },
  });

  if (!access) return null;

  const now = new Date();

  await prisma.webPromotionAccess.update({
    where: { id: access.id },
    data: {
      first_access_at: { set: now },
      last_access_at: now,
      access_count: { increment: 1 },
    },
  });

  await prisma.salesCustomer.update({
    where: { id: access.customer_id },
    data: { last_promotion_open_at: now },
  });

  return access;
}
