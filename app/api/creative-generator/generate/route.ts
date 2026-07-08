import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const OPENAI_API_KEY =
  process.env.RH_OPENAI_API_KEY ||
  process.env.OPENAI_API_KEY ||
  process.env.OPENAI_SUPPORT_KEY ||
  "";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

function clean(value: any) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function sizeByFormat(format: string) {
  if (format === "story") return "1024x1536";
  if (format === "wide") return "1536x1024";
  return "1024x1024";
}

function splitBenefits(value: any) {
  return clean(value)
    .split(/\n|,|;/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function fallbackText(body: any) {
  const product = clean(body.productName) || "Produto em destaque";
  const price = clean(body.price);
  const benefits = splitBenefits(body.benefits);
  const target = clean(body.targetClient) || "clientes PMG";
  const company = clean(body.companyName) || "PMG Atacadista";
  const whatsapp = clean(body.sellerWhatsapp);

  const bullets = benefits.length
    ? benefits
    : ["Ótima condição comercial", "Produto com giro no varejo", "Ideal para abastecer seu negócio"];

  return {
    headline: product,
    subheadline: bullets[0] || "Condição especial para clientes PMG",
    offerLine: price || "Consulte condição especial",
    benefitBullets: bullets,
    cta: "Pedir cotação",
    statusText: `🔥 OFERTA PMG\n\n${product}${price ? `\n${price}` : ""}\n\n${bullets.map((b) => `✅ ${b}`).join("\n")}\n\nChame no WhatsApp e garanta sua cotação.`,
    instagramCaption: `🔥 Oferta especial PMG para ${target}.\n\n${product}${price ? `\nCondição: ${price}` : ""}\n\n${bullets.map((b) => `✅ ${b}`).join("\n")}\n\nFale com seu vendedor e aproveite enquanto durar o estoque.`,
    whatsappText: `Olá! Temos condição especial PMG para ${product}.${price ? `\n${price}` : ""}\n\n${bullets.map((b) => `✅ ${b}`).join("\n")}\n\nPosso te passar uma cotação?${whatsapp ? `\n${whatsapp}` : ""}`,
    shortCopy: `${product} com condição especial para ${target}.`,
    hashtags: "#PMGAtacadista #OfertaPMG #Atacado #Distribuidora #Vendas #Comercio",
    designDirection:
      "Arte comercial com produto em destaque, fundo realista, contraste forte, texto grande e legível, visual profissional para WhatsApp Status e Instagram.",
    imagePrompt:
      "Imagem comercial realista do produto em destaque, com iluminação profissional, sem textos pequenos e sem logotipos de terceiros.",
  };
}

async function generateTexts(body: any) {
  if (!OPENAI_API_KEY) return fallbackText(body);

  const prompt = `
Você é um diretor comercial, copywriter e designer de criativos para atacado/distribuição.

Contexto real:
A PMG trabalha com milhares de produtos para mercados, padarias, pizzarias, restaurantes, lanchonetes, mercearias e varejo alimentar.
Quem vai usar o criativo é o vendedor. O objetivo é facilitar o dia a dia dele: postar status, mandar no WhatsApp e gerar pedidos.

Dados:
Tipo de criativo: ${clean(body.creativeType)}
Objetivo: ${clean(body.objective)}
Categoria: ${clean(body.productCategory)}
Produto: ${clean(body.productName)}
Marca/linha: ${clean(body.brand)}
Preço/condição: ${clean(body.price)}
Benefícios/diferenciais: ${clean(body.benefits)}
Cliente ideal: ${clean(body.targetClient)}
Tom: ${clean(body.tone)}
Formato: ${clean(body.format)}
Empresa: ${clean(body.companyName)}
WhatsApp do vendedor: ${clean(body.sellerWhatsapp)}
Texto superior desejado: ${clean(body.topText)}
Texto inferior desejado: ${clean(body.bottomText)}
Instruções extras: ${clean(body.extra)}

Regras:
- Não criar texto de vaga/RH.
- Não falar como consumidor final; falar como vendedor B2B/atacado.
- Ser direto, comercial, útil e pronto para WhatsApp.
- Se o produto for alimento, destacar apetite, rendimento, qualidade, giro, margem, estoque e condição.
- Não inventar preço se não foi enviado.
- Não prometer benefício técnico impossível.
- Gerar frase curta para arte, legenda, texto de WhatsApp e hashtags.
- A imagem terá texto sobreposto pelo sistema; portanto a direção criativa deve pedir imagem limpa, com produto em destaque e espaço visual para texto.

Retorne SOMENTE JSON válido:
{
  "headline": "título curto para a arte",
  "subheadline": "subtítulo curto e vendedor",
  "offerLine": "linha da condição/preço",
  "benefitBullets": ["benefício 1", "benefício 2", "benefício 3"],
  "cta": "CTA curto",
  "statusText": "texto curto para WhatsApp Status",
  "instagramCaption": "legenda para Instagram/Facebook",
  "whatsappText": "mensagem curta para enviar ao cliente",
  "shortCopy": "frase curta de campanha",
  "hashtags": "hashtags relevantes",
  "designDirection": "direção visual da arte",
  "imagePrompt": "prompt profissional para gerar imagem sem texto"
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
      temperature: 0.65,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Você cria criativos comerciais B2B para atacadistas e distribuidores no Brasil. Responda apenas JSON válido.",
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

  try {
    return { ...fallbackText(body), ...JSON.parse(content) };
  } catch {
    return fallbackText(body);
  }
}

function buildImagePrompt(body: any, texts: any) {
  const product = clean(body.productName) || "produto de atacado";
  const category = clean(body.productCategory);
  const style = clean(body.imageStyle) || "foto realista premium";
  const color = clean(body.dominantColor) || "#0f8f45";
  const extra = clean(body.extra);
  const format = clean(body.format);

  return `
Crie uma imagem comercial premium para anúncio de produto de atacado da PMG Atacadista.

Produto principal: ${product}
Categoria: ${category}
Estilo visual: ${style}
Formato: ${format}
Cor predominante da campanha: ${color}
Cliente-alvo: ${clean(body.targetClient)}
Direção criativa: ${clean(texts.designDirection)}
${extra ? `Instruções extras do usuário: ${extra}` : ""}

Regras obrigatórias:
- Mostrar o produto como protagonista, bonito, apetitoso e profissional.
- Criar cena realista de varejo, atacado, supermercado, padaria, pizzaria, restaurante ou food service quando fizer sentido.
- Iluminação de estúdio, alta nitidez, profundidade, aparência premium e comercial.
- Deixar áreas limpas/menos carregadas para o sistema aplicar textos por cima.
- NÃO inserir texto na imagem.
- NÃO inserir preços na imagem.
- NÃO inserir logotipos de marcas famosas ou de terceiros.
- NÃO criar pessoas em destaque.
- NÃO criar arte de vaga, emprego ou RH.
- Visual deve parecer anúncio profissional de produto para vendedor publicar.
  `.trim();
}

async function generateImage(body: any, texts: any) {
  if (!OPENAI_API_KEY) {
    return {
      imageUrl: null,
      imageError: "OPENAI_API_KEY/RH_OPENAI_API_KEY ausente.",
      imagePrompt: buildImagePrompt(body, texts),
    };
  }

  const imagePrompt = buildImagePrompt(body, texts);

  const bodyPayload: any = {
    model: IMAGE_MODEL,
    prompt: imagePrompt,
    size: sizeByFormat(clean(body.format)),
    n: 1,
  };

  if (IMAGE_MODEL.startsWith("gpt-image")) {
    bodyPayload.quality = "high";
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
      imagePrompt,
    };
  }

  const b64 = data?.data?.[0]?.b64_json;
  const url = data?.data?.[0]?.url;

  if (b64) {
    return {
      imageUrl: `data:image/png;base64,${b64}`,
      imageError: null,
      imagePrompt,
    };
  }

  if (url) {
    return {
      imageUrl: url,
      imageError: null,
      imagePrompt,
    };
  }

  return {
    imageUrl: null,
    imageError: "A OpenAI respondeu, mas não retornou b64_json nem url.",
    imagePrompt,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const texts = await generateTexts(body);
    const image = clean(body.generateMode) === "text_only"
      ? { imageUrl: null, imageError: null, imagePrompt: texts.imagePrompt }
      : await generateImage(body, texts);

    return NextResponse.json({
      success: true,
      ...texts,
      imageUrl: image.imageUrl,
      imageError: image.imageError,
      imagePrompt: image.imagePrompt || texts.imagePrompt,
      imageModel: IMAGE_MODEL,
      imageSize: sizeByFormat(clean(body.format)),
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
