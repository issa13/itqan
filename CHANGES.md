# 📗 الحفظ والمراجعة — memorization & review plans, statistics, shorter ⋮ menu — 2026-11-01 (2)

## To do on your side (once)
1. Supabase → SQL Editor → run the whole `supabase-schema.sql` again (new `hifz` column).
2. Phone app: `cd mobile && npm run sync`, then build.

## 📗 الحفظ والمراجعة (⋮ → 📗, or the 📗 next to the page number)
Four tabs:
- **🔁 المراجعة — today's review**
  - **🆕 القريب:** every page memorized in the last N days (7 by default, you choose), every day.
  - **📚 البعيد:** all other memorized pages stand in a queue — the one reviewed longest ago first. Each day the first pages of the queue are due. Choose either **pages per day** (the cycle length is worked out) or **days per cycle** (the pages per day are worked out).
  - Each page has its own ✅ (tap again to undo), opens in the Mushaf when tapped, and has 🎯 to be tested on it.
  - Didn't finish? The pages you didn't review stay at the front of the queue, so tomorrow shows them plus new ones — always the same number of pages, nothing piles up.
  - **➕ راجعت أكثر** lists the next pages in the queue; ticking them moves the cycle forward (shown as «⭐ زيادة»).
  - **🎯 اختبرني** → today's pages / memorized in the last 2 days / 3 days / week / all of «القريب». It opens 📝 اختبارات with that set as the range («🔁 …» in the range list). The test doesn't mark pages as reviewed — that stays manual.
- **🎯 الحفظ — weekly goal:** progress (e.g. ٢ / ٥), days left, this week's pages, a quick «سجّل صفحة حفظتها» (page + date, today by default), and ⚙️ pages per week + the day the week starts.
- **🗺️ محفوظاتي:** the per-juz map, now with «🆕 حفظ جديد بتاريخ …» (today by default) or «📦 حفظ قديم (بلا تاريخ)». Pages with a date have a small dot.
- **📊 إحصائيات:** memorized pages and %, 🔥 streak of complete review days, review completion over 30 days, cycle length, weeks the goal was met, pages never reviewed; a forecast («at your pace you finish in about …»); a 12-week memorization chart with the goal line; a calendar of review days (complete / more than required / partial / none); and a **strength map** — every memorized page coloured by how long since it was last reviewed (tap a page to open it).

## In the Mushaf
- **📗** next to the page number: memorized (records today's date); **🔁**: reviewed today. Both light up when on; tap again to undo. The page number now shows «الصفحة ٦٠٠» (the full «من ٦٠٤» is in its tooltip) to make room.
- **⋮ menu is shorter (14 → 6):** 🔍 بحث، 📍 الذهاب إلى، 🔖 العلامات، 📗 الحفظ والمراجعة، **🎧 الاستماع…** (this page / repeat a passage / reciter / offline), **🎯 اختبار…** (page / surah / juz / ±5 / ±10).

## ⏰ Reminders (phone app)
- **🔁 مراجعة المحفوظ** — at your time each day, unless today's review is already complete («باقي ٣ من ٨»).
- **🎯 هدف الحفظ الأسبوعي** — mid-week if less than half the goal is done, and on the week's last day if it isn't complete. Turned on automatically with your first goal.
- Both can be set in the tab itself or in 👤 → ⚙️ → ⏰ التذكيرات. The older «📝 المراجعة» reminder (about answering questions) is now called «📝 حلّ الأسئلة».

## Under the hood
- `hifz.js` rewritten: each page keeps the day it was memorized and the day it was last reviewed, plus a review history (for the statistics) and the plan. The old list is converted automatically (those pages become «قديم»). Today's due pages are fixed once a day, so ticking pages never reshuffles the list.
- Saved in the account in the new `user_settings.hifz` column (newest copy wins; review history from both devices is merged); `memorized_pages` is still filled for older versions of the app.

# 🔔 Fix: challenge notifications never appeared on Android — 2026-11-01

- **Cause:** the notifications plugin treats every notification as an "exact alarm" unless told otherwise. The app doesn't have that permission (removed on purpose for Google Play), so instead of showing the challenge notification the plugin tried to open the "Alarms & reminders" settings screen — and nothing appeared. The ⏰ reminders were already marked as not-exact, so they weren't affected.
- **Second cause:** the «التحديات» notification channel was only created when notifications were enabled through the app's own question. If they were turned on from the phone's settings instead, the channel didn't exist and Android silently dropped every challenge notification. It's now created before each one.
- Phone app: `cd mobile && npm run sync`, then build.

# 📘 Word meanings, متشابهات, أكمل الآية, mistake review & memorization tracker — 2026-10-30 (2)

## To do on your side (once)
1. **Push the website first** (GitHub Pages) — the duel server reads `quran-index/mutashabihat.json` from the site.
2. Supabase → SQL Editor → run the whole `supabase-schema.sql` again (new question types + the memorized-pages column).
3. `supabase functions deploy generate-duel-questions`.
4. Phone app: `cd mobile && npm run sync` (includes the new `hifz.js`), then build.

## 📘 Tap a word in the Mushaf
- Tapping any word opens a sheet with the **word's meaning** (الميسر في غريب القرآن) and **التفسير الميسر** of its ayah; «كلمات أخرى في هذه الآية», «عن السورة» on the first ayah, ← → to move between ayahs, and 🔊.
- Works **offline**: the data is bundled in `quran-index/tafsir/` (114 files, 3.8 MB, loaded one surah at a time). Rebuild with `node scripts/build-tafsir.js` (source: the open spa5k/tafsir_api collection on GitHub).

## New question types
- **✍️ أكمل الآية** — the ayah with one word hidden, 4 words to choose from (wrong ones are real words of the same shape — same length and ending — so it can't be guessed by look).
- **🔀 المتشابهات** — the previous ayah is shown; pick the next ayah in its exact wording, against its look-alikes from other places in the Quran (e.g. البقرة 48 / 123). 676 ayahs have look-alikes, found automatically by `node derive-mutashabihat.js` → `quran-index/mutashabihat.json`.
- Both work in every mode (اختبارات، محلي، ذاتي، مباشر), have a «خبير» badge, and 10 XP.

## 🔁 مراجعة الأخطاء
- Every question answered wrong (📝 اختبارات, 📝 ذاتي, 🌐 مباشر) is saved and comes back **after 1 day, then 3, then 7**. Right in a review → next step; after the third it's done. Wrong again → starts over.
- In 📝 اختبارات a bar above «سؤال جديد» shows how many are due — «🔁 مراجعة الأخطاء (٣)» switches «سؤال جديد» to them until none are left (or «⏹ إنهاء المراجعة»).
- Saved on the device (up to 500).

## 📗 متابعة الحفظ
- 📖 القرآن → ⋮ → **✅ حفظت هذه الصفحة**, or **📗 متابعة الحفظ**: progress overall and per juz, tap pages, or mark a whole juz. A memorized page shows «📗» next to its number.
- New range **«📗 محفوظاتي»** in 📝 اختبارات and 📱 محلي: questions only from your memorized pages (answers like page numbers / surahs too). Marking your first pages switches اختبارات to it automatically.
- Saved on the device and, when signed in, in your account (newest copy wins across devices).

## Under the hood
- One shared rule check decides which question types fit a range (was two near-copies) — works for page sets too.
- New files: `hifz.js`, `derive-mutashabihat.js`, `scripts/build-tafsir.js`, `quran-index/mutashabihat.json`, `quran-index/tafsir/`.

# ↔️ يمين / يسار, background recitation, reminders & a review — 2026-10-30

## To do on your side (once)
1. Supabase → SQL Editor → paste the whole `supabase-schema.sql` → **Run** (safe to re-run). Needed for the new question type to save XP / count in duels, and for the two fixes below.
2. Redeploy the duel function: `supabase functions deploy generate-duel-questions` (so ⚔️ مباشر can use يمين / يسار).
3. Phone app: `cd mobile && npm run sync` (no new plugins to install), then build as usual. Google Play will ask about the new background-audio service — see MOBILE.md part 5.

## New question type: ↔️ يمين / يسار
- An ayah is shown; answer whether it's on a **right-hand page (odd number)** or a **left-hand page (even number)** of the Mushaf. Two big buttons side by side — «➡️ يمين» on the right, «يسار ⬅️» on the left.
- Available everywhere: 📝 اختبارات, 📱 محلي, 📝 ذاتي and 🌐 مباشر (server function updated too).
- Ayahs that continue onto the next page are never asked (they'd be on both sides).
- Needs a range of at least 2 pages. Because it's only 2 choices, a correct answer earns **5 XP** instead of 10. It has its own «خبير» badge (30 correct).

## 🎧 Recitation keeps playing outside the app
- **Android:** while a recitation plays, a «🎧 …» notification shows the reciter and the current ayah, with ⏸ / ⏹ buttons. That notification (a media-playback foreground service) is what stops Android from freezing the app in the background — before, the sound stopped until you came back. New: `ItqanAudioPlugin.java`, `ItqanAudioService.java`.
- **iPhone:** the audio session is now set to "playback" (`AppDelegate.swift`), so locking the phone or switching apps doesn't stop it, and lock-screen controls work.
- **Website:** the browser's media controls (lock screen / notification shade on Android Chrome) show the ayah and offer play / pause / stop.
- Moving from one ayah to the next no longer depends only on a fast timer (browsers slow timers down in the background) — the audio's own progress events drive it too.

## ⏰ Reminders (phone app)
- 👤 → ⚙️ الإعدادات والحساب → ⏰ التذكيرات, each with its own time:
  - 📖 **الورد اليومي** — every day, "continue from page N" (opens the Mushaf on that page);
  - 📝 **المراجعة** — only on days you haven't answered any question yet (opens 📝 اختبارات);
  - 🕌 **سورة الكهف** — every Friday (opens the Mushaf at الكهف).
- Scheduled on the phone, so they arrive with the app closed — no server needed. Turning on notifications for the first time in the app also turns on the evening review reminder (8 PM); everything is changeable.
- The website shows a note that reminders are in the phone app (a website can't schedule notifications while closed).

## Fixes from the review
- **Answers given offline could be lost when syncing:** the server silently ignores an answer that arrives within 350 ms of another one, and the sync treated that as "sent". It now says `throttled` and the app retries.
- **Sessions could be edited through the API:** a user could re-open a finished leaderboard session to keep adding answers, or change its page range afterwards. Those fields are now locked (database trigger).
- The quiz's error message blamed "the network or the API" — questions come from local files, so it now says what really failed.
- Cache-busting version bumped (`npm run bump`) so browsers load the new files.

# 🔔 Notifications, sessions & layout fixes — 2026-10-17 (2)

- **Offline notice inside the challenge card** no longer sticks out of the card, and offline notices now have a solid background — the background pattern no longer shows through them.
- **👤 Sessions:** now the first section. «☑️ تحديد» lets you tick several sessions (tap a row or its box) or «تحديد الكل», then «🗑 حذف المحدد (n)» deletes them in one go (after confirming). The ذاتي session in progress can't be ticked.
- **👤 Sections:** opening one closes the others.
- **🔔 Challenge notifications:** on the first opening the app asks (in Arabic, explaining why) whether to notify you about challenges, then shows the system permission dialog. When someone challenges you, a system notification appears (tapping it opens ⚔️ تحديات), alongside the in-app banner — once per challenge. Changeable later in 👤 → ⚙️ الإعدادات والحساب → 🔔.
  - App: new `@capacitor/local-notifications` plugin (run `npm install` in `mobile/`), a white star-and-book notification icon, and the plugin's exact-alarm permission removed (not needed; Google Play restricts it).
  - Website: the browser's notifications (while the site is open, also in a background tab).
  - Limitation: notifications come from the app itself, so they arrive while it's open or recently in the background. Reaching a fully closed app needs a push service (Firebase / Apple) plus a server trigger — possible as a next step.

# 📴 Real offline mode, floating player & new look — 2026-10-17

## Offline — the app now really knows, and tells the user
- **Why your phone showed "جاري التحميل..." forever:** phones say "online" whenever they're connected to a network, even when no data gets through (mobile data without balance/signal, Wi-Fi without internet). The app trusted that. Now `net-status.js` checks for real: every request has a time limit (15s), a request that can't reach the server switches the app to offline, and while offline it quietly re-checks every 6s.
- **The user is told:** a 📴 «غير متصل» chip in the top bar on every tab (tap it for an explanation), a one-time message, and notices on the pages that need the internet.
- **Last saved data instead of empty pages:** profile, friends, leaderboard and duel stats keep a copy of what they last loaded (per account, on the device — cleared at sign-out) and show it offline.
- **Answers are kept and synced:** a quiz / ذاتي answer given offline is saved on the device («📴 غير متصل · ٣ بانتظار المزامنة»), then sent automatically when the connection is back (XP, streaks, achievements included) — "✅ تمت مزامنة ٣ إجابة".
- Audio still always tries to play (the recitation site may work even if the app's server doesn't); if it fails and there's really no internet, the user is told.

## Recitation
- **Floating player:** listening no longer shrinks the Mushaf page. The controls float over the page and tuck themselves away after a few seconds; on 📖 the 🎧 by the page number turns into a small "playing" animation — tap it to bring the controls back (⌄ hides them). On other tabs a small round button does the same.
- **إدريس أبكر** added. His recitation exists only as one file per surah (mp3quran.net), so the app uses mp3quran's published start/end time of every verse and plays verses as parts of the surah file — page, range, single verse, repeat, speed, highlighting and offline download all work. (Quiz audio falls back to the default reciter for him.)
- **Download offer:** «لا تسألني مجددًا» is replaced by «⏰ لاحقًا — ذكّرني مرة أخرى»: it asks again from the next day. Downloading is also always available from ⋮ → 📥.
- App downloads are now streamed straight to storage (safe for big whole-surah files).

## Look
- **Page-turn buttons:** icons only (▶ / ◀).
- **New background:** the checkerboard is replaced by soft colour glows and a faint eight-pointed-star (khātam) lattice that fades towards the middle.
- **Dark theme reworked:** deep green-black instead of olive-brown; cards are lighter surfaces with a hairline edge instead of heavy shadows; the gold line on cards is softened; text is a cool off-white with clearer secondary text; accent green is calmer; inputs sit slightly below the card; the bottom bar is translucent. App status bar / splash colours updated to match.
- Toast messages are wider and easier to read.

# 🎧 Recitation, profile & offline — 2026-10-17

## Recitation
- **Continuous recitation:** a page or a selected range now flows like one recording. Each ayah is a separate file on the audio site, so the next one is started a fraction of a second before the current one ends (its last moment is silence), instead of waiting for it to stop and then loading the next — that wait was the little break you heard. Measured in tests: every ayah starts ~0.16s before the previous one ends, with no gap.
- **Speed:** a ×1 button on the player cycles ×0.75 → ×1 → ×1.25 → ×1.5 (pitch kept natural; remembered).
- **30 reciters** (was 6): الشريم، الغامدي، الدوسري، القطامي، العجمي، الشاطري، الحذيفي، البدير، الجهني، بصفر، الرفاعي، القحطاني، القاسم، محمد أيوب، محمد جبريل، بو خاطر، العلاقمي، علي جابر، فارس عباد، الطبلاوي، and the مجود recitations of عبد الباسط / المنشاوي / الحصري, plus الحصري المعلّم. Folder names taken from everyayah.com's own list.
- **Listen offline (📖 ⋮ → 📥 التلاوة دون إنترنت):** download this page / surah / juz / the whole Quran for the chosen reciter (approximate size shown first), with progress, stop, and delete. While listening online the app **asks once per surah** whether to download it (with «لا تسألني مجددًا»). Downloaded ayahs play from the device — also the 🔊 in quizzes and challenges, which now use your chosen reciter.
  - In the Android/iPhone app this always works (files go to the app's own storage — new `@capacitor/filesystem` plugin; run `npm install` in `mobile/` once).
  - On the website it works only if the audio site allows browsers to save its files; if not, the dialog says the feature is available in the phone app.
- **Offline:** playing something that isn't downloaded says «📴 أنت غير متصل بالإنترنت …» instead of doing nothing.

## Everywhere
- **Offline notices:** الأصدقاء, لوحة الصدارة, التحديات المباشرة, the login dialog and the profile now say "you're offline — this needs an internet connection" instead of showing an empty or endlessly-loading screen; they reload by themselves when the connection is back. The Mushaf, quizzes and local challenges keep working offline.
- **👤 Profile:** التقدم / الإنجازات / سلّم الرتب / الجلسات are collapsible and closed by default (tap a title to open). Theme, sign-out and account deletion are merged into one «⚙️ الإعدادات والحساب» section (guests see the theme there).
- **Card shadow over buttons fixed:** cards were painted on a layer above the button under them, so their shadow covered the button. Buttons now sit above.
- **Page-turn row:** «التالية» no longer touches the corner ornament (more space, smaller ornament).
- Removed the "© 2026 … Built with ❤️" footer.

# 📖 Reader, listening, sign-up & duels — 2026-10-16

## To do on your side (once)
1. Supabase → SQL Editor → paste the whole `supabase-schema.sql` → **Run** (safe to re-run, keeps data).
2. Redeploy the duel function: `supabase functions deploy generate-duel-questions`.
Until both are done, duels still work but without the pauses and the result card.

## Mushaf reader
- **Taller page:** the frame around the page and the page-turn row are slimmer on phones — about 40px more height for the Mushaf text on a typical phone.
- **🎧 Listen to this page — one tap,** right next to the page number (also still in ⋮). Tap again to stop.
- **🔁 Repeat** on the recitation player: each tap cycles ×1 → ×2 → ×3 → ×5 → ×10 → ∞. Tap an ayah's 🔊 then 🔁 to repeat that verse; with 🎧 it repeats the page; with ⋮ → «استماع وتكرار مقطع» it repeats your chosen set of verses (that dialog also repeats each ayah separately). Tapping an ayah now also opens the player (pause / stop / repeat) and highlights the verse.

## Sign-up
- After creating an account: a clear 3-step notice — open the «تأكيد التسجيل» email sent to *your address*, tap the link (in the app: it opens in the phone's browser, that's normal), come back and log in — plus a spam-folder hint and a **📨 resend link** button (60s cooldown).
- The login dialog remembers an unconfirmed sign-up and keeps reminding (with resend) until the first successful login; logging in before confirming explains exactly what to do.

## Online duels (⚔️ مباشر)
- **Invites now always arrive.** They relied only on Supabase Realtime; when that didn't deliver (Realtime not enabled for the project, a phone that slept, a flaky network) the challenge never appeared and the challenger waited forever. The app now also checks the server every few seconds (only while the screen is on, and immediately when it comes back on) — invites, acceptance, and the duel itself. Realtime problems are logged in the console.
- **Result card between questions, for both players:** over the question card — "🎉 أنت أخذت النقطة!" / "⚡ <name> أخذ النقطة" / "⏱️ لم يأخذ أحد النقطة", the right answer, the score and a countdown (3s). The right answer is also marked on the card.
- **Calmer type changes:** when the next question is a different type, a 5-second intro shows its name and what it asks (6s before the first question).
- The round status ("wrong — waiting for the opponent"…) moved above the card, so it's always in view.
- The server now hides each question's text/choices until its start moment (both players get it at the same time — no peeking during the pauses), and only reveals who took the point and the right answer once a question is over.
- Tested with two players in two browsers against the real schema in a local database, **with Realtime switched off**: invite arrived in ~3s, all 9 questions, result card ~3s each, 5s intros at type changes, matching final scores on both sides.

# 📱 App fixes + website icon — 2026-10-16

- **Android: big gaps above the top bar and under the bottom bar, and the page wouldn't scroll to the end.** The page was being kept clear of the status bar and navigation bar twice — once by Android and once by the page's own "safe area" spacing, which some phones report wrongly. Now the page always sits exactly between the two bars on Android and the extra spacing is 0. A likely cause of the scrolling problem was removed too: an app-only rule that stopped page "bounce" on Android could also block the page from scrolling on some WebView versions. That rule now applies only to iPhone, where it's safe.
- **Bar colours:** the strips behind the status bar and navigation bar now follow the app's light/dark theme (were grey). Uses a small Android plugin (`ItqanWindowPlugin.java`).
- **Back button (Android app):** closes an open dialog/menu → otherwise goes to the 📖 القرآن tab → on the Mushaf tab, closes the app. (Previously it walked back through every tab you had visited.)
- **Website icon:** the app's icon is now the website's icon too — browser tab, bookmarks, and "Add to Home Screen" on phones (`icons/`, `manifest.webmanifest`).

# 🗑 Account deletion — 2026-10-16

Required by Google Play and the App Store for apps with sign-up.

- **👤 ملفي الشخصي → ⚠️ حذف الحساب**: a dialog lists exactly what's deleted, needs a "I understand" tick, then deletes the account and signs this device out ("🗑 تم حذف حسابك نهائيًا"). Bookmarks / last page / reciter stay on the device. Android back button closes the dialog in the app.
- **Web link** for the Play Console's "delete account" field: `https://issa13.github.io/itqan/#delete-account` — opens the dialog, asking to sign in first if needed.
- **New Edge Function `delete-account`** — deletes the login with Supabase's official admin API (needs the service-role key, so it can't be done from the browser). Only ever deletes the caller.
- **Database (re-run `supabase-schema.sql`)**:
  - *Bug found while testing:* anyone who had ever won a duel question **could not be deleted at all** — not even from the Supabase dashboard — because three duel columns (`duels.winner_id`, `duels.forfeited_by`, `duel_questions.winner_user_id`) blocked it. They now become empty instead.
  - New `prepare_account_deletion()`: a duel that's underway is forfeited first, so the opponent gets the win instead of the duel vanishing mid-question.
- Tested on a real Postgres with the full schema (fresh install and upgrade of the previous version): after deletion no row anywhere mentions the player; the opponent keeps their stats and their duels with other players; anonymous callers can't run the helper. The function was tested for every case (no login, wrong confirmation, someone else's id in the request, server error) and the dialog in a phone-sized browser.

# 📱 Mobile app — 2026-10-16

The website is now also an **Android and iPhone app** (folder `mobile/`, built with Capacitor 8). Full beginner guide: **MOBILE.md**.

- Same code as the website — `npm run sync` in `mobile/` copies it into the app; nothing to maintain twice.
- Works offline for reading/quizzes/local challenges from the very first launch (all Quran data is inside the app).
- App-only touches (`mobile/native/`): Android back button closes menus/dialogs then goes to the previous tab, status-bar icons follow the light/dark theme, notch/navigation-bar spacing on older Android phones, splash screen, app icon.
- Automatic Android build on GitHub (`.github/workflows/android-app.yml`): an installable test APK on every push to `main`, and a signed Google Play bundle once signing secrets are added.
- Website change: `supabase-client.js` uses `authRedirectUrl()` for the confirm/reset email links; unchanged on the website, points to `https://issa13.github.io/itqan/` inside the app.
- In-app account deletion (required by both stores) — added, see the entry above.

# Second audit — 2026-10-16

Tested this time against a **real local Supabase stack** (Supabase Auth/GoTrue + PostgREST + Postgres running your `supabase-schema.sql`, plus your Edge Function), with two real accounts in a browser — login, quizzes, ذاتي sessions and resume, profile, friends, leaderboard, password reset, and duels.

## Your two reports
- **Login "nothing happens".** Logging in worked (modal closes in ~0.4 s), but if you logged in from the 👤 profile, 👥 friends or 🏆 leaderboard tab, that tab was **not reloaded** — it stayed empty/"سجّل الدخول" until a refresh. Logging out had the reverse bug (your friend code and friends stayed on screen). Now the open tab re-renders on login/logout, a "✅ تم تسجيل الدخول" / "تم تسجيل الخروج" message appears, the button says "جارٍ تسجيل الدخول..." while waiting, and a stalled connection gives up after 20 s with a message instead of hanging forever. Also applied Supabase's recommended fix for a known sign-in stall (auth listeners now run after sign-in completes).
- **📝 اختبارات scroll.** After answering, the page scrolls so "سؤال جديد" and the ✅/❌ line sit just above the bottom nav (only if they're off-screen).

## Security (database — re-run `supabase-schema.sql`)
All reproduced through the REST API as a normal signed-in player, then confirmed fixed:
| Issue | Fix |
|---|---|
| A duel player could **rewrite or delete the shared duel questions** (the "public" view was writable — e.g. remove the right answer for the opponent) | All views are read-only for clients |
| A player could **read every upcoming duel question** at the start | View only returns questions already reached |
| A losing player could **skip each question instantly** so the opponent never scores (forcing a draw) | Server only advances when a point was won, both answered, or time ran out |
| Answers accepted **before the question was shown or after time ran out** | Server enforces the question window |
| **Invite spam** — 5 taps = 5 banners for the other person | A new invite replaces the previous pending one |
| Old invites / abandoned duels resurfaced days later | Invites expire after 10 min; unstarted duels stop being resumed |
| Quick match could pair you with someone who'd closed the tab | Queue entries older than 2 min are ignored; the app stops waiting at 2 min |
| Attempts could be added to **finished** sessions or pages outside the session's range | Rejected (attempt still counts for XP, just not for that session) |

## Security (website)
- **Script injection in the "online now" duel list:** presence data comes from other people's browsers and a crafted user id was inserted into the page unescaped. Now validated + escaped, and names are looked up from the database instead of trusted.
- **Content-Security-Policy** added: only the site's own script files can run, so an HTML-injection bug can't execute code. The inline startup script moved to `boot.js` for this.

## Bugs
- **Quran reader hidden under the bottom nav:** the reader had a hard 750px minimum height, taller than most phone screens — the ▶ السابقة / التالية ◀ buttons and page number were under the bottom nav, and the reader scrolled. It's now exactly one screen tall on every size; the font also shrinks (to a readable minimum) so all 15 lines fit. On short phones this also fixed lines being cut off.
- **Back button left the site.** Each tab is now its own address (`#home`, `#profile` …): back/forward move between tabs and refreshing keeps you on the same tab. Auth links (password reset / email confirmation) are left untouched.
- Switching accounts in the same tab kept the previous account's ذاتي quiz, live duel, cached name and friend list.
- If preparing duel questions failed, the opponent was stuck on "بانتظار المضيف" (with only a surrender button that counts as a loss) — the duel is now cancelled.
- Duel "first/last ayah" questions had random-ayah wrong answers (guessable by shape) — now uses other pages' first/last ayahs like the solo quiz.
- Leaderboard: the database sent an arbitrary 200 public sessions before ranking, so real top players could be missing; friends tab could miss friends. Now ordered/filtered on the server.
- Signing up with an already-registered email (when email confirmation is on) said "check your email" — now says the email is taken.
- New tabs opened scrolled halfway down (kept the previous tab's position).
- Duel invite banner showed ⚔️ twice; achievement toasts appeared behind the bottom nav.

## New
- **"نسيت كلمة المرور؟"** in the login dialog → reset email → "🔑 كلمة مرور جديدة" dialog on return (tested end-to-end).
- **Edit your display name** in 👤 ملفي الشخصي.
- **`npm run bump`** sets the cache-busting version everywhere in `index.html` before a deploy.
- Escape closes dialogs; bottom nav announces the current tab to screen readers; phone address-bar colour follows the dark/light toggle.

## Deploy steps
1. Re-run `supabase-schema.sql` in the SQL Editor.
2. `supabase functions deploy generate-duel-questions`
3. In Supabase → Authentication → URL Configuration, make sure your site is in **Redirect URLs** (see SETUP.md §4) — needed for the new password reset.
4. `npm run bump`, commit, push.

---

# Website audit & cleanup — 2026-10-15

## 1. Mobile/Capacitor scaffolding removed
- Deleted: `ios/`, `www/` (generated copy), `capacitor.config.json`, `native-shell.js`, `scripts/build-www.js`, `mobile-app-capacitor-prompt.md`, `supabase/.temp/` (CLI cache), the duplicate root `index.ts`, and the unused `quran-index/ayahs-sample.json`.
- `package.json`: Capacitor dependencies and `build:web`/`sync`/`android`/`ios` scripts removed; lockfile regenerated.
- `index.html`: `native-shell.js` script tag removed. README §2/§9 and SETUP updated.
- **Kept on purpose:** self-hosted `vendor/` (Supabase SDK) and `fonts/` — they make the website faster and CDN-independent too. `viewport-fit=cover` + safe-area CSS also stay; they matter for iPhone Safari.
- `android/` wasn't in the upload — delete it from your repo yourself.

## 2. Security (database) — re-run `supabase-schema.sql` to apply
Each of these was reproduced against the original schema on a local Postgres, then confirmed fixed:
| Issue | Impact | Fix |
|---|---|---|
| `attempts` policy was `FOR ALL` | Any user could insert fake attempts or `UPDATE … SET is_correct = true` on all their answers → fake leaderboard accuracy | SELECT-only; writes only via `record_attempt()` |
| `award_duel_win_achievements()` callable by anyone (Postgres default `EXECUTE` grant) | Anonymous visitors could give any account unlimited +50 XP and duel badges | Section 30 revokes `EXECUTE` on all security-definer functions, re-grants only the app's RPCs to `authenticated` |
| `record_attempt()` trusted page/type | Fake pages (e.g. 9999) polluted the heatmap and could fake the 500-pages badge | Validates type, page 1–604, range, hour |
| Display name unbounded | 5,000-char names on the leaderboard / duel lobby | Trimmed + max 40 chars (DB constraint + signup trigger + UI max 30) |
| Duel timer unvalidated | Duels with 100,000-second timers | 5–60 s enforced |
| `duel_answers` readable mid-question | A player could poll the opponent's chosen answer during the live question | Opponent's answers visible only after the question ends |
| Profile update policy had no `WITH CHECK` | Defence-in-depth gap | Added |

## 3. Bugs fixed
- **"خمن الآية التالية" (`next`) broken server-side:** missing from the server whitelist and badge catalog → online duels with that type always failed to create, and after a user's 30th correct `next` answer every further one failed to save.
- **Quran search barely worked:** the Uthmani text (ٱ, ـٰ, وٰ, ءا, pause marks) didn't match normal typing — "الله" found 2 ayahs, "الرحمن"/"الصلاة"/"السماوات"/"الذين امنوا" found 0. Rewritten with proper normalisation (now 1782 / 48 / 61 / 183 / 220).
- **Mushaf page clipped on small phones (≤360px):** the font-fit loop had min = max = 16px, so it never shrank; up to 11 of 15 lines were cut off. Now shrinks to as low as 11px only when needed.
- **Re-running the schema created bogus sessions:** the legacy backfill swept every 📝 اختبارات attempt into a new "الجلسة الأولى" session on each run.
- Auth listeners re-ran on every token refresh (~hourly) → duplicate realtime subscriptions and refetches. Now only on actual sign-in/out.
- Fast page turns could render an older page over the newer one; same for overlapping searches.
- Range listening looped through hundreds of ayahs instantly when offline; now stops after 3 failures.
- Online duel: endless 800 ms retry loop if a question never loaded; now capped.
- Saved settings from the server could leave a `<select>` with no valid value.
- A failed surah-catalog load was cached forever (until page reload).
- Edge Function: missing `next` type, CORS headers missing on errors (browser saw an opaque CORS error), double-call returned an error instead of success, internal error details leaked to the client.
- Streak showed 0 every morning until you answered something today.
- Ayah text rendered Quranic pause marks as boxes (UI font lacks them) — now uses the self-hosted Quran font.

## 4. Validation & UX
- Login/signup is a real `<form>`: Enter submits, password managers work, email/password/name validated with Arabic messages; raw server errors no longer shown.
- Custom page-range inputs normalise in place (1–604, swapped if reversed) in all four setups.
- Listen-range ayah inputs cap at the chosen surah's length.
- Bookmarks validated/escaped (they come from editable localStorage), names capped at 40, list capped at 100.
- Escape closes modals and the ⋮ menu; close buttons labelled for screen readers.

## 5. Mobile-responsive
- Bottom nav: all 6 tabs now fit on a 320px screen (two tabs were hidden off-screen before).
- No iOS zoom-in when focusing inputs (16px on touch devices).
- Modals and page height use `dvh`, so mobile browser bars don't hide content.
- Verified 320 / 375 / 414 / 768 / 1280px: no horizontal overflow, no console errors.

## 6. Deploy & caching
- All JS now has `?v=` cache-busting (previously only CSS) — bump the version string in `index.html` on each deploy.
- `quran-index/*.json` minified (2.5 MB → 2.0 MB); `derive-quran-index.js` now writes minified output.

## Known limitation (by design, not changed)
Solo-quiz answers (📝 اختبارات / ذاتي) are graded in the browser, so a determined user can still report correct answers to `record_attempt()`. Validation and the 350 ms rate limit contain it; full prevention would need server-side questions like duels. See README §10.
