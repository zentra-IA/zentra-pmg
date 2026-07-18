export type DetectedIntent =
  | "SEM_INTERESSE"
  | "DUVIDA_CONTATO"
  | "QUERO_SIMULAR"
  | "DUVIDA_SEGURANCA";

export function detectIntent(text: string): DetectedIntent | null {
  const lower = String(text || "").toLowerCase().trim();

  if (!lower) {
    return null;
  }

  // Sem interesse
  if (
    lower.includes("não tenho interesse") ||
    lower.includes("nao tenho interesse") ||
    lower.includes("não quero") ||
    lower.includes("nao quero")
  ) {
    return "SEM_INTERESSE";
  }

  // Dúvida sobre o contato
  if (
    lower.includes("onde conseguiu") ||
    lower.includes("como conseguiu meu contato") ||
    lower.includes("quem te passou meu numero") ||
    lower.includes("quem te passou meu número")
  ) {
    return "DUVIDA_CONTATO";
  }

  // Interesse
  if (
    lower.includes("quero simular") ||
    lower.includes("tenho interesse") ||
    lower.includes("quanto libera") ||
    lower.includes("como funciona")
  ) {
    return "QUERO_SIMULAR";
  }

  // Segurança
  if (
    lower.includes("é golpe") ||
    lower.includes("e golpe") ||
    lower.includes("isso é seguro") ||
    lower.includes("isso e seguro") ||
    lower.includes("é confiável") ||
    lower.includes("e confiavel")
  ) {
    return "DUVIDA_SEGURANCA";
  }

  // Sem correspondência: não encaminha para IA e não responde.
  return null;
}
