import { NextResponse } from "next/server"

function fallback(objetivo: string) {
  return {
    subject: "Sua consulta FGTS pode ter mudado",
    subjects: [
      "Atualização sobre sua consulta FGTS",
      "Sua consulta FGTS pode ter mudado",
      "Informação rápida sobre seu FGTS",
      "Podemos verificar seu FGTS?",
      "Consulta FGTS disponível",
    ],
    messages: [
      `Olá [Nome],

Estou entrando em contato porque pode existir uma nova possibilidade de consulta relacionada ao FGTS.

A verificação é rápida e sem compromisso.

Se quiser, posso te explicar pelo WhatsApp.`,

      `Olá [Nome],

Vi uma atualização relacionada ao FGTS e achei válido te avisar.

Pode ser possível verificar se existe alguma condição disponível para você.

Quer consultar pelo WhatsApp?`,

      `Olá [Nome],

Tudo bem?

Estou passando para avisar que algumas consultas de FGTS podem ter novas possibilidades.

Se quiser conferir, é só chamar no WhatsApp.`,

      `Olá [Nome],

Pode existir uma possibilidade de consulta usando o FGTS.

A análise é simples, rápida e sem compromisso.

Quer verificar agora?`,

      `Olá [Nome],

Estou entrando em contato sobre uma possível atualização na consulta FGTS.

Se fizer sentido para você, posso verificar pelo WhatsApp.`,
    ],
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const objetivo = body.objetivo || ""

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(fallback(objetivo))
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.8,
        messages: [
          {
            role: "system",
            content:
              "Você gera emails curtos, humanos e seguros para campanhas de FGTS. Responda somente JSON válido, sem markdown.",
          },
          {
            role: "user",
            content: `
Objetivo: ${objetivo}

Crie JSON neste formato:
{
  "subject": "assunto principal",
  "subjects": ["assunto 1", "assunto 2", "assunto 3", "assunto 4", "assunto 5"],
  "messages": ["texto 1", "texto 2", "texto 3", "texto 4", "texto 5"]
}

Regras:
- usar [Nome]
- máximo 120 palavras por texto
- sem emoji
- sem promessa forte
- sem "saque agora"
- sem "não perca"
- linguagem natural
- CTA para WhatsApp
            `,
          },
        ],
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.log("OPENAI ERROR:", data)
      return NextResponse.json(fallback(objetivo))
    }

    let text = data.choices?.[0]?.message?.content || ""

    text = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim()

    try {
      return NextResponse.json(JSON.parse(text))
    } catch {
      console.log("JSON PARSE ERROR:", text)
      return NextResponse.json(fallback(objetivo))
    }
  } catch (e: any) {
    console.log("AI GENERATE ERROR:", e)

    return NextResponse.json(fallback(""))
  }
}