import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type AuditPayload = {
  companyId?: string | null;
  userId?: string | null;
  action: string;
  entity?: string | null;
  metadata?: any;
};

export async function auditLog(payload: AuditPayload) {
  try {
    const supabase = getSupabaseAdmin();

    await supabase.from("activity_logs").insert({
      company_id: payload.companyId || null,
      user_id: payload.userId || null,
      action: payload.action,
      entity: payload.entity || null,
      metadata: payload.metadata || {},
    });
  } catch (error) {
    console.error("Erro ao registrar auditoria:", error);
  }
}