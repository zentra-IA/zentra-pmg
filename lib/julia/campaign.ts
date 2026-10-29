
import "server-only";

import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";

import { attachJuliaAuthResponse } from "@/lib/julia/access";
import { prisma } from "@/lib/prisma";

import {
  enforceSameOrigin,
  juliaError,
  requireJuliaSession,
  JuliaAccessError,
} from "@/lib/julia/access";

import { classifyJuliaPhone } from "@/lib/julia/phones";

export {
  prisma,
  enforceSameOrigin,
  juliaError,
  requireJuliaSession,
  JuliaAccessError,
};

export const MAX_CONTACTS = 300;
export const MAX_CALLS = 50;
export const DAILY_LIMIT = 50;

export const OUTPUT_ID = "038879db-8b86-47e4-8ac2-673b88902784";

export const LIVE_STATUSES = [
  "RESERVED",
  "QUEUED",
  "RINGING",
  "IN_PROGRESS",
  "FINISHING",
];

// ============================================================
// AUTORIZAÇÃO DE DISCAGEM
// ============================================================
//
// Produção:
// - Teste autorizado no celular; ou
// - Piloto comercial explicitamente habilitado.
//
// O limite comercial efetivo deve ser aplicado na rota de
// chamada, dentro da transação do banco.
//
// A variável JULIA_CALLS_ENABLED funciona como desligamento
// geral de chamadas pagas.
// ============================================================

export function canDial(): boolean {
  const credentialsReady = Boolean(
    process.env.JULIA_VAPI_API_KEY &&
    process.env.JULIA_VAPI_ASSISTANT_ID &&
    process.env.JULIA_VAPI_PHONE_NUMBER_ID
  );

  const allowedMobile = (
    process.env.JULIA_TEST_MOBILE_E164 || ""
  ).replace(/\D/g, "");

  const localEnvironment =
    process.env.NODE_ENV !== "production";

  const productionMobileTest =
    process.env.JULIA_PROD_TEST_ONLY === "true" &&
    allowedMobile.length >= 12 &&
    allowedMobile.length <= 13 &&
    allowedMobile.startsWith("55");

  const commercialPilot =
    process.env.JULIA_COMMERCIAL_PILOT === "true";

  const environmentAllowed =
    localEnvironment ||
    productionMobileTest ||
    commercialPilot;

  return (
    process.env.JULIA_CALLS_ENABLED === "true" &&
    credentialsReady &&
    environmentAllowed
  );
}

// ============================================================
// CELULAR AUTORIZADO PARA TESTE
// ============================================================
//
// Essa exceção NÃO libera celulares de clientes comerciais.
//
// Exige:
// - Número configurado em JULIA_TEST_MOBILE_E164
// - Nome exato da campanha
// - Limite de uma tentativa por campanha
// - Ambiente local ou modo de teste em produção
// ============================================================

export function isJuliaTestMobile(
  phone: string,
  campaignName: string,
  maxCalls: number
): boolean {
  const allowed = (
    process.env.JULIA_TEST_MOBILE_E164 || ""
  ).replace(/\D/g, "");

  const number = String(phone || "").replace(/\D/g, "");

  const environmentAllowed =
    process.env.NODE_ENV !== "production" ||
    process.env.JULIA_PROD_TEST_ONLY === "true";

  if (!environmentAllowed) return false;

  if (
    campaignName !== "[TESTE JULIA] CELULAR AUTORIZADO" ||
    maxCalls !== 1
  ) {
    return false;
  }

  if (
    !allowed.startsWith("55") ||
    allowed.length !== 13
  ) {
    return false;
  }

  const localNumber = allowed.slice(2);

  return (
    number === allowed ||
    number === localNumber
  );
}

// ============================================================
// AUTENTICAÇÃO DA JÚLIA
// ============================================================

export async function requireJulia(
  req: NextRequest,
  write = false
) {
  if (write) {
    enforceSameOrigin(req);
  }

  return requireJuliaSession(req);
}

export async function ownedCampaign(
  req: NextRequest,
  id: string
) {
  const access = await requireJulia(req);

  const campaign = await prisma.juliaCampaign.findFirst({
    where: {
      id,
      company_id: access.companyId,
      user_id: access.userId,
    },
  });

  if (!campaign) {
    throw new JuliaAccessError(
      404,
      "Campanha da Júlia não encontrada."
    );
  }

  return { access, campaign };
}

// ============================================================
// RESULTADO ESTRUTURADO DA VAPI
// ============================================================

export function safeResult(
  value: unknown
): Record<string, any> | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const v = value as Record<string, unknown>;

  const selected: Record<string, any> = {};

  for (const key of [
    "resultado",
    "situacao_cliente",
    "responsavel_compras_identificado",
    "nome_responsavel",
    "melhor_dia_retorno",
    "melhor_horario_retorno",
    "interesse_whatsapp",
    "whatsapp_confirmado",
    "autorizou_contato_vendedor",
    "nao_ligar_novamente",
    "observacoes",
  ]) {
    const field = v[key];

    if (
      field === null ||
      typeof field === "boolean"
    ) {
      selected[key] = field;
    } else if (typeof field === "string") {
      selected[key] = field.slice(0, 600);
    }
  }

  return selected;
}

// ============================================================
// RESUMO DOS CONTATOS
// ============================================================

export function summarize(
  contacts: Array<{
    status: string;
    outcome: string | null;
    costUsd: number | null;
  }>
) {
  const outcomes: Record<string, number> = {};

  for (const c of contacts) {
    if (c.outcome) {
      outcomes[c.outcome] =
        (outcomes[c.outcome] || 0) + 1;
    }
  }

  return {
    total: contacts.length,

    pending: contacts.filter(
      c => c.status === "PENDING"
    ).length,

    active: contacts.filter(
      c => LIVE_STATUSES.includes(c.status)
    ).length,

    completed: contacts.filter(
      c =>
        [
          "DONE",
          "NO_ANSWER",
          "DO_NOT_CALL",
          "REVIEW",
          "FAILED",
        ].includes(c.status)
    ).length,

    callbacks: contacts.filter(
      c =>
        c.outcome === "responsavel_ausente" ||
        c.outcome === "retorno_agendado"
    ).length,

    optOut: contacts.filter(
      c => c.status === "DO_NOT_CALL"
    ).length,

    vapiCostUsd:
      Math.round(
        contacts.reduce(
          (sum, c) => sum + (Number(c.costUsd) || 0),
          0
        ) * 10000
      ) / 10000,

    outcomes,
  };
}

// ============================================================
// CONTROLE FINANCEIRO
// ============================================================
//
// Reserva preventiva por tentativa.
// Inclui margem para custos da Vapi e da telefonia.
//
// Este não é um teto absoluto da fatura dos fornecedores.
// ============================================================

export async function assertJuliaBudget(
  tx: Prisma.TransactionClient,
  companyId: string
): Promise<void> {
  const budget = Number(
    process.env.JULIA_BUDGET_USD_24H
  );

  const reserve = Number(
    process.env.JULIA_RESERVE_USD_PER_CALL
  );

  if (
    !process.env.JULIA_BUDGET_USD_24H ||
    !process.env.JULIA_RESERVE_USD_PER_CALL ||
    !Number.isFinite(budget) ||
    !Number.isFinite(reserve) ||
    budget <= 0 ||
    reserve <= 0 ||
    reserve > budget
  ) {
    throw new JuliaAccessError(
      503,
      "Orcamento da Julia nao configurado ou invalido. Discagem bloqueada."
    );
  }

  const since = new Date(
    Date.now() - 24 * 3600 * 1000
  );

  const attempts = await tx.juliaContact.findMany({
    where: {
      campaign: {
        company_id: companyId,
      },
      attempts: {
        gt: 0,
      },
      startedAt: {
        gte: since,
      },
    },

    select: {
      costUsd: true,
    },
  });

  const spentCents = attempts.reduce(
    (sum, attempt) => {
      const measured = attempt.costUsd;

      const cost =
        typeof measured === "number" &&
        Number.isFinite(measured) &&
        measured >= 0
          ? measured
          : 0;

      return (
        sum +
        Math.ceil(
          Math.max(reserve, cost) * 100
        )
      );
    },
    0
  );

  const availableCents =
    Math.floor(budget * 100) - spentCents;

  const nextReservationCents =
    Math.ceil(reserve * 100);

  if (availableCents < nextReservationCents) {
    throw new JuliaAccessError(
      429,
      "Orcamento preventivo da Julia atingido nas ultimas 24 horas."
    );
  }
}

// ============================================================
// COMUNICAÇÃO COM A VAPI
// ============================================================

export async function vapiFetch(
  path: string,
  method = "GET",
  body?: unknown
) {
  const key = process.env.JULIA_VAPI_API_KEY;

  if (!key) {
    throw new JuliaAccessError(
      503,
      "Chave Vapi não configurada no servidor."
    );
  }

  const ctrl = new AbortController();

  const timeout = setTimeout(
    () => ctrl.abort(),
    18000
  );

  try {
    const res = await fetch(
      `https://api.vapi.ai${path}`,
      {
        method,

        headers: {
          Authorization: `Bearer ${key}`,

          ...(body
            ? {
                "Content-Type": "application/json",
              }
            : {}),
        },

        body: body
          ? JSON.stringify(body)
          : undefined,

        cache: "no-store",
        signal: ctrl.signal,
      }
    );

    const data = await res
      .json()
      .catch(() => ({}));

    if (!res.ok) {
      console.error(
        "[JULIA_VAPI_API]",
        res.status,
        JSON.stringify(data).slice(0, 400)
      );

      throw new JuliaAccessError(
        502,
        `A Vapi retornou HTTP ${res.status}. Confira as configurações.`
      );
    }

    return data as Record<string, any>;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// VALIDAÇÃO DE TELEFONES
// ============================================================

export function checkPhone(phone: string) {
  // Celular comercial nunca é tratado como fixo.
  return (
    classifyJuliaPhone(phone).type === "FIXO"
  );
}

// ============================================================
// HORÁRIO COMERCIAL — SÃO PAULO
// ============================================================

export function inBusinessHours(): boolean {
  const parts = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      hour: "2-digit",
      hourCycle: "h23",
    }
  ).formatToParts(new Date());

  const day = parts.find(
    p => p.type === "weekday"
  )?.value;

  const hour = Number(
    parts.find(p => p.type === "hour")?.value || 0
  );

  return (
    day !== "Sat" &&
    day !== "Sun" &&
    hour >= 9 &&
    hour < 18
  );
}

// ============================================================
// BLOQUEIO DE CONTATOS — NÃO LIGAR
// ============================================================

export async function getOptOut(
  companyId: string,
  phone: string
) {
  return Boolean(
    await prisma.juliaContact.findFirst({
      where: {
        phone,
        status: "DO_NOT_CALL",
        campaign: {
          company_id: companyId,
        },
      },
      select: {
        id: true,
      },
    })
  );
}

// ============================================================
// TRATAMENTO DAS RESPOSTAS DA API
// ============================================================

export async function handleApi(
  req: NextRequest,
  fn: () => Promise<Response>
): Promise<Response> {
  let response: Response;

  try {
    response = await fn();
  } catch (err) {
    const e = juliaError(err);

    response = Response.json(
      {
        success: false,
        error: e.error,
      },
      {
        status: e.status,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  return attachJuliaAuthResponse(
    req,
    response
  );
}
