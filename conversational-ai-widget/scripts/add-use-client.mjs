// Re-adds the "use client" directive to the bundled entry files. esbuild strips
// module-level directives during bundling, so we prepend it afterwards to keep
// the package safe to import directly from React Server Components.
import { readFile, writeFile } from "node:fs/promises";

const files = ["dist/index.js", "dist/index.cjs"];
const directive = '"use client";\n';

for (const file of files) {
  const content = await readFile(file, "utf8");
  if (content.startsWith('"use client"') || content.startsWith("'use client'")) {
    continue;
  }
  await writeFile(file, directive + content, "utf8");
}
