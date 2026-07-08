import { NextResponse } from "next/server";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_SUPPORT_KEY;

  if (!apiKey) {
    throw new Error(
      "OpenAI não configurada. Verifique OPENAI_API_KEY ou OPENAI_SUPPORT_KEY."
    );
  }

  return new OpenAI({
    apiKey,
  });
}

const allowedClassifications = [
  "resposta_neutra",
  "pedido_cotacao",
  "quer_promocoes",
  "ja_compra_pmg",
  "tem_vendedor_pmg",
  "sem_interesse",
  "remover",
  "empresa_fechou",
  "reclamacao_preco",
  "reclamacao_entrega",
  "reclamacao_atendimento",
  "interessado",
  "resposta_confusa",
];

export async function POST(req: Request) {
  try {
    const openai = getOpenAI();
    const { message } = await req.json();

    if (!message || !String(message).trim()) {
      return NextResponse.json({
        classification: "resposta_confusa",
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
Você é um classificador de respostas de clientes no WhatsApp para um CRM de recuperação de clientes inativos da PMG/FMG Atacadista.

Classifique a mensagem em APENAS UMA categoria:

- resposta_neutra
- pedido_cotacao
- quer_promocoes
- ja_compra_pmg
- tem_vendedor_pmg
- sem_interesse
- remover
- empresa_fechou
- reclamacao_preco
- reclamacao_entrega
- reclamacao_atendimento
- interessado
- resposta_confusa

Regras:

1. "oi", "tudo bem", "quem é", "do que se trata", "boa tarde", "bom dia", "sim" → resposta_neutra

2. "preço", "cotação", "tabela", "valor", "quanto custa", "me manda os preços" → pedido_cotacao

3. "manda promoção", "quero promoções", "me manda ofertas", "tem promoção?" → quer_promocoes

4. "já compro com vocês", "já sou cliente", "compro aí" → ja_compra_pmg

5. "já tenho vendedor", "tenho representante", "já falo com vendedor" → tem_vendedor_pmg

6. "não quero", "não tenho interesse", "não preciso" → sem_interesse

7. "remove", "não mande mais", "pare de mandar", "me tira da lista" → remover

8. "fechei", "não tenho mais loja", "não trabalho mais com isso", "encerrei" → empresa_fechou

9. Reclamação de preço caro, condição ruim, desconto ruim → reclamacao_preco

10. Reclamação de entrega, prazo, atraso, frete → reclamacao_entrega

11. Reclamação de atendimento, vendedor, suporte, retorno → reclamacao_atendimento

12. "quero comprar", "tenho interesse", "vamos fazer pedido", "me chama" → interessado

Se tiver dúvida, use resposta_confusa.

Responda APENAS com o nome da categoria.
          `,
        },
        {
          role: "user",
          content: String(message),
        },
      ],
    });

    const raw =
      response.choices?.[0]?.message?.content?.trim() || "resposta_confusa";

    const classification = allowedClassifications.includes(raw)
      ? raw
      : "resposta_confusa";

    return NextResponse.json({ classification });
  } catch (error: any) {
    console.error("ERRO AI CLASSIFY:", error);

    return NextResponse.json(
      {
        error: error?.message || "Erro ao classificar mensagem",
      },
      { status: 500 }
    );
  }
}