import {
  normalizeHeader,
  RADAR_HEADERS,
} from "./headers";

type RadarHeaderField = keyof typeof RADAR_HEADERS;

export interface RadarHeaderValidationResult {
  valid: boolean;
  detectedHeaders: string[];
  missingRequired: RadarHeaderField[];
  missingOptional: RadarHeaderField[];
}

const REQUIRED_FIELDS: RadarHeaderField[] = [
  "externalCustomerId",
  "name",
];

const OPTIONAL_FIELDS: RadarHeaderField[] = [
  "zone",
  "registrationDate",
  "lastTransferAt",
  "lastActivationAt",
  "lastOrderAt",
  "phone",
  "creditLimit",
  "paymentMethods",
];

function headerExists(
  actualHeaders: string[],
  acceptedNames: readonly string[]
): boolean {
  const normalizedActualHeaders = new Set(
    actualHeaders.map(normalizeHeader)
  );

  return acceptedNames.some((acceptedName) =>
    normalizedActualHeaders.has(
      normalizeHeader(acceptedName)
    )
  );
}

export function validateRadarHeaders(
  headers: unknown[]
): RadarHeaderValidationResult {
  const detectedHeaders = headers
    .map((header) => String(header ?? "").trim())
    .filter(Boolean);

  const missingRequired = REQUIRED_FIELDS.filter(
    (field) =>
      !headerExists(
        detectedHeaders,
        RADAR_HEADERS[field]
      )
  );

  const missingOptional = OPTIONAL_FIELDS.filter(
    (field) =>
      !headerExists(
        detectedHeaders,
        RADAR_HEADERS[field]
      )
  );

  return {
    valid: missingRequired.length === 0,
    detectedHeaders,
    missingRequired,
    missingOptional,
  };
}