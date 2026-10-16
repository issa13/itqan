// Thin wrapper around the Supabase client: auth + data helpers used
// by auth-ui.js and app.js. Falls back gracefully to guest mode if
// config.js hasn't been filled in yet, OR if the Supabase SDK itself
// failed to load (vendor/supabase.js missing) — either way, sb stays
// null and nothing downstream should assume it's non-null without
// checking first.

const isConfigured =
  typeof SUPABASE_URL === "string" &&
  typeof SUPABASE_ANON_KEY === "string" &&
  !SUPABASE_URL.includes("YOUR_SUPABASE") &&
  !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE") &&
  typeof window.supabase !== "undefined";

const sb = isConfigured
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

let currentUser = null;
const authListeners = [];

// Listeners get (user, { initial }) — initial is true until the session
// stored from a previous visit has been restored, so a listener can tell
// "page just loaded" apart from "the person just logged in/out".
let authInitialized = false;

function onAuthChange(fn) {
  authListeners.push(fn);
  fn(currentUser, { initial: !authInitialized }); // fire immediately with current state
}

// Listeners only care about WHO is signed in, not about token
// refreshes. Supabase fires onAuthStateChange for INITIAL_SESSION,
// TOKEN_REFRESHED (roughly hourly), tab re-focus, etc. — re-running every
// listener on each of those used to re-subscribe realtime channels,
// re-fetch settings/stats and re-enter the ذاتي quiz for no reason.
let lastNotifiedUserId; // undefined = never notified yet

function notifyAuthListeners() {
  const id = currentUser ? currentUser.id : null;
  if (id === lastNotifiedUserId) return;
  lastNotifiedUserId = id;
  const info = { initial: !authInitialized };
  authListeners.forEach((fn) => {
    try {
      const result = fn(currentUser, info);
      if (result && typeof result.catch === "function") result.catch((e) => console.error("auth listener error", e));
    } catch (e) {
      console.error("auth listener error", e);
    }
  });
}

async function initAuth() {
  if (!sb) return;

  try {
    const { data } = await sb.auth.getSession();
    currentUser = data?.session?.user || null;
  } catch (e) {
    console.error("getSession error", e);
    currentUser = null;
  }
  notifyAuthListeners();
  authInitialized = true;

  sb.auth.onAuthStateChange((event, session) => {
    // Deferred with setTimeout, as Supabase recommends: supabase-js
    // awaits this callback while holding its internal auth lock, and our
    // listeners immediately make more Supabase calls (which need that
    // same lock). Running them inline can stall sign-in on a slow
    // connection; deferring lets signIn() finish first.
    setTimeout(() => {
      currentUser = session?.user || null;
      notifyAuthListeners();
      if (event === "PASSWORD_RECOVERY" && typeof onPasswordRecovery === "function") onPasswordRecovery();
    }, 0);
  });
}

// supabase-js has no request timeout, so on a stalled connection a
// sign-in could otherwise hang forever with no feedback.
function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message || "network timeout")), ms); }),
  ]).finally(() => clearTimeout(timer));
}

// Where Supabase's emails (confirm sign-up, reset password) send people
// back to: this page. The Android/iOS app sets QF_AUTH_REDIRECT_URL to the
// public website instead (mobile/native/native-app.js), because the app's
// own in-app address can't be opened from an email.
function authRedirectUrl() {
  return window.QF_AUTH_REDIRECT_URL || (window.location.origin + window.location.pathname);
}

// signUp returns the raw { user, session } so the caller can tell
// whether email confirmation is required (session will be null).
async function signUp(email, password, displayName) {
  const { data, error } = await withTimeout(sb.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: (displayName || "مستخدم").slice(0, 30) },
      // where the confirmation email's link sends people back to
      emailRedirectTo: authRedirectUrl(),
    },
  }), 20000, "network timeout");
  if (error) throw error;
  return data;
}

async function signIn(email, password) {
  const { data, error } = await withTimeout(sb.auth.signInWithPassword({ email, password }), 20000, "network timeout");
  if (error) throw error;
  return data;
}

// Sends a "reset your password" email. The link brings the person back
// to this page, where Supabase fires PASSWORD_RECOVERY (see initAuth)
// and auth-ui.js asks for the new password.
async function requestPasswordReset(email) {
  const { error } = await withTimeout(sb.auth.resetPasswordForEmail(email, {
    redirectTo: authRedirectUrl(),
  }), 20000, "network timeout");
  if (error) throw error;
}

async function updatePassword(newPassword) {
  const { error } = await withTimeout(sb.auth.updateUser({ password: newPassword }), 20000, "network timeout");
  if (error) throw error;
}

// Returns the saved (server-normalised) name, or throws.
async function updateDisplayName(name) {
  if (!sb || !currentUser) throw new Error("not signed in");
  const { data, error } = await sb
    .from("profiles")
    .update({ display_name: name })
    .eq("id", currentUser.id)
    .select("display_name")
    .single();
  if (error) throw error;
  return data.display_name;
}

// Permanently deletes the signed-in account and all its data, through
// the delete-account Edge Function (supabase/functions/delete-account —
// it needs the service-role key, which must never be in the browser).
// Resolves when the account is gone and this device is signed out;
// throws an Error whose message is a short code ("network timeout",
// "not_authenticated", "delete_failed", "function_missing", …).
async function deleteMyAccount() {
  if (!sb || !currentUser) throw new Error("not_authenticated");
  const deletedUserId = currentUser.id;
  const { data, error } = await withTimeout(
    sb.functions.invoke("delete-account", { body: { confirm: "DELETE_MY_ACCOUNT" } }),
    30000, "network timeout"
  );
  if (error) {
    let code = "delete_failed";
    const res = error.context;
    if (res && typeof res.status === "number") {
      if (res.status === 404) code = "function_missing"; // not deployed yet
      try {
        const body = await res.json();
        if (body && body.error) code = body.error;
      } catch (e) { /* not JSON */ }
    } else if (/fetch|network|Failed to send/i.test(error.message || "")) {
      code = "network timeout";
    }
    throw new Error(code);
  }
  if (!data || !data.ok) throw new Error((data && data.error) || "delete_failed");

  // The login no longer exists on the server, so only clear this device
  // (a normal sign-out would try — and fail — to end it on the server).
  try { await sb.auth.signOut({ scope: "local" }); } catch (e) { /* ignore */ }
  // Per-session "already asked" lists of ذاتي quizzes (see app.js) were
  // tied to the deleted account's sessions.
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("qf_self_used_"))
      .forEach((k) => localStorage.removeItem(k));
  } catch (e) { /* ignore */ }
  return deletedUserId;
}

async function signOut() {
  if (!sb) return;
  await sb.auth.signOut();
}

// -------- settings sync --------
async function loadRemoteSettings() {
  if (!sb || !currentUser) return null;
  const { data, error } = await sb
    .from("user_settings")
    .select("*")
    .eq("user_id", currentUser.id)
    .maybeSingle();
  if (error) {
    console.error("loadRemoteSettings error", error);
    return null;
  }
  return data;
}

async function saveRemoteSettings(settings) {
  if (!sb || !currentUser) return;
  const { error } = await sb.from("user_settings").upsert({
    user_id: currentUser.id,
    ...settings,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error("saveRemoteSettings error", error);
}

// Partial upsert: only touches active_session_id, leaves the rest of
// the row (question type, timer, etc.) untouched.
async function setActiveSessionId(sessionId) {
  if (!sb || !currentUser) return;
  const { error } = await sb.from("user_settings").upsert(
    {
      user_id: currentUser.id,
      active_session_id: sessionId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) console.error("setActiveSessionId error", error);
}

// -------- sessions --------
// rangeMin/rangeMax are set once, here, at creation — the page range
// is now chosen when the session is created and is permanent
// afterward (enforced by the prevent_range_change trigger in
// supabase-schema.sql). Sessions are now created exclusively from
// ⚔️ التحديات → ذاتي (the old session-backed Tests screen no longer
// creates or touches sessions at all), so no title/name is ever
// collected from the user anymore — the column keeps its DB default.
// questionTypes/countPerType capture the ذاتي quiz config (countPerType
// null means "غير محدد" — unlimited, shared across every selected type).
async function createSession(rangeMin, rangeMax, questionTypes, countPerType) {
  if (!sb || !currentUser) return null;
  const { data, error } = await sb
    .from("sessions")
    .insert({
      user_id: currentUser.id,
      range_min: rangeMin ?? null,
      range_max: rangeMax ?? null,
      question_types: questionTypes ?? null,
      count_per_type: countPerType ?? null,
    })
    .select()
    .single();
  if (error) {
    console.error("createSession error", error);
    return null;
  }
  await setActiveSessionId(data.id);
  return data.id;
}

// Marks a ذاتي quiz as done (reached its target count or the user
// manually ended it) and clears it as the active session, so it's no
// longer offered for resumption on the next page load. The session
// row itself (and its attempts) is left alone — it still shows up in
// "📊 الجلسات" and can still count toward the leaderboard.
async function finishActiveSession(sessionId) {
  if (!sb || !currentUser) return;
  const { error } = await sb
    .from("sessions")
    .update({ finished_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) console.error("finishActiveSession error", error);
  await setActiveSessionId(null);
}

// Returns { id, rangeMin, rangeMax, questionTypes, countPerType } for
// an in-progress ذاتي quiz that should be resumed (e.g. after a page
// refresh) — a session whose finished_at is still null — or null if
// there isn't one (nothing started yet, the last one finished, or a
// guest with no account to store it against). Guests never get here:
// their ذاتي runs are entirely in-memory, same as محلي.
async function ensureActiveSession() {
  if (!sb || !currentUser) return null;

  const settings = await loadRemoteSettings();
  if (settings?.active_session_id) {
    const { data } = await sb
      .from("sessions")
      .select("id, range_min, range_max, question_types, count_per_type, finished_at")
      .eq("id", settings.active_session_id)
      .maybeSingle();
    if (data && !data.finished_at) {
      return {
        id: data.id,
        rangeMin: data.range_min,
        rangeMax: data.range_max,
        questionTypes: data.question_types,
        countPerType: data.count_per_type,
      };
    }
  }

  return null;
}

// Per-type answer counts (plus overall total/correct) for a session —
// used to rebuild "ذاتي" quiz progress after a page refresh (see
// enterSelfChallengeMode() in app.js). The session row itself only
// stores the target config (question_types/count_per_type), not a
// live progress cursor, so progress is always derived from the
// attempts already recorded against it.
async function fetchSessionProgress(sessionId) {
  if (!sb || !currentUser || !sessionId) return { byType: {}, total: 0, correct: 0 };
  const { data, error } = await sb
    .from("attempts")
    .select("question_type, is_correct")
    .eq("session_id", sessionId);
  if (error) {
    console.error("fetchSessionProgress error", error);
    return { byType: {}, total: 0, correct: 0 };
  }
  const byType = {};
  let correct = 0;
  (data || []).forEach((row) => {
    byType[row.question_type] = (byType[row.question_type] || 0) + 1;
    if (row.is_correct) correct += 1;
  });
  return { byType, total: (data || []).length, correct };
}

async function fetchMySessions() {
  if (!sb || !currentUser) return [];
  const { data, error } = await sb
    .from("session_summary")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("fetchMySessions error", error);
    return [];
  }
  return data;
}

async function deleteSession(sessionId) {
  if (!sb || !currentUser) return;
  const { error } = await sb.from("sessions").delete().eq("id", sessionId);
  if (error) console.error("deleteSession error", error);
}

// Returns { ok: true, is_public } on a confirmed update, or { ok: false }
// if nothing was actually changed. Supabase's row-level security drops
// rows the caller isn't allowed to touch instead of raising an error,
// so a request with no `error` can still update zero rows — checking
// the returned row is the only way to know it really happened.
async function setSessionPublic(sessionId, isPublic) {
  if (!sb || !currentUser) return { ok: false };
  const { data, error } = await sb
    .from("sessions")
    .update({ is_public: isPublic })
    .eq("id", sessionId)
    .select("id, is_public");
  if (error) {
    console.error("setSessionPublic error", error);
    return { ok: false };
  }
  if (!data || data.length === 0) {
    console.error("setSessionPublic: update affected no rows (RLS blocked it?)");
    return { ok: false };
  }
  return { ok: true, is_public: data[0].is_public };
}

// -------- attempts sync --------
// Uses the record_attempt() RPC (see supabase-schema.sql) so the
// attempt insert, widening the session's stored page range, updating
// lifetime XP/streak (with a daily-streak XP multiplier + in-session
// combo bonus baked in), and awarding any newly-earned badges
// (including per-type mastery, per-juz completion, and time-of-day
// badges) all happen in one atomic round trip. Returns
// { ok, newlyEarned, xp, xpGained, currentStreak } — ok is true only
// on confirmed success, newlyEarned is the array of achievement codes
// granted by THIS call (usually empty), xp is the user's updated
// lifetime XP, xpGained is how much XP THIS call awarded (for the
// "+N XP" popup), and currentStreak is the live consecutive-correct
// count (for the combo/fire indicator) — all without a second round
// trip. p_local_hour/p_is_weekend are read from the browser's own
// clock (see app.js), not the server's UTC one, so the night_owl/
// early_bird/weekend_warrior badges reflect the person's actual time.
async function recordAttempt({ questionType, page, isCorrect, sessionId, rangeMin, rangeMax, localHour, isWeekend }) {
  if (!sb || !currentUser) return { ok: false, newlyEarned: [], xp: null, xpGained: 0, currentStreak: 0 };
  const { data, error } = await sb.rpc("record_attempt", {
    p_session_id: sessionId || null,
    p_question_type: questionType,
    p_page: page,
    p_is_correct: isCorrect,
    p_range_min: rangeMin ?? null,
    p_range_max: rangeMax ?? null,
    p_local_hour: localHour ?? null,
    p_is_weekend: isWeekend ?? null,
  });
  if (error) {
    console.error("recordAttempt error", error);
    return { ok: false, newlyEarned: [], xp: null, xpGained: 0, currentStreak: 0 };
  }
  return {
    ok: true,
    newlyEarned: Array.isArray(data?.earned) ? data.earned : [],
    xp: typeof data?.xp === "number" ? data.xp : null,
    xpGained: typeof data?.xpGained === "number" ? data.xpGained : 0,
    currentStreak: typeof data?.currentStreak === "number" ? data.currentStreak : 0,
  };
}

// Per-type breakdown for a single session (used in the stats modal)
async function fetchSessionAttempts(sessionId) {
  if (!sb || !currentUser || !sessionId) return null;
  const { data, error } = await sb
    .from("attempts")
    .select("question_type, is_correct, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) {
    console.error("fetchSessionAttempts error", error);
    return null;
  }
  return data;
}

// -------- profile --------
async function fetchProfile() {
  if (!sb || !currentUser) return null;
  const { data, error } = await sb
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();
  if (error) {
    console.error("fetchProfile error", error);
    return null;
  }
  return data;
}

// Any signed-in user's display name (profiles is public-read) — used
// to resolve an online-duel opponent's name from just their user id,
// e.g. right after a quick match where the client only has an id.
async function fetchDisplayName(userId) {
  if (!sb || !userId) return null;
  const { data, error } = await sb.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  if (error) {
    console.error("fetchDisplayName error", error);
    return null;
  }
  return data?.display_name || null;
}

// Display names for several user ids in one request, as a Map(id -> name).
async function fetchDisplayNames(userIds) {
  const ids = (userIds || []).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (!sb || !ids.length) return new Map();
  const { data, error } = await sb.from("profiles").select("id, display_name").in("id", ids);
  if (error) {
    console.error("fetchDisplayNames error", error);
    return new Map();
  }
  return new Map((data || []).map((r) => [r.id, r.display_name]));
}

// -------- lifetime stats & achievements (levels) --------
async function fetchUserStats() {
  if (!sb || !currentUser) return null;
  const { data, error } = await sb
    .from("user_stats")
    .select("*")
    .eq("user_id", currentUser.id)
    .maybeSingle();
  if (error) {
    console.error("fetchUserStats error", error);
    return null;
  }
  return data;
}

async function fetchAchievementsCatalog() {
  if (!sb) return [];
  const { data, error } = await sb
    .from("achievements")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("fetchAchievementsCatalog error", error);
    return [];
  }
  return data;
}

async function fetchMyAchievements() {
  if (!sb || !currentUser) return [];
  const { data, error } = await sb
    .from("user_achievements")
    .select("code, earned_at")
    .eq("user_id", currentUser.id);
  if (error) {
    console.error("fetchMyAchievements error", error);
    return [];
  }
  return data;
}

// -------- progress (page coverage, daily activity) --------
async function fetchMyPageStats() {
  if (!sb || !currentUser) return [];
  const { data, error } = await sb.from("user_page_stats").select("*");
  if (error) {
    console.error("fetchMyPageStats error", error);
    return [];
  }
  return (data || []).map((r) => ({ page: r.page, total: r.total_answers, correct: r.total_correct }));
}

async function fetchMyDailyActivity() {
  if (!sb || !currentUser) return [];
  const { data, error } = await sb.from("user_daily_activity").select("*");
  if (error) {
    console.error("fetchMyDailyActivity error", error);
    return [];
  }
  return (data || []).map((r) => ({ date: r.activity_date, total: r.total_answers }));
}

// -------- friends --------
async function fetchMyFriendCode() {
  if (!sb || !currentUser) return null;
  const { data, error } = await sb.from("friend_codes").select("code").eq("user_id", currentUser.id).maybeSingle();
  if (error) {
    console.error("fetchMyFriendCode error", error);
    return null;
  }
  return data?.code || null;
}

async function sendFriendRequest(friendCode) {
  if (!sb || !currentUser) return { ok: false, error: "not_signed_in" };
  const { data, error } = await sb.rpc("send_friend_request", { p_friend_code: friendCode });
  if (error) {
    console.error("sendFriendRequest error", error);
    return { ok: false, error: "request_failed" };
  }
  return data || { ok: false, error: "request_failed" };
}

// Same as sendFriendRequest, but for adding someone straight from the
// online duel lobby/play screen, where their user id is already known
// directly and asking them to share a friend_code would be redundant.
async function sendFriendRequestByUserId(userId) {
  if (!sb || !currentUser) return { ok: false, error: "not_signed_in" };
  const { data, error } = await sb.rpc("send_friend_request_by_user_id", { p_target_user_id: userId });
  if (error) {
    console.error("sendFriendRequestByUserId error", error);
    return { ok: false, error: "request_failed" };
  }
  return data || { ok: false, error: "request_failed" };
}

async function respondFriendRequest(requestId, accept) {
  if (!sb || !currentUser) return false;
  const { data, error } = await sb.rpc("respond_friend_request", { p_request_id: requestId, p_accept: accept });
  if (error) {
    console.error("respondFriendRequest error", error);
    return false;
  }
  return !!data;
}

async function removeFriend(otherUserId) {
  if (!sb || !currentUser) return false;
  const { data, error } = await sb.rpc("remove_friend", { p_other_user_id: otherUserId });
  if (error) {
    console.error("removeFriend error", error);
    return false;
  }
  return !!data;
}

async function fetchIncomingFriendRequests() {
  if (!sb || !currentUser) return [];
  const { data, error } = await sb.from("my_incoming_friend_requests").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error("fetchIncomingFriendRequests error", error);
    return [];
  }
  return data || [];
}

async function fetchOutgoingFriendRequests() {
  if (!sb || !currentUser) return [];
  const { data, error } = await sb.from("my_outgoing_friend_requests").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error("fetchOutgoingFriendRequests error", error);
    return [];
  }
  return data || [];
}

async function fetchMyFriends() {
  if (!sb || !currentUser) return [];
  const { data, error } = await sb.from("my_friends").select("*").order("friend_display_name", { ascending: true });
  if (error) {
    console.error("fetchMyFriends error", error);
    return [];
  }
  return data || [];
}

// Full profile bundle for an accepted friend — null if not actually
// friends (see get_friend_profile() in supabase-schema.sql).
async function fetchFriendProfile(friendUserId) {
  if (!sb || !currentUser || !friendUserId) return null;
  const { data, error } = await sb.rpc("get_friend_profile", { p_user_id: friendUserId });
  if (error) {
    console.error("fetchFriendProfile error", error);
    return null;
  }
  return data;
}

// -------- leaderboard (raw rows; caller ranks with Wilson score) --------
// Ranking (Wilson score) happens client-side, but the database still has
// to pick WHICH rows to send. Ordering by correct answers first means the
// strongest sessions are always included; previously an unordered
// limit(200) could leave real top players out once there were more than
// 200 public sessions. userIds narrows it to specific people (friends tab).
async function fetchSessionLeaderboard(userIds) {
  if (!sb) return [];
  let q = sb
    .from("session_leaderboard")
    .select("*")
    .order("total_correct", { ascending: false })
    .limit(200);
  if (Array.isArray(userIds)) q = q.in("user_id", userIds);
  const { data, error } = await q;
  if (error) {
    console.error("fetchSessionLeaderboard error", error);
    return [];
  }
  return data;
}

// Same shape as fetchSessionLeaderboard() but scoped to the last 7
// days (see session_leaderboard_weekly in supabase-schema.sql) —
// powers the "📅 هذا الأسبوع" leaderboard tab.
async function fetchWeeklySessionLeaderboard() {
  if (!sb) return [];
  const { data, error } = await sb
    .from("session_leaderboard_weekly")
    .select("*")
    .gt("total_answers", 0)
    .order("total_correct", { ascending: false })
    .limit(200);
  if (error) {
    console.error("fetchWeeklySessionLeaderboard error", error);
    return [];
  }
  return data;
}

// ============================================================
// Online duels (⚔️ تحديات → مباشر) — 1v1 live challenges, either
// against a friend or a random matched opponent. See supabase-schema
// .sql sections 16–29 for the tables/RPCs this wraps, and
// supabase/functions/generate-duel-questions for how the shared
// question set gets created without either player's browser seeing
// the answers first.
// ============================================================

// -------- create / respond / cancel --------
async function createFriendDuel(opponentId, rangeMin, rangeMax, timerSeconds, questionTypes, countPerType) {
  if (!sb || !currentUser) return null;
  const { data, error } = await sb.rpc("create_friend_duel", {
    p_opponent_id: opponentId,
    p_range_min: rangeMin,
    p_range_max: rangeMax,
    p_timer_seconds: timerSeconds,
    p_question_types: questionTypes,
    p_count_per_type: countPerType,
  });
  if (error) {
    console.error("createFriendDuel error", error);
    return null;
  }
  return data; // new duel id
}

// Same as createFriendDuel but for challenging someone off the
// "online now" presence list who isn't necessarily an added friend —
// see create_direct_duel() in supabase-schema.sql.
async function createDirectDuel(opponentId, rangeMin, rangeMax, timerSeconds, questionTypes, countPerType) {
  if (!sb || !currentUser) return null;
  const { data, error } = await sb.rpc("create_direct_duel", {
    p_opponent_id: opponentId,
    p_range_min: rangeMin,
    p_range_max: rangeMax,
    p_timer_seconds: timerSeconds,
    p_question_types: questionTypes,
    p_count_per_type: countPerType,
  });
  if (error) {
    console.error("createDirectDuel error", error);
    return null;
  }
  return data;
}

async function respondDuelInvite(duelId, accept) {
  if (!sb || !currentUser) return { ok: false };
  const { data, error } = await sb.rpc("respond_duel_invite", { p_duel_id: duelId, p_accept: accept });
  if (error) {
    console.error("respondDuelInvite error", error);
    return { ok: false };
  }
  return data || { ok: false };
}

async function cancelDuel(duelId) {
  if (!sb || !currentUser) return false;
  const { data, error } = await sb.rpc("cancel_duel", { p_duel_id: duelId });
  if (error) {
    console.error("cancelDuel error", error);
    return false;
  }
  return !!data;
}

// -------- quick match queue --------
async function joinQuickMatchQueue(rangeMin, rangeMax, timerSeconds, questionTypes, countPerType) {
  if (!sb || !currentUser) return { matched: false };
  const { data, error } = await sb.rpc("join_quick_match_queue", {
    p_range_min: rangeMin,
    p_range_max: rangeMax,
    p_timer_seconds: timerSeconds,
    p_question_types: questionTypes,
    p_count_per_type: countPerType,
  });
  if (error) {
    console.error("joinQuickMatchQueue error", error);
    return { matched: false };
  }
  return data || { matched: false };
}

async function leaveQuickMatchQueue() {
  if (!sb || !currentUser) return;
  const { error } = await sb.rpc("leave_quick_match_queue");
  if (error) console.error("leaveQuickMatchQueue error", error);
}

// -------- generating the shared question set (host only) --------
// Calls the Edge Function rather than writing duel_questions directly
// — see the function's own header comment for why this specifically
// can't be a client-side insert.
async function generateDuelQuestions(duelId) {
  if (!sb || !currentUser) return { ok: false };
  try {
    const { data, error } = await sb.functions.invoke("generate-duel-questions", {
      body: { duelId },
    });
    if (error) {
      console.error("generateDuelQuestions error", error);
      return { ok: false, error: "function_error" };
    }
    return data || { ok: false };
  } catch (e) {
    console.error("generateDuelQuestions exception", e);
    return { ok: false, error: "network" };
  }
}

// -------- reading duel state --------
async function fetchDuelState(duelId) {
  if (!sb || !currentUser) return null;
  const { data, error } = await sb.from("duels").select("*").eq("id", duelId).maybeSingle();
  if (error) {
    console.error("fetchDuelState error", error);
    return null;
  }
  return data;
}

async function fetchDuelQuestion(duelId, questionIndex) {
  if (!sb || !currentUser) return null;
  const { data, error } = await sb
    .from("duel_questions_public")
    .select("*")
    .eq("duel_id", duelId)
    .eq("question_index", questionIndex)
    .maybeSingle();
  if (error) {
    console.error("fetchDuelQuestion error", error);
    return null;
  }
  return data;
}

// Pull-based fallbacks (checked when the ⚔️ تحديات tab opens) so an
// invite or an in-progress duel is never missed just because the
// realtime channel wasn't connected at the moment it happened.
async function fetchMyIncomingDuelInvites() {
  if (!sb || !currentUser) return [];
  const { data, error } = await sb
    .from("my_incoming_duel_invites")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("fetchMyIncomingDuelInvites error", error);
    return [];
  }
  return data || [];
}

async function fetchMyActiveDuels() {
  if (!sb || !currentUser) return [];
  const { data, error } = await sb
    .from("my_active_duels")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("fetchMyActiveDuels error", error);
    return [];
  }
  return data || [];
}

async function fetchDuelStats(userId) {
  if (!sb) return null;
  const { data, error } = await sb.from("duel_stats").select("*").eq("user_id", userId).maybeSingle();
  if (error) {
    console.error("fetchDuelStats error", error);
    return null;
  }
  return data;
}

// -------- playing --------
async function submitDuelAnswer(duelId, questionIndex, choiceIndex) {
  if (!sb || !currentUser) return { ok: false };
  const { data, error } = await sb.rpc("submit_duel_answer", {
    p_duel_id: duelId,
    p_question_index: questionIndex,
    p_choice_index: choiceIndex,
  });
  if (error) {
    console.error("submitDuelAnswer error", error);
    return { ok: false };
  }
  return data || { ok: false };
}

async function advanceDuelQuestion(duelId, questionIndex) {
  if (!sb || !currentUser) return { ok: false };
  const { data, error } = await sb.rpc("advance_duel_question", {
    p_duel_id: duelId,
    p_question_index: questionIndex,
  });
  if (error) {
    console.error("advanceDuelQuestion error", error);
    return { ok: false };
  }
  return data || { ok: false };
}

async function forfeitDuel(duelId) {
  if (!sb || !currentUser) return { ok: false };
  const { data, error } = await sb.rpc("forfeit_duel", { p_duel_id: duelId });
  if (error) {
    console.error("forfeitDuel error", error);
    return { ok: false };
  }
  return data || { ok: false };
}

async function claimOpponentForfeit(duelId) {
  if (!sb || !currentUser) return { ok: false };
  const { data, error } = await sb.rpc("claim_opponent_forfeit", { p_duel_id: duelId });
  if (error) {
    console.error("claimOpponentForfeit error", error);
    return { ok: false };
  }
  return data || { ok: false };
}

// -------- realtime: incoming invites (global) --------
// One long-lived subscription for the whole session (started once
// after sign-in — see auth-ui.js) so a challenge shows up as a live
// banner no matter which tab the person is currently looking at.
// Fires on both a genuine friend invite (status 'pending') and a
// quick-match pairing (status already 'accepted', no response needed
// — see join_quick_match_queue()'s comment on why the waiting side
// always ends up as opponent_id).
let duelInviteChannel = null;

function subscribeToIncomingDuelInvites(onInvite) {
  if (!sb || !currentUser) return;
  unsubscribeFromIncomingDuelInvites();
  duelInviteChannel = sb
    .channel(`duel-invites-${currentUser.id}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "duels", filter: `opponent_id=eq.${currentUser.id}` },
      (payload) => onInvite(payload.new)
    )
    .subscribe();
}

function unsubscribeFromIncomingDuelInvites() {
  if (duelInviteChannel) {
    sb.removeChannel(duelInviteChannel);
    duelInviteChannel = null;
  }
}

// -------- realtime: a specific duel's live state (while playing) --------
// Watches the duels row itself (score, current_question_index,
// status) — both players stay in lockstep by reacting to whichever of
// them last called submit_duel_answer()/advance_duel_question(),
// rather than polling.
function subscribeToDuelState(duelId, onChange) {
  if (!sb) return null;
  const channel = sb
    .channel(`duel-state-${duelId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "duels", filter: `id=eq.${duelId}` },
      (payload) => onChange(payload.new)
    )
    .subscribe();
  return channel;
}

function unsubscribeFromDuelState(channel) {
  if (channel) sb.removeChannel(channel);
}

// -------- presence: "who's online right now" lobby --------
// Pure Realtime Presence — nothing written to the database. Anyone
// with the ⚔️ تحديات → مباشر hub open tracks themselves on this shared
// channel; everyone else on it sees the live list to challenge
// directly. Leaving the hub (or closing the tab) untracks
// automatically.
let onlineLobbyChannel = null;

function joinOnlineLobby(displayName, onUpdate) {
  if (!sb || !currentUser) return;
  leaveOnlineLobby();

  onlineLobbyChannel = sb.channel("duel-online-lobby", {
    config: { presence: { key: currentUser.id } },
  });

  onlineLobbyChannel.on("presence", { event: "sync" }, () => {
    const state = onlineLobbyChannel.presenceState();
    const people = Object.entries(state)
      .map(([userId, entries]) => ({ userId, ...(entries[0] || {}) }))
      .filter((p) => p.userId !== currentUser.id);
    onUpdate(people);
  });

  onlineLobbyChannel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await onlineLobbyChannel.track({ display_name: displayName || "لاعب" });
    }
  });
}

function leaveOnlineLobby() {
  if (onlineLobbyChannel) {
    sb.removeChannel(onlineLobbyChannel);
    onlineLobbyChannel = null;
  }
}