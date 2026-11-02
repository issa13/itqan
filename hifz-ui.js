// hifz-ui.js — 📗 حفظي: the memorization & review screen (its own tab).
//
//   • Two big buttons: «📖 تابع الحفظ» (opens the next page to memorize)
//     and «🔁 تابع المراجعة» (opens the Mushaf in review mode on the next
//     page due — «✅ راجعتها ← التالية» page by page).
//   • «🎯 اختبرني بكل محفوظاتي».
//   • 🔁 المراجعة — the review of a day (today, or an earlier day that
//     wasn't recorded), «القريب» + «البعيد», «➕ راجعت أكثر», and
//     «🎯 اختبر حفظك» on what you actually reviewed (or other sets):
//     📝 اختبار تدريبي (📝 اختبارات) or ⏱️ تحدٍّ مع نفسك (⚔️ ذاتي).
//   • 🎯 الحفظ — weekly goal; 🗺️ محفوظاتي — the per-juz map;
//     📊 إحصائيات.
// Data: hifz.js (HifzStore). Loaded after quran-reader.js.

const HIFZ_DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const HIFZ_TAB_KEY = "qf_hifz_tab";
const HIFZ_REVIEW_MODE_KEY = "qf_hifz_review_mode";
const HIFZ_MISSED_DISMISS_KEY = "qf_hifz_missed_dismissed";
const HIFZ_DAY_CHOICES = 14; // how many days back the day list offers

// "2026-11-06" → "الجمعة ٦/١١"
function hifzFmtDay(key, withName = true) {
  if (!key) return "";
  const [y, m, d] = key.split("-").map(Number);
  const name = HIFZ_DAY_NAMES[new Date(y, m - 1, d).getDay()];
  return `${withName ? name + " " : ""}${toArabicDigits(d)}/${toArabicDigits(m)}`;
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
  if (n <= 10) return `قبل ${toArabicDigits(n)} أيام`;
  return `قبل ${toArabicDigits(n)} يومًا`;
}
// "صفحة واحدة" / "صفحتان" / "٣ صفحات" / "١٢ صفحة"
function hifzPagesWord(n) {
  if (n === 1) return "صفحة واحدة";
  if (n === 2) return "صفحتان";
  if (n >= 3 && n <= 10) return `${toArabicDigits(n)} صفحات`;
  return `${toArabicDigits(n)} صفحة`;
}
function hifzToast(msg) { if (typeof showInfoToast === "function") showInfoToast(msg); }

// surah name for a page (the surah the page starts in), for the lists
let hifzSurahCatalog = null;
function hifzSurahName(page) {
  if (!hifzSurahCatalog) return "";
  let name = "";
  for (const s of hifzSurahCatalog) { if (s.startPage <= page) name = s.name; else break; }
  return name.replace(/^سُورَةُ\s*/, "");
}
fetchSurahCatalog().then((c) => {
  hifzSurahCatalog = (c || []).slice().sort((a, b) => a.number - b.number);
  if (hifzIsActive()) renderHifzView();
}).catch(() => {});

function hifzIsActive() { return typeof currentViewName !== "undefined" && currentViewName === "hifz"; }

// opens a page in the Mushaf
function hifzOpenPage(page) {
  switchView("quran");
  quranGoToPage(page);
}

// ============================================================
// the day being recorded in 🔁 المراجعة (today unless chosen)
// ============================================================
let hifzReviewDayValue = null; // null = today (follows the date when it changes)
function hifzSelectedDay() {
  const d = hifzReviewDayValue;
  return d && !HifzStore.reviewDayProblem(d) ? d : HifzStore.today();
}
function hifzSetReviewDay(day) {
  hifzReviewDayValue = day && day !== HifzStore.today() ? day : null;
  hifzMoreShown = 0;
}

// ============================================================
// 🔁 review mode in the Mushaf
// ============================================================
let hifzReviewMode = null; // { day }
try {
  const saved = JSON.parse(localStorage.getItem(HIFZ_REVIEW_MODE_KEY) || "null");
  if (saved && saved.day && !HifzStore.reviewDayProblem(saved.day)) hifzReviewMode = { day: saved.day };
} catch (e) { /* ignore */ }

function hifzActiveReviewDay() { return hifzReviewMode ? hifzReviewMode.day : HifzStore.today(); }

function hifzDueList(day) {
  const pl = HifzStore.planFor(day);
  return pl.near.concat(pl.far);
}
function hifzNextDue(day) {
  const next = hifzDueList(day).find((x) => !x.done);
  return next ? next.page : null;
}

function hifzStartReviewMode(day) {
  const next = hifzNextDue(day);
  if (!next) { hifzToast("✅ لا صفحات متبقية لهذا اليوم."); return; }
  hifzReviewMode = { day };
  try { localStorage.setItem(HIFZ_REVIEW_MODE_KEY, JSON.stringify(hifzReviewMode)); } catch (e) { /* ignore */ }
  hifzOpenPage(next);
  hifzSyncReviewBar();
  hifzToast("🔁 وضع المراجعة: راجع الصفحة ثم اضغط «✅ راجعتها» في الأسفل لتنتقل إلى التالية.");
}
function hifzStopReviewMode() {
  hifzReviewMode = null;
  try { localStorage.removeItem(HIFZ_REVIEW_MODE_KEY); } catch (e) { /* ignore */ }
  hifzSyncReviewBar();
  quranUpdateHifzMark();
}

const quranReviewBar = document.getElementById("quranReviewBar");
const quranReviewBarText = document.getElementById("quranReviewBarText");
const quranReviewBarMain = document.getElementById("quranReviewBarMain");

function hifzSyncReviewBar() {
  if (!quranReviewBar) return;
  const wasShown = quranReviewBar.style.display !== "none";
  if (hifzReviewMode && HifzStore.reviewDayProblem(hifzReviewMode.day)) hifzReviewMode = null; // too old now
  if (!hifzReviewMode) {
    quranReviewBar.style.display = "none";
    if (wasShown && typeof resizeQuranShell === "function") resizeQuranShell();
    return;
  }
  const day = hifzReviewMode.day;
  const due = hifzDueList(day);
  const done = due.filter((x) => x.done).length;
  const here = due.find((x) => x.page === currentQuranPage);
  const next = hifzNextDue(day);
  const dayWord = hifzDayWord(day);
  quranReviewBarText.textContent = `🔁 مراجعة ${dayWord}: ${toArabicDigits(done)}/${toArabicDigits(due.length)}`;
  let action, label;
  if (here && !here.done) {
    action = "mark";
    label = next === currentQuranPage && due.filter((x) => !x.done).length === 1 ? "✅ راجعتها" : "✅ راجعتها ← التالية";
  } else if (next) {
    action = "goto";
    label = here ? `التالية: ص ${toArabicDigits(next)} ←` : `↩️ إلى ص ${toArabicDigits(next)}`;
  } else {
    action = "finish";
    label = "🎉 أتممت — إنهاء";
  }
  quranReviewBarMain.dataset.action = action;
  quranReviewBarMain.dataset.page = next || "";
  quranReviewBarMain.textContent = label;
  quranReviewBarMain.classList.toggle("primary", action !== "goto");
  quranReviewBar.style.display = "flex";
  if (!wasShown && typeof resizeQuranShell === "function") resizeQuranShell();
}

quranReviewBarMain.addEventListener("click", () => {
  if (!hifzReviewMode) return;
  const day = hifzReviewMode.day;
  const action = quranReviewBarMain.dataset.action;
  if (action === "mark") {
    const res = HifzStore.setReviewed(currentQuranPage, true, day);
    if (!res.ok) { hifzToast("⚠️ " + res.reason); return; }
    const next = hifzNextDue(day);
    if (next) quranGoToPage(next);
    else hifzToast(`🎉 أتممت مراجعة ${hifzDayWord(day)} — تقبّل الله منك! يمكنك اختبار نفسك فيما راجعته من «📗 حفظي».`);
  } else if (action === "goto") {
    const p = parseInt(quranReviewBarMain.dataset.page, 10);
    if (p) quranGoToPage(p);
  } else {
    hifzStopReviewMode();
    switchView("hifz");
  }
});
document.getElementById("quranReviewBarClose").addEventListener("click", () => {
  hifzStopReviewMode();
  hifzToast("أُنهي وضع المراجعة — ما علّمته بقي مسجّلًا.");
});

// ============================================================
// the screen
// ============================================================
function hifzCurrentTab() {
  let t = null;
  try { t = localStorage.getItem(HIFZ_TAB_KEY); } catch (e) { /* ignore */ }
  return document.querySelector(`[data-hifz-panel="${t}"]`) ? t : "review";
}
function hifzShowTab(tab) {
  try { localStorage.setItem(HIFZ_TAB_KEY, tab); } catch (e) { /* ignore */ }
  document.querySelectorAll("[data-hifz-tab]").forEach((b) => {
    const on = b.dataset.hifzTab === tab;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on);
  });
  document.querySelectorAll("[data-hifz-panel]").forEach((p) => { p.style.display = p.dataset.hifzPanel === tab ? "" : "none"; });
}
document.querySelectorAll("[data-hifz-tab]").forEach((b) => b.addEventListener("click", () => {
  hifzShowTab(b.dataset.hifzTab);
  renderHifzView();
}));

function renderHifzView() {
  if (typeof HifzStore === "undefined") return;
  renderHifzActions();
  renderHifzMissed();
  const tab = hifzCurrentTab();
  hifzShowTab(tab);
  // only the visible tab is drawn (the map and the stats are big)
  if (tab === "review") renderHifzReview();
  else if (tab === "plan") renderHifzPlan();
  else if (tab === "pages") renderHifzPages();
  else if (tab === "stats") renderHifzStats();
}
// kept for older callers (notify.js opened the old window by this name)
function renderQuranHifz() { renderHifzView(); }

// ---------- the two big buttons ----------
function renderHifzActions() {
  const memSub = document.getElementById("hifzContinueMemSub");
  const memBtn = document.getElementById("hifzContinueMemBtn");
  const next = HifzStore.nextToMemorize();
  if (next) {
    memBtn.querySelector(".hifz-action-title").textContent = "📖 تابع الحفظ";
    memSub.textContent = `ص ${toArabicDigits(next.page)}${hifzSurahName(next.page) ? " — " + hifzSurahName(next.page) : ""} (بعد ص ${toArabicDigits(next.after)})`;
  } else {
    memBtn.querySelector(".hifz-action-title").textContent = HifzStore.count() ? "📖 تابع الحفظ" : "📖 ابدأ الحفظ";
    memSub.textContent = "يفتح المصحف حيث توقفت — بعد الحفظ اضغط 📗 تحت الصفحة";
  }

  const revTitle = document.getElementById("hifzContinueRevTitle");
  const revSub = document.getElementById("hifzContinueRevSub");
  const revBtn = document.getElementById("hifzContinueRevBtn");
  revBtn.classList.remove("done");
  if (!HifzStore.count()) {
    revTitle.textContent = "🔁 تابع المراجعة";
    revSub.textContent = "علّم محفوظاتك أولًا لتظهر مراجعتك";
    return;
  }
  const pl = HifzStore.todayPlan();
  if (!pl.dueCount) {
    revTitle.textContent = "🔁 تابع المراجعة";
    revSub.textContent = "لا مراجعة مطلوبة اليوم";
  } else if (pl.doneCount >= pl.dueCount) {
    revBtn.classList.add("done");
    revTitle.textContent = "✅ أتممت مراجعة اليوم";
    revSub.textContent = `${hifzPagesWord(pl.doneCount)} — يمكنك «➕ راجعت أكثر» في الأسفل`;
  } else {
    const n = hifzNextDue(HifzStore.today());
    revTitle.textContent = "🔁 تابع المراجعة";
    revSub.textContent = `ص ${toArabicDigits(n)} — أنجزت ${toArabicDigits(pl.doneCount)} من ${toArabicDigits(pl.dueCount)} اليوم`;
  }
}

document.getElementById("hifzContinueMemBtn").addEventListener("click", () => {
  const next = HifzStore.nextToMemorize();
  if (next) {
    hifzOpenPage(next.page);
    hifzToast("📖 بعد أن تحفظ الصفحة اضغط 📗 تحتها لتسجيلها بتاريخ اليوم.");
    return;
  }
  let page = 1;
  try { page = parseInt(localStorage.getItem("qf_quran_last_page"), 10) || 1; } catch (e) { /* ignore */ }
  hifzOpenPage(page);
  hifzToast("📖 بعد أن تحفظ صفحة اضغط 📗 تحتها لتسجيلها.");
});

document.getElementById("hifzContinueRevBtn").addEventListener("click", () => {
  if (!HifzStore.count()) { hifzShowTab("pages"); renderHifzView(); return; }
  const today = HifzStore.today();
  if (hifzNextDue(today)) { hifzStartReviewMode(today); return; }
  // done (or nothing due): show today's list, where «➕ راجعت أكثر» is
  hifzSetReviewDay(null);
  hifzShowTab("review");
  renderHifzView();
  document.getElementById("hifzReviewLists").scrollIntoView({ behavior: "smooth", block: "start" });
});

document.getElementById("hifzTestAllBtn").addEventListener("click", async () => {
  if (!HifzStore.count()) { hifzToast("علّم محفوظاتك أولًا من «🗺️ محفوظاتي»."); hifzShowTab("pages"); renderHifzView(); return; }
  rangeSelect.value = "memorized";
  showHideCustomRange();
  await refreshQuestionTypeAvailability();
  switchView("home");
  hifzToast(`📝 الأسئلة من كل محفوظاتك (${hifzPagesWord(HifzStore.count())}) — اختر نوع السؤال واضغط «سؤال جديد».`);
});

// ---------- «you didn't record the last few days» ----------
function renderHifzMissed() {
  const box = document.getElementById("hifzMissedBanner");
  const missed = HifzStore.missedDays();
  let dismissed = null;
  try { dismissed = localStorage.getItem(HIFZ_MISSED_DISMISS_KEY); } catch (e) { /* ignore */ }
  if (!missed.length || dismissed === HifzStore.today() || hifzReviewDayValue) { box.style.display = "none"; return; }
  const last = HifzStore.lastReviewDay();
  box.innerHTML = `
    <span>📅 آخر مراجعة سجّلتها كانت <b>${hifzDayWord(last)}</b> (${hifzAgo(last)}). إن كنت راجعت بعدها ولم تسجّل، سجّلها الآن لتبقى خطتك وإحصائياتك صحيحة.</span>
    <span class="hifz-note-btns">
      <button type="button" class="btn small" data-missed-day="${missed[0]}">📅 سجّل يوم ${hifzFmtDay(missed[0])}</button>
      <button type="button" class="btn small ghost" data-missed-dismiss>لاحقًا</button>
    </span>`;
  box.style.display = "";
}
document.getElementById("hifzMissedBanner").addEventListener("click", (e) => {
  const d = e.target.closest("[data-missed-day]");
  if (d) {
    hifzSetReviewDay(d.dataset.missedDay);
    hifzShowTab("review");
    renderHifzView();
    document.getElementById("hifzReviewDay").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (e.target.closest("[data-missed-dismiss]")) {
    try { localStorage.setItem(HIFZ_MISSED_DISMISS_KEY, HifzStore.today()); } catch (err) { /* ignore */ }
    renderHifzMissed();
  }
});

// ============================================================
// 🔁 المراجعة
// ============================================================
let hifzMoreShown = 0; // how many of «➕ راجعت أكثر»'s pages are listed

function hifzRow(page, done, note) {
  const surah = hifzSurahName(page);
  return `
    <div class="hifz-rev-row${done ? " done" : ""}">
      <button type="button" class="hifz-rev-check" data-rev-page="${page}" aria-pressed="${done}" aria-label="${done ? `ص ${page}: راجعتها — اضغط للتراجع` : `ص ${page}: علّمها كمراجَعة`}">${done ? "✓" : ""}</button>
      <button type="button" class="hifz-rev-open" data-goto-page="${page}" title="افتح الصفحة في المصحف">
        <b>ص ${toArabicDigits(page)}</b>${surah ? ` <span>${surah}</span>` : ""}
        <small>${note}</small>
      </button>
    </div>`;
}

function hifzReviewNote(page, day) {
  const info = HifzStore.info(page);
  if (HifzStore.isReviewedOn(page, day)) return "✅ راجعتها";
  const before = info.r && info.r < day ? info.r : null;
  if (before) return `آخر مراجعة ${hifzAgo(before)}`;
  if (info.m) return `حُفظت ${hifzAgo(info.m)}`;
  return "لم تُراجَع بعد";
}

function renderHifzDaySelect() {
  const sel = document.getElementById("hifzReviewDay");
  const t = HifzStore.today();
  const day = hifzSelectedDay();
  let html = "";
  for (let i = 0; i < HIFZ_DAY_CHOICES; i++) {
    const d = HifzStore.addDays(t, -i);
    const n = HifzStore.reviewedOn(d).length;
    const word = i === 0 ? `اليوم (${hifzFmtDay(d)})` : i === 1 ? `أمس (${hifzFmtDay(d)})` : hifzFmtDay(d);
    html += `<option value="${d}">${word}${n ? ` — ✅ ${hifzPagesWord(n)}` : ""}</option>`;
  }
  sel.innerHTML = html;
  sel.value = day;
  const note = document.getElementById("hifzPastDayNote");
  if (day !== t) {
    note.innerHTML = `<span>📅 أنت تسجّل الآن مراجعة <b>${hifzFmtDay(day)}</b> (${hifzAgo(day)}). علامات ✅ تُحسب لذلك اليوم في الخطة والروزنامة والسلسلة.</span>
      <span class="hifz-note-btns"><button type="button" class="btn small ghost" data-back-today>↩️ ارجع إلى اليوم</button></span>`;
    note.style.display = "";
  } else {
    note.style.display = "none";
  }
}
document.getElementById("hifzReviewDay").addEventListener("change", (e) => {
  hifzSetReviewDay(e.target.value);
  renderHifzView();
});
document.getElementById("hifzPastDayNote").addEventListener("click", (e) => {
  if (e.target.closest("[data-back-today]")) { hifzSetReviewDay(null); renderHifzView(); }
});

function renderHifzReview() {
  const head = document.getElementById("hifzReviewHead");
  const lists = document.getElementById("hifzReviewLists");
  const plan = HifzStore.getPlan();
  renderHifzReviewSettings();
  renderHifzDaySelect();
  renderHifzTestCard();
  if (!HifzStore.count()) {
    head.innerHTML = `
      <div class="hifz-card-title">🔁 المراجعة</div>
      <div class="hifz-card-line">علّم الصفحات التي تحفظها أولًا، ثم تظهر هنا مراجعة كل يوم.</div>
      <button type="button" class="btn small" data-hifz-goto-tab="pages">🗺️ علّم محفوظاتي</button>`;
    lists.innerHTML = "";
    return;
  }
  const day = hifzSelectedDay();
  const isToday = day === HifzStore.today();
  const tp = HifzStore.planFor(day);
  const pct = tp.dueCount ? Math.min(100, Math.round((tp.doneCount / tp.dueCount) * 100)) : 100;
  const complete = tp.dueCount > 0 && tp.doneCount >= tp.dueCount;
  const left = tp.dueCount - tp.doneCount;
  head.innerHTML = `
    <div class="hifz-card-title">🔁 مراجعة ${isToday ? "اليوم" : hifzFmtDay(day)}</div>
    <div class="hifz-goal-count"><b>${toArabicDigits(tp.doneCount)}</b> / ${toArabicDigits(tp.dueCount)} ${tp.dueCount === 1 ? "صفحة" : "صفحات"}${tp.extra.length ? ` <span class="hifz-extra-badge">+${toArabicDigits(tp.extra.length)} زيادة ⭐</span>` : ""}</div>
    <div class="hifz-bar big${complete ? " done" : ""}"><i style="width:${pct}%"></i></div>
    ${!tp.dueCount ? `<div class="hifz-card-line">لا مراجعة مطلوبة في هذا اليوم.</div>`
      : complete ? `<div class="hifz-card-line ok">✅ أتممت مراجعة ${isToday ? "اليوم" : "هذا اليوم"} — تقبّل الله منك!</div>`
      : `<div class="hifz-card-line">علّم ✅ كل صفحة راجعتها، أو راجعها في المصحف صفحة صفحة:</div>
         <button type="button" class="btn small primary" data-start-review>▶️ راجع بالمصحف (${hifzPagesWord(left)} متبقية)</button>`}`;

  let html = "";
  if (tp.near.length) {
    const n = tp.near.filter((x) => x.done).length;
    html += `<div class="hifz-rev-section"><div class="hifz-rev-title">🆕 القريب <small>— ما حفظته في آخر ${toArabicDigits(plan.nearDays)} ${plan.nearDays === 1 ? "يوم" : plan.nearDays <= 10 ? "أيام" : "يومًا"}، يُراجَع كل يوم</small> <span class="hifz-rev-count">${toArabicDigits(n)}/${toArabicDigits(tp.near.length)}</span></div>
      ${tp.near.map((x) => hifzRow(x.page, x.done, x.done ? "✅ راجعتها" : `حُفظت ${hifzAgo(HifzStore.info(x.page).m)}`)).join("")}</div>`;
  }
  if (tp.far.length) {
    const n = tp.far.filter((x) => x.done).length;
    html += `<div class="hifz-rev-section"><div class="hifz-rev-title">📚 البعيد <small>— بالدور، الدورة كاملة كل ${toArabicDigits(tp.cycleDays)} ${tp.cycleDays === 1 ? "يوم" : tp.cycleDays <= 10 ? "أيام" : "يومًا"}</small> <span class="hifz-rev-count">${toArabicDigits(n)}/${toArabicDigits(tp.far.length)}</span></div>
      ${tp.far.map((x) => hifzRow(x.page, x.done, hifzReviewNote(x.page, day))).join("")}</div>`;
  }
  if (tp.extra.length) {
    html += `<div class="hifz-rev-section"><div class="hifz-rev-title">⭐ راجعت زيادة <small>— تتقدّم بها الدورة</small></div>
      ${tp.extra.map((x) => hifzRow(x.page, true, "✅ راجعتها")).join("")}</div>`;
  }
  if (tp.more.length) {
    const shown = tp.more.slice(0, hifzMoreShown);
    html += `<div class="hifz-rev-section">
      <button type="button" class="btn small ghost hifz-more-btn" id="hifzMoreBtn" aria-expanded="${!!hifzMoreShown}">${hifzMoreShown ? "▲ إخفاء الصفحات التالية" : "➕ راجعت أكثر من المطلوب"}</button>
      ${hifzMoreShown ? `<div class="modal-hint">الصفحات التالية في الدور — علّم ما راجعته منها:</div>
        ${shown.map((p) => hifzRow(p, false, hifzReviewNote(p, day))).join("")}
        ${tp.more.length > hifzMoreShown ? `<button type="button" class="btn small ghost" id="hifzMoreMoreBtn">المزيد (${toArabicDigits(tp.more.length - hifzMoreShown)})</button>` : ""}` : ""}
    </div>`;
  }
  lists.innerHTML = html;
}

document.getElementById("hifzReviewHead").addEventListener("click", (e) => {
  if (e.target.closest("[data-start-review]")) hifzStartReviewMode(hifzSelectedDay());
});

document.getElementById("hifzReviewLists").addEventListener("click", (e) => {
  const check = e.target.closest("[data-rev-page]");
  if (check) {
    const p = parseInt(check.dataset.revPage, 10);
    const day = hifzSelectedDay();
    const res = HifzStore.setReviewed(p, !HifzStore.isReviewedOn(p, day), day);
    if (!res.ok) hifzToast("⚠️ " + res.reason);
    return;
  }
  const go = e.target.closest("[data-goto-page]");
  if (go) { hifzOpenPage(parseInt(go.dataset.gotoPage, 10)); return; }
  if (e.target.closest("#hifzMoreBtn")) { hifzMoreShown = hifzMoreShown ? 0 : 10; renderHifzReview(); return; }
  if (e.target.closest("#hifzMoreMoreBtn")) { hifzMoreShown += 10; renderHifzReview(); }
});

document.querySelector('[data-hifz-panel="review"]').addEventListener("click", (e) => {
  const t = e.target.closest("[data-hifz-goto-tab]");
  if (t) { hifzShowTab(t.dataset.hifzGotoTab); renderHifzView(); }
});

function renderHifzReviewSettings() {
  const plan = HifzStore.getPlan();
  const set = (id, v) => { const el = document.getElementById(id); if (document.activeElement !== el) el.value = v; };
  set("hifzNearDays", plan.nearDays);
  set("hifzFarPages", plan.farPages);
  set("hifzFarDays", plan.farDays);
  document.querySelectorAll('input[name="hifzFarMode"]').forEach((r) => { r.checked = r.value === plan.farMode; });
  document.getElementById("hifzFarPages").disabled = plan.farMode !== "pages";
  document.getElementById("hifzFarDays").disabled = plan.farMode !== "days";
  const tp = HifzStore.todayPlan();
  document.getElementById("hifzFarCalc").textContent = !tp.farCount
    ? "لا صفحات في «البعيد» بعد."
    : plan.farMode === "pages"
      ? `= ${toArabicDigits(tp.farCount)} صفحة في «البعيد» ← دورة كاملة كل ${toArabicDigits(tp.cycleDays)} ${tp.cycleDays === 1 ? "يوم" : "أيام"}`
      : `= ${toArabicDigits(tp.farCount)} صفحة في «البعيد» ← ${toArabicDigits(tp.quota)} ${tp.quota === 1 ? "صفحة" : "صفحات"} كل يوم`;
  const native = typeof ItqanNotify !== "undefined" && ItqanNotify.remindersSupported();
  document.getElementById("hifzPlanReminderRow").style.display = native ? "" : "none";
  document.getElementById("hifzPlanReminderWebNote").style.display = native ? "none" : "";
  if (native) {
    const r = ItqanNotify.getReminders().plan;
    document.getElementById("hifzPlanReminderOn").checked = r.on;
    const time = document.getElementById("hifzPlanReminderTime");
    time.value = r.time;
    time.disabled = !r.on;
  }
}


// ---------- 🎯 اختبر حفظك ----------
let hifzQuizSourceValue = "reviewed";

function hifzQuizSources() {
  const day = hifzSelectedDay();
  const plan = HifzStore.getPlan();
  const dayShort = day === HifzStore.today() ? "اليوم" : day === HifzStore.addDays(HifzStore.today(), -1) ? "أمس" : hifzFmtDay(day, false);
  const list = [
    { value: "reviewed", pages: HifzStore.reviewedOn(day), label: `✅ ما راجعته ${dayShort}`, name: `ما راجعته ${dayShort}`,
      empty: `لم تعلّم ✅ أي صفحة راجعتها ${dayShort} بعد — علّم ما راجعته في القائمة أعلاه، أو اختر مصدرًا آخر.` },
    { value: "m2", pages: HifzStore.memorizedWithin(2), label: "🆕 ما حفظته آخر يومين", name: "محفوظ آخر يومين" },
    { value: "m3", pages: HifzStore.memorizedWithin(3), label: "🆕 ما حفظته آخر ٣ أيام", name: "محفوظ آخر ٣ أيام" },
    { value: "m7", pages: HifzStore.memorizedWithin(7), label: "🆕 ما حفظته آخر أسبوع", name: "محفوظ آخر أسبوع" },
  ];
  if (plan.nearDays && ![2, 3, 7].includes(plan.nearDays)) {
    list.push({ value: "near", pages: HifzStore.memorizedWithin(plan.nearDays), label: `🆕 «القريب» (آخر ${toArabicDigits(plan.nearDays)} يومًا)`, name: "القريب" });
  }
  list.push({ value: "all", pages: Array.from(HifzStore.all()), label: "📚 كل محفوظاتي", name: "كل محفوظاتي",
    empty: "لا محفوظات بعد — علّم ما تحفظه من «🗺️ محفوظاتي»." });
  list.forEach((s) => { if (!s.empty) s.empty = "لم تسجّل حفظ صفحات بتاريخ في هذه المدة."; });
  return list;
}

function renderHifzTestCard() {
  const sel = document.getElementById("hifzQuizSource");
  const sources = hifzQuizSources();
  if (!sources.some((s) => s.value === hifzQuizSourceValue)) hifzQuizSourceValue = "reviewed";
  sel.innerHTML = sources.map((s) => `<option value="${s.value}">${s.label} (${toArabicDigits(s.pages.length)})</option>`).join("");
  sel.value = hifzQuizSourceValue;
  const src = sources.find((s) => s.value === hifzQuizSourceValue);
  const hint = document.getElementById("hifzQuizHint");
  const ok = src.pages.length > 0;
  if (!ok) {
    hint.textContent = src.empty;
    hint.classList.add("warn");
  } else {
    const shown = src.pages.slice(0, 12).map((p) => toArabicDigits(p)).join("، ");
    hint.textContent = `الأسئلة من ${hifzPagesWord(src.pages.length)}: ص ${shown}${src.pages.length > 12 ? "…" : ""}`;
    hint.classList.remove("warn");
  }
  document.getElementById("hifzPracticeBtn").disabled = !ok;
  document.getElementById("hifzChallengeBtn").disabled = !ok;
}
function hifzCurrentSource() {
  return hifzQuizSources().find((s) => s.value === hifzQuizSourceValue) || null;
}
document.getElementById("hifzQuizSource").addEventListener("change", (e) => {
  hifzQuizSourceValue = e.target.value;
  renderHifzTestCard();
});
document.getElementById("hifzPracticeBtn").addEventListener("click", async () => {
  const src = hifzCurrentSource();
  if (!src || !src.pages.length) return;
  await startHifzQuiz(src.pages, src.name);
  hifzToast(`📝 الأسئلة من «${src.name}» (${hifzPagesWord(src.pages.length)}) — اختر نوع السؤال واضغط «سؤال جديد».`);
});
document.getElementById("hifzChallengeBtn").addEventListener("click", async () => {
  const src = hifzCurrentSource();
  if (!src || !src.pages.length) return;
  await openSelfChallengeOnPages(src.pages, src.name);
});

function hifzNumSetting(id, key, lo, hi) {
  document.getElementById(id).addEventListener("change", (e) => {
    const v = Math.max(lo, Math.min(hi, parseInt(e.target.value, 10) || lo));
    e.target.value = v;
    HifzStore.setPlan({ [key]: v });
  });
}
hifzNumSetting("hifzNearDays", "nearDays", 0, 90);
hifzNumSetting("hifzFarPages", "farPages", 1, 100);
hifzNumSetting("hifzFarDays", "farDays", 1, 365);
document.querySelectorAll('input[name="hifzFarMode"]').forEach((r) => r.addEventListener("change", () => {
  if (r.checked) HifzStore.setPlan({ farMode: r.value });
}));

async function hifzApplyReminder(kind, patch) {
  const res = await ItqanNotify.setReminder(kind, patch);
  if (res && !res.ok && typeof showInfoToast === "function") {
    showInfoToast(res.reason === "permission" ? "⚠️ الإشعارات مرفوضة — فعّلها من إعدادات الهاتف ثم أعد المحاولة." : "⚠️ تعذّر ضبط التذكير، حاول مرة أخرى.");
  }
  renderHifzView();
  if (typeof renderReminderSettings === "function") renderReminderSettings();
}
document.getElementById("hifzPlanReminderOn").addEventListener("change", (e) => {
  hifzApplyReminder("plan", { on: e.target.checked, time: document.getElementById("hifzPlanReminderTime").value });
});
document.getElementById("hifzPlanReminderTime").addEventListener("change", (e) => {
  if (/^\d{2}:\d{2}$/.test(e.target.value)) hifzApplyReminder("plan", { time: e.target.value });
});


// ---------- 🎯 خطة الحفظ ----------
function renderHifzPlan() {
  const card = document.getElementById("hifzGoalCard");
  const w = HifzStore.weekInfo();
  const plan = HifzStore.getPlan();
  const week = HifzStore.all();
  const thisWeek = Array.from(week).filter((p) => {
    const m = HifzStore.info(p).m;
    return m && m >= w.start && m <= w.end;
  });
  const chips = thisWeek.length
    ? `<div class="hifz-week-pages">${thisWeek.map((p) => `<button type="button" class="hifz-page on dated" data-goto-page="${p}" title="${hifzFmtDay(HifzStore.info(p).m)}">${toArabicDigits(p)}</button>`).join("")}</div>`
    : "";
  const range = `${hifzFmtDay(w.start)} – ${hifzFmtDay(w.end)}`;
  if (!w.goal) {
    card.innerHTML = `
      <div class="hifz-card-title">🎯 هذا الأسبوع <small>(${range})</small></div>
      <div class="hifz-card-line">حفظت <b>${toArabicDigits(w.done)}</b> ${w.done === 1 ? "صفحة" : "صفحات"} — لم تحدّد هدفًا أسبوعيًا بعد.</div>
      <button type="button" class="btn small ghost" id="hifzSetGoalBtn">🎯 حدّد هدفًا</button>
      ${chips}`;
    document.getElementById("hifzSetGoalBtn").addEventListener("click", () => {
      const det = document.getElementById("hifzPlanSettings");
      det.open = true;
      document.getElementById("hifzGoalInput").focus();
    });
  } else {
    const pct = Math.min(100, Math.round((w.done / w.goal) * 100));
    const left = Math.max(0, w.goal - w.done);
    const status = left === 0
      ? `<div class="hifz-card-line ok">✅ أتممت هدف هذا الأسبوع — بارك الله فيك!${w.done > w.goal ? ` (${toArabicDigits(w.done - w.goal)} زيادة)` : ""}</div>`
      : `<div class="hifz-card-line">باقي <b>${toArabicDigits(left)}</b> ${left === 1 ? "صفحة" : "صفحات"}، ${w.daysLeft === 1 ? "اليوم آخر يوم" : `${toArabicDigits(w.daysLeft)} أيام متبقية`} (حتى ${hifzFmtDay(w.end)})</div>`;
    card.innerHTML = `
      <div class="hifz-card-title">🎯 هدف هذا الأسبوع <small>(${range})</small></div>
      <div class="hifz-goal-count"><b>${toArabicDigits(w.done)}</b> / ${toArabicDigits(w.goal)} صفحات</div>
      <div class="hifz-bar big${left === 0 ? " done" : ""}"><i style="width:${pct}%"></i></div>
      ${status}
      ${chips}`;
  }
  card.querySelectorAll("[data-goto-page]").forEach((b) => b.addEventListener("click", () => {
    hifzOpenPage(parseInt(b.dataset.gotoPage, 10));
  }));

  // settings (don't overwrite a field while it's being typed in)
  const goalInput = document.getElementById("hifzGoalInput");
  if (document.activeElement !== goalInput) goalInput.value = plan.weeklyGoal;
  document.getElementById("hifzWeekStart").value = String(plan.weekStart);
  const dateInput = document.getElementById("hifzQuickAddDate");
  if (!dateInput.value) dateInput.value = HifzStore.today();
  dateInput.max = HifzStore.today();

  const native = typeof ItqanNotify !== "undefined" && ItqanNotify.remindersSupported();
  document.getElementById("hifzGoalReminderRow").style.display = native ? "" : "none";
  document.getElementById("hifzGoalReminderHint").style.display = native ? "" : "none";
  document.getElementById("hifzGoalReminderWebNote").style.display = native ? "none" : "";
  if (native) {
    const r = ItqanNotify.getReminders().goal;
    document.getElementById("hifzGoalReminderOn").checked = r.on;
    const time = document.getElementById("hifzGoalReminderTime");
    time.value = r.time;
    time.disabled = !r.on;
  }
}

document.getElementById("hifzGoalInput").addEventListener("change", async (e) => {
  const before = HifzStore.getPlan().weeklyGoal;
  const v = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
  e.target.value = v;
  HifzStore.setPlan({ weeklyGoal: v });
  // first goal in the phone app → offer the reminder straight away
  if (!before && v && typeof ItqanNotify !== "undefined" && ItqanNotify.remindersSupported() && !ItqanNotify.getReminders().goal.on) {
    const res = await ItqanNotify.setReminder("goal", { on: true });
    if (res && res.ok && typeof showInfoToast === "function") showInfoToast("⏰ سنذكّرك إن تأخرت عن هدف الأسبوع — يمكنك تغيير ذلك هنا.");
    renderHifzPlan();
  }
});
document.getElementById("hifzWeekStart").addEventListener("change", (e) => {
  HifzStore.setPlan({ weekStart: parseInt(e.target.value, 10) });
});
async function hifzApplyGoalReminder(patch) {
  const res = await ItqanNotify.setReminder("goal", patch);
  if (res && !res.ok && typeof showInfoToast === "function") {
    showInfoToast(res.reason === "permission" ? "⚠️ الإشعارات مرفوضة — فعّلها من إعدادات الهاتف ثم أعد المحاولة." : "⚠️ تعذّر ضبط التذكير، حاول مرة أخرى.");
  }
  renderHifzPlan();
  if (typeof renderReminderSettings === "function") renderReminderSettings();
}
document.getElementById("hifzGoalReminderOn").addEventListener("change", (e) => {
  hifzApplyGoalReminder({ on: e.target.checked, time: document.getElementById("hifzGoalReminderTime").value });
});
document.getElementById("hifzGoalReminderTime").addEventListener("change", (e) => {
  if (/^\d{2}:\d{2}$/.test(e.target.value)) hifzApplyGoalReminder({ time: e.target.value });
});

document.getElementById("hifzQuickAddForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("hifzQuickAddPage");
  const page = parseInt(input.value, 10);
  if (!(page >= 1 && page <= 604)) { hifzToast("⚠️ اكتب رقم صفحة من ١ إلى ٦٠٤."); input.focus(); return; }
  const date = document.getElementById("hifzQuickAddDate").value || HifzStore.today();
  const was = HifzStore.has(page);
  HifzStore.setMany([page], true, date);
  input.value = "";
  if (typeof showInfoToast === "function") {
    showInfoToast(was
      ? `📅 تاريخ حفظ الصفحة ${toArabicDigits(page)}: ${hifzFmtDay(date)}`
      : `✅ الصفحة ${toArabicDigits(page)} ضمن محفوظاتك (${hifzFmtDay(date)})`);
  }
});

// ---------- 🗺️ محفوظاتي ----------
function hifzMarkDate() {
  const mode = document.querySelector('input[name="hifzMarkMode"]:checked');
  if (mode && mode.value === "old") return null;
  return document.getElementById("hifzMarkDate").value || HifzStore.today();
}

function renderHifzPages() {
  const summary = document.getElementById("quranHifzSummary");
  const list = document.getElementById("quranHifzList");
  const dateInput = document.getElementById("hifzMarkDate");
  if (!dateInput.value) dateInput.value = HifzStore.today();
  dateInput.max = HifzStore.today();
  const openJuz = new Set(Array.from(list.querySelectorAll("details[open]")).map((d) => d.dataset.juz));
  const total = HifzStore.count();
  const pct = Math.round((total / 604) * 100);
  let fullJuz = 0;
  let rows = "";
  for (let j = 1; j <= 30; j++) {
    const pages = quranJuzPages(j);
    const done = pages.filter((p) => HifzStore.has(p)).length;
    if (done === pages.length) fullJuz++;
    const jp = Math.round((done / pages.length) * 100);
    const chips = pages.map((p) => {
      const info = HifzStore.info(p);
      const title = info ? (info.m ? `حُفظت ${hifzFmtDay(info.m)}` : "حفظ قديم") : "";
      return `<button type="button" class="hifz-page${info ? " on" : ""}${info && info.m ? " dated" : ""}" data-page="${p}" aria-pressed="${!!info}" title="${title}">${toArabicDigits(p)}</button>`;
    }).join("");
    rows += `
      <details class="hifz-juz" data-juz="${j}"${openJuz.has(String(j)) ? " open" : ""}>
        <summary>
          <span class="hifz-juz-name">الجزء ${toArabicDigits(j)}</span>
          <span class="hifz-bar"><i style="width:${jp}%"></i></span>
          <span class="hifz-juz-count">${toArabicDigits(done)}/${toArabicDigits(pages.length)}</span>
        </summary>
        <div class="hifz-pages">${chips}</div>
        <div class="hifz-juz-actions">
          <button type="button" class="btn small ghost" data-juz-all="${j}">✅ تحديد الجزء كله</button>
          <button type="button" class="btn small ghost" data-juz-none="${j}">إلغاء التحديد</button>
        </div>
      </details>`;
  }
  summary.innerHTML = `
    <div class="hifz-total"><b>${toArabicDigits(total)}</b> صفحة من ٦٠٤ (${toArabicDigits(pct)}٪)، ${toArabicDigits(fullJuz)} جزء كامل</div>
    <div class="hifz-bar big"><i style="width:${pct}%"></i></div>`;
  list.innerHTML = rows;
}

document.querySelectorAll('input[name="hifzMarkMode"]').forEach((r) => r.addEventListener("change", () => {
  document.getElementById("hifzMarkDate").disabled = hifzMarkDate() === null;
}));

document.getElementById("quranHifzList").addEventListener("click", (e) => {
  const pageBtn = e.target.closest(".hifz-page");
  if (pageBtn) { HifzStore.toggle(parseInt(pageBtn.dataset.page, 10), hifzMarkDate()); return; }
  const all = e.target.closest("[data-juz-all]");
  if (all) {
    // only the pages not marked yet get the chosen date
    const pages = quranJuzPages(parseInt(all.dataset.juzAll, 10)).filter((p) => !HifzStore.has(p));
    HifzStore.setMany(pages, true, hifzMarkDate());
    return;
  }
  const none = e.target.closest("[data-juz-none]");
  if (none) HifzStore.setMany(quranJuzPages(parseInt(none.dataset.juzNone, 10)), false);
});


// ---------- 📊 الإحصائيات ----------
function renderHifzStats() {
  const box = document.getElementById("hifzStats");
  const st = HifzStore.stats();
  const plan = HifzStore.getPlan();
  const t = HifzStore.today();
  if (!st.total) {
    box.innerHTML = `<div class="modal-hint">علّم محفوظاتك أولًا لتظهر الإحصائيات.</div>`;
    return;
  }
  const pct = Math.round((st.total / 604) * 100);
  const tile = (icon, value, label) => `<div class="hifz-tile"><div class="hifz-tile-v">${icon} ${value}</div><div class="hifz-tile-l">${label}</div></div>`;

  // weeks since the first dated page (at most the 12 shown)
  const firstDated = Array.from(HifzStore.all()).map((p) => HifzStore.info(p).m).filter(Boolean).sort()[0] || null;
  const weeksShown = st.weeks.filter((w) => firstDated && HifzStore.addDays(w.start, 6) >= firstDated);
  const pastWeeks = weeksShown.slice(0, -1); // the current week isn't over yet
  const goalWeeks = plan.weeklyGoal ? pastWeeks.filter((w) => w.goalMet).length : null;
  // projection: average of the last 4 finished weeks
  const recent = pastWeeks.slice(-4);
  const avg = recent.length ? recent.reduce((s, w) => s + w.count, 0) / recent.length : 0;
  const left = 604 - st.total;
  let projection = "";
  if (avg > 0 && left > 0) {
    const weeks = Math.ceil(left / avg);
    // Arabic counted noun: 1–2 / 3–10 / 11+
    const counted = (n, one, two, few, many) => n === 1 ? one : n === 2 ? two : n <= 10 ? `${toArabicDigits(n)} ${few}` : `${toArabicDigits(n)} ${many}`;
    const months = Math.max(1, Math.round(weeks / 4.35));
    const years = Math.max(1, Math.round(weeks / 52));
    const when = weeks < 9 ? counted(weeks, "أسبوع", "أسبوعين", "أسابيع", "أسبوعًا")
      : weeks < 104 ? `${counted(months, "شهر", "شهرين", "أشهر", "شهرًا")} تقريبًا`
      : `${counted(years, "سنة", "سنتين", "سنوات", "سنة")} تقريبًا`;
    projection = `<div class="hifz-card-line">📈 بمعدّلك في آخر ${toArabicDigits(recent.length)} ${recent.length <= 2 ? "أسبوع" : "أسابيع"} (${toArabicDigits(Math.round(avg * 10) / 10).replace(".", "٫")} صفحة في الأسبوع) تُتمّ حفظ القرآن كله بعد نحو ${when} بإذن الله.</div>`;
  } else if (left === 0) {
    projection = `<div class="hifz-card-line ok">🎉 حفظت القرآن كاملًا — بارك الله فيك وجعله حجّة لك!</div>`;
  }

  // 📈 pages memorized per week (12 weeks)
  const maxW = Math.max(plan.weeklyGoal, ...st.weeks.map((w) => w.count), 1);
  const bars = st.weeks.map((w, i) => {
    const h = Math.round((w.count / maxW) * 100);
    const current = i === st.weeks.length - 1;
    const [, m, d] = w.start.split("-").map(Number);
    return `<div class="hifz-wbar${current ? " current" : ""}${w.goalMet ? " met" : ""}" title="أسبوع ${hifzFmtDay(w.start, false)}: ${toArabicDigits(w.count)} صفحة">
      <span class="hifz-wbar-n">${w.count ? toArabicDigits(w.count) : ""}</span>
      <span class="hifz-wbar-col"><i style="height:${h}%"></i></span>
      <span class="hifz-wbar-d">${toArabicDigits(d)}/${toArabicDigits(m)}</span>
    </div>`;
  }).join("");
  const goalLine = plan.weeklyGoal ? `<div class="hifz-goal-line" style="bottom:calc(18px + ${Math.round((plan.weeklyGoal / maxW) * 90)}px)" title="الهدف"></div>` : "";

  // 🗓️ review calendar: whole weeks (starting on the plan's week day), last 5
  const firstDay = (() => {
    let d = HifzStore.addDays(t, -41);
    const [y, m, dd] = d.split("-").map(Number);
    const wd = new Date(y, m - 1, dd).getDay();
    return HifzStore.addDays(d, -((wd - plan.weekStart + 7) % 7));
  })();
  const byDay = {};
  st.days.forEach((d) => { byDay[d.day] = d; });
  let cells = "";
  for (let i = 0; i < 7; i++) cells += `<div class="hifz-cal-h">${HIFZ_DAY_NAMES[(plan.weekStart + i) % 7].replace(/^ال/, "").slice(0, 2)}</div>`;
  for (let d = firstDay; d <= t; d = HifzStore.addDays(d, 1)) {
    const info = byDay[d];
    const state = info ? info.state : "free";
    const [, , dd] = d.split("-").map(Number);
    const tip = info && info.due ? `${hifzFmtDay(d)}: ${toArabicDigits(info.done)} من ${toArabicDigits(info.due)}` : info && info.done ? `${hifzFmtDay(d)}: ${toArabicDigits(info.done)}` : hifzFmtDay(d);
    cells += `<div class="hifz-cal-d s-${state}${d === t ? " today" : ""}" title="${tip}">${toArabicDigits(dd)}</div>`;
  }

  // 💪 strength map: how long since each memorized page was reviewed
  const cycle = Math.max(1, st.cycleDays || 7);
  let map = "";
  for (let j = 1; j <= 30; j++) {
    const pages = quranJuzPages(j).filter((p) => HifzStore.has(p));
    if (!pages.length) continue;
    map += `<div class="hifz-map-row"><span class="hifz-map-juz">ج${toArabicDigits(j)}</span><span class="hifz-map-cells">${pages.map((p) => {
      const a = st.age[p];
      const cls = a === null ? "hm-never" : a <= cycle ? "hm-fresh" : a <= cycle * 2 ? "hm-aging" : "hm-old";
      const tip = a === null ? "لم تُراجَع بعد" : a === 0 ? "اليوم" : hifzAgo(HifzStore.addDays(t, -a));
      return `<button type="button" class="hifz-map-cell ${cls}" data-goto-page="${p}" title="ص ${toArabicDigits(p)} — ${tip}" aria-label="صفحة ${toArabicDigits(p)}، ${tip}"></button>`;
    }).join("")}</span></div>`;
  }

  box.innerHTML = `
    <div class="hifz-tiles">
      ${tile("📗", toArabicDigits(st.total), `صفحة محفوظة (${toArabicDigits(pct)}٪)`)}
      ${tile("🔥", toArabicDigits(st.streak), st.streak === 1 ? "يوم مراجعة كاملة متتالٍ" : "أيام مراجعة كاملة متتالية")}
      ${tile("✅", st.reviewRate === null ? "—" : `${toArabicDigits(st.reviewRate)}٪`, "إنجاز المراجعة (٣٠ يومًا)")}
      ${tile("🔄", st.cycleDays ? toArabicDigits(st.cycleDays) : "—", "أيام لدورة «البعيد» كاملة")}
      ${tile("🎯", goalWeeks === null ? "—" : `${toArabicDigits(goalWeeks)}/${toArabicDigits(pastWeeks.length)}`, plan.weeklyGoal ? "أسابيع حقّقت فيها الهدف" : "لا هدف أسبوعي")}
      ${tile("⏳", toArabicDigits(st.neverReviewed), "صفحة لم تُراجَع بعد")}
    </div>
    ${projection}

    <div class="hifz-stat-block">
      <div class="hifz-stat-title">📈 الحفظ الأسبوعي <small>(آخر ١٢ أسبوعًا${plan.weeklyGoal ? `، الخط = الهدف ${toArabicDigits(plan.weeklyGoal)}` : ""})</small></div>
      <div class="hifz-wchart">${goalLine}${bars}</div>
    </div>

    <div class="hifz-stat-block">
      <div class="hifz-stat-title">🗓️ أيام المراجعة</div>
      <div class="hifz-cal">${cells}</div>
      <div class="hifz-legend">
        <span><i class="s-full"></i>كاملة</span><span><i class="s-extra"></i>أكثر من المطلوب</span><span><i class="s-partial"></i>جزئية</span><span><i class="s-none"></i>لم تُراجع</span>
      </div>
    </div>

    <div class="hifz-stat-block">
      <div class="hifz-stat-title">💪 قوة الحفظ <small>(منذ آخر مراجعة لكل صفحة — اضغط صفحة لفتحها)</small></div>
      <div class="hifz-map">${map}</div>
      <div class="hifz-legend">
        <span><i class="hm-fresh"></i>خلال الدورة (${toArabicDigits(cycle)} ${cycle === 1 ? "يوم" : "أيام"})</span><span><i class="hm-aging"></i>تأخّرت قليلًا</span><span><i class="hm-old"></i>متأخرة كثيرًا</span><span><i class="hm-never"></i>لم تُراجَع</span>
      </div>
    </div>`;
}

document.getElementById("hifzStats").addEventListener("click", (e) => {
  const go = e.target.closest("[data-goto-page]");
  if (go) hifzOpenPage(parseInt(go.dataset.gotoPage, 10));
});
// ============================================================
// 📗 / 🔁 next to the page number in the Mushaf, and ⋮ → 📗 حفظي
// ============================================================
// 📗 — memorized today (tap again to remove)
document.getElementById("quranHifzToggleItem").addEventListener("click", () => {
  const on = HifzStore.toggle(currentQuranPage);
  hifzToast(on
    ? `📗 الصفحة ${toArabicDigits(currentQuranPage)} ضمن محفوظاتك بتاريخ اليوم (${hifzPagesWord(HifzStore.count())} محفوظة)`
    : `أُزيلت الصفحة ${toArabicDigits(currentQuranPage)} من محفوظاتك`);
});

// 🔁 — reviewed today, or on the day being recorded in review mode
document.getElementById("quranReviewToggleBtn").addEventListener("click", () => {
  if (!HifzStore.has(currentQuranPage)) return;
  const day = hifzActiveReviewDay();
  const on = !HifzStore.isReviewedOn(currentQuranPage, day);
  const res = HifzStore.setReviewed(currentQuranPage, on, day);
  if (!res.ok) { hifzToast("⚠️ " + res.reason); return; }
  if (on) {
    const tp = HifzStore.planFor(day);
    hifzToast(`🔁 راجعت الصفحة ${toArabicDigits(currentQuranPage)} — مراجعة ${hifzDayWord(day)} ${toArabicDigits(tp.doneCount)}/${toArabicDigits(tp.dueCount)}`);
  } else {
    hifzToast(`أُلغي تسجيل مراجعة الصفحة ${toArabicDigits(currentQuranPage)} (${hifzDayWord(day)})`);
  }
});

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
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  quranUpdateHifzMark();
  if (hifzIsActive()) renderHifzView();
});

quranUpdateHifzMark(); // shows the review bar again if review mode was on
if (hifzIsActive()) renderHifzView(); // opened straight on #hifz
