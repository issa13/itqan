// delete-account
//
// Permanently deletes the account of whoever calls it (👤 ملفي الشخصي →
// حذف الحساب in the app/website). Google Play and the App Store require
// in-app account deletion for any app that lets people sign up.
//
// Why a server function and not a database RPC: deleting the login itself
// (auth.users) is done with Supabase's official admin API, which needs the
// service-role key — a key that must never be in the browser/app. Once the
// login is gone, every row of that player in supabase-schema.sql goes with
// it through the "on delete cascade" links (profile, stats, sessions,
// attempts, achievements, friends, duels…).
//
// Steps:
//   1. work out who is calling from THEIR OWN login token (never trust an
//      id sent in the request),
//   2. as that player, run prepare_account_deletion() — forfeits a duel
//      that's underway so the opponent gets the win (schema section 31),
//   3. delete the login with the admin API.
//
// Deploy with: supabase functions deploy delete-account
// Needs no manual secrets — SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are injected automatically by Supabase.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// The request body must contain exactly this, so a stray or replayed call
// with just a login token can't delete anyone by accident.
const CONFIRM_PHRASE = "DELETE_MY_ACCOUNT";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== CONFIRM_PHRASE) return json({ ok: false, error: "missing_confirmation" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1. Who is calling — from their own token.
    const authHeader = req.headers.get("Authorization") || "";
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) return json({ ok: false, error: "not_authenticated" }, 401);

    // 2. Finish any running duel as a forfeit. Not fatal if it fails —
    //    the duel is removed with the account either way.
    const { error: prepError } = await callerClient.rpc("prepare_account_deletion");
    if (prepError) console.error("prepare_account_deletion failed", user.id, prepError.message);

    // 3. Delete the login (and, through the cascades, all their data).
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error("deleteUser failed", user.id, deleteError.message);
      return json({ ok: false, error: "delete_failed" }, 500);
    }

    return json({ ok: true }, 200);
  } catch (e) {
    console.error("delete-account error", e);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
