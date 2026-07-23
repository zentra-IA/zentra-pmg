import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function getPhone(prospect: any) {
  return prospect.phone1 || prospect.phone || prospect.whatsapp || "";
}

async function getUsage(
  access: Awaited<ReturnType<typeof requireCompanyAccess>>
) {
  const clientId = access.userId;
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
    remaining: Math.max(
      0,
      (usage.monthlyLimit || defaultLimit) - usage.used
    ),
  };
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const { companyId, branchId, userId } = access;
    const role = String(access.userRole || "").toUpperCase();

    // Preserva exatamente a regra atual do Radar.
    if (role === "SUPERVISOR") {
      return NextResponse.json(
        {
          success: false,
          error: "Acesso negado.",
        },
        { status: 403 }
      );
    }

    if (!companyId || !userId) {
      return NextResponse.json(
        {
          success: false,
          error: "Empresa ou usuário não identificado.",
        },
        { status: 401 }
      );
    }

    const body = await req.json();

    const ids: string[] = Array.isArray(body?.ids)
      ? body.ids
          .map((id: unknown) => String(id).trim())
          .filter((id: string) => id.length > 0)
      : [];

    if (!ids.length) {
      return NextResponse.json(
        {
          success: false,
          error: "Nenhum contato selecionado.",
        },
        { status: 400 }
      );
    }

    const currentSnapshot = await prisma.radar_snapshots.findFirst({
      where: {
        company_id: companyId,
        is_current: true,
        status: "completed",
      },
      orderBy: {
        created_at: "desc",
      },
      select: {
        id: true,
      },
    });

    /*
     * Compatibilidade segura:
     * - sem snapshot atual, mantém o comportamento antigo;
     * - com snapshot atual, só aceita contatos vinculados a ele.
     */
    const snapshotFilter = currentSnapshot
      ? {
          radar_snapshot_prospects: {
            some: {
              snapshot_id: currentSnapshot.id,
              company_id: companyId,
            },
          },
        }
      : {};

    const validProspects = await prisma.prospect.findMany({
      where: {
        company_id: companyId,
        id: {
          in: ids,
        },
        ...snapshotFilter,
      },
      select: {
        id: true,
      },
    });

    const validIds = validProspects.map((prospect) => prospect.id);

    if (!validIds.length) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Nenhum contato válido foi encontrado no Radar atual desta empresa.",
        },
        { status: 404 }
      );
    }

    const usage = await getUsage(access);
    const clientId = usage.clientId;

    const alreadyExported = await prisma.prospectExport.findMany({
      where: {
        company_id: companyId,
        clientId,
        prospectId: {
          in: validIds,
        },
      },
      select: {
        prospectId: true,
      },
    });

    const alreadyIds = new Set(
      alreadyExported.map((item) => item.prospectId)
    );

    const newIds = validIds.filter((id) => !alreadyIds.has(id));

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

    if (newIds.length) {
      await prisma.$transaction(async (tx) => {
        for (const prospectId of newIds) {
          await tx.prospectExport.create({
            data: {
              company_id: companyId,
              branch_id: branchId || null,
              prospectId,
              clientId,
              action: "REVEAL",
            },
          });
        }

        await tx.prospectUsage.update({
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
      });
    }

    const revealed = await prisma.prospect.findMany({
      where: {
        company_id: companyId,
        id: {
          in: validIds,
        },
        ...snapshotFilter,
      },
    });

    const updatedUsage = await getUsage(access);

    return NextResponse.json({
      success: true,
      revealed: revealed.map((prospect: any) => ({
        id: prospect.id,
        externalId: prospect.externalId || null,
        name: prospect.name,
        city: prospect.city || null,
        state: prospect.state || null,
        segment: prospect.segment || null,
        category: prospect.category || null,
        productInterest: prospect.productInterest || null,
        email: prospect.email || null,
        phone1: getPhone(prospect) || null,
        phone2: prospect.phone2 || null,
        lastTransferAt: prospect.lastTransferAt || null,
        lastActivationAt: prospect.lastActivationAt || null,
        lastOrderAt: prospect.lastOrderAt || null,
        creditLimit: prospect.creditLimit ?? null,
        paymentMethod: prospect.paymentMethod || null,
        revealed: true,
      })),
      usage: updatedUsage,
      snapshotId: currentSnapshot?.id ?? null,
      snapshotMode: Boolean(currentSnapshot),
    });
  } catch (error: any) {
    console.error("[RADAR_REVEAL_V2_ERROR]", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao visualizar contatos.",
      },
      { status: 500 }
    );
  }
}
