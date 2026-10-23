"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  ArrowRight, Check, Clipboard, ChevronDown, Clock3, FileText, ImagePlus,
  Info, Lightbulb, MapPin, Megaphone, RefreshCw, Search, ShieldCheck,
  Sparkles, Target, Upload, WandSparkles
} from "lucide-react";
import styles from "./ads-ia.module.css";

type Action = "prompt" | "review" | "strategy" | "radar";
type PlanTab = "copies" | "audience" | "platforms" | "checklist";
type Draft = {
  business: string; segment: string; products: string; goal: string;
  offer: string; advantages: string; platform: string; state: string;
  regions: string; cities: string; neighborhoods: string; delivery: string;
  dailyBudget: number; days: number; notes: string;
};
type PromptResult = { prompt?: unknown; alternatives?: unknown; why?: unknown; formatTips?: unknown };
type ReviewResult = {
  verdict?: unknown; score?: unknown; strengths?: unknown; issues?: unknown;
  platformFit?: unknown; correctionPrompt?: unknown; observations?: unknown;
};
type CopyResult = { style?: unknown; title?: unknown; primary?: unknown; description?: unknown; cta?: unknown };
type StrategyResult = {
  headline?: unknown; positioning?: unknown; audience?: unknown; geoStrategy?: unknown;
  copies?: unknown; meta?: unknown; google?: unknown; tiktok?: unknown;
  timing?: unknown; budgetAdvice?: unknown; experiments?: unknown;
  kpis?: unknown; warnings?: unknown; confidence?: unknown;
};
type RadarResult = {
  summary?: unknown; regions?: unknown; priorityTest?: unknown;
  sourcesToCheck?: unknown; limits?: unknown;
};

const INITIAL: Draft = {
  business: "", segment: "Pizzarias", products: "Muçarela, calabresa e proteínas",
  goal: "Atrair novos compradores e receber cotações no WhatsApp",
  offer: "", advantages: "Atendimento ágil e pedidos pelo WhatsApp",
  platform: "meta", state: "São Paulo", regions: "", cities: "",
  neighborhoods: "", delivery: "", dailyBudget: 20, days: 7, notes: "",
};
const LABELS: Record<string, string> = {
  segment: "Segmento", location: "Localização", exclusions: "Exclusões",
  demographics: "Perfil do público", interests: "Interesses sugeridos",
  platformLimitations: "Limitações da plataforma", audience: "Público",
  region: "Região", regions: "Regiões", state: "Estado",
  cities: "Cidades", city: "Cidade", neighborhoods: "Bairros", radius: "Raio",
  gender: "Gênero", age: "Idade", ageRange: "Faixa etária",
  keywords: "Palavras-chave", notes: "Observações",
  targeting: "Segmentação", restrictions: "Restrições",
  areas: "Áreas", objective: "Objetivo", budget: "Orçamento",
};
const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

function textOf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join("\n");
  if (isRecord(value)) return Object.entries(value).map(([k, v]) =>
    `${LABELS[k] || k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ")}: ${textOf(v)}`
  ).filter((s) => !s.endsWith(": ")).join("\n");
  return "";
}
function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value.filter((x) => x != null && x !== "") :
    value == null || value === "" ? [] : [value];
}
function labeled(k: string) {
  return LABELS[k] || k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
}
function CopyButton({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(value);
      else {
        const field = document.createElement("textarea");
        field.value = value;
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(field);
        if (!ok) throw new Error("Cópia indisponível");
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      window.alert("Não foi possível copiar automaticamente. Selecione o texto e copie.");
    }
  }
  return <button type="button" className={styles.copyButton} onClick={copy} disabled={!value}>
    {copied ? <Check size={15} /> : <Clipboard size={15}/>}
    <span>{copied ? "Copiado!" : label}</span>
  </button>;
}
function Section({ id, num, title, description, children, hint }: {
  id: string; num: string; title: string; description: string; children: ReactNode; hint?: ReactNode;
}) {
  return <section id={id} className={styles.panel}>
    <div className={styles.sectionHead}>
      <span className={styles.stepNumber}>{num}</span>
      <div className={styles.sectionTitle}>
        <h2>{title}</h2><p>{description}</p>
      </div>
      {hint && <div className={styles.sectionHint}>{hint}</div>}
    </div>
    {children}
  </section>;
}
function AIContent({ value }: { value: unknown }) {
  if (value == null || value === "") return <span className={styles.muted}>Não informado.</span>;
  if (Array.isArray(value)) {
    if (!value.length) return <span className={styles.muted}>Não informado.</span>;
    return <ul className={styles.cleanList}>{value.map((entry, i) =>
      <li key={i}><AIContent value={entry}/></li>
    )}</ul>;
  }
  if (isRecord(value)) return <dl className={styles.fieldList}>
    {Object.entries(value).filter(([,val]) => val != null && val !== "").map(([key,val]) =>
      <div className={styles.fieldRow} key={key}>
        <dt>{labeled(key)}</dt><dd><AIContent value={val}/></dd>
      </div>
    )}
  </dl>;
  return <span className={styles.readable}>{textOf(value)}</span>;
}
function ResultCard({ title, value, copy = false, emphasis = false, description }: {
  title: string; value: unknown; copy?: boolean; emphasis?: boolean; description?: string;
}) {
  const val = textOf(value);
  if (!val) return null;
  return <article className={`${styles.resultCard} ${emphasis ? styles.resultEmphasis : ""}`}>
    <div className={styles.cardTop}>
      <div><h3>{title}</h3>{description && <p>{description}</p>}</div>
      {copy && <CopyButton value={val}/>}
    </div>
    <AIContent value={value}/>
  </article>;
}
function Bullets({ title, items, tone = "neutral" }: {
  title: string; items: unknown; tone?: "neutral" | "good" | "warn";
}) {
  const list = listOf(items);
  if (!list.length) return null;
  return <div className={`${styles.bulletPanel} ${tone === "good" ? styles.bulletGood : tone === "warn" ? styles.bulletWarn : ""}`}>
    <h3>{title}</h3><AIContent value={list}/>
  </div>;
}
function Notice({ children, type = "info" }: {children: ReactNode; type?: "info" | "warning"}) {
  return <div className={`${styles.notice} ${type === "warning" ? styles.warning : ""}`}>
    <Info size={17}/><div>{children}</div>
  </div>;
}
function CampaignCopy({ copy, index }: {copy: CopyResult; index: number}) {
  const title = textOf(copy.title);
  const body = textOf(copy.primary);
  const description = textOf(copy.description);
  const cta = textOf(copy.cta);
  const full = [
    title && `TÍTULO\n${title}`,
    body && `TEXTO PRINCIPAL\n${body}`,
    description && `DESCRIÇÃO\n${description}`,
    cta && `CHAMADA PARA AÇÃO\n${cta}`,
  ].filter(Boolean).join("\n\n");
  return <article className={styles.adCard}>
    <div className={styles.adHeader}>
      <div><span className={styles.adIndex}>OPÇÃO {index + 1}</span>
        <h3>{textOf(copy.style) || ["Direta e comercial", "Confiança", "Oferta"][index] || "Anúncio"}</h3>
      </div>
      <CopyButton value={full} label="Copiar tudo"/>
    </div>
    {title && <div className={styles.adField}><span>Título</span><strong>{title}</strong><CopyButton value={title}/></div>}
    {body && <div className={styles.adField}><span>Texto principal</span><p>{body}</p><CopyButton value={body}/></div>}
    {description && <div className={styles.adField}><span>Descrição</span><p>{description}</p></div>}
    {cta && <div className={styles.adCta}><span>Botão / CTA</span><strong>{cta}</strong></div>}
  </article>;
}

export default function AdsIaPage() {
  const [draft, setDraft] = useState<Draft>(INITIAL);
  const [hydrated, setHydrated] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [prompt, setPrompt] = useState<PromptResult | null>(null);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [strategy, setStrategy] = useState<StrategyResult | null>(null);
  const [radar, setRadar] = useState<RadarResult | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState("");
  const [errorAction, setErrorAction] = useState<Action | null>(null);
  const [planTab, setPlanTab] = useState<PlanTab>("copies");

  useEffect(() => {
    try {
      const json = localStorage.getItem("zentra_ads_ia_draft_v1");
      if (json) {
        const stored = JSON.parse(json);
        if (isRecord(stored)) setDraft({ ...INITIAL, ...stored });
      }
    } catch { /* Sem armazenamento local: o formulário segue funcional. */ }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem("zentra_ads_ia_draft_v1", JSON.stringify(draft)); } catch {}
  }, [draft, hydrated]);

  function field<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }
  async function run(action: Action) {
    if (busy) return;
    setErrorAction(action);
    if (!draft.segment.trim() || !draft.products.trim() || !draft.goal.trim()) {
      setError("Preencha segmento, produtos e objetivo para continuar.");
      return;
    }
    if (action === "review" && !image) {
      setError("Selecione uma imagem antes de pedir a avaliação.");
      return;
    }
    setError("");
    setBusy(action);
    try {
      const response = await fetch("/api/ads-ia", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action, ...draft,
          ...(action === "review" ? { image } : {}),
          ...(action === "strategy" ? { review } : {}),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Não foi possível concluir a análise.");
      if (action === "prompt") setPrompt(payload.data);
      if (action === "review") setReview(payload.data);
      if (action === "strategy") {setStrategy(payload.data); setPlanTab("copies");}
      if (action === "radar") setRadar(payload.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível conectar com a IA.");
    } finally {
      setBusy(null);
    }
  }
  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setErrorAction("review");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Use uma imagem JPG, PNG ou WEBP."); event.target.value = ""; return;
    }
    if (file.size > 3_000_000) {
      setError("Imagem muito grande. Escolha uma imagem de até 3 MB.");
      event.target.value = ""; return;
    }
    setError(""); setReview(null); setStrategy(null); setImageName(file.name);
    const reader = new FileReader();
    reader.onload = () => setImage(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => setError("Não foi possível abrir a imagem.");
    reader.readAsDataURL(file);
  }

  const disabled = busy !== null;
  const budget = Math.max(0, Number(draft.dailyBudget) || 0) * Math.max(0, Number(draft.days) || 0);
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(budget);
  const copies = Array.isArray(strategy?.copies) ? strategy.copies.filter(isRecord) as CopyResult[] : [];
  const windowItems = listOf(strategy?.timing);
  const selectedPlatform = draft.platform === "meta" ? "Instagram e Facebook" : draft.platform === "google" ? "Google Ads" :
    draft.platform === "tiktok" ? "TikTok Ads" : "Comparativo de canais";

  return <main className={styles.page}>
    <header className={styles.hero}>
      <div className={styles.heroContent}>
        <span className={styles.kicker}><Sparkles size={14}/> ZENTRA SALES AI · MARKETING</span>
        <h1>Ads Intelligence <span className={styles.heroBadge}>IA</span></h1>
        <p>Do briefing ao anúncio: crie uma imagem, receba orientações e copie sua campanha. Sem publicar automaticamente.</p>
        <div className={styles.heroTags}><span><Check size={14}/> Prompt pronto</span><span><Check size={14}/> Análise de criativo</span><span><Check size={14}/> 3 textos para copiar</span></div>
      </div>
      <div className={styles.heroSymbol}><Megaphone size={31}/></div>
    </header>

    <nav className={styles.stepNav} aria-label="Etapas da campanha">
      <a href="#planejamento"><Target size={17}/><span><b>01</b> Planejar</span></a>
      <a href="#imagem"><WandSparkles size={17}/><span><b>02</b> Criar imagem</span></a>
      <a href="#avaliar"><ImagePlus size={17}/><span><b>03</b> Avaliar</span></a>
      <a href="#anuncios"><Megaphone size={17}/><span><b>04</b> Anúncios</span></a>
    </nav>

    <Section id="planejamento" num="01" title="Planeje sua campanha" description="Preencha o essencial. A IA usa essas informações em todas as etapas."
      hint={<span className={styles.pill}><ShieldCheck size={14}/> Nada é publicado</span>}>
      <div className={styles.briefing}>
        <div className={styles.formGrid}>
          <label>Para quem você quer vender?
            <select className={styles.input} value={draft.segment} onChange={e=>field("segment", e.target.value)}>
              {["Pizzarias", "Hamburguerias", "Restaurantes", "Bares", "Lanchonetes", "Pastelarias", "Padarias", "Mercados", "Distribuidores", "Outro"].map(x=><option key={x}>{x}</option>)}
            </select>
          </label>
          <label>Onde vai anunciar?
            <select className={styles.input} value={draft.platform} onChange={e=>field("platform", e.target.value)}>
              <option value="meta">Instagram e Facebook</option><option value="google">Google Ads</option>
              <option value="tiktok">TikTok Ads</option><option value="todos">Comparar plataformas</option>
            </select>
          </label>
          <label className={styles.full}>Quais produtos quer divulgar?
            <input className={styles.input} value={draft.products} onChange={e=>field("products", e.target.value)} placeholder="Muçarela, calabresa e proteínas"/>
          </label>
          <label className={styles.full}>Qual resultado você quer?
            <input className={styles.input} value={draft.goal} onChange={e=>field("goal", e.target.value)} placeholder="Ex.: receber pedidos de cotação no WhatsApp"/>
          </label>
        </div>
        <div className={styles.groupTitle}><MapPin size={16}/><h3>Região e entrega</h3><span>Alcance comercial, sem inventar cobertura</span></div>
        <div className={styles.formGrid}>
          <label>Estado
            <input className={styles.input} value={draft.state} onChange={e=>field("state",e.target.value)} placeholder="São Paulo"/>
          </label>
          <label>Zonas e regiões
            <input className={styles.input} value={draft.regions} onChange={e=>field("regions",e.target.value)} placeholder="Zona Leste, ABC, Baixada Santista"/>
          </label>
          <label>Cidades
            <input className={styles.input} value={draft.cities} onChange={e=>field("cities",e.target.value)} placeholder="São Paulo, Santos, Botucatu"/>
          </label>
          <label>Bairros
            <input className={styles.input} value={draft.neighborhoods} onChange={e=>field("neighborhoods",e.target.value)} placeholder="Mooca, Tatuapé, Itaquera"/>
          </label>
          <label className={styles.full}>Onde você realmente consegue entregar?
            <input className={styles.input} value={draft.delivery} onChange={e=>field("delivery",e.target.value)} placeholder="Informe somente as áreas que atende"/>
          </label>
        </div>
        <details className={styles.advanced}>
          <summary><ChevronDown size={17}/> Detalhes opcionais da campanha</summary>
          <div className={styles.formGrid}>
            <label>Nome da empresa ou marca
              <input className={styles.input} value={draft.business} onChange={e=>field("business",e.target.value)} placeholder="Nome da distribuidora"/>
            </label>
            <label>Oferta, se existir
              <input className={styles.input} value={draft.offer} onChange={e=>field("offer",e.target.value)} placeholder="Não inventar preços nem descontos"/>
            </label>
            <label className={styles.full}>Diferenciais reais
              <input className={styles.input} value={draft.advantages} onChange={e=>field("advantages",e.target.value)} placeholder="Atendimento rápido e variedade de produtos"/>
            </label>
            <label>Orçamento diário (R$)
              <input className={styles.input} type="number" min={1} max={100000} value={draft.dailyBudget} onChange={e=>field("dailyBudget",Number(e.target.value))}/>
            </label>
            <label>Duração do teste (dias)
              <input className={styles.input} type="number" min={1} max={365} value={draft.days} onChange={e=>field("days",Number(e.target.value))}/>
            </label>
            <label className={styles.full}>Observações
              <textarea className={styles.textarea} rows={3} value={draft.notes} onChange={e=>field("notes",e.target.value)} placeholder="Ex.: campanha de fim de ano, não prometer entrega no dia seguinte em todas as cidades"/>
            </label>
          </div>
        </details>
        <div className={styles.briefingFooter}>
          <div className={styles.briefingSummary}>
            <span>Segmento: <b>{draft.segment}</b></span>
            <span>Canal: <b>{selectedPlatform}</b></span>
            <span>Orçamento informado: <b>{money}</b></span>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.primaryButton} disabled={disabled} onClick={()=>run("prompt")}><Sparkles size={17}/>{busy==="prompt"?"Criando prompt...":"Gerar prompt da imagem"}</button>
            <button type="button" className={styles.secondaryButton} disabled={disabled} onClick={()=>run("radar")}><Search size={17}/>{busy==="radar"?"Analisando...":"Analisar regiões"}</button>
          </div>
        </div>
        {error && (errorAction==="prompt" || errorAction==="radar") && <div role="alert" className={styles.error}>{error}</div>}
      </div>

      {radar && <div className={styles.radarBox}>
        <div className={styles.subHeading}><MapPin size={18}/><h3>Radar de oportunidades regionais</h3></div>
        <Notice><strong>Análise qualitativa.</strong> Esta versão não consulta contagens reais de estabelecimentos no Google ou na Receita.</Notice>
        <ResultCard title="Visão geral" value={radar.summary}/>
        {Array.isArray(radar.regions) && <div className={styles.regionGrid}>
          {radar.regions.filter(isRecord).map((r,i)=><article className={styles.regionCard} key={i}>
            <h4><MapPin size={15}/>{textOf(r.name) || `Região ${i+1}`}</h4>
            <AIContent value={r.opportunity}/>
            {r.deliveryRisk != null && <div className={styles.regionDetail}><b>Entrega:</b><AIContent value={r.deliveryRisk}/></div>}
            {r.dataNeeded != null && <div className={styles.regionDetail}><b>Validar:</b><AIContent value={r.dataNeeded}/></div>}
          </article>)}
        </div>}
        <ResultCard title="Onde testar primeiro" value={radar.priorityTest} copy/>
        <Bullets title="Dados que ainda precisamos confirmar" items={radar.sourcesToCheck}/>
        {radar.limits && <p className={styles.smallPrint}>{textOf(radar.limits)}</p>}
      </div>}
    </Section>

    <Section id="imagem" num="02" title="Crie a imagem do anúncio" description="Copie o prompt, cole no ChatGPT e gere a imagem que será usada na campanha.">
      {prompt ? <div className={styles.resultsStack}>
        <ResultCard title="Seu prompt para o ChatGPT" description="Pronto para copiar e usar no gerador de imagens." value={prompt.prompt} copy emphasis/>
        <div className={styles.subHeading}><WandSparkles size={17}/><h3>Outras ideias de criativo</h3></div>
        <div className={styles.twoColumns}>
          {listOf(prompt.alternatives).map((item,i)=><ResultCard key={i} title={`Variação ${i+1}`} value={item} copy/>)}
        </div>
        <div className={styles.twoColumns}>
          <Bullets title="Por que essa ideia funciona" items={prompt.why} tone="good"/>
          <Bullets title="Dicas de formato e composição" items={prompt.formatTips}/>
        </div>
        <button type="button" disabled={disabled} className={styles.secondaryButton} onClick={()=>run("prompt")}><RefreshCw size={16}/>{busy==="prompt"?"Gerando...":"Gerar outra versão do prompt"}</button>
      </div> : <div className={styles.emptyState}><WandSparkles size={26}/><h3>Comece pelo prompt da imagem</h3><p>Preencha o planejamento e clique em <b>Gerar prompt da imagem</b>. Ele aparecerá aqui, pronto para copiar.</p><a href="#planejamento" className={styles.textLink}>Ir para o planejamento <ArrowRight size={16}/></a></div>}
    </Section>

    <Section id="avaliar" num="03" title="Avalie e melhore o criativo" description="Envie a imagem gerada. Se ela não estiver boa, a IA explica o que mudar e cria outro prompt.">
      <div className={styles.uploadLayout}>
        <label className={styles.uploadZone}>
          <Upload size={28}/>
          <strong>{imageName || "Escolher imagem do anúncio"}</strong>
          <span>JPG, PNG ou WEBP · até 3 MB</span>
          <small>A imagem não é salva no banco pelo módulo.</small>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={upload}/>
        </label>
        {image && <div className={styles.imagePreview}><img src={image} alt="Imagem escolhida para análise"/><span>Prévia do criativo</span></div>}
      </div>
      <div className={styles.actions}>
        <button type="button" disabled={!image || disabled} className={styles.primaryButton} onClick={()=>run("review")}><ImagePlus size={17}/>{busy==="review"?"Analisando imagem...":"Avaliar imagem com IA"}</button>
        {image && <button type="button" className={styles.secondaryButton} onClick={()=>{setImage(null);setImageName("");setReview(null);setStrategy(null)}}><RefreshCw size={16}/> Remover imagem</button>}
      </div>
      {error && errorAction==="review" && <div role="alert" className={styles.error}>{error}</div>}
      {review && <div className={styles.reviewArea}>
        <div className={styles.reviewHeadline}>
          <div><span className={styles.cardEyebrow}>DIAGNÓSTICO DO CRIATIVO</span><h3>{textOf(review.verdict)||"Imagem analisada"}</h3><p>Nota editorial: avalia comunicação e visual, não prevê cliques ou vendas.</p></div>
          {Number.isFinite(Number(review.score)) && <div className={styles.scoreCircle}><strong>{Number(review.score).toFixed(1)}</strong><small>de 10</small></div>}
        </div>
        <div className={styles.twoColumns}>
          <Bullets title="O que ficou bom" items={review.strengths} tone="good"/>
          <Bullets title="O que vale ajustar" items={review.issues} tone="warn"/>
        </div>
        <ResultCard title="Novo prompt para corrigir a imagem" description="Cole este texto no ChatGPT para melhorar o criativo." value={review.correctionPrompt} copy emphasis/>
        <ResultCard title="Avaliação por plataforma" value={review.platformFit}/>
        {review.observations != null && <ResultCard title="Observações da IA" value={review.observations}/>}
      </div>}
    </Section>

    <Section id="anuncios" num="04" title="Seu plano de anúncios" description="Textos, público e configurações prontos para consultar e copiar.">
      <div className={styles.actions}>
        <button type="button" disabled={disabled} className={styles.primaryButton} onClick={()=>run("strategy")}><Megaphone size={17}/>{busy==="strategy"?"Montando plano...":strategy?"Atualizar plano com IA":"Gerar plano de anúncios"}</button>
      </div>
      {error && errorAction==="strategy" && <div role="alert" className={styles.error}>{error}</div>}
      {strategy ? <div className={styles.strategyArea}>
        <div className={styles.summaryBox}>
          <span className={styles.cardEyebrow}>VISÃO GERAL DA CAMPANHA</span>
          <h3>{textOf(strategy.headline)||"Sua campanha está planejada"}</h3>
          <p>{textOf(strategy.positioning)}</p>
          <div className={styles.summaryChips}><span><Target size={14}/>{draft.segment}</span><span><MapPin size={14}/>{draft.regions || draft.cities || draft.state}</span><span><Megaphone size={14}/>{selectedPlatform}</span></div>
        </div>
        <div className={styles.tabs} role="tablist" aria-label="Detalhes do plano">
          {([
            ["copies","Textos prontos",FileText],
            ["audience","Público e regiões",MapPin],
            ["platforms","Configurar anúncio",Megaphone],
            ["checklist","Horários e cuidados",Clock3],
          ] as const).map(([id,label,Icon])=>
            <button key={id} type="button" role="tab" aria-selected={planTab===id} className={`${styles.tab} ${planTab===id ? styles.tabActive : ""}`} onClick={()=>setPlanTab(id)}><Icon size={16}/>{label}</button>
          )}
        </div>
        <div className={styles.tabContent} role="tabpanel">
          {planTab==="copies" && <>
            <div className={styles.tabIntro}><h3>Escolha um texto e copie</h3><p>Três abordagens diferentes. Você decide qual combina melhor com o seu público.</p></div>
            {copies.length > 0 ? <div className={styles.copyGrid}>{copies.map((ad,i)=><CampaignCopy key={i} copy={ad} index={i}/>)}</div>
              : <ResultCard title="Textos sugeridos" value={strategy.copies} copy/>}
          </>}
          {planTab==="audience" && <div className={styles.twoColumns}>
            <ResultCard title="Público recomendado" value={strategy.audience} copy/>
            <ResultCard title="Estratégia geográfica" value={strategy.geoStrategy} copy/>
            <Notice>A plataforma pode não oferecer todos os filtros sugeridos. Confirme a localização e as opções reais disponíveis antes de investir.</Notice>
          </div>}
          {planTab==="platforms" && <div className={styles.resultsStack}>
            <p className={styles.helpText}>Abra o gerenciador correspondente e siga os passos abaixo. O Zentra não publica anúncios por você.</p>
            <ResultCard title="Instagram e Facebook · Meta Ads" value={strategy.meta} copy/>
            <ResultCard title="Google Ads" value={strategy.google} copy/>
            <ResultCard title="TikTok Ads" value={strategy.tiktok} copy/>
          </div>}
          {planTab==="checklist" && <div className={styles.resultsStack}>
            <div className={styles.twoColumns}>
              <article className={styles.resultCard}><div className={styles.cardTop}><h3>Horários para testar</h3></div>
                {windowItems.length ? <ul className={styles.timingList}>{windowItems.map((time,i)=><li key={i}>
                  {isRecord(time) ? <><b>{textOf(time.window)}</b><span>{textOf(time.reason)}</span><small>{textOf(time.type)}</small></> : <AIContent value={time}/>}
                </li>)}</ul> : <p className={styles.muted}>A IA não sugeriu horários.</p>}
                <p className={styles.smallPrint}>Horário de postagem orgânica e veiculação paga são coisas diferentes. Teste, não trate como garantia.</p>
              </article>
              <ResultCard title="Orçamento e plano de teste" value={strategy.budgetAdvice} copy/>
            </div>
            <div className={styles.twoColumns}>
              <Bullets title="Testes recomendados" items={strategy.experiments}/>
              <Bullets title="O que acompanhar" items={strategy.kpis}/>
              <Bullets title="Alertas antes de investir" items={strategy.warnings} tone="warn"/>
              <ResultCard title="Confiança nas recomendações" value={strategy.confidence}/>
            </div>
          </div>}
        </div>
      </div> : <div className={styles.emptyState}><Megaphone size={27}/><h3>Um plano de anúncio fácil de executar</h3><p>Quando você gerar o plano, verá três textos independentes, público, regiões, configurações por canal e horários para testar.</p></div>}
    </Section>
    <footer className={styles.footer}><Lightbulb size={16}/><p>Versão de testes locais. Nenhum anúncio é publicado automaticamente; não há consulta a estatísticas oficiais de estabelecimentos e nenhum resultado é garantido. Para produção, a API precisa de autenticação de sessão verificável.</p></footer>
  </main>;
}
