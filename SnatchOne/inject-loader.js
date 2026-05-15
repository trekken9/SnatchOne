(() => {
  "use strict";

  if (window.__snatchInjectLoaderInstalled) return;
  window.__snatchInjectLoaderInstalled = true;

  const loadHeavyInject = () => {
    if (window.__snatchInjectLoadRequested) return;
    window.__snatchInjectLoadRequested = true;
    chrome.runtime.sendMessage({ cmd: "loadHeavyInject" }).catch(() => {
      window.__snatchInjectLoadRequested = false;
    });
  };

  const schedule = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(loadHeavyInject, { timeout: 1500 });
    } else {
      setTimeout(loadHeavyInject, 900);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
  } else {
    schedule();
  }
})();
