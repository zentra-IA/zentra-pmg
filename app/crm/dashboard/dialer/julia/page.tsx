"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";

type Contact = {
  line:number; name:string;rawPhone:string;phone:string;
  type:"FIXO"|"CELULAR"|"INVALIDO";duplicate:boolean;reason:string|null;
};
type Campaign = {
  id:string;name:string;status:string;maxCalls:number;createdAt:string;
  _count?:{contacts:number};
};
type CallResult = {
  resultado?:string; situacao_cliente?:string;melhor_dia_retorno?:string;
  melhor_horario_retorno?:string; nome_responsavel?:string;
  whatsapp_confirmado?:string; autorizou_contato_vendedor?:boolean;
  nao_ligar_novamente?:boolean; observacoes?:string;
  _julia?:{nextAt?:string;kind?:"RETRY"|"CALLBACK";previousStatus?:string};
  _juliaVerification?:{customerSpoke?:boolean;callbackConfirmed?:boolean;evidence?:string};
  _juliaHistory?:Array<{outcome?:string|null;result?:{observacoes?:string}}>;
};
type CallContact = {
  id:string; name:string;phone:string;status:string;attempts:number;
  vapiCallId:string|null;vapiStatus:string|null;outcome:string|null;
  endedReason:string|null;result:CallResult|null;costUsd:number|null;
  durationSeconds:number|null;startedAt:string|null;finishedAt:string|null;
  lastError:string|null;
};
type Detail = {
  campaign:Campaign;contacts:CallContact[];
  summary:{total:number;pending:number;active:number;completed:number;callbacks:number;
    optOut:number;vapiCostUsd:number;outcomes:Record<string,number>}
};
type OverviewRow = CallContact & {
  campaign: { id:string; name:string; status:string };
};
type OverviewData = {
  campaigns: Array<{id:string;name:string;status:string;createdAt:string}>;
  rows:OverviewRow[];total:number;page:number;pageSize:number;
  dueCallbacks:OverviewRow[];dueCallbacksMayBeIncomplete:boolean;
  summary:{all:number;callbacks:number;notAnswered:number;hungUp:number;sipFailures:number};
};
function localDate(daysAgo=0):string {
  const d=new Date();
  d.setDate(d.getDate()-daysAgo);
  const formatter=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"});
  return formatter.format(d);
}
const API="/api/crm/ai-dialer";
const S:Record<string,CSSProperties>={
  root:{background:"linear-gradient(180deg,#edf7f2 0%,#f7fafc 280px,#f8fafc 100%)",color:"#0f172a",minHeight:"100vh",padding:"clamp(12px,2.5vw,30px)"},
  wrap:{maxWidth:1120,margin:"0 auto"},
  card:{background:"#fff",padding:"clamp(16px,2vw,26px)",borderRadius:20,border:"1px solid #e2e8f0",marginTop:18,boxShadow:"0 8px 32px rgba(15,23,42,.035)"},
  input:{width:"100%",padding:"13px 14px",border:"1px solid #cbd5e1",borderRadius:12,boxSizing:"border-box",font:"inherit"},
  primary:{background:"#087a45",color:"#fff",fontWeight:800,padding:"12px 18px",border:0,borderRadius:12,boxShadow:"0 4px 12px rgba(8,122,69,.12)",cursor:"pointer"},
  neutral:{background:"#f8fafc",color:"#334155",fontWeight:750,padding:"11px 15px",border:"1px solid #dbe4ed",borderRadius:12,cursor:"pointer"},
  warn:{background:"#fff7ed",color:"#9a3412",fontWeight:800,padding:"11px 16px",border:"1px solid #fed7aa",borderRadius:12,cursor:"pointer"},
  muted:{color:"#64748b",fontSize:13,lineHeight:1.5},
  row:{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"},
  grid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:12},
  th:{textAlign:"left",padding:"10px 8px",borderBottom:"1px solid #cbd5e1",whiteSpace:"nowrap"},
  td:{padding:"9px 8px",borderBottom:"1px solid #e2e8f0",verticalAlign:"top"},
};
async function json(res:Response) {
  const body=await res.json().catch(()=>null);
  if(!res.ok||!body?.success) throw new Error(body?.error||`Erro HTTP ${res.status}`);
  return body;
}
async function post(path:string, body:unknown) {
  return json(await fetch(API+path,{method:"POST",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"}));
}
function date(value:string|null|undefined) {
  if(!value)return "—";
  const d=new Date(value);return isNaN(d.getTime())?"—":d.toLocaleString("pt-BR");
}
function label(status:string) {
  return ({
    READY:"Pronta",RUNNING:"Em execução",PAUSED:"Pausada",COMPLETED:"Concluída",ARCHIVED:"Arquivada",
    PENDING:"Aguardando",RESERVED:"Preparando",QUEUED:"Chamando",
    RINGING:"Tocando",IN_PROGRESS:"Em conversa",FINISHING:"Analisando",
    DONE:"Concluída",NO_ANSWER:"Não atendeu",REVIEW:"Revisar",
    DO_NOT_CALL:"Não ligar",FAILED:"Falha"
  } as Record<string,string>)[status]||status;
}
type ResultFilter =
  "todos"|"retornos"|"agendados"|"interessados"|"atenderam"|"ausentes"|
  "nao_atenderam"|"ocupados"|"caixa_postal"|"desligaram"|"falhas"|
  "revisar"|"pendentes"|"bloqueados";

function classifyResult(c:CallContact):ResultFilter {
  if(c.status==="DO_NOT_CALL"||c.result?.nao_ligar_novamente===true)return "bloqueados";
  if(c.result?._julia?.nextAt&&c.status==="PENDING")return "agendados";
  if(["PENDING","RESERVED","QUEUED","RINGING","IN_PROGRESS","FINISHING"].includes(c.status))return "pendentes";
  const outcome=(c.outcome||"").toLowerCase();
  const reason=(c.endedReason||"").toLowerCase();
  if(c.status==="FAILED"||outcome==="falha_sip"||reason.includes("sip outbound call failed"))return "falhas";
  if(outcome==="ocupado")return "ocupados";
  if(outcome==="caixa_postal")return "caixa_postal";
  if(c.status==="NO_ANSWER"||outcome==="nao_atendeu")return "nao_atenderam";
  if(["desligou","desligou_rapido","desligou_sem_conversa"].includes(outcome))return "desligaram";
  // Resultado extraído automaticamente não confirma um pedido de retorno.
  // Registros antigos sem evidência são enviados a "Conferir".
  if(outcome==="retorno_confirmado" && c.result?._juliaVerification?.callbackConfirmed===true)
    return "retornos";
  if(outcome==="retorno_agendado"||outcome==="retorno_nao_confirmado")return "revisar";
  if(outcome==="responsavel_ausente")return "ausentes";
  if(["interessado","cotacao","comprar","pedido"].some(x=>outcome.includes(x))||
     c.result?.autorizou_contato_vendedor===true)
    return c.result?._juliaVerification?.customerSpoke===true?"interessados":"revisar";
  if(c.status==="DONE")
    return c.result?._juliaVerification?.customerSpoke===true?"atenderam":"revisar";
  return "revisar";
}
function resultLabel(c:CallContact):string {
  const dict:Record<string,string>={
    retorno_confirmado:"Retorno solicitado pelo cliente",
    retorno_agendado:"Retorno antigo — conferir",
    retorno_nao_confirmado:"Retorno sem confirmação",
    responsavel_ausente:"Responsável ausente — sem retorno combinado",
    desligou_rapido:"Desligou rapidamente",
    desligou_sem_conversa:"Desligou sem conversa registrada",
    desligou:"Desligou",
    nao_atendeu:"Não atendeu",
    ocupado:"Ocupado",
    caixa_postal:"Caixa postal",
    falha_sip:"Falha de conexão SIP",
    conversa_sem_classificacao:"Conversa — avaliar",
    sem_confirmacao:"Sem fala do cliente confirmada",
    sem_dados:"Sem informações suficientes",
    maximo_tentativas:"Máximo de tentativas",
    nao_ligar_novamente:"Pediu para não ligar",
  };
  return dict[c.outcome||""]||c.outcome||"—";
}
function isCallback(c:CallContact) {
  return classifyResult(c)==="retornos" ||
    (classifyResult(c)==="agendados" && c.result?._julia?.kind==="CALLBACK");
}
function matchesResultFilter(c:CallContact,filter:ResultFilter) {
  return filter==="todos" || classifyResult(c)===filter ||
    (filter==="retornos" && isCallback(c));
}
function nextLocalDate(hours=2) {
  const d=new Date(Date.now()+hours*3600000);
  if(d.getHours()>=18){d.setDate(d.getDate()+1);d.setHours(9,30,0,0);}
  else if(d.getHours()<9){d.setHours(9,30,0,0);}
  while(d.getDay()===0||d.getDay()===6){d.setDate(d.getDate()+1);d.setHours(9,30,0,0);}
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function scheduledTime(c:CallContact):Date|null{
  const value=c.result?._julia?.nextAt;
  if(!value||c.status!=="PENDING")return null;
  const d=new Date(value);
  return Number.isNaN(d.getTime())?null:d;
}
// Aceita apenas um celular brasileiro válido, com ou sem DDI 55.
// Não envia mensagem: somente cria o endereço para abrir a conversa.
function whatsappUrl(value:string|null|undefined):string|null {
  let digits=String(value||"").replace(/\D/g,"");
  if(digits.length===13 && digits.startsWith("55")) digits=digits.slice(2);
  if(!/^[1-9][0-9]9[0-9]{8}$/.test(digits))return null;
  return `https://wa.me/55${digits}`;
}
function saveCsv(detail:Detail) {
  const columns=["Nome","Telefone","Nome do responsável","Status","Categoria","Resultado","Situação","Retorno dia","Retorno horário",
    "WhatsApp confirmado","Autorizou contato","Não ligar","Observações","Duração seg",
    "Custo Vapi USD","Motivo encerramento","Vapi Call ID"];
  const rows=detail.contacts.map(c=>[
    c.name,c.phone,c.result?.nome_responsavel||"",label(c.status),classifyResult(c),resultLabel(c),c.result?.situacao_cliente||"",
    c.result?.melhor_dia_retorno||"",c.result?.melhor_horario_retorno||"",
    c.result?.whatsapp_confirmado||"",c.result?.autorizou_contato_vendedor?"SIM":"NÃO",
    c.result?.nao_ligar_novamente?"SIM":"NÃO",c.result?.observacoes||"",
    c.durationSeconds??"",c.costUsd??"",c.endedReason||"",c.vapiCallId||""
  ]);
  const quote=(s:unknown)=>{
    const original=String(s??"");
    const safe=/^[=+\-@\t\r]/.test(original)?"'"+original:original;
    return `"${safe.replace(/"/g,'""')}"`;
  };
  const csv="\uFEFF"+[columns,...rows].map(r=>r.map(quote).join(";")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download=`julia-${detail.campaign.id}-relatorio.csv`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function saveOverviewCsv(rows:OverviewRow[]) {
  const titles=["Campanha","Nome","Telefone","Status","Categoria","Resultado","Retorno","Data da tentativa","Custo Vapi USD"];
  const data=rows.map(c=>[
    c.campaign.name,c.name,c.phone,label(c.status),classifyResult(c),resultLabel(c),
    c.result?._julia?.nextAt||"",c.startedAt||"",c.costUsd??""
  ]);
  const quote=(v:unknown)=>{
    const raw=String(v??"");const safe=/^[=+\-@\t\r]/.test(raw)?"'"+raw:raw;
    return `"${safe.replace(/"/g,'""')}"`;
  };
  const csv="\uFEFF"+[titles,...data].map(row=>row.map(quote).join(";")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");link.href=url;link.download="julia-resultado-geral-pagina.csv";
  link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function ContactsTable({title,items}:{title:string;items:Contact[]}) {
  const [copied,setCopied]=useState(false);
  const copy=async()=>{
    await navigator.clipboard.writeText(items.map(c=>`${c.name};${c.phone}`).join("\n"));
    setCopied(true);
  };
  return <section style={S.card}>
    <div style={{...S.row,justifyContent:"space-between"}}><h3>{title} ({items.length})</h3>
      <button style={S.neutral} disabled={!items.length} onClick={()=>void copy()} type="button">{copied?"Copiado":"Copiar"}</button></div>
    <div style={{maxHeight:230,overflow:"auto"}}>
      <table style={{width:"100%",fontSize:13,borderCollapse:"collapse"}}>
        <thead><tr><th style={S.th}>Contato</th><th style={S.th}>Telefone</th></tr></thead>
        <tbody>{items.slice(0,400).map((c,i)=><tr key={i}><td style={S.td}>{c.name}</td><td style={S.td}>{c.phone}</td></tr>)}</tbody>
      </table></div></section>;
}
export default function JuliaPage() {
  const [checking,setChecking]=useState(true);
  const [unlocked,setUnlocked]=useState(false);
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [paste,setPaste]=useState("");
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [source,setSource]=useState("");
  const [name,setName]=useState("");
  const [maxCalls,setMaxCalls]=useState(400);
  const [confirmed,setConfirmed]=useState(false);
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [selectedId,setSelectedId]=useState("");
  const [detail,setDetail]=useState<Detail|null>(null);
  const [config,setConfig]=useState<{callsEnabled:boolean;maxCalls:number;dailyLimit:number;budgetUsd24h:number;reserveUsdPerCall:number}|null>(null);
  const [overview,setOverview]=useState<OverviewData|null>(null);
  const [overviewCampaign,setOverviewCampaign]=useState("");
  const [overviewFilter,setOverviewFilter]=useState<ResultFilter>("todos");
  const [overviewQ,setOverviewQ]=useState("");
  const [overviewSearchInput,setOverviewSearchInput]=useState("");
  const [overviewFrom,setOverviewFrom]=useState(localDate(7));
  const [overviewTo,setOverviewTo]=useState(localDate());
  const [overviewPage,setOverviewPage]=useState(1);
  const [overviewRefresh,setOverviewRefresh]=useState(0);
  const [showArchived,setShowArchived]=useState(false);

  const [resultFilter,setResultFilter]=useState<ResultFilter>("todos");
  const [resultSearch,setResultSearch]=useState("");
  const [resultPage,setResultPage]=useState(1);
  const [scheduleContactId,setScheduleContactId]=useState("");
  const [scheduleAt,setScheduleAt]=useState(nextLocalDate());
  const [retryAt,setRetryAt]=useState(nextLocalDate());
  const tickBusy=useRef(false);
  const armed=useRef(false); // Nunca retomar chamadas só por reabrir a aba.
  const selectedRef=useRef("");
  const unlockedRef=useRef(false);
  useEffect(()=>{selectedRef.current=selectedId;},[selectedId]);
  useEffect(()=>{unlockedRef.current=unlocked;},[unlocked]);

  const loadCampaigns=useCallback(async()=>{
    const data=await json(await fetch(API+"/campaigns",{cache:"no-store"}));
    setCampaigns(data.campaigns||[]);
  },[]);
  const loadDetail=useCallback(async(id:string)=>{
    const data=await json(await fetch(`${API}/campaigns/${encodeURIComponent(id)}`,{cache:"no-store"}));
    setDetail(data);
    return data as Detail;
  },[]);
  const loadConfig=useCallback(async()=>{
    const data=await json(await fetch(API+"/config",{cache:"no-store"}));
    setConfig(data);
  },[]);

  const loadOverview=useCallback(async()=>{
    const qs=new URLSearchParams({
      from:overviewFrom,to:overviewTo,filter:overviewFilter,page:String(overviewPage)
    });
    if(overviewCampaign)qs.set("campaignId",overviewCampaign);
    if(overviewQ.trim())qs.set("q",overviewQ.trim());
    const data=await json(await fetch(`${API}/overview?${qs}`,{cache:"no-store"}));
    setOverview(data as OverviewData);
  },[overviewFrom,overviewTo,overviewFilter,overviewPage,overviewCampaign,overviewQ]);
  useEffect(()=>{
    if(!unlocked)return;
    void loadOverview().catch((e:any)=>setMessage(e.message));
  },[unlocked,loadOverview,overviewRefresh]);

  async function deleteCampaign(id:string,name:string,kind:"archive"|"permanent") {
    if(busy)return;
    if(kind==="archive" && !window.confirm(
      `Arquivar "${name}"? Ela sairá da lista principal, mas histórico, retornos e bloqueios serão preservados.`
    ))return;
    if(kind==="permanent"){
      const typed=window.prompt(`ATENÇÃO: exclusão definitiva. Somente campanhas nunca discadas podem ser apagadas.\nDigite o nome exato para confirmar:\n${name}`);
      if(typed!==name)return;
    }
    armed.current=false;
    setBusy(true);setMessage("");
    try{
      await json(await fetch(`${API}/campaigns/${encodeURIComponent(id)}${kind==="permanent"?"?permanent=true":""}`,{
        method:"DELETE",cache:"no-store",
      }));
      if(selectedId===id){setSelectedId("");setDetail(null);}
      await loadCampaigns();
      setOverviewRefresh(v=>v+1);
      setMessage(kind==="archive"
        ?"Campanha arquivada. Histórico e retornos preservados."
        :"Campanha sem tentativas excluída definitivamente.");
    }catch(e:any){setMessage(e.message);}
    finally{setBusy(false);}
  }
  async function restoreCampaign(id:string) {
    if(busy)return;
    setBusy(true);setMessage("");
    try{
      await post(`/campaigns/${encodeURIComponent(id)}`,{action:"RESTORE"});
      await loadCampaigns();
      setOverviewRefresh(v=>v+1);
      setMessage("Campanha restaurada e pausada. Nenhuma ligação foi iniciada.");
    }catch(e:any){setMessage(e.message);}
    finally{setBusy(false);}
  }
  useEffect(()=>{
    let alive=true;
    (async()=>{
      try {
        const data=await json(await fetch(API+"/session",{cache:"no-store"}));
        if(alive)setUnlocked(Boolean(data.unlocked));
      }catch(e:any){if(alive)setMessage(e.message);}
      finally{if(alive)setChecking(false);}
    })();
    return ()=>{alive=false};
  },[]);
  useEffect(()=>{
    if(!unlocked)return;
    void Promise.all([loadConfig(),loadCampaigns()]).catch((e:any)=>setMessage(e.message));
  },[unlocked,loadConfig,loadCampaigns]);

  async function unlock(e:FormEvent){
    e.preventDefault();setBusy(true);setMessage("");
    try{
      await post("/session",{password});
      setUnlocked(true);setPassword("");
    }catch(err:any){setMessage(err.message);}
    finally{setBusy(false);}
  }
  async function logout(){
    armed.current=false;
    await fetch(API+"/session",{method:"DELETE"});
    setUnlocked(false);setDetail(null);setCampaigns([]);setSelectedId("");setOverview(null);
  }
  async function analyze(){
    setBusy(true);setMessage("");
    try {
      const data=await post("/preview",{text:paste});setContacts(data.contacts||[]);
      setSource("Lista colada");
    }catch(e:any){setMessage(e.message);}
    finally{setBusy(false);}
  }
  async function importSource(src:"prospects"|"clientes"){
    setBusy(true);setMessage("");
    try {
      const data=await json(await fetch(`${API}/contacts?source=${src}`,{cache:"no-store"}));
      setContacts(data.contacts||[]);setSource(src==="clientes"?"Minha carteira":"Prospects revelados");
      setMessage(data.note||"");
    }catch(e:any){setMessage(e.message);}
    finally{setBusy(false);}
  }
  const fixed=contacts.filter(c=>c.type==="FIXO"&&!c.duplicate);
  const mobile=contacts.filter(c=>c.type==="CELULAR"&&!c.duplicate);
  const invalid=contacts.filter(c=>c.type==="INVALIDO"||c.duplicate);

  async function createCampaign(){
    if(!name.trim()||!fixed.length||!confirmed)return;
    setBusy(true);setMessage("");
    try{
      const data=await post("/campaigns",{
        name,maxCalls,confirmedAuthorized:true,
        contacts:fixed.slice(0,400).map(c=>({name:c.name,phone:c.phone}))
      });
      await loadCampaigns();
      armed.current=false;
      setSelectedId(data.campaign.id);await loadDetail(data.campaign.id);
      setMessage(`Campanha criada com ${data.campaign._count.contacts} fixo(s). Celulares e inválidos excluídos.`);
      setName("");setConfirmed(false);
    }catch(e:any){setMessage(e.message);}
    finally{setBusy(false);}
  }
  async function createMobileTest(){
    if(!mobile.length||busy)return;
    if(!window.confirm("Criar campanha de UMA tentativa para seu celular autorizado? Isto NAO inicia ligacao."))return;
    setBusy(true);setMessage("");
    try{
      const data=await post("/campaigns",{
        name:"[TESTE JULIA] CELULAR AUTORIZADO",maxCalls:1,testMobile:true,
        confirmedAuthorized:true,contacts:[{name:mobile[0].name,phone:mobile[0].phone}]
      });
      armed.current=false;
      await loadCampaigns();setSelectedId(data.campaign.id);
      await loadDetail(data.campaign.id);
      setMessage("Campanha de teste criada, sem iniciar chamada. Confira os dados antes de iniciar.");
    }catch(e:any){setMessage(e.message);}
    finally{setBusy(false);}
  }
  const tick=useCallback(async()=>{
    const id=selectedRef.current;
    if(!unlockedRef.current||!id||tickBusy.current)return;
    tickBusy.current=true;
    try{
      await post(`/campaigns/${encodeURIComponent(id)}/sync`,{});
      const next=await loadDetail(id);
      if(armed.current && selectedRef.current===id &&
         next.campaign.status==="RUNNING"&&next.summary.active===0&&next.summary.pending>0) {
        const used=next.contacts.filter(c=>c.attempts>0).length;
        // Checagem final na interface; o servidor continua sendo a autoridade.
        if(armed.current && selectedRef.current===id && used<next.campaign.maxCalls) {
          await post(`/campaigns/${encodeURIComponent(id)}/call`,{});
          await loadDetail(id);
        }
      }
    }catch(e:any){setMessage(e.message);}
    finally{tickBusy.current=false;}
  },[loadDetail]);
  useEffect(()=>{
    if(!unlocked||!selectedId)return;
    const timer=window.setInterval(()=>{void tick()},12000);
    return ()=>window.clearInterval(timer);
  },[unlocked,selectedId,tick]);

  async function changeMode(action:"START"|"PAUSE"){
    if(!selectedId||busy)return;
    if(action==="START"&&!window.confirm(
      "Confirmar início de chamadas PAGAS pela Júlia? Somente fixos, até o limite da campanha. A aba precisa permanecer aberta."
    ))return;
    // Para PAUSE, desarmar antes de aguardar a rede.
    // Se falhar, manter desarmado e orientar nova tentativa; não retomar automaticamente.
    armed.current=false;
    setBusy(true);setMessage("");
    try{
      await post(`/campaigns/${encodeURIComponent(selectedId)}/mode`,{action});
      armed.current=action==="START";
      await loadDetail(selectedId);
      if(action==="START")void tick();
      else setMessage("Pausa registrada. Solicitações já reservadas/enviadas podem continuar; confira o status na Vapi.");
    }catch(e:any){
      armed.current=false;
      setMessage(e.message+(action==="PAUSE"?" A pausa não foi confirmada pelo servidor. Verifique o estado da campanha.":""));
    }
    finally{setBusy(false);}
  }

  async function followUp(action:"SCHEDULE"|"CANCEL"|"RETRY_BATCH", contactId?:string) {
    if(!selectedId||busy)return;
    const value=action==="RETRY_BATCH"?retryAt:scheduleAt;
    const d=new Date(value);
    if(action!=="CANCEL"&&Number.isNaN(d.getTime())){
      setMessage("Selecione uma data e horário válidos.");return;
    }
    if(action==="RETRY_BATCH"&&!window.confirm(
      "Reagendar os contatos que não atenderam? Haverá novas chamadas pagas, sujeitas ao limite e orçamento."
    ))return;
    setBusy(true);setMessage("");
    try{
      const data=await post(`/campaigns/${encodeURIComponent(selectedId)}/follow-up`,{
        action,contactId,...(action==="CANCEL"?{}:{at:d.toISOString()})
      });
      await Promise.all([loadDetail(selectedId),loadCampaigns()]);
      setOverviewRefresh(v=>v+1);
      setScheduleContactId("");
      setMessage(action==="CANCEL"?"Reagendamento cancelado.":
        `${data.scheduled} contato(s) agendado(s). Para executar automaticamente no horário, inicie/retome a campanha e mantenha a aba aberta.`);
    }catch(e:any){setMessage(e.message);}
    finally{setBusy(false);}
  }
  const results=detail?.contacts||[];
  const filteredResults=results.filter(c=>{
    if(!matchesResultFilter(c,resultFilter))return false;
    const query=resultSearch.trim().toLowerCase();
    return !query||[c.name,c.phone,c.outcome,c.result?.observacoes,c.result?.nome_responsavel]
      .some(x=>String(x||"").toLowerCase().includes(query));
  });
  const pageSize=25;
  const pageCount=Math.max(1,Math.ceil(filteredResults.length/pageSize));
  const currentPage=Math.min(resultPage,pageCount);
  const shownResults=filteredResults.slice((currentPage-1)*pageSize,currentPage*pageSize);
  const dueCallbacks=results.filter(c=>{
    const d=scheduledTime(c);
    return d && c.result?._julia?.kind==="CALLBACK" && d.getTime()<=Date.now();
  }).length;
  const scheduledCallbacks=results.filter(c=>Boolean(scheduledTime(c))&&c.result?._julia?.kind==="CALLBACK").length;
  const missed=results.filter(c=>["nao_atenderam","ocupados","caixa_postal"].includes(classifyResult(c))).length;
  const failed=results.filter(c=>classifyResult(c)==="falhas").length;
  const hungUp=results.filter(c=>classifyResult(c)==="desligaram").length;
  const toReview=results.filter(c=>classifyResult(c)==="revisar").length;
  const verifiedCallbacks=results.filter(isCallback).length;
  return <main style={S.root}><div style={S.wrap}>
    <Link href="/crm/dashboard/dialer" style={{color:"#14843f",fontWeight:800,textDecoration:"none"}}>← Voltar ao Discador Comercial</Link>
    <header style={{marginTop:20,background:"linear-gradient(110deg,#083e2c,#106b47)",borderRadius:22,padding:"clamp(20px,3vw,32px)",color:"#fff",boxShadow:"0 14px 35px rgba(8,62,44,.14)"}}>
      <span style={{fontSize:12,fontWeight:800,letterSpacing:1,textTransform:"uppercase",color:"#b6f2ce"}}>Zentra Sales AI · Automação de voz</span>
      <h1 style={{fontSize:"clamp(25px,3vw,36px)",margin:"10px 0 8px"}}>Discador IA — Júlia</h1>
      <p style={{fontSize:14,color:"#d5f7e3",maxWidth:720,lineHeight:1.65,margin:0}}>Crie sua lista, confira os telefones e acompanhe as campanhas em um só lugar. </p>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:18}}>
        <a href="#julia-resultados" style={{color:"#fff",fontWeight:800,textDecoration:"underline"}}>Ir direto aos resultados ↓</a>
        <span style={{padding:"8px 12px",background:"rgba(255,255,255,.12)",borderRadius:999,fontWeight:750,fontSize:12}}>☎ Somente fixos</span>
        <span style={{padding:"8px 12px",background:"rgba(255,255,255,.12)",borderRadius:999,fontWeight:750,fontSize:12}}>Até 400 contatos</span>
        <span style={{padding:"8px 12px",background:"rgba(255,255,255,.12)",borderRadius:999,fontWeight:750,fontSize:12}}>Orçamento diário configurável</span>
      </div>
    </header>
    <p style={{...S.muted,marginTop:12}}>Operação independente do Discador Manual: até 400 fixos por lista e até 800 tentativas por campanha (incluindo retornos). Orçamento preventivo obrigatório, uma chamada por vez e horário comercial.</p>
    {message&&<div role="status" style={{...S.card,background:"#fff7ed",color:"#9a3412"}}>{message}</div>}
    {checking?<section style={S.card}>Verificando acesso...</section>:!unlocked?
      <form onSubmit={unlock} style={{...S.card,maxWidth:440}}>
        <h2>🔒 Acesso à Júlia</h2>
        <input style={S.input} type="password" required minLength={12} placeholder="Senha da Júlia"
          value={password} onChange={e=>setPassword(e.target.value)}/>
        <button style={{...S.primary,marginTop:12}} disabled={busy} type="submit">Desbloquear</button>
      </form>:
      <>
        <div style={{...S.row,justifyContent:"space-between"}}>
          <strong style={{color:"#166534"}}>● Painel protegido · Operação comercial</strong>
          <button style={S.neutral} onClick={()=>void logout()}>Bloquear painel</button>
        </div>
        <section id="julia-central" style={{...S.card,border:"2px solid #b7e4c7"}}>
          <div style={{...S.row,justifyContent:"space-between"}}>
            <div>
              <h2 style={{margin:"0 0 5px"}}>📊 Central de Resultados — Todas as campanhas</h2>
              <p style={{...S.muted,margin:0}}>Campanhas reunidas. Filtre por data, campanha, resultado e nome.</p>
            </div>
            <div style={S.row}>
              <button style={S.neutral} type="button" onClick={()=>setOverviewRefresh(v=>v+1)}>Atualizar geral</button>
              <button style={S.neutral} type="button" disabled={!overview?.rows.length}
                onClick={()=>overview&&saveOverviewCsv(overview.rows)}>Exportar esta página CSV</button>
            </div>
          </div>

          {overview&&<div style={{...S.grid,marginTop:15}}>
            {([
              ["Contatos no período",overview.summary.all,"#f1f5f9"],
              ["Retornos confirmados/agendados",overview.summary.callbacks,"#dcfce7"],
              ["Não atenderam",overview.summary.notAnswered,"#f1f5f9"],
              ["Desligaram",overview.summary.hungUp,"#fff7ed"],
              ["Falhas de conexão",overview.summary.sipFailures,"#fef2f2"]
            ] as [string,number,string][]).map(([text,count,color])=>
              <div key={text} style={{background:color,padding:13,borderRadius:12}}>
                <strong style={{fontSize:23}}>{count}</strong>
                <div style={{...S.muted,fontSize:12}}>{text}</div>
              </div>)}
          </div>}

          <div style={{marginTop:18,padding:14,background:"#f0fdf4",borderRadius:12}}>
            <h3 style={{margin:"0 0 8px",color:"#166534"}}>🔔 Retornos vencidos — de todas as campanhas</h3>
            <p style={S.muted}>Aparecem aqui independentemente do filtro de datas. Nenhuma chamada é iniciada automaticamente nesta tela.</p>
            {overview?.dueCallbacks.length?
              <div style={{maxHeight:230,overflow:"auto"}}>
                {overview.dueCallbacks.map(c=><div key={c.id} style={{...S.row,padding:"9px 0",borderBottom:"1px solid #d1fae5"}}>
                  <div style={{flex:1,minWidth:210}}>
                    <strong>{c.name}</strong> — {c.phone}
                    <div style={S.muted}>{c.campaign.name} · agendado para {date(c.result?._julia?.nextAt)}</div>
                  </div>
                  <button style={S.neutral} type="button"
                    onClick={()=>{armed.current=false;setSelectedId(c.campaign.id);void loadDetail(c.campaign.id);
                      window.location.hash="julia-resultados";}}>Abrir campanha</button>
                </div>)}
              </div>:
              <p style={S.muted}>Nenhum retorno vencido localizado.</p>}
            {overview?.dueCallbacksMayBeIncomplete&&
              <p style={{...S.muted,color:"#a16207"}}>Há muitos retornos históricos. Consulte uma campanha específica para verificar os mais antigos.</p>}
          </div>

          <div style={{...S.grid,marginTop:18}}>
            <label>De
              <input style={{...S.input,marginTop:5}} type="date" value={overviewFrom}
                onChange={e=>{setOverviewFrom(e.target.value);setOverviewPage(1);}}/>
            </label>
            <label>Até
              <input style={{...S.input,marginTop:5}} type="date" value={overviewTo}
                onChange={e=>{setOverviewTo(e.target.value);setOverviewPage(1);}}/>
            </label>
            <label>Campanha
              <select style={{...S.input,marginTop:5}} value={overviewCampaign}
                onChange={e=>{setOverviewCampaign(e.target.value);setOverviewPage(1);}}>
                <option value="">Todas as campanhas</option>
                {overview?.campaigns.map(c=>
                  <option key={c.id} value={c.id}>{c.name}{c.status==="ARCHIVED"?" (arquivada)":""}</option>)}
              </select>
            </label>
            <label>Situação
              <select style={{...S.input,marginTop:5}} value={overviewFilter}
                onChange={e=>{setOverviewFilter(e.target.value as ResultFilter);setOverviewPage(1);}}>
                {([
                  ["todos","Todas"],["retornos","Retornos"],["agendados","Agendados"],
                  ["interessados","Interessados"],["atenderam","Conversaram"],
                  ["ausentes","Responsável ausente"],["nao_atenderam","Não atenderam"],
                  ["ocupados","Ocupado"],["caixa_postal","Caixa postal"],
                  ["desligaram","Desligaram"],["falhas","Falha SIP"],
                  ["revisar","Conferir"],["pendentes","Aguardando"],["bloqueados","Não ligar"]
                ] as [ResultFilter,string][]).map(([v,t])=><option key={v} value={v}>{t}</option>)}
              </select>
            </label>
          </div>
          <div style={{...S.row,marginTop:12}}>
            <input style={{...S.input,maxWidth:400}} aria-label="Buscar resultados gerais"
              placeholder="Buscar nome ou telefone" value={overviewSearchInput}
              onChange={e=>setOverviewSearchInput(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"){setOverviewQ(overviewSearchInput);setOverviewPage(1);}}}/>
            <button style={S.neutral} onClick={()=>{setOverviewQ(overviewSearchInput);setOverviewPage(1);}}>Pesquisar</button>
          </div>

          <div style={{overflowX:"auto",maxHeight:570,marginTop:16}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead style={{position:"sticky",top:0,background:"#eef3f7",zIndex:1}}>
                <tr>{["Campanha","Contato","Telefone","Situação","Resultado","Data","Ação"].map(h=>
                  <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {overview?.rows.map(c=><tr key={c.id}>
                  <td style={S.td}>{c.campaign.name}</td>
                  <td style={S.td}><strong>{c.name}</strong></td>
                  <td style={S.td}>{c.phone}</td>
                  <td style={S.td}>{classifyResult(c)==="retornos"?"Retorno confirmado":classifyResult(c)}</td>
                  <td style={S.td}>{resultLabel(c)}</td>
                  <td style={S.td}>{date(c.startedAt)}</td>
                  <td style={S.td}><button type="button" style={{...S.neutral,padding:"7px 9px"}}
                    onClick={()=>{armed.current=false;setSelectedId(c.campaign.id);void loadDetail(c.campaign.id);
                      window.location.hash="julia-resultados";}}>Abrir</button></td>
                </tr>)}
              </tbody>
            </table>
            {overview?.rows.length===0&&<p style={{...S.muted,padding:15}}>Nenhum contato para os filtros selecionados.</p>}
            {!overview&&<p style={S.muted}>Carregando resultados gerais...</p>}
          </div>
          <div style={{...S.row,justifyContent:"space-between",marginTop:12}}>
            <span style={S.muted}>{overview?.total??0} resultados · página {overviewPage} de {Math.max(1,Math.ceil((overview?.total??0)/(overview?.pageSize||40)))}</span>
            <div style={S.row}>
              <button style={S.neutral} disabled={overviewPage<=1}
                onClick={()=>setOverviewPage(n=>Math.max(1,n-1))}>← Anterior</button>
              <button style={S.neutral} disabled={!overview||overviewPage*overview.pageSize>=overview.total}
                onClick={()=>setOverviewPage(n=>n+1)}>Próxima →</button>
            </div>
          </div>
        </section>
        <section style={S.card}>
          <h2 style={{marginTop:0}}>01 <span style={{color:"#087a45"}}>·</span> Preparar contatos</h2>
          <p style={{...S.muted,marginTop:-4}}>Importe ou cole a lista. A Júlia separa automaticamente os números fixos e os celulares.</p>
          <p style={S.muted}>Cole <strong>Nome;Telefone</strong> por linha, ou importe sua carteira. A lista fica separada antes de criar uma campanha.</p>
          <textarea style={{...S.input,minHeight:110}} placeholder={"Mercado Central;1134567890\nRestaurante Exemplo;11987654321"}
            value={paste} onChange={e=>setPaste(e.target.value)}/>
          <div style={{...S.row,marginTop:12}}>
            <button style={S.primary} disabled={busy||!paste.trim()} onClick={()=>void analyze()}>Analisar lista</button>
            <button style={S.neutral} disabled={busy} onClick={()=>void importSource("prospects")}>Prospects revelados</button>
            <button style={S.neutral} disabled={busy} onClick={()=>void importSource("clientes")}>Meus clientes</button>
          </div>
          {source&&<p style={S.muted}>Origem selecionada: {source}</p>}
          <div style={{...S.grid,marginTop:14}}>
            <div style={{background:"#effaf0",padding:16,borderRadius:12}}><strong>{fixed.length}</strong> ☎️ Fixos elegíveis</div>
            <div style={{background:"#eff6ff",padding:16,borderRadius:12}}><strong>{mobile.length}</strong> 📱 Celulares — não ligar</div>
            <div style={{background:"#fff7ed",padding:16,borderRadius:12}}><strong>{invalid.length}</strong> ⚠️ Revisar</div>
          </div>
          <p style={S.muted}>Somente fixos entram na campanha comercial; celulares são separados.</p>
          <div style={S.grid}>
            <ContactsTable title="Telefones fixos" items={fixed}/>
            <ContactsTable title="Celulares — copiar para WhatsApp" items={mobile}/>
          </div>
        </section>
        <section style={S.card}>
          <h2 style={{marginTop:0}}>02 <span style={{color:"#087a45"}}>·</span> Criar campanha</h2>
          <div style={S.grid}>
            <label>Nome da campanha
              <input style={{...S.input,marginTop:6}} value={name}
                onChange={e=>setName(e.target.value)} maxLength={120} placeholder="Ex.: Pizzarias — fixos" /></label>
            <label>Limite de tentativas (1–800)
              <input style={{...S.input,marginTop:6}} type="number" min={1} max={800} value={maxCalls}
                onChange={e=>setMaxCalls(Math.max(1,Math.min(800,Number(e.target.value)||1)))} /></label>
          </div>
          <label style={{...S.row,marginTop:16}}>
            <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
            <span>Confirmo que os contatos podem ser abordados e que os bloqueios de contato foram conferidos.</span>
          </label>
          <button style={{...S.primary,marginTop:14}} disabled={busy||!confirmed||!name.trim()||!fixed.length}
            onClick={()=>void createCampaign()}>Criar campanha com {Math.min(fixed.length,400)} fixos</button>
          <div style={{...S.row,marginTop:12}}>
            <button type="button" style={S.neutral} disabled={busy||mobile.length===0}
              onClick={()=>void createMobileTest()}>Criar teste com meu celular (1 tentativa)</button>
            <span style={S.muted}>Somente o celular de teste autorizado.</span>
          </div>
          <p style={S.muted}>Criar campanha não inicia chamadas.
            {config&&config.reserveUsdPerCall>0&&<>
              {" "}Reserva preventiva por tentativa: US$ {config.reserveUsdPerCall.toFixed(2)};
              até {maxCalls} tentativas podem reservar US$ {(maxCalls*config.reserveUsdPerCall).toFixed(2)}.
              Orçamento atual de 24h: US$ {config.budgetUsd24h.toFixed(2)} (não é teto garantido da fatura).
            </>}</p>
        </section>
        <section style={S.card}>
          <h2 style={{marginTop:0}}>03 <span style={{color:"#087a45"}}>·</span> Minhas campanhas</h2>
          <div style={{...S.row,marginBottom:12}}>
            <button style={S.neutral} onClick={()=>void loadCampaigns()}>Atualizar lista</button>
            <strong role="status" style={{padding:"9px 13px",borderRadius:999,background:config?.callsEnabled?"#dcfce7":"#fff7ed",color:config?.callsEnabled?"#166534":"#b45309",fontSize:12}}>
              {config?.callsEnabled?"Discagem habilitada":"Discagem paga desligada"}
            </strong>
          </div>
          <label style={{...S.row,fontSize:13,marginBottom:12}}>
            <input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/>
            Mostrar campanhas arquivadas
          </label>
          {campaigns.filter(c=>showArchived||c.status!=="ARCHIVED").length===0?
            <p style={S.muted}>Nenhuma campanha nessa lista.</p>:
            campaigns.filter(c=>showArchived||c.status!=="ARCHIVED").map(c=>
              <div key={c.id} style={{...S.row,justifyContent:"space-between",padding:9,border:"1px solid #e2e8f0",
                borderRadius:12,marginBottom:8,background:selectedId===c.id?"#dcfce7":"#fff"}}>
                <button type="button" style={{...S.neutral,textAlign:"left",flex:"1 1 270px",border:0,background:"transparent"}}
                  onClick={()=>{armed.current=false;setResultPage(1);setResultFilter("todos");setScheduleContactId("");
                    setSelectedId(c.id);void loadDetail(c.id);}}>
                  <strong>{c.name}</strong> — {c.status==="ARCHIVED"?"Arquivada":label(c.status)}
                  {" • "}{c._count?.contacts||0} contatos • limite {c.maxCalls}
                </button>
                {c.status==="ARCHIVED"?
                  <button type="button" style={S.neutral} disabled={busy}
                    onClick={()=>void restoreCampaign(c.id)}>Restaurar</button>:
                  <button type="button" style={S.neutral} disabled={busy||c.status==="RUNNING"}
                    onClick={()=>void deleteCampaign(c.id,c.name,"archive")}>Arquivar</button>}
                <button type="button" style={S.warn} disabled={busy||c.status==="RUNNING"}
                  onClick={()=>void deleteCampaign(c.id,c.name,"permanent")}>Excluir definitivamente</button>
              </div>)}
        </section>
        {detail&&<section id="julia-resultados" style={S.card}>
          <div style={{...S.row,justifyContent:"space-between"}}>
            <h2 style={{margin:"0 0 8px"}}>04 · Acompanhar · {detail.campaign.name}</h2>
            <span style={{background:"#dcfce7",color:"#166534",borderRadius:999,padding:"7px 12px",fontWeight:800,fontSize:12}}>{label(detail.campaign.status)}</span>
          </div>
          <div style={S.grid}>
            <div style={{background:"#f1f5f9",padding:15,borderRadius:12}}><strong>{detail.summary.total}</strong><p>Contatos</p></div>
            <div style={{background:"#f1f5f9",padding:15,borderRadius:12}}><strong>{detail.summary.completed}</strong><p>Finalizados</p></div>
            <div style={{background:"#ecfdf5",padding:15,borderRadius:12}}><strong>{verifiedCallbacks}</strong><p>Retornos confirmados / agendados</p></div>
            <div style={{background:dueCallbacks?"#fff7ed":"#f1f5f9",padding:15,borderRadius:12}}><strong>{dueCallbacks}</strong><p>Retornos no horário / vencidos</p></div>
            <div style={{background:"#f1f5f9",padding:15,borderRadius:12}}><strong>{missed}</strong><p>Sem contato (não atendeu/ocupado/caixa postal)</p></div>
            <div style={{background:"#fef2f2",padding:15,borderRadius:12}}><strong>{failed}</strong><p>Falhas técnicas</p></div>
            <div style={{background:"#fff7ed",padding:15,borderRadius:12}}><strong>{hungUp}</strong><p>Desligaram rápido / sem conversa</p></div>
            <div style={{background:"#f8fafc",padding:15,borderRadius:12}}><strong>{toReview}</strong><p>Conferir classificação</p></div>
          </div>
          <p><strong>Vapi:</strong> US$ {detail.summary.vapiCostUsd.toFixed(4)} (não inclui Nvoip) ·
            <strong> Reagendados:</strong> {results.filter(c=>Boolean(scheduledTime(c))).length}
            {scheduledCallbacks>0?` · ${scheduledCallbacks} retornos marcados`:""}</p>
          <p style={S.muted}>Uma ligação por vez, segunda a sexta das 9h às 18h de São Paulo.
            O envio automático nesta versão depende desta aba aberta e da campanha iniciada. Retornos precisam ser agendados com data/hora explícitas.</p>
          <div style={S.row}>
            {detail.campaign.status!=="COMPLETED"&&
              <button style={S.primary} disabled={busy||!config?.callsEnabled} onClick={()=>void changeMode("START")}>
                ▶ Iniciar / retomar</button>}
            {detail.campaign.status==="RUNNING"&&
              <button style={S.warn} disabled={busy} onClick={()=>void changeMode("PAUSE")}>⏸ Pausar chamadas</button>}
            <button style={S.neutral} onClick={()=>void tick()}>🔄 Atualizar Vapi</button>
            <button style={S.neutral} onClick={()=>saveCsv(detail)}>📄 Exportar CSV</button>
          </div>
          {!config?.callsEnabled&&<p style={{...S.muted,color:"#b45309"}}>Chamadas desabilitadas. Confira o orçamento e as variáveis da Júlia na Vercel.</p>}
          {detail.campaign.status==="COMPLETED"&&
            <p style={{...S.muted,background:"#f0fdf4",padding:12,borderRadius:9}}>Campanha concluída. Reagende um contato ou lote de não atendidos para reabri-la; depois clique em Iniciar.</p>}

          <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:14,padding:14,marginTop:18}}>
            <strong>Nova tentativa para quem não atendeu</strong>
            <p style={S.muted}>Só inclui ocupados, caixa postal ou sem resposta. Não repete atendimentos nem números bloqueados.
              Máximo de 3 tentativas por contato, sempre em horário comercial.</p>
            <div style={S.row}>
              <input aria-label="Data e horário para nova tentativa" type="datetime-local" style={{...S.input,maxWidth:230}}
                value={retryAt} onChange={e=>setRetryAt(e.target.value)}/>
              <button style={S.neutral} disabled={busy||missed===0} onClick={()=>void followUp("RETRY_BATCH")}>
                ⏰ Reagendar {missed} não atendidos</button>
            </div>
          </div>

          <div style={{...S.row,marginTop:20,justifyContent:"space-between"}}>
            <h3 style={{margin:0}}>Resultados e ações ({filteredResults.length})</h3>
            <input aria-label="Buscar contato, telefone ou observação" type="search"
              placeholder="Buscar nome, telefone ou observação..." style={{...S.input,maxWidth:340}}
              value={resultSearch} onChange={e=>{setResultSearch(e.target.value);setResultPage(1);}}/>
          </div>
          <div style={{...S.row,marginTop:12}}>
            {([
              ["todos","Todos"],["retornos","Retornos"],["agendados","Agendados"],
              ["interessados","Interessados"],["atenderam","Conversaram"],
              ["ausentes","Responsável ausente"],["nao_atenderam","Não atenderam"],
              ["ocupados","Ocupado"],["caixa_postal","Caixa postal"],
              ["desligaram","Desligaram"],["falhas","Falha SIP"],
              ["revisar","Conferir"],["pendentes","Aguardando"],["bloqueados","Não ligar"]
            ] as [ResultFilter,string][]).map(([value,title])=>
              <button key={value} type="button" onClick={()=>{setResultFilter(value);setResultPage(1);}}
                style={{...S.neutral,padding:"8px 12px",fontSize:12,
                  background:resultFilter===value?"#dcfce7":"#f8fafc",borderColor:resultFilter===value?"#16a34a":"#dbe4ed"}}>
                {title} ({results.filter(c=>matchesResultFilter(c,value)).length})
              </button>)}
          </div>
          <div style={{overflowX:"auto",marginTop:14,maxHeight:630}}>
            <table style={{borderCollapse:"collapse",width:"100%",fontSize:13}}>
              <thead style={{position:"sticky",top:0,background:"#eef3f7",zIndex:1}}>
                <tr>{["Contato","Número","Status","Resultado","Retorno","Responsável / WhatsApp","Observações","Custo Vapi","Ação"].map(t=>
                  <th key={t} style={S.th}>{t}</th>)}</tr>
              </thead>
              <tbody>{shownResults.map(c=><tr key={c.id}>
                <td style={{...S.td,minWidth:150}}><strong>{c.name}</strong><div style={S.muted}>Tentativas: {c.attempts}</div></td>
                <td style={S.td}>{c.phone}</td>
                <td style={S.td}>{label(c.status)}</td>
                <td style={S.td}>{resultLabel(c)}{classifyResult(c)==="revisar"&&
                   <div style={{fontSize:11,color:"#a16207"}}>Confira a gravação antes de marcar retorno.</div>}{c.endedReason&&<div style={{...S.muted,maxWidth:190}}>{c.endedReason}</div>}
                  {Boolean(c.result?._juliaHistory?.length)&&<details style={{marginTop:5}}>
                    <summary style={{color:"#087a45",cursor:"pointer"}}>Histórico anterior</summary>
                    {c.result?._juliaHistory?.map((h,i)=><p key={i} style={S.muted}>
                      {h.outcome||"Sem resultado"} · {h.result?.observacoes||"Sem observações"}
                    </p>)}
                  </details>}
                </td>
                <td style={S.td}>
                  {scheduledTime(c)?<strong style={{color:"#047857"}}>{date(c.result?._julia?.nextAt)}</strong>:
                    [c.result?.melhor_dia_retorno,c.result?.melhor_horario_retorno].filter(Boolean).join(" ")||"—"}
                </td>
                <td style={S.td}>
                  {c.result?.nome_responsavel?.trim()||"Não informado"}
                  {c.result?.autorizou_contato_vendedor===true &&
                    c.result?.nao_ligar_novamente!==true && c.status!=="DO_NOT_CALL" &&
                    whatsappUrl(c.result?.whatsapp_confirmado) &&
                    <div><a href={whatsappUrl(c.result?.whatsapp_confirmado)!} target="_blank" rel="noopener noreferrer"
                      style={{color:"#087a45",fontWeight:800}}>Abrir WhatsApp ↗</a></div>}
                </td>
                <td style={{...S.td,minWidth:130,maxWidth:260}}>{c.result?.observacoes||c.lastError||"—"}</td>
                <td style={S.td}>{c.costUsd===null?"—":`US$ ${Number(c.costUsd).toFixed(4)}`}</td>
                <td style={{...S.td,minWidth:180}}>
                  {scheduledTime(c)?
                    <button style={{...S.warn,padding:"7px 10px",fontSize:12}} disabled={busy}
                      onClick={()=>void followUp("CANCEL",c.id)}>Cancelar horário</button>:
                    c.attempts>0&&c.attempts<3&&["NO_ANSWER","DONE","REVIEW","FAILED"].includes(c.status)?
                    <button style={{...S.neutral,padding:"7px 10px",fontSize:12}}
                      onClick={()=>{setScheduleContactId(c.id);setScheduleAt(nextLocalDate());}}>
                      Agendar retorno</button>:"—"}
                  {scheduleContactId===c.id&&<div style={{marginTop:8,display:"grid",gap:6}}>
                    <input aria-label={`Horário de retorno de ${c.name}`} type="datetime-local" style={{...S.input,padding:7,fontSize:12}}
                      value={scheduleAt} onChange={e=>setScheduleAt(e.target.value)}/>
                    <button disabled={busy} style={{...S.primary,padding:"8px 10px",fontSize:12}}
                      onClick={()=>void followUp("SCHEDULE",c.id)}>Salvar retorno</button>
                    <button style={{...S.neutral,padding:"6px 8px",fontSize:12}}
                      onClick={()=>setScheduleContactId("")}>Fechar</button>
                  </div>}
                </td>
              </tr>)}</tbody>
            </table>
            {!filteredResults.length&&<p style={{...S.muted,padding:20}}>Nenhum contato nesse filtro.</p>}
          </div>
          <div style={{...S.row,marginTop:12,justifyContent:"space-between"}}>
            <span style={S.muted}>Página {currentPage} de {pageCount} · 25 resultados por página</span>
            <div style={S.row}>
              <button style={S.neutral} disabled={currentPage<=1} onClick={()=>setResultPage(currentPage-1)}>← Anterior</button>
              <button style={S.neutral} disabled={currentPage>=pageCount} onClick={()=>setResultPage(currentPage+1)}>Próxima →</button>
            </div>
          </div>
          <p style={S.muted}>Resultados classificados a partir do motivo de encerramento da Vapi e dos dados extraídos.
            Falha SIP não significa que o cliente não atendeu. Pedidos de não contato nunca entram no reagendamento.</p>
        </section>}
      </>}
  </div></main>;
}
