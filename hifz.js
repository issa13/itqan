// hifz.js — 📗 متابعة الحفظ: which Mushaf pages you've memorized.
//
// • Mark a page in 📖 القرآن (⋮ → ✅ حفظت هذه الصفحة) or many at once in
//   ⋮ → 📗 متابعة الحفظ (per juz / per page).
// • «📗 محفوظاتي» in the quiz range lists (app.js → memorizedRange())
//   asks only from these pages.
// • Saved on the device; when signed in also in your account
//   (user_settings.memorized_pages), so another phone gets the same list —
//   the newer of the two copies wins.
//
// Loaded after supabase-client.js, before app.js.

const HifzStore = (function () {
  "use strict";

  const KEY = "qf_memorized_pages";
  const listeners = [];
  let pages = new Set();
  let updatedAt = 0;

  function validPage(p) { return Number.isInteger(p) && p >= 1 && p <= 604; }

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || "null");
      if (data && Array.isArray(data.pages)) {
        pages = new Set(data.pages.map(Number).filter(validPage));
        updatedAt = Number(data.updatedAt) || 0;
      }
    } catch (e) { /* ignore broken data */ }
  }
  load();

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ pages: Array.from(pages).sort((a, b) => a - b), updatedAt }));
    } catch (e) { /* storage full */ }
  }

  function emit() {
    listeners.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });
  }

  let pushTimer = null;
  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 1500);
  }
  async function push() {
    if (typeof saveMemorizedPages !== "function") return;
    try { await saveMemorizedPages(Array.from(pages).sort((a, b) => a - b), new Date(updatedAt).toISOString()); } catch (e) { /* offline: pushed next time */ }
  }

  function changed() {
    updatedAt = Date.now();
    persist();
    emit();
    schedulePush();
  }

  function has(page) { return pages.has(page); }
  function all() { return new Set(pages); }
  function count() { return pages.size; }

  function toggle(page) {
    if (!validPage(page)) return false;
    if (pages.has(page)) pages.delete(page); else pages.add(page);
    changed();
    return pages.has(page);
  }

  // Marks (on = true) or unmarks every page in the list.
  function setMany(list, on) {
    let any = false;
    list.forEach((p) => {
      if (!validPage(p)) return;
      if (on && !pages.has(p)) { pages.add(p); any = true; }
      if (!on && pages.has(p)) { pages.delete(p); any = true; }
    });
    if (any) changed();
  }

  // After sign-in: settings row from the account (app.js → applyRemoteSettings).
  // The newer copy wins; if the account has none yet, this device's is uploaded.
  function mergeRemote(remotePages, remoteUpdatedAt) {
    const remoteTime = remoteUpdatedAt ? Date.parse(remoteUpdatedAt) || 0 : 0;
    if (Array.isArray(remotePages) && remoteTime > updatedAt) {
      pages = new Set(remotePages.map(Number).filter(validPage));
      updatedAt = remoteTime;
      persist();
      emit();
    } else if (pages.size && remoteTime < updatedAt) {
      push();
    }
  }

  function onChange(fn) { listeners.push(fn); }

  return { has, all, count, toggle, setMany, mergeRemote, onChange };
})();
