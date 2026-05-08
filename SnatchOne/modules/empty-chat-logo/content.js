// Замена картинки empty_chat.svg на логотип Snatch
(function() {
    'use strict';
    
    if (window.__SNATCH_EMPTY_CHAT_LOGO_LOADED__) return;
    window.__SNATCH_EMPTY_CHAT_LOGO_LOADED__ = true;
    
    const snatchLogoUrl = chrome.runtime.getURL('Snatch.png');
    
    function replaceEmptyChatImage(img) {
        if (window.SNATCH_HIDDEN_STATE === true) return;
        if (!img) return;
        if (img.getAttribute('data-snatch-replaced') === 'true') return;
        const src = img.getAttribute('src') || '';
        if (!src.includes('empty_chat')) return;
        
        if (!img.getAttribute('data-snatch-original-src')) {
            img.setAttribute('data-snatch-original-src', img.src);
        }
        img.src = snatchLogoUrl;
        img.setAttribute('data-snatch-replaced', 'true');
        img.style.cssText = 'max-width:400px;max-height:400px;object-fit:contain;opacity:0.8;';
    }
    
    window.addEventListener('snatch-restore-logos', () => {
        document.querySelectorAll('img[data-snatch-replaced="true"]').forEach(img => img.removeAttribute('data-snatch-replaced'));
        findAndReplaceAll();
    });
    
    window.addEventListener('snatch-force-replace', () => {
        document.querySelectorAll('img[src*="empty_chat"]').forEach(img => img.removeAttribute('data-snatch-replaced'));
        findAndReplaceAll();
    });
    
    function findAndReplaceAll() {
        document.querySelectorAll('img[src*="empty_chat"]').forEach(img => replaceEmptyChatImage(img));
    }
    
    findAndReplaceAll();
    
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.tagName === 'IMG') replaceEmptyChatImage(node);
                node.querySelectorAll?.('img[src*="empty_chat"]').forEach(img => replaceEmptyChatImage(img));
            }
            if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                const t = mutation.target;
                if (t.tagName === 'IMG') replaceEmptyChatImage(t);
            }
        }
    });
    
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    setInterval(findAndReplaceAll, 2000);
})();
