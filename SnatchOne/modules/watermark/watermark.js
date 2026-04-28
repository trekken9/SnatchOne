// Водяной знак Snatch - ТОЛЬКО внутри блока чата/писем
(function() {
    'use strict';
    
    if (window.__SNATCH_WATERMARK_LOADED__) return;
    window.__SNATCH_WATERMARK_LOADED__ = true;
    
    const defaultLogoUrl = chrome.runtime.getURL('Snatch.png');
    const WATERMARK_ID = 'snatch-watermark-inner';
    const STYLE_ID = 'snatch-watermark-style';
    
    let cachedContainer = null;
    let isEnabled = true;
    let currentLogoUrl = defaultLogoUrl;
    let currentOpacity = 0.1;
    
    function checkSettings() {
        chrome.storage.local.get(['ahSet'], (result) => {
            const settings = result.ahSet || {};
            const newState = settings.watermarkEnabled !== false;
            const customImage = settings.watermarkCustomImage || null;
            const opacity = settings.watermarkOpacity !== undefined ? settings.watermarkOpacity : 0.1;
            const newLogoUrl = customImage || defaultLogoUrl;
            
            if (newState !== isEnabled || newLogoUrl !== currentLogoUrl || opacity !== currentOpacity) {
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
    
    function updateStyle() {
        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
            document.head.appendChild(style);
        }
        style.textContent = `
            #${WATERMARK_ID} {
                position: absolute;
                top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                width: 500px; height: 500px;
                background-image: url("${currentLogoUrl}");
                background-size: contain;
                background-repeat: no-repeat;
                background-position: center;
                opacity: ${currentOpacity};
                pointer-events: none;
                z-index: 0;
                user-select: none;
                transition: opacity 0.2s ease;
            }
            div[class*="styles_clmn_3_chat_list_wrap"] > *:not(#${WATERMARK_ID}),
            div[class*="clmn_3_chat_list_wrap"] > *:not(#${WATERMARK_ID}) {
                position: relative !important;
                z-index: 1 !important;
            }
        `;
    }
    
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.ahSet) checkSettings();
    });
    
    checkSettings();
    
    const CHAT_SELECTORS = [
        'div[class*="styles_clmn_3_chat_list_wrap"]',
        'div[class*="clmn_3_chat_list_wrap"]',
        'div[class*="chat_list_wrap"]',
    ];
    
    function isEmptyState() {
        const img = document.querySelector('img[src*="empty_chat"], img[data-snatch-replaced="true"]');
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
        if (window.getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }
        const wm = document.createElement('div');
        wm.id = WATERMARK_ID;
        container.insertBefore(wm, container.firstChild);
    }
    
    function removeWatermark() {
        document.getElementById(WATERMARK_ID)?.remove();
        cachedContainer = null;
    }
    
    function update() {
        if (window.SNATCH_HIDDEN_STATE === true) { removeWatermark(); return; }
        if (!isEnabled) { removeWatermark(); return; }
        if (isEmptyState()) { removeWatermark(); return; }
        const block = findChatBlock();
        if (block) addWatermark(block);
        else removeWatermark();
    }
    
    update();
    
    // Debounce чтобы не вызывать update на каждую мутацию
    let wmTimer = null;
    const observer = new MutationObserver(() => {
        clearTimeout(wmTimer);
        wmTimer = setTimeout(update, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    let lastUrl = location.href;
    (function watchUrl() {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            removeWatermark();
            setTimeout(update, 150);
        }
        requestAnimationFrame(watchUrl);
    })();
    
})();
    
    let cachedContainer = null;
    let isEnabled = true;
    let currentLogoUrl = defaultLogoUrl;
    let currentOpacity = 0.1; // По умолчанию 10%
    
    // Проверяем настройку из chrome.storage
    function checkSettings() {
        chrome.storage.local.get(['ahSet'], (result) => {
            const settings = result.ahSet || {};
            const newState = settings.watermarkEnabled !== false;
            const customImage = settings.watermarkCustomImage || null;
            const opacity = settings.watermarkOpacity !== undefined ? settings.watermarkOpacity : 0.1;
            
            // Определяем URL логотипа
            const newLogoUrl = customImage || defaultLogoUrl;
            
            if (newState !== isEnabled || newLogoUrl !== currentLogoUrl || opacity !== currentOpacity) {
                isEnabled = newState;
                currentLogoUrl = newLogoUrl;
                currentOpacity = opacity;
                console.log('[Snatch Watermark] Настройка изменена:', { isEnabled, currentLogoUrl, currentOpacity });
                
                // Обновляем CSS с новым URL и прозрачностью
                updateStyle();
                
                if (!isEnabled) {
                    removeWatermark();
                } else {
                    // Пересоздаем водяной знак с новым изображением
                    removeWatermark();
                    update();
                }
            }
        });
    }
    
    // Обновление стилей с текущим URL логотипа
    function updateStyle() {
        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
            document.head.appendChild(style);
        }
        
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
                z-index: 0;
                user-select: none;
                transition: opacity 0.2s ease;
            }
            
            div[class*="styles_clmn_3_chat_list_wrap"] > *:not(#${WATERMARK_ID}),
            div[class*="clmn_3_chat_list_wrap"] > *:not(#${WATERMARK_ID}) {
                position: relative !important;
                z-index: 1 !important;
            }
        `;
    }
    
    // Слушаем изменения настроек
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.ahSet) {
            checkSettings();
        }
    });
    
    // Проверяем настройку при загрузке
    checkSettings();
    
    const CHAT_SELECTORS = [
        'div[class*="styles_clmn_3_chat_list_wrap"]',
        'div[class*="clmn_3_chat_list_wrap"]',
        'div[class*="chat_list_wrap"]',
    ];
    
    function isEmptyState() {
        const img = document.querySelector('img[src*="empty_chat"], img[data-snatch-replaced="true"]');
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
        
        console.log('[Snatch Watermark] Добавляю водяной знак в контейнер:', container);
        
        if (window.getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }
        
        const wm = document.createElement('div');
        wm.id = WATERMARK_ID;
        container.insertBefore(wm, container.firstChild);
        
        console.log('[Snatch Watermark] Водяной знак добавлен, элемент:', wm);
    }
    
    function removeWatermark() {
        document.getElementById(WATERMARK_ID)?.remove();
        cachedContainer = null;
    }
    
    function update() {
        // Проверяем глобальное состояние скрытия
        if (window.SNATCH_HIDDEN_STATE === true) {
            console.log('[Snatch Watermark] Snatch скрыт, пропускаю обновление');
            removeWatermark();
            return;
        }
        
        // Проверяем, включен ли водяной знак
        if (!isEnabled) {
            removeWatermark();
            return;
        }
        
        const isEmpty = isEmptyState();
        console.log('[Snatch Watermark] Update: isEmpty =', isEmpty);
        
        if (isEmpty) {
            removeWatermark();
            return;
        }
        
        const block = findChatBlock();
        console.log('[Snatch Watermark] Найденный блок чата:', block);
        
        if (block) addWatermark(block);
        else removeWatermark();
    }
    
    // Инициализация
    update();
    
    // MutationObserver для отслеживания изменений DOM
    const observer = new MutationObserver(() => {
        update();
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // requestAnimationFrame для мгновенной реакции на смену URL
    let lastUrl = location.href;
    (function watchUrl() {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            console.log('[Snatch Watermark] URL изменился:', url);
            removeWatermark();
            setTimeout(update, 150);
        }
        requestAnimationFrame(watchUrl);
    })();
    
})();
