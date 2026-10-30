/**
 * Filtro de contatos para a Júlia. Não altera telefones da base original.
 * Os números são classificados pelo plano de numeração brasileiro; números
 * de aparência duvidosa NUNCA entram automaticamente na lista de fixos.
 */
export type JuliaPhoneType = "FIXO" | "CELULAR" | "INVALIDO";

export type JuliaContact = {
  line: number;
  name: string;
  rawPhone: string;
  phone: string;
  type: JuliaPhoneType;
  reason: string | null;
  duplicate: boolean;
};

const DDDS = new Set([
  11,12,13,14,15,16,17,18,19,
  21,22,24,27,28,
  31,32,33,34,35,37,38,
  41,42,43,44,45,46,47,48,49,
  51,53,54,55,61,62,63,64,65,66,67,68,69,
  71,73,74,75,77,79,
  81,82,83,84,85,86,87,88,89,
  91,92,93,94,95,96,97,98,99,
]);

export function classifyJuliaPhone(value: unknown): {
  phone: string;
  type: JuliaPhoneType;
  reason: string | null;
} {
  let phone = String(value ?? "").replace(/\D/g, "");

  // O DDD 55 existe: retirar 55 APENAS para números com 12/13 dígitos.
  if ((phone.length === 12 || phone.length === 13) && phone.startsWith("55")) {
    phone = phone.slice(2);
  }

  // Não converter números antigos de 8 dígitos em celulares automaticamente.
  if (phone.length !== 10 && phone.length !== 11) {
    return { phone, type: "INVALIDO", reason: "É preciso DDD e número completo." };
  }

  const ddd = Number(phone.slice(0, 2));
  if (!DDDS.has(ddd)) {
    return { phone, type: "INVALIDO", reason: "DDD não reconhecido." };
  }

  if (phone.length === 10 && /^[2-5]/.test(phone.slice(2))) {
    return { phone, type: "FIXO", reason: null };
  }

  if (phone.length === 11 && phone[2] === "9") {
    return { phone, type: "CELULAR", reason: null };
  }

  return {
    phone,
    type: "INVALIDO",
    reason: "Numeração não identificada como fixo ou celular atual.",
  };
}

export function parseJuliaContacts(text: string, maxRows = 400): JuliaContact[] {
  const seen = new Set<string>();
  const lines = String(text || "").split(/\r?\n/).filter((s) => s.trim());
  return lines.slice(0, maxRows).map((raw, index) => {
    // Ex.: Empresa;1134567890, Empresa,11 3456-7890, ou apenas número.
    const separator = raw.includes("\t") ? "\t" : raw.includes(";") ? ";" : ",";
    const split = raw.split(separator);
    const rawPhone = split.length === 1 ? split[0].trim() : split.slice(1).join(separator).trim();
    const name = split.length === 1 ? `Contato ${index + 1}` : (split[0].trim() || `Contato ${index + 1}`);
    const classified = classifyJuliaPhone(rawPhone);
    const duplicate = classified.type !== "INVALIDO" && seen.has(classified.phone);
    if (classified.type !== "INVALIDO") seen.add(classified.phone);
    return {
      line: index + 1,
      name: name.slice(0, 180),
      rawPhone,
      ...classified,
      duplicate,
      reason: duplicate ? "Duplicado na lista." : classified.reason,
    };
  });
}

export function normalizeJuliaRows(rows: Array<{ name?: string | null; phone?: string | null }>): JuliaContact[] {
  const seen = new Set<string>();
  return rows.map((item, index) => {
    const classified = classifyJuliaPhone(item.phone || "");
    const duplicate = classified.type !== "INVALIDO" && seen.has(classified.phone);
    if (classified.type !== "INVALIDO") seen.add(classified.phone);
    return {
      line: index + 1,
      name: String(item.name || `Contato ${index + 1}`).slice(0, 180),
      rawPhone: String(item.phone || ""),
      ...classified,
      duplicate,
      reason: duplicate ? "Duplicado na lista." : classified.reason,
    };
  });
}

export function isJuliaLandline(phone: unknown): boolean {
  return classifyJuliaPhone(phone).type === "FIXO";
}
