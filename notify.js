// notify.js — system notifications when someone challenges you
// (⚔️ مباشر). Works in the Android/iPhone app (Capacitor's Local
// Notifications plugin) and on the website (the browser's Notification API).
//
// • First open: a short in-app question explains why, then the system
//   permission dialog appears (asked once; «ليس الآن» can be changed later
//   in 👤 → ⚙️ الإعدادات والحساب → 🔔).
// • A new challenge (auth-ui.js → renderDuelInviteBanner) also shows a
//   system notification, so it's seen when the app is in the background.
//
// Limitation: notifications come from the app itself, so they arrive while
// it is open or recently in the background. Waking a fully closed app needs
// a push service (Firebase / Apple) — see MOBILE.md.
//
// Loaded after net-status.js, before auth-ui.js.

const ItqanNotify = (function () {
  "use strict";

  const ASKED_KEY = "qf_notify_asked";
  const Cap = window.Capacitor;
  const isNative = !!(Cap && typeof Cap.isNativePlatform === "function" && Cap.isNativePlatform());
  const LN = isNative && Cap.Plugins ? Cap.Plugins.LocalNotifications : null;
  const webSupported = !isNative && typeof Notification !== "undefined" && window.isSecureContext;
  const notified = new Set();
  const listeners = [];

  function supported() { return !!LN || webSupported; }

  async function state() {
    if (LN) {
      try { return (await LN.checkPermissions()).display; } catch (e) { return "denied"; }
    }
    if (webSupported) return Notification.permission === "default" ? "prompt" : Notification.permission;
    return "unsupported";
  }

  async function request() {
    try { localStorage.setItem(ASKED_KEY, "1"); } catch (e) { /* ignore */ }
    let result = "denied";
    if (LN) {
      try {
        result = (await LN.requestPermissions()).display;
        if (result === "granted") await ensureChallengeChannel();
      } catch (e) { result = "denied"; }
    } else if (webSupported) {
      try { result = await Notification.requestPermission(); } catch (e) { result = "denied"; }
    }
    listeners.forEach((fn) => { try { fn(result); } catch (e) { /* ignore */ } });
    return result;
  }

  function onChange(fn) { listeners.push(fn); }

  // Android drops a notification sent to a channel that doesn't exist, and
  // the channel used to be created only when permission was given through
  // the in-app question — not when it was turned on from the phone's
  // settings. So it's (re)created before every challenge notification
  // (creating an existing channel does nothing).
  async function ensureChallengeChannel() {
    if (!LN || !LN.createChannel) return;
    try {
      await LN.createChannel({ id: "challenges", name: "التحديات", description: "عندما يتحداك أحد في ⚔️ مباشر", importance: 5, visibility: 1, vibration: true });
    } catch (e) { /* ignore — iOS */ }
  }

  function wasAsked() {
    try { return localStorage.getItem(ASKED_KEY) === "1"; } catch (e) { return true; }
  }
  function markAsked() {
    try { localStorage.setItem(ASKED_KEY, "1"); } catch (e) { /* ignore */ }
  }

  // Shows a notification for a duel invite (once per invite).
  async function challenge(invite) {
    if (!invite || notified.has(invite.id)) return;
    notified.add(invite.id);
    if ((await state()) !== "granted") return;
    const quick = invite.status === "accepted";
    const title = quick ? "⚔️ تم إيجاد خصم!" : `⚔️ ${invite.from_display_name || "لاعب"} يتحداك!`;
    const body = quick ? "اضغط للانضمام إلى المبارزة." : "افتح إتقان لقبول التحدي أو رفضه (صالح ١٠ دقائق).";
    try {
      if (LN) {
        await ensureChallengeChannel();
        await LN.schedule({
          notifications: [{
            id: Number(invite.id) % 2000000000,
            title, body,
            channelId: "challenges",
            smallIcon: "ic_stat_itqan",
            autoCancel: true,
            // Shown right away — no alarm. Without this the plugin treats it
            // as an "exact alarm", and since the app doesn't have that
            // permission (removed on purpose, see AndroidManifest.xml) it
            // tried to open the "Alarms & reminders" settings screen instead,
            // so the notification never appeared.
            isExactNotification: false,
            extra: { duelId: invite.id },
          }],
        });
      } else if (webSupported) {
        const n = new Notification(title, { body, tag: `duel-${invite.id}`, icon: "icons/icon-192.png", lang: "ar", dir: "rtl" });
        n.onclick = () => { window.focus(); n.close(); };
      }
    } catch (e) { console.warn("notification failed", e); }
  }

  // ================================================================
  // ⏰ Reminders (phone app only) — scheduled on the phone itself, so
  // they arrive even when the app is fully closed, without any server:
  //   • 📖 الورد اليومي — every day at the chosen time («تابع من صفحة …»).
  //   • 📝 المراجعة — at the chosen time, ONLY on days you haven't
  //     answered any question yet. Done as single notifications for the
  //     next REVIEW_DAYS days, re-planned whenever you practise or open
  //     the app (so today's is dropped once you've practised, and nobody
  //     who stopped using the app gets nagged forever).
  //   • 🕌 سورة الكهف — every Friday morning; opens the Mushaf at الكهف.
  // Tapping a reminder opens the matching screen.
  // A website can't do this (browsers can't schedule a notification for a
  // closed page), so the settings show a short note there instead.
  // ================================================================
  const REMINDERS_KEY = "qf_reminders";
  const ACTIVITY_KEY = "qf_last_activity_day";
  const REMINDER_CHANNEL = "reminders";
  const ID_WIRD = 2100000001;
  const ID_KAHF = 2100000002;
  const ID_REVIEW_BASE = 2100000100; // + 0 … REVIEW_DAYS-1
  const REVIEW_DAYS = 7;
  const KAHF_PAGE = 293;
  const DEFAULT_REMINDERS = {
    wird: { on: false, time: "06:30" },
    review: { on: false, time: "20:00" },
    kahf: { on: false, time: "09:00" },
  };
  const REVIEW_MESSAGES = [
    ["📝 لم تراجع اليوم بعد", "بضع دقائق من الأسئلة تُثبّت حفظك — حافظ على سلسلتك 🔥"],
    ["🔥 لا تكسر سلسلتك", "سؤال واحد يكفي لتُحسب لك مراجعة اليوم."],
    ["📖 «تعاهدوا القرآن»", "خصّص دقائق الآن لمراجعة حفظك في إتقان."],
    ["⏰ موعد المراجعة", "اختبر نفسك في نطاق حفظك قبل نهاية اليوم."],
  ];

  function remindersSupported() { return !!LN; }

  function validTime(t) { return typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t); }

  function getReminders() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(REMINDERS_KEY) || "null"); } catch (e) { saved = null; }
    const out = {};
    Object.keys(DEFAULT_REMINDERS).forEach((k) => {
      const d = DEFAULT_REMINDERS[k];
      const v = saved && typeof saved[k] === "object" && saved[k] ? saved[k] : {};
      out[k] = { on: v.on === true, time: validTime(v.time) ? v.time : d.time };
    });
    return out;
  }

  function saveReminders(r) {
    try { localStorage.setItem(REMINDERS_KEY, JSON.stringify(r)); } catch (e) { /* ignore */ }
  }

  function todayKey(d) {
    const x = d || new Date();
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  }
  function practisedToday() {
    try { return localStorage.getItem(ACTIVITY_KEY) === todayKey(); } catch (e) { return false; }
  }

  function splitTime(t) {
    const [h, m] = t.split(":").map((n) => parseInt(n, 10));
    return { hour: h, minute: m };
  }

  async function ensureReminderChannel() {
    if (!LN || !LN.createChannel) return;
    try {
      await LN.createChannel({ id: REMINDER_CHANNEL, name: "التذكيرات", description: "الورد اليومي، المراجعة، سورة الكهف يوم الجمعة", importance: 3, visibility: 1, vibration: true });
    } catch (e) { /* ignore — Android < 8 or iOS */ }
  }

  let planning = Promise.resolve();
  // Cancels every reminder this app scheduled, then schedules the enabled
  // ones again from the saved settings. Safe to call often (serialized).
  function replanReminders() {
    planning = planning.then(doReplan, doReplan);
    return planning;
  }

  async function doReplan() {
    if (!LN) return { ok: false, reason: "unsupported" };
    const ids = [ID_WIRD, ID_KAHF];
    for (let i = 0; i < REVIEW_DAYS; i++) ids.push(ID_REVIEW_BASE + i);
    try { await LN.cancel({ notifications: ids.map((id) => ({ id })) }); } catch (e) { /* nothing scheduled yet */ }

    const r = getReminders();
    if (!r.wird.on && !r.review.on && !r.kahf.on) return { ok: true, count: 0 };
    if ((await state()) !== "granted") return { ok: false, reason: "permission" };
    await ensureReminderChannel();

    const list = [];
    const common = { channelId: REMINDER_CHANNEL, smallIcon: "ic_stat_itqan", autoCancel: true, isExactNotification: false };

    if (r.wird.on) {
      let page = null;
      try { page = parseInt(localStorage.getItem("qf_quran_last_page"), 10) || null; } catch (e) { /* ignore */ }
      list.push(Object.assign({}, common, {
        id: ID_WIRD,
        title: "📖 وقت الورد اليومي",
        body: page ? `تابع قراءتك من صفحة ${page} — «اقرؤوا القرآن فإنه يأتي يوم القيامة شفيعًا لأصحابه».` : "افتح المصحف واقرأ وردك اليوم.",
        schedule: { on: splitTime(r.wird.time), allowWhileIdle: true },
        extra: { open: "quran", page: page || null },
      }));
    }

    if (r.kahf.on) {
      list.push(Object.assign({}, common, {
        id: ID_KAHF,
        title: "🕌 جمعة مباركة",
        body: "لا تنسَ قراءة سورة الكهف اليوم — اضغط لفتحها في المصحف.",
        schedule: { on: Object.assign({ weekday: 6 }, splitTime(r.kahf.time)), allowWhileIdle: true }, // 6 = Friday
        extra: { open: "quran", page: KAHF_PAGE },
      }));
    }

    if (r.review.on) {
      const { hour, minute } = splitTime(r.review.time);
      const now = new Date();
      const skipToday = practisedToday();
      for (let i = 0; i < REVIEW_DAYS; i++) {
        const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, minute, 0, 0);
        if (at <= now) continue;            // today's time already passed
        if (i === 0 && skipToday) continue; // already practised today
        const [title, body] = REVIEW_MESSAGES[at.getDate() % REVIEW_MESSAGES.length];
        list.push(Object.assign({}, common, {
          id: ID_REVIEW_BASE + i,
          title, body,
          schedule: { at, allowWhileIdle: true },
          extra: { open: "home" },
        }));
      }
    }

    if (!list.length) return { ok: true, count: 0 };
    try {
      await LN.schedule({ notifications: list });
      return { ok: true, count: list.length };
    } catch (e) {
      console.warn("scheduling reminders failed", e);
      return { ok: false, reason: "schedule_failed" };
    }
  }

  // Updates one reminder ("wird" | "review" | "kahf") and re-plans.
  // Turning one ON asks for notification permission first if needed.
  async function setReminder(kind, patch) {
    if (!DEFAULT_REMINDERS[kind]) return { ok: false, reason: "unknown" };
    const r = getReminders();
    const next = Object.assign({}, r[kind], patch || {});
    if (!validTime(next.time)) next.time = r[kind].time;
    if (next.on && (await state()) !== "granted") {
      const res = await request();
      if (res !== "granted") return { ok: false, reason: "permission" };
    }
    r[kind] = { on: !!next.on, time: next.time };
    saveReminders(r);
    return replanReminders();
  }

  // Called whenever a question is answered (any mode): today counts as
  // practised, so today's review reminder is dropped.
  let lastMarked = null;
  function markActivity() {
    const key = todayKey();
    if (lastMarked === key) return;
    lastMarked = key;
    try { localStorage.setItem(ACTIVITY_KEY, key); } catch (e) { /* ignore */ }
    if (LN && getReminders().review.on) replanReminders();
  }

  // Tapping a notification opens the matching screen: reminders carry
  // { open, page }; challenge notifications open ⚔️ تحديات.
  function openFromNotification(extra) {
    const go = () => {
      if (typeof switchView !== "function") return;
      if (extra && extra.open === "quran") {
        switchView("quran");
        const page = parseInt(extra.page, 10);
        if (page >= 1 && page <= 604 && typeof quranGoToPage === "function") {
          try { quranGoToPage(page); } catch (e) { /* ignore */ }
        }
      } else if (extra && extra.open === "home") {
        switchView("home");
      } else {
        switchView("challenge");
      }
    };
    // a tap can arrive while the page is still starting up
    if (document.readyState === "complete") go(); else window.addEventListener("load", go, { once: true });
  }

  if (LN && LN.addListener) {
    LN.addListener("localNotificationActionPerformed", (ev) => {
      const extra = ev && ev.notification ? ev.notification.extra : null;
      openFromNotification(extra);
    });
  }

  // Re-plan on start and each time the app comes back (the date may have
  // changed, the last-read page moved, …).
  if (LN) {
    const kick = () => { replanReminders(); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", kick, { once: true }); else kick();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") kick(); });
  }

  return {
    supported, state, request, onChange, wasAsked, markAsked, challenge, isNative,
    remindersSupported, getReminders, setReminder, replanReminders, markActivity,
  };
})();
