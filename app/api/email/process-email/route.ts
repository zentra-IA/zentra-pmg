import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase não configurado.");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST() {
  try {
    const supabase = getSupabase();

    const { data } = await supabase
      .from("automation_queue")
      .select(`
        *,
        email_contacts(*)
      `)
      .eq("channel", "EMAIL")
      .eq("status", "pending")
      .limit(5);

    for (const item of data || []) {
      console.log(
        "Enviar:",
        item?.email_contacts?.email
      );

      await supabase
        .from("automation_queue")
        .update({
          status: "completed",
          sent_at: new Date().toISOString(),
        })
        .eq("id", item.id);
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