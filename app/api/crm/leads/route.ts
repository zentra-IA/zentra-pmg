import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

const LEGACY_TO_NEW: Record<string, string> = {
  respondido: "respondeu",
  interesse: "quer_agendar_entrevista",
  pedido: "entrevista_agendada",
  reativar_futuro: "reagendar_futuro",
  finalizado: "contratado",
};

const ALLOWED_STATUSES = [
  "novo",
  "enviado",
  "respondeu",
  "quer_agendar_entrevista",
  "entrevista_agendada",
  "campanha",
  "reagendar_futuro",
  "contratado",
  "sem_interesse",
  "nao_aprovado",
  "selecionado_vaga",
];

type AccessRole = "GERAL" | "SUPERVISOR" | "VENDEDOR";

type LeadsAccess = {
  companyId: string;
  branchId: string | null;
  userId: string;
  role: AccessRole;
  isGeneral: boolean;
  isSupervisor: boolean;
  isSeller: boolean;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase não configurado.");
  }

  return createClient(url, key);
}

function clean(value: any) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function onlyDigits(value: any) {
  return clean(value).replace(/\D/g, "");
}

function normalizePhone(value: any) {
  const digits = onlyDigits(value);

  if (!digits) return null;
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length > 11 && !digits.startsWith("55")) return `55${digits}`;

  return digits;
}

function normalizeStatus(value: any) {
  const status = clean(value || "novo");
  const normalized = LEGACY_TO_NEW[status] || status;
  return ALLOWED_STATUSES.includes(normalized) ? normalized : "novo";
}

function normalizeRole(value: any): AccessRole {
  const role = clean(value).toUpperCase();

  if (role === "VENDEDOR") return "VENDEDOR";
  if (role === "SUPERVISOR") return "SUPERVISOR";

  return "GERAL";
}

function normalizeLead(lead: any) {
  return {
    ...lead,
    status: normalizeStatus(lead.status),
  };
}

async function requireLeadsAccess(req: NextRequest): Promise<LeadsAccess> {
 const access: any = await requireCompanyAccess(req);

  const companyId = clean(access?.companyId);
  const branchId = clean(access?.branchId) || null;
  const userId = clean(access?.userId);

  const role = normalizeRole(
    access?.userRole ||
      access?.role ||
      access?.companyRole ||
      access?.membershipRole
  );

  if (!companyId) {
    throw new Error("Empresa não identificada.");
  }

  if (!userId) {
    throw new Error("Usuário autenticado não identificado.");
  }

  return {
    companyId,
    branchId,
    userId,
    role,
    isGeneral: role === "GERAL",
    isSupervisor: role === "SUPERVISOR",
    isSeller: role === "VENDEDOR",
  };
}

function supervisorForbidden() {
  return NextResponse.json(
    {
      success: false,
      error:
        "O perfil SUPERVISOR possui acesso somente ao Centro de Comando.",
    },
    { status: 403 }
  );
}

async function loadJobsAndBatches(
  supabase: any,
  companyId: string,
  leads: any[]
) {
  const jobIds = [
    ...new Set(
      leads
        .map((lead) => lead.job_id || lead.current_job_id)
        .filter(Boolean)
        .map(String)
    ),
  ];

  const batchIds = [
    ...new Set(
      leads
        .map((lead) => lead.batch_id)
        .filter(Boolean)
        .map(String)
    ),
  ];

  let jobs: any[] = [];
  let batches: any[] = [];

  if (jobIds.length) {
    const { data } = await supabase
      .from("Job")
      .select("id,title,company_id")
      .eq("company_id", companyId)
      .in("id", jobIds);

    jobs = data || [];
  }

  if (batchIds.length) {
    const { data } = await supabase
      .from("recruitment_batches")
      .select("id,name,job_id,company_id")
      .eq("company_id", companyId)
      .in("id", batchIds);

    batches = data || [];
  }

  const jobMap = new Map(
    jobs.map((job: any) => [String(job.id), job])
  );

  const batchMap = new Map(
    batches.map((batch: any) => [String(batch.id), batch])
  );

  return leads.map((lead) => {
    const jobId = lead.job_id || lead.current_job_id;
    const batch = lead.batch_id
      ? batchMap.get(String(lead.batch_id)) || null
      : null;
    const job = jobId
      ? jobMap.get(String(jobId)) || null
      : null;

    return {
      ...lead,
      job,
      batch,
      job_title: job?.title || lead.job_title || null,
      batch_name: batch?.name || null,
    };
  });
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const access = await requireLeadsAccess(req);

    if (access.isSupervisor) {
      return supervisorForbidden();
    }

    const { searchParams } = new URL(req.url);

    const q = clean(searchParams.get("q"));
    const statusParam = clean(searchParams.get("status"));
    const batchId = clean(
      searchParams.get("batchId") ||
        searchParams.get("batch_id")
    );
    const jobId = clean(
      searchParams.get("jobId") ||
        searchParams.get("job_id")
    );

    const requestedLimit = Number(
      searchParams.get("limit") || 500
    );

    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 1000)
      : 500;

    let query = supabase
      .from("leads")
      .select("*")
      .eq("company_id", access.companyId)
      .or("opt_out.is.null,opt_out.eq.false")
      .order("last_message_at", {
        ascending: false,
        nullsFirst: false,
      })
      .order("updated_at", {
        ascending: false,
        nullsFirst: false,
      })
      .order("created_at", {
        ascending: false,
        nullsFirst: false,
      })
      .limit(limit);

    /*
     * Segurança principal:
     * vendedor só recebe leads cujo dono seja o próprio usuário.
     * GERAL continua vendo toda a empresa.
     */
    if (access.isSeller) {
      query = query.eq("owner_user_id", access.userId);
    }

    if (statusParam && statusParam !== "todos") {
      query = query.eq(
        "status",
        normalizeStatus(statusParam)
      );
    }

    if (batchId) {
      query = query.eq("batch_id", batchId);
    }

    if (jobId) {
      query = query.or(
        `job_id.eq.${jobId},current_job_id.eq.${jobId}`
      );
    }

    if (q) {
      query = query.or(
        `name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%,last_message.ilike.%${q}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    /*
     * Leads criados apenas por @lid e sem telefone/e-mail não devem
     * aparecer como cards operacionais.
     */
    const safeRows = (data || []).filter((lead: any) => {
      const hasPhone = Boolean(clean(lead.phone));
      const hasEmail = Boolean(clean(lead.email));
      return hasPhone || hasEmail;
    });

    const leads = await loadJobsAndBatches(
      supabase,
      access.companyId,
      safeRows.map(normalizeLead)
    );

    return NextResponse.json({
      success: true,
      leads,
    });
  } catch (error: any) {
    console.error("CRM LEADS GET:", error);

    const message =
      error?.message || "Erro ao buscar contatos";

    return NextResponse.json(
      { error: message },
      {
        status: message.includes("não identificad")
          ? 401
          : 500,
      }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const access = await requireLeadsAccess(req);

    if (access.isSupervisor) {
      return supervisorForbidden();
    }

    const body = await req.json();

    const phone = normalizePhone(
      body.phone ||
        body.whatsapp ||
        body.telefone
    );

    if (!phone) {
      return NextResponse.json(
        {
          error: "Telefone/WhatsApp é obrigatório",
        },
        { status: 400 }
      );
    }

    const hasExplicitStatus =
      body.status !== undefined &&
      body.status !== null &&
      clean(body.status) !== "";

    const status = hasExplicitStatus
      ? normalizeStatus(body.status)
      : "novo";

    const jobId =
      clean(
        body.job_id ||
          body.jobId ||
          body.current_job_id ||
          body.currentJobId
      ) || null;

    const batchId =
      clean(body.batch_id || body.batchId) || null;

    /*
     * VENDEDOR sempre cria o lead para si.
     * GERAL pode informar owner_user_id ou deixar sem responsável.
     */
    const requestedOwnerId = clean(
      body.owner_user_id ||
        body.ownerUserId ||
        body.seller_id ||
        body.sellerId
    );

    const ownerUserId = access.isSeller
      ? access.userId
      : requestedOwnerId || null;

    const payload: any = {
      company_id: access.companyId,
      branch_id:
        access.branchId ||
        body.branch_id ||
        null,
      owner_user_id: ownerUserId,
      name:
        clean(body.name || body.nome) ||
        "Candidato",
      phone,
      email: clean(body.email) || null,
      status,
      job_id: jobId,
      current_job_id: jobId,
      batch_id: batchId,
      conversation_stage:
        clean(body.conversation_stage) || "new",
      ai_paused: Boolean(body.ai_paused || false),
      paused: Boolean(body.paused || false),
      opt_out: Boolean(body.opt_out || false),
      updated_at: new Date().toISOString(),
    };

    const { data: existing, error: findError } =
      await supabase
        .from("leads")
        .select("*")
        .eq("company_id", access.companyId)
        .eq("phone", phone)
        .maybeSingle();

    if (findError) {
      throw new Error(findError.message);
    }

    let lead: any;

    if (existing?.id) {
      /*
       * Um vendedor não pode assumir ou alterar lead de outro vendedor.
       */
      if (
        access.isSeller &&
        clean(existing.owner_user_id) !== access.userId
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Este contato já pertence a outro vendedor.",
          },
          { status: 409 }
        );
      }

      const updatePayload: any = {
        name: payload.name || existing.name,
        email:
          payload.email ||
          existing.email ||
          null,
        updated_at: payload.updated_at,
      };

      if (
        !existing.owner_user_id &&
        ownerUserId
      ) {
        updatePayload.owner_user_id =
          ownerUserId;
      }

      if (hasExplicitStatus) {
        updatePayload.status = payload.status;
      }

      if (jobId) {
        updatePayload.job_id = jobId;
        updatePayload.current_job_id = jobId;
      }

      if (batchId) {
        updatePayload.batch_id = batchId;
      }

      const updateQuery = supabase
        .from("leads")
        .update(updatePayload)
        .eq("id", existing.id)
        .eq("company_id", access.companyId);

      if (access.isSeller) {
        updateQuery.eq(
          "owner_user_id",
          access.userId
        );
      }

      const { data, error } =
        await updateQuery
          .select("*")
          .single();

      if (error) {
        throw new Error(error.message);
      }

      lead = data;
    } else {
      const { data, error } = await supabase
        .from("leads")
        .insert({
          ...payload,
          created_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (error) {
        throw new Error(error.message);
      }

      lead = data;
    }

    return NextResponse.json({
      success: true,
      lead: normalizeLead(lead),
    });
  } catch (error: any) {
    console.error("CRM LEADS POST:", error);

    const message =
      error?.message || "Erro ao salvar contato";

    return NextResponse.json(
      { error: message },
      {
        status: message.includes("não identificad")
          ? 401
          : 500,
      }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const access = await requireLeadsAccess(req);

    if (access.isSupervisor) {
      return supervisorForbidden();
    }

    const body = await req.json();
    const id = clean(body.id);

    if (!id) {
      return NextResponse.json(
        { error: "ID obrigatório" },
        { status: 400 }
      );
    }

    const data: any = {
      updated_at: new Date().toISOString(),
    };

    if (
      body.name !== undefined ||
      body.nome !== undefined
    ) {
      data.name =
        clean(body.name || body.nome) || null;
    }

    if (body.email !== undefined) {
      data.email = clean(body.email) || null;
    }

    if (
      body.phone !== undefined ||
      body.telefone !== undefined
    ) {
      data.phone = normalizePhone(
        body.phone || body.telefone
      );
    }

    if (body.status !== undefined) {
      data.status = normalizeStatus(body.status);
    }

    if (body.ai_paused !== undefined) {
      data.ai_paused = Boolean(body.ai_paused);
    }

    if (body.paused !== undefined) {
      data.paused = Boolean(body.paused);
    }

    if (
      body.job_id !== undefined ||
      body.jobId !== undefined
    ) {
      data.job_id =
        clean(body.job_id || body.jobId) || null;
      data.current_job_id = data.job_id;
    }

    if (
      body.batch_id !== undefined ||
      body.batchId !== undefined
    ) {
      data.batch_id =
        clean(body.batch_id || body.batchId) ||
        null;
    }

    /*
     * Somente o GERAL pode transferir a propriedade de um lead.
     */
    if (
      access.isGeneral &&
      (
        body.owner_user_id !== undefined ||
        body.ownerUserId !== undefined ||
        body.seller_id !== undefined ||
        body.sellerId !== undefined
      )
    ) {
      data.owner_user_id =
        clean(
          body.owner_user_id ||
            body.ownerUserId ||
            body.seller_id ||
            body.sellerId
        ) || null;
    }

    let query = supabase
      .from("leads")
      .update(data)
      .eq("id", id)
      .eq("company_id", access.companyId);

    if (access.isSeller) {
      query = query.eq(
        "owner_user_id",
        access.userId
      );
    }

    const { data: lead, error } =
      await query
        .select("*")
        .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!lead) {
      return NextResponse.json(
        {
          error:
            "Contato não encontrado ou sem permissão.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      lead: normalizeLead(lead),
    });
  } catch (error: any) {
    console.error("CRM LEADS PATCH:", error);

    const message =
      error?.message || "Erro ao atualizar contato";

    return NextResponse.json(
      { error: message },
      {
        status: message.includes("não identificad")
          ? 401
          : 500,
      }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const access = await requireLeadsAccess(req);

    if (access.isSupervisor) {
      return supervisorForbidden();
    }

    const { searchParams } = new URL(req.url);

    let ids = searchParams
      .getAll("id")
      .filter(Boolean);

    if (!ids.length) {
      const body = await req
        .json()
        .catch(() => ({}));

      ids = Array.isArray(body.ids)
        ? body.ids.map(String).filter(Boolean)
        : [];

      if (body.id) {
        ids.push(String(body.id));
      }
    }

    ids = [...new Set(ids)];

    if (!ids.length) {
      return NextResponse.json(
        {
          error:
            "Informe pelo menos um contato.",
        },
        { status: 400 }
      );
    }

    /*
     * Antes de apagar, descobre exatamente quais IDs o usuário pode acessar.
     */
    let allowedQuery = supabase
      .from("leads")
      .select("id")
      .eq("company_id", access.companyId)
      .in("id", ids);

    if (access.isSeller) {
      allowedQuery = allowedQuery.eq(
        "owner_user_id",
        access.userId
      );
    }

    const {
      data: allowedRows,
      error: allowedError,
    } = await allowedQuery;

    if (allowedError) {
      throw new Error(allowedError.message);
    }

    const allowedIds = (allowedRows || []).map(
      (item: any) => String(item.id)
    );

    if (!allowedIds.length) {
      return NextResponse.json(
        {
          error:
            "Nenhum contato encontrado ou permitido para exclusão.",
        },
        { status: 404 }
      );
    }

    const { error: queueError } = await supabase
      .from("automation_queue")
      .delete()
      .eq("company_id", access.companyId)
      .in("lead_id", allowedIds)
      .in("status", ["pending", "failed"]);

    if (queueError) {
      throw new Error(queueError.message);
    }

    let deleteQuery = supabase
      .from("leads")
      .delete()
      .eq("company_id", access.companyId)
      .in("id", allowedIds);

    if (access.isSeller) {
      deleteQuery = deleteQuery.eq(
        "owner_user_id",
        access.userId
      );
    }

    const { error } = await deleteQuery;

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      deleted: allowedIds.length,
    });
  } catch (error: any) {
    console.error("CRM LEADS DELETE:", error);

    const message =
      error?.message || "Erro ao excluir contato";

    return NextResponse.json(
      { error: message },
      {
        status: message.includes("não identificad")
          ? 401
          : 500,
      }
    );
  }
}
