import { QuoteInputLine } from "./types";
import { normalizeText } from "./normalize";

export function parseQuoteText(rawText: string): QuoteInputLine[] {
  return rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseLine);
}

function parseLine(raw: string): QuoteInputLine {
  const normalized = normalizeText(raw);

  const quantityMatch = normalized.match(/\b(\d+[,.]?\d*)\b/);
  const discountMatch = normalized.match(/desconto\s*(\d+[,.]?\d*)\s*%?/);

  const quantity = quantityMatch ? Number(quantityMatch[1].replace(",", ".")) : 1;
  const discount = discountMatch ? Number(discountMatch[1].replace(",", ".")) : undefined;

  const unit = detectUnit(normalized);

  return {
    raw,
    quantity,
    unit,
    discount,
  };
}

function detectUnit(text: string): string {
  if (/\bkg\b/.test(text)) return "KG";
  if (/\bfardo\b|\bfd\b/.test(text)) return "FD";
  if (/\bcaixa\b|\bcx\b/.test(text)) return "CX";
  if (/\bpeca\b|\bpc\b|\bpç\b/.test(text)) return "PÇ";
  if (/\bpacote\b|\bpct\b/.test(text)) return "PCT";
  if (/\bbalde\b|\bbd\b/.test(text)) return "BD";
  if (/\bbis\b/.test(text)) return "BIS";

  return "UN";
}