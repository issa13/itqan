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
    let m = date === undefined ? today() : (validDay(date) ? date : null);
    if (m && m > today()) m = today(); // never in the future
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
    pages[page].m = validDay(date) ? (date > today() ? today() : date) : null;
    changed();
  }

  // Pages memorized in the last `days` days (today included).
  function memorizedWithin(days) {
    const from = addDays(today(), -(days - 1));
    return sortedPages().filter((p) => pages[p].m && pages[p].m >= from);
  }

  // ---------- reviews ----------
  // Every review is kept in the log under its day (log[day].r), so a
  // review can be recorded for an earlier day too (the app wasn't opened
  // for a while) and undone again. pages[p].r caches the latest one.
  const MAX_BACK_DAYS = 30; // how far back a review can be recorded

  function reviewDays(page) {
    return Object.keys(log).filter((d) => log[d].r.includes(page)).sort();
  }
  // The last review strictly before `day` (used to order the queue for
  // that day, so ticking pages on it never reshuffles its list).
  function lastReviewBefore(page, day) {
    let best = null;
    Object.keys(log).forEach((d) => { if (d < day && log[d].r.includes(page) && (!best || d > best)) best = d; });
    const cached = pages[page] && pages[page].r;
    if (cached && cached < day && !log[cached] && (!best || cached > best)) best = cached; // from before the log
    return best;
  }
  function recomputeR(page) {
    const days = reviewDays(page);
    const cached = pages[page].r;
    pages[page].r = days.length ? days[days.length - 1] : (cached && !log[cached] ? cached : null);
    if (cached && !log[cached] && days.length && cached > pages[page].r) pages[page].r = cached;
  }

  function isReviewedOn(page, day) { return !!pages[page] && !!log[day] && log[day].r.includes(page); }
  function reviewedToday(page) { return isReviewedOn(page, today()); }
  function reviewedOn(day) { return log[day] ? log[day].r.filter((p) => pages[p]).sort((a, b) => a - b) : []; }

  // Can a review be recorded for this day? → "" or the reason (Arabic).
  function reviewDayProblem(day) {
    const t = today();
    if (!validDay(day)) return "تاريخ غير صالح.";
    if (day > t) return "لا يمكن تسجيل مراجعة في يوم لم يأتِ بعد.";
    if (daysBetween(day, t) > MAX_BACK_DAYS) return `يمكن تسجيل المراجعة لآخر ${MAX_BACK_DAYS} يومًا فقط.`;
    return "";
  }

  // Marks a page reviewed on `day` (default today), or undoes that mark.
  // → { ok: true } or { ok: false, reason }
  function setReviewed(page, on, day) {
    const d = day || today();
    if (!pages[page]) return { ok: false, reason: "هذه الصفحة ليست ضمن محفوظاتك." };
    const problem = reviewDayProblem(d);
    if (problem) return { ok: false, reason: problem };
    if (on && pages[page].m && pages[page].m > d) return { ok: false, reason: "لا يمكن مراجعة صفحة قبل تاريخ حفظها." };
    const entry = log[d] || (log[d] = { r: [], q: null });
    if (on) {
      if (entry.r.includes(page)) return { ok: true };
      entry.r.push(page);
    } else {
      if (!entry.r.includes(page)) return { ok: true };
      entry.r = entry.r.filter((p) => p !== page);
    }
    recomputeR(page);
    changed();
    return { ok: true };
  }

  // The most recent day with any review, or null.
  function lastReviewDay() {
    const days = Object.keys(log).filter((d) => log[d].r.length).sort();
    return days.length ? days[days.length - 1] : null;
  }

  // Days since the last recorded review that have nothing recorded (oldest
  // first, up to yesterday) — for «سجّل الأيام الفائتة». Empty when the
  // last review was today or yesterday, or nothing was ever reviewed.
  function missedDays() {
    const last = lastReviewDay();
    if (!last || !count()) return [];
    const t = today();
    const out = [];
    for (let d = addDays(last, 1); d < t && out.length < MAX_BACK_DAYS; d = addDays(d, 1)) {
      if (daysBetween(d, t) <= MAX_BACK_DAYS) out.push(d);
    }
    return out;
  }

  // ---------- plans ----------
  function getPlan() { return Object.assign({}, plan); }
  function setPlan(patch) { plan = cleanPlan(Object.assign({}, plan, patch || {})); changed(); }

  // memorized by that day (pages without a date count as always memorized)
  function memorizedBy(page, day) { const m = pages[page].m; return !m || m <= day; }

  function isNear(page, day) {
    const m = pages[page].m;
    return !!m && plan.nearDays > 0 && m <= day && daysBetween(m, day) < plan.nearDays;
  }

  // far queue for a day: reviewed longest ago (before that day) first,
  // never reviewed first of all, then by page number.
  function farQueue(day) {
    const last = {};
    const list = sortedPages().filter((p) => memorizedBy(p, day) && !isNear(p, day));
    list.forEach((p) => { last[p] = lastReviewBefore(p, day) || ""; });
    return list.sort((a, b) => (last[a] < last[b] ? -1 : last[a] > last[b] ? 1 : a - b));
  }

  function farQuota(farCount) {
    if (!farCount) return 0;
    if (plan.farMode === "days") return Math.ceil(farCount / plan.farDays);
    return Math.min(plan.farPages, farCount);
  }

  // A day's review (default today): { day, near: [{page, done}], far: [{page, done}],
  //   extra: [{page}], more: [pages], quota, farCount, cycleDays, doneCount, dueCount,
  //   reviewed: [pages reviewed that day] }
  // far = that day's due pages. They're chosen once and kept in the log
  // (log[day].f), so ticking pages — or «➕ راجعت أكثر» — doesn't reshuffle
  // the list; they're re-chosen only when the quota changes (plan edited,
  // pages added/removed). extra = pages reviewed that day beyond the list;
  // more = the next pages of the queue, for «➕ راجعت أكثر».
  function planFor(dayArg) {
    const t = validDay(dayArg) ? dayArg : today();
    const done = (p) => isReviewedOn(p, t);
    const near = sortedPages().filter((p) => isNear(p, t)).map((page) => ({ page, done: done(page) }));
    const queue = farQueue(t);
    const inQueue = new Set(queue);
    const quota = farQuota(queue.length);
    const entry = log[t] || { r: [], q: null };
    let list = Array.isArray(entry.f) ? entry.f.filter((p) => inQueue.has(p)) : null;
    if (!list || list.length !== quota) {
      // keep what's already ticked from the old list, fill up from the queue
      const kept = (list || []).filter(done).slice(0, quota);
      const fill = queue.filter((p) => !kept.includes(p) && !done(p));
      list = kept.concat(fill.slice(0, quota - kept.length));
      if (list.length < quota) list = list.concat(queue.filter((p) => !list.includes(p)).slice(0, quota - list.length));
    }
    const listSet = new Set(list);
    const far = list.map((page) => ({ page, done: done(page) }));
    const extra = queue.filter((p) => !listSet.has(p) && done(p)).map((page) => ({ page, done: true }));
    const more = queue.filter((p) => !listSet.has(p) && !done(p));
    const cycleDays = quota ? Math.ceil(queue.length / quota) : 0;
    const dueCount = near.length + quota;
    const doneCount = near.filter((x) => x.done).length + far.filter((x) => x.done).length;
    // remember the day's list and how much was due (for the statistics' day colours)
    const sameList = Array.isArray(entry.f) && entry.f.length === list.length && entry.f.every((p, k) => p === list[k]);
    if ((dueCount || null) !== entry.q || !sameList) {
      log[t] = { r: entry.r, q: dueCount || null, f: list };
      persist(); // no push/emit just for this; it travels with the next change
    }
    return { day: t, near, far, extra, more, quota, farCount: queue.length, cycleDays, dueCount, doneCount, reviewed: reviewedOn(t) };
  }
  function todayPlan() { return planFor(today()); }

  // ---------- what to memorize next ----------
  // The page after the last one memorized (with a date), in the direction
  // you're going (worked out from your last two dated pages; forward when
  // there's only one), skipping pages already memorized.
  // → { page, after, direction: 1 | -1 } or null
  function nextToMemorize() {
    const dated = sortedPages().filter((p) => pages[p].m)
      .sort((a, b) => (pages[a].m < pages[b].m ? -1 : pages[a].m > pages[b].m ? 1 : 0));
    if (!dated.length) return null;
    const last = dated[dated.length - 1];
    // pages memorized on the same last day: continue from the furthest one
    const sameDay = dated.filter((p) => pages[p].m === pages[last].m);
    let direction = 1;
    const prevDay = dated.filter((p) => pages[p].m < pages[last].m);
    const ref = prevDay.length ? prevDay[prevDay.length - 1] : (sameDay.length > 1 ? Math.min(...sameDay) : null);
    const lastOfDay = Math.max(...sameDay);
    const firstOfDay = Math.min(...sameDay);
    if (ref !== null && ref > lastOfDay) direction = -1;
    const from = direction === 1 ? lastOfDay : firstOfDay;
    for (let p = from + direction; p >= 1 && p <= 604; p += direction) {
      if (!pages[p]) return { page: p, after: from, direction };
    }
    // nothing left that way (e.g. you reached the end of the Mushaf):
    // the first free page the other way
    for (let p = from - direction; p >= 1 && p <= 604; p -= direction) {
      if (!pages[p]) return { page: p, after: p + direction, direction: -direction };
    }
    return null;
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
    // review days, last 42 days (6 weeks):
    //   "full" | "extra" (all due + more) | "partial" | "none" | "free" (before you started)
    const firstDay = Object.keys(log).sort()[0] || t;
    const nearCache = {};
    function dayInfo(day) {
      const e = log[day];
      const r = e ? e.r : [];
      const q = e && e.q != null ? e.q : null;
      let dueDone = r.length, state;
      if (q && Array.isArray(e.f)) { // (older entries without the day's list: count everything)
        const dueSet = new Set((e.f || []).concat(nearCache[day] || (nearCache[day] = sortedPages().filter((p) => isNear(p, day)))));
        dueDone = r.filter((p) => dueSet.has(p)).length;
      }
      if (day < firstDay) state = "free";
      else if (!r.length) state = q || day < t ? "none" : "free";
      else if (!q) state = "full";
      else if (dueDone >= q) state = r.length > dueDone ? "extra" : "full";
      else state = "partial";
      return { day, done: r.length, dueDone: Math.min(dueDone, q || dueDone), due: q, state };
    }
    const days = [];
    for (let i = 41; i >= 0; i--) days.push(dayInfo(addDays(t, -i)));
    // streak: consecutive days with a complete review, back from today
    // (today not finished yet doesn't break it)
    let streak = 0;
    for (let i = 0; i < LOG_DAYS; i++) {
      const day = addDays(t, -i);
      if (day < firstDay) break;
      const st = dayInfo(day).state;
      if (st === "full" || st === "extra") streak++;
      else if (i === 0) continue;
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
      ? Math.round(100 * last30.reduce((s, d) => s + d.dueDone, 0) / last30.reduce((s, d) => s + d.due, 0))
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
    reviewedToday, isReviewedOn, reviewedOn, reviewDayProblem, setReviewed, lastReviewDay, missedDays,
    getPlan, setPlan, todayPlan, planFor, nextToMemorize, weekInfo, stats,
    // helpers
    today, addDays, daysBetween,
    mergeRemote, onChange,
  };
})();
