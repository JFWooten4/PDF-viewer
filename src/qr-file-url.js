import encodeQR from "../node_modules/qr/index.js";

const qrButton = document.querySelector("#qr-file-url");
const qrDialog = document.querySelector("#qr-file-url-dialog");
const qrCloseButton = document.querySelector("#qr-file-url-close");
const qrGraphic = document.querySelector("#qr-file-url-graphic");
const qrUrl = document.querySelector("#qr-file-url-text");
const toolsButton = document.querySelector("#tools-button");
const toolsMenu = document.querySelector("#tools-menu");
const source = new URLSearchParams(window.location.search).get("url");

async function resolveOriginalFileUrl() {
  if (chrome.mimeHandler?.getStreamInfo) {
    try {
      const streamInfo = await chrome.mimeHandler.getStreamInfo();
      if (streamInfo?.originalUrl) {
        return new URL(streamInfo.originalUrl).href;
      }
    } catch {
      // Fall back to the explicit viewer URL below.
    }
  }

  return source ? new URL(source).href : null;
}

function closeToolsMenu() {
  toolsMenu.hidden = true;
  toolsButton.setAttribute("aria-expanded", "false");
}

function closeDialog() {
  qrDialog.close();
  qrButton.focus();
}

qrButton.addEventListener("click", async () => {
  closeToolsMenu();

  const fileUrl = await resolveOriginalFileUrl();
  if (!fileUrl) {
    return;
  }

  try {
    qrGraphic.innerHTML = encodeQR(fileUrl, "svg", {
      border: 4,
      ecc: "medium",
    });
    qrUrl.textContent = fileUrl;
    qrDialog.showModal();
  } catch {
    qrGraphic.replaceChildren();
    qrUrl.textContent = "Could not generate a QR code for this file URL.";
    qrDialog.showModal();
  }
});

qrCloseButton.addEventListener("click", closeDialog);

qrDialog.addEventListener("click", (event) => {
  if (event.target === qrDialog) {
    closeDialog();
  }
});
