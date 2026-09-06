const THEME_STORAGE_KEY = "pdf-viewer-theme";
const SEC_COMMENT_DARK_MODE_KEY = "pdf-viewer-sec-comment-dark-mode";
const STUDIO_GREEN = "#43af49";

const toolsMenu = document.querySelector("#tools-menu");

function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function syncThemePreference() {
  void chrome.storage.local.set({ [THEME_STORAGE_KEY]: currentTheme() });
}

function styleSettingCheckbox(input) {
  input.style.position = "static";
  input.style.width = "16px";
  input.style.height = "16px";
  input.style.margin = "0";
  input.style.opacity = "1";
  input.style.pointerEvents = "auto";
  input.style.accentColor = STUDIO_GREEN;
  input.style.cursor = "pointer";

  const customSwitch = input.nextElementSibling;
  if (customSwitch?.classList.contains("toggle-switch")) {
    customSwitch.hidden = true;
  }

  input.closest(".tool-toggle")?.classList.add("tool-button");
}

async function addSecCommentSetting() {
  if (!toolsMenu) {
    return;
  }

  const stored = await chrome.storage.local.get(SEC_COMMENT_DARK_MODE_KEY);
  const preserveImageColorsToggle = toolsMenu.querySelector("#preserve-image-colors");
  let enabled = stored[SEC_COMMENT_DARK_MODE_KEY] !== false;

  if (preserveImageColorsToggle instanceof HTMLInputElement) {
    styleSettingCheckbox(preserveImageColorsToggle);
  }

  const label = document.createElement("label");
  label.className = "tool-button tool-toggle";
  label.title = "Darken SEC HTML comments when the viewer uses dark mode";

  const text = document.createElement("span");
  text.textContent = "Darken SEC HTML comments";

  const input = document.createElement("input");
  input.id = "sec-comment-dark-mode";
  input.className = "toggle-input";
  input.type = "checkbox";
  input.checked = enabled;
  input.setAttribute("aria-label", text.textContent);
  styleSettingCheckbox(input);

  input.addEventListener("change", async () => {
    enabled = input.checked;
    await chrome.storage.local.set({ [SEC_COMMENT_DARK_MODE_KEY]: enabled });
  });

  label.append(text, input);

  if (!preserveImageColorsToggle) {
    const separator = document.createElement("div");
    separator.className = "menu-separator";
    separator.setAttribute("role", "separator");
    toolsMenu.append(separator);
  }

  toolsMenu.append(label);
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
