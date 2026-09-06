import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.min.mjs");

const viewer = document.querySelector("#viewer");
const status = document.querySelector("#status");
const previousButton = document.querySelector("#previous-page");
const nextButton = document.querySelector("#next-page");
const pageNumberInput = document.querySelector("#page-number");
const pageCount = document.querySelector("#page-count");
const shareButton = document.querySelector("#share-page");
const sectionNav = document.querySelector("#section-nav");
const sectionToggle = document.querySelector("#section-toggle");
const sectionPopover = document.querySelector("#section-popover");
const sectionList = document.querySelector("#section-list");
const toast = document.querySelector("#toast");

const params = new URLSearchParams(window.location.search);
const source = params.get("url");

let pdfDocument;
let originalUrl;
let currentPage = 1;
let pageElements = [];
let scrollFrame;
let toastTimer;
const renderPromises = new Map();
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
  sectionToggle.addEventListener("click", toggleSectionPopover);

  document.addEventListener("pointerdown", (event) => {
    if (!sectionPopover.hidden && !sectionNav.contains(event.target)) {
      closeSectionPopover();
    }
  });

  pageNumberInput.addEventListener("change", () => {
    goToPage(Number.parseInt(pageNumberInput.value, 10) || currentPage);
  });

  pageNumberInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      pageNumberInput.blur();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !sectionPopover.hidden) {
      closeSectionPopover();
      sectionToggle.focus();
      return;
    }

    if (document.activeElement === pageNumberInput || sectionPopover.contains(document.activeElement)) {
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
    cMapUrl: chrome.runtime.getURL("cmaps/"),
    cMapPacked: true,
    standardFontDataUrl: chrome.runtime.getURL("standard_fonts/"),
    wasmUrl: chrome.runtime.getURL("wasm/"),
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
  await initializeSectionNavigation();
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
});
