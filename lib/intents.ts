export function detectIntent(text: string) {
  const lower = text.toLowerCase()

  // sem interesse
  if (
    lower.includes("não tenho interesse") ||
    lower.includes("nao tenho interesse") ||
    lower.includes("não quero") ||
    lower.includes("nao quero")
  ) {
    return "SEM_INTERESSE"
  }

  // dúvida contato
  if (
    lower.includes("onde conseguiu") ||
    lower.includes("como conseguiu meu contato") ||
    lower.includes("quem te passou meu numero")
  ) {
    return "DUVIDA_CONTATO"
  }

  // interesse
  if (
    lower.includes("quero simular") ||
    lower.includes("tenho interesse") ||
    lower.includes("quanto libera") ||
    lower.includes("como funciona")
  ) {
    return "QUERO_SIMULAR"
  }

  // segurança
  if (
    lower.includes("é golpe") ||
    lower.includes("isso é seguro") ||
    lower.includes("é confiável")
  ) {
    return "DUVIDA_SEGURANCA"
  }

  return "OPEN_AI"
}