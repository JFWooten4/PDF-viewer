# PDF Viewer

A Chrome Manifest V3 extension that replaces the normal PDF tab with a local PDF.js viewer and makes the current page shareable.

## Features

- Automatically opens URLs ending in `.pdf` in the extension viewer.
- Also detects main-frame responses with `Content-Type: application/pdf`, so PDF endpoints do not need a `.pdf` suffix.
- Renders PDFs locally with bundled PDF.js assets; no remotely hosted executable code is used.
- Supports dark and light viewing modes, remembers the selected theme, and shows Celestia in dark mode and Luna in light mode.
- Tracks the page currently centered in the viewport.
- Copies the original document URL as `#page=<current page>` silently when the mark is clicked.
- Honors an existing `#page=N` fragment when opening a document.
- Places Download beside the page-link icon and keeps rotate left/right and print in the **More tools** menu.
- Keeps the More tools menu open across repeated rotate actions.
- Lazy-renders nearby pages so long filings do not render every page up front.

## Load directly in Chrome

Install dependencies once:

```sh
npm install
```

Then:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the repository root — the folder containing `manifest.json`.

The root manifest points directly at the source files and local `node_modules`, so a separate build step is not required for normal local development.

For local `file://` PDFs, enable **Allow access to file URLs** for the extension in Chrome's extension details.

## Build a standalone extension folder

```sh
npm run build
```

The standalone unpacked extension is written to `dist/`. You can also select `dist/` with **Load unpacked** if you want the packaged build instead of the source tree.

## Usage

Open a PDF normally. The extension redirects the tab to its own viewer while retaining the original document URL internally. Scroll to a page and click the page-link icon to copy a link such as:

```text
https://example.com/document.pdf#page=42
```

The toolbar also supports previous/next page navigation, direct page entry, theme switching, page-link copying, download, and a compact More tools menu for rotate and print.
