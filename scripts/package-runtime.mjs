import { nodeFileTrace } from "@vercel/nft";
import { copyFile, cp, glob, lstat, mkdir, readFile, realpath, rm, symlink } from "node:fs/promises";
import { createRequire, stripTypeScriptTypes } from "node:module";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, ".output");

const relative = (file) => path.relative(root, file);
const require = createRequire(import.meta.url);
const nextRoot = path.dirname(require.resolve("next/package.json"));
// All three entry variants ship in the runtime image; Docker's CMD runs the
// default combined one, but `node main.next.ts` / `main.api.ts` also work.
const entries = ["main.ts", "main.next.ts", "main.api.ts"];
// Next's custom-server config loader resolves these webpack aliases dynamically,
// even in production. NFT cannot infer the alias table's require.resolve calls.
for await (const file of glob(`${nextRoot}/dist/compiled/webpack/*.js`)) entries.push(file);
entries.push(require.resolve("next/dist/compiled/@babel/runtime/package.json"));

// Next's traces alone miss the custom server and its config-loading dependencies.
// Trace the actual entry point too; do not substitute Next's standalone server.
const { fileList, warnings } = await nodeFileTrace(entries, {
  base: root,
  processCwd: root,
  ignore: (file) => file.endsWith(".map") || file.endsWith(".d.ts"),
  readFile: async (file) => {
    try {
      // Dynamic imports can include assets (maps, licenses, etc.) in NFT's
      // analysis. Copy them when traced, but only parse executable sources.
      if (!/\.(?:[cm]?js|[cm]?ts|json)$/.test(file) || file.endsWith(".d.ts")) return "";
      const source = await readFile(file, "utf8");
      // NFT parses JavaScript; Node runs these same sources with type stripping.
      return file.endsWith(".ts") ? stripTypeScriptTypes(source) : source;
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "EISDIR") return null;
      throw error;
    }
  },
});
for (const warning of warnings) {
  if (warning.message.startsWith("Failed to parse")) throw warning;
  console.warn(warning.message);
}

for await (const trace of glob(".next/**/*.nft.json")) {
  const { files } = JSON.parse(await readFile(trace, "utf8"));
  for (const file of files) fileList.add(relative(path.resolve(path.dirname(trace), file)));
}
const required = JSON.parse(await readFile(".next/required-server-files.json", "utf8"));
for (const file of required.files) fileList.add(file);
fileList.add("package.json");
fileList.add(".next/BUILD_ID");


await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of fileList) {
  const source = path.resolve(root, file);
  const destination = path.resolve(output, file);
  if (!destination.startsWith(`${output}${path.sep}`)) {
    throw new Error(`Runtime file is outside the project: ${file}`);
  }
  await mkdir(path.dirname(destination), { recursive: true });
  const stat = await lstat(source);
  if (stat.isSymbolicLink()) {
    // Preserve pnpm's relative links instead of duplicating entire packages.
    const target = await realpath(source);
    await symlink(path.relative(path.dirname(source), target), destination);
  } else {
    await copyFile(source, destination);
  }
}

// These assets are read dynamically and are not all represented in NFT traces.
for (const directory of [".next/server", ".next/static", "public"]) {
  try {
    await cp(directory, path.join(output, directory), { recursive: true });
  } catch (error) {
    if (directory !== "public" || error.code !== "ENOENT") throw error;
  }
}
await mkdir(path.join(output, ".next/cache"), { recursive: true });
console.log(`Packaged ${fileList.size} traced runtime files into .output`);
