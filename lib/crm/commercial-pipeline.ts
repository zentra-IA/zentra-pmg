/**
 * ========================================================================
 * ZENTRA SALES
 * Motor único do Pipeline Comercial
 * ========================================================================
 *
 * ESTE ARQUIVO É A ÚNICA FONTE DE VERDADE DO CRM COMERCIAL.
 *
 * Dashboard
 * Inbox
 * WhatsApp Incoming
 * Kanban
 * Templates
 * Automações
 *
 * devem utilizar SOMENTE estas constantes.
 *
 * Nunca criar listas de status dentro das rotas.
 */

export const COMMERCIAL_STATUS = {
  NOVO: "novo",

  ENVIADO: "enviado",

  RESPONDEU: "respondeu",

  PRIMEIRO_CONTATO: "primeiro_contato",

  EM_NEGOCIACAO: "em_negociacao",

  COTACAO_ENVIADA: "cotacao_enviada",

  PEDIDO_FECHADO: "pedido_fechado",

  CLIENTE_ATIVO: "cliente_ativo",

  CLIENTE_INATIVO: "cliente_inativo",

  CAMPANHA: "campanha",

  SEM_INTERESSE: "sem_interesse",

  POS_VENDA: "pos_venda",

  PERDIDO: "perdido",
} as const;

export type CommercialStatus =
  (typeof COMMERCIAL_STATUS)[keyof typeof COMMERCIAL_STATUS];

export const COMMERCIAL_PIPELINE: CommercialStatus[] = [
  COMMERCIAL_STATUS.NOVO,

  COMMERCIAL_STATUS.ENVIADO,

  COMMERCIAL_STATUS.RESPONDEU,

  COMMERCIAL_STATUS.PRIMEIRO_CONTATO,

  COMMERCIAL_STATUS.EM_NEGOCIACAO,

  COMMERCIAL_STATUS.COTACAO_ENVIADA,

  COMMERCIAL_STATUS.PEDIDO_FECHADO,

  COMMERCIAL_STATUS.CLIENTE_ATIVO,

  COMMERCIAL_STATUS.CLIENTE_INATIVO,

  COMMERCIAL_STATUS.CAMPANHA,

  COMMERCIAL_STATUS.SEM_INTERESSE,

  COMMERCIAL_STATUS.POS_VENDA,

  COMMERCIAL_STATUS.PERDIDO,
];

export const LOCKED_COMMERCIAL_STATUSES: CommercialStatus[] = [
  COMMERCIAL_STATUS.PEDIDO_FECHADO,

  COMMERCIAL_STATUS.CLIENTE_ATIVO,

  COMMERCIAL_STATUS.CLIENTE_INATIVO,

  COMMERCIAL_STATUS.SEM_INTERESSE,

  COMMERCIAL_STATUS.PERDIDO,
];

export function isCommercialStatus(
  value: unknown
): value is CommercialStatus {
  return COMMERCIAL_PIPELINE.includes(
    String(value) as CommercialStatus
  );
}

export function normalizeCommercialStatus(
  value: unknown
): CommercialStatus {
  const status = String(value || "").trim().toLowerCase();

  if (isCommercialStatus(status)) {
    return status;
  }

  /**
   * Compatibilidade com versões antigas
   */

  switch (status) {
    case "interesse":
    case "quer_agendar_entrevista":
      return COMMERCIAL_STATUS.PRIMEIRO_CONTATO;

    case "entrevista_agendada":
    case "entrevista_confirmada":
      return COMMERCIAL_STATUS.COTACAO_ENVIADA;

    case "contratado":
      return COMMERCIAL_STATUS.CLIENTE_ATIVO;

    case "nao_aprovado":
      return COMMERCIAL_STATUS.PERDIDO;

    case "respondido":
      return COMMERCIAL_STATUS.RESPONDEU;

    default:
      return COMMERCIAL_STATUS.NOVO;
  }
}

export function isLockedCommercialStatus(
  status: unknown
) {
  return LOCKED_COMMERCIAL_STATUSES.includes(
    normalizeCommercialStatus(status)
  );
}

export const COMMERCIAL_COLUMN_LABELS: Record<
  CommercialStatus,
  string
> = {
  novo: "Novo",

  enviado: "Mensagem enviada",

  respondeu: "Respondeu",

  primeiro_contato: "Primeiro contato",

  em_negociacao: "Em negociação",

  cotacao_enviada: "Cotação enviada",

  pedido_fechado: "Pedido fechado",

  cliente_ativo: "Cliente ativo",

  cliente_inativo: "Cliente inativo",

  campanha: "Campanha",

  sem_interesse: "Sem interesse",

  pos_venda: "Pós-venda",

  perdido: "Perdido",
};