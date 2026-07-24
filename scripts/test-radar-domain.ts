import {
  normalizeAndValidateRadarRow,
  summarizeRadarRows,
} from "../lib/radar/validate-row";

import type {
  RadarRawRow,
  RadarRowValidationContext,
} from "../lib/radar/types";

const testRows: RadarRawRow[] = [
  {
    ID: "1001",
    NomeCliente: "Mercado Exemplo",
    ZonaCliente: "AMPARO",
    DataCadastro: "10/07/2025",
    UltimoPedido: "15/06/2026",
    Contato: "(19) 99999-9999",
    LimiteCreditoPrazo: "R$ 1.234,56",
    FormasPagamento: "Boleto 21 dias",
  },
  {
    ID: "1001",
    NomeCliente: "Mercado Duplicado",
    ZonaCliente: "CAMPINAS",
    Contato: "(19) 98888-7777",
  },
  {
    ID: "",
    NomeCliente: "Cliente sem ID",
    ZonaCliente: "JUNDIAÍ",
    Contato: "telefone inválido",
  },
];

const context: RadarRowValidationContext = {
  seenExternalIds: new Set<string>(),
};

const normalizedRows = testRows.map((row, index) =>
  normalizeAndValidateRadarRow(
    row,
    index + 2,
    context
  )
);

console.dir(normalizedRows, {
  depth: null,
});

console.log(
  "\nResumo:",
  summarizeRadarRows(normalizedRows)
);