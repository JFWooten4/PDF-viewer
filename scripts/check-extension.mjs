import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

function fail(message) {
  throw new Error(message);
}

async function requireFile(path, label = path) {
  try {
    await access(path);
  } catch {
    fail(`${label} does not exist: ${path}`);
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function validateManifest(path, expected) {
  const manifest = await readJson(path);
  const root = dirname(path);

  if (manifest.manifest_version !== 3) {
    fail(`${path}: expected Manifest V3`);
  }

  const worker = manifest.background?.service_worker;
  if (worker !== expected.worker) {
    fail(`${path}: expected background worker ${expected.worker}, got ${worker}`);
  }
  await requireFile(join(root, worker), `${path} background worker`);

  const pdfHandler = manifest.mime_types_handler?.["application/pdf"];
  if (!pdfHandler) {
    fail(`${path}: missing application/pdf MIME handler`);
  }
  if (pdfHandler.handler_url !== expected.handler) {
    fail(`${path}: expected PDF handler ${expected.handler}, got ${pdfHandler.handler_url}`);
  }
  if (pdfHandler.can_embed !== true) {
    fail(`${path}: application/pdf handler must set can_embed to true`);
  }
  await requireFile(join(root, pdfHandler.handler_url), `${path} PDF handler`);

  return manifest;
}

await validateManifest("manifest.json", {
  worker: "src/background.js",
  handler: "src/viewer.html",
});

await validateManifest("dist/manifest.json", {
  worker: "background.js",
  handler: "viewer.html",
});

for (const path of [
  "dist/viewer.js",
  "dist/viewer.css",
  "dist/summarize-with-chatgpt.js",
  "dist/chatgpt-summary.js",
  "dist/qr-file-url.js",
  "dist/qr-file-url.css",
  "dist/pdf.worker.min.mjs",
  "dist/cmaps",
  "dist/standard_fonts",
  "dist/wasm",
]) {
  await requireFile(path);
}

const sourceViewer = await readFile("src/viewer.js", "utf8");
const sourceBackground = await readFile("src/background.js", "utf8");
const builtViewer = await readFile("dist/viewer.js", "utf8");

if (!sourceViewer.includes("chrome.mimeHandler.getStreamInfo")) {
  fail("src/viewer.js must consume the intercepted PDF stream with chrome.mimeHandler.getStreamInfo()");
}
if (!builtViewer.includes("mimeHandler.getStreamInfo")) {
  fail("dist/viewer.js lost the MIME-handler stream code during bundling");
}
if (!sourceBackground.includes("chrome.mimeHandler")) {
  fail("src/background.js must feature-detect chrome.mimeHandler before using the redirect fallback");
}

console.log("Extension package checks passed.");
