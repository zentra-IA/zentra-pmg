import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SaveLearningInput = {
  companyId: string;
  typedText?: string | null;
  selectedProductId?: string | null;
  selectedCode?: string | null;
  selectedName?: string | null;
  input?: unknown;
  product?: unknown;
};

function toJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === undefined || value === null) return null;

  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return String(value) as Prisma.InputJsonValue;
  }
}

export class LearningEngine {
  static async save(payload: SaveLearningInput) {
    const metadata: Prisma.InputJsonObject = {
      typedText: payload.typedText ?? null,
      selectedProductId: payload.selectedProductId ?? null,
      selectedCode: payload.selectedCode ?? null,
      selectedName: payload.selectedName ?? null,
      input: toJsonValue(payload.input),
      product: toJsonValue(payload.product),
    };

    await prisma.activity_logs.create({
      data: {
        company_id: payload.companyId,
        action: "quote_product_learning",
        entity: "quote_catalog_products",
        metadata,
      },
    });
  }
}

export async function saveLearning(payload: SaveLearningInput) {
  return LearningEngine.save(payload);
}
