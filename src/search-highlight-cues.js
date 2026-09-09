const viewer = document.querySelector("#viewer");
const searchInput = document.querySelector("#search-input");
const searchCount = document.querySelector("#search-count");
const ARROW_CLASS = "search-line-arrow";
const ACTIVE_CLASS = "search-highlight-active";

let arrowFrame;
let previousPosition;
let previousTotal;
let activePageNumber;
let activeOrdinal = 0;

function parseSearchPosition() {
  const match = searchCount.textContent.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  if (!match) {
    return null;
  }

  const position = Number.parseInt(match[1], 10);
  const total = Number.parseInt(match[2], 10);
  if (position < 1 || total < 1 || position > total) {
    return null;
  }

  return { position, total };
}

function removeSearchCues() {
  for (const highlight of viewer.querySelectorAll(`.${ACTIVE_CLASS}`)) {
    highlight.classList.remove(ACTIVE_CLASS);
  }

  for (const arrow of viewer.querySelectorAll(`.${ARROW_CLASS}`)) {
    arrow.remove();
  }
}

function searchDirection(position, total) {
  if (previousPosition === undefined || previousTotal !== total) {
    return 0;
  }

  if (position === (previousPosition % total) + 1) {
    return 1;
  }

  if (position === ((previousPosition - 2 + total) % total) + 1) {
    return -1;
  }

  return 0;
}

function refreshActiveSearchCue() {
  arrowFrame = undefined;

  const searchPosition = parseSearchPosition();
  const page = viewer.querySelector(".page.search-match-page");
  const highlights = page ? [...page.querySelectorAll(".search-highlight")] : [];
  const pageNumber = Number.parseInt(page?.dataset.page ?? "", 10);
  const direction = searchPosition
    ? searchDirection(searchPosition.position, searchPosition.total)
    : 0;

  removeSearchCues();

  if (!searchPosition || !page || !highlights.length || Number.isNaN(pageNumber)) {
    return;
  }

  if (activePageNumber === pageNumber) {
    if (direction === 1) {
      activeOrdinal = (activeOrdinal + 1) % highlights.length;
    } else if (direction === -1) {
      activeOrdinal = (activeOrdinal - 1 + highlights.length) % highlights.length;
    } else if (previousPosition !== searchPosition.position) {
      activeOrdinal = 0;
    }
  } else {
    activeOrdinal = direction === -1 ? highlights.length - 1 : 0;
  }

  activeOrdinal = Math.min(activeOrdinal, highlights.length - 1);
  const activeHighlight = highlights[activeOrdinal];
  activeHighlight.classList.add(ACTIVE_CLASS);

  const pageRect = page.getBoundingClientRect();
  const rect = activeHighlight.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    const arrow = document.createElement("span");
    arrow.className = ARROW_CLASS;
    arrow.style.top = `${rect.top - pageRect.top + rect.height / 2}px`;
    arrow.setAttribute("aria-hidden", "true");
    page.append(arrow);
  }

  previousPosition = searchPosition.position;
  previousTotal = searchPosition.total;
  activePageNumber = pageNumber;
}

function scheduleSearchCueRefresh() {
  if (arrowFrame) {
    return;
  }

  arrowFrame = requestAnimationFrame(refreshActiveSearchCue);
}

function resetSearchCueTracking() {
  previousPosition = undefined;
  previousTotal = undefined;
  activePageNumber = undefined;
  activeOrdinal = 0;
  scheduleSearchCueRefresh();
}

function nodeContainsSearchHighlight(node) {
  return (
    node instanceof Element &&
    (node.matches(".text-layer, .search-highlight") ||
      Boolean(node.querySelector(".text-layer, .search-highlight")))
  );
}

const viewerObserver = new MutationObserver((mutations) => {
  const searchCueChanged = mutations.some((mutation) => {
    if (mutation.type === "attributes") {
      return mutation.target instanceof Element && mutation.target.matches(".page");
    }

    if (mutation.type !== "childList") {
      return false;
    }

    if (mutation.target instanceof Element && mutation.target.closest(".text-layer")) {
      return true;
    }

    return [...mutation.addedNodes, ...mutation.removedNodes].some(nodeContainsSearchHighlight);
  });

  if (searchCueChanged) {
    scheduleSearchCueRefresh();
  }
});

viewerObserver.observe(viewer, {
  attributes: true,
  attributeFilter: ["class"],
  childList: true,
  subtree: true,
});

const countObserver = new MutationObserver(scheduleSearchCueRefresh);
countObserver.observe(searchCount, { childList: true, characterData: true, subtree: true });

searchInput.addEventListener("input", resetSearchCueTracking);
window.addEventListener("resize", scheduleSearchCueRefresh);
scheduleSearchCueRefresh();
