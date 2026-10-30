import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import {
  prisma, requireJulia, handleApi, JuliaAccessError, MAX_CALLS
} from "@/lib/julia/campaign";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Proteção contra repetição infinita: a terceira tentativa é a última.
// Campanhas com 400 contatos podem reservar até 800 tentativas no total.
const MAX_ATTEMPTS_PER_CONTACT = 3;

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any> : {};
}
function scheduled(value: unknown) {
  return asObject(asObject(value)._julia);
}
function validFuture(value: unknown) {
  if (typeof value !== "string") throw new JuliaAccessError(400, "Selecione data e horário.");
  const d = new Date(value);
  if (Number.isNaN(d.getTime()) || d.getTime() < Date.now() + 15 * 60_000 ||
      d.getTime() > Date.now() + 30 * 86400_000)
    throw new JuliaAccessError(400, "Escolha um horário de 15 minutos a 30 dias no futuro.");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(d);
  const day = parts.find(p => p.type === "weekday")?.value;
  const hour = Number(parts.find(p => p.type === "hour")?.value || 0);
  if (day === "Sat" || day === "Sun" || hour < 9 || hour >= 18)
    throw new JuliaAccessError(400, "Agende em dia útil, das 9h às 18h de São Paulo.");
  return d;
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(req, async () => {
    const access = await requireJulia(req, true);
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    if (!["SCHEDULE", "CANCEL", "RETRY_BATCH"].includes(action))
      throw new JuliaAccessError(400, "Ação inválida.");
    const at = action === "CANCEL" ? null : validFuture(body.at);
    const contactId = typeof body.contactId === "string" ? body.contactId : "";

    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS ok FROM pg_advisory_xact_lock(hashtext(${access.companyId})::bigint)`;
      const campaign = await tx.juliaCampaign.findFirst({
        where: { id, company_id: access.companyId, user_id: access.userId }
      });
      if (!campaign) throw new JuliaAccessError(404, "Campanha não encontrada.");
      if (campaign.status === "ARCHIVED") {
        throw new JuliaAccessError(409, "Restaure a campanha arquivada antes de reagendar.");
      }

      const total = await tx.juliaContact.aggregate({
        where: { campaignId: id }, _sum: { attempts: true }
      });
      const remaining = Math.max(0, Math.min(MAX_CALLS, campaign.maxCalls) - (total._sum.attempts ?? 0));

      if (action === "RETRY_BATCH") {
        if (remaining === 0) throw new JuliaAccessError(
          409, "Campanha atingiu seu limite de tentativas. Crie uma campanha nova ou ajuste o limite antes de reagendar."
        );
        const candidates = await tx.juliaContact.findMany({
          where: { campaignId: id, status: "NO_ANSWER",
            outcome: { in: ["nao_atendeu", "ocupado", "caixa_postal"] },
            attempts: { lt: MAX_ATTEMPTS_PER_CONTACT } },
          take: 400, orderBy: { createdAt: "asc" },
        });
        const blocked = await tx.juliaContact.findMany({
          where: {
            phone: { in: candidates.map(c => c.phone) }, status: "DO_NOT_CALL",
            campaign: { company_id: access.companyId }
          }, select: { phone: true }
        });
        const noCall = new Set(blocked.map(c => c.phone));
        let count = 0;
        for (const c of candidates) {
          if (count >= remaining) break;
          if (noCall.has(c.phone)) continue;
          const existing = asObject(c.result);
          await tx.juliaContact.update({
            where: { id: c.id },
            data: {
              status: "PENDING",
              result: {
                ...existing,
                _julia: {
                  nextAt: at!.toISOString(), kind: "RETRY",
                  previousStatus: c.status, scheduledAt: new Date().toISOString(),
                }
              } as Prisma.InputJsonObject,
            }
          });
          count++;
        }
        if (count && campaign.status === "COMPLETED") {
          await tx.juliaCampaign.update({
            where: { id }, data: { status: "PAUSED", finishedAt: null }
          });
        }
        return { scheduled: count };
      }

      if (!contactId) throw new JuliaAccessError(400, "Contato obrigatório.");
      const contact = await tx.juliaContact.findFirst({ where: { id: contactId, campaignId: id } });
      if (!contact) throw new JuliaAccessError(404, "Contato não encontrado.");
      const previous = scheduled(contact.result);
      const currentResult = asObject(contact.result);
      if (action === "CANCEL") {
        if (contact.status !== "PENDING" || typeof previous.nextAt !== "string" ||
            contact.attempts === 0) throw new JuliaAccessError(409, "Sem reagendamento para cancelar.");
        const { _julia, ...original } = currentResult;
        const oldStatus = ["NO_ANSWER", "DONE", "REVIEW", "FAILED"].includes(previous.previousStatus)
          ? previous.previousStatus : "REVIEW";
        await tx.juliaContact.update({
          where: { id: contact.id },
          data: { status: oldStatus, result: original as Prisma.InputJsonObject }
        });
        return { canceled: true };
      }

      if (remaining < 1) throw new JuliaAccessError(409, "Limite de tentativas da campanha atingido.");
      if (contact.attempts < 1 || contact.attempts >= MAX_ATTEMPTS_PER_CONTACT ||
          !["NO_ANSWER", "DONE", "REVIEW", "FAILED", "PENDING"].includes(contact.status))
        throw new JuliaAccessError(409, "Contato não elegível para reagendamento.");
      if (contact.status === "PENDING" && !previous.nextAt)
        throw new JuliaAccessError(409, "Este contato já está pendente.");
      if (currentResult.nao_ligar_novamente === true || contact.status === "DO_NOT_CALL")
        throw new JuliaAccessError(403, "Contato bloqueou novas ligações.");
      const optOut = await tx.juliaContact.findFirst({
        where: { phone: contact.phone, status: "DO_NOT_CALL",
          campaign: { company_id: access.companyId } }, select: { id: true }
      });
      if (optOut) throw new JuliaAccessError(403, "Contato bloqueou novas ligações.");

      await tx.juliaContact.update({
        where: { id: contact.id },
        data: {
          status: "PENDING",
          result: {
            ...currentResult,
            _julia: {
              nextAt: at!.toISOString(),
              kind: contact.status === "NO_ANSWER" ? "RETRY" : "CALLBACK",
              previousStatus: contact.status === "PENDING" ? previous.previousStatus : contact.status,
              scheduledAt: new Date().toISOString(),
            }
          } as Prisma.InputJsonObject
        }
      });
      if (campaign.status === "COMPLETED") {
        await tx.juliaCampaign.update({ where: { id }, data: { status: "PAUSED", finishedAt: null } });
      }
      return { scheduled: 1 };
    });
    return NextResponse.json({ success: true, ...result });
  });
}
