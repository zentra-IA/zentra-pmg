export type ConversationStage =
  | "new"
  | "opening_sent"
  | "waiting_reply"
  | "introduction"
  | "discovering_objection"
  | "objection_price"
  | "objection_delivery"
  | "objection_service"
  | "engaged"
  | "human_handoff"
  | "closed"
  | "no_response";

export type MessageIntent =
  | "greeting"
  | "ask_identity"
  | "price_interest"
  | "catalog_interest"
  | "promo_interest"
  | "price_complaint"
  | "delivery_complaint"
  | "service_complaint"
  | "buying_signal"
  | "human_request"
  | "not_interested"
  | "unknown";

export function getNextStage(
  currentStage: ConversationStage,
  intent: MessageIntent
): ConversationStage {
  // abertura
  if (
    currentStage === "opening_sent" &&
    (intent === "greeting" ||
      intent === "ask_identity")
  ) {
    return "introduction";
  }

  // descoberta de objeção
  if (
    currentStage === "introduction"
  ) {
    return "discovering_objection";
  }

  // objeções
  if (intent === "price_complaint") {
    return "objection_price";
  }

  if (intent === "delivery_complaint") {
    return "objection_delivery";
  }

  if (intent === "service_complaint") {
    return "objection_service";
  }

  // intenção de compra
  if (
    intent === "price_interest" ||
    intent === "catalog_interest" ||
    intent === "promo_interest" ||
    intent === "buying_signal"
  ) {
    return "human_handoff";
  }

  return currentStage;
}