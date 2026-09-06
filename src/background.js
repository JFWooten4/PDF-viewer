const VIEWER_URL = chrome.runtime.getURL("viewer.html");

function isViewerUrl(url) {
  return typeof url === "string" && url.startsWith(VIEWER_URL);
}

function isLikelyPdfUrl(url) {
  if (!url || isViewerUrl(url)) {
    return false;
  }

  try {
    return /\.pdf$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function viewerUrlFor(pdfUrl) {
  return `${VIEWER_URL}?url=${encodeURIComponent(pdfUrl)}`;
}

async function openInViewer(tabId, pdfUrl) {
  if (tabId < 0 || !pdfUrl || isViewerUrl(pdfUrl)) {
    return;
  }

  try {
    await chrome.tabs.update(tabId, { url: viewerUrlFor(pdfUrl) });
  } catch {
    // The tab may have closed or navigated before the redirect completed.
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (isLikelyPdfUrl(changeInfo.url)) {
    void openInViewer(tabId, changeInfo.url);
  }
});

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0 || isViewerUrl(details.url)) {
      return;
    }

    const contentType = details.responseHeaders?.find(
      (header) => header.name.toLowerCase() === "content-type",
    )?.value;

    if (contentType?.toLowerCase().includes("application/pdf")) {
      void openInViewer(details.tabId, details.url);
    }
  },
  { urls: ["<all_urls>"], types: ["main_frame"] },
  ["responseHeaders"],
);

chrome.action.onClicked.addListener((tab) => {
  if (tab.id != null && tab.url && !isViewerUrl(tab.url)) {
    void openInViewer(tab.id, tab.url);
  }
});
