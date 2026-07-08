import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const question = String(body.question || "").trim();
    const biData = body.biData || {};

    if (!question) {
      return NextResponse.json({
        success: false,
        error: "Pergunta obrigatória",
      });
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
Você é o Analista Financeiro IA do Zentra Food.

Analise vendas, custos, lucro, margem, produtos, CRM, WhatsApp e email.

Responda sempre em português, direto e com recomendações práticas.

Dados do BI:
${JSON.stringify(biData, null, 2)}
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
      return NextResponse.json({
        success: false,
        error: data?.error?.message || "Erro OpenAI",
      });
    }

    return NextResponse.json({
      success: true,
      answer: data?.choices?.[0]?.message?.content || "Não consegui analisar.",
    });
  } catch (e: any) {
    return NextResponse.json({
      success: false,
      error: e.message || "Erro na IA do BI",
    });
  }
}