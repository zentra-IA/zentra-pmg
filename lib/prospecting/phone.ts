export type ProspectingPhoneType =
  | "mobile"
  | "mobile_candidate"
  | "landline"
  | "unknown";

export type ProspectingPhoneAnalysis = {
  type: ProspectingPhoneType;
  originalDigits: string;
  nationalDigits: string | null;
  displayOriginal: string | null;
  whatsapp: string | null;
  whatsappSuggested: string | null;
  displayWhatsappSuggested: string | null;
  operationalWhatsapp: string | null;
  displayOperationalWhatsapp: string | null;
  needsConfirmation: boolean;
  needsValidation: boolean;
};

export function phoneDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

export function formatBrazilianPhone(value: unknown) {
  let digits = phoneDigits(value);

  if (
    digits.startsWith("55") &&
    (digits.length === 12 || digits.length === 13)
  ) {
    digits = digits.slice(2);
  }

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return digits || null;
}

export function analyzeBrazilianPhone(
  value: unknown
): ProspectingPhoneAnalysis {
  const raw = phoneDigits(value);

  if (!raw) {
    return {
      type: "unknown",
      originalDigits: "",
      nationalDigits: null,
      displayOriginal: null,
      whatsapp: null,
      whatsappSuggested: null,
      displayWhatsappSuggested: null,
      operationalWhatsapp: null,
      displayOperationalWhatsapp: null,
      needsConfirmation: false,
      needsValidation: false,
    };
  }

  let national = raw;

  if (
    raw.startsWith("55") &&
    (raw.length === 12 || raw.length === 13)
  ) {
    national = raw.slice(2);
  }

  if (national.length !== 10 && national.length !== 11) {
    return {
      type: "unknown",
      originalDigits: raw,
      nationalDigits: null,
      displayOriginal: formatBrazilianPhone(raw),
      whatsapp: null,
      whatsappSuggested: null,
      displayWhatsappSuggested: null,
      operationalWhatsapp: null,
      displayOperationalWhatsapp: null,
      needsConfirmation: false,
      needsValidation: true,
    };
  }

  const ddd = national.slice(0, 2);
  const local = national.slice(2);
  const displayOriginal = formatBrazilianPhone(national);

  // Celular atual: DDD + 9 dígitos, começando por 9.
  if (local.length === 9 && local.startsWith("9")) {
    const whatsapp = `55${national}`;

    return {
      type: "mobile",
      originalDigits: raw,
      nationalDigits: national,
      displayOriginal,
      whatsapp,
      whatsappSuggested: null,
      displayWhatsappSuggested: null,
      operationalWhatsapp: whatsapp,
      displayOperationalWhatsapp: displayOriginal,
      needsConfirmation: false,
      needsValidation: false,
    };
  }

  // Fixo provável: DDD + 8 dígitos começando por 2, 3, 4 ou 5.
  if (local.length === 8 && /^[2-5]/.test(local)) {
    return {
      type: "landline",
      originalDigits: raw,
      nationalDigits: national,
      displayOriginal,
      whatsapp: null,
      whatsappSuggested: null,
      displayWhatsappSuggested: null,
      operationalWhatsapp: null,
      displayOperationalWhatsapp: null,
      needsConfirmation: false,
      needsValidation: false,
    };
  }

  // Celular antigo provável: DDD + 8 dígitos começando por 6, 7, 8 ou 9.
  // O dado original nunca é alterado. Para operação WhatsApp, geramos
  // automaticamente o candidato com o nono dígito.
  if (local.length === 8 && /^[6-9]/.test(local)) {
    const suggestedNational = `${ddd}9${local}`;
    const whatsappSuggested = `55${suggestedNational}`;
    const displayWhatsappSuggested =
      formatBrazilianPhone(suggestedNational);

    return {
      type: "mobile_candidate",
      originalDigits: raw,
      nationalDigits: national,
      displayOriginal,
      whatsapp: null,
      whatsappSuggested,
      displayWhatsappSuggested,
      operationalWhatsapp: whatsappSuggested,
      displayOperationalWhatsapp: displayWhatsappSuggested,
      // Mantido por compatibilidade com telas antigas.
      needsConfirmation: false,
      // O +9 é automático para operação, mas continua sendo um candidato
      // até existir validação real de WhatsApp.
      needsValidation: true,
    };
  }

  return {
    type: "unknown",
    originalDigits: raw,
    nationalDigits: national,
    displayOriginal,
    whatsapp: null,
    whatsappSuggested: null,
    displayWhatsappSuggested: null,
    operationalWhatsapp: null,
    displayOperationalWhatsapp: null,
    needsConfirmation: false,
    needsValidation: true,
  };
}

export function getOperationalWhatsapp(value: unknown) {
  return analyzeBrazilianPhone(value).operationalWhatsapp;
}

export function isProspectingWhatsappEligible(value: unknown) {
  return Boolean(getOperationalWhatsapp(value));
}

export function prospectingPhoneTypeLabel(
  type: ProspectingPhoneType
) {
  const labels: Record<ProspectingPhoneType, string> = {
    mobile: "WhatsApp pronto",
    mobile_candidate: "Celular a validar (+9 automático)",
    landline: "Telefone fixo",
    unknown: "Telefone a revisar",
  };

  return labels[type];
}
