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
const searchInput = document.querySelector("#search-input");
const searchCount = document.querySelector("#search-count");
const searchPreviousButton = document.querySelector("#search-previous");
const searchNextButton = document.querySelector("#search-next");
const shareButton = document.querySelector("#share-page");
const toast = document.querySelector("#toast");

const params = new URLSearchParams(window.location.search);
const source = params.get("url");

let pdfDocument;
let originalUrl;
let currentPage = 1;
let pageElements = [];
let scrollFrame;
let toastTimer;
let searchTimer;
let searchRequestId = 0;
let completedSearchQuery = "";
let searchMatches = [];
let activeSearchIndex = -1;
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
  pageElements[nextPage - 1]?.scrollIntoView({ behavior, block: "center" });
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 1800);
}

async function renderPage(pageNumber) {
  if (renderedPages.has(pageNumber)) {
    return;
  }

  if (renderPromises.has(pageNumber)) {
    return renderPromises.get(pageNumber);
  }

  const promise = (async () => {
    const page = await pdfDocument.getPage(pageNumber);
    const container = pageElements[pageNumber - 1];
    const baseViewport = page.getViewport({ scale: 1 });
    const cssWidth = Math.max(280, container.clientWidth);
    const viewport = page.getViewport({ scale: cssWidth / baseViewport.width });
    const outputScale = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    container.style.aspectRatio = `${viewport.width} / ${viewport.height}`;

    await page.render({
      canvasContext: context,
      viewport,
      transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
    }).promise;

    container.replaceChildren(canvas);
    container.classList.add("rendered");
    renderedPages.add(pageNumber);
    page.cleanup();
  })();

  renderPromises.set(pageNumber, promise);

  try {
    await promise;
  } finally {
    renderPromises.delete(pageNumber);
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
  void renderPage(match.pageNumber);
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

async function shareCurrentPage() {
  const shareUrl = new URL(originalUrl.href);
  shareUrl.hash = `page=${currentPage}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: document.title, url: shareUrl.href });
      return;
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
    }
  }

  try {
    await navigator.clipboard.writeText(shareUrl.href);
    showToast(`Copied page ${currentPage} link`);
  } catch {
    window.prompt("Copy this page link:", shareUrl.href);
  }
}

function bindControls() {
  previousButton.addEventListener("click", () => goToPage(currentPage - 1));
  nextButton.addEventListener("click", () => goToPage(currentPage + 1));
  shareButton.addEventListener("click", () => void shareCurrentPage());

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

  document.addEventListener("keydown", (event) => {
    if (document.activeElement === pageNumberInput || document.activeElement === searchInput) {
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
  if (!source) {
    throw new Error("No PDF URL was provided.");
  }

  originalUrl = new URL(source);
  const requestedPage = getInitialPage(originalUrl);
  const requestUrl = new URL(originalUrl.href);
  requestUrl.hash = "";

  const fileName = decodeURIComponent(requestUrl.pathname.split("/").filter(Boolean).pop() || "PDF");
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
  observePages();
  goToPage(currentPage, "auto");
  void renderPage(currentPage);
}

initialize().catch((error) => {
  status.classList.add("error");
  status.textContent = `Could not open this PDF. ${error?.message || error}`;
  previousButton.disabled = true;
  nextButton.disabled = true;
  shareButton.disabled = true;
  pageNumberInput.disabled = true;
  searchInput.disabled = true;
  searchPreviousButton.disabled = true;
  searchNextButton.disabled = true;
});
