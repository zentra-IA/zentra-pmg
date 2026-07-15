import { prisma } from "@/lib/prisma";

type Period = "today" | "week" | "15d" | "30d" | "month";

type Params = {
  companyId: string;
  period?: Period;
  from?: string | null;
  to?: string | null;
};

function normalize(value: any) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function digits(value: any) {
  return String(value || "").replace(/\D/g, "");
}

function money(value: any) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getRange(period: Period = "month", from?: string | null, to?: string | null) {
  const now = new Date();

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

  const endOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  if (from || to) {
    return {
      label: "Personalizado",
      start: from ? startOfDay(new Date(from)) : new Date(2000, 0, 1),
      end: to ? endOfDay(new Date(to)) : endOfDay(now),
    };
  }

  if (period === "today") {
    return { label: "Hoje", start: startOfDay(now), end: endOfDay(now) };
  }

  if (period === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    return { label: "7 dias", start: startOfDay(start), end: endOfDay(now) };
  }

  if (period === "15d") {
    const start = new Date(now);
    start.setDate(now.getDate() - 15);
    return { label: "15 dias", start: startOfDay(start), end: endOfDay(now) };
  }

  if (period === "30d") {
    const start = new Date(now);
    start.setDate(now.getDate() - 30);
    return { label: "30 dias", start: startOfDay(start), end: endOfDay(now) };
  }

  return {
    label: "Este mês",
    start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}

function kanbanLabel(status?: string | null) {
  const key = normalize(status);

  const map: Record<string, string> = {
    novo: "Novo lead",
    new: "Novo lead",
    enviado: "Mensagem enviada",
    mensagem_enviada: "Mensagem enviada",
    respondeu: "Cliente respondeu",
    cliente_respondeu: "Cliente respondeu",
    quer_cotacao: "Quer cotação",
    quer_agendar_entrevista: "Quer cotação",
    cotacao_enviada: "Cotação enviada",
    entrevista_agendada: "Cotação enviada",
    campanha: "Campanha",
    retornar_depois: "Retornar depois",
    reagendar_futuro: "Retornar depois",
    vendido: "Vendido",
    contratado: "Vendido",
    perdido: "Perdido",
    sem_interesse: "Perdido",
    nao_aprovado: "Perdido",
  };

  return map[key] || status || "Sem status";
}

function calcIndex(input: any) {
  let score = 0;

  score += Math.min(input.goalPercent || 0, 100) * 0.25;
  score += Math.min((input.orders || 0) * 6, 20);
  score += Math.min((input.quotes || 0) * 4, 15);
  score += Math.min((input.messagesSent || 0) * 0.25, 10);
  score += Math.min((input.messagesAnswered || 0) * 0.4, 10);
  score += Math.min((input.radarViews || 0) * 0.5, 10);
  score += Math.min((input.customers || 0) * 0.15, 10);

  if (input.customersWithoutContact > 0) {
    score -= Math.min(input.customersWithoutContact * 2, 20);
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function buildCommandCenterDashboard({
  companyId,
  period = "month",
  from,
  to,
}: Params) {
  const range = getRange(period, from, to);
  const now = new Date();
  const referenceDate = range.start;
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth() + 1;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
  company,
  companyUsers,
  customers,
  orders,
  leads,
  activities,
  messages,
  crmMessages,
  goals,
  radarExports,
] = await Promise.all([
    prisma.companies.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, logo_url: true },
    }),

    prisma.company_users.findMany({
      where: {
        company_id: companyId,
        active: true,
      },
      select: {
        user_id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        active: true,
      },
      orderBy: { name: "asc" },
    }),


    prisma.salesCustomer.findMany({
      where: { company_id: companyId },
      select: {
        id: true,
        seller_id: true,
        internal_code: true,
        erp_code: true,
        document: true,
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
        company_id: companyId,
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
        seller_code: true,
        customer_id: true,
        customer_internal_code: true,
        customer_name: true,
        document: true,
        total: true,
        payment_terms: true,
        boleto_due_date: true,
        status: true,
        created_at: true,
        delivery_date: true,
      },
    }),

    prisma.leads.findMany({
      where: {
        company_id: companyId,
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

    prisma.salesCustomerActivity.findMany({
      where: {
        company_id: companyId,
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
        phone: true,
        type: true,
        origin: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        created_at: true,
        scheduled_at: true,
      },
      orderBy: { created_at: "desc" },
    }),

    prisma.$queryRaw<any[]>`
      SELECT
        id,
        lead_id,
        direction,
        payload,
        created_at
      FROM messages
      WHERE company_id = ${companyId}::uuid
        AND created_at >= ${range.start}
        AND created_at <= ${range.end}
    `,

    prisma.crmMessage.findMany({
      where: {
        company_id: companyId,
        createdAt: { gte: range.start, lte: range.end },
      },
      select: {
        id: true,
        phone: true,
        direction: true,
        createdAt: true,
      },
    }),

   prisma.sales_goals.findMany({
  where: {
    company_id: companyId,
    year,
    month,
  },
  select: {
    seller_id: true,
    goal_amount: true,
  },
}),

prisma.prospectExport.findMany({
  where: {
    company_id: companyId,
    action: "REVEAL",
    createdAt: {
      gte: range.start,
      lte: range.end,
    },
  },
  select: {
    id: true,
    clientId: true,
    createdAt: true,
    action: true,
  },
}),
]);

  const orderItems =
    orders.length > 0
      ? await prisma.salesOrderItem.findMany({
          where: {
            company_id: companyId,
            order_id: {
              in: orders.map((order) => order.id),
            },
          },
          select: {
            id: true,
            order_id: true,
            product_code: true,
            product_name: true,
            quantity: true,
            total: true,
          },
        })
      : [];

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS sales_commissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL,
      seller_id uuid NOT NULL,
      year integer NOT NULL,
      month integer NOT NULL,
      commission_percent numeric(8,2) DEFAULT 0,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE(company_id, seller_id, year, month)
    )
  `;

  const commissions = await prisma.$queryRaw<any[]>`
    SELECT seller_id, commission_percent
    FROM sales_commissions
    WHERE company_id = ${companyId}::uuid
      AND year = ${year}
      AND month = ${month}
  `;

  const customersById = new Map(customers.map((c) => [String(c.id), c]));
  const customersByInternalCode = new Map<string, any>();
  const customersByDocument = new Map<string, any>();
  const customersByPhone = new Map<string, any>();
  const customersByName = new Map<string, any>();

  for (const customer of customers) {
    if (customer.internal_code) customersByInternalCode.set(String(customer.internal_code), customer);
    if (customer.erp_code) customersByInternalCode.set(String(customer.erp_code), customer);
    if (customer.document) customersByDocument.set(digits(customer.document), customer);

    const names = [customer.legal_name, customer.trade_name].filter(Boolean);
    for (const name of names) customersByName.set(normalize(name), customer);

    const phones = [customer.phone, customer.whatsapp].filter(Boolean).map(digits);
    for (const phone of phones) {
      if (!phone) continue;

      customersByPhone.set(phone, customer);

      // Também cria aliases pelos últimos dígitos para tolerar DDI/DDD
      // diferentes entre CRM, WhatsApp e importações do ERP.
      if (phone.length >= 8) customersByPhone.set(phone.slice(-8), customer);
      if (phone.length >= 9) customersByPhone.set(phone.slice(-9), customer);
    }
  }

  function findCustomerByPhone(value: unknown) {
    const phone = digits(value);
    if (!phone) return null;

    return (
      customersByPhone.get(phone) ||
      (phone.length >= 9 ? customersByPhone.get(phone.slice(-9)) : null) ||
      (phone.length >= 8 ? customersByPhone.get(phone.slice(-8)) : null) ||
      null
    );
  }

  const leadOwner = new Map<string, string>();

  for (const activity of activities) {
    if (activity.lead_id && activity.seller_id && !leadOwner.has(String(activity.lead_id))) {
      leadOwner.set(String(activity.lead_id), String(activity.seller_id));
    }
  }

  function isSeller(user: any) {
    const role = normalize(user.role);

    return ![
      "supervisor",
      "geral",
      "admin",
      "master",
      "owner",
      "administrador",
    ].includes(role);
  }

  let sellers = companyUsers.filter(isSeller);

  const sellerIdsFromData = new Set<string>();

  for (const customer of customers) {
    if (customer.seller_id) sellerIdsFromData.add(String(customer.seller_id));
  }

  for (const order of orders) {
    if (order.seller_id) sellerIdsFromData.add(String(order.seller_id));
  }

  for (const activity of activities) {
    if (activity.seller_id) sellerIdsFromData.add(String(activity.seller_id));
  }

  for (const sellerId of sellerIdsFromData) {
    if (!sellers.some((s) => String(s.user_id) === sellerId)) {
      const user = companyUsers.find((u) => String(u.user_id) === sellerId);

      sellers.push({
        user_id: sellerId,
        name: user?.name || "Vendedor",
        email: user?.email || "",
        phone: user?.phone || "",
        role: user?.role || "VENDEDOR",
        active: true,
      });
    }
  }

  function resolveCustomerFromOrder(order: any) {
    if (order.customer_id && customersById.has(String(order.customer_id))) {
      return customersById.get(String(order.customer_id));
    }

    if (order.customer_internal_code && customersByInternalCode.has(String(order.customer_internal_code))) {
      return customersByInternalCode.get(String(order.customer_internal_code));
    }

    if (order.document && customersByDocument.has(digits(order.document))) {
      return customersByDocument.get(digits(order.document));
    }

    const orderCustomerName = normalize(order.customer_name);

    if (orderCustomerName) {
      const exact = customersByName.get(orderCustomerName);
      if (exact) return exact;

      const found = customers.find((c) => {
        const legal = normalize(c.legal_name);
        const trade = normalize(c.trade_name);

        return (
          legal.includes(orderCustomerName) ||
          orderCustomerName.includes(legal) ||
          trade.includes(orderCustomerName) ||
          orderCustomerName.includes(trade)
        );
      });

      if (found) return found;
    }

    return null;
  }

  function resolveOrderSeller(order: any) {
    if (order.seller_id) return String(order.seller_id);

    const customer = resolveCustomerFromOrder(order);
    if (customer?.seller_id) return String(customer.seller_id);

    const orderSeller = normalize(order.seller_name);

    if (orderSeller) {
      const bySellerName = sellers.find((seller) => {
        const sellerName = normalize(seller.name);
        const sellerEmail = normalize(seller.email);

        const nameMatches =
          Boolean(sellerName) &&
          (orderSeller.includes(sellerName) || sellerName.includes(orderSeller));

        const emailMatches =
          Boolean(sellerEmail) &&
          (orderSeller.includes(sellerEmail) || sellerEmail.includes(orderSeller));

        return nameMatches || emailMatches;
      });

      if (bySellerName?.user_id) return String(bySellerName.user_id);
    }

    if (sellers.length === 1) return String(sellers[0].user_id);

    return "sem_vendedor";
  }

  function resolveLeadSeller(lead: any) {
    if (leadOwner.has(String(lead.id))) {
      return leadOwner.get(String(lead.id)) || "sem_vendedor";
    }

    const customer = findCustomerByPhone(lead.phone);
    if (customer?.seller_id) return String(customer.seller_id);

    return "sem_vendedor";
  }

  const leadsById = new Map(leads.map((lead) => [String(lead.id), lead]));

  function resolveMessageSeller(message: any) {
    const payload =
      message?.payload &&
      typeof message.payload === "object" &&
      !Array.isArray(message.payload)
        ? message.payload
        : null;

    const payloadUserId =
      payload?.user_id ||
      payload?.userId ||
      payload?.seller_id ||
      payload?.sellerId;

    if (payloadUserId) {
      const companyUser = companyUsers.find(
        (user) => String(user.user_id) === String(payloadUserId)
      );

      if (companyUser?.user_id) {
        return String(companyUser.user_id);
      }
    }

    if (
      message.lead_id &&
      leadOwner.has(String(message.lead_id))
    ) {
      return (
        leadOwner.get(String(message.lead_id)) ||
        "sem_vendedor"
      );
    }

    if (message.lead_id) {
      const lead = leadsById.get(String(message.lead_id));

      if (lead) {
        return resolveLeadSeller(lead);
      }
    }

    return "sem_vendedor";
  }

  function resolveCrmMessageSeller(message: any) {
    const customer = findCustomerByPhone(message.phone);
    if (customer?.seller_id) return String(customer.seller_id);

    return "sem_vendedor";
  }

  function resolveActivitySeller(activity: any) {
    if (activity.seller_id) return String(activity.seller_id);

    if (activity.customer_id) {
      const customer = customersById.get(String(activity.customer_id));
      if (customer?.seller_id) return String(customer.seller_id);
    }

    if (activity.lead_id && leadOwner.has(String(activity.lead_id))) {
      return leadOwner.get(String(activity.lead_id)) || "sem_vendedor";
    }

    const customer = findCustomerByPhone(activity.phone);
    if (customer?.seller_id) return String(customer.seller_id);

    return "sem_vendedor";
  }

  const sellersDTO = sellers.map((seller) => {
    const sellerId = String(seller.user_id);

    const sellerCustomers = customers.filter((c) => String(c.seller_id || "") === sellerId);
    const sellerOrders = orders.filter((order) => resolveOrderSeller(order) === sellerId);
    const sellerActivities = activities.filter(
      (activity) => resolveActivitySeller(activity) === sellerId
    );
    const sellerLeads = leads.filter((lead) => resolveLeadSeller(lead) === sellerId);
    const sellerMessages = messages.filter((message) => resolveMessageSeller(message) === sellerId);
    const sellerCrmMessages = crmMessages.filter((message) => resolveCrmMessageSeller(message) === sellerId);

    const allMessages = [
      ...sellerMessages.map((m) => ({ direction: m.direction })),
      ...sellerCrmMessages.map((m) => ({ direction: m.direction })),
    ];

    const messagesSent = allMessages.filter((m) =>
      ["out", "outbound", "sent", "enviada", "enviado"].includes(normalize(m.direction))
    ).length;

    const messagesAnswered = allMessages.filter((m) =>
      ["in", "inbound", "received", "recebida", "recebido"].includes(normalize(m.direction))
    ).length;

    const sold = sellerOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);

    const goal = Number(
      goals.find((g) => String(g.seller_id || "") === sellerId)?.goal_amount || 0
    );

    const goalPercent = goal > 0 ? Math.round((sold / goal) * 100) : 0;

    const sellerQuotes = customers.filter((customer) => {
  if (!customer.last_quote_at) return false;

  if (
    customer.last_quote_at < range.start ||
    customer.last_quote_at > range.end
  ) {
    return false;
  }

  return (
    String(customer.seller_id) === String(seller.user_id)
  );
});

const quotes = sellerQuotes.length;

    const sellerRadarViews = radarExports.filter((item) => {
  if (!item.clientId) return false;

  return String(item.clientId) === String(seller.user_id);
});

const radarViews = sellerRadarViews.length;

    const kanban: Record<string, number> = {};

    for (const lead of sellerLeads) {
      const label = kanbanLabel(lead.status);
      kanban[label] = (kanban[label] || 0) + 1;
    }

    const customersActive = sellerCustomers.filter((c) => normalize(c.status) === "ativo").length;
    const customersInactive = sellerCustomers.filter((c) => normalize(c.status) === "inativo").length;
    const customersRisk = sellerCustomers.filter(
      (c) => normalize(c.status) === "risco" || normalize(c.risk_level) === "alto"
    ).length;

    const customersWithoutContact = sellerCustomers.filter(
      (c) => !c.last_contact_at || new Date(c.last_contact_at) < sevenDaysAgo
    ).length;

    const averageTicket = sellerOrders.length > 0 ? sold / sellerOrders.length : 0;

    const boletoOverdue = sellerOrders.filter(
      (order) =>
        order.boleto_due_date &&
        new Date(order.boleto_due_date) < now &&
        normalize(order.status) !== "pago"
    ).length;

    const orderIds = new Set(sellerOrders.map((order) => String(order.id)));

    const productMix = new Set(
      orderItems
        .filter((item) => orderIds.has(String(item.order_id)))
        .map((item) => item.product_code || item.product_name)
    ).size;

    const messageResponseRate =
      messagesSent > 0 ? Math.round((messagesAnswered / messagesSent) * 100) : 0;

    const zentraIndex = calcIndex({
  goalPercent,
  orders: sellerOrders.length,
  quotes,
  messagesSent,
  messagesAnswered,
  radarViews,
  customers: sellerCustomers.length,
  customersWithoutContact,
});

    const commissionPercent = Number(
      commissions.find((item) => String(item.seller_id) === sellerId)
        ?.commission_percent || 0
    );

    const commissionValue = (sold * commissionPercent) / 100;

    const sellerName = seller.name || seller.email || "Vendedor";

    return {
      id: sellerId,
      name: sellerName,
      email: seller.email,
      phone: seller.phone,
      role: seller.role,

      goal,
      goalFormatted: money(goal),
      sold,
      soldFormatted: money(sold),
      goalPercent,

      commissionPercent,
      commissionValue,
      commissionValueFormatted: money(commissionValue),

      orders: sellerOrders.length,
      averageTicket,
      averageTicketFormatted: money(averageTicket),

      quotes,
quoteAverage: quotes > 0 ? sold / quotes : 0,
quoteAverageFormatted: money(quotes > 0 ? sold / quotes : 0),

      messagesSent,
      messagesAnswered,
      messagesNotAnswered: Math.max(messagesSent - messagesAnswered, 0),
      messageResponseRate,

      radarViews,

      customers: sellerCustomers.length,
      customersActive,
      customersInactive,
      customersRisk,
      customersWithoutContact,

      boletoOverdue,
      productMix,

      activities: sellerActivities.length,
      kanban,

      zentraIndex,

      insights: [
        sellerOrders.length === 0
          ? `${sellerName} não registrou pedidos no período.`
          : `${sellerName} vendeu ${money(sold)} em ${sellerOrders.length} pedido(s).`,
        quotes === 0
  ? `${sellerName} não gerou cotações no período.`
  : `${sellerName} gerou ${quotes} cotação(ões).`,
        messagesSent === 0
          ? `${sellerName} não realizou disparos de mensagem no período.`
          : `${sellerName} enviou ${messagesSent} mensagem(ns) e recebeu ${messagesAnswered} resposta(s).`,
        radarViews === 0
  ? `${sellerName} não usou o Radar no período.`
  : `${sellerName} visualizou ${radarViews} contato(s) no Radar.`,
        customersWithoutContact > 0
          ? `${sellerName} possui ${customersWithoutContact} cliente(s) sem contato recente.`
          : `${sellerName} está com boa cadência de contato.`,
      ],

      recentOrders: sellerOrders.slice(0, 10),
      recentActivities: sellerActivities.slice(0, 10),
      recentCustomers: sellerCustomers.slice(0, 10),
    };
  });

  const unassignedCustomers = customers.filter(
    (customer) => !customer.seller_id
  );
  const unassignedOrders = orders.filter(
    (order) => resolveOrderSeller(order) === "sem_vendedor"
  );
  const unassignedLeads = leads.filter(
    (lead) => resolveLeadSeller(lead) === "sem_vendedor"
  );
  const unassignedActivities = activities.filter(
    (activity) => resolveActivitySeller(activity) === "sem_vendedor"
  );
  const unassignedMessages = messages.filter(
    (message) => resolveMessageSeller(message) === "sem_vendedor"
  );
  const unassignedCrmMessages = crmMessages.filter(
    (message) => resolveCrmMessageSeller(message) === "sem_vendedor"
  );

  const unassignedAllMessages = [
    ...unassignedMessages.map((message) => ({ direction: message.direction })),
    ...unassignedCrmMessages.map((message) => ({ direction: message.direction })),
  ];

  const unassignedMessagesSent = unassignedAllMessages.filter((message) =>
    ["out", "outbound", "sent", "enviada", "enviado"].includes(
      normalize(message.direction)
    )
  ).length;

  const unassignedMessagesAnswered = unassignedAllMessages.filter((message) =>
    ["in", "inbound", "received", "recebida", "recebido"].includes(
      normalize(message.direction)
    )
  ).length;

  const unassignedSold = unassignedOrders.reduce(
    (sum, order) => sum + Number(order.total || 0),
    0
  );

  const unassignedQuotes = unassignedCustomers.filter((customer) => {
  if (!customer.last_quote_at) return false;

  return (
    customer.last_quote_at >= range.start &&
    customer.last_quote_at <= range.end
  );
});

const unassignedQuoteCount = unassignedQuotes.length;

  const companyUserIds = new Set(
  companyUsers.map((user) => String(user.user_id))
);

const unassignedRadarViews = radarExports.filter((item) => {
  if (!item.clientId) return true;

  return !companyUserIds.has(String(item.clientId));
}).length;

  const unassignedKanban: Record<string, number> = {};
  for (const lead of unassignedLeads) {
    const label = kanbanLabel(lead.status);
    unassignedKanban[label] = (unassignedKanban[label] || 0) + 1;
  }

  const unassignedCustomersWithoutContact = unassignedCustomers.filter(
    (customer) =>
      !customer.last_contact_at || new Date(customer.last_contact_at) < sevenDaysAgo
  ).length;

  const unassignedOrderIds = new Set(
    unassignedOrders.map((order) => String(order.id))
  );

  const unassignedProductMix = new Set(
    orderItems
      .filter((item) => unassignedOrderIds.has(String(item.order_id)))
      .map((item) => item.product_code || item.product_name)
  ).size;

  const hasUnassignedData =
  unassignedCustomers.length > 0 ||
  unassignedOrders.length > 0 ||
  unassignedLeads.length > 0 ||
  unassignedActivities.length > 0 ||
  unassignedMessages.length > 0 ||
  unassignedCrmMessages.length > 0 ||
  unassignedQuoteCount > 0 ||
  unassignedRadarViews > 0;

  const unassignedDTO = {
    id: "sem_vendedor",
    name: "Sem vendedor definido",
    email: "",
    phone: "",
    role: "UNASSIGNED",

    goal: 0,
    goalFormatted: money(0),
    sold: unassignedSold,
    soldFormatted: money(unassignedSold),
    goalPercent: 0,

    commissionPercent: 0,
    commissionValue: 0,
    commissionValueFormatted: money(0),

    orders: unassignedOrders.length,
    averageTicket:
      unassignedOrders.length > 0
        ? unassignedSold / unassignedOrders.length
        : 0,
    averageTicketFormatted: money(
      unassignedOrders.length > 0
        ? unassignedSold / unassignedOrders.length
        : 0
    ),

    quotes: unassignedQuoteCount,
quoteAverage:
  unassignedQuoteCount > 0
    ? unassignedSold / unassignedQuoteCount
    : 0,
quoteAverageFormatted: money(
  unassignedQuoteCount > 0
    ? unassignedSold / unassignedQuoteCount
    : 0
),

    messagesSent: unassignedMessagesSent,
    messagesAnswered: unassignedMessagesAnswered,
    messagesNotAnswered: Math.max(
      unassignedMessagesSent - unassignedMessagesAnswered,
      0
    ),
    messageResponseRate:
      unassignedMessagesSent > 0
        ? Math.round(
            (unassignedMessagesAnswered / unassignedMessagesSent) * 100
          )
        : 0,

    radarViews: unassignedRadarViews,

    customers: unassignedCustomers.length,
    customersActive: unassignedCustomers.filter(
      (customer) => normalize(customer.status) === "ativo"
    ).length,
    customersInactive: unassignedCustomers.filter(
      (customer) => normalize(customer.status) === "inativo"
    ).length,
    customersRisk: unassignedCustomers.filter(
      (customer) =>
        normalize(customer.status) === "risco" ||
        normalize(customer.risk_level) === "alto"
    ).length,
    customersWithoutContact: unassignedCustomersWithoutContact,

    boletoOverdue: unassignedOrders.filter(
      (order) =>
        order.boleto_due_date &&
        new Date(order.boleto_due_date) < now &&
        normalize(order.status) !== "pago"
    ).length,
    productMix: unassignedProductMix,

    activities: unassignedActivities.length,
    kanban: unassignedKanban,

    zentraIndex: 0,

    insights: [
      `${unassignedOrders.length} pedido(s) ainda estão sem vendedor definido.`,
      `${unassignedLeads.length} lead(s) ainda estão sem responsável.`,
      `${unassignedCustomers.length} cliente(s) ainda estão sem vendedor.`,
      `${
        unassignedMessages.length + unassignedCrmMessages.length
      } mensagem(ns) ainda não puderam ser associadas a um vendedor.`,
    ],

    recentOrders: unassignedOrders.slice(0, 10),
    recentActivities: unassignedActivities.slice(0, 10),
    recentCustomers: unassignedCustomers.slice(0, 10),
  };

  const completeSellersDTO = hasUnassignedData
    ? [...sellersDTO, unassignedDTO]
    : sellersDTO;

  // Os totais da supervisão são calculados diretamente nos dados da empresa.
  // Assim, nenhum registro desaparece por falta de vínculo com um vendedor.
  const teamRevenue = orders.reduce(
    (sum, order) => sum + Number(order.total || 0),
    0
  );
  const teamGoal = sellersDTO.reduce((sum, seller) => sum + seller.goal, 0);
  const teamOrders = orders.length;

  
  const teamQuotes = customers.filter((customer) => {
  if (!customer.last_quote_at) return false;

  return (
    customer.last_quote_at >= range.start &&
    customer.last_quote_at <= range.end
  );
}).length;

const allCompanyMessages = [
  ...messages.map((message) => ({
    direction: message.direction,
  })),
  ...crmMessages.map((message) => ({
    direction: message.direction,
  })),
];
  const teamMessagesSent = allCompanyMessages.filter((message) =>
    ["out", "outbound", "sent", "enviada", "enviado"].includes(
      normalize(message.direction)
    )
  ).length;

  const teamMessagesAnswered = allCompanyMessages.filter((message) =>
    ["in", "inbound", "received", "recebida", "recebido"].includes(
      normalize(message.direction)
    )
  ).length;

  const teamRadarViews = radarExports.length;

  const teamCustomers = customers.length;
  const teamCustomersWithoutContact = customers.filter(
    (customer) =>
      !customer.last_contact_at || new Date(customer.last_contact_at) < sevenDaysAgo
  ).length;

  const attentionSellers = sellersDTO.filter(
    (s) =>
      s.orders === 0 ||
      s.quotes === 0 ||
      s.messagesSent === 0 ||
      s.radarViews === 0 ||
      s.customersWithoutContact > 0 ||
      s.goalPercent < 70
  );

  const ranking = [...completeSellersDTO].sort((a, b) => b.sold - a.sold);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    company,

    debug: {
      companyId,
      usersFound: companyUsers.length,
      sellersFound: sellers.length,
      customersFound: customers.length,
      ordersFound: orders.length,
      leadsFound: leads.length,
      activitiesFound: activities.length,
      messagesFound: messages.length,

      crmMessagesFound: crmMessages.length,
      orderItemsFound: orderItems.length,
radarExportsFound: radarExports.length,
      unassigned: {
        customers: unassignedCustomers.length,
        orders: unassignedOrders.length,
        leads: unassignedLeads.length,
        activities: unassignedActivities.length,
        messages: unassignedMessages.length + unassignedCrmMessages.length,
quotes: unassignedQuoteCount,
radarViews: unassignedRadarViews,
      },
    },

    period: {
      label: range.label,
      start: range.start,
      end: range.end,
    },

    header: {
      sellers: sellersDTO.length,
      revenue: teamRevenue,
      revenueFormatted: money(teamRevenue),
      goal: teamGoal,
      goalFormatted: money(teamGoal),
      goalPercent: teamGoal > 0 ? Math.round((teamRevenue / teamGoal) * 100) : 0,
      orders: teamOrders,
      quotes: teamQuotes,
      messagesSent: teamMessagesSent,
      messagesAnswered: teamMessagesAnswered,
      radarViews: teamRadarViews,
      customers: teamCustomers,
      customersWithoutContact: teamCustomersWithoutContact,
      aiAlerts: attentionSellers.length,
    },

    kpis: {
      averageTicket: teamOrders > 0 ? teamRevenue / teamOrders : 0,
      averageTicketFormatted: money(teamOrders > 0 ? teamRevenue / teamOrders : 0),
      messageResponseRate:
        teamMessagesSent > 0
          ? Math.round((teamMessagesAnswered / teamMessagesSent) * 100)
          : 0,
    },

    ai: {
      title: "Diagnóstico IA da operação",
      summary: [
        `A equipe vendeu ${money(teamRevenue)} no período ${range.label}.`,
        `${teamOrders} pedido(s) foram registrados no período.`,
        `${teamQuotes} cotação(ões) foram feitas pela equipe.`,
        `${teamMessagesSent} mensagem(ns) foram disparadas e ${teamMessagesAnswered} tiveram resposta.`,
        `${teamRadarViews} contato(s) foram visualizados no Radar.`,
        `${teamCustomersWithoutContact} cliente(s) estão sem contato recente.`,
        `${attentionSellers.length} vendedor(es) precisam de atenção operacional.`,
      ],
      recommendations: attentionSellers.slice(0, 8).map((seller) => ({
        sellerId: seller.id,
        sellerName: seller.name,
        priority: seller.zentraIndex < 50 ? "alta" : "média",
        message:
          seller.orders === 0
            ? `${seller.name} está sem pedidos no período. Verifique carteira e clientes ativos.`
            : seller.quotes === 0
              ? `${seller.name} está sem cotações. Estimule propostas comerciais.`
              : seller.messagesSent === 0
                ? `${seller.name} não disparou mensagens. Verifique rotina de contato.`
                : seller.radarViews === 0
                  ? `${seller.name} não usou o Radar. Pode estar perdendo oportunidades.`
                  : `${seller.name} precisa de acompanhamento pelo Índice Zentra.`,
      })),
    },

    ranking,
    sellers: ranking,
  };
}