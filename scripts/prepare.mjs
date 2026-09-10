/**
 * Installs the git hooks, and does nothing wherever husky is not installed.
 *
 * `prepare` runs on every `npm install`, including on build machines. Vercel builds with
 * NODE_ENV=production, so npm omits devDependencies — husky is absent, but the script still
 * runs. Invoking the binary directly there exits 127 and takes the whole install with it, which
 * is exactly how the testnet deploy broke:
 *
 *     > husky
 *     sh: line 1: husky: command not found
 *     npm error code 127
 *     Error: Command "npm install" exited with 127
 *
 * `husky || true` also fixes that, but it swallows a genuine failure on a developer's machine
 * too. Importing the module separates the two cases: absent is fine and silent, present but
 * failing is a real problem and still fails the install.
 *
 * Note husky's own `bin.js` is deliberately not used — it is not listed in the package's
 * `exports`, so resolving it throws ERR_PACKAGE_PATH_NOT_EXPORTED and would be indistinguishable
 * here from husky being uninstalled. The default export is the supported entry point.
 */
let install;
try {
  ({ default: install } = await import("husky"));
} catch {
  // Not installed — a production install, or someone consuming this repo as a dependency.
  process.exit(0);
}

// husky returns a non-empty string to explain why it did nothing (e.g. run outside a git repo).
const message = install();
if (message) console.log(`husky: ${message}`);
