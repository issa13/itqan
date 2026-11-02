// hifz-ui.js — 📗 حفظي: the memorization & review screen (its own tab).
//
// Goal: whoever opens «📗 حفظي» knows within two seconds what today asks
// of them, and does it with one button.
//
//   • Not set up yet → a 4-step setup (one question per screen): what do
//     you know already · new memorization (where did you reach?) · review
//     (where did you reach?) · summary. Nothing is written before
//     «حفظ الخطة».
//   • Then three tabs (always opens on ☀️ اليوم, unless a notification
//     asks for another):
//       ☀️ اليوم   — today's card + «كمّل» (goes to the first step not
//                    done: memorize → review → test → done), today's
//                    review list with ✅, «اختبر نفسك», and «فاتك يوم»
//                    only when a day is missing.
//       🗒️ خطتي   — a two-line summary + «تعديل» (a form on a temporary
//                    copy, «حفظ / إلغاء»), four folded sections.
//       📈 تقدّمي — quick numbers, the map of the last 42 days, the pages
//                    per juz + «تعديل المحفوظ».
//   • In the Mushaf: one «سجّل هذه الصفحة» button (memorized today /
//     reviewed today / undo today) and, when opened from «كمّل», a bar
//     «صفحة ١٤ — ٣ من ٦ · ✅ تمّت · التالية ◀».
//
// Shared pieces: folded sections (a real button with aria-expanded; the
// open/closed state is remembered per section on the device), forms on a
// temporary copy (leaving with unsaved changes asks «حفظ / تجاهل /
// البقاء»), a 5-second «تراجع» notice, «؟» bubbles.
// Data: hifz.js (HifzStore). Loaded after quran-reader.js.

const HIFZ_DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const HIFZ_SEC_PREFIX = "qf_hifz_sec_";          // + section id → "1" open / "0" folded
const HIFZ_OPEN_TAB_KEY = "qf_hifz_open_tab";    // one-shot: the tab a notification asks for
const HIFZ_QUIZ_OPTS_KEY = "qf_hifz_quiz_opts";  // «خيارات» of «اختبر نفسك»
const HIFZ_ALL_DONE_KEY = "qf_hifz_all_done_seen";
const HIFZ_MAP_DAYS = 42;
const HIFZ_BACK_DAYS = 30;                       // a review can be recorded this far back

// ============================================================
// small helpers
// ============================================================
function hifzAr(n) { return toArabicDigits(n); }
// "2026-11-06" → "الجمعة ٦/١١"
function hifzFmtDay(key, withName = true) {
  if (!key) return "";
  const [y, m, d] = key.split("-").map(Number);
  const name = HIFZ_DAY_NAMES[new Date(y, m - 1, d).getDay()];
  return `${withName ? name + " " : ""}${hifzAr(d)}/${hifzAr(m)}`;
}
function hifzDayName(key) {
  const [y, m, d] = key.split("-").map(Number);
  return HIFZ_DAY_NAMES[new Date(y, m - 1, d).getDay()];
}
// "اليوم" / "أمس" / "الأحد ١/١١"
function hifzDayWord(day) {
  const n = HifzStore.daysBetween(day, HifzStore.today());
  if (n === 0) return "اليوم";
  if (n === 1) return "أمس";
  return hifzFmtDay(day);
}
// "قبل ٣ أيام"
function hifzAgo(day) {
  if (!day) return "";
  const n = HifzStore.daysBetween(day, HifzStore.today());
  if (n <= 0) return "اليوم";
  if (n === 1) return "أمس";
  if (n === 2) return "قبل يومين";
  if (n <= 10) return `قبل ${hifzAr(n)} أيام`;
  return `قبل ${hifzAr(n)} يومًا`;
}
// "صفحة واحدة" / "صفحتان" / "٣ صفحات" / "١٢ صفحة"
function hifzPagesWord(n) {
  if (n === 1) return "صفحة واحدة";
  if (n === 2) return "صفحتان";
  if (n >= 3 && n <= 10) return `${hifzAr(n)} صفحات`;
  return `${hifzAr(n)} صفحة`;
}
// "٣ صفحات" (always with the number)
function hifzPagesN(n) { return `${hifzAr(n)} ${n >= 3 && n <= 10 ? "صفحات" : "صفحة"}`; }
// "يوم واحد" / "يومان" / "٣ أيام" / "١٥ يومًا"
function hifzDaysWord(n) {
  if (n === 1) return "يوم واحد";
  if (n === 2) return "يومان";
  if (n >= 3 && n <= 10) return `${hifzAr(n)} أيام`;
  return `${hifzAr(n)} يومًا`;
}
// "٣ أيام" (always with the number)
function hifzDaysN(n) { return `${hifzAr(n)} ${n >= 3 && n <= 10 ? "أيام" : "يومًا"}`.replace(/^١ يومًا$/, "١ يوم"); }
// [45, 46] → "٤٥–٤٦"; [45, 47] → "٤٥، ٤٧"
function hifzPageList(list) {
  if (!list.length) return "";
  const s = list.slice().sort((a, b) => a - b);
  const consecutive = s.every((p, i) => i === 0 || p === s[i - 1] + 1);
  if (s.length > 1 && consecutive) return `${hifzAr(s[0])}–${hifzAr(s[s.length - 1])}`;
  if (s.length > 6) return `${s.slice(0, 6).map(hifzAr).join("، ")}…`;
  return s.map(hifzAr).join("، ");
}
function hifzPagesLabel(list) { return `${list.length > 1 ? "صفحات" : "صفحة"} ${hifzPageList(list)}`; }
function hifzToast(msg) { if (typeof showInfoToast === "function") showInfoToast(msg); }
function hifzIsActive() { return typeof currentViewName !== "undefined" && currentViewName === "hifz"; }
function hifzDirWord(dir) { return dir === "desc" ? "من الناس صعودًا" : "من الفاتحة نزولًا"; }

// surah name for a page (the surah the page starts in), and each surah's
// page range (for the setup's «أجزاء أو سور كاملة»)
let hifzSurahCatalog = null;
let hifzSurahEnd = null; // surah number → its last page
function hifzSurahName(page) {
  if (!hifzSurahCatalog) return "";
  let name = "";
  for (const s of hifzSurahCatalog) { if (s.startPage <= page) name = s.name; else break; }
  return hifzShortSurah(name);
}
function hifzShortSurah(name) { return String(name || "").replace(/^سُورَةُ\s*/, ""); }
fetchSurahCatalog().then((c) => {
  hifzSurahCatalog = (c || []).slice().sort((a, b) => a.number - b.number);
  if (hifzIsActive()) renderHifzView();
}).catch(() => {});
function hifzLoadSurahEnds() {
  if (hifzSurahEnd) return Promise.resolve(hifzSurahEnd);
  return fetchLocalAyahIndex().then((ayahs) => {
    const end = {};
    ayahs.forEach((a) => { end[a.surah] = Math.max(end[a.surah] || 0, a.endPage || a.page); });
    hifzSurahEnd = end;
    return end;
  });
}
function hifzSurahPages(num) {
  const s = hifzSurahCatalog && hifzSurahCatalog.find((x) => x.number === num);
  if (!s) return [];
  const end = hifzSurahEnd && hifzSurahEnd[num] ? hifzSurahEnd[num] : s.startPage;
  const out = [];
  for (let p = s.startPage; p <= end; p++) out.push(p);
  return out;
}

// opens a page in the Mushaf
function hifzOpenPage(page) {
  switchView("quran");
  quranGoToPage(page);
}

// ============================================================
// shared: folded sections
// ============================================================
// Remembered per section on this device — except the ones that open and
// fold by themselves with the day (today's review, «اختبر نفسك»): those
// only remember a tap until the state they depend on changes.
const hifzSecAuto = {}; // id → { key, open }
function hifzSecIsOpen(id, def, autoKey) {
  if (autoKey !== undefined) {
    const s = hifzSecAuto[id];
    return s && s.key === autoKey ? s.open : def;
  }
  try {
    const v = localStorage.getItem(HIFZ_SEC_PREFIX + id);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch (e) { /* ignore */ }
  return def;
}
// { id, icon, title, sum, body, open (default), autoKey, help, cls, noRemember }
function hifzSec(o) {
  const open = o.forceOpen ? true : hifzSecIsOpen(o.id, !!o.open, o.autoKey);
  const bodyId = `hifzSecBody-${o.id}`;
  return `
    <section class="hifz-sec${o.cls ? " " + o.cls : ""}${open ? " open" : ""}" data-sec="${o.id}"${o.autoKey !== undefined ? ` data-sec-auto="${o.autoKey}"` : ""}${o.noRemember ? " data-sec-temp" : ""}>
      <div class="hifz-sec-head">
        <button type="button" class="hifz-sec-btn" data-sec-toggle="${o.id}" aria-expanded="${open}" aria-controls="${bodyId}">
          <span class="hifz-sec-icon" aria-hidden="true">${o.icon || ""}</span>
          <span class="hifz-sec-title">${o.title}</span>
          ${o.sum ? `<span class="hifz-sec-sum">${o.sum}</span>` : ""}
          <span class="hifz-sec-arrow" aria-hidden="true">▾</span>
        </button>
        ${o.help ? hifzHelpBtn(o.help) : ""}
        ${o.headExtra || ""}
      </div>
      <div class="hifz-sec-body" id="${bodyId}"${open ? "" : " hidden"}>${o.body || ""}</div>
    </section>`;
}
function hifzSetSecOpen(sec, open) {
  const btn = sec.querySelector(":scope > .hifz-sec-head > .hifz-sec-btn");
  const body = sec.querySelector(":scope > .hifz-sec-body");
  btn.setAttribute("aria-expanded", String(open));
  body.hidden = !open;
  sec.classList.toggle("open", open);
  const id = sec.dataset.sec;
  if (sec.hasAttribute("data-sec-temp")) return;
  if (sec.hasAttribute("data-sec-auto")) hifzSecAuto[id] = { key: sec.dataset.secAuto, open };
  else { try { localStorage.setItem(HIFZ_SEC_PREFIX + id, open ? "1" : "0"); } catch (e) { /* ignore */ } }
}
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-sec-toggle]");
  if (!btn) return;
  const sec = btn.closest(".hifz-sec");
  hifzSetSecOpen(sec, btn.getAttribute("aria-expanded") !== "true");
});

// ============================================================
// shared: «؟» — one sentence in a small bubble
// ============================================================
const HIFZ_HELP = {
  near: "الصفحات التي حفظتها في الأيام القليلة الماضية تُراجَع كل يوم حتى تثبت، ثم تنتقل إلى «القديم».",
  far: "باقي محفوظك يُراجَع بالترتيب، عددٌ ثابت من الصفحات كل يوم، حتى تمرّ عليه كله ثم تبدأ من جديد.",
  goal: "عدد الصفحات الجديدة التي تريد حفظها في الأسبوع؛ يوزَّع على أيام الأسبوع الباقية. ٠ يعني مراجعة فقط.",
  khatma: "الختمة = مرور كامل على كل محفوظك القديم في مراجعة القديم؛ حين تنتهي تبدأ الختمة التالية من أول المحفوظ.",
};
const HIFZ_HELP_NAMES = { near: "مراجعة آخر ما حفظت", far: "مراجعة القديم", goal: "الهدف الأسبوعي", khatma: "الختمة" };
function hifzHelpBtn(key) {
  return `<button type="button" class="hifz-help" data-help="${key}" aria-label="ما معنى «${HIFZ_HELP_NAMES[key]}»؟" aria-expanded="false">؟</button>`;
}
const hifzBubble = document.getElementById("hifzBubble");
let hifzBubbleFor = null;
function hifzHideBubble() {
  if (!hifzBubbleFor) return;
  hifzBubbleFor.setAttribute("aria-expanded", "false");
  hifzBubbleFor = null;
  hifzBubble.style.display = "none";
}
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-help]");
  if (!btn) { if (!e.target.closest("#hifzBubble")) hifzHideBubble(); return; }
  e.preventDefault();
  if (hifzBubbleFor === btn) { hifzHideBubble(); return; }
  hifzHideBubble();
  hifzBubble.textContent = HIFZ_HELP[btn.dataset.help] || "";
  hifzBubble.style.display = "block";
  const r = btn.getBoundingClientRect();
  const w = Math.min(280, window.innerWidth - 24);
  hifzBubble.style.width = w + "px";
  const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
  hifzBubble.style.left = left + "px";
  const h = hifzBubble.offsetHeight;
  const top = r.bottom + 8 + h < window.innerHeight ? r.bottom + 8 : Math.max(8, r.top - h - 8);
  hifzBubble.style.top = top + "px";
  btn.setAttribute("aria-expanded", "true");
  btn.setAttribute("aria-describedby", "hifzBubble");
  hifzBubbleFor = btn;
});
window.addEventListener("scroll", hifzHideBubble, { passive: true });

// ============================================================
// shared: «سُجّلت صفحة ١٤ · تراجع» for 5 seconds
// ============================================================
const hifzUndoEl = document.getElementById("hifzUndo");
let hifzUndoTimer = null;
let hifzUndoFn = null;
function hifzUndoToast(text, undo) {
  clearTimeout(hifzUndoTimer);
  hifzUndoFn = undo;
  hifzUndoEl.innerHTML = `<span>${text}</span>${undo ? `<button type="button" class="hifz-undo-btn">تراجع</button>` : ""}`;
  hifzUndoEl.style.display = "flex";
  requestAnimationFrame(() => hifzUndoEl.classList.add("show"));
  hifzUndoTimer = setTimeout(hifzHideUndo, 5000);
}
function hifzHideUndo() {
  clearTimeout(hifzUndoTimer);
  hifzUndoFn = null;
  hifzUndoEl.classList.remove("show");
  setTimeout(() => { if (!hifzUndoEl.classList.contains("show")) hifzUndoEl.style.display = "none"; }, 250);
}
hifzUndoEl.addEventListener("click", (e) => {
  if (!e.target.closest(".hifz-undo-btn")) return;
  const fn = hifzUndoFn;
  hifzHideUndo();
  if (fn) fn();
});

// ============================================================
// shared: a question with 2–3 answers («حفظ / تجاهل / البقاء» …)
// ============================================================
const hifzAskEl = document.getElementById("hifzAsk");
let hifzAskResolve = null;
let hifzAskReturnFocus = null;
// buttons: [{ label, value, cls }] → Promise of the value (null = closed)
function hifzAsk(title, text, buttons) {
  if (hifzAskResolve) hifzAskResolve(null);
  hifzAskReturnFocus = document.activeElement;
  document.getElementById("hifzAskTitle").textContent = title;
  document.getElementById("hifzAskText").textContent = text;
  const box = document.getElementById("hifzAskBtns");
  box.innerHTML = buttons.map((b, i) => `<button type="button" class="btn ${b.cls || "ghost"}" data-ask="${i}">${b.label}</button>`).join("");
  hifzAskEl.style.display = "flex";
  setTimeout(() => { const f = box.querySelector("button"); if (f) f.focus(); }, 30);
  return new Promise((resolve) => {
    hifzAskResolve = (v) => {
      hifzAskResolve = null;
      hifzAskEl.style.display = "none";
      if (hifzAskReturnFocus && document.contains(hifzAskReturnFocus)) { try { hifzAskReturnFocus.focus(); } catch (e) { /* ignore */ } }
      resolve(v);
    };
    box.querySelectorAll("[data-ask]").forEach((btn) => btn.addEventListener("click", () => {
      if (hifzAskResolve) hifzAskResolve(buttons[Number(btn.dataset.ask)].value);
    }));
  });
}
document.getElementById("hifzAskClose").addEventListener("click", () => { if (hifzAskResolve) hifzAskResolve(null); });
hifzAskEl.addEventListener("click", (e) => { if (e.target === hifzAskEl && hifzAskResolve) hifzAskResolve(null); });

// ============================================================
// shared: one window for 📗 حفظي (a missed day, tests on other pages)
// ============================================================
const hifzModalEl = document.getElementById("hifzModal");
let hifzModalBeforeClose = null; // → Promise<boolean>: may it close?
let hifzModalReturnFocus = null;
function hifzOpenModal(title, html, beforeClose) {
  hifzModalReturnFocus = document.activeElement;
  document.getElementById("hifzModalTitle").textContent = title;
  document.getElementById("hifzModalBody").innerHTML = html;
  hifzModalBeforeClose = beforeClose || null;
  hifzModalEl.style.display = "flex";
  setTimeout(() => {
    const f = hifzModalEl.querySelector(".hifz-modal-focus, .modal-close");
    if (f) f.focus();
  }, 30);
}
function hifzCloseModal() {
  hifzModalEl.style.display = "none";
  hifzModalBeforeClose = null;
  if (hifzForm && hifzForm.where === "modal") hifzForm = null;
  if (hifzModalReturnFocus && document.contains(hifzModalReturnFocus)) { try { hifzModalReturnFocus.focus(); } catch (e) { /* ignore */ } }
}
async function hifzTryCloseModal() {
  if (hifzModalBeforeClose && !(await hifzModalBeforeClose())) return;
  hifzCloseModal();
}
document.getElementById("hifzModalClose").addEventListener("click", hifzTryCloseModal);
hifzModalEl.addEventListener("click", (e) => { if (e.target === hifzModalEl) hifzTryCloseModal(); });
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (hifzAskResolve) { hifzAskResolve(null); return; }
  if (hifzBubbleFor) { const b = hifzBubbleFor; hifzHideBubble(); b.focus(); return; }
  if (quranRecordMenuOpen()) { hifzCloseRecordMenu(true); return; }
  if (hifzModalEl.style.display !== "none") hifzTryCloseModal();
});

// ============================================================
// shared: forms on a temporary copy
// ============================================================
// hifzForm = { where: "panel" | "modal" | "setup", panel, isDirty(), save() → bool, discard() }
// Nothing reaches HifzStore before «حفظ»; leaving with changes asks.
let hifzForm = null;
function hifzDirty() { return !!(hifzForm && hifzForm.isDirty()); }
// → Promise<boolean>: true when it's fine to go on (saved, discarded or clean)
async function hifzConfirmLeave() {
  if (!hifzDirty()) return true;
  const v = await hifzAsk("لديك تغييرات لم تُحفظ", "لديك تغييرات لم تُحفظ — ماذا تريد أن تفعل بها؟", [
    { label: "حفظ", value: "save", cls: "primary" },
    { label: "تجاهل", value: "discard" },
    { label: "البقاء", value: "stay" },
  ]);
  if (v === "save") return !!(hifzForm && (await hifzForm.save()));
  if (v === "discard") { if (hifzForm) hifzForm.discard(); return true; }
  return false;
}
// auth-ui.js asks this before leaving the tab (the bottom bar, the phone's
// back button): true = go ahead; false = it asked and calls proceed() itself.
window.qfCanLeaveView = (proceed) => {
  if (!hifzDirty()) return true;
  hifzConfirmLeave().then((ok) => { if (ok) proceed(); });
  return false;
};
window.addEventListener("beforeunload", (e) => {
  if (!hifzDirty()) return;
  e.preventDefault();
  e.returnValue = "";
});
// error under a field: the field coloured + a short reason
function hifzFieldError(input, msg) {
  if (!input) return;
  const id = input.id + "-err";
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    el.className = "hifz-field-err";
    (input.closest(".hifz-field") || input.parentNode).appendChild(el);
  }
  // (not rewritten when unchanged: a button inside it — «اعتمد ٤٧» — must survive the click)
  if (el.dataset.msg !== (msg || "")) { el.innerHTML = msg || ""; el.dataset.msg = msg || ""; }
  el.style.display = msg ? "" : "none";
  input.classList.toggle("invalid", !!msg);
  if (msg) input.setAttribute("aria-describedby", id); else input.removeAttribute("aria-describedby");
  input.setAttribute("aria-invalid", msg ? "true" : "false");
}
function hifzIntIn(v, lo, hi) { const n = Number(v); return String(v).trim() !== "" && Number.isInteger(n) && n >= lo && n <= hi; }
// reads an <input type=number> written with Arabic or Latin digits
function hifzNum(el) {
  const s = String(el.value || "").replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).trim();
  return s === "" ? "" : Number(s);
}

// ============================================================
// the screen
// ============================================================
let hifzTab = "today";
let hifzWizard = null;      // the setup's state while it's shown
let hifzMoreShown = 0;      // how many of «راجع صفحات إضافية»'s pages are listed

function enterHifzView(changed) {
  if (changed) {
    // coming back: a form left open without changes is closed
    if (hifzForm && hifzForm.where === "panel" && !hifzForm.isDirty()) { hifzForm = null; hifzPageEdit = null; }
    let tab = null;
    try { tab = localStorage.getItem(HIFZ_OPEN_TAB_KEY); localStorage.removeItem(HIFZ_OPEN_TAB_KEY); } catch (e) { /* ignore */ }
    hifzTab = ["today", "plan", "progress"].includes(tab) ? tab : "today";
    hifzMoreShown = 0;
  }
  renderHifzView();
}

function hifzNeedsSetup() { return !HifzStore.isSetUp() || !!hifzWizard; }

function renderHifzView() {
  if (typeof HifzStore === "undefined") return;
  const setup = document.getElementById("hifzSetup");
  const main = document.getElementById("hifzMain");
  // set up meanwhile (e.g. on another device, synced) while the first-time
  // setup sat untouched → show the plan
  if (hifzWizard && !hifzWizard.reSetup && HifzStore.isSetUp() && !hifzDirty()) { hifzWizard = null; hifzForm = null; }
  if (hifzNeedsSetup()) {
    main.style.display = "none";
    setup.style.display = "";
    document.getElementById("hifzEditBar").style.display = "none";
    if (!hifzWizard) hifzWizardStart(false);
    else if (!setup.childElementCount) hifzRenderWizard();
    return;
  }
  setup.style.display = "none";
  setup.innerHTML = "";
  main.style.display = "";
  document.querySelectorAll("[data-hifz-tab]").forEach((b) => {
    const on = b.dataset.hifzTab === hifzTab;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
  });
  document.querySelectorAll("[data-hifz-panel]").forEach((p) => { p.style.display = p.dataset.hifzPanel === hifzTab ? "" : "none"; });
  // a form that's open keeps what's typed in it
  if (hifzForm && hifzForm.where === "panel" && hifzForm.panel === hifzTab) return;
  if (hifzTab === "today") renderHifzToday();
  else if (hifzTab === "plan") renderHifzPlan();
  else renderHifzProgress();
}
// kept for older callers (notify.js opened the old window by this name)
function renderQuranHifz() { renderHifzView(); }

async function hifzShowTab(tab) {
  if (tab === hifzTab) return;
  if (!(await hifzConfirmLeave())) return;
  hifzForm = null;
  hifzTab = tab;
  hifzSetEditBar(null);
  renderHifzView();
}
document.querySelectorAll("[data-hifz-tab]").forEach((b) => {
  b.addEventListener("click", () => hifzShowTab(b.dataset.hifzTab));
  b.addEventListener("keydown", (e) => {
    const order = ["today", "plan", "progress"];
    let i = order.indexOf(b.dataset.hifzTab);
    if (e.key === "ArrowLeft") i = (i + 1) % 3;        // RTL: left = next
    else if (e.key === "ArrowRight") i = (i + 2) % 3;
    else if (e.key === "Home") i = 0;
    else if (e.key === "End") i = 2;
    else return;
    e.preventDefault();
    hifzShowTab(order[i]).then(() => { const t = document.getElementById("hifzTab-" + hifzTab); if (t) t.focus(); });
  });
});

// ============================================================
// the first-time setup (4 steps, nothing saved before «حفظ الخطة»)
// ============================================================
// reSetup: «إعادة الإعداد من البداية» (keeps the pages and the history,
// changes only the plan). For data from the earlier version (no setupOn)
// it's filled in from what's there, and «احتفظ بإعداداتي» skips it.
function hifzWizardStart(reSetup) {
  const plan = HifzStore.getPlan();
  const pre = HifzStore.all();
  const hadData = pre.size > 0 || plan.weeklyGoal > 0 || !!plan.setupOn;
  const dir = plan.dir || "asc";
  const next = HifzStore.nextMemPage();
  const tp = pre.size ? HifzStore.todayPlan() : null;
  // where «القديم» had got to (before a setup: where the old queue was)
  const farHere = !plan.setupOn ? HifzStore.legacyFarStart() : tp && tp.far.length ? tp.far[0].page : null;
  hifzWizard = {
    step: 1,
    reSetup: !!reSetup,
    legacy: !plan.setupOn && hadData,
    pre,
    kind: pre.size ? "none" : null,            // "none" | "parts" | "range"
    juz: new Set(), surahs: new Set(),
    ranges: [{ from: "", to: "" }],
    // data from the earlier version already has real dates → «لا، سأبدأ الآن» keeps them as they are
    cycle: hadData ? (plan.weeklyGoal ? "start" : "review") : null, // "mid" | "start" | "review"
    dir,
    memNext: next ? next.page : (HifzStore.suggestNext(pre, dir === "desc" ? -1 : 1) || ""),
    memNextAuto: !plan.memNext,
    lastN: "", lastDays: "",
    weeklyGoal: plan.weeklyGoal || 7,
    nearDays: plan.nearDays >= 1 && plan.nearDays <= 30 ? plan.nearDays : 7,
    farMode: plan.farMode,
    farPages: plan.farPages,
    farDays: plan.farDays,
    farMid: hadData && farHere ? "yes" : "no",
    farPos: farHere || "",
    farCycle: plan.farCycle || 1,
    farPosNote: "",
    errors: {},
  };
  hifzWizard.initial = hifzWizardSnapshot();
  hifzForm = {
    where: "setup",
    isDirty: () => !!hifzWizard && hifzWizardSnapshot() !== hifzWizard.initial,
    save: () => hifzWizardSave(true),
    discard: () => { hifzWizard = null; hifzForm = null; },
  };
  hifzRenderWizard();
}
function hifzWizardSnapshot() {
  const w = hifzWizard;
  return JSON.stringify([w.kind, [...w.juz], [...w.surahs], w.ranges, w.cycle, w.dir, w.memNext, w.lastN, w.lastDays,
    w.weeklyGoal, w.nearDays, w.farMode, w.farPages, w.farDays, w.farMid, w.farPos, w.farCycle]);
}

// the pages chosen in step 1 (+ those already memorized)
function hifzWizardPages() {
  const w = hifzWizard;
  const set = new Set(w.pre);
  if (w.kind === "parts") {
    w.juz.forEach((j) => quranJuzPages(j).forEach((p) => set.add(p)));
    w.surahs.forEach((s) => hifzSurahPages(s).forEach((p) => set.add(p)));
  } else if (w.kind === "range") {
    w.ranges.forEach((r) => {
      if (!hifzIntIn(r.from, 1, 604) || !hifzIntIn(r.to, 1, 604)) return;
      const a = Math.min(r.from, r.to), b = Math.max(r.from, r.to);
      for (let p = a; p <= b; p++) set.add(p);
    });
  }
  return set;
}
function hifzWizardDirSign() { return hifzWizard.dir === "desc" ? -1 : 1; }
// the last N memorized pages before the next page (in the direction)
function hifzWizardLastPages(set) {
  const w = hifzWizard;
  const d = hifzWizardDirSign();
  const out = [];
  const n = Number(w.lastN);
  if (!hifzIntIn(w.memNext, 1, 604) || !(n >= 1)) return out;
  for (let p = Number(w.memNext) - d; p >= 1 && p <= 604 && out.length < n; p -= d) {
    if (set.has(p)) out.push(p);
    else if (out.length) break; // only the block just before the next page
  }
  return out; // nearest first
}

// → { message, field } for the first problem of a step, or null
function hifzWizardCheck(step) {
  const w = hifzWizard;
  const set = hifzWizardPages();
  if (step === 1) {
    if (!w.kind) return { field: null, message: "اختر واحدًا من الخيارات." };
    if (w.kind === "parts" && !w.juz.size && !w.surahs.size) return { field: null, message: "اختر جزءًا أو سورة واحدة على الأقل." };
    if (w.kind === "range") {
      for (let i = 0; i < w.ranges.length; i++) {
        const r = w.ranges[i];
        if (!hifzIntIn(r.from, 1, 604)) return { field: `hifzWzFrom${i}`, message: "رقم صفحة من ١ إلى ٦٠٤." };
        if (!hifzIntIn(r.to, 1, 604)) return { field: `hifzWzTo${i}`, message: "رقم صفحة من ١ إلى ٦٠٤." };
      }
    }
    return null;
  }
  if (step === 2) {
    if (!w.cycle) return { field: null, message: "اختر واحدًا من الخيارات." };
    if (w.cycle === "review") return set.size ? null : { field: null, message: "لا محفوظ عندك لتراجعه — ارجع إلى الخطوة الأولى وحدّد ما تحفظه، أو اختر أنك ستبدأ الحفظ الآن." };
    if (!hifzIntIn(w.memNext, 1, 604)) return { field: "hifzWzNext", message: "رقم صفحة من ١ إلى ٦٠٤." };
    if (set.has(Number(w.memNext))) {
      const near = HifzStore.nearestFree(Number(w.memNext), set, hifzWizardDirSign());
      return near
        ? { field: "hifzWzNext", message: `هذه الصفحة محفوظة — أقرب صفحة غير محفوظة: ${hifzAr(near)} <button type="button" class="btn small ghost" data-wz-use-next="${near}">اعتمد ${hifzAr(near)}</button>` }
        : { field: "hifzWzNext", message: "كل صفحات المصحف محفوظة." };
    }
    if (w.cycle === "mid") {
      if (!hifzIntIn(w.lastN, 1, 30)) return { field: "hifzWzLastN", message: "عدد من ١ إلى ٣٠ صفحة." };
      if (Number(w.lastN) > set.size) return { field: "hifzWzLastN", message: `لا يتجاوز محفوظك (${hifzPagesN(set.size)}).` };
      if (!hifzIntIn(w.lastDays, 1, 30)) return { field: "hifzWzLastDays", message: "عدد من ١ إلى ٣٠ يومًا." };
    }
    if (!hifzIntIn(w.weeklyGoal, 0, 70)) return { field: "hifzWzGoal", message: "من ٠ إلى ٧٠ صفحة في الأسبوع (٠ = مراجعة فقط)." };
    return null;
  }
  if (step === 3) {
    if (!hifzIntIn(w.nearDays, 1, 30)) return { field: "hifzWzNear", message: "عدد من ١ إلى ٣٠ يومًا." };
    if (set.size) {
      if (w.farMode === "pages" && !hifzIntIn(w.farPages, 1, set.size)) {
        return { field: "hifzWzFarPages", message: set.size < 100 && Number(w.farPages) > set.size ? `محفوظك ${hifzPagesN(set.size)} فقط.` : `من ١ إلى ${hifzAr(Math.min(set.size, 604))}.` };
      }
      if (w.farMode === "days" && !hifzIntIn(w.farDays, 1, 365)) return { field: "hifzWzFarDays", message: "من ١ إلى ٣٦٥ يومًا." };
      if (w.farMid === "yes") {
        if (!hifzIntIn(w.farPos, 1, 604)) return { field: "hifzWzFarPos", message: "رقم صفحة من محفوظك." };
        if (!set.has(Number(w.farPos))) return { field: "hifzWzFarPos", message: "اختر صفحة من محفوظك." };
        if (!hifzIntIn(w.farCycle, 1, 9999)) return { field: "hifzWzFarCycle", message: "رقم من ١ فأكثر." };
      }
    }
    return null;
  }
  return null;
}

// what «حفظ الخطة» writes
function hifzWizardData() {
  const w = hifzWizard;
  const set = hifzWizardPages();
  const old = [...set].filter((p) => !w.pre.has(p));
  const dated = {};
  if (w.cycle === "mid") {
    const last = hifzWizardLastPages(set); // nearest first
    const n = last.length, days = Number(w.lastDays);
    // the furthest page the longest ago, spread over those days (yesterday the latest)
    last.slice().reverse().forEach((p, i) => {
      const back = days - Math.floor((i * days) / Math.max(1, n));
      dated[p] = HifzStore.addDays(HifzStore.today(), -Math.max(1, back));
    });
  }
  const review = w.cycle === "review";
  const plan = {
    weeklyGoal: review ? 0 : Number(w.weeklyGoal),
    dir: w.dir,
    memNext: review ? null : Number(w.memNext),
    nearDays: Number(w.nearDays),
    farMode: w.farMode,
    farPages: Math.max(1, Math.min(100, Number(w.farPages) || 1)),
    farDays: Math.max(1, Math.min(365, Number(w.farDays) || 1)),
    farCursor: set.size && w.farMid === "yes" ? Number(w.farPos) : null,
    farCycle: set.size && w.farMid === "yes" ? Number(w.farCycle) || 1 : 1,
  };
  return { old, dated, plan };
}

function hifzWizardSave(fromLeave) {
  for (let s = 1; s <= 3; s++) {
    const err = hifzWizardCheck(s);
    if (err) {
      hifzWizard.step = s;
      hifzRenderWizard(err);
      if (fromLeave) hifzToast("⚠️ أكمل خطوات الإعداد أولًا.");
      return false;
    }
  }
  const data = hifzWizardData();
  hifzWizard = null;
  hifzForm = null;
  HifzStore.saveSetup(data);
  hifzTab = "today";
  renderHifzView();
  hifzToast("تم الحفظ ✓ — هذه مهمّتك لليوم.");
  return true;
}

function hifzWizardCancel() {
  const had = HifzStore.isSetUp();
  hifzWizard = null;
  hifzForm = null;
  if (had) { renderHifzView(); return; }
  hifzWizardStart(false); // nothing to go back to: the setup starts over, nothing changed
  hifzToast("أُلغي — لم يتغيّر شيء.");
}

function hifzRenderWizard(err) {
  const w = hifzWizard;
  const box = document.getElementById("hifzSetup");
  const set = hifzWizardPages();
  const radio = (name, value, label, checked, sub) =>
    `<label class="hifz-choice${checked ? " on" : ""}"><input type="radio" name="${name}" value="${value}"${checked ? " checked" : ""}><span><b>${label}</b>${sub ? `<small>${sub}</small>` : ""}</span></label>`;
  let body = "";
  let q = "";
  if (w.step === 1) {
    q = "ماذا تحفظ الآن؟";
    const preNote = w.pre.size
      ? `<div class="hifz-note"><span>📗 محفوظك المسجّل في التطبيق: <b>${hifzPagesWord(w.pre.size)}</b> — يبقى كما هو، وما تختاره هنا يُضاف إليه.</span></div>` : "";
    body = `${preNote}
      <div class="hifz-choices" role="radiogroup" aria-label="ماذا تحفظ الآن؟">
        ${radio("wzKind", "none", w.pre.size ? "لا أضيف شيئًا" : "لا شيء بعد", w.kind === "none", w.pre.size ? "" : "ستبدأ الحفظ من الصفر")}
        ${radio("wzKind", "parts", "أجزاء أو سور كاملة", w.kind === "parts")}
        ${radio("wzKind", "range", "من صفحة إلى صفحة", w.kind === "range")}
      </div>`;
    if (w.kind === "parts") {
      let juz = "";
      for (let j = 1; j <= 30; j++) {
        const full = quranJuzPages(j).every((p) => w.pre.has(p));
        const on = w.juz.has(j) || full;
        juz += `<button type="button" class="hifz-chip${on ? " on" : ""}" data-wz-juz="${j}" aria-pressed="${on}"${full ? " disabled title=\"محفوظ مسبقًا\"" : ""}>${hifzAr(j)}</button>`;
      }
      const surahs = (hifzSurahCatalog || []).slice().reverse().map((s) => {
        const on = w.surahs.has(s.number);
        return `<button type="button" class="hifz-chip wide${on ? " on" : ""}" data-wz-surah="${s.number}" aria-pressed="${on}">${hifzShortSurah(s.name)}</button>`;
      }).join("");
      body += `
        <div class="hifz-wz-sub">الأجزاء <small>(اضغط للتحديد)</small></div>
        <div class="hifz-chips juz">${juz}</div>
        <details class="hifz-wz-surahs"${w.surahs.size ? " open" : ""}>
          <summary>السور <small>(من الناس إلى الفاتحة)${w.surahs.size ? ` — اخترت ${hifzAr(w.surahs.size)}` : ""}</small></summary>
          <div class="hifz-chips">${surahs || "<div class='modal-hint'>جاري التحميل…</div>"}</div>
        </details>`;
    }
    if (w.kind === "range") {
      body += `<div class="hifz-ranges">${w.ranges.map((r, i) => `
        <div class="hifz-range-row">
          <span class="hifz-field"><label for="hifzWzFrom${i}">من صفحة</label><input id="hifzWzFrom${i}" type="number" inputmode="numeric" min="1" max="604" value="${r.from}" data-wz-range="${i}" data-end="from"></span>
          <span class="hifz-field"><label for="hifzWzTo${i}">إلى صفحة</label><input id="hifzWzTo${i}" type="number" inputmode="numeric" min="1" max="604" value="${r.to}" data-wz-range="${i}" data-end="to"></span>
          ${w.ranges.length > 1 ? `<button type="button" class="btn small ghost" data-wz-range-del="${i}" aria-label="احذف هذا المدى">✕</button>` : ""}
        </div>`).join("")}
        <button type="button" class="btn small ghost" data-wz-range-add>＋ مدى آخر</button>
      </div>`;
    }
    if (w.kind && w.kind !== "none") body += `<div class="hifz-wz-total" id="hifzWzTotal">المجموع: <b>${hifzPagesWord(set.size)}</b></div>`;
  } else if (w.step === 2) {
    q = "الحفظ الجديد — أين وصلت؟";
    body = `
      <div class="hifz-wz-sub">هل أنت في منتصف دورة حفظ؟</div>
      <div class="hifz-choices" role="radiogroup" aria-label="هل أنت في منتصف دورة حفظ؟">
        ${radio("wzCycle", "mid", "نعم", w.cycle === "mid", "حفظت صفحات في الأيام الماضية وأريد أن أكمل")}
        ${radio("wzCycle", "start", "لا، سأبدأ الآن", w.cycle === "start")}
        ${radio("wzCycle", "review", "أنا أراجع فقط", w.cycle === "review", "بلا حفظ جديد")}
      </div>`;
    if (w.cycle === "mid" || w.cycle === "start") {
      body += `
        <div class="hifz-wz-sub">الاتجاه</div>
        <div class="hifz-choices row" role="radiogroup" aria-label="اتجاه الحفظ">
          ${radio("wzDir", "asc", "من الفاتحة نزولًا", w.dir === "asc")}
          ${radio("wzDir", "desc", "من الناس صعودًا", w.dir === "desc")}
        </div>
        <div class="hifz-field">
          <label for="hifzWzNext">الصفحة التالية التي ستحفظها</label>
          <input id="hifzWzNext" type="number" inputmode="numeric" min="1" max="604" value="${w.memNext}">
          <small class="hifz-field-hint" id="hifzWzNextHint">${hifzIntIn(w.memNext, 1, 604) && !set.has(Number(w.memNext)) ? `${hifzSurahName(Number(w.memNext))}` : ""}</small>
        </div>`;
      if (w.cycle === "mid") {
        body += `
          <div class="hifz-wz-sub">ما آخر ما حفظت ومتى؟</div>
          <div class="hifz-inline">
            <span class="hifz-field"><label for="hifzWzLastN">آخر</label><input id="hifzWzLastN" type="number" inputmode="numeric" min="1" max="30" value="${w.lastN}"> <span>صفحة</span></span>
            <span class="hifz-field"><label for="hifzWzLastDays">خلال آخر</label><input id="hifzWzLastDays" type="number" inputmode="numeric" min="1" max="30" value="${w.lastDays}"> <span>يومًا</span></span>
          </div>
          <div class="modal-hint hifz-left" id="hifzWzLastHint">${hifzWizardLastHint(set)}</div>`;
      }
      body += `
        <div class="hifz-field">
          <label for="hifzWzGoal">الهدف الأسبوعي ${hifzHelpBtn("goal")}</label>
          <span><input id="hifzWzGoal" type="number" inputmode="numeric" min="0" max="70" value="${w.weeklyGoal}"> صفحة في الأسبوع</span>
        </div>`;
    }
  } else if (w.step === 3) {
    q = "المراجعة — أين وصلت؟";
    body = `
      <div class="hifz-field">
        <label for="hifzWzNear">راجع آخر ما حفظته لمدة ${hifzHelpBtn("near")}</label>
        <span><input id="hifzWzNear" type="number" inputmode="numeric" min="1" max="30" value="${w.nearDays}"> يوم <small>(كل صفحة جديدة تُراجَع يوميًّا هذه المدة)</small></span>
      </div>`;
    if (set.size) {
      body += `
        <div class="hifz-wz-sub">مراجعة القديم ${hifzHelpBtn("far")}</div>
        <div class="hifz-choices" role="radiogroup" aria-label="مراجعة القديم">
          <label class="hifz-choice${w.farMode === "pages" ? " on" : ""}"><input type="radio" name="wzFarMode" value="pages"${w.farMode === "pages" ? " checked" : ""}><span><b>عدد صفحات في اليوم</b></span></label>
          <span class="hifz-field indent"${w.farMode === "pages" ? "" : " hidden"}><label for="hifzWzFarPages" class="sr-only">صفحات القديم يوميًّا</label><input id="hifzWzFarPages" type="number" inputmode="numeric" min="1" max="${set.size}" value="${w.farPages}"> صفحة يوميًّا</span>
          <label class="hifz-choice${w.farMode === "days" ? " on" : ""}"><input type="radio" name="wzFarMode" value="days"${w.farMode === "days" ? " checked" : ""}><span><b>أختم المحفوظ في عدد أيام</b></span></label>
          <span class="hifz-field indent"${w.farMode === "days" ? "" : " hidden"}><label for="hifzWzFarDays" class="sr-only">أيام الختمة</label><input id="hifzWzFarDays" type="number" inputmode="numeric" min="1" max="365" value="${w.farDays}"> يومًا</span>
        </div>
        <div class="hifz-calc" id="hifzWzCalc" aria-live="polite">${hifzFarCalc(w.farMode, w.farPages, w.farDays, hifzWizardFarCount())}</div>
        <div class="hifz-wz-sub">هل أنت في منتصف دورة مراجعة؟</div>
        <div class="hifz-choices row" role="radiogroup" aria-label="هل أنت في منتصف دورة مراجعة؟">
          ${radio("wzFarMid", "yes", "نعم", w.farMid === "yes")}
          ${radio("wzFarMid", "no", "لا", w.farMid === "no", `تبدأ من أول المحفوظ ${w.dir === "desc" ? "(من الناس)" : "(من الفاتحة)"}`)}
        </div>`;
      if (w.farMid === "yes") {
        body += `
          <div class="hifz-field">
            <label for="hifzWzFarPos">من أي صفحة تكمل؟</label>
            <input id="hifzWzFarPos" type="number" inputmode="numeric" min="1" max="604" value="${w.farPos}">
            <small class="hifz-field-hint" id="hifzWzFarPosNote">${w.farPosNote}</small>
          </div>
          <details class="hifz-wz-opt"${Number(w.farCycle) > 1 ? " open" : ""}>
            <summary>رقم الختمة <small>(اختياري)</small></summary>
            <div class="hifz-field"><label for="hifzWzFarCycle">هذه الختمة رقم ${hifzHelpBtn("khatma")}</label><input id="hifzWzFarCycle" type="number" inputmode="numeric" min="1" value="${w.farCycle}"></div>
          </details>`;
      }
    } else {
      body += `<div class="modal-hint hifz-left">لا محفوظ قديم بعد — تبدأ مراجعة القديم حين تحفظ.</div>`;
    }
  } else {
    q = "الملخص";
    body = `<div class="hifz-summary-box">${hifzWizardSummary()}</div>`;
  }
  const errHtml = err && !err.field ? `<div class="hifz-step-err" role="alert">${err.message}</div>` : "";
  box.innerHTML = `
    <div class="hifz-wz-top">
      <div class="hifz-wz-step" aria-live="polite">الخطوة ${hifzAr(w.step)} من ٤</div>
      <div class="hifz-wz-dots" aria-hidden="true">${[1, 2, 3, 4].map((s) => `<i class="${s <= w.step ? "on" : ""}"></i>`).join("")}</div>
    </div>
    ${w.step === 1 && !w.reSetup ? `<div class="hifz-wz-intro">${w.legacy ? "📗 حفظي صار أبسط: أجب عن ٤ أسئلة لتُضبط خطتك (ما عندك مملوء مسبقًا)." : "أهلًا! أربعة أسئلة قصيرة، ثم تعرف كل يوم ما المطلوب منك."}</div>` : ""}
    ${w.reSetup && w.step === 1 ? `<div class="hifz-wz-intro">إعادة الإعداد تغيّر الخطة فقط — محفوظك وسجلّ مراجعاتك يبقيان.</div>` : ""}
    <h2 class="hifz-wz-q" tabindex="-1" id="hifzWzQ">${q}</h2>
    <form class="hifz-wz-body" id="hifzWzForm" novalidate>${body}${errHtml}</form>
    <div class="hifz-wz-nav">
      ${w.step === 4
        ? `<button type="button" class="btn primary" data-wz-save>حفظ الخطة</button><button type="button" class="btn ghost" data-wz-cancel>إلغاء</button><button type="button" class="btn ghost" data-wz-back>رجوع</button>`
        : `<button type="button" class="btn primary" data-wz-next>التالي</button>${w.step > 1 ? `<button type="button" class="btn ghost" data-wz-back>رجوع</button>` : ""}`}
    </div>
    ${w.step < 4 && (w.reSetup || HifzStore.isSetUp()) ? `<button type="button" class="hifz-link" data-wz-cancel>إلغاء — بلا أي تغيير</button>` : ""}
    ${w.step === 1 && w.legacy && !w.reSetup ? `<button type="button" class="hifz-link" data-wz-keep>احتفظ بإعداداتي</button>` : ""}`;
  if (err && err.field) {
    const f = document.getElementById(err.field);
    hifzFieldError(f, err.message);
    if (f) f.focus();
  } else if (err) {
    const a = box.querySelector(".hifz-step-err");
    if (a) a.scrollIntoView({ block: "nearest" });
  }
  if (w.step === 1 && w.kind === "parts" && !hifzSurahEnd) hifzLoadSurahEnds().then(() => { if (hifzWizard && hifzWizard.step === 1) hifzWizardUpdateTotal(); }).catch(() => {});
}
// how many pages «القديم» will have (all memorized minus «آخر ما حفظت»)
function hifzWizardFarCount() {
  try { return HifzStore.preview(hifzWizardData()).review.farCount; } catch (e) { return hifzWizardPages().size; }
}
function hifzWizardUpdateTotal() {
  const el = document.getElementById("hifzWzTotal");
  if (el) el.innerHTML = `المجموع: <b>${hifzPagesWord(hifzWizardPages().size)}</b>`;
}
function hifzWizardLastHint(set) {
  const last = hifzWizardLastPages(set);
  if (!last.length) return "هذه الصفحات تُسجَّل بتواريخ تقريبية، فتدخل مراجعة «آخر ما حفظت» فورًا.";
  return `= ${hifzPagesLabel(last)} — تُسجَّل بتواريخ تقريبية موزّعة على تلك الأيام، فتدخل مراجعة «آخر ما حفظت» فورًا.`;
}
// «= ٤ صفحات يوميًّا، ختمة كل ٣٠ يومًا»
function hifzFarCalc(mode, farPages, farDays, total) {
  if (!total) return "";
  if (mode === "pages") {
    if (!hifzIntIn(farPages, 1, total)) return "";
    const per = Number(farPages);
    return `= ${hifzPagesN(per)} يوميًّا، ختمة كل ${hifzDaysN(Math.ceil(total / per))} تقريبًا`;
  }
  if (!hifzIntIn(farDays, 1, 365)) return "";
  const per = Math.ceil(total / Number(farDays));
  return `= ${hifzPagesN(per)} يوميًّا، ختمة كل ${hifzDaysN(Math.ceil(total / per))}`;
}
function hifzWizardSummary() {
  const w = hifzWizard;
  const data = hifzWizardData();
  const pv = HifzStore.preview(data);
  const set = hifzWizardPages();
  const lines = [];
  const near = pv.review.near.length, far = pv.review.far.map((x) => x.page);
  let today = "";
  if (pv.mem.active) today = `تحفظ ${hifzPagesLabel(pv.mem.pages)}`;
  const rev = [];
  if (near) rev.push(`${hifzAr(near)} من آخر ما حفظت`);
  if (far.length) rev.push(`${hifzAr(far.length)} من القديم (${hifzPagesLabel(far)})`);
  if (rev.length) today += `${today ? "، و" : ""}تراجع ${rev.join(" + ")}`;
  lines.push(`<li><b>اليوم:</b> ${today || "لا شيء مطلوب بعد — سجّل محفوظك أولًا."}</li>`);
  if (w.cycle === "review") lines.push(`<li><b>الحفظ:</b> مراجعة فقط، بلا حفظ جديد.</li>`);
  else {
    const wk = pv.mem.week;
    lines.push(`<li><b>الحفظ:</b> ${hifzPagesWord(Number(w.weeklyGoal))} في الأسبوع ${hifzDirWord(w.dir)}${wk && wk.partial ? ` — هذا الأسبوع ${hifzPagesWord(wk.goal)} فقط لأنه بدأ متأخرًا` : ""}.</li>`);
  }
  lines.push(`<li><b>آخر ما حفظت:</b> كل صفحة جديدة تُراجَع ${hifzDaysWord(Number(w.nearDays))} بعد حفظها.</li>`);
  if (set.size) {
    lines.push(`<li><b>القديم:</b> ${hifzFarCalc(w.farMode, w.farPages, w.farDays, pv.review.farCount).replace(/^= /, "") || "لا شيء بعد"}${w.farMid === "yes" ? ` — تكمل من صفحة ${hifzAr(Number(w.farPos))}، الختمة ${hifzAr(Number(w.farCycle) || 1)}` : ""}.</li>`);
  }
  lines.push(`<li><b>المحفوظ:</b> ${hifzPagesWord(set.size)}${data.old.length && w.pre.size ? ` (منها ${hifzPagesWord(data.old.length)} تُضاف الآن)` : ""}.</li>`);
  return `<ul class="hifz-summary-list">${lines.join("")}</ul>`;
}

// ---- the setup's events ----
const hifzSetupEl = document.getElementById("hifzSetup");
hifzSetupEl.addEventListener("change", (e) => {
  const w = hifzWizard;
  if (!w) return;
  const t = e.target;
  if (t.name === "wzKind") { w.kind = t.value; hifzRenderWizard(); return; }
  if (t.name === "wzCycle") { w.cycle = t.value; hifzRenderWizard(); return; }
  if (t.name === "wzDir") {
    w.dir = t.value;
    if (w.memNextAuto) w.memNext = HifzStore.suggestNext(hifzWizardPages(), w.dir === "desc" ? -1 : 1) || "";
    hifzRenderWizard();
    return;
  }
  if (t.name === "wzFarMode") { w.farMode = t.value; hifzRenderWizard(); return; }
  if (t.name === "wzFarMid") {
    w.farMid = t.value;
    if (w.farMid === "yes" && !w.farPos) {
      const set = [...hifzWizardPages()].sort((a, b) => a - b);
      w.farPos = (w.dir === "desc" ? set[set.length - 1] : set[0]) || "";
    }
    hifzRenderWizard();
    return;
  }
  if (t.id === "hifzWzFarPos") {
    // not memorized → the nearest memorized page, with a note
    const set = [...hifzWizardPages()];
    const v = hifzNum(t);
    if (hifzIntIn(v, 1, 604) && set.length && !set.includes(v)) {
      const near = HifzStore.nearestIn(v, set);
      w.farPos = near;
      t.value = near;
      w.farPosNote = `صفحة ${hifzAr(v)} ليست من محفوظك — نُقلت إلى أقرب صفحة محفوظة: ${hifzAr(near)}.`;
      document.getElementById("hifzWzFarPosNote").textContent = w.farPosNote;
      hifzFieldError(t, "");
    }
  }
});
hifzSetupEl.addEventListener("input", (e) => {
  const w = hifzWizard;
  if (!w) return;
  const t = e.target;
  const v = t.type === "number" ? hifzNum(t) : t.value;
  hifzFieldError(t, "");
  if (t.dataset.wzRange !== undefined) { w.ranges[Number(t.dataset.wzRange)][t.dataset.end] = v; hifzWizardUpdateTotal(); return; }
  const map = { hifzWzNext: "memNext", hifzWzLastN: "lastN", hifzWzLastDays: "lastDays", hifzWzGoal: "weeklyGoal", hifzWzNear: "nearDays",
    hifzWzFarPages: "farPages", hifzWzFarDays: "farDays", hifzWzFarPos: "farPos", hifzWzFarCycle: "farCycle" };
  const key = map[t.id];
  if (!key) return;
  w[key] = v;
  if (key === "memNext") {
    w.memNextAuto = false;
    const hint = document.getElementById("hifzWzNextHint");
    const set = hifzWizardPages();
    if (hint) hint.textContent = hifzIntIn(v, 1, 604) && !set.has(v) ? hifzSurahName(v) : "";
  }
  if (key === "farPos") { w.farPosNote = ""; const n = document.getElementById("hifzWzFarPosNote"); if (n) n.textContent = ""; }
  if (["memNext", "lastN", "lastDays"].includes(key)) {
    const h = document.getElementById("hifzWzLastHint");
    if (h) h.textContent = hifzWizardLastHint(hifzWizardPages());
  }
  if (["farPages", "farDays", "nearDays"].includes(key)) {
    const c = document.getElementById("hifzWzCalc");
    if (c) c.textContent = hifzFarCalc(w.farMode, w.farPages, w.farDays, hifzWizardFarCount());
  }
});
hifzSetupEl.addEventListener("submit", (e) => { e.preventDefault(); hifzWizardNext(); });
function hifzWizardNext() {
  const w = hifzWizard;
  const err = hifzWizardCheck(w.step);
  if (err) { hifzRenderWizard(err); return; }
  if (w.step === 2 && w.cycle === "review") w.memNextAuto = true;
  w.step = Math.min(4, w.step + 1);
  hifzRenderWizard();
  const qEl = document.getElementById("hifzWzQ");
  if (qEl) qEl.focus();
}
hifzSetupEl.addEventListener("click", (e) => {
  const w = hifzWizard;
  if (!w) return;
  if (e.target.closest("[data-wz-next]")) { hifzWizardNext(); return; }
  if (e.target.closest("[data-wz-back]")) { w.step = Math.max(1, w.step - 1); hifzRenderWizard(); const q = document.getElementById("hifzWzQ"); if (q) q.focus(); return; }
  if (e.target.closest("[data-wz-save]")) { hifzWizardSave(false); return; }
  if (e.target.closest("[data-wz-cancel]")) { hifzWizardCancel(); return; }
  if (e.target.closest("[data-wz-keep]")) {
    hifzWizard = null;
    hifzForm = null;
    HifzStore.keepSettings(HifzStore.legacyFarStart());
    hifzTab = "today";
    renderHifzView();
    hifzToast("تم الحفظ ✓ — بقيت إعداداتك كما هي.");
    return;
  }
  const use = e.target.closest("[data-wz-use-next]");
  if (use) {
    w.memNext = Number(use.dataset.wzUseNext);
    w.memNextAuto = false;
    hifzRenderWizard();
    return;
  }
  const juz = e.target.closest("[data-wz-juz]");
  if (juz) {
    const j = Number(juz.dataset.wzJuz);
    if (w.juz.has(j)) w.juz.delete(j); else w.juz.add(j);
    juz.classList.toggle("on", w.juz.has(j));
    juz.setAttribute("aria-pressed", String(w.juz.has(j)));
    hifzWizardUpdateTotal();
    const s = hifzSetupEl.querySelector(".hifz-step-err"); if (s) s.remove();
    return;
  }
  const sur = e.target.closest("[data-wz-surah]");
  if (sur) {
    const n = Number(sur.dataset.wzSurah);
    if (w.surahs.has(n)) w.surahs.delete(n); else w.surahs.add(n);
    sur.classList.toggle("on", w.surahs.has(n));
    sur.setAttribute("aria-pressed", String(w.surahs.has(n)));
    hifzLoadSurahEnds().then(hifzWizardUpdateTotal).catch(() => {});
    const s = hifzSetupEl.querySelector(".hifz-step-err"); if (s) s.remove();
    return;
  }
  if (e.target.closest("[data-wz-range-add]")) { w.ranges.push({ from: "", to: "" }); hifzRenderWizard(); return; }
  const del = e.target.closest("[data-wz-range-del]");
  if (del) { w.ranges.splice(Number(del.dataset.wzRangeDel), 1); hifzRenderWizard(); }
});
// a radio card reflects its state
hifzSetupEl.addEventListener("change", (e) => {
  if (e.target.type !== "radio") return;
  hifzSetupEl.querySelectorAll(`input[name="${e.target.name}"]`).forEach((r) => r.closest(".hifz-choice").classList.toggle("on", r.checked));
});

// ============================================================
// ☀️ اليوم
// ============================================================
function hifzDots(done, total) {
  if (!total) return "";
  if (total > 14) {
    const pct = Math.round((done / total) * 100);
    return `<span class="hifz-bar"><i style="width:${pct}%"></i></span>`;
  }
  let s = "";
  for (let i = 0; i < total; i++) s += `<i class="${i < done ? "on" : ""}"></i>`;
  return `<span class="hifz-dots" aria-hidden="true">${s}</span>`;
}

function renderHifzToday() {
  const panel = document.getElementById("hifzPanel-today");
  const tasks = HifzStore.todayTasks();
  const { mem, review, step } = tasks;
  const hasPages = HifzStore.count() > 0;

  // ---- line 1: memorization ----
  let memLine;
  if (mem.active) {
    memLine = mem.done
      ? `<div class="hifz-tline done"><span class="hifz-tk">✅ حفظت اليوم</span> ${hifzPagesWord(mem.doneToday)}</div>`
      : `<div class="hifz-tline"><span class="hifz-tk">احفظ:</span> <b>${hifzPagesLabel(mem.pages)}</b>${hifzSurahName(mem.page) ? ` <small>${hifzSurahName(mem.page)}</small>` : ""}</div>`;
    if (mem.wrapped) memLine += `<div class="hifz-tnote">وصلت إلى آخر المصحف في اتجاهك — نكمل من الجهة الأخرى.</div>`;
  } else if (mem.reason === "complete") {
    let first = false;
    try { first = !localStorage.getItem(HIFZ_ALL_DONE_KEY); localStorage.setItem(HIFZ_ALL_DONE_KEY, "1"); } catch (e) { /* ignore */ }
    memLine = `<div class="hifz-tline">لا حفظ جديد — المصحف كله محفوظ</div>${first ? `<div class="hifz-tnote ok">🎉 حفظت القرآن كاملًا — بارك الله فيك وجعله حجّة لك!</div>` : ""}`;
  } else {
    memLine = `<div class="hifz-tline muted">لا حفظ جديد اليوم${mem.reason === "goalMet" ? " — أتممت هدف الأسبوع ✅" : ""}</div>`;
  }

  // ---- line 2: review ----
  let revLine = "";
  if (hasPages) {
    revLine = review.dueCount
      ? `<div class="hifz-tline${review.doneCount >= review.dueCount ? " done" : ""}"><span class="hifz-tk">${review.doneCount >= review.dueCount ? "✅ راجعت:" : "راجع:"}</span> <b>${hifzPagesWord(review.dueCount)}</b>
           <span class="hifz-tprog" role="img" aria-label="${hifzAr(review.doneCount)} من ${hifzAr(review.dueCount)}">${hifzDots(review.doneCount, review.dueCount)} <small>${hifzAr(review.doneCount)} من ${hifzAr(review.dueCount)}</small></span></div>`
      : `<div class="hifz-tline muted">لا مراجعة مطلوبة اليوم</div>`;
  }
  if (review.cycleDone) revLine += `<div class="hifz-tnote ok">🎉 أتممت الختمة ${hifzAr(review.cycle)} — تبدأ الختمة ${hifzAr(review.cycle + 1)} غدًا من أول المحفوظ.</div>`;

  // ---- the button ----
  let btn;
  if (step.kind === "mem") btn = `<button type="button" class="btn primary hifz-go" data-go="mem">ابدأ حفظ صفحة ${hifzAr(step.page)}</button>`;
  else if (step.kind === "review") btn = `<button type="button" class="btn primary hifz-go" data-go="review">راجع صفحة ${hifzAr(step.page)}</button>`;
  else if (step.kind === "test") btn = `<button type="button" class="btn primary hifz-go" data-go="test">اختبر نفسك</button>`;
  else btn = `<button type="button" class="btn hifz-go done" data-go="done" aria-disabled="true">✓ أنجزت اليوم</button>`;

  const empty = !hasPages && !mem.active
    ? `<div class="hifz-empty">لم تسجّل أي صفحة بعد — <button type="button" class="hifz-link" data-resetup>ابدأ الإعداد</button></div>` : "";
  const moreLink = hasPages && (review.more.length || review.extra.length)
    ? `<button type="button" class="hifz-link" data-more>راجع صفحات إضافية</button>` : "";

  // ---- «فاتك يوم» ----
  const missed = HifzStore.missedDays();
  let missedLine = "";
  if (missed.length) {
    const d = missed[missed.length - 1];
    const text = missed.length === 1
      ? `فاتك يوم ${HifzStore.daysBetween(d, HifzStore.today()) <= 6 ? hifzDayName(d) : hifzFmtDay(d)} — سجّل مراجعته`
      : `فاتك ${hifzDaysWord(missed.length)} — سجّل مراجعتها`;
    missedLine = `<button type="button" class="hifz-missed" data-missed>📅 ${text} ◀</button>`;
  }

  panel.innerHTML = `
    <div class="hifz-today-card">
      <div class="hifz-today-date">${hifzFmtDay(HifzStore.today())}</div>
      ${empty || memLine}
      ${revLine}
      ${btn}
      ${moreLink}
    </div>
    ${missedLine}
    ${hasPages ? hifzReviewSection(review) : ""}
    ${hasPages || tasks.test ? hifzTestSection(tasks) : ""}`;
}

// ---- مراجعة اليوم ----
function hifzRow(page, done, kind, opts) {
  const surah = hifzSurahName(page);
  const label = { near: "آخر ما حفظت", far: "القديم", extra: "إضافية" }[kind] || kind;
  return `
    <div class="hifz-rev-row${done ? " done" : ""}">
      <button type="button" class="hifz-rev-check" role="checkbox" aria-checked="${done}" data-rev-page="${page}" aria-label="صفحة ${hifzAr(page)}${surah ? "، " + surah : ""} — ${done ? "روجعت" : "علّمها مراجَعة"}">${done ? "✓" : ""}</button>
      <button type="button" class="hifz-rev-open" data-open-page="${page}"${opts && opts.session ? " data-session" : ""}>
        <b>صفحة ${hifzAr(page)}</b>${surah ? ` <span>${surah}</span>` : ""}
        <small class="k-${kind}">${label}</small>
      </button>
    </div>`;
}
function hifzReviewSection(rv) {
  const complete = rv.dueCount > 0 && rv.doneCount >= rv.dueCount;
  const autoKey = `${HifzStore.today()}-${complete ? "done" : "open"}`;
  const sum = !rv.dueCount ? (rv.extra.length ? `+${hifzAr(rv.extra.length)} إضافية` : "لا شيء مطلوب")
    : complete ? `✅ راجعت ${hifzPagesWord(rv.doneCount + rv.extra.length)} اليوم`
    : `${hifzAr(rv.doneCount)} من ${hifzAr(rv.dueCount)}`;
  let body = "";
  if (rv.near.length) body += `<div class="hifz-rev-sub">آخر ما حفظت ${hifzHelpBtn("near")}</div>${rv.near.map((x) => hifzRow(x.page, x.done, "near", { session: true })).join("")}`;
  if (rv.far.length) body += `<div class="hifz-rev-sub">القديم <small>الختمة ${hifzAr(rv.cycle)}</small> ${hifzHelpBtn("far")}</div>${rv.far.map((x) => hifzRow(x.page, x.done, "far", { session: true })).join("")}`;
  if (rv.extra.length) body += `<div class="hifz-rev-sub">إضافية <small>تدخل في الاختبار</small></div>${rv.extra.map((x) => hifzRow(x.page, true, "extra")).join("")}`;
  if (!rv.dueCount && !rv.extra.length) body += `<div class="modal-hint hifz-left">لا مراجعة مطلوبة اليوم.</div>`;
  if (rv.more.length) {
    body += `<div class="hifz-more" id="hifzMore">`;
    if (hifzMoreShown) {
      body += `<div class="hifz-rev-sub">صفحات إضافية <small>التالية في الختمة — علّم ما راجعته</small></div>
        ${rv.more.slice(0, hifzMoreShown).map((p) => hifzRow(p, false, "extra")).join("")}
        ${rv.more.length > hifzMoreShown ? `<button type="button" class="btn small ghost" data-more-more>المزيد (${hifzAr(rv.more.length - hifzMoreShown)})</button>` : ""}`;
    } else {
      body += `<button type="button" class="hifz-link" data-more>راجع صفحات إضافية</button>`;
    }
    body += `</div>`;
  }
  return hifzSec({ id: "today-review", icon: "🔁", title: "مراجعة اليوم", sum, body, open: !complete || hifzMoreShown > 0, autoKey, cls: "hifz-sec-review" });
}

// ---- اختبر نفسك ----
function hifzQuizOpts() {
  let o = null;
  try { o = JSON.parse(localStorage.getItem(HIFZ_QUIZ_OPTS_KEY) || "null"); } catch (e) { o = null; }
  const totals = typeof TYPE_MIX_TOTALS !== "undefined" ? TYPE_MIX_TOTALS : [9, 12, 15, 18, 21, 24, 27, 30];
  return {
    total: o && totals.includes(Number(o.total)) ? Number(o.total) : 15,
    excluded: o && Array.isArray(o.excluded) ? o.excluded.filter((t) => typeof CHALLENGE_TYPES === "undefined" || CHALLENGE_TYPES.includes(t)).slice(0, 3) : [],
  };
}
function hifzSaveQuizOpts(o) { try { localStorage.setItem(HIFZ_QUIZ_OPTS_KEY, JSON.stringify(o)); } catch (e) { /* ignore */ } }
function hifzTestResultText(t) {
  if (!t) return "";
  if (t === "skip") return "ليس اليوم";
  return `${hifzAr(t.s)}/${hifzAr(t.n)}`;
}
// the pages «اختبر نفسك» offers first: today's review, else the last day
// with one → { pages, name, label }
function hifzTestDefault() {
  const t = HifzStore.today();
  const today = HifzStore.reviewedOn(t);
  if (today.length) return { pages: today, name: "ما راجعته اليوم", label: `الصفحات التي راجعتها اليوم (${hifzPagesWord(today.length)})`, today: true };
  const last = HifzStore.lastReviewDay();
  if (last) {
    const pages = HifzStore.reviewedOn(last);
    if (pages.length) return { pages, name: `ما راجعته ${hifzDayWord(last)}`, label: `آخر يوم راجعت فيه — ${hifzDayWord(last)} (${hifzPagesWord(pages.length)})`, today: false };
  }
  return { pages: [], name: "", label: "", today: false };
}
function hifzOptionsHtml() {
  const o = hifzQuizOpts();
  const totals = typeof TYPE_MIX_TOTALS !== "undefined" ? TYPE_MIX_TOTALS : [9, 12, 15, 18, 21, 24, 27, 30];
  const types = typeof CHALLENGE_TYPES !== "undefined" ? CHALLENGE_TYPES : [];
  const full = o.excluded.length >= 3;
  return `
    <div class="hifz-field"><label for="hifzQuizTotal">عدد أسئلة التحدّي</label>
      <select id="hifzQuizTotal">${totals.map((n) => `<option value="${n}"${n === o.total ? " selected" : ""}>${hifzAr(n)} سؤالًا</option>`).join("")}</select></div>
    <div class="hifz-wz-sub">أنواع لا أريدها <small>(حتى ٣ — اختياري)</small></div>
    <div class="hifz-chips">${types.map((t) => {
      const on = o.excluded.includes(t);
      return `<button type="button" class="hifz-chip wide${on ? " excl" : ""}" data-excl="${t}" aria-pressed="${on}"${full && !on ? ` aria-disabled="true"` : ""}>${on ? "🚫 " : ""}${getTypeLabel(t)}</button>`;
    }).join("")}</div>
    <div class="modal-hint hifz-left">الأسئلة «🎲 عشوائي» من الأنواع المناسبة لهذه الصفحات${o.excluded.length ? "، غير المستبعَدة" : ""}.</div>`;
}
function hifzTestSection(tasks) {
  const rv = tasks.review;
  const complete = rv.dueCount > 0 && rv.doneCount >= rv.dueCount;
  const test = tasks.test;
  const def = hifzTestDefault();
  const autoKey = `${HifzStore.today()}-${test ? "done" : complete ? "ready" : "wait"}`;
  const sum = test ? (test === "skip" ? "ليس اليوم" : `✅ اختبرت نفسك اليوم — ${hifzTestResultText(test)}`) : "اختياري";
  let body = "";
  if (test && test !== "skip") body += `<div class="hifz-tline done">✅ اختبرت نفسك اليوم — ${hifzTestResultText(test)}</div>`;
  if (def.pages.length) {
    body += `<div class="hifz-test-q">اختبر نفسك على ${def.today ? `الصفحات التي راجعتها اليوم (${hifzPagesWord(def.pages.length)})` : def.label}</div>
      <div class="hifz-test-btns">
        <button type="button" class="hifz-test-btn" data-test="practice"><b>📝 تدريب</b><small>بلا وقت</small></button>
        <button type="button" class="hifz-test-btn" data-test="challenge"><b>⏱️ تحدٍّ</b><small>وقت وعلامة</small></button>
        ${!test && tasks.testNeeded ? `<button type="button" class="hifz-test-btn ghost" data-test="skip"><b>ليس اليوم</b><small>تُعدّ إنجازًا للخطوة</small></button>` : ""}
      </div>`;
  } else {
    body += `<div class="modal-hint hifz-left">راجع صفحات اليوم أولًا، ثم اختبر نفسك عليها — أو اختر صفحات أخرى.</div>`;
  }
  body += `<button type="button" class="hifz-link" data-test-other>اختبار على صفحات أخرى</button>`;
  body += hifzSec({ id: "quiz-options", icon: "⚙️", title: "خيارات", sum: (() => { const o = hifzQuizOpts(); return `${hifzAr(o.total)} سؤالًا${o.excluded.length ? ` · ${hifzAr(o.excluded.length)} مستبعَدة` : ""}`; })(), body: hifzOptionsHtml(), open: false, cls: "hifz-sec-inner" });
  return hifzSec({ id: "today-test", icon: "🎯", title: "اختبر نفسك", sum, body, open: !test && complete, autoKey, cls: "hifz-sec-test" });
}

async function hifzStartTest(kind, pages, name) {
  if (!pages || !pages.length) return;
  const o = hifzQuizOpts();
  const opts = { track: true, total: o.total, excluded: o.excluded };
  hifzCloseModal();
  if (kind === "practice") {
    await startHifzQuiz(pages, name, opts);
    hifzToast(`📝 تدريب على «${name}» (${hifzPagesWord(pages.length)}) — أنواع الأسئلة 🎲 عشوائية؛ اضغط «سؤال جديد».`);
  } else {
    await openSelfChallengeOnPages(pages, name, opts);
  }
}

const hifzTodayPanel = document.getElementById("hifzPanel-today");
hifzTodayPanel.addEventListener("click", (e) => {
  const go = e.target.closest("[data-go]");
  if (go) { hifzContinue(go.dataset.go); return; }
  if (e.target.closest("[data-resetup]")) { hifzWizardStart(true); renderHifzView(); return; }
  if (e.target.closest("[data-more]")) {
    hifzMoreShown = 10;
    hifzSecAuto["today-review"] = null;
    renderHifzToday();
    const sec = hifzTodayPanel.querySelector('[data-sec="today-review"]');
    if (sec) hifzSetSecOpen(sec, true);
    const m = document.getElementById("hifzMore");
    if (m) m.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (e.target.closest("[data-more-more]")) { hifzMoreShown += 10; renderHifzToday(); return; }
  if (e.target.closest("[data-missed]")) { hifzOpenDayModal(null); return; }
  const check = e.target.closest("[data-rev-page]");
  if (check) { hifzToggleReview(Number(check.dataset.revPage)); return; }
  const open = e.target.closest("[data-open-page]");
  if (open) {
    if (open.hasAttribute("data-session")) hifzStartSession();
    hifzOpenPage(Number(open.dataset.openPage));
    return;
  }
  const test = e.target.closest("[data-test]");
  if (test) {
    if (test.dataset.test === "skip") {
      HifzStore.setTest(HifzStore.today(), "skip");
      hifzUndoToast("سُجّل: ليس اليوم", () => HifzStore.setTest(HifzStore.today(), null));
      return;
    }
    const def = hifzTestDefault();
    hifzStartTest(test.dataset.test, def.pages, def.name);
    return;
  }
  if (e.target.closest("[data-test-other]")) { hifzOpenTestModal("today"); return; }
  const ex = e.target.closest("[data-excl]");
  if (ex) {
    const o = hifzQuizOpts();
    const t = ex.dataset.excl;
    if (o.excluded.includes(t)) o.excluded = o.excluded.filter((x) => x !== t);
    else if (o.excluded.length >= 3) { hifzToast("⚠️ يمكن استبعاد ٣ أنواع فقط — أرجِع واحدًا أولًا."); return; }
    else o.excluded.push(t);
    hifzSaveQuizOpts(o);
    hifzRefreshOptions();
  }
});
hifzTodayPanel.addEventListener("change", (e) => {
  if (e.target.id === "hifzQuizTotal") {
    const o = hifzQuizOpts();
    o.total = Number(e.target.value);
    hifzSaveQuizOpts(o);
    hifzRefreshOptions();
  }
});
function hifzRefreshOptions() {
  const sec = hifzTodayPanel.querySelector('[data-sec="quiz-options"]');
  if (!sec) return;
  const focusExcl = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.excl : null;
  sec.querySelector(".hifz-sec-body").innerHTML = hifzOptionsHtml();
  const o = hifzQuizOpts();
  sec.querySelector(".hifz-sec-sum").textContent = `${hifzAr(o.total)} سؤالًا${o.excluded.length ? ` · ${hifzAr(o.excluded.length)} مستبعَدة` : ""}`;
  if (focusExcl) { const b = sec.querySelector(`[data-excl="${focusExcl}"]`); if (b) b.focus(); }
}

// ✅ in today's list: at once, with «تراجع» for 5 seconds
function hifzToggleReview(page, day) {
  const d = day || HifzStore.today();
  const on = !HifzStore.isReviewedOn(page, d);
  const res = HifzStore.setReviewed(page, on, d);
  if (!res.ok) { hifzToast("⚠️ " + res.reason); return; }
  hifzUndoToast(on ? `سُجّلت صفحة ${hifzAr(page)}` : `أُلغي تسجيل صفحة ${hifzAr(page)}`, () => HifzStore.setReviewed(page, !on, d));
  // keep the keyboard where it was after the list is drawn again
  requestAnimationFrame(() => { const b = document.querySelector(`#view-hifz [data-rev-page="${page}"]`); if (b) b.focus(); });
}

// «كمّل» → the first step not done yet
function hifzContinue(kind) {
  const step = HifzStore.todayTasks().step;
  if (step.kind === "mem" || step.kind === "review") {
    hifzStartSession();
    hifzOpenPage(step.page);
    if (step.kind === "mem") hifzToast("📖 احفظ الصفحة، ثم اضغط «✅ حفظتها» في الشريط أعلى المصحف.");
    return;
  }
  if (step.kind === "test") {
    const sec = hifzTodayPanel.querySelector('[data-sec="today-test"]');
    if (sec) {
      hifzSetSecOpen(sec, true);
      sec.scrollIntoView({ behavior: "smooth", block: "start" });
      const b = sec.querySelector("[data-test]");
      if (b) setTimeout(() => b.focus({ preventScroll: true }), 300);
    }
    return;
  }
  hifzToast("✓ أنجزت اليوم — تقبّل الله منك!");
}

// ============================================================
// a missed day / any day of the last 30: a window with that day's list
// ============================================================
function hifzOpenDayModal(dayArg) {
  const t = HifzStore.today();
  const missed = HifzStore.missedDays();
  let day = dayArg || missed[missed.length - 1];
  if (!day) return;
  const choices = dayArg ? [dayArg] : missed.slice().reverse();
  let picked = null; // Set of ticked pages (the temporary copy)
  let initial = null;
  const draw = () => {
    const pl = HifzStore.planFor(day);
    const list = pl.near.map((x) => ({ page: x.page, kind: "near" })).concat(pl.far.map((x) => ({ page: x.page, kind: "far" })));
    HifzStore.reviewedOn(day).forEach((p) => { if (!list.some((x) => x.page === p)) list.push({ page: p, kind: "extra" }); });
    if (!picked) { picked = new Set(HifzStore.reviewedOn(day)); initial = new Set(picked); }
    const sel = choices.length > 1
      ? `<div class="hifz-field"><label for="hifzDaySel">اليوم</label><select id="hifzDaySel" class="hifz-modal-focus">${choices.map((d) => `<option value="${d}"${d === day ? " selected" : ""}>${hifzFmtDay(d)} (${hifzAgo(d)})</option>`).join("")}</select></div>`
      : `<div class="hifz-day-head">${hifzFmtDay(day)} <small>(${hifzAgo(day)})</small></div>`;
    const rows = list.length ? list.map((x) => {
      const on = picked.has(x.page);
      const label = { near: "آخر ما حفظت", far: "القديم", extra: "إضافية" }[x.kind];
      return `<label class="hifz-day-row${on ? " done" : ""}"><input type="checkbox" data-day-page="${x.page}"${on ? " checked" : ""}> <b>صفحة ${hifzAr(x.page)}</b> <span>${hifzSurahName(x.page)}</span> <small>${label}</small></label>`;
    }).join("") : `<div class="modal-hint">لم يكن في هذا اليوم شيء مطلوب.</div>`;
    const changed = hifzDayModalDirty();
    document.getElementById("hifzModalBody").innerHTML = `
      ${sel}
      <div class="hifz-day-list">${rows}</div>
      <div class="hifz-modal-btns">
        <button type="button" class="btn primary" data-day-save${changed ? "" : " disabled"}>حفظ</button>
        <button type="button" class="btn ghost" data-day-cancel>إلغاء</button>
      </div>
      ${HifzStore.reviewedOn(day).length ? "" : `<button type="button" class="hifz-link" data-day-miss>لم أراجع فيه</button>`}`;
  };
  const hifzDayModalDirty = () => !!picked && (picked.size !== initial.size || [...picked].some((p) => !initial.has(p)));
  const save = () => {
    if (!hifzDayModalDirty()) return true;
    const on = [...picked].filter((p) => !initial.has(p));
    const off = [...initial].filter((p) => !picked.has(p));
    const res = HifzStore.setReviewedMany(day, on, off);
    if (!res.ok) { hifzToast("⚠️ " + res.reason); return false; }
    hifzCloseModal();
    hifzToast("تم الحفظ ✓");
    return true;
  };
  hifzOpenModal("سجّل مراجعة يوم", "", async () => hifzConfirmLeave());
  hifzForm = { where: "modal", isDirty: hifzDayModalDirty, save, discard: () => { picked = new Set(initial); } };
  draw();
  const body = document.getElementById("hifzModalBody");
  body.onchange = (e) => {
    if (e.target.id === "hifzDaySel") {
      const go = async () => { day = e.target.value; picked = null; draw(); };
      if (hifzDayModalDirty()) {
        const prev = day;
        hifzConfirmLeave().then((ok) => { if (ok) go(); else { e.target.value = prev; } });
      } else go();
      return;
    }
    const p = e.target.dataset.dayPage;
    if (p) {
      if (e.target.checked) picked.add(Number(p)); else picked.delete(Number(p));
      e.target.closest(".hifz-day-row").classList.toggle("done", e.target.checked);
      body.querySelector("[data-day-save]").disabled = !hifzDayModalDirty();
    }
  };
  body.onclick = (e) => {
    if (e.target.closest("[data-day-save]")) { save(); return; }
    if (e.target.closest("[data-day-cancel]")) { hifzForm = null; hifzCloseModal(); return; }
    if (e.target.closest("[data-day-miss]")) {
      hifzForm = null;
      hifzCloseModal();
      HifzStore.setMiss(day, true);
      hifzUndoToast(`${hifzFmtDay(day)}: لم تراجع فيه`, () => HifzStore.setMiss(day, false));
    }
  };
}

// ============================================================
// «اختبار على صفحات أخرى» / «اختبار كل المحفوظ»
// ============================================================
function hifzTestSources() {
  const t = HifzStore.today();
  const plan = HifzStore.getPlan();
  const w = HifzStore.weekInfo(t);
  return [
    { id: "today", label: "اليوم", name: "ما راجعته اليوم", pages: HifzStore.reviewedOn(t) },
    { id: "d2", label: "آخر يومين", name: "ما راجعته آخر يومين", pages: HifzStore.reviewedBetween(HifzStore.addDays(t, -1), t) },
    { id: "d3", label: "آخر ٣ أيام", name: "ما راجعته آخر ٣ أيام", pages: HifzStore.reviewedBetween(HifzStore.addDays(t, -2), t) },
    { id: "week", label: "هذا الأسبوع", name: "ما راجعته هذا الأسبوع", pages: HifzStore.reviewedBetween(w.start, t) },
    { id: "near", label: "آخر ما حفظت", name: "آخر ما حفظت", pages: HifzStore.memorizedWithin(Math.max(1, plan.nearDays) + 1) },
    { id: "all", label: "كل المحفوظ", name: "كل محفوظي", pages: Array.from(HifzStore.all()) },
  ];
}
function hifzOpenTestModal(defaultId) {
  const sources = hifzTestSources();
  let sel = (sources.find((s) => s.id === defaultId && s.pages.length) || sources.find((s) => s.pages.length) || sources[0]).id;
  const html = () => {
    const src = sources.find((s) => s.id === sel);
    return `
      <div class="hifz-choices" role="radiogroup" aria-label="الصفحات">
        ${sources.map((s, i) => `<label class="hifz-choice${s.id === sel ? " on" : ""}${s.pages.length ? "" : " off"}"><input type="radio" name="hifzSrc" value="${s.id}"${s.id === sel ? " checked" : ""}${s.pages.length ? "" : " disabled"}${i === 0 ? ' class="hifz-modal-focus"' : ""}><span><b>${s.label}</b><small>${s.pages.length ? hifzPagesWord(s.pages.length) : "لا صفحات"}</small></span></label>`).join("")}
      </div>
      ${src && src.pages.length ? `<div class="modal-hint hifz-left">${hifzPagesLabel(src.pages)}</div>` : ""}
      <div class="hifz-test-btns">
        <button type="button" class="hifz-test-btn" data-mtest="practice"${src && src.pages.length ? "" : " disabled"}><b>📝 تدريب</b><small>بلا وقت</small></button>
        <button type="button" class="hifz-test-btn" data-mtest="challenge"${src && src.pages.length ? "" : " disabled"}><b>⏱️ تحدٍّ</b><small>وقت وعلامة</small></button>
      </div>`;
  };
  hifzOpenModal("اختبار على صفحات أخرى", html());
  const body = document.getElementById("hifzModalBody");
  body.onchange = (e) => { if (e.target.name === "hifzSrc") { sel = e.target.value; body.innerHTML = html(); const r = body.querySelector(`input[value="${sel}"]`); if (r) r.focus(); } };
  body.onclick = (e) => {
    const b = e.target.closest("[data-mtest]");
    if (!b) return;
    const src = sources.find((s) => s.id === sel);
    hifzStartTest(b.dataset.mtest, src.pages, src.name);
  };
}

// ============================================================
// in the Mushaf: «سجّل هذه الصفحة» and the bar of today's pages
// ============================================================
let hifzSession = false; // opened from «كمّل» / a row of today's list
function hifzStartSession() { hifzSession = true; }
// today's pages in order: what to memorize, then the review list
function hifzSessionItems() {
  const t = HifzStore.today();
  const mem = HifzStore.memTask();
  const items = [];
  if (mem.active) {
    const todayMem = Array.from(HifzStore.all()).filter((p) => HifzStore.info(p).m === t);
    todayMem.forEach((p) => items.push({ kind: "mem", page: p, done: true }));
    if (!mem.done) mem.pages.forEach((p) => { if (!items.some((x) => x.page === p)) items.push({ kind: "mem", page: p, done: false }); });
  }
  const pl = HifzStore.todayPlan();
  const rev = pl.near.concat(pl.far);
  rev.forEach((x, i) => { if (!items.some((y) => y.page === x.page)) items.push({ kind: "review", page: x.page, done: x.done, n: i + 1, total: rev.length }); });
  return items;
}

const quranReviewBar = document.getElementById("quranReviewBar");
const quranReviewBarText = document.getElementById("quranReviewBarText");
const quranReviewBarMark = document.getElementById("quranReviewBarMark");
const quranReviewBarMain = document.getElementById("quranReviewBarMain");
const quranRecordBtn = document.getElementById("quranRecordBtn");
const quranRecordMenu = document.getElementById("quranRecordMenu");
document.body.appendChild(quranRecordMenu); // above everything, never clipped

function hifzSyncMushaf() {
  if (typeof HifzStore === "undefined" || typeof currentQuranPage === "undefined") return;
  const p = currentQuranPage;
  const t = HifzStore.today();
  // the button: grey / 📗 memorized / ✅ reviewed today
  const memorized = HifzStore.has(p);
  const reviewed = memorized && HifzStore.isReviewedOn(p, t);
  const memToday = memorized && HifzStore.info(p).m === t;
  quranRecordBtn.textContent = reviewed ? "✅" : "📗";
  quranRecordBtn.classList.toggle("on", memorized);
  quranRecordBtn.classList.toggle("rev", reviewed);
  const state = reviewed ? "روجعت اليوم" : memToday ? "حُفظت اليوم" : memorized ? "محفوظة" : "غير محفوظة";
  quranRecordBtn.title = `سجّل هذه الصفحة (${state})`;
  quranRecordBtn.setAttribute("aria-label", `سجّل هذه الصفحة — ${state}`);
  if (quranRecordMenuOpen()) hifzFillRecordMenu();

  // the bar: only while going through today's pages, and only on one of them
  const wasShown = quranReviewBar.style.display !== "none";
  const items = hifzSession ? hifzSessionItems() : [];
  const here = items.find((x) => x.page === p);
  if (!here) {
    quranReviewBar.style.display = "none";
    if (wasShown && typeof resizeQuranShell === "function") resizeQuranShell();
    return;
  }
  const next = items.find((x) => !x.done && x.page !== p);
  if (here.kind === "mem") {
    quranReviewBarText.textContent = `📖 احفظ صفحة ${hifzAr(p)}`;
    quranReviewBarMark.textContent = here.done ? "✓ حفظتها" : "✅ حفظتها";
  } else {
    quranReviewBarText.textContent = `صفحة ${hifzAr(p)} — ${hifzAr(here.n)} من ${hifzAr(here.total)}`;
    quranReviewBarMark.textContent = here.done ? "✓ تمّت" : "✅ تمّت";
  }
  quranReviewBarMark.classList.toggle("primary", !here.done);
  quranReviewBarMark.setAttribute("aria-pressed", String(here.done));
  quranReviewBarMark.dataset.kind = here.kind;
  quranReviewBarMain.dataset.page = next ? next.page : "";
  quranReviewBarMain.textContent = next ? "التالية ◀" : "إنهاء ◀";
  quranReviewBarMain.classList.toggle("primary", !!here.done && !next);
  quranReviewBar.style.display = "flex";
  if (!wasShown && typeof resizeQuranShell === "function") resizeQuranShell();
}
// older name (quran-reader.js used to call it)
function hifzSyncReviewBar() { hifzSyncMushaf(); }

quranReviewBarMark.addEventListener("click", () => {
  const p = currentQuranPage;
  const t = HifzStore.today();
  if (quranReviewBarMark.dataset.kind === "mem") {
    if (!HifzStore.has(p)) {
      HifzStore.applyPageEdits({ [p]: t }, []);
      hifzUndoToast(`📗 سُجّلت صفحة ${hifzAr(p)} محفوظة اليوم`, () => { if (HifzStore.info(p) && HifzStore.info(p).m === t) HifzStore.applyPageEdits({}, [p]); });
    } else if (HifzStore.info(p).m === t) {
      HifzStore.applyPageEdits({}, [p]);
      hifzUndoToast(`أُلغي حفظ صفحة ${hifzAr(p)}`, () => HifzStore.applyPageEdits({ [p]: t }, []));
    }
  } else {
    hifzToggleReview(p, t);
  }
  quranReviewBarMark.focus();
});
quranReviewBarMain.addEventListener("click", () => {
  const page = Number(quranReviewBarMain.dataset.page);
  if (page) { quranGoToPage(page); return; }
  hifzSession = false;
  hifzSyncMushaf();
  hifzTab = "today";
  switchView("hifz");
});
document.getElementById("quranReviewBarClose").addEventListener("click", () => {
  hifzSession = false;
  hifzSyncMushaf();
});

// ---- «سجّل هذه الصفحة» menu ----
function quranRecordMenuOpen() { return quranRecordMenu.style.display !== "none"; }
function hifzFillRecordMenu() {
  const p = currentQuranPage;
  const t = HifzStore.today();
  const memorized = HifzStore.has(p);
  const memToday = memorized && HifzStore.info(p).m === t;
  const reviewed = memorized && HifzStore.isReviewedOn(p, t);
  const items = [];
  if (!memorized) items.push(`<button type="button" role="menuitem" data-rec="mem">📗 حفظتها اليوم</button>`);
  if (memorized && !reviewed) items.push(`<button type="button" role="menuitem" data-rec="rev">🔁 راجعتها اليوم</button>`);
  if (memToday || reviewed) items.push(`<button type="button" role="menuitem" data-rec="undo">↩️ إلغاء تسجيل اليوم</button>`);
  const state = reviewed ? "✅ روجعت اليوم" : memToday ? "📗 حُفظت اليوم" : memorized ? "📗 محفوظة" : "غير محفوظة";
  quranRecordMenu.innerHTML = `<div class="quran-record-head">صفحة ${hifzAr(p)} · ${state}</div>${items.join("")}`;
}
function hifzOpenRecordMenu() {
  hifzFillRecordMenu();
  quranRecordMenu.style.display = "flex";
  quranRecordBtn.setAttribute("aria-expanded", "true");
  const r = quranRecordBtn.getBoundingClientRect();
  const w = quranRecordMenu.offsetWidth;
  const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  quranRecordMenu.style.left = left + "px";
  quranRecordMenu.style.top = Math.max(8, r.top - quranRecordMenu.offsetHeight - 8) + "px";
  const f = quranRecordMenu.querySelector("[data-rec]");
  if (f) f.focus();
}
function hifzCloseRecordMenu(refocus) {
  quranRecordMenu.style.display = "none";
  quranRecordBtn.setAttribute("aria-expanded", "false");
  if (refocus) quranRecordBtn.focus();
}
quranRecordBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (quranRecordMenuOpen()) hifzCloseRecordMenu(false); else hifzOpenRecordMenu();
});
document.addEventListener("click", (e) => {
  if (quranRecordMenuOpen() && !e.target.closest("#quranRecordMenu") && e.target !== quranRecordBtn) hifzCloseRecordMenu(false);
});
quranRecordMenu.addEventListener("keydown", (e) => {
  const items = Array.from(quranRecordMenu.querySelectorAll("[data-rec]"));
  const i = items.indexOf(document.activeElement);
  if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  else if (e.key === "Tab") hifzCloseRecordMenu(false);
});
quranRecordMenu.addEventListener("click", (e) => {
  const b = e.target.closest("[data-rec]");
  if (!b) return;
  const p = currentQuranPage;
  const t = HifzStore.today();
  hifzCloseRecordMenu(true);
  if (b.dataset.rec === "mem") {
    HifzStore.applyPageEdits({ [p]: t }, []);
    hifzUndoToast(`📗 سُجّلت صفحة ${hifzAr(p)} محفوظة اليوم`, () => { if (HifzStore.info(p) && HifzStore.info(p).m === t) HifzStore.applyPageEdits({}, [p]); });
  } else if (b.dataset.rec === "rev") {
    const res = HifzStore.setReviewed(p, true, t);
    if (!res.ok) { hifzToast("⚠️ " + res.reason); return; }
    const tp = HifzStore.todayPlan();
    hifzUndoToast(`🔁 سُجّلت صفحة ${hifzAr(p)} — مراجعة اليوم ${hifzAr(tp.doneCount)}/${hifzAr(tp.dueCount)}`, () => HifzStore.setReviewed(p, false, t));
  } else {
    const wasRev = HifzStore.isReviewedOn(p, t);
    const wasMem = HifzStore.info(p) && HifzStore.info(p).m === t;
    if (wasRev) HifzStore.setReviewed(p, false, t);
    if (wasMem) HifzStore.applyPageEdits({}, [p]);
    hifzUndoToast(`أُلغي تسجيل اليوم لصفحة ${hifzAr(p)}`, () => {
      if (wasMem) HifzStore.applyPageEdits({ [p]: t }, []);
      if (wasRev) HifzStore.setReviewed(p, true, t);
    });
  }
});

// ============================================================
// 🗒️ خطتي
// ============================================================
function hifzReminderSummary() {
  if (typeof ItqanNotify === "undefined" || !ItqanNotify.remindersSupported()) return { sum: "في تطبيق الهاتف", native: false };
  const r = ItqanNotify.getReminders();
  const on = [];
  if (r.plan.on) on.push(`المراجعة ${hifzAr(r.plan.time)}`);
  if (r.goal.on) on.push(`الهدف ${hifzAr(r.goal.time)}`);
  return { sum: on.length ? on.join(" · ") : "غير مفعّلة", native: true, r };
}
function renderHifzPlan() {
  const panel = document.getElementById("hifzPanel-plan");
  const plan = HifzStore.getPlan();
  const total = HifzStore.count();
  const tp = HifzStore.todayPlan();
  const next = HifzStore.nextMemPage();
  const w = HifzStore.weekInfo();
  const farPer = tp.quota;
  const line1 = plan.weeklyGoal
    ? `تحفظ <b>${hifzPagesWord(plan.weeklyGoal)}</b> في الأسبوع ${hifzDirWord(plan.dir || "asc")}${next ? ` — التالية: صفحة ${hifzAr(next.page)}` : ""}.`
    : `<b>مراجعة فقط</b> — بلا حفظ جديد.`;
  const line2 = total
    ? `تراجع آخر ما حفظت <b>${hifzDaysWord(plan.nearDays)}</b>${tp.farCount ? `، والقديم <b>${hifzPagesN(farPer)} يوميًّا</b> (الختمة ${hifzAr(tp.cycle)}، كل ${hifzDaysN(tp.cycleDays)})` : ""}.`
    : `لا محفوظ بعد — تبدأ المراجعة حين تحفظ.`;
  const rem = hifzReminderSummary();
  const where = tp.far.length ? tp.far[0].page : tp.more.length ? tp.more[0] : null;
  panel.innerHTML = `
    <div class="hifz-plan-sum">
      <div>${line1}</div>
      <div>${line2}</div>
      <button type="button" class="btn small primary" data-plan-edit>تعديل</button>
    </div>
    ${hifzSec({ id: "plan-mem", icon: "📖", title: "الحفظ الجديد", sum: plan.weeklyGoal ? `${hifzPagesN(plan.weeklyGoal)} أسبوعيًّا` : "مراجعة فقط",
      body: plan.weeklyGoal ? `
        <div class="hifz-kv"><span>الهدف الأسبوعي ${hifzHelpBtn("goal")}</span><b>${hifzPagesWord(plan.weeklyGoal)}</b></div>
        <div class="hifz-kv"><span>هذا الأسبوع (${hifzFmtDay(w.start)} – ${hifzFmtDay(w.end)})</span><b>${hifzAr(w.done)} من ${hifzAr(w.goal)}</b></div>
        ${w.partial ? `<div class="modal-hint hifz-left">بدأت خطتك في منتصف هذا الأسبوع، فهدفه ${hifzPagesWord(w.goal)} فقط.</div>` : ""}
        <div class="hifz-kv"><span>الاتجاه</span><b>${hifzDirWord(plan.dir || "asc")}</b></div>
        <div class="hifz-kv"><span>الصفحة التالية</span><b>${next ? `${hifzAr(next.page)} <small>${hifzSurahName(next.page)}</small>` : "—"}</b></div>
        <div class="hifz-kv"><span>يبدأ الأسبوع يوم</span><b>${HIFZ_DAY_NAMES[plan.weekStart]}</b></div>`
        : `<div class="modal-hint hifz-left">خطتك مراجعة فقط. لتحفظ صفحات جديدة اضغط «تعديل» واكتب هدفًا أسبوعيًّا.</div>` })}
    ${hifzSec({ id: "plan-near", icon: "🆕", title: "مراجعة آخر ما حفظت", sum: hifzDaysWord(plan.nearDays), help: "near",
      body: `<div class="hifz-kv"><span>كل صفحة جديدة تُراجَع يوميًّا</span><b>${hifzDaysWord(plan.nearDays)}</b></div>
        <div class="hifz-kv"><span>فيها الآن</span><b>${tp.near.length ? hifzPagesLabel(tp.near.map((x) => x.page)) : "لا شيء"}</b></div>` })}
    ${hifzSec({ id: "plan-far", icon: "🔁", title: "مراجعة القديم", sum: tp.farCount ? `${hifzPagesN(farPer)} يوميًّا · الختمة ${hifzAr(tp.cycle)}` : "لا قديم بعد", help: "far",
      body: tp.farCount ? `
        <div class="hifz-kv"><span>المحفوظ القديم</span><b>${hifzPagesWord(tp.farCount)}</b></div>
        <div class="hifz-kv"><span>كل يوم</span><b>${hifzPagesWord(farPer)}${plan.farMode === "days" ? ` <small>(ختمة في ${hifzDaysN(plan.farDays)})</small>` : ""}</b></div>
        <div class="hifz-kv"><span>الختمة ${hifzHelpBtn("khatma")}</span><b>رقم ${hifzAr(tp.cycle)} — كل ${hifzDaysN(tp.cycleDays)} تقريبًا</b></div>
        <div class="hifz-kv"><span>أين وصلت</span><b>${where ? `صفحة ${hifzAr(where)}` : "أتممت هذه الختمة"}</b></div>
        <div class="hifz-kv"><span>باقي في الختمة</span><b>${hifzPagesWord(tp.cycleLeft)}</b></div>`
        : `<div class="modal-hint hifz-left">تظهر هنا حين يكون عندك محفوظ أقدم من «آخر ما حفظت».</div>` })}
    ${hifzSec({ id: "plan-rem", icon: "⏰", title: "التذكيرات", sum: rem.sum,
      body: rem.native ? `
        <div class="hifz-kv"><span>تذكير المراجعة (إن لم تُتمّها)</span><b>${rem.r.plan.on ? hifzAr(rem.r.plan.time) : "غير مفعّل"}</b></div>
        <div class="hifz-kv"><span>تذكير الهدف الأسبوعي</span><b>${rem.r.goal.on ? hifzAr(rem.r.goal.time) : "غير مفعّل"}</b></div>`
        : `<div class="modal-hint hifz-left">التذكيرات متاحة في تطبيق إتقان على الهاتف.</div>` })}
    <button type="button" class="hifz-link small" data-plan-reset>إعادة الإعداد من البداية</button>`;
}
const hifzPlanPanel = document.getElementById("hifzPanel-plan");
hifzPlanPanel.addEventListener("click", async (e) => {
  if (e.target.closest("[data-plan-edit]")) { hifzOpenPlanForm(); return; }
  if (e.target.closest("[data-plan-reset]")) {
    const v = await hifzAsk("إعادة الإعداد من البداية", "تعيد أسئلة الإعداد الأربعة وتغيّر خطتك فقط — محفوظك وسجلّ مراجعاتك يبقيان كما هما. لا يتغيّر شيء حتى تضغط «حفظ الخطة».", [
      { label: "ابدأ الإعداد", value: "go", cls: "primary" },
      { label: "إلغاء", value: null },
    ]);
    if (v === "go") { hifzWizardStart(true); renderHifzView(); window.scrollTo(0, 0); }
  }
});

// ---- «تعديل» — the plan on a temporary copy ----
function hifzOpenPlanForm() {
  const panel = hifzPlanPanel;
  const plan = HifzStore.getPlan();
  const tp = HifzStore.todayPlan();
  const next = HifzStore.nextMemPage();
  const total = HifzStore.count();
  const farOrder = HifzStore.farOrder();
  const where = tp.far.length ? tp.far[0].page : tp.more.length ? tp.more[0] : (farOrder[0] || "");
  const rem = hifzReminderSummary();
  const draft = {
    weeklyGoal: plan.weeklyGoal, dir: plan.dir || "asc", memNext: next ? next.page : "", weekStart: plan.weekStart,
    nearDays: Math.max(1, Math.min(30, plan.nearDays || 1)), farMode: plan.farMode, farPages: plan.farPages, farDays: plan.farDays,
    farPos: where, farCycle: tp.cycle,
    remPlanOn: rem.native ? rem.r.plan.on : false, remPlanTime: rem.native ? rem.r.plan.time : "20:00",
    remGoalOn: rem.native ? rem.r.goal.on : false, remGoalTime: rem.native ? rem.r.goal.time : "20:00",
  };
  const initial = JSON.stringify(draft);
  const mem = HifzStore.all();
  const fieldNum = (id, label, value, attrs, after, help) =>
    `<div class="hifz-field"><label for="${id}">${label}${help ? " " + hifzHelpBtn(help) : ""}</label><span><input id="${id}" type="number" inputmode="numeric" value="${value}" ${attrs}> ${after || ""}</span></div>`;
  const body = {
    mem: `
      ${fieldNum("hifzPfGoal", "الهدف الأسبوعي", draft.weeklyGoal, 'min="0" max="70"', "صفحة <small>(٠ = مراجعة فقط)</small>", "goal")}
      <div class="hifz-wz-sub">الاتجاه</div>
      <div class="hifz-choices row" role="radiogroup" aria-label="اتجاه الحفظ">
        <label class="hifz-choice${draft.dir === "asc" ? " on" : ""}"><input type="radio" name="pfDir" value="asc"${draft.dir === "asc" ? " checked" : ""}><span><b>من الفاتحة نزولًا</b></span></label>
        <label class="hifz-choice${draft.dir === "desc" ? " on" : ""}"><input type="radio" name="pfDir" value="desc"${draft.dir === "desc" ? " checked" : ""}><span><b>من الناس صعودًا</b></span></label>
      </div>
      ${fieldNum("hifzPfNext", "الصفحة التالية للحفظ", draft.memNext, 'min="1" max="604"', "")}
      <div class="hifz-field"><label for="hifzPfWeekStart">يبدأ الأسبوع يوم</label>
        <select id="hifzPfWeekStart">${[6, 0, 1, 2, 3, 4, 5].map((d) => `<option value="${d}"${d === draft.weekStart ? " selected" : ""}>${HIFZ_DAY_NAMES[d]}</option>`).join("")}</select></div>`,
    near: fieldNum("hifzPfNear", "راجع آخر ما حفظته لمدة", draft.nearDays, 'min="1" max="30"', "يوم", "near"),
    far: total ? `
      <div class="hifz-choices" role="radiogroup" aria-label="مراجعة القديم">
        <label class="hifz-choice${draft.farMode === "pages" ? " on" : ""}"><input type="radio" name="pfFarMode" value="pages"${draft.farMode === "pages" ? " checked" : ""}><span><b>عدد صفحات في اليوم</b></span></label>
        <span class="hifz-field indent" data-pf-mode="pages"${draft.farMode === "pages" ? "" : " hidden"}><label for="hifzPfFarPages" class="sr-only">صفحات القديم يوميًّا</label><input id="hifzPfFarPages" type="number" inputmode="numeric" min="1" max="${total}" value="${draft.farPages}"> صفحة يوميًّا</span>
        <label class="hifz-choice${draft.farMode === "days" ? " on" : ""}"><input type="radio" name="pfFarMode" value="days"${draft.farMode === "days" ? " checked" : ""}><span><b>أختم المحفوظ في عدد أيام</b></span></label>
        <span class="hifz-field indent" data-pf-mode="days"${draft.farMode === "days" ? "" : " hidden"}><label for="hifzPfFarDays" class="sr-only">أيام الختمة</label><input id="hifzPfFarDays" type="number" inputmode="numeric" min="1" max="365" value="${draft.farDays}"> يومًا</span>
      </div>
      <div class="hifz-calc" id="hifzPfCalc" aria-live="polite"></div>
      ${fieldNum("hifzPfFarPos", "أين وصلت مراجعة القديم", draft.farPos, 'min="1" max="604"', "", null)}
      <small class="hifz-field-hint" id="hifzPfFarPosNote"></small>
      ${fieldNum("hifzPfFarCycle", "رقم الختمة", draft.farCycle, 'min="1"', "", "khatma")}`
      : `<div class="modal-hint hifz-left">لا محفوظ قديم بعد.</div>`,
    rem: rem.native ? `
      <label class="reminder-toggle"><input id="hifzPfRemPlan" type="checkbox"${draft.remPlanOn ? " checked" : ""}> <span>⏰ ذكّرني بمراجعة اليوم إن لم أُتمّها</span></label>
      <input id="hifzPfRemPlanTime" type="time" class="reminder-time" aria-label="وقت تذكير المراجعة" value="${draft.remPlanTime}"${draft.remPlanOn ? "" : " disabled"}>
      <label class="reminder-toggle"><input id="hifzPfRemGoal" type="checkbox"${draft.remGoalOn ? " checked" : ""}> <span>⏰ ذكّرني إن تأخرت عن الهدف الأسبوعي</span></label>
      <input id="hifzPfRemGoalTime" type="time" class="reminder-time" aria-label="وقت تذكير الهدف" value="${draft.remGoalTime}"${draft.remGoalOn ? "" : " disabled"}>`
      : `<div class="modal-hint hifz-left">التذكيرات متاحة في تطبيق إتقان على الهاتف.</div>`,
  };
  panel.innerHTML = `
    <form class="hifz-plan-form" id="hifzPlanForm" novalidate>
      <h2 class="hifz-form-title" tabindex="-1" id="hifzPfTitle">تعديل الخطة</h2>
      ${hifzSec({ id: "pf-mem", icon: "📖", title: "الحفظ الجديد", body: body.mem, forceOpen: true, noRemember: true })}
      ${hifzSec({ id: "pf-near", icon: "🆕", title: "مراجعة آخر ما حفظت", body: body.near, forceOpen: true, noRemember: true })}
      ${hifzSec({ id: "pf-far", icon: "🔁", title: "مراجعة القديم", body: body.far, forceOpen: true, noRemember: true })}
      ${hifzSec({ id: "pf-rem", icon: "⏰", title: "التذكيرات", body: body.rem, forceOpen: true, noRemember: true })}
      <div class="hifz-form-btns">
        <button type="submit" class="btn primary" id="hifzPfSave" disabled>حفظ</button>
        <button type="button" class="btn ghost" data-pf-cancel>إلغاء</button>
      </div>
    </form>`;
  const form = document.getElementById("hifzPlanForm");
  const $ = (id) => document.getElementById(id);
  const validate = (showAll) => {
    const errs = [];
    const check = (id, ok, msg) => { const el = $(id); if (!el) return; const bad = !ok; if (bad) errs.push(id); if (showAll || el.dataset.touched) hifzFieldError(el, bad ? msg : ""); };
    check("hifzPfGoal", hifzIntIn(draft.weeklyGoal, 0, 70), "من ٠ إلى ٧٠ صفحة (٠ = مراجعة فقط).");
    if (Number(draft.weeklyGoal) > 0) {
      const v = draft.memNext;
      let msg = "";
      if (!hifzIntIn(v, 1, 604)) msg = "رقم صفحة من ١ إلى ٦٠٤.";
      else if (mem.has(Number(v))) {
        const near = HifzStore.nearestFree(Number(v), mem, draft.dir === "desc" ? -1 : 1);
        msg = near ? `هذه الصفحة محفوظة — أقرب صفحة غير محفوظة: ${hifzAr(near)} <button type="button" class="btn small ghost" data-pf-use-next="${near}">اعتمد ${hifzAr(near)}</button>` : "كل صفحات المصحف محفوظة.";
      }
      check("hifzPfNext", !msg, msg);
    } else if ($("hifzPfNext")) hifzFieldError($("hifzPfNext"), "");
    check("hifzPfNear", hifzIntIn(draft.nearDays, 1, 30), "من ١ إلى ٣٠ يومًا.");
    if (total) {
      if (draft.farMode === "pages") check("hifzPfFarPages", hifzIntIn(draft.farPages, 1, total), Number(draft.farPages) > total ? `محفوظك ${hifzPagesN(total)} فقط.` : `من ١ إلى ${hifzAr(total)}.`);
      else check("hifzPfFarDays", hifzIntIn(draft.farDays, 1, 365), "من ١ إلى ٣٦٥ يومًا.");
      check("hifzPfFarPos", hifzIntIn(draft.farPos, 1, 604) && mem.has(Number(draft.farPos)), "اختر صفحة من محفوظك.");
      check("hifzPfFarCycle", hifzIntIn(draft.farCycle, 1, 9999), "رقم من ١ فأكثر.");
      const c = $("hifzPfCalc");
      if (c) c.textContent = hifzFarCalc(draft.farMode, draft.farPages, draft.farDays, tp.farCount || total);
    }
    const dirty = JSON.stringify(draft) !== initial;
    $("hifzPfSave").disabled = !dirty || errs.length > 0;
    return errs;
  };
  const save = () => {
    const errs = validate(true);
    if (errs.length) { const f = $(errs[0]); if (f) f.focus(); return false; }
    if (JSON.stringify(draft) === initial) { close(); return true; }
    const patch = {
      weeklyGoal: Number(draft.weeklyGoal), dir: draft.dir, weekStart: Number(draft.weekStart), nearDays: Number(draft.nearDays),
      farMode: draft.farMode, farPages: Number(draft.farPages) || plan.farPages, farDays: Number(draft.farDays) || plan.farDays,
      farCycle: Number(draft.farCycle) || 1,
    };
    if (Number(draft.weeklyGoal) > 0 && String(draft.memNext) !== String(next ? next.page : "")) patch.memNext = Number(draft.memNext);
    if (total && String(draft.farPos) !== String(where)) patch.farCursor = Number(draft.farPos);
    const remChanged = rem.native && (draft.remPlanOn !== rem.r.plan.on || draft.remPlanTime !== rem.r.plan.time || draft.remGoalOn !== rem.r.goal.on || draft.remGoalTime !== rem.r.goal.time);
    hifzForm = null;
    HifzStore.savePlan(patch);
    if (remChanged) {
      Promise.resolve()
        .then(() => ItqanNotify.setReminder("plan", { on: draft.remPlanOn, time: draft.remPlanTime }))
        .then(() => ItqanNotify.setReminder("goal", { on: draft.remGoalOn, time: draft.remGoalTime }))
        .then((res) => {
          if (res && !res.ok) hifzToast(res.reason === "permission" ? "⚠️ الإشعارات مرفوضة — فعّلها من إعدادات الهاتف ثم أعد المحاولة." : "⚠️ تعذّر ضبط التذكير، حاول مرة أخرى.");
          if (typeof renderReminderSettings === "function") renderReminderSettings();
          if (hifzIsActive() && hifzTab === "plan" && !hifzForm) renderHifzPlan();
        });
    } else if (typeof ItqanNotify !== "undefined" && ItqanNotify.remindersSupported()) {
      ItqanNotify.replanReminders(); // the plan changed → the reminders follow it
    }
    renderHifzPlan();
    hifzToast("تم الحفظ ✓");
    const b = panel.querySelector("[data-plan-edit]"); if (b) b.focus();
    return true;
  };
  const close = () => { hifzForm = null; renderHifzPlan(); const b = panel.querySelector("[data-plan-edit]"); if (b) b.focus(); };
  hifzForm = { where: "panel", panel: "plan", isDirty: () => JSON.stringify(draft) !== initial, save, discard: () => { hifzForm = null; } };
  validate(false);
  $("hifzPfTitle").focus();

  form.addEventListener("input", (e) => {
    const t = e.target;
    const map = { hifzPfGoal: "weeklyGoal", hifzPfNext: "memNext", hifzPfNear: "nearDays", hifzPfFarPages: "farPages", hifzPfFarDays: "farDays", hifzPfFarPos: "farPos", hifzPfFarCycle: "farCycle" };
    if (map[t.id]) { draft[map[t.id]] = hifzNum(t); t.dataset.touched = "1"; if (t.id === "hifzPfFarPos") $("hifzPfFarPosNote").textContent = ""; }
    if (t.id === "hifzPfWeekStart") draft.weekStart = Number(t.value);
    if (t.id === "hifzPfRemPlanTime") draft.remPlanTime = t.value;
    if (t.id === "hifzPfRemGoalTime") draft.remGoalTime = t.value;
    validate(false);
  });
  form.addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "pfDir") draft.dir = t.value;
    if (t.name === "pfFarMode") {
      draft.farMode = t.value;
      form.querySelectorAll("[data-pf-mode]").forEach((s) => { s.hidden = s.dataset.pfMode !== draft.farMode; });
    }
    if (t.type === "radio") form.querySelectorAll(`input[name="${t.name}"]`).forEach((r) => r.closest(".hifz-choice").classList.toggle("on", r.checked));
    if (t.id === "hifzPfWeekStart") draft.weekStart = Number(t.value);
    if (t.id === "hifzPfRemPlan") { draft.remPlanOn = t.checked; $("hifzPfRemPlanTime").disabled = !t.checked; }
    if (t.id === "hifzPfRemGoal") { draft.remGoalOn = t.checked; $("hifzPfRemGoalTime").disabled = !t.checked; }
    if (t.id === "hifzPfFarPos") {
      const v = hifzNum(t);
      if (hifzIntIn(v, 1, 604) && !mem.has(v) && farOrder.length) {
        const near = HifzStore.nearestIn(v, farOrder);
        draft.farPos = near;
        t.value = near;
        $("hifzPfFarPosNote").textContent = `صفحة ${hifzAr(v)} ليست من محفوظك — نُقلت إلى أقرب صفحة محفوظة: ${hifzAr(near)}.`;
      }
    }
    validate(false);
  });
  form.addEventListener("click", (e) => {
    const use = e.target.closest("[data-pf-use-next]");
    if (use) { e.preventDefault(); draft.memNext = Number(use.dataset.pfUseNext); $("hifzPfNext").value = draft.memNext; validate(true); $("hifzPfNext").focus(); return; }
    if (e.target.closest("[data-pf-cancel]")) close();
  });
  form.addEventListener("submit", (e) => { e.preventDefault(); save(); });
}

// ============================================================
// 📈 تقدّمي
// ============================================================
let hifzPageEdit = null; // { adds: Map page → day|null, removes: Set, mode: "old"|"dated", date }
function renderHifzProgress() {
  const panel = document.getElementById("hifzPanel-progress");
  const total = HifzStore.count();
  const st = HifzStore.stats();
  const w = HifzStore.weekInfo();
  const plan = HifzStore.getPlan();
  const t = HifzStore.today();
  const pct = Math.round((total / 604) * 100);
  const tile = (icon, value, label) => `<div class="hifz-tile"><div class="hifz-tile-v">${icon} ${value}</div><div class="hifz-tile-l">${label}</div></div>`;
  const weekReviewed = (() => { let n = 0; for (let d = w.start; d <= t; d = HifzStore.addDays(d, 1)) if (HifzStore.reviewedOn(d).length) n++; return n; })();

  // the map of the last 42 days (whole weeks)
  const first = (() => {
    const d = HifzStore.addDays(t, -(HIFZ_MAP_DAYS - 1));
    const [y, m, dd] = d.split("-").map(Number);
    const wd = new Date(y, m - 1, dd).getDay();
    return HifzStore.addDays(d, -((wd - plan.weekStart + 7) % 7));
  })();
  const byDay = {};
  st.days.forEach((d) => { byDay[d.day] = d; });
  let cells = "";
  for (let i = 0; i < 7; i++) cells += `<div class="hifz-cal-h" aria-hidden="true">${HIFZ_DAY_NAMES[(plan.weekStart + i) % 7].replace(/^ال/, "").slice(0, 2)}</div>`;
  for (let d = first; d <= t; d = HifzStore.addDays(d, 1)) {
    const info = byDay[d];
    let state = info ? info.state : "free";
    if (plan.setupOn && d < plan.setupOn && state === "none") state = "free";
    if (state === "none" && HifzStore.isMissAccepted(d)) state = "miss";
    const [, , dd] = d.split("-").map(Number);
    const words = { full: "مراجعة كاملة", extra: "أكثر من المطلوب", partial: "مراجعة جزئية", none: "لم تُسجَّل", miss: "لم تراجع فيه", free: "" }[state];
    const tip = `${hifzFmtDay(d)}${info && info.due ? `: ${hifzAr(info.done)} من ${hifzAr(info.due)}` : info && info.done ? `: ${hifzAr(info.done)}` : ""}${words ? ` — ${words}` : ""}`;
    const can = HifzStore.daysBetween(d, t) <= HIFZ_BACK_DAYS && total > 0;
    cells += can
      ? `<button type="button" class="hifz-cal-d s-${state}${d === t ? " today" : ""}" data-map-day="${d}" title="${tip}" aria-label="${tip} — اضغط للتسجيل">${hifzAr(dd)}</button>`
      : `<div class="hifz-cal-d s-${state}${d === t ? " today" : ""}" title="${tip}">${hifzAr(dd)}</div>`;
  }

  // pages per juz
  const editing = !!hifzPageEdit;
  const isOn = (p) => (HifzStore.has(p) && !(editing && hifzPageEdit.removes.has(p))) || (editing && hifzPageEdit.adds.has(p));
  let juzRows = "", fullJuz = 0;
  for (let j = 1; j <= 30; j++) {
    const pages = quranJuzPages(j);
    const done = pages.filter(isOn).length;
    if (done === pages.length) fullJuz++;
    const chips = pages.map((p) => {
      const on = isOn(p);
      const info = HifzStore.info(p);
      const changed = editing && (hifzPageEdit.adds.has(p) || hifzPageEdit.removes.has(p));
      const title = info ? (info.m ? `حُفظت ${hifzFmtDay(info.m)}` : "محفوظ قديم") : "غير محفوظة";
      return editing
        ? `<button type="button" class="hifz-page${on ? " on" : ""}${changed ? " changed" : ""}" data-edit-page="${p}" aria-pressed="${on}" aria-label="صفحة ${hifzAr(p)}">${hifzAr(p)}</button>`
        : `<button type="button" class="hifz-page${on ? " on" : ""}${info && info.m ? " dated" : ""}" data-open-page="${p}" title="${title}" aria-label="صفحة ${hifzAr(p)} — ${title}">${hifzAr(p)}</button>`;
    }).join("");
    juzRows += hifzSec({ id: `juz-${j}`, icon: "", title: `الجزء ${hifzAr(j)}`, cls: "hifz-sec-juz",
      sum: `<span class="hifz-bar"><i style="width:${Math.round((done / pages.length) * 100)}%"></i></span><span class="hifz-juz-count">${hifzAr(done)}/${hifzAr(pages.length)}</span>`,
      body: `<div class="hifz-pages">${chips}</div>${editing ? `<div class="hifz-juz-actions"><button type="button" class="btn small ghost" data-edit-juz-all="${j}">✅ الجزء كله</button><button type="button" class="btn small ghost" data-edit-juz-none="${j}">إلغاء التحديد</button></div>` : ""}`,
      open: false, forceOpen: editing && hifzPageEdit.openJuz && hifzPageEdit.openJuz.has(j) });
  }
  const editHead = editing ? `
    <div class="hifz-edit-head">
      <div class="hifz-wz-sub">الصفحات التي تضيفها تُسجَّل:</div>
      <div class="hifz-choices row" role="radiogroup" aria-label="تاريخ الصفحات المضافة">
        <label class="hifz-choice${hifzPageEdit.mode === "old" ? " on" : ""}"><input type="radio" name="peMode" value="old"${hifzPageEdit.mode === "old" ? " checked" : ""}><span><b>محفوظ قديم</b><small>بلا تاريخ</small></span></label>
        <label class="hifz-choice${hifzPageEdit.mode === "dated" ? " on" : ""}"><input type="radio" name="peMode" value="dated"${hifzPageEdit.mode === "dated" ? " checked" : ""}><span><b>حفظ جديد بتاريخ</b></span></label>
      </div>
      <input id="hifzPeDate" type="date" aria-label="تاريخ الحفظ" value="${hifzPageEdit.date}" max="${t}"${hifzPageEdit.mode === "dated" ? "" : " hidden"}>
      <div class="modal-hint hifz-left">اضغط الصفحات لتحديدها أو إلغائها — لا يتغيّر شيء حتى تضغط «حفظ» في الأسفل.</div>
    </div>` : "";

  panel.innerHTML = `
    ${total ? `<div class="hifz-tiles">
      ${tile("📗", hifzAr(total), `صفحة محفوظة (${hifzAr(pct)}٪)`)}
      ${tile("🔥", hifzAr(st.streak), st.streak === 1 ? "يوم مراجعة كاملة" : "أيام مراجعة كاملة متتالية")}
      ${tile("📅", plan.weeklyGoal ? `${hifzAr(w.done)}/${hifzAr(w.goal)}` : hifzAr(weekReviewed), plan.weeklyGoal ? "حفظ هذا الأسبوع" : "أيام راجعت فيها هذا الأسبوع")}
    </div>` : `<div class="hifz-empty">لم تسجّل أي صفحة بعد — <button type="button" class="hifz-link" data-pe-start>سجّل محفوظك</button> أو <button type="button" class="hifz-link" data-resetup>ابدأ الإعداد</button></div>`}

    ${total ? `<div class="hifz-block">
      <div class="hifz-block-title">🗓️ آخر ٤٢ يومًا <small>اضغط يومًا لتسجيل مراجعته</small></div>
      <div class="hifz-cal">${cells}</div>
      <div class="hifz-legend">
        <span><i class="s-full"></i>كاملة</span><span><i class="s-extra"></i>أكثر من المطلوب</span><span><i class="s-partial"></i>جزئية</span><span><i class="s-none"></i>لم تُسجَّل</span><span><i class="s-miss"></i>لم تراجع فيه</span>
      </div>
    </div>` : ""}

    ${hifzSec({ id: "prog-pages", icon: "🗺️", title: "الصفحات حسب الجزء", sum: `${hifzPagesN(editing ? [...Array(604)].filter((_, i) => isOn(i + 1)).length : total)} · ${hifzAr(fullJuz)} جزء كامل`,
      body: `${editing ? editHead : ""}<div class="hifz-juz-list">${juzRows}</div>`,
      headExtra: editing ? "" : `<button type="button" class="btn small ghost hifz-head-btn" data-pe-start>✏️ تعديل المحفوظ</button>`,
      open: editing, forceOpen: editing })}

    ${total ? `<button type="button" class="btn ghost hifz-test-all" data-test-all>🎯 اختبار كل المحفوظ</button>` : ""}
    ${total ? hifzSec({ id: "prog-more", icon: "📊", title: "تفاصيل أكثر", sum: "الحفظ الأسبوعي وقوة الحفظ", body: hifzMoreStats(st), open: false }) : ""}`;
  hifzSetEditBar(editing ? hifzPageEdit : null);
}
function hifzMoreStats(st) {
  const plan = HifzStore.getPlan();
  const t = HifzStore.today();
  const maxW = Math.max(plan.weeklyGoal, ...st.weeks.map((w) => w.count), 1);
  const bars = st.weeks.map((w, i) => {
    const h = Math.round((w.count / maxW) * 100);
    const [, m, d] = w.start.split("-").map(Number);
    return `<div class="hifz-wbar${i === st.weeks.length - 1 ? " current" : ""}${w.goalMet ? " met" : ""}" title="أسبوع ${hifzFmtDay(w.start, false)}: ${hifzAr(w.count)} صفحة">
      <span class="hifz-wbar-n">${w.count ? hifzAr(w.count) : ""}</span><span class="hifz-wbar-col"><i style="height:${h}%"></i></span><span class="hifz-wbar-d">${hifzAr(d)}/${hifzAr(m)}</span></div>`;
  }).join("");
  const goalLine = plan.weeklyGoal ? `<div class="hifz-goal-line" style="bottom:calc(18px + ${Math.round((plan.weeklyGoal / maxW) * 90)}px)" title="الهدف"></div>` : "";
  const cycle = Math.max(1, st.cycleDays || 7);
  let map = "";
  for (let j = 1; j <= 30; j++) {
    const pages = quranJuzPages(j).filter((p) => HifzStore.has(p));
    if (!pages.length) continue;
    map += `<div class="hifz-map-row"><span class="hifz-map-juz">ج${hifzAr(j)}</span><span class="hifz-map-cells">${pages.map((p) => {
      const a = st.age[p];
      const cls = a === null ? "hm-never" : a <= cycle ? "hm-fresh" : a <= cycle * 2 ? "hm-aging" : "hm-old";
      const tip = a === null ? "لم تُراجَع بعد" : a === 0 ? "اليوم" : hifzAgo(HifzStore.addDays(t, -a));
      return `<button type="button" class="hifz-map-cell ${cls}" data-open-page="${p}" title="صفحة ${hifzAr(p)} — ${tip}" aria-label="صفحة ${hifzAr(p)}، ${tip}"></button>`;
    }).join("")}</span></div>`;
  }
  return `
    <div class="hifz-block-title">📈 الحفظ الأسبوعي <small>آخر ١٢ أسبوعًا${plan.weeklyGoal ? `، الخط = الهدف ${hifzAr(plan.weeklyGoal)}` : ""}</small></div>
    <div class="hifz-wchart">${goalLine}${bars}</div>
    <div class="hifz-block-title">💪 قوة الحفظ <small>منذ آخر مراجعة لكل صفحة</small></div>
    <div class="hifz-map">${map}</div>
    <div class="hifz-legend"><span><i class="hm-fresh"></i>خلال الختمة</span><span><i class="hm-aging"></i>تأخّرت قليلًا</span><span><i class="hm-old"></i>متأخرة كثيرًا</span><span><i class="hm-never"></i>لم تُراجَع</span></div>`;
}

// ---- «تعديل المحفوظ» — a temporary copy + the fixed bar ----
function hifzPageEditCount() { return hifzPageEdit ? hifzPageEdit.adds.size + hifzPageEdit.removes.size : 0; }
function hifzSetEditBar(edit) {
  const bar = document.getElementById("hifzEditBar");
  if (!edit || !hifzIsActive() || hifzTab !== "progress") { bar.style.display = "none"; document.body.classList.remove("hifz-editing"); return; }
  const n = hifzPageEditCount();
  bar.innerHTML = `
    <span class="hifz-edit-count" aria-live="polite">${n ? `تغيير ${hifzPagesN(n)}` : "لا تغيير بعد"}</span>
    <button type="button" class="btn primary small" data-pe-save${n ? "" : " disabled"}>حفظ</button>
    <button type="button" class="btn ghost small" data-pe-cancel>إلغاء</button>`;
  bar.style.display = "flex";
  document.body.classList.add("hifz-editing");
}
function hifzStartPageEdit() {
  hifzPageEdit = { adds: new Map(), removes: new Set(), mode: "old", date: HifzStore.today(), openJuz: new Set() };
  hifzForm = {
    where: "panel", panel: "progress",
    isDirty: () => hifzPageEditCount() > 0,
    save: () => hifzSavePageEdit(true),
    discard: () => { hifzPageEdit = null; hifzForm = null; hifzSetEditBar(null); },
  };
  renderHifzProgress();
}
function hifzPageEditToggle(p) {
  const e = hifzPageEdit;
  if (HifzStore.has(p)) { if (e.removes.has(p)) e.removes.delete(p); else e.removes.add(p); }
  else if (e.adds.has(p)) e.adds.delete(p);
  else e.adds.set(p, e.mode === "old" ? null : e.date);
}
async function hifzSavePageEdit(fromLeave) {
  const e = hifzPageEdit;
  if (!e) return true;
  if (e.removes.size > 10) {
    if (fromLeave) { /* asked from «حفظ / تجاهل / البقاء»: still confirm the big removal */ }
    const v = await hifzAsk("مسح صفحات من المحفوظ", `ستُمسح ${hifzPagesN(e.removes.size)} من محفوظك، مع تواريخ حفظها. هل أنت متأكد؟`, [
      { label: `نعم، امسح ${hifzPagesN(e.removes.size)}`, value: "yes", cls: "danger" },
      { label: "رجوع", value: null },
    ]);
    if (v !== "yes") return false;
  }
  const adds = {};
  e.adds.forEach((d, p) => { adds[p] = d; });
  hifzPageEdit = null;
  hifzForm = null;
  HifzStore.applyPageEdits(adds, [...e.removes]);
  hifzSetEditBar(null);
  if (hifzIsActive()) renderHifzView();
  hifzToast("تم الحفظ ✓");
  return true;
}
function hifzCancelPageEdit() {
  hifzPageEdit = null;
  hifzForm = null;
  hifzSetEditBar(null);
  renderHifzProgress();
}
// «حفظ» from the leave question can't wait for the extra confirmation
// synchronously: it asks, and the caller stays until it's answered.
const hifzProgressPanel = document.getElementById("hifzPanel-progress");
hifzProgressPanel.addEventListener("click", (e) => {
  if (e.target.closest("[data-pe-start]")) {
    hifzStartPageEdit();
    const sec = hifzProgressPanel.querySelector('[data-sec="prog-pages"]');
    if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (e.target.closest("[data-resetup]")) { hifzWizardStart(true); renderHifzView(); return; }
  const ep = e.target.closest("[data-edit-page]");
  if (ep && hifzPageEdit) {
    const p = Number(ep.dataset.editPage);
    hifzPageEditToggle(p);
    const on = (HifzStore.has(p) && !hifzPageEdit.removes.has(p)) || hifzPageEdit.adds.has(p);
    ep.classList.toggle("on", on);
    ep.classList.toggle("changed", hifzPageEdit.adds.has(p) || hifzPageEdit.removes.has(p));
    ep.setAttribute("aria-pressed", String(on));
    hifzSetEditBar(hifzPageEdit);
    return;
  }
  const ja = e.target.closest("[data-edit-juz-all]");
  const jn = e.target.closest("[data-edit-juz-none]");
  if ((ja || jn) && hifzPageEdit) {
    const j = Number((ja || jn).dataset[ja ? "editJuzAll" : "editJuzNone"]);
    quranJuzPages(j).forEach((p) => {
      const on = (HifzStore.has(p) && !hifzPageEdit.removes.has(p)) || hifzPageEdit.adds.has(p);
      if (ja ? !on : on) hifzPageEditToggle(p);
    });
    hifzPageEdit.openJuz.add(j);
    renderHifzProgress();
    const b = hifzProgressPanel.querySelector(`[data-edit-juz-${ja ? "all" : "none"}="${j}"]`); if (b) b.focus();
    return;
  }
  const day = e.target.closest("[data-map-day]");
  if (day) { hifzOpenDayModal(day.dataset.mapDay); return; }
  const open = e.target.closest("[data-open-page]");
  if (open) { hifzOpenPage(Number(open.dataset.openPage)); return; }
  if (e.target.closest("[data-test-all]")) { hifzOpenTestModal("all"); }
});
// a juz opened while editing stays open when the list is drawn again
hifzProgressPanel.addEventListener("click", (e) => {
  const tg = e.target.closest("[data-sec-toggle]");
  if (!tg || !hifzPageEdit) return;
  const m = /^juz-(\d+)$/.exec(tg.dataset.secToggle);
  if (m) { const j = Number(m[1]); if (tg.getAttribute("aria-expanded") === "true") hifzPageEdit.openJuz.add(j); else hifzPageEdit.openJuz.delete(j); }
});
hifzProgressPanel.addEventListener("change", (e) => {
  if (!hifzPageEdit) return;
  if (e.target.name === "peMode") {
    hifzPageEdit.mode = e.target.value;
    document.getElementById("hifzPeDate").hidden = hifzPageEdit.mode !== "dated";
    hifzProgressPanel.querySelectorAll('input[name="peMode"]').forEach((r) => r.closest(".hifz-choice").classList.toggle("on", r.checked));
    hifzPageEdit.adds.forEach((_, p) => hifzPageEdit.adds.set(p, hifzPageEdit.mode === "old" ? null : hifzPageEdit.date));
  }
  if (e.target.id === "hifzPeDate") {
    const v = e.target.value;
    if (v && v <= HifzStore.today()) hifzPageEdit.date = v; else e.target.value = hifzPageEdit.date;
    hifzPageEdit.adds.forEach((_, p) => hifzPageEdit.adds.set(p, hifzPageEdit.mode === "old" ? null : hifzPageEdit.date));
  }
});
document.getElementById("hifzEditBar").addEventListener("click", (e) => {
  if (e.target.closest("[data-pe-save]")) hifzSavePageEdit(false);
  else if (e.target.closest("[data-pe-cancel]")) hifzCancelPageEdit();
});

// ============================================================
// ⋮ → 📗 حفظي (the Mushaf menu) and keeping everything current
// ============================================================
document.querySelectorAll(".quran-menu-item[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => {
    quranMenuDropdown.style.display = "none";
    quranMenuBtn.setAttribute("aria-expanded", "false");
    switchView(btn.dataset.view);
  });
});

if (typeof HifzStore !== "undefined") {
  let replanTimer = null;
  HifzStore.onChange(() => {
    quranUpdateHifzMark();
    if (hifzIsActive()) renderHifzView();
    // the reminders depend on what's memorized / reviewed
    if (typeof ItqanNotify !== "undefined" && ItqanNotify.remindersSupported()) {
      clearTimeout(replanTimer);
      replanTimer = setTimeout(() => ItqanNotify.replanReminders(), 1000);
    }
  });
}
// a new day may have started while the app was in the background
let hifzShownDay = typeof HifzStore !== "undefined" ? HifzStore.today() : null;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  const t = HifzStore.today();
  if (t !== hifzShownDay) { hifzShownDay = t; hifzSession = false; hifzMoreShown = 0; }
  quranUpdateHifzMark();
  if (hifzIsActive()) renderHifzView();
});

// The (older) quiz code still asks for this.
function hifzActiveReviewDay() { return HifzStore.today(); }

quranUpdateHifzMark();
if (hifzIsActive()) renderHifzView(); // opened straight on #hifz
