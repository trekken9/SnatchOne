(() => {
  'use strict';

  let allMessages = [];
  let currentMatchIndex = 0;
  let matchedIndices = [];
  let isLoading = false;
  let isLoaded = false;
  let currentChatId = null;

  function addStyles() {
    if (document.getElementById('chat-search-styles')) return;
    const style = document.createElement('style');
    style.id = 'chat-search-styles';
    style.textContent = `
      .chat-search-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 32px;
        height: 32px;
        padding: 0 8px;
        background: #f5f5f5;
        color: #666;
        border: 1px solid #ddd;
        border-radius: 16px;
        font-size: 16px;
        cursor: pointer;
        transition: all 0.3s ease;
        margin: 0 4px;
        white-space: nowrap;
      }
      .chat-search-btn:hover { 
        background: #e8e8e8;
        border-color: #ccc;
      }
      .chat-search-btn.loading { 
        background: #fff9e6;
        color: #ff9800;
        border-color: #ffe0b2;
        font-size: 12px;
        font-weight: 500;
        padding: 0 10px;
      }
      .chat-search-btn.loaded { 
        background: #e8f5e9;
        color: #4caf50;
        border-color: #c8e6c9;
      }

      #chat-search-modal {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.4);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      #chat-search-modal.show {
        display: flex;
      }

      .chat-search-window {
        background: #fff;
        border-radius: 8px;
        width: 90%;
        max-width: 800px;
        height: 80vh;
        max-height: 600px;
        display: flex;
        flex-direction: column;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        overflow: hidden;
      }

      .chat-search-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid #e0e0e0;
        background: #fafafa;
      }

      .chat-search-title {
        font-size: 16px;
        font-weight: 600;
        color: #333;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .chat-search-close {
        width: 28px;
        height: 28px;
        border-radius: 4px;
        background: transparent;
        border: none;
        color: #666;
        font-size: 20px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }

      .chat-search-close:hover {
        background: #e0e0e0;
      }

      .chat-search-controls {
        display: flex;
        gap: 8px;
        padding: 12px 20px;
        border-bottom: 1px solid #e0e0e0;
        background: #fff;
        align-items: center;
      }

      .chat-search-input {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
        font-family: inherit;
        outline: none;
        transition: border-color 0.2s;
      }

      .chat-search-input:focus {
        border-color: #999;
      }

      .chat-search-nav {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .chat-search-nav-btn {
        width: 32px;
        height: 32px;
        border-radius: 4px;
        background: #f5f5f5;
        border: 1px solid #ddd;
        color: #666;
        font-size: 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }

      .chat-search-nav-btn:hover {
        background: #e8e8e8;
      }

      .chat-search-counter {
        font-size: 12px;
        color: #666;
        min-width: 50px;
        text-align: center;
        font-weight: 500;
        margin: 0 4px;
      }
      
      .chat-search-download-btn {
        width: 36px;
        height: 32px;
        border-radius: 4px;
        background: #f5f5f5;
        border: 1px solid #ddd;
        color: #666;
        font-size: 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        margin-left: 4px;
      }
      
      .chat-search-download-btn:hover {
        background: #e8e8e8;
      }

      .chat-search-content {
        flex: 1;
        overflow-y: auto;
        padding: 16px 20px;
        background: #fff;
      }

      .chat-search-content::-webkit-scrollbar {
        width: 6px;
      }

      .chat-search-content::-webkit-scrollbar-thumb {
        background: #ccc;
        border-radius: 3px;
      }

      .chat-message {
        display: flex;
        flex-direction: column;
        margin-bottom: 12px;
      }

      .chat-message.me {
        align-items: flex-end;
      }

      .chat-message-bubble {
        max-width: 70%;
        padding: 8px 12px;
        border-radius: 8px;
        word-break: break-word;
        transition: all 0.2s;
      }

      .chat-message.me .chat-message-bubble {
        background: #e3f2fd;
        color: #333;
      }

      .chat-message:not(.me) .chat-message-bubble {
        background: #f5f5f5;
        color: #333;
      }

      .chat-message-bubble.highlight {
        box-shadow: 0 0 0 2px #ffc107;
      }

      .chat-message-meta {
        font-size: 11px;
        color: #999;
        margin-top: 4px;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .chat-message-text mark {
        background: #fff59d;
        padding: 1px 3px;
        border-radius: 2px;
      }

      .chat-date-separator {
        text-align: center;
        margin: 16px 0;
      }

      .chat-date-separator span {
        background: #f0f0f0;
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 11px;
        color: #666;
        font-weight: 500;
      }

      .chat-search-empty {
        text-align: center;
        padding: 60px 20px;
        color: #999;
      }

      .chat-search-empty-icon {
        font-size: 48px;
        margin-bottom: 12px;
        opacity: 0.5;
      }
      
      .chat-message-media {
        margin-bottom: 6px;
        border-radius: 6px;
        overflow: hidden;
      }
      
      .chat-message-media img {
        max-width: 100%;
        max-height: 200px;
        display: block;
        border-radius: 6px;
      }
      
      .chat-message-media-placeholder {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px;
        background: rgba(0, 0, 0, 0.05);
        border-radius: 4px;
        font-size: 12px;
        color: #666;
      }
    `;
    document.head.appendChild(style);
  }

  function escHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function tsDate(obj) {
    const raw = obj?.date_created || obj?.created_at || obj?.date || 0;
    const v = typeof raw === "number" && raw > 0 && raw < 1e10 ? raw * 1000 : raw;
    return new Date(v || 0);
  }

  async function loadChatData(chatId, progressCallback) {
    if (isLoading) return;

    isLoading = true;
    allMessages = [];
    currentChatId = chatId;

    const token = localStorage.getItem("token") || "";
    if (!token) {
      alert("Не найден токен. Перезайдите на сайт.");
      isLoading = false;
      return;
    }

    const hdr = { "Content-Type": "application/json", Authorization: "Bearer " + token };

    // Функция для fetch через page-bridge
    const pageFetchJson = async (url, options) => {
      const id = "cs_" + Math.random().toString(36).slice(2);
      const timeout = options.timeout || 8000;

      const promise = new Promise((resolve, reject) => {
        const handler = (e) => {
          const data = e.data;
          if (data && data.src === "SN_PAGE" && data.type === "SN_FETCH_RES" && data.id === id) {
            window.removeEventListener("message", handler);
            if (data.ok) {
              const text = new TextDecoder().decode(
                Uint8Array.from(atob(data.bodyBase64), c => c.charCodeAt(0))
              );
              resolve({ status: data.status, headers: data.headers, json: JSON.parse(text) });
            } else {
              reject(new Error(data.error || "fetch failed"));
            }
          }
        };

        window.addEventListener("message", handler);
        setTimeout(() => {
          window.removeEventListener("message", handler);
          reject(new Error("timeout"));
        }, timeout);
      });

      window.postMessage({
        src: "SN_SW",
        type: "SN_FETCH_REQ",
        id: id,
        path: url,
        method: options.method || "GET",
        headers: options.headers || {},
        bodyBase64: options.body ? btoa(
          new TextEncoder().encode(options.body)
            .reduce((acc, byte) => acc + String.fromCharCode(byte), "")
        ) : null,
      }, location.origin);

      return promise;
    };

    let manId = null, womanId = null, manName = "Man", womanName = "Woman";

    // Загружаем чат
    const fetchChatPage = (pg) =>
      pageFetchJson("/api/chatList/chatHistory", {
        method: "POST",
        headers: hdr,
        body: JSON.stringify({ chat_id: chatId, page: pg }),
      });

    try {
      for (let pg = 1; ; pg += 2) {
        const [r1, r2] = await Promise.allSettled([fetchChatPage(pg), fetchChatPage(pg + 1)]);
        let hasData = false;

        for (const res of [r1, r2]) {
          if (res.status !== "fulfilled" || !res.value?.json?.status) continue;
          const list = Array.isArray(res.value.json.response) ? res.value.json.response : [];
          if (list.length === 20) hasData = true;

          for (const msg of list) {
            if (!manId || !womanId) {
              const ml = msg.is_male === 1 || msg.is_male === true;
              if (ml) {
                manId = manId || msg.sender_external_id;
                womanId = womanId || msg.recipient_external_id;
                if (msg.sender_name) manName = msg.sender_name;
              } else {
                womanId = womanId || msg.sender_external_id;
                manId = manId || msg.recipient_external_id;
                if (msg.sender_name) womanName = msg.sender_name;
              }
            }

            const isMale = msg.is_male === 1 || msg.is_male === true;
            const ts = tsDate(msg);
            const mtype = (msg.message_type || "").toUpperCase();

            if (mtype === "SENT_TEXT") {
              const text = (msg.message_content || "").trim();
              if (text) allMessages.push({ ts, author: isMale ? manName : womanName, isMe: !isMale, text, kind: "chat" });
            } else if (mtype.includes("DELETED") || msg.is_deleted) {
              allMessages.push({ ts, author: isMale ? manName : womanName, isMe: !isMale, text: "", kind: "chat", deleted: true });
            }
          }
        }

        // Обновляем прогресс
        if (progressCallback) {
          progressCallback({ type: 'chat', count: allMessages.length });
        }

        if (!hasData) break;
      }

      // Загружаем письма
      if (manId && womanId) {
        const fetchMailPage = (pg) =>
          pageFetchJson("/api/mailbox/mails", {
            method: "POST",
            headers: hdr,
            body: JSON.stringify({ user_id: womanId, folder: "dialog", man_id: manId, page: pg }),
          });

        const firstMail = await fetchMailPage(1).catch(() => null);
        if (firstMail?.json?.status) {
          const totalPages = firstMail.json.response?.pages || 1;
          const allEntries = [...(firstMail.json.response?.mails || [])];

          for (let pg = 2; pg <= totalPages; pg += 2) {
            const [r1, r2] = await Promise.allSettled([
              fetchMailPage(pg),
              pg + 1 <= totalPages ? fetchMailPage(pg + 1) : Promise.resolve(null),
            ]);
            for (const res of [r1, r2]) {
              if (res.status === "fulfilled" && res.value?.json?.status) {
                allEntries.push(...(res.value.json.response?.mails || []));
              }
            }

            // Обновляем прогресс
            if (progressCallback) {
              progressCallback({ type: 'letters', count: allEntries.length });
            }
          }

          for (const entry of allEntries) {
            const mail = entry?.mail || entry;
            if (!mail) continue;

            // Логируем первое письмо чтобы понять структуру
            if (allMessages.filter(m => m.kind === 'letter').length === 0) {
              console.log('[Chat Search] First mail object:', mail);
              console.log('[Chat Search] Mail keys:', Object.keys(mail));
              console.log('[Chat Search] sender_name:', mail.sender_name);
              console.log('[Chat Search] recipient_name:', mail.recipient_name);
              console.log('[Chat Search] is_male:', mail.is_male);
              console.log('[Chat Search] Woman name:', womanName, 'Woman ID:', womanId);
              console.log('[Chat Search] Man name:', manName, 'Man ID:', manId);
            }

            const ts = tsDate(mail);
            const text = (mail.message_content || "").trim();

            // Определяем отправителя по sender_external_id или sender_id
            const senderId = mail.sender_external_id || mail.sender_id;
            const recipientId = mail.recipient_external_id || mail.recipient_id;

            // isMe = true если письмо от девушки (womanId)
            const isMe = senderId === womanId;

            const sName = (mail.sender_name || "").trim();
            const authorName = isMe ? womanName : manName;

            console.log('[Chat Search] Letter from:', sName, 'senderId:', senderId, 'isMe:', isMe);

            // Ищем медиа в разных полях
            let mediaUrl = null;
            let mediaType = null;

            // Проверяем все возможные поля для фото
            const photoFields = ['photo_link', 'photo_url', 'image_url', 'photo', 'image', 'photoLink', 'imageUrl'];
            for (const field of photoFields) {
              if (mail[field]) {
                mediaUrl = mail[field];
                mediaType = 'image';
                console.log('[Chat Search] Found image in field:', field, mediaUrl);
                break;
              }
            }

            // Проверяем поля для видео
            if (!mediaUrl) {
              const videoFields = ['video_link', 'video_url', 'video', 'videoLink', 'videoUrl'];
              for (const field of videoFields) {
                if (mail[field]) {
                  mediaUrl = mail[field];
                  mediaType = 'video';
                  console.log('[Chat Search] Found video in field:', field, mediaUrl);
                  break;
                }
              }
            }

            // Проверяем общие поля для вложений
            if (!mediaUrl) {
              const attachFields = ['attachment_url', 'media_url', 'attachment', 'media', 'attachmentUrl', 'mediaUrl'];
              for (const field of attachFields) {
                if (mail[field]) {
                  mediaUrl = mail[field];
                  // Определяем тип по расширению
                  if (/\.(jpg|jpeg|png|gif|webp)$/i.test(mediaUrl)) {
                    mediaType = 'image';
                  } else if (/\.(mp4|webm|mov)$/i.test(mediaUrl)) {
                    mediaType = 'video';
                  }
                  console.log('[Chat Search] Found media in field:', field, mediaUrl, mediaType);
                  break;
                }
              }
            }

            // ВАЖНО: добавляем письмо даже если нет текста или медиа
            allMessages.push({
              ts,
              author: authorName,
              isMe,
              text,
              kind: "letter",
              mediaUrl,
              mediaType
            });
          }

          console.log('[Chat Search] Total letters loaded:', allEntries.length);
          console.log('[Chat Search] Letters added to messages:', allMessages.filter(m => m.kind === 'letter').length);
        }
      }

      allMessages.sort((a, b) => a.ts - b.ts);

      console.log('[Chat Search] Loading complete!');
      console.log('[Chat Search] Total messages:', allMessages.length);
      console.log('[Chat Search] Chat messages:', allMessages.filter(m => m.kind === 'chat').length);
      console.log('[Chat Search] Letter messages:', allMessages.filter(m => m.kind === 'letter').length);
      console.log('[Chat Search] Messages with media:', allMessages.filter(m => m.mediaUrl).length);

      isLoaded = true;
      isLoading = false;
    } catch (e) {
      console.error("[Chat Search] Error:", e);
      isLoading = false;
      throw e;
    }
  }

  function renderMessages(searchQuery = "") {
    const content = document.getElementById("chat-search-content");
    if (!content) return;

    content.innerHTML = "";
    currentMatchIndex = 0;
    matchedIndices = [];

    const q = searchQuery.trim().toLowerCase();

    if (allMessages.length === 0) {
      content.innerHTML = `
        <div class="chat-search-empty">
          <div class="chat-search-empty-icon">🔍</div>
          <div>Нет сообщений</div>
        </div>
      `;
      updateCounter();
      return;
    }

    // Если есть поисковый запрос - находим совпадения
    if (q) {
      allMessages.forEach((m, idx) => {
        if ((m.text || "").toLowerCase().includes(q)) {
          matchedIndices.push(idx);
        }
      });
    }

    const hlText = (text) => {
      if (!q || !text) return escHtml(text);
      const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
      return escHtml(text).replace(re, `<mark>$1</mark>`);
    };

    let lastDateStr = "";

    // Показываем ВСЕ сообщения
    allMessages.forEach((m, idx) => {
      const dateStr = m.ts.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });

      if (dateStr !== lastDateStr) {
        lastDateStr = dateStr;
        const sep = document.createElement("div");
        sep.className = "chat-date-separator";
        sep.innerHTML = `<span>${escHtml(dateStr)}</span>`;
        content.appendChild(sep);
      }

      const isMatch = q && matchedIndices.includes(idx);

      const msgDiv = document.createElement("div");
      msgDiv.className = `chat-message ${m.isMe ? "me" : ""}`;
      msgDiv.setAttribute("data-msg-index", idx);
      msgDiv.setAttribute("data-is-match", isMatch ? "true" : "false");

      const bubble = document.createElement("div");
      bubble.className = "chat-message-bubble";

      if (m.deleted) {
        bubble.innerHTML = `<span style="opacity:0.6;font-style:italic;">🗑 сообщение удалено</span>`;
      } else {
        let contentHtml = '';

        // Добавляем медиа если есть
        if (m.mediaType === 'image' && m.mediaUrl) {
          contentHtml += `<div class="chat-message-media"><img src="${escHtml(m.mediaUrl)}" alt="фото" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'chat-message-media-placeholder\\'><span>🖼</span><span>Фото недоступно</span></div>'" /></div>`;
        } else if (m.mediaType === 'video' && m.mediaUrl) {
          contentHtml += `<div class="chat-message-media-placeholder"><span>▶️</span><span>Видео</span></div>`;
        }

        // Добавляем текст если есть
        if (m.text) {
          contentHtml += `<div class="chat-message-text">${hlText(m.text)}</div>`;
        }

        bubble.innerHTML = contentHtml || `<span style="opacity:0.6;font-style:italic;">Медиа без текста</span>`;
      }

      const meta = document.createElement("div");
      meta.className = "chat-message-meta";
      const timeStr = m.ts.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      const kindBadge = m.kind === "letter" ? "Letter" : "";
      meta.innerHTML = `${escHtml(m.author)} ${kindBadge} · ${timeStr}`;

      msgDiv.appendChild(bubble);
      msgDiv.appendChild(meta);
      content.appendChild(msgDiv);
    });

    updateCounter();
  }

  function navigateSearch(direction) {
    if (matchedIndices.length === 0) return;

    currentMatchIndex += direction;
    if (currentMatchIndex < 0) currentMatchIndex = matchedIndices.length - 1;
    if (currentMatchIndex >= matchedIndices.length) currentMatchIndex = 0;

    updateCounter();

    const targetIndex = matchedIndices[currentMatchIndex];
    const content = document.getElementById("chat-search-content");
    const allBubbles = content.querySelectorAll('[data-msg-index]');

    let targetBubble = null;
    allBubbles.forEach(bubble => {
      const idx = parseInt(bubble.getAttribute('data-msg-index'));
      const msgBubble = bubble.querySelector('.chat-message-bubble');

      if (idx === targetIndex) {
        targetBubble = bubble;
        msgBubble.classList.add('highlight');
      } else {
        msgBubble.classList.remove('highlight');
      }
    });

    if (targetBubble) {
      targetBubble.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function updateCounter() {
    const counter = document.getElementById("chat-search-counter");
    if (!counter) return;

    if (matchedIndices.length > 0) {
      counter.textContent = `${currentMatchIndex + 1} / ${matchedIndices.length}`;
    } else {
      counter.textContent = "";
    }
  }

  function createModal() {
    if (document.getElementById("chat-search-modal")) return;

    const modal = document.createElement("div");
    modal.id = "chat-search-modal";
    modal.innerHTML = `
      <div class="chat-search-window">
        <div class="chat-search-header">
          <div class="chat-search-title">
            <span>🔍</span>
            <span>Поиск по переписке</span>
          </div>
          <button class="chat-search-close">×</button>
        </div>
        <div class="chat-search-controls">
          <input type="text" class="chat-search-input" placeholder="Введите ключевое слово для поиска..." id="chat-search-input">
          <div class="chat-search-nav">
            <button class="chat-search-nav-btn" id="chat-search-prev" title="Предыдущее">↑</button>
            <button class="chat-search-nav-btn" id="chat-search-next" title="Следующее">↓</button>
            <span class="chat-search-counter" id="chat-search-counter"></span>
          </div>
          <button class="chat-search-download-btn" id="chat-search-download" title="Скачать чат">💾</button>
        </div>
        <div class="chat-search-content" id="chat-search-content"></div>
      </div>
    `;

    document.body.appendChild(modal);

    // Обработчики
    modal.querySelector(".chat-search-close").addEventListener("click", () => {
      modal.classList.remove("show");
    });

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.remove("show");
      }
    });

    const input = document.getElementById("chat-search-input");
    input.addEventListener("input", () => {
      renderMessages(input.value);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        renderMessages(input.value);
      }
      if (e.key === "ArrowUp" && matchedIndices.length > 0) {
        e.preventDefault();
        navigateSearch(-1);
      }
      if (e.key === "ArrowDown" && matchedIndices.length > 0) {
        e.preventDefault();
        navigateSearch(1);
      }
    });

    document.getElementById("chat-search-prev").addEventListener("click", () => navigateSearch(-1));
    document.getElementById("chat-search-next").addEventListener("click", () => navigateSearch(1));

    document.getElementById("chat-search-download").addEventListener("click", () => {
      downloadChat();
    });
  }

  function downloadChat() {
    if (allMessages.length === 0) {
      alert("Нет сообщений для скачивания");
      return;
    }

    let textContent = "=== ПЕРЕПИСКА ===\n\n";
    let currentDate = "";

    allMessages.forEach(m => {
      const dateStr = m.ts.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });

      if (dateStr !== currentDate) {
        currentDate = dateStr;
        textContent += `\n--- ${dateStr} ---\n\n`;
      }

      const timeStr = m.ts.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      const kindLabel = m.kind === "letter" ? " [Letter]" : "";
      const authorLabel = `${m.author}${kindLabel}`;

      if (m.deleted) {
        textContent += `[${timeStr}] ${authorLabel}: [сообщение удалено]\n`;
      } else {
        if (m.mediaType === 'image' && m.mediaUrl) {
          textContent += `[${timeStr}] ${authorLabel}: [Фото: ${m.mediaUrl}]\n`;
        } else if (m.mediaType === 'video' && m.mediaUrl) {
          textContent += `[${timeStr}] ${authorLabel}: [Видео: ${m.mediaUrl}]\n`;
        }

        if (m.text) {
          textContent += `[${timeStr}] ${authorLabel}: ${m.text}\n`;
        }
      }
    });

    // Создаем и скачиваем файл
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat_${currentChatId}_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function createSearchButton() {
    const btn = document.createElement('button');
    btn.className = 'chat-search-btn';
    btn.textContent = '🔍';
    btn.title = 'Поиск по переписке';

    btn.addEventListener('click', async () => {
      // Если уже загружено - открываем модальное окно
      if (isLoaded) {
        createModal();
        const modal = document.getElementById("chat-search-modal");
        modal.classList.add("show");
        renderMessages();
        document.getElementById("chat-search-input").focus();
        return;
      }

      // Если сейчас загружается - игнорируем клик
      if (isLoading) {
        return;
      }

      // Начинаем загрузку
      btn.classList.add('loading');
      btn.textContent = '⏳';
      btn.title = 'Загрузка...';

      // Получаем chat_id из URL
      const match = /^https:\/\/alpha\.date\/(?:chance|chat)\/([a-z0-9-]+)$/i.exec(location.href);
      if (!match) {
        alert("Откройте чат чтобы использовать поиск");
        btn.classList.remove('loading');
        btn.textContent = '🔍';
        btn.title = 'Поиск по переписке';
        return;
      }

      const chatId = match[1];

      try {
        // Загружаем с прогрессом
        await loadChatData(chatId, (progress) => {
          if (progress.type === 'chat') {
            btn.textContent = `💬${progress.count}`;
            btn.title = `Загружено ${progress.count} сообщений...`;
          } else if (progress.type === 'letters') {
            btn.textContent = `✉${progress.count}`;
            btn.title = `Загружено ${progress.count} писем...`;
          }
        });

        // Загрузка завершена - показываем галочку
        btn.classList.remove('loading');
        btn.classList.add('loaded');
        btn.textContent = '✓';
        btn.title = 'Готово! Нажмите чтобы открыть поиск';

      } catch (error) {
        console.error('[Chat Search] Error loading data:', error);
        alert('Ошибка загрузки данных: ' + error.message);
        btn.classList.remove('loading');
        btn.textContent = '🔍';
        btn.title = 'Поиск по переписке';
        isLoading = false;
      }
    });

    return btn;
  }

  function insertButton() {
    // Ищем контейнер с кнопками чата
    let chatBottom = document.querySelector('[class*="styles_clmn_3_chat_bottom_nav"]');

    if (!chatBottom) {
      return false;
    }

    // Проверяем, есть ли уже кнопка поиска
    if (chatBottom.querySelector('.chat-search-btn')) {
      return true;
    }

    // Ищем первый div с иконками
    const iconsContainer = chatBottom.querySelector('div');
    if (!iconsContainer) {
      return false;
    }

    const searchBtn = createSearchButton();
    iconsContainer.appendChild(searchBtn);

    return true;
  }

  function init() {
    addStyles();

    // Запускаем вставку кнопки только один раз при загрузке
    setTimeout(() => insertButton(), 500);

    // Сбрасываем состояние при смене чата
    let lastUrl = location.href;
    const urlObserver = new MutationObserver(() => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        isLoaded = false;
        isLoading = false;
        allMessages = [];

        // Обновляем кнопку
        const btn = document.querySelector('.chat-search-btn');
        if (btn) {
          btn.classList.remove('loading', 'loaded');
          btn.textContent = '🔍';
        }

        setTimeout(() => insertButton(), 500);
      }
    });
    urlObserver.observe(document.body, { childList: true, subtree: true });

    // Периодическая проверка (реже, чтобы не создавать дубликаты)
    setInterval(() => {
      insertButton();
    }, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
