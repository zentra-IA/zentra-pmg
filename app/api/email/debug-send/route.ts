import { NextResponse } from "next/server"
import { Resend } from "resend"

export async function GET() {
  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({
        success: false,
        error: "Falta RESEND_API_KEY no .env.local",
      })
    }

    if (!process.env.EMAIL_FROM) {
      return NextResponse.json({
        success: false,
        error: "Falta EMAIL_FROM no .env.local",
      })
    }

    const resend = new Resend(process.env.RESEND_API_KEY)

    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: "gregorysanches48@gmail.com",
      subject: "Teste real CRM FGTS",
      html: "<p>Esse é um teste real enviado pelo sistema.</p>",
    })

    return NextResponse.json({
      success: true,
      result,
    })
  } catch (e: any) {
    return NextResponse.json({
      success: false,
      error: e.message,
      details: e,
    })
  }
}