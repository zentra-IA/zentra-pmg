import { NextRequest, NextResponse } from "next/server";
import { prisma, requireJulia, handleApi } from "@/lib/julia/campaign";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Filter =
  | "todos" | "retornos" | "agendados" | "interessados" | "atenderam"
  | "ausentes" | "nao_atenderam" | "ocupados" | "caixa_postal"
  | "desligaram" | "falhas" | "revisar" | "pendentes" | "bloqueados";

const activeStatuses = ["PENDING", "RESERVED", "QUEUED", "RINGING", "IN_PROGRESS", "FINISHING"];
const RESULT_FILTERS: Filter[] = [
  "todos", "retornos", "agendados", "interessados", "atenderam",
  "ausentes", "nao_atenderam", "ocupados", "caixa_postal",
  "desligaram", "falhas", "revisar", "pendentes", "bloqueados",
];
const PAGE_SIZE = 40;

function filterWhere(filter: Filter): Record<string, unknown> {
  switch (filter) {
    case "retornos": return { OR: [
      { AND: [
        { outcome: "retorno_confirmado" },
        { result: { path: ["_juliaVerification", "callbackConfirmed"], equals: true } },
      ] },
      { AND: [
        { status: "PENDING" },
        { result: { path: ["_julia", "kind"], equals: "CALLBACK" } },
      ] },
    ] };
    case "agendados": return { AND: [
      { status: "PENDING" },
      { result: { path: ["_julia", "kind"], equals: "CALLBACK" } },
    ] };
    case "interessados": return { OR: [
      { outcome: { in: ["interessado", "cotacao", "comprar", "pedido"] } },
      { result: { path: ["autorizou_contato_vendedor"], equals: true } },
    ] };
    case "atenderam": return { AND: [
      { status: "DONE" },
      { result: { path: ["_juliaVerification", "customerSpoke"], equals: true } },
    ] };
    case "ausentes": return { outcome: "responsavel_ausente" };
    case "nao_atenderam": return { OR: [{ status: "NO_ANSWER" }, { outcome: "nao_atendeu" }] };
    case "ocupados": return { outcome: "ocupado" };
    case "caixa_postal": return { outcome: "caixa_postal" };
    case "desligaram": return { outcome: { in: ["desligou", "desligou_rapido", "desligou_sem_conversa"] } };
    case "falhas": return { OR: [
      { status: "FAILED" }, { outcome: "falha_sip" },
      { endedReason: { contains: "sip", mode: "insensitive" } },
    ] };
    case "revisar": return { OR: [
      { status: "REVIEW" },
      { outcome: { in: ["retorno_agendado", "retorno_nao_confirmado", "sem_dados", "sem_confirmacao"] } },
    ] };
    case "pendentes": return { status: { in: activeStatuses } };
    case "bloqueados": return { status: "DO_NOT_CALL" };
    default: return {};
  }
}

function parseDate(value: string | null, fallback: Date, end = false): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const d = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00"}-03:00`);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

const fields = {
  id: true, name: true, phone: true, status: true, attempts: true, vapiCallId: true,
  vapiStatus: true, outcome: true, endedReason: true, result: true, costUsd: true,
  durationSeconds: true, startedAt: true, finishedAt: true, lastError: true,
  campaign: { select: { id: true, name: true, status: true } },
} as const;

export async function GET(req: NextRequest) {
  return handleApi(req, async () => {
    const access = await requireJulia(req);
    const url = new URL(req.url);
    const campaignId = (url.searchParams.get("campaignId") || "").trim();
    const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
    const requestedFilter = url.searchParams.get("filter") || "todos";
    const filter: Filter = RESULT_FILTERS.includes(requestedFilter as Filter)
      ? requestedFilter as Filter : "todos";
    const page = Math.min(10000, Math.max(1, Number(url.searchParams.get("page")) || 1));

    const today = new Date();
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const from = parseDate(url.searchParams.get("from"), weekAgo);
    const to = parseDate(url.searchParams.get("to"), today, true);
    if (from.getTime() > to.getTime() || (to.getTime() - from.getTime()) > 366 * 86400000) {
      return NextResponse.json(
        { success: false, error: "Escolha um período válido de até 366 dias." },
        { status: 400 }
      );
    }

    const scope: Record<string, unknown> = {
      campaign: {
        company_id: access.companyId,
        user_id: access.userId,
        ...(campaignId ? { id: campaignId } : {}),
      },
    };
    const timeWhere = { OR: [
      { startedAt: { gte: from, lte: to } },
      { startedAt: null, createdAt: { gte: from, lte: to } },
    ] };
    const periodWhere: Record<string, unknown> = {
      AND: [scope, timeWhere],
    };
    const terms: Record<string, unknown>[] = [periodWhere, filterWhere(filter)];
    if (q) terms.push({ OR: [
      { name: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
    ] });
    const where: any = { AND: terms };

    const [campaigns, total, rows, all, callbacks, notAnswered, hungUp, sipFailures] = await Promise.all([
      prisma.juliaCampaign.findMany({
        where: { company_id: access.companyId, user_id: access.userId },
        orderBy: { createdAt: "desc" },
        take: 250,
        select: { id: true, name: true, status: true, createdAt: true },
      }),
      prisma.juliaContact.count({ where }),
      prisma.juliaContact.findMany({
        where,
        orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: fields,
      }),
      prisma.juliaContact.count({ where: periodWhere as any }),
      prisma.juliaContact.count({ where: { AND: [periodWhere, filterWhere("retornos")] } as any }),
      prisma.juliaContact.count({ where: { AND: [periodWhere, filterWhere("nao_atenderam")] } as any }),
      prisma.juliaContact.count({ where: { AND: [periodWhere, filterWhere("desligaram")] } as any }),
      prisma.juliaContact.count({ where: { AND: [periodWhere, filterWhere("falhas")] } as any }),
    ]);

    // Retornos vencidos: não dependem do período de chamadas selecionado.
    // Um contato de semanas atrás que pediu retorno hoje deve aparecer aqui.
    const scheduled = await prisma.juliaContact.findMany({
      where: {
        ...scope,
        status: "PENDING",
        result: { path: ["_julia", "kind"], equals: "CALLBACK" },
      } as any,
      select: fields,
      orderBy: { createdAt: "desc" },
      take: 1000,
    });
    const now = Date.now();
    const dueCallbacks = scheduled.filter(c => {
      const result = c.result as Record<string, any> | null;
      const nextAt = result?._julia?.nextAt;
      const when = typeof nextAt === "string" ? new Date(nextAt).getTime() : NaN;
      return Number.isFinite(when) && when <= now;
    }).sort((a, b) => {
      const resultA = a.result as Record<string, any> | null;
      const resultB = b.result as Record<string, any> | null;
      return new Date(resultA?._julia?.nextAt || 0).getTime()
        - new Date(resultB?._julia?.nextAt || 0).getTime();
    }).slice(0, 40);

    return NextResponse.json({
      success: true, campaigns, rows, page, pageSize: PAGE_SIZE, total,
      summary: { all, callbacks, notAnswered, hungUp, sipFailures },
      dueCallbacks, dueCallbacksMayBeIncomplete: scheduled.length === 1000,
    }, { headers: { "Cache-Control": "no-store" } });
  });
}
