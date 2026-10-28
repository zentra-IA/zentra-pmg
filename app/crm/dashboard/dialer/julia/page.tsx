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
    READY:"Pronta",RUNNING:"Em execução",PAUSED:"Pausada",COMPLETED:"Concluída",
    PENDING:"Aguardando",RESERVED:"Preparando",QUEUED:"Chamando",
    RINGING:"Tocando",IN_PROGRESS:"Em conversa",FINISHING:"Analisando",
    DONE:"Concluída",NO_ANSWER:"Não atendeu",REVIEW:"Revisar",
    DO_NOT_CALL:"Não ligar",FAILED:"Falha"
  } as Record<string,string>)[status]||status;
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
  const columns=["Nome","Telefone","Nome do responsável","Status","Resultado","Situação","Retorno dia","Retorno horário",
    "WhatsApp confirmado","Autorizou contato","Não ligar","Observações","Duração seg",
    "Custo Vapi USD","Motivo encerramento","Vapi Call ID"];
  const rows=detail.contacts.map(c=>[
    c.name,c.phone,c.result?.nome_responsavel||"",label(c.status),c.outcome||"",c.result?.situacao_cliente||"",
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
        <tbody>{items.slice(0,300).map((c,i)=><tr key={i}><td style={S.td}>{c.name}</td><td style={S.td}>{c.phone}</td></tr>)}</tbody>
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
  const [maxCalls,setMaxCalls]=useState(10);
  const [confirmed,setConfirmed]=useState(false);
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [selectedId,setSelectedId]=useState("");
  const [detail,setDetail]=useState<Detail|null>(null);
  const [config,setConfig]=useState<{callsEnabled:boolean;maxCalls:number;dailyLimit:number}|null>(null);
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
    setUnlocked(false);setDetail(null);setCampaigns([]);setSelectedId("");
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
        contacts:fixed.slice(0,300).map(c=>({name:c.name,phone:c.phone}))
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

  return <main style={S.root}><div style={S.wrap}>
    <Link href="/crm/dashboard/dialer" style={{color:"#14843f",fontWeight:800,textDecoration:"none"}}>← Voltar ao Discador Comercial</Link>
    <header style={{marginTop:20,background:"linear-gradient(110deg,#083e2c,#106b47)",borderRadius:22,padding:"clamp(20px,3vw,32px)",color:"#fff",boxShadow:"0 14px 35px rgba(8,62,44,.14)"}}>
      <span style={{fontSize:12,fontWeight:800,letterSpacing:1,textTransform:"uppercase",color:"#b6f2ce"}}>Zentra Sales AI · Automação de voz</span>
      <h1 style={{fontSize:"clamp(25px,3vw,36px)",margin:"10px 0 8px"}}>Discador IA — Júlia</h1>
      <p style={{fontSize:14,color:"#d5f7e3",maxWidth:720,lineHeight:1.65,margin:0}}>Crie sua lista, confira os telefones e acompanhe as campanhas em um só lugar. </p>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:18}}>
        <span style={{padding:"8px 12px",background:"rgba(255,255,255,.12)",borderRadius:999,fontWeight:750,fontSize:12}}>☎ Somente fixos</span>
        <span style={{padding:"8px 12px",background:"rgba(255,255,255,.12)",borderRadius:999,fontWeight:750,fontSize:12}}>50 por campanha</span>
        <span style={{padding:"8px 12px",background:"rgba(255,255,255,.12)",borderRadius:999,fontWeight:750,fontSize:12}}>{config?.dailyLimit??50} por 24 horas</span>
      </div>
    </header>
    <p style={{...S.muted,marginTop:12}}>Campanhas de voz independentes do discador manual. Piloto: <strong>somente fixos</strong>, até 50 ligações por campanha e no máximo {config?.dailyLimit??50} tentativas por 24 horas. O limite diário continua valendo.</p>
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
          <strong style={{color:"#166534"}}>● Painel protegido · Modo piloto</strong>
          <button style={S.neutral} onClick={()=>void logout()}>Bloquear painel</button>
        </div>
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
          <p style={S.muted}>Regra travada neste piloto: celulares não entram na fila, mesmo que venham misturados.</p>
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
            <label>Limite da campanha (1–50)
              <input style={{...S.input,marginTop:6}} type="number" min={1} max={50} value={maxCalls}
                onChange={e=>setMaxCalls(Math.max(1,Math.min(50,Number(e.target.value)||1)))} /></label>
          </div>
          <label style={{...S.row,marginTop:16}}>
            <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
            <span>Confirmo que os contatos podem ser abordados e que os bloqueios de contato foram conferidos.</span>
          </label>
          <button style={{...S.primary,marginTop:14}} disabled={busy||!confirmed||!name.trim()||!fixed.length}
            onClick={()=>void createCampaign()}>Criar campanha com {Math.min(fixed.length,300)} fixos</button>
          <div style={{...S.row,marginTop:12}}>
            <button type="button" style={S.neutral} disabled={busy||mobile.length===0}
              onClick={()=>void createMobileTest()}>Criar teste com meu celular (1 tentativa)</button>
            <span style={S.muted}>Somente o numero autorizado no servidor local. Analise a lista antes.</span>
          </div>
          <p style={S.muted}>Criar campanha não inicia ligações e não gera custo.</p>
        </section>
        <section style={S.card}>
          <h2 style={{marginTop:0}}>03 <span style={{color:"#087a45"}}>·</span> Minhas campanhas</h2>
          <div style={{...S.row,marginBottom:12}}>
            <button style={S.neutral} onClick={()=>void loadCampaigns()}>Atualizar lista</button>
            <strong role="status" style={{padding:"9px 13px",borderRadius:999,background:config?.callsEnabled?"#dcfce7":"#fff7ed",color:config?.callsEnabled?"#166534":"#b45309",fontSize:12}}>
              {config?.callsEnabled?"Discagem LOCAL habilitada":"Discagem paga desligada"}
            </strong>
          </div>
          {campaigns.length===0?<p style={S.muted}>Nenhuma campanha cadastrada. Prepare uma lista e crie sua primeira campanha acima.</p>:
            campaigns.map(c=><button key={c.id} style={{...S.neutral,textAlign:"left",display:"block",
              width:"100%",marginBottom:8,background:selectedId===c.id?"#dcfce7":"#f8fafc"}}
              onClick={()=>{armed.current=false;setSelectedId(c.id);void loadDetail(c.id);}}>
              <strong>{c.name}</strong> — {label(c.status)} • {c._count?.contacts||0} contatos • limite {c.maxCalls}
            </button>)}
        </section>
        {detail&&<section style={S.card}>
          <h2 style={{marginTop:0}}>04 <span style={{color:"#087a45"}}>·</span> Acompanhar · {detail.campaign.name}</h2>
          <div style={S.grid}>
            <div style={{background:"#f1f5f9",padding:15,borderRadius:12}}><strong>{detail.summary.total}</strong><p>Contatos</p></div>
            <div style={{background:"#f1f5f9",padding:15,borderRadius:12}}><strong>{detail.summary.completed}</strong><p>Finalizados</p></div>
            <div style={{background:"#f1f5f9",padding:15,borderRadius:12}}><strong>{detail.summary.callbacks}</strong><p>Retornos solicitados</p></div>
            <div style={{background:"#f1f5f9",padding:15,borderRadius:12}}><strong>{detail.summary.optOut}</strong><p>Não ligar novamente</p></div>
          </div>
          <p><strong>Status:</strong> {label(detail.campaign.status)} · <strong>Vapi:</strong> US$ {detail.summary.vapiCostUsd.toFixed(4)} (não inclui Nvoip)</p>
          <p style={S.muted}>Chamadas só saem de segunda a sexta, 9h–18h (São Paulo). Uma por vez. A aba deve ficar aberta durante a execução automática.</p>
          <div style={S.row}>
            {detail.campaign.status!=="COMPLETED"&&
              <button style={S.primary} disabled={busy||!config?.callsEnabled} onClick={()=>void changeMode("START")}>
                ▶ Iniciar / retomar nesta aba</button>}
            {detail.campaign.status==="RUNNING"&&
              <button style={S.warn} disabled={busy} onClick={()=>void changeMode("PAUSE")}>⏸ Pausar novas chamadas</button>}
            <button style={S.neutral} onClick={()=>void tick()}>🔄 Atualizar resultados Vapi</button>
            <button style={S.neutral} onClick={()=>saveCsv(detail)}>📄 Exportar relatório CSV</button>
          </div>
          {!config?.callsEnabled&&<p style={{...S.muted,color:"#b45309"}}>
            Chamadas reais estão desabilitadas. Não altere a configuração antes dos testes finais de segurança e custos.
          </p>}
          <div style={{overflowX:"auto",marginTop:16}}>
            <table style={{borderCollapse:"collapse",width:"100%",fontSize:13}}>
              <thead><tr>{["Contato","Número","Responsável","WhatsApp confirmado","Status","Resultado","Retorno","Observações","Custo Vapi"].map(t=><th key={t} style={S.th}>{t}</th>)}</tr></thead>
              <tbody>{detail.contacts.map(c=><tr key={c.id}>
                <td style={S.td}>{c.name}</td><td style={S.td}>{c.phone}</td>
                <td style={S.td}>{c.result?.nome_responsavel?.trim()||"Não informado"}</td>
                <td style={S.td}>
                  {c.result?.whatsapp_confirmado?.trim()||"Não informado"}
                  {c.result?.autorizou_contato_vendedor===true &&
                    c.result?.nao_ligar_novamente!==true && c.status!=="DO_NOT_CALL" &&
                    whatsappUrl(c.result?.whatsapp_confirmado) &&
                    <div style={{marginTop:6}}>
                      <a href={whatsappUrl(c.result?.whatsapp_confirmado)!}
                        target="_blank" rel="noopener noreferrer"
                        style={{display:"inline-block",background:"#e7f8ed",color:"#087a45",
                          padding:"6px 9px",borderRadius:9,fontWeight:800,textDecoration:"none"}}>
                        Abrir WhatsApp ↗
                      </a>
                    </div>}
                </td>
                <td style={S.td}>{label(c.status)}</td>
                <td style={S.td}>{c.outcome||"—"}</td>
                <td style={S.td}>{[c.result?.melhor_dia_retorno,c.result?.melhor_horario_retorno].filter(Boolean).join(" ")||"—"}</td>
                <td style={{...S.td,maxWidth:300}}>{c.result?.observacoes||c.lastError||"—"}</td>
                <td style={S.td}>{c.costUsd===null?"—":`US$ ${Number(c.costUsd).toFixed(4)}`}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <p style={S.muted}>O botão WhatsApp só aparece com número válido e autorização registrada; não envia mensagem. Retornos vagos, como “à noite”, são registrados para revisão; não viram agendamentos automáticos.</p>
        </section>}
      </>}
  </div></main>;
}
