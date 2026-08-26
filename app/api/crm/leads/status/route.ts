import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/server-company";
import {
  KANBAN_STATUS_VALUES,
  normalizeKanbanStatus,
} from "@/lib/crm/kanban-status";

export const dynamic = "force-dynamic";

/*
 * Status oficiais do Kanban Comercial.
 *
 * IMPORTANTE:
 * Estes valores precisam permanecer alinhados com:
 *
 * app/crm/dashboard/page.tsx
 * app/api/whatsapp/incoming
 */
const ALLOWED_STATUSES = KANBAN_STATUS_VALUES;

/*
 * Compatibilidade com registros/status antigos.
 *
 * Assim não quebramos contatos que ainda possam ter
 * valores utilizados por versões anteriores do sistema.
 */


function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase não configurado.");
  }

  return createClient(url, key);
}

function clean(value: any) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

/*
 * Normaliza status vindos do frontend ou de versões antigas.
 */
function normalizeStatus(value: any) {
  return normalizeKanbanStatus(value);
}

function safeDate(value: any) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = getSupabase();

    const access = await requireCompanyAccess(req);

    const companyId = access.companyId;
    const userId = access.userId;
    const role = String(
      access.userRole || ""
    ).toUpperCase();

    /*
     * Supervisor continua sem permissão de movimentação,
     * preservando a regra atual.
     */
    if (role === "SUPERVISOR") {
      return NextResponse.json(
        {
          error: "Acesso negado.",
        },
        {
          status: 403,
        }
      );
    }

    if (!companyId || !userId) {
      return NextResponse.json(
        {
          error:
            "Empresa ou usuário não identificado.",
        },
        {
          status: 401,
        }
      );
    }

    const body = await req.json();

    const id = clean(
      body?.id ||
        body?.leadId ||
        body?.lead_id
    );

    const status = normalizeStatus(
      body?.status
    );

    if (!id) {
      return NextResponse.json(
        {
          error:
            "ID do contato é obrigatório.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Agora valida contra os mesmos status
     * utilizados pelo Kanban comercial.
     */
    if (
      !status ||
      !ALLOWED_STATUSES.includes(status)
    ) {
      return NextResponse.json(
        {
          error: "Status inválido.",
          received: status,
          allowed: ALLOWED_STATUSES,
        },
        {
          status: 400,
        }
      );
    }

    const now =
      new Date().toISOString();

    const update: any = {
      status,
      updated_at: now,
    };

    /*
     * Mantém os campos auxiliares usados por outras
     * partes do CRM.
     */
    if (
      body?.job_id !== undefined ||
      body?.jobId !== undefined
    ) {
      const jobId =
        clean(
          body.job_id ||
            body.jobId
        ) || null;

      update.job_id = jobId;
      update.current_job_id = jobId;
    }

    if (
      body?.current_job_id !== undefined ||
      body?.currentJobId !== undefined
    ) {
      update.current_job_id =
        clean(
          body.current_job_id ||
            body.currentJobId
        ) || null;
    }

    if (
      body?.batch_id !== undefined ||
      body?.batchId !== undefined
    ) {
      update.batch_id =
        clean(
          body.batch_id ||
            body.batchId
        ) || null;
    }

    if (
      body?.last_message !== undefined ||
      body?.lastMessage !== undefined
    ) {
      update.last_message =
        clean(
          body.last_message ||
            body.lastMessage
        ) || null;

      update.last_message_at = now;
    }

    if (
      body?.ai_paused !== undefined ||
      body?.aiPaused !== undefined
    ) {
      update.ai_paused = Boolean(
        body.ai_paused ??
          body.aiPaused
      );
    }

    if (body?.paused !== undefined) {
      update.paused = Boolean(
        body.paused
      );
    }

    /*
     * Status finais ou suspensos.
     *
     * Quando o contato chega nesses pontos,
     * automações/campanhas não devem continuar
     * enviando mensagens automaticamente.
     */
    if (
      [
        "pedido_fechado",
        "cliente_ativo",
        "cliente_inativo",
        "sem_interesse",
        "perdido",
      ].includes(status)
    ) {
      update.ai_paused = true;
      update.paused = true;
      update.campaign_status = null;
    }

    /*
     * Se voltar manualmente para uma etapa comercial ativa,
     * liberamos a pausa operacional.
     *
     * Isso evita um contato que estava "Sem interesse"
     * continuar travado depois de ser movido novamente
     * para negociação.
     */
    if (
      [
        "novo",
        "enviado",
        "respondeu",
        "primeiro_contato",
        "em_negociacao",
        "cotacao_enviada",
        "pos_venda",
      ].includes(status)
    ) {
      update.paused = false;
    }

    /*
     * Entrada em campanha.
     */
    if (status === "campanha") {
      update.campaign_step = 0;
      update.campaign_status = "pending";
      update.paused = false;
    }

    /*
     * "Retomar depois"
     *
     * O novo Kanban usa cliente_inativo,
     * substituindo o antigo reagendar_futuro.
     */
    if (status === "cliente_inativo") {
      update.reactivation_at =
        safeDate(
          body?.reactivationAt ||
            body?.reactivation_at
        );
    }

    let updateQuery = supabase
      .from("leads")
      .update(update)
      .eq("id", id)
      .eq("company_id", companyId);

    /*
     * Vendedor só altera contatos próprios.
     */
    if (role === "VENDEDOR") {
      updateQuery =
        updateQuery.eq(
          "owner_user_id",
          userId
        );
    }

    const {
      data: lead,
      error,
    } = await updateQuery
      .select("*")
      .maybeSingle();

    if (error) {
      throw new Error(
        error.message
      );
    }

    if (!lead) {
      return NextResponse.json(
        {
          error:
            "Contato não encontrado ou sem permissão.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      success: true,
      id,
      status,
      lead,
    });
  } catch (error: any) {
    console.error(
      "CRM LEADS STATUS PATCH:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Erro ao atualizar status.",
      },
      {
        status: 500,
      }
    );
  }
}

/*
 * Mantemos POST apontando para o mesmo comportamento
 * para compatibilidade com partes antigas do sistema.
 */
export async function POST(
  req: NextRequest
) {
  return PATCH(req);
}