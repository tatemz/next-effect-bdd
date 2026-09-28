#!/usr/bin/env bash
# Runs the @dev examples of the BDD suite, one process per example.
#
# Two Next 16 realities shape this script, both verified against the
# installed next@16.3.6:
#
# 1. Turbopack's compile (worker-creator) registry is process-global, and
#    next.close() does not unregister it. Only the first `Next({dev:true})`
#    boot in a Node process can compile pages; later dev boots in the same
#    process serve 404s. Hence one process per dev example.
# 2. A fully-booted dev Next leaks non-unref'd Turbopack handles: even after
#    every scope has closed and `next.close()` resolved, Node never exits on
#    its own. effect-bdd's CLI (Effect runMain) therefore prints its summary
#    and lingers. This script watches the log for the summary line, reports
#    the run's result, and reaps the lingering runner process.
#
# Dev artifacts go to $NEXT_BDD_DEV_DIST_DIR (.next-dev), never .next, so a
# dev boot can never overwrite the production build the @prod lane asserts
# against. Focused runs omit --strict by design: loading the shared step
# module while selecting one example leaves the other chains unused, which
# the effect-bdd docs call expected and non-fatal.
set -euo pipefail
cd "$(dirname "$0")/.."

export NEXT_BDD_DEV_DIST_DIR="${NEXT_BDD_DEV_DIST_DIR:-.next-dev}"
export NODE_OPTIONS="--import tsx"

# Wall-clock budget per example: a cold turbopack boot plus assertions.
PER_EXAMPLE_TIMEOUT="${PER_EXAMPLE_TIMEOUT:-180}"

dev_tags=(
  dev-home-en
  dev-home-es
  dev-health-en
  dev-health-es
  dev-docs
  dev-reveal
)

failed=0

# Next's dev-mode typegen rewrites these tracked files to point at the
# active distDir (here: the scratch dir). The BDD lane must not dirty the
# working tree or repoint the project's types at test artifacts, so snapshot
# them and restore on the way out - whatever their state was when the lane
# started, that is the state it leaves.
snapshot_dir="$(mktemp -d)"
for f in next-env.d.ts tsconfig.json; do
  [[ -f "$f" ]] && cp "$f" "$snapshot_dir/$f"
done
restore_typegen_edits() {
  for f in next-env.d.ts tsconfig.json; do
    if [[ -f "$snapshot_dir/$f" ]]; then
      cmp -s "$snapshot_dir/$f" "$f" || cp "$snapshot_dir/$f" "$f"
    fi
  done
  rm -rf "$snapshot_dir"
}
trap restore_typegen_edits EXIT

run_example() {
  local tag="$1"
  local log
  log="$(mktemp)"
  echo "== dev example: @${tag} =="

  # exec keeps $! as the effect-bdd process itself; resolve the CLI from
  # node_modules/.bin so the script works with or without pnpm's PATH.
  (
    exec ./node_modules/.bin/effect-bdd \
      --features "features/**/*.feature" \
      --steps "features/**/*.steps.ts" \
      --tags "@${tag}" \
      --reporter text \
      --verbose
  ) >"$log" 2>&1 &
  local pid=$!

  # The run is *done* when the summary line appears (the process may then
  # linger on Next's leaked handles); fall back to process exit or timeout.
  local deadline=$((SECONDS + PER_EXAMPLE_TIMEOUT))
  while ! grep -q '^Features: ' "$log"; do
    kill -0 "$pid" 2>/dev/null || break
    ((SECONDS < deadline)) || break
    sleep 0.5
  done
  # Give the reporter a moment to flush whatever follows the summary.
  sleep 1

  # Reap the runner (TERM, then KILL if it ignores it).
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
    for _ in 1 2 3; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
    kill -KILL "$pid" 2>/dev/null || true
  fi
  wait "$pid" 2>/dev/null || true

  cat "$log"
  if grep -q '^Features: .*failed: 0' "$log"; then
    rm -f "$log"
    return 0
  else
    rm -f "$log"
    return 1
  fi
}

for tag in "${dev_tags[@]}"; do
  if ! run_example "$tag"; then
    failed=1
  fi
done

if ((failed)); then
  echo "== dev lane: FAILED =="
  exit 1
fi
echo "== dev lane: all examples passed =="
