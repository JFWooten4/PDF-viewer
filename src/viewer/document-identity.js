const params = new URLSearchParams(window.location.search);
const explicitSource = params.get("url");

function fileNameFromUrl(value) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const encodedName = url.pathname.split("/").filter(Boolean).pop();
    if (!encodedName) {
      return null;
    }

    let fileName = decodeURIComponent(encodedName);
    if (!fileName.toLowerCase().endsWith(".pdf")) {
      fileName += ".pdf";
    }

    return fileName;
  } catch {
    return null;
  }
}

async function resolveOriginalUrl() {
  if (chrome.mimeHandler?.getStreamInfo) {
    try {
      const streamInfo = await chrome.mimeHandler.getStreamInfo();
      if (streamInfo?.originalUrl) {
        return streamInfo.originalUrl;
      }
    } catch {
      // Fall through to the explicit viewer URL when MIME stream info is unavailable.
    }
  }

  return explicitSource;
}

const fileName = fileNameFromUrl(await resolveOriginalUrl());
if (fileName) {
  document.title = fileName;
}
