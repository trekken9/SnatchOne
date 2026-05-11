// Actions Sort Module - сортировка чатов по количеству действий через CSS
(function() {
  'use strict';

  if (window.__SNATCH_ACTIONS_SORT_LOADED__) return;
  window.__SNATCH_ACTIONS_SORT_LOADED__ = true;

  console.log('[Actions Sort] Module loading...');

  let sortEnabled = false;

  // Загружаем сохраненное состояние
  try {
    const saved = localStorage.getItem('snatch_actions_sort_enabled');
    if (saved !== null) {
      sortEnabled = saved === 'true';
      console.log('[Actions Sort] Loaded saved state:', sortEnabled);
    }
  } catch (e) {
    console.error('[Actions Sort] Error loading state:', e);
  }

  // Получить количество действий из чата
  function getActionCount(chatElement) {
    try {
      let total = 0;
      const container = chatElement.querySelector('.snatch-num-stack, .adb-chat-left-icons');
      if (container) {
        const badges = container.querySelectorAll('.snatch-num-badge');
        badges.forEach(badge => {
          const num = parseInt(badge.textContent, 10);
          if (!isNaN(num)) {
            total += num;
          }
        });
      }
      return total;
    } catch (e) {
      return 0;
    }
  }

  // Применить сортировку через CSS order
  function applySortOrder() {
    try {
      const chatList = document.querySelector('[data-testid="chat-list"]');
      if (!chatList) return;

      console.log('[Actions Sort] Applying CSS sort order...');

      // Добавляем flex display к списку
      chatList.style.display = 'flex';
      chatList.style.flexDirection = 'column';

      const allChildren = Array.from(chatList.children);
      const chats = [];
      const nonChats = [];

      allChildren.forEach(el => {
        if (el.querySelector('[data-testid="man-name"]')) {
          chats.push({
            element: el,
            count: getActionCount(el)
          });
        } else {
          nonChats.push(el);
        }
      });

      if (sortEnabled) {
        // Сортируем по убыванию
        chats.sort((a, b) => b.count - a.count);

        // Устанавливаем CSS order
        let order = 0;
        
        // Сначала не-чаты
        nonChats.forEach(el => {
          el.style.order = order++;
        });

        // Потом отсортированные чаты
        chats.forEach(item => {
          item.element.style.order = order++;
        });

        console.log('[Actions Sort] Applied sort order to', chats.length, 'chats');
      } else {
        // Убираем order - возвращаем к оригинальному порядку
        allChildren.forEach(el => {
          el.style.order = '';
        });
        console.log('[Actions Sort] Removed sort order');
      }
    } catch (e) {
      console.error('[Actions Sort] Error applying sort:', e);
    }
  }

  // Создание чекбокса Actions
  function createActionsFilter() {
    try {
      const filterContainer = document.querySelector('.styles_clmn_2_chat_top_filters_type__PQMzJ');
      if (!filterContainer) return;

      const existingButton = filterContainer.querySelector('[data-testid="actions-button"]');
      if (existingButton) {
        const checkbox = existingButton.querySelector('input[type="checkbox"]');
        if (checkbox && checkbox.checked !== sortEnabled) {
          checkbox.checked = sortEnabled;
        }
        return;
      }

      const label = document.createElement('label');
      label.className = 'MuiFormControlLabel-root MuiFormControlLabel-labelPlacementEnd css-1jaw3da';
      label.setAttribute('data-testid', 'actions-button');

      const checkboxSpan = document.createElement('span');
      checkboxSpan.className = 'MuiButtonBase-root MuiCheckbox-root MuiCheckbox-colorPrimary MuiCheckbox-sizeMedium PrivateSwitchBase-root MuiCheckbox-root MuiCheckbox-colorPrimary MuiCheckbox-sizeMedium MuiCheckbox-root MuiCheckbox-colorPrimary MuiCheckbox-sizeMedium css-zun73v';

      const checkbox = document.createElement('input');
      checkbox.className = 'PrivateSwitchBase-input css-1m9pwf3';
      checkbox.setAttribute('data-indeterminate', 'false');
      checkbox.type = 'checkbox';
      checkbox.name = 'actions';
      checkbox.checked = sortEnabled;

      const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      iconSvg.setAttribute('viewBox', '0 0 24 24');
      iconSvg.setAttribute('fill', 'currentColor');
      iconSvg.setAttribute('width', '18');
      iconSvg.setAttribute('height', '18');
      iconSvg.style.display = 'block';
      
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M3 13h4l3-9 4 18 3-9h4');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('fill', 'none');
      
      iconSvg.appendChild(path);

      const ripple = document.createElement('span');
      ripple.className = 'MuiTouchRipple-root css-w0pj6f';

      checkboxSpan.appendChild(checkbox);
      checkboxSpan.appendChild(iconSvg);
      checkboxSpan.appendChild(ripple);

      const labelText = document.createElement('span');
      labelText.className = 'MuiTypography-root MuiTypography-body1 MuiFormControlLabel-label css-9l3uo3';
      labelText.textContent = 'Act';

      label.appendChild(checkboxSpan);
      label.appendChild(labelText);

      filterContainer.appendChild(label);

      checkbox.addEventListener('change', function(e) {
        sortEnabled = this.checked;
        
        try {
          localStorage.setItem('snatch_actions_sort_enabled', sortEnabled ? 'true' : 'false');
        } catch (err) {
          console.error('[Actions Sort] Error saving state:', err);
        }
        
        console.log('[Actions Sort] Checkbox changed. Checked:', sortEnabled);
        applySortOrder();
      });

      console.log('[Actions Sort] Filter created with checked:', sortEnabled);
    } catch (e) {
      console.error('[Actions Sort] Error creating filter:', e);
    }
  }

  // Инициализация
  function init() {
    console.log('[Actions Sort] Initializing...');
    
    createActionsFilter();
    
    // Наблюдаем за появлением контейнера фильтров
    const filterObserver = new MutationObserver(() => {
      createActionsFilter();
      
      if (sortEnabled) {
        const chatList = document.querySelector('[data-testid="chat-list"]');
        if (chatList && chatList.children.length > 0) {
          setTimeout(() => applySortOrder(), 300);
        }
      }
    });

    const mainContent = document.querySelector('[class*="clmn_2"]') || document.body;
    filterObserver.observe(mainContent, {
      childList: true,
      subtree: true
    });
    
    // Применяем сортировку если была включена
    if (sortEnabled) {
      setTimeout(() => applySortOrder(), 1000);
    }
    
    setTimeout(createActionsFilter, 500);
    setTimeout(createActionsFilter, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('[Actions Sort] Module loaded');
})();
