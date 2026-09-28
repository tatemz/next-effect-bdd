import type { NextConfig } from "next";

// `PHASE_DEVELOPMENT_SERVER` from `next/constants`; spelled as its literal
// value because the `next` package's exports map does not expose that
// subpath to the type-resolvable module graph.
const PHASE_DEVELOPMENT_SERVER = "phase-development-server";

/**
 * Next config with one job: keep dev-mode artifacts out of the production
 * build when both modes run in one process (the BDD suite boots the same app
 * as `appFor("production")` and `appFor("development")`).
 *
 * A dev server sharing `.next` with a production build serves the prod
 * build's prerendered HTML, whose chunk URLs 404 through the dev server, so
 * the page never hydrates; and two dev servers fight over `<distDir>/dev/lock`
 * at all. Setting `NEXT_BDD_DEV_DIST_DIR` points only the
 * development-server phase at a scratch directory, leaving the production
 * phase (and ordinary `pnpm dev`/`pnpm start`) on `.next`.
 *
 * @example
 * // The BDD runner sets it; everything else is unaffected:
 * //   NEXT_BDD_DEV_DIST_DIR=.next-dev pnpm test-bdd
 */
export default (phase: string): NextConfig => ({
  distDir:
    phase === PHASE_DEVELOPMENT_SERVER && process.env.NEXT_BDD_DEV_DIST_DIR
      ? process.env.NEXT_BDD_DEV_DIST_DIR
      : ".next",
});
