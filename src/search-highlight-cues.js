const viewer = document.querySelector("#viewer");
const ARROW_CLASS = "search-line-arrow";

let arrowFrame;

function refreshPageArrows(page) {
  for (const arrow of page.querySelectorAll(`:scope > .${ARROW_CLASS}`)) {
    arrow.remove();
  }

  const highlights = [...page.querySelectorAll(".search-highlight")];
  if (!highlights.length) {
    return;
  }

  const pageRect = page.getBoundingClientRect();
  const lineCenters = [];

  for (const highlight of highlights) {
    const rect = highlight.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      continue;
    }

    const centerY = rect.top - pageRect.top + rect.height / 2;
    const sameLine = lineCenters.some(
      (existingCenter) => Math.abs(existingCenter - centerY) <= Math.max(2, rect.height * 0.35),
    );

    if (sameLine) {
      continue;
    }

    lineCenters.push(centerY);
    const arrow = document.createElement("span");
    arrow.className = ARROW_CLASS;
    arrow.style.top = `${centerY}px`;
    arrow.setAttribute("aria-hidden", "true");
    page.append(arrow);
  }
}

function refreshSearchLineArrows() {
  arrowFrame = undefined;
  for (const page of viewer.querySelectorAll(".page")) {
    refreshPageArrows(page);
  }
}

function scheduleSearchLineArrowRefresh() {
  if (arrowFrame) {
    return;
  }

  arrowFrame = requestAnimationFrame(refreshSearchLineArrows);
}

function nodeContainsSearchHighlight(node) {
  return (
    node instanceof Element &&
    (node.matches(".text-layer, .search-highlight") ||
      Boolean(node.querySelector(".text-layer, .search-highlight")))
  );
}

const observer = new MutationObserver((mutations) => {
  const searchHighlightsChanged = mutations.some((mutation) => {
    if (mutation.type !== "childList") {
      return false;
    }

    if (mutation.target instanceof Element && mutation.target.closest(".text-layer")) {
      return true;
    }

    return [...mutation.addedNodes, ...mutation.removedNodes].some(nodeContainsSearchHighlight);
  });

  if (searchHighlightsChanged) {
    scheduleSearchLineArrowRefresh();
  }
});

observer.observe(viewer, { childList: true, subtree: true });
window.addEventListener("resize", scheduleSearchLineArrowRefresh);
scheduleSearchLineArrowRefresh();
