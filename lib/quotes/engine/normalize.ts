const DEFAULT_REPLACEMENTS: Record<string, string> = {
  mussarela: "mucarela",
  mozarela: "mucarela",
  mucarela: "mucarela",
  requeijao: "requeijao",
  catupiri: "catupiry",
  peperi: "peperi",
  tiroles: "tiroles",
};

export function normalizeText(value: string): string {
  if (!value) return "";

  let text = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\w\s.,%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const [from, to] of Object.entries(DEFAULT_REPLACEMENTS)) {
    text = text.replace(new RegExp(`\\b${from}\\b`, "g"), to);
  }

  return singularize(text);
}

export function singularize(text: string): string {
  return text
    .split(" ")
    .map((word) => {
      if (word.endsWith("oes")) return word.slice(0, -3) + "ao";
      if (word.endsWith("ais")) return word.slice(0, -3) + "al";
      if (word.endsWith("is")) return word.slice(0, -2) + "il";
      if (word.endsWith("s") && word.length > 3) return word.slice(0, -1);
      return word;
    })
    .join(" ");
}