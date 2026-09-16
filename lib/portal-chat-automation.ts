import { prisma } from "@/lib/prisma";
import { dispatchPortalChatPush } from "@/lib/portal-chat-push";

type PortalAutomationContext = {
  conversationId: string;
  companyId: string;
  sellerId: string;
  customerId: string;
  customerMessage: string;
  portalToken: string;
  origin: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalize(value: unknown) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(normalize(term)));
}

export function detectPortalSalesIntent(message: string) {
  const text = normalize(message);

  if (!text) return "RESPONDEU";

  if (
    includesAny(text, [
      "nao tenho interesse",
      "sem interesse",
      "nao quero",
      "pare de mandar",
      "remove meu contato",
      "nao preciso",
      "agora nao",
    ])
  ) {
    return "SEM_INTERESSE";
  }

  if (
    includesAny(text, [
      "quero comprar",
      "vou comprar",
      "pode fechar",
      "fecha o pedido",
      "fechar pedido",
      "manda o pedido",
      "pode separar",
      "confirmo",
      "confirmado",
      "fechado",
      "pode mandar",
    ])
  ) {
    return "CLIENTE_QUER_COMPRAR";
  }

  if (
    includesAny(text, [
      "cotacao",
      "orcamento",
      "manda tabela",
      "tabela de preco",
      "qual o preco",
      "quanto custa",
      "tem preco",
      "me passa valores",
      "manda catalogo",
    ])
  ) {
    return "COTACAO";
  }

  if (
    includesAny(text, [
      "desconto",
      "melhor preco",
      "condicao",
      "prazo",
      "negociar",
      "parcela",
      "parcelado",
      "boleto",
      "pix",
      "pagamento",
    ])
  ) {
    return "NEGOCIACAO";
  }

  if (
    includesAny(text, [
      "entrega",
      "entregar",
      "quando chega",
      "prazo de entrega",
      "rota",
      "frete",
      "endereco",
      "chega amanha",
    ])
  ) {
    return "ENTREGA";
  }

  if (
    includesAny(text, [
      "vendedor",
      "representante",
      "atendente",
      "humano",
      "falar com alguem",
      "me liga",
      "ligacao",
    ])
  ) {
    return "TRANSFERIR_VENDEDOR";
  }

  if (
    ["oi", "ola", "bom dia", "boa tarde", "boa noite", "tudo bem"].some(
      (greeting) =>
        text === greeting ||
        text.startsWith(`${greeting} `) ||
        text.startsWith(`${greeting},`)
    )
  ) {
    return "SAUDACAO";
  }

  return "RESPONDEU";
}

function keywordMatches(
  message: string,
  keywords: string[],
  matchType: string
) {
  const text = normalize(message);

  return keywords.some((rawKeyword) => {
    const keyword = normalize(rawKeyword);
    if (!keyword) return false;

    if (matchType === "exact") return text === keyword;
    if (matchType === "starts_with") return text.startsWith(keyword);
    return text.includes(keyword);
  });
}

function applyVariables(text: string, customerName: string) {
  return text
    .replace(/\{\{\s*(nome|cliente)\s*\}\}/gi, customerName)
    .replace(/\{\s*(nome|cliente)\s*\}/gi, customerName);
}

function chooseResponse(automation: any, customerName: string) {
  const choices = [
    clean(automation?.response_text),
    ...(Array.isArray(automation?.response_variations)
      ? automation.response_variations.map(clean)
      : []),
  ].filter(Boolean);

  if (!choices.length) return "";

  const selected =
    choices[Math.floor(Math.random() * choices.length)] || choices[0];

  return applyVariables(selected, customerName);
}

function selectAutomation(automations: any[], message: string, intent: string) {
  const fallback = automations.find((item) => item?.is_fallback);

  for (const automation of automations) {
    if (automation?.is_fallback) continue;

    const keywords = Array.isArray(automation?.trigger_keywords)
      ? automation.trigger_keywords
      : [];
    const configuredIntent = clean(automation?.intent).toUpperCase();

    if (keywords.length) {
      if (
        keywordMatches(
          message,
          keywords,
          clean(automation?.match_type).toLowerCase() || "contains"
        )
      ) {
        return automation;
      }
      continue;
    }

    if (configuredIntent && configuredIntent === intent) {
      return automation;
    }
  }

  return fallback || null;
}

export async function processPortalAutomaticReply(
  context: PortalAutomationContext
) {
  const customerMessage = clean(context.customerMessage);
  if (!customerMessage) return null;

  const conversation = await prisma.portalConversation.findFirst({
    where: {
      id: context.conversationId,
      company_id: context.companyId,
      seller_id: context.sellerId,
      customer_id: context.customerId,
    },
    select: {
      id: true,
      customer_name: true,
      ai_paused: true,
    },
  });

  if (!conversation || conversation.ai_paused) return null;

  const automations = await prisma.portalChatAutomation.findMany({
    where: {
      company_id: context.companyId,
      seller_id: context.sellerId,
      active: true,
    },
    orderBy: [
      { priority: "desc" },
      { updated_at: "desc" },
    ],
    take: 200,
  });

  if (!automations.length) return null;

  const intent = detectPortalSalesIntent(customerMessage);
  const automation = selectAutomation(automations, customerMessage, intent);

  if (!automation) return null;

  const reply = chooseResponse(
    automation,
    conversation.customer_name || "Cliente"
  );

  if (!reply) return null;

  const now = new Date();

  const [, message] = await prisma.$transaction([
    prisma.portalConversation.update({
      where: { id: conversation.id },
      data: {
        last_message: reply.slice(0, 500),
        last_message_at: now,
        last_sender_type: "seller",
        customer_unread: { increment: 1 },
        updated_at: now,
      },
    }),
    prisma.portalMessage.create({
      data: {
        conversation_id: conversation.id,
        company_id: context.companyId,
        seller_id: context.sellerId,
        customer_id: context.customerId,
        sender_type: "seller",
        message_type: "text",
        content: reply,
      },
    }),
  ]);

  try {
    await dispatchPortalChatPush({
      companyId: context.companyId,
      customerId: context.customerId,
      portalToken: context.portalToken,
      origin: context.origin,
    });
  } catch (error) {
    console.error("[PORTAL_CHAT_AUTOMATION_PUSH_WARNING]", error);
  }

  return {
    message,
    automationId: automation.id,
    intent,
  };
}
