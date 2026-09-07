import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const outdir = "dist";

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
manifest.background.service_worker = "background.js";
manifest.mime_types_handler["application/pdf"].handler_url = "viewer.html";
manifest.icons = Object.fromEntries(
  Object.entries(manifest.icons).map(([size, icon]) => [size, icon.replace("src/", "")]),
);
manifest.action.default_icon = manifest.action.default_icon.replace("src/", "");

for (const contentScript of manifest.content_scripts || []) {
  contentScript.js = contentScript.js?.map((script) => script.replace(/^src\//, ""));
  contentScript.css = contentScript.css?.map((stylesheet) => stylesheet.replace(/^src\//, ""));
}

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
  build({
    entryPoints: ["src/qr-file-url.js"],
    bundle: true,
    format: "esm",
    target: "chrome130",
    outfile: `${outdir}/qr-file-url.js`,
    minify: false,
    sourcemap: false,
  }),
  writeFile(`${outdir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`),
  cp("src/background.js", `${outdir}/background.js`),
  cp("src/viewer.html", `${outdir}/viewer.html`),
  cp("src/viewer.css", `${outdir}/viewer.css`),
  cp("src/text-selection.css", `${outdir}/text-selection.css`),
  cp("src/text-selection.js", `${outdir}/text-selection.js`),
  cp("src/search-highlight-cues.css", `${outdir}/search-highlight-cues.css`),
  cp("src/search-highlight-cues.js", `${outdir}/search-highlight-cues.js`),
  cp("src/toolbar-layout.css", `${outdir}/toolbar-layout.css`),
  cp("src/qr-file-url.css", `${outdir}/qr-file-url.css`),
  cp("src/annotation-layer.css", `${outdir}/annotation-layer.css`),
  cp("src/minimap.js", `${outdir}/minimap.js`),
  cp("src/minimap.css", `${outdir}/minimap.css`),
  cp("src/copy-file-url.js", `${outdir}/copy-file-url.js`),
  cp("src/network-fallback.js", `${outdir}/network-fallback.js`),
  cp("src/summarize-with-chatgpt.js", `${outdir}/summarize-with-chatgpt.js`),
  cp("src/chatgpt-summary.js", `${outdir}/chatgpt-summary.js`),
  cp("src/image-color-toggle.css", `${outdir}/image-color-toggle.css`),
  cp("src/image-color-toggle.js", `${outdir}/image-color-toggle.js`),
  cp("src/viewer-settings.js", `${outdir}/viewer-settings.js`),
  cp("src/sec-comment.js", `${outdir}/sec-comment.js`),
  cp("src/close-tab-shortcut.js", `${outdir}/close-tab-shortcut.js`),
  cp("src/assets", `${outdir}/assets`, { recursive: true }),
  cp("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", `${outdir}/pdf.worker.min.mjs`),
  cp("node_modules/pdfjs-dist/cmaps", `${outdir}/cmaps`, { recursive: true }),
  cp("node_modules/pdfjs-dist/standard_fonts", `${outdir}/standard_fonts`, { recursive: true }),
  cp("node_modules/pdfjs-dist/wasm", `${outdir}/wasm`, { recursive: true }),
]);

console.log("Built Chrome extension in dist/");
