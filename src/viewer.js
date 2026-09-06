import { getDocument, GlobalWorkerOptions, TextLayer } from "../node_modules/pdfjs-dist/build/pdf.mjs";

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
const searchInput = document.querySelector("#search-input");
const searchCount = document.querySelector("#search-count");
const searchPreviousButton = document.querySelector("#search-previous");
const searchNextButton = document.querySelector("#search-next");
const shareButton = document.querySelector("#share-page");
const shareIcon = document.querySelector("#share-icon");
const sectionNav = document.querySelector("#section-nav");
const sectionToggle = document.querySelector("#section-toggle");
const sectionPopover = document.querySelector("#section-popover");
const sectionList = document.querySelector("#section-list");
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
const DARK_MODE_SHARE_ICON = extensionAssetUrl(
  "src/assets/copy-page-icon.png",
  "assets/copy-page-icon.png",
);
const LIGHT_MODE_SHARE_ICON = extensionAssetUrl(
  "src/assets/copy-page-icon-light.png",
  "assets/copy-page-icon-light.png",
);

let pdfDocument;
let originalUrl;
let requestUrl;
let fileName = "document.pdf";
let currentPage = 1;
let rotation = 0;
let pageElements = [];
let scrollFrame;
let toastTimer;
let mimeHandlerActive = false;
let searchTimer;
let searchRequestId = 0;
let completedSearchQuery = "";
let searchMatches = [];
let activeSearchIndex = -1;
let renderGeneration = 0;
const renderPromises = new Map();
const renderedPages = new Set();
const pageTextCache = new Map();

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

  if (!mimeHandlerActive) {
    const viewerUrl = new URL(window.location.href);
    viewerUrl.hash = `page=${currentPage}`;
    history.replaceState(null, "", viewerUrl);
  }
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
  pageElements[nextPage - 1]?.scrollIntoView({ behavior, block: "center" });
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 1800);
}

async function resolvePdfSource() {
  if (chrome.mimeHandler?.getStreamInfo) {
    try {
      const streamInfo = await chrome.mimeHandler.getStreamInfo();
      const response = await fetch(streamInfo.streamUrl);
      if (!response.ok) {
        throw new Error(`Could not read PDF stream (${response.status}).`);
      }

      const data = new Uint8Array(await response.arrayBuffer());
      mimeHandlerActive = true;
      return {
        originalUrl: new URL(streamInfo.originalUrl),
        data,
      };
    } catch (error) {
      if (!source) {
        throw error;
      }
    }
  }

  if (!source) {
    throw new Error("No PDF URL or MIME-handler stream was provided.");
  }

  const fallbackOriginalUrl = new URL(source);
  const requestUrl = new URL(fallbackOriginalUrl.href);
  requestUrl.hash = "";

  return {
    originalUrl: fallbackOriginalUrl,
    url: requestUrl.href,
  };
}

function outlineHasDestination(items) {
  return items.some(
    (item) => Boolean(item.dest) || (item.items?.length && outlineHasDestination(item.items)),
  );
}

function closeSectionPopover() {
  sectionPopover.hidden = true;
  sectionToggle.setAttribute("aria-expanded", "false");
}

function toggleSectionPopover() {
  const opening = sectionPopover.hidden;
  sectionPopover.hidden = !opening;
  sectionToggle.setAttribute("aria-expanded", String(opening));
}

async function navigateToOutlineItem(item) {
  try {
    let destination = item.dest;

    if (typeof destination === "string") {
      destination = await pdfDocument.getDestination(destination);
    }

    if (!Array.isArray(destination) || destination.length === 0) {
      return;
    }

    const pageReference = destination[0];
    let pageIndex;

    if (Number.isInteger(pageReference)) {
      pageIndex = pageReference;
    } else {
      pageIndex = await pdfDocument.getPageIndex(pageReference);
    }

    goToPage(pageIndex + 1);
    closeSectionPopover();
  } catch {
    showToast("Could not open that section");
  }
}

function createOutlineList(items) {
  const list = document.createElement("ul");

  for (const item of items) {
    const children = item.items || [];
    const hasDestination = Boolean(item.dest);
    const hasChildDestination = children.length > 0 && outlineHasDestination(children);
    const title = item.title?.trim();

    if (!title || (!hasDestination && !hasChildDestination)) {
      continue;
    }

    const entry = document.createElement("li");
    entry.className = "section-entry";

    if (hasDestination) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "section-link";
      button.textContent = title;
      button.addEventListener("click", () => void navigateToOutlineItem(item));
      entry.append(button);
    } else {
      const heading = document.createElement("span");
      heading.className = "section-heading";
      heading.textContent = title;
      entry.append(heading);
    }

    if (hasChildDestination) {
      entry.append(createOutlineList(children));
    }

    list.append(entry);
  }

  return list;
}

async function initializeSectionNavigation() {
  let outline;

  try {
    outline = await pdfDocument.getOutline();
  } catch {
    return;
  }

  if (!outline?.length || !outlineHasDestination(outline)) {
    return;
  }

  const outlineList = createOutlineList(outline);
  if (!outlineList.childElementCount) {
    return;
  }

  sectionList.replaceChildren(outlineList);
  sectionNav.hidden = false;
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
  shareIcon.src = isDark ? DARK_MODE_SHARE_ICON : LIGHT_MODE_SHARE_ICON;
  themeButton.title = isDark ? "Switch to light mode" : "Switch to dark mode";
  themeButton.setAttribute("aria-label", themeButton.title);
}

function toggleTheme() {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
}

function highlightTextLayer(textLayer, query) {
  const normalizedQuery = query.toLocaleLowerCase().trim();

  for (const span of textLayer.querySelectorAll("span")) {
    const text = span.dataset.searchText ?? span.textContent ?? "";
    span.dataset.searchText = text;
    span.replaceChildren(text);

    if (!normalizedQuery) {
      continue;
    }

    const comparableText = text.toLocaleLowerCase();
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let matchIndex = comparableText.indexOf(normalizedQuery);

    while (matchIndex !== -1) {
      fragment.append(text.slice(cursor, matchIndex));
      const highlight = document.createElement("mark");
      highlight.className = "search-highlight";
      highlight.textContent = text.slice(matchIndex, matchIndex + normalizedQuery.length);
      fragment.append(highlight);
      cursor = matchIndex + normalizedQuery.length;
      matchIndex = comparableText.indexOf(normalizedQuery, cursor);
    }

    if (cursor > 0) {
      fragment.append(text.slice(cursor));
      span.replaceChildren(fragment);
    }
  }
}

function refreshSearchHighlights(query = completedSearchQuery) {
  for (const pageElement of pageElements) {
    const textLayer = pageElement.querySelector(".text-layer");
    if (textLayer) {
      highlightTextLayer(textLayer, query);
    }
  }
}

async function renderPage(pageNumber) {
  if (renderedPages.has(pageNumber)) {
    return;
  }

  if (renderPromises.has(pageNumber)) {
    return renderPromises.get(pageNumber);
  }

  const generation = renderGeneration;
  let promise;
  promise = (async () => {
    const page = await pdfDocument.getPage(pageNumber);
    const container = pageElements[pageNumber - 1];
    const baseViewport = page.getViewport({ scale: 1, rotation });
    const cssWidth = Math.max(280, container.clientWidth);
    const viewport = page.getViewport({ scale: cssWidth / baseViewport.width, rotation });
    const outputScale = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    const textLayer = document.createElement("div");
    textLayer.className = "text-layer";

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const textLayerTask = new TextLayer({
      textContentSource: page.streamTextContent({
        includeMarkedContent: true,
        disableNormalization: true,
      }),
      container: textLayer,
      viewport,
    });

    await Promise.all([
      page.render({
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
      }).promise,
      textLayerTask.render(),
    ]);

    if (generation !== renderGeneration) {
      page.cleanup();
      return;
    }

    container.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
    highlightTextLayer(textLayer, completedSearchQuery);
    container.replaceChildren(canvas, textLayer);
    container.classList.add("rendered");
    renderedPages.add(pageNumber);
    page.cleanup();
  })();

  renderPromises.set(pageNumber, promise);

  try {
    await promise;
  } finally {
    if (renderPromises.get(pageNumber) === promise) {
      renderPromises.delete(pageNumber);
    }
  }
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

function observePages() {
  const renderObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const pageNumber = Number.parseInt(entry.target.dataset.page, 10);
          void renderPage(pageNumber);
          renderObserver.unobserve(entry.target);
        }
      }
    },
    { rootMargin: "1200px 0px" },
  );

  for (const page of pageElements) {
    renderObserver.observe(page);
  }
}

function normalizeSearchText(value) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

async function getPageSearchText(pageNumber) {
  if (pageTextCache.has(pageNumber)) {
    return pageTextCache.get(pageNumber);
  }

  const page = await pdfDocument.getPage(pageNumber);
  const textContent = await page.getTextContent();
  const text = normalizeSearchText(
    textContent.items.map((item) => ("str" in item ? item.str : "")).join(" "),
  );

  pageTextCache.set(pageNumber, text);
  return text;
}

function clearSearchPageMarker() {
  document.querySelector(".page.search-match-page")?.classList.remove("search-match-page");
}

function resetSearchResults() {
  searchMatches = [];
  activeSearchIndex = -1;
  completedSearchQuery = "";
  searchCount.textContent = "";
  searchPreviousButton.disabled = true;
  searchNextButton.disabled = true;
  clearSearchPageMarker();
  refreshSearchHighlights("");
}

function showSearchMatch(index, behavior = "smooth") {
  if (!searchMatches.length) {
    return;
  }

  activeSearchIndex = (index + searchMatches.length) % searchMatches.length;
  const match = searchMatches[activeSearchIndex];

  searchCount.textContent = `${activeSearchIndex + 1} / ${searchMatches.length}`;
  searchPreviousButton.disabled = false;
  searchNextButton.disabled = false;

  clearSearchPageMarker();
  const pageElement = pageElements[match.pageNumber - 1];
  pageElement?.classList.add("search-match-page");

  goToPage(match.pageNumber, behavior);
  void renderPage(match.pageNumber).then(() => refreshSearchHighlights());
}

async function runSearch(rawQuery) {
  const query = normalizeSearchText(rawQuery);
  const requestId = ++searchRequestId;

  clearTimeout(searchTimer);

  if (!query || !pdfDocument) {
    resetSearchResults();
    return;
  }

  searchCount.textContent = "…";
  searchPreviousButton.disabled = true;
  searchNextButton.disabled = true;
  clearSearchPageMarker();

  const matches = [];

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const pageText = await getPageSearchText(pageNumber);

    if (requestId !== searchRequestId) {
      return;
    }

    let offset = 0;
    while (offset <= pageText.length - query.length) {
      const matchOffset = pageText.indexOf(query, offset);
      if (matchOffset === -1) {
        break;
      }

      matches.push({ pageNumber, offset: matchOffset });
      offset = matchOffset + Math.max(query.length, 1);
    }
  }

  if (requestId !== searchRequestId) {
    return;
  }

  searchMatches = matches;
  completedSearchQuery = query;
  refreshSearchHighlights(query);

  if (!matches.length) {
    activeSearchIndex = -1;
    searchCount.textContent = "0 / 0";
    searchPreviousButton.disabled = true;
    searchNextButton.disabled = true;
    return;
  }

  showSearchMatch(0, "auto");
}

function scheduleSearch() {
  clearTimeout(searchTimer);
  searchRequestId += 1;

  const query = searchInput.value.trim();
  if (!query) {
    resetSearchResults();
    return;
  }

  searchCount.textContent = "…";
  searchPreviousButton.disabled = true;
  searchNextButton.disabled = true;
  clearSearchPageMarker();

  searchTimer = setTimeout(() => {
    void runSearch(query);
  }, 180);
}

function stepSearch(delta) {
  const query = normalizeSearchText(searchInput.value);

  if (!query) {
    return;
  }

  if (query !== completedSearchQuery) {
    void runSearch(searchInput.value);
    return;
  }

  if (searchMatches.length) {
    showSearchMatch(activeSearchIndex + delta);
  }
}

function focusSearch() {
  searchInput.focus();
  searchInput.select();
}

async function rotatePages(delta) {
  if (!pdfDocument) {
    return;
  }

  rotation = (rotation + delta + 360) % 360;
  renderGeneration += 1;

  const pagesToRender = new Set([
    ...renderedPages,
    ...renderPromises.keys(),
    currentPage,
  ]);

  renderedPages.clear();
  renderPromises.clear();

  for (const pageNumber of pagesToRender) {
    const container = pageElements[pageNumber - 1];
    container?.replaceChildren();
    container?.classList.remove("rendered");
  }

  await Promise.all([...pagesToRender].map((pageNumber) => renderPage(pageNumber)));
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
  await Promise.all(
    Array.from({ length: pdfDocument.numPages }, (_, index) => renderPage(index + 1)),
  );
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
  sectionToggle.addEventListener("click", toggleSectionPopover);

  document.addEventListener("pointerdown", (event) => {
    if (!sectionPopover.hidden && !sectionNav.contains(event.target)) {
      closeSectionPopover();
    }
  });
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

  searchInput.addEventListener("input", scheduleSearch);
  searchPreviousButton.addEventListener("click", () => stepSearch(-1));
  searchNextButton.addEventListener("click", () => stepSearch(1));

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      stepSearch(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      searchInput.blur();
    }
  });

  document.addEventListener(
    "keydown",
    (event) => {
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (modifier && key === "f") {
        event.preventDefault();
        event.stopPropagation();
        focusSearch();
        return;
      }

      if ((modifier && key === "g") || event.key === "F3") {
        if (!searchInput.value.trim()) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        stepSearch(event.shiftKey ? -1 : 1);
      }
    },
    true,
  );

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

    if (event.key === "Escape" && !sectionPopover.hidden) {
      closeSectionPopover();
      sectionToggle.focus();
      return;
    }

    if (
      document.activeElement === pageNumberInput ||
      document.activeElement === searchInput ||
      sectionPopover.contains(document.activeElement)
    ) {
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
  const resolvedSource = await resolvePdfSource();
  originalUrl = resolvedSource.originalUrl;
  const requestedPage = getInitialPage(originalUrl);
  requestUrl = new URL(originalUrl.href);
  requestUrl.hash = "";

  fileName = decodeURIComponent(requestUrl.pathname.split("/").filter(Boolean).pop() || "document.pdf");
  if (!fileName.toLowerCase().endsWith(".pdf")) {
    fileName += ".pdf";
  }
  document.title = fileName;

  const documentOptions = {
    cMapUrl: extensionAssetUrl("node_modules/pdfjs-dist/cmaps/", "cmaps/"),
    cMapPacked: true,
    standardFontDataUrl: extensionAssetUrl(
      "node_modules/pdfjs-dist/standard_fonts/",
      "standard_fonts/",
    ),
    wasmUrl: extensionAssetUrl("node_modules/pdfjs-dist/wasm/", "wasm/"),
  };

  if (resolvedSource.data) {
    documentOptions.data = resolvedSource.data;
  } else {
    documentOptions.url = resolvedSource.url;
    documentOptions.withCredentials = true;
  }

  const loadingTask = getDocument(documentOptions);
  pdfDocument = await loadingTask.promise;
  currentPage = Math.min(requestedPage, pdfDocument.numPages);
  pageCount.textContent = String(pdfDocument.numPages);
  pageNumberInput.max = String(pdfDocument.numPages);

  const samplePage = await pdfDocument.getPage(currentPage);
  createPagePlaceholders(samplePage.getViewport({ scale: 1 }));
  samplePage.cleanup();
  bindControls();
  observePages();
  await initializeSectionNavigation();
  goToPage(currentPage, "auto");
  void renderPage(currentPage);
}

initialize().catch(async (error) => {
  if (mimeHandlerActive && chrome.mimeHandler?.abortAndFallbackToNativeHandler) {
    try {
      await chrome.mimeHandler.abortAndFallbackToNativeHandler();
      return;
    } catch {
      // If native fallback itself fails, show the viewer error below.
    }
  }

  status.classList.add("error");
  status.textContent = `Could not open this PDF. ${error?.message || error}`;
  previousButton.disabled = true;
  nextButton.disabled = true;
  shareButton.disabled = true;
  themeButton.disabled = true;
  toolsButton.disabled = true;
  pageNumberInput.disabled = true;
  searchInput.disabled = true;
  searchPreviousButton.disabled = true;
  searchNextButton.disabled = true;
});
