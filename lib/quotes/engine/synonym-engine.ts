import { PrismaClient } from "@prisma/client";
import { normalizeText } from "./normalize";

const prisma = new PrismaClient();

/**
 * Motor de sinônimos.
 *
 * Importante:
 * - O schema atual NÃO possui model "synonym".
 * - Os sinônimos disponíveis ficam em quote_catalog_products.synonyms.
 * - Aqui usamos esses sinônimos para normalizar o texto antes da busca.
 */
export class SynonymEngine {
  static async replace(companyId: string, text: string): Promise<string> {
    let normalized = normalizeText(text);

    try {
      const products = await prisma.quote_catalog_products.findMany({
        where: {
          company_id: companyId,
          active: true,
        },
        select: {
          official_name: true,
          normalized_name: true,
          synonyms: true,
        },
      });

      for (const product of products) {
        const target = normalizeText(
          product.normalized_name || product.official_name
        );

        for (const alias of product.synonyms || []) {
          const from = normalizeText(alias);
          if (!from || from.length < 3) continue;

          normalized = normalized.replace(
            new RegExp(`\\b${escapeRegExp(from)}\\b`, "g"),
            target
          );
        }
      }
    } catch (error) {
      console.error("[SynonymEngine] erro ao aplicar sinônimos:", error);
    }

    return normalized;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
