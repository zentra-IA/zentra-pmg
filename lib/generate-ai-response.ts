import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateAIResponse({
  stage,
  intent,
  history,
  userMessage,
}: {
  stage: string;
  intent: string;
  history: any[];
  userMessage: string;
}) {
  const conversation = history
    .slice(-8)
    .map((m) => `${m.direction === "sent" ? "ATENDENTE" : "CLIENTE"}: ${m.content}`)
    .join("\n");

  const prompt = `
Você é Gregory da PMG Distribuidora.

Objetivo:
- recuperar clientes antigos
- descobrir objeções
- conversar de forma humana
- encaminhar interessados para humano

Regras:
- máximo 300 caracteres
- tom natural
- não usar markdown
- não vender sozinho
- se houver interesse em preço, catálogo, cotação ou compra, diga que o atendimento principal vai chamar

Estágio: ${stage}
Intenção: ${intent}

Histórico:
${conversation}

Cliente:
${userMessage}

Responda apenas a mensagem.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.7,
      messages: [{ role: "system", content: prompt }],
    });

    return response.choices[0]?.message?.content?.trim() || "";
  } catch (error) {
    console.error("Erro OpenAI:", error);

    return "entendi 🙏 me fala rapidinho, foi mais por preço, entrega, atendimento ou aconteceu outra coisa?";
  }
}