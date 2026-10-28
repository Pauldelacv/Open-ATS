// Copies the pdf.js worker next to the static assets so the CV viewer can load it
// from the same origin, whatever the bundler does with workers.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
try {
  const pkg = dirname(require.resolve("pdfjs-dist/package.json"));
  const source = join(pkg, "build", "pdf.worker.min.mjs");
  if (existsSync(source)) {
    mkdirSync("public", { recursive: true });
    copyFileSync(source, join("public", "pdf.worker.min.mjs"));
  }
} catch {
  // pdfjs-dist not installed yet (e.g. partial install): nothing to copy.
}
