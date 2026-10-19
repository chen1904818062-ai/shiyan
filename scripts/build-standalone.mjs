import { build } from "esbuild";
import { mkdir, readFile, writeFile, copyFile, readdir } from "node:fs/promises";
import path from "node:path";
import { APP_VERSION } from "../lib/version.ts";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";

const root = process.cwd();
const output = path.join(root, "standalone-dist");
await mkdir(path.join(output, "public/assets"), { recursive: true });
await Promise.all([
  build({ absWorkingDir: root, entryPoints: [path.join(root, "standalone/auth-client.tsx")], outfile: path.join(output, "public/assets/auth.js"), bundle: true, minify: true, format: "esm", platform: "browser", target: "es2022", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } }),
  build({ absWorkingDir: root, entryPoints: [path.join(root, "standalone/client.tsx")], outfile: path.join(output, "public/assets/app.js"), bundle: true, minify: true, format: "esm", platform: "browser", target: "es2022", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, plugins: [{ name: "plain-application-css", setup(api) { api.onLoad({ filter: /app[\\/]globals\.css$/ }, async args => ({ contents: (await readFile(args.path, "utf8")).replace(/^@import\s+["']tailwindcss["'];\s*/, ""), loader: "css" })); } }] }),
  build({ absWorkingDir: root, entryPoints: [path.join(root, "standalone/server.ts")], outfile: path.join(output, "server.mjs"), bundle: true, minify: true, format: "esm", platform: "node", target: "node24", alias: { "@/lib/server": path.join(root, "standalone/server-context.ts") }, banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' } }),
]);
for (const [source, destination] of [["drizzle", "migrations/app"], ["standalone/migrations", "migrations/auth"]]) {
  await mkdir(path.join(output, destination), { recursive: true });
  for (const file of await readdir(source)) if (file.endsWith(".sql")) await copyFile(path.join(source, file), path.join(output, destination, file));
}
await copyFile("public/favicon.svg", path.join(output, "public/favicon.svg"));
await writeFile(path.join(output, "public/index.html"), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>拾言 · 对话整理</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/assets/app.css?v=${APP_VERSION}"></head><body><div id="root"><p style="padding:48px;color:#718363">正在打开你的思考空间…</p></div><script type="module" src="/assets/app.js?v=${APP_VERSION}"></script></body></html>`);
console.log("Standalone build ready: standalone-dist/server.mjs");
for (const file of await readdir(path.join(output, "public/assets"))) {
  if (!/\.(js|css)$/.test(file)) continue;
  const filename = path.join(output, "public/assets", file);
  const bytes = await readFile(filename);
  await Promise.all([
    writeFile(filename + ".gz", gzipSync(bytes, { level: 9 })),
    writeFile(filename + ".br", brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } })),
  ]);
}
