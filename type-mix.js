// type-mix.js — how the question types of a ⚔️ تحدٍّ are chosen
// (📱 محلي, 🌐 مباشر and 📝 ذاتي all use it):
//
//   🎲 عشوائي (default) — you pick the total number of questions (9 … 30,
//      in steps of 3) and, if you like, up to 3 types you DON'T want.
//      The app then picks total ÷ 3 different types at random from the
//      rest (only types that fit the chosen pages), and asks them in
//      groups: 3 questions of one type, then 3 of another, and so on.
//   ✋ أختار بنفسي — the existing grid of type checkboxes + "per type" count.
//
// createTypeModePicker() adds the switch and the 🎲 box next to a setup's
// existing type grid / count field and hides those while 🎲 is on. The
// setup's own code asks it:
//   picker.isRandom(), picker.groups(), picker.total()
//   await picker.check(range) → { msg, fit: [types] }  ("" msg = ok)
//   picker.pick(fit)          → the random types for a new game
// The choice is remembered per setup on this device.
//
// Loaded before app.js (which creates the pickers); uses app.js's
// CHALLENGE_TYPES, getTypeLabel, rangeInfo, typeBlockFromInfo, shuffle
// only when called.

const TYPE_MIX_GROUP = 3;          // questions per group
const TYPE_MIX_MAX_EXCLUDED = 3;
const TYPE_MIX_TOTALS = [9, 12, 15, 18, 21, 24, 27, 30];
const TYPE_MIX_DEFAULT_TOTAL = 15;

function typeMixDigits(n) { return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]); }
// "٩ أسئلة" / "١٥ سؤالًا"
function typeMixQuestions(n) { return `${typeMixDigits(n)} ${n >= 3 && n <= 10 ? "أسئلة" : "سؤالًا"}`; }

function createTypeModePicker(opts) {
  const { key, gridField, countField, onChange } = opts;
  const STORE = "qf_typemix_" + key;
  let state = { mode: "random", total: TYPE_MIX_DEFAULT_TOTAL, excluded: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || "null");
    if (saved && typeof saved === "object") {
      state.mode = saved.mode === "manual" ? "manual" : "random";
      state.total = TYPE_MIX_TOTALS.includes(Number(saved.total)) ? Number(saved.total) : TYPE_MIX_DEFAULT_TOTAL;
      state.excluded = Array.isArray(saved.excluded)
        ? saved.excluded.filter((t) => CHALLENGE_TYPES.includes(t)).slice(0, TYPE_MIX_MAX_EXCLUDED) : [];
    }
  } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ignore */ } };

  // ---- DOM ----
  const toggle = document.createElement("div");
  toggle.className = "type-mode-toggle";
  toggle.setAttribute("role", "radiogroup");
  toggle.setAttribute("aria-label", "طريقة اختيار أنواع الأسئلة");
  toggle.innerHTML = `
    <div class="type-mode-label">أنواع الأسئلة</div>
    <div class="type-mode-btns">
      <button type="button" class="type-mode-btn" data-type-mode="random" role="radio">🎲 عشوائي</button>
      <button type="button" class="type-mode-btn" data-type-mode="manual" role="radio">✋ أختار بنفسي</button>
    </div>`;
  gridField.parentNode.insertBefore(toggle, gridField);

  const box = document.createElement("div");
  box.className = "type-random-box";
  box.innerHTML = `
    <div class="field type-random-total-field">
      <label>عدد الأسئلة</label>
      <select class="type-random-total">${TYPE_MIX_TOTALS.map((n) => `<option value="${n}">${typeMixQuestions(n)} — ${typeMixDigits(n / TYPE_MIX_GROUP)} مجموعات</option>`).join("")}</select>
    </div>
    <details class="type-exclude">
      <summary class="type-random-sub">🚫 أنواع لا أريدها <small class="type-exclude-count"></small></summary>
      <div class="modal-hint">اضغط نوعًا لاستبعاده (حتى ${typeMixDigits(TYPE_MIX_MAX_EXCLUDED)})، واضغطه مرة أخرى لإرجاعه.</div>
      <div class="challenge-types-grid type-exclude-grid"></div>
    </details>
    <div class="type-random-summary"></div>`;
  countField.parentNode.insertBefore(box, countField.nextSibling);

  const totalSel = box.querySelector(".type-random-total");
  const excludeGrid = box.querySelector(".type-exclude-grid");
  const summary = box.querySelector(".type-random-summary");

  const excludeCount = box.querySelector(".type-exclude-count");
  function renderExclude() {
    excludeCount.textContent = state.excluded.length
      ? `(${state.excluded.map((t) => getTypeLabel(t)).join("، ")})`
      : "(لا شيء — اختياري)";
    excludeGrid.innerHTML = "";
    const full = state.excluded.length >= TYPE_MIX_MAX_EXCLUDED;
    CHALLENGE_TYPES.forEach((type) => {
      const on = state.excluded.includes(type);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "challenge-type-chip type-exclude-chip" + (on ? " excluded" : "") + (full && !on ? " locked" : "");
      b.setAttribute("aria-pressed", on);
      b.title = on ? "مستبعَد — اضغط لإرجاعه" : full ? `يمكن استبعاد ${TYPE_MIX_MAX_EXCLUDED} أنواع فقط` : "اضغط لاستبعاده";
      b.textContent = (on ? "🚫 " : "") + getTypeLabel(type);
      b.addEventListener("click", () => {
        if (on) state.excluded = state.excluded.filter((t) => t !== type);
        else if (full) { summary.dataset.flash = "1"; renderSummary(`⚠️ يمكنك استبعاد ${typeMixDigits(TYPE_MIX_MAX_EXCLUDED)} أنواع فقط — أرجِع واحدًا أولًا لتستبعد غيره.`); return; }
        else state.excluded.push(type);
        save();
        renderExclude();
        changed();
      });
      excludeGrid.appendChild(b);
    });
  }

  let lastFitCount = null;
  function renderSummary(override) {
    if (override) { summary.innerHTML = override; summary.classList.add("warn"); return; }
    summary.classList.remove("warn");
    const g = state.total / TYPE_MIX_GROUP;
    summary.innerHTML = `ستأتيك <b>${typeMixQuestions(state.total)}</b> في <b>${typeMixDigits(g)}</b> مجموعات، كل مجموعة ${typeMixDigits(TYPE_MIX_GROUP)} أسئلة من نوع مختلف يُختار عشوائيًا${state.excluded.length ? ` (غير المستبعَدة)` : ""}، ويظهر اسم النوع قبل كل مجموعة.`
      + (lastFitCount !== null ? `<br><small>الأنواع المناسبة لهذا النطاق: ${typeMixDigits(lastFitCount)}</small>` : "");
  }

  function applyMode() {
    toggle.querySelectorAll("[data-type-mode]").forEach((b) => {
      const on = b.dataset.typeMode === state.mode;
      b.classList.toggle("active", on);
      b.setAttribute("aria-checked", on);
    });
    const random = state.mode === "random";
    gridField.style.display = random ? "none" : "";
    countField.style.display = random ? "none" : "";
    box.style.display = random ? "" : "none";
  }

  function changed() { renderSummary(); if (onChange) onChange(); }

  toggle.querySelectorAll("[data-type-mode]").forEach((b) => b.addEventListener("click", () => {
    if (state.mode === b.dataset.typeMode) return;
    state.mode = b.dataset.typeMode;
    save();
    applyMode();
    changed();
  }));
  totalSel.value = String(state.total);
  totalSel.addEventListener("change", () => {
    state.total = Number(totalSel.value) || TYPE_MIX_DEFAULT_TOTAL;
    save();
    changed();
  });

  renderExclude();
  applyMode();
  renderSummary();

  return {
    isRandom: () => state.mode === "random",
    total: () => state.total,
    groups: () => state.total / TYPE_MIX_GROUP,
    excluded: () => state.excluded.slice(),
    setMode(mode) {
      state.mode = mode === "manual" ? "manual" : "random";
      save();
      applyMode();
      changed();
    },
    // Which of the types you didn't exclude fit these pages, and whether
    // there are enough of them for the number of groups.
    async check(range) {
      let info;
      try { info = await rangeInfo(range.minP, range.maxP, range.pages); } catch (e) { info = null; }
      if (!info) { lastFitCount = null; renderSummary(); return { msg: "تعذّر تحميل بيانات القرآن — تحقّق من الاتصال وحاول مرة أخرى.", fit: [] }; }
      const fit = CHALLENGE_TYPES.filter((t) => !state.excluded.includes(t) && !typeBlockFromInfo(t, info, true));
      lastFitCount = fit.length;
      renderSummary();
      const g = state.total / TYPE_MIX_GROUP;
      if (fit.length < g) {
        const most = fit.length * TYPE_MIX_GROUP;
        return {
          fit,
          msg: fit.length < 3
            ? "هذا النطاق صغير جدًا لاختيار عشوائي — اختر نطاقًا أوسع، أو قلّل الأنواع المستبعَدة."
            : `يناسب هذا النطاق ${typeMixDigits(fit.length)} أنواع فقط${state.excluded.length ? " (بعد المستبعَدة)" : ""}، أي ${typeMixQuestions(most)} على الأكثر — اختر ${typeMixDigits(most)} أو أقل، أو وسّع النطاق.`,
        };
      }
      return { fit, msg: "" };
    },
    pick(fit) { return shuffle(fit).slice(0, state.total / TYPE_MIX_GROUP); },
  };
}
