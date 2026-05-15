// ═══════════════════════════════════════════════════════════
// CLIPBOARD BUFFER: Кнопка буфера обмена для быстрых сообщений
// ═══════════════════════════════════════════════════════════

(function initClipboardBuffer() {
  'use strict';

  const STORAGE_KEY = 'snatch_clipboard_buffer';
  let clipboardMessages = [];
  let isModalOpen = false;

  // Загрузка сохраненных сообщений
  function loadMessages() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        clipboardMessages = JSON.parse(stored);
      }
    } catch (e) {
      console.error('[Clipboard Buffer] Load error:', e);
      clipboardMessages = [];
    }
  }

  // Сохранение сообщений
  function saveMessages() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clipboardMessages));
    } catch (e) {
      console.error('[Clipboard Buffer] Save error:', e);
    }
  }

  // Создание модального окна
  function createModal() {
    if (document.getElementById('clipboard-buffer-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'clipboard-buffer-modal';
    modal.className = 'clipboard-modal';
    modal.innerHTML = `
      <div class="clipboard-modal-overlay"></div>
      <div class="clipboard-modal-content">
        <div class="clipboard-modal-header">
          <h3>📋 Буфер сообщений</h3>
          <button class="clipboard-close-btn" title="Закрыть">×</button>
        </div>
        <div class="clipboard-modal-body">
          <div class="clipboard-add-section">
            <textarea 
              class="clipboard-new-message" 
              placeholder="Введите новое сообщение..."
              maxlength="3000"
            ></textarea>
            <button class="clipboard-add-btn">➕ Добавить</button>
          </div>
          <div class="clipboard-messages-list"></div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Обработчики событий
    modal.querySelector('.clipboard-close-btn').addEventListener('click', closeModal);
    modal.querySelector('.clipboard-modal-overlay').addEventListener('click', closeModal);
    modal.querySelector('.clipboard-add-btn').addEventListener('click', addMessage);
    
    const textarea = modal.querySelector('.clipboard-new-message');
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        addMessage();
      }
    });

    renderMessages();
  }

  // Рендер списка сообщений
  function renderMessages() {
    const list = document.querySelector('.clipboard-messages-list');
    if (!list) return;

    if (clipboardMessages.length === 0) {
      list.innerHTML = `
        <div class="clipboard-empty">
          <div class="clipboard-empty-icon">📋</div>
          <div>Нет сохраненных сообщений</div>
          <div class="clipboard-empty-hint">Добавьте часто используемые фразы</div>
        </div>
      `;
      return;
    }

    list.innerHTML = clipboardMessages.map((msg, index) => `
      <div class="clipboard-message-item" data-index="${index}">
        <div class="clipboard-message-text">${escapeHtml(msg)}</div>
        <div class="clipboard-message-actions">
          <button class="clipboard-use-btn" data-index="${index}" title="Вставить в чат">
            ✓ Использовать
          </button>
          <button class="clipboard-delete-btn" data-index="${index}" title="Удалить">
            🗑
          </button>
        </div>
      </div>
    `).join('');

    // Обработчики для кнопок
    list.querySelectorAll('.clipboard-use-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        useMessage(index);
      });
    });

    list.querySelectorAll('.clipboard-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        deleteMessage(index);
      });
    });
  }

  // Добавление нового сообщения
  function addMessage() {
    const textarea = document.querySelector('.clipboard-new-message');
    if (!textarea) return;

    const text = textarea.value.trim();
    if (!text) {
      alert('Введите текст сообщения');
      return;
    }

    clipboardMessages.unshift(text);
    saveMessages();
    textarea.value = '';
    renderMessages();
  }

  // Использование сообщения (вставка в чат)
  function useMessage(index) {
    const message = clipboardMessages[index];
    if (!message) return;

    const isVisibleTextarea = (ta) => {
      if (!ta) return false;
      const rect = ta.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && ta.offsetParent !== null;
    };

    // В письмах Alpha.date правое поле не всегда размечено data-testid.
    // Сначала ищем конкретный правый textarea письма, потом чатовый right block.
    let chatTextarea = [...document.querySelectorAll('textarea.FormLetters_clmn_3_chat_textarea_inner__l5OUR')]
      .find(isVisibleTextarea);
    if (!chatTextarea) {
      chatTextarea = document.querySelector('[data-testid="translated-text-block"] textarea[data-testid="text"]');
    }
    if (!chatTextarea) {
      chatTextarea = document.querySelector('[data-testid="letter-text-block"] textarea');
    }
    
    // Альтернативный поиск - любая видимая textarea
    if (!chatTextarea) {
      const allTextareas = [...document.querySelectorAll('textarea')];
      chatTextarea = allTextareas.find(ta => {
        const rect = ta.getBoundingClientRect();
        return rect.width > 100 && rect.height > 50 && ta.offsetParent !== null;
      });
    }

    if (chatTextarea) {
      const proto = window.HTMLTextAreaElement && window.HTMLTextAreaElement.prototype;
      const desc = proto ? Object.getOwnPropertyDescriptor(proto, "value") : null;
      if (desc?.set) desc.set.call(chatTextarea, message);
      else chatTextarea.value = message;
      chatTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      chatTextarea.dispatchEvent(new Event('change', { bubbles: true }));
      chatTextarea.focus();
      closeModal();
    } else {
      alert('Не удалось найти поле ввода сообщения');
    }
  }

  // Удаление сообщения
  function deleteMessage(index) {
    if (!confirm('Удалить это сообщение?')) return;
    clipboardMessages.splice(index, 1);
    saveMessages();
    renderMessages();
  }

  // Закрытие модального окна
  function closeModal() {
    const modal = document.getElementById('clipboard-buffer-modal');
    if (modal) {
      modal.remove();
      isModalOpen = false;
    }
  }

  // Открытие модального окна
  function openModal() {
    if (isModalOpen) return;
    isModalOpen = true;
    createModal();
  }

  // Создание кнопки
  function createButton() {
    const btn = document.createElement('button');
    btn.className = 'clipboard-buffer-btn';
    btn.textContent = '📋';
    btn.title = 'Буфер сообщений';

    btn.addEventListener('click', openModal);

    return btn;
  }

  // Вставка кнопки в интерфейс
  function insertButton() {
    // Проверяем, не добавлена ли уже кнопка
    if (document.querySelector('.clipboard-buffer-btn')) {
      return true;
    }

    // Стратегия 1: Ищем кнопку "Aa" (translit) и вставляем рядом
    const translitBtn = document.querySelector('.translit-btn, [data-translit-inserted="true"]');
    if (translitBtn && translitBtn.parentElement) {
      const btn = createButton();
      // Вставляем перед кнопкой Aa
      translitBtn.parentElement.insertBefore(btn, translitBtn);

      return true;
    }

    // Стратегия 2: Ищем видимую кнопку TRANSLATE и вставляем рядом
    const allBtns = [...document.querySelectorAll('button')].filter(b => {
      if (b.textContent.trim().toUpperCase() !== 'TRANSLATE') return false;
      const rect = b.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    if (allBtns.length > 0) {
      const translateBtn = allBtns[0];
      const parent = translateBtn.parentElement;
      if (parent) {
        const btn = createButton();
        parent.insertBefore(btn, translateBtn);

        return true;
      }
    }

    // Стратегия 3: Ищем контейнер с кнопками перевода/форматирования
    const translateContainers = [...document.querySelectorAll('[class*="translate"][class*="bottom"]')].filter(c => {
      const rect = c.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    if (translateContainers.length > 0) {
      const container = translateContainers[0];
      const parent = container.parentElement;
      if (parent) {
        const btn = createButton();
        parent.insertBefore(btn, container);

        return true;
      }
    }

    // Стратегия 4 (fallback): Ищем textarea и вставляем рядом с ней
    const chatTextarea = document.querySelector('[data-testid="translated-text-block"]') ||
                         document.querySelector('[data-testid="letter-text-block"]');
    if (chatTextarea) {
      const btn = createButton();
      btn.style.position = 'absolute';
      btn.style.top = '-40px';
      btn.style.right = '10px';
      btn.style.zIndex = '100';
      chatTextarea.style.position = 'relative';
      chatTextarea.appendChild(btn);

      return true;
    }

    return false;
  }

  // Добавление стилей
  function addStyles() {
    if (document.getElementById('clipboard-buffer-styles')) return;

    const style = document.createElement('style');
    style.id = 'clipboard-buffer-styles';
    style.textContent = `
      /* Кнопка буфера обмена */
      .clipboard-buffer-btn {
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
        font-size: 16px;
        cursor: pointer;
        transition: all 0.2s ease;
        margin: 0 3px;
        white-space: nowrap;
        flex-shrink: 0;
      }

      .clipboard-buffer-btn:hover {
        background: rgba(45,157,143,0.1);
        border-color: #1f7a70;
        color: #1f7a70;
        transform: scale(1.05);
      }

      .clipboard-buffer-btn:active {
        transform: scale(0.95);
      }

      /* Модальное окно */
      .clipboard-modal {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Inter', system-ui, sans-serif;
      }

      .clipboard-modal-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
      }

      .clipboard-modal-content {
        position: relative;
        background: white;
        border-radius: 16px;
        width: 90%;
        max-width: 600px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        animation: clipboardModalIn 0.2s ease-out;
      }

      @keyframes clipboardModalIn {
        from {
          opacity: 0;
          transform: scale(0.95);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      .clipboard-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px;
        border-bottom: 1px solid #f1f2f6;
      }

      .clipboard-modal-header h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        color: #2d3436;
      }

      .clipboard-close-btn {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: none;
        background: #f1f2f6;
        color: #636e72;
        font-size: 24px;
        line-height: 1;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .clipboard-close-btn:hover {
        background: #ff7675;
        color: white;
        transform: rotate(90deg);
      }

      .clipboard-modal-body {
        flex: 1;
        overflow-y: auto;
        padding: 20px 24px;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .clipboard-add-section {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .clipboard-new-message {
        width: 100%;
        min-height: 80px;
        padding: 12px;
        border: 2px solid #e1e2e6;
        border-radius: 12px;
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 14px;
        color: #2d3436;
        resize: vertical;
        outline: none;
        transition: border-color 0.2s;
      }

      .clipboard-new-message:focus {
        border-color: var(--sa, #FF6B35);
      }

      .clipboard-add-btn {
        align-self: flex-end;
        padding: 10px 20px;
        border: none;
        border-radius: 10px;
        background: var(--sa, #FF6B35);
        color: white;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 4px 12px rgba(var(--sa-rgb, 255, 107, 53), 0.2);
      }

      .clipboard-add-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(var(--sa-rgb, 255, 107, 53), 0.3);
      }

      .clipboard-messages-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .clipboard-message-item {
        background: #fafbfc;
        border: 1px solid #f1f2f6;
        border-radius: 12px;
        padding: 15px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        transition: all 0.2s;
      }

      .clipboard-message-item:hover {
        border-color: var(--sa, #FF6B35);
        transform: translateX(2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
      }

      .clipboard-message-text {
        font-size: 14px;
        line-height: 1.5;
        color: #2d3436;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .clipboard-message-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }

      .clipboard-use-btn,
      .clipboard-delete-btn {
        padding: 6px 12px;
        border: none;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }

      .clipboard-use-btn {
        background: var(--sa, #FF6B35);
        color: white;
      }

      .clipboard-use-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(var(--sa-rgb, 255, 107, 53), 0.3);
      }

      .clipboard-delete-btn {
        background: #f1f2f6;
        color: #636e72;
      }

      .clipboard-delete-btn:hover {
        background: #ff7675;
        color: white;
      }

      .clipboard-empty {
        text-align: center;
        padding: 40px 20px;
        color: #b2bec3;
      }

      .clipboard-empty-icon {
        font-size: 48px;
        margin-bottom: 10px;
      }

      .clipboard-empty-hint {
        font-size: 12px;
        margin-top: 5px;
      }
    `;

    document.head.appendChild(style);
  }

  // Вспомогательная функция для экранирования HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Инициализация
  function init() {
    loadMessages();
    addStyles();

    // Запускаем вставку кнопки только один раз при загрузке
    setTimeout(() => insertButton(), 500);

    // Сбрасываем состояние при смене чата
    let lastUrl = location.href;
    const urlObserver = new MutationObserver(() => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        // Пытаемся вставить кнопку при смене URL
        setTimeout(() => insertButton(), 500);
      }
    });
    urlObserver.observe(document.body, { childList: true, subtree: true });

    // Периодическая проверка на случай если кнопка пропала
    setInterval(() => {
      if (!document.querySelector('.clipboard-buffer-btn')) {
        insertButton();
      }
    }, 3000);


  }

  // Запуск после загрузки DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
