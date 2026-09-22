/**
 * Commit message rules, enforced locally by the commit-msg hook and again in CI (a hook is
 * bypassable with --no-verify and does not run on GitHub's web editor).
 *
 * These codify what this repo already does — 80 of the first 81 commits were already
 * Conventional Commits — so the values below are chosen against real history rather than taken
 * from the defaults. Where a rule would have rejected a commit that was fine, it is relaxed and
 * the reason is written down.
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Every type in use across the history, plus build/revert for completeness.
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "refactor", "style", "chore", "docs", "test", "perf", "ci", "build", "revert"],
    ],

    // Scope is optional: 17 of the first 81 commits had none, and requiring one would mostly
    // produce filler.
    //
    // lower-case, not kebab-case: commitlint's kebab-case rejects a digit after the hyphen, so
    // it fails `backend-v3` — one of this repo's most-used scopes. Checked against all 18 scopes
    // that appear in the history; every one passes this rule.
    "scope-case": [2, "always", "lower-case"],

    "subject-case": [2, "never", ["sentence-case", "start-case", "pascal-case", "upper-case"]],
    "subject-full-stop": [2, "never", "."],

    // Deliberate, not inherited. 36 of the first 81 subjects ran past 72 characters and the
    // longest reached 147 — subjects that long stop being scannable in `git log --oneline`, so
    // the limit stays at the conventional 100 and the detail belongs in the body.
    "header-max-length": [2, "always", 100],

    // A warning, not an error. This is the single most common reason people start reaching for
    // --no-verify: it fires on pasted stack traces, tables and URLs in an otherwise good message.
    "body-max-line-length": [1, "always", 100],
  },
};
