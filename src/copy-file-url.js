const copyFileUrlButton = document.querySelector("#copy-file-url");
const source = new URLSearchParams(window.location.search).get("url");
const defaultTitle = copyFileUrlButton.title;
let titleResetTimer;

async function resolveOriginalFileUrl() {
  if (globalThis.chrome?.mimeHandler?.getStreamInfo) {
    try {
      const streamInfo = await chrome.mimeHandler.getStreamInfo();
      if (streamInfo?.originalUrl) {
        return new URL(streamInfo.originalUrl).href;
      }
    } catch {
      // Explicit viewer URLs remain usable outside the MIME handler.
    }
  }

  return source ? new URL(source).href : null;
}

copyFileUrlButton.addEventListener("click", async () => {
  try {
    const fileUrl = await resolveOriginalFileUrl();
    if (!fileUrl) {
      throw new Error("File URL unavailable");
    }
    await navigator.clipboard.writeText(fileUrl);
    clearTimeout(titleResetTimer);
    copyFileUrlButton.title = "Copied file URL";
    copyFileUrlButton.setAttribute("aria-label", copyFileUrlButton.title);
    titleResetTimer = setTimeout(() => {
      copyFileUrlButton.title = defaultTitle;
      copyFileUrlButton.setAttribute("aria-label", defaultTitle);
    }, 1400);
  } catch {
    clearTimeout(titleResetTimer);
    copyFileUrlButton.title = "Could not copy file URL. Try again.";
    copyFileUrlButton.setAttribute("aria-label", copyFileUrlButton.title);
  }
});
