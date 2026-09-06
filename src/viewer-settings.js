const THEME_STORAGE_KEY = "pdf-viewer-theme";
const SEC_COMMENT_DARK_MODE_KEY = "pdf-viewer-sec-comment-dark-mode";

const toolsMenu = document.querySelector("#tools-menu");

function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function syncThemePreference() {
  void chrome.storage.local.set({ [THEME_STORAGE_KEY]: currentTheme() });
}

function renderSecCommentSetting(button, enabled) {
  button.setAttribute("aria-pressed", String(enabled));
  button.replaceChildren();
  button.append(document.createTextNode(enabled ? "✓ " : "○ "));

  const label = document.createElement("span");
  label.textContent = "Darken SEC HTML comments";
  button.append(label);
}

async function addSecCommentSetting() {
  if (!toolsMenu) {
    return;
  }

  const stored = await chrome.storage.local.get(SEC_COMMENT_DARK_MODE_KEY);
  let enabled = stored[SEC_COMMENT_DARK_MODE_KEY] !== false;

  const separator = document.createElement("div");
  separator.className = "menu-separator";
  separator.setAttribute("role", "separator");

  const button = document.createElement("button");
  button.id = "sec-comment-dark-mode";
  button.className = "tool-button";
  button.type = "button";
  button.setAttribute("role", "menuitemcheckbox");
  renderSecCommentSetting(button, enabled);

  button.addEventListener("click", async () => {
    enabled = !enabled;
    await chrome.storage.local.set({ [SEC_COMMENT_DARK_MODE_KEY]: enabled });
    renderSecCommentSetting(button, enabled);
  });

  toolsMenu.append(separator, button);
}

const themeObserver = new MutationObserver((mutations) => {
  if (mutations.some((mutation) => mutation.attributeName === "data-theme")) {
    syncThemePreference();
  }
});

themeObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
});

syncThemePreference();
void addSecCommentSetting();
