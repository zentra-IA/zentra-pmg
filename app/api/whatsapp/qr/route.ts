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

const WHATSAPP_TIMEOUT_MS = 6_000;

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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const sessionId = normalizeWhatsappSessionNumber(
      searchParams.get("sessionId") || "1"
    );

    /*
     * Isolamento multiempresa e multiusuário:
     * a sessão final é sempre calculada no servidor usando a empresa
     * e o usuário autenticados. O cliente informa apenas o número da sessão.
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
          qr: null,
          me: null,
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
      /*
       * Esta rota apenas consulta o estado atual no servidor WhatsApp.
       * Ela não cria nem reinicia a sessão.
       */
      response = await fetch(
        `${WHATSAPP_SERVER}/qr/${encodeURIComponent(finalSessionId)}`,
        {
          method: "GET",
          cache: "no-store",
          signal: AbortSignal.timeout(WHATSAPP_TIMEOUT_MS),
          headers: {
            Accept: "application/json",
          },
        }
      );
    } catch (error: unknown) {
      return NextResponse.json(
        {
          success: false,
          status: "offline",
          qr: null,
          me: null,
          sessionId,
          companyId: session.companyId,
          userId: session.userId,
          error: isTimeoutError(error)
            ? "Servidor do WhatsApp demorou para responder."
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
          qr: null,
          me: data?.me || null,
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
        success: true,
        ...(data || {
          status: "offline",
          qr: null,
          me: null,
        }),
        sessionId,
        companyId: session.companyId,
        userId: session.userId,

        /*
         * Mantido por compatibilidade com o frontend atual.
         * O valor é produzido no servidor, nunca recebido do navegador.
         */
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
        qr: null,
        me: null,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao buscar QR Code.",
      },
      {
        status,
        headers: noStoreHeaders(),
      }
    );
  }
}
