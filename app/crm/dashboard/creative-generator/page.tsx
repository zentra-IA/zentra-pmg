"use client";

import { useMemo, useState } from "react";

type CreativeResult = {
  success?: boolean;
  headline?: string;
  subheadline?: string;
  offerLine?: string;
  benefitBullets?: string[];
  cta?: string;
  statusText?: string;
  instagramCaption?: string;
  whatsappText?: string;
  shortCopy?: string;
  hashtags?: string;
  designDirection?: string;
  imagePrompt?: string;
  imageUrl?: string | null;
  imageError?: string | null;
  imageModel?: string;
  imageSize?: string;
};

const CREATIVE_TYPES = [
  "Produto em promoção",
  "Oferta relâmpago",
  "Combo de produtos",
  "Queima de estoque",
  "Novidade no catálogo",
  "Reativação de cliente",
  "Cotação para cliente",
  "Status WhatsApp",
  "Story Instagram",
  "Post feed",
];

const OBJECTIVES = [
  "Vender mais",
  "Gerar pedido no WhatsApp",
  "Reativar cliente",
  "Divulgar promoção",
  "Apresentar produto novo",
  "Aumentar ticket médio",
];

const PRODUCT_CATEGORIES = [
  "Laticínios",
  "Frios e embutidos",
  "Mercearia",
  "Bebidas",
  "Congelados",
  "Açougue",
  "Padaria",
  "Higiene e limpeza",
  "Hortifruti",
  "Descartáveis",
  "Pet",
  "Outros",
];

const IMAGE_STYLES = [
  "Foto realista premium",
  "Varejo atacadista chamativo",
  "Catálogo limpo profissional",
  "Supermercado moderno",
  "Food service apetitoso",
  "Oferta popular de alto impacto",
];

const TONES = [
  "Profissional",
  "Direto e vendedor",
  "Urgente",
  "Premium",
  "Popular",
  "Amigável",
];

const FORMATS = [
  { value: "story", label: "Stories/Status 9:16", width: 1080, height: 1920 },
  { value: "feed", label: "Feed 1:1", width: 1080, height: 1080 },
  { value: "wide", label: "Banner 16:9", width: 1600, height: 900 },
];

const COLOR_PRESETS = [
  { label: "PMG Verde", value: "#0f8f45" },
  { label: "Oferta Amarelo", value: "#f6c400" },
  { label: "Atacado Azul", value: "#2563eb" },
  { label: "Premium Preto", value: "#111827" },
  { label: "Urgente Vermelho", value: "#dc2626" },
  { label: "Laticínios Dourado", value: "#d4a017" },
];

function copy(text: string) {
  navigator.clipboard.writeText(text || "");
  alert("Copiado para a área de transferência.");
}

function formatLabel(value: string) {
  return FORMATS.find((x) => x.value === value)?.label || value;
}

function getFormatConfig(value: string) {
  return FORMATS.find((x) => x.value === value) || FORMATS[0];
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = String(text || "").split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }

  if (line) lines.push(line);
  return lines;
}

async function downloadImageComposition(form: any, result: CreativeResult) {
  const cfg = getFormatConfig(form.format);
  const canvas = document.createElement("canvas");
  canvas.width = cfg.width;
  canvas.height = cfg.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return alert("Não foi possível preparar a imagem.");

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (result?.imageUrl) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = result.imageUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (canvas.width - w) / 2;
      const y = (canvas.height - h) / 2;
      ctx.drawImage(img, x, y, w, h);
    } catch {
      // Mantém o fundo se a imagem não carregar.
    }
  }

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "rgba(0,0,0,.72)");
  gradient.addColorStop(0.52, "rgba(0,0,0,.22)");
  gradient.addColorStop(1, "rgba(0,0,0,.82)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const accent = form.dominantColor || "#0f8f45";
  const pad = Math.round(canvas.width * 0.07);
  const top = Math.round(canvas.height * 0.08);

  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(pad, top, Math.round(canvas.width * 0.42), Math.round(canvas.height * 0.055), 999);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.textBaseline = "top";
  ctx.font = `900 ${Math.round(canvas.width * 0.036)}px Arial`;
  ctx.fillText((form.topText || "OFERTA PMG").toUpperCase(), pad + 28, top + Math.round(canvas.height * 0.012));

  ctx.fillStyle = "#fff";
  ctx.font = `900 ${Math.round(canvas.width * 0.095)}px Arial`;
  const titleLines = wrapText(ctx, result.headline || form.productName || "Produto em destaque", canvas.width - pad * 2).slice(0, 3);
  let y = top + Math.round(canvas.height * 0.12);
  titleLines.forEach((line) => {
    ctx.fillText(line.toUpperCase(), pad, y);
    y += Math.round(canvas.width * 0.105);
  });

  ctx.fillStyle = "#fef3c7";
  ctx.font = `800 ${Math.round(canvas.width * 0.043)}px Arial`;
  const subLines = wrapText(ctx, result.subheadline || form.bottomText || "Condição especial para clientes PMG", canvas.width - pad * 2).slice(0, 3);
  subLines.forEach((line) => {
    ctx.fillText(line, pad, y + 14);
    y += Math.round(canvas.width * 0.052);
  });

  const price = form.price || result.offerLine;
  if (price) {
    const boxH = Math.round(canvas.height * 0.09);
    const boxW = Math.round(canvas.width * 0.52);
    const boxY = canvas.height - pad - boxH - 100;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(pad, boxY, boxW, boxH, 28);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.font = `900 ${Math.round(canvas.width * 0.05)}px Arial`;
    ctx.fillText(String(price).toUpperCase(), pad + 30, boxY + Math.round(boxH * 0.24));
  }

  ctx.fillStyle = "#fff";
  ctx.font = `800 ${Math.round(canvas.width * 0.032)}px Arial`;
  ctx.fillText(form.companyName || "PMG Atacadista", pad, canvas.height - pad - 42);

  ctx.fillStyle = "#e2e8f0";
  ctx.font = `700 ${Math.round(canvas.width * 0.026)}px Arial`;
  ctx.fillText(form.sellerWhatsapp ? `WhatsApp: ${form.sellerWhatsapp}` : "Fale com seu vendedor PMG", pad, canvas.height - pad);

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png", 1);
  link.download = `criativo-pmg-${(form.productName || "produto").replace(/\s+/g, "-").toLowerCase()}.png`;
  link.click();
}

const styles = {
  page: { padding: 24, color: "#0f172a" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    marginBottom: 18,
    padding: 22,
    borderRadius: 24,
    background: "#fff",
    border: "1px solid rgba(15,23,42,.08)",
    boxShadow: "0 16px 40px rgba(15,23,42,.06)",
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 16,
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(135deg,#0f8f45,#ef4444)",
    color: "#fff",
    fontWeight: 950,
    fontSize: 13,
  },
  kicker: { margin: 0, color: "#0f8f45", fontWeight: 950, fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase" as const },
  title: { margin: "4px 0", fontSize: 32, lineHeight: 1, letterSpacing: "-.04em", fontWeight: 950 },
  subtitle: { margin: 0, maxWidth: 820, color: "#64748b", lineHeight: 1.55, fontWeight: 650 },
  layout: { display: "grid", gridTemplateColumns: "minmax(360px,560px) minmax(0,1fr)", gap: 16, alignItems: "start" },
  card: { background: "#fff", border: "1px solid rgba(15,23,42,.08)", borderRadius: 24, padding: 18, boxShadow: "0 16px 40px rgba(15,23,42,.05)" },
  sectionTitle: { margin: "0 0 4px", fontSize: 18, fontWeight: 950, letterSpacing: "-.02em" },
  sectionHint: { margin: "0 0 16px", color: "#64748b", fontSize: 13, fontWeight: 650 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  input: { width: "100%", border: "1px solid #dbe3ef", background: "#fff", padding: "12px 14px", borderRadius: 14, outline: "none", fontWeight: 750, color: "#0f172a" },
  label: { display: "block", fontSize: 12, color: "#475569", fontWeight: 950, marginBottom: 6 },
  primary: { border: 0, color: "#fff", background: "linear-gradient(135deg,#0f8f45,#16a34a)", padding: "13px 18px", borderRadius: 16, fontWeight: 950, cursor: "pointer", boxShadow: "0 14px 30px rgba(15,143,69,.24)" },
  secondary: { border: "1px solid rgba(15,143,69,.25)", color: "#0f8f45", background: "#fff", padding: "12px 15px", borderRadius: 16, fontWeight: 950, cursor: "pointer" },
  pill: { display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 999, background: "#ecfdf3", color: "#0f8f45", fontSize: 12, fontWeight: 950 },
  preview: { borderRadius: 24, minHeight: 560, overflow: "hidden", position: "relative" as const, border: "1px solid rgba(15,23,42,.08)", background: "#0f172a" },
  pre: { whiteSpace: "pre-wrap" as const, background: "#f8fafc", border: "1px solid #e2e8f0", padding: 16, borderRadius: 18, color: "#334155", fontWeight: 700, lineHeight: 1.55 },
} as const;

function Field({ label, children }: { label: string; children: any }) {
  return (
    <label>
      <span style={styles.label}>{label}</span>
      {children}
    </label>
  );
}

function PreviewCard({ form, result }: { form: any; result: CreativeResult | null }) {
  const headline = result?.headline || form.productName || "Produto em destaque";
  const subheadline = result?.subheadline || form.bottomText || "Condição especial para clientes PMG";
  const bullets = result?.benefitBullets?.length ? result.benefitBullets : String(form.benefits || "").split("\n").filter(Boolean).slice(0, 3);

  return (
    <div style={styles.preview}>
      {result?.imageUrl ? (
        <img src={result.imageUrl} alt="Imagem gerada" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : null}

      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,rgba(0,0,0,.78),rgba(0,0,0,.20),rgba(0,0,0,.82))" }} />

      <div style={{ position: "relative", minHeight: 560, padding: 30, display: "flex", flexDirection: "column", justifyContent: "space-between", color: "#fff" }}>
        <div>
          <div style={{ display: "inline-flex", background: form.dominantColor, color: "#fff", borderRadius: 999, padding: "9px 14px", fontWeight: 950, fontSize: 13 }}>
            {(form.topText || "OFERTA PMG").toUpperCase()}
          </div>

          <h2 style={{ margin: "28px 0 12px", fontSize: 54, lineHeight: .95, letterSpacing: "-.06em", fontWeight: 950, textTransform: "uppercase" }}>
            {headline}
          </h2>

          <p style={{ margin: 0, maxWidth: 560, fontSize: 21, lineHeight: 1.25, color: "#fef3c7", fontWeight: 850 }}>
            {subheadline}
          </p>
        </div>

        <div>
          {bullets.length ? (
            <div style={{ display: "grid", gap: 8, marginBottom: 18 }}>
              {bullets.slice(0, 3).map((b, idx) => (
                <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 850 }}>
                  <span style={{ color: "#22c55e" }}>✓</span>
                  <span>{b}</span>
                </div>
              ))}
            </div>
          ) : null}

          {(form.price || result?.offerLine) ? (
            <div style={{ display: "inline-flex", padding: "14px 18px", borderRadius: 18, background: form.dominantColor, color: "#fff", fontSize: 22, fontWeight: 950, marginBottom: 18 }}>
              {form.price || result?.offerLine}
            </div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 950, fontSize: 22 }}>{form.companyName || "PMG Atacadista"}</div>
              <div style={{ color: "#e2e8f0", fontWeight: 750 }}>{form.sellerWhatsapp || "Fale com seu vendedor PMG"}</div>
            </div>
            <div style={{ background: "#fff", color: "#0f172a", padding: "10px 14px", borderRadius: 14, fontWeight: 950 }}>
              {result?.cta || "Pedir cotação"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CreativeGeneratorPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"texto" | "detalhes">("texto");
  const [form, setForm] = useState({
    creativeType: "Produto em promoção",
    objective: "Vender mais",
    productCategory: "Laticínios",
    imageStyle: "Foto realista premium",
    tone: "Direto e vendedor",
    format: "story",
    productName: "",
    brand: "PMG",
    price: "",
    benefits: "",
    targetClient: "Mercados, padarias, pizzarias e restaurantes",
    companyName: "PMG Atacadista",
    sellerWhatsapp: "",
    dominantColor: "#0f8f45",
    topText: "OFERTA ESPECIAL PMG",
    bottomText: "Condição especial para clientes PMG",
    extra: "",
    generateMode: "image_text",
  });
  const [result, setResult] = useState<CreativeResult | null>(null);

  const payload = useMemo(() => ({
    ...form,
    prompt: `
Crie um criativo comercial profissional para vendedores da PMG Atacadista divulgarem produtos no WhatsApp, Instagram, status e campanhas.
Produto: ${form.productName}
Categoria: ${form.productCategory}
Objetivo: ${form.objective}
Tipo: ${form.creativeType}
Formato: ${formatLabel(form.format)}
Preço/condição: ${form.price}
Benefícios: ${form.benefits}
Cliente ideal: ${form.targetClient}
Tom: ${form.tone}
Estilo visual: ${form.imageStyle}
Cor predominante: ${form.dominantColor}
Texto superior: ${form.topText}
Texto inferior: ${form.bottomText}
Empresa: ${form.companyName}
WhatsApp vendedor: ${form.sellerWhatsapp}
Instruções extras: ${form.extra}
`.trim(),
  }), [form]);

  async function generateCreative() {
    if (!form.productName.trim() && !form.extra.trim()) {
      return alert("Informe o produto ou descreva o que deseja criar.");
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/creative-generator/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) return alert(data.error || "Erro ao gerar criativo.");

      setResult(data.result || data);
    } finally {
      setLoading(false);
    }
  }

  async function saveCreative() {
    if (!result) return;
    setSaving(true);

    try {
      const res = await fetch("/api/creative-generator/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ payload, result }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) return alert(data.error || "Erro ao salvar.");

      alert("Criativo salvo.");
    } finally {
      setSaving(false);
    }
  }

  const fullText = result
    ? `${result.statusText || ""}

${result.instagramCaption || ""}

${result.whatsappText || ""}

${result.hashtags || ""}`.trim()
    : "";

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={styles.logo}>PMG</div>
          <div>
            <p style={styles.kicker}>Zentra Sales AI</p>
            <h1 style={styles.title}>Gerador de Criativos IA</h1>
            <p style={styles.subtitle}>
              Crie artes e textos profissionais para vendedores divulgarem produtos da PMG em poucos segundos.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "end" }}>
          <span style={styles.pill}>Imagem + texto comercial</span>
          <button style={styles.primary} onClick={generateCreative} disabled={loading}>
            {loading ? "Gerando criativo..." : "Gerar criativo com IA"}
          </button>
        </div>
      </section>

      <section style={styles.layout}>
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Informações do produto</h2>
          <p style={styles.sectionHint}>Quanto mais específico, melhor a IA monta a arte e os textos de venda.</p>

          <div style={styles.grid2}>
            <Field label="Tipo de criativo">
              <select style={styles.input} value={form.creativeType} onChange={(e) => setForm({ ...form, creativeType: e.target.value })}>
                {CREATIVE_TYPES.map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>

            <Field label="Objetivo">
              <select style={styles.input} value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })}>
                {OBJECTIVES.map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>

            <Field label="Categoria">
              <select style={styles.input} value={form.productCategory} onChange={(e) => setForm({ ...form, productCategory: e.target.value })}>
                {PRODUCT_CATEGORIES.map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>

            <Field label="Estilo da imagem">
              <select style={styles.input} value={form.imageStyle} onChange={(e) => setForm({ ...form, imageStyle: e.target.value })}>
                {IMAGE_STYLES.map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>

            <Field label="Produto">
              <input style={styles.input} value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} placeholder="Ex: Muçarela, requeijão, arroz..." />
            </Field>

            <Field label="Marca / linha">
              <input style={styles.input} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Ex: Frimesa, PMG, marca própria..." />
            </Field>

            <Field label="Preço / condição">
              <input style={styles.input} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Ex: R$ 20,00 por kg / caixa fechada" />
            </Field>

            <Field label="Cliente ideal">
              <input style={styles.input} value={form.targetClient} onChange={(e) => setForm({ ...form, targetClient: e.target.value })} placeholder="Ex: pizzarias, mercados, padarias..." />
            </Field>

            <Field label="Tom da comunicação">
              <select style={styles.input} value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })}>
                {TONES.map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>

            <Field label="Formato">
              <select style={styles.input} value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>
                {FORMATS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </Field>
          </div>

          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            <Field label="Benefícios / diferenciais">
              <textarea style={{ ...styles.input, minHeight: 82 }} value={form.benefits} onChange={(e) => setForm({ ...form, benefits: e.target.value })} placeholder={"Ex:\nDerrete melhor\nÓtimo rendimento\nIdeal para pizza e lanche"} />
            </Field>

            <div style={styles.grid2}>
              <Field label="Texto superior da arte">
                <input style={styles.input} value={form.topText} onChange={(e) => setForm({ ...form, topText: e.target.value })} />
              </Field>

              <Field label="Texto inferior / CTA">
                <input style={styles.input} value={form.bottomText} onChange={(e) => setForm({ ...form, bottomText: e.target.value })} />
              </Field>
            </div>

            <div style={styles.grid2}>
              <Field label="Empresa">
                <input style={styles.input} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
              </Field>

              <Field label="WhatsApp do vendedor">
                <input style={styles.input} value={form.sellerWhatsapp} onChange={(e) => setForm({ ...form, sellerWhatsapp: e.target.value })} placeholder="Ex: (19) 99999-9999" />
              </Field>
            </div>

            <Field label="Cor predominante">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setForm({ ...form, dominantColor: c.value })}
                    style={{
                      border: form.dominantColor === c.value ? "2px solid #0f172a" : "1px solid #dbe3ef",
                      background: "#fff",
                      borderRadius: 999,
                      padding: "8px 10px",
                      cursor: "pointer",
                      fontWeight: 850,
                      color: "#334155",
                    }}
                  >
                    <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 999, background: c.value, marginRight: 6, verticalAlign: -1 }} />
                    {c.label}
                  </button>
                ))}
                <input type="color" value={form.dominantColor} onChange={(e) => setForm({ ...form, dominantColor: e.target.value })} style={{ width: 50, height: 38, border: "1px solid #dbe3ef", borderRadius: 12, background: "#fff" }} />
              </div>
            </Field>

            <Field label="Instruções adicionais">
              <textarea style={{ ...styles.input, minHeight: 76 }} maxLength={500} value={form.extra} onChange={(e) => setForm({ ...form, extra: e.target.value })} placeholder="Ex: fundo com pizza, mesa de supermercado, iluminação quente, sem pessoas..." />
            </Field>

            <button style={{ ...styles.primary, width: "100%", marginTop: 4 }} onClick={generateCreative} disabled={loading}>
              {loading ? "Gerando imagem e textos..." : "🚀 Gerar criativo com IA"}
            </button>
          </div>
        </div>

        <div style={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", marginBottom: 14 }}>
            <div>
              <h2 style={styles.sectionTitle}>Resultado do criativo</h2>
              <p style={styles.sectionHint}>{result ? "Imagem e textos prontos para o vendedor usar." : "O preview será montado aqui."}</p>
            </div>
            {result ? <span style={styles.pill}>Geração concluída</span> : null}
          </div>

          {!result ? (
            <div style={{ padding: 46, borderRadius: 22, background: "#f8fafc", border: "1px dashed #cbd5e1", textAlign: "center", color: "#64748b", fontWeight: 850 }}>
              Preencha o produto, benefícios e condição. A IA vai criar uma imagem comercial e textos para WhatsApp/Instagram.
            </div>
          ) : (
            <>
              {result.imageError ? (
                <div style={{ marginBottom: 12, padding: 12, borderRadius: 14, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", fontWeight: 800 }}>
                  {result.imageError}
                </div>
              ) : null}

              <PreviewCard form={form} result={result} />

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                <button style={styles.primary} onClick={() => downloadImageComposition(form, result)}>Baixar imagem pronta</button>
                <button style={styles.secondary} onClick={() => copy(fullText)}>Copiar todos os textos</button>
                <button style={styles.secondary} onClick={saveCreative} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button>
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <button style={activeTab === "texto" ? styles.primary : styles.secondary} onClick={() => setActiveTab("texto")}>Texto gerado</button>
                  <button style={activeTab === "detalhes" ? styles.primary : styles.secondary} onClick={() => setActiveTab("detalhes")}>Direção criativa</button>
                </div>

                {activeTab === "texto" ? (
                  <div style={styles.pre}>
                    <strong>WhatsApp Status</strong>
                    {"\n"}{result.statusText || "-"}
                    {"\n\n"}<strong>Legenda Instagram/Facebook</strong>
                    {"\n"}{result.instagramCaption || "-"}
                    {"\n\n"}<strong>Mensagem WhatsApp</strong>
                    {"\n"}{result.whatsappText || "-"}
                    {"\n\n"}<strong>Hashtags</strong>
                    {"\n"}{result.hashtags || "-"}
                  </div>
                ) : (
                  <div style={styles.pre}>
                    <strong>Direção de design</strong>
                    {"\n"}{result.designDirection || "-"}
                    {"\n\n"}<strong>Prompt de imagem</strong>
                    {"\n"}{result.imagePrompt || "-"}
                    {"\n\n"}<strong>Modelo</strong>
                    {"\n"}{result.imageModel || "-"} {result.imageSize ? `• ${result.imageSize}` : ""}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
