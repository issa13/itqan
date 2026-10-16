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
