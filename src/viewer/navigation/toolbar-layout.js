const TOOLBAR_ROW_BREAKPOINT = 900;
const TOOLBAR_HEIGHT = 52;
const PAGE_GAP = 24;

const twoRowToolbar = window.matchMedia(`(max-width: ${TOOLBAR_ROW_BREAKPOINT}px)`);
const pageNumberInput = document.querySelector("#page-number");
const viewer = document.querySelector("#viewer");

function updateToolbarRows() {
  document.documentElement.classList.toggle("toolbar-two-rows", twoRowToolbar.matches);
}

function directPageJump() {
  const pageNumber = Number.parseInt(pageNumberInput.value, 10);
  const pageMaximum = Number.parseInt(pageNumberInput.max, 10);
  if (!Number.isFinite(pageNumber) || !Number.isFinite(pageMaximum) || pageMaximum < 1) {
    return;
  }

  const targetPage = Math.min(Math.max(pageNumber, 1), pageMaximum);
  const pageElement = viewer.querySelector(`.page[data-page="${targetPage}"]`);
  if (!pageElement) {
    return;
  }

  const readableHeight = window.innerHeight - TOOLBAR_HEIGHT - PAGE_GAP * 2;
  const pageRect = pageElement.getBoundingClientRect();

  if (pageRect.height <= readableHeight) {
    pageElement.scrollIntoView({ behavior: "instant", block: "center" });
    return;
  }

  const pageTop = window.scrollY + pageRect.top;
  window.scrollTo({
    top: Math.max(0, pageTop - TOOLBAR_HEIGHT - PAGE_GAP),
    behavior: "instant",
  });
}

updateToolbarRows();
twoRowToolbar.addEventListener("change", updateToolbarRows);
pageNumberInput.addEventListener("change", directPageJump);
