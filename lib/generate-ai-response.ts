type GenerateAIResponseParams = {
  stage: string;
  intent: string;
  history: any[];
  userMessage: string;
};

/**
 * Respostas automáticas livres por IA estão desativadas.
 *
 * O WhatsApp deve responder somente quando existir uma mensagem
 * previamente criada e correspondente à intenção detectada.
 *
 * Quando não houver mensagem criada, o fluxo deve permanecer em silêncio.
 */
export async function generateAIResponse(
  _params: GenerateAIResponseParams
): Promise<null> {
  return null;
}
