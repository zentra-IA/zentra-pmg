import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  MasterAccessError,
  requireBillingMaster,
} from "@/lib/admin/master-billing-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ReminderRow = {
  profileId: string;
  companyUserId: string;
  companyName: string;
  name: string;
  email: string;
  phone: string;
  amount: number;
  dueDate: Date;
  competence: string;
  type: "tomorrow" | "today" | "overdue";
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function money(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function saoPauloDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(parts.find((item) => item.type === "year")?.value),
    month: Number(parts.find((item) => item.type === "month")?.value),
    day: Number(parts.find((item) => item.type === "day")?.value),
  };
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;
}

function currentSaoPauloKey() {
  const { year, month, day } = saoPauloDateParts();
  return dateKey(year, month, day);
}

function addDaysToCalendarKey(key: string, days: number) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return dateKey(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate()
  );
}

function competenceFromKey(key: string) {
  return key.slice(0, 7);
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dueKeyForCompetence(competence: string, dueDay: number) {
  const [year, month] = competence.split("-").map(Number);

  const day = Math.min(
    Math.max(Number(dueDay || 10), 1),
    lastDayOfMonth(year, month)
  );

  return dateKey(year, month, day);
}

function dueDateFromKey(key: string) {
  return new Date(`${key}T12:00:00-03:00`);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value: Date) {
  return value.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}

function sectionHtml(
  title: string,
  rows: ReminderRow[],
  color: string
) {
  if (!rows.length) return "";

  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  const items = rows
    .map(
      (row) => `
        <tr>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb">
            <strong>${escapeHtml(row.name)}</strong><br/>
            <span style="color:#64748b;font-size:12px">
              ${escapeHtml(row.companyName)}
            </span>
          </td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb">
            ${escapeHtml(row.phone || "-")}
          </td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb">
            ${formatDate(row.dueDate)}
          </td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right">
            <strong>${money(row.amount)}</strong>
          </td>
        </tr>
      `
    )
    .join("");

  return `
    <div style="margin-top:22px">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
        <h2 style="margin:0;color:${color};font-size:18px">${escapeHtml(
          title
        )}</h2>
        <strong style="color:${color}">${rows.length} cobrança(s) • ${money(
          total
        )}</strong>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-top:10px;background:#fff;border:1px solid #e5e7eb">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:10px;text-align:left;font-size:11px">CLIENTE</th>
            <th style="padding:10px;text-align:left;font-size:11px">WHATSAPP</th>
            <th style="padding:10px;text-align:left;font-size:11px">VENCIMENTO</th>
            <th style="padding:10px;text-align:right;font-size:11px">VALOR</th>
          </tr>
        </thead>
        <tbody>${items}</tbody>
      </table>
    </div>
  `;
}

async function collectReminderData() {
  const todayKey = currentSaoPauloKey();
  const tomorrowKey = addDaysToCalendarKey(todayKey, 1);

  const currentCompetence = competenceFromKey(todayKey);
  const tomorrowCompetence = competenceFromKey(tomorrowKey);
  const competences = Array.from(
    new Set([currentCompetence, tomorrowCompetence])
  );

  const [profiles, payments] = await Promise.all([
    prisma.admin_billing_profiles.findMany({
      where: {
        plan_status: "ATIVO",
        company_user: {
          active: true,
        },
      },
      include: {
        company_user: true,
        companies: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.admin_billing_payments.findMany({
      where: {
        competence: {
          in: competences,
        },
        type: "MENSALIDADE",
        status: "PAGO",
      },
      select: {
        profile_id: true,
        competence: true,
      },
    }),
  ]);

  const paidKeys = new Set(
    payments.map(
      (payment) => `${payment.profile_id}:${payment.competence}`
    )
  );

  const tomorrow: ReminderRow[] = [];
  const today: ReminderRow[] = [];
  const overdue: ReminderRow[] = [];

  for (const profile of profiles) {
    const user = profile.company_user;

    const base = {
      profileId: profile.id,
      companyUserId: profile.company_user_id,
      companyName: profile.companies?.name || "Empresa",
      name: user.name || "Sem nome",
      email: user.email || "",
      phone: user.phone || "",
      amount: Number(profile.monthly_value || 0),
    };

    const currentPaid = paidKeys.has(
      `${profile.id}:${currentCompetence}`
    );

    const currentDueKey = dueKeyForCompetence(
      currentCompetence,
      profile.due_day
    );

    if (!currentPaid) {
      if (currentDueKey === todayKey) {
        today.push({
          ...base,
          dueDate: dueDateFromKey(currentDueKey),
          competence: currentCompetence,
          type: "today",
        });
      } else if (currentDueKey < todayKey) {
        overdue.push({
          ...base,
          dueDate: dueDateFromKey(currentDueKey),
          competence: currentCompetence,
          type: "overdue",
        });
      }
    }

    const tomorrowDueKey = dueKeyForCompetence(
      tomorrowCompetence,
      profile.due_day
    );

    const tomorrowPaid = paidKeys.has(
      `${profile.id}:${tomorrowCompetence}`
    );

    if (!tomorrowPaid && tomorrowDueKey === tomorrowKey) {
      tomorrow.push({
        ...base,
        dueDate: dueDateFromKey(tomorrowDueKey),
        competence: tomorrowCompetence,
        type: "tomorrow",
      });
    }
  }

  const dedupe = (rows: ReminderRow[]) => {
    const map = new Map<string, ReminderRow>();

    for (const row of rows) {
      map.set(`${row.profileId}:${row.competence}:${row.type}`, row);
    }

    return Array.from(map.values());
  };

  return {
    todayKey,
    tomorrow: dedupe(tomorrow),
    today: dedupe(today),
    overdue: dedupe(overdue),
  };
}

function buildEmailHtml(
  data: Awaited<ReturnType<typeof collectReminderData>>
) {
  const allRows = [...data.tomorrow, ...data.today, ...data.overdue];
  const totalCount = allRows.length;
  const totalAmount = allRows.reduce((sum, row) => sum + row.amount, 0);

  return `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:28px;color:#0f172a">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;padding:26px">
        <div style="font-size:11px;font-weight:800;letter-spacing:.12em;color:#047857">
          ZENTRA SALES AI • CONTROLE FINANCEIRO
        </div>

        <h1 style="margin:8px 0 6px;font-size:26px">
          Resumo diário de cobranças
        </h1>

        <p style="margin:0;color:#64748b">
          ${escapeHtml(data.todayKey)} • ${totalCount} cobrança(s) • ${money(
            totalAmount
          )}
        </p>

        ${sectionHtml("Vencem amanhã", data.tomorrow, "#b45309")}
        ${sectionHtml("Vencem hoje", data.today, "#1d4ed8")}
        ${sectionHtml("Atrasadas", data.overdue, "#b91c1c")}

        ${
          totalCount === 0
            ? `<div style="margin-top:22px;padding:18px;border-radius:14px;background:#ecfdf5;color:#166534">
                 Nenhuma cobrança exige atenção hoje.
               </div>`
            : ""
        }

        <p style="margin:24px 0 0;color:#94a3b8;font-size:11px">
          Este e-mail é exclusivo do administrador master do Zentra Sales AI.
        </p>
      </div>
    </div>
  `;
}

async function sendEmail(params: {
  subject: string;
  html: string;
  idempotencyKey: string;
}) {
  const apiKey = clean(process.env.RESEND_API_KEY);
  const to = clean(process.env.ZENTRA_BILLING_ALERT_EMAIL);
  const from = clean(process.env.ZENTRA_BILLING_FROM_EMAIL);

  if (!apiKey) {
    throw new Error("RESEND_API_KEY não configurada.");
  }

  if (!to) {
    throw new Error("ZENTRA_BILLING_ALERT_EMAIL não configurado.");
  }

  if (!from) {
    throw new Error(
      "ZENTRA_BILLING_FROM_EMAIL não configurado. Use um remetente de domínio verificado no Resend."
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": params.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: params.subject,
      html: params.html,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.message || data?.error || "Falha ao enviar e-mail pelo Resend."
    );
  }

  return {
    id: data?.id || null,
    to,
  };
}

function cronAuthorized(req: NextRequest) {
  const secret = clean(process.env.CRON_SECRET);

  if (!secret) return false;

  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function errorResponse(error: unknown) {
  if (error instanceof MasterAccessError) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: error.status }
    );
  }

  console.error("[admin/billing/reminders]", error);

  return NextResponse.json(
    {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao processar lembretes financeiros.",
    },
    { status: 500 }
  );
}

export async function GET(req: NextRequest) {
  try {
    if (!cronAuthorized(req)) {
      return NextResponse.json(
        {
          success: false,
          error: "Cron não autorizado.",
        },
        { status: 401 }
      );
    }

    const data = await collectReminderData();

    const attentionCount =
      data.tomorrow.length + data.today.length + data.overdue.length;

    if (attentionCount === 0) {
      return NextResponse.json({
        success: true,
        sent: false,
        reason: "Nenhuma cobrança exige atenção hoje.",
        date: data.todayKey,
      });
    }

    const result = await sendEmail({
      subject: `Zentra — ${attentionCount} cobrança(s) exigem atenção`,
      html: buildEmailHtml(data),
      idempotencyKey: `zentra-billing-daily-${data.todayKey}`,
    });

    return NextResponse.json({
      success: true,
      sent: true,
      emailId: result.id,
      to: result.to,
      summary: {
        tomorrow: data.tomorrow.length,
        today: data.today.length,
        overdue: data.overdue.length,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireBillingMaster(req);

    const data = await collectReminderData();

    const result = await sendEmail({
      subject: "Zentra — teste das notificações financeiras",
      html: buildEmailHtml(data),
      idempotencyKey: `zentra-billing-test-${Date.now()}`,
    });

    return NextResponse.json({
      success: true,
      sent: true,
      emailId: result.id,
      to: result.to,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
