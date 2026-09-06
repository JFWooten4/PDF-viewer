import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const outdir = "dist";

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
manifest.background.service_worker = "background.js";

await Promise.all([
  build({
    entryPoints: ["src/viewer.js"],
    bundle: true,
    format: "esm",
    target: "chrome130",
    outfile: `${outdir}/viewer.js`,
    minify: false,
    sourcemap: false,
  }),
  writeFile(`${outdir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`),
  cp("src/background.js", `${outdir}/background.js`),
  cp("src/viewer.html", `${outdir}/viewer.html`),
  cp("src/viewer.css", `${outdir}/viewer.css`),
  cp("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", `${outdir}/pdf.worker.min.mjs`),
  cp("node_modules/pdfjs-dist/cmaps", `${outdir}/cmaps`, { recursive: true }),
  cp("node_modules/pdfjs-dist/standard_fonts", `${outdir}/standard_fonts`, { recursive: true }),
  cp("node_modules/pdfjs-dist/wasm", `${outdir}/wasm`, { recursive: true }),
]);

console.log("Built Chrome extension in dist/");
