import { normalizeText } from "./normalize";

export function tokenize(input: string): string[] {
  const normalized = normalizeText(input);

  return normalized
    .replace(/(\d+)(kg|g|l|ml|cx|fd|pc|pç|un|pct)/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
}