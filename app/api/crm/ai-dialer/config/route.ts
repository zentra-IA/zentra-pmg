import { NextRequest, NextResponse } from "next/server";
import { canDial, handleApi, requireJulia, MAX_CALLS, DAILY_LIMIT } from "@/lib/julia/campaign";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(req:NextRequest){
  return handleApi(req,async()=>{
    await requireJulia(req);
    return NextResponse.json({success:true,callsEnabled:canDial(),maxCalls:MAX_CALLS,dailyLimit:DAILY_LIMIT,mode:"LOCAL_PILOT"});
  });
}
