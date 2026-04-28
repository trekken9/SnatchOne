(() => {
  'use strict';

  const TRANSLIT_MAP = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo',
    'ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m',
    'н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u',
    'ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch',
    'ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
    'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'Yo',
    'Ж':'Zh','З':'Z','И':'I','Й':'Y','К':'K','Л':'L','М':'M',
    'Н':'N','О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U',
    'Ф':'F','Х':'H','Ц':'Ts','Ч':'Ch','Ш':'Sh','Щ':'Sch',
    'Ъ':'','Ы':'Y','Ь':'','Э':'E','Ю':'Yu','Я':'Ya',
    'і':'i','ї':'yi','є':'ye','ґ':'g',
    'І':'I','Ї':'Yi','Є':'Ye','Ґ':'G',
  };

  function transliterate(text) {
    if (!text) return '';
    let result = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      // Явная проверка на undefined — иначе '' (ъ, ь) будет заменяться на оригинал
      result += ch in TRANSLIT_MAP ? TRANSLIT_MAP[ch] : ch;
    }
    return result;
  }

  function addStyles() {
    if (document.getElementById('translit-styles')) return;
    const style = document.createElement('style');
    style.id = 'translit-styles';
    style.textContent = `
      .translit-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 8px 14px;
        background: #f5f5f5;
        color: #333;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        margin-right: 8px;
        min-width: 50px;
        height: 36px;
        align-self: center;
        vertical-align: middle;
      }
      .translit-btn:hover { background: #e8e8e8; border-color: #ccc; }
      .translit-btn:active { background: #ddd; transform: scale(0.98); }
    `;
    document.head.appendChild(style);
  }

  function createTranslitButton() {
    const btn = document.createElement('button');
    btn.className = 'translit-btn';
    btn.textContent = 'Aa';
    btn.title = 'Транслитерация (Русский/Украинский → Латиница)';

    btn.addEventListener('click', () => {
      const leftContainer = document.querySelector('[data-testid="real-text-block"]');
      const leftTextarea = leftContainer?.querySelector('textarea[data-testid="text"]');
      if (!leftTextarea) return;

      const russianText = leftTextarea.value;
      if (!russianText.trim()) return;

      const rightContainer = document.querySelector('[data-testid="translated-text-block"]');
      const rightTextarea = rightContainer?.querySelector('textarea[data-testid="text"]');
      if (!rightTextarea) return;

      const translitText = transliterate(russianText);
      rightTextarea.value = translitText;
      rightTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      rightTextarea.dispatchEvent(new Event('change', { bubbles: true }));

      const counterElement = rightContainer.querySelector('[data-testid="count"]');
      if (counterElement) {
        counterElement.textContent = `${translitText.length} symbols`;
      }
    });

    return btn;
  }

  function insertButton() {
    // Основной селектор
    let translateBtn = document.querySelector('.styles_clmn_3_chat_bottom_translate_text__u1W5Y');

    // Fallback: ищем по тексту кнопки если класс изменился
    if (!translateBtn) {
      translateBtn = [...document.querySelectorAll('button')].find(
        b => b.textContent.trim().toUpperCase() === 'TRANSLATE'
      ) || null;
    }

    if (!translateBtn) return false;

    const container = translateBtn.closest('.styles_clmn_3_chat_bottom_nav_s__U7P9')
      || translateBtn.parentElement;

    if (!container) return false;

    // Глобальная проверка — убираем все лишние кнопки кроме первой
    const existing = document.querySelectorAll('.translit-btn');
    if (existing.length > 1) {
      // Оставляем только последнюю (она в актуальном DOM)
      for (let i = 0; i < existing.length - 1; i++) existing[i].remove();
    }
    if (existing.length >= 1) return true;

    const translitBtn = createTranslitButton();
    translateBtn.parentElement.parentElement.insertBefore(translitBtn, translateBtn.parentElement);
    return true;
  }

  function init() {
    addStyles();

    if (insertButton()) return;

    const observer = new MutationObserver(() => {
      if (insertButton()) {
        observer.disconnect();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // При смене URL (переход между чатами) — перезапускаем вставку.
  // lastUrl инициализируется ПОСЛЕ первого init() чтобы не сработать дважды при старте.
  let lastUrl = location.href;
  new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      setTimeout(init, 500);
    }
  }).observe(document.body, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
