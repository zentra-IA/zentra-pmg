
import { NextRequest, NextResponse } from "next/server";
import {
  prisma,
  requireJulia,
  canDial,
  checkPhone,
  inBusinessHours,
  vapiFetch,
  LIVE_STATUSES,
  DAILY_LIMIT,
  assertJuliaBudget,
  isJuliaTestMobile,
  handleApi,
  JuliaAccessError,
} from "@/lib/julia/campaign";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TEST_CAMPAIGN_NAME = "[TESTE JULIA] CELULAR AUTORIZADO";
const COMMERCIAL_PILOT_LIMIT = 5;

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleApi(req, async () => {
    // 1. Autenticação e verificações iniciais
    const access = await requireJulia(req, true);
    const { id } = await context.params;

    if (!canDial()) {
      throw new JuliaAccessError(
        503,
        "Chamadas bloqueadas. Confira a ativação e as credenciais da Júlia."
      );
    }

    if (!inBusinessHours()) {
      throw new JuliaAccessError(
        403,
        "Discagem permitida apenas de segunda a sexta, das 09h às 18h (São Paulo)."
      );
    }

    // 2. Reservar uma única chamada sob bloqueio transacional
    const reserved = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT 1 AS ok
        FROM pg_advisory_xact_lock(hashtext(${access.companyId})::bigint)
      `;

      const campaign = await tx.juliaCampaign.findFirst({
        where: {
          id,
          company_id: access.companyId,
          user_id: access.userId,
        },
      });

      if (!campaign || campaign.status !== "RUNNING") {
        throw new JuliaAccessError(
          409,
          "Campanha pausada ou indisponível."
        );
      }

      const production = process.env.NODE_ENV === "production";

      const testCampaign =
        production &&
        process.env.JULIA_PROD_TEST_ONLY === "true" &&
        campaign.name === TEST_CAMPAIGN_NAME &&
        campaign.maxCalls === 1;

      const commercialPilot =
        production &&
        process.env.JULIA_COMMERCIAL_PILOT === "true" &&
        campaign.name !== TEST_CAMPAIGN_NAME &&
        campaign.maxCalls >= 1 &&
        campaign.maxCalls <= COMMERCIAL_PILOT_LIMIT;

      // Produção só admite os dois modos explicitamente autorizados.
      if (production && !testCampaign && !commercialPilot) {
        throw new JuliaAccessError(
          403,
          "Produção autorizada somente para teste no celular ou piloto comercial de até 5 tentativas."
        );
      }

      // 3. Não permitir chamadas simultâneas na empresa
      const globalActive = await tx.juliaContact.count({
        where: {
          status: { in: LIVE_STATUSES },
          campaign: { company_id: access.companyId },
        },
      });

      if (globalActive > 0) {
        throw new JuliaAccessError(
          409,
          "Já existe uma chamada da Júlia em andamento. Atualize o resultado antes da próxima."
        );
      }

      // 4. Limite individual da campanha
      const total = await tx.juliaContact.count({
        where: {
          campaignId: id,
          attempts: { gt: 0 },
        },
      });

      if (total >= campaign.maxCalls) {
        throw new JuliaAccessError(
          409,
          "Limite de ligações desta campanha atingido."
        );
      }

      // 5. Limite geral de segurança por empresa
      const lastDay = new Date(Date.now() - 24 * 3600 * 1000);

      const daily = await tx.juliaContact.count({
        where: {
          campaign: { company_id: access.companyId },
          attempts: { gt: 0 },
          startedAt: { gte: lastDay },
        },
      });

      if (daily >= DAILY_LIMIT) {
        throw new JuliaAccessError(
          429,
          "Limite de segurança de 50 tentativas a cada 24 horas atingido."
        );
      }

      // 6. Piloto comercial: limite global de 5 tentativas
      // por empresa, independentemente da campanha.
      //
      // Sem janela temporal: o piloto não reinicia automaticamente
      // a cada dia, nem ao criar outra campanha.
      if (commercialPilot) {
        const commercialAttempts = await tx.juliaContact.count({
          where: {
            campaign: { company_id: access.companyId },
            phoneType: "FIXO",
            attempts: { gt: 0 },
          },
        });

        if (commercialAttempts >= COMMERCIAL_PILOT_LIMIT) {
          throw new JuliaAccessError(
            429,
            "Piloto comercial atingiu o limite global de 5 tentativas. É necessária uma nova autorização para ampliar."
          );
        }
      }

      // 7. Verificação de orçamento, dentro da mesma transação
      await assertJuliaBudget(tx, access.companyId);

      // 8. Buscar apenas contatos ainda pendentes
      const pending = await tx.juliaContact.findMany({
        where: {
          campaignId: id,
          status: "PENDING",
        },
        orderBy: { createdAt: "asc" },
        take: 80,
      });

      for (const c of pending) {
        const authorizedTestMobile =
          testCampaign &&
          isJuliaTestMobile(
            c.phone,
            campaign.name,
            campaign.maxCalls
          );

        const eligibleCommercialPhone =
          commercialPilot &&
          c.phoneType === "FIXO" &&
          checkPhone(c.phone);

        // 9. Bloqueio adicional na produção:
        // somente o celular de teste ou fixos do piloto.
        if (
          production &&
          !authorizedTestMobile &&
          !eligibleCommercialPhone
        ) {
          await tx.juliaContact.update({
            where: { id: c.id },
            data: {
              status: "REVIEW",
              outcome: "bloqueado_piloto_producao",
            },
          });
          continue;
        }

        // 10. Validação de telefone também no ambiente local
        if (
          !checkPhone(c.phone) &&
          !isJuliaTestMobile(
            c.phone,
            campaign.name,
            campaign.maxCalls
          )
        ) {
          await tx.juliaContact.update({
            where: { id: c.id },
            data: {
              status: "REVIEW",
              outcome: "numero_nao_fixo",
            },
          });
          continue;
        }

        // 11. Respeitar bloqueios de não contato
        const optout = await tx.juliaContact.findFirst({
          where: {
            phone: c.phone,
            status: "DO_NOT_CALL",
            campaign: { company_id: access.companyId },
          },
          select: { id: true },
        });

        if (optout) {
          await tx.juliaContact.update({
            where: { id: c.id },
            data: {
              status: "DO_NOT_CALL",
              outcome: "bloqueado_previamente",
            },
          });
          continue;
        }

        // 12. Evitar repetir ligações para clientes em 30 dias
        const recent = await tx.juliaContact.findFirst({
          where: {
            phone: c.phone,
            attempts: { gt: 0 },
            id: { not: c.id },
            startedAt: {
              gte: new Date(Date.now() - 30 * 24 * 3600 * 1000),
            },
            campaign: { company_id: access.companyId },
          },
          select: { id: true },
        });

        // Exceção exclusiva para o celular autorizado.
        // Para clientes comerciais, o bloqueio permanece obrigatório.
        if (!authorizedTestMobile && recent) {
          await tx.juliaContact.update({
            where: { id: c.id },
            data: {
              status: "REVIEW",
              outcome: "contato_recente_30_dias",
            },
          });
          continue;
        }

        // 13. Reservar contato e consumir uma tentativa
        const now = new Date();

        await tx.juliaContact.update({
          where: { id: c.id },
          data: {
            status: "RESERVED",
            attempts: { increment: 1 },
            startedAt: now,
          },
        });

        return {
          id: c.id,
          name: c.name,
          phone: c.phone,
        };
      }

      return null;
    });

    if (!reserved) {
      return NextResponse.json({
        success: true,
        dispatched: false,
        message: "Não há contatos elegíveis pendentes para chamar.",
      });
    }

    // 14. Envio da ligação à Vapi
    //
    // O telefone já foi normalizado para DDD + número.
    // O código internacional +55 é acrescentado apenas aqui.
    let confirmedCallId: string | null = null;

    try {
      const result = await vapiFetch("/call/phone", "POST", {
        assistantId: process.env.JULIA_VAPI_ASSISTANT_ID,
        assistantOverrides: {
          maxDurationSeconds: 150,
        },
        phoneNumberId: process.env.JULIA_VAPI_PHONE_NUMBER_ID,
        customer: {
          number: "+55" + reserved.phone.replace(/\D/g, ""),
          numberE164CheckEnabled: true,
        },
        metadata: {
          juliaCampaignId: id,
          juliaContactId: reserved.id,
        },
      });

      if (typeof result.id !== "string" || !result.id) {
        throw new Error(
          "A Vapi não retornou um identificador de chamada."
        );
      }

      confirmedCallId = result.id;

      await prisma.juliaContact.update({
        where: { id: reserved.id },
        data: {
          status: "QUEUED",
          vapiCallId: result.id,
          vapiStatus: String(result.status || "queued"),
        },
      });

      return NextResponse.json({
        success: true,
        dispatched: true,
        contact: {
          id: reserved.id,
          name: reserved.name,
          phone: reserved.phone,
        },
        callId: result.id,
      });

    } catch (error) {
      // A Vapi pode ter iniciado a chamada mesmo se a resposta falhar.
      // Não liberar uma segunda tentativa em estado incerto.
      console.error("[JULIA_DISPATCH_ERROR]", error);

      try {
        if (confirmedCallId) {
          await prisma.juliaContact.update({
            where: { id: reserved.id },
            data: {
              status: "QUEUED",
              vapiCallId: confirmedCallId,
              vapiStatus: "confirmation-pending",
              lastError:
                "Vapi confirmou ID, mas houve falha ao persistir ou responder. Sincronize antes de nova chamada.",
            },
          });
        } else {
          await prisma.juliaContact.updateMany({
            where: {
              id: reserved.id,
              status: "RESERVED",
            },
            data: {
              outcome: "confirmacao_vapi_pendente",
              lastError:
                "Resultado incerto. Verifique o painel da Vapi. Reserva bloqueia novas ligações.",
            },
          });
        }
      } catch (persistError) {
        console.error(
          "[JULIA_DISPATCH_PERSIST_ERROR]",
          persistError
        );
      }

      return NextResponse.json(
        {
          success: false,
          error:
            "Resultado da Vapi incerto. Novas chamadas permanecem bloqueadas até reconciliação.",
        },
        { status: 502 }
      );
    }
  });
}
