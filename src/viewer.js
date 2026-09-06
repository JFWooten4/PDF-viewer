import { getDocument, GlobalWorkerOptions } from "../node_modules/pdfjs-dist/build/pdf.mjs";

const sourceMode = window.location.pathname.includes("/src/");

function extensionAssetUrl(sourcePath, builtPath) {
  return chrome.runtime.getURL(sourceMode ? sourcePath : builtPath);
}

GlobalWorkerOptions.workerSrc = extensionAssetUrl(
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  "pdf.worker.min.mjs",
);

const viewer = document.querySelector("#viewer");
const status = document.querySelector("#status");
const previousButton = document.querySelector("#previous-page");
const nextButton = document.querySelector("#next-page");
const pageNumberInput = document.querySelector("#page-number");
const pageCount = document.querySelector("#page-count");
const shareButton = document.querySelector("#share-page");
const themeButton = document.querySelector("#theme-toggle");
const themeIcon = document.querySelector("#theme-icon");
const tools = document.querySelector("#tools");
const toolsButton = document.querySelector("#tools-button");
const toolsMenu = document.querySelector("#tools-menu");
const rotateLeftButton = document.querySelector("#rotate-left");
const rotateRightButton = document.querySelector("#rotate-right");
const printButton = document.querySelector("#print-pdf");
const downloadButton = document.querySelector("#download-pdf");
const toast = document.querySelector("#toast");

const params = new URLSearchParams(window.location.search);
const source = params.get("url");
const THEME_STORAGE_KEY = "pdf-viewer-theme";
const LUNA_ICON = extensionAssetUrl("src/assets/luna-mark.png", "assets/luna-mark.png");
const CELESTIA_ICON = extensionAssetUrl("src/assets/celestia-mark.png", "assets/celestia-mark.png");

let pdfDocument;
let originalUrl;
let requestUrl;
let fileName = "document.pdf";
let currentPage = 1;
let rotation = 0;
let pageElements = [];
let scrollFrame;
let toastTimer;
let renderGeneration = 0;
let renderQueuePromise;
const priorityRenderQueue = new Set();
const backgroundRenderQueue = new Set();
const renderedPages = new Set();

function getInitialPage(url) {
  const match = url.hash.match(/(?:^#|[&#])page=(\d+)/i);
  return match ? Math.max(1, Number.parseInt(match[1], 10)) : 1;
}

function setCurrentPage(pageNumber) {
  if (!pdfDocument) {
    return;
  }

  const nextPage = Math.min(Math.max(pageNumber, 1), pdfDocument.numPages);
  if (currentPage === nextPage && pageNumberInput.value === String(nextPage)) {
    return;
  }

  currentPage = nextPage;
  pageNumberInput.value = String(currentPage);
  previousButton.disabled = currentPage <= 1;
  nextButton.disabled = currentPage >= pdfDocument.numPages;
  void queuePageRender(currentPage, true);

  const viewerUrl = new URL(window.location.href);
  viewerUrl.hash = `page=${currentPage}`;
  history.replaceState(null, "", viewerUrl);
}

function pageAtViewportCenter() {
  const toolbarHeight = 52;
  const y = toolbarHeight + (window.innerHeight - toolbarHeight) / 2;
  const target = document.elementFromPoint(window.innerWidth / 2, y)?.closest(".page");

  if (target?.dataset.page) {
    setCurrentPage(Number.parseInt(target.dataset.page, 10));
  }
}

function schedulePageTracking() {
  if (scrollFrame) {
    return;
  }

  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = undefined;
    pageAtViewportCenter();
  });
}

function goToPage(pageNumber, behavior = "smooth") {
  if (!pdfDocument) {
    return;
  }

  const nextPage = Math.min(Math.max(pageNumber, 1), pdfDocument.numPages);
  setCurrentPage(nextPage);
  void queuePageRender(nextPage, true);
  pageElements[nextPage - 1]?.scrollIntoView({ behavior, block: "center" });
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 1800);
}

function setToolsMenuOpen(open) {
  toolsMenu.hidden = !open;
  toolsButton.setAttribute("aria-expanded", String(open));
}

function setTheme(theme) {
  const nextTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);

  const isDark = nextTheme === "dark";
  themeIcon.classList.toggle("celestia-icon", isDark);
  themeIcon.src = isDark ? CELESTIA_ICON : LUNA_ICON;
  themeButton.title = isDark ? "Switch to light mode" : "Switch to dark mode";
  themeButton.setAttribute("aria-label", themeButton.title);
}

function toggleTheme() {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
}

function yieldToBrowser() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function takeNextQueuedPage() {
  const queue = priorityRenderQueue.size > 0 ? priorityRenderQueue : backgroundRenderQueue;
  if (queue.size === 0) {
    return undefined;
  }

  let pageNumber;
  for (const queuedPage of queue) {
    if (pageNumber === undefined || queuedPage < pageNumber) {
      pageNumber = queuedPage;
    }
  }

  queue.delete(pageNumber);
  return pageNumber;
}

async function renderPageNow(pageNumber) {
  if (renderedPages.has(pageNumber)) {
    return;
  }

  const generation = renderGeneration;
  const page = await pdfDocument.getPage(pageNumber);
  const container = pageElements[pageNumber - 1];
  const baseViewport = page.getViewport({ scale: 1, rotation });
  const cssWidth = Math.max(280, container.clientWidth);
  const viewport = page.getViewport({ scale: cssWidth / baseViewport.width, rotation });
  const outputScale = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });

  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  await page.render({
    canvasContext: context,
    viewport,
    transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
  }).promise;

  if (generation !== renderGeneration) {
    page.cleanup();
    return;
  }

  container.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
  container.replaceChildren(canvas);
  container.classList.add("rendered");
  renderedPages.add(pageNumber);
  page.cleanup();
}

function drainRenderQueue() {
  if (renderQueuePromise) {
    return renderQueuePromise;
  }

  renderQueuePromise = (async () => {
    try {
      let pageNumber = takeNextQueuedPage();
      while (pageNumber !== undefined) {
        await renderPageNow(pageNumber);
        await yieldToBrowser();
        pageNumber = takeNextQueuedPage();
      }
    } finally {
      renderQueuePromise = undefined;
      if (priorityRenderQueue.size > 0 || backgroundRenderQueue.size > 0) {
        void drainRenderQueue();
      }
    }
  })();

  return renderQueuePromise;
}

function queuePageRender(pageNumber, priority = false) {
  if (!pdfDocument || renderedPages.has(pageNumber)) {
    return Promise.resolve();
  }

  backgroundRenderQueue.delete(pageNumber);
  if (priority) {
    priorityRenderQueue.add(pageNumber);
  } else if (!priorityRenderQueue.has(pageNumber)) {
    backgroundRenderQueue.add(pageNumber);
  }

  return drainRenderQueue();
}

function queueAllPages() {
  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    if (!renderedPages.has(pageNumber) && !priorityRenderQueue.has(pageNumber)) {
      backgroundRenderQueue.add(pageNumber);
    }
  }

  return drainRenderQueue();
}

function createPagePlaceholders(sampleViewport) {
  const fragment = document.createDocumentFragment();
  const ratio = `${sampleViewport.width} / ${sampleViewport.height}`;

  pageElements = Array.from({ length: pdfDocument.numPages }, (_, index) => {
    const pageNumber = index + 1;
    const element = document.createElement("section");
    element.className = "page";
    element.dataset.page = String(pageNumber);
    element.setAttribute("aria-label", `Page ${pageNumber}`);
    element.style.setProperty("--page-ratio", ratio);
    fragment.append(element);
    return element;
  });

  status.remove();
  viewer.append(fragment);
}

async function rotatePages(delta) {
  if (!pdfDocument) {
    return;
  }

  rotation = (rotation + delta + 360) % 360;
  renderGeneration += 1;
  renderedPages.clear();
  priorityRenderQueue.clear();
  backgroundRenderQueue.clear();

  await queuePageRender(currentPage, true);
  void queueAllPages();
  pageElements[currentPage - 1]?.scrollIntoView({ behavior: "auto", block: "center" });
}

async function shareCurrentPage() {
  const shareUrl = new URL(originalUrl.href);
  shareUrl.hash = `page=${currentPage}`;

  try {
    await navigator.clipboard.writeText(shareUrl.href);
  } catch {
    // Keep the copy control silent if clipboard access is unavailable.
  }
}

async function printPdf() {
  if (!pdfDocument) {
    return;
  }

  setToolsMenuOpen(false);
  showToast("Preparing pages for print…");
  await queueAllPages();
  window.print();
}

async function downloadPdf() {
  if (!pdfDocument) {
    return;
  }

  setToolsMenuOpen(false);
  showToast("Preparing download…");
  const data = await pdfDocument.getData();
  const blob = new Blob([data], { type: "application/pdf" });
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

function bindControls() {
  previousButton.addEventListener("click", () => goToPage(currentPage - 1));
  nextButton.addEventListener("click", () => goToPage(currentPage + 1));
  shareButton.addEventListener("click", () => void shareCurrentPage());
  themeButton.addEventListener("click", toggleTheme);
  toolsButton.addEventListener("click", () => {
    setToolsMenuOpen(toolsMenu.hidden);
  });

  rotateLeftButton.addEventListener("click", () => void rotatePages(-90));
  rotateRightButton.addEventListener("click", () => void rotatePages(90));
  printButton.addEventListener("click", () => void printPdf());
  downloadButton.addEventListener("click", () => void downloadPdf());

  pageNumberInput.addEventListener("change", () => {
    goToPage(Number.parseInt(pageNumberInput.value, 10) || currentPage);
  });

  pageNumberInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      pageNumberInput.blur();
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!toolsMenu.hidden && !tools.contains(event.target)) {
      setToolsMenuOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !toolsMenu.hidden) {
      setToolsMenuOpen(false);
      toolsButton.focus();
      return;
    }

    if (document.activeElement === pageNumberInput) {
      return;
    }

    if (event.key === "ArrowLeft") {
      goToPage(currentPage - 1);
    } else if (event.key === "ArrowRight") {
      goToPage(currentPage + 1);
    }
  });

  window.addEventListener("scroll", schedulePageTracking, { passive: true });
  window.addEventListener("resize", schedulePageTracking);
}

async function initialize() {
  setTheme(localStorage.getItem(THEME_STORAGE_KEY) || "dark");

  if (!source) {
    throw new Error("No PDF URL was provided.");
  }

  originalUrl = new URL(source);
  const requestedPage = getInitialPage(originalUrl);
  requestUrl = new URL(originalUrl.href);
  requestUrl.hash = "";

  fileName = decodeURIComponent(requestUrl.pathname.split("/").filter(Boolean).pop() || "document.pdf");
  if (!fileName.toLowerCase().endsWith(".pdf")) {
    fileName += ".pdf";
  }
  document.title = fileName;

  const loadingTask = getDocument({
    url: requestUrl.href,
    withCredentials: true,
    cMapUrl: extensionAssetUrl("node_modules/pdfjs-dist/cmaps/", "cmaps/"),
    cMapPacked: true,
    standardFontDataUrl: extensionAssetUrl(
      "node_modules/pdfjs-dist/standard_fonts/",
      "standard_fonts/",
    ),
    wasmUrl: extensionAssetUrl("node_modules/pdfjs-dist/wasm/", "wasm/"),
  });

  pdfDocument = await loadingTask.promise;
  currentPage = Math.min(requestedPage, pdfDocument.numPages);
  pageCount.textContent = String(pdfDocument.numPages);
  pageNumberInput.max = String(pdfDocument.numPages);

  const samplePage = await pdfDocument.getPage(currentPage);
  createPagePlaceholders(samplePage.getViewport({ scale: 1 }));
  samplePage.cleanup();
  bindControls();
  goToPage(currentPage, "auto");
  void queueAllPages();
}

initialize().catch((error) => {
  status.classList.add("error");
  status.textContent = `Could not open this PDF. ${error?.message || error}`;
  previousButton.disabled = true;
  nextButton.disabled = true;
  shareButton.disabled = true;
  themeButton.disabled = true;
  toolsButton.disabled = true;
  pageNumberInput.disabled = true;
});
