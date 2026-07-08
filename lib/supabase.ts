import { createClient } from "@supabase/supabase-js";

export function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase público não configurado.");
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = {
  from(table: string) {
    return getSupabaseClient().from(table);
  },

  auth: {
    signInWithPassword(params: any) {
      return getSupabaseClient().auth.signInWithPassword(params);
    },

    signOut() {
      return getSupabaseClient().auth.signOut();
    },

    getUser() {
      return getSupabaseClient().auth.getUser();
    },

    getSession() {
      return getSupabaseClient().auth.getSession();
    },
  },

  storage: {
    from(bucket: string) {
      return getSupabaseClient().storage.from(bucket);
    },
  },
};