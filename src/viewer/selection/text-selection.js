const textLayers = new Map();
let pointerDown = false;

function textLayersInNode(node) {
  if (!(node instanceof Element)) {
    return [];
  }

  const layers = [];
  if (node.matches(".text-layer")) {
    layers.push(node);
  }
  layers.push(...node.querySelectorAll(".text-layer"));
  return layers;
}

function resetTextLayer(textLayer, endOfContent) {
  if (!textLayer.isConnected) {
    textLayers.delete(textLayer);
    return;
  }

  textLayer.append(endOfContent);
  endOfContent.style.width = "";
  endOfContent.style.height = "";
  endOfContent.style.userSelect = "";
  textLayer.classList.remove("selecting");
}

function resetAllTextLayers() {
  for (const [textLayer, endOfContent] of textLayers) {
    resetTextLayer(textLayer, endOfContent);
  }
}

function registerTextLayer(textLayer) {
  if (textLayers.has(textLayer)) {
    return;
  }

  const endOfContent = document.createElement("div");
  endOfContent.className = "text-selection-end";
  endOfContent.setAttribute("aria-hidden", "true");
  textLayer.append(endOfContent);
  textLayers.set(textLayer, endOfContent);
}

function unregisterTextLayer(textLayer) {
  textLayers.delete(textLayer);
}

function syncSelectingLayers() {
  if (!pointerDown) {
    resetAllTextLayers();
    return;
  }

  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) {
    resetAllTextLayers();
    return;
  }

  const activeLayers = new Set();

  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);

    for (const textLayer of textLayers.keys()) {
      if (!textLayer.isConnected || activeLayers.has(textLayer)) {
        continue;
      }

      try {
        if (range.intersectsNode(textLayer)) {
          activeLayers.add(textLayer);
        }
      } catch {
        // Ignore ranges whose nodes are being replaced during a rerender.
      }
    }
  }

  for (const [textLayer, endOfContent] of textLayers) {
    if (activeLayers.has(textLayer)) {
      textLayer.classList.add("selecting");
    } else {
      resetTextLayer(textLayer, endOfContent);
    }
  }
}

for (const textLayer of document.querySelectorAll(".text-layer")) {
  registerTextLayer(textLayer);
}

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      for (const textLayer of textLayersInNode(node)) {
        registerTextLayer(textLayer);
      }
    }

    for (const node of mutation.removedNodes) {
      for (const textLayer of textLayersInNode(node)) {
        unregisterTextLayer(textLayer);
      }
    }
  }
});

observer.observe(document.querySelector("#viewer"), {
  childList: true,
  subtree: true,
});

document.addEventListener("pointerdown", () => {
  pointerDown = true;
});

document.addEventListener("mousedown", (event) => {
  const textLayer = event.target instanceof Element ? event.target.closest(".text-layer") : null;
  if (textLayer) {
    textLayer.classList.add("selecting");
  }
});

document.addEventListener("selectionchange", syncSelectingLayers);

document.addEventListener("pointerup", () => {
  pointerDown = false;
  resetAllTextLayers();
});

document.addEventListener("keyup", () => {
  if (!pointerDown) {
    resetAllTextLayers();
  }
});

window.addEventListener("blur", () => {
  pointerDown = false;
  resetAllTextLayers();
});
