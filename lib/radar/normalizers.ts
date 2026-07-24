import * as XLSX from "xlsx";
import { cleanValue } from "./headers";

export function normalizeExternalCustomerId(
  value: unknown
): string | null {
  const normalized = cleanValue(value);

  return normalized || null;
}

export function normalizeOptionalText(
  value: unknown
): string | null {
  const normalized = cleanValue(value);

  return normalized || null;
}

export function normalizePhone(
  value: unknown
): string | null {
  let digits = String(value ?? "").replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  if (!digits.startsWith("55")) {
    digits = `55${digits}`;
  }

  // Brasil:
  // 55 + DDD + telefone fixo/celular
  if (digits.length < 12 || digits.length > 13) {
    return null;
  }

  return digits;
}

export function parseRadarMoney(
  value: unknown
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  let raw = cleanValue(value)
    .replace(/R\$/gi, "")
    .replace(/\s/g, "");

  if (!raw) {
    return null;
  }

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");

  if (hasComma && hasDot) {
    // Exemplo brasileiro: 1.234,56
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // Exemplo: 1234,56
    raw = raw.replace(",", ".");
  }

  const parsed = Number(raw);

  return Number.isFinite(parsed) ? parsed : null;
}

export function parseRadarDate(
  value: unknown
): Date | null {
  if (!value) {
    return null;
  }

  if (
    value instanceof Date &&
    !Number.isNaN(value.getTime())
  ) {
    return value;
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);

    if (!parsed) {
      return null;
    }

    return new Date(
      Date.UTC(
        parsed.y,
        parsed.m - 1,
        parsed.d,
        parsed.H || 0,
        parsed.M || 0,
        Math.floor(parsed.S || 0)
      )
    );
  }

  const raw = cleanValue(value);

  if (!raw) {
    return null;
  }

  const brazilianDate = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/
  );

  if (brazilianDate) {
    const day = Number(brazilianDate[1]);
    const month = Number(brazilianDate[2]) - 1;

    const yearText = brazilianDate[3];
    const year = Number(
      yearText.length === 2 ? `20${yearText}` : yearText
    );

    const hour = Number(brazilianDate[4] || 0);
    const minute = Number(brazilianDate[5] || 0);

    const date = new Date(
      year,
      month,
      day,
      hour,
      minute
    );

    if (
      Number.isNaN(date.getTime()) ||
      date.getDate() !== day ||
      date.getMonth() !== month ||
      date.getFullYear() !== year
    ) {
      return null;
    }

    return date;
  }

  const parsed = new Date(raw);

  return Number.isNaN(parsed.getTime())
    ? null
    : parsed;
}