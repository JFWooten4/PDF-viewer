const STORAGE_PREFIX = "pdf-viewer-chatgpt-summary:";
const HASH_PARAMETER = "pdf-viewer-summary";

function requestIdFromLocation() {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  return new URLSearchParams(hash).get(HASH_PARAMETER);
}

function findComposer() {
  return (
    document.querySelector("#prompt-textarea") ||
    document.querySelector('[contenteditable="true"][data-lexical-editor="true"]') ||
    document.querySelector('[contenteditable="true"][role="textbox"]') ||
    document.querySelector("textarea")
  );
}

function findSendButton() {
  return (
    document.querySelector('button[data-testid="send-button"]') ||
    Array.from(document.querySelectorAll("button")).find((button) =>
      /^send(?: message)?$/i.test(button.getAttribute("aria-label") || ""),
    )
  );
}

function setComposerText(composer, text) {
  composer.focus();

  if (composer instanceof HTMLTextAreaElement) {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (valueSetter) {
      valueSetter.call(composer, text);
    } else {
      composer.value = text;
    }
    composer.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(composer);
  selection.removeAllRanges();
  selection.addRange(range);

  const inserted = document.execCommand("insertText", false, text);
  if (!inserted || composer.textContent !== text) {
    composer.textContent = text;
    composer.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: text,
      }),
    );
  }
}

function waitFor(getValue, timeoutMs) {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const check = () => {
      const value = getValue();
      if (value) {
        resolve(value);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        resolve(null);
        return;
      }

      window.setTimeout(check, 100);
    };

    check();
  });
}

function clearRequestHash() {
  const url = new URL(window.location.href);
  url.hash = "";
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}

async function submitPendingSummary() {
  const requestId = requestIdFromLocation();
  if (!requestId) {
    return;
  }

  const storageKey = `${STORAGE_PREFIX}${requestId}`;
  const stored = await chrome.storage.local.get(storageKey);
  const payload = stored[storageKey];
  if (!payload?.prompt) {
    return;
  }

  const composer = await waitFor(findComposer, 20000);
  if (!composer) {
    return;
  }

  setComposerText(composer, payload.prompt);

  const sendButton = await waitFor(() => {
    const button = findSendButton();
    return button && !button.disabled ? button : null;
  }, 5000);

  if (!sendButton) {
    return;
  }

  sendButton.click();
  await chrome.storage.local.remove(storageKey);
  clearRequestHash();
}

void submitPendingSummary();
