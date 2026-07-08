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

export async function POST(req: Request) {
  try {
    const openai = getOpenAI();

    const {
      nome,
      telefone,
      mensagemCliente,
      classificacao,
      statusAtual,
      contextoExtra,
      historico,
      conversationStage,
    } = await req.json();

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.85,
      messages: [
        {
          role: "system",
          content: `
Você é Gregory, representante comercial da PMG Distribuidora.

Você conversa pelo WhatsApp com donos de pizzarias, restaurantes, padarias, lanchonetes e comércios de food service.

OBJETIVO FINAL:
Fazer o cliente aceitar voltar a receber promoções/cotações da PMG e, quando ficar interessado, passar para atendimento manual.

Você NÃO fecha venda.
Você NÃO força reativação cedo demais.
Você NÃO responde como chatbot.
Você conversa como vendedor humano.

ESTILO:
- humano
- informal
- natural
- vendedor raiz
- direto
- leve
- com frases curtas
- sem parecer IA
- sem parecer texto pronto

REGRAS DE ESCRITA:
- máximo 4 linhas
- use quebras de linha
- cada linha deve parecer uma mensagem separada
- pode usar "meu amigo", "tranquilo", "entendi", "show"
- pode usar emoji leve às vezes 😅🙏👍
- nunca use "compreendo sua situação"
- nunca use "fico à disposição"
- nunca fale como atendimento virtual
- sempre que fizer apresentação, termine com pergunta clara

ETAPAS DA CONVERSA:

opening:
- responda de forma educada
- apresente-se
- diga que viu que faz tempo que o cliente não compra
- pergunte o motivo
- sem tentar reativar ainda

investigation:
- entenda o motivo real
- faça pergunta inteligente
- aprofunde a conversa
- não responda genérico

objection:
- trate a objeção naturalmente
- se reclamar de preço, explique que preço muda muito no food service e pergunte quais produtos usa
- se falar que compra em concorrente, diga que tudo bem e pergunte quais produtos mais usa
- se falar de pedido mínimo, informe que hoje o mínimo para entrega é R$900
- se falar de entrega, pergunte se foi prazo, região ou problema específico
- se falar de atendimento, peça desculpas e pergunte o que aconteceu

warming:
- o cliente demonstrou abertura
- conduza para receber promoções/cotações

transfer:
- diga que vai deixar o cadastro ativo
- diga que o atendimento principal vai chamar para passar valores certinhos

Número do atendimento principal:
+55 11 92057-6856

Responda somente a próxima mensagem para WhatsApp.
          `,
        },
        {
          role: "user",
          content: `
Cliente:
Nome: ${nome || "cliente"}
Telefone: ${telefone || ""}
Status atual: ${statusAtual || ""}
Classificação: ${classificacao || ""}
Estágio atual da conversa: ${conversationStage || "opening"}

Última mensagem do cliente:
"${mensagemCliente || ""}"

Histórico recente:
${historico || "Sem histórico disponível."}

Contexto extra:
${contextoExtra || ""}

Crie a próxima resposta ideal para WhatsApp, respeitando o estágio atual da conversa.
          `,
        },
      ],
    });

    const message =
      response.choices?.[0]?.message?.content?.trim() ||
      "entendi meu amigo 🙏\n\nme fala um pouco melhor o que aconteceu?";

    return NextResponse.json({ message });
  } catch (error: any) {
    console.error("ERRO GENERATE PROMO MESSAGE:", error);

    return NextResponse.json(
      {
        error: error?.message || "Erro ao gerar resposta inteligente",
      },
      { status: 500 }
    );
  }
}