import {
  getDocument,
  GlobalWorkerOptions,
  VerbosityLevel,
} from "../../../node_modules/pdfjs-dist/build/pdf.mjs";

const viewer = document.querySelector("#viewer");
const minimap = document.querySelector("#minimap");
const minimapPages = document.querySelector("#minimap-pages");
const minimapViewport = document.querySelector("#minimap-viewport");
const rotateLeftButton = document.querySelector("#rotate-left");
const rotateRightButton = document.querySelector("#rotate-right");

const sourceMode = window.location.pathname.includes("/src/");

function extensionAssetUrl(sourcePath, builtPath) {
  return chrome.runtime.getURL(sourceMode ? sourcePath : builtPath);
}

GlobalWorkerOptions.workerSrc = extensionAssetUrl(
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  "pdf.worker.min.mjs",
);

const MINIMAP_WHEEL_TRACK_SCALE = 0.55;
const MINIMAP_THUMBNAIL_WIDTH = 80;
const WHEEL_LINE_HEIGHT = 16;
const params = new URLSearchParams(window.location.search);
const source = params.get("url");

let syncFrame;
let dragging = false;
let dragOffset = 0;
let viewportHeight = 18;
let mapHeight = 0;
let thumbnailDocument;
let thumbnailGeneration = 0;
let thumbnailRotation = 0;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function scheduleSync() {
  if (syncFrame) {
    return;
  }

  syncFrame = requestAnimationFrame(() => {
    syncFrame = undefined;
    syncMinimap();
  });
}

function ensureTiles(pages) {
  if (minimapPages.children.length === pages.length) {
    return Array.from(minimapPages.children);
  }

  const fragment = document.createDocumentFragment();
  const tiles = pages.map((page) => {
    const tile = document.createElement("div");
    tile.className = "minimap-page";
    tile.dataset.page = page.dataset.page || "";
    fragment.append(tile);
    return tile;
  });

  minimapPages.replaceChildren(fragment);
  return tiles;
}

function documentMetrics() {
  const documentHeight = Math.max(document.documentElement.scrollHeight, window.innerHeight, 1);
  const scrollMaximum = Math.max(documentHeight - window.innerHeight, 0);
  return { documentHeight, scrollMaximum };
}

function viewportTopFromScrollPosition() {
  const { scrollMaximum } = documentMetrics();
  const viewportTravel = Math.max(mapHeight - viewportHeight, 0);
  const scrollRatio = scrollMaximum > 0 ? window.scrollY / scrollMaximum : 0;
  return clamp(scrollRatio, 0, 1) * viewportTravel;
}

function syncMinimap() {
  if (!minimap || minimap.clientHeight === 0) {
    return;
  }

  const pages = Array.from(viewer.querySelectorAll(".page"));
  const tiles = ensureTiles(pages);
  const trackHeight = minimap.clientHeight;
  const { scrollMaximum } = documentMetrics();

  // Keep page thumbnails contiguous and compress long documents to the available track height.
  const pageWidth = pages[0]?.getBoundingClientRect().width || 1;
  const thumbnailWidth = tiles[0]?.clientWidth || MINIMAP_THUMBNAIL_WIDTH;
  const widthScale = thumbnailWidth / pageWidth;
  const widthScaledHeights = pages.map((page) => page.getBoundingClientRect().height * widthScale);
  const widthScaledHeight = widthScaledHeights.reduce((total, height) => total + height, 0);
  const heightCompression = widthScaledHeight > trackHeight ? trackHeight / widthScaledHeight : 1;
  const scale = widthScale * heightCompression;
  const tileHeights = pages.map((page) => page.getBoundingClientRect().height * scale);
  const contentHeight = tileHeights.reduce((total, height) => total + height, 0);
  mapHeight = Math.min(trackHeight, contentHeight);
  const scrollRatio = scrollMaximum > 0 ? clamp(window.scrollY / scrollMaximum, 0, 1) : 0;

  let packedTop = 0;
  pages.forEach((page, index) => {
    const tile = tiles[index];
    const tileHeight = tileHeights[index];

    tile.style.top = `${packedTop}px`;
    tile.style.height = `${tileHeight}px`;
    packedTop += tileHeight;
  });

  viewportHeight = Math.min(
    mapHeight,
    Math.max(18, window.innerHeight * scale),
  );
  const viewportTravel = Math.max(mapHeight - viewportHeight, 0);
  const viewportTop = clamp(scrollRatio, 0, 1) * viewportTravel;

  minimapViewport.style.top = `${viewportTop}px`;
  minimapViewport.style.height = `${viewportHeight}px`;
  minimap.setAttribute("aria-valuemax", String(Math.round(scrollMaximum)));
  minimap.setAttribute("aria-valuenow", String(Math.round(window.scrollY)));
}

function waitForPageElements(expectedCount) {
  if (viewer.querySelectorAll(".page").length === expectedCount) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (viewer.querySelectorAll(".page").length !== expectedCount) {
        return;
      }

      observer.disconnect();
      resolve();
    });

    observer.observe(viewer, { childList: true });
  });
}

function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function resolveThumbnailSource() {
  if (chrome.mimeHandler?.getStreamInfo) {
    try {
      const streamInfo = await chrome.mimeHandler.getStreamInfo();
      const response = await fetch(streamInfo.streamUrl);
      if (!response.ok) {
        throw new Error(`Could not read PDF stream (${response.status}).`);
      }

      return { data: new Uint8Array(await response.arrayBuffer()) };
    } catch {
      if (!source) {
        return null;
      }
    }
  }

  if (!source) {
    return null;
  }

  const requestUrl = new URL(source);
  requestUrl.hash = "";
  return { url: requestUrl.href };
}

async function loadThumbnailDocument() {
  const resolvedSource = await resolveThumbnailSource();
  if (!resolvedSource) {
    return;
  }

  const documentOptions = {
    cMapUrl: extensionAssetUrl("node_modules/pdfjs-dist/cmaps/", "cmaps/"),
    cMapPacked: true,
    standardFontDataUrl: extensionAssetUrl(
      "node_modules/pdfjs-dist/standard_fonts/",
      "standard_fonts/",
    ),
    verbosity: VerbosityLevel.ERRORS,
    wasmUrl: extensionAssetUrl("node_modules/pdfjs-dist/wasm/", "wasm/"),
  };

  if (resolvedSource.data) {
    documentOptions.data = resolvedSource.data;
  } else {
    documentOptions.url = resolvedSource.url;
    documentOptions.withCredentials = true;
  }

  thumbnailDocument = await getDocument(documentOptions).promise;
  await waitForPageElements(thumbnailDocument.numPages);
  scheduleSync();
  await renderAllThumbnails();
}

async function renderThumbnail(pageNumber, generation) {
  const page = await thumbnailDocument.getPage(pageNumber);
  if (generation !== thumbnailGeneration) {
    page.cleanup();
    return null;
  }

  const baseViewport = page.getViewport({ scale: 1, rotation: thumbnailRotation });
  const viewport = page.getViewport({
    scale: MINIMAP_THUMBNAIL_WIDTH / Math.max(baseViewport.width, 1),
    rotation: thumbnailRotation,
  });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));

  try {
    await page.render({ canvasContext: context, viewport }).promise;
  } catch {
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  page.cleanup();
  return generation === thumbnailGeneration ? canvas : null;
}

async function renderAllThumbnails() {
  if (!thumbnailDocument) {
    return;
  }

  const generation = ++thumbnailGeneration;
  const pages = Array.from(viewer.querySelectorAll(".page"));
  if (pages.length !== thumbnailDocument.numPages) {
    return;
  }

  const tiles = ensureTiles(pages);
  const thumbnails = [];

  // Render the complete minimap off-DOM, then swap it in at once so loading never
  // appears as a thumbnail trail painting down the document.
  for (let pageNumber = 1; pageNumber <= thumbnailDocument.numPages; pageNumber += 1) {
    const canvas = await renderThumbnail(pageNumber, generation);
    if (!canvas || generation !== thumbnailGeneration) {
      return;
    }

    thumbnails.push(canvas);
    if (pageNumber % 4 === 0) {
      await yieldToBrowser();
    }
  }

  if (generation !== thumbnailGeneration) {
    return;
  }

  tiles.forEach((tile, index) => tile.replaceChildren(thumbnails[index]));
  scheduleSync();
}

function rerenderThumbnails(delta) {
  thumbnailRotation = (thumbnailRotation + delta + 360) % 360;
  if (thumbnailDocument) {
    void renderAllThumbnails();
  }
}

function scrollFromViewportTop(viewportTop) {
  const { scrollMaximum } = documentMetrics();
  const viewportTravel = Math.max(mapHeight - viewportHeight, 0);
  const ratio = viewportTravel > 0 ? clamp(viewportTop / viewportTravel, 0, 1) : 0;
  window.scrollTo({ top: ratio * scrollMaximum, behavior: "auto" });
}

function normalizedWheelDelta(event) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return event.deltaY * WHEEL_LINE_HEIGHT;
  }

  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * minimap.clientHeight;
  }

  return event.deltaY;
}

function pointerPosition(event) {
  const rect = minimap.getBoundingClientRect();
  return clamp(event.clientY - rect.top, 0, rect.height);
}

minimap.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) {
    return;
  }

  const y = pointerPosition(event);
  const currentTop = Number.parseFloat(minimapViewport.style.top) || 0;
  const currentBottom = currentTop + viewportHeight;

  dragging = true;
  dragOffset = y >= currentTop && y <= currentBottom ? y - currentTop : viewportHeight / 2;
  minimap.setPointerCapture(event.pointerId);
  scrollFromViewportTop(y - dragOffset);
  event.preventDefault();
});

minimap.addEventListener("pointermove", (event) => {
  if (!dragging) {
    return;
  }

  scrollFromViewportTop(pointerPosition(event) - dragOffset);
});

function endDrag(event) {
  if (!dragging) {
    return;
  }

  dragging = false;
  if (minimap.hasPointerCapture(event.pointerId)) {
    minimap.releasePointerCapture(event.pointerId);
  }
}

minimap.addEventListener("pointerup", endDrag);
minimap.addEventListener("pointercancel", endDrag);

minimap.addEventListener(
  "wheel",
  (event) => {
    const delta = normalizedWheelDelta(event);
    if (!delta) {
      return;
    }

    const viewportTop = viewportTopFromScrollPosition();
    scrollFromViewportTop(viewportTop + delta * MINIMAP_WHEEL_TRACK_SCALE);
    event.preventDefault();
  },
  { passive: false },
);

minimap.addEventListener("keydown", (event) => {
  const pageStep = Math.max(window.innerHeight - 80, 120);
  let target;

  if (event.key === "ArrowUp") {
    target = window.scrollY - 60;
  } else if (event.key === "ArrowDown") {
    target = window.scrollY + 60;
  } else if (event.key === "PageUp") {
    target = window.scrollY - pageStep;
  } else if (event.key === "PageDown") {
    target = window.scrollY + pageStep;
  } else if (event.key === "Home") {
    target = 0;
  } else if (event.key === "End") {
    target = documentMetrics().scrollMaximum;
  } else {
    return;
  }

  window.scrollTo({ top: target, behavior: "auto" });
  event.preventDefault();
});

rotateLeftButton?.addEventListener("click", () => rerenderThumbnails(-90));
rotateRightButton?.addEventListener("click", () => rerenderThumbnails(90));

const mutationObserver = new MutationObserver(scheduleSync);
mutationObserver.observe(viewer, { childList: true, subtree: true });

const resizeObserver = new ResizeObserver(scheduleSync);
resizeObserver.observe(viewer);

window.addEventListener("scroll", scheduleSync, { passive: true });
window.addEventListener("resize", scheduleSync);
window.addEventListener("pagehide", () => {
  thumbnailGeneration += 1;
  void thumbnailDocument?.destroy();
});

scheduleSync();
void loadThumbnailDocument();
