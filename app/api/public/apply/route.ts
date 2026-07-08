import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const dynamic = "force-dynamic";

function onlyDigits(value: any) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePhone(value: any) {
  const digits = onlyDigits(value);

  if (!digits) return null;

  if (digits.startsWith("55") && digits.length >= 12) return digits;

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  if (digits.length > 11 && !digits.startsWith("55")) {
    return `55${digits}`;
  }

  return digits;
}

function toArray(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function calculateAge(dateValue: any) {
  if (!dateValue) return null;

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();

  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < date.getDate())
  ) {
    age--;
  }

  if (age < 0 || age > 120) return null;

  return age;
}
function parseBirthDate(value: any): Date | null {
  if (!value) return null;

  if (value instanceof Date && !isNaN(value.getTime())) {
    return value;
  }

  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const d = new Date(`${text}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }

  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (match) {
    const [, dd, mm, yyyy] = match;

    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);

    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const companyId = String(process.env.PUBLIC_APPLY_COMPANY_ID || "").trim();

    if (!companyId || companyId === "ID_DA_EMPRESA_MOTIVAR") {
      return NextResponse.json(
        {
          success: false,
          error:
            "PUBLIC_APPLY_COMPANY_ID não configurado. Informe um UUID válido da tabela companies no .env.local.",
        },
        { status: 500 }
      );
    }

    const name = String(body.name || body.fullName || "").trim();

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Nome é obrigatório." },
        { status: 400 }
      );
    }

    const phone = normalizePhone(body.phone || body.mobile || body.whatsapp);
    const mobile = normalizePhone(body.mobile || body.whatsapp || body.phone) || phone;

    if (!phone && !mobile && !body.email) {
      return NextResponse.json(
        {
          success: false,
          error: "Informe pelo menos WhatsApp/telefone ou e-mail.",
        },
        { status: 400 }
      );
    }

    const birthDate = parseBirthDate(body.birthDate);
    const age = calculateAge(birthDate);

    const cpf = String(body.cpf || "").trim() || null;
    const email = String(body.email || "").trim().toLowerCase() || null;

    const duplicateWhere: any[] = [];

    if (cpf) duplicateWhere.push({ cpf });
    if (email) duplicateWhere.push({ email });
    if (phone) duplicateWhere.push({ phone });
    if (mobile) duplicateWhere.push({ mobile });

    const existing =
      duplicateWhere.length > 0
        ? await prisma.candidateProfile.findFirst({
            where: {
              company_id: companyId,
              active: true,
              OR: duplicateWhere,
            },
          })
        : null;

    const data: any = {
      company_id: companyId,
      branch_id: null,

      name,
      cpf,
      birthDate,

      phone,
      mobile,
      email,

      city: body.city || null,
      state: body.state || null,
      neighborhood: body.neighborhood || null,
      zipCode: body.zipCode || body.cep || null,

      education: body.education || null,
      course: body.course || null,
      courseStatus: body.courseStatus || body.course_status || null,
      lastRole: body.lastRole || body.last_role || null,

      skills: toArray(body.skills),
      languages: toArray(body.languages),

      experiences: {
        texto: body.experience || body.experiences || "",
      },

      resumeOrigin: "site",
      status: "novo",
      active: true,

      aiExtractedData: {
        status: "novo",
        origem: "site",
        ...(age ? { idade: age, age } : {}),
      },

      rawImportData: {
        source: "site",
        origin: "site",
        form: "motivar",
        submittedAt: new Date().toISOString(),
        ...body,
      },
    };

    const candidate = existing
      ? await prisma.candidateProfile.update({
          where: { id: existing.id },
          data: {
            ...data,
            // mantém dados antigos se o formulário vier incompleto
            name: data.name || existing.name,
            cpf: data.cpf || existing.cpf,
            phone: data.phone || existing.phone,
            mobile: data.mobile || existing.mobile,
            email: data.email || existing.email,
          },
        })
      : await prisma.candidateProfile.create({
    data,
});

    return NextResponse.json({
      success: true,
      candidateId: candidate.id,
      message: "Candidatura enviada com sucesso.",
    });
  } catch (error: any) {
    console.error("ERRO PUBLIC APPLY:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao enviar candidatura.",
      },
      { status: 500 }
    );
  }
}
