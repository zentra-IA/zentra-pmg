import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompany } from "@/lib/server-company";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_CONVERSATIONS = 300;
const MAX_MESSAGES_PER_CONVERSATION = 1000;

const COMMERCIAL_STATUSES = [
  "novo",
  "campanha",
  "enviado",
  "respondeu",
  "cotacao",
  "pedido",
  "reagendar_futuro",
  "sem_interesse",

  // Compatibilidade com registros antigos.
  "respondido",
  "interesse",
  "quer_agendar_entrevista",
  "entrevista_agendada",
  "entrevista_confirmada",
  "reativar_futuro",
  "finalizado",
  "contratado",
  "selecionado_vaga",
  "aprovado",
  "nao_aprovado",
  "nao_compareceu",
];

type AccessContext = {
  companyId: string;
  branchId: string | null;
  userId: string;
};

function getSupabase() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase não configurado.");
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function clean(value: unknown) {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  return String(value).trim();
}

function normalizePhone(value: unknown) {
  const digits = clean(value).replace(
    /\D/g,
    ""
  );

  if (!digits) return "";
  if (digits.startsWith("55")) return digits;

  if (
    digits.length === 10 ||
    digits.length === 11
  ) {
    return `55${digits}`;
  }

  return digits;
}

function normalizeStatus(value: unknown) {
  const status = clean(
    value || "novo"
  ).toLowerCase();

  const aliases: Record<string, string> = {
    respondido: "respondeu",
    interesse: "cotacao",
    quer_agendar_entrevista: "cotacao",
    entrevista_agendada: "pedido",
    entrevista_confirmada: "pedido",
    contratado: "pedido",
    finalizado: "pedido",
    reativar_futuro: "reagendar_futuro",
    selecionado_vaga: "cotacao",
    aprovado: "pedido",
    nao_aprovado: "sem_interesse",
    nao_compareceu: "reagendar_futuro",
  };

  return aliases[status] || status || "novo";
}

function asObject(value: unknown) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function getMessageOwnerId(message: any) {
  const payload = asObject(message?.payload);

  return clean(
    payload.owner_user_id ||
      payload.user_id ||
      payload.seller_user_id ||
      payload.whatsapp_owner_user_id
  );
}

function getMessageMedia(message: any) {
  const payload = asObject(message?.payload);
  const extension = clean(
    message?.extension ||
      payload.media_type ||
      "text"
  ).toLowerCase();

  return {
    media_url:
      clean(
        payload.media_url ||
          payload.mediaUrl ||
          payload.file_url ||
          payload.fileUrl
      ) || null,
    media_type:
      clean(
        payload.media_type ||
          payload.mediaType ||
          extension
      ) || "text",
    mime_type:
      clean(
        payload.mime_type ||
          payload.mimeType
      ) || null,
    file_name:
      clean(
        payload.file_name ||
          payload.fileName
      ) || null,
    caption:
      clean(payload.caption) || null,
  };
}

function normalizeDirection(value: unknown) {
  const direction = clean(
    value
  ).toLowerCase();

  if (
    [
      "sent",
      "out",
      "outgoing",
      "outbound",
    ].includes(direction)
  ) {
    return "sent";
  }

  return "received";
}

function normalizeMessage(message: any) {
  const payload = asObject(
    message?.payload
  );

  return {
    ...message,
    direction: normalizeDirection(
      message?.direction
    ),
    extension:
      clean(
        message?.extension ||
          payload.media_type
      ) || "text",
    content:
      clean(message?.content) ||
      "Mensagem",
    payload,
    owner_user_id:
      getMessageOwnerId(message) ||
      null,
    ...getMessageMedia(message),
  };
}

function normalizeLead(lead: any) {
  return {
    ...lead,
    status: normalizeStatus(lead?.status),
    phone: normalizePhone(
      lead?.phone ||
        lead?.mobile ||
        lead?.telefone
    ),
    unread_count: Number(
      lead?.unread_count || 0
    ),
    latest_received_at:
      lead?.last_message_at ||
      lead?.updated_at ||
      lead?.created_at ||
      null,
  };
}

async function requireInboxAccess(
  req: NextRequest
): Promise<AccessContext> {
  const access =
    await requireCompany(req);

  const companyId = clean(
    access?.companyId
  );

  const userId = clean(
    access?.userId
  );

  const branchId = access?.branchId
    ? clean(access.branchId)
    : null;

  if (!companyId) {
    throw new Error(
      "Empresa não identificada."
    );
  }

  if (!userId) {
    throw new Error(
      "Usuário autenticado não identificado."
    );
  }

  return {
    companyId,
    branchId,
    userId,
  };
}

/**
 * Obtém os leads pertencentes ao vendedor.
 *
 * A propriedade é comprovada por:
 * 1. mensagens cujo payload contém owner_user_id/user_id;
 * 2. itens da automation_queue com owner_user_id.
 *
 * Isso evita depender de uma coluna owner_user_id na tabela leads,
 * que ainda pode não existir em instalações antigas.
 */
async function getOwnedLeadIds(
  supabase: ReturnType<typeof getSupabase>,
  companyId: string,
  userId: string
) {
  const ids = new Set<string>();

  const [
    messagesResult,
    queueResult,
  ] = await Promise.all([
    supabase
      .from("messages")
      .select("lead_id, payload")
      .eq("company_id", companyId)
      .not("lead_id", "is", null)
      .order("created_at", {
        ascending: false,
      })
      .limit(3000),

    supabase
      .from("automation_queue")
      .select("lead_id")
      .eq("company_id", companyId)
      .eq("owner_user_id", userId)
      .not("lead_id", "is", null)
      .order("created_at", {
        ascending: false,
      })
      .limit(3000),
  ]);

  if (messagesResult.error) {
    throw new Error(
      messagesResult.error.message
    );
  }

  if (queueResult.error) {
    throw new Error(
      queueResult.error.message
    );
  }

  for (
    const message of
    messagesResult.data || []
  ) {
    if (
      getMessageOwnerId(message) ===
        userId &&
      message?.lead_id
    ) {
      ids.add(String(message.lead_id));
    }
  }

  for (
    const item of
    queueResult.data || []
  ) {
    if (item?.lead_id) {
      ids.add(String(item.lead_id));
    }
  }

  return ids;
}

async function getLeadById(
  supabase: ReturnType<typeof getSupabase>,
  companyId: string,
  leadId: string
) {
  const {
    data,
    error,
  } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data || null;
}

async function getRelatedLeadIds(
  supabase: ReturnType<typeof getSupabase>,
  companyId: string,
  lead: any,
  ownedLeadIds: Set<string>
) {
  const ids = new Set<string>();

  if (
    lead?.id &&
    ownedLeadIds.has(String(lead.id))
  ) {
    ids.add(String(lead.id));
  }

  const phone = normalizePhone(
    lead?.phone ||
      lead?.mobile ||
      lead?.telefone
  );

  const lookupValues = [
    {
      column: "phone",
      value: phone,
    },
    {
      column: "whatsapp_lid",
      value: clean(
        lead?.whatsapp_lid
      ),
    },
    {
      column: "remote_jid",
      value: clean(
        lead?.remote_jid
      ),
    },
  ];

  for (
    const lookup of lookupValues
  ) {
    if (!lookup.value) continue;

    const {
      data,
      error,
    } = await supabase
      .from("leads")
      .select("id")
      .eq("company_id", companyId)
      .eq(
        lookup.column,
        lookup.value
      );

    if (error) {
      /*
       * Alguns schemas antigos não têm todos os campos.
       * Ignoramos apenas a busca auxiliar.
       */
      continue;
    }

    for (const item of data || []) {
      const id = clean(item?.id);

      if (
        id &&
        ownedLeadIds.has(id)
      ) {
        ids.add(id);
      }
    }
  }

  return [...ids];
}

async function getLatestMessageByLead(
  supabase: ReturnType<typeof getSupabase>,
  companyId: string,
  userId: string,
  leadIds: string[]
) {
  const latest = new Map<
    string,
    any
  >();

  if (!leadIds.length) {
    return latest;
  }

  const {
    data,
    error,
  } = await supabase
    .from("messages")
    .select("*")
    .eq("company_id", companyId)
    .in("lead_id", leadIds)
    .order("created_at", {
      ascending: false,
    })
    .limit(3000);

  if (error) {
    throw new Error(error.message);
  }

  for (const message of data || []) {
    if (
      getMessageOwnerId(message) !==
      userId
    ) {
      continue;
    }

    const leadId = clean(
      message?.lead_id
    );

    if (
      leadId &&
      !latest.has(leadId)
    ) {
      latest.set(
        leadId,
        normalizeMessage(message)
      );
    }
  }

  return latest;
}

async function listConversations(
  req: NextRequest,
  access: AccessContext
) {
  const supabase = getSupabase();
  const {
    searchParams,
  } = new URL(req.url);

  const q = clean(
    searchParams.get("q")
  ).toLowerCase();

  const statusFilter = clean(
    searchParams.get("status")
  ).toLowerCase();

  const ownedLeadIds =
    await getOwnedLeadIds(
      supabase,
      access.companyId,
      access.userId
    );

  if (!ownedLeadIds.size) {
    return NextResponse.json([]);
  }

  const ids = [
    ...ownedLeadIds,
  ].slice(0, 3000);

  const {
    data,
    error,
  } = await supabase
    .from("leads")
    .select("*")
    .eq(
      "company_id",
      access.companyId
    )
    .in("id", ids)
    .order("last_message_at", {
      ascending: false,
      nullsFirst: false,
    })
    .order("updated_at", {
      ascending: false,
      nullsFirst: false,
    })
    .limit(MAX_CONVERSATIONS);

  if (error) {
    throw new Error(error.message);
  }

  const leads = (
    data || []
  ).map(normalizeLead);

  const latestMessages =
    await getLatestMessageByLead(
      supabase,
      access.companyId,
      access.userId,
      leads.map((lead) =>
        String(lead.id)
      )
    );

  let conversations = leads.map(
    (lead) => {
      const latest =
        latestMessages.get(
          String(lead.id)
        ) || null;

      return {
        ...lead,
        owner_user_id:
          access.userId,
        last_message:
          latest?.content ||
          lead.last_message ||
          null,
        last_message_at:
          latest?.created_at ||
          lead.last_message_at ||
          lead.updated_at ||
          lead.created_at ||
          null,
        last_message_direction:
          latest?.direction ||
          null,
        last_message_extension:
          latest?.extension ||
          "text",
        last_message_media_url:
          latest?.media_url ||
          null,
      };
    }
  );

  if (statusFilter) {
    conversations =
      conversations.filter(
        (lead) =>
          normalizeStatus(
            lead.status
          ) ===
          normalizeStatus(statusFilter)
      );
  } else {
    conversations =
      conversations.filter(
        (lead) =>
          COMMERCIAL_STATUSES.includes(
            clean(lead.status)
          ) ||
          Boolean(
            latestMessages.get(
              String(lead.id)
            )
          )
      );
  }

  if (q) {
    conversations =
      conversations.filter(
        (lead) => {
          const haystack = [
            lead.name,
            lead.nome,
            lead.company_name,
            lead.phone,
            lead.email,
            lead.last_message,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return haystack.includes(q);
        }
      );
  }

  conversations.sort(
    (a, b) =>
      new Date(
        b.last_message_at || 0
      ).getTime() -
      new Date(
        a.last_message_at || 0
      ).getTime()
  );

  return NextResponse.json(
    conversations
  );
}

async function getConversationMessages(
  req: NextRequest,
  access: AccessContext,
  leadId: string
) {
  const supabase = getSupabase();

  const ownedLeadIds =
    await getOwnedLeadIds(
      supabase,
      access.companyId,
      access.userId
    );

  if (
    !ownedLeadIds.has(leadId)
  ) {
    return NextResponse.json(
      {
        error:
          "Conversa não encontrada para este vendedor.",
      },
      {
        status: 404,
      }
    );
  }

  const lead = await getLeadById(
    supabase,
    access.companyId,
    leadId
  );

  if (!lead) {
    return NextResponse.json(
      {
        error:
          "Contato não encontrado.",
      },
      {
        status: 404,
      }
    );
  }

  const relatedLeadIds =
    await getRelatedLeadIds(
      supabase,
      access.companyId,
      lead,
      ownedLeadIds
    );

  const targetIds =
    relatedLeadIds.length
      ? relatedLeadIds
      : [leadId];

  const {
    data,
    error,
  } = await supabase
    .from("messages")
    .select("*")
    .eq(
      "company_id",
      access.companyId
    )
    .in("lead_id", targetIds)
    .order("created_at", {
      ascending: true,
    })
    .limit(
      MAX_MESSAGES_PER_CONVERSATION
    );

  if (error) {
    throw new Error(error.message);
  }

  const messages = (
    data || []
  )
    .filter(
      (message) =>
        getMessageOwnerId(message) ===
        access.userId
    )
    .map(normalizeMessage);

  /*
   * Compatibilidade com conversas antigas:
   * se o lead possui última mensagem mas o histórico ainda não,
   * adiciona uma visualização temporária sem gravar duplicado.
   */
  if (
    !messages.length &&
    lead.last_message
  ) {
    messages.push({
      id: `fallback-${lead.id}`,
      company_id:
        access.companyId,
      branch_id:
        lead.branch_id || null,
      lead_id: lead.id,
      direction: "received",
      topic: "whatsapp",
      extension: "text",
      content: lead.last_message,
      event:
        "message_received_fallback",
      payload: {
        owner_user_id:
          access.userId,
        fallback: true,
      },
      owner_user_id:
        access.userId,
      media_url: null,
      media_type: "text",
      mime_type: null,
      file_name: null,
      caption: null,
      created_at:
        lead.last_message_at ||
        lead.updated_at ||
        lead.created_at,
    });
  }

  /*
   * Marca apenas este contato como lido.
   * O acesso já foi validado pelo conjunto de propriedade.
   */
  const {
    error: readError,
  } = await supabase
    .from("leads")
    .update({
      unread_count: 0,
      updated_at:
        new Date().toISOString(),
    })
    .eq("id", lead.id)
    .eq(
      "company_id",
      access.companyId
    );

  if (readError) {
    console.error(
      "INBOX_READ_WARNING:",
      readError
    );
  }

  return NextResponse.json(
    messages
  );
}

export async function GET(
  req: NextRequest
) {
  try {
    const access =
      await requireInboxAccess(req);

    const {
      searchParams,
    } = new URL(req.url);

    const leadId = clean(
      searchParams.get("leadId") ||
        searchParams.get("lead_id")
    );

    if (leadId) {
      return getConversationMessages(
        req,
        access,
        leadId
      );
    }

    return listConversations(
      req,
      access
    );
  } catch (error: any) {
    console.error(
      "GET /api/crm/inbox:",
      error
    );

    const message =
      error?.message ||
      "Erro ao carregar inbox.";

    return NextResponse.json(
      {
        error: message,
      },
      {
        status:
          message.includes(
            "não identificad"
          )
            ? 401
            : 500,
      }
    );
  }
}

export async function PATCH(
  req: NextRequest
) {
  try {
    const supabase =
      getSupabase();

    const access =
      await requireInboxAccess(req);

    const body = await req
      .json()
      .catch(() => ({}));

    const leadId = clean(
      body?.leadId ||
        body?.lead_id ||
        body?.id
    );

    if (!leadId) {
      return NextResponse.json(
        {
          error:
            "ID do contato obrigatório.",
        },
        {
          status: 400,
        }
      );
    }

    const ownedLeadIds =
      await getOwnedLeadIds(
        supabase,
        access.companyId,
        access.userId
      );

    if (
      !ownedLeadIds.has(leadId)
    ) {
      return NextResponse.json(
        {
          error:
            "Você não tem acesso a esta conversa.",
        },
        {
          status: 403,
        }
      );
    }

    const update: Record<
      string,
      unknown
    > = {
      updated_at:
        new Date().toISOString(),
    };

    if (
      body.ai_paused !== undefined ||
      body.aiPaused !== undefined
    ) {
      update.ai_paused = Boolean(
        body.ai_paused ??
          body.aiPaused
      );
    }

    if (
      body.paused !== undefined
    ) {
      update.paused = Boolean(
        body.paused
      );
    }

    if (
      body.unread_count !==
      undefined
    ) {
      update.unread_count =
        Math.max(
          0,
          Number(
            body.unread_count || 0
          )
        );
    }

    if (
      body.status !== undefined
    ) {
      update.status =
        normalizeStatus(body.status);
    }

    if (
      body.session_id !==
        undefined ||
      body.sessionId !== undefined
    ) {
      const sessionId = Number(
        body.session_id ??
          body.sessionId
      );

      if (
        Number.isInteger(
          sessionId
        ) &&
        sessionId >= 1 &&
        sessionId <= 5
      ) {
        update.session_id =
          sessionId;
      }
    }

    const {
      data,
      error,
    } = await supabase
      .from("leads")
      .update(update)
      .eq("id", leadId)
      .eq(
        "company_id",
        access.companyId
      )
      .select("*")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return NextResponse.json(
        {
          error:
            "Contato não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      success: true,
      lead: {
        ...normalizeLead(data),
        owner_user_id:
          access.userId,
      },
    });
  } catch (error: any) {
    console.error(
      "PATCH /api/crm/inbox:",
      error
    );

    const message =
      error?.message ||
      "Erro ao atualizar conversa.";

    return NextResponse.json(
      {
        error: message,
      },
      {
        status:
          message.includes(
            "não identificad"
          )
            ? 401
            : 500,
      }
    );
  }
}
