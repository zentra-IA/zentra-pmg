import { NextRequest, NextResponse } from "next/server";
import {
  prisma, requireJulia, ownedCampaign, canDial, checkPhone, inBusinessHours,
  vapiFetch, LIVE_STATUSES, DAILY_LIMIT, assertJuliaBudget, isJuliaTestMobile, handleApi, JuliaAccessError
} from "@/lib/julia/campaign";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req:NextRequest, context:{params:Promise<{id:string}>}) {
  return handleApi(req,async()=>{
    const access=await requireJulia(req,true);
    const {id}=await context.params;
    await ownedCampaign(req,id);
    if (!canDial()) throw new JuliaAccessError(503,"Chamadas estão bloqueadas. Configure o piloto LOCAL.");
    if (!inBusinessHours()) throw new JuliaAccessError(403,"Discagem permitida apenas de segunda a sexta, das 09h às 18h (São Paulo).");

    // Uma reserva de contato por vez, por empresa. O lock é liberado ao fim da transação.
    const reserved=await prisma.$transaction(async(tx)=>{
      await tx.$queryRaw`SELECT 1 AS ok FROM pg_advisory_xact_lock(hashtext(${access.companyId})::bigint)`;
      const campaign=await tx.juliaCampaign.findFirst({
        where:{id,company_id:access.companyId,user_id:access.userId}
      });
      if (!campaign || campaign.status!=="RUNNING") throw new JuliaAccessError(409,"Campanha pausada ou indisponível.");
      if (process.env.NODE_ENV === "production" &&
          (process.env.JULIA_PROD_TEST_ONLY !== "true" ||
           campaign.name !== "[TESTE JULIA] CELULAR AUTORIZADO" ||
           campaign.maxCalls !== 1)) {
        throw new JuliaAccessError(403, "Producao liberada somente para campanha de teste autorizada.");
      }
      const globalActive=await tx.juliaContact.count({
        where:{status:{in:LIVE_STATUSES},campaign:{company_id:access.companyId}}
      });
      if (globalActive > 0) throw new JuliaAccessError(409,"Já existe uma chamada da Júlia em andamento. Atualize o resultado antes da próxima.");

      const total=await tx.juliaContact.count({where:{campaignId:id,attempts:{gt:0}}});
      if(total>=campaign.maxCalls) throw new JuliaAccessError(409,"Limite de ligações desta campanha atingido.");

      const lastDay=new Date(Date.now()-24*3600*1000);
      const daily=await tx.juliaContact.count({
        where:{campaign:{company_id:access.companyId},attempts:{gt:0},startedAt:{gte:lastDay}}
      });
      if(daily>=DAILY_LIMIT) throw new JuliaAccessError(429,"Limite de segurança: 50 ligações a cada 24 horas.");

      // Budget guard sob o advisory lock, antes de reservar qualquer contato.
      await assertJuliaBudget(tx, access.companyId);
      const pending=await tx.juliaContact.findMany({
        where:{campaignId:id,status:"PENDING"},orderBy:{createdAt:"asc"},take:80
      });
      for (const c of pending) {
        if (process.env.NODE_ENV === "production" &&
            !isJuliaTestMobile(c.phone, campaign.name, campaign.maxCalls)) {
          await tx.juliaContact.update({
            where: { id: c.id },
            data: { status: "REVIEW", outcome: "bloqueado_piloto_producao" }
          });
          continue;
        }
        if (!checkPhone(c.phone) && !isJuliaTestMobile(c.phone, campaign.name, campaign.maxCalls)) {
          await tx.juliaContact.update({where:{id:c.id},data:{status:"REVIEW",outcome:"numero_nao_fixo"}});
          continue;
        }
        const optout=await tx.juliaContact.findFirst({
          where:{phone:c.phone,status:"DO_NOT_CALL",campaign:{company_id:access.companyId}},
          select:{id:true}
        });
        if(optout) {
          await tx.juliaContact.update({where:{id:c.id},data:{status:"DO_NOT_CALL",outcome:"bloqueado_previamente"}});
          continue;
        }
        // Impede ligações repetidas ao mesmo número em campanhas diferentes no período.
        const recent=await tx.juliaContact.findFirst({
          where:{
            phone:c.phone,attempts:{gt:0},id:{not:c.id},
            startedAt:{gte:new Date(Date.now()-30*24*3600*1000)},
            campaign:{company_id:access.companyId}
          },select:{id:true}
        });
              const prodTest =
          process.env.NODE_ENV === "production" &&
          process.env.JULIA_PROD_TEST_ONLY === "true" &&
          isJuliaTestMobile(c.phone, campaign.name, campaign.maxCalls);

        // Mantém o bloqueio de 30 dias para contatos comuns.
        // Permite repetir o teste somente no celular autorizado.
        if (!prodTest && recent) {
          await tx.juliaContact.update({
            where: { id: c.id },
            data: {
              status: "REVIEW",
              outcome: "contato_recente_30_dias",
            },
          });
          continue;
        }
        const now=new Date();
        await tx.juliaContact.update({
          where:{id:c.id}, data:{status:"RESERVED",attempts:{increment:1},startedAt:now}
        });
        return {id:c.id,name:c.name,phone:c.phone};
      }
      return null;
    });

    if(!reserved) return NextResponse.json({success:true,dispatched:false,message:"Não há mais fixos elegíveis para chamar."});

    // Nao liberar novas discagens quando houver resposta incerta.
    // Uma reserva so sai de RESERVED apos confirmacao persistida no banco.
    let confirmedCallId: string | null = null;
    try {
      const result=await vapiFetch("/call/phone","POST",{
        assistantId:process.env.JULIA_VAPI_ASSISTANT_ID,
        assistantOverrides:{maxDurationSeconds:150},
        phoneNumberId:process.env.JULIA_VAPI_PHONE_NUMBER_ID,
        customer:{number:"+55"+reserved.phone.replace(/\D/g,""),numberE164CheckEnabled:true},
        metadata:{juliaCampaignId:id,juliaContactId:reserved.id}
      });
      if(typeof result.id!=="string" || !result.id) {
        throw new Error("A Vapi nao retornou um identificador de chamada.");
      }
      confirmedCallId=result.id;
      await prisma.juliaContact.update({
        where:{id:reserved.id},
        data:{status:"QUEUED",vapiCallId:result.id,vapiStatus:String(result.status||"queued")}
      });
      return NextResponse.json({
        success:true,dispatched:true,contact:{id:reserved.id,name:reserved.name,phone:reserved.phone},
        callId:result.id
      });
    } catch(error) {
      // A Vapi pode ter iniciado a ligacao mesmo quando a resposta falhou.
      // Persistir um ID conhecido sempre que possivel; caso contrario,
      // manter RESERVED (estado ativo), bloqueando novas ligacoes.
      console.error("[JULIA_DISPATCH_ERROR]", error);
      try {
        if (confirmedCallId) {
          await prisma.juliaContact.update({
            where:{id:reserved.id},
            data:{
              status:"QUEUED",
              vapiCallId:confirmedCallId,
              vapiStatus:"confirmation-pending",
              lastError:"Vapi confirmou ID, mas houve falha ao persistir ou responder. Sincronize antes de nova chamada."
            }
          });
        } else {
          await prisma.juliaContact.updateMany({
            where:{id:reserved.id,status:"RESERVED"},
            data:{
              outcome:"confirmacao_vapi_pendente",
              lastError:"Resultado incerto. Verifique o painel da Vapi. Reserva bloqueia novas ligacoes."
            }
          });
        }
      } catch (persistError) {
        // Fail closed: a reserva original continua ativa no banco
        // enquanto nao houver transicao confirmada.
        console.error("[JULIA_DISPATCH_PERSIST_ERROR]",persistError);
      }
      return NextResponse.json({
        success:false,
        error:"Resultado da Vapi incerto. Novas chamadas permanecem bloqueadas ate reconciliacao."
      },{status:502});
    }
  });
}
