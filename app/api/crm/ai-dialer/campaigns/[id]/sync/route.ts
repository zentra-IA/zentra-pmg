import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma, requireJulia, ownedCampaign, handleApi, vapiFetch, OUTPUT_ID, safeResult } from "@/lib/julia/campaign";

export const dynamic="force-dynamic";
export const runtime="nodejs";

// A classificação comercial precisa ser sustentada pela fala do CLIENTE,
// não apenas pela saída estruturada da IA.
function normalize(value:string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}
function customerLines(call:any): string[] {
  const messages = [
    ...(Array.isArray(call.artifact?.messages) ? call.artifact.messages : []),
    ...(Array.isArray(call.messages) ? call.messages : []),
  ];
  const fromMessages = messages
    .filter((item:any) => ["user","customer","caller"].includes(String(item?.role || "").toLowerCase()))
    .map((item:any) => typeof item.message === "string" ? item.message :
      typeof item.content === "string" ? item.content : "")
    .filter((item:string) => item.trim().length > 0);
  if (fromMessages.length) return [...new Set(fromMessages)];

  // Fallback para formatos de transcrição com rótulo de interlocutor.
  const transcript = typeof call.artifact?.transcript === "string"
    ? call.artifact.transcript : "";
  const matches = [...transcript.matchAll(
    /(?:^|\n)\s*(?:user|customer|cliente|caller)\s*:\s*([^\n]+)/gim
  )];
  return matches.map(m=>m[1].trim()).filter(Boolean);
}
function requestedCallback(lines:string[]):boolean {
  return lines.some(line=>{
    const text=normalize(line);
    if (/\b(?:nao|nunca)\s+(?:me\s+)?(?:ligue|liga|retorne|chame)\b/.test(text)) return false;
    return /\b(?:liga|ligue|ligar|liguem|retorna|retorne|retornar|chama|chame)\b.{0,55}\b(?:depois|amanha|mais tarde|outra hora|horario|daqui|as \d{1,2})\b/.test(text) ||
      /\b(?:pode|consegue)\s+(?:me\s+)?(?:ligar|retornar|chamar)\b/.test(text) ||
      /\b(?:me\s+)?(?:liga|ligue|retorna|retorne)\s+(?:mais tarde|amanha|depois)\b/.test(text);
  });
}
function noAnswer(endedReason:string, durationSeconds:number|null) {
  const reason=endedReason.toLowerCase();
  if (reason.includes("sip") && (reason.includes("error") || reason.includes("failed"))) return "falha_sip";
  if (reason.includes("did-not-answer") || reason.includes("no-answer")) return "nao_atendeu";
  if (reason.includes("busy")) return "ocupado";
  if (reason.includes("voicemail")) return "caixa_postal";
  if (reason.includes("customer-ended-call")) return durationSeconds!==null && durationSeconds<=20
    ? "desligou_rapido" : "desligou_sem_conversa";
  return "sem_dados";
}
function classifyCall(endedReason:string, duration:number|null, structured:Record<string,any>|null, lines:string[]) {
  const base=noAnswer(endedReason,duration);
  const customerSpoke=lines.some(line=>normalize(line).replace(/[^a-z0-9]/g,"").length>=2);
  const askedCallback=customerSpoke && requestedCallback(lines);
  const substantive=lines.some(line=>{
    const text=normalize(line).replace(/[^a-z0-9 ]/g," ").trim();
    return text.length>=13 || /\b(?:quero|compras|pode|ligue|envia|manda|preco|cotacao|responsavel|gerente)\b/.test(text);
  });
  const customerOptedOut=lines.some(line=>/\b(?:nao|nunca)\s+(?:me\s+)?(?:ligue|liga|retorne|chame)\b/.test(normalize(line)));
  const requestedOptOut=structured?.nao_ligar_novamente===true ||
    structured?.resultado==="nao_ligar_novamente" || customerOptedOut;

  let outcome:string;
  if(requestedOptOut) outcome="nao_ligar_novamente";
  else if(base==="falha_sip" || ["nao_atendeu","ocupado","caixa_postal"].includes(base)) outcome=base;
  else if(!customerSpoke) outcome=base==="sem_dados"?"sem_confirmacao":base;
  else if(base==="desligou_rapido" && !substantive) outcome="desligou_rapido";
  else if(structured?.resultado==="retorno_agendado") outcome=askedCallback?"retorno_confirmado":"retorno_nao_confirmado";
  else if(structured?.resultado==="responsavel_ausente") {
    const evidence=lines.some(line=>/\b(?:responsavel|comprador|compras|gerente|encarregado|dono)\b.{0,60}\b(?:nao esta|nao ta|saiu|ausente|volta|chega|fora)\b|\b(?:nao esta|nao ta|saiu|ausente)\b.{0,60}\b(?:responsavel|comprador|gerente|dono)\b/.test(normalize(line)));
    outcome=evidence?"responsavel_ausente":
      base.startsWith("desligou")?base:"conversa_sem_classificacao";
  }
  else if(typeof structured?.resultado==="string" && structured.resultado.trim()) outcome=structured.resultado.trim();
  else outcome="conversa_sem_classificacao";

  return {
    outcome,
    verification:{
      customerSpoke,
      callbackConfirmed:outcome==="retorno_confirmado",
      evidence:outcome==="retorno_confirmado"?"pedido_explicito_do_cliente":
        !customerSpoke?"sem_fala_do_cliente_confirmada":"conversa_sem_retorno_confirmado",
    }
  };
}
function validDate(v:any):Date|null {
  const d=typeof v==="string"?new Date(v):null;
  return d && !Number.isNaN(d.getTime())?d:null;
}

export async function POST(req:NextRequest, context:{params:Promise<{id:string}>}){
  return handleApi(req,async()=>{
    await requireJulia(req,true);
    const {id}=await context.params;
    const {campaign}=await ownedCampaign(req,id);
    // Reservas sem ID de chamada sao ambiguas: NAO transformar em REVIEW.
    // RESERVED pertence a LIVE_STATUSES e impede nova discagem na empresa.
    // A liberacao requer reconciliacao confiavel, nunca timeout automatico.
    await prisma.juliaContact.updateMany({
      where:{
        campaignId:id,
        status:"RESERVED",
        vapiCallId:null,
        startedAt:{lt:new Date(Date.now()-120000)},
        lastError:null
      },
      data:{
        outcome:"reconciliacao_vapi_pendente",
        lastError:"Reserva sem confirmacao Vapi. Novas ligacoes bloqueadas; verificar historico da Vapi."
      }
    });
    const active=await prisma.juliaContact.findMany({
      where:{campaignId:id,vapiCallId:{not:null},status:{in:["QUEUED","RINGING","IN_PROGRESS","FINISHING"]}},
      take:5
    });
    let updated=0;
    let errors=0;
    for(const contact of active) {
      try {
        const call=await vapiFetch(`/call/${encodeURIComponent(contact.vapiCallId!)}`);
        if(call.id!==contact.vapiCallId) throw new Error("ID divergente");
        // Validação adicional: a chamada pertence ao assistente configurado.
        if(call.assistantId && call.assistantId!==process.env.JULIA_VAPI_ASSISTANT_ID) throw new Error("Assistente divergente");
        if(call.status!=="ended") {
          const status=call.status==="in-progress"?"IN_PROGRESS":
                       call.status==="ringing"?"RINGING":"QUEUED";
          if(status!==contact.status) {
            await prisma.juliaContact.update({where:{id:contact.id},data:{status,vapiStatus:String(call.status||"")}});updated++;
          }
          continue;
        }
        const ended=validDate(call.endedAt)||validDate(call.finishedAt)
          ||contact.finishedAt||contact.startedAt||new Date();
        const output=call.artifact?.structuredOutputs?.[OUTPUT_ID]?.result;
        const structured=safeResult(output);
        // A extração da IA pode aparecer alguns segundos após a ligação terminar.
        const immediateFailure = /sip.*(error|failed)|(error|failed).*sip/i.test(String(call.endedReason||""));
        if(!structured && !immediateFailure && (Date.now()-ended.getTime())<90000) {
          await prisma.juliaContact.update({where:{id:contact.id},data:{status:"FINISHING",vapiStatus:"ended"}});
          updated++;
          continue;
        }
        const reason=String(call.endedReason||"");
        const start=validDate(call.startedAt);
        const duration=start?Math.max(0,Math.floor((ended.getTime()-start.getTime())/1000)):null;
        const lines=customerLines(call);
        const classified=classifyCall(reason,duration,structured,lines);
        const outcome=classified.outcome;
        const optOut=outcome==="nao_ligar_novamente";
        const status=optOut?"DO_NOT_CALL":outcome==="falha_sip"?"FAILED":
          ["nao_atendeu","ocupado","caixa_postal"].includes(outcome)?"NO_ANSWER":
          ["sem_dados","sem_confirmacao","retorno_nao_confirmado","conversa_sem_classificacao"].includes(outcome)?"REVIEW":"DONE";
        const rawCost=Number(call.cost);
        // Preserve resultados históricos de uma chamada anterior reagendada.
        const oldResult=contact.result && typeof contact.result==="object" &&
          !Array.isArray(contact.result) ? contact.result as Record<string, unknown> : {};
        const history=Array.isArray(oldResult._juliaHistory) ? oldResult._juliaHistory : [];
        const { _julia: _schedule, _juliaHistory: _oldHistory, ...previousFields } = oldResult;
        const archived = contact.attempts > 1 && _schedule
          ? [{ outcome: contact.outcome, result: previousFields }] : [];
        const resultData = {
          ...(structured || {}),
          _juliaVerification: classified.verification,
          _juliaHistory: [...history, ...archived].slice(-5),
        } as Prisma.InputJsonObject;
        // Evita marcar novas ligações como concluídas duas vezes por sincronizações concorrentes.
        await prisma.juliaContact.updateMany({
          where:{id:contact.id,status:{in:["QUEUED","RINGING","IN_PROGRESS","FINISHING"]}},
          data:{
            status, vapiStatus:"ended", outcome, endedReason:reason.slice(0,180),
            result: resultData,
            costUsd:Number.isFinite(rawCost)?rawCost:null,
            durationSeconds:duration, finishedAt:ended
          }
        });
        updated++;
      } catch(e) {
        errors++;
        console.error("[JULIA_SYNC_CALL_ERROR]",contact.id,e);
      }
    }

    const open=await prisma.juliaContact.count({where:{campaignId:id,status:"PENDING"}});
    const activeLeft=await prisma.juliaContact.count({
      where:{campaignId:id,status:{in:["RESERVED","QUEUED","RINGING","IN_PROGRESS","FINISHING"]}}
    });
    const attemptsSum=await prisma.juliaContact.aggregate({
      where:{campaignId:id}, _sum:{attempts:true}
    });
    const attempts=attemptsSum._sum.attempts??0;
    if(campaign.status==="RUNNING" && activeLeft===0 && (open===0 || attempts>=campaign.maxCalls)) {
      await prisma.juliaCampaign.updateMany({
        where:{id,status:"RUNNING"},
        data:{status:"COMPLETED",finishedAt:new Date()}
      });
    }
    return NextResponse.json({
      success:true,checked:active.length,updated,errors,remaining:open,active:activeLeft
    });
  });
}
