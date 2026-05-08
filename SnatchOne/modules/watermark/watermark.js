// Водяной знак Snatch - ТОЛЬКО внутри блока чата/писем
(function () {
  "use strict";

  // Защита от двойной инъекции
  if (window.__SNATCH_WATERMARK_LOADED__) return;
  window.__SNATCH_WATERMARK_LOADED__ = true;

  const defaultLogoUrl = chrome.runtime.getURL("Snatch.png");
  const WATERMARK_ID = "snatch-watermark-inner";
  const STYLE_ID = "snatch-watermark-style";

  const CHAT_SELECTORS = [
    'div[class*="styles_clmn_3_chat_list_wrap"]',
    'div[class*="clmn_3_chat_list_wrap"]',
    'div[class*="chat_list_wrap"]',
  ];

  let cachedContainer = null;
  let isEnabled = true;
  let currentLogoUrl = defaultLogoUrl;
  let currentOpacity = 0.1;

  function updateStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }

    // ВАЖНО: z-index: 9999 и pointer-events: none решают все проблемы с перекрытием.
    // Мы больше не ломаем z-index соседним элементам чата.
    style.textContent = `
            #${WATERMARK_ID} {
                position: absolute;
                top: 50%; 
                left: 50%;
                transform: translate(-50%, -50%);
                width: 500px; 
                height: 500px;
                background-image: url("${currentLogoUrl}");
                background-size: contain;
                background-repeat: no-repeat;
                background-position: center;
                opacity: ${currentOpacity};
                pointer-events: none;
                z-index: 9999; 
                user-select: none;
                transition: opacity 0.2s ease;
            }
        `;
  }

  function checkSettings() {
    chrome.storage.local.get(["ahSet"], (result) => {
      const settings = result.ahSet || {};
      const newState = settings.watermarkEnabled !== false;
      const customImage = settings.watermarkCustomImage || null;
      const opacity =
        settings.watermarkOpacity !== undefined
          ? settings.watermarkOpacity
          : 0.1;
      const newLogoUrl = customImage || defaultLogoUrl;

      if (
        newState !== isEnabled ||
        newLogoUrl !== currentLogoUrl ||
        opacity !== currentOpacity
      ) {
        isEnabled = newState;
        currentLogoUrl = newLogoUrl;
        currentOpacity = opacity;

        updateStyle();

        if (!isEnabled) {
          removeWatermark();
        } else {
          removeWatermark();
          update();
        }
      }
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.ahSet) checkSettings();
  });

  function isEmptyState() {
    const img = document.querySelector(
      'img[src*="empty_chat"], img[data-snatch-replaced="true"]',
    );
    if (!img) return false;
    const r = img.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function findChatBlock() {
    if (cachedContainer && document.contains(cachedContainer)) {
      const r = cachedContainer.getBoundingClientRect();
      if (r.width > 100 && r.height > 100) return cachedContainer;
    }

    cachedContainer = null;
    for (const sel of CHAT_SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width > 100 && r.height > 100) {
          cachedContainer = el;
          return el;
        }
      }
    }
    return null;
  }

  function addWatermark(container) {
    if (document.getElementById(WATERMARK_ID)) return;

    if (window.getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }

    const wm = document.createElement("div");
    wm.id = WATERMARK_ID;
    // Добавляем в конец контейнера для соблюдения порядка DOM
    container.appendChild(wm);
  }

  function removeWatermark() {
    const wm = document.getElementById(WATERMARK_ID);
    if (wm) wm.remove();
    cachedContainer = null;
  }

  function update() {
    if (window.SNATCH_HIDDEN_STATE === true || !isEnabled || isEmptyState()) {
      removeWatermark();
      return;
    }

    const block = findChatBlock();
    if (block) {
      addWatermark(block);
    } else {
      removeWatermark();
    }
  }

  // Инициализация стилей и настроек
  updateStyle();
  checkSettings();
  update();

  // Debounce для MutationObserver (производительность)
  let wmTimer = null;
  const observer = new MutationObserver(() => {
    if (wmTimer) clearTimeout(wmTimer);
    wmTimer = setTimeout(update, 150);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Watch URL
  let lastUrl = location.href;
  requestAnimationFrame(function watchUrl() {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      removeWatermark();
      setTimeout(update, 150);
    }
    requestAnimationFrame(watchUrl);
  });
})();
