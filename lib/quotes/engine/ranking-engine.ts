import { SearchCandidate } from "./types";

export type RankingStrategy = "BEST_MATCH" | "CHEAPEST" | "EXPENSIVE";

export class RankingEngine {
  static rank(
    items: SearchCandidate[],
    options?: {
      strategy?: RankingStrategy;
      limit?: number;
    }
  ): SearchCandidate[] {
    const strategy = options?.strategy || "BEST_MATCH";
    const limit = options?.limit || 20;

    return items
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        if (strategy === "CHEAPEST") {
          const priceA = Number(a.product.price || 999999999);
          const priceB = Number(b.product.price || 999999999);

          if (priceA !== priceB) return priceA - priceB;
          return b.score - a.score;
        }

        if (strategy === "EXPENSIVE") {
          const priceA = Number(a.product.price || 0);
          const priceB = Number(b.product.price || 0);

          if (priceA !== priceB) return priceB - priceA;
          return b.score - a.score;
        }

        return b.score - a.score;
      })
      .slice(0, limit);
  }
}