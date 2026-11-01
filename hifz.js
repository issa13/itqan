// hifz.js — 📗 الحفظ والمراجعة: which Mushaf pages you've memorized, when,
// when each was last reviewed, and the plans built on that.
//
// Data (version 2, localStorage "qf_hifz_v2"):
//   pages: { "<page>": { m: "YYYY-MM-DD" | null, r: "YYYY-MM-DD" | null } }
//          m = the day it was memorized (null = «قديم», memorized before
//          the app tracked it), r = the last day it was reviewed.
//   log:   { "YYYY-MM-DD": { r: [pages reviewed that day], q: due that day } }
//          kept for the statistics (last LOG_DAYS days).
//   plan:  the user's settings — weekly goal, near-review length, far cycle.
//
// Plans:
//   • خطة الحفظ — a weekly goal (pages per week); progress counts pages
//     whose m falls in the current week.
//   • مراجعة القريب — every page memorized in the last `nearDays` days,
//     every day.
//   • مراجعة البعيد — all other memorized pages stand in a queue, the one
//     reviewed longest ago first (never reviewed = first). Each day the
//     first `quota` pages of the queue are due. Pages not reviewed stay at
//     the front, so tomorrow shows them plus new ones — always `quota`
//     pages, nothing piles up. Reviewing more («➕ راجعت أكتر») takes the
//     next pages of the queue; reviewing a page sends it to the back.
//     `quota` = farPages (mode "pages") or ceil(far pages / farDays)
//     (mode "days").
//
// The old format (version 1: { pages: [...], updatedAt }) is converted on
// load — those pages become «قديم» (no date, never reviewed).
//
// Saved on the device; when signed in also in the account
// (user_settings.hifz + memorized_pages for older app versions). The
// newer copy wins for the page list and plan; review history from both
// copies is kept.
//
// Loaded after supabase-client.js, before app.js.

const HifzStore = (function () {
  "use strict";

  const KEY = "qf_hifz_v2";
  const OLD_KEY = "qf_memorized_pages";
  const LOG_DAYS = 800;
  const listeners = [];

  const DEFAULT_PLAN = {
    weeklyGoal: 0,     // pages per week, 0 = no goal
    weekStart: 6,      // JS getDay(): 6 = Saturday
    nearDays: 7,       // «القريب» = memorized in the last N days
    farMode: "pages",  // "pages" (pages per day) | "days" (cycle length)
    farPages: 5,
    farDays: 14,
  };

  let pages = {};      // page -> { m, r }
  let log = {};        // day -> { r: [], q }
  let plan = Object.assign({}, DEFAULT_PLAN);
  let updatedAt = 0;

  // ---------- dates (local days as "YYYY-MM-DD") ----------
  function dayKey(d) {
    const x = d || new Date();
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  }
  function today() { return dayKey(new Date()); }
  function validDay(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)); }
  function parseDay(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  function addDays(s, n) { const d = parseDay(s); d.setDate(d.getDate() + n); return dayKey(d); }
  function daysBetween(a, b) { // b - a, in whole days
    return Math.round((Date.UTC(...b.split("-").map((v, i) => i === 1 ? v - 1 : +v)) -
      Date.UTC(...a.split("-").map((v, i) => i === 1 ? v - 1 : +v))) / 86400000);
  }

  function validPage(p) { return Number.isInteger(p) && p >= 1 && p <= 604; }
  function clampInt(v, lo, hi, def) { v = parseInt(v, 10); return Number.isInteger(v) && v >= lo && v <= hi ? v : def; }

  // ---------- normalizing (local + remote data) ----------
  function cleanPages(raw) {
    const out = {};
    if (Array.isArray(raw)) { // version 1: a plain list
      raw.map(Number).filter(validPage).forEach((p) => { out[p] = { m: null, r: null }; });
      return out;
    }
    if (raw && typeof raw === "object") {
      Object.keys(raw).forEach((k) => {
        const p = Number(k);
        if (!validPage(p)) return;
        const v = raw[k] || {};
        out[p] = { m: validDay(v.m) ? v.m : null, r: validDay(v.r) ? v.r : null };
        if (validDay(v.prevR)) out[p].prevR = v.prevR;
      });
    }
    return out;
  }
  function cleanLog(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    const oldest = addDays(today(), -LOG_DAYS);
    Object.keys(raw).forEach((day) => {
      if (!validDay(day) || day < oldest) return;
      const v = raw[day] || {};
      const r = Array.isArray(v.r) ? Array.from(new Set(v.r.map(Number).filter(validPage))) : [];
      const q = clampInt(v.q, 0, 604, null);
      const f = Array.isArray(v.f) ? v.f.map(Number).filter(validPage) : null;
      if (r.length || q != null) out[day] = f ? { r, q, f } : { r, q };
    });
    return out;
  }
  function cleanPlan(raw) {
    const p = Object.assign({}, DEFAULT_PLAN);
    if (!raw || typeof raw !== "object") return p;
    p.weeklyGoal = clampInt(raw.weeklyGoal, 0, 100, DEFAULT_PLAN.weeklyGoal);
    p.weekStart = clampInt(raw.weekStart, 0, 6, DEFAULT_PLAN.weekStart);
    p.nearDays = clampInt(raw.nearDays, 0, 90, DEFAULT_PLAN.nearDays);
    p.farMode = raw.farMode === "days" ? "days" : "pages";
    p.farPages = clampInt(raw.farPages, 1, 100, DEFAULT_PLAN.farPages);
    p.farDays = clampInt(raw.farDays, 1, 365, DEFAULT_PLAN.farDays);
    return p;
  }

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || "null");
      if (data && data.v === 2) {
        pages = cleanPages(data.pages);
        log = cleanLog(data.log);
        plan = cleanPlan(data.plan);
        updatedAt = Number(data.updatedAt) || 0;
        return;
      }
      const old = JSON.parse(localStorage.getItem(OLD_KEY) || "null");
      if (old && Array.isArray(old.pages)) {
        pages = cleanPages(old.pages);
        updatedAt = Number(old.updatedAt) || 0;
        persist();
      }
    } catch (e) { /* ignore broken data */ }
  }

  function doc() { return { v: 2, pages, log, plan }; }
  function sortedPages() { return Object.keys(pages).map(Number).sort((a, b) => a - b); }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.assign(doc(), { updatedAt })));
      // the old key stays current too, in case an older version of the app runs again
      localStorage.setItem(OLD_KEY, JSON.stringify({ pages: sortedPages(), updatedAt }));
    } catch (e) { /* storage full */ }
  }

  function emit() { listeners.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } }); }

  let pushTimer = null;
  function schedulePush() { clearTimeout(pushTimer); pushTimer = setTimeout(push, 1500); }
  async function push() {
    if (typeof saveHifz !== "function") return;
    try { await saveHifz(doc(), sortedPages(), new Date(updatedAt).toISOString()); } catch (e) { /* offline: pushed next time */ }
  }

  function changed() { updatedAt = Date.now(); persist(); emit(); schedulePush(); }

  load();

  // ---------- memorized pages ----------
  function has(page) { return !!pages[page]; }
  function all() { return new Set(sortedPages()); }
  function count() { return Object.keys(pages).length; }
  function info(page) { return pages[page] ? Object.assign({}, pages[page]) : null; }

  // date: "YYYY-MM-DD" for a page memorized that day, null = «قديم».
  function mark(page, date) {
    if (!validPage(page)) return;
    const m = date === undefined ? today() : (validDay(date) ? date : null);
    const prev = pages[page];
    pages[page] = { m, r: prev ? prev.r : null };
  }

  function toggle(page, date) {
    if (!validPage(page)) return false;
    if (pages[page]) delete pages[page]; else mark(page, date);
    changed();
    return !!pages[page];
  }

  // Marks (on = true, with `date` as in mark()) or unmarks every page in the list.
  // Pages already marked keep their date unless `date` is given explicitly.
  function setMany(list, on, date) {
    let any = false;
    list.forEach((p) => {
      if (!validPage(p)) return;
      if (on && (!pages[p] || date !== undefined)) { mark(p, date === undefined ? null : date); any = true; }
      if (!on && pages[p]) { delete pages[p]; any = true; }
    });
    if (any) changed();
  }

  function setDate(page, date) {
    if (!pages[page]) return;
    pages[page].m = validDay(date) ? date : null;
    changed();
  }

  // Pages memorized in the last `days` days (today included).
  function memorizedWithin(days) {
    const from = addDays(today(), -(days - 1));
    return sortedPages().filter((p) => pages[p].m && pages[p].m >= from);
  }

  // ---------- reviews ----------
  function reviewedToday(page) { return !!pages[page] && pages[page].r === today(); }

  // Marks a page reviewed today (on = true) or undoes today's mark.
  function setReviewed(page, on) {
    if (!pages[page]) return;
    const t = today();
    const entry = log[t] || (log[t] = { r: [], q: null });
    if (on) {
      if (pages[page].r === t) return;
      pages[page].prevR = pages[page].r; // so «undo» today puts it back in its place
      pages[page].r = t;
      if (!entry.r.includes(page)) entry.r.push(page);
    } else {
      if (pages[page].r !== t) return;
      pages[page].r = pages[page].prevR || null;
      entry.r = entry.r.filter((p) => p !== page);
    }
    changed();
  }

  // ---------- plans ----------
  function getPlan() { return Object.assign({}, plan); }
  function setPlan(patch) { plan = cleanPlan(Object.assign({}, plan, patch || {})); changed(); }

  function isNear(page, t) {
    const m = pages[page].m;
    return !!m && plan.nearDays > 0 && daysBetween(m, t) < plan.nearDays && daysBetween(m, t) >= 0;
  }

  // far queue: reviewed longest ago first (never = first), then by page.
  // A page reviewed today is judged by its review before today, so today's
  // list doesn't reshuffle while you tick pages.
  function farQueue(t) {
    return sortedPages().filter((p) => !isNear(p, t)).sort((a, b) => {
      const ra = pages[a].r === t ? (pages[a].prevR || "") : (pages[a].r || "");
      const rb = pages[b].r === t ? (pages[b].prevR || "") : (pages[b].r || "");
      return ra < rb ? -1 : ra > rb ? 1 : a - b;
    });
  }

  function farQuota(farCount) {
    if (!farCount) return 0;
    if (plan.farMode === "days") return Math.ceil(farCount / plan.farDays);
    return Math.min(plan.farPages, farCount);
  }

  // Today's review: { near: [{page, done}], far: [{page, done}], extra: [{page}],
  //   more: [pages], quota, farCount, cycleDays, doneCount, dueCount }
  // far = today's due pages. They're chosen once a day and kept in the log
  // (log[day].f), so ticking pages — or «➕ راجعت أكتر» — doesn't reshuffle
  // the list; they're re-chosen only when the quota changes (plan edited,
  // pages added/removed). extra = pages reviewed today beyond the list;
  // more = the next pages of the queue, for «➕ راجعت أكتر».
  function todayPlan() {
    const t = today();
    const near = sortedPages().filter((p) => isNear(p, t)).map((page) => ({ page, done: pages[page].r === t }));
    const queue = farQueue(t);
    const inQueue = new Set(queue);
    const quota = farQuota(queue.length);
    const entry = log[t] || { r: [], q: null };
    let list = Array.isArray(entry.f) ? entry.f.filter((p) => inQueue.has(p)) : null;
    if (!list || list.length !== quota) {
      // keep what's already ticked from the old list, fill up from the queue
      const kept = (list || []).filter((p) => pages[p].r === t).slice(0, quota);
      const fill = queue.filter((p) => !kept.includes(p) && pages[p].r !== t);
      list = kept.concat(fill.slice(0, quota - kept.length));
      if (list.length < quota) list = list.concat(queue.filter((p) => !list.includes(p)).slice(0, quota - list.length));
    }
    const listSet = new Set(list);
    const far = list.map((page) => ({ page, done: pages[page].r === t }));
    const extra = queue.filter((p) => !listSet.has(p) && pages[p].r === t).map((page) => ({ page, done: true }));
    const more = queue.filter((p) => !listSet.has(p) && pages[p].r !== t);
    const cycleDays = quota ? Math.ceil(queue.length / quota) : 0;
    const dueCount = near.length + quota;
    const doneCount = near.filter((x) => x.done).length + far.filter((x) => x.done).length;
    // remember today's list and how much was due (for the statistics' day colours)
    const sameList = Array.isArray(entry.f) && entry.f.length === list.length && entry.f.every((p, k) => p === list[k]);
    if (dueCount !== entry.q || !sameList) {
      log[t] = { r: entry.r, q: dueCount || null, f: list };
      persist(); // no push/emit just for this; it travels with the next change
    }
    return { near, far, extra, more, quota, farCount: queue.length, cycleDays, dueCount, doneCount };
  }

  // This week's memorization goal: { goal, done, start, end, daysLeft }
  function weekInfo(ref) {
    const t = ref || today();
    const d = parseDay(t);
    const start = addDays(t, -((d.getDay() - plan.weekStart + 7) % 7));
    const end = addDays(start, 6);
    const done = sortedPages().filter((p) => pages[p].m && pages[p].m >= start && pages[p].m <= end).length;
    return { goal: plan.weeklyGoal, done, start, end, daysLeft: daysBetween(t, end) + 1 };
  }

  // ---------- statistics ----------
  function stats() {
    const t = today();
    // pages memorized per week, last 12 weeks (oldest first)
    const weeks = [];
    let ws = weekInfo(t).start;
    for (let i = 0; i < 12; i++) {
      const we = addDays(ws, 6);
      const n = sortedPages().filter((p) => pages[p].m && pages[p].m >= ws && pages[p].m <= we).length;
      weeks.unshift({ start: ws, count: n, goalMet: plan.weeklyGoal > 0 && n >= plan.weeklyGoal });
      ws = addDays(ws, -7);
    }
    // review days, last 35 days: "full" | "extra" | "partial" | "none" | "free"
    const days = [];
    for (let i = 34; i >= 0; i--) {
      const day = addDays(t, -i);
      const e = log[day];
      const done = e ? e.r.length : 0;
      const q = e && e.q != null ? e.q : null;
      let state = "none";
      if (q === null || q === 0) state = done ? "extra" : "free";
      else if (done > q) state = "extra";
      else if (done === q) state = "full";
      else if (done > 0) state = "partial";
      days.push({ day, done, due: q, state });
    }
    // streak: consecutive days (back from today/yesterday) with a full review
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      const s = days[i].state;
      if (s === "full" || s === "extra") streak++;
      else if (i === days.length - 1) continue; // today not finished yet doesn't break it
      else break;
    }
    // how long since each page was reviewed (or memorized), for the strength map
    const age = {};
    sortedPages().forEach((p) => {
      const last = pages[p].r || pages[p].m;
      age[p] = last ? daysBetween(last, t) : null;
    });
    // last 30 days; today only counts once something was reviewed
    const last30 = days.slice(-31, -1).concat(days[days.length - 1].done ? [days[days.length - 1]] : []).filter((d) => d.due);
    const reviewRate = last30.length
      ? Math.round(100 * last30.reduce((s, d) => s + Math.min(d.done, d.due), 0) / last30.reduce((s, d) => s + d.due, 0))
      : null;
    const tp = todayPlan();
    const neverReviewed = sortedPages().filter((p) => !pages[p].r).length;
    return { total: count(), weeks, days, streak, age, reviewRate, cycleDays: tp.cycleDays, neverReviewed };
  }

  // ---------- account sync ----------
  // After sign-in: the settings row (app.js → applyRemoteSettings).
  function mergeRemote(settings) {
    if (!settings) return;
    const remoteTime = settings.memorized_updated_at ? Date.parse(settings.memorized_updated_at) || 0 : 0;
    let remote = null;
    if (settings.hifz && typeof settings.hifz === "object" && settings.hifz.v === 2) {
      remote = { pages: cleanPages(settings.hifz.pages), log: cleanLog(settings.hifz.log), plan: cleanPlan(settings.hifz.plan) };
    } else if (Array.isArray(settings.memorized_pages)) {
      remote = { pages: cleanPages(settings.memorized_pages), log: {}, plan: null };
    }
    if (!remote) { if (count() && updatedAt) push(); return; }

    // review history from both copies is kept
    const mergedLog = Object.assign({}, remote.log);
    Object.keys(log).forEach((day) => {
      const a = mergedLog[day], b = log[day];
      mergedLog[day] = a ? Object.assign({}, a, b, { r: Array.from(new Set(a.r.concat(b.r))), q: Math.max(a.q || 0, b.q || 0) || null }) : b;
    });
    const keepLatestReview = (into, other) => {
      Object.keys(into).forEach((p) => {
        const o = other[p];
        if (o && o.r && (!into[p].r || o.r > into[p].r)) into[p].r = o.r;
      });
    };

    if (remoteTime > updatedAt) {
      keepLatestReview(remote.pages, pages);
      pages = remote.pages;
      if (remote.plan) plan = remote.plan;
      updatedAt = remoteTime;
    } else {
      keepLatestReview(pages, remote.pages);
    }
    log = mergedLog;
    persist();
    emit();
    // this device has something the account doesn't → upload the merged copy
    if (updatedAt > remoteTime || JSON.stringify(mergedLog) !== JSON.stringify(remote.log)) push();
  }

  function onChange(fn) { listeners.push(fn); }

  return {
    // pages
    has, all, count, info, toggle, setMany, setDate, memorizedWithin,
    // reviews & plans
    reviewedToday, setReviewed, getPlan, setPlan, todayPlan, weekInfo, stats,
    // helpers
    today, addDays, daysBetween,
    mergeRemote, onChange,
  };
})();
