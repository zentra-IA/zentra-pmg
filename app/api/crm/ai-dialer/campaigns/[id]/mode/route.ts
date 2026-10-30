import { NextRequest, NextResponse } from "next/server";
import { prisma, ownedCampaign, requireJulia, canDial, handleApi, JuliaAccessError } from "@/lib/julia/campaign";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(req, async () => {
    const access = await requireJulia(req, true);
    const { id } = await context.params;
    // Conserva a checagem de posse existente; revalida sob o lock abaixo.
    await ownedCampaign(req, id);
    const body = await req.json();
    const action = body?.action;
    if (action !== "START" && action !== "PAUSE") {
      return NextResponse.json({ success: false, error: "Ação inválida." }, { status: 400 });
    }
    if (action === "START" && !canDial()) {
      return NextResponse.json({
        success: false,
        error:  "Chamadas desabilitadas. Confira a configuração da Júlia."
      }, { status: 503 });
    }

    // Mesmo advisory lock da reserva de contatos em call/route.ts.
    // Serializa alteração de estado e reserva na mesma empresa.
    const status = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS ok FROM pg_advisory_xact_lock(hashtext(${access.companyId})::bigint)`;
      const campaign = await tx.juliaCampaign.findFirst({
        where: { id, company_id: access.companyId, user_id: access.userId },
        select: { status: true, startedAt: true }
      });
      if (!campaign) throw new JuliaAccessError(404, "Campanha da Júlia não encontrada.");
      if (campaign.status === "ARCHIVED") {
        throw new JuliaAccessError(409, "Campanha arquivada. Restaure-a antes de iniciar chamadas.");
      }
      if (campaign.status === "COMPLETED") {
        throw new JuliaAccessError(409, "Campanha concluída. Reagende contatos para reabrir.");
      }

      const nextStatus = action === "PAUSE" ? "PAUSED" : "RUNNING";
      await tx.juliaCampaign.update({
        where: { id },
        data: {
          status: nextStatus,
          ...(action === "START" && !campaign.startedAt ? { startedAt: new Date() } : {})
        }
      });
      return nextStatus;
    });
    // PAUSE coordena a reserva, mas não cancela requisições já reservadas ou aceitas pela Vapi.
    return NextResponse.json({
      success: true,
      status,
      ...(action === "PAUSE" ? {
        message: "Pausa registrada. Chamadas em preparação ou já enviadas podem continuar."
      } : {})
    });
  });
}
