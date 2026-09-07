const viewer = document.querySelector("#viewer");
const minimap = document.querySelector("#minimap");
const minimapPages = document.querySelector("#minimap-pages");
const minimapViewport = document.querySelector("#minimap-viewport");

let syncFrame;
let dragging = false;
let dragOffset = 0;
let viewportHeight = 18;

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

function syncMinimap() {
  if (!minimap || minimap.clientHeight === 0) {
    return;
  }

  const pages = Array.from(viewer.querySelectorAll(".page"));
  const tiles = ensureTiles(pages);
  const trackHeight = minimap.clientHeight;
  const { documentHeight, scrollMaximum } = documentMetrics();

  pages.forEach((page, index) => {
    const tile = tiles[index];
    const rect = page.getBoundingClientRect();
    const documentTop = rect.top + window.scrollY;
    const tileTop = (documentTop / documentHeight) * trackHeight;
    const tileHeight = Math.max(1, (rect.height / documentHeight) * trackHeight);

    tile.style.top = `${tileTop}px`;
    tile.style.height = `${tileHeight}px`;
    syncThumbnail(page, tile);
  });

  viewportHeight = Math.min(
    trackHeight,
    Math.max(18, (window.innerHeight / documentHeight) * trackHeight),
  );
  const viewportTravel = Math.max(trackHeight - viewportHeight, 0);
  const scrollRatio = scrollMaximum > 0 ? window.scrollY / scrollMaximum : 0;
  const viewportTop = clamp(scrollRatio, 0, 1) * viewportTravel;

  minimapViewport.style.top = `${viewportTop}px`;
  minimapViewport.style.height = `${viewportHeight}px`;
  minimap.setAttribute("aria-valuemax", String(Math.round(scrollMaximum)));
  minimap.setAttribute("aria-valuenow", String(Math.round(window.scrollY)));
}

function scrollFromViewportTop(viewportTop) {
  const trackHeight = minimap.clientHeight;
  const { scrollMaximum } = documentMetrics();
  const viewportTravel = Math.max(trackHeight - viewportHeight, 0);
  const ratio = viewportTravel > 0 ? clamp(viewportTop / viewportTravel, 0, 1) : 0;
  window.scrollTo({ top: ratio * scrollMaximum, behavior: "auto" });
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

const mutationObserver = new MutationObserver(scheduleSync);
mutationObserver.observe(viewer, { childList: true, subtree: true });

const resizeObserver = new ResizeObserver(scheduleSync);
resizeObserver.observe(viewer);

window.addEventListener("scroll", scheduleSync, { passive: true });
window.addEventListener("resize", scheduleSync);

scheduleSync();
