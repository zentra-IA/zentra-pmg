import { NextRequest, NextResponse } from "next/server";
import { SUPPORT_KNOWLEDGE } from "@/lib/support-knowledge";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question = String(body.question || "").trim();

    if (!question) {
      return NextResponse.json(
        { success: false, error: "Pergunta obrigatória" },
        { status: 400 }
      );
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_SUPPORT_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: `
${SUPPORT_KNOWLEDGE}

REGRAS FINAIS OBRIGATÓRIAS:

Não use markdown.
Não use asteriscos.
Não use negrito.
Não use títulos com cerquilha.
Não use traços para listar.
Não use tabela.

Use emojis simples para organizar a resposta.

Sempre responda como um atendente humano.

Use linguagem simples para pessoas leigas.

Use este formato:

Emoji + frase curta.

Exemplo:

🍕 Para criar uma promoção:

📍 Entre em Painel > Promoções.

📝 Clique em Nova Promoção e preencha:
Nome da promoção
Descrição
Preço
Imagem

✅ Clique em Salvar.

🚀 Depois clique em Gerenciar Grupos para adicionar os produtos.

Se a pergunta for sobre algo fora do Zentra Food, responda:
Posso te ajudar apenas com dúvidas sobre o uso do Zentra Food.
`,
          },
          {
            role: "user",
            content: question,
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.log("OPENAI SUPPORT ERROR:", data);

      return NextResponse.json(
        {
          success: false,
          error: data?.error?.message || "Erro ao responder suporte",
        },
        { status: 500 }
      );
    }

    const rawAnswer =
      data?.choices?.[0]?.message?.content ||
      "Não consegui responder essa dúvida.";

    const cleanAnswer = String(rawAnswer)
      .replace(/\*\*/g, "")
      .replace(/###/g, "")
      .replace(/##/g, "")
      .replace(/^-\s/gm, "")
      .trim();

    return NextResponse.json({
      success: true,
      answer: cleanAnswer,
    });
  } catch (error: any) {
    console.error("SUPPORT AI ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro interno no suporte",
      },
      { status: 500 }
    );
  }
}