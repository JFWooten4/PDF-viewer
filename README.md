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

## Build

```sh
npm install
npm run build
```

The unpacked extension is written to `dist/`.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository's `dist/` directory.

For local `file://` PDFs, enable **Allow access to file URLs** for the extension in Chrome's extension details.

## Usage

Open a PDF normally. The extension redirects the tab to its own viewer while retaining the original document URL internally. Scroll to a page and click **Share page** to share or copy a link such as:

```text
https://example.com/document.pdf#page=42
```

The toolbar also supports previous/next page navigation, direct page entry, and left/right arrow keys.
