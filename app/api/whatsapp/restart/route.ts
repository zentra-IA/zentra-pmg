import { NextRequest, NextResponse } from "next/server";
import {
  normalizeWhatsappSessionNumber,
  resolveWhatsappSession,
} from "@/lib/whatsapp-session";

export const dynamic = "force-dynamic";

const WHATSAPP_SERVER =
  process.env.WHATSAPP_SERVER_URL ||
  process.env.NEXT_PUBLIC_WHATSAPP_SERVER ||
  "http://localhost:3011";

type ErrorLike = {
  status?: unknown;
  statusCode?: unknown;
};

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  };
}

function getErrorStatus(error: unknown): number {
  const candidate = error as ErrorLike;
  const status = Number(candidate?.status ?? candidate?.statusCode);

  if (Number.isInteger(status) && status >= 400 && status <= 599) {
    return status;
  }

  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error || "").toLowerCase();

  if (
    message.includes("não autenticado") ||
    message.includes("nao autenticado") ||
    message.includes("não identificad") ||
    message.includes("nao identificad")
  ) {
    return 401;
  }

  if (
    message.includes("acesso negado") ||
    message.includes("sem acesso") ||
    message.includes("forbidden")
  ) {
    return 403;
  }

  return 500;
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

const WHATSAPP_TIMEOUT_MS = 12_000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const sessionId = normalizeWhatsappSessionNumber(
      body?.sessionId || body?.session || "1"
    );

    /*
     * Mantém o isolamento multiempresa e multiusuário.
     * O fullSessionId é calculado no servidor com base no usuário e
     * na empresa autenticados; nunca é aceito diretamente do navegador.
     */
    const session = await resolveWhatsappSession(req, sessionId);

    const role = String(session.userRole || "")
      .trim()
      .toUpperCase();

    if (role === "SUPERVISOR") {
      return NextResponse.json(
        {
          success: false,
          status: "forbidden",
          sessionId,
          error: "Acesso negado.",
        },
        {
          status: 403,
          headers: noStoreHeaders(),
        }
      );
    }

    const finalSessionId = session.fullSessionId;

    let response: Response;

    try {
      response = await fetch(
        `${WHATSAPP_SERVER}/restart/${encodeURIComponent(finalSessionId)}`,
        {
          method: "POST",
          cache: "no-store",
          signal: AbortSignal.timeout(WHATSAPP_TIMEOUT_MS),
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );
    } catch (error: unknown) {
      return NextResponse.json(
        {
          success: false,
          status: "offline",
          sessionId,
          companyId: session.companyId,
          userId: session.userId,
          error: isTimeoutError(error)
            ? "Servidor do WhatsApp demorou para reiniciar a sessão."
            : "Servidor do WhatsApp indisponível.",
        },
        {
          status: 502,
          headers: noStoreHeaders(),
        }
      );
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          status: data?.status || "offline",
          sessionId,
          companyId: session.companyId,
          userId: session.userId,
          error:
            data?.error ||
            `Servidor do WhatsApp respondeu com status ${response.status}.`,
        },
        {
          status: response.status,
          headers: noStoreHeaders(),
        }
      );
    }

    return NextResponse.json(
      {
        ...(data || {}),
        success: data?.success ?? true,
        sessionId,
        companyId: session.companyId,
        userId: session.userId,
        finalSessionId,
      },
      {
        status: 200,
        headers: noStoreHeaders(),
      }
    );
  } catch (error: unknown) {
    const status = getErrorStatus(error);

    return NextResponse.json(
      {
        success: false,
        status: status === 403 ? "forbidden" : "offline",
        error:
          error instanceof Error
            ? error.message
            : "Erro ao reiniciar WhatsApp.",
      },
      {
        status,
        headers: noStoreHeaders(),
      }
    );
  }
}
