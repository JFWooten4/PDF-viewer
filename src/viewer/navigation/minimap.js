const viewer = document.querySelector("#viewer");
const minimap = document.querySelector("#minimap");
const minimapPages = document.querySelector("#minimap-pages");
const minimapViewport = document.querySelector("#minimap-viewport");
const minimapToggle = document.querySelector("#show-minimap");

const MINIMAP_STORAGE_KEY = "pdf-viewer-show-minimap";
const MINIMAP_WHEEL_TRACK_SCALE = 0.55;
const WHEEL_LINE_HEIGHT = 16;

let syncFrame;
let dragging = false;
let dragOffset = 0;
let viewportHeight = 18;
let mapHeight = 0;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function minimapEnabled() {
  return !document.documentElement.classList.contains("minimap-disabled");
}

function setMinimapEnabled(enabled, persist = true) {
  document.documentElement.classList.toggle("minimap-disabled", !enabled);
  minimapToggle.checked = enabled;
  minimap.setAttribute("aria-hidden", String(!enabled));
  minimap.tabIndex = enabled ? 0 : -1;

  if (persist) {
    localStorage.setItem(MINIMAP_STORAGE_KEY, String(enabled));
  }

  if (enabled) {
    scheduleSync();
  }

  window.dispatchEvent(new Event("resize"));
}

function scheduleSync() {
  if (!minimapEnabled() || syncFrame) {
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

function syncThumbnail(page, tile) {
  const sourceCanvas = page.querySelector("canvas");
  if (!sourceCanvas || tile.sourceCanvas === sourceCanvas) {
    return;
  }

  let thumbnail = tile.querySelector("canvas");
  if (!thumbnail) {
    thumbnail = document.createElement("canvas");
    tile.append(thumbnail);
  }

  const thumbnailWidth = 80;
  const ratio = sourceCanvas.height / Math.max(sourceCanvas.width, 1);
  thumbnail.width = thumbnailWidth;
  thumbnail.height = Math.max(1, Math.round(thumbnailWidth * ratio));

  const context = thumbnail.getContext("2d", { alpha: false });
  context.drawImage(sourceCanvas, 0, 0, thumbnail.width, thumbnail.height);
  tile.sourceCanvas = sourceCanvas;
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
  const thumbnailWidth = tiles[0]?.clientWidth || 80;
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
    syncThumbnail(page, tile);
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

minimapToggle.addEventListener("change", () => {
  setMinimapEnabled(minimapToggle.checked);
});

const storedMinimapPreference = localStorage.getItem(MINIMAP_STORAGE_KEY);
setMinimapEnabled(storedMinimapPreference !== "false", false);

const mutationObserver = new MutationObserver(scheduleSync);
mutationObserver.observe(viewer, { childList: true, subtree: true });

const resizeObserver = new ResizeObserver(scheduleSync);
resizeObserver.observe(viewer);

window.addEventListener("scroll", scheduleSync, { passive: true });
window.addEventListener("resize", scheduleSync);

scheduleSync();
