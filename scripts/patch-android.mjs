// After `npx cap add android`: brand the generated project (icons, splash, name, colors) and add release signing
// that reads the key from environment variables (GitHub Actions secrets). Safe to run more than once.
import fs from 'node:fs';
import path from 'node:path';

const APP = 'android/app';
const RES = `${APP}/src/main/res`;
if (!fs.existsSync(APP)) {
  console.error('android/ not found: run `npx cap add android` first');
  process.exit(1);
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f);
    const d = path.join(dst, f);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function edit(file, fn) {
  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before);
  if (after !== before) fs.writeFileSync(file, after);
  return after !== before;
}

// 1) splash: the template ships splash.png in many density folders; our splash is a layer-list XML
for (const dir of fs.readdirSync(RES)) {
  const f = path.join(RES, dir, 'splash.png');
  if (dir.startsWith('drawable') && fs.existsSync(f)) fs.unlinkSync(f);
}
// 2) icons, splash, colors
copyDir('android-res', RES);
for (const dir of fs.readdirSync(RES)) {
  const f = path.join(RES, dir, 'ic_launcher_foreground.png');
  if (dir.startsWith('mipmap') && fs.existsSync(f)) fs.unlinkSync(f);
}
const oldFg = path.join(RES, 'drawable-v24', 'ic_launcher_foreground.xml');
if (fs.existsSync(oldFg)) fs.unlinkSync(oldFg);
const oldBg = path.join(RES, 'drawable', 'ic_launcher_background.xml');
if (fs.existsSync(oldBg)) fs.unlinkSync(oldBg);

// 3) launch theme: Android 12+ system splash uses our colors and icon
edit(path.join(RES, 'values', 'styles.xml'), (s) => {
  if (s.includes('windowSplashScreenBackground')) return s;
  return s.replace(
    '<item name="android:background">@drawable/splash</item>',
    '<item name="android:background">@drawable/splash</item>\n'
    + '        <item name="windowSplashScreenBackground">@color/miaad_splash_bg</item>\n'
    + '        <item name="windowSplashScreenAnimatedIcon">@drawable/ic_launcher_foreground_miaad</item>\n'
    + '        <item name="windowSplashScreenIconBackgroundColor">@color/ic_launcher_background</item>',
  );
});

// 4) app name
edit(path.join(RES, 'values', 'strings.xml'), (s) => s
  .replace(/<string name="app_name">[^<]*<\/string>/, '<string name="app_name">ميعاد</string>')
  .replace(/<string name="title_activity_main">[^<]*<\/string>/, '<string name="title_activity_main">ميعاد</string>'));

// 5) keyboard: resize the web view so the open field stays visible
edit(path.join(APP, 'src/main/AndroidManifest.xml'), (s) => (s.includes('windowSoftInputMode')
  ? s
  : s.replace('android:launchMode="singleTask"', 'android:launchMode="singleTask"\n            android:windowSoftInputMode="adjustResize"')));

// 6) version + release signing from environment variables
edit(path.join(APP, 'build.gradle'), (s) => {
  if (s.includes('MIAAD_KEYSTORE')) return s;
  s = s.replace(/versionCode \d+/, 'versionCode((System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInteger())')
    .replace(/versionName "[^"]*"/, 'versionName "1.0.${System.getenv("GITHUB_RUN_NUMBER") ?: "0"}"');
  return s.replace(
    /buildTypes \{\s*release \{/,
    `lint {
        checkReleaseBuilds = false
    }
    signingConfigs {
        release {
            if (System.getenv("MIAAD_KEYSTORE")) {
                storeFile file(System.getenv("MIAAD_KEYSTORE"))
                storePassword System.getenv("MIAAD_STORE_PASSWORD")
                keyAlias System.getenv("MIAAD_KEY_ALIAS") ?: "miaad"
                keyPassword System.getenv("MIAAD_STORE_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release`,
  );
});

console.log('android project patched');
