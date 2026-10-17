// net-status.js — knows whether the internet REALLY works, and keeps the
// app useful when it doesn't.
//
// Why: phones report "online" whenever they're connected to a network,
// even when no data gets through (mobile data with no balance/signal,
// Wi-Fi without internet, a captive portal). The app trusted that, so
// offline screens just said "جاري التحميل..." forever and nobody was told.
//
// What it does (all Supabase traffic goes through Net.fetch — see
// supabase-client.js):
//   • every request gets a time limit, so nothing waits forever;
//   • a request that can't reach the server marks the app OFFLINE; one
//     that succeeds marks it ONLINE again (while offline, a light check
//     runs every few seconds to notice the connection coming back);
//   • successful reads (profile, stats, friends, leaderboard…) are kept on
//     the device, per account, and shown when offline — "last saved data";
//   • listeners (Net.onChange) update the UI: html.is-offline, the 📴 chip
//     in the top bar, notices, and syncing queued answers (supabase-client.js).
//
// Loaded right after config.js, before supabase-client.js.

const Net = (function () {
  "use strict";

  const CACHE_PREFIX = "qf_netcache:";
  const CACHE_MAX_ENTRY = 250000;   // characters — skip anything bigger
  const CACHE_MAX_ENTRIES = 80;
  const PROBE_EVERY_MS = 6000;

  let online = navigator.onLine !== false;
  const listeners = [];
  let probeTimer = null;

  function setOnline(value) {
    if (value === online) return;
    online = value;
    document.documentElement.classList.toggle("is-offline", !online);
    if (!online) startProbing(); else stopProbing();
    listeners.forEach((fn) => { try { fn(online); } catch (e) { console.error(e); } });
  }
  document.documentElement.classList.toggle("is-offline", !online);

  function onChange(fn) { listeners.push(fn); }
  function isOnline() { return online; }

  // ---- telling a dead connection from a server error ----
  function isNetworkError(err) {
    if (!err) return false;
    const msg = String(err.message || err);
    return err.name === "AbortError" || err.name === "TypeError" || err.itqanOffline ||
      /Failed to fetch|NetworkError|Load failed|network|timeout|aborted|ERR_INTERNET|offline/i.test(msg);
  }

  // ---- whose data is this (cache is per account) ----
  function userFromHeaders(headers) {
    try {
      const auth = headers.get("authorization") || "";
      const payload = auth.split(" ")[1].split(".")[1];
      const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
      return json.sub || "anon";
    } catch (e) { return "anon"; }
  }

  // ---- the read cache ----
  function cacheKey(url, headers) {
    return CACHE_PREFIX + userFromHeaders(headers) + ":" + (headers.get("accept") || "") + ":" + url;
  }
  function cacheIndex() {
    try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + "index") || "[]"); } catch (e) { return []; }
  }
  function cachePut(key, body, contentRange) {
    if (body.length > CACHE_MAX_ENTRY) return;
    try {
      localStorage.setItem(key, JSON.stringify({ t: Date.now(), b: body, r: contentRange || null }));
      const idx = cacheIndex().filter((k) => k !== key);
      idx.push(key);
      while (idx.length > CACHE_MAX_ENTRIES) localStorage.removeItem(idx.shift());
      localStorage.setItem(CACHE_PREFIX + "index", JSON.stringify(idx));
    } catch (e) { /* storage full — not important */ }
  }
  function cacheGet(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; }
  }
  function cachedResponse(entry) {
    const headers = { "content-type": "application/json", "x-itqan-cached": String(entry.t) };
    if (entry.r) headers["content-range"] = entry.r;
    return new Response(entry.b, { status: 200, headers });
  }
  // Removes every saved copy (sign-out, account deletion).
  function clearCache() {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX)).forEach((k) => localStorage.removeItem(k));
    } catch (e) { /* ignore */ }
  }

  function offlineError() {
    const e = new TypeError("itqan-offline: no internet connection");
    e.itqanOffline = true;
    return e;
  }

  // ---- the fetch everyone uses ----
  async function netFetch(input, init) {
    init = init || {};
    const req = new Request(input, init);
    const url = req.url;
    const method = (init.method || req.method || "GET").toUpperCase();
    const isRead = method === "GET" && url.includes("/rest/v1/");
    const key = isRead ? cacheKey(url, req.headers) : null;

    // Known to be offline: answer reads from the device straight away and
    // fail writes fast (callers queue what can be queued), instead of
    // making the person wait for a time-out on every tap.
    if (!online) {
      if (key) {
        const entry = cacheGet(key);
        if (entry) return cachedResponse(entry);
      }
      probeNow();
      throw offlineError();
    }

    const timeoutMs = url.includes("/functions/v1/") ? 35000 : 15000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (init.signal) {
      if (init.signal.aborted) controller.abort();
      else init.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    try {
      const res = await fetch(input, { ...init, signal: controller.signal });
      setOnline(true);
      if (key && res.ok) {
        res.clone().text().then((body) => cachePut(key, body, res.headers.get("content-range"))).catch(() => {});
      }
      return res;
    } catch (err) {
      if (init.signal && init.signal.aborted) throw err; // the caller cancelled it
      if (isNetworkError(err)) {
        setOnline(false);
        if (key) {
          const entry = cacheGet(key);
          if (entry) return cachedResponse(entry);
        }
        throw offlineError();
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- noticing the connection come back ----
  async function probe() {
    if (typeof SUPABASE_URL !== "string" || SUPABASE_URL.includes("YOUR_SUPABASE")) {
      setOnline(navigator.onLine !== false);
      return online;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/health`, {
        headers: { apikey: SUPABASE_ANON_KEY },
        cache: "no-store",
        signal: controller.signal,
      });
      setOnline(true); // any answer at all means the internet works
    } catch (e) {
      setOnline(false);
    } finally {
      clearTimeout(timer);
    }
    return online;
  }
  let probing = null;
  function probeNow() {
    if (!probing) probing = probe().finally(() => { probing = null; });
    return probing;
  }
  function startProbing() {
    if (!probeTimer) probeTimer = setInterval(() => { if (document.visibilityState !== "hidden") probeNow(); }, PROBE_EVERY_MS);
  }
  function stopProbing() {
    if (probeTimer) { clearInterval(probeTimer); probeTimer = null; }
  }

  window.addEventListener("offline", () => setOnline(false));
  window.addEventListener("online", () => probeNow());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") probeNow(); });
  // First check shortly after start — the phone's own "online" can't be trusted.
  setTimeout(probeNow, 1500);
  if (!online) startProbing();

  return { fetch: netFetch, isOnline, onChange, probeNow, clearCache, isNetworkError, setOnline };
})();
