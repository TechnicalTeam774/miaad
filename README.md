# ميعاد — مهامك بمواعيدها

تطبيق لمهام اليوم. كل مهمة ليها ميعاد وعدّ تنازلي لحد وقتها، ولو الميعاد عدّى بيبان «متأخرة بقالها كذا».
فيه تنبيه قبل الميعاد، وتكرار، وتايمر تركيز، وسجل بنسبة الإنجاز، وملخص الصبح، وتذكير آخر اليوم.
الدخول بحساب جوجل اختياري: اللي يدخل مهامه تتحفظ في حسابه وتتزامن بين الموبايل واللاب توب، واللي ميدخلش مهامه تفضل على جهازه بس.

| | APK أندرويد | نسخة الويب (لاب توب، آيفون، أي موبايل) |
|---|---|---|
| الدخول بجوجل والمزامنة | ✅ | ✅ |
| التنبيه والتطبيق مقفول | ✅ | ❌ بيوصل والتطبيق مفتوح بس |
| مهام من جهاز تاني توصل والتطبيق مقفول | ✅ كل ربع ساعة تقريباً | ❌ |
| زرار «تم» و«أجّل 10 د» في الإشعار | ✅ | ❌ |
| التحديث | تنزّل الإصدار الجديد وتثبّته فوق القديم | لوحده |

## المكونات

- **GitHub**: فيه الكود، وبيبني التطبيق لوحده (Actions)، وبينشر نسخة الويب (Pages)، وبيحط ملف الـ APK في Releases.
- **Firebase** (من جوجل، مجاني): الدخول بحساب جوجل، وقاعدة البيانات اللي بتتزامن منها المهام.
- **أسرار GitHub** (Settings ← Secrets and variables ← Actions)، أربعة:

| الاسم | جاي منين |
|---|---|
| `KEYSTORE_B64` | ملف `1-KEYSTORE_B64.txt` في فولدر المفتاح |
| `KEYSTORE_PASSWORD` | ملف `2-KEYSTORE_PASSWORD.txt` في فولدر المفتاح |
| `FIREBASE_WEB_CONFIG` | كود الإعداد اللي Firebase بيعرضه لما تضيف تطبيق ويب |
| `GOOGLE_SERVICES_JSON` | محتوى ملف `google-services.json` اللي بتنزّله من Firebase لتطبيق الأندرويد |

## إعداد Firebase (مرة واحدة)

استخدم إيميلك الشخصي، مش إيميل الشغل.

1. **المشروع**: من `console.firebase.google.com` اعمل مشروع اسمه `miaad` (من غير Google Analytics).
2. **الدخول بجوجل**: Authentication ← Sign-in method ← Google ← Enable ← اختار إيميلك ← Save.
3. **الدومين**: Authentication ← Settings ← Authorized domains ← Add domain ← `technicalteam774.github.io`.
4. **قاعدة البيانات**: Firestore Database ← Create database ← المكان `europe-west1` ← production mode. بعدها في تبويب Rules الصق محتوى ملف `firestore.rules` اللي في المشروع ← Publish.
5. **تطبيق الويب**: Project settings ← Your apps ← أيقونة الويب ← اسم `miaad-web` ← Register. انسخ الكود اللي فيه `firebaseConfig` كله وحطه في سر `FIREBASE_WEB_CONFIG`.
6. **تطبيق الأندرويد**: Project settings ← Add app ← Android ← اسم الباكدج `app.miaad.tasks`، وفي خانة SHA-1 الصق بصمة المفتاح:
   ```
   CC:97:6A:32:A5:98:75:3F:65:BE:2D:70:0C:81:4D:52:25:85:AA:6F
   ```
   ← Register ← نزّل `google-services.json`، وحط محتواه كله في سر `GOOGLE_SERVICES_JSON`.

مهم: الخطوة 2 لازم تبقى قبل الخطوة 6، عشان الملف اللي بتنزّله يبقى فيه إعداد الدخول بجوجل.

## إعداد GitHub (مرة واحدة)

1. اعمل ريبو **Public** اسمه `miaad` على حسابك الشخصي.
2. ضيف الأسرار الأربعة اللي فوق.
3. Settings ← Pages ← Source = **GitHub Actions**.
4. ارفع ملفات المشروع (Add file ← Upload files).
5. لو فولدر `.github` مترفعش (الويندوز والماك ساعات بيخبّوه): Add file ← Create new file ← الاسم `.github/workflows/build.yml` ← الصق محتوى الملحق اللي في آخر الملف.
6. تبويب Actions: لما الجزئين يبقوا ✅، رابط الويب بيبان تحت الجزء الأول، وملف الـ APK في Releases.

## التثبيت والاستخدام

- **أندرويد**: نزّل `miaad-1.0.X.apk` من Releases وثبّته (اسمح بتثبيت التطبيقات من المتصفح لو طلب). بعد الفتح: ادخل بجوجل، واسمح بالإشعارات، ومن الإعدادات فعّل «المنبهات والتذكيرات». في شاومي وأوبو وريلمي وسامسونج خلي بطارية التطبيق «بدون قيود».
- **لاب توب**: افتح `https://technicalteam774.github.io/miaad/` وادخل بنفس حساب جوجل. من كروم تقدر تثبّته (القائمة ⋮ ← تثبيت التطبيق).
- **آيفون**: نفس الرابط من سفاري ← مشاركة ← إضافة إلى الشاشة الرئيسية.
- **أول دخول على جهاز عليه مهام**: المهام اللي على الجهاز بتتضاف لحسابك، ومفيش حاجة بتتمسح. الأمثلة مش بتترفع.
- **تسجيل الخروج**: بيمسح المهام من الجهاز ده بس. هي محفوظة في الحساب وبترجع لما تدخل تاني.

## التحديثات

- أي تعديل يترفع على الريبو بيبني إصدار جديد لوحده (1.0.1، 1.0.2، …) وبيبان في الإعدادات ← عن التطبيق.
- **الويب** بيتحدّث لوحده المرة الجاية اللي تفتحه فيها.
- **APK**: نزّل الإصدار الجديد وثبّته **فوق** القديم. متمسحش التطبيق الأول.

## التنبيهات

- قبل الميعاد (حسب اللي تختاره في المهمة)، وفي الميعاد، وبعده بربع ساعة لو لسه مخلصتش.
- ملخص الصبح وتذكير آخر اليوم، ومواعيدهم بتتغير من الإعدادات.
- على أندرويد، الموبايل بيشيّك على المهام الجديدة من أجهزتك التانية كل ربع ساعة تقريباً حتى لو التطبيق مقفول. لو خلّصت مهمة من اللاب توب، الموبايل ممكن يفكّرك بيها مرة لحد ما تفتح التطبيق عليه.

## مفتاح التوقيع

- فولدر `miaad-signing-key-PRIVATE` هو اللي بيثبت إن التحديثات جاية منك، وأندرويد مش بيقبل تحديث بمفتاح تاني.
- احفظه في مكان شخصي آمن، مش درايف الشغل، ومتحطوش في الريبو.
- لو ضاع والأسرار لسه في GitHub، البناء هيفضل شغال. لو الاتنين ضاعوا: مفتاح جديد، وتمسح التطبيق القديم بعد ما تتأكد إن مهامك متزامنة مع حسابك.

## مشاكل وحلولها

| اللي ظهر في Actions | الحل |
|---|---|
| `Secrets missing` | الرسالة بتقول أنهي سر ناقص. ضيفه، وبعدين آخر تشغيل ← Re-run jobs ← Re-run failed jobs. |
| `Signing key not readable` | الصق `KEYSTORE_B64` و `KEYSTORE_PASSWORD` تاني من الملفين. |
| `Google sign-in is not enabled yet` | فعّل Google في Authentication، ونزّل `google-services.json` تاني، وحدّث السر. |
| `Signing key fingerprint missing in Firebase` | ضيف بصمة SHA-1 اللي فوق للتطبيق الأندرويد في Firebase، ونزّل الملف تاني، وحدّث السر. |
| `Wrong Android app in google-services.json` | الملف لتطبيق تاني. لازم اسم الباكدج يبقى `app.miaad.tasks`. |
| `FIREBASE_WEB_CONFIG is set but …` | الصق كود `firebaseConfig` كامل زي ما Firebase بيعرضه. |
| خطأ في **Web app** فيه `Pages` | Settings ← Pages ← Source = GitHub Actions. |

| اللي ظهر في التطبيق | الحل |
|---|---|
| «الدخول مكملش» على اللاب توب | اتأكد إن `technicalteam774.github.io` موجود في Authorized domains في Firebase. |
| «الدخول مكملش» على الموبايل | اتأكد من بصمة SHA-1 في Firebase وإن السر `GOOGLE_SERVICES_JSON` متحدّث. |
| «المزامنة واقفة» | قواعد Firestore مش متنشورة صح: الصق `firestore.rules` تاني ودوس Publish. |
| التنبيه بيتأخر | الإشعارات + «المنبهات والتذكيرات» + البطارية «بدون قيود». |

## للمطوّرين

```bash
npm ci
npm test                                   # المنطق + المزامنة بين جهازين (Firebase وهمي) + الفحص في الخلفية
npm run build                              # www/ للويب + preview/miaad-preview.html
node test/build-fake.mjs                   # www-test/: التطبيق بـ Firebase وهمي لتجربة الدخول في المتصفح
python3 test/ui_flow.py                    # الواجهة على مقاس موبايل (سيرفر على www/ بورت 8765)
python3 test/ui_cloud.py                   # الدخول والمزامنة (سيرفر على www-test/ بورت 8767)
npx cap add android && node scripts/patch-android.mjs && npx cap sync android
```

`src/time.js` المواعيد والتنبيهات · `src/store.js` البيانات · `src/syncdiff.js` شكل البيانات في الحساب · `src/cloud.js` الدخول والمزامنة · `src/runner.js` الفحص في الخلفية · `src/ui.js` الشاشات · `src/notify.js` الإشعارات · `src/main.js` التوصيل.

بيانات كل حساب في Firestore: `users/{uid}` فيه المهام والإعدادات، و `users/{uid}/months/{YYYY-MM}` فيه اللي اتعمل والتأجيلات ودقايق التركيز. كل مهمة وكل علامة «تم» حقل لوحدها، فجهازين بيعدّلوا حاجات مختلفة في نفس الوقت مش بيمسحوا شغل بعض.

## ملحق: محتوى `.github/workflows/build.yml`

```yaml
# Miaad (ميعاد): runs on every change to the main branch, or from Actions → "Build Miaad" → Run workflow.
#   web     → builds the web app and publishes it on GitHub Pages (open it on iPhone or Android and add it to the home screen)
#   android → builds a signed Android APK and attaches it to a new Release (repo home page → Releases → Assets)
# Needs once: Settings → Pages → Source = GitHub Actions, and four Actions secrets:
#   KEYSTORE_B64, KEYSTORE_PASSWORD (signing key), FIREBASE_WEB_CONFIG, GOOGLE_SERVICES_JSON (Google sign-in and sync).
name: Build Miaad

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: build-${{ github.ref }}
  cancel-in-progress: false

jobs:
  web:
    name: Web app (GitHub Pages)
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    permissions:
      contents: read
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - name: Build
        env:
          FIREBASE_WEB_CONFIG: ${{ secrets.FIREBASE_WEB_CONFIG }}
        run: |
          if [ -z "$FIREBASE_WEB_CONFIG" ]; then
            echo "::warning title=No Firebase config::FIREBASE_WEB_CONFIG is not set, so this web build has no Google sign-in (tasks stay on each device)."
          fi
          npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v4
        with:
          path: www
      - id: deploy
        uses: actions/deploy-pages@v4

  android:
    name: Android APK (Releases)
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    permissions:
      contents: write
    steps:
      - name: Check the secrets
        env:
          KEYSTORE_B64: ${{ secrets.KEYSTORE_B64 }}
          KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
          FIREBASE_WEB_CONFIG: ${{ secrets.FIREBASE_WEB_CONFIG }}
          GOOGLE_SERVICES_JSON: ${{ secrets.GOOGLE_SERVICES_JSON }}
        run: |
          missing=""
          [ -z "$KEYSTORE_B64" ] && missing="$missing KEYSTORE_B64"
          [ -z "$KEYSTORE_PASSWORD" ] && missing="$missing KEYSTORE_PASSWORD"
          [ -z "$FIREBASE_WEB_CONFIG" ] && missing="$missing FIREBASE_WEB_CONFIG"
          [ -z "$GOOGLE_SERVICES_JSON" ] && missing="$missing GOOGLE_SERVICES_JSON"
          if [ -n "$missing" ]; then
            echo "::error title=Secrets missing::Add these in Settings → Secrets and variables → Actions:$missing. Then run this workflow again."
            exit 1
          fi

      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm
      - uses: actions/setup-java@v5
        with:
          distribution: temurin
          java-version: 21

      - run: npm ci
      - run: npm test
      - name: Build the web part
        env:
          FIREBASE_WEB_CONFIG: ${{ secrets.FIREBASE_WEB_CONFIG }}
        run: npm run build

      - name: Create the Android project
        run: |
          npx cap add android
          node scripts/patch-android.mjs
          npx cap sync android

      - name: Unpack the signing key
        env:
          KEYSTORE_B64: ${{ secrets.KEYSTORE_B64 }}
          KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
        run: |
          PASS=$(printf '%s' "$KEYSTORE_PASSWORD" | tr -d '[:space:]')
          echo "::add-mask::$PASS"
          printf '%s' "$KEYSTORE_B64" | tr -d '[:space:]' | base64 -d > "$RUNNER_TEMP/miaad.p12"
          if ! keytool -list -storetype PKCS12 -keystore "$RUNNER_TEMP/miaad.p12" -storepass "$PASS" -alias miaad > /dev/null 2>&1; then
            echo "::error title=Signing key not readable::KEYSTORE_B64 or KEYSTORE_PASSWORD does not match the key file. Paste both values again exactly as they appear in the two text files."
            exit 1
          fi
          echo "MIAAD_KEYSTORE=$RUNNER_TEMP/miaad.p12" >> "$GITHUB_ENV"
          echo "MIAAD_STORE_PASSWORD=$PASS" >> "$GITHUB_ENV"

      - name: Add the Firebase file
        env:
          GOOGLE_SERVICES_JSON: ${{ secrets.GOOGLE_SERVICES_JSON }}
        run: |
          printf '%s' "$GOOGLE_SERVICES_JSON" > android/app/google-services.json
          SHA1=$(keytool -list -v -storetype PKCS12 -keystore "$MIAAD_KEYSTORE" -storepass "$MIAAD_STORE_PASSWORD" -alias miaad | grep -m1 'SHA1:' | awk '{print $2}')
          node scripts/check-google-services.mjs android/app/google-services.json "$SHA1"

      - name: Build the signed APK
        working-directory: android
        run: |
          chmod +x gradlew
          ./gradlew assembleRelease --no-daemon --stacktrace
          cp app/build/outputs/apk/release/app-release.apk "$GITHUB_WORKSPACE/miaad-1.0.${{ github.run_number }}.apk"

      - name: Publish the Release
        uses: softprops/action-gh-release@v3
        with:
          tag_name: v1.0.${{ github.run_number }}
          name: ميعاد 1.0.${{ github.run_number }}
          make_latest: true
          fail_on_unmatched_files: true
          files: miaad-1.0.${{ github.run_number }}.apk
          body: |
            **التثبيت على أندرويد:** نزّل الملف `miaad-1.0.${{ github.run_number }}.apk` من **Assets** تحت، وافتحه من الموبايل.
            - أول مرة: الموبايل هيطلب إذن «تثبيت تطبيقات غير معروفة» للمتصفح أو مدير الملفات، اسمح بيه للتثبيت ده.
            - تحديث: ثبّت الملف الجديد فوق القديم من غير ما تمسح التطبيق، ومهامك بتفضل زي ما هي.
            - بعد التثبيت: ادخل بحساب جوجل عشان مهامك تتزامن، واسمح بالإشعارات، ومن إعدادات التطبيق فعّل «المنبهات والتذكيرات».
```
