const TOOLBAR_ROW_BREAKPOINT = 900;

const twoRowToolbar = window.matchMedia(`(max-width: ${TOOLBAR_ROW_BREAKPOINT}px)`);

function updateToolbarRows() {
  document.documentElement.classList.toggle("toolbar-two-rows", twoRowToolbar.matches);
}

updateToolbarRows();
twoRowToolbar.addEventListener("change", updateToolbarRows);
