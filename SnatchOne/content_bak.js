    {
      style:
        "background: #f8f9fa; padding: 15px; border-radius: 12px; border: 1px solid #dfe6e9;",
    },
    elt(
      "div",
      {
        style:
          "font-size: 12px; color: #636e72; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;",
      },
      "Оператор",
    ),
    elt(
      "div",
      { style: "font-size: 24px; font-weight: bold; color: #0984e3;" },
      `ID: ${opId}`,
    ),
  );

  // Блок 2: Лицензия
  let licenseColor = "var(--sa)"; // Зеленый
  let licenseText = "Активна";

  if (expSec <= 0) {
    licenseColor = "#d63031"; // Красный
    licenseText = "Истекла / Неактивна";
  } else if (expSec < 86400) {
    licenseColor = "#e17055"; // Оранжевый (меньше дня)
  }

  const licenseBox = elt(
    "div",
    {
      style:
        "background: #f8f9fa; padding: 15px; border-radius: 12px; border: 1px solid #dfe6e9;",
    },
    elt(
      "div",
      {
        style:
          "font-size: 12px; color: #636e72; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;",
      },
      "Лицензия",
    ),
    elt(
      "div",
      {
        style: `font-size: 18px; font-weight: 600; color: ${licenseColor}; margin-bottom: 5px;`,
      },
      licenseText,
    ),
    elt(
      "div",
      { style: "font-size: 14px; color: #2d3436;" },
      expSec > 0 ? `Осталось: ${fmtExp(expSec)}` : "Требуется продление",
    ),
  );

  // Блок 3: Система (Версия и ключ)
  const systemBox = elt(
    "div",
    {
      style: "margin-top: 10px; border-top: 1px solid #eee; padding-top: 15px;",
    },
    elt(
      "div",
      { style: "font-size: 13px; margin-bottom: 5px;" },
      elt(
        "span",
        { style: "color: #636e72; font-weight: 500;" },
        "Версия бота: ",
      ),
      elt(
        "span",
        { style: "color: #2d3436;" },
        chrome.runtime.getManifest().version,
      ),
    ),
    elt(
      "div",
      { style: "font-size: 13px;" },
      elt(
        "span",
        { style: "color: #636e72; font-weight: 500;" },
        "Ключ (hash): ",
      ),
      elt(
        "span",
        {
          style:
            "font-family: monospace; background: #eee; padding: 2px 6px; border-radius: 4px;",
        },
        authKey.slice(0, 8) + "...",
      ),
    ),
  );

  container.append(
    elt("h3", { style: "margin: 0 0 10px; font-size: 20px;" }, "ℹ️ Информация"),
    operatorBox,
    licenseBox,
    systemBox,
  );

  e.append(container);
}
function renderStats(e) {
  e.innerHTML = "";

  const container = elt("div", {
    style:
      "display:flex;flex-direction:column;align-items:center;padding:20px;gap:20px",
  });

  const title = elt(
    "h3",
    { style: "margin:0;color:#333" },
    "Статистика за сегодня (UTC)",
  );

  // Таблица статистики
  const table = elt("div", {
    style:
      "display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#ccc;border:1px solid #ccc;border-radius:8px;overflow:hidden;width:100%;max-width:400px",
  });

  function makeCell(label, valueId, color) {
    return [
      elt(
        "div",
        { style: "background:#fff;padding:12px;font-weight:600;color:#555" },
        label,
      ),
      elt(
        "div",
        {
          id: valueId,
          style: `background:#fff;padding:12px;font-weight:bold;font-size:18px;text-align:right;color:${color}`,
        },
        "0",
      ),
    ];
  }

  table.append(
    ...makeCell("💬 Инвайты (Chance)", "stat-chat", "#007aff"),
    ...makeCell("✉️ Письма (Letters)", "stat-letters", "#9c27b0"),
    ...makeCell("🅿️ Personal (Drop)", "stat-personal", "#6c5ce7"),
    ...makeCell("❌ Ошибки", "stat-errors", "#d32f2f"),
  );

  const utcTime = elt(
    "div",
    { id: "stat-time", style: "color:#999;font-size:12px" },
    "Time: --:--",
  );

  container.append(title, table, utcTime);
  e.append(container);

  // Функция обновления данных
  const update = () => {
    chrome.storage.local.get("snDailyStats", (res) => {
      const s = res.snDailyStats || { chat: 0, letters: 0, errors: 0 };
      const elChat = document.getElementById("stat-chat");
      const elLet = document.getElementById("stat-letters");
      const elPersonal = document.getElementById("stat-personal");
      const elErr = document.getElementById("stat-errors");
      const elTime = document.getElementById("stat-time");

      if (elChat) elChat.textContent = s.chat;
      if (elLet) elLet.textContent = s.letters;
      if (elPersonal) elPersonal.textContent = s.personal || 0;
      if (elErr) elErr.textContent = s.errors;

      if (elTime) {
        const now = new Date();
        elTime.textContent =
          "UTC Date: " +
          s.date +
          " | Time: " +
          now.toISOString().split("T")[1].split(".")[0];
      }
    });
  };

  // Запускаем обновление раз в секунду, пока вкладка открыта
  update();
  const interval = setInterval(() => {
    if (!document.getElementById("stat-chat"))
      clearInterval(interval); // Остановить, если ушли с вкладки
    else update();
  }, 1000);
}
// ===========================================
// Вкладка STOP LIST (Редизайн)
// ===========================================
function renderStopList(e) {
  const container = elt("div", {
    className: "ah-single-wrapper",
    style: "display:flex; flex-direction:column",
  });

  // Заголовок
  const header = elt(
    "div",
    { style: "display:flex; gap:15px; margin-bottom:20px; align-items:start" },
    elt("div", { style: "font-size:32px; line-height:1" }, "🛑"),
    elt(
      "div",
      {},
      elt(
        "div",
        { style: "font-size:16px; font-weight:700; color:#2d3436" },
        "Стоп-лист",
      ),
      elt(
        "div",
        { style: "font-size:13px; color:#636e72; margin-top:4px" },
        "ID мужчин, которым бот никогда не должен писать. Каждый с новой строки.",
      ),
    ),
  );

  // Поле ввода
  const textArea = elt("textarea", {
    id: "ah-stop-input",
    placeholder: "12345678\n87654321",
    value: loadStop(),
    spellcheck: false,
  });

  // Статус сохранения
  const statusLabel = elt(
    "div",
    {
      style:
        "text-align:right; font-size:12px; color:#b2bec3; margin-top:8px; font-weight:500; height:20px",
    },
    "Автосохранение",
  );

  textArea.oninput = (ev) => {
    const cleanVal = ev.target.value.replace(/[^\d\s]/g, "");
    if (cleanVal !== ev.target.value) ev.target.value = cleanVal;
    saveStop(cleanVal);

    statusLabel.textContent = "Сохранено ✓";
    statusLabel.style.color = "var(--sa)";
    clearTimeout(textArea._timer);
    textArea._timer = setTimeout(() => {
      statusLabel.textContent = "Автосохранение";
      statusLabel.style.color = "#b2bec3";
    }, 1000);
  };

  container.append(header, textArea, statusLabel);
  e.append(container);
}
function renderMain(e) {
  // Оборачиваем в контейнер с отступами
  const container = elt("div", { className: "ah-single-wrapper" });

  // --- КАРТОЧКА 1: ОСНОВНЫЕ НАСТРОЙКИ ---
  const settingsCard = elt("div", { className: "ah-card" });
  settingsCard.append(
    elt("div", { className: "ah-card-title" }, "⚙️ Основные настройки"),
  );

  const makeRow = (switchEl) => {
    // switchEl - это label, который возвращает makeSwitch.
    // Нам нужно немного переделать makeSwitch или просто стилизовать результат.
    // makeSwitch возвращает label flex row. Мы просто добавим ему класс для отступов.
    switchEl.style.marginBottom = "15px";
    return switchEl;
  };

  settingsCard.append(
    makeRow(makeSwitch("ah-activity", "Поддерживать онлайн активность", true)),
    makeRow(makeSwitch("ah-auto-enable", "Включать анкеты если они оффлайн", false)),
    makeRow(
      makeSwitch("ah-likes", "Автоматически закрывать лайки/винки", false),
    ),
    makeRow(makeSwitch("ah-lastlike", "Лайк в последнюю очередь", false)),
    makeRow(
      makeSwitch("ah-persons", "Игнорировать Personal (Wait-list)", true),
    ),
  );

  // --- КАРТОЧКА 2: РЕЖИМ ПИСЕМ ---
  const lettersCard = elt("div", {
    className: "ah-card",
    style: "border-color:var(--sa-light)",
  });
  lettersCard.append(
    elt(
      "div",
      { className: "ah-card-title", style: "color:var(--sa)" },
      "✉️ Режим Писем (Letters)",
    ),
  );

  lettersCard.append(
    makeRow(
      makeSwitch(
        "ah-useLetters",
        "Включить рассылку писем",
        false,
        "font-weight:600",
      ),
    ),
    numberInput("letterDelay", "Пауза перед письмом после инвайта (мин):", 10),
  );

  // --- КНОПКА ЗАПУСКА ---
  const startBtn = elt(
    "button",
    { id: "ah-start", onclick: toggleStart },
    "START BOT",
  );

  // Состояние кнопки
  const s = loadSet();
  if (s.running) {
    startBtn.classList.add("stop");
    startBtn.textContent = "STOP BOT";
  }

  // --- КНОПКА СБРОСА ИСТОРИИ ---
  const clearBtn = elt(
    "div",
    {
      style:
        "text-align:center; margin-top:15px; font-size:13px; color:#b2bec3; cursor:pointer; text-decoration:underline",
      onclick: () => {
        if (
          confirm(
            "Сбросить историю отправки (Stop List сессии + медиа)?\nБот начнет писать тем же людям заново и сможет отправлять те же фото/видео.",
          )
        ) {
          chrome.runtime.sendMessage({ cmd: "clearHistory" });
        }
      },
    },
    "♻ Сбросить историю текущей сессии",
  );

  container.append(settingsCard, lettersCard, startBtn, clearBtn);
  e.append(container);
}
const CATS = [
  "Global chat", // <--- Добавили новую вкладку
  "Like",
  "View",
  "Wink",
  "Tell me about yourself",
  "How your day going?",
  "Dont you mind talking bit?",
  "What are you up to?",
  "Post",
];
// --- КРАСИВЫЕ ИНВАЙТЫ (REDESIGN) ---
// --- КРАСИВЫЕ ИНВАЙТЫ (No Global, Auto-Select) ---
// --- ИНВАЙТЫ С ТАЙМЕРОМ ---
// ===========================================
// Вкладка INVITES (С Глобальным Черновиком)
// ===========================================

// Глобальное хранилище черновика (чтобы данные не стирались при смене анкет/вкладок)
const INV_DRAFT = {
  text: "",
  duration: 60,
  img: null,
  picFirst: false,
};
let invitesTimerInterval = null;

async function createProfileSidebar(
  container,
  activePid,
  onSelect,
  mode = "invite",
) {
  // mode: "invite" | "letter" | "media"

  // 1. Создаем структуру
  const layout = elt("div", { className: "ah-layout-split" });
  const sidebar = elt("div", { className: "ah-sidebar" });
  const content = elt("div", { className: "ah-main-content" });

  layout.append(sidebar, content);
  container.innerHTML = "";
  container.append(layout);

  // 2. Лоадер
  sidebar.innerHTML =
    "<div style='padding:10px;color:#999;text-align:center;font-size:12px'>Загрузка анкет...</div>";

  // 3. Загружаем профили
  const token = localStorage.getItem("token");
  if (!token) {
    sidebar.innerHTML = "<div style='color:red;padding:10px'>Нет токена</div>";
    return { sidebar, content };
  }

  try {
    const { json } = await pageFetchJson("/api/operator/profiles", {
      method: "GET",
      headers: { authorization: "Bearer " + token },
    });

    sidebar.innerHTML = "";

    if (!Array.isArray(json) || json.length === 0) {
      sidebar.innerHTML = "<div style='padding:10px'>Нет анкет</div>";
      return { sidebar, content };
    }

    // 4. Рендерим карточки
    json.forEach((p) => {
      const pid = String(p.external_id);
      const isActive = pid === String(activePid);

      // --- ЛОГИКА ИНДИКАТОРА ---
      let hasData = false;
      let titleText = "";

      if (mode === "letter") {
        // Режим писем: проверяем наличие писем
        const letters = loadLetters(pid);
        hasData = letters && letters.length > 0;
        titleText = hasData ? "Есть сохраненные письма" : "Нет писем";
      } else {
        // Режим инвайтов (по умолчанию): проверяем Global chat
        const invites = loadInv(pid);
        hasData = invites["Global chat"] && invites["Global chat"].length > 0;
        titleText = hasData ? "Есть инвайт в Global chat" : "Нет инвайта";
      }
      // -------------------------

      const card = elt("div", {
        className: `ah-profile-card ${isActive ? "active" : ""}`,
        onclick: () => {
          sidebar
            .querySelectorAll(".ah-profile-card")
            .forEach((el) => el.classList.remove("active"));
          card.classList.add("active");
          onSelect(pid);
        },
      });

      const avatarSrc =
        p.photo_link ||
        "https://alpha.date/static/media/profile_img_empty.0b3d6665cd1c1b51de71.jpg";

      const avatar = elt("img", {
        src: avatarSrc,
        className: "ah-p-avatar",
      });

      const info = elt(
        "div",
        { className: "ah-p-info" },
        elt("div", { className: "ah-p-name" }, `${p.name}, ${p.age}`),
        elt("div", { className: "ah-p-meta" }, `ID: ${pid}`),
      );

      // Индикатор с ID для обновления
      const status = elt("div", {
        id: `ah-status-${pid}`, // ВАЖНО: ID для поиска элемента
        className: `ah-p-status ${getProfileDotClass(hasData, mode)}`,
        title: titleText,
      });

      // Если режим Media, можно вообще скрыть кружок, или оставить логику инвайтов
      if (mode === "media") status.style.display = "none";

      card.append(avatar, info, status);
      sidebar.append(card);
    });

    if (!activePid && json.length > 0) {
      onSelect(String(json[0].external_id));
      sidebar.querySelector(".ah-profile-card")?.classList.add("active");
    }
  } catch (e) {
    sidebar.innerHTML = `<div style='color:red;padding:10px'>Ошибка: ${e.message}</div>`;
  }

  return { sidebar, content };
}

function renderInvites(e) {
  const cats = [
    "Global chat",
    "Like",
    "View",
    "Wink",
    "Tell me about yourself",
    "How your day going?",
    "Dont you mind talking bit?",
    "What are you up to?",
    "Post",
  ];

  let currentCat = ui.lastCat || cats[0];
  let s = loadSet();
  let currentPid = s.invProfile;

  // ПЕРЕДАЕМ "invite"
  const layoutPromise = createProfileSidebar(
    e,
    currentPid,
    (newPid) => {
      currentPid = newPid;
      s = loadSet();
      s.invProfile = newPid;
      saveSet(s);
      renderRightSide();
    },
    "invite",
  );

  let contentContainer = null;
  layoutPromise.then(({ content }) => {
    contentContainer = content;
    renderRightSide();
  });

  // Функция для мгновенного обновления кружочка
  function updateSidebarDot() {
    if (!currentPid) return;
    const all = loadInv(currentPid);
    const hasGlobal = all["Global chat"] && all["Global chat"].length > 0;
    const el = document.getElementById(`ah-status-${currentPid}`);
    if (el) {
      el.className = `ah-p-status ${hasGlobal ? (loadSet().running ? "ah-status-go" : "ah-status-warn") : "ah-status-none"}`;
      el.title = hasGlobal ? "Есть инвайт в Global chat" : "Нет инвайта";
    }
  }

  function renderRightSide() {
    if (!contentContainer) return;
    contentContainer.innerHTML = "";

    if (!currentPid) {
      contentContainer.innerHTML =
        "<div style='display:flex;height:100%;align-items:center;justify-content:center;color:#b2bec3;font-size:16px'>👈 Выберите анкету из списка</div>";
      return;
    }

    const allInvites = loadInv(currentPid);

    const tabsContainer = elt("div", { id: "inv-tabs" });
    cats.forEach((cat) => {
      const count = (allInvites[cat] || []).length;
      const btn = elt(
        "div",
        {
          className: `inv-tab ${cat === currentCat ? "active" : ""} ${count === 0 ? "empty" : ""}`,
          onclick: () => {
            currentCat = cat;
            ui.lastCat = cat;
            INV_DRAFT.text = "";
            renderRightSide();
          },
        },
        `${cat} ${count > 0 ? `(${count})` : ""}`,
      );
      tabsContainer.append(btn);
    });

    const invCharCount = elt("div", {
      style: "font-size:11px;color:#636e72;white-space:nowrap;",
    }, `${INV_DRAFT.text.length} / 300`);

    const inputArea = elt("textarea", {
      className: "ah-compose-area",
      placeholder: `Текст инвайта для "${currentCat}"...`,
      value: INV_DRAFT.text,
      oninput: (ev) => {
        INV_DRAFT.text = ev.target.value;
        const len = ev.target.value.length;
        const LIMIT = 300;
        invCharCount.textContent = `${len} / ${LIMIT}`;
        invCharCount.style.color = len > LIMIT ? "#e17055" : len > LIMIT * 0.85 ? "#fdcb6e" : "#636e72";
      },
    });

    const imgBtn = elt("div", {
      className: `ah-tool-btn ${INV_DRAFT.img ? "has-data" : ""}`,
      title: "Прикрепить фото",
      onclick: () => {
        openUniversalGallery(
          currentPid,
          (item) => {
            INV_DRAFT.img = item;
            renderRightSide();
          },
          1,
        );
      },
    });

    if (INV_DRAFT.img) {
      const isVid = INV_DRAFT.img.type === "video" || INV_DRAFT.img.type === "videos";
      const thumbSrc = isVid ? (INV_DRAFT.img.thumb_link || INV_DRAFT.img.thumb || INV_DRAFT.img.url) : makeThumb(INV_DRAFT.img.url);
      
      const thumbContainer = elt("div", {
        style: "position:relative;display:inline-block;width:24px;height:24px;"
      });
      
      const thumb = elt("img", {
        src: thumbSrc,
        style: "width:100%;height:100%;border-radius:4px;object-fit:cover;",
        loading: "lazy"
      });
      thumb.onerror = function() { this.style.display = "none"; };
      thumbContainer.append(thumb);
      
      // Добавляем иконку play для видео
      if (isVid) {
        thumbContainer.append(elt("div", {
          style: "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.25);pointer-events:none;font-size:10px;color:#fff;border-radius:4px;"
        }, "▶"));
      }
      
      const del = elt(
        "span",
        {
          style: "margin-left:5px;font-weight:bold;cursor:pointer",
          onclick: (ev) => {
            ev.stopPropagation();
            INV_DRAFT.img = null;
            renderRightSide();
          },
        },
        "×",
      );
      imgBtn.append(thumbContainer, elt("span", {}, isVid ? "Видео" : "Медиа"), del);
    } else {
      imgBtn.innerHTML = "<span>📷</span> <span>Медиа</span>";
    }

    const picFirstBtn = elt(
      "label",
      { className: "ah-tool-btn", style: "cursor:pointer" },
      elt("input", {
        type: "checkbox",
        checked: INV_DRAFT.picFirst,
        style: "margin-right:6px",
        onchange: (e) => (INV_DRAFT.picFirst = e.target.checked),
      }),
      "Media First",
    );

    const timeInput = elt("input", {
      type: "number",
      className: "ah-time-input",
      value: INV_DRAFT.duration,
      min: 1,
      oninput: (ev) => (INV_DRAFT.duration = parseInt(ev.target.value) || 60),
    });
    const timeTool = elt(
      "div",
      { className: "ah-tool-btn", style: "cursor:default;background:none" },
      "⏱",
      timeInput,
      "мин",
    );

    // --- ОБЩАЯ ФУНКЦИЯ ДОБАВЛЕНИЯ ИНВАЙТА ---
    const handleAddInvite = () => {
      const txt = INV_DRAFT.text.trim();
      if (!txt && !INV_DRAFT.img) return;
      const newItem = {
        text: txt,
        media: INV_DRAFT.img,
        picFirst: INV_DRAFT.picFirst,
        duration: INV_DRAFT.duration,
      };
      if (!allInvites[currentCat]) allInvites[currentCat] = [];

      // Режим редактирования
      if (INV_DRAFT._editIdx !== undefined) {
        allInvites[currentCat][INV_DRAFT._editIdx] = newItem;
        delete INV_DRAFT._editIdx;
      } else {
        allInvites[currentCat].push(newItem);
      }
      saveInv(allInvites, currentPid);
      if (currentCat === "Global chat") updateSidebarDot();
      INV_DRAFT.text = ""; INV_DRAFT.img = null;
      renderRightSide();
    };

    // Привязываем отправку на Enter (без Shift)
    inputArea.onkeydown = (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault(); // Запрещаем перенос строки
        handleAddInvite();
      }
    };

    const toolbar = elt(
      "div",
      { className: "ah-compose-toolbar" },
      elt("div", { className: "ah-tool-group" }, imgBtn, picFirstBtn, timeTool),
      elt("div", { style: "display:flex;align-items:center;gap:8px;" },
        invCharCount,
        elt(
          "button",
          {
            className: "ah-send-btn",
            onclick: handleAddInvite,
          },
          "Добавить",
        ),
      ),
    );

    const composeBox = elt(
      "div",
      { className: "ah-compose-box" },
      inputArea,
      toolbar,
    );

    const listContainer = elt("div", {
      style: "display:flex; flex-direction:column;",
    });
    const items = allInvites[currentCat] || [];

    if (items.length > 0) {
      const clearAllBtn = elt(
        "div",
        {
          style:
            "align-self: flex-end; color: #ff7675; cursor: pointer; font-size: 12px; font-weight: 600; margin-bottom: 10px; display:flex; align-items:center; gap:4px; opacity: 0.8; transition: .2s",
          onclick: () => {
            if (
              confirm(
                `Удалить ВСЕ инвайты (${items.length} шт.) из категории "${currentCat}"?`,
              )
            ) {
              allInvites[currentCat] = [];
              saveInv(allInvites, currentPid);

              // ОБНОВЛЯЕМ КРУЖОЧЕК
              if (currentCat === "Global chat") updateSidebarDot();

              renderRightSide();
            }
          },
          onmouseover: (e) => (e.currentTarget.style.opacity = 1),
          onmouseout: (e) => (e.currentTarget.style.opacity = 0.8),
        },
        "🗑 Очистить категорию",
      );

      // Кнопка очистки Global Chat на ВСЕХ профилях
      const clearGlobalBtn = elt("div", {
        style: "align-self:flex-end;color:#e17055;cursor:pointer;font-size:12px;font-weight:600;margin-bottom:10px;margin-left:10px;display:flex;align-items:center;gap:4px;opacity:0.8;transition:.2s",
        onclick: () => {
          if (confirm("Очистить Global Chat инвайты на ВСЕХ анкетах?")) {
            const allInv = ahClone(AH_STORE.mem.invites || {});
            Object.keys(allInv).forEach(pid => { if (allInv[pid]) allInv[pid]["Global chat"] = []; });
            if (allInv.global) allInv.global["Global chat"] = [];
            AH_STORE.mem.invites = allInv;
            st.set({ [AH_STORE_KEYS.invites]: allInv });
            alert("✅ Global Chat очищен на всех анкетах!");
            renderRightSide();
          }
        },
        onmouseover: e => (e.currentTarget.style.opacity = 1),
        onmouseout: e => (e.currentTarget.style.opacity = 0.8),
      }, "🌍 Очистить Global Chat (все)");
      listContainer.append(clearGlobalBtn, clearAllBtn);
    }

    if (items.length === 0) {
      listContainer.innerHTML = `<div style="text-align:center;color:#b2bec3;padding:30px;border:2px dashed #f1f2f6;border-radius:12px">Список пуст. Добавьте первый инвайт выше ☝️</div>`;
    } else {
      items.forEach((item, idx) => {
        const txt = typeof item === "string" ? item : item.text;
        const img = typeof item === "object" ? item.media : null;
        const pFirst = typeof item === "object" ? item.picFirst : false;
        const dur =
          typeof item === "object" && item.duration ? item.duration : 60;

        const row = elt("div", { className: "inv-list-item", "data-idx": idx });

        if (img) {
          const isVid = img.type === "video" || img.type === "videos";
          const thumbSrc = isVid ? (img.thumb_link || img.thumb || img.url) : makeThumb(img.url);
          const imgEl = elt("img", { 
            className: "item-thumb", 
            src: thumbSrc,
            loading: "lazy",
            style: "cursor:pointer;"
          });
          // Обработка битых картинок
          imgEl.onerror = function() {
            this.style.display = "none";
          };
          
          // Клик для открытия в полный размер
          imgEl.onclick = () => {
            openLightbox({
              id: img.id,
              url: img.url,
              thumb: thumbSrc,
              type: isVid ? "videos" : "images"
            });
          };
          
          // Оборачиваем в контейнер для добавления иконки play
          const thumbContainer = elt("div", {
            style: "position:relative;display:inline-block;cursor:pointer;vertical-align:top;line-height:0;"
          });
          thumbContainer.append(imgEl);
          
          // Добавляем иконку play для видео
          if (isVid) {
            thumbContainer.append(elt("div", {
              style: "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.25);pointer-events:none;font-size:18px;color:#fff;"
            }, "▶"));
          }
          
          row.append(thumbContainer);
        }

        const metaLine = elt("div", { className: "item-meta" });
        if (img && pFirst)
          metaLine.append(elt("span", { className: "tag-green" }, "Media First"));
        const timerDiv = elt(
          "div",
          { className: "inv-timer", style: "display:none" },
          "",
        );
        metaLine.append(timerDiv);

        const contentDiv = elt(
          "div",
          { className: "item-content" },
          elt(
            "div",
            { className: "item-text" },
            txt || (img ? "Only Photo" : "Empty"),
          ),
          metaLine,
        );
        row.append(contentDiv);

        const timeEdit = elt("input", {
          type: "number",
          className: "ah-time-input",
          style: "width:45px;padding:2px;font-size:11px",
          value: dur,
          min: 1,
          onchange: (ev) => {
            if (typeof item !== "object")
              items[idx] = { text: item, duration: parseInt(ev.target.value) };
            else item.duration = parseInt(ev.target.value);
            saveInv(allInvites, currentPid);
          },
        });

        const delBtn = elt(
          "div",
          {
            className: "del-btn",
            title: "Удалить",
            onclick: () => {
              if (confirm("Удалить этот инвайт?")) {
                items.splice(idx, 1);
                saveInv(allInvites, currentPid);

                // ОБНОВЛЯЕМ КРУЖОЧЕК
                if (currentCat === "Global chat") updateSidebarDot();

                renderRightSide();
              }
            },
          },
          "×",
        );

        const editBtn = elt("div", {
          title: "Редактировать",
          style: "background:#74b9ff;color:#fff;font-size:16px;width:26px;height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;line-height:1;",
          onclick: () => {
            // Заполняем форму редактирования
            INV_DRAFT.text = txt;
            INV_DRAFT.img = img || null;
            INV_DRAFT.picFirst = pFirst;
            INV_DRAFT.duration = dur;
            INV_DRAFT._editIdx = idx; // помечаем что редактируем
            renderRightSide();
            // Скроллим к форме
            contentContainer.querySelector(".ah-compose-area")?.focus();
          },
        });
        editBtn.textContent = "✎";

        const actions = elt(
          "div",
          { className: "item-actions" },
          editBtn,
          delBtn,
          elt(
            "div",
            {
              style:
                "display:flex;align-items:center;gap:4px;font-size:10px;color:#b2bec3",
            },
            timeEdit,
            "мин",
          ),
        );

        row.append(actions);
        listContainer.append(row);
      });
    }

    contentContainer.append(tabsContainer, composeBox, listContainer);
    startInvitesTimer(currentPid, currentCat, items);
  }
}

// Новая функция для управления таймерами и подсветкой
function startInvitesTimer(pid, cat, items) {
  if (invitesTimerInterval) clearInterval(invitesTimerInterval);

  const tick = () => {
    // Получаем и состояние ротации, и время последнего пульса от сервера
    chrome.storage.local.get(["snRotationState", "snLastStatsTime"], (res) => {
      // 1. Очищаем старые состояния
      document.querySelectorAll(".inv-list-item").forEach((el) => {
        el.classList.remove("active-invite");
        const timerEl = el.querySelector(".inv-timer");
        if (timerEl) timerEl.style.display = "none";
      });

      // 2. Проверяем, запущен ли бот и жив ли сервер (нет ответа > 6 секунд)
      const s = loadSet();
      const isServerDead = Date.now() - (res.snLastStatsTime || 0) > 6000;

      if (!s.running || isServerDead) return; // Если стоп или сервер упал -> выходим

      // 3. Рисуем таймер
      const rotation = res.snRotationState || {};
      const key = `invite_${pid}_${cat}`;
      const state = rotation[key];

      if (!state) return;

      const activeIdx = state.index;
      const startTime = state.startTime;
      const activeEl = document.querySelector(
        `.inv-list-item[data-idx="${activeIdx}"]`,
      );

      if (activeEl) {
        activeEl.classList.add("active-invite");

        const item = items[activeIdx];
        let durationMin = 60;
        if (item && typeof item === "object" && item.duration) {
          durationMin = parseInt(item.duration) || 60;
        }

        const elapsedMs = Date.now() - startTime;
        let remainingMs = durationMin * 60 * 1000 - elapsedMs;
        if (remainingMs < 0) remainingMs = 0;

        const min = Math.floor(remainingMs / 60000);
        const sec = Math.floor((remainingMs % 60000) / 1000);
        const timeStr = `${min}:${sec.toString().padStart(2, "0")}`;

        const timerEl = activeEl.querySelector(".inv-timer");
        if (timerEl) {
          timerEl.textContent = timeStr;
          timerEl.style.display = "block";
        }
      }
    });
  };

  tick();
  invitesTimerInterval = setInterval(tick, 1000);
}
function setStatus(e) {
  const t = document.getElementById("ah-status");
  t &&
    ((t.textContent = e ? "Бот запущен" : "Бот остановлен"),
    (t.style.color = e ? "#4caf50" : "#d32f2f"));
}
async function toggleStart() {
