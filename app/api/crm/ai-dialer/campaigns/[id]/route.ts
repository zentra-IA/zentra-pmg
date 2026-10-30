import { NextRequest, NextResponse } from "next/server";
import { prisma, ownedCampaign, requireJulia, summarize, handleApi, LIVE_STATUSES, JuliaAccessError } from "@/lib/julia/campaign";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req:NextRequest, context:{params:Promise<{id:string}>}) {
  return handleApi(req, async () => {
    const {id} = await context.params;
    const {campaign} = await ownedCampaign(req,id);
    const contacts = await prisma.juliaContact.findMany({
      where:{campaignId:id}, orderBy:{createdAt:"asc"}, take:400,
      select: {
        id:true,name:true,phone:true,status:true,attempts:true,vapiCallId:true,vapiStatus:true,
        outcome:true,endedReason:true,result:true,costUsd:true,durationSeconds:true,
        startedAt:true,finishedAt:true,lastError:true
      }
    });
    return NextResponse.json({success:true,campaign,contacts,summary:summarize(contacts)},
      {headers:{"Cache-Control":"no-store"}});
  });
}


// Arquivamento é a exclusão segura da lista: preserva chamadas, custos e opt-outs.
// Exclusão permanente é permitida apenas quando todos os contatos são PENDING
// e nenhuma tentativa foi realizada.
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(req, async () => {
    const access = await requireJulia(req, true);
    const { id } = await context.params;
    const permanent = new URL(req.url).searchParams.get("permanent") === "true";

    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS ok FROM pg_advisory_xact_lock(hashtext(${access.companyId})::bigint)`;
      const campaign = await tx.juliaCampaign.findFirst({
        where: { id, company_id: access.companyId, user_id: access.userId },
        select: { id: true, status: true, name: true }
      });
      if (!campaign) throw new JuliaAccessError(404, "Campanha da Júlia não encontrada.");
      if (campaign.status === "RUNNING") {
        throw new JuliaAccessError(409, "Pause a campanha antes de excluí-la ou arquivá-la.");
      }
      const active = await tx.juliaContact.count({
        where: { campaignId: id, status: { in: LIVE_STATUSES } }
      });
      if (active > 0) throw new JuliaAccessError(
        409, "Há uma ligação ativa ou uma reserva pendente. Sincronize a Vapi antes de arquivar."
      );
      if (permanent) {
        const history = await tx.juliaContact.findFirst({
          where: {
            campaignId: id,
            OR: [
              { attempts: { gt: 0 } },
              { status: { not: "PENDING" } },
              { vapiCallId: { not: null } }
            ]
          },
          select: { id: true }
        });
        if (history) throw new JuliaAccessError(
          409, "Essa campanha tem histórico ou bloqueios. Use Arquivar para preservar os registros."
        );
        await tx.juliaContact.deleteMany({ where: { campaignId: id } });
        await tx.juliaCampaign.delete({ where: { id } });
        return "deleted";
      }
      await tx.juliaCampaign.update({
        where: { id }, data: { status: "ARCHIVED" }
      });
      return "archived";
    });

    return NextResponse.json({ success: true, action: result },
      { headers: { "Cache-Control": "no-store" } });
  });
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(req, async () => {
    const access = await requireJulia(req, true);
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    if (body?.action !== "RESTORE") throw new JuliaAccessError(400, "Ação inválida.");

    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS ok FROM pg_advisory_xact_lock(hashtext(${access.companyId})::bigint)`;
      const campaign = await tx.juliaCampaign.findFirst({
        where: { id, company_id: access.companyId, user_id: access.userId },
        select: { status: true },
      });
      if (!campaign) throw new JuliaAccessError(404, "Campanha não encontrada.");
      if (campaign.status !== "ARCHIVED") {
        throw new JuliaAccessError(409, "Somente campanhas arquivadas podem ser restauradas.");
      }
      const attempts = await tx.juliaContact.count({ where: { campaignId: id, attempts: { gt: 0 } } });
      await tx.juliaCampaign.update({
        where: { id }, data: { status: attempts > 0 ? "PAUSED" : "READY" },
      });
    });
    return NextResponse.json({ success: true, action: "restored" },
      { headers: { "Cache-Control": "no-store" } });
  });
}
