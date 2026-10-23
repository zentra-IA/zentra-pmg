"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  ArrowRight, Check, Clipboard, ChevronDown, Clock3, FileText, ImagePlus,
  Info, Lightbulb, MapPin, Megaphone, RefreshCw, Search, ShieldCheck,
  Sparkles, Target, Upload, WandSparkles, Palette, BadgeCheck, AlertTriangle, Smartphone,
  Image as ImageIcon, X
} from "lucide-react";
import styles from "./ads-ia.module.css";

type Action = "prompt" | "review" | "strategy" | "radar";
type PlanTab = "copies" | "audience" | "platforms" | "checklist";
type BrandMode = "post" | "produto" | "institucional";
type CreativeFormat = "1:1" | "4:5" | "9:16";
type Draft = {
  brandMode: BrandMode; includeLogo: boolean;
  brandHeadline: string; brandCTA: string; creativeFormat: CreativeFormat;
  business: string; segment: string; products: string; goal: string;
  offer: string; advantages: string; platform: string; state: string;
  regions: string; cities: string; neighborhoods: string; delivery: string;
  dailyBudget: number; days: number; notes: string;
};
type PromptResult = { prompt?: unknown; alternatives?: unknown; why?: unknown; formatTips?: unknown; onImageText?: unknown; postCaption?: unknown };
type ReviewResult = {
  verdict?: unknown; score?: unknown; strengths?: unknown; issues?: unknown;
  platformFit?: unknown; correctionPrompt?: unknown; observations?: unknown;
  brandScore?: unknown; b2bScore?: unknown; clarityScore?: unknown; ctaScore?: unknown;
  checks?: unknown; fixSteps?: unknown;
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
  brandMode: "post", includeLogo: true, brandHeadline: "",
  brandCTA: "Peça sua cotação pelo WhatsApp", creativeFormat: "4:5",
  business: "PMG", segment: "Pizzarias", products: "Muçarela, calabresa e proteínas",
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

/**
 * Imagens de criativos comerciais frequentemente ultrapassam 3 MB.
 * Reduz somente as maiores para que a avaliação funcione sem editar
 * ou destruir o arquivo original no computador do usuário.
 */
async function prepareCreativeImage(file: File): Promise<{ data: string; resized: boolean }> {
  if (file.size <= 3_000_000) {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string"
        ? resolve({ data: reader.result, resized: false })
        : reject(new Error("Não foi possível ler a imagem."));
      reader.onerror = () => reject(new Error("Falha ao abrir a imagem."));
      reader.readAsDataURL(file);
    });
  }
  if (file.size > 16_000_000) throw new Error("Imagem acima de 16 MB. Reduza antes de enviar.");
  const localUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const node = new window.Image();
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error("Não foi possível abrir esta imagem para otimização."));
      node.src = localUrl;
    });
    const ratio = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Seu navegador não conseguiu otimizar a imagem.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const optimized = canvas.toDataURL("image/jpeg", 0.83);
    if (optimized.length * 0.75 > 3_000_000) {
      throw new Error("Imagem continua acima do limite. Salve uma cópia JPG mais leve.");
    }
    return { data: optimized, resized: true };
  } finally {
    URL.revokeObjectURL(localUrl);
  }
}
function roundedFill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath(); ctx.fill();
}
function loadCanvasImage(data: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível abrir a imagem para montar a arte."));
    img.src = data;
  });
}
function fitTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const tokens = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of tokens) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line); line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const result = lines.slice(0,maxLines);
    let last = result[maxLines-1];
    while (last.length > 1 && ctx.measureText(last + "…").width > maxWidth) last = last.slice(0,-1);
    result[maxLines-1] = last + "…";
    return result;
  }
  return lines;
}
/** A composição local do logo nao substitui avaliacao de design ou veracidade da oferta. */
async function composeBrandedCreative(
  photoData: string, logoData: string | null,
  data: { business: string; headline: string; cta: string; segment: string; format: CreativeFormat; includeLogo: boolean }
): Promise<{ downloadData: string; reviewData: string }> {
  const [photo, logo] = await Promise.all([
    loadCanvasImage(photoData),
    logoData ? loadCanvasImage(logoData) : Promise.resolve(null),
  ]);
  const canvas = document.createElement("canvas");
  const width = 1080;
  const height = data.format === "9:16" ? 1920 : data.format === "1:1" ? 1080 : 1350;
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não suporta composição de imagem.");
  const scale = Math.max(width / photo.naturalWidth, height / photo.naturalHeight);
  const cropWidth = width / scale, cropHeight = height / scale;
  ctx.drawImage(photo, (photo.naturalWidth-cropWidth)/2, (photo.naturalHeight-cropHeight)/2,
    cropWidth, cropHeight, 0, 0, width, height);
  const topGradient = ctx.createLinearGradient(0,0,0,290);
  topGradient.addColorStop(0,"rgba(8,26,24,.85)");
  topGradient.addColorStop(1,"rgba(8,26,24,0)");
  ctx.fillStyle = topGradient; ctx.fillRect(0,0,width,300);
  const bottomGradient = ctx.createLinearGradient(0,height*.43,0,height);
  bottomGradient.addColorStop(0,"rgba(7,30,27,0)");
  bottomGradient.addColorStop(.35,"rgba(7,30,27,.76)");
  bottomGradient.addColorStop(1,"rgba(7,30,27,.96)");
  ctx.fillStyle = bottomGradient; ctx.fillRect(0,height*.43,width,height*.57);
  if (data.includeLogo && logo) {
    ctx.fillStyle="#fff";
    roundedFill(ctx,57,55,280,135,18);
    const fit=Math.min(265/logo.naturalWidth,120/logo.naturalHeight);
    const logoW=logo.naturalWidth*fit,logoH=logo.naturalHeight*fit;
    ctx.drawImage(logo,57+(280-logoW)/2,55+(135-logoH)/2,logoW,logoH);
  } else {
    ctx.fillStyle="#fff"; ctx.font="900 57px Arial, sans-serif";
    ctx.fillText(data.business.toUpperCase().slice(0,18),60,133,610);
  }
  ctx.fillStyle="#d9f7dc"; ctx.font="700 28px Arial, sans-serif";
  const subheading=`FORNECIMENTO PARA ${data.segment.toUpperCase()}`.slice(0,70);
  ctx.fillText(subheading,60,height-440,960);
  ctx.fillStyle="#fff"; ctx.font="bold 68px Arial, sans-serif";
  const lines=fitTextLines(ctx,data.headline,944,3);
  lines.forEach((line,i)=>ctx.fillText(line,60,height-357+(i*79),944));
  const ctaY=height-112;
  ctx.fillStyle="#c9f478"; roundedFill(ctx,57,ctaY-76,966,92,17);
  ctx.fillStyle="#173d30"; ctx.font="bold 35px Arial, sans-serif";
  ctx.textAlign="center";
  ctx.fillText(data.cta,540,ctaY-18,900);
  ctx.textAlign="left";
  return { downloadData: canvas.toDataURL("image/png"), reviewData: canvas.toDataURL("image/jpeg",.84) };
}

function ReviewChecks({ items }: { items: unknown }) {
  const checks = listOf(items).filter(isRecord);
  if (!checks.length) return null;
  return <div className={styles.checksPanel}>
    <div className={styles.sectionMiniTitle}><BadgeCheck size={18}/><h3>Checklist de prontidão do criativo</h3></div>
    <div className={styles.checkGrid}>
      {checks.map((check, i) => {
        const status = textOf(check.status).toLowerCase();
        const good = status === "ok" || status === "aprovado";
        const neutral = status.includes("verific") || status === "unknown";
        return <article key={i} className={`${styles.checkItem} ${good ? styles.checkOk : neutral ? styles.checkUnknown : styles.checkFix}`}>
          <span className={styles.checkSymbol}>{good ? <Check size={15}/> : neutral ? <Info size={15}/> : <AlertTriangle size={15}/>}</span>
          <div><h4>{textOf(check.label) || `Critério ${i + 1}`}</h4>
            <p>{textOf(check.evidence)}</p>
            {!good && textOf(check.fix) && <small><b>Como melhorar:</b> {textOf(check.fix)}</small>}
          </div>
        </article>;
      })}
    </div>
  </div>;
}
function Metric({ label, value }: { label: string; value: unknown }) {
  const n = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(n)) return null;
  return <div className={styles.reviewMetric}><strong>{Math.max(0, Math.min(10, n)).toFixed(1)}<small>/10</small></strong><span>{label}</span></div>;
}

export default function AdsIaPage() {
  const [draft, setDraft] = useState<Draft>(INITIAL);
  const [hydrated, setHydrated] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [logoImage, setLogoImage] = useState<string | null>(null);
  const [logoName, setLogoName] = useState("");
  const [editorMessage, setEditorMessage] = useState("");
  const [editingCreative, setEditingCreative] = useState(false);
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
        if (isRecord(stored)) {
          const next = { ...INITIAL, ...stored };
          if (!next.business?.trim()) next.business = "PMG";
          setDraft(next);
        }
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
          logoProvided: Boolean(logoImage),
          ...(action === "review" ? { image, logoImage } : {}),
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
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    setErrorAction("review");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Use uma imagem JPG, PNG ou WEBP."); return;
    }
    setError(""); setEditorMessage(""); setReview(null); setStrategy(null); setImage(null);
    setImageName("Preparando " + file.name + "...");
    try {
      const prepared = await prepareCreativeImage(file);
      setImage(prepared.data);
      setImageName(file.name + (prepared.resized ? " · otimizada para análise" : ""));
    } catch (caught) {
      setImageName("");
      setError(caught instanceof Error ? caught.message : "Não foi possível preparar a imagem.");
    }
  }
  function uploadLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setErrorAction("prompt");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("O logo precisa ser JPG, PNG ou WEBP. Arquivos SVG não são aceitos aqui.");
      event.target.value = "";
      return;
    }
    if (file.size > 700_000) {
      setError("Logo muito grande. Use uma versão otimizada de até 700 KB.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setLogoImage(reader.result);
      setLogoName(file.name);
      setError("");
      setReview(null); // A referencia de logo anterior nao deve validar outra marca.
    };
    reader.onerror = () => setError("Não foi possível carregar o logo.");
    reader.readAsDataURL(file);
    event.target.value = "";
  }
  const brandName = draft.business?.trim() || "PMG";
  const imageText = isRecord(prompt?.onImageText) ? prompt.onImageText : null;
  const adHeadline = textOf(imageText?.headline) || draft.brandHeadline || `Abasteça seu negócio com ${brandName}`;
  const adCTA = textOf(imageText?.cta) || draft.brandCTA.trim() || "Peça sua cotação pelo WhatsApp";

  async function finishArtLocally() {
    if (!image || editingCreative) return;
    setEditorMessage("");
    setErrorAction("review");
    if (draft.includeLogo && !logoImage) {
      setError("Para aplicar o logo oficial, selecione antes o arquivo no Estúdio da marca.");
      return;
    }
    setEditingCreative(true);
    setError("");
    try {
      const result = await composeBrandedCreative(image, logoImage, {
        business: brandName, headline: adHeadline, cta: adCTA,
        segment: draft.segment, format: draft.creativeFormat, includeLogo: draft.includeLogo,
      });
      const link = document.createElement("a");
      link.href = result.downloadData;
      link.download = `criativo-${brandName.toLowerCase().replace(/[^a-z0-9-]/g,"-").slice(0,32)}.png`;
      document.body.appendChild(link); link.click(); link.remove();
      setImage(result.reviewData);
      setImageName(`Arte ${brandName} finalizada · pronta para avaliação`);
      setReview(null); setStrategy(null);
      setEditorMessage("Arte com identidade e CTA montada e salva no seu computador. Agora avalie a versão final.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível montar a arte.");
    } finally { setEditingCreative(false); }
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
        <p>Peças comerciais com sua marca, textos prontos e revisão B2B. Do briefing ao anúncio sem ficar refazendo imagem genérica.</p>
        <div className={styles.heroTags}><span><Check size={14}/> Marca em primeiro lugar</span><span><Check size={14}/> Revisão de 5 critérios</span><span><Check size={14}/> 3 anúncios para copiar</span></div>
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
        <div className={styles.brandStudio}>
          <div className={styles.brandStudioHead}>
            <div className={styles.brandIcon}><Palette size={20}/></div>
            <div><span className={styles.cardEyebrow}>IDENTIDADE DA PEÇA</span><h3>Estúdio da marca</h3><p>O prompt já sai com cara de anúncio da sua empresa, não uma foto genérica de comida.</p></div>
            <span className={styles.brandDefault}><Check size={13}/> Padrão comercial</span>
          </div>
          <div className={styles.brandGrid}>
            <div className={styles.brandControls}>
              <div className={styles.formGrid}>
                <label>Marca anunciante
                  <input className={styles.input} value={draft.business} onChange={e=>field("business",e.target.value)} placeholder="PMG"/>
                </label>
                <label>Formato da arte
                  <select className={styles.input} value={draft.creativeFormat} onChange={e=>field("creativeFormat", e.target.value as CreativeFormat)}>
                    <option value="4:5">Feed vertical · 4:5</option>
                    <option value="1:1">Feed quadrado · 1:1</option>
                    <option value="9:16">Stories e Reels · 9:16</option>
                  </select>
                </label>
              </div>
              <div className={styles.modeLabel}>Tipo de criativo</div>
              <div className={styles.modeGrid} role="group" aria-label="Tipo de criativo">
                {([
                  ["post", "Post comercial", "Título + marca + CTA"],
                  ["produto", "Imagem de apoio", "Produto com área de texto"],
                  ["institucional", "Marca institucional", "Confiança e abastecimento"],
                ] as const).map(([id, title, sub]) =>
                  <button type="button" key={id} aria-pressed={draft.brandMode===id} className={`${styles.modeButton} ${draft.brandMode===id ? styles.modeActive : ""}`} onClick={()=>field("brandMode",id)}>
                    <b>{title}</b><span>{sub}</span>
                  </button>
                )}
              </div>
              <div className={styles.brandFormSplit}>
                <label>Título na imagem <small>(opcional)</small>
                  <input className={styles.input} value={draft.brandHeadline} onChange={e=>field("brandHeadline",e.target.value)} placeholder={`Ex.: Ingredientes para sua ${draft.segment.toLowerCase()}`}/>
                </label>
                <label>Chamada para ação
                  <input className={styles.input} value={draft.brandCTA} onChange={e=>field("brandCTA",e.target.value)} placeholder="Peça sua cotação pelo WhatsApp"/>
                </label>
              </div>
              <div className={styles.logoControl}>
                <label className={styles.toggleLabel}>
                  <input type="checkbox" checked={draft.includeLogo} onChange={e=>field("includeLogo",e.target.checked)}/>
                  <span>Exigir logo oficial no criativo</span>
                </label>
                {draft.includeLogo && <div className={styles.logoUploader}>
                  <label className={styles.logoUploadButton}>
                    <ImagePlus size={16}/>{logoName ? "Trocar referência" : "Selecionar logo oficial"}
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadLogo}/>
                  </label>
                  <span className={styles.logoUploadState}>{logoName ? `Arquivo: ${logoName}` : "PNG/JPG/WEBP até 700 KB"}</span>
                  {logoImage && <button type="button" className={styles.logoRemove} title="Remover logo" onClick={()=>{setLogoImage(null);setLogoName("");setReview(null)}}><X size={15}/></button>}
                </div>}
                <p className={styles.brandHint}>{draft.includeLogo
                  ? "Na hora de gerar no ChatGPT, anexe também o arquivo original do logo. Escrever PMG no prompt não substitui o logotipo oficial."
                  : "A marca poderá aparecer em texto, mas o logotipo não será exigido."}</p>
              </div>
            </div>
            <div className={styles.previewCol}>
              <div className={styles.previewHead}><Smartphone size={15}/> Prévia da hierarquia <span>não é a imagem final</span></div>
              <div className={styles.adPreview}>
                <div className={styles.previewTop}>
                  {draft.includeLogo && logoImage ? <img src={logoImage} alt={`Logo de referência de ${brandName}`}/> : <span className={styles.previewBrand}>{brandName}</span>}
                  <small>FORNECIMENTO PARA NEGÓCIOS</small>
                </div>
                <div className={styles.previewText}>
                  <strong>{adHeadline}</strong>
                  <span>{textOf(imageText?.support) || `Produtos para ${draft.segment.toLowerCase()}. Solicite condições de fornecimento.`}</span>
                </div>
                <div className={styles.previewProduct}><ImageIcon size={31}/><span>Área visual do produto</span></div>
                <div className={styles.previewCTA}>{adCTA}</div>
              </div>
              <div className={styles.previewFoot}><ShieldCheck size={15}/> Anúncio B2B para compradores, não consumidores finais.</div>
            </div>
          </div>
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
            <label className={styles.full}>Oferta, se existir
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
            <span>Marca: <b>{brandName}</b></span>
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

    <Section id="imagem" num="02" title="Criativo comercial pronto para criar" description="Copie o briefing e cole no ChatGPT. Ele já pede marca, texto comercial, CTA e composição B2B.">
      {prompt ? <div className={styles.resultsStack}>
        <div className={styles.nextStepBar}>
          <div><span className={styles.cardEyebrow}>PASSO 1 · GERAR A ARTE</span>
            <h3>Seu briefing de imagem está pronto</h3>
            <p>Cole o prompt no ChatGPT e {draft.includeLogo ? <>anexe o <b>arquivo oficial do logo {brandName}</b> na mesma conversa.</> : "gere a imagem com o formato escolhido."}</p>
          </div>
          <CopyButton value={textOf(prompt.prompt)} label="Copiar briefing"/>
        </div>
        {draft.includeLogo && <Notice type={logoImage ? "info" : "warning"}><strong>{logoImage ? "Logo de referência selecionado." : "Ainda falta o logo oficial."}</strong> O Zentra prepara o texto; o arquivo do logo precisa ser anexado no ChatGPT para preservar a marca real. Não aceite logos recriados ou distorcidos.</Notice>}
        <ResultCard title="Prompt completo para ChatGPT" description="Contém composição comercial, público B2B, logotipo, texto exato, formato e CTA." value={prompt.prompt} copy emphasis/>
        {prompt.onImageText != null && <article className={styles.resultCard}>
          <div className={styles.cardTop}><div><h3>Textos previstos na arte</h3><p>Confira o que deverá ficar escrito antes de gerar.</p></div><CopyButton value={textOf(prompt.onImageText)}/></div>
          <AIContent value={prompt.onImageText}/>
        </article>}
        <ResultCard title="Legenda para acompanhar o post" description="Legenda sugerida; revise ofertas e informações antes de publicar." value={prompt.postCaption} copy/>
        {listOf(prompt.alternatives).length>0 && <details className={styles.resultDetails}><summary><WandSparkles size={17}/> Ver 2 versões alternativas da arte <ChevronDown size={16}/></summary>
          <div className={styles.twoColumns}>
            {listOf(prompt.alternatives).map((item,i)=><ResultCard key={i} title={`Versão alternativa ${i+1}`} value={item} copy/>)}
          </div>
        </details>}
        <details className={styles.resultDetails}><summary><Info size={17}/> Por que funciona e dicas de produção <ChevronDown size={16}/></summary>
          <div className={styles.twoColumns}>
            <Bullets title="Por que essa ideia funciona" items={prompt.why} tone="good"/>
            <Bullets title="Antes de publicar" items={prompt.formatTips}/>
          </div>
        </details>
        <button type="button" disabled={disabled} className={styles.secondaryButton} onClick={()=>run("prompt")}><RefreshCw size={16}/>{busy==="prompt"?"Gerando...":"Criar outro briefing com a marca"}</button>
      </div> : <div className={styles.emptyState}><Palette size={28}/><h3>Uma peça da {brandName}, não uma foto genérica</h3><p>O prompt já virá com direção comercial B2B, título, CTA e instruções para usar o logotipo oficial.</p><a href="#planejamento" className={styles.textLink}>Configurar marca e gerar <ArrowRight size={16}/></a></div>}
    </Section>

    <Section id="avaliar" num="03" title="Avalie e melhore o criativo" description="Envie a imagem gerada. Se ela não estiver boa, a IA explica o que mudar e cria outro prompt.">
      <Notice>O objetivo não é apenas uma foto bonita: confira se o criativo vende seus <b>produtos para estabelecimentos</b> e mostra a marca {brandName}, título e CTA. A análise usa IA e é uma avaliação editorial.</Notice>
      <div className={styles.uploadLayout}>
        <label className={styles.uploadZone}>
          <Upload size={28}/>
          <strong>{imageName || "Escolher imagem do anúncio"}</strong>
          <span>JPG, PNG ou WEBP · imagens acima de 3 MB são otimizadas</span>
          <small>A imagem não é salva no banco pelo módulo.</small>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={upload}/>
        </label>
        {image && <div className={styles.imagePreview}><img src={image} alt="Imagem escolhida para análise"/><span>Prévia do criativo</span></div>}
      </div>
      <div className={styles.actions}>
        <button type="button" disabled={!image || disabled || editingCreative} className={styles.primaryButton} onClick={()=>run("review")}><ImagePlus size={17}/>{busy==="review"?"Analisando imagem...":"Avaliar imagem com IA"}</button>
        <button type="button" disabled={!image || disabled || editingCreative} className={styles.secondaryButton} onClick={finishArtLocally}><Palette size={17}/>{editingCreative?"Montando arte...":"Aplicar marca + baixar PNG"}</button>
        {image && <button type="button" className={styles.secondaryButton} onClick={()=>{setImage(null);setImageName("");setReview(null);setStrategy(null)}}><RefreshCw size={16}/> Remover imagem</button>}
      </div>
      {error && errorAction==="review" && <div role="alert" className={styles.error}>{error}</div>}
      {editorMessage && <div role="status" className={styles.editorSuccess}><Check size={17}/>{editorMessage}</div>}
      {review && <div className={styles.reviewArea}>
        <div className={styles.reviewHeadline}>
          <div><span className={styles.cardEyebrow}>DIAGNÓSTICO DO CRIATIVO</span><h3>{textOf(review.verdict)||"Imagem analisada"}</h3><p>Nota editorial: avalia comunicação e visual, não prevê cliques ou vendas.</p></div>
          {Number.isFinite(Number(review.score)) && <div className={styles.scoreCircle}><strong>{Number(review.score).toFixed(1)}</strong><small>de 10</small></div>}
        </div>
        <div className={styles.metricGrid}>
          <Metric label="Aderência à marca" value={review.brandScore}/>
          <Metric label="Foco no cliente B2B" value={review.b2bScore}/>
          <Metric label="Clareza da mensagem" value={review.clarityScore}/>
          <Metric label="Chamada para ação" value={review.ctaScore}/>
        </div>
        <ReviewChecks items={review.checks}/>
        <div className={styles.twoColumns}>
          <Bullets title="O que vale manter" items={review.strengths} tone="good"/>
          <Bullets title="O que precisa mudar" items={review.issues} tone="warn"/>
        </div>
        <Bullets title="Próximas 3 melhorias — na ordem" items={review.fixSteps}/>
        <div className={styles.correctionIntro}><WandSparkles size={19}/><div><b>Correção pronta para colar</b><p>Não comece do zero. Abra o criativo original no ChatGPT, anexe o logo oficial e peça a edição com este prompt.</p></div></div>
        <ResultCard title="Prompt para corrigir a imagem existente" description="Especifica o que preservar e o que transformar para divulgar a marca como fornecedora B2B." value={review.correctionPrompt} copy emphasis/>
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
    <footer className={styles.footer}><Lightbulb size={16}/><p>O Zentra gera orientações e revisões editoriais, não publica anúncios nem garante vendas. Imagens enviadas para análise, inclusive o logo de referência, são encaminhadas à API de IA e não são salvas pelo Ads IA. O logo enviado nesta tela vale apenas durante esta visita; para usar no ChatGPT é necessário anexá-lo também lá. Produção permanece condicionada à ativação segura da API.</p></footer>
  </main>;
}
