import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

type AnyOrder = any;
type AnyItem = any;

type PortfolioStatus =
  | "critical"
  | "d29"
  | "attention"
  | "habit_overdue"
  | "expected_today"
  | "expected_tomorrow"
  | "protected"
  | "not_activated";

function asNumber(value: any, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "bigint") return Number(value);
  if (typeof value?.toNumber === "function") return value.toNumber();

  const raw = String(value).replace(/R\$/gi, "").trim();
  const normalized =
    raw.includes(",") && raw.includes(".")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(",", ".");

  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function fmtBRL(value: any) {
  return asNumber(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtDate(value: any) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}

function dateKeySP(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";

  return year && month && day ? `${year}-${month}-${day}` : "";
}

function dayNumber(value: Date | string) {
  const key = dateKeySP(value);
  if (!key) return NaN;

  const [year, month, day] = key.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function calendarDiffDays(later: Date | string, earlier: Date | string) {
  const a = dayNumber(later);
  const b = dayNumber(earlier);

  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return a - b;
}

function addCalendarDays(value: Date | string, days: number) {
  const key = dateKeySP(value);
  if (!key) return null;

  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days, 15, 0, 0));
}

function weekdayPt(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
  }).format(date);
}

function onlyDate(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function daysBetween(a: Date, b: Date) {
  const ms = onlyDate(a).getTime() - onlyDate(b).getTime();
  return Math.round(ms / 86400000);
}

function itemName(item: AnyItem) {
  return String(
    item.product_name ||
      item.name ||
      item.description ||
      "Produto sem nome"
  ).trim();
}

function itemCode(item: AnyItem) {
  return String(item.product_code || item.code || "").trim();
}

function itemTotal(item: AnyItem) {
  return asNumber(item.total);
}

function orderItems(order: AnyOrder): AnyItem[] {
  return Array.isArray(order.SalesOrderItem)
    ? order.SalesOrderItem
    : Array.isArray(order.items)
      ? order.items
      : [];
}

function customerKey(order: AnyOrder) {
  return (
    order.customer_id ||
    order.customer_internal_code ||
    order.document ||
    order.customer_name ||
    order.id
  );
}

function customerName(order: AnyOrder) {
  return String(
    order.SalesCustomer?.trade_name ||
      order.SalesCustomer?.legal_name ||
      order.customer_name ||
      "Cliente sem nome"
  );
}

function customerPayload(order: AnyOrder) {
  return {
    id: order.customer_id || order.SalesCustomer?.id || null,
    internalCode:
      order.customer_internal_code ||
      order.SalesCustomer?.internal_code ||
      null,
    name: customerName(order),
    document: order.document || order.SalesCustomer?.document || null,
    sellerName: order.seller_name || "",
    sellerId: order.seller_id || null,
  };
}

function customerPayloadFromCustomer(customer: any) {
  return {
    id: customer.id,
    internalCode: customer.internal_code || customer.erp_code || null,
    name: customer.trade_name || customer.legal_name || "Cliente sem nome",
    document: customer.document || null,
    sellerName: "",
    sellerId: customer.seller_id || null,
  };
}

function isBoleto(payment: any) {
  return String(payment || "").toLowerCase().includes("boleto");
}

function isCancelled(status: any) {
  return String(status || "").toLowerCase().includes("cancel");
}

function buildWhatsappMessage(action: any) {
  const products =
    action.products && action.products.length
      ? `\n\nProdutos para trabalhar:\n${action.products
          .map((product: any) => `• ${product.name}`)
          .join("\n")}`
      : "";

  if (action.type === "boleto") {
    return `Olá, ${action.customer.name}! Tudo bem?\n\nPassando para lembrar que temos um boleto com vencimento em ${action.dueDate}, referente ao pedido ${action.orderNumber || ""} no valor de ${action.valueFormatted}.\n\nQualquer dúvida, fico à disposição.`;
  }

  if (action.type === "mix") {
    return `Olá, ${action.customer.name}! Tudo bem?\n\nNotei aqui que no último pedido não entraram alguns itens que você costuma comprar.${products}\n\nPosso te mandar uma condição desses produtos para o próximo pedido?`;
  }

  if (action.type === "ticket") {
    return `Olá, ${action.customer.name}! Tudo bem?\n\nVi que seu último pedido veio menor que a média recente. Quero te ajudar a manter seu abastecimento em dia.\n\nPosso te mandar algumas opções com bom custo-benefício para completar seu pedido?`;
  }

  if (action.type === "quote_gap") {
    return `Olá, ${action.customer.name}! Tudo bem?\n\nVi que alguns itens que você cotou ainda não entraram no pedido.${products}\n\nQuer que eu veja uma condição para incluir esses produtos no próximo pedido?`;
  }

  if (action.type === "pagamento") {
    return `Olá, ${action.customer.name}! Tudo bem?\n\nPercebi que você tem comprado com frequência. Para facilitar sua rotina, posso verificar uma condição de pagamento em boleto para os próximos pedidos.`;
  }

  if (action.type === "portfolio") {
    return `Olá, ${action.customer.name}! Tudo bem?\n\nEstou organizando sua reposição e queria confirmar se já precisa montar o próximo pedido. Posso te mandar as condições de hoje?`;
  }

  return `Olá, ${action.customer.name}! Tudo bem?\n\nTenho uma oportunidade comercial para você com base no seu histórico de compras. Posso te mandar as melhores opções?`;
}

function normalizeLoose(value: any) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toUpperCase();
}

function quoteMetadata(log: any) {
  const metadata = log?.metadata;

  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as any)
    : {};
}

function quoteItemsFromMetadata(metadata: any) {
  return Array.isArray(metadata?.items) ? metadata.items : [];
}

function quoteItemCode(item: any) {
  return String(
    item?.code || item?.productCode || item?.selectedCode || ""
  ).trim();
}

function quoteItemName(item: any) {
  return String(
    item?.name ||
      item?.productName ||
      item?.product ||
      item?.officialName ||
      "Produto sem nome"
  ).trim();
}

function quoteItemTotal(item: any) {
  return asNumber(item?.total ?? item?.subtotal);
}

function quoteCustomerKeys(metadata: any) {
  return [
    metadata?.customerId,
    metadata?.customerInternalCode,
    metadata?.clientId,
    metadata?.document,
    metadata?.customerName,
    metadata?.clientName,
  ]
    .filter(Boolean)
    .map((value) => String(value));
}

function median(values: number[]) {
  if (!values.length) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function analyzePurchaseRhythm(orders: AnyOrder[]) {
  const distinct = Array.from(
    new Map(
      orders
        .map((order) => ({
          key: dateKeySP(order.created_at),
          date: new Date(order.created_at),
        }))
        .filter((item) => item.key)
        .map((item) => [item.key, item])
    ).values()
  )
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(-16);

  if (distinct.length < 4) return null;

  const intervals: number[] = [];

  for (let index = 1; index < distinct.length; index += 1) {
    const diff = calendarDiffDays(
      distinct[index].date,
      distinct[index - 1].date
    );

    if (diff > 0 && diff <= 60) intervals.push(diff);
  }

  if (intervals.length < 3) return null;

  const medianDays = median(intervals);
  if (medianDays < 4 || medianDays > 35) return null;

  const absoluteDeviations = intervals.map((value) =>
    Math.abs(value - medianDays)
  );
  const meanDeviation =
    absoluteDeviations.reduce((sum, value) => sum + value, 0) /
    absoluteDeviations.length;

  const consistency = Math.max(
    0,
    1 - meanDeviation / Math.max(2, medianDays)
  );

  const sampleFactor = Math.min(1, intervals.length / 7);
  const confidence = Math.round(
    Math.min(95, (consistency * 0.8 + sampleFactor * 0.2) * 100)
  );

  if (confidence < 65) return null;

  const weekdayCounts = new Map<string, number>();

  for (const item of distinct) {
    const label = weekdayPt(item.date);
    if (!label) continue;
    weekdayCounts.set(label, (weekdayCounts.get(label) || 0) + 1);
  }

  const dominantWeekdayEntry = Array.from(weekdayCounts.entries()).sort(
    (a, b) => b[1] - a[1]
  )[0];

  const dominantWeekday =
    dominantWeekdayEntry &&
    dominantWeekdayEntry[1] / distinct.length >= 0.6
      ? dominantWeekdayEntry[0]
      : null;

  const roundedDays = Math.max(1, Math.round(medianDays));
  const latest = distinct[distinct.length - 1].date;
  const expectedAt = addCalendarDays(latest, roundedDays);

  const cadence =
    roundedDays <= 9
      ? "semanal"
      : roundedDays <= 18
        ? "quinzenal"
        : "mensal";

  return {
    intervalDays: roundedDays,
    confidence,
    cadence,
    dominantWeekday,
    expectedAt,
    sampleSize: distinct.length,
  };
}

function manualWeekdaySignal(customer: any, now: Date) {
  const configured = [
    ...(Array.isArray(customer.purchase_weekdays)
      ? customer.purchase_weekdays
      : []),
    customer.habitual_purchase_day,
  ]
    .filter(Boolean)
    .map((value: any) => normalizeLoose(value));

  if (!configured.length) return null;

  const today = normalizeLoose(weekdayPt(now));
  const tomorrowDate = addCalendarDays(now, 1);
  const yesterdayDate = addCalendarDays(now, -1);

  const tomorrow = tomorrowDate
    ? normalizeLoose(weekdayPt(tomorrowDate))
    : "";
  const yesterday = yesterdayDate
    ? normalizeLoose(weekdayPt(yesterdayDate))
    : "";

  const matches = (weekday: string) =>
    configured.some(
      (value) =>
        value &&
        weekday &&
        (value.includes(weekday) || weekday.includes(value))
    );

  if (matches(today)) return "expected_today";
  if (matches(tomorrow)) return "expected_tomorrow";
  if (matches(yesterday)) return "habit_overdue";

  return null;
}

function portfolioStatusRank(status: PortfolioStatus) {
  const rank: Record<PortfolioStatus, number> = {
    critical: 100,
    d29: 95,
    attention: 85,
    habit_overdue: 80,
    expected_today: 75,
    expected_tomorrow: 65,
    not_activated: 55,
    protected: 40,
  };

  return rank[status] || 0;
}

function scoreAction(action: any) {
  let score = 0;

  if (action.type === "boleto") score += 35;
  if (action.type === "ticket") score += 30;
  if (action.type === "mix") score += 32;
  if (action.type === "pagamento") score += 18;
  if (action.type === "quote_gap") score += 38;
  if (action.type === "portfolio") score += 42;

  if (action.priority === "alta") score += 25;
  if (action.priority === "media") score += 12;

  if (action.portfolioStatus === "critical") score += 30;
  if (action.portfolioStatus === "d29") score += 25;
  if (action.portfolioStatus === "habit_overdue") score += 20;
  if (action.portfolioStatus === "expected_today") score += 18;

  score += Math.min(
    30,
    Math.round(asNumber(action.estimatedValue) / 250)
  );

  if (
    action.daysUntilDue !== undefined &&
    action.daysUntilDue <= 1
  ) {
    score += 25;
  }

  if (
    action.dropPercent !== undefined &&
    action.dropPercent >= 30
  ) {
    score += 25;
  }

  return Math.max(0, Math.min(100, score));
}

function latestDate(...values: Array<Date | string | null | undefined>) {
  const valid = values
    .filter(Boolean)
    .map((value) => new Date(value as any))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());

  return valid[0] || null;
}

function makePortfolioCopy(
  status: PortfolioStatus,
  customerNameValue: string,
  daysSinceReference: number,
  rhythm: any
) {
  if (status === "critical") {
    return {
      title: `${customerNameValue} passou de 30 dias`,
      reason: `A referência de proteção está com ${daysSinceReference} dia(s). A carteira já entrou na faixa crítica.`,
      recommendation:
        "Abra o PMG agora, reative o cliente e depois marque “Ativado no PMG” no Zentra.",
    };
  }

  if (status === "d29") {
    return {
      title: `${customerNameValue} está no D+29`,
      reason:
        "Amanhã esse cliente entra na faixa crítica de 30 dias sem novo movimento de proteção.",
      recommendation:
        "Abra o PMG hoje, reative o cliente e confirme a ativação no Zentra para iniciar um novo ciclo.",
    };
  }

  if (status === "attention") {
    return {
      title: `${customerNameValue} se aproxima do D+29`,
      reason: `A referência de proteção já está com ${daysSinceReference} dia(s).`,
      recommendation:
        "Antecipe contato, envie preço/cotação e organize a reativação no PMG antes do D+29.",
    };
  }

  if (status === "habit_overdue") {
    return {
      title: `${customerNameValue} atrasou o padrão de compra`,
      reason: rhythm?.expectedAt
        ? `O histórico indicava nova compra por volta de ${fmtDate(rhythm.expectedAt)}.`
        : "O dia habitual de compra passou e ainda não apareceu pedido novo.",
      recommendation:
        "Entre em contato hoje e ofereça reposição antes que o cliente esfrie.",
    };
  }

  if (status === "expected_today") {
    return {
      title: `${customerNameValue} costuma comprar hoje`,
      reason: rhythm?.dominantWeekday
        ? `O padrão histórico aponta ${rhythm.dominantWeekday} como dia recorrente de compra.`
        : "Hoje coincide com o dia habitual cadastrado para este cliente.",
      recommendation:
        "Faça uma abordagem curta de reposição e pergunte se já pode montar o pedido.",
    };
  }

  if (status === "expected_tomorrow") {
    return {
      title: `${customerNameValue} tende a comprar amanhã`,
      reason: rhythm?.expectedAt
        ? `A próxima compra esperada está próxima de ${fmtDate(rhythm.expectedAt)}.`
        : "Amanhã coincide com o dia habitual cadastrado.",
      recommendation:
        "Prepare preço/cotação hoje para chegar antes da decisão de compra.",
    };
  }

  if (status === "not_activated") {
    return {
      title: `${customerNameValue} foi marcado como não ativado`,
      reason:
        "A tentativa foi registrada, mas o ciclo de proteção não foi reiniciado.",
      recommendation:
        "Tente novamente no PMG quando possível. Só “Ativado no PMG” reinicia o ciclo.",
    };
  }

  return {
    title: `${customerNameValue} protegido no PMG`,
    reason:
      "A ativação manual foi registrada recentemente e iniciou um novo ciclo de proteção.",
    recommendation:
      "Continue acompanhando compra, cotação e retorno comercial normalmente.",
  };
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const role = String(access.userRole || "").toUpperCase();
    const company_id = access.companyId;
    const seller_id = access.userId;

    if (role === "SUPERVISOR") {
      return NextResponse.json(
        { error: "Supervisor deve utilizar apenas o Command Center." },
        { status: 403 }
      );
    }

    if (!company_id || !seller_id) {
      return NextResponse.json(
        { error: "Usuário ou empresa não identificados." },
        { status: 401 }
      );
    }

    if (!["GERAL", "VENDEDOR"].includes(role)) {
      return NextResponse.json(
        { error: "Perfil sem permissão para acessar esta rota." },
        { status: 403 }
      );
    }

    const now = new Date();
    const start180 = new Date(now);
    start180.setDate(start180.getDate() - 180);

    const start120 = new Date(now);
    start120.setDate(start120.getDate() - 120);

    const [orders, customers, portfolioLogs] = await Promise.all([
      prisma.salesOrder.findMany({
        where: {
          company_id,
          created_at: { gte: start180 },
          ...(role === "VENDEDOR" ? { seller_id } : {}),
        },
        include: {
          SalesOrderItem: true,
          SalesCustomer: true,
        },
        orderBy: { created_at: "desc" },
        take: 1200,
      }),
      prisma.salesCustomer.findMany({
        where: {
          company_id,
          ...(role === "VENDEDOR" ? { seller_id } : {}),
        },
        orderBy: { updated_at: "desc" },
        take: 2000,
      }),
      prisma.activity_logs.findMany({
        where: {
          company_id,
          action: {
            in: [
              "portfolio_pmg_activated",
              "portfolio_pmg_not_activated",
            ],
          },
          created_at: { gte: start180 },
        },
        orderBy: { created_at: "desc" },
        take: 2000,
      }),
    ]);

    const activeOrders = orders.filter(
      (order: AnyOrder) => !isCancelled(order.status)
    );

    const groups = new Map<string, AnyOrder[]>();

    for (const order of activeOrders) {
      const key = String(customerKey(order));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(order);
    }

    const ordersByCustomerId = new Map<string, AnyOrder[]>();

    for (const order of activeOrders) {
      const customerId =
        order.customer_id || order.SalesCustomer?.id || "";

      if (!customerId) continue;

      if (!ordersByCustomerId.has(customerId)) {
        ordersByCustomerId.set(customerId, []);
      }

      ordersByCustomerId.get(customerId)!.push(order);
    }

    const latestActivationByCustomer = new Map<string, any>();
    const latestPortfolioLogByCustomer = new Map<string, any>();

    for (const log of portfolioLogs) {
      const metadata = quoteMetadata(log);
      const customerId = String(metadata.customerId || "");

      if (!customerId) continue;

      if (!latestPortfolioLogByCustomer.has(customerId)) {
        latestPortfolioLogByCustomer.set(customerId, log);
      }

      if (
        log.action === "portfolio_pmg_activated" &&
        !latestActivationByCustomer.has(customerId)
      ) {
        latestActivationByCustomer.set(customerId, log);
      }
    }

    const actions: any[] = [];

    // 1) Boletos próximos.
    for (const order of activeOrders) {
      if (
        !order.boleto_due_date ||
        !isBoleto(order.payment_terms) ||
        isCancelled(order.status)
      ) {
        continue;
      }

      const due = new Date(order.boleto_due_date);
      const daysUntilDue = daysBetween(due, now);

      if (daysUntilDue >= 0 && daysUntilDue <= 7) {
        const action: any = {
          id: `boleto-${order.id}`,
          type: "boleto",
          title:
            daysUntilDue === 0
              ? "Boleto vence hoje"
              : `Boleto vence em ${daysUntilDue} dia(s)`,
          priority: daysUntilDue <= 1 ? "alta" : "media",
          customer: customerPayload(order),
          orderId: order.id,
          orderNumber: order.order_number,
          dueDate: fmtDate(order.boleto_due_date),
          daysUntilDue,
          value: asNumber(order.total),
          valueFormatted: fmtBRL(order.total),
          reason: `Boleto do pedido ${order.order_number || ""} vence em ${fmtDate(order.boleto_due_date)}.`,
          recommendation:
            "Avisar o cliente para manter as contas em dia e evitar atraso.",
          products: [],
          estimatedValue: asNumber(order.total),
        };

        action.score = scoreAction(action);
        action.message = buildWhatsappMessage(action);
        actions.push(action);
      }
    }

    // 2) Ticket, mix e pagamento por cliente.
    for (const [, customerOrdersRaw] of groups.entries()) {
      const customerOrders = [...customerOrdersRaw].sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
      );

      if (!customerOrders.length) continue;

      const latest = customerOrders[0];
      const previous = customerOrders.slice(1, 8);
      const customer = customerPayload(latest);

      const latestTotal = asNumber(latest.total);
      const previousAvg =
        previous.length > 0
          ? previous.reduce(
              (sum, order) => sum + asNumber(order.total),
              0
            ) / previous.length
          : 0;

      if (previousAvg > 0 && latestTotal < previousAvg * 0.8) {
        const dropPercent = Math.round(
          ((previousAvg - latestTotal) / previousAvg) * 100
        );

        const action: any = {
          id: `ticket-${latest.id}`,
          type: "ticket",
          title: "Ticket abaixo da média",
          priority: dropPercent >= 35 ? "alta" : "media",
          customer,
          orderId: latest.id,
          orderNumber: latest.order_number,
          currentTicket: latestTotal,
          averageTicket: previousAvg,
          currentTicketFormatted: fmtBRL(latestTotal),
          averageTicketFormatted: fmtBRL(previousAvg),
          dropPercent,
          reason: `O último pedido foi ${dropPercent}% menor que a média dos pedidos recentes.`,
          recommendation:
            "Verifique quais itens ficaram fora do pedido e ofereça um complemento.",
          products: [],
          estimatedValue: Math.max(0, previousAvg - latestTotal),
        };

        action.score = scoreAction(action);
        action.message = buildWhatsappMessage(action);
        actions.push(action);
      }

      if (previous.length >= 2) {
        const latestCodes = new Set(
          orderItems(latest)
            .map((item) => itemCode(item))
            .filter(Boolean)
        );

        const previousProducts = new Map<string, any>();

        for (const order of previous) {
          for (const item of orderItems(order)) {
            const code =
              itemCode(item) || itemName(item).toUpperCase();

            if (!code) continue;

            const current = previousProducts.get(code) || {
              code,
              name: itemName(item),
              count: 0,
              total: 0,
            };

            current.count += 1;
            current.total += itemTotal(item);
            previousProducts.set(code, current);
          }
        }

        const missing = Array.from(previousProducts.values())
          .filter(
            (product) =>
              product.count >= 2 && !latestCodes.has(product.code)
          )
          .sort((a, b) => b.total - a.total)
          .slice(0, 5);

        if (missing.length > 0) {
          const estimatedValue = missing.reduce(
            (sum, product) =>
              sum +
              product.total / Math.max(1, product.count),
            0
          );

          const action: any = {
            id: `mix-${latest.id}`,
            type: "mix",
            title: "Produtos que o cliente deixou de comprar",
            priority:
              estimatedValue >= 1000 ? "alta" : "media",
            customer,
            orderId: latest.id,
            orderNumber: latest.order_number,
            reason: `O cliente deixou de comprar ${missing.length} produto(s) recorrente(s) no último pedido.`,
            recommendation:
              "Ofereça esses itens como complemento ou combo na próxima abordagem.",
            products: missing.map((product) => ({
              code: product.code,
              name: product.name,
              averageValue:
                Math.round(
                  (product.total /
                    Math.max(1, product.count)) *
                    100
                ) / 100,
            })),
            estimatedValue,
            estimatedValueFormatted: fmtBRL(estimatedValue),
          };

          action.score = scoreAction(action);
          action.message = buildWhatsappMessage(action);
          actions.push(action);
        }
      }

      const lastFour = customerOrders.slice(0, 4);
      const nonBoletoCount = lastFour.filter(
        (order) => !isBoleto(order.payment_terms)
      ).length;

      if (lastFour.length >= 3 && nonBoletoCount >= 3) {
        const recentTotal = lastFour.reduce(
          (sum, order) => sum + asNumber(order.total),
          0
        );

        const action: any = {
          id: `pagamento-${customer.id || customer.internalCode || customer.name}`,
          type: "pagamento",
          title: "Sugerir pagamento em boleto",
          priority: "baixa",
          customer,
          orderId: latest.id,
          orderNumber: latest.order_number,
          reason: `Cliente fez ${nonBoletoCount} dos últimos ${lastFour.length} pedidos sem boleto.`,
          recommendation:
            "Avalie oferecer boleto para facilitar recorrência e aumentar fidelização.",
          products: [],
          estimatedValue: recentTotal / lastFour.length,
          estimatedValueFormatted: fmtBRL(
            recentTotal / lastFour.length
          ),
        };

        action.score = scoreAction(action);
        action.message = buildWhatsappMessage(action);
        actions.push(action);
      }
    }

    // 3) Cotações salvas x pedidos.
    const quoteLogs = await prisma.activity_logs.findMany({
      where: {
        company_id,
        action: "quote_saved",
        created_at: { gte: start120 },
        ...(role === "VENDEDOR" ? { user_id: seller_id } : {}),
      },
      orderBy: { created_at: "desc" },
      take: 500,
    });

    for (const log of quoteLogs) {
      const metadata = quoteMetadata(log);
      const quoteItems = quoteItemsFromMetadata(metadata);

      if (!quoteItems.length) continue;

      const keys = quoteCustomerKeys(metadata);
      const relatedOrders: AnyOrder[] = [];

      for (const key of keys) {
        const found = groups.get(String(key));
        if (found?.length) relatedOrders.push(...found);
      }

      const uniqueOrders = Array.from(
        new Map(
          relatedOrders.map((order) => [order.id, order])
        ).values()
      );

      const ordersAfterQuote = uniqueOrders.filter((order) => {
        const orderDate = new Date(order.created_at);
        const quoteDate = new Date(log.created_at);

        return orderDate.getTime() >= quoteDate.getTime();
      });

      const purchasedCodes = new Set<string>();
      const purchasedNames = new Set<string>();

      for (const order of ordersAfterQuote) {
        for (const item of orderItems(order)) {
          const code = itemCode(item);
          const name = itemName(item);

          if (code) purchasedCodes.add(code);
          if (name) purchasedNames.add(normalizeLoose(name));
        }
      }

      const missing = quoteItems
        .filter((item: any) => {
          const code = quoteItemCode(item);
          const name = normalizeLoose(quoteItemName(item));

          if (code && purchasedCodes.has(code)) return false;
          if (name && purchasedNames.has(name)) return false;

          return true;
        })
        .slice(0, 8);

      if (!missing.length && ordersAfterQuote.length > 0) {
        continue;
      }

      const quoteAgeDays = Math.max(
        0,
        daysBetween(now, new Date(log.created_at))
      );

      const estimatedValue =
        missing.reduce(
          (sum: number, item: any) =>
            sum + quoteItemTotal(item),
          0
        ) || asNumber(metadata.total);

      const customer = uniqueOrders[0]
        ? customerPayload(uniqueOrders[0])
        : {
            id: metadata.customerId || null,
            internalCode:
              metadata.customerInternalCode ||
              metadata.clientId ||
              null,
            name:
              metadata.customerName ||
              metadata.clientName ||
              "Cliente sem nome",
            document: metadata.document || null,
            sellerName: "",
            sellerId: null,
          };

      const action: any = {
        id: `quote-gap-${log.id}`,
        type: "quote_gap",
        title:
          ordersAfterQuote.length === 0
            ? "Cotação salva sem pedido"
            : "Produto cotado não entrou no pedido",
        priority:
          estimatedValue >= 1000 || quoteAgeDays >= 3
            ? "alta"
            : "media",
        customer,
        quoteId: log.id,
        quoteDate: fmtDate(log.created_at),
        quoteAgeDays,
        reason:
          ordersAfterQuote.length === 0
            ? `Cliente recebeu cotação há ${quoteAgeDays} dia(s), mas ainda não há pedido vinculado após a cotação.`
            : `Cliente fez pedido depois da cotação, mas ${missing.length} item(ns) cotado(s) não entraram na compra.`,
        recommendation:
          "Retomar contato oferecendo os itens cotados como complemento ou condição especial.",
        products: missing.map((item: any) => ({
          code: quoteItemCode(item),
          name: quoteItemName(item),
          quotedValue: quoteItemTotal(item),
          quotedValueFormatted: fmtBRL(quoteItemTotal(item)),
        })),
        estimatedValue,
        estimatedValueFormatted: fmtBRL(estimatedValue),
      };

      action.score = scoreAction(action);
      action.message = buildWhatsappMessage(action);
      actions.push(action);
    }

    // 4) Proteção de carteira + recorrência.
    const portfolioItems: any[] = [];

    for (const customer of customers) {
      const normalizedStatus = normalizeLoose(customer.status);

      if (
        normalizedStatus === "BLOQUEADO" ||
        normalizedStatus === "INADIMPLENTE"
      ) {
        continue;
      }

      const customerOrders = [
        ...(ordersByCustomerId.get(customer.id) || []),
      ].sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
      );

      const latestOrder = customerOrders[0] || null;
      const actualLastOrderAt = latestDate(
        latestOrder?.created_at,
        customer.last_order_at
      );

      const activationLog =
        latestActivationByCustomer.get(customer.id) || null;
      const latestPortfolioLog =
        latestPortfolioLogByCustomer.get(customer.id) || null;

      const activationAt = activationLog
        ? new Date(activationLog.created_at)
        : null;

      const referenceAt = latestDate(
        actualLastOrderAt,
        activationAt
      );

      const daysSinceReference = referenceAt
        ? Math.max(0, calendarDiffDays(now, referenceAt))
        : null;

      const rhythm = analyzePurchaseRhythm(customerOrders);
      const expectedDiff =
        rhythm?.expectedAt
          ? calendarDiffDays(rhythm.expectedAt, now)
          : null;

      let recurrenceStatus: PortfolioStatus | null = null;

      if (rhythm?.expectedAt) {
        if (expectedDiff !== null && expectedDiff < 0) {
          recurrenceStatus = "habit_overdue";
        } else if (expectedDiff === 0) {
          recurrenceStatus = "expected_today";
        } else if (expectedDiff === 1) {
          recurrenceStatus = "expected_tomorrow";
        }
      } else if (actualLastOrderAt) {
        recurrenceStatus = manualWeekdaySignal(customer, now);
      }

      let protectionStatus: PortfolioStatus | null = null;

      if (daysSinceReference !== null) {
        if (daysSinceReference >= 30) {
          protectionStatus = "critical";
        } else if (daysSinceReference === 29) {
          protectionStatus = "d29";
        } else if (daysSinceReference >= 26) {
          protectionStatus = "attention";
        }
      }

      const latestPortfolioMetadata = latestPortfolioLog
        ? quoteMetadata(latestPortfolioLog)
        : {};

      const lastPortfolioAction =
        latestPortfolioLog?.action ===
        "portfolio_pmg_not_activated"
          ? "not_activated"
          : latestPortfolioLog?.action ===
              "portfolio_pmg_activated"
            ? "activated"
            : null;

      const latestLogAge =
        latestPortfolioLog?.created_at
          ? Math.max(
              0,
              calendarDiffDays(
                now,
                new Date(latestPortfolioLog.created_at)
              )
            )
          : null;

      let status: PortfolioStatus | null =
        protectionStatus || recurrenceStatus;

      if (
        !status &&
        lastPortfolioAction === "not_activated" &&
        latestLogAge !== null &&
        latestLogAge <= 7
      ) {
        status = "not_activated";
      }

      if (
        !status &&
        lastPortfolioAction === "activated" &&
        latestLogAge !== null &&
        latestLogAge <= 7
      ) {
        status = "protected";
      }

      if (!status) continue;

      const name =
        customer.trade_name ||
        customer.legal_name ||
        "Cliente sem nome";

      const copy = makePortfolioCopy(
        status,
        name,
        daysSinceReference || 0,
        rhythm
      );

      const item = {
        id: `portfolio-${customer.id}-${status}`,
        customer: customerPayloadFromCustomer(customer),
        status,
        statusRank: portfolioStatusRank(status),
        title: copy.title,
        reason: copy.reason,
        recommendation: copy.recommendation,
        referenceAt: referenceAt?.toISOString() || null,
        referenceDate: referenceAt ? fmtDate(referenceAt) : null,
        daysSinceReference,
        lastOrderAt:
          actualLastOrderAt?.toISOString() || null,
        lastOrderDate: actualLastOrderAt
          ? fmtDate(actualLastOrderAt)
          : null,
        lastActivationAt:
          activationAt?.toISOString() || null,
        lastActivationDate: activationAt
          ? fmtDate(activationAt)
          : null,
        lastPortfolioAction,
        lastPortfolioActionAt: latestPortfolioLog?.created_at
          ? new Date(latestPortfolioLog.created_at).toISOString()
          : null,
        lastPortfolioActionNote:
          latestPortfolioMetadata?.note || null,
        rhythm: rhythm
          ? {
              cadence: rhythm.cadence,
              intervalDays: rhythm.intervalDays,
              confidence: rhythm.confidence,
              dominantWeekday: rhythm.dominantWeekday,
              expectedAt:
                rhythm.expectedAt?.toISOString() || null,
              expectedDate: rhythm.expectedAt
                ? fmtDate(rhythm.expectedAt)
                : null,
              sampleSize: rhythm.sampleSize,
            }
          : null,
        manualHabitualPurchaseDay:
          customer.habitual_purchase_day || null,
        manualPurchaseWeekdays:
          customer.purchase_weekdays || [],
      };

      portfolioItems.push(item);

      if (
        [
          "critical",
          "d29",
          "habit_overdue",
          "expected_today",
        ].includes(status)
      ) {
        const action: any = {
          id: item.id,
          type: "portfolio",
          portfolioStatus: status,
          title: copy.title,
          priority:
            status === "critical" || status === "d29"
              ? "alta"
              : "media",
          customer: item.customer,
          reason: copy.reason,
          recommendation: copy.recommendation,
          products: [],
          estimatedValue: 0,
        };

        action.score = scoreAction(action);
        action.message = buildWhatsappMessage(action);
        actions.push(action);
      }
    }

    portfolioItems.sort(
      (a, b) =>
        b.statusRank - a.statusRank ||
        (b.daysSinceReference || 0) -
          (a.daysSinceReference || 0)
    );

    const portfolioSummary = {
      total: portfolioItems.length,
      attention: portfolioItems.filter(
        (item) => item.status === "attention"
      ).length,
      d29: portfolioItems.filter(
        (item) => item.status === "d29"
      ).length,
      critical: portfolioItems.filter(
        (item) => item.status === "critical"
      ).length,
      expectedToday: portfolioItems.filter(
        (item) => item.status === "expected_today"
      ).length,
      expectedTomorrow: portfolioItems.filter(
        (item) => item.status === "expected_tomorrow"
      ).length,
      overdueHabit: portfolioItems.filter(
        (item) => item.status === "habit_overdue"
      ).length,
      activated: portfolioItems.filter(
        (item) => item.status === "protected"
      ).length,
      notActivated: portfolioItems.filter(
        (item) => item.status === "not_activated"
      ).length,
    };

    const dedup = new Map<string, any>();

    for (const action of actions) {
      const key = `${action.type}-${action.customer.id || action.customer.internalCode || action.customer.name}-${action.orderId || ""}-${action.portfolioStatus || ""}`;

      if (
        !dedup.has(key) ||
        dedup.get(key).score < action.score
      ) {
        dedup.set(key, action);
      }
    }

    const prioritizedActions = Array.from(
      dedup.values()
    ).sort((a, b) => b.score - a.score);

    const boletoActions = prioritizedActions.filter(
      (action) => action.type === "boleto"
    );
    const ticketActions = prioritizedActions.filter(
      (action) => action.type === "ticket"
    );
    const mixActions = prioritizedActions.filter(
      (action) => action.type === "mix"
    );
    const paymentActions = prioritizedActions.filter(
      (action) => action.type === "pagamento"
    );
    const quoteGapActions = prioritizedActions.filter(
      (action) => action.type === "quote_gap"
    );
    const portfolioActions = prioritizedActions.filter(
      (action) => action.type === "portfolio"
    );

    const potential = prioritizedActions.reduce(
      (sum, action) =>
        sum + asNumber(action.estimatedValue),
      0
    );

    const sellerMap = new Map<string, any>();

    for (const action of prioritizedActions) {
      const seller =
        action.customer.sellerName || "Sem vendedor";

      const current = sellerMap.get(seller) || {
        seller,
        actions: 0,
        highPriority: 0,
        potential: 0,
      };

      current.actions += 1;

      if (action.priority === "alta") {
        current.highPriority += 1;
      }

      current.potential += asNumber(
        action.estimatedValue
      );

      sellerMap.set(seller, current);
    }

    const whatsappSummary =
      `Bom dia!\n\n` +
      `Hoje a Central IA encontrou:\n` +
      `• ${portfolioSummary.d29} cliente(s) no D+29\n` +
      `• ${portfolioSummary.critical} cliente(s) com 30+ dias de risco\n` +
      `• ${portfolioSummary.expectedToday} compra(s) esperada(s) hoje\n` +
      `• ${portfolioSummary.overdueHabit} cliente(s) com padrão de compra atrasado\n` +
      `• ${boletoActions.length} boleto(s) próximos do vencimento\n` +
      `• ${ticketActions.length} cliente(s) com queda de ticket\n` +
      `• ${mixActions.length} cliente(s) com oportunidade de mix perdido\n` +
      `• ${quoteGapActions.length} oportunidade(s) de cotação não convertida\n\n` +
      `Potencial estimado: ${fmtBRL(potential)}\n\n` +
      `Prioridade: ${prioritizedActions[0]?.customer?.name || "sem ação crítica no momento"}`;

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      scope:
        role === "VENDEDOR" ? "seller" : "company",
      summary: {
        totalActions: prioritizedActions.length,
        boletos: boletoActions.length,
        ticket: ticketActions.length,
        mix: mixActions.length,
        pagamento: paymentActions.length,
        cotacoes: quoteGapActions.length,
        portfolio: portfolioActions.length,
        potential,
        potentialFormatted: fmtBRL(potential),
        highPriority: prioritizedActions.filter(
          (action) => action.priority === "alta"
        ).length,
      },
      actions: prioritizedActions,
      groups: {
        boletos: boletoActions,
        ticket: ticketActions,
        mix: mixActions,
        pagamento: paymentActions,
        cotacoes: quoteGapActions,
        portfolio: portfolioActions,
      },
      portfolio: {
        summary: portfolioSummary,
        items: portfolioItems,
      },
      supervisor: {
        sellers: Array.from(sellerMap.values()).sort(
          (a, b) => b.potential - a.potential
        ),
      },
      whatsappSummary,
    });
  } catch (error: any) {
    console.error(
      "[GET /api/crm/customer-intelligence]",
      error
    );

    return NextResponse.json(
      {
        error: "Erro ao gerar inteligência comercial.",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
