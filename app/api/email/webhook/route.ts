import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase não configurado.");
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey
  );
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabase();

    const body = await req.json();

    await supabase
      .from("email_events")
      .insert({
        email:
          body?.data?.to?.[0] ||
          body?.data?.email ||
          null,

        event:
          body?.type ||
          "unknown",

        resend_id:
          body?.data?.email_id ||
          body?.data?.id ||
          null,
      });

    return NextResponse.json({
      ok: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message,
      },
      { status: 500 }
    );
  }
}