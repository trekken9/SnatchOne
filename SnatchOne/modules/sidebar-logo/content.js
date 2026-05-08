// Замена логотипа в сайдбаре на логотип Snatch
(function() {
    'use strict';
    
    if (window.__SNATCH_SIDEBAR_LOGO_LOADED__) return;
    window.__SNATCH_SIDEBAR_LOGO_LOADED__ = true;
    
    const snatchLogoUrl = chrome.runtime.getURL('Snatch.png');
    const telegramUrl = 'https://t.me/brachka_rass';
    
    function replaceSidebarLogo(container) {
        if (window.SNATCH_HIDDEN_STATE === true) return;
        if (!container) return;
        if (container.getAttribute('data-snatch-sidebar-replaced') === 'true') return;
        
        const img = container.querySelector('img');
        if (!img) return;
        
        const src = img.getAttribute('src') || '';
        if (!src.includes('logo.7b0a91627ef0d04bc1f528caa4606d4f.svg')) return;
        
        if (!img.getAttribute('data-snatch-original-src')) {
            img.setAttribute('data-snatch-original-src', img.src);
        }
        
        img.src = snatchLogoUrl;
        img.setAttribute('data-snatch-sidebar-replaced', 'true');
        img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;cursor:pointer;transition:transform .2s,opacity .2s;';
        
        img.addEventListener('mouseenter', () => { img.style.transform='scale(1.05)'; img.style.opacity='0.8'; });
        img.addEventListener('mouseleave', () => { img.style.transform='scale(1)'; img.style.opacity='1'; });
        
        if (img.__snatchClickHandler) img.removeEventListener('click', img.__snatchClickHandler);
        const clickHandler = (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); window.open(telegramUrl, '_blank'); };
        img.__snatchClickHandler = clickHandler;
        img.addEventListener('click', clickHandler);
        
        container.setAttribute('data-snatch-sidebar-replaced', 'true');
        container.style.cursor = 'pointer';
        container.setAttribute('title', 'Открыть Telegram канал');
    }
    
    window.addEventListener('snatch-restore-logos', () => {
        document.querySelectorAll('.SideMenu_clmn_1_logo__IPgoP[data-testid="main-logo"]').forEach(c => {
            c.removeAttribute('data-snatch-sidebar-replaced');
            c.querySelector('img')?.removeAttribute('data-snatch-sidebar-replaced');
        });
        findAndReplace();
    });
    
    window.addEventListener('snatch-force-replace', () => {
        document.querySelectorAll('.SideMenu_clmn_1_logo__IPgoP[data-testid="main-logo"]').forEach(c => {
            c.removeAttribute('data-snatch-sidebar-replaced');
            c.querySelector('img')?.removeAttribute('data-snatch-sidebar-replaced');
        });
        findAndReplace();
    });
    
    function findAndReplace() {
        const logoContainer = document.querySelector('.SideMenu_clmn_1_logo__IPgoP[data-testid="main-logo"]');
        if (logoContainer) replaceSidebarLogo(logoContainer);
    }
    
    findAndReplace();
    
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.classList?.contains('SideMenu_clmn_1_logo__IPgoP')) {
                    replaceSidebarLogo(node);
                }
                const inner = node.querySelector?.('.SideMenu_clmn_1_logo__IPgoP[data-testid="main-logo"]');
                if (inner) replaceSidebarLogo(inner);
            }
        }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(findAndReplace, 2000);
})();
