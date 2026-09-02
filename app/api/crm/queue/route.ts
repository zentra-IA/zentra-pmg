import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

const SESSIONS = [1, 2, 3, 4, 5] as const;

const MAX_PER_SESSION_DAY = Number(
  process.env.CRM_MAX_PER_SESSION_DAY || 80
);

const DELAY_MIN_MS = Number(
  process.env.CRM_DELAY_MIN_MS || 120000
);

const DELAY_MAX_MS = Number(
  process.env.CRM_DELAY_MAX_MS || 300000
);

type AccessContext = {
  companyId: string;
  branchId: string | null;
  userId: string;
  role: string;
};

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase não configurado.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function isUuid(value: unknown): value is string {
  if (!value) return false;

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value)
  );
}

function normalizePhone(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;

  return digits;
}

function normalizeSessionNumber(value: unknown, fallback = 1) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(1, Math.min(5, Math.trunc(number)));
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = clean(value);

    if (text) {
      return text;
    }
  }

  return "";
}

function uniqueTexts(values: unknown[]) {
  const result: string[] = [];

  for (const value of values) {
    const text = clean(value);

    if (text && !result.includes(text)) {
      result.push(text);
    }
  }

  return result;
}

function getSaoPauloDayRange(reference = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(reference);

  const year = Number(
    parts.find((part) => part.type === "year")?.value
  );
  const month = Number(
    parts.find((part) => part.type === "month")?.value
  );
  const day = Number(
    parts.find((part) => part.type === "day")?.value
  );

  const date = `${String(year).padStart(4, "0")}-${String(
    month
  ).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  /*
   * São Paulo opera em UTC-03:00 e não utiliza horário de verão
   * desde 2019. A faixa abaixo representa exatamente o dia comercial
   * usado pelos vendedores, independentemente do fuso do servidor Vercel.
   */
  const start = new Date(`${date}T00:00:00-03:00`);

  const nextUtc = new Date(
    Date.UTC(year, month - 1, day) + 24 * 60 * 60 * 1000
  );

  const nextDate = `${nextUtc.getUTCFullYear()}-${String(
    nextUtc.getUTCMonth() + 1
  ).padStart(2, "0")}-${String(nextUtc.getUTCDate()).padStart(
    2,
    "0"
  )}`;

  const end = new Date(`${nextDate}T00:00:00-03:00`);

  return {
    date,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function getVariationText(variation: any) {
  if (typeof variation === "string") {
    return clean(variation);
  }

  return firstText(
    variation?.message,
    variation?.content,
    variation?.base_message,
    variation?.final_message
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceVariable(
  text: string,
  keys: string[],
  value: unknown
) {
  let result = text;
  const replacement = clean(value);

  for (const key of keys) {
    const escaped = escapeRegExp(key);

    result = result
      .replace(
        new RegExp(`{{\\s*${escaped}\\s*}}`, "gi"),
        replacement
      )
      .replace(
        new RegExp(`{\\s*${escaped}\\s*}`, "gi"),
        replacement
      );
  }

  return result;
}

function applyCommercialVariables(
  text: string,
  lead: any,
  template: any
) {
  const leadName = firstText(
    lead?.name,
    lead?.nome,
    lead?.contact_name,
    lead?.company_name,
    lead?.razao_social,
    "cliente"
  );

  const phone = normalizePhone(
    firstText(
      lead?.phone,
      lead?.telefone,
      lead?.whatsapp
    )
  );

  const companyName = firstText(
    lead?.company_name,
    lead?.empresa,
    lead?.business_name,
    lead?.razao_social,
    lead?.fantasy_name,
    lead?.nome_fantasia,
    leadName
  );

  const values: Array<{
    keys: string[];
    value: unknown;
  }> = [
    {
      keys: ["nome", "cliente", "client"],
      value: leadName,
    },
    {
      keys: ["telefone", "phone", "whatsapp"],
      value: phone,
    },
    {
      keys: ["email", "e-mail"],
      value: firstText(lead?.email),
    },
    {
      keys: ["empresa", "company", "razao_social"],
      value: companyName,
    },
    {
      keys: ["cnpj", "cpf", "cnpj_cpf"],
      value: firstText(
        lead?.cnpj,
        lead?.cpf,
        lead?.document,
        lead?.documento
      ),
    },
    {
      keys: ["cidade", "city"],
      value: firstText(lead?.city, lead?.cidade),
    },
    {
      keys: ["estado", "uf", "state"],
      value: firstText(lead?.state, lead?.estado, lead?.uf),
    },
    {
      keys: ["representante", "vendedor"],
      value: firstText(
        lead?.representative_name,
        lead?.seller_name,
        lead?.vendedor,
        template?.representative_name
      ),
    },
    {
      keys: ["produto", "product"],
      value: firstText(
        lead?.product,
        lead?.produto,
        template?.product
      ),
    },
    {
      keys: ["categoria", "category"],
      value: firstText(
        lead?.category,
        lead?.categoria,
        template?.category
      ),
    },
    {
      keys: ["valor", "value", "price"],
      value: firstText(
        lead?.value,
        lead?.valor,
        lead?.price
      ),
    },
    {
      keys: ["desconto", "discount"],
      value: firstText(lead?.discount, lead?.desconto),
    },
    {
      keys: ["forma_pagamento", "pagamento"],
      value: firstText(
        lead?.payment_method,
        lead?.forma_pagamento
      ),
    },
    {
      keys: ["data_entrega", "entrega"],
      value: firstText(
        lead?.delivery_date,
        lead?.data_entrega
      ),
    },
    {
      keys: ["pedido", "order"],
      value: firstText(
        lead?.order_number,
        lead?.pedido
      ),
    },
    {
      keys: ["cotacao", "orcamento", "quote"],
      value: firstText(
        lead?.quote_number,
        lead?.cotacao,
        lead?.orcamento
      ),
    },
    {
      keys: ["ticket_medio"],
      value: firstText(
        lead?.average_ticket,
        lead?.ticket_medio
      ),
    },
    {
      keys: ["ultima_compra"],
      value: firstText(
        lead?.last_purchase,
        lead?.ultima_compra
      ),
    },
    {
      keys: ["ultima_mensagem"],
      value: firstText(
        lead?.last_message,
        lead?.ultima_mensagem
      ),
    },
    {
      keys: ["link_whatsapp"],
      value: phone
        ? `https://wa.me/${phone}`
        : "",
    },
  ];

  let result = clean(text);

  for (const entry of values) {
    result = replaceVariable(
      result,
      entry.keys,
      entry.value
    );
  }

  /*
   * Evita que placeholders não preenchidos sejam enviados literalmente.
   * Mantém o texto limpo sem deixar "{campo}" visível para o cliente.
   */
  return result
    .replace(/{{\s*[^{}]+\s*}}/g, "")
    .replace(/{\s*[^{}]+\s*}/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();
}

function normalizeKanbanStatus(value: unknown) {
  const raw = clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");

  const aliases: Record<string, string> = {
    new: "novo",
    novo_lead: "novo",
    respondido: "respondeu",
    cliente_respondeu: "respondeu",
    primeiro_contato: "respondeu",
    interesse: "em_negociacao",
    negociacao: "em_negociacao",
    quer_cotacao: "em_negociacao",
    proposta: "cotacao_enviada",
    cotacao: "cotacao_enviada",
    orcamento_enviado: "cotacao_enviada",
    aprovado: "pedido_fechado",
    finalizado: "pedido_fechado",
    cliente_ativo: "pedido_fechado",
    pos_venda: "pedido_fechado",
    reativar_futuro: "cliente_inativo",
    descartado: "perdido",
  };

  const normalized = aliases[raw] || raw;

  const allowed = new Set([
    "novo",
    "campanha",
    "enviado",
    "respondeu",
    "em_negociacao",
    "cotacao_enviada",
    "pedido_fechado",
    "cliente_inativo",
    "sem_interesse",
    "perdido",
  ]);

  return allowed.has(normalized)
    ? normalized
    : null;
}

async function loadTemplateVariations(
  supabase: ReturnType<typeof getSupabase>,
  companyId: string,
  templateId: string
) {
  const { data, error } = await supabase
    .from("message_variations")
    .select("*")
    .eq("company_id", companyId)
    .eq("template_id", templateId)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(
      `Erro ao carregar variações da mensagem: ${error.message}`
    );
  }

  return data || [];
}

async function requireQueueAccess(
  req: NextRequest
): Promise<AccessContext> {
  const access = await requireCompanyAccess(req);

  const companyId = String(access?.companyId || "").trim();
  const userId = String(access?.userId || "").trim();
  const role = String(access?.userRole || "").trim().toUpperCase();
  const branchId = access?.branchId
    ? String(access.branchId).trim()
    : null;

  if (!isUuid(companyId)) {
    throw new Error("Empresa não identificada.");
  }

  if (!isUuid(userId)) {
    throw new Error("Usuário autenticado não identificado.");
  }

  return {
    companyId,
    branchId,
    userId,
    role,
  };
}

async function countQueue(
  supabase: ReturnType<typeof getSupabase>,
  companyId: string,
  ownerUserId: string | null,
  status: string
) {
  let query = supabase
    .from("automation_queue")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("company_id", companyId)
    .eq("status", status);

  if (ownerUserId) {
    query = query.eq("owner_user_id", ownerUserId);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return count || 0;
}

async function getSessionStats(
  supabase: ReturnType<typeof getSupabase>,
  companyId: string,
  ownerUserId: string | null,
  sessionId: number
) {
  const dayRange = getSaoPauloDayRange();

  let sentQuery = supabase
    .from("automation_queue")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("company_id", companyId)
    .eq("session_id", sessionId)
    .eq("status", "sent")
    .gte("sent_at", dayRange.startIso)
    .lt("sent_at", dayRange.endIso);

  let queuedQuery = supabase
    .from("automation_queue")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("company_id", companyId)
    .eq("session_id", sessionId)
    .in("status", ["pending", "processing"]);

  if (ownerUserId) {
    sentQuery = sentQuery.eq("owner_user_id", ownerUserId);
    queuedQuery = queuedQuery.eq("owner_user_id", ownerUserId);
  }

  const [sentResult, queuedResult] = await Promise.all([
    sentQuery,
    queuedQuery,
  ]);

  if (sentResult.error) {
    throw new Error(sentResult.error.message);
  }

  if (queuedResult.error) {
    throw new Error(queuedResult.error.message);
  }

  return {
    online: false,
    used: sentResult.count || 0,
    queued: queuedResult.count || 0,
    limit: MAX_PER_SESSION_DAY,
  };
}

async function countQueueInRange(
  supabase: ReturnType<typeof getSupabase>,
  companyId: string,
  ownerUserId: string | null,
  status: string,
  field: "sent_at" | "updated_at",
  startIso: string,
  endIso: string
) {
  let query = supabase
    .from("automation_queue")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("company_id", companyId)
    .eq("status", status)
    .gte(field, startIso)
    .lt(field, endIso);

  if (ownerUserId) {
    query = query.eq("owner_user_id", ownerUserId);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return count || 0;
}

async function loadQueueOperation(
  supabase: ReturnType<typeof getSupabase>,
  companyId: string,
  ownerUserId: string | null,
  startIso: string,
  endIso: string
) {
  const baseSelect =
    "id,lead_id,phone,session_id,status,created_at,scheduled_at,sent_at,updated_at,error,last_error,attempts";

  let activeQuery = supabase
    .from("automation_queue")
    .select(baseSelect)
    .eq("company_id", companyId)
    .in("status", ["pending", "processing", "paused"])
    .order("created_at", { ascending: false })
    .limit(250);

  let sentTodayQuery = supabase
    .from("automation_queue")
    .select(baseSelect)
    .eq("company_id", companyId)
    .eq("status", "sent")
    .gte("sent_at", startIso)
    .lt("sent_at", endIso)
    .order("sent_at", { ascending: false })
    .limit(250);

  let failedTodayQuery = supabase
    .from("automation_queue")
    .select(baseSelect)
    .eq("company_id", companyId)
    .eq("status", "failed")
    .gte("updated_at", startIso)
    .lt("updated_at", endIso)
    .order("updated_at", { ascending: false })
    .limit(250);

  if (ownerUserId) {
    activeQuery = activeQuery.eq("owner_user_id", ownerUserId);
    sentTodayQuery = sentTodayQuery.eq("owner_user_id", ownerUserId);
    failedTodayQuery = failedTodayQuery.eq(
      "owner_user_id",
      ownerUserId
    );
  }

  const [activeResult, sentResult, failedResult] =
    await Promise.all([
      activeQuery,
      sentTodayQuery,
      failedTodayQuery,
    ]);

  for (const result of [
    activeResult,
    sentResult,
    failedResult,
  ]) {
    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  const byId = new Map<string, any>();

  for (const item of [
    ...(activeResult.data || []),
    ...(sentResult.data || []),
    ...(failedResult.data || []),
  ]) {
    byId.set(String(item.id), item);
  }

  const allItems = Array.from(byId.values()).sort(
    (a: any, b: any) => {
      const timeA = new Date(
        a.sent_at ||
          a.updated_at ||
          a.created_at ||
          0
      ).getTime();

      const timeB = new Date(
        b.sent_at ||
          b.updated_at ||
          b.created_at ||
          0
      ).getTime();

      return timeB - timeA;
    }
  );

  const truncated = allItems.length > 250;
  const items = allItems.slice(0, 250);

  const leadIds = [
    ...new Set(
      items
        .map((item: any) => clean(item.lead_id))
        .filter(Boolean)
    ),
  ];

  const leadMap = new Map<string, any>();

  if (leadIds.length) {
    const leadResultWithExternalId = await supabase
      .from("leads")
      .select("id,name,phone,external_id")
      .eq("company_id", companyId)
      .in("id", leadIds);

    let leadData: any[] = [];

    /*
     * Compatibilidade de implantação:
     * se a coluna external_id ainda não tiver sido criada, a fila continua
     * funcionando normalmente. O ID passa a aparecer assim que a migration
     * for aplicada.
     */
    if (
      leadResultWithExternalId.error &&
      /external_id/i.test(
        leadResultWithExternalId.error.message || ""
      )
    ) {
      const fallbackResult = await supabase
        .from("leads")
        .select("id,name,phone")
        .eq("company_id", companyId)
        .in("id", leadIds);

      if (fallbackResult.error) {
        throw new Error(
          fallbackResult.error.message
        );
      }

      leadData = fallbackResult.data || [];
    } else {
      if (leadResultWithExternalId.error) {
        throw new Error(
          leadResultWithExternalId.error.message
        );
      }

      leadData =
        leadResultWithExternalId.data || [];
    }

    for (const lead of leadData) {
      leadMap.set(String(lead.id), lead);
    }
  }

  return {
    items: items.map((item: any) => {
      const lead = leadMap.get(
        String(item.lead_id || "")
      );

      return {
        ...item,
        name: lead?.name || null,
        external_id:
          lead?.external_id || null,
        phone:
          item.phone ||
          lead?.phone ||
          null,
      };
    }),
    truncated,
  };
}

function supervisorForbidden() {
  return NextResponse.json(
    {
      success: false,
      error: "Supervisor não possui acesso a esta rota operacional.",
    },
    {
      status: 403,
    }
  );
}

async function getConfiguredTemplate(
  supabase: ReturnType<typeof getSupabase>,
  access: AccessContext,
  templateId: string
) {
  let query = supabase
    .from("message_templates")
    .select("*")
    .eq("id", templateId)
    .eq("company_id", access.companyId)
    .eq("active", true);

  if (access.role === "VENDEDOR") {
    query = query.eq("owner_user_id", access.userId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(
      `Erro ao carregar mensagem cadastrada: ${error.message}`
    );
  }

  return data || null;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const access = await requireQueueAccess(req);

    if (access.role === "SUPERVISOR") {
      return supervisorForbidden();
    }

    const sellerParam = String(
      req.nextUrl.searchParams.get("seller_id") ||
        req.nextUrl.searchParams.get("owner_user_id") ||
        ""
    ).trim();

    if (sellerParam && !isUuid(sellerParam)) {
      return NextResponse.json(
        {
          success: false,
          error: "seller_id inválido.",
        },
        {
          status: 400,
        }
      );
    }

    const scopedOwnerUserId =
      access.role === "VENDEDOR"
        ? access.userId
        : sellerParam || null;

    const dayRange = getSaoPauloDayRange();

    const [
      pending,
      processing,
      sent,
      failed,
      paused,
      sessionEntries,
      failedToday,
      operation,
    ] = await Promise.all([
      countQueue(
        supabase,
        access.companyId,
        scopedOwnerUserId,
        "pending"
      ),
      countQueue(
        supabase,
        access.companyId,
        scopedOwnerUserId,
        "processing"
      ),
      countQueue(
        supabase,
        access.companyId,
        scopedOwnerUserId,
        "sent"
      ),
      countQueue(
        supabase,
        access.companyId,
        scopedOwnerUserId,
        "failed"
      ),
      countQueue(
        supabase,
        access.companyId,
        scopedOwnerUserId,
        "paused"
      ),
      Promise.all(
        SESSIONS.map(async (sessionId) => [
          sessionId,
          await getSessionStats(
            supabase,
            access.companyId,
            scopedOwnerUserId,
            sessionId
          ),
        ])
      ),
      countQueueInRange(
        supabase,
        access.companyId,
        scopedOwnerUserId,
        "failed",
        "updated_at",
        dayRange.startIso,
        dayRange.endIso
      ),
      loadQueueOperation(
        supabase,
        access.companyId,
        scopedOwnerUserId,
        dayRange.startIso,
        dayRange.endIso
      ),
    ]);

    const stats = Object.fromEntries(sessionEntries);

    const sentToday = Object.values(stats).reduce(
      (sum: number, item: any) =>
        sum + Number(item?.used || 0),
      0
    );

    return NextResponse.json({
      success: true,
      pending,
      processing,
      sent,
      failed,
      paused,
      stats,
      today: {
        date: dayRange.date,
        timezone: "America/Sao_Paulo",
        sent: sentToday,
        failed: failedToday,
      },
      operation,
      owner_user_id: scopedOwnerUserId,
      antiban: {
        maxPerSessionDay: MAX_PER_SESSION_DAY,
        delayMinMs: DELAY_MIN_MS,
        delayMaxMs: DELAY_MAX_MS,
      },
    });
  } catch (error: any) {
    console.error("CRM_QUEUE_GET_ERROR", error);

    const message =
      error?.message || "Erro ao carregar fila.";

    const status =
      message.includes("não identificad") ? 401 : 500;

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status,
      }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const access = await requireQueueAccess(req);

    if (access.role === "SUPERVISOR") {
      return supervisorForbidden();
    }

    const body = await req.json().catch(() => ({}));

    const templateId = String(
      body?.template_id || body?.templateId || ""
    ).trim();

    if (!isUuid(templateId)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Selecione uma mensagem ativa criada em Mensagens IA.",
        },
        {
          status: 400,
        }
      );
    }

    const configuredTemplate = await getConfiguredTemplate(
      supabase,
      access,
      templateId
    );

    if (!configuredTemplate) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Mensagem não encontrada, inativa ou sem permissão para este usuário.",
        },
        {
          status: 404,
        }
      );
    }

    const configuredMessage = String(
      configuredTemplate.base_message || ""
    ).trim();

    if (!configuredMessage) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A mensagem selecionada não possui texto configurado.",
        },
        {
          status: 400,
        }
      );
    }

    const configuredIntent = String(
      configuredTemplate.intent ||
        configuredTemplate.type ||
        "campaign"
    ).trim();

    const targetKanbanStatus =
      normalizeKanbanStatus(
        configuredTemplate.kanban_status
      );

    const leadId = String(
      body?.lead_id || body?.leadId || ""
    ).trim();

    if (!isUuid(leadId)) {
      return NextResponse.json(
        {
          success: false,
          error: "lead_id inválido.",
        },
        {
          status: 400,
        }
      );
    }

    let leadQuery = supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .eq("company_id", access.companyId);

    if (access.role === "VENDEDOR") {
      leadQuery = leadQuery.eq("owner_user_id", access.userId);
    }

    const { data: lead, error: leadError } =
      await leadQuery.maybeSingle();

    if (leadError) {
      throw new Error(leadError.message);
    }

    if (!lead) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Lead não encontrado para esta empresa.",
        },
        {
          status: 404,
        }
      );
    }

    const rawSession =
      body?.session_id ??
      body?.sessionId ??
      lead?.session_id ??
      1;

    /*
     * session_id = 0 era usado como "inteligente".
     * A distribuição inteligente da página já envia uma sessão online.
     * Mantemos o fallback para 1 por compatibilidade.
     */
    const sessionId =
      Number(rawSession) === 0
        ? 1
        : normalizeSessionNumber(rawSession, 1);

    const phone = normalizePhone(
      body?.phone || lead?.phone
    );

    if (!phone) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Lead sem telefone/WhatsApp válido.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * A mensagem é resolvida ANTES de entrar na fila.
     *
     * Isso torna a fila compatível com qualquer worker já existente:
     * o item passa a carregar o texto final, com variável e variação
     * aplicadas, em vez de depender do worker para reconstruir o template.
     */
    const variations = await loadTemplateVariations(
      supabase,
      access.companyId,
      configuredTemplate.id
    );

    const messagePool = uniqueTexts([
      configuredMessage,
      ...variations.map((variation: any) =>
        getVariationText(variation)
      ),
    ]);

    if (!messagePool.length) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A mensagem selecionada não possui conteúdo válido.",
        },
        {
          status: 400,
        }
      );
    }

    const rawSequenceIndex = Number(
      body?.sequence_index ??
        body?.sequenceIndex ??
        body?.variation_index ??
        body?.variationIndex ??
        0
    );

    const sequenceIndex =
      Number.isFinite(rawSequenceIndex) &&
      rawSequenceIndex >= 0
        ? Math.trunc(rawSequenceIndex)
        : 0;

    const selectedIndex =
      sequenceIndex % messagePool.length;

    const selectedSource =
      selectedIndex === 0
        ? "base"
        : "variation";

    const resolvedMessage =
      applyCommercialVariables(
        messagePool[selectedIndex],
        lead,
        configuredTemplate
      );

    if (!resolvedMessage) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A mensagem ficou vazia após aplicar as variáveis.",
        },
        {
          status: 400,
        }
      );
    }

    const now = new Date().toISOString();

    const queueOwnerUserId =
      access.role === "VENDEDOR"
        ? access.userId
        : isUuid(lead.owner_user_id)
          ? lead.owner_user_id
          : access.userId;

    const queuePayload: Record<string, unknown> = {
      company_id: access.companyId,
      branch_id:
        lead?.branch_id ||
        access.branchId ||
        null,

      /*
       * Campo essencial do isolamento multiusuário.
       * O worker usa este UUID para montar:
       * company_id + owner_user_id + session_id.
       */
      owner_user_id: queueOwnerUserId,

      lead_id: lead.id,
      phone,
      session_id: sessionId,
      type: configuredIntent,

      /*
       * Neste fluxo o campaign_id guarda o ID do template comercial.
       * O processador atual já aceita essa compatibilidade.
       */
      campaign_id: configuredTemplate.id,

      status: "pending",
      scheduled_at: now,
      created_at: now,
      attempts: 0,
      message: resolvedMessage,
      error: null,
      last_error: null,
      next_attempt_at: null,
    };

    let queueResult = await supabase
      .from("automation_queue")
      .insert(queuePayload)
      .select("*")
      .single();

    /*
     * Compatibilidade com bancos antigos em que campaign_id possua uma
     * restrição externa diferente. A mensagem final continua funcionando
     * mesmo sem o vínculo explícito do template.
     */
    if (
      queueResult.error &&
      /campaign_id|foreign key|violates/i.test(
        queueResult.error.message || ""
      )
    ) {
      const fallbackPayload = {
        ...queuePayload,
        campaign_id: null,
      };

      queueResult = await supabase
        .from("automation_queue")
        .insert(fallbackPayload)
        .select("*")
        .single();
    }

    const queueItem = queueResult.data;
    const queueError = queueResult.error;

    if (queueError || !queueItem) {
      throw new Error(
        queueError?.message ||
          "A fila não retornou o item criado."
      );
    }

    /*
     * Registra a saída imediatamente no Inbox com status "queued".
     * O processador V2 atualiza este mesmo registro para "sent".
     * Workers legados que apenas enviam a fila não deixam mais o Inbox vazio.
     */
    const { error: historyError } = await supabase
      .from("messages")
      .insert({
        company_id: access.companyId,
        branch_id:
          lead?.branch_id ||
          access.branchId ||
          null,
        lead_id: lead.id,
        owner_user_id: queueOwnerUserId,
        direction: "sent",
        topic: "whatsapp",
        extension: "text",
        event: "message_queued",
        content: resolvedMessage,
        status: "queued",
        payload: {
          source: "crm_queue",
          queue_id: queueItem.id,
          template_id: configuredTemplate.id,
          template_name:
            configuredTemplate.name ||
            configuredTemplate.title ||
            null,
          sequence_index: sequenceIndex,
          variation_index: selectedIndex,
          variation_total: messagePool.length,
          variation_source: selectedSource,
          session_id: sessionId,
        },
        created_at: now,
        updated_at: now,
      });

    if (historyError) {
      console.error(
        "CRM_QUEUE_HISTORY_WARNING",
        historyError
      );
    }

    /*
     * Atualização auxiliar do Kanban.
     * Não deve desfazer a fila se algum campo legado não existir.
     */
    const leadUpdate: Record<string, unknown> = {
      /*
       * O card precisa sair de "Novo lead" assim que o disparo entra
       * na operação. Se o template definiu uma coluna específica,
       * ela tem prioridade; caso contrário usamos "Mensagem enviada".
       *
       * O worker real ainda poderá confirmar o envio depois.
       */
      status: targetKanbanStatus || "enviado",
      campaign_status: "queued",
      last_message: resolvedMessage,
      last_message_at: now,
      last_campaign_at: now,
      opening_sent: true,
      updated_at: now,
    };

    if (
      isUuid(body?.job_id || body?.jobId)
    ) {
      leadUpdate.current_job_id = String(
        body?.job_id || body?.jobId
      );
    }

    if (
      isUuid(body?.batch_id || body?.batchId)
    ) {
      leadUpdate.batch_id = String(
        body?.batch_id || body?.batchId
      );
    }

    let updateLeadQuery = supabase
      .from("leads")
      .update(leadUpdate)
      .eq("id", lead.id)
      .eq("company_id", access.companyId);

    if (access.role === "VENDEDOR") {
      updateLeadQuery = updateLeadQuery.eq(
        "owner_user_id",
        access.userId
      );
    }

    const { error: updateLeadError } = await updateLeadQuery;

    if (updateLeadError) {
      console.error(
        "CRM_QUEUE_LEAD_UPDATE_WARNING",
        updateLeadError
      );
    }

    return NextResponse.json({
      success: true,
      item: queueItem,
      template: {
        id: configuredTemplate.id,
        name:
          configuredTemplate.name ||
          configuredTemplate.title ||
          null,
        intent: configuredTemplate.intent || null,
        kanban_status: targetKanbanStatus || null,
      },
      owner_user_id: queueOwnerUserId,
      resolved_message: resolvedMessage,
      variation: {
        sequence_index: sequenceIndex,
        selected_index: selectedIndex,
        total: messagePool.length,
        source: selectedSource,
      },
      kanban_status:
        targetKanbanStatus || "enviado",
    });
  } catch (error: any) {
    console.error("CRM_QUEUE_POST_ERROR", error);

    const message =
      error?.message ||
      "Erro ao criar item na fila.";

    const status =
      message.includes("não identificad") ? 401 : 500;

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status,
      }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const access = await requireQueueAccess(req);

    if (access.role === "SUPERVISOR") {
      return supervisorForbidden();
    }

    const body = await req.json().catch(() => ({}));

    const action = String(
      body?.action || ""
    )
      .trim()
      .toLowerCase();

    if (
      !["pause", "resume", "retry"].includes(action)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Ação inválida.",
        },
        {
          status: 400,
        }
      );
    }

    const now = new Date().toISOString();

    let sourceStatus = "";
    let updateData: Record<string, unknown> = {};

    if (action === "pause") {
      sourceStatus = "pending";
      updateData = {
        status: "paused",
        updated_at: now,
      };
    }

    if (action === "resume") {
      sourceStatus = "paused";
      updateData = {
        status: "pending",
        updated_at: now,
        next_attempt_at: null,
      };
    }

    if (action === "retry") {
      sourceStatus = "failed";
      updateData = {
        status: "pending",
        attempts: 0,
        error: null,
        last_error: null,
        next_attempt_at: null,
        processing_at: null,
        processing_started_at: null,
        locked_at: null,
        worker_id: null,
        finished_at: null,
        updated_at: now,
      };
    }

    let query = supabase
      .from("automation_queue")
      .update(updateData)
      .eq("company_id", access.companyId)
      .eq("status", sourceStatus);

    if (access.role === "VENDEDOR") {
      query = query.eq("owner_user_id", access.userId);
    } else {
      const sellerParam = String(
        body?.seller_id ||
          body?.owner_user_id ||
          body?.ownerUserId ||
          ""
      ).trim();

      if (sellerParam) {
        if (!isUuid(sellerParam)) {
          return NextResponse.json(
            {
              success: false,
              error: "seller_id inválido.",
            },
            {
              status: 400,
            }
          );
        }

        query = query.eq("owner_user_id", sellerParam);
      }
    }

    const queueId = String(
      body?.id ||
        body?.queue_id ||
        body?.queueId ||
        ""
    ).trim();

    if (queueId) {
      if (!isUuid(queueId)) {
        return NextResponse.json(
          {
            success: false,
            error: "ID da fila inválido.",
          },
          {
            status: 400,
          }
        );
      }

      query = query.eq("id", queueId);
    }

    const { data, error } = await query.select("id");

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      action,
      updated: data?.length || 0,
      owner_user_id:
        access.role === "VENDEDOR"
          ? access.userId
          : null,
    });
  } catch (error: any) {
    console.error("CRM_QUEUE_PATCH_ERROR", error);

    const message =
      error?.message ||
      "Erro ao atualizar fila.";

    const status =
      message.includes("não identificad") ? 401 : 500;

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status,
      }
    );
  }
}
