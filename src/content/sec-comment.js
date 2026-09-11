(() => {
  const THEME_STORAGE_KEY = "pdf-viewer-theme";
  const SEC_COMMENT_DARK_MODE_KEY = "pdf-viewer-sec-comment-dark-mode";
  const STYLE_ID = "pdf-viewer-sec-comment-dark-style";
  const SELECTION_STYLE_ID = "pdf-viewer-sec-selection-style";
  const isCommentPage = /^\/comments\/.+\.html?$/i.test(window.location.pathname);

  const selectionStyles = `
    ::selection {
      background: Highlight !important;
      color: HighlightText !important;
      text-shadow: none !important;
    }
  `;

  function applySelectionStyle() {
    if (document.getElementById(SELECTION_STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = SELECTION_STYLE_ID;
    style.textContent = selectionStyles;
    (document.head || document.documentElement).append(style);
  }

  applySelectionStyle();

  if (!isCommentPage) {
    return;
  }

  const darkStyles = `
    :root {
      color-scheme: dark !important;
      --pdf-viewer-sec-bg: #0b0b0c;
      --pdf-viewer-sec-text: #f3f4f6;
      --pdf-viewer-sec-muted: #b8b8bd;
      --pdf-viewer-sec-border: #36363a;
      --pdf-viewer-sec-link: #8ab4f8;
      background: var(--pdf-viewer-sec-bg) !important;
    }

    html,
    body {
      background: var(--pdf-viewer-sec-bg) !important;
      color: var(--pdf-viewer-sec-text) !important;
    }

    body,
    pre,
    code,
    p,
    div,
    span,
    table,
    tbody,
    thead,
    tfoot,
    tr,
    td,
    th,
    blockquote {
      background-color: transparent !important;
      color: inherit !important;
    }

    a,
    a:link,
    a:visited {
      color: var(--pdf-viewer-sec-link) !important;
    }

    hr,
    table,
    td,
    th {
      border-color: var(--pdf-viewer-sec-border) !important;
    }

    input,
    button,
    select,
    textarea {
      color-scheme: dark !important;
    }
  `;

  function applyDarkMode(enabled) {
    const existing = document.getElementById(STYLE_ID);

    if (!enabled) {
      existing?.remove();
      return;
    }

    if (existing) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = darkStyles;
    (document.head || document.documentElement).append(style);
  }

  async function refresh() {
    const stored = await chrome.storage.local.get([
      THEME_STORAGE_KEY,
      SEC_COMMENT_DARK_MODE_KEY,
    ]);
    const theme = stored[THEME_STORAGE_KEY] === "light" ? "light" : "dark";
    const enabled = stored[SEC_COMMENT_DARK_MODE_KEY] !== false;
    applyDarkMode(enabled && theme === "dark");
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (
      areaName === "local" &&
      (changes[THEME_STORAGE_KEY] || changes[SEC_COMMENT_DARK_MODE_KEY])
    ) {
      void refresh();
    }
  });

  void refresh();
})();
