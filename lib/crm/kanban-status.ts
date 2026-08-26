/**
 * Fonte única de verdade para os status do Kanban Comercial.
 *
 * V8:
 * - Kanban, Inbox, API de leads e WhatsApp usam os mesmos valores.
 * - Status antigos continuam sendo aceitos e convertidos.
 * - Não depende de React nem de código server-only, portanto pode ser usado
 *   tanto em componentes "use client" quanto em rotas de API.
 */

export const KANBAN_STATUS_OPTIONS = [
  { value: "novo", label: "Novo lead", icon: "🆕" },
  { value: "enviado", label: "Mensagem enviada", icon: "📤" },
  { value: "respondeu", label: "Cliente respondeu", icon: "💬" },
  { value: "em_negociacao", label: "Quer cotação", icon: "💰" },
  { value: "cotacao_enviada", label: "Cotação enviada", icon: "📋" },
  { value: "campanha", label: "Em campanha", icon: "📣" },
  { value: "cliente_inativo", label: "Retomar depois", icon: "⏰" },
  { value: "pedido_fechado", label: "Pedido fechado", icon: "✅" },
  { value: "sem_interesse", label: "Sem interesse agora", icon: "🚫" },
  { value: "perdido", label: "Perdido", icon: "❌" },
] as const;

export type KanbanStatus =
  (typeof KANBAN_STATUS_OPTIONS)[number]["value"];

export const KANBAN_STATUS_VALUES: KanbanStatus[] =
  KANBAN_STATUS_OPTIONS.map((item) => item.value);

const LEGACY_TO_CANONICAL: Record<string, KanbanStatus> = {
  new: "novo",
  novo_lead: "novo",
  prospect: "novo",

  primeiro_contato: "respondeu",
  respondido: "respondeu",
  cliente_respondeu: "respondeu",

  interesse: "em_negociacao",
  negociacao: "em_negociacao",
  quer_cotacao: "em_negociacao",
  quer_agendar_entrevista: "em_negociacao",

  proposta: "cotacao_enviada",
  cotacao: "cotacao_enviada",
  orcamento_enviado: "cotacao_enviada",
  agendamento: "cotacao_enviada",
  entrevista: "cotacao_enviada",
  entrevista_agendada: "cotacao_enviada",
  entrevista_confirmada: "cotacao_enviada",

  em_campanha: "campanha",
  campanha_ativa: "campanha",

  reagendar_futuro: "cliente_inativo",
  reativar_futuro: "cliente_inativo",
  banco_talentos: "cliente_inativo",
  retomar_depois: "cliente_inativo",
  reativacao: "cliente_inativo",
  inativo: "cliente_inativo",
  cliente_risco: "cliente_inativo",

  pedido: "pedido_fechado",
  contratado: "pedido_fechado",
  aprovado: "pedido_fechado",
  finalizado: "pedido_fechado",
  hired: "pedido_fechado",
  finished: "pedido_fechado",
  approved: "pedido_fechado",
  cliente_ativo: "pedido_fechado",
  pos_venda: "pedido_fechado",
  comprou: "pedido_fechado",

  nao_aprovado: "perdido",
  nao_compareceu: "perdido",
  descartado: "perdido",
  reprovado: "perdido",
  rejected: "perdido",
  falta: "perdido",
};

function cleanStatus(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

export function normalizeKanbanStatus(
  value: unknown
): KanbanStatus | null {
  const raw = cleanStatus(value);

  if (!raw) return null;

  const normalized =
    LEGACY_TO_CANONICAL[raw] ||
    (raw as KanbanStatus);

  return KANBAN_STATUS_VALUES.includes(normalized)
    ? normalized
    : null;
}

export function normalizeKanbanStatusOrNovo(
  value: unknown
): KanbanStatus {
  return normalizeKanbanStatus(value) || "novo";
}

export function getKanbanStatusLabel(value: unknown) {
  const normalized = normalizeKanbanStatus(value);

  return (
    KANBAN_STATUS_OPTIONS.find(
      (item) => item.value === normalized
    )?.label || "Novo lead"
  );
}

export function getKanbanStatusIcon(value: unknown) {
  const normalized = normalizeKanbanStatus(value);

  return (
    KANBAN_STATUS_OPTIONS.find(
      (item) => item.value === normalized
    )?.icon || "🆕"
  );
}
