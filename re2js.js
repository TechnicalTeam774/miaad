// Firestore only uses re2js to evaluate regex/LIKE in local pipeline queries, which this app never runs.
// The stub keeps ~150 KB out of the bundle; Firestore catches the error if it is ever reached.
export const RE2JS = {
  compile() {
    throw new Error('regular expressions are not available in this build');
  },
};
