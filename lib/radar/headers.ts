import type { RadarRawRow } from "./types";

export const RADAR_HEADERS = {
  externalCustomerId: [
    "ID",
    "Codigo",
    "Código",
    "CodigoCliente",
    "CódigoCliente",
  ],

  name: [
    "NomeCliente",
    "Nome Cliente",
    "Cliente",
    "Empresa",
    "RazaoSocial",
    "Razão Social",
    "Nome",
  ],

  zone: [
    "ZonaCliente",
    "Zona Cliente",
    "Cidade",
    "Municipio",
    "Município",
  ],

  registrationDate: [
    "DataCadastro",
    "Data Cadastro",
  ],

  lastTransferAt: [
    "UltimaTransferencia",
    "Última Transferência",
    "Ultima Transferencia",
  ],

  lastActivationAt: [
    "UltimaAtivacao",
    "Última Ativação",
    "Ultima Ativacao",
  ],

  lastOrderAt: [
    "UltimoPedido",
    "Último Pedido",
    "Ultimo Pedido",
  ],

  phone: [
    "Contato",
    "Telefone",
    "Celular",
    "Whatsapp",
    "WhatsApp",
  ],

  creditLimit: [
    "LimiteCreditoPrazo",
    "Limite Crédito Prazo",
    "LimiteCredito",
    "Limite",
  ],

  paymentMethods: [
    "FormasPagamento",
    "Formas Pagamento",
    "FormaPagamento",
    "Forma de Pagamento",
  ],
} as const;

export function cleanValue(value: unknown): string {
  return String(value ?? "").trim();
}

export function normalizeHeader(value: string): string {
  return cleanValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
}

export function createNormalizedHeaderMap(
  row: RadarRawRow
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeHeader(key)] = value;
  }

  return normalized;
}

export function getRowValue(
  row: RadarRawRow,
  acceptedNames: readonly string[]
): unknown {
  const normalizedRow = createNormalizedHeaderMap(row);

  for (const name of acceptedNames) {
    const value = normalizedRow[normalizeHeader(name)];

    if (
      value !== undefined &&
      value !== null &&
      cleanValue(value) !== ""
    ) {
      return value;
    }
  }

  return null;
}