export type RadarValidationStatus =
  | "valid"
  | "invalid"
  | "duplicated";

export type RadarRawRow = Record<string, unknown>;

export interface RadarNormalizedRow {
  rowNumber: number;

  externalCustomerId: string | null;
  name: string | null;
  zone: string | null;

  registrationDate: Date | null;
  lastTransferAt: Date | null;
  lastActivationAt: Date | null;
  lastOrderAt: Date | null;

  phone: string | null;
  normalizedPhone: string | null;

  creditLimit: number | null;
  paymentMethods: string | null;

  validationStatus: RadarValidationStatus;
  validationErrors: string[];

  sourcePayload: RadarRawRow;
}

export interface RadarRowValidationContext {
  seenExternalIds: Set<string>;
}

export interface RadarValidationSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicatedRows: number;
  invalidPhoneRows: number;
}