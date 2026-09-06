const THEME_STORAGE_KEY = "pdf-viewer-theme";
const SEC_COMMENT_DARK_MODE_KEY = "pdf-viewer-sec-comment-dark-mode";

const toolsMenu = document.querySelector("#tools-menu");

function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function syncThemePreference() {
  void chrome.storage.local.set({ [THEME_STORAGE_KEY]: currentTheme() });
}

function renderSecCommentSetting(button, enabled) {
  button.setAttribute("aria-pressed", String(enabled));
  button.replaceChildren();
  button.append(document.createTextNode(enabled ? "✓ " : "○ "));

  const label = document.createElement("span");
  label.textContent = "Darken SEC HTML comments";
  button.append(label);
}

async function addSecCommentSetting() {
  if (!toolsMenu) {
    return;
  }

  const stored = await chrome.storage.local.get(SEC_COMMENT_DARK_MODE_KEY);
  let enabled = stored[SEC_COMMENT_DARK_MODE_KEY] !== false;

  const separator = document.createElement("div");
  separator.className = "menu-separator";
  separator.setAttribute("role", "separator");

  const button = document.createElement("button");
  button.id = "sec-comment-dark-mode";
  button.className = "tool-button";
  button.type = "button";
  button.setAttribute("role", "menuitemcheckbox");
  renderSecCommentSetting(button, enabled);

  button.addEventListener("click", async () => {
    enabled = !enabled;
    await chrome.storage.local.set({ [SEC_COMMENT_DARK_MODE_KEY]: enabled });
    renderSecCommentSetting(button, enabled);
  });

  toolsMenu.append(separator, button);
}

const themeObserver = new MutationObserver((mutations) => {
  if (mutations.some((mutation) => mutation.attributeName === "data-theme")) {
    syncThemePreference();
  }
});

themeObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
});

syncThemePreference();
void addSecCommentSetting();

const TOOLBAR_HEIGHT = 52;
const PAGE_HORIZONTAL_GUTTER = 32;
const PAGE_VERTICAL_GUTTER = 48;
const DEFAULT_MAX_PAGE_WIDTH = 1100;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;

let zoomMode = "fit-width";
let zoomScale = 1;
let zoomRenderTimer;
let zoomResizeTimer;

function addZoomStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .zoom-control {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      height: 34px;
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--control-bg);
      color: var(--text);
    }

    .zoom-button,
    .zoom-level {
      height: 32px;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--text);
      cursor: pointer;
    }

    .zoom-button {
      width: 34px;
      font-size: 18px;
      line-height: 1;
    }

    .zoom-level {
      width: 56px;
      color: var(--muted);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }

    .fit-page-button {
      border-left: 1px solid var(--border);
      font-size: 17px;
    }

    .zoom-button:hover:not(:disabled),
    .zoom-level:hover:not(:disabled),
    .fit-page-button[aria-pressed="true"] {
      background: var(--control-hover);
      color: var(--text);
    }

    .zoom-button:disabled,
    .zoom-level:disabled {
      cursor: default;
      opacity: 0.45;
    }

    .zoom-button:focus-visible,
    .zoom-level:focus-visible {
      position: relative;
      z-index: 1;
      outline: 2px solid var(--search-focus-border);
      outline-offset: -2px;
    }

    .viewer {
      width: max-content;
      min-width: 100%;
    }

    .page {
      flex: 0 0 auto;
      width: var(--page-width, min(1100px, calc(100vw - 32px)));
      max-width: none;
    }

    @media (max-width: 720px) {
      .zoom-button {
        width: 30px;
      }

      .zoom-level {
        width: 48px;
      }
    }

    @media print {
      .viewer {
        width: auto;
        min-width: 0;
      }

      .page {
        width: 100% !important;
      }
    }
  `;
  document.head.append(style);
}

function createZoomControls() {
  const nextPageButton = document.querySelector("#next-page");
  if (!nextPageButton) {
    return null;
  }

  const control = document.createElement("div");
  control.className = "zoom-control";
  control.setAttribute("role", "group");
  control.setAttribute("aria-label", "Zoom controls");

  const zoomOutButton = document.createElement("button");
  zoomOutButton.id = "zoom-out";
  zoomOutButton.className = "zoom-button";
  zoomOutButton.type = "button";
  zoomOutButton.textContent = "−";
  zoomOutButton.title = "Zoom out";
  zoomOutButton.setAttribute("aria-label", "Zoom out");

  const zoomLevelButton = document.createElement("button");
  zoomLevelButton.id = "zoom-level";
  zoomLevelButton.className = "zoom-level";
  zoomLevelButton.type = "button";
  zoomLevelButton.textContent = "100%";
  zoomLevelButton.title = "Fit width";
  zoomLevelButton.setAttribute("aria-label", "Zoom 100%. Reset to fit width");

  const zoomInButton = document.createElement("button");
  zoomInButton.id = "zoom-in";
  zoomInButton.className = "zoom-button";
  zoomInButton.type = "button";
  zoomInButton.textContent = "+";
  zoomInButton.title = "Zoom in";
  zoomInButton.setAttribute("aria-label", "Zoom in");

  const fitPageButton = document.createElement("button");
  fitPageButton.id = "fit-page";
  fitPageButton.className = "zoom-button fit-page-button";
  fitPageButton.type = "button";
  fitPageButton.textContent = "⛶";
  fitPageButton.title = "Fit page to viewport";
  fitPageButton.setAttribute("aria-label", "Fit page to viewport");
  fitPageButton.setAttribute("aria-pressed", "false");

  control.append(zoomOutButton, zoomLevelButton, zoomInButton, fitPageButton);
  nextPageButton.insertAdjacentElement("afterend", control);

  return {
    control,
    zoomOutButton,
    zoomLevelButton,
    zoomInButton,
    fitPageButton,
  };
}

function fitWidthBase() {
  return Math.max(
    160,
    Math.min(DEFAULT_MAX_PAGE_WIDTH, window.innerWidth - PAGE_HORIZONTAL_GUTTER),
  );
}

function viewportPageWidth() {
  return Math.max(160, window.innerWidth - PAGE_HORIZONTAL_GUTTER);
}

function viewportPageHeight() {
  return Math.max(160, window.innerHeight - TOOLBAR_HEIGHT - PAGE_VERTICAL_GUTTER);
}

function pageRatio(pageElement) {
  const rect = pageElement.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return rect.width / rect.height;
  }

  const [width, height] = getComputedStyle(pageElement)
    .aspectRatio.split("/")
    .map((value) => Number.parseFloat(value.trim()));

  if (Number.isFinite(width) && Number.isFinite(height) && height > 0) {
    return width / height;
  }

  return 8.5 / 11;
}

function targetPageWidth(pageElement) {
  const baseWidth = fitWidthBase();

  if (zoomMode === "fit-page") {
    return Math.min(viewportPageWidth(), viewportPageHeight() * pageRatio(pageElement));
  }

  if (zoomMode === "custom") {
    return baseWidth * zoomScale;
  }

  return baseWidth;
}

function applyPageZoom(pageElement) {
  pageElement.style.setProperty("--page-width", `${Math.max(160, targetPageWidth(pageElement))}px`);
}

function applyZoomLayout() {
  for (const pageElement of document.querySelectorAll(".page")) {
    applyPageZoom(pageElement);
  }
}

function currentRelativeScale() {
  const currentPage = document.querySelector(".page[aria-label='Page " + document.querySelector("#page-number")?.value + "']")
    || document.querySelector(".page");

  if (!currentPage) {
    return zoomMode === "custom" ? zoomScale : 1;
  }

  return currentPage.getBoundingClientRect().width / fitWidthBase();
}

const zoomControls = createZoomControls();

function syncZoomControls() {
  if (!zoomControls) {
    return;
  }

  const scale = Math.max(0, currentRelativeScale());
  const percentage = Math.round(scale * 100);

  zoomControls.zoomLevelButton.textContent = `${percentage}%`;
  zoomControls.zoomLevelButton.title = zoomMode === "fit-width"
    ? "Fit width"
    : "Reset zoom to fit width";
  zoomControls.zoomLevelButton.setAttribute(
    "aria-label",
    `Zoom ${percentage}%. Reset to fit width`,
  );
  zoomControls.zoomOutButton.disabled = scale <= MIN_ZOOM + 0.001;
  zoomControls.zoomInButton.disabled = scale >= MAX_ZOOM - 0.001;
  zoomControls.fitPageButton.setAttribute("aria-pressed", String(zoomMode === "fit-page"));
}

function forceViewerRerender() {
  const page = document.querySelector(".page");
  const rotateRightButton = document.querySelector("#rotate-right");
  const rotateLeftButton = document.querySelector("#rotate-left");

  if (!page || !rotateRightButton || !rotateLeftButton) {
    return;
  }

  rotateRightButton.click();
  rotateLeftButton.click();
}

function scheduleViewerRerender() {
  clearTimeout(zoomRenderTimer);
  zoomRenderTimer = setTimeout(() => {
    forceViewerRerender();
    requestAnimationFrame(syncZoomControls);
  }, 80);
}

function setCustomZoom(scale) {
  zoomMode = "custom";
  zoomScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
  applyZoomLayout();
  syncZoomControls();
  scheduleViewerRerender();
}

function zoomBy(delta) {
  const currentScale = zoomMode === "custom" ? zoomScale : currentRelativeScale();
  const nextScale = Math.round((currentScale + delta) * 10) / 10;
  setCustomZoom(nextScale);
}

function fitWidth() {
  zoomMode = "fit-width";
  zoomScale = 1;
  applyZoomLayout();
  syncZoomControls();
  scheduleViewerRerender();
}

function fitPageToViewport() {
  zoomMode = "fit-page";
  applyZoomLayout();
  syncZoomControls();
  scheduleViewerRerender();
}

if (zoomControls) {
  addZoomStyles();
  zoomControls.zoomOutButton.addEventListener("click", () => zoomBy(-ZOOM_STEP));
  zoomControls.zoomInButton.addEventListener("click", () => zoomBy(ZOOM_STEP));
  zoomControls.zoomLevelButton.addEventListener("click", fitWidth);
  zoomControls.fitPageButton.addEventListener("click", fitPageToViewport);

  document.addEventListener(
    "keydown",
    (event) => {
      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        event.stopPropagation();
        zoomBy(ZOOM_STEP);
      } else if (event.key === "-") {
        event.preventDefault();
        event.stopPropagation();
        zoomBy(-ZOOM_STEP);
      } else if (event.key === "0") {
        event.preventDefault();
        event.stopPropagation();
        fitWidth();
      }
    },
    true,
  );

  const viewer = document.querySelector("#viewer");
  if (viewer) {
    const pageObserver = new MutationObserver((mutations) => {
      let addedPage = false;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement && node.matches(".page")) {
            applyPageZoom(node);
            addedPage = true;
          }
        }
      }

      if (addedPage) {
        requestAnimationFrame(syncZoomControls);
      }
    });

    pageObserver.observe(viewer, { childList: true });
  }

  window.addEventListener("resize", () => {
    clearTimeout(zoomResizeTimer);
    zoomResizeTimer = setTimeout(() => {
      applyZoomLayout();
      syncZoomControls();
      scheduleViewerRerender();
    }, 120);
  });

  applyZoomLayout();
  syncZoomControls();
}
