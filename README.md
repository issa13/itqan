# 📖 إتقان (Itqan) — How This App Works

This is a plain-language map of the whole project — what each file does, where the Quran data actually comes from, what needs the internet and what doesn't, and how to run it on your own laptop without confusion.

---

## 1. The big picture

This is a **static web app** — no build step, no backend server of your own. It's just HTML/CSS/JS files that a browser loads directly. Two outside things it talks to:

- **Supabase** — a hosted database/auth service, used ONLY for accounts, syncing XP/streaks/achievements, friends, leaderboards, resumable ⚔️ التحديات → ذاتي sessions, and online duels.
- **everyayah.com** — a plain file server that hosts Quran recitation audio (mp3 files).

Everything else — the Quran text itself, page layout, search, question generation — now lives **in your own repo**, as plain files. That's the part that changed recently and is probably why things feel confusing, so the rest of this doc focuses there.

---

## 2. File map

| File | What it does |
|---|---|
| `index.html` | The whole app's structure — every screen/tab/modal lives in this one file, shown/hidden with CSS. |
| `styles.css` | All visual styling. |
| `boot.js` | Tiny startup script (theme before first paint, data version). |
| `config.js` | Your Supabase project URL + public key. If left as placeholders, the app runs in **guest mode** (see §5). |
| `supabase-client.js` | Thin wrapper around the Supabase SDK — login, signup, and every database call. |
| `auth-ui.js` | Wires up login/signup UI, profile, friends, leaderboard, and switching between tabs. |
| `app.js` | The core: solo quiz ("اختبارات"), challenges ("تحديات" — 📱 محلي, 🌐 مباشر, 📝 ذاتي), XP/leveling, and the online-duel *client* (the UI side, not the server side). |
| `net-status.js` | Knows whether the internet really works (phones say "online" even when no data gets through): time limits on every request, offline/online switching, a saved copy of the last loaded data for offline use. `supabase-client.js` sends everything through it and queues answers given offline. |
| `notify.js` | Challenge notifications: asks permission on first open, then shows a system notification for each new duel invite (Capacitor Local Notifications in the app, the browser's Notification API on the website). |
| `audio-store.js` | Recitation saved on the device for offline listening (📥): the app's own storage in the phone app, the browser's Cache Storage on the website. Also decides whether an ayah plays from the device or the internet. |
| `quran-reader.js` | The whole "📖 القرآن" reading tab — page rendering, search, bookmarks, reciter choice, listen-to-a-range (with gapless-ish preloading), and swipe-to-turn-page on mobile. |
| `supabase/functions/generate-duel-questions/index.ts` | A **Supabase Edge Function** — server-side code that generates the questions for online duels (🌐 مباشر). Runs on Supabase's servers, not in the browser. |
| `supabase/functions/delete-account/index.ts` | **Supabase Edge Function** that permanently deletes the caller's account (👤 ملفي الشخصي → حذف الحساب). Needs the service-role key, so it can't run in the browser. Deploy: `supabase functions deploy delete-account`. |
| `supabase-schema.sql` | The database structure (tables, security rules, functions) — you run this once in Supabase's SQL editor. |
| `mushaf-layout/` | 604 JSON files — one per Mushaf page (see §3). |
| `quran-index/` | 2 JSON files, derived from the above (see §3). |
| `download-mushaf-layout.sh` | One-time script that downloads `mushaf-layout/`. |
| `derive-quran-index.js` | One-time script that builds `quran-index/` from `mushaf-layout/`. |
| `vendor/`, `fonts/` | **Generated** by `npm run vendor` (§9): the Supabase browser bundle and the three web fonts, self-hosted so nothing is loaded from a CDN. Committed to the repo. |
| `package.json`, `scripts/vendor.js` | Tooling only (vendoring third-party assets). The app itself has no build step. |
| `fix-mushaf-surah-headers.js` | One-time repair script for surah-header lines in `mushaf-layout/`. |
| `icons/`, `manifest.webmanifest` | The app icon for the website (browser tab, "Add to Home Screen" on phones) — the same design as the Android/iPhone app icon. |
| `mobile/` | The **Android & iPhone app** — the same website packed into a phone app with Capacitor. Everything about it is in **`MOBILE.md`**. |
| `.github/workflows/android-app.yml` | Builds the Android app automatically on GitHub (Actions tab) on every push to `main`. |

---

## 3. The Quran data pipeline (the confusing part)

There are **two different local datasets**, because they answer two different questions, and it's worth being clear on why both exist instead of just one.

```
mushaf-layout/page-XXX.json  (604 files, one per printed page)
        │
        │  organized by PRINTED LINE — "what word sits on
        │  which of the 15 lines of page 42?"
        │  → used ONLY by the reading tab, so it can show a
        │    real Mushaf page, line for line.
        │
        ▼
  node derive-quran-index.js   (run once, by you)
        │
        ▼
quran-index/surahs.json   — the 114-surah catalog (name, ayah count, start page)
quran-index/ayahs.json    — all 6,236 ayahs, WHOLE ayah text each, with its page

        organized by AYAH — "what's the full text of 2:255,
        and what page is it on?"
        → used by the quiz, offline challenges, search, and
          surah/juz navigation.
```

**Why not just use one?** Because "what's on this printed line" and "what's the full text of this ayah" are genuinely different shapes of the same information — an ayah often spans several lines, so you can't get whole-ayah text directly out of the line-based file without reassembling it. `derive-quran-index.js` does that reassembling **once**, so nothing else in the app has to do it over and over.

**Neither of these needs any internet API.** They're just files sitting in your repo, same as `styles.css`. `alquran.cloud` (the API this app used to depend on for text) isn't used anywhere client-side anymore.

### Setup order matters
1. `./download-mushaf-layout.sh` → creates `mushaf-layout/`
2. `node derive-quran-index.js` → reads `mushaf-layout/`, creates `quran-index/`
3. Commit both folders to your repo.

If you skip step 2, or run it before step 1 finishes, the quiz and search will show a "couldn't load" message rather than break silently — that message will explicitly mention `quran-index` or `mushaf-layout` so it's obvious what's missing.

---

## 4. Audio

Recitation audio is **not** text, so it can't come from the JSON files above — it's real mp3 files, hosted by **everyayah.com** (a long-established, dedicated Quran audio host). The app builds the file URL directly:

```
https://everyayah.com/data/{ReciterFolder}/{surah:03d}{ayah:03d}.mp3
```

No API call, no lookup — just a predictable URL per reciter. This **does** need internet, every time (the files are too large to keep a personal copy of all reciters).

---

## 5. What needs the internet, and what doesn't

| Feature | Needs internet? |
|---|---|
| 📖 Reading the Quran, searching, bookmarks, goto page/surah/juz | **No** — all local files |
| 🎧 Listening to recitation (single ayah or a range) | **Yes** — streams from everyayah.com |
| 📝 اختبارات (solo quiz) — as a **guest** | **No** — text is local, scoring is saved in your browser only |
| 📝 اختبارات — **signed in** | **Yes** — XP/streaks/achievements are saved to your account via Supabase. There's no "session" here anymore either way — signed-in and guest play the exact same way, just with the account sync on top. |
| 📱 تحديات محلي (offline pass-and-play, one device) | **No** — same local text, never touches Supabase at all |
| 📝 تحديات ذاتي (solo, session-backed) — as a **guest** | **No** — fully in-memory; doesn't save and won't survive a page refresh |
| 📝 تحديات ذاتي — **signed in** | **Yes** — creates a real, resumable session (survives a refresh) and can count toward the leaderboard |
| 🌐 تحديات مباشر (online 1v1 duels) | **Yes**, always — matchmaking, live scoring, and question generation all happen on Supabase's servers |
| Friends / leaderboard / profile sync | **Yes** — all Supabase |

**Guest mode** (no account) is what makes the "no internet" rows possible — it stores everything (progress, last-read page, bookmarks, reciter choice) in your browser's `localStorage` instead of a server.

---

## 6. Running it on your own laptop

This is the part that trips people up. **How** you open the app matters:

- ❌ **Double-clicking `index.html`** opens it as `file:///Users/you/.../index.html`. Browsers block pages loaded this way from reading *other* local files (like `quran-index/surahs.json`) as a security measure — even though the file is right there on your disk. This will make the quiz and Quran tab fail to load data, for reasons that have nothing to do with your internet connection.
- ✅ **Serving it over local HTTP** avoids that entirely. From the project folder, run:
  ```
  python3 -m http.server
  ```
  then open `http://localhost:8000` in your browser. No installation needed if you already have Python (macOS/Linux have it by default; Windows may need `python` instead of `python3`, or use `npx serve` if you have Node instead).

Once served this way, the address bar shows `http://localhost:...` — not `file://` — and local fetches work normally, with or without an actual internet connection.

### The other thing that was silently breaking things
Until recently, the Supabase login library and the fonts were loaded from internet CDNs. Both are now **self-hosted** (`vendor/supabase.js`, `fonts/`, see §9), so the app has no CDN dependency at all. If the Supabase library still fails to load for any reason, the app falls back to guest mode automatically, the same way it does if `config.js` is left unfilled.

---

## 7. Quick troubleshooting

| Symptom | Likely cause |
|---|---|
| Quran tab / quiz says "تعذّر تحميل..." mentioning `quran-index` or `mushaf-layout` | Those folders aren't in the right place, or the derive script wasn't run — see §3. |
| Nothing loads at all, console errors mention `supabase` | `vendor/supabase.js` is missing — run `npm run vendor` and commit `vendor/` (§9). |
| Quran text looks wrong / wrong font | `fonts/` is missing — run `npm run vendor` and commit `fonts/` (§9). |
| Quran tab works but login doesn't | Expected offline — login always needs Supabase (§5). |
| Everything works online, breaks with wifi off | Check whether you're running via `file://` (§6) before assuming it's a code bug. |

---

## 7½. The phone app

`mobile/` turns this exact website into Android and iPhone apps — no second copy of the code to maintain. Keep editing the website as usual; `npm run sync` inside `mobile/` (or the automatic GitHub build) puts the changes into the app. Step-by-step instructions for beginners: **[MOBILE.md](MOBILE.md)**.

## 8. What's still on the roadmap (discussed, not yet built)

- **True offline (PWA)**: a service worker to cache the app shell itself, so it loads with zero connection at all (right now, "no internet needed" applies to the *data*, but the browser still needs to fetch the HTML/CSS/JS files themselves the first time).
- ~~Self-hosting the Supabase SDK file~~ — done (§9), along with the fonts.
- **Local queue for signed-in quiz attempts** made offline, synced once back online (currently, signed-in scoring simply requires a connection at the moment you answer).

---

## 9. Tooling, deploying, and how repeats are prevented

The Supabase browser library and the three fonts are **self-hosted** (`vendor/`, `fonts/`) so the site never depends on a CDN. They're generated once and committed:

```bash
npm install          # only the vendoring sources: @supabase/supabase-js + 3 @fontsource packages
npm run vendor       # regenerates vendor/ and fonts/ — COMMIT them (GitHub Pages serves them)
```

### Deploying
Before each deploy run `npm run bump` — it sets the cache-busting version in `index.html` (`data-asset-version` and every `?v=`) to today's date, so browsers drop their cached copies. Then commit and push; GitHub Pages serves the repo root as-is.

### Question de-duplication (how repeats are prevented)
A question is identified by **(type, question ayah)**.
- **⚔️ التحديات** (محلي / مباشر / ذاتي): the same question never repeats within one challenge. If a type runs out of unused questions in the chosen range (e.g. "ayah count" over 7 pages can only ever produce 7), the rest of that type is skipped with a notice instead of repeating, and the challenge is simply shorter.
- **📝 اختبارات:** the same question doesn't repeat within the next 25 questions. In a range so small that a type has fewer than 25 possible questions, the oldest one repeats first rather than blocking you.
- 🌐 مباشر builds its questions on the server (`supabase/functions/generate-duel-questions/index.ts`) with the same rule, so **redeploy the Edge Function** (`supabase functions deploy generate-duel-questions`) after updating it.
- ذاتي remembers what it already asked in `localStorage` (per session), so refreshing mid-challenge can't cause repeats either.

---

## 10. Security model (what protects what)

The anon key in `config.js` is public by design — **row-level security and the RPC functions in `supabase-schema.sql` are the real gatekeepers.** Rules worth knowing before changing the schema:

- **Clients only read tables directly.** Every write that affects scores (`record_attempt`, all duel/friend actions) goes through a `security definer` function that checks `auth.uid()` and validates its inputs. `attempts` in particular is SELECT-only for clients — if it ever allowed INSERT/UPDATE, anyone could fake leaderboard accuracy.
- **New functions are callable by everyone by default.** Postgres/Supabase grant `EXECUTE` to `anon` and `authenticated` automatically, so section 30 of the schema revokes it from every `security definer` function and re-grants only the ones the app calls. When you add a new RPC, add a matching `grant execute ... to authenticated` there (and nothing for internal helpers).
- **Solo-quiz scoring is client-reported.** Questions for 📝 اختبارات / ذاتي are generated in the browser, so a determined user could report answers as correct. The server limits the damage (input validation, one attempt per 350 ms), but fully cheat-proof scoring would need server-side question generation like duels use.
- **Online duels are server-authoritative.** Correct answers live only in `duel_questions` (never readable by clients) and are checked inside `submit_duel_answer()`.
- **Content-Security-Policy** (the `<meta http-equiv>` in `index.html`) only lets this site's own script files run — no inline scripts, nothing from other domains. That's why the startup code lives in `boot.js`. If you ever move Supabase to a custom domain, or add an audio host / analytics script, add that domain to the policy or the browser will block it.
- **Views are read-only, duels are time-checked on the server.** Section 30 revokes write access on every view; `submit_duel_answer()` / `advance_duel_question()` enforce the question window and only move on once a round is really over.
- **Account deletion is server-side and self-only.** `delete-account` works out who is calling from their own login token (an id in the request is ignored), requires the body `{"confirm":"DELETE_MY_ACCOUNT"}`, forfeits a running duel via `prepare_account_deletion()`, then deletes the login with the admin API; every table cascades from `auth.users`. If you add a new table that points at `auth.users`, give it `on delete cascade` (or `set null`) — a plain reference blocks deleting that player.
- **Anything user-typed is escaped before it's rendered** (`escapeHtml` and friends in the JS). Keep using `textContent` or those helpers for display names, bookmark names, etc.

After changing `supabase-schema.sql`, re-run the whole file in the Supabase SQL editor — it's written to be safely re-runnable.
