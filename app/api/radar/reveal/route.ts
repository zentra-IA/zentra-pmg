import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function getPhone(p: any) {
  return p.phone1 || p.phone || p.whatsapp || "";
}

async function getUsage(access: Awaited<ReturnType<typeof requireCompanyAccess>>) {
  const clientId = access.userId || access.companyId;
  const month = currentMonthKey();

  const defaultLimit =
    Number(access.userRadarMonthlyLimit || 0) ||
    Number(access.planRadarLimit || 0) ||
    500;

  const usage = await prisma.prospectUsage.upsert({
    where: {
      company_id_clientId_month: {
        company_id: access.companyId,
        clientId,
        month,
      },
    },
    update: {},
    create: {
      company_id: access.companyId,
      branch_id: access.branchId || null,
      clientId,
      month,
      monthlyLimit: defaultLimit,
      used: 0,
    },
  });

  return {
    clientId,
    month,
    used: usage.used,
    limit: usage.monthlyLimit || defaultLimit,
    remaining: Math.max(0, (usage.monthlyLimit || defaultLimit) - usage.used),
  };
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const { companyId, branchId } = access;

    const body = await req.json();

    const ids: string[] = Array.isArray(body?.ids)
      ? body.ids
          .map((id: unknown) => String(id).trim())
          .filter((id: string) => id.length > 0)
      : [];

    if (!ids.length) {
      return NextResponse.json(
        { success: false, error: "Nenhum contato selecionado." },
        { status: 400 }
      );
    }

    const usage = await getUsage(access);
    const clientId = usage.clientId;

    const alreadyExported = await prisma.prospectExport.findMany({
      where: {
        company_id: companyId,
        clientId,
        prospectId: { in: ids },
      },
      select: {
        prospectId: true,
      },
    });

    const alreadyIds = new Set(alreadyExported.map((item) => item.prospectId));
    const newIds = ids.filter((id) => !alreadyIds.has(id));

    if (newIds.length > usage.remaining) {
      return NextResponse.json(
        {
          success: false,
          error: `Limite mensal insuficiente. Disponível: ${usage.remaining}`,
          usage,
        },
        { status: 400 }
      );
    }

    for (const prospectId of newIds) {
      await prisma.prospectExport.create({
        data: {
          company_id: companyId,
          branch_id: branchId || null,
          prospectId,
          clientId,
          action: "REVEAL",
        },
      });
    }

    if (newIds.length) {
      await prisma.prospectUsage.update({
        where: {
          company_id_clientId_month: {
            company_id: companyId,
            clientId,
            month: usage.month,
          },
        },
        data: {
          used: {
            increment: newIds.length,
          },
        },
      });
    }

    const revealed = await prisma.prospect.findMany({
      where: {
        company_id: companyId,
        id: { in: ids },
      },
    });

    const updatedUsage = await getUsage(access);

    return NextResponse.json({
      success: true,
      revealed: revealed.map((p: any) => ({
        id: p.id,
        externalId: p.externalId || null,
        name: p.name,
        city: p.city || null,
        state: p.state || null,
        segment: p.segment || null,
        category: p.category || null,
        productInterest: p.productInterest || null,
        email: p.email || null,
        phone1: getPhone(p) || null,
        phone2: p.phone2 || null,
        lastTransferAt: p.lastTransferAt || null,
        lastActivationAt: p.lastActivationAt || null,
        lastOrderAt: p.lastOrderAt || null,
        creditLimit: p.creditLimit ?? null,
        paymentMethod: p.paymentMethod || null,
        revealed: true,
      })),
      usage: updatedUsage,
    });
  } catch (error: any) {
    console.error("[RADAR_REVEAL_ERROR]", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao visualizar contatos.",
      },
      { status: 500 }
    );
  }
}
