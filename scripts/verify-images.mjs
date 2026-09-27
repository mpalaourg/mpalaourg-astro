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
  for (const image of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\salt\s*=\s*(?:"[^"]*"|'[^']*')/i.test(image[0])) {
      throw new Error(`${path}: image has no alt attribute: ${image[0].slice(0, 160)}`);
    }
    checked++;
  }
}
if (!checked) throw new Error("No images found in generated HTML");
console.log(`Verified alt attributes on ${checked} generated images.`);
