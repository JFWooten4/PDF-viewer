# PDF Viewer

A Chrome Manifest V3 extension that replaces the normal PDF tab with a local dark-mode PDF.js viewer and makes the current page shareable.

## Features

- Automatically opens URLs ending in `.pdf` in the extension viewer.
- Also detects main-frame responses with `Content-Type: application/pdf`, so PDF endpoints do not need a `.pdf` suffix.
- Renders PDFs locally with bundled PDF.js assets; no remotely hosted code is used.
- Applies a dark-mode transform to rendered PDF pages.
- Tracks the page currently centered in the viewport.
- **Share page** shares the original document URL as `#page=<current page>`; when the Web Share API is unavailable, the link is copied to the clipboard.
- Honors an existing `#page=N` fragment when opening a document.
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

Open a PDF normally. The extension redirects the tab to its own viewer while retaining the original document URL internally. Scroll to a page and click **Share page** to share or copy a link such as:

```text
https://example.com/document.pdf#page=42
```

The toolbar also supports previous/next page navigation, direct page entry, and left/right arrow keys.
