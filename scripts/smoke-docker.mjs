import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";

const image = process.argv[2] ?? "next-effect-bdd:production";
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", timeout: 60_000 }).trim();
const container = docker("run", "--detach", "--publish", "127.0.0.1::3000", image);
const inspect = () => JSON.parse(docker("inspect", container))[0];

try {
  const port = inspect().NetworkSettings.Ports["3000/tcp"][0].HostPort;
  const base = `http://127.0.0.1:${port}`;
  const request = (url) => fetch(url, { signal: AbortSignal.timeout(5000) });
  let ready = false;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    assert.equal(inspect().State.Running, true, "container exited during startup");
    const signal = AbortSignal.timeout(Math.max(1, Math.min(5000, deadline - Date.now())));
    if (await fetch(`${base}/health`, { signal }).then((r) => r.ok, () => false)) {
      ready = true;
      break;
    }
    await setTimeout(500);
  }
  assert.ok(ready, "server did not become ready within 30 seconds");
  const health = await request(`${base}/health`);
  assert.deepEqual(await health.json(), { status: "ok", greeting: "Hello!" });
  const page = await request(base);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Hello!/);
  const assets = new Set([...html.matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/g)].map((match) => match[1]));
  assert.ok(assets.size > 0, "page must reference static assets");
  for (const asset of assets) {
    assert.equal((await request(new URL(asset, base))).status, 200, asset);
  }
  assert.equal((await request(`${base}/docker-smoke-not-found`)).status, 404);
  docker("exec", container, "node", "--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { accessSync, constants, existsSync } from "node:fs";
    assert.equal(process.getuid(), 1000);
    for (const manager of ["npm", "npx", "pnpm", "yarn"]) {
      assert.equal(existsSync("/usr/local/bin/" + manager), false, manager);
    }
    accessSync(".next/cache", constants.W_OK);
    for (const dependency of ["typescript", "effect-bdd", "@vercel/nft", "@effect/tsgo"]) {
      assert.equal(existsSync("node_modules/" + dependency), false, dependency);
    }
  `);
  for (let attempt = 0; attempt < 70 && inspect().State.Health.Status !== "healthy"; attempt++) {
    await setTimeout(500);
  }
  assert.equal(inspect().State.Health.Status, "healthy", "Docker healthcheck must pass");
  docker("stop", "--timeout", "30", container);
  // Effect's default teardown reports interruption-only exits as 130.
  assert.equal(inspect().State.ExitCode, 130, "SIGTERM must interrupt Effect without SIGKILL");
  console.log(`PASS: English health and page, ${assets.size} static assets, 404, non-root user, runtime-only dependencies, Docker healthcheck, graceful SIGTERM`);
} catch (error) {
  console.error(docker("logs", container));
  throw error;
} finally {
  docker("rm", "--force", container);
}
