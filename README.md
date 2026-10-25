# ميعاد — مهامك بمواعيدها

تطبيق لمهام اليوم. كل مهمة ليها ميعاد وعدّ تنازلي لحد وقتها، ولو الميعاد عدّى بيبان «متأخرة بقالها كذا».
فيه تنبيه قبل الميعاد، وتكرار (كل يوم، كل أسبوع، أو أيام تختارها)، وتايمر تركيز، وسجل بنسبة الإنجاز.
بياناتك متخزنة على الموبايل بس: مفيش حساب ولا سيرفر.

| | APK أندرويد | نسخة الويب (آيفون وأي موبايل) |
|---|---|---|
| التنبيه والتطبيق مقفول | ✅ | ❌ بيوصل والتطبيق مفتوح بس |
| زرار «تم» و«أجّل 10 د» في الإشعار | ✅ | ❌ |
| التثبيت | ملف من Releases | من المتصفح: إضافة للشاشة الرئيسية |
| التحديث | تنزّل الإصدار الجديد وتثبّته فوق القديم | لوحده |

## اللي محتاجه

1. حساب GitHub **شخصي** (مجاني)، مش حساب الشغل.
2. `miaad-repo.zip`: فكّه، هيطلعلك فولدر اسمه `miaad`.
3. `miaad-signing-key-PRIVATE.zip`: فكّه وخليه عندك بس، فيه مفتاح توقيع التطبيق.

## الإعداد (مرة واحدة · حوالي 15 دقيقة من الكمبيوتر)

### 1. اعمل الريبو

1. ادخل github.com ← زرار **+** فوق ← **New repository**.
2. **Repository name**: `miaad`
3. اختار **Public**.
   ليه؟ GitHub Pages مجاني للريبو العام بس. اللي بيبقى ظاهر هو كود التطبيق بس: مهامك عمرها ما بتترفع، والمفتاح بيتحط في Secrets ومحدش يقدر يشوفه.
4. فعّل **Add README** ← **Create repository**.

### 2. حط مفتاح التوقيع في Secrets

1. في الريبو: **Settings** ← **Secrets and variables** ← **Actions** ← **New repository secret**.
2. **Name**: `KEYSTORE_B64` ← **Secret**: افتح `1-KEYSTORE_B64.txt` واعمل Ctrl+A ثم Ctrl+C والصق ← **Add secret**.
3. **New repository secret** تاني ← **Name**: `KEYSTORE_PASSWORD` ← **Secret**: محتوى `2-KEYSTORE_PASSWORD.txt` ← **Add secret**.

### 3. شغّل GitHub Pages

**Settings** ← **Pages** ← تحت **Build and deployment** خلي **Source** = **GitHub Actions**.

### 4. ارفع ملفات المشروع

1. ارجع لصفحة الريبو (تبويب **Code**) ← **Add file** ← **Upload files**.
2. افتح فولدر `miaad`، حدد كل اللي جواه (Ctrl+A)، واسحبه على صفحة الرفع. الفولدرات بتترفع زي ما هي.
3. **Commit changes**، واستنى لحد ما الرفع يخلص.

### 5. اتأكد من ملف البناء

في صفحة الريبو، شوف فيه فولدر اسمه `.github` ولا لأ:

- **موجود**: البناء بدأ لوحده، روح للخطوة 6.
- **مش موجود** (بيحصل على الماك، لأن الفولدرات اللي بتبدأ بنقطة بتبقى مخفية): **Add file** ← **Create new file** ← في خانة الاسم اكتب `.github/workflows/build.yml` ← الصق محتوى الملحق اللي في آخر الدليل ← **Commit changes**.

### 6. استنى البناء (5 لـ 10 دقايق)

تبويب **Actions** ← **Build Miaad**. فيه جزئين:

- **Web app (GitHub Pages)**: لما يبقى ✅ رابط التطبيق بيظهر تحته، وكمان في **Settings ← Pages**. شكله: `https://USERNAME.github.io/miaad/` (USERNAME هو اسم حسابك على GitHub).
- **Android APK (Releases)**: لما يبقى ✅ ملف الـ APK بيظهر في **Releases** على يمين صفحة الريبو.

لو ظهر ❌ شوف «مشاكل وحلولها» تحت.

## التثبيت على الموبايل

### أندرويد (الأفضل)

1. من الموبايل افتح صفحة الريبو ← **Releases** ← آخر إصدار ← تحت **Assets** دوس على `miaad-1.0.X.apk`.
2. افتح الملف بعد ما يتحمّل. لو طلب إذن **Install unknown apps** للمتصفح أو مدير الملفات، اسمح بيه.
3. لو Google Play Protect طلّع تحذير: **More details** ← **Install anyway** (أو **Scan app** وبعدها التثبيت). ده بيحصل مع أي تطبيق مش من جوجل بلاي.
4. أول ما تفتحه اسمح بالإشعارات. وفي تبويب **الإعدادات** جوه التطبيق، لو ظهرلك «فعّل المنبهات والتذكيرات» دوس **فعّلها** وشغّلها.
5. شاومي وأوبو وريلمي وهواوي وسامسونج بيقفلوا التطبيقات في الخلفية. من إعدادات الموبايل ← التطبيقات ← ميعاد ← البطارية ← **بدون قيود** (وفي شاومي كمان فعّل **التشغيل التلقائي**). ده اللي بيضمن إن التنبيه ييجي في ميعاده.
6. جرّب: **الإعدادات** ← **جرّب تنبيه**.

### آيفون

1. افتح الرابط من **سفاري** (لازم سفاري): `https://USERNAME.github.io/miaad/`
2. زرار المشاركة ← **إضافة إلى الشاشة الرئيسية** ← **إضافة**.
3. افتحه من الأيقونة اللي على الشاشة الرئيسية، مش من سفاري، عشان يشتغل كتطبيق.

على الآيفون التنبيه بيوصل والتطبيق مفتوح بس. العدّ التنازلي والسجل والتايمر شغالين عادي.

### أندرويد من غير APK

كروم ← نفس الرابط ← القائمة ⋮ ← **تثبيت التطبيق**.

## التحديثات

- أي تعديل يترفع على الريبو بيعمل بناء جديد لوحده. رقم الإصدار بيزيد (1.0.1، 1.0.2، …) وبيبان في **الإعدادات ← عن التطبيق**.
- **الويب**: بيتحدّث لوحده المرة الجاية اللي تفتح فيها التطبيق.
- **APK**: نزّل الإصدار الجديد من Releases وثبّته **فوق** القديم. متمسحش التطبيق الأول، لأن المسح بيمسح مهامك.

## النسخة الاحتياطية

بياناتك على الموبايل بس. من **الإعدادات ← نسخة احتياطية**:

- **APK**: دوس **انسخ النسخة** والصقها في رسالة لنفسك (واتساب أو إيميل). للاسترجاع: **الصق نسخة**.
- **الويب**: **نزّل ملف** أو **انسخ النسخة**. للاسترجاع: **استرجع من ملف** أو **الصق نسخة**.
- خد نسخة كل أسبوع، وقبل ما تغيّر الموبايل أو تمسح التطبيق.
- نسخة الويب ونسخة الـ APK كل واحدة ليها بياناتها. اشتغل على واحدة بس، ولو عايز تنقل: انسخ من واحدة والصق في التانية.

## مفتاح التوقيع (`miaad-signing-key-PRIVATE.zip`)

- ده اللي بيثبت إن التحديثات جاية منك. أندرويد مش بيقبل تحديث موقّع بمفتاح تاني.
- احفظه في مكان شخصي آمن (Google Drive الشخصي أو مدير باسوردات). **مش** درايف الشغل، **ومتحطوش** في الريبو، ومتبعتوش لحد.
- لو الملف ضاع والـ Secrets لسه في الريبو: البناء هيفضل شغال عادي.
- لو الاتنين ضاعوا: نعمل مفتاح جديد، وساعتها لازم تمسح التطبيق القديم (بعد نسخة احتياطية) وتثبّت الجديد.

## مشاكل وحلولها

| اللي ظهر | الحل |
|---|---|
| ❌ `Signing secrets missing` | الخطوة 2 ناقصة. ضيف الـ Secrets الاتنين، وبعدين **Actions** ← آخر تشغيل ← **Re-run jobs** ← **Re-run failed jobs**. |
| ❌ `Signing key not readable` | قيمة من الاتنين متنسختش صح. افتح الـ Secret ودوس ✏️ والصقها تاني من الملف، وبعدين **Re-run failed jobs**. |
| ❌ في **Web app** والرسالة فيها `Pages` | الخطوة 3 ناقصة: **Source** = **GitHub Actions**، وبعدين **Re-run failed jobs**. |
| مفيش **Releases** | استنى لحد ما **Android APK** يبقى ✅. |
| «لم يتم تثبيت التطبيق» | فيه نسخة متثبتة قبل كده بمفتاح تاني. خد نسخة احتياطية، امسحها، وثبّت الجديدة. |
| التنبيه بيتأخر أو مش بيوصل | الإشعارات + **المنبهات والتذكيرات** + البطارية **بدون قيود** (خطوة 4 و 5 في تثبيت أندرويد). |
| الويب لسه بالشكل القديم | اقفل التطبيق خالص وافتحه تاني. |

## جوجل بلاي (بعدين لو حبيت)

- ينفع. حساب مطوّر شخصي برسوم مرة واحدة (25 دولار)، والحسابات الشخصية الجديدة لازم تعمل اختبار مغلق مع 12 مختبِر على الأقل لمدة 14 يوم متواصلين قبل ما التطبيق ينزل للكل.
- جوجل بتطبّق «التحقق من المطوّر» حتى على التطبيقات اللي بتتثبت من بره جوجل بلاي: بدأ 30 سبتمبر 2026 في البرازيل وإندونيسيا وسنغافورة وتايلاند، وعالميًا في 2027. للاستخدام الشخصي فيه مسار **Limited distribution** من غير تحقق هوية لحد 20 جهاز. في مصر التثبيت شغال عادي دلوقتي.

## للمطوّرين

```bash
npm ci
npm test                 # منطق المواعيد والتكرار والإحصائيات
npm run build            # www/ للويب + preview/miaad-preview.html صفحة واحدة
python3 test/ui_flow.py  # تجربة الواجهة على مقاس موبايل (Playwright + سيرفر على www/)
npx cap add android && node scripts/patch-android.mjs && npx cap sync android   # مشروع أندرويد لـ Android Studio
```

`src/time.js` المنطق · `src/store.js` البيانات · `src/ui.js` الشاشات · `src/notify.js` التنبيهات · `src/main.js` التوصيل · `.github/workflows/build.yml` البناء.

## ملحق: محتوى `.github/workflows/build.yml`

```yaml
# Miaad (ميعاد): runs on every change to the main branch, or from Actions → "Build Miaad" → Run workflow.
#   web     → builds the web app and publishes it on GitHub Pages (open it on iPhone or Android and add it to the home screen)
#   android → builds a signed Android APK and attaches it to a new Release (repo home page → Releases → Assets)
# Needs once: Settings → Pages → Source = GitHub Actions, and two Actions secrets: KEYSTORE_B64 and KEYSTORE_PASSWORD.
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
      - run: npm run build
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
      - name: Check the signing secrets
        env:
          KEYSTORE_B64: ${{ secrets.KEYSTORE_B64 }}
          KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
        run: |
          if [ -z "$KEYSTORE_B64" ] || [ -z "$KEYSTORE_PASSWORD" ]; then
            echo "::error title=Signing secrets missing::Add KEYSTORE_B64 and KEYSTORE_PASSWORD in Settings → Secrets and variables → Actions, then run this workflow again."
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
      - run: npm run build

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
            echo "::error title=Signing key not readable::KEYSTORE_B64 or KEYSTORE_PASSWORD does not match the key file. Paste both values again exactly as they appear in miaad-secrets.txt."
            exit 1
          fi
          echo "MIAAD_KEYSTORE=$RUNNER_TEMP/miaad.p12" >> "$GITHUB_ENV"
          echo "MIAAD_STORE_PASSWORD=$PASS" >> "$GITHUB_ENV"

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
            - بعد التثبيت: اسمح بالإشعارات، ومن إعدادات التطبيق فعّل «المنبّهات والتذكيرات» عشان التنبيه ييجي في ميعاده بالظبط.
```
