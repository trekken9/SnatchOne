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
        width: 36px;
        height: 36px;
        padding: 0;
        background: transparent;
        color: #2d9d8f;
        border: 1.5px solid #2d9d8f;
        border-radius: 50%;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
        margin: 0 3px;
        flex-shrink: 0;
      }
      .translit-btn:hover { background: rgba(45,157,143,0.1); border-color: #1f7a70; color: #1f7a70; }
      .translit-btn:active { transform: scale(0.95); }
    `;
    document.head.appendChild(style);
  }

  function createTranslitButton() {
    const btn = document.createElement('button');
    btn.className = 'translit-btn';
    btn.textContent = 'Aa';
    btn.title = 'Транслитерация';
    btn.setAttribute('data-translit-inserted', 'true');

    btn.addEventListener('click', () => {
      // Ищем textarea слева (русский текст)
      let leftTextarea = document.querySelector('[data-testid="real-text-block"] textarea[data-testid="text"]');
      
      // Если не нашли (письма), ищем по другому
      if (!leftTextarea) {
        // Ищем все textarea на странице
        const allTextareas = [...document.querySelectorAll('textarea')];
        // Берем первую видимую с текстом или пустую
        leftTextarea = allTextareas.find(ta => {
          const rect = ta.getBoundingClientRect();
          return rect.width > 100 && rect.height > 50;
        });
      }
      
      if (!leftTextarea) return;

      const russianText = leftTextarea.value;
      if (!russianText.trim()) return;

      // Ищем textarea справа (английский текст)
      let rightTextarea = document.querySelector('[data-testid="translated-text-block"] textarea[data-testid="text"]');
      
      // Если не нашли (письма), ищем следующую textarea после левой
      if (!rightTextarea) {
        const allTextareas = [...document.querySelectorAll('textarea')];
        const leftIndex = allTextareas.indexOf(leftTextarea);
        if (leftIndex >= 0 && leftIndex < allTextareas.length - 1) {
          rightTextarea = allTextareas[leftIndex + 1];
        }
      }
      
      if (!rightTextarea) return;

      const translitText = transliterate(russianText);
      rightTextarea.value = translitText;
      rightTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      rightTextarea.dispatchEvent(new Event('change', { bubbles: true }));

      // Обновляем счетчик если есть
      const rightContainer = rightTextarea.closest('[data-testid="translated-text-block"]') || rightTextarea.parentElement;
      const counterElement = rightContainer?.querySelector('[data-testid="count"]');
      if (counterElement) {
        counterElement.textContent = `${translitText.length} symbols`;
      }
    });

    return btn;
  }

  function insertButtonForLetters() {
    // Удаляем ВСЕ старые кнопки сначала
    document.querySelectorAll('.translit-btn').forEach(btn => btn.remove());
    
    // Для чатов - ищем ТОЛЬКО ВИДИМУЮ кнопку TRANSLATE
    const allBtns = [...document.querySelectorAll('button')].filter(b => {
      if (b.textContent.trim().toUpperCase() !== 'TRANSLATE') return false;
      // Проверяем что кнопка видима
      const rect = b.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    // Берем ТОЛЬКО ПЕРВУЮ видимую
    if (allBtns.length > 0) {
      const translateBtn = allBtns[0];
      const parent = translateBtn.parentElement;
      if (parent) {
        const translitBtn = createTranslitButton();
        parent.insertBefore(translitBtn, translateBtn);
        return; // ВЫХОДИМ - больше ничего не вставляем
      }
    }

    // Для писем - ищем по классу (ТОЛЬКО если не нашли в чате)
    const translateContainers = [...document.querySelectorAll('[class*="translate"][class*="bottom"]')].filter(c => {
      const rect = c.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    
    if (translateContainers.length > 0) {
      const container = translateContainers[0];
      const parent = container.parentElement;
      if (parent) {
        const translitBtn = createTranslitButton();
        parent.insertBefore(translitBtn, container);
      }
    }
  }

  function init() {
    addStyles();
    setTimeout(insertButtonForLetters, 300);

    // MutationObserver: следим за DOM для динамической вставки кнопки
    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        setTimeout(insertButtonForLetters, 300);
        return;
      }
      // Если кнопка пропала (смена чата/UI перерисовка) — вставляем снова
      if (!document.querySelector('.translit-btn')) {
        insertButtonForLetters();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Fallback: проверка каждые 5 секунд (на случай если MutationObserver пропустит)
    setInterval(() => {
      if (!document.querySelector('.translit-btn')) {
        insertButtonForLetters();
      }
    }, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
