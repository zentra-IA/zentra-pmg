import { NextRequest, NextResponse } from "next/server";
import {
  prisma, MAX_CONTACTS, MAX_CALLS, isJuliaTestMobile, requireJulia,
  handleApi
} from "@/lib/julia/campaign";
import { normalizeJuliaRows } from "@/lib/julia/phones";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleApi(req, async () => {
    const access = await requireJulia(req);
    const campaigns = await prisma.juliaCampaign.findMany({
      where: { company_id: access.companyId, user_id: access.userId },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { _count: { select: { contacts: true } } },
    });
    return NextResponse.json({ success: true, campaigns }, { headers: {"Cache-Control":"no-store"} });
  });
}

export async function POST(req: NextRequest) {
  return handleApi(req, async () => {
    const access = await requireJulia(req, true);
    const body = await req.json();
    const name = String(body?.name || "").trim().slice(0, 120);
    const maxCalls = Math.floor(Math.min(MAX_CALLS, Math.max(1, Number(body?.maxCalls || 5) || 5)));
    if (!name) return NextResponse.json({ success:false, error:"Informe o nome da campanha." }, { status:400 });
    if (body?.confirmedAuthorized !== true) return NextResponse.json({
      success:false, error:"Confirme que os contatos são elegíveis e que bloqueios de contato foram respeitados."
    }, { status:400 });
    if (!Array.isArray(body?.contacts) || !body.contacts.length || body.contacts.length > MAX_CONTACTS) {
      return NextResponse.json({success:false,error:`Envie de 1 a ${MAX_CONTACTS} contatos.`},{status:400});
    }
    const rows = body.contacts.map((c: any) => ({
      name: String(c?.name || "").slice(0,180), phone: String(c?.phone || "")
    }));
    const checked = normalizeJuliaRows(rows);
    const isTest = body?.testMobile === true;
    if (isTest && (
      body?.contacts?.length !== 1 ||
      name !== "[TESTE JULIA] CELULAR AUTORIZADO" ||
      maxCalls !== 1 ||
      checked.length !== 1 ||
      checked[0].type !== "CELULAR" ||
      checked[0].duplicate ||
      !isJuliaTestMobile(checked[0].phone, name, maxCalls)
    )) return NextResponse.json({success:false,error:"Teste de celular nao autorizado."},{status:403});
    const fixed = checked.filter(c =>
      !c.duplicate && (c.type === "FIXO" || (isTest && c.type === "CELULAR" &&
        isJuliaTestMobile(c.phone, name, maxCalls)))
    );
    const optOutRows = await prisma.juliaContact.findMany({
      where: {
        phone: { in: fixed.map(c => c.phone) },
        status: "DO_NOT_CALL",
        campaign: { company_id: access.companyId }
      }, select: { phone: true }
    });
    const optOutPhones = new Set(optOutRows.map(row => row.phone));
    const eligible = fixed.filter(c => !optOutPhones.has(c.phone));
    const blocked = fixed.length - eligible.length;
    if (!eligible.length) return NextResponse.json({
      success: false, error: "Nenhum fixo elegível. Celulares, inválidos, repetidos e bloqueados não entram na campanha."
    },{status:400});
    const created = await prisma.juliaCampaign.create({
      data: {
        company_id:access.companyId, user_id:access.userId, name,
        status:"READY", maxCalls,
        contacts:{create: eligible.map(c=>({name:c.name,phone:c.phone,phoneType:isTest?"CELULAR":"FIXO"}))}
      },
      include: { _count: {select:{contacts:true}}}
    });
    return NextResponse.json({
      success:true, campaign:created,
      excluded:{ mobile: checked.filter(c=>c.type==="CELULAR").length,
        invalid:checked.filter(c=>c.type==="INVALIDO").length,
        duplicates:checked.filter(c=>c.duplicate).length, optOut:blocked }
    },{status:201});
  });
}
