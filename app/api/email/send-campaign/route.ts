import { NextResponse } from "next/server";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY não configurada");
    }

    if (!process.env.EMAIL_FROM) {
      throw new Error("EMAIL_FROM não configurado");
    }

    const resend = new Resend(
      process.env.RESEND_API_KEY
    );

    const body = await req.json();

    for (const contact of body.contacts || []) {
      await resend.emails.send({
        from: process.env.EMAIL_FROM,
        to: contact.email,
        subject: body.subject || "Campanha",
        html: `
          <div>
            <h2>Olá ${contact.nome || ""}</h2>
            ${body.html || ""}
          </div>
        `,
      });
    }

    return NextResponse.json({
      success: true,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        success: false,
        error: e?.message,
      },
      { status: 500 }
    );
  }
}