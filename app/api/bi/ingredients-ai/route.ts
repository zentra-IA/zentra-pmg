import { NextRequest, NextResponse } from "next/server";

function extractJson(text: string) {
  return text.replace(/```json/g, "").replace(/```/g, "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const message = String(body.message || "").trim();
    const product = body.product || {};

    if (!message) {
      return NextResponse.json({
        success: false,
        error: "Mensagem obrigatória",
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
Você é uma IA especialista em ficha técnica para restaurantes, pizzarias e delivery.

Transforme a mensagem do usuário em JSON válido.

Produto:
${JSON.stringify(product)}

Responda SOMENTE JSON neste formato:

{
  "summary": "resumo simples",
  "ingredients": [
    {
      "name": "mussarela",
      "quantity": 300,
      "unit": "g",
      "cost_per_unit": 0.03,
      "total_cost": 9
    }
  ],
  "total_cost": 0,
  "sale_price": 0,
  "profit": 0,
  "margin": 0,
  "suggested_price": 0,
  "analysis": "análise curta"
}

Regras:
- Se o usuário disser R$30/kg, converta para custo por grama: 30 / 1000 = 0.03.
- Se disser R$40/kg e usa 150g, custo = 150 * 0.04.
- Se disser preço por unidade, use unidade.
- Se faltar preço de algum ingrediente, coloque cost_per_unit 0 e avise na analysis.
- sale_price deve vir do produto informado.
- profit = sale_price - total_cost.
- margin = profit / sale_price * 100.
- suggested_price = total_cost / 0.35 para uma margem saudável aproximada.
            `,
          },
          {
            role: "user",
            content: message,
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

    const text = data?.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(extractJson(text));

    return NextResponse.json({
      success: true,
      result: parsed,
    });
  } catch (e: any) {
    return NextResponse.json({
      success: false,
      error: e.message || "Erro na IA da ficha técnica",
    });
  }
}