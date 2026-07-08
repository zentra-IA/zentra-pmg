import { SearchCandidate } from "./types";

export type ConfidenceStatus =
  | "AUTO_SELECT"
  | "BRAND_MATCH"
  | "PRODUCT_MATCH"
  | "SIMILAR_PRODUCT"
  | "CONFIRMATION"
  | "MANUAL_SEARCH"
  | "NOT_FOUND";

export type ConfidenceResult = {
  confidence: number;
  status: ConfidenceStatus;
  label: string;
  autoSelect: boolean;
  preSelect: boolean;
  needsReview: boolean;
};

export function calculateConfidence(
  suggestions: SearchCandidate[]
): number {
  return calculateConfidenceV2(suggestions).confidence;
}

export function calculateConfidenceV2(
  suggestions: SearchCandidate[]
): ConfidenceResult {
  if (!suggestions.length) {
    return {
      confidence: 30,
      status: "NOT_FOUND",
      label: "Não encontrado",
      autoSelect: false,
      preSelect: false,
      needsReview: true,
    };
  }

  const first = suggestions[0];
  const second = suggestions[1];

  const firstScore = first.score || 0;
  const secondScore = second?.score || 0;
  const gap = firstScore - secondScore;

  const hasBrandMatch = first.reasons.some((reason) =>
    reason.toLowerCase().includes("marca")
  );

  const hasProductMatch = first.reasons.some((reason) =>
    reason.toLowerCase().includes("produto")
  );

  const hasLearning = first.reasons.some((reason) =>
    reason.toLowerCase().includes("aprendizado")
  );

  if (firstScore >= 180 && gap >= 60) {
    return {
      confidence: 99,
      status: "AUTO_SELECT",
      label: "Seleção automática",
      autoSelect: true,
      preSelect: true,
      needsReview: false,
    };
  }

  if (hasBrandMatch && firstScore >= 150 && gap >= 35) {
    return {
      confidence: 95,
      status: "BRAND_MATCH",
      label: "Marca igual",
      autoSelect: true,
      preSelect: true,
      needsReview: false,
    };
  }

  if (hasProductMatch && firstScore >= 120) {
    return {
      confidence: 90,
      status: "PRODUCT_MATCH",
      label: "Produto igual",
      autoSelect: true,
      preSelect: true,
      needsReview: false,
    };
  }

  if (firstScore >= 90 || hasLearning) {
    return {
      confidence: 80,
      status: "SIMILAR_PRODUCT",
      label: "Produto parecido",
      autoSelect: false,
      preSelect: true,
      needsReview: true,
    };
  }

  if (firstScore >= 70) {
    return {
      confidence: 70,
      status: "CONFIRMATION",
      label: "Confirmação",
      autoSelect: false,
      preSelect: false,
      needsReview: true,
    };
  }

  if (firstScore >= 40) {
    return {
      confidence: 50,
      status: "MANUAL_SEARCH",
      label: "Pesquisa manual",
      autoSelect: false,
      preSelect: false,
      needsReview: true,
    };
  }

  return {
    confidence: 30,
    status: "NOT_FOUND",
    label: "Não encontrado",
    autoSelect: false,
    preSelect: false,
    needsReview: true,
  };
}

export function needsReview(confidence: number): boolean {
  return confidence < 90;
}