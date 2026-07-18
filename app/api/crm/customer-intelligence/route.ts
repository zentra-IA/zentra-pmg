import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

type AnyOrder = any;
type AnyItem = any;

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
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
}

function onlyDate(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function daysBetween(a: Date, b: Date) {
  const ms = onlyDate(a).getTime() - onlyDate(b).getTime();
  return Math.round(ms / 86400000);
}


function itemName(item: AnyItem) {
  return String(item.product_name || item.name || item.description || "Produto sem nome").trim();
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
    internalCode: order.customer_internal_code || order.SalesCustomer?.internal_code || null,
    name: customerName(order),
    document: order.document || order.SalesCustomer?.document || null,
    sellerName: order.seller_name || "",
    sellerId: order.seller_id || null,
  };
}

function isBoleto(payment: any) {
  return String(payment || "").toLowerCase().includes("boleto");
}

function isCancelled(status: any) {
  const s = String(status || "").toLowerCase();
  return s.includes("cancel");
}

function isDelivered(status: any) {
  const s = String(status || "").toLowerCase();
  return s.includes("entreg");
}

function buildWhatsappMessage(action: any) {
  const products =
    action.products && action.products.length
      ? `\n\nProdutos para trabalhar:\n${action.products.map((p: any) => `• ${p.name}`).join("\n")}`
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
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as any : {};
}

function quoteItemsFromMetadata(metadata: any) {
  return Array.isArray(metadata?.items) ? metadata.items : [];
}

function quoteItemCode(item: any) {
  return String(item?.code || item?.productCode || item?.selectedCode || "").trim();
}

function quoteItemName(item: any) {
  return String(item?.name || item?.productName || item?.product || item?.officialName || "Produto sem nome").trim();
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
    .map((v) => String(v));
}


function scoreAction(action: any) {
  let score = 0;

  if (action.type === "boleto") score += 35;
  if (action.type === "ticket") score += 30;
  if (action.type === "mix") score += 32;
  if (action.type === "pagamento") score += 18;
  if (action.type === "quote_gap") score += 38;

  if (action.priority === "alta") score += 25;
  if (action.priority === "media") score += 12;

  score += Math.min(30, Math.round(asNumber(action.estimatedValue) / 250));

  if (action.daysUntilDue !== undefined && action.daysUntilDue <= 1) score += 25;
  if (action.dropPercent !== undefined && action.dropPercent >= 30) score += 25;

  return Math.max(0, Math.min(100, score));
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
    const start120 = new Date(now);
    start120.setDate(start120.getDate() - 120);

    const orders = await prisma.salesOrder.findMany({
      where: {
        company_id,
        created_at: { gte: start120 },
        ...(role === "VENDEDOR" ? { seller_id } : {}),
      },
      include: {
        SalesOrderItem: true,
        SalesCustomer: true,
      },
      orderBy: { created_at: "desc" },
      take: 800,
    });

    const activeOrders = orders.filter((o: AnyOrder) => !isCancelled(o.status));

    const groups = new Map<string, AnyOrder[]>();
    for (const order of activeOrders) {
      const key = String(customerKey(order));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(order);
    }

    const actions: any[] = [];

    // 1) Boletos próximos
    for (const order of activeOrders) {
      if (!order.boleto_due_date || !isBoleto(order.payment_terms) || isCancelled(order.status)) continue;

      const due = new Date(order.boleto_due_date);
      const daysUntilDue = daysBetween(due, now);

      if (daysUntilDue >= 0 && daysUntilDue <= 7) {
        const action: any = {
          id: `boleto-${order.id}`,
          type: "boleto",
          title: daysUntilDue === 0 ? "Boleto vence hoje" : `Boleto vence em ${daysUntilDue} dia(s)`,
          priority: daysUntilDue <= 1 ? "alta" : "media",
          customer: customerPayload(order),
          orderId: order.id,
          orderNumber: order.order_number,
          dueDate: fmtDate(order.boleto_due_date),
          daysUntilDue,
          value: asNumber(order.total),
          valueFormatted: fmtBRL(order.total),
          reason: `Boleto do pedido ${order.order_number || ""} vence em ${fmtDate(order.boleto_due_date)}.`,
          recommendation: "Avisar o cliente para manter as contas em dia e evitar atraso.",
          products: [],
          estimatedValue: asNumber(order.total),
        };
        action.score = scoreAction(action);
        action.message = buildWhatsappMessage(action);
        actions.push(action);
      }
    }

    // 2) Ticket, mix e pagamento por cliente
    for (const [, customerOrdersRaw] of groups.entries()) {
      const customerOrders = [...customerOrdersRaw].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      if (!customerOrders.length) continue;

      const latest = customerOrders[0];
      const previous = customerOrders.slice(1, 8);
      const customer = customerPayload(latest);

      const latestTotal = asNumber(latest.total);
      const previousAvg =
        previous.length > 0
          ? previous.reduce((sum, order) => sum + asNumber(order.total), 0) / previous.length
          : 0;

      if (previousAvg > 0 && latestTotal < previousAvg * 0.8) {
        const dropPercent = Math.round(((previousAvg - latestTotal) / previousAvg) * 100);
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
          recommendation: "Verifique quais itens ficaram fora do pedido e ofereça um complemento.",
          products: [],
          estimatedValue: Math.max(0, previousAvg - latestTotal),
        };
        action.score = scoreAction(action);
        action.message = buildWhatsappMessage(action);
        actions.push(action);
      }

      // Mix perdido: produtos recorrentes nos pedidos anteriores que não apareceram no último pedido.
      if (previous.length >= 2) {
        const latestCodes = new Set(orderItems(latest).map((i) => itemCode(i)).filter(Boolean));
        const previousProducts = new Map<string, any>();

        for (const order of previous) {
          for (const item of orderItems(order)) {
            const code = itemCode(item) || itemName(item).toUpperCase();
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
          .filter((p) => p.count >= 2 && !latestCodes.has(p.code))
          .sort((a, b) => b.total - a.total)
          .slice(0, 5);

        if (missing.length > 0) {
          const estimatedValue = missing.reduce((sum, p) => sum + p.total / Math.max(1, p.count), 0);

          const action: any = {
            id: `mix-${latest.id}`,
            type: "mix",
            title: "Produtos que o cliente deixou de comprar",
            priority: estimatedValue >= 1000 ? "alta" : "media",
            customer,
            orderId: latest.id,
            orderNumber: latest.order_number,
            reason: `O cliente deixou de comprar ${missing.length} produto(s) recorrente(s) no último pedido.`,
            recommendation: "Ofereça esses itens como complemento ou combo na próxima abordagem.",
            products: missing.map((p) => ({
              code: p.code,
              name: p.name,
              averageValue: Math.round((p.total / Math.max(1, p.count)) * 100) / 100,
            })),
            estimatedValue,
            estimatedValueFormatted: fmtBRL(estimatedValue),
          };
          action.score = scoreAction(action);
          action.message = buildWhatsappMessage(action);
          actions.push(action);
        }
      }

      // Sugestão de boleto: últimos pedidos sem boleto.
      const lastFour = customerOrders.slice(0, 4);
      const nonBoletoCount = lastFour.filter((o) => !isBoleto(o.payment_terms)).length;

      if (lastFour.length >= 3 && nonBoletoCount >= 3) {
        const recentTotal = lastFour.reduce((sum, o) => sum + asNumber(o.total), 0);
        const action: any = {
          id: `pagamento-${customer.id || customer.internalCode || customer.name}`,
          type: "pagamento",
          title: "Sugerir pagamento em boleto",
          priority: "baixa",
          customer,
          orderId: latest.id,
          orderNumber: latest.order_number,
          reason: `Cliente fez ${nonBoletoCount} dos últimos ${lastFour.length} pedidos sem boleto.`,
          recommendation: "Avalie oferecer boleto para facilitar recorrência e aumentar fidelização.",
          products: [],
          estimatedValue: recentTotal / lastFour.length,
          estimatedValueFormatted: fmtBRL(recentTotal / lastFour.length),
        };
        action.score = scoreAction(action);
        action.message = buildWhatsappMessage(action);
        actions.push(action);
      }
    }


    // 3) Cotações salvas x pedidos: itens cotados que ainda não viraram compra.
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

      const uniqueOrders = Array.from(new Map(relatedOrders.map((order) => [order.id, order])).values());
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

      if (!missing.length && ordersAfterQuote.length > 0) continue;

      const quoteAgeDays = Math.max(0, daysBetween(now, new Date(log.created_at)));
      // Mostra a oportunidade imediatamente após salvar o histórico.
      // Antes isso só aparecia depois de 1 dia, então a Central IA parecia não estar lendo a cotação.

      const estimatedValue = missing.reduce((sum: number, item: any) => sum + quoteItemTotal(item), 0) || asNumber(metadata.total);

      const customer = uniqueOrders[0]
        ? customerPayload(uniqueOrders[0])
        : {
            id: metadata.customerId || null,
            internalCode: metadata.customerInternalCode || metadata.clientId || null,
            name: metadata.customerName || metadata.clientName || "Cliente sem nome",
            document: metadata.document || null,
            sellerName: "",
            sellerId: null,
          };

      const action: any = {
        id: `quote-gap-${log.id}`,
        type: "quote_gap",
        title: ordersAfterQuote.length === 0 ? "Cotação salva sem pedido" : "Produto cotado não entrou no pedido",
        priority: estimatedValue >= 1000 || quoteAgeDays >= 3 ? "alta" : "media",
        customer,
        quoteId: log.id,
        quoteDate: fmtDate(log.created_at),
        quoteAgeDays,
        reason:
          ordersAfterQuote.length === 0
            ? `Cliente recebeu cotação há ${quoteAgeDays} dia(s), mas ainda não há pedido vinculado após a cotação.`
            : `Cliente fez pedido depois da cotação, mas ${missing.length} item(ns) cotado(s) não entraram na compra.`,
        recommendation: "Retomar contato oferecendo os itens cotados como complemento ou condição especial.",
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


    const dedup = new Map<string, any>();
    for (const action of actions) {
      const key = `${action.type}-${action.customer.id || action.customer.internalCode || action.customer.name}-${action.orderId || ""}`;
      if (!dedup.has(key) || dedup.get(key).score < action.score) dedup.set(key, action);
    }

    const prioritizedActions = Array.from(dedup.values()).sort((a, b) => b.score - a.score);

    const boletoActions = prioritizedActions.filter((a) => a.type === "boleto");
    const ticketActions = prioritizedActions.filter((a) => a.type === "ticket");
    const mixActions = prioritizedActions.filter((a) => a.type === "mix");
    const paymentActions = prioritizedActions.filter((a) => a.type === "pagamento");
    const quoteGapActions = prioritizedActions.filter((a) => a.type === "quote_gap");

    const potential = prioritizedActions.reduce((sum, a) => sum + asNumber(a.estimatedValue), 0);

    const sellerMap = new Map<string, any>();
    for (const action of prioritizedActions) {
      const seller = action.customer.sellerName || "Sem vendedor";
      const current = sellerMap.get(seller) || {
        seller,
        actions: 0,
        highPriority: 0,
        potential: 0,
      };
      current.actions += 1;
      if (action.priority === "alta") current.highPriority += 1;
      current.potential += asNumber(action.estimatedValue);
      sellerMap.set(seller, current);
    }

    const whatsappSummary =
      `Bom dia!\n\n` +
      `Hoje a Central IA encontrou:\n` +
      `• ${boletoActions.length} boleto(s) próximos do vencimento\n` +
      `• ${ticketActions.length} cliente(s) com queda de ticket\n` +
      `• ${mixActions.length} cliente(s) com produtos ausentes no último pedido\n` +
      `• ${paymentActions.length} sugestão(ões) de pagamento\n` +
      `• ${quoteGapActions.length} oportunidade(s) de cotação não convertida\n\n` +
      `Potencial estimado: ${fmtBRL(potential)}\n\n` +
      `Prioridade: ${prioritizedActions[0]?.customer?.name || "sem ação crítica no momento"}`;

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      scope: role === "VENDEDOR" ? "seller" : "company",
      summary: {
        totalActions: prioritizedActions.length,
        boletos: boletoActions.length,
        ticket: ticketActions.length,
        mix: mixActions.length,
        pagamento: paymentActions.length,
        cotacoes: quoteGapActions.length,
        potential,
        potentialFormatted: fmtBRL(potential),
        highPriority: prioritizedActions.filter((a) => a.priority === "alta").length,
      },
      actions: prioritizedActions,
      groups: {
        boletos: boletoActions,
        ticket: ticketActions,
        mix: mixActions,
        pagamento: paymentActions,
        cotacoes: quoteGapActions,
      },
      supervisor: {
        sellers: Array.from(sellerMap.values()).sort((a, b) => b.potential - a.potential),
      },
      whatsappSummary,
    });
  } catch (error: any) {
    console.error("[GET /api/crm/customer-intelligence]", error);
    return NextResponse.json(
      {
        error: "Erro ao gerar inteligência comercial.",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}