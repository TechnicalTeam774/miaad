/**
 * Firebase web config from the FIREBASE_WEB_CONFIG secret (or firebase.local.txt for local tests).
 * Accepts the snippet exactly as the Firebase console shows it (`const firebaseConfig = { apiKey: "…", … }`)
 * or JSON. These values are public by design (they ship inside every web app); access is enforced by the
 * Firestore security rules.
 */
export function parseFirebaseConfig(text) {
  if (!text) return null;
  const out = {};
  const re = /["']?(apiKey|authDomain|projectId|storageBucket|messagingSenderId|appId|measurementId)["']?\s*:\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(text))) out[m[1]] = m[2].trim();
  return out.apiKey && out.projectId && out.appId && out.authDomain ? out : null;
}
