// CI check of google-services.json before the Android build, so a wrong file fails with a clear message
// instead of an app whose Google sign-in silently does not work.
// Usage: node scripts/check-google-services.mjs <google-services.json> [SHA-1 of the signing key]
import fs from 'node:fs';

const PACKAGE = 'app.miaad.tasks';
const [file, sha1Arg] = process.argv.slice(2);

function fail(title, msg) {
  console.log(`::error title=${title}::${msg}`);
  process.exit(1);
}

let json;
try {
  json = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) {
  fail('google-services.json is not valid', 'The GOOGLE_SERVICES_JSON secret must be the whole content of google-services.json, from the first { to the last }.');
}

const clients = Array.isArray(json.client) ? json.client : [];
const app = clients.find((c) => c.client_info && c.client_info.android_client_info && c.client_info.android_client_info.package_name === PACKAGE);
if (!app) {
  const found = clients.map((c) => c.client_info && c.client_info.android_client_info && c.client_info.android_client_info.package_name).filter(Boolean);
  fail('Wrong Android app in google-services.json', `It has ${found.join(', ') || 'no Android app'}; add an Android app with the package name ${PACKAGE} in Firebase and download its google-services.json.`);
}

const oauth = [...(app.oauth_client || []), ...(((app.services || {}).appinvite_service || {}).other_platform_oauth_client || [])];
if (!oauth.some((o) => o.client_type === 3)) {
  fail('Google sign-in is not enabled yet', 'In Firebase: Authentication > Sign-in method > Google > Enable. Then download google-services.json again and update the GOOGLE_SERVICES_JSON secret.');
}

const hashes = (app.oauth_client || []).filter((o) => o.client_type === 1 && o.android_info).map((o) => String(o.android_info.certificate_hash || '').toLowerCase());
if (sha1Arg) {
  const sha1 = sha1Arg.replace(/:/g, '').toLowerCase();
  if (!hashes.includes(sha1)) {
    fail('Signing key fingerprint missing in Firebase', `Add this SHA-1 to the Android app in Firebase (Project settings > Your apps > Add fingerprint): ${sha1Arg.toUpperCase()}. Then download google-services.json again and update the secret.`);
  }
}

console.log(`google-services.json OK: project ${json.project_info && json.project_info.project_id}, package ${PACKAGE}${sha1Arg ? ', signing key registered' : ''}`);
