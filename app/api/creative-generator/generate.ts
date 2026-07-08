import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const OPENAI_API_KEY =
  process.env.RH_OPENAI_API_KEY ||
  process.env.OPENAI_API_KEY ||
  process.env.OPENAI_SUPPORT_KEY ||
  "";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

function clean(value: any) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function onlyDigits(value: any) {
  return clean(value).replace(/\D/g, "");
}

function sizeByFormat(format: string) {
  if (format === "story") return "1024x1536";
  if (format === "wide") return "1536x1024";
  return "1024x1024";
}

function fallbackText(body: any) {
  const product = clean(body.productName) || "Produto em promoção";
  const price = clean(body.price);
  const benefits = clean(body.benefits);
  const target = clean(body.targetClient);
  const city = clean(body.city);
  const whatsapp = onlyDigits(body.sellerWhatsapp);
  const company = clean(body.companyName) || "nossa equipe";

  const condition = price ? ` por ${price}` : "";
  const location = city ? ` para ${city}` : "";
  const audience = target ? `Ideal para ${target}.` : "Ideal para clientes comerciais.";

  return {
    title: product,
    artText: `${product}${condition}`,
    statusText: `🔥 Oferta especial: ${product}${condition}.${location ? `\n📍 ${city}` : ""}\n${benefits ? `\n${benefits}` : ""}\n\nChame agora e garanta sua condição.`,
    instagramCaption: `🚨 Oferta comercial disponível\n\n${product}${condition}\n\n${audience}${benefits ? `\n\nDiferenciais:\n${benefits}` : ""}\n\nFale com ${company} e solicite sua cotação.${whatsapp ? `\nWhatsApp: ${whatsapp}` : ""}`,
    whatsappText: `Olá! Temos condição especial de ${product}${condition}.${city ? `\nRegião: ${city}` : ""}${benefits ? `\n${benefits}` : ""}\n\nQuer que eu te envie uma cotação?`,
    hashtags: "#oferta #atacado #distribuidora #promocao #varejo #compras #cotacao",
    cta: "Solicitar cotação",
    imagePrompt: `Arte comercial profissional para ${product}, foco em atacado/varejo, visual limpo, moderno, com destaque para produto e condição ${price || ""}.`,
  };
}

function extractJson(content: string) {
  const text = clean(content)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(text);
  } catch {}

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {}
  }

  return null;
}

async function generateTexts(body: any) {
  if (!OPENAI_API_KEY) return fallbackText(body);

  const prompt = `
Você é um especialista em marketing comercial B2B para atacadistas, distribuidores, representantes comerciais e vendas por WhatsApp.

Crie um criativo comercial em português do Brasil para vender/divulgar o produto abaixo.

Dados:
Tipo de criativo: ${clean(body.creativeType)}
Estilo: ${clean(body.style)}
Formato: ${clean(body.format)}
Produto: ${clean(body.productName)}
Preço/condição: ${clean(body.price)}
Cliente ideal: ${clean(body.targetClient)}
Cidade/região: ${clean(body.city)}
Benefícios/diferenciais: ${clean(body.benefits)}
Empresa: ${clean(body.companyName)}
WhatsApp do vendedor: ${clean(body.sellerWhatsapp)}
Texto superior da arte: ${clean(body.topText)}
Texto inferior da arte: ${clean(body.bottomText)}
Cor predominante: ${clean(body.dominantColor)}
Extras: ${clean(body.extra)}

Regras:
- NÃO escreva como vaga de emprego.
- NÃO fale em contratação, currículo, salário ou RH.
- Foque em venda, cotação, condição comercial, atacado, reposição de estoque e WhatsApp.
- Linguagem direta, comercial e clara.
- Gere texto pronto para copiar e usar.
- Retorne SOMENTE JSON válido, sem markdown.

Formato obrigatório:
{
  "title": "título curto da campanha",
  "artText": "texto principal curto para a arte",
  "statusText": "texto curto para WhatsApp Status",
  "instagramCaption": "legenda completa para Instagram/Facebook",
  "whatsappText": "mensagem curta para envio direto no WhatsApp",
  "hashtags": "hashtags relevantes",
  "cta": "chamada para ação curta",
  "imagePrompt": "prompt detalhado para gerar a imagem comercial"
}
`.trim();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.72,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Você cria campanhas comerciais B2B para atacado e vendas por WhatsApp. Responda somente JSON válido.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error("OPENAI TEXT ERROR:", JSON.stringify(data, null, 2));
    return fallbackText(body);
  }

  const content = data?.choices?.[0]?.message?.content || "";
  const parsed = extractJson(content);

  if (!parsed) return fallbackText(body);

  return {
    ...fallbackText(body),
    ...parsed,
  };
}

async function generateImage(body: any, texts: any) {
  if (!OPENAI_API_KEY) {
    return {
      imageUrl: null,
      imageError: "OPENAI_API_KEY/RH_OPENAI_API_KEY ausente.",
    };
  }

  const product = clean(body.productName) || clean(texts.title) || "Produto em destaque";
  const price = clean(body.price);
  const style = clean(body.style) || "Moderno";
  const format = clean(body.format) || "feed";
  const color = clean(body.dominantColor) || "#14883f";
  const topText = clean(body.topText) || "OFERTA ESPECIAL";
  const bottomText = clean(body.bottomText) || clean(texts.cta) || "Chame no WhatsApp";
  const imagePromptFromText = clean(texts.imagePrompt);

  const imagePrompt = `
Crie uma arte comercial premium para atacado/distribuidora.

Produto principal: ${product}
Condição/preço: ${price || "condição especial"}
Estilo visual: ${style}
Cor predominante: ${color}
Texto superior da arte: ${topText}
Texto inferior/CTA da arte: ${bottomText}

Direção de arte:
- visual profissional, limpo e moderno
- foco em venda por WhatsApp e cotação comercial
- pode usar elementos de varejo, mercado, distribuidora e produto em destaque
- composição com produto central e textos grandes legíveis
- aparência de anúncio comercial para Status/Instagram
- evitar aparência de vaga de emprego, recrutamento, currículo ou RH
- não usar logos ou marcas registradas
- não gerar texto pequeno demais
${imagePromptFromText ? `\nDetalhe adicional: ${imagePromptFromText}` : ""}
`.trim();

  const bodyPayload: any = {
    model: IMAGE_MODEL,
    prompt: imagePrompt,
    size: sizeByFormat(format),
    n: 1,
  };

  if (IMAGE_MODEL.startsWith("gpt-image")) {
    bodyPayload.quality = "medium";
    bodyPayload.output_format = "png";
  }

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(bodyPayload),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error("OPENAI IMAGE ERROR:", JSON.stringify(data, null, 2));
    return {
      imageUrl: null,
      imageError:
        data?.error?.message ||
        "Erro ao gerar imagem. Verifique modelo, crédito, billing e permissões da chave.",
    };
  }

  const b64 = data?.data?.[0]?.b64_json;
  const url = data?.data?.[0]?.url;

  if (b64) {
    return { imageUrl: `data:image/png;base64,${b64}`, imageError: null };
  }

  if (url) {
    return { imageUrl: url, imageError: null };
  }

  return {
    imageUrl: null,
    imageError: "A OpenAI respondeu, mas não retornou imagem.",
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const texts = await generateTexts(body);
    const image = await generateImage(body, texts);

    return NextResponse.json({
      success: true,
      result: {
        ...texts,
        imageUrl: image.imageUrl,
        imageError: image.imageError,
        imageModel: IMAGE_MODEL,
        imageSize: sizeByFormat(clean(body.format)),
      },
    });
  } catch (error: any) {
    console.error("POST /api/creative-generator/generate:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao gerar criativo comercial.",
      },
      { status: 500 }
    );
  }
}
