# 📱 إتقان on Android & iPhone — a beginner's guide

This guide assumes you have never built a phone app before. Read part 1 once, then follow **part 2** to have the app on your Android phone today — it needs nothing installed on your computer.

---

## 1. What was built (the 2-minute version)

The app is **your website inside an app shell**. A free tool called **Capacitor** takes the same `index.html`, `app.js`, `quran-reader.js`, Mushaf pages… and packs them into a real Android app and a real iPhone app. Inside the phone, the app shows them in a full-screen, built-in browser view (no address bar), loaded from the phone itself instead of from the internet.

```
 itqan/                    ← your website (unchanged — GitHub Pages still serves it)
 ├── index.html, app.js, quran-reader.js, mushaf-layout/, quran-index/ …
 │
 └── mobile/               ← NEW: everything for the phone apps
     ├── native/           ← 2 small files that exist ONLY in the app
     ├── scripts/copy-web.js   copies the website into mobile/www/
     ├── www/              ← that copy (made automatically, never edit it)
     ├── android/          ← the Android project (opened with Android Studio)
     ├── ios/              ← the iPhone project (opened with Xcode, on a Mac)
     └── assets/           ← the app icon + splash screen pictures
```

**The golden rule:** you keep working on the website exactly as before. To put your latest website changes into the app, you "sync" (part 6) — one command, or automatically on GitHub.

### What's different in the app compared with the website
| | |
|---|---|
| 📖 Quran, search, bookmarks, quizzes, 📱 محلي challenges | Work **with no internet at all** — even the very first time, because all files are inside the app. |
| 🎧 Recitation, accounts, 🌐 duels, friends, leaderboard | Need internet, same as the website. |
| Android **back button** | Closes the ⋮ menu or an open dialog first; from any other tab it goes to the 📖 القرآن (Mushaf) tab; on the Mushaf tab it closes the app. |
| Status bar (clock, battery) & navigation bar | Their background follows the app's light/dark theme and their icons stay readable. |
| Notch / navigation bar | Content never hides behind them. On Android the page sits between the two bars (no gaps, scrolls to the very end); on iPhone it uses the notch / home-bar sizes. |
| Icon & splash screen | Green/gold 8-pointed star with an open Mushaf (`mobile/assets/` — replace if you like, see part 6). The website uses the same icon (`icons/`). |
| Screen rotation | Phones stay upright (the Mushaf page is designed for a tall screen). iPads can rotate. |
| "Confirm your email" / "reset password" emails | The link opens **your website** in the phone's browser (an email can't open the app directly). After confirming or setting a new password there, go back to the app and log in. |

### What changed in your website files
Only one small thing: `supabase-client.js` now asks `authRedirectUrl()` where account emails should lead. On the website it's still "this page", exactly as before; inside the app it's `https://issa13.github.io/itqan/`.

---

## 2. Words you'll see

| Word | Meaning |
|---|---|
| **Capacitor** | The free tool that turns the website into Android/iPhone apps. |
| **APK** | An Android app file you can install directly on a phone (for testing / sharing). |
| **AAB** | The Android file Google Play wants for publishing. You don't install it yourself. |
| **Android Studio** | Google's free program for building Android apps (Windows, Mac or Linux). |
| **Xcode** | Apple's free program for building iPhone apps — **Mac only**. |
| **Emulator / Simulator** | A pretend phone that runs on your computer. |
| **Sync** | Copy the latest website files into the app projects. |
| **App ID** | The app's unique name in the stores: `io.github.issa13.itqan`. Never change it after publishing. |
| **Signing key** | A secret file that proves updates come from you. Needed only for Google Play (part 5). |
| **GitHub Actions** | GitHub's free computers that can build the app for you (tab "Actions" in your repo). |

---

## 3. ⭐ Fastest: get the app on your Android phone (no installs)

GitHub builds the APK for you with `.github/workflows/android-app.yml`.

1. **Upload the new files to GitHub** the same way you always do (the new `mobile/` folder, `.github/` folder, `MOBILE.md` and the updated `supabase-client.js`, `README.md`, `CHANGES.md`).
   - ⚠️ The `.github` folder starts with a dot, so on Mac/Windows it may be **hidden**. If you upload through the GitHub website, drag the whole `itqan` folder contents, or create the file by hand: *Add file → Create new file*, name it `.github/workflows/android-app.yml` and paste its contents.
2. On GitHub, open your repo → **Actions** tab. You'll see **"Android app"** running (yellow dot). It takes about 5–10 minutes.
   - Not running? Click **Android app** on the left → **Run workflow** → **Run workflow**. (It starts by itself only on the `main` branch.)
3. When it shows a green ✅, click the run → scroll to **Artifacts** → download **itqan-android-test-apk**. It's a `.zip` with the `.apk` inside.
4. Put the `.apk` on your phone (e.g. send it to yourself on WhatsApp/Telegram/Drive, or download it on the phone directly while signed in to GitHub), and tap it.
5. Android will ask to allow **"Install unknown apps"** for the app you opened it from (Files, Chrome, Telegram…) → allow → **Install**. If Play Protect says *"unknown developer"*, choose **Install anyway** — that's normal for an app that isn't on Google Play yet.
6. Open **إتقان** from your home screen. 🎉

Every time you push changes to `main`, a fresh APK is built. Installing a newer one over the old one **keeps your data**.

---

## 4. Building on your own computer

You need this when you want to try changes quickly, use an emulator, or build for iPhone.

### 4a. One-time setup (any computer)
1. Install **Node.js (LTS)** from <https://nodejs.org> — just click Next through the installer.
2. Open a terminal (Windows: *PowerShell*; Mac: *Terminal*) in the `mobile` folder of the project. Tip: in the File Explorer / Finder, open `itqan/mobile`, then type `cmd` in the Explorer address bar (Windows) or right-click → *New Terminal at Folder* (Mac).
3. Run:
   ```bash
   npm install
   ```
   This downloads Capacitor into `mobile/node_modules/` (a few minutes, only once).

### 4b. Android (Windows, Mac or Linux)
1. Install **Android Studio** from <https://developer.android.com/studio>. On first launch, choose **Standard** setup and let it download everything (big download, be patient).
2. In the terminal (inside `mobile/`):
   ```bash
   npm run android
   ```
   This syncs the website into the app and opens the project in Android Studio. *(If Android Studio doesn't open by itself: Android Studio → **Open** → choose the `mobile/android` folder.)*
3. Wait until the bar at the bottom of Android Studio finishes ("Gradle sync" — the first time can take 10+ minutes).
4. Pick where to run it, in the device menu at the top:
   - **A pretend phone:** *Device Manager* (phone icon on the right) → **+** → *Create Virtual Device* → pick a Pixel → Next → download a system image → Finish.
   - **Your real phone:** on the phone open *Settings → About phone* → tap **Build number 7 times** (you're now a "developer") → back to *Settings → System → Developer options* → turn on **USB debugging** → plug it into the computer with a cable → tap **Allow** on the phone.
5. Press the green **▶ Run** button. The app opens on the phone/emulator.

### 4c. iPhone (needs a Mac)
Apple only allows iPhone apps to be built on a Mac with **Xcode**. If you don't have a Mac, see "No Mac?" below.

1. Install **Xcode** from the Mac App Store (large, ~10 GB). Open it once and accept everything it asks.
2. Do 4a on the Mac, then in the terminal (inside `mobile/`):
   ```bash
   npm run ios
   ```
   Xcode opens the project. Wait for "Fetching packages / Indexing" at the top to finish.
3. Sign in with your Apple ID: Xcode → **Settings → Accounts → +** → Apple ID.
4. In the left panel click **App** (blue icon) → **Signing & Capabilities** tab → **Team**: choose your name ("Personal Team" is fine and free).
   - If it says the bundle identifier isn't available, change it to something unique like `io.github.issa13.itqan.dev` (only for testing).
5. Choose where to run it at the top: an **iPhone simulator**, or your **real iPhone** plugged in with a cable. For a real iPhone the first time:
   - iPhone: *Settings → Privacy & Security → **Developer Mode** → On* (it restarts).
   - After the first Run: *Settings → General → VPN & Device Management* → tap your Apple ID → **Trust**.
6. Press **▶**.

With a free Personal Team the app on your iPhone stops opening after **7 days** — just press ▶ again from Xcode. That limit disappears with the paid Apple Developer Program (part 5).

**No Mac?** Options: borrow a Mac for an afternoon; rent a Mac in the cloud by the hour (e.g. MacinCloud); or use a build service such as Codemagic or Ionic Appflow that builds iPhone apps from your GitHub repo (they still need a paid Apple Developer account to put the app on a real iPhone).

---

## 5. Publishing to the stores (when you're ready)

### ✅ Account deletion (done — 2 setup steps on your side)
Both stores require that people can delete their account from inside the app. It's in **👤 ملفي الشخصي → ⚠️ حذف الحساب**. To switch it on:
1. **Database:** Supabase → *SQL Editor* → paste the whole `supabase-schema.sql` → **Run** (safe to re-run; it keeps your data). This also fixes a bug where anyone who had ever won a duel question couldn't be deleted at all.
2. **Server function:** in a terminal in the project folder (the same way you deployed the duel function — see SETUP.md):
   ```bash
   supabase functions deploy delete-account
   ```

Google Play's *Data safety* form also asks for a **web link** where people can delete their account — use:
`https://issa13.github.io/itqan/#delete-account` (it opens the delete dialog, signing in first if needed).

You'll also need a short **privacy policy page** (what data you store: email, display name, quiz progress — in Supabase) — it can be a simple page on your GitHub Pages site.

### Google Play
1. Create a developer account at <https://play.google.com/console> (one-time US$25 fee). New *personal* accounts must first run a **closed test with at least 12 testers for 14 days in a row** before the app can go public — plan for that.
2. **Make your signing key** (once, keep it forever). In Android Studio: **Build → Generate Signed App Bundle / APK → Android App Bundle → Next → Create new…** Save it as `mobile/android/itqan-release.jks`, alias `itqan`, choose passwords, fill your name → OK. **Back it up** (e.g. on a USB stick + a password manager). Losing it means you can never update the app.
3. Build the `.aab`, either way:
   - **In Android Studio:** continue that same wizard → *release* → **Create**. The file is in `mobile/android/app/release/`.
   - **On GitHub (automatic):** repo → *Settings → Secrets and variables → Actions → New repository secret*, add 4 secrets:
     | Name | Value |
     |---|---|
     | `ANDROID_KEYSTORE_BASE64` | the `.jks` file as text: Mac/Linux `base64 -i itqan-release.jks \| pbcopy` (or `base64 -w0 itqan-release.jks`), Windows PowerShell `[Convert]::ToBase64String([IO.File]::ReadAllBytes("itqan-release.jks")) \| Set-Clipboard` |
     | `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
     | `ANDROID_KEY_ALIAS` | `itqan` |
     | `ANDROID_KEY_PASSWORD` | the key password |
     From then on each run also produces **itqan-android-play-store** (the `.aab`).
4. In Play Console: *Create app* → fill the store listing (name, description, screenshots, icon — `mobile/assets/icon-only.png`), the *Data safety* form and the privacy policy link → upload the `.aab` to a testing track.
5. **Version numbers:** each upload needs a bigger "version code". GitHub builds use the run number automatically; for Android Studio builds raise `versionCode` in `mobile/android/app/build.gradle` by 1 each time.

> The test APK from part 3 and the Play Store version are signed differently, so uninstall the test version before installing from Google Play (guest progress on that phone would be lost; signed-in progress is safe in your account).

### App Store (iPhone)
1. Join the **Apple Developer Program** (US$99 per year) at <https://developer.apple.com/programs/>.
2. In Xcode set **Team** to that paid team, and set the version in *App → General → Identity*.
3. Create the app on <https://appstoreconnect.apple.com> (same App ID `io.github.issa13.itqan`), fill the listing, privacy details and screenshots.
4. Xcode → choose **Any iOS Device** → **Product → Archive** → **Distribute App → App Store Connect**. Test it with **TestFlight**, then submit for review.

---

## 6. Day-to-day: changing the app

| You want to… | Do this |
|---|---|
| Update the app after changing the website | Push to GitHub as usual → a new APK appears in **Actions**. On your computer: `npm run sync` in `mobile/`, then ▶ in Android Studio/Xcode. |
| Add a **new file** to the website (e.g. `stats.js`) | Also add its name to `WEB_FILES` (or `WEB_FOLDERS`) at the top of `mobile/scripts/copy-web.js`, or it won't be in the app. |
| Change the icon or splash screen | Replace the PNGs in `mobile/assets/` (same names and sizes: icons 1024×1024, splash 2732×2732), then run `npm run icons` in `mobile/`. For the website, also replace the files in `icons/` (same names and sizes). |
| Change the app's name on the home screen | `appName` in `mobile/capacitor.config.json`, plus `app_name` in `mobile/android/app/src/main/res/values/strings.xml` and *Display Name* in Xcode. |
| Move the website to a new address | Update `QF_AUTH_REDIRECT_URL` at the top of `mobile/native/native-app.js` and add it in Supabase (part 7). |
| Update Capacitor itself (maybe once a year) | `npm install @capacitor/core@latest @capacitor/cli@latest @capacitor/android@latest @capacitor/ios@latest @capacitor/app@latest @capacitor/splash-screen@latest` in `mobile/`, then `npm run sync`. Check Capacitor's upgrade guide for major versions. |

`npm run bump` (website) still works as before — the app picks up the new version on the next sync.

---

## 7. One check in Supabase (2 minutes)

So the email links from the app are accepted: Supabase dashboard → **Authentication → URL Configuration** → under **Redirect URLs** make sure `https://issa13.github.io/itqan/` is listed (it's probably already your *Site URL*; adding it here too doesn't hurt). Nothing else in Supabase needs to change — the app talks to it exactly like the website.

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| `npm run sync` says *Missing website file / folder* | The `mobile` folder must sit inside the website folder (next to `index.html`). For `quran-index` / `mushaf-layout` see README §3. |
| GitHub "Android app" run failed (red ❌) | Click it → click the red step to read the error. Most often a file wasn't uploaded (e.g. `mobile/package-lock.json` or the `.github` folder). |
| No "Android app" in the Actions tab | The `.github/workflows/android-app.yml` file isn't on GitHub (hidden dot-folder, see part 3) or Actions are disabled: *Settings → Actions → General → Allow all actions*. |
| Phone says *"App not installed"* | An older copy signed differently is installed — uninstall it first. |
| Android Studio: *"SDK location not found"* | Open Android Studio's *Settings → Languages & Frameworks → Android SDK* once and let it install, then *File → Sync Project with Gradle Files*. |
| `npm run android` / `npm run ios` can't find the program | Open it yourself: Android Studio → Open → `mobile/android`; Xcode → Open → `mobile/ios/App/App.xcodeproj`. |
| Xcode: *"Signing requires a development team"* | Part 4c step 4. |
| App shows old content after you changed the website | You forgot to sync: `npm run sync`, then ▶ again. |
| Login works on the website but email-confirm link "doesn't open the app" | Expected — it opens the website. Confirm there, then log in inside the app. |
| Recitation stops when the screen locks | Background audio is enabled for iPhone and usually works on Android, but phone makers' battery savers can still pause it; a fully native audio player would be a future improvement. |

---

## 9. Files reference (mobile/)

| File | What it does |
|---|---|
| `package.json` | The commands (`sync`, `android`, `ios`, `icons`) and Capacitor version. |
| `capacitor.config.json` | App ID, app name, splash-screen and status-bar settings. |
| `scripts/copy-web.js` | Copies the website into `www/` and adds the two app-only files; also makes the notch/navigation-bar spacing work on older Android phones. |
| `native/native-app.js` | App-only behaviour: back button, status/navigation-bar colours, keeping the page between the Android bars, splash screen, email-link address. |
| `native/native-app.css` | App-only styling: safe-area spacing (0 on Android), no page "bounce" on iPhone, no grey flash when tapping buttons. |
| `android/app/src/main/java/…/ItqanWindowPlugin.java` | A tiny Android plugin that colours the strips behind the status/navigation bars to match the theme. |
| `assets/` | Source pictures for the icon and splash screen. |
| `android/` | The Android Studio project. Signing setup is in `android/app/build.gradle`; `android/keystore.properties.example` shows the file to create for local release builds. |
| `ios/` | The Xcode project (uses Swift Package Manager — no CocoaPods needed). Background audio is enabled in `ios/App/App/Info.plist`. |
| `www/`, `node_modules/` | Generated — not uploaded to GitHub (`.gitignore`). |
| `../.github/workflows/android-app.yml` | The automatic Android build on GitHub. |
