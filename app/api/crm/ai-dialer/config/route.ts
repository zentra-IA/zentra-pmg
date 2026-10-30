import { NextRequest, NextResponse } from "next/server";
import { canDial, handleApi, requireJulia, MAX_CALLS, DAILY_LIMIT } from "@/lib/julia/campaign";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(req:NextRequest){
  return handleApi(req,async()=>{
    await requireJulia(req);
    return NextResponse.json({success:true,callsEnabled:canDial(),maxCalls:MAX_CALLS,dailyLimit:DAILY_LIMIT,mode:"COMMERCIAL",
      budgetUsd24h:Number(process.env.JULIA_BUDGET_USD_24H||0),
      reserveUsdPerCall:Number(process.env.JULIA_RESERVE_USD_PER_CALL||0)});
  });
}
