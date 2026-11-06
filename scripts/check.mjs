import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const roots = ["lib", "public", "tests", "scripts"];
const files = ["index.js"];
async function scan(dir) {
  for (const f of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${f.name}`;
    if (f.isDirectory()) await scan(path);
    else if (/\.(m?js)$/.test(f.name)) files.push(path);
  }
}
for (const root of roots) await scan(root);
// Compile in this process: the managed environment denies subprocess spawning.
import vm from "node:vm";
import { readFile } from "node:fs/promises";
for (const file of files) {
  const source = await readFile(file, "utf8");
  if (typeof vm.SourceTextModule !== "function")
    throw Error("run check with --experimental-vm-modules");
  new vm.SourceTextModule(source, { identifier: file });
}
await import("../index.js");
console.log(
  `Syntax checked ${files.length} modules; package entry imports successfully.`,
);
