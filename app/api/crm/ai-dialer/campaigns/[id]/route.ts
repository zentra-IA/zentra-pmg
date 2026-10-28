import { NextRequest, NextResponse } from "next/server";
import { prisma, ownedCampaign, summarize, handleApi } from "@/lib/julia/campaign";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req:NextRequest, context:{params:Promise<{id:string}>}) {
  return handleApi(req, async () => {
    const {id} = await context.params;
    const {campaign} = await ownedCampaign(req,id);
    const contacts = await prisma.juliaContact.findMany({
      where:{campaignId:id}, orderBy:{createdAt:"asc"}, take:300,
      select: {
        id:true,name:true,phone:true,status:true,attempts:true,vapiCallId:true,vapiStatus:true,
        outcome:true,endedReason:true,result:true,costUsd:true,durationSeconds:true,
        startedAt:true,finishedAt:true,lastError:true
      }
    });
    return NextResponse.json({success:true,campaign,contacts,summary:summarize(contacts)},
      {headers:{"Cache-Control":"no-store"}});
  });
}
