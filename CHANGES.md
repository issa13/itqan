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
