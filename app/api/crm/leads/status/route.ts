import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/server-company";
import {
  KANBAN_STATUS_VALUES,
  normalizeKanbanStatus,
} from "@/lib/crm/kanban-status";

export const dynamic = "force-dynamic";

export const runtime = "nodejs";

const WHATSAPP_SERVER =
  process.env.NEXT_PUBLIC_WHATSAPP_SERVER ||
  process.env.WHATSAPP_SERVER ||
  "";

const RESOLVE_LID_SECRET =
  process.env.RESOLVE_LID_SECRET || "";

const DEFAULT_SESSION = Number(
  process.env.CRM_DEFAULT_WHATSAPP_SESSION ||
    1
);

function onlyDigits(value: any) {
  return clean(value).replace(/\D/g, "");
}

function normalizePhone(value: any) {
  let digits = onlyDigits(value);

  if (!digits) return "";

  if (!digits.startsWith("55")) {
    digits = `55${digits}`;
  }

  return digits;
}

function brazilPhoneVariants(value: any) {
  const normalized = normalizePhone(value);

  if (!normalized) return [];

  const variants = new Set<string>([
    normalized,
  ]);

  if (!normalized.startsWith("55")) {
    return [...variants];
  }

  const local = normalized.slice(2);

  /*
   * DDD + celular antigo (10 dígitos no Brasil):
   * 12 9888-7777 -> 12 99888-7777
   */
  if (
    local.length === 10 &&
    /^[1-9]{2}[6-9]/.test(local)
  ) {
    variants.add(
      `55${local.slice(0, 2)}9${local.slice(2)}`
    );
  }

  /*
   * DDD + celular com nono dígito:
   * também testamos a identidade antiga porque alguns
   * cadastros históricos ainda podem estar assim.
   */
  if (
    local.length === 11 &&
    local[2] === "9"
  ) {
    variants.add(
      `55${local.slice(0, 2)}${local.slice(3)}`
    );
  }

  return [...variants];
}

function normalizeSessionNumber(value: any) {
  const n = Number(
    value || DEFAULT_SESSION || 1
  );

  if (
    !Number.isInteger(n) ||
    n < 1 ||
    n > 5
  ) {
    return 1;
  }

  return n;
}

function buildWhatsappSessionKey({
  companyId,
  userId,
  sessionId,
}: {
  companyId: string;
  userId: string;
  sessionId: number;
}) {
  return `${companyId}_${userId}_${sessionId}`;
}

async function getWhatsappSessionStatus(
  fullSessionId: string
) {
  if (!WHATSAPP_SERVER) {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    3500
  );

  try {
    const response = await fetch(
      `${WHATSAPP_SERVER}/status/${encodeURIComponent(
        fullSessionId
      )}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      return false;
    }

    const data =
      await response
        .json()
        .catch(() => ({}));

    const status = clean(
      data?.status
    ).toLowerCase();

    return (
      data?.connected === true ||
      status === "online" ||
      status === "connected" ||
      status === "conectado"
    );
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveLeadWhatsappLid({
  companyId,
  userId,
  lead,
}: {
  companyId: string;
  userId: string;
  lead: any;
}) {
  if (
    !WHATSAPP_SERVER ||
    !RESOLVE_LID_SECRET
  ) {
    return {
      resolved: false,
      reason:
        "resolver_not_configured",
    };
  }

  if (clean(lead?.whatsapp_lid)) {
    return {
      resolved: true,
      lid: clean(
        lead.whatsapp_lid
      ),
      sessionId:
        normalizeSessionNumber(
          lead?.session_id
        ),
      reason: "already_linked",
    };
  }

  const phones =
    brazilPhoneVariants(
      lead?.phone ||
        lead?.mobile ||
        lead?.telefone
    );

  if (!phones.length) {
    return {
      resolved: false,
      reason: "phone_missing",
    };
  }

  /*
   * Se o lead já tem uma sessão registrada, ela vem primeiro.
   * Caso contrário tentamos a sessão padrão e depois as demais.
   *
   * Todas as chaves ficam presas à empresa + usuário dono do lead.
   * Nunca consultamos sessões de outro vendedor.
   */
  const preferredSession =
    normalizeSessionNumber(
      lead?.session_id
    );

  const candidateNumbers = [
    preferredSession,
    ...[1, 2, 3, 4, 5].filter(
      (n) => n !== preferredSession
    ),
  ];

  const candidates =
    candidateNumbers.map(
      (sessionId) => ({
        sessionId,
        fullSessionId:
          buildWhatsappSessionKey({
            companyId,
            userId,
            sessionId,
          }),
      })
    );

  /*
   * Descobre quais sessões desse vendedor estão realmente online.
   * Isso evita chamar /resolve-lid em sessão inexistente/offline.
   */
  const statusResults =
    await Promise.all(
      candidates.map(
        async (candidate) => ({
          ...candidate,
          online:
            await getWhatsappSessionStatus(
              candidate.fullSessionId
            ),
        })
      )
    );

  const onlineCandidates =
    statusResults.filter(
      (candidate) =>
        candidate.online
    );

  if (!onlineCandidates.length) {
    return {
      resolved: false,
      reason:
        "no_online_session",
    };
  }

  for (
    const candidate of onlineCandidates
  ) {
    for (const phone of phones) {
      const controller =
        new AbortController();

      const timeout = setTimeout(
        () => controller.abort(),
        6000
      );

      try {
        const response = await fetch(
          `${WHATSAPP_SERVER}/resolve-lid`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Accept:
                "application/json",
              Authorization:
                `Bearer ${RESOLVE_LID_SECRET}`,
            },
            body: JSON.stringify({
              sessionId:
                candidate.fullSessionId,
              phone,
            }),
            cache: "no-store",
            signal:
              controller.signal,
          }
        );

        const data =
          await response
            .json()
            .catch(() => ({}));

        if (
          response.ok &&
          data?.success === true &&
          data?.exists === true &&
          clean(data?.lid)
        ) {
          return {
            resolved: true,
            lid: clean(data.lid),
            phone,
            sessionId:
              candidate.sessionId,
            fullSessionId:
              candidate.fullSessionId,
            reason:
              "resolved",
          };
        }
      } catch (error: any) {
        console.warn(
          "[KANBAN_LID] Falha ao consultar identidade:",
          {
            leadId:
              lead?.id || null,
            sessionId:
              candidate.fullSessionId,
            error:
              error?.name ===
              "AbortError"
                ? "timeout"
                : error?.message ||
                  "fetch_failed",
          }
        );
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  return {
    resolved: false,
    reason: "lid_not_found",
  };
}

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

    let finalLead = lead;
    let lidResolution: any = null;

    /*
     * FLUXO MANUAL:
     *
     * Quando o vendedor move o card manualmente para "Mensagem enviada",
     * vinculamos preventivamente telefone -> LID.
     *
     * Assim, se a resposta chegar depois somente como @lid, o incoming
     * consegue localizar ESTE MESMO card e movê-lo para "Cliente respondeu",
     * sem depender de campanha/fila e sem criar duplicado.
     *
     * A resolução é best-effort: se a VPS estiver indisponível, o status
     * continua salvo normalmente.
     */
    if (status === "enviado") {
      const identityUserId =
        clean(
          lead?.owner_user_id
        ) || userId;

      try {
        lidResolution =
          await resolveLeadWhatsappLid({
            companyId,
            userId:
              identityUserId,
            lead,
          });

        if (
          lidResolution?.resolved &&
          lidResolution?.lid &&
          clean(
            lead?.whatsapp_lid
          ) !==
            clean(
              lidResolution.lid
            )
        ) {
          const identityUpdate: any = {
            whatsapp_lid:
              lidResolution.lid,
            updated_at:
              new Date().toISOString(),
          };

          if (
            lidResolution?.sessionId
          ) {
            identityUpdate.session_id =
              lidResolution.sessionId;
          }

          let identityQuery =
            supabase
              .from("leads")
              .update(
                identityUpdate
              )
              .eq("id", id)
              .eq(
                "company_id",
                companyId
              );

          if (role === "VENDEDOR") {
            identityQuery =
              identityQuery.eq(
                "owner_user_id",
                userId
              );
          }

          const {
            data:
              identityLead,
            error:
              identityError,
          } =
            await identityQuery
              .select("*")
              .maybeSingle();

          if (identityError) {
            console.warn(
              "[KANBAN_LID] Status moveu, mas não foi possível salvar o LID:",
              {
                leadId: id,
                error:
                  identityError.message,
              }
            );
          } else if (
            identityLead
          ) {
            finalLead =
              identityLead;

            console.log(
              "[KANBAN_LID] Lead manual vinculado ao WhatsApp:",
              {
                leadId: id,
                ownerUserId:
                  identityUserId,
                sessionId:
                  lidResolution.sessionId,
                hasLid: true,
              }
            );
          }
        }
      } catch (lidError: any) {
        lidResolution = {
          resolved: false,
          reason:
            "unexpected_error",
        };

        console.warn(
          "[KANBAN_LID] Status moveu, mas a resolução de LID falhou:",
          {
            leadId: id,
            error:
              lidError?.message ||
              "erro desconhecido",
          }
        );
      }
    }

    return NextResponse.json({
      success: true,
      id,
      status,
      lead: finalLead,
      lid_resolution:
        lidResolution
          ? {
              resolved:
                Boolean(
                  lidResolution.resolved
                ),
              reason:
                lidResolution.reason ||
                null,
              session_id:
                lidResolution.sessionId ||
                null,
            }
          : null,
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