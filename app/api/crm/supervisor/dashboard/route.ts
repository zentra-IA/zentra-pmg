import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function getCompanyId(req: NextRequest) {
  return (
    req.headers.get("x-company-id") ||
    req.cookies.get("company_id")?.value ||
    req.cookies.get("zentra_company_id")?.value ||
    process.env.DEFAULT_COMPANY_ID ||
    ""
  );
}

function getRole(req: NextRequest) {
  return (
    req.headers.get("x-user-role") ||
    req.cookies.get("user_role")?.value ||
    req.cookies.get("zentra_user_role")?.value ||
    req.cookies.get("role")?.value ||
    ""
  ).toUpperCase();
}

function canAccess(role: string) {
  return ["SUPERVISOR", "GERAL", "MASTER", "ADMIN", "OWNER"].includes(role);
}

function money(value: any) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function normalize(value: any) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function betweenDates(req: NextRequest) {
  const url = new URL(req.url);
  const period = url.searchParams.get("period") || "month";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const now = new Date();

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

  const endOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  if (from || to) {
    return {
      start: from ? startOfDay(new Date(from)) : new Date(2000, 0, 1),
      end: to ? endOfDay(new Date(to)) : endOfDay(now),
      label: "Personalizado",
    };
  }

  if (period === "today") {
    return { start: startOfDay(now), end: endOfDay(now), label: "Hoje" };
  }

  if (period === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    return { start: startOfDay(start), end: endOfDay(now), label: "7 dias" };
  }

  if (period === "15d") {
    const start = new Date(now);
    start.setDate(now.getDate() - 15);
    return { start: startOfDay(start), end: endOfDay(now), label: "15 dias" };
  }

  if (period === "30d") {
    const start = new Date(now);
    start.setDate(now.getDate() - 30);
    return { start: startOfDay(start), end: endOfDay(now), label: "30 dias" };
  }

  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    label: "Este mês",
  };
}

async function resolveCompanyId(req: NextRequest) {
  const fromReq = getCompanyId(req);
  if (fromReq) return fromReq;

  const company = await prisma.companies.findFirst({
    select: { id: true },
  });

  return company?.id || "";
}

function kanbanLabel(status: string) {
  const map: Record<string, string> = {
    novo: "Novo lead",
    enviado: "Mensagem enviada",
    respondeu: "Cliente respondeu",
    quer_agendar_entrevista: "Quer cotação",
    entrevista_agendada: "Cotação enviada",
    campanha: "Campanha",
    reagendar_futuro: "Retornar depois",
    contratado: "Vendido",
    sem_interesse: "Perdido",
    nao_aprovado: "Perdido",
  };

  return map[status] || status || "Sem status";
}

function calcIndex(seller: any) {
  let score = 0;

  score += Math.min(Number(seller.goalPercent || 0), 100) * 0.22;
  score += Math.min(Number(seller.orders || 0) * 5, 18);
  score += Math.min(Number(seller.quotes || 0) * 4, 12);
  score += Math.min(Number(seller.messagesSent || 0) * 0.2, 10);
  score += Math.min(Number(seller.messagesAnswered || 0) * 0.3, 10);
  score += Math.min(Number(seller.radarViews || 0) * 0.4, 10);
  score += Math.min(Number(seller.customersActive || 0) * 0.08, 8);
  score += Math.min(Number(seller.activities || 0) * 1.5, 10);

  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function GET(req: NextRequest) {
  try {
    const role = getRole(req);

    if (!canAccess(role)) {
      return NextResponse.json(
        { ok: false, error: "Acesso negado." },
        { status: 403 }
      );
    }

    const company_id = await resolveCompanyId(req);

    if (!company_id) {
      return NextResponse.json(
        { ok: false, error: "Empresa não encontrada." },
        { status: 401 }
      );
    }

    const range = betweenDates(req);
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      sellers,
      customers,
      orders,
      orderItems,
      leads,
      messages,
      crmMessages,
      activities,
      goals,
      campaignsCount,
    ] = await Promise.all([
      prisma.company_users.findMany({
        where: {
          company_id,
          active: true,
          role: { in: ["VENDEDOR", "SUPERVISOR", "GERAL", "MASTER", "ADMIN"] },
        },
        select: {
          user_id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
        },
        orderBy: { name: "asc" },
      }),

      prisma.salesCustomer.findMany({
        where: { company_id },
        select: {
          id: true,
          seller_id: true,
          legal_name: true,
          trade_name: true,
          phone: true,
          whatsapp: true,
          status: true,
          risk_level: true,
          last_contact_at: true,
          last_order_at: true,
          last_quote_at: true,
          expected_ticket: true,
        },
      }),

      prisma.salesOrder.findMany({
        where: {
          company_id,
          OR: [
            { delivery_date: { gte: range.start, lte: range.end } },
            {
              delivery_date: null,
              created_at: { gte: range.start, lte: range.end },
            },
          ],
        },
        select: {
          id: true,
          seller_id: true,
          seller_name: true,
          customer_id: true,
          customer_name: true,
          total: true,
          payment_terms: true,
          boleto_due_date: true,
          status: true,
          created_at: true,
          delivery_date: true,
        },
      }),

      prisma.salesOrderItem.findMany({
        where: {
          company_id,
          created_at: { gte: range.start, lte: range.end },
        },
        select: {
          id: true,
          order_id: true,
          product_code: true,
          product_name: true,
          quantity: true,
          total: true,
        },
      }),

      prisma.leads.findMany({
        where: {
          company_id,
          OR: [
            { created_at: { gte: range.start, lte: range.end } },
            { updated_at: { gte: range.start, lte: range.end } },
            { last_message_at: { gte: range.start, lte: range.end } },
          ],
        },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          status: true,
          created_at: true,
          updated_at: true,
          last_message_at: true,
        },
      }),

      prisma.messages.findMany({
        where: {
          company_id,
          created_at: { gte: range.start, lte: range.end },
        },
        select: {
          id: true,
          lead_id: true,
          direction: true,
          created_at: true,
        },
      }),

      prisma.crmMessage.findMany({
        where: {
          company_id,
          createdAt: { gte: range.start, lte: range.end },
        },
        select: {
          id: true,
          phone: true,
          direction: true,
          createdAt: true,
        },
      }),

      prisma.salesCustomerActivity.findMany({
        where: {
          company_id,
          OR: [
            { created_at: { gte: range.start, lte: range.end } },
            { scheduled_at: { gte: range.start, lte: range.end } },
          ],
        },
        select: {
          id: true,
          seller_id: true,
          customer_id: true,
          lead_id: true,
          type: true,
          origin: true,
          title: true,
          status: true,
          priority: true,
          created_at: true,
          scheduled_at: true,
        },
        orderBy: { created_at: "desc" },
      }),

      prisma.sales_goals.findMany({
        where: {
          company_id,
          year,
          month,
        },
        select: {
          seller_id: true,
          goal_amount: true,
        },
      }),

      prisma.campaign.count({
        where: { company_id },
      }),
    ]);

    const customerById = new Map(customers.map((c) => [String(c.id), c]));
    const customerByPhone = new Map<string, any>();

    for (const c of customers) {
      const phones = [c.phone, c.whatsapp]
        .filter(Boolean)
        .map((p) => String(p).replace(/\D/g, ""));

      for (const p of phones) customerByPhone.set(p, c);
    }

    const leadOwner = new Map<string, string>();

    for (const a of activities) {
      if (a.lead_id && a.seller_id && !leadOwner.has(String(a.lead_id))) {
        leadOwner.set(String(a.lead_id), String(a.seller_id));
      }
    }

    function getOrderSeller(order: any) {
      const customer = order.customer_id
        ? customerById.get(String(order.customer_id))
        : null;

      // Regra principal do supervisor:
      // se o pedido foi lançado por outro usuário, mas o cliente pertence a um vendedor,
      // a venda deve contar para o vendedor dono da carteira.
      if (customer?.seller_id) {
        return String(customer.seller_id);
      }

      const onlyRealSellers = sellers.filter(
        (s) => normalize(s.role) === "vendedor"
      );

      const orderSellerId = String(order.seller_id || "");

      if (orderSellerId) {
        const linkedSeller = sellers.find(
          (s) => String(s.user_id) === orderSellerId
        );

        // Só usa seller_id do pedido se ele for realmente um vendedor.
        // Se for admin/geral/supervisor que cadastrou o pedido, tenta atribuir abaixo.
        if (linkedSeller && normalize(linkedSeller.role) === "vendedor") {
          return orderSellerId;
        }
      }

      const orderSeller = normalize(order.seller_name);
      const orderCustomer = normalize(order.customer_name);

      const byName = sellers.find((s) => {
        const sellerName = normalize(s.name);
        const sellerEmail = normalize(s.email);

        return (
          orderSeller &&
          (orderSeller.includes(sellerName) ||
            sellerName.includes(orderSeller) ||
            orderSeller.includes(sellerEmail) ||
            orderCustomer.includes(sellerName))
        );
      });

      if (byName?.user_id) {
        return String(byName.user_id);
      }

      // Fallback importante para operações pequenas:
      // se só existe um vendedor real, todo pedido sem vínculo claro entra para ele.
      if (onlyRealSellers.length === 1) {
        return String(onlyRealSellers[0].user_id);
      }

      return "sem_vendedor";
    }

    function getLeadSeller(lead: any) {
      return leadOwner.get(String(lead.id)) || "sem_vendedor";
    }

    function getMessageSeller(msg: any) {
      if (msg.lead_id) return leadOwner.get(String(msg.lead_id)) || "sem_vendedor";
      return "sem_vendedor";
    }

    function getCrmMessageSeller(msg: any) {
      const phone = String(msg.phone || "").replace(/\D/g, "");
      const customer = customerByPhone.get(phone);
      return customer?.seller_id ? String(customer.seller_id) : "sem_vendedor";
    }

    const sellersResult = sellers.map((seller) => {
      const sellerId = String(seller.user_id);

      const sellerCustomers = customers.filter(
        (c) => String(c.seller_id || "") === sellerId
      );

      const sellerOrders = orders.filter(
        (order) => getOrderSeller(order) === sellerId
      );

      const sellerActivities = activities.filter(
        (a) => String(a.seller_id || "") === sellerId
      );

      const sellerLeads = leads.filter(
        (lead) => getLeadSeller(lead) === sellerId
      );

      const sellerMessages = messages.filter(
        (msg) => getMessageSeller(msg) === sellerId
      );

      const sellerCrmMessages = crmMessages.filter(
        (msg) => getCrmMessageSeller(msg) === sellerId
      );

      const allMessages = [
        ...sellerMessages.map((m) => ({ direction: m.direction })),
        ...sellerCrmMessages.map((m) => ({ direction: m.direction })),
      ];

      const messagesSent = allMessages.filter((m) =>
        ["out", "outbound", "sent", "enviada"].includes(normalize(m.direction))
      ).length;

      const messagesAnswered = allMessages.filter((m) =>
        ["in", "inbound", "received", "recebida"].includes(normalize(m.direction))
      ).length;

      const revenue = sellerOrders.reduce(
        (sum, order) => sum + Number(order.total || 0),
        0
      );

      const goal = Number(
        goals.find((g) => String(g.seller_id || "") === sellerId)?.goal_amount || 0
      );

      const goalPercent = goal > 0 ? Math.round((revenue / goal) * 100) : 0;

      const quoteActivities = sellerActivities.filter((a) => {
        const text = normalize(`${a.type} ${a.origin} ${a.title}`);
        return text.includes("cotacao") || text.includes("quote");
      });

      const radarActivities = sellerActivities.filter((a) => {
        const text = normalize(`${a.type} ${a.origin} ${a.title}`);
        return text.includes("radar");
      });

      const kanban: Record<string, number> = {};

      for (const lead of sellerLeads) {
        const status = String(lead.status || "novo");
        const label = kanbanLabel(status);
        kanban[label] = (kanban[label] || 0) + 1;
      }

      const customersActive = sellerCustomers.filter((c) => c.status === "ativo").length;
      const customersRisk = sellerCustomers.filter(
        (c) => c.status === "risco" || c.risk_level === "alto"
      ).length;
      const customersInactive = sellerCustomers.filter((c) => c.status === "inativo").length;
      const customersWithoutContact = sellerCustomers.filter(
        (c) => !c.last_contact_at || new Date(c.last_contact_at) < sevenDaysAgo
      ).length;

      const averageTicket =
        sellerOrders.length > 0 ? revenue / sellerOrders.length : 0;

      const boletoOverdue = sellerOrders.filter(
        (o) =>
          o.boleto_due_date &&
          new Date(o.boleto_due_date) < now &&
          normalize(o.status) !== "pago"
      ).length;

      const productMix = new Set(
        orderItems
          .filter((item) =>
            sellerOrders.some((order) => String(order.id) === String(item.order_id))
          )
          .map((item) => item.product_code || item.product_name)
      ).size;

      const sellerDTO: any = {
        id: sellerId,
        name: seller.name || seller.email || "Vendedor",
        email: seller.email,
        phone: seller.phone,
        role: seller.role,

        goal,
        goalFormatted: money(goal),
        sold: revenue,
        soldFormatted: money(revenue),
        goalPercent,

        orders: sellerOrders.length,
        averageTicket,
        averageTicketFormatted: money(averageTicket),
        boletoOverdue,
        productMix,

        quotes: quoteActivities.length,
        quoteAverage: quoteActivities.length
          ? revenue / Math.max(quoteActivities.length, 1)
          : 0,

        messagesSent,
        messagesAnswered,
        messagesNotAnswered: Math.max(messagesSent - messagesAnswered, 0),
        messageResponseRate:
          messagesSent > 0 ? Math.round((messagesAnswered / messagesSent) * 100) : 0,

        radarViews: radarActivities.length,

        customers: sellerCustomers.length,
        customersActive,
        customersRisk,
        customersInactive,
        customersWithoutContact,

        activities: sellerActivities.length,
        kanban,

        recentOrders: sellerOrders.slice(0, 10),
        recentActivities: sellerActivities.slice(0, 10),

        status: sellerActivities[0]?.created_at ? "online" : "offline",
      };

      sellerDTO.zentraIndex = calcIndex(sellerDTO);

      sellerDTO.insights = [
        sellerDTO.orders === 0
          ? `${sellerDTO.name} não registrou pedidos no período.`
          : `${sellerDTO.name} registrou ${sellerDTO.orders} pedidos, somando ${sellerDTO.soldFormatted}.`,
        sellerDTO.messagesSent === 0
          ? `${sellerDTO.name} não realizou disparos de mensagem no período.`
          : `${sellerDTO.name} disparou ${sellerDTO.messagesSent} mensagens e recebeu ${sellerDTO.messagesAnswered} respostas.`,
        sellerDTO.quotes === 0
          ? `${sellerDTO.name} não gerou cotações no período.`
          : `${sellerDTO.name} gerou ${sellerDTO.quotes} cotações.`,
        sellerDTO.radarViews === 0
          ? `${sellerDTO.name} não usou o Radar no período.`
          : `${sellerDTO.name} visualizou ${sellerDTO.radarViews} contatos no Radar.`,
        sellerDTO.customersWithoutContact > 0
          ? `${sellerDTO.name} possui ${sellerDTO.customersWithoutContact} clientes sem contato recente.`
          : `${sellerDTO.name} está com boa cadência de contato.`,
      ];

      return sellerDTO;
    });

    const teamRevenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const teamGoal = sellersResult.reduce((sum, s) => sum + s.goal, 0);
    const teamOrders = orders.length;
    const teamQuotes = sellersResult.reduce((sum, s) => sum + s.quotes, 0);
    const teamMessagesSent = sellersResult.reduce((sum, s) => sum + s.messagesSent, 0);
    const teamMessagesAnswered = sellersResult.reduce((sum, s) => sum + s.messagesAnswered, 0);
    const teamRadar = sellersResult.reduce((sum, s) => sum + s.radarViews, 0);
    const teamCustomers = sellersResult.reduce((sum, s) => sum + s.customers, 0);
    const teamCustomersRisk = sellersResult.reduce((sum, s) => sum + s.customersRisk, 0);
    const teamCustomersWithoutContact = sellersResult.reduce(
      (sum, s) => sum + s.customersWithoutContact,
      0
    );

    const ranking = [...sellersResult].sort((a, b) => b.sold - a.sold);

    const attention = sellersResult.filter(
      (s) =>
        s.orders === 0 ||
        s.quotes === 0 ||
        s.messagesSent === 0 ||
        s.radarViews === 0 ||
        s.goalPercent < 70 ||
        s.customersWithoutContact > 0
    );

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      period: {
        label: range.label,
        start: range.start,
        end: range.end,
      },

      header: {
        sellers: sellersResult.length,
        online: sellersResult.filter((s) => s.status === "online").length,
        offline: sellersResult.filter((s) => s.status === "offline").length,
        revenue: teamRevenue,
        revenueFormatted: money(teamRevenue),
        goal: teamGoal,
        goalFormatted: money(teamGoal),
        goalPercent: teamGoal > 0 ? Math.round((teamRevenue / teamGoal) * 100) : 0,
        orders: teamOrders,
        quotes: teamQuotes,
        messagesSent: teamMessagesSent,
        messagesAnswered: teamMessagesAnswered,
        radarViews: teamRadar,
        aiAlerts: attention.length,
      },

      kpis: {
        customers: teamCustomers,
        customersRisk: teamCustomersRisk,
        customersWithoutContact: teamCustomersWithoutContact,
        orders: teamOrders,
        revenue: teamRevenue,
        revenueFormatted: money(teamRevenue),
        averageTicket: teamOrders > 0 ? teamRevenue / teamOrders : 0,
        averageTicketFormatted: money(teamOrders > 0 ? teamRevenue / teamOrders : 0),
        quotes: teamQuotes,
        messagesSent: teamMessagesSent,
        messagesAnswered: teamMessagesAnswered,
        messageResponseRate:
          teamMessagesSent > 0
            ? Math.round((teamMessagesAnswered / teamMessagesSent) * 100)
            : 0,
        radarViews: teamRadar,
        campaigns: campaignsCount,
      },

      ai: {
        title: "Diagnóstico IA da operação",
        summary: [
          `A equipe vendeu ${money(teamRevenue)} no período ${range.label}.`,
          `${teamOrders} pedidos foram registrados no período.`,
          `${teamQuotes} cotações foram feitas pela equipe.`,
          `${teamMessagesSent} mensagens foram disparadas e ${teamMessagesAnswered} foram respondidas.`,
          `${teamRadar} contatos foram visualizados no Radar.`,
          `${teamCustomersWithoutContact} clientes estão sem contato recente.`,
          `${attention.length} vendedores precisam de atenção operacional.`,
        ],
        recommendations: attention.slice(0, 10).map((s) => ({
          sellerId: s.id,
          sellerName: s.name,
          priority: s.zentraIndex < 50 ? "alta" : "média",
          message:
            s.orders === 0
              ? `${s.name} está sem pedidos. Verifique carteira e clientes ativos.`
              : s.quotes === 0
              ? `${s.name} está sem cotações. Estimule propostas hoje.`
              : s.messagesSent === 0
              ? `${s.name} não disparou mensagens. Verifique rotina de contato.`
              : s.radarViews === 0
              ? `${s.name} não usou o Radar. Pode estar perdendo oportunidades.`
              : `${s.name} precisa de acompanhamento pelo Índice Zentra.`,
        })),
      },

      ranking,
      sellers: sellersResult,
      productivity: sellersResult,
    });
  } catch (error) {
    console.error("[SUPERVISOR DASHBOARD]", error);

    return NextResponse.json(
      { ok: false, error: "Erro ao carregar Central Supervisor." },
      { status: 500 }
    );
  }
}