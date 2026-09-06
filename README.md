# PDF Viewer

A Chrome Manifest V3 extension that replaces the normal PDF tab with a local dark-mode PDF.js viewer and makes the current page shareable.

## Features

- On Chrome 151+, registers as the PDF MIME handler so the original `https://…pdf` URL stays in the address bar while the extension renders the document.
- Uses Chrome's already-received PDF stream instead of re-requesting the document URL.
- Falls back to the older extension-page redirect flow on Chrome versions that do not expose the MIME handler API.
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

## Build a standalone extension folder

```sh
npm run build
```

The standalone unpacked extension is written to `dist/`. You can also select `dist/` with **Load unpacked** if you want the packaged build instead of the source tree.

## Usage

Open a PDF normally. On Chrome 151+, the extension renders the intercepted PDF stream in place while Chrome keeps the original document URL visible in the address bar. Scroll to a page and click **Share page** to share or copy a link such as:

```text
https://example.com/document.pdf#page=42
```

On older Chrome versions, the extension retains the previous `chrome-extension://…?url=…` redirect as a compatibility fallback.

The toolbar also supports previous/next page navigation, direct page entry, and left/right arrow keys.
