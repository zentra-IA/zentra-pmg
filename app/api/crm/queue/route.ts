import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompany } from "@/lib/server-company";

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

function normalizeIntent(value: unknown) {
  const intent = String(value || "").trim();

  return intent || "PROMOCAO_DIARIA";
}

function normalizeMessage(value: unknown) {
  const message = String(value || "").trim();

  return message || null;
}

async function requireQueueAccess(
  req: NextRequest
): Promise<AccessContext> {
  const access = await requireCompany(req);

  const companyId = String(access?.companyId || "").trim();
  const userId = String(access?.userId || "").trim();
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
  };
}

async function countQueue(
  supabase: ReturnType<typeof getSupabase>,
  companyId: string,
  userId: string,
  status: string
) {
  const { count, error } = await supabase
    .from("automation_queue")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("company_id", companyId)
    .eq("owner_user_id", userId)
    .eq("status", status);

  if (error) {
    throw new Error(error.message);
  }

  return count || 0;
}

async function getSessionStats(
  supabase: ReturnType<typeof getSupabase>,
  companyId: string,
  userId: string,
  sessionId: number
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [sentResult, queuedResult] = await Promise.all([
    supabase
      .from("automation_queue")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("company_id", companyId)
      .eq("owner_user_id", userId)
      .eq("session_id", sessionId)
      .eq("status", "sent")
      .gte("sent_at", today.toISOString()),

    supabase
      .from("automation_queue")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("company_id", companyId)
      .eq("owner_user_id", userId)
      .eq("session_id", sessionId)
      .in("status", ["pending", "processing"]),
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

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const access = await requireQueueAccess(req);

    const [
      pending,
      processing,
      sent,
      failed,
      paused,
      sessionEntries,
    ] = await Promise.all([
      countQueue(
        supabase,
        access.companyId,
        access.userId,
        "pending"
      ),
      countQueue(
        supabase,
        access.companyId,
        access.userId,
        "processing"
      ),
      countQueue(
        supabase,
        access.companyId,
        access.userId,
        "sent"
      ),
      countQueue(
        supabase,
        access.companyId,
        access.userId,
        "failed"
      ),
      countQueue(
        supabase,
        access.companyId,
        access.userId,
        "paused"
      ),
      Promise.all(
        SESSIONS.map(async (sessionId) => [
          sessionId,
          await getSessionStats(
            supabase,
            access.companyId,
            access.userId,
            sessionId
          ),
        ])
      ),
    ]);

    const stats = Object.fromEntries(sessionEntries);

    return NextResponse.json({
      success: true,
      pending,
      processing,
      sent,
      failed,
      paused,
      stats,
      owner_user_id: access.userId,
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
    const body = await req.json().catch(() => ({}));

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

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select(
        "id, company_id, branch_id, phone, session_id, status, name"
      )
      .eq("id", leadId)
      .eq("company_id", access.companyId)
      .maybeSingle();

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

    const intent = normalizeIntent(
      body?.intent || body?.type
    );

    const message = normalizeMessage(body?.message);

    const now = new Date().toISOString();

    const { data: queueItem, error: queueError } =
      await supabase
        .from("automation_queue")
        .insert({
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
          owner_user_id: access.userId,

          lead_id: lead.id,
          phone,
          session_id: sessionId,
          type: intent,
          status: "pending",
          scheduled_at: now,
          created_at: now,
          attempts: 0,
          message,
          error: null,
          last_error: null,
          next_attempt_at: null,
        })
        .select("*")
        .single();

    if (queueError) {
      throw new Error(queueError.message);
    }

    /*
     * Atualização auxiliar do Kanban.
     * Não deve desfazer a fila se algum campo legado não existir.
     */
    const leadUpdate: Record<string, unknown> = {
      status: "campanha",
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

    const { error: updateLeadError } = await supabase
      .from("leads")
      .update(leadUpdate)
      .eq("id", lead.id)
      .eq("company_id", access.companyId);

    if (updateLeadError) {
      console.error(
        "CRM_QUEUE_LEAD_UPDATE_WARNING",
        updateLeadError
      );
    }

    return NextResponse.json({
      success: true,
      item: queueItem,
      owner_user_id: access.userId,
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
      .eq("owner_user_id", access.userId)
      .eq("status", sourceStatus);

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
      owner_user_id: access.userId,
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
