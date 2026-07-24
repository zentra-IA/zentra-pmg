import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase não configurado.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },

    realtime: {
      /*
       * O runtime aceita o pacote "ws", mas os tipos do Supabase
       * esperam uma interface semelhante ao WebSocket do navegador.
       */
      transport: WebSocket as unknown as typeof globalThis.WebSocket,
    },
  });
}