function isEditableTarget(target) {
  return (
    target instanceof Element &&
    Boolean(target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"))
  );
}

async function closeCurrentTab() {
  const tab = await chrome.tabs.getCurrent();

  if (tab?.id !== undefined) {
    await chrome.tabs.remove(tab.id);
    return;
  }

  window.close();
}

document.addEventListener("keydown", (event) => {
  const isDeleteKey = event.key === "Backspace" || event.key === "Delete";

  if (
    !isDeleteKey ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.defaultPrevented ||
    isEditableTarget(event.target)
  ) {
    return;
  }

  event.preventDefault();
  void closeCurrentTab();
});
