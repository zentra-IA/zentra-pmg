import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { requireCompanyAccess } from "@/lib/server-company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    await requireCompanyAccess(request);

    const body = await request.json();
    const objective = String(
      body?.objective || ""
    ).trim();

    const tone = ["curta", "comercial", "criativa"].includes(
      body?.tone
    )
      ? body.tone
      : "comercial";

    if (objective.length < 8) {
      return NextResponse.json(
        {
          error:
            "Descreva melhor a intenção da promoção.",
        },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: "OPENAI_API_KEY não configurada.",
        },
        { status: 500 }
      );
    }

    const completion =
      await openai.chat.completions.create({
        model:
          process.env.OPENAI_PROMOTIONS_MODEL ||
          "gpt-4o-mini",
        temperature:
          tone === "criativa" ? 0.82 : 0.5,
        response_format: {
          type: "json_object",
        },
        messages: [
          {
            role: "system",
            content: [
              "Você é um redator comercial B2B brasileiro.",
              "Crie uma promoção para clientes de distribuidores e representantes.",
              "Não informe preços, percentuais, prazos, estoque ou descontos que não tenham sido fornecidos.",
              `Tom da comunicação: ${tone}.`,
              "Retorne somente JSON válido com as chaves:",
              "title, description, push_title, push_message, portal_text, call_to_action, whatsapp_message.",
              "Limites: title 70 caracteres; push_title 45; push_message 110; call_to_action 30.",
              "O call_to_action deve convidar o cliente a falar com o vendedor.",
              "A whatsapp_message deve soar natural e mencionar que o cliente viu a promoção no portal Zentra.",
            ].join(" "),
          },
          {
            role: "user",
            content: objective,
          },
        ],
      });

    const raw =
      completion.choices[0]?.message?.content ||
      "{}";

    const generated = JSON.parse(raw);

    return NextResponse.json({
      content: {
        title: String(
          generated.title || ""
        ).trim(),
        description: String(
          generated.description || ""
        ).trim(),
        push_title: String(
          generated.push_title || ""
        ).trim(),
        push_message: String(
          generated.push_message || ""
        ).trim(),
        portal_text: String(
          generated.portal_text || ""
        ).trim(),
        call_to_action: String(
          generated.call_to_action ||
            "Entrar em contato"
        ).trim(),
        whatsapp_message: String(
          generated.whatsapp_message ||
            "Olá! Vi esta promoção no portal Zentra e gostaria de mais informações."
        ).trim(),
      },
    });
  } catch (error) {
    console.error("PROMOTION_AI_ERROR", error);

    const message =
      error instanceof Error
        ? error.message
        : "Erro ao gerar conteúdo.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
