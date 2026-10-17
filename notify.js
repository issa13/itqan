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
        if (result === "granted" && LN.createChannel) {
          await LN.createChannel({ id: "challenges", name: "التحديات", description: "عندما يتحداك أحد في ⚔️ مباشر", importance: 5, visibility: 1, vibration: true });
        }
      } catch (e) { result = "denied"; }
    } else if (webSupported) {
      try { result = await Notification.requestPermission(); } catch (e) { result = "denied"; }
    }
    listeners.forEach((fn) => { try { fn(result); } catch (e) { /* ignore */ } });
    return result;
  }

  function onChange(fn) { listeners.push(fn); }

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
        await LN.schedule({
          notifications: [{
            id: Number(invite.id) % 2000000000,
            title, body,
            channelId: "challenges",
            extra: { duelId: invite.id },
          }],
        });
      } else if (webSupported) {
        const n = new Notification(title, { body, tag: `duel-${invite.id}`, icon: "icons/icon-192.png", lang: "ar", dir: "rtl" });
        n.onclick = () => { window.focus(); n.close(); };
      }
    } catch (e) { console.warn("notification failed", e); }
  }

  // Tapping a notification opens the app on ⚔️ تحديات, where the invite waits.
  if (LN && LN.addListener) {
    LN.addListener("localNotificationActionPerformed", () => {
      if (typeof switchView === "function") switchView("challenge");
    });
  }

  return { supported, state, request, onChange, wasAsked, markAsked, challenge, isNative };
})();
