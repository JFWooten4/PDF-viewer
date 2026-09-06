const PRESERVE_IMAGE_COLORS_STORAGE_KEY = "pdf-viewer-preserve-image-colors";
const IMAGE_EDGE_SOFTNESS_CSS_PX = 4;
const preserveImageColorsToggle = document.querySelector("#preserve-image-colors");

function savedPreference() {
  const stored = localStorage.getItem(PRESERVE_IMAGE_COLORS_STORAGE_KEY);
  return stored === null ? true : stored === "true";
}

function applyPreference(enabled) {
  preserveImageColorsToggle.checked = enabled;
  document.documentElement.dataset.preserveImageColors = String(enabled);
}

function softenImageOverlay(overlay) {
  if (!(overlay instanceof HTMLCanvasElement) || overlay.dataset.edgeSoftened === "true") {
    return;
  }

  overlay.dataset.edgeSoftened = "true";

  if (!overlay.width || !overlay.height) {
    return;
  }

  const source = document.createElement("canvas");
  const sourceContext = source.getContext("2d", { alpha: true });
  const mask = document.createElement("canvas");
  const maskContext = mask.getContext("2d", { alpha: true });
  const overlayContext = overlay.getContext("2d", { alpha: true });

  if (!sourceContext || !maskContext || !overlayContext) {
    return;
  }

  source.width = overlay.width;
  source.height = overlay.height;
  mask.width = overlay.width;
  mask.height = overlay.height;
  sourceContext.drawImage(overlay, 0, 0);

  const cssWidth = Number.parseFloat(overlay.style.width) || overlay.width;
  const renderScale = overlay.width / cssWidth;
  const blurRadius = Math.max(1, IMAGE_EDGE_SOFTNESS_CSS_PX * renderScale);

  maskContext.filter = `blur(${blurRadius}px)`;
  maskContext.drawImage(source, 0, 0);
  maskContext.filter = "none";
  maskContext.globalCompositeOperation = "source-in";
  maskContext.fillStyle = "#fff";
  maskContext.fillRect(0, 0, mask.width, mask.height);

  overlayContext.clearRect(0, 0, overlay.width, overlay.height);
  overlayContext.drawImage(source, 0, 0);
  overlayContext.globalCompositeOperation = "destination-in";
  overlayContext.drawImage(mask, 0, 0);
  overlayContext.globalCompositeOperation = "source-over";
}

function softenImageOverlaysIn(node) {
  if (!(node instanceof Element)) {
    return;
  }

  if (node.matches(".page-image-overlay")) {
    softenImageOverlay(node);
  }

  for (const overlay of node.querySelectorAll(".page-image-overlay")) {
    softenImageOverlay(overlay);
  }
}

applyPreference(savedPreference());

document.querySelectorAll(".page-image-overlay").forEach(softenImageOverlay);

const imageOverlayObserver = new MutationObserver((records) => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      softenImageOverlaysIn(node);
    }
  }
});
imageOverlayObserver.observe(document.documentElement, { childList: true, subtree: true });

preserveImageColorsToggle.addEventListener("change", () => {
  const enabled = preserveImageColorsToggle.checked;
  localStorage.setItem(PRESERVE_IMAGE_COLORS_STORAGE_KEY, String(enabled));
  applyPreference(enabled);
});
