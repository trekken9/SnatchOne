  const mkAhtSwitch = (label, getter, setter) =>
    mkToggleRow(label,
      cb => chrome.storage.local.get(AHT_KEY, r => cb(getter(r[AHT_KEY]||{}))),
      v  => chrome.storage.local.get(AHT_KEY, r => {
        const s = Object.assign({}, r[AHT_KEY]||{}); setter(s, v); chrome.storage.local.set({[AHT_KEY]:s});
      })
    );

  container.append(mkCard("Snatch Функции",
    mkAhtSwitch("Chat Credits",           s => !!(s.modules||{}).chatCredits,        (s,v) => { s.modules=Object.assign({},s.modules||{}); s.modules.chatCredits=v; }),
    mkAhtSwitch("Local Time",             s => !!(s.modules||{}).localTime,          (s,v) => { s.modules=Object.assign({},s.modules||{}); s.modules.localTime=v; }),
    mkAhtSwitch("Затемнение неактивных",  s => !!(s.features||{}).inactiveChatLabels,(s,v) => { s.features=Object.assign({},s.features||{}); s.features.inactiveChatLabels=v; }),
    mkAhtSwitch("Бейдж Personal (P)",     s => !!(s.features||{}).personalBadge,     (s,v) => { s.features=Object.assign({},s.features||{}); s.features.personalBadge=v; }),
    mkAhtSwitch("Таймер Personal",        s => !!(s.features||{}).personalTimer,     (s,v) => { s.features=Object.assign({},s.features||{}); s.features.personalTimer=v; }),
    mkAhtSwitch("Подсветка лимита 10-2",  s => !!(s.features||{}).chatLimitHighlight,(s,v) => { s.features=Object.assign({},s.features||{}); s.features.chatLimitHighlight=v; }),
  ));

  container.append(limCard);

  // Инициализируем режим
  limGet("limMode", "color", mode => setModeUI(mode));

  e.append(container);
}

function renderInfo(e) {
  e.innerHTML = "";

  const settings = loadSet();
  const expSec = getExpSecMem();
  const opId = settings.operatorId || "Не определён";
  const authKey = settings.authKey || "Не введен";

  const container = elt("div", {
    style:
      "padding: 20px; display: flex; flex-direction: column; gap: 20px; color: #2d3436;",
  });

  // Блок 1: Оператор
  const operatorBox = elt(
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
      "Оператор",
    ),
    elt(
      "div",
      { style: "font-size: 24px; font-weight: bold; color: #0984e3;" },
      `ID: ${opId}`,
    ),
  );

  // Блок 2: Лицензия
