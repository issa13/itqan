// hifz.js — 📗 الحفظ والمراجعة: which Mushaf pages you've memorized, when,
// when each was last reviewed, and the plans built on that.
//
// Data (version 2, localStorage "qf_hifz_v2"):
//   pages: { "<page>": { m: "YYYY-MM-DD" | null, r: "YYYY-MM-DD" | null } }
//          m = the day it was memorized (null = «محفوظ قديم», memorized
//          before the app tracked it), r = the last day it was reviewed.
//   log:   { "YYYY-MM-DD": { r: [pages reviewed that day], q: due that day,
//            f: [that day's «القديم» list], x: [extra pages],
//            t: {s, n} | "skip" (the day's test), miss: true } }
//          kept for the statistics (last LOG_DAYS days).
//   plan:  the user's settings:
//          weeklyGoal (0 = review only), weekStart, nearDays,
//          farMode / farPages / farDays (how much «القديم» a day),
//          setupOn — the day the plan was set up (days before it are never
//                    «missed»; the first week's goal is pro-rated),
//          dir     — "asc" (from الفاتحة) | "desc" (from الناس),
//          memNext — the next page to memorize, as chosen by the user,
//          farCursor / farSince — where the current «ختمة» of «القديم»
//                    started: pages before farCursor (in `dir` order) and
//                    pages reviewed since farSince count as done,
//          farCycle — the number of the current «ختمة» (from 1).
//
// Plans:
//   • الحفظ الجديد — a weekly goal (pages per week), spread over the days
//     left in the week; the next page follows `dir` from memNext.
//   • مراجعة آخر ما حفظت — every page memorized in the last `nearDays`
//     days (not the day itself), every day.
//   • مراجعة القديم — all other memorized pages, in `dir` order, a fixed
//     number a day (farPages, or ceil(pages / farDays)). What isn't
//     reviewed stays first for the next day; when every page of the
//     «ختمة» is done, the next one starts from the first page.
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
    setupOn: null,     // "YYYY-MM-DD" — the day the plan was set up
    dir: null,         // "asc" | "desc" (null: worked out from the dates)
    memNext: null,     // page chosen as the next to memorize
    farCursor: null,   // where the current «ختمة» of «القديم» started
    farSince: null,    // … and on which day
    farCycle: 1,       // the number of the current «ختمة»
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
      const x = Array.isArray(v.x) ? v.x.map(Number).filter(validPage) : null;
      const t = cleanTest(v.t);
      const miss = v.miss === true;
      if (!r.length && q == null && !t && !miss && !f) return;
      const e = { r, q };
      if (f) e.f = f;
      if (x && x.length) e.x = x;
      if (t) e.t = t;
      if (miss) e.miss = true;
      out[day] = e;
    });
    return out;
  }
  // a day's test: "skip" («ليس اليوم») or { s: correct, n: answered }
  function cleanTest(t) {
    if (t === "skip") return "skip";
    if (t && typeof t === "object") {
      const n = clampInt(t.n, 0, 100000, 0), s = clampInt(t.s, 0, 100000, 0);
      if (n > 0) return { s: Math.min(s, n), n };
    }
    return null;
  }
  function betterTest(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    if (a === "skip") return b;
    if (b === "skip") return a;
    return b.n > a.n ? b : a;
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
    p.setupOn = validDay(raw.setupOn) ? raw.setupOn : null;
    p.dir = raw.dir === "asc" || raw.dir === "desc" ? raw.dir : null;
    p.memNext = clampInt(raw.memNext, 1, 604, null);
    p.farCursor = clampInt(raw.farCursor, 1, 604, null);
    p.farSince = validDay(raw.farSince) ? raw.farSince : null;
    p.farCycle = clampInt(raw.farCycle, 1, 10000, 1);
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

  let previewing = false; // preview(): nothing is written
  function persist() {
    if (previewing) return;
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

  function changed() { reviewIndex = null; updatedAt = Date.now(); persist(); emit(); schedulePush(); }

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

  // page → its review days (sorted), built from the log when needed and
  // dropped whenever the log changes — the queue asks for every page's
  // last review, so this keeps a long history fast.
  let reviewIndex = null;
  function getReviewIndex() {
    if (reviewIndex) return reviewIndex;
    reviewIndex = new Map();
    Object.keys(log).sort().forEach((d) => {
      log[d].r.forEach((p) => {
        if (!reviewIndex.has(p)) reviewIndex.set(p, []);
        reviewIndex.get(p).push(d);
      });
    });
    return reviewIndex;
  }
  function reviewDays(page) { return (getReviewIndex().get(page) || []).slice(); }
  // The last review strictly before `day` (used to order the queue for
  // that day, so ticking pages on it never reshuffles its list).
  function lastReviewBefore(page, day) {
    let best = null;
    const days = getReviewIndex().get(page) || [];
    for (let i = days.length - 1; i >= 0; i--) { if (days[i] < day) { best = days[i]; break; } }
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
    reviewIndex = null;
    recomputeR(page);
    changed();
    return { ok: true };
  }

  // The most recent day with any review, or null.
  function lastReviewDay() {
    const days = Object.keys(log).filter((d) => log[d].r.length).sort();
    return days.length ? days[days.length - 1] : null;
  }

  // ---------- plans ----------
  function getPlan() { return Object.assign({}, plan); }
  function setPlan(patch) { plan = cleanPlan(Object.assign({}, plan, patch || {})); changed(); }
  function isSetUp() { return !!plan.setupOn; }

  // memorized by that day (pages without a date count as always memorized)
  function memorizedBy(page, day) { const m = pages[page].m; return !m || m <= day; }

  // «آخر ما حفظت»: memorized on one of the `nearDays` days before `day`
  // (a page memorized today is first reviewed tomorrow).
  function isNear(page, day) {
    const m = pages[page].m;
    if (!m || plan.nearDays <= 0 || m >= day) return false;
    return daysBetween(m, day) <= plan.nearDays;
  }

  // ---- «القديم»: the «ختمة» in page order ----
  function dirSign() { return plan.dir === "desc" ? -1 : 1; }
  // «القديم» on that day, in the order of the «ختمة»
  function farOrder(day) {
    const list = sortedPages().filter((p) => memorizedBy(p, day) && !isNear(p, day));
    return dirSign() === 1 ? list : list.reverse();
  }
  // is page a before page b in the order of the «ختمة»?
  function before(a, b) { return dirSign() === 1 ? a < b : a > b; }

  // Pages of the current «ختمة» not done yet, as of the start of `day`
  // (reviews of `day` itself don't count, so its list stays put while you
  // tick pages). → { order, pending }
  function farPending(day) {
    const order = farOrder(day);
    const cursor = plan.farCursor;
    const since = plan.farSince;
    const pending = order.filter((p) => {
      if (cursor && before(p, cursor)) return false;          // before where the «ختمة» started
      if (since) {
        const days = getReviewIndex().get(p) || [];
        if (days.some((d) => d >= since && d < day)) return false; // already reviewed in it
      }
      return true;
    });
    return { order, pending };
  }

  function farQuota(farCount) {
    if (!farCount) return 0;
    if (plan.farMode === "days") return Math.ceil(farCount / plan.farDays);
    return Math.min(plan.farPages, farCount);
  }

  // When every page of the «ختمة» is done, the next one starts today from
  // the first page. → true if it rolled over.
  function rollFarCycle(day) {
    if (!plan.setupOn) return false;
    const { order, pending } = farPending(day);
    if (!order.length || pending.length) return false;
    // nothing was ever done in it (e.g. pages before the cursor only after
    // an edit) → it still counts as finished
    plan.farCycle = (plan.farCycle || 1) + 1;
    plan.farCursor = order[0];
    plan.farSince = day;
    updatedAt = Date.now();
    persist();
    schedulePush();
    return true;
  }

  // A day's review (default today): { day, near: [{page, done}], far: [{page, done}],
  //   extra: [{page}], more: [pages], quota, farCount, cycleDays, doneCount, dueCount,
  //   reviewed: [pages reviewed that day], cycle, cycleLeft, cycleDone }
  // far = that day's «القديم» — the next `quota` pages of the «ختمة» that
  // weren't done before that day. Kept in the log (log[day].f) for the
  // statistics; a past day keeps the list it had. extra = pages reviewed
  // that day beyond the lists; more = the next pages of the «ختمة», for
  // «راجع صفحات إضافية».
  function planFor(dayArg) {
    const t = validDay(dayArg) ? dayArg : today();
    const isToday = t === today();
    if (isToday) rollFarCycle(t);
    const done = (p) => isReviewedOn(p, t);
    const near = sortedPages().filter((p) => isNear(p, t)).map((page) => ({ page, done: done(page) }));
    const { order, pending } = farPending(t);
    const inOrder = new Set(order);
    const quota = farQuota(order.length);
    const entry = log[t] || { r: [], q: null };
    let list;
    if (!isToday && Array.isArray(entry.f)) list = entry.f.filter((p) => inOrder.has(p));
    else list = pending.slice(0, quota);
    const listSet = new Set(list);
    const nearSet = new Set(near.map((x) => x.page));
    const far = list.map((page) => ({ page, done: done(page) }));
    const reviewed = reviewedOn(t);
    const extra = reviewed.filter((p) => !listSet.has(p) && !nearSet.has(p)).map((page) => ({ page, done: true }));
    const more = pending.filter((p) => !listSet.has(p) && !done(p));
    const cycleDays = quota ? Math.ceil(order.length / quota) : 0;
    const dueCount = near.length + far.length;
    const doneCount = near.filter((x) => x.done).length + far.filter((x) => x.done).length;
    // the «ختمة» is finished once every pending page was reviewed (today included)
    const cycleLeft = pending.filter((p) => !done(p)).length;
    // remember the day's list and how much was due (for the statistics' day colours)
    const x = extra.map((e) => e.page);
    const sameList = Array.isArray(entry.f) && entry.f.length === list.length && entry.f.every((p, k) => p === list[k]);
    const sameX = JSON.stringify(entry.x || []) === JSON.stringify(x);
    if ((isToday || !Array.isArray(entry.f)) && ((dueCount || null) !== entry.q || !sameList || !sameX)) {
      const e = Object.assign({}, entry, { r: entry.r, q: dueCount || null, f: list });
      if (x.length) e.x = x; else delete e.x;
      log[t] = e;
      persist(); // no push/emit just for this; it travels with the next change
    }
    return {
      day: t, near, far, extra, more, quota, farCount: order.length, cycleDays, dueCount, doneCount, reviewed,
      cycle: plan.farCycle || 1, cycleLeft, cycleDone: order.length > 0 && cycleLeft === 0,
    };
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
    if (plan.dir) direction = dirSign();
    const from = direction === 1 ? lastOfDay : firstOfDay;
    for (let p = from + direction; p >= 1 && p <= 604; p += direction) {
      if (!pages[p]) return { page: p, after: from, direction };
    }
    // nothing left that way (e.g. you reached the end of the Mushaf):
    // the first free page the other way
    for (let p = from - direction; p >= 1 && p <= 604; p -= direction) {
      if (!pages[p]) return { page: p, after: p + direction, direction: -direction, wrapped: true };
    }
    return null;
  }

  // The first page not in `set` going `dir` (1 / -1) from the start of the
  // Mushaf (asc: the lowest free page; desc: the highest).
  function suggestNext(set, dir) {
    if (dir === -1) { for (let p = 604; p >= 1; p--) if (!set.has(p)) return p; return null; }
    for (let p = 1; p <= 604; p++) if (!set.has(p)) return p;
    return null;
  }
  // The free page nearest to `page` (for «أقرب صفحة غير محفوظة»), looking
  // `dir` first.
  function nearestFree(page, set, dir) {
    const d = dir === -1 ? -1 : 1;
    for (let k = 0; k < 604; k++) {
      const a = page + d * k, b = page - d * k;
      if (a >= 1 && a <= 604 && !set.has(a)) return a;
      if (b >= 1 && b <= 604 && !set.has(b)) return b;
    }
    return null;
  }
  // The memorized page nearest to `page` (for «أين وصلت مراجعة القديم»).
  function nearestIn(page, list) {
    let best = null;
    list.forEach((p) => { if (best === null || Math.abs(p - page) < Math.abs(best - page)) best = p; });
    return best;
  }

  // The next page to memorize under the plan:
  // → { page, direction, wrapped } or null (the whole Mushaf is memorized)
  function nextMemPage() {
    if (count() >= 604) return null;
    const d = dirSign();
    const start = plan.memNext;
    if (validPage(start)) {
      if (!pages[start]) return { page: start, direction: d, wrapped: false };
      for (let p = start + d; p >= 1 && p <= 604; p += d) if (!pages[p]) return { page: p, direction: d, wrapped: false };
      for (let p = start - d; p >= 1 && p <= 604; p -= d) if (!pages[p]) return { page: p, direction: -d, wrapped: true };
      return null;
    }
    const n = nextToMemorize();
    if (n) return { page: n.page, direction: n.direction, wrapped: !!n.wrapped };
    const p = suggestNext(all(), plan.dir ? d : 1);
    return p ? { page: p, direction: d, wrapped: false } : null;
  }

  // This week's memorization goal: { goal, fullGoal, done, start, end, daysLeft, partial }
  // The week the plan was set up in only asks for its share of the goal
  // (3 days of 7 → 3/7 of it, rounded up).
  function weekInfo(ref) {
    const t = ref || today();
    const d = parseDay(t);
    const start = addDays(t, -((d.getDay() - plan.weekStart + 7) % 7));
    const end = addDays(start, 6);
    // pages dated before the plan was set up (e.g. the setup's approximate
    // dates) don't count towards its first week
    const from = plan.setupOn && plan.setupOn > start ? plan.setupOn : start;
    const done = sortedPages().filter((p) => pages[p].m && pages[p].m >= from && pages[p].m <= end).length;
    let goal = plan.weeklyGoal;
    let partial = false;
    if (goal && plan.setupOn && plan.setupOn > start && plan.setupOn <= end) {
      const days = daysBetween(plan.setupOn, end) + 1;
      goal = Math.ceil((plan.weeklyGoal * days) / 7);
      partial = true;
    }
    return { goal, fullGoal: plan.weeklyGoal, done, start, end, daysLeft: daysBetween(t, end) + 1, partial };
  }

  // Today's memorization: { active, reason, page, pages, target, doneToday, done, wrapped }
  //   reason (when not active): "reviewOnly" | "goalMet" | "complete"
  function memTask() {
    const t = today();
    const doneToday = sortedPages().filter((p) => pages[p].m === t);
    if (!plan.weeklyGoal) return { active: false, reason: "reviewOnly", doneToday: doneToday.length };
    const next = nextMemPage();
    if (!next) return { active: false, reason: "complete", doneToday: doneToday.length };
    const w = weekInfo(t);
    const doneBefore = w.done - doneToday.length;
    if (doneBefore >= w.goal) return { active: false, reason: "goalMet", doneToday: doneToday.length, week: w };
    const target = Math.max(1, Math.ceil((w.goal - doneBefore) / w.daysLeft));
    // the pages for today, from the next one on (for «احفظ: صفحة ٤٥–٤٦»)
    const list = [next.page];
    for (let p = next.page + next.direction; list.length < target - Math.min(doneToday.length, target) && p >= 1 && p <= 604; p += next.direction) {
      if (!pages[p]) list.push(p);
    }
    return {
      active: true, page: next.page, pages: list, target, doneToday: doneToday.length,
      done: doneToday.length >= target, wrapped: next.wrapped, week: w,
    };
  }

  // What's left today, in the order «كمّل» goes through it:
  //   { mem, review (= todayPlan()), test, step: { kind, page } }
  //   kind: "mem" | "review" | "test" | "done"
  function todayTasks() {
    const t = today();
    const mem = memTask();
    const review = planFor(t);
    const reviewedToday = review.reviewed.length > 0;
    const test = log[t] && log[t].t ? log[t].t : null;
    let step;
    if (mem.active && !mem.done) step = { kind: "mem", page: mem.page };
    else {
      const next = review.near.concat(review.far).find((x) => !x.done);
      if (next) step = { kind: "review", page: next.page };
      else if (reviewedToday && !test) step = { kind: "test" };
      else step = { kind: "done" };
    }
    return { mem, review, test, step, testNeeded: reviewedToday };
  }

  // ---------- the day's test, «لم أراجع فيه» ----------
  function testOn(day) { return log[day] && log[day].t ? log[day].t : null; }
  function setTest(day, value) {
    const d = day || today();
    const t = cleanTest(value);
    const entry = log[d] || (log[d] = { r: [], q: null });
    if (t) entry.t = t; else delete entry.t;
    changed();
  }
  // one answer of a test started from 📗 حفظي (📝 تدريب or ⏱️ تحدٍّ)
  function addTestAnswer(correct) {
    const d = today();
    const entry = log[d] || (log[d] = { r: [], q: null });
    const t = entry.t && entry.t !== "skip" ? entry.t : { s: 0, n: 0 };
    entry.t = { s: t.s + (correct ? 1 : 0), n: t.n + 1 };
    changed();
  }
  function setMiss(day, on) {
    if (!validDay(day)) return;
    const entry = log[day] || (log[day] = { r: [], q: null });
    if (on) entry.miss = true; else delete entry.miss;
    changed();
  }
  function isMissAccepted(day) { return !!(log[day] && log[day].miss); }

  // Days in the last 14 (after the day the plan was set up, before today)
  // with nothing recorded although something was due → oldest first.
  const MISSED_WINDOW = 14;
  function missedDays() {
    if (!plan.setupOn || !count()) return [];
    const t = today();
    const out = [];
    for (let i = MISSED_WINDOW; i >= 1; i--) {
      const d = addDays(t, -i);
      if (d <= plan.setupOn) continue;
      if (log[d] && (log[d].r.length || log[d].miss)) continue;
      // anything to review that day? (pages memorized before it)
      if (!sortedPages().some((p) => !pages[p].m || pages[p].m < d)) continue;
      out.push(d);
    }
    return out;
  }

  // Pages reviewed between two days (both included), for «اختبار على صفحات أخرى».
  function reviewedBetween(from, to) {
    const set = new Set();
    Object.keys(log).forEach((d) => { if (d >= from && d <= to) log[d].r.forEach((p) => { if (pages[p]) set.add(p); }); });
    return Array.from(set).sort((a, b) => a - b);
  }
  function nearPages(day) { const t = day || today(); return sortedPages().filter((p) => isNear(p, t)); }

  // ---------- writing a whole form at once ----------
  // The first-time setup («حفظ الخطة»): adds the memorized pages (as «قديم»,
  // or with the given approximate dates — a page that already has a real
  // date keeps it), then the plan. Pages already memorized are never removed.
  //   { old: [pages], dated: { page: day }, plan: {...} }
  function saveSetup(data) {
    const t = today();
    (data.old || []).forEach((p) => { if (validPage(p) && !pages[p]) pages[p] = { m: null, r: null }; });
    Object.keys(data.dated || {}).forEach((k) => {
      const p = Number(k), d = data.dated[k];
      if (!validPage(p) || !validDay(d)) return;
      if (!pages[p]) pages[p] = { m: null, r: null };
      if (!pages[p].m) pages[p].m = d > t ? t : d;
    });
    const np = Object.assign({}, plan, data.plan || {}, { setupOn: t });
    np.farSince = t;
    plan = cleanPlan(np);
    reviewIndex = null;
    changed();
  }
  // For data from before the setup: where the old queue had got to — the
  // first page (in page order) among those reviewed longest ago.
  function legacyFarStart() {
    const order = farOrder(today());
    if (!order.length) return null;
    const key = (p) => pages[p].r || "";
    let min = null;
    order.forEach((p) => { if (min === null || key(p) < min) min = key(p); });
    return order.find((p) => key(p) === min) || null;
  }
  // «احتفظ بإعداداتي» — the plan as it is, set up from today on.
  function keepSettings(farCursor) {
    plan = cleanPlan(Object.assign({}, plan, { setupOn: today(), farCursor: farCursor || plan.farCursor, farSince: today() }));
    changed();
  }
  // «خطتي ← تعديل → حفظ»: the whole plan. A new starting point for
  // «القديم» (or a new direction) starts the «ختمة» from there today.
  function savePlan(next) {
    const np = cleanPlan(Object.assign({}, plan, next));
    if (np.farCursor !== plan.farCursor || np.dir !== plan.dir) np.farSince = today();
    if (!np.setupOn) np.setupOn = today();
    plan = np;
    changed();
  }
  // «تعديل المحفوظ → حفظ»: adds { page: day | null } and removes [pages] in one go.
  function applyPageEdits(adds, removes) {
    let any = false;
    Object.keys(adds || {}).forEach((k) => {
      const p = Number(k);
      if (!validPage(p) || pages[p]) return;
      mark(p, adds[k] === null ? null : adds[k]);
      any = true;
    });
    (removes || []).forEach((p) => { if (pages[p]) { delete pages[p]; any = true; } });
    if (any) changed();
  }

  // Ticks / unticks several pages for one day at once («سجّل يومًا فاتك → حفظ»).
  // → { ok: true } or { ok: false, reason }
  function setReviewedMany(day, on, off) {
    const problem = reviewDayProblem(day);
    if (problem) return { ok: false, reason: problem };
    const entry = log[day] || (log[day] = { r: [], q: null });
    (on || []).forEach((p) => { if (pages[p] && !(pages[p].m && pages[p].m > day) && !entry.r.includes(p)) entry.r.push(p); });
    entry.r = entry.r.filter((p) => !(off || []).includes(p));
    if (entry.r.length) delete entry.miss;
    reviewIndex = null;
    (on || []).concat(off || []).forEach((p) => { if (pages[p]) recomputeR(p); });
    changed();
    return { ok: true };
  }

  // What a setup would give today, without saving anything:
  // → { mem: memTask(), review: planFor(today) }
  function preview(data) {
    const saved = { pages, log, plan, updatedAt, reviewIndex };
    previewing = true;
    try {
      pages = JSON.parse(JSON.stringify(pages));
      log = JSON.parse(JSON.stringify(log));
      const t = today();
      (data.old || []).forEach((p) => { if (validPage(p) && !pages[p]) pages[p] = { m: null, r: null }; });
      Object.keys(data.dated || {}).forEach((k) => {
        const p = Number(k);
        if (!validPage(p)) return;
        if (!pages[p]) pages[p] = { m: null, r: null };
        if (!pages[p].m) pages[p].m = data.dated[k];
      });
      plan = cleanPlan(Object.assign({}, plan, data.plan || {}, { setupOn: t, farSince: t }));
      reviewIndex = null;
      return { mem: memTask(), review: planFor(t) };
    } finally {
      pages = saved.pages; log = saved.log; plan = saved.plan; updatedAt = saved.updatedAt; reviewIndex = null;
      previewing = false;
    }
  }

  // Raw copy of what's saved (for the browser tests: «إلغاء» must not
  // change a single byte).
  function rawSaved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }

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
      if (day < firstDay || (plan.setupOn && day < plan.setupOn && !r.length)) state = "free";
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
      if (!a) { mergedLog[day] = b; return; }
      const m = Object.assign({}, a, b, { r: Array.from(new Set(a.r.concat(b.r))), q: Math.max(a.q || 0, b.q || 0) || null });
      const t = betterTest(a.t, b.t);
      if (t) m.t = t; else delete m.t;
      if (a.miss || b.miss) m.miss = true;
      mergedLog[day] = m;
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
    reviewIndex = null;
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
    reviewedBetween, nearPages,
    getPlan, setPlan, isSetUp, todayPlan, planFor, nextToMemorize, nextMemPage, suggestNext, nearestFree, nearestIn,
    weekInfo, memTask, todayTasks, farOrder: (d) => farOrder(d || today()), stats,
    testOn, setTest, addTestAnswer, setMiss, isMissAccepted,
    saveSetup, keepSettings, legacyFarStart, savePlan, applyPageEdits, setReviewedMany, preview, rawSaved,
    // helpers
    today, addDays, daysBetween,
    mergeRemote, onChange,
  };
})();
