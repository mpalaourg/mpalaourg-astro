import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function* htmlFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(path);
    else if (entry.name.endsWith(".html")) yield path;
  }
}

let checked = 0;
for await (const path of htmlFiles("dist")) {
  const html = await readFile(path, "utf8");
  const descriptions = [...html.matchAll(/<meta\s+name="description"\s+content="([^"]*)"\s*\/?\s*>/gi)];
  if (descriptions.length !== 1 || !descriptions[0][1].trim()) {
    throw new Error(`${path}: expected exactly one nonempty meta description`);
  }
  checked++;
}
if (!checked) throw new Error("No generated HTML pages found in dist");
console.log(`Verified meta descriptions on ${checked} generated HTML pages.`);
