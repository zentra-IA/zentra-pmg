import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

const CUSTOMER_TABLES = [
  "Customer",
  "customers",
  "CrmCustomer",
  "crm_customers",
  "contacts",
  "leads",
];

const MAX_PER_SESSION_DAY = Number(
  process.env.CRM_MAX_PER_SESSION_DAY || 80
);

type CampaignAccess = {
  companyId: string;
  branchId?: string | null;
  userId: string;
  userRole: string;
};

type QueueInsertError = {
  customerId: string | null;
  phone: string;
  sessionId: number;
  message: string;
};

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase não configurado.");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function normalizePhone(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;

  return digits;
}

function getName(customer: any) {
  return (
    customer?.nome_fantasia ||
    customer?.fantasy_name ||
    customer?.razao_social ||
    customer?.name ||
    customer?.nome ||
    "Cliente"
  );
}

function getSegment(customer: any) {
  return (
    customer?.segmento ||
    customer?.segment ||
    customer?.category ||
    "cliente"
  );
}

function getCity(customer: any) {
  return customer?.cidade || customer?.city || "";
}

function getPhone(customer: any) {
  return (
    customer?.whatsapp ||
    customer?.celular ||
    customer?.phone ||
    customer?.telefone ||
    customer?.mobile ||
    ""
  );
}

function getLastDate(customer: any) {
  return (
    customer?.last_order_at ||
    customer?.last_order ||
    customer?.last_purchase_at ||
    customer?.updated_at ||
    customer?.updatedAt ||
    customer?.created_at ||
    customer?.createdAt
  );
}

function daysStopped(customer: any) {
  const date = getLastDate(customer);

  if (!date) return 9999;

  const timestamp = new Date(date).getTime();

  if (Number.isNaN(timestamp)) return 9999;

  return Math.max(
    0,
    Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24))
  );
}

function fillTemplate(template: string, customer: any) {
  return String(template || "")
    .replaceAll("{cliente}", getName(customer))
    .replaceAll("{nome}", getName(customer))
    .replaceAll("{segmento}", getSegment(customer))
    .replaceAll("{cidade}", getCity(customer) || "sua região")
    .replaceAll("{whatsapp}", String(getPhone(customer) || ""))
    .replaceAll(
      "{vendedor}",
      customer?.seller_name ||
        customer?.representante ||
        "seu representante PMG"
    )
    .replaceAll("{empresa}", "PMG Atacadista");
}

function normalizeSelectedSessions(value: unknown): number[] {
  const raw = Array.isArray(value) ? value : [1];

  return Array.from(
    new Set(
      raw
        .map(Number)
        .filter(
          (session) =>
            Number.isInteger(session) &&
            session >= 1 &&
            session <= 5
        )
    )
  );
}

function assertAccess(access: Partial<CampaignAccess>): CampaignAccess {
  const companyId = String(access.companyId || "").trim();
  const userId = String(access.userId || "").trim();
  const userRole = String(access.userRole || "").trim().toUpperCase();
  const branchId = access.branchId
    ? String(access.branchId).trim()
    : null;

  if (!companyId) {
    throw new Error("Empresa não identificada.");
  }

  if (!userId) {
    throw new Error("Usuário autenticado não identificado.");
  }

  if (!userRole) {
    throw new Error("Perfil do usuário não identificado.");
  }

  return {
    companyId,
    branchId,
    userId,
    userRole,
  };
}

function supervisorForbidden() {
  return NextResponse.json(
    {
      success: false,
      error:
        "Supervisor não possui acesso a esta rota operacional.",
    },
    {
      status: 403,
    }
  );
}

async function findConfiguredTemplate(
  supabase: any,
  access: CampaignAccess,
  templateId: string,
  intent: string
) {
  let query = supabase
    .from("message_templates")
    .select(
      "id, name, title, intent, base_message, kanban_status, active, owner_user_id"
    )
    .eq("company_id", access.companyId)
    .eq("active", true);

  if (templateId) {
    query = query.eq("id", templateId);
  } else if (intent) {
    query = query.eq("intent", intent);
  } else {
    return null;
  }

  if (access.userRole === "VENDEDOR") {
    query = query.eq("owner_user_id", access.userId);
  }

  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Erro ao carregar mensagem cadastrada: ${error.message}`
    );
  }

  return data || null;
}

async function findReadableCustomerTable(
  supabase: any,
  access: CampaignAccess
) {
  const readableTables: string[] = [];

  for (const table of CUSTOMER_TABLES) {
    let tableQuery = supabase
      .from(table)
      .select("id")
      .eq("company_id", access.companyId);

    if (access.userRole === "VENDEDOR") {
      tableQuery =
        table === "leads"
          ? tableQuery.eq(
              "owner_user_id",
              access.userId
            )
          : tableQuery.eq(
              "seller_id",
              access.userId
            );
    }

    const { data, error } =
      await tableQuery.limit(1);

    if (error) {
      continue;
    }

    readableTables.push(table);

    if (Array.isArray(data) && data.length > 0) {
      console.log("[CRM CAMPAIGNS] Tabela de clientes selecionada", {
        table,
        companyId: access.companyId,
        userId:
          access.userRole === "VENDEDOR"
            ? access.userId
            : undefined,
      });

      return table;
    }
  }

  if (readableTables.length > 0) {
    /*
     * As tabelas existem, porém não há clientes acessíveis em nenhuma.
     * Retornar a primeira tabela legível mantém a resposta vazia de forma
     * previsível, sem selecionar uma tabela inexistente.
     */
    return readableTables[0];
  }

  throw new Error(
    "Nenhuma tabela de clientes compatível foi encontrada."
  );
}

async function fetchCustomers(
  req: NextRequest,
  access: CampaignAccess
) {
  const { companyId, userId, userRole } = access;
  const supabase = getSupabase();
  const table = await findReadableCustomerTable(
    supabase,
    access
  );
  const url = new URL(req.url);

  const q = String(
    url.searchParams.get("q") || ""
  )
    .trim()
    .toLowerCase();

  const segment = String(
    url.searchParams.get("segment") || ""
  )
    .trim()
    .toLowerCase();

  const city = String(
    url.searchParams.get("city") || ""
  )
    .trim()
    .toLowerCase();

  const status = String(
    url.searchParams.get("status") || "TODOS"
  )
    .trim()
    .toLowerCase();

  const targetDays = Number(
    url.searchParams.get("targetDays") || 0
  );

  let customerQuery = supabase
    .from(table)
    .select("*")
    .eq("company_id", companyId);

  if (userRole === "VENDEDOR") {
    customerQuery =
      table === "leads"
        ? customerQuery.eq(
            "owner_user_id",
            userId
          )
        : customerQuery.eq(
            "seller_id",
            userId
          );
  }

  const { data, error } =
    await customerQuery.limit(500);

  if (error) {
    throw new Error(
      `Erro ao carregar clientes em ${table}: ${error.message}`
    );
  }

  let customers = Array.isArray(data) ? data : [];

  customers = customers.filter((customer) => {
    const phone = normalizePhone(getPhone(customer));

    if (!phone) return false;

    const customerStatus = String(
      customer?.status || "ativo"
    ).toLowerCase();

    if (
      status &&
      status !== "todos" &&
      customerStatus !== status
    ) {
      return false;
    }

    if (
      Number.isFinite(targetDays) &&
      targetDays > 0 &&
      daysStopped(customer) < targetDays
    ) {
      return false;
    }

    if (q) {
      const haystack = [
        getName(customer),
        customer?.cnpj_cpf,
        customer?.document,
        customer?.cpf,
        customer?.cnpj,
        getPhone(customer),
        customer?.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(q)) return false;
    }

    if (
      segment &&
      !getSegment(customer)
        .toLowerCase()
        .includes(segment)
    ) {
      return false;
    }

    if (
      city &&
      !getCity(customer)
        .toLowerCase()
        .includes(city)
    ) {
      return false;
    }

    return true;
  });

  return {
    table,
    customers,
  };
}

async function getQueueStats(
  supabase: any,
  companyId: string,
  ownerUserId: string
) {
  const { data, error } = await supabase
    .from("automation_queue")
    .select("status")
    .eq("company_id", companyId)
    .eq("owner_user_id", ownerUserId);

  if (error) {
    throw new Error(
      `Erro ao carregar estatísticas da fila: ${error.message}`
    );
  }

  const rows = Array.isArray(data) ? data : [];

  return rows.reduce(
    (acc: Record<string, number>, item: any) => {
      const itemStatus = String(
        item?.status || "pending"
      );

      acc[itemStatus] =
        (acc[itemStatus] || 0) + 1;

      return acc;
    },
    {
      pending: 0,
      sent: 0,
      failed: 0,
      error: 0,
      paused: 0,
      processing: 0,
    }
  );
}

async function countSessionToday(
  supabase: any,
  companyId: string,
  ownerUserId: string,
  session: number
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from("automation_queue")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("company_id", companyId)
    .eq("owner_user_id", ownerUserId)
    .eq("session_id", session)
    .in("status", [
      "pending",
      "processing",
      "sent",
    ])
    .gte(
      "scheduled_at",
      today.toISOString()
    );

  if (error) {
    throw new Error(
      `Erro ao contar envios da sessão ${session}: ${error.message}`
    );
  }

  return count || 0;
}

async function findAvailableSession(
  supabase: any,
  companyId: string,
  ownerUserId: string,
  selectedSessions: number[],
  preferredSession: number
) {
  const orderedSessions = [
    preferredSession,
    ...selectedSessions.filter(
      (session) => session !== preferredSession
    ),
  ];

  for (const session of orderedSessions) {
    const usedToday = await countSessionToday(
      supabase,
      companyId,
      ownerUserId,
      session
    );

    if (usedToday < MAX_PER_SESSION_DAY) {
      return session;
    }
  }

  return null;
}

function randomDelay(min: number, max: number) {
  return Math.floor(
    Math.random() * (max - min + 1)
  ) + min;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const access = assertAccess(
      await requireCompanyAccess(req)
    );

    if (access.userRole === "SUPERVISOR") {
      return supervisorForbidden();
    }

    const url = new URL(req.url);

    if (
      url.searchParams.get("stats") === "1"
    ) {
      return NextResponse.json({
        success: true,
        queue: await getQueueStats(
          supabase,
          access.companyId,
          access.userId
        ),
      });
    }

    const { table, customers } =
      await fetchCustomers(
        req,
        access
      );

    return NextResponse.json({
      success: true,
      table,
      customers,
      leads: customers,
      queue: await getQueueStats(
        supabase,
        access.companyId,
        access.userId
      ),
    });
  } catch (error: any) {
    console.error(
      "CRM CAMPAIGNS GET:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Erro ao listar clientes da campanha.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const access = assertAccess(
      await requireCompanyAccess(req)
    );

    if (access.userRole === "SUPERVISOR") {
      return supervisorForbidden();
    }
    const body = await req.json();

    const templateId = String(
      body?.templateId ||
        body?.template_id ||
        ""
    ).trim();

    const campaignType = String(
      body?.campaignType ||
        body?.intent ||
        ""
    ).trim();

    const selectedWpp =
      normalizeSelectedSessions(
        body?.selectedWpp
      );

    const selectedCustomerIds =
      Array.isArray(
        body?.selectedCustomerIds
      )
        ? body.selectedCustomerIds.map(
            String
          )
        : [];

    const configuredTemplate =
      await findConfiguredTemplate(
        supabase,
        access,
        templateId,
        campaignType
      );

    if (!configuredTemplate) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Selecione uma mensagem ativa criada em Mensagens IA antes de iniciar o disparo.",
        },
        {
          status: 400,
        }
      );
    }

    const messageTemplate = String(
      configuredTemplate.base_message || ""
    ).trim();

    if (!messageTemplate) {
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

    const targetKanbanStatus = String(
      configuredTemplate.kanban_status || ""
    ).trim();

    if (!selectedWpp.length) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Selecione pelo menos um WhatsApp válido.",
        },
        {
          status: 400,
        }
      );
    }

    const fakeReq = new NextRequest(
      req.url,
      {
        headers: req.headers,
      }
    );

    const {
      table,
      customers: eligibleCustomers,
    } = await fetchCustomers(
      fakeReq,
      access
    );

    const customers =
      selectedCustomerIds.length > 0
        ? eligibleCustomers.filter(
            (customer) =>
              selectedCustomerIds.includes(
                String(customer.id)
              )
          )
        : eligibleCustomers;

    if (!customers.length) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Nenhum cliente elegível encontrado.",
          table,
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: campaign,
      error: campaignError,
    } = await supabase
      .from("promotion_campaigns")
      .insert({
        company_id:
          access.companyId,
        branch_id:
          access.branchId || null,
        name:
          configuredTemplate.name ||
          configuredTemplate.title ||
          `Disparo ${configuredTemplate.intent || "comercial"}`,
        message: messageTemplate,
        whatsapp_accounts:
          selectedWpp,
        target_days: Number(
          body?.targetDays || 0
        ),
        total_queued: 0,
        created_at:
          new Date().toISOString(),
      })
      .select("*")
      .single();

    if (campaignError) {
      throw new Error(
        `Erro ao criar campanha: ${campaignError.message}`
      );
    }

    let scheduledAt = new Date(
      Date.now() + 30_000
    );
    let queued = 0;
    let sessionIndex = 0;

    const queueErrors: QueueInsertError[] =
      [];

    for (const customer of customers) {
      const phone = normalizePhone(
        getPhone(customer)
      );

      if (!phone) {
        continue;
      }

      const preferredSession =
        selectedWpp[
          sessionIndex %
            selectedWpp.length
        ] || 1;

      sessionIndex++;

      const sessionId =
        await findAvailableSession(
          supabase,
          access.companyId,
          access.userId,
          selectedWpp,
          preferredSession
        );

      if (!sessionId) {
        queueErrors.push({
          customerId:
            customer?.id
              ? String(customer.id)
              : null,
          phone,
          sessionId:
            preferredSession,
          message:
            "Todas as sessões selecionadas atingiram o limite diário.",
        });

        continue;
      }

      const message = fillTemplate(
        messageTemplate,
        customer
      );

      const {
        error: queueError,
      } = await supabase
        .from("automation_queue")
        .insert({
          company_id:
            access.companyId,
          branch_id:
            access.branchId || null,
          owner_user_id:
            access.userId,
          lead_id:
            table === "leads"
              ? customer?.id || null
              : null,
          phone,
          session_id: sessionId,
          type: "commercial_campaign",
          status: "pending",
          scheduled_at:
            scheduledAt.toISOString(),
          created_at:
            new Date().toISOString(),
          attempts: 0,
          message,
          campaign_id:
            campaign?.id || null,
        });

      if (queueError) {
        console.error(
          "[CRM CAMPAIGNS] Erro ao inserir item na fila",
          {
            customerId:
              customer?.id || null,
            phone,
            sessionId,
            error:
              queueError.message,
          }
        );

        queueErrors.push({
          customerId:
            customer?.id
              ? String(customer.id)
              : null,
          phone,
          sessionId,
          message:
            queueError.message,
        });

        continue;
      }

      if (
        table === "leads" &&
        customer?.id &&
        targetKanbanStatus
      ) {
        let leadStatusQuery = supabase
          .from("leads")
          .update({
            status: targetKanbanStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", customer.id)
          .eq("company_id", access.companyId);

        if (access.userRole === "VENDEDOR") {
          leadStatusQuery = leadStatusQuery.eq(
            "owner_user_id",
            access.userId
          );
        }

        const { error: leadStatusError } =
          await leadStatusQuery;

        if (leadStatusError) {
          console.error(
            "[CRM CAMPAIGNS] Falha ao aplicar status do Kanban configurado",
            {
              leadId: customer.id,
              templateId: configuredTemplate.id,
              kanbanStatus: targetKanbanStatus,
              error: leadStatusError.message,
            }
          );
        }
      }

      queued++;

      scheduledAt = new Date(
        scheduledAt.getTime() +
          randomDelay(
            90_000,
            240_000
          )
      );
    }

    if (campaign?.id) {
      const {
        error: updateError,
      } = await supabase
        .from("promotion_campaigns")
        .update({
          total_queued: queued,
        })
        .eq("id", campaign.id)
        .eq(
          "company_id",
          access.companyId
        );

      if (updateError) {
        console.error(
          "[CRM CAMPAIGNS] Falha ao atualizar total da campanha",
          updateError
        );
      }
    }

    if (queued === 0) {
      return NextResponse.json(
        {
          success: false,
          queued: 0,
          campaign,
          template: {
            id: configuredTemplate.id,
            name:
              configuredTemplate.name ||
              configuredTemplate.title ||
              null,
            intent: configuredTemplate.intent || null,
            kanban_status: targetKanbanStatus || null,
          },
          table,
          errors: queueErrors,
          error:
            queueErrors[0]
              ?.message ||
            "Nenhuma mensagem foi adicionada à fila.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
      queued,
      failed: queueErrors.length,
      errors: queueErrors,
      campaign,
      template: {
        id: configuredTemplate.id,
        name:
          configuredTemplate.name ||
          configuredTemplate.title ||
          null,
        intent: configuredTemplate.intent || null,
        kanban_status: targetKanbanStatus || null,
      },
      table,
    });
  } catch (error: any) {
    console.error(
      "CRM CAMPAIGNS POST:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Erro ao iniciar campanha.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const access = assertAccess(
      await requireCompanyAccess(req)
    );

    if (access.userRole === "SUPERVISOR") {
      return supervisorForbidden();
    }
    const body = await req.json();

    const action = String(
      body?.action || ""
    ).trim();

    if (
      !["pause", "resume"].includes(
        action
      )
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

    const currentStatus =
      action === "pause"
        ? "pending"
        : "paused";

    const nextStatus =
      action === "pause"
        ? "paused"
        : "pending";

    const { data, error } =
      await supabase
        .from("automation_queue")
        .update({
          status: nextStatus,
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "company_id",
          access.companyId
        )
        .eq(
          "owner_user_id",
          access.userId
        )
        .eq("status", currentStatus)
        .select("id");

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      updated: data?.length || 0,
    });
  } catch (error: any) {
    console.error(
      "CRM CAMPAIGNS PATCH:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Erro ao atualizar fila.",
      },
      {
        status: 500,
      }
    );
  }
}
