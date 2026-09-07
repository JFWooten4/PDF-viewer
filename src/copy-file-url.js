const copyFileUrlButton = document.querySelector("#copy-file-url");
const source = new URLSearchParams(window.location.search).get("url");
const defaultTitle = copyFileUrlButton.title;
let titleResetTimer;

copyFileUrlButton.addEventListener("click", async () => {
  if (!source) {
    return;
  }

  try {
    await navigator.clipboard.writeText(new URL(source).href);
    clearTimeout(titleResetTimer);
    copyFileUrlButton.title = "Copied file URL";
    copyFileUrlButton.setAttribute("aria-label", copyFileUrlButton.title);
    titleResetTimer = setTimeout(() => {
      copyFileUrlButton.title = defaultTitle;
      copyFileUrlButton.setAttribute("aria-label", defaultTitle);
    }, 1400);
  } catch {
    // Keep the copy control silent if clipboard access is unavailable.
  }
});
