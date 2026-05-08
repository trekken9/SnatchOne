let ahChatStop = !1,
  ahMailStop = !1,
  invSelectedImg = null,
  galleryCache = {},
  port = null,
  timer = null;
const PING_INTERVAL = 25e3;
let AH_BRIDGE_READY = !1;
window.addEventListener("message", (e) => {
  const t = e.data;
  t && "SN_PAGE" === t.src && "SN_READY" === t.type && (AH_BRIDGE_READY = !0);
});

// ═══════════════════════════════════════════════════════════
// LOGIN HOOK: извлекаем operator_id из JWT токена в localStorage
// JWT содержит поле "id" которое соответствует operator_id
// ═══════════════════════════════════════════════════════════
function extractOperatorIdFromJwt() {
  try {
    const token = localStorage.getItem("token");
    if (!token || !token.startsWith("eyJ")) return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.id || null;
  } catch { return null; }
}

function syncOperatorId() {
  const opId = extractOperatorIdFromJwt();
  if (opId) {
    chrome.runtime.sendMessage({ type: "loginHooked", operator_id: opId, token: localStorage.getItem("token") || "" }).catch(() => {});
    chrome.storage.local.set({ snHookedOperatorId: String(opId) });
  }
}
const AH_BASE = "Snatch 💸",
  $ = (e) => document.querySelector(e),
  $$ = (e) => [...document.querySelectorAll(e)],
  css = (e) => {
    const t = document.createElement("style");
    ((t.textContent = e), document.head.appendChild(t));
  };

// ─── THEME SYSTEM ────────────────────────────────────────────────────────────
const SNATCH_THEME_KEY = "snatch_theme_color";
const SNATCH_THEME_PRESETS = [
  { color: "#FF6B35", name: "Orange" },
  { color: "#0984e3", name: "Blue" },
  { color: "#6c5ce7", name: "Purple" },
  { color: "#00b894", name: "Green" },
  { color: "#e17055", name: "Coral" },
  { color: "#fd79a8", name: "Pink" },
  { color: "#00cec9", name: "Teal" },
  { color: "#f39c12", name: "Yellow" },
  { color: "#2d3436", name: "Dark" },
];
function _hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}
function applySnatchTheme(hex) {
  hex = hex || localStorage.getItem(SNATCH_THEME_KEY) || "#FF6B35";
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) hex = "#FF6B35";
  const { r, g, b } = _hexToRgb(hex);
  // Light pastel bg (12% of accent + 88% white)
  const lr = Math.round(r * 0.12 + 255 * 0.88);
  const lg = Math.round(g * 0.12 + 255 * 0.88);
  const lb = Math.round(b * 0.12 + 255 * 0.88);
  // Gradient alt (slightly lighter/shifted)
  const ar = Math.min(255, Math.round(r * 1.08 + 6));
  const ag = Math.min(255, Math.round(g * 1.03 + 4));
  const ab = Math.min(255, Math.round(b * 0.92));
  let st = document.getElementById("snatch-theme-vars");
  if (!st) {
    st = document.createElement("style");
    st.id = "snatch-theme-vars";
    document.head.appendChild(st);
  }
  st.textContent = `:root {
    --sa: ${hex};
    --sa-rgb: ${r},${g},${b};
    --sa-light: rgb(${lr},${lg},${lb});
    --sa-alt: rgb(${ar},${ag},${ab});
  }`;
  localStorage.setItem(SNATCH_THEME_KEY, hex);
}
// Apply saved theme immediately
applySnatchTheme(localStorage.getItem(SNATCH_THEME_KEY) || "#FF6B35");
// ─────────────────────────────────────────────────────────────────────────────
// ─── PROFILE DOT HELPER ──────────────────────────────────────────────────────
function getProfileDotClass(hasData, mode) {
  if (!hasData) return "ah-status-none";            // серый — нет данных
  const s = loadSet();
  if (!s || !s.running) return "ah-status-warn";    // оранжевый — данные есть, бот стоит
  return "ah-status-go";                            // зелёный — всё активно
}
// ─────────────────────────────────────────────────────────────────────────────
function elt(e, t = {}, ...n) {
  const o = document.createElement(e);
  for (const [e, n] of Object.entries(t))
    e in o ? (o[e] = n) : o.setAttribute(e, n);
  return (
    n.flat().forEach((e) => {
      null != e && !1 !== e && o.append(e);
    }),
    o
  );
}
async function getCf() {
  try {
    return (await chrome.runtime.sendMessage("getCookies")).cf;
  } catch {
    return "";
  }
}
async function sha1(e) {
  const t = new TextEncoder().encode(e),
    n = await crypto.subtle.digest("SHA-1", t);
  return [...new Uint8Array(n)]
    .map((e) => e.toString(16).padStart(2, "0"))
    .join("");
}
let wsKeepPort = null;
chrome.runtime.onConnect.addListener((e) => {
  "SN_WS_KEEP" === e.name &&
    ((wsKeepPort = e),
    e.onMessage.addListener(() => {}),
    e.onDisconnect.addListener(() => {
      try {
        chrome.runtime.lastError;
      } catch {}
      wsKeepPort = null;
    }));
});
const AH_STORE_KEYS = {
    set: "snSet",
    invites: "snInv",
    letters: "snLetters",
    stop: "snStop",
    exp: "snExpSec",
    migrated: "snMigratedV2",
  },
  AH_TMP_HEAVY = ["snStatsDaily", "snFTResume"],
  AH_STORE = {
    ready: !1,
    readyPromise: null,
    mem: { set: { invProfile: null }, invites: {}, stop: "", exp: 0 },
  },
  st = {
    get: (e) => new Promise((t) => chrome.storage.local.get(e, t)),
    set: (e) =>
      new Promise((t) =>
        chrome.storage.local.set(e, () => t(!chrome.runtime.lastError)),
      ),
    remove: (e) =>
      new Promise((t) =>
        chrome.storage.local.remove(e, () => t(!chrome.runtime.lastError)),
      ),
    bytes: (e = null) =>
      new Promise((t) =>
        chrome.storage.local.getBytesInUse(e, (e) => t(e || 0)),
      ),
  };
function ahClone(e) {
  try {
    return structuredClone(e);
  } catch {
    return JSON.parse(JSON.stringify(e));
  }
}
async function tryMigrateFromSiteLS() {
  let e = null,
    t = "",
    n = 0,
    o = {};
  try {
    e = JSON.parse(localStorage.getItem("alphaHelperSettings") || "null");
  } catch {}
  const a = !!localStorage.getItem("alphaHelperInvites");
  try {
    t = localStorage.getItem("alphaHelperStop") || "";
  } catch {}
  try {
    n = parseInt(localStorage.getItem("alphaHelperExpSec") || "", 10) || 0;
  } catch {}
  try {
    for (const e of Object.keys(localStorage))
      if (e.startsWith("alphaHelperInvites") && "alphaHelperInvites" !== e) {
        const t = e.slice(18);
        try {
          const n = JSON.parse(localStorage.getItem(e) || "null");
          n && Object.keys(n).length && (o[String(t)] = n);
        } catch {}
      }
  } catch {}
  if (a)
    try {
      const e = JSON.parse(
        localStorage.getItem("alphaHelperInvites") || "null",
      );
      e && Object.keys(e).length && (o.global = e);
    } catch {}
  if (!(e || Object.keys(o).length || t || n)) return !1;
  await st.remove(AH_TMP_HEAVY);
  const i = {};
  (e && (i[AH_STORE_KEYS.set] = e),
    (i[AH_STORE_KEYS.invites] = o),
    (i[AH_STORE_KEYS.stop] = String(t || "")),
    (i[AH_STORE_KEYS.exp] = Number(n) || 0));
  if (!(await st.set(i))) return !1;
  const r = await st.get([
    AH_STORE_KEYS.set,
    AH_STORE_KEYS.invites,
    AH_STORE_KEYS.stop,
    AH_STORE_KEYS.exp,
  ]);
  if (
    !!(
      (!r[AH_STORE_KEYS.set] && e) ||
      Object.keys(r[AH_STORE_KEYS.invites] || {}).length !==
        Object.keys(o || {}).length ||
      String(r[AH_STORE_KEYS.stop] || "") !== String(t || "") ||
      (Number(r[AH_STORE_KEYS.exp]) || 0) !== (Number(n) || 0)
    )
  )
    return !1;
  await st.set({ [AH_STORE_KEYS.migrated]: !0 });
  try {
    localStorage.removeItem("alphaHelperSettings");
  } catch {}
  try {
    localStorage.removeItem("alphaHelperInvites");
  } catch {}
  try {
    localStorage.removeItem("alphaHelperStop");
  } catch {}
  try {
    localStorage.removeItem("alphaHelperExpSec");
  } catch {}
  try {
    for (const e of Object.keys(localStorage))
      e.startsWith("alphaHelperInvites") &&
        "alphaHelperInvites" !== e &&
        localStorage.removeItem(e);
  } catch {}
  return !0;
}
async function tryRescueFromLastPayload() {
  const e = (await st.get(["snLastPayload"])).ahLastPayload;
  if (!e || "string" != typeof e) return !1;
  let t = null;
  try {
    t = JSON.parse(e);
  } catch {
    return !1;
  }
  const n = {
      lastLike: "lastlike",
      factTimeMsg: "facttimemsg",
      stopMaybe: "stopmaybe",
      stopSpecial: "stopspecial",
      persToMaybe: "perstomaybe",
      persToSpecial: "perstospecial",
      emptyChatsToFolder: "emptychatstofolder",
    },
    o = { invProfile: null },
    a = !!(t.timemin || (t.settings && t.settings.timemin));
  if (t.settings && "object" == typeof t.settings)
    for (const [e, i] of Object.entries(t.settings)) {
      const t = n[e] ?? e;
      if (("sendEvery" !== t && "mailEvery" !== t) || null == i)
        "timemin" !== t && (o[t] = i);
      else {
        const e = Number(i);
        o[t] = Number.isFinite(e) ? snapAhTimeMinutes(a ? e : 60 * e) : null;
      }
    }
  o.timemin = !0;
  const i = { global: t.invites || {} };
  for (const [e, n] of Object.entries(t)) {
    const t = /^invites(\d+)$/.exec(e);
    t && n && "object" == typeof n && (i[t[1]] = n);
  }
  const r = {
    [AH_STORE_KEYS.set]: o,
    [AH_STORE_KEYS.invites]: i,
    [AH_STORE_KEYS.stop]: String(t.stopList || ""),
    [AH_STORE_KEYS.migrated]: !0,
  };
  await st.remove(AH_TMP_HEAVY);
  return !!(await st.set(r));
}
async function initAhStore() {
  return (
    AH_STORE.readyPromise ||
      (AH_STORE.readyPromise = (async () => {
        const e = await st.get(Object.values(AH_STORE_KEYS));
        ((AH_STORE.mem.set = e[AH_STORE_KEYS.set] || { invProfile: null }),
          (AH_STORE.mem.invites = e[AH_STORE_KEYS.invites] || {}),
          (AH_STORE.mem.letters = e[AH_STORE_KEYS.letters] || {}), // <--- ДОБАВЛЕНО
          (AH_STORE.mem.stop =
            "string" == typeof e[AH_STORE_KEYS.stop]
              ? e[AH_STORE_KEYS.stop]
              : ""),
          (AH_STORE.mem.exp = Number.isFinite(e[AH_STORE_KEYS.exp])
            ? e[AH_STORE_KEYS.exp]
            : 0));
        if (
          e[AH_STORE_KEYS.set] ||
          e[AH_STORE_KEYS.invites] ||
          e[AH_STORE_KEYS.letters] || // <--- ДОБАВЛЕНО
          e[AH_STORE_KEYS.stop]
        )
          return void (AH_STORE.ready = !0);

        // Попытка миграции (старый код)
        if (!(await tryMigrateFromSiteLS())) {
          (await tryRescueFromLastPayload()) ||
            (await st.set({ [AH_STORE_KEYS.migrated]: !0 }));
        }

        // Повторная загрузка после миграции
        const t = await st.get(Object.values(AH_STORE_KEYS));
        ((AH_STORE.mem.set = t[AH_STORE_KEYS.set] || { invProfile: null }),
          (AH_STORE.mem.invites = t[AH_STORE_KEYS.invites] || {}),
          (AH_STORE.mem.letters = t[AH_STORE_KEYS.letters] || {}), // <--- ДОБАВЛЕНО
          (AH_STORE.mem.stop =
            "string" == typeof t[AH_STORE_KEYS.stop]
              ? t[AH_STORE_KEYS.stop]
              : ""),
          (AH_STORE.mem.exp = Number.isFinite(t[AH_STORE_KEYS.exp])
            ? t[AH_STORE_KEYS.exp]
            : 0),
          (AH_STORE.ready = !0));
      })()),
    AH_STORE.readyPromise
  );
}
initAhStore();
try {
  chrome.storage.onChanged.addListener((e, t) => {
    if ("local" !== t) return;
    const n = AH_STORE_KEYS;
    (e[n.set] &&
      (AH_STORE.mem.set = ahClone(e[n.set].newValue || { invProfile: null })),
      e[n.invites] &&
        (AH_STORE.mem.invites = ahClone(e[n.invites].newValue || {})),
      e[n.letters] && // <--- ДОБАВЛЕНО
        (AH_STORE.mem.letters = ahClone(e[n.letters].newValue || {})), // <--- ДОБАВЛЕНО
      e[n.stop] && (AH_STORE.mem.stop = String(e[n.stop].newValue || "")),
      e[n.exp] && (AH_STORE.mem.exp = Number(e[n.exp].newValue) || 0));
  });
} catch (e) {}
function loadLetters(id = null) {
  const key = id ? String(id) : "global";
  return ahClone((AH_STORE.mem.letters || {})[key] || []);
}
function saveLetters(list, id = null) {
  const key = id ? String(id) : "global";
  AH_STORE.mem.letters = AH_STORE.mem.letters || {};
  AH_STORE.mem.letters[key] = ahClone(list || []);
  st.set({ [AH_STORE_KEYS.letters]: AH_STORE.mem.letters });
}
function loadSet() {
  return ahClone(AH_STORE.mem.set || { invProfile: null });
}
function saveSet(e) {
  ((AH_STORE.mem.set = ahClone(e || { invProfile: null })),
    st.set({ [AH_STORE_KEYS.set]: AH_STORE.mem.set }));
}
function loadInv(e = null) {
  const t = e ? String(e) : "global";
  return ahClone((AH_STORE.mem.invites || {})[t] || {});
}
function saveInv(e, t = null) {
  const n = t ? String(t) : "global";
  ((AH_STORE.mem.invites = AH_STORE.mem.invites || {}),
    (AH_STORE.mem.invites[n] = ahClone(e || {})),
    st.set({ [AH_STORE_KEYS.invites]: AH_STORE.mem.invites }));
}
function loadStop() {
  return String(AH_STORE.mem.stop || "");
}
function saveStop(e) {
  ((AH_STORE.mem.stop = String(e || "")),
    st.set({ [AH_STORE_KEYS.stop]: AH_STORE.mem.stop }));
}
function getExpSecMem() {
  return Number(AH_STORE.mem.exp) || 0;
}
function setExpSecMem(e) {
  ((AH_STORE.mem.exp = Number(e) || 0),
    st.set({ [AH_STORE_KEYS.exp]: AH_STORE.mem.exp }));
}
async function pageFetchJson(
  e,
  { method: t = "GET", headers: n = {}, body: o = null, timeout: a = 8e3 } = {},
) {
  const i = "ah_" + Math.random().toString(36).slice(2),
    r = new Promise((e, t) => {
      const n = (o) => {
        const a = o.data;
        a &&
          "SN_PAGE" === a.src &&
          "SN_FETCH_RES" === a.type &&
          a.id === i &&
          (window.removeEventListener("message", n),
          a.ok ? e(a) : t(new Error(a.error || "page fetch failed")));
      };
      (window.addEventListener("message", n),
        setTimeout(() => {
          (window.removeEventListener("message", n), t(new Error("timeout")));
        }, a));
    });
  window.postMessage(
    {
      src: "SN_SW",
      type: "SN_FETCH_REQ",
      id: i,
      path: e,
      method: t,
      headers: n,
      bodyBase64: o
        ? btoa(
            new TextEncoder()
              .encode(o)
              .reduce((e, t) => e + String.fromCharCode(t), ""),
          )
        : null,
    },
    location.origin,
  );
  const s = await r,
    l = new TextDecoder().decode(
      Uint8Array.from(atob(s.bodyBase64), (e) => e.charCodeAt(0)),
    );
  return { status: s.status, headers: s.headers, text: l, json: JSON.parse(l) };
}
function makeThumb(e) {
  const t = e.split("/"),
    n = t.pop();
  return [...t, `w-250-h-250-${n}`].join("/");
}
// ═══════════════════════════════════════════════════════════
// ОПТИМИЗАЦИЯ: LRU КЭШ ДЛЯ МЕДИА (TTL: 60 сек)
// ═══════════════════════════════════════════════════════════
const MEDIA_CACHE = new Map(); // profileId_type → { data, ts }
const MEDIA_CACHE_TTL = 60000; // 1 минута

async function fetchMedia(extId, type = "images") {
  // Проверяем кэш
  const cacheKey = `${extId}_${type}`;
  const cached = MEDIA_CACHE.get(cacheKey);
  
  if (cached && Date.now() - cached.ts < MEDIA_CACHE_TTL) {
    return cached.data;
  }
  
  const t = (localStorage.getItem("token") || "").trim(),
    n = t ? { Authorization: `Bearer ${t}` } : {};

  // type может быть "images" или "videos"
  const endpoint = type === "videos" ? "videos" : "images";

  const { json: o } = await pageFetchJson(
    `/api/files/${endpoint}?external_id=${extId}`,
    {
      method: "GET",
      headers: n,
    },
  );

  if (!o) return [];

  // Возвращаем массив.
  // API обычно возвращает { images: [...] } или { videos: [...] }
  // Мы приводим всё к единому формату
  const list = o.images || o.videos || [];

  // Добавляем метку типа каждому файлу, чтобы сервер знал, что это
  const result = list.map((item) => ({
    ...item,
    mediaType: type === "videos" ? "video" : "image",
  }));
  
  // Сохраняем в кэш
  MEDIA_CACHE.set(cacheKey, { data: result, ts: Date.now() });
  
  // Ограничиваем размер кэша (макс 200 записей)
  if (MEDIA_CACHE.size > 200) {
    const firstKey = MEDIA_CACHE.keys().next().value;
    MEDIA_CACHE.delete(firstKey);
  }
  
  return result;
}
// ═══════════════════════════════════════════════════════════
function sendTokenToSW() {
  const e = localStorage.getItem("token") || "";
  (chrome.runtime.sendMessage({ type: "token", value: e }).catch(() => {}),
    st.set({ snJwt: e }));
}
(sendTokenToSW(),
  syncOperatorId(), // Извлекаем operator_id из JWT при загрузке
  window.addEventListener("storage", (e) => {
    if ("token" === e.key) { sendTokenToSW(); syncOperatorId(); }
  }),
  css(`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    /* Скрываем дубликат виджета баланса из inject.js (с булавкой 📌) */
    .ah-earnings-portal { display: none !important; }
    .ah-pinned-wrapper { display: none !important; }

    /* --- ОСНОВА --- */
    #ah-overlay {
      position: fixed; inset: 0; background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center; z-index: 9999;
      font-family: 'Inter', system-ui, sans-serif;
    }
    
    #ah-modal {
      display: flex; flex-direction: column; position: relative;
      background: #ffffff;
      font-family: 'Inter', system-ui, sans-serif;
      padding: 0;
      border-radius: 20px;
      min-width: 1000px; max-width: 95vw; height: 750px; max-height: 90vh;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      color: #2d3436;
      overflow: hidden;
      animation: ahScaleIn 0.2s ease-out;
    }

    @keyframes ahScaleIn {
      from { opacity: 0; transform: scale(0.98); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* --- ЗАГОЛОВОК И КНОПКИ ОКНА --- */
    #ah-modal h2 {
      align-self: center; margin: 15px 0 10px 0;
      font-size: 14px; font-weight: 700; color: #b2bec3; letter-spacing: 1px; text-transform: uppercase;
      background: #f8f9fa; border: 1px solid #eee; padding: 6px 20px; border-radius: 30px;
      user-select: none;
    }
    #ah-modal::before { display: none; }

    #ah-modal .ah-hdr {
      position: absolute; top: 15px; width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center;
      border: none; border-radius: 50%; cursor: pointer;
      background: #f1f2f6; color: #636e72; transition: all 0.2s;
      z-index: 100;
      font-size: 20px; line-height: 1;
      box-shadow: 0 2px 5px rgba(0,0,0,0.05);
    }
    #ah-modal .ah-hdr:hover { transform: scale(1.1); box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
    
    #ah-close { right: 20px; }
    #ah-close:hover { background: #ff7675; color: #fff; transform: rotate(90deg); }
    
    #ah-info { right: 65px; }
    #ah-info:hover { background: var(--sa); color: #fff; }

    /* --- ТАБЫ --- */
    #ah-tabs {
      display: flex; justify-content: center; gap: 8px; padding: 0 10px 15px 10px;
      background: #fff; border-bottom: 1px solid #f1f2f6;
      flex-shrink: 0;
    }
    #ah-modal .ah-tab {
      padding: 8px 20px; border-radius: 12px; cursor: pointer; color: #636e72;
      font-size: 13px; font-weight: 600; transition: .2s; user-select: none;
    }
    #ah-modal .ah-tab:hover { background: #f8f9fa; color: var(--sa); }
    #ah-modal .ah-tab.ah-active { background: var(--sa-light); color: var(--sa); }

    /* --- КОНТЕЙНЕР КОНТЕНТА --- */
    #ah-body {
      flex: 1 1 auto; overflow: hidden; background: #ffffff;
      display: flex; flex-direction: column;
      position: relative; /* Важно для позиционирования */
    }

    /* --- ЛЕЙАУТ С САЙДБАРОМ (Invites, Letters) --- */
    .ah-layout-split { 
        display: flex; 
        height: 100%; 
        overflow: hidden; 
        align-items: stretch; /* Растягиваем на всю высоту */
    }

    /* --- САЙДБАР (СПИСОК АНКЕТ) --- */
    .ah-sidebar {
        width: 280px; 
        flex-shrink: 0; 
        background: #fafbfc; 
        border-right: 1px solid #f1f2f6;
        display: flex; 
        flex-direction: column; 
        overflow-y: auto; /* ВКЛЮЧАЕМ СКРОЛЛ */
        height: 100%; /* На всю высоту родителя */
        padding: 15px; 
        gap: 8px;
    }

    /* Стили скроллбара для сайдбара */
    .ah-sidebar::-webkit-scrollbar { width: 6px; }
    .ah-sidebar::-webkit-scrollbar-track { background: transparent; }
    .ah-sidebar::-webkit-scrollbar-thumb { background-color: #dfe6e9; border-radius: 10px; }
    .ah-sidebar::-webkit-scrollbar-thumb:hover { background-color: #b2bec3; }

    /* Карточка профиля */
    .ah-profile-card {
        display: flex; align-items: center; gap: 12px; padding: 10px;
        border-radius: 12px; cursor: pointer; transition: all 0.2s;
        border: 1px solid transparent; background: #fff;
        box-shadow: 0 2px 4px rgba(0,0,0,0.02);
        flex-shrink: 0; /* ВАЖНО: Не сжимать карточки! */
    }
    .ah-profile-card:hover { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
    .ah-profile-card.active {
        background: #fff; border-color: var(--sa);
        box-shadow: 0 0 0 4px rgba(var(--sa-rgb), 0.1);
    }
    
    .ah-p-avatar { width: 42px; height: 42px; border-radius: 50%; object-fit: cover; }
    .ah-p-info { flex: 1; overflow: hidden; }
    .ah-p-name { font-size: 14px; font-weight: 700; }
    .ah-p-meta { font-size: 11px; color: #b2bec3; }
    .ah-p-status { width: 10px; height: 10px; border-radius: 50%; transition: background 0.3s; }
    .ah-status-none { background: #b2bec3; }          /* серый  — нет данных */
    .ah-status-warn { background: #f39c12; }          /* оранжевый — есть данные, бот не активен */
    .ah-status-go   { background: #26de81; }          /* зелёный — всё работает */
    .ah-status-ok   { background: var(--sa); }        /* акцент (письма / совместимость) */
    .ah-status-bad  { background: #ff7675; }          /* красный (совместимость) */

    /* --- ПРАВАЯ ЧАСТЬ КОНТЕНТА --- */
    .ah-main-content {
        flex: 1; overflow-y: auto; background: #fff; padding: 30px 40px;
    }
    .ah-main-content::-webkit-scrollbar { width: 8px; }
    .ah-main-content::-webkit-scrollbar-thumb { background-color: #dfe6e9; border-radius: 10px; }

    /* --- SINGLE PAGE LAYOUT (Main, StopList, Tools) --- */
    .ah-single-wrapper {
        padding: 30px 40px;
        height: 100%;
        overflow-y: auto;
        background: #fff;
    }
    .ah-card {
        background: #fff; border: 1px solid #f1f2f6; border-radius: 16px;
        padding: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.02);
        margin-bottom: 20px; transition: transform 0.2s;
    }
    .ah-card-title {
        font-size: 14px; font-weight: 700; color: #2d3436; margin-bottom: 15px;
        display: flex; align-items: center; gap: 8px;
    }

    /* --- КОМПОНЕНТЫ (Свитчи, Кнопки) --- */
    #ah-modal .switch { position: relative; width: 42px; height: 24px; flex-shrink: 0; }
    #ah-modal .switch input { opacity: 0; width: 0; height: 0; }
    #ah-modal .slider {
      position: absolute; inset: 0; background: #dfe6e9; border-radius: 34px; transition: .3s;
    }
    #ah-modal .slider:before {
      content: ""; position: absolute; height: 18px; width: 18px; left: 3px; top: 3px;
      background: #fff; border-radius: 50%; transition: .3s; box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    #ah-modal input:checked + .slider { background: var(--sa); }
    #ah-modal input:checked + .slider:before { transform: translateX(18px); }
    
    #ah-start {
      width: 100%; padding: 18px !important; margin-top: 10px;
      font-size: 18px !important; font-weight: 800; text-transform: uppercase; letter-spacing: 2px;
      border: none; border-radius: 16px; cursor: pointer;
      background: linear-gradient(135deg, var(--sa) 0%, var(--sa-alt) 100%);
      color: #fff; box-shadow: 0 10px 30px rgba(var(--sa-rgb), 0.3);
      transition: all 0.2s;
    }
    #ah-start:hover { transform: translateY(-2px); box-shadow: 0 15px 35px rgba(var(--sa-rgb), 0.4); }
    #ah-start.stop {
      background: linear-gradient(135deg, #ff7675 0%, #d63031 100%);
      box-shadow: 0 10px 30px rgba(214, 48, 49, 0.3);
    }

    #ah-stop-input {
        width: 100%; height: 100%; padding: 15px; border: 2px solid #f1f2f6; border-radius: 12px;
        font-family: 'Inter', system-ui, sans-serif; font-size: 14px; color: #2d3436; background: #fafbfc;
        resize: none; outline: none; transition: .2s;
    }
    #ah-stop-input:focus { border-color: var(--sa); background: #fff; }

    /* --- INVITES REDESIGN --- */
    #inv-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 25px; }
    #ah-modal .inv-tab {
      background: #fff; color: #636e72; border: 1px solid #dfe6e9; border-radius: 30px;
      padding: 8px 18px; font-size: 13px; font-weight: 500; cursor: pointer; transition: .2s;
    }
    #ah-modal .inv-tab:hover { border-color: #b2bec3; background: #f8f9fa; }
    #ah-modal .inv-tab.active {
      background: var(--sa); color: #fff; border-color: var(--sa);
      box-shadow: 0 4px 15px rgba(var(--sa-rgb), 0.3);
    }
    #ah-modal .inv-tab.empty { color: #ff7675; border-color: #ffcccc; background: #fff5f5; }
    #ah-modal .inv-tab.empty.active { background: #ff7675; color: #fff; border-color: #ff7675; }

    .ah-compose-box {
      background: #ffffff; border: 1px solid #e1e2e6; border-radius: 16px; padding: 20px;
      margin-bottom: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.03); transition: border-color 0.2s;
    }
    .ah-compose-box:focus-within { border-color: var(--sa); }
    .ah-compose-area {
      width: 100%; border: none; outline: none; resize: none;
      font-family: 'Inter', system-ui, sans-serif; font-size: 15px; color: #2d3436;
      min-height: 80px; margin-bottom: 10px;
    }
    .ah-compose-area::placeholder { color: #b2bec3; }

    .ah-compose-toolbar {
      display: flex; align-items: center; justify-content: space-between;
      padding-top: 15px; border-top: 1px solid #f1f2f6;
    }
    .ah-tool-group { display: flex; align-items: center; gap: 15px; }
    .ah-tool-btn {
      display: flex; align-items: center; gap: 6px; padding: 6px 12px;
      border-radius: 8px; cursor: pointer; transition: .2s; color: #636e72; font-size: 13px; font-weight: 500; background: #f8f9fa;
    }
    .ah-tool-btn:hover { background: #e0e0e0; color: #2d3436; }
    .ah-tool-btn.has-data { color: var(--sa); background: var(--sa-light); }

    .ah-time-input {
      width: 50px; padding: 5px; border: 1px solid #dfe6e9; border-radius: 6px;
      text-align: center; font-weight: 600; color: #2d3436; outline: none;
    }
    .ah-time-input:focus { border-color: var(--sa); }

    .ah-send-btn {
      background: var(--sa); color: #fff; border: none; padding: 10px 24px;
      border-radius: 10px; font-weight: 600; font-size: 14px; cursor: pointer;
      box-shadow: 0 4px 12px rgba(var(--sa-rgb), 0.2); transition: .2s;
    }
    .ah-send-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(var(--sa-rgb), 0.3); }

    .inv-list-item, .ltr-item {
      display: flex; align-items: flex-start; gap: 15px;
      background: #fff; border: 1px solid #f1f2f6; border-radius: 12px;
      padding: 15px; margin-bottom: 12px; transition: .2s; position: relative;
    }
    .inv-list-item:hover, .ltr-item:hover {
      border-color: var(--sa); transform: translateX(2px); box-shadow: 0 4px 20px rgba(0,0,0,0.04);
    }
    .inv-list-item.active-invite, .ltr-item.active-letter {
      border-color: var(--sa) !important; background: var(--sa-light) !important; box-shadow: inset 0 0 0 1px var(--sa);
    }

    .item-thumb { width: 60px; height: 60px; border-radius: 8px; object-fit: cover; flex-shrink: 0; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
    .item-content { flex: 1; display: flex; flex-direction: column; gap: 6px; }
    .item-text { font-size: 14px; line-height: 1.5; color: #2d3436; white-space: pre-wrap; word-break: break-word; }
    .item-meta { display: flex; align-items: center; gap: 10px; font-size: 11px; }
    .tag-green { color: var(--sa); background: var(--sa-light); padding: 2px 8px; border-radius: 4px; font-weight: 600; }
    .item-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .del-btn { color: #ff7675; cursor: pointer; padding: 4px; font-size: 16px; opacity: 0.6; transition:.2s; }
    .del-btn:hover { opacity: 1; transform: scale(1.1); }
    .inv-timer {
      font-size: 12px; font-weight: 700; color: #d63031; background: #fff0f0;
      padding: 4px 10px; border-radius: 6px; border: 1px solid #ffcccc; display: inline-block;
    }

    textarea, #inv-input, #ltr-input {
      border: 2px solid #e1e2e6; border-radius: 10px; background: #fafbfc;
      padding: 12px; font-family: 'Inter', system-ui, sans-serif; color: #2d3436; transition: .2s; outline: none; flex: 1;
    }
    textarea:focus, #inv-input:focus, #ltr-input:focus { border-color: var(--sa); background: #fff; }
    .gallery-item { border: 1px solid #444; }
    select { padding: 8px 12px; border: 2px solid #f1f2f6; border-radius: 8px; background: #fff; outline: none; }
  `),
  chrome.storage.local.get("snAutoBackup", (e) => {
    e.snAutoBackup &&
      chrome.runtime.sendMessage({ cmd: "toggleAutoBackup", enable: !0 });
  }));
let ui = {};
function show(e) {
  ui.res.textContent = e;
}
function validateKey(e) {
  const t = /^[A-Za-z0-9]{16}$/.test(e.value);
  ((e.style.borderColor = t ? "#ccc" : "#f33"), (ui.ok.disabled = !t));
}
function fmtExp(e) {
  if (e >= 86400) {
    const t = Math.floor(e / 86400);
    return `${t} day${1 !== t ? "s" : ""}`;
  }
  if (e >= 3600) {
    const t = Math.ceil(e / 3600);
    return `${t} hour${1 !== t ? "s" : ""}`;
  }
  return `${Math.max(1, Math.ceil(e / 60))} min`;
}
function updateHeaderExp() {
  const e = document.querySelector("#ah-modal h2");
  if (!e) return;
  // Оставляем только название, например "Snatch 💸 v1.0"
  // Весь лишний текст убран, чтобы рамка была красивой и компактной
  e.textContent = AH_BASE;
}
async function buildModal() {
  if ((await initAhStore(), $("#ah-overlay"))) return;
  const s = loadSet(), hasKey = !!s.authKey;

  const modal = elt("div", { id: "ah-modal" });

  modal.append(
    elt("button", { id: "ah-info", className: "ah-hdr", title: "Импорт / Экспорт", onclick: openStarMenu }, elt("span", {}, "★")),
    elt("button", { id: "ah-close", className: "ah-hdr", onclick: closeModal }, elt("span", {}, "×")),
    elt("h2", {}, s.operatorId ? `${AH_BASE} • ${s.operatorId}` : AH_BASE),
  );

  if (!hasKey) {
    // Больше не показываем отдельный экран с ключом —
    // поле ввода встроено прямо в заблюренную вкладку Main (selectTab → overlay)
    document.body.append(elt("div", { id: "ah-overlay" }, modal));
    expandModal();
    return;
  }

  // Ключ есть — проверяем его валидность на сервере перед открытием
  document.body.append(elt("div", { id: "ah-overlay" }, modal));

  const checkingEl = elt("div", { style: "display:flex;align-items:center;justify-content:center;height:200px;color:#b2bec3;font-size:14px;gap:10px" });
  checkingEl.append(
    elt("div", { style: "font-size:20px;animation:spin 1s linear infinite" }, "↻"),
    elt("span", {}, "Проверка лицензии…"),
  );
  modal.append(checkingEl);

  try {
    const res = await Promise.race([
      chrome.runtime.sendMessage({ cmd: "postHelper", key: s.authKey, jwt: localStorage.getItem("token") || "" }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
    ]);
    checkingEl.remove();
    const body = (() => { try { return JSON.parse(res?.body || "{}"); } catch { return {}; } })();
    const valid = res?.origin && res.status === 200 && body.status !== false;

    // Сервер вернул 403 — ключ привязан к другому оператору
    if (res?.status === 403 && res?.origin && body.msg) {
      delete s.authKey; delete s.operatorId; s.running = false;
      saveSet(s);
      const errMsg = elt("div", {
        style: "display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;gap:12px;padding:0 40px;"
      });
      errMsg.append(
        elt("div", { style: "font-size:40px;" }, "🔒"),
        elt("div", { style: "font-size:16px;font-weight:700;color:#d63031;text-align:center;" }, "Ключ привязан к другому оператору"),
        elt("div", { style: "font-size:13px;color:#636e72;text-align:center;" }, body.msg),
      );
      $("#ah-modal").append(errMsg);
      setTimeout(() => { errMsg.remove(); expandModal(); }, 3500);
      return;
    }

    if (!valid) {
      delete s.authKey; delete s.operatorId; s.running = false;
      saveSet(s);
      // Ключ протух — показываем Main с оверлеем ввода ключа
      expandModal();
      return;
    }
    if (body.exp_sec) setExpSecMem(body.exp_sec);
  } catch {
    // Сервер недоступен — проверяем локально сохранённый срок
    checkingEl.remove();
    const expSec = getExpSecMem();
    if (expSec <= 0) {
      delete s.authKey; delete s.operatorId; s.running = false;
      saveSet(s);
      // Ключ протух — показываем Main с оверлеем ввода ключа
      expandModal();
      return;
    }
  }

  expandModal();
}

function showLicenseForm(modal) {
  const screen = elt("div", { id: "ah-license-screen", style: [
    "flex:1;display:flex;flex-direction:column;",
    "align-items:center;justify-content:center;",
    "padding:40px 30px;gap:0;",
    "background:linear-gradient(160deg, #f0fff8 0%, #ffffff 50%, #f8f0ff 100%);"
  ].join("") });

  const logo = elt("div", { style: "font-size:52px;margin-bottom:6px;filter:drop-shadow(0 4px 12px rgba(0,184,148,0.25));" }, "💸");
  const title = elt("div", { style: "font-size:22px;font-weight:800;color:#1a1a2e;margin:0 0 4px;letter-spacing:-0.5px;" }, "Snatch Bot");
  const sub = elt("div", { style: "font-size:13px;color:#b2bec3;margin:0 0 28px;" }, "Введите лицензионный ключ для доступа");

  const keyWrap = elt("div", { style: [
    "display:flex;gap:0;width:100%;max-width:420px;",
    "border-radius:14px;overflow:hidden;",
    "box-shadow:0 8px 24px rgba(0,184,148,0.15), 0 2px 8px rgba(0,0,0,0.08);"
  ].join("") });

  const keyInp = elt("input", {
    id: "ah-key", autocomplete: "off",
    placeholder: "Введите ключ (16 символов)", maxlength: 16,
    style: [
      "flex:1;padding:16px 20px;border:2px solid transparent;",
      "border-right:none;border-radius:14px 0 0 14px;",
      "font-size:15px;font-family:'Courier New',monospace;font-weight:700;",
      "letter-spacing:2px;text-transform:uppercase;",
      "background:#fff;color:#1a1a2e;outline:none;transition:border-color .2s;"
    ].join(""),
    oninput: (e) => {
      e.target.value = e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 16);
      validateKey(e.target);
    },
  });
  const okBtn = elt("button", {
    id: "ah-send", disabled: true, onclick: sendCmd,
    style: [
      "padding:16px 22px;border:none;cursor:pointer;",
      "background:linear-gradient(135deg,#00b894,#00cec9);",
      "color:#fff;font-size:15px;font-weight:700;",
      "border-radius:0 14px 14px 0;transition:opacity .2s,transform .1s;"
    ].join("")
  }, "→");
  keyWrap.append(keyInp, okBtn);

  const res = elt("pre", { id: "ah-res", style: "margin-top:14px;font-size:13px;font-family:'Inter',sans-serif;color:#d63031;text-align:center;min-height:18px;background:transparent;border:none;padding:0;" });

  const noKeyBtn = elt("button", {
    style: "margin-top:0px;margin-bottom:15px;background:none;border:none;color:#b2bec3;font-size:12px;text-decoration:underline;cursor:pointer;font-family:'Inter',sans-serif;transition:color .2s;",
    onmouseover: e => e.target.style.color = "#2d3436",
    onmouseout: e => e.target.style.color = "#b2bec3",
    onclick: () => {
      cleanupAuthUI();
      expandModal();
    }
  }, "Войти без ключа");

  const features = elt("div", { style: "display:flex;gap:16px;margin:10px 0 0;" });
  [["⚡", "Авторассылка"], ["🎯", "Инвайты"], ["✉️", "Письма"]].forEach(([ic, txt]) => {
    features.append(elt("div", {
      style: "display:flex;align-items:center;gap:6px;background:rgba(0,184,148,0.08);border:1px solid rgba(0,184,148,0.15);border-radius:20px;padding:6px 12px;font-size:11px;color:#636e72;font-weight:600;"
    }, ic + " " + txt));
  });

  screen.append(logo, title, sub, keyWrap, res, noKeyBtn, features);
  modal.append(screen);
}
async function sendCmd() {
  ((ui.ok.disabled = !0), show("…подождите…"));
  const e = ui.key.value.trim(),
    t = (await sha1(e)).slice(0, 16),
    n = Promise.race([
      chrome.runtime.sendMessage({
        cmd: "postHelper",
        key: t,
        jwt: localStorage.getItem("token") || "",
      }),
      new Promise((e, t) =>
        setTimeout(() => t(new Error("Timeout (5 s)")), 5e3),
      ),
    ]);
  try {
    const e = await n;
    if (e.error)
      return (show("Ошибка: " + e.error), void (ui.ok.disabled = !1));
    if (!1 === e.origin)
      return (
        show("Ошибка: пакет заблокирован Cloudflare"),
        void (ui.ok.disabled = !1)
      );
    let o = {};
    try {
      o = JSON.parse(e.body || "{}");
    } catch {}
    (o.msg && show(o.msg),
      "string" == typeof o.endpoint &&
        chrome.runtime.sendMessage({ cmd: "saveEndpoint", ep: o.endpoint }),
      "number" == typeof o.exp_sec && setExpSecMem(o.exp_sec));
    const a = 200 === e.status && !1 !== o.status,
      i = loadSet();
    if (a) {
      ((i.operatorId = e.operator_id || null),
        (i.authKey = t),
        saveSet(i),
        chrome.runtime.sendMessage({ cmd: "setBadge", state: "Stopped" }));
      const n = $("#ah-modal h2");
      (n && e.operator_id && (n.textContent = `${AH_BASE} • ${e.operator_id}`),
        expandModal(),
        updateHeaderExp(),
        cleanupAuthUI());
    } else
      (delete i.authKey,
        delete i.operatorId,
        saveSet(i),
        (ui.ok.disabled = !1),
        o.msg || show("Ошибка: неверный ключ"));
  } catch (e) {
    (show("Ошибка: " + e.message), (ui.ok.disabled = !1));
  }
}
function collectAllInvites() {
  const e = {};
  e.global = CATS.reduce((e, t) => ((e[t] = loadInv(null)[t] || []), e), {});
  const t = AH_STORE.mem.invites || {};
  return (
    Object.keys(t)
      .filter((e) => "global" !== e)
      .forEach((t) => {
        const n = loadInv(t);
        CATS.every((e) => !(n[e] || []).length) ||
          (e[t] = CATS.reduce((e, t) => ((e[t] = n[t] || []), e), {}));
      }),
    e
  );
}
async function buildPayload(e = !1) {
  await initAhStore();
  try {
    const e = await st.get([
      AH_STORE_KEYS.set,
      AH_STORE_KEYS.invites,
      AH_STORE_KEYS.stop,
      AH_STORE_KEYS.exp,
    ]);
    (e[AH_STORE_KEYS.set] && (AH_STORE.mem.set = e[AH_STORE_KEYS.set]),
      e[AH_STORE_KEYS.invites] &&
        (AH_STORE.mem.invites = e[AH_STORE_KEYS.invites]),
      "string" == typeof e[AH_STORE_KEYS.stop] &&
        (AH_STORE.mem.stop = e[AH_STORE_KEYS.stop]),
      Number.isFinite(e[AH_STORE_KEYS.exp]) &&
        (AH_STORE.mem.exp = e[AH_STORE_KEYS.exp]));
  } catch {}
  migrateTimeToMinutesIfNeeded();
  const t = loadSet();
  let n = null;
  if (!e) {
    const e = (localStorage.getItem("token") || "").trim();
    if (e)
      try {
        const { json: t } = await pageFetchJson("/api/operator/profiles", {
          method: "GET",
          headers: { Authorization: "Bearer " + e },
        });
        Array.isArray(t) &&
          t.length &&
          (n = new Set(t.map((e) => String(e.external_id))));
      } catch {}
  }
  const lettersMap = {};
  const storedLetters = AH_STORE.mem.letters || {};
  Object.keys(storedLetters).forEach((k) => {
    const list = loadLetters(k);
    if (list && list.length) lettersMap[k] = list; // Собираем всё в карту
  });
  const o = CATS.reduce((e, t) => ((e[t] = loadInv(null)[t] || []), e), {}),
    a = {
      settings: {
        timemin: !0,
        likes: !!t.likes,
        activity: !!t.activity,
        persons: !!t.persons,
        lastLike: !!t.lastlike,
        factTimeMsg: !!t.facttimemsg,
        stopMaybe: !!t.stopmaybe,
        stopSpecial: !!t.stopspecial,
        persToMaybe: !!t.perstomaybe,
        persToSpecial: !!t.perstospecial,
        emptyChatsToFolder: !!t.emptychatstofolder,
        useLetters: !!t.useLetters,
        sendEvery: t.sendEvery ?? null,
        mailEvery: t.mailEvery ?? null,
        letterDelay: t.letterDelay ?? null,
      },
      invites: o,
      letters: lettersMap,
      stopList: (loadStop() || "").replace(/\s+/g, " ").trim(),
    },
    i = AH_STORE.mem.invites || {};
  Object.keys(i)
    .filter((e) => "global" !== e)
    .filter((t) => e || !n || n.has(t))
    .sort((e, t) => Number(e) - Number(t))
    .forEach((e) => {
      const t = loadInv(e);
      CATS.every((e) => !(t[e] || []).length) ||
        (a["invites" + e] = CATS.reduce(
          (e, n) => ((e[n] = t[n] || []), e),
          {},
        ));
    });
  const r = JSON.stringify(a);
  return { jsonStr: r, hash: await sha1(r) };
}
async function closeModal() {
  document.getElementById("star-menu")?.remove();
  const e = $("#ah-overlay");
  if (!e) return;
  const { jsonStr: t, hash: n } = await buildPayload(),
    o = loadSet();
  (o.running &&
    o.lastHash !== n &&
    (chrome.runtime.sendMessage({
      cmd: "botAction",
      run: o.running ? "Start" : "Stop",
      json: t,
      hash: n,
      key: o.authKey,
      opId: o.operatorId,
    }),
    (o.lastHash = n),
    saveSet(o)),
    (galleryCache = {}),
    e.remove());
}
function expandModal() {
  const e = $("#ah-modal");
  if (!e || $("#ah-tabs")) return;

  // УВЕЛИЧИЛИ ШИРИНУ до 1100px и ВЫСОТУ
  e.style.minWidth = "1100px";
  e.style.width = "1100px";
  e.style.height = "700px"; // Чуть выше, чтобы список влезал

  // ... дальше код табов без изменений ...
  const t = elt(
    "div",
    { id: "ah-tabs" },
    ...[
      "Main",
      "Invites",
      "Letters",
      "Tools",
      "Media Tools",
    ].map((e, t) =>
      elt(
        "div",
        {
          className: "ah-tab" + (0 === t ? " ah-active" : ""),
          onclick: () => selectTab(t),
        },
        e,
      ),
    ),
  );
  e.insertBefore(t, $("#ah-license-screen") || $("#ah-form"));
  e.append(elt("div", { id: "ah-body" }));
  selectTab(0);
  updateHeaderExp();
}
function cleanupAuthUI() {
  ($("#ah-license-screen")?.remove(), $("#ah-form")?.remove(), $("#ah-res")?.remove());
}
function selectTab(e) {
  $$("#ah-tabs .ah-tab").forEach((t, n) =>
    t.classList.toggle("ah-active", n === e),
  );
  const t = $("#ah-body");
  t.innerHTML = "";
  if (3 === e) { renderTools(t); return; }
  if (4 === e) { renderMediaTools(t); return; }

  // Вкладки Main (0), Invites (1), Letters (2)
  if (0 === e || 1 === e || 2 === e) {
    const s = loadSet();
    // Если ключ есть — рендерим нормально без блюра
    if (s.authKey) {
      if (0 === e) renderMain(t);
      else if (1 === e) renderInvites(t);
      else renderLetters(t);
      return;
    }

    // Ключа нет — показываем заблюренный контент + оверлей с вводом ключа
    const wrapper = elt("div", { style: "position:relative;width:100%;height:100%;overflow:hidden;" });
    const contentBg = elt("div", { style: "width:100%;height:100%;filter:blur(3px) grayscale(1);opacity:0.35;pointer-events:none;user-select:none;" });
    if (0 === e) renderMain(contentBg);
    else if (1 === e) renderInvites(contentBg);
    else renderLetters(contentBg);
    wrapper.append(contentBg);

    // Оверлей с полем ввода ключа
    const overlay = elt("div", {
      style: [
        "position:absolute;inset:0;",
        "display:flex;flex-direction:column;align-items:center;justify-content:center;",
        "background:rgba(245,246,250,0.88);backdrop-filter:blur(4px);",
        "z-index:10;gap:14px;",
      ].join("")
    });

    const lockIcon = elt("div", { style: "font-size:48px;line-height:1;filter:drop-shadow(0 4px 12px rgba(0,0,0,0.12));" }, "🔑");

    const msg = elt("div", {
      style: "font-size:17px;font-weight:700;color:#2d3436;text-align:center;max-width:400px;line-height:1.5;"
    }, "Введите лицензионный ключ");

    const subMsg = elt("div", {
      style: "font-size:13px;color:#b2bec3;text-align:center;max-width:360px;line-height:1.5;margin-top:-6px;"
    }, "16 символов — получить ключ в Telegram");

    // Поле ввода + кнопка
    const keyWrap = elt("div", {
      style: [
        "display:flex;gap:0;width:100%;max-width:400px;",
        "border-radius:14px;overflow:hidden;",
        "box-shadow:0 8px 24px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06);",
      ].join("")
    });

    const keyInp = elt("input", {
      id: "ah-inline-key",
      autocomplete: "off",
      placeholder: "XXXXXXXXXXXXXXXX",
      maxlength: 16,
      style: [
        "flex:1;padding:14px 18px;border:2px solid #e0e0e0;",
        "border-right:none;border-radius:14px 0 0 14px;",
        "font-size:15px;font-family:'Courier New',monospace;font-weight:700;",
        "letter-spacing:3px;text-transform:uppercase;",
        "background:#fff;color:#1a1a2e;outline:none;transition:border-color .2s;",
      ].join(""),
    });

    // Кнопка: по умолчанию TG, при вводе 16 символов — "Проверить ключ"
    const actionBtn = elt("a", {
      id: "ah-inline-action",
      href: "https://t.me/brachka_rass",
      target: "_blank",
      rel: "noopener noreferrer",
      style: [
        "display:inline-flex;align-items:center;justify-content:center;gap:7px;",
        "padding:14px 20px;border:none;cursor:pointer;white-space:nowrap;",
        "background:linear-gradient(135deg,#0088cc,#006aaa);",
        "color:#fff;font-size:14px;font-weight:700;",
        "border-radius:0 14px 14px 0;transition:background .2s,transform .1s;",
        "text-decoration:none;min-width:160px;",
      ].join("")
    });
    const actionIcon = elt("span", { style: "font-size:18px;" }, "✈️");
    const actionText = elt("span", {}, "TG: @brachka_rass");
    actionBtn.append(actionIcon, actionText);

    // Сообщение об ошибке/статусе
    const inlineRes = elt("div", {
      id: "ah-inline-res",
      style: "font-size:13px;color:#d63031;text-align:center;min-height:18px;font-family:'Inter',sans-serif;"
    });

    // Логика переключения кнопки при вводе
    keyInp.addEventListener("input", () => {
      const val = keyInp.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 16);
      keyInp.value = val;
      inlineRes.textContent = "";

      if (val.length === 16) {
        // Режим "Проверить ключ"
        actionBtn.removeAttribute("href");
        actionBtn.removeAttribute("target");
        actionBtn.style.background = "linear-gradient(135deg,#00b894,#00cec9)";
        actionBtn.style.cursor = "pointer";
        actionIcon.textContent = "🔓";
        actionText.textContent = "Проверить ключ";
        keyInp.style.borderColor = "#00b894";
      } else {
        // Режим "TG"
        actionBtn.href = "https://t.me/brachka_rass";
        actionBtn.target = "_blank";
        actionBtn.style.background = "linear-gradient(135deg,#0088cc,#006aaa)";
        actionBtn.style.cursor = "pointer";
        actionIcon.textContent = "✈️";
        actionText.textContent = "TG: @brachka_rass";
        keyInp.style.borderColor = val.length > 0 ? "#f39c12" : "#e0e0e0";
      }
    });

    keyInp.addEventListener("focus", () => {
      if (keyInp.value.length !== 16) keyInp.style.borderColor = "#0088cc";
    });
    keyInp.addEventListener("blur", () => {
      if (keyInp.value.length !== 16 && keyInp.value.length > 0) keyInp.style.borderColor = "#f39c12";
      else if (keyInp.value.length === 0) keyInp.style.borderColor = "#e0e0e0";
    });

    // Клик по кнопке "Проверить ключ"
    actionBtn.addEventListener("click", async (ev) => {
      if (keyInp.value.length !== 16) return; // TG-режим — ссылка сработает сама
      ev.preventDefault();

      actionBtn.style.opacity = "0.7";
      actionBtn.style.pointerEvents = "none";
      actionIcon.textContent = "↻";
      actionText.textContent = "Проверяю…";
      inlineRes.style.color = "#636e72";
      inlineRes.textContent = "Подключаюсь к серверу…";

      try {
        const rawKey = keyInp.value.trim();
        const hashedKey = (await sha1(rawKey)).slice(0, 16);

        const res = await Promise.race([
          chrome.runtime.sendMessage({
            cmd: "postHelper",
            key: hashedKey,
            jwt: localStorage.getItem("token") || "",
          }),
          new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout (5 s)")), 5000)),
        ]);

        let body = {};
        try { body = JSON.parse(res?.body || "{}"); } catch {}

        const valid = res?.origin && res.status === 200 && body.status !== false;

        if (valid) {
          const s2 = loadSet();
          s2.authKey = hashedKey;
          s2.operatorId = res.operator_id || null;
          saveSet(s2);
          if (body.exp_sec) setExpSecMem(body.exp_sec);
          if (body.endpoint) chrome.runtime.sendMessage({ cmd: "saveEndpoint", ep: body.endpoint });
          chrome.runtime.sendMessage({ cmd: "setBadge", state: "Stopped" });

          // Обновляем заголовок модала
          const h2 = $("#ah-modal h2");
          if (h2 && res.operator_id) h2.textContent = `${AH_BASE} • ${res.operator_id}`;

          // Перерисовываем вкладку без блюра
          selectTab(0);
        } else {
          inlineRes.style.color = "#d63031";
          inlineRes.textContent = body.msg || "Неверный ключ. Попробуйте ещё раз.";
          actionBtn.style.opacity = "1";
          actionBtn.style.pointerEvents = "";
          actionIcon.textContent = "🔓";
          actionText.textContent = "Проверить ключ";
        }
      } catch (err) {
        inlineRes.style.color = "#d63031";
        inlineRes.textContent = "Ошибка: " + (err.message || err);
        actionBtn.style.opacity = "1";
        actionBtn.style.pointerEvents = "";
        actionIcon.textContent = "🔓";
        actionText.textContent = "Проверить ключ";
      }
    });

    // Enter в поле ввода
    keyInp.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && keyInp.value.length === 16) actionBtn.click();
    });

    keyWrap.append(keyInp, actionBtn);
    overlay.append(lockIcon, msg, subMsg, keyWrap, inlineRes);
    wrapper.append(overlay);
    t.append(wrapper);

    // Фокус на поле ввода
    requestAnimationFrame(() => keyInp.focus());
    return;
  }
}
function makeSwitch(e, t, n = !1, o = "") {
  const a = loadSet(),
    i = e.replace("ah-", "");
  i in a || ((a[i] = n), saveSet(a));
  return elt(
    "label",
    {
      style: `display:flex;align-items:center;gap:12px;\n             font-size:14px;${o}`,
    },
    elt(
      "span",
      { className: "switch" },
      elt("input", {
        type: "checkbox",
        id: e,
        checked: a[i],
        onchange: (e) => {
          const t = loadSet();
          ((t[i] = e.target.checked), saveSet(t));
        },
      }),
      elt("span", { className: "slider" }),
    ),
    elt("span", {}, t),
  );
}
// --- УНИВЕРСАЛЬНАЯ ГАЛЕРЕЯ ---
// --- УНИВЕРСАЛЬНАЯ ГАЛЕРЕЯ (Мультиселект) ---
// --- УНИВЕРСАЛЬНАЯ ГАЛЕРЕЯ (Гибридная: Одиночный и Мульти) ---
function openUniversalGallery(profileId, onSelect, maxLimit = 1) {
  if (!profileId) return alert("Сначала выберите анкету!");

  // Буфер выбранных файлов (только для мульти-режима)
  let selectedBuffer = [];
  const isMulti = maxLimit > 1;

  const overlay = elt("div", {
    style:
      "position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:10001;display:flex;flex-direction:column;align-items:center;justify-content:center",
  });

  const closeBtn = elt(
    "div",
    {
      style:
        "position:absolute;top:20px;right:20px;color:#fff;font-size:30px;cursor:pointer;font-weight:bold",
      onclick: () => overlay.remove(),
    },
    "×",
  );

  const contentBox = elt("div", {
    style:
      "width:90%;height:85%;background:#1e1e1e;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.5)",
  });

  // Верхняя панель
  const header = elt("div", {
    style:
      "padding:15px;display:flex;gap:15px;background:#252525;align-items:center",
  });

  const btnPhoto = elt(
    "button",
    {
      style:
        "flex:1;padding:10px;background:#007aff;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600",
      onclick: () => load("images"),
    },
    "Медиа",
  );
  const btnVideo = elt(
    "button",
    {
      style:
        "flex:1;padding:10px;background:#444;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600",
      onclick: () => load("videos"),
    },
    "Видео",
  );

  // Кнопка сохранения (Только для мульти-режима)
  let confirmBtn = null;
  if (isMulti) {
    confirmBtn = elt(
      "button",
      {
        style:
          "flex:2;padding:10px;background:var(--sa);color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;font-size:14px;transition:0.2s;opacity:0.5",
        disabled: true,
        onclick: () => {
          onSelect(selectedBuffer); // Возвращаем массив
          overlay.remove();
        },
      },
      `Сохранить (0/${maxLimit})`,
    );
    header.append(btnPhoto, btnVideo, confirmBtn);
  } else {
    // В одиночном режиме только переключатели
    header.append(btnPhoto, btnVideo);
  }

  const grid = elt("div", {
    style:
      "flex:1;overflow-y:auto;display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));grid-auto-rows:140px;padding:15px",
  });

  contentBox.append(header, grid);
  overlay.append(closeBtn, contentBox);
  document.body.append(overlay);

  const localCache = {};

  function updateUI() {
    if (!isMulti) return; // В одиночном режиме UI обновлять не надо
    const count = selectedBuffer.length;
    confirmBtn.textContent = `Сохранить (${count}/${maxLimit})`;
    confirmBtn.disabled = count === 0;
    confirmBtn.style.opacity = count > 0 ? "1" : "0.5";

    $$(".gallery-item").forEach((el) => {
      const url = el.dataset.url;
      const isSelected = selectedBuffer.some((item) => item.url === url);
      if (isSelected) {
        el.style.border = "4px solid var(--sa)";
        el.style.transform = "scale(0.95)";
        el.style.opacity = "1";
      } else {
        el.style.border = "1px solid #444";
        el.style.transform = "scale(1)";
        el.style.opacity = count >= maxLimit ? "0.4" : "1";
      }
    });
  }

  async function load(type) {
    grid.innerHTML =
      '<div style="color:#ccc;padding:20px;grid-column:1/-1;text-align:center">Загрузка медиа...</div>';

    if (type === "images") {
      btnPhoto.style.background = "#007aff";
      btnVideo.style.background = "#444";
    } else {
      btnPhoto.style.background = "#444";
      btnVideo.style.background = "#007aff";
    }

    if (!localCache[type]) localCache[type] = await fetchMedia(profileId, type);
    const items = localCache[type];

    grid.innerHTML = "";
    if (!items.length) {
      grid.innerHTML =
        '<div style="color:#ccc;padding:20px;grid-column:1/-1;text-align:center">Файлов нет</div>';
      return;
    }

    items.forEach((item) => {
      const src = item.link || item.url;
      
      // Превью: для видео используем thumb_link напрямую, для фото - makeThumb
      let thumb = null;
      if (type === "videos") {
        // Для видео ВСЕГДА используем thumb_link с сервера
        thumb = item.thumb_link || item.preview_url || item.thumb || item.poster || item.screenshot_url;
      } else {
        // Для фото строим w-250-h-250
        thumb = makeThumb(src);
      }

      const mediaItem = {
        id: item.id || item.content_id,
        url: src,
        thumb: thumb || null,
        thumb_link: item.thumb_link || null,
        filename:
          item.filename || (type === "images" ? "image.jpg" : "video.mp4"),
        type: type, // "videos" или "images"
      };

      const el = elt("div", {
        className: "gallery-item",
        "data-url": src,
        style:
          "position:relative;width:100%;height:100%;cursor:pointer;border:1px solid #444;background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:8px;transition:all 0.1s",
        onclick: () => {
          // --- ЛОГИКА ОДИНОЧНОГО РЕЖИМА ---
          if (!isMulti) {
            onSelect(mediaItem); // Сразу возвращаем 1 объект
            overlay.remove(); // И закрываем окно
            return;
          }

          // --- ЛОГИКА МУЛЬТИ РЕЖИМА ---
          const index = selectedBuffer.findIndex((x) => x.url === src);
          if (index !== -1) {
            selectedBuffer.splice(index, 1);
          } else {
            if (selectedBuffer.length >= maxLimit) return;
            selectedBuffer.push(mediaItem);
          }
          updateUI();
        },
      });

      // Правый клик = открыть в полный размер
      el.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        openLightbox(mediaItem);
      });

      if (thumb) {
        const img = elt("img", {
          src: thumb,
          loading: "lazy",
          style: "width:100%;height:100%;object-fit:cover;pointer-events:none",
        });
        
        // Обработка битых картинок
        img.onerror = function () {
          this.style.display = "none";
          el.style.display = "flex";
          el.style.alignItems = "center";
          el.style.justifyContent = "center";
          el.style.color = "#888";
          el.style.fontSize = "12px";
          el.textContent = type === "videos" ? "VIDEO" : "IMAGE";
        };
        
        el.append(img);
      } else {
        el.style.color = "#888";
        el.style.fontSize = "12px";
        el.textContent = type === "videos" ? "VIDEO" : "IMAGE";
      }

      if (type === "videos") {
        el.append(
          elt(
            "div",
            {
              style:
                "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:32px;color:#fff;pointer-events:none;background:rgba(0,0,0,0.2)",
            },
            "▶",
          ),
        );
      }
      grid.append(el);
    });
    updateUI();
  }

  load("images");
}
// --- ОБНОВЛЕННАЯ ВКЛАДКА LETTERS ---
// --- ОБНОВЛЕННАЯ ВКЛАДКА LETTERS (Яркая кнопка) ---
// --- ПИСЬМА С ТАЙМЕРОМ ---
// --- ПИСЬМА С ТАЙМЕРОМ (Мультиселект) ---
// Глобальный таймер для Letters
let lettersTimerInterval = null;
const LTR_DRAFT = { duration: 60 };

function renderLetters(e) {
  let s = loadSet();
  let currentPid = s.invProfile;
  let draftMedia = [];

  // ПЕРЕДАЕМ "letter"
  const layoutPromise = createProfileSidebar(
    e,
    currentPid,
    (newPid) => {
      currentPid = newPid;
      s.invProfile = newPid;
      saveSet(s);
      renderRightSide();
    },
    "letter",
  );

  let contentContainer = null;
  layoutPromise.then(({ content }) => {
    contentContainer = content;
    renderRightSide();
  });

  // Функция мгновенного обновления для писем
  function updateSidebarDot() {
    if (!currentPid) return;
    const list = loadLetters(currentPid);
    const hasLetters = list && list.length > 0;
    const el = document.getElementById(`ah-status-${currentPid}`);
    if (el) {
      el.className = `ah-p-status ${hasLetters ? (loadSet().running ? "ah-status-go" : "ah-status-warn") : "ah-status-none"}`;
      el.title = hasLetters ? "Есть сохраненные письма" : "Нет писем";
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

    const lettersList = loadLetters(currentPid);

    const letCharCount = elt("div", {
      style: "text-align:right;font-size:11px;color:#636e72;padding:2px 0 6px;",
    }, "0 / 3000");

    const inputArea = elt("textarea", {
      className: "ah-compose-area",
      style: "min-height: 150px;",
      placeholder: "Текст письма... (до 3000 символов)",
      maxlength: 3000,
      oninput: (ev) => {
        const len = ev.target.value.length;
        letCharCount.textContent = `${len} / 3000`;
        letCharCount.style.color = len > 2700 ? "#e17055" : len > 2400 ? "#fdcb6e" : "#b2bec3";
      },
    });

    const mediaPreviewBox = elt("div", {
      style: "display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px",
    });

    function updateMediaPreview() {
      mediaPreviewBox.innerHTML = "";
      draftMedia.forEach((m, idx) => {
        const isVid = m.type === "video" || m.type === "videos";
        // Для видео используем thumb_link, для фото - makeThumb
        const thumbSrc = isVid ? (m.thumb_link || m.thumb || null) : makeThumb(m.url);
        const box = elt("div", {
          style:
            "position:relative;width:60px;height:60px;border-radius:8px;overflow:hidden;border:1px solid #dfe6e9;background:#2d3436;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;cursor:pointer;",
        });

        // Клик для открытия в полный размер
        box.onclick = () => {
          openLightbox({
            id: m.id,
            url: m.url,
            thumb: thumbSrc,
            type: isVid ? "videos" : "images"
          });
        };

        if (thumbSrc) {
          const img = elt("img", {
            src: thumbSrc,
            loading: "lazy",
            style: "width:100%;height:100%;object-fit:cover",
          });
          // Обработка битых картинок
          img.onerror = () => { 
            img.remove(); 
            box.textContent = isVid ? "VID" : "IMG"; 
          };
          box.append(img);
          
          // Добавляем иконку play для видео
          if (isVid) {
            box.append(elt("div", {
              style: "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.25);pointer-events:none;font-size:20px;color:#fff;"
            }, "▶"));
          }
        } else {
          box.textContent = isVid ? "VID" : "IMG";
        }

        const del = elt(
          "div",
          {
            style:
              "position:absolute;top:0;right:0;width:20px;height:20px;background:rgba(0,0,0,0.6);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;z-index:1;",
            onclick: (ev) => {
              ev.stopPropagation();
              draftMedia.splice(idx, 1);
              updateMediaPreview();
              updateAttachBtn();
            },
          },
          "×",
        );
        box.append(del);
        mediaPreviewBox.append(box);
      });
    }

    const attachBtn = elt(
      "div",
      {
        className: "ah-tool-btn",
        onclick: () => {
          const remaining = 5 - draftMedia.length;
          if (remaining <= 0) return alert("Максимум 5!");
          openUniversalGallery(
            currentPid,
            (newItems) => {
              if (newItems && newItems.length > 0) {
                draftMedia.push(...newItems);
                updateMediaPreview();
                updateAttachBtn();
              }
            },
            remaining,
          );
        },
      },
      "📎 Прикрепить",
    );

    function updateAttachBtn() {
      if (draftMedia.length > 0) {
        attachBtn.classList.add("has-data");
        attachBtn.innerHTML = `📎 ${draftMedia.length} файл(ов)`;
      } else {
        attachBtn.classList.remove("has-data");
        attachBtn.innerHTML = `📎 Прикрепить`;
      }
    }

    const timeInput = elt("input", {
      type: "number",
      className: "ah-time-input",
      value: LTR_DRAFT.duration,
      min: 1,
      onchange: (ev) => {
        LTR_DRAFT.duration = parseInt(ev.target.value) || 60;
      },
    });

    // --- ОБЩАЯ ФУНКЦИЯ ДОБАВЛЕНИЯ ПИСЬМА ---
    let _letEditIdx = null; // индекс редактируемого письма

    const handleAddLetter = () => {
      LTR_DRAFT.duration = parseInt(timeInput.value) || 60;

      const txt = inputArea.value.trim();
      if (!txt && draftMedia.length === 0) return;
      const letterObj = {
        text: txt,
        media: [...draftMedia],
        duration: LTR_DRAFT.duration,
      };

      // Режим редактирования
      if (_letEditIdx !== null) {
        lettersList[_letEditIdx] = letterObj;
        _letEditIdx = null;
        const addBtn = contentContainer.querySelector(".ah-send-btn");
        if (addBtn) addBtn.textContent = "Добавить письмо";
      } else {
        lettersList.push(letterObj);
      }
      saveLetters(lettersList, currentPid);
      updateSidebarDot();
      inputArea.value = "";
      draftMedia = [];
      updateMediaPreview();
      updateAttachBtn();
      renderRightSide();
    };

    // Привязываем отправку на Enter (без Shift)
    inputArea.onkeydown = (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault(); // Запрещаем перенос строки
        handleAddLetter();
      }
    };

    const toolbar = elt(
      "div",
      { className: "ah-compose-toolbar" },
      elt(
        "div",
        { className: "ah-tool-group" },
        attachBtn,
        elt("div", { style: "color:#b2bec3" }, "|"),
        "Рассылать:",
        timeInput,
        "мин",
      ),
      elt(
        "button",
        {
          className: "ah-send-btn",
          onclick: handleAddLetter, // Вызываем функцию при клике
        },
        "Добавить письмо",
      ),
    );

    const composeBox = elt(
      "div",
      { className: "ah-compose-box" },
      inputArea,
      mediaPreviewBox,
      toolbar,
    );

    // Счётчик символов — отдельно под compose-box, над списком
    contentContainer.append(composeBox, letCharCount);

    const listContainer = elt("div", {
      style: "display:flex; flex-direction:column;",
    });

    if (lettersList.length > 0) {
      const clearAllBtn = elt(
        "div",
        {
          style:
            "align-self: flex-end; color: #ff7675; cursor: pointer; font-size: 12px; font-weight: 600; margin-bottom: 10px; display:flex; align-items:center; gap:4px; opacity: 0.8; transition: .2s",
          onclick: () => {
            if (
              confirm(
                `Удалить ВСЕ письма (${lettersList.length} шт.) у этой анкеты?`,
              )
            ) {
              saveLetters([], currentPid);
              // ОБНОВЛЕНИЕ КРУЖОЧКА
              updateSidebarDot();
              renderRightSide();
            }
          },
          onmouseover: (e) => (e.currentTarget.style.opacity = 1),
          onmouseout: (e) => (e.currentTarget.style.opacity = 0.8),
        },
        "🗑 Очистить всё",
      );

      // Кнопка очистки писем на ВСЕХ профилях
      const clearAllProfilesBtn = elt("div", {
        style: "align-self:flex-end;color:#e17055;cursor:pointer;font-size:12px;font-weight:600;margin-bottom:10px;margin-left:10px;display:flex;align-items:center;gap:4px;opacity:0.8;transition:.2s",
        onclick: () => {
          if (confirm("Очистить письма на ВСЕХ анкетах?")) {
            AH_STORE.mem.letters = {};
            st.set({ [AH_STORE_KEYS.letters]: {} });
            alert("✅ Все письма очищены!");
            renderRightSide();
          }
        },
        onmouseover: e => (e.currentTarget.style.opacity = 1),
        onmouseout: e => (e.currentTarget.style.opacity = 0.8),
      }, "🌍 Очистить письма (все анкеты)");
      listContainer.append(clearAllProfilesBtn, clearAllBtn);
    }

    if (lettersList.length === 0) {
      listContainer.innerHTML = `<div style="text-align:center;color:#b2bec3;padding:30px;border:2px dashed #f1f2f6;border-radius:12px">Нет активных писем.</div>`;
    }

    lettersList.forEach((item, idx) => {
      const isObj = typeof item === "object" && item !== null;
      const textContent = isObj ? item.text : item;
      const mediaItems = isObj && item.media ? item.media : [];
      const mediaCount = mediaItems.length;
      const dur = isObj && item.duration ? item.duration : 60;

      const row = elt("div", { className: "ltr-item", "data-idx": idx });

      // --- Static preview thumbnails ---
      let thumbsContainer = null;
      if (mediaCount > 0) {
        thumbsContainer = elt("div", { style: "display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;" });
        mediaItems.forEach((m) => {
          const isVid = m.type === "video" || m.type === "videos";
          const thumbSrc = isVid ? (m.thumb_link || m.thumb || null) : (m.thumb || makeThumb(m.url));
          const box = elt("div", {
            style: "width:45px;height:45px;border-radius:6px;overflow:hidden;border:1px solid #dfe6e9;background:#2d3436;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:bold;flex-shrink:0;position:relative;cursor:pointer;",
          });
          
          // Клик для открытия в полный размер
          box.onclick = () => {
            openLightbox({
              id: m.id,
              url: m.url,
              thumb: thumbSrc,
              type: isVid ? "videos" : "images"
            });
          };
          
          if (thumbSrc) {
            const img = elt("img", { 
              src: thumbSrc, 
              loading: "lazy",
              style: "width:100%;height:100%;object-fit:cover;" 
            });
            img.onerror = () => { img.remove(); box.textContent = isVid ? "VID" : "IMG"; };
            box.append(img);
            if (isVid) box.append(elt("div", { style: "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.25);pointer-events:none;font-size:14px;color:#fff;" }, "▶"));
          } else { box.textContent = isVid ? "VID" : "IMG"; }
          thumbsContainer.append(box);
        });
      }

      const contentDiv = elt("div", { className: "item-content" },
        elt("div", { className: "item-text" }, textContent || (mediaCount ? "Media Only" : "Empty")),
        thumbsContainer,
        elt("div", { className: "item-meta", style: thumbsContainer ? "margin-top:6px" : "" },
          elt("div", { className: "inv-timer", style: "display:none;" }, ""),
        ),
      );

      // --- Timer input ---
      const timeEdit = elt("input", {
        type: "number",
        className: "ah-time-input",
        style: "width:45px;padding:2px;font-size:11px;",
        value: dur,
        min: 1,
        onchange: (ev) => {
          if (isObj) item.duration = parseInt(ev.target.value);
          else lettersList[idx] = { text: item, duration: parseInt(ev.target.value) };
          saveLetters(lettersList, currentPid);
        },
      });

      // --- Delete button ---
      const delBtn = elt("div", {
        className: "del-btn",
        title: "Удалить",
        onclick: () => {
          if (confirm("Удалить письмо?")) {
            lettersList.splice(idx, 1);
            saveLetters(lettersList, currentPid);
            updateSidebarDot();
            renderRightSide();
          }
        },
      }, "×");

      // --- Inline edit panel (toggled by ✎ button) ---
      const inlinePanel = elt("div", { style: "display:none;flex-direction:column;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid #dfe6e9;" });

      const inlineTa = elt("textarea", {
        style: "width:100%;min-height:100px;border:1px solid #dfe6e9;border-radius:8px;padding:8px;font-size:13px;font-family:'Inter', system-ui, sans-serif;resize:vertical;outline:none;box-sizing:border-box;line-height:1.5;",
        maxlength: 3000,
      });
      inlineTa.value = textContent || "";
      const inlineCharCount = elt("div", { style: "font-size:10px;color:#b2bec3;text-align:right;" },
        `${(textContent || "").length} / 3000`);
      inlineTa.addEventListener("input", () => {
        const len = inlineTa.value.length;
        inlineCharCount.textContent = `${len} / 3000`;
        inlineCharCount.style.color = len > 2700 ? "#e17055" : len > 2400 ? "#fdcb6e" : "#b2bec3";
      });

      let inlineEditMedia = mediaItems ? mediaItems.map(m => ({ ...m })) : [];
      const inlineThumbsBox = elt("div", { style: "display:flex;gap:6px;flex-wrap:wrap;" });

      function renderInlineThumbs() {
        inlineThumbsBox.innerHTML = "";
        inlineEditMedia.forEach((m, mi) => {
          const isVid = m.type === "video" || m.type === "videos";
          // Для видео используем thumb_link, для фото - makeThumb
          const thumbSrc = isVid ? (m.thumb_link || m.thumb || null) : (m.thumb || makeThumb(m.url));
          const box = elt("div", { style: "position:relative;width:45px;height:45px;border-radius:6px;overflow:hidden;border:1px solid #dfe6e9;background:#2d3436;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;cursor:pointer;" });
          
          // Клик для открытия в полный размер
          box.onclick = () => {
            openLightbox({
              id: m.id,
              url: m.url,
              thumb: thumbSrc,
              type: isVid ? "videos" : "images"
            });
          };
          
          if (thumbSrc) {
            const img = elt("img", { 
              src: thumbSrc, 
              loading: "lazy",
              style: "width:100%;height:100%;object-fit:cover;" 
            });
            img.onerror = () => { img.remove(); box.textContent = isVid ? "VID" : "IMG"; };
            box.append(img);
            
            // Добавляем иконку play для видео
            if (isVid) {
              box.append(elt("div", {
                style: "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.25);pointer-events:none;font-size:16px;color:#fff;"
              }, "▶"));
            }
          } else { box.textContent = isVid ? "VID" : "IMG"; }
          box.append(elt("div", {
            style: "position:absolute;top:1px;right:1px;background:rgba(0,0,0,0.55);color:#fff;border-radius:50%;width:14px;height:14px;display:flex;align-items:center;justify-content:center;font-size:10px;cursor:pointer;line-height:1;z-index:1;",
            onclick: (ev) => { ev.stopPropagation(); inlineEditMedia.splice(mi, 1); renderInlineThumbs(); updateInlineAttachBtn(); },
          }, "×"));
          inlineThumbsBox.append(box);
        });
      }
      renderInlineThumbs();

      const inlineAttachBtn = elt("div", {
        style: "padding:4px 10px;background:#f1f2f6;border-radius:6px;cursor:pointer;font-size:12px;color:#636e72;display:inline-flex;align-items:center;gap:4px;",
        onclick: () => {
          const remaining = 5 - inlineEditMedia.length;
          if (remaining <= 0) return alert("Максимум 5!");
          openUniversalGallery(currentPid, (newItems) => {
            if (newItems && newItems.length > 0) { inlineEditMedia.push(...newItems); renderInlineThumbs(); updateInlineAttachBtn(); }
          }, remaining);
        },
      }, "📎 Медиа");

      function updateInlineAttachBtn() {
        inlineAttachBtn.textContent = inlineEditMedia.length > 0 ? `📎 ${inlineEditMedia.length} файл(ов)` : "📎 Медиа";
      }

      const inlineSaveBtn = elt("button", {
        style: "padding:5px 14px;background:var(--sa);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;",
        onclick: () => {
          const newText = inlineTa.value.trim();
          if (!newText && inlineEditMedia.length === 0) return alert("Письмо не может быть пустым");
          lettersList[idx] = { text: newText, media: [...inlineEditMedia], duration: dur };
          saveLetters(lettersList, currentPid);
          updateSidebarDot();
          renderRightSide();
        },
      }, "💾 Сохранить");

      const inlineCancelBtn = elt("button", {
        style: "padding:5px 14px;background:#f1f2f6;color:#636e72;border:none;border-radius:6px;cursor:pointer;font-size:12px;",
        onclick: () => {
          inlinePanel.style.display = "none";
          inlineTa.value = textContent || "";
          inlineEditMedia = mediaItems ? mediaItems.map(m => ({ ...m })) : [];
          renderInlineThumbs();
          updateInlineAttachBtn();
        },
      }, "Отмена");

      inlinePanel.append(
        inlineTa, inlineCharCount, inlineThumbsBox,
        elt("div", { style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;" }, inlineAttachBtn, inlineSaveBtn, inlineCancelBtn),
      );

      // --- ✎ Edit toggle button ---
      const editLetBtn = elt("div", {
        title: "Редактировать",
        style: "width:28px;height:28px;border-radius:6px;background:#f1f2f6;color:#636e72;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;font-size:16px;line-height:1;",
        onclick: () => {
          const isOpen = inlinePanel.style.display !== "none";
          if (isOpen) {
            inlinePanel.style.display = "none";
          } else {
            inlineTa.value = textContent || "";
            inlineEditMedia = mediaItems ? mediaItems.map(m => ({ ...m })) : [];
            renderInlineThumbs();
            updateInlineAttachBtn();
            inlinePanel.style.display = "flex";
            inlinePanel.style.flexDirection = "column";
            setTimeout(() => inlineTa.focus(), 50);
          }
        },
      }, "✎");

      // --- 📎 Media button (always visible) ---
      const mediaBtn = elt("div", {
        title: "Добавить медиа",
        style: "width:28px;height:28px;border-radius:6px;background:#f1f2f6;color:#636e72;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;font-size:14px;",
        onclick: () => {
          const cur = lettersList[idx];
          const curMedia = (typeof cur === "object" && cur && Array.isArray(cur.media)) ? cur.media : [];
          const remaining = 5 - curMedia.length;
          if (remaining <= 0) return alert("Максимум 5!");
          openUniversalGallery(currentPid, (newItems) => {
            if (newItems && newItems.length > 0) {
              if (typeof lettersList[idx] === "object" && lettersList[idx]) {
                lettersList[idx].media = [...curMedia, ...newItems];
              } else {
                lettersList[idx] = { text: textContent || "", media: newItems, duration: dur };
              }
              saveLetters(lettersList, currentPid);
              renderRightSide();
            }
          }, remaining);
        },
      }, "📎");

      const actions = elt("div", { className: "item-actions" },
        mediaBtn,
        editLetBtn,
        delBtn,
        elt("div", { style: "display:flex;align-items:center;gap:4px;font-size:10px;color:#b2bec3;" }, timeEdit, "мин"),
      );

      row.append(contentDiv, actions, inlinePanel);
      listContainer.append(row);
    });

    contentContainer.append(composeBox, listContainer);
    startLettersTimer(currentPid, lettersList);
  }
}

// Новая функция таймера для писем
function startLettersTimer(pid, items) {
  if (lettersTimerInterval) clearInterval(lettersTimerInterval);

  const tick = () => {
    chrome.storage.local.get(["snRotationState", "snLastStatsTime"], (res) => {
      // 1. Очистка старых стилей
      document.querySelectorAll(".ltr-item").forEach((el) => {
        el.classList.remove("active-letter");
        const timerEl = el.querySelector(".inv-timer");
        if (timerEl) timerEl.style.display = "none";
      });

      // 2. Проверяем, запущен ли бот и жив ли сервер
      const s = loadSet();
      const isServerDead = Date.now() - (res.snLastStatsTime || 0) > 6000;

      if (!s.running || isServerDead) return; // Если стоп или сервер упал -> выходим

      // 3. Рисуем таймер
      const rotation = res.snRotationState || {};
      const key = `letter_${pid}_main`;
      const state = rotation[key];

      if (!state) return;

      const activeIdx = state.index;
      const startTime = state.startTime;
      const activeEl = document.querySelector(
        `.ltr-item[data-idx="${activeIdx}"]`,
      );

      if (activeEl) {
        activeEl.classList.add("active-letter");

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
  lettersTimerInterval = setInterval(tick, 1000);
}
// ===== LIGHTBOX для просмотра медиа =====
function openLightbox(item) {
  if (document.getElementById("ah-lightbox")) return;
  const overlay = elt("div", {
    id: "ah-lightbox",
    style: "position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;flex-direction:column;"
  });

  const closeBtn = elt("button", {
    style: "position:absolute;top:20px;right:28px;background:none;border:none;color:#fff;font-size:36px;cursor:pointer;z-index:2;line-height:1;",
    onclick: () => overlay.remove()
  }, "×");

  let media;
  if (item.type === "videos") {
    media = elt("video", {
      src: item.url,
      controls: true,
      autoplay: true,
      style: "max-width:90vw;max-height:80vh;border-radius:10px;background:#000;"
    });
  } else {
    media = elt("img", {
      src: item.url || item.thumb,
      style: "max-width:90vw;max-height:80vh;object-fit:contain;border-radius:10px;"
    });
  }

  const hint = elt("div", {
    style: "color:#aaa;font-size:13px;margin-top:12px;"
  }, "Нажмите × или Esc чтобы закрыть");

  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener("keydown", function escClose(e) {
    if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", escClose); }
  });

  overlay.append(closeBtn, media, hint);
  document.body.append(overlay);
}

// ===== processImageUpload — загрузка фото =====
// === ЗАГРУЗКА МЕДИА — точный API alpha.date ===
// Сайт делает 2 generate-link на один файл:
//   1й: оригинал → newFileName = w-{W}-h-{H}-{hash}.png
//   2й: превью   → newFileName = {hash}.png (без w-h)
//   /api/files/image получает link от 2-го запроса (без w-h — это и есть CDN URL превью)

function generateFileName() {
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  const d = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const t = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const r = Math.random().toString(36).slice(2, 10);
  return `image_${d}_${t}${r}`;
}

async function makeHash(file) {
  const str = file.name + file.size + Date.now() + Math.random();
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).slice(0, 16).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function makeThumbBlob(file) {
  // Создаём превью 250x250 через canvas
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const SIZE = 250;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      const scale = Math.max(SIZE / img.width, SIZE / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
      canvas.toBlob(blob => resolve(blob), "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

async function sendGenerateLink(token, fileBlob, blobName, newFileName, fileName, dir) {
  const fd = new FormData();
  fd.append("file", fileBlob, blobName);
  fd.append("newFileName", newFileName);
  fd.append("fileName", fileName);
  fd.append("dir", String(dir));
  fd.append("bucketName", "chats-images.cdndate.net");
  const r = await fetch("https://alpha.date/api/v3/click-history/aws/generate-link", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    credentials: "include",
    body: fd,
  });
  if (!r.ok) throw new Error("generate-link HTTP " + r.status);
  const j = await r.json();
  if (!j.status && !j.success) throw new Error("generate-link: " + JSON.stringify(j).slice(0, 80));
  return j.data;
}

async function processImageUpload(file, externalId, log) {
  const token = (localStorage.getItem("token") || "").trim();
  if (!token) throw new Error("Нет токена");

  const isVideo = file.type.startsWith("video/");
  const ext = file.name.split(".").pop().toLowerCase() || (isVideo ? "mp4" : "jpg");
  const fileName = generateFileName();
  const hash = await makeHash(file);
  const blobName = `${fileName}.${ext}`;

  log("  📤 Загружаем оригинал...");

  if (isVideo) {
    // === ВИДЕО: точный API alpha.date ===
    // Шаг 1: new-video-convert (multipart) → загрузка на chats-videos
    const videoNewFileName = `${hash}.${ext}`;
    // Только латиница, цифры и underscore — требование API
    const origFileName = file.name
      .replace(/\.\w+$/, "")           // убираем расширение
      .replace(/[^a-zA-Z0-9_]/g, "_")   // заменяем всё лишнее на _
      .replace(/_+/g, "_")              // убираем двойные _
      .slice(0, 50);                    // ограничиваем длину

    // fileName: только латиница/цифры/underscore (требование API)
    // Используем оригинальное имя файла очищенное, как делает сайт
    const safeFileName = origFileName || "video_" + hash.slice(0, 8);
    // newFileName: только hash + расширение (как сайт)
    const safeNewFileName = `${hash}.${ext}`;
    // blobName для file: тоже должен быть чистым
    const safeBlobName = `${safeFileName}.${ext}`;

    const fdV = new FormData();
    fdV.append("file", file, safeBlobName);
    fdV.append("newFileName", safeNewFileName);
    fdV.append("fileName", safeFileName);
    fdV.append("dir", String(externalId));
    fdV.append("bucketName", "chats-videos");

    const rv1 = await fetch("https://alpha.date/api/v3/video_converter/new-video-convert", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      credentials: "include",
      body: fdV,
    });
    if (!rv1.ok) throw new Error("new-video-convert HTTP " + rv1.status);
    const jv1 = await rv1.json();
    if (!jv1.status && !jv1.success) throw new Error("new-video-convert: " + JSON.stringify(jv1).slice(0, 80));

    const videoLink = jv1.data?.link;
    const videoFilename = jv1.data?.filename || origFileName;
    if (!videoLink) throw new Error("Нет video link в ответе: " + JSON.stringify(jv1).slice(0, 100));

    log("  📝 Регистрируем видео...");

    // Шаг 2: регистрация через /api/files/video
    const rv2 = await fetch("https://alpha.date/api/files/video", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ external_id: externalId, filename: videoFilename, link: videoLink }),
    });
    if (!rv2.ok) throw new Error("register video HTTP " + rv2.status);
    const jv2 = await rv2.json();
    if (!jv2.status) throw new Error("register video failed: " + JSON.stringify(jv2).slice(0, 100));

    log("  🎬 Запускаем конвертацию и генерацию превью...");

    // Шаг 3: триггер конвертации → сервер генерирует thumb_link
    await fetch("https://alpha.date/api/v3/video_converter", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ type: "link", data: videoLink }),
    }).catch(() => {}); // не критично если упадёт

    return jv2.video?.id;
  }

  // Фото: шаг 1 — оригинал, ВСЕГДА w-1920-h-1280 (так делает сайт)
  const origNewFileName = `w-1920-h-1280-${hash}.png`;
  await sendGenerateLink(token, file, blobName, origNewFileName, fileName, externalId);

  log("  🖼 Загружаем превью...");

  // Шаг 2 — превью 250x250, newFileName = w-250-h-250-{hash}.png (именно так сайт)
  const thumbBlob = await makeThumbBlob(file);
  const thumbNewFileName = `w-250-h-250-${hash}.png`;
  const thumbData = await sendGenerateLink(token, thumbBlob, `${fileName}.jpg`, thumbNewFileName, fileName, externalId);
  // link от превью: https://chats-images.cdndate.net/{dir}/w-250-h-250-{hash}.png
  const thumbLink = thumbData?.link || `https://chats-images.cdndate.net/${externalId}/${thumbNewFileName}`;
  // Для /api/files/image передаём link БЕЗ w-250-h-250 (оригинал без превью-префикса)
  const regLink = thumbLink.replace(`/w-250-h-250-`, `/`);

  log("  📝 Регистрируем...");

  // Шаг 3: регистрация
  const regFilename = `${fileName}.png`;
  const r3 = await fetch("https://alpha.date/api/files/image", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ external_id: externalId, filename: regFilename, link: regLink }),
  });
  if (!r3.ok) throw new Error("register HTTP " + r3.status);
  const j3 = await r3.json();
  if (!j3.status) throw new Error("register failed: " + JSON.stringify(j3).slice(0, 100));
  return j3.image?.id;
}

function renderTools(e) {
  // ─── helpers ────────────────────────────────────────────────────────────────

  // Хелпер: карточка с оверлеем "Доступно по подписке"
  const mkLockedCard = (title, ...bgChildren) => {
    const card = elt("div", {
      style: [
        "background:#fff;border:1px solid #f0f0f0;border-radius:14px;",
        "padding:18px 20px;position:relative;overflow:hidden;",
      ].join("")
    });
    // Заголовок
    if (title) {
      card.append(elt("div", {
        style: "font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#c0c4cc;margin-bottom:14px;font-family:'Inter',system-ui,sans-serif;"
      }, title));
    }
    
    const hasKey = !!loadSet().authKey;
    if (hasKey) {
      bgChildren.forEach(c => c && card.append(c));
      return card;
    }

    // Фоновый контент (размытый)
    const bg = elt("div", { style: "filter:blur(3px) grayscale(1);opacity:0.3;pointer-events:none;user-select:none;" });
    bgChildren.forEach(c => c && bg.append(c));
    card.append(bg);
    // Оверлей
    const overlay = elt("div", {
      style: [
        "position:absolute;inset:0;",
        "display:flex;flex-direction:column;align-items:center;justify-content:center;",
        "background:rgba(248,249,250,0.88);backdrop-filter:blur(1px);",
        "gap:10px;",
      ].join("")
    });
    overlay.append(
      elt("div", { style: "font-size:13px;font-weight:700;color:#636e72;font-family:'Inter',system-ui,sans-serif;" }, "🔒 Доступно по подписке"),
      elt("a", {
        href: "https://t.me/brachka_rass",
        target: "_blank",
        rel: "noopener noreferrer",
        style: [
          "display:inline-flex;align-items:center;gap:5px;",
          "padding:6px 16px;border-radius:8px;",
          "background:linear-gradient(135deg,#0088cc,#006aaa);",
          "color:#fff;font-size:12px;font-weight:600;",
          "text-decoration:none;font-family:'Inter',system-ui,sans-serif;",
          "box-shadow:0 3px 10px rgba(0,136,204,0.3);",
        ].join("")
      }, "✈️ TG: @brachka_rass"),
    );
    card.append(overlay);
    return card;
  };


  // Секция-карточка — минималистичная, без лишних теней
  const mkCard = (title, ...children) => {
    const card = elt("div", {
      style: [
        "background:#fff;",
        "border:1px solid #f0f0f0;",
        "border-radius:14px;",
        "padding:18px 20px;",
        "margin-bottom:12px;",
      ].join("")
    });
    if (title) {
      card.append(elt("div", {
        style: [
          "font-size:10px;font-weight:700;",
          "letter-spacing:1.2px;text-transform:uppercase;",
          "color:#c0c4cc;margin-bottom:14px;",
          "font-family:'Inter',system-ui,sans-serif;",
        ].join("")
      }, title));
    }
    children.forEach(c => c && card.append(c));
    return card;
  };

  // Универсальный toggle-ряд — чистый, Inter, без лишнего
  const mkToggleRow = (label, getVal, setVal) => {
    const row = elt("div", {
      style: [
        "display:flex;align-items:center;justify-content:space-between;",
        "padding:10px 0;border-bottom:1px solid #f7f7f7;",
        "font-family:'Inter',system-ui,sans-serif;",
      ].join("")
    });
    const lbl = elt("label", { style: "position:relative;display:inline-block;width:38px;height:21px;flex-shrink:0;cursor:pointer;" });
    const inp = elt("input", { type: "checkbox" });
    inp.style.cssText = "opacity:0;width:0;height:0;position:absolute;";
    const track = elt("span", { style: "position:absolute;cursor:pointer;inset:0;background:#e8e8e8;border-radius:21px;transition:.2s;" });
    const knob  = elt("span", { style: "position:absolute;height:15px;width:15px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 4px rgba(0,0,0,.15);" });
    track.append(knob); lbl.append(inp, track);
    const setV = on => {
      track.style.background = on ? "var(--sa,#6c5ce7)" : "#e8e8e8";
      knob.style.transform = on ? "translateX(17px)" : "translateX(0)";
    };
    getVal(v => { inp.checked = v; setV(v); });
    inp.addEventListener("change", () => { setV(inp.checked); setVal(inp.checked); });
    row.append(
      elt("span", { style: "font-size:13px;color:#3a3a3a;font-weight:450;letter-spacing:-.1px;" }, label),
      lbl
    );
    return row;
  };

  // Обёртки для разных источников хранения
  const mkToggle = (label, storageKey, defaultVal, onChange) =>
    mkToggleRow(label,
      cb => chrome.storage.local.get([storageKey], r => cb(r[storageKey] !== undefined ? r[storageKey] : defaultVal)),
      v  => { chrome.storage.local.set({ [storageKey]: v }); if (onChange) onChange(v); }
    );

  // Контейнер с отступами (Новый дизайн)
  const container = elt("div", {
    className: "ah-single-wrapper",
    style: "font-family:'Inter',system-ui,sans-serif;",
  });

  // ─── 1. Инструменты оператора ───────────────────────────────────────────────
  const statusDiv = elt("div", { style: "font-size:12px;color:#636e72;margin-top:10px;display:none;text-align:center;font-family:'Inter',system-ui,sans-serif;" });

  const btnSenders = elt("button", {
    style: [
      "width:100%;padding:11px;",
      "background:var(--sa,#6c5ce7);color:#fff;",
      "border:none;border-radius:10px;",
      "font-weight:600;cursor:pointer;font-size:13px;",
      "font-family:'Inter',system-ui,sans-serif;",
      "letter-spacing:-.1px;transition:.15s;",
    ].join(""),
    onmouseover: ev => ev.currentTarget.style.opacity = ".82",
    onmouseout:  ev => ev.currentTarget.style.opacity = "1",
    onclick: () => {
      if (!confirm("Включить сендеры (Chat и Letter) на ВСЕХ анкетах?")) return;
      statusDiv.style.display = "block";
      statusDiv.textContent = "Запуск...";
      chrome.runtime.sendMessage({ cmd: "enableAllSenders" }, res => {
        statusDiv.textContent = res?.ok ? "✓ Запущено в фоне" : "✗ Ошибка: " + (res?.error || "Unknown");
        statusDiv.style.color = res?.ok ? "var(--sa,#6c5ce7)" : "#d63031";
      });
    },
  }, "⚡ Включить сендеры (все анкеты)");

  const mkDangerBtn = (text, onClick) => elt("button", {
    style: [
      "flex:1;padding:9px 8px;",
      "background:#fff;color:#d63031;",
      "border:1px solid #ffd0d0;border-radius:10px;",
      "font-weight:500;cursor:pointer;font-size:12px;",
      "font-family:'Inter',system-ui,sans-serif;",
      "transition:.15s;",
    ].join(""),
    onmouseover: ev => { ev.currentTarget.style.background="#d63031"; ev.currentTarget.style.color="#fff"; },
    onmouseout:  ev => { ev.currentTarget.style.background="#fff"; ev.currentTarget.style.color="#d63031"; },
    onclick: onClick,
  }, text);

  const btnClearInvites = mkDangerBtn("🗑 Все инвайты", () => {
    if (!confirm("Удалить ВСЕ инвайты на ВСЕХ анкетах?")) return;
    AH_STORE.mem.invites = {};
    st.set({ [AH_STORE_KEYS.invites]: {} });
  });

  const btnClearLetters = mkDangerBtn("🗑 Все письма", () => {
    if (!confirm("Удалить ВСЕ письма на ВСЕХ анкетах?")) return;
    AH_STORE.mem.letters = {};
    st.set({ [AH_STORE_KEYS.letters]: {} });
  });

  container.append(mkCard("Оператор",
    btnSenders,
    statusDiv,
    elt("div", { style: "display:flex;gap:8px;margin-top:10px;" }, btnClearInvites, btnClearLetters),
  ));


  // ─── 2. Скачать историю ─────────────────────────────────────────────────────
  const p = /^https:\/\/alpha\.date\/(?:chance|chat)\/([a-z0-9-]+)$/i.exec(location.href);

  if (!p) {
    container.append(mkCard(null,
      elt("div", { style: "display:flex;align-items:center;gap:12px;color:#aaa;" },
        elt("span", { style: "font-size:20px;" }, "💬"),
        elt("div", {},
          elt("div", { style: "font-size:13px;font-weight:600;color:#555;margin-bottom:2px;" }, "Чат не открыт"),
          elt("div", { style: "font-size:12px;color:#aaa;" }, "Откройте чат с мужчиной, чтобы скачать переписку."),
        ),
      ),
    ));
    // НЕ делаем return — продолжаем рендерить Stop List, Stats, Blur ниже
  } else {
  const d = elt(
    "div",
    {
      style:
        "color:#b2bec3; text-align:center; padding:30px; font-size:14px; display:flex; flex-direction:column; gap:10px; align-items:center; flex:1; justify-content:center",
    },
    elt("div", { className: "spin", style: "font-size:24px" }, "↻"),
    "Загрузка данных...",
  );

  const downloadCard = mkLockedCard("📥 Скачать историю / Инфо", d);
  container.append(downloadCard);
  e.append(container);

  // --- ЛОГИКА ---
  const m = p[1],
    u = localStorage.getItem("token") || "";

  if (!u) {
    d.textContent = "Не найден JWT-токен. Перезайдите на сайт.";
    d.style.color = "#d32f2f";
    return;
  }

  const h = {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    Authorization: "Bearer " + u,
  };

  let t = null, // ID мужчины
    n = null, // ID женщины
    o = null, // Детали мужчины
    a = null, // Div для женщины
    i = null, // Кнопка Чат
    c = null, // Кнопка Письма
    r = null, // Input даты
    s = "", // Имя мужчины
    l = ""; // Имя женщины

  async function f(type) {
    const btn = "chat" === type ? i : c;
    const otherBtn = "chat" === type ? c : i;
    const stopKey = "chat" === type ? "ahChatStop" : "ahMailStop";

    if (btn.textContent.includes("Скачать")) {
      window[stopKey] = false;
      btn.textContent = "Стоп";
      btn.style.background = "#ff7675";
      otherBtn.disabled = true;
      otherBtn.style.opacity = 0.5;
    } else {
      window[stopKey] = true;
      return;
    }

    const dateVal = r.value;
    const dateLimit = dateVal ? Date.parse(dateVal) : -Infinity;
    const parseDate = (e) => Date.parse(e.date_created || e.created_at || 0);

    const g = (url, body) => {
      if (url.startsWith("https://alpha.date/")) {
        return pageFetchJson(url.replace("https://alpha.date", ""), {
          method: "POST",
          headers: h,
          body: JSON.stringify(body),
        }).then(({ json: e }) => e);
      }
      return fetch(url, {
        method: "POST",
        headers: h,
        credentials: "include",
        body: JSON.stringify(body),
      }).then((e) => e.json());
    };

    try {
      if ("chat" === type) {
        const results = [];
        const fetchPage = (p) =>
          g("https://alpha.date/api/chatList/chatHistory", {
            chat_id: m,
            page: p,
          });

        for (let n = 1; !window.ahChatStop; n += 2) {
          const [res1, res2] = await Promise.allSettled([
            fetchPage(n),
            fetchPage(n + 1),
          ]);
          let hasData = false,
            minDate = Infinity;

          for (const res of [res1, res2]) {
            if (res.status === "fulfilled" && res.value.status) {
              const list = res.value.response || [];
              if (list.length === 20) hasData = true;
              for (const msg of list) {
                const d = parseDate(msg);
                minDate = Math.min(minDate, d);
                if (
                  msg.message_type === "SENT_TEXT" &&
                  msg.message_content?.trim()
                ) {
                  if (d >= dateLimit) results.push(msg);
                }
              }
            }
          }
          if (minDate < dateLimit || (!hasData && n > 2)) break;
          btn.innerHTML = `<span class="spin">↻</span> Стр ${n}..`;
        }

        results.sort((a, b) => parseDate(a) - parseDate(b));
        const text = results
          .map((msg) => {
            const author = msg.is_male ? s : l || "Me";
            return `${author}\n  ${new Date(parseDate(msg)).toLocaleString()}\n  ${msg.message_content.trim()}\n  \n  `;
          })
          .join("");
        saveFile(text, `chat_${m}.txt`);
      }

      if ("letters" === type) {
        if (!t || !n)
          return (
            alert("Профили ещё не определились; попробуйте через пару секунд."),
            resetBtns()
          );

        const fetchPage = (p) =>
          g("https://alpha.date/api/mailbox/mails", {
            user_id: n,
            folder: "dialog",
            man_id: t,
            page: p,
          });

        const firstRes = await fetchPage(1);
        if (!firstRes.status) return resetBtns();

        const totalPages = firstRes.response.pages || 1;
        const mails = [...firstRes.response.mails];

        for (
          let page = 2;
          page <= totalPages && !window.ahMailStop;
          page += 2
        ) {
          const [r1, r2] = await Promise.allSettled([
            fetchPage(page),
            fetchPage(page + 1),
          ]);
          for (const res of [r1, r2]) {
            if (res.status === "fulfilled" && res.value.status) {
              mails.push(...res.value.response.mails);
            }
          }
          if (mails.at(-1) && parseDate(mails.at(-1).mail) < dateLimit) break;
          btn.innerHTML = `<span class="spin">↻</span> Стр ${page}..`;
        }

        const filtered = mails
          .map((e) => e.mail)
          .filter((e) => parseDate(e) >= dateLimit)
          .sort((a, b) => parseDate(a) - parseDate(b))
          .map(
            (e) =>
              `${e.sender_name}, ${e.sender_age}\n${new Date(parseDate(e)).toLocaleString()}\n${e.message_content?.trim() || "[-без текста-]"}\n`,
          );
        saveFile(
          filtered.join("\n------------------\n"),
          `letters_${n}_${t}.txt`,
        );
      }
    } catch (err) {
      alert("Ошибка: " + err.message);
    }

    resetBtns();

    function saveFile(content, filename) {
      if (!content || !content.length) return alert("Ничего не найдено.");
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 800);
    }

    function resetBtns() {
      window.ahChatStop = window.ahMailStop = false;
      i.textContent = "💬 Скачать чат";
      i.style.background = "#0984e3";
      i.disabled = false;
      i.style.opacity = 1;

      c.textContent = "✉️ Скачать письма";
      c.style.background = "#6c5ce7";
      c.style.disabled = false;
      c.style.opacity = 1;
    }
  }

  pageFetchJson("/api/chatList/chatHistory", {
    method: "POST",
    headers: h,
    body: JSON.stringify({ chat_id: m, page: 1 }),
  })
    .then(({ json: e }) => {
      if (!e.status || !Array.isArray(e.response))
        throw new Error("Некорректный ответ history");

      for (const msg of e.response) {
        const isMale = msg.is_male === 1 || msg.is_male === true;
        const isFemale = msg.is_male === 0 || msg.is_male === false;

        if (isMale) {
          t = msg.sender_external_id;
          n = msg.recipient_external_id;
        } else if (isFemale) {
          n = msg.sender_external_id;
          t = msg.recipient_external_id;
        }
        if (t && n) break;
      }

      if (t) {
        return pageFetchJson(
          `/api/operator/myProfile?user_id=${t}&activeProfile=false`,
          { method: "GET", headers: h },
        ).then(({ json: res }) => {
          if (!res) throw new Error("Пустой ответ от myProfile");

          // --- УЛЬТРА-ПОИСК: Ищет значение ВЕЗДЕ в ответе сервера ---
          function findDeep(obj, key) {
            if (typeof obj !== "object" || obj === null) return null;
            if (obj.hasOwnProperty(key) && obj[key] !== null && obj[key] !== "")
              return obj[key];
            for (let k in obj) {
              const result = findDeep(obj[k], key);
              if (result !== null) return result;
            }
            return null;
          }

          const photo =
            findDeep(res, "photo_link") ||
            "https://alpha.date/static/media/profile_img_empty.0b3d6665cd1c1b51de71.jpg";
          const nameStr = findDeep(res, "name") || "Unknown";
          const ageStr = findDeep(res, "age") || "?";
          s = `${nameStr}, ${ageStr}`; // Имя мужчины для файла

          // --- УМНЫЙ ПОИСК ДАТЫ РЕГИСТРАЦИИ ---
          const rawDate =
            findDeep(res, "created_at") || findDeep(res, "date_created");
          let createdStr = "—";
          if (rawDate) {
            let dateVal = rawDate;
            // Защита от Unix формата (секунды vs миллисекунды)
            if (typeof dateVal === "number" && dateVal < 10000000000)
              dateVal *= 1000;
            const pDate = new Date(dateVal);
            if (!isNaN(pDate.getTime())) {
              createdStr = pDate.toLocaleString("ru-RU", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              });
            }
          }

          // --- УМНЫЙ ПОИСК САЙТА РЕГИСТРАЦИИ ---
          const rawSiteId = findDeep(res, "site_id");
          const siteName = rawSiteId
            ? ({
                1: "SofiaDate.com",
                2: "MySpecialDates.com",
                5: "LoveForHeart.com",
                6: "AmourMeet.com",
                7: "OkAmour.com",
                8: "Avodate.com",
                9: "DateMpire.com",
                10: "FeelFlame.com",
                11: "LatiDate.com",
                12: "SakuraDate.com",
                13: "LatiDreams.com",
                14: "NaomiDate.com",
                15: "AmorPulse.com",
                16: "NikaDate.com",
                32: "MagnoliaDate.com",
              }[rawSiteId] ?? `site_id: ${rawSiteId}`)
            : "Скрыто сайтом";

          // --- ВЕРСТКА ИНТЕРФЕЙСА (ТРИ КОЛОНКИ) ---

          // 1. Левая колонка: МУЖЧИНА
          const manCol = elt(
            "div",
            { style: "text-align:center; flex:1; font-family:'Inter',system-ui,sans-serif;" },
            elt("img", {
              src: photo,
              style:
                "width:80px; height:80px; object-fit:cover; border-radius:50%; margin-bottom:10px; border:3px solid #f1f2f6; box-shadow:0 4px 10px rgba(0,0,0,0.1)",
            }),
            elt(
              "div",
              { style: "font-weight:800; font-size:18px; color:#2d3436" },
              s,
            ),
            elt(
              "div",
              {
                style:
                  "font-size:11px; color:#636e72; margin-top:5px; background:#f1f2f6; display:inline-block; padding:2px 8px; border-radius:10px",
              },
              siteName,
            ),
            elt(
              "div",
              {
                style:
                  "font-size:12px; color:#00b894; margin-top:4px; font-weight:600",
              },
              `Рег: ${createdStr}`,
            ),
          );

          // 2. Центральная колонка: УПРАВЛЕНИЕ

          i = elt(
            "button",
            {
              className: "ah-send-btn",
              style: "width:100%;background:#0984e3;padding:10px;font-size:13px;margin-bottom:8px;font-family:'Inter',system-ui,sans-serif;border-radius:10px;",
              onclick: () => f("chat"),
            },
            "💬 Скачать чат",
          );

          c = elt(
            "button",
            {
              className: "ah-send-btn",
              style: "width:100%;background:#6c5ce7;padding:10px;font-size:13px;font-family:'Inter',system-ui,sans-serif;border-radius:10px;",
              onclick: () => f("letters"),
            },
            "✉️ Скачать письма",
          );

          r = elt("input", {
            type: "datetime-local",
            style: [
              "width:100%;padding:8px 10px;",
              "border:1px solid #f0f0f0;border-radius:8px;",
              "font-family:'Inter',system-ui,sans-serif;",
              "outline:none;font-size:12px;color:#3a3a3a;",
              "background:#fafafa;",
            ].join(""),
          });

          const centerCol = elt(
            "div",
            {
              style: "flex:1.2;padding:0 20px;display:flex;flex-direction:column;justify-content:center;",
            },
            elt(
              "label",
              {
                style: [
                  "font-size:10px;color:#c0c4cc;font-weight:700;",
                  "text-transform:uppercase;letter-spacing:1px;",
                  "margin-bottom:5px;display:block;",
                  "font-family:'Inter',system-ui,sans-serif;",
                ].join(""),
              },
              "Скачать ДО даты:",
            ),
            r,
            elt("div", { style: "height:15px" }),
            i,
            c,
          );

          a = elt(
            "div",
            {
              style:
                "text-align:center; flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; opacity:0.5",
            },
            elt("div", { className: "spin" }, "↻"),
            "Profile...",
          );

          const grid = elt(
            "div",
            {
              style:
                "display:flex; align-items:flex-start; margin-top:10px; padding:20px 0",
            },
            manCol,
            centerCol,
            a,
          );

          d.innerHTML = "";
          d.style.color = "#000";
          d.style.display = "block";
          d.style.textAlign = "left";
          d.appendChild(grid);

          if (n) {
            pageFetchJson("/api/operator/profiles", {
              method: "GET",
              headers: h,
            })
              .then(({ json: profiles }) => {
                const p = (Array.isArray(profiles) ? profiles : []).find(
                  (prof) => String(prof.external_id) === String(n),
                );
                if (!p) {
                  a.innerHTML =
                    "<div style='font-size:12px'>Девушка не найдена</div>";
                  return;
                }

                l = `${p.name}, ${p.age}`;
                const pPhoto =
                  p.photo_link ||
                  "https://alpha.date/static/media/profile_img_empty.0b3d6665cd1c1b51de71.jpg";

                a.style.opacity = 1;
                a.replaceChildren(
                  elt("img", {
                    src: pPhoto,
                    style:
                      "width:80px; height:80px; object-fit:cover; border-radius:50%; margin-bottom:10px; border:3px solid #f1f2f6; box-shadow:0 4px 10px rgba(0,0,0,0.1)",
                  }),
                  elt(
                    "div",
                    { style: "font-weight:800; font-size:18px; color:#2d3436" },
                    `${p.name}, ${p.age}`,
                  ),
                  elt(
                    "div",
                    { style: "font-size:12px; color:#636e72; margin-top:4px" },
                    "Ваша анкета",
                  ),
                );
              })
              .catch(() => {
                a.innerHTML = "";
              });
          }
        });
      } else {
        d.textContent = "Не удалось определить ID мужчины.";
        d.style.color = "#d32f2f";
      }
    })
    .catch((err) => {
      d.textContent = "Ошибка: " + err.message;
      d.style.color = "#d32f2f";
    });
  } // end else (chat is open)

  // ====== ПРОСМОТР ЧАТА + ПИСЕМ + ПОИСК ======
  if (p && p[1]) {
    const chatId = p[1];
    const viewCard = elt("div", { className: "ah-card", style: "margin-top:20px;" });
    viewCard.append(elt("div", { className: "ah-card-title", style: "font-family:'Inter',system-ui,sans-serif;" }, "🔍 Просмотр переписки и поиск"));

    const searchRow = elt("div", { style: "display:flex;gap:8px;margin-bottom:10px;align-items:center;flex-wrap:wrap;" });
    const searchInput = elt("input", {
      type: "text",
      placeholder: "Поиск по ключевым словам...",
      style: [
        "flex:1;min-width:120px;padding:7px 12px;",
        "border:1px solid #f0f0f0;border-radius:8px;",
        "font-size:13px;outline:none;",
        "font-family:'Inter',system-ui,sans-serif;color:#3a3a3a;",
        "background:#fafafa;",
      ].join(""),
    });
    const loadViewBtn = elt("button", {
      style: [
        "padding:7px 16px;background:var(--sa,#0984e3);color:#fff;",
        "border:none;border-radius:8px;cursor:pointer;",
        "font-size:13px;font-weight:600;white-space:nowrap;",
        "font-family:'Inter',system-ui,sans-serif;transition:.15s;",
      ].join(""),
    }, "📥 Загрузить всё");
    const searchBtn = elt("button", {
      style: [
        "padding:7px 14px;background:#f7f7f7;color:#636e72;",
        "border:none;border-radius:8px;cursor:pointer;",
        "font-size:13px;white-space:nowrap;",
        "font-family:'Inter',system-ui,sans-serif;transition:.15s;",
      ].join(""),
      disabled: true,
    }, "🔍 Найти");
    
    // НОВОЕ: Кнопки навигации по результатам
    const navContainer = elt("div", { 
      style: "display:none;align-items:center;gap:4px;",
      id: "search-nav-container"
    });
    const prevBtn = elt("button", {
      style: [
        "padding:6px 10px;background:#f7f7f7;color:#636e72;",
        "border:none;border-radius:6px;cursor:pointer;",
        "font-size:16px;line-height:1;",
        "font-family:'Inter',system-ui,sans-serif;transition:.15s;",
      ].join(""),
      title: "Предыдущее совпадение",
      onclick: () => navigateSearch(-1),
    }, "↑");
    const nextBtn = elt("button", {
      style: [
        "padding:6px 10px;background:#f7f7f7;color:#636e72;",
        "border:none;border-radius:6px;cursor:pointer;",
        "font-size:16px;line-height:1;",
        "font-family:'Inter',system-ui,sans-serif;transition:.15s;",
      ].join(""),
      title: "Следующее совпадение",
      onclick: () => navigateSearch(1),
    }, "↓");
    const matchCounter = elt("span", {
      style: "font-size:12px;color:#636e72;min-width:60px;text-align:center;",
      id: "match-counter"
    }, "");
    navContainer.append(prevBtn, matchCounter, nextBtn);
    
    searchRow.append(loadViewBtn, searchInput, searchBtn, navContainer);

    const chatViewBox = elt("div", {
      style: "max-height:500px;overflow-y:auto;background:#fafafa;border:1px solid #f1f2f6;border-radius:10px;padding:12px;font-size:12px;line-height:1.6;display:none;",
    });
    const viewStatus = elt("div", { style: "font-size:11px;color:#b2bec3;margin-top:6px;" }, "");

    // Entry: { ts: Date, author, isMe, text, kind: "chat"|"letter", mediaUrl, mediaType, deleted }
    let allMessages = [];
    let currentMatchIndex = 0;
    let matchedIndices = [];

    function escHtml(s) {
      return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    }

    function tsDate(obj) {
      const raw = obj?.date_created || obj?.created_at || obj?.date || 0;
      const v = typeof raw === "number" && raw > 0 && raw < 1e10 ? raw * 1000 : raw;
      return new Date(v || 0);
    }

    function navigateSearch(direction) {
      if (matchedIndices.length === 0) return;
      
      currentMatchIndex += direction;
      if (currentMatchIndex < 0) currentMatchIndex = matchedIndices.length - 1;
      if (currentMatchIndex >= matchedIndices.length) currentMatchIndex = 0;
      
      // Обновляем счетчик
      const counter = document.getElementById("match-counter");
      if (counter) {
        counter.textContent = `${currentMatchIndex + 1} / ${matchedIndices.length}`;
      }
      
      // Скроллим к нужному элементу
      const targetIndex = matchedIndices[currentMatchIndex];
      const allBubbles = chatViewBox.querySelectorAll('[data-msg-index]');
      
      // Находим элемент с нужным индексом
      let targetBubble = null;
      allBubbles.forEach(bubble => {
        const idx = parseInt(bubble.getAttribute('data-msg-index'));
        if (idx === targetIndex) {
          targetBubble = bubble;
        }
      });
      
      if (targetBubble) {
        targetBubble.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Подсвечиваем текущее совпадение
        allBubbles.forEach(bubble => {
          const isMatch = bubble.getAttribute('data-is-match') === 'true';
          const idx = parseInt(bubble.getAttribute('data-msg-index'));
          
          if (idx === targetIndex && isMatch) {
            bubble.style.boxShadow = '0 0 0 3px rgba(var(--sa-rgb), 0.5)';
            bubble.style.transform = 'scale(1.02)';
          } else {
            bubble.style.boxShadow = '';
            bubble.style.transform = '';
          }
        });
      }
    }

    function renderChatView(filter = "") {
      chatViewBox.innerHTML = "";
      const q = filter.trim().toLowerCase();
      
      // Сбрасываем навигацию
      currentMatchIndex = 0;
      matchedIndices = [];
      
      // НОВАЯ ЛОГИКА: Если есть поиск, показываем найденные сообщения + контекст (предыдущее/следующее)
      let filtered = [];
      let filteredToOriginalMap = []; // Маппинг отфильтрованных индексов к оригинальным
      
      if (q) {
        const exactMatches = new Set();
        allMessages.forEach((m, idx) => {
          if ((m.text || "").toLowerCase().includes(q) || (m.author || "").toLowerCase().includes(q)) {
            exactMatches.add(idx);
            // Добавляем найденное сообщение и его соседей
            if (idx > 0) exactMatches.add(idx - 1); // предыдущее
            if (idx < allMessages.length - 1) exactMatches.add(idx + 1); // следующее
          }
        });
        
        const sortedIndices = Array.from(exactMatches).sort((a, b) => a - b);
        filtered = sortedIndices.map(i => allMessages[i]);
        filteredToOriginalMap = sortedIndices;
        
        // Находим индексы точных совпадений в отфильтрованном массиве
        allMessages.forEach((m, origIdx) => {
          if ((m.text || "").toLowerCase().includes(q) || (m.author || "").toLowerCase().includes(q)) {
            const filteredIdx = filteredToOriginalMap.indexOf(origIdx);
            if (filteredIdx !== -1) {
              matchedIndices.push(filteredIdx);
            }
          }
        });
        
        // Показываем/скрываем навигацию
        const navContainer = document.getElementById("search-nav-container");
        const counter = document.getElementById("match-counter");
        if (matchedIndices.length > 0) {
          navContainer.style.display = "flex";
          counter.textContent = `1 / ${matchedIndices.length}`;
        } else {
          navContainer.style.display = "none";
        }
      } else {
        filtered = allMessages;
        // Скрываем навигацию
        const navContainer = document.getElementById("search-nav-container");
        if (navContainer) navContainer.style.display = "none";
      }

      if (!filtered.length) {
        chatViewBox.innerHTML = `<div style="text-align:center;color:#b2bec3;padding:20px;">${q ? "Ничего не найдено" : "Нет сообщений"}</div>`;
        viewStatus.textContent = "";
        return;
      }

      const hlText = (text) => {
        if (!q || !text) return escHtml(text);
        const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
        return escHtml(text).replace(re, `<mark style="background:#fff3cd;border-radius:2px;padding:0 1px;">$1</mark>`);
      };

      let lastDateStr = "";
      let renderedIndex = 0; // Счетчик для data-msg-index

      filtered.forEach((m, filterIdx) => {
        const isMe = m.isMe;
        const isLetter = m.kind === "letter";
        const dateStr = m.ts.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });

        if (dateStr !== lastDateStr) {
          lastDateStr = dateStr;
          const sep = elt("div", { style: "text-align:center;margin:12px 0 8px;" });
          sep.innerHTML = `<span style="background:#e4e4e4;border-radius:10px;padding:2px 12px;font-size:10px;color:#888;">${escHtml(dateStr)}</span>`;
          chatViewBox.append(sep);
        }

        const row = elt("div", {
          style: `display:flex;flex-direction:column;align-items:${isMe ? "flex-end" : "flex-start"};margin-bottom:5px;`,
        });

        const bubbleBg = m.deleted ? "#f5f5f5"
          : isLetter ? (isMe ? "#f3e8ff" : "#fffbe6")
          : (isMe ? "#dff0fd" : "#fff");
        const bubbleBorder = m.deleted ? "#ddd"
          : isLetter ? (isMe ? "#c4b5e8" : "#e8d98c")
          : (isMe ? "#a8d4f5" : "#eeeeee");
        const borderRadius = isMe ? "12px 12px 2px 12px" : "12px 12px 12px 2px";

        const timeStr = m.ts.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
        const kindBadge = isLetter
          ? `<span style="background:${isMe?"#c4b5e8":"#e8d98c"};border-radius:3px;padding:0 4px;font-size:9px;margin-left:4px;opacity:.8;">✉</span>`
          : "";

        // Проверяем, является ли это сообщение точным совпадением
        const isExactMatch = q && matchedIndices.includes(filterIdx);
        
        const bubble = elt("div", {
          style: `max-width:80%;padding:6px 10px;border-radius:${borderRadius};background:${bubbleBg};border:1px solid ${bubbleBorder};word-break:break-word;transition:box-shadow 0.3s;`,
          "data-msg-index": filterIdx, // Используем filterIdx для навигации
          "data-is-match": isExactMatch ? "true" : "false",
        });

        let contentHtml = "";
        if (m.deleted) {
          contentHtml = `<span style="color:#aaa;font-style:italic;">🗑 сообщение удалено</span>`;
        } else if (m.mediaType === "image" && m.mediaUrl) {
          // Show image thumbnail
          contentHtml = `<a href="${escHtml(m.mediaUrl)}" target="_blank" rel="noopener">` +
            `<img src="${escHtml(m.mediaUrl)}" alt="фото" style="max-width:180px;max-height:180px;border-radius:6px;display:block;object-fit:cover;" ` +
            `onerror="this.outerHTML='<span style=color:#999>🖼 фото</span>'" />` +
            `</a>`;
          if (m.text) contentHtml += `<div style="margin-top:4px;">${hlText(m.text)}</div>`;
        } else if (m.mediaType === "video" && m.mediaUrl) {
          contentHtml = `<div style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;background:rgba(0,0,0,0.06);border-radius:6px;">` +
            `<span style="font-size:18px;">▶️</span>` +
            `<a href="${escHtml(m.mediaUrl)}" target="_blank" rel="noopener" style="color:#0984e3;font-size:11px;">Видео</a>` +
            `</div>`;
          if (m.text) contentHtml += `<div style="margin-top:4px;">${hlText(m.text)}</div>`;
        } else if (m.mediaType === "audio" && m.mediaUrl) {
          contentHtml = `<div style="display:inline-flex;align-items:center;gap:6px;">🎵 <a href="${escHtml(m.mediaUrl)}" target="_blank" rel="noopener" style="color:#0984e3;font-size:11px;">Аудио</a></div>`;
        } else if (m.mediaType) {
          contentHtml = `<span style="color:#888;font-style:italic;">📎 медиа</span>`;
          if (m.text) contentHtml += ` <span>${hlText(m.text)}</span>`;
        } else {
          contentHtml = `<div style="white-space:pre-wrap;">${hlText(m.text)}</div>`;
        }

        bubble.innerHTML =
          `<div style="font-size:10px;color:#aaa;margin-bottom:2px;">${escHtml(m.author)}${kindBadge} · ${escHtml(timeStr)}</div>` +
          contentHtml;
        row.append(bubble);
        chatViewBox.append(row);
      });

      const nChat = allMessages.filter(m => m.kind === "chat").length;
      const nLetter = allMessages.filter(m => m.kind === "letter").length;
      const totalStr = `Всего: ${allMessages.length} · чат: ${nChat} · письма: ${nLetter}`;
      const fChat = filtered.filter(m => m.kind === "chat").length;
      const fLetter = filtered.filter(m => m.kind === "letter").length;
      viewStatus.textContent = q
        ? `Найдено: ${filtered.length} (чат: ${fChat}, письма: ${fLetter}) · ${totalStr}`
        : totalStr;
      searchBtn.disabled = false;
    }

    loadViewBtn.onclick = async () => {
      const token = localStorage.getItem("token") || "";
      if (!token) return alert("Не найден токен. Перезайдите на сайт.");
      loadViewBtn.textContent = "⏳";
      loadViewBtn.disabled = true;
      allMessages = [];
      chatViewBox.style.display = "block";
      chatViewBox.innerHTML = `<div style="text-align:center;color:#b2bec3;padding:24px;"><span class="spin" style="font-size:20px;">↻</span><br>Загрузка чата...</div>`;

      const hdr = { "Content-Type": "application/json", Authorization: "Bearer " + token };
      let manId = null, womanId = null, manName = "Man", womanName = "Woman";

      // ─────────────────────────────────────────────
      // 1. CHAT MESSAGES  (parallel 2-page fetch, like original download)
      // ─────────────────────────────────────────────
      const fetchChatPage = (pg) =>
        pageFetchJson("/api/chatList/chatHistory", {
          method: "POST", headers: hdr,
          body: JSON.stringify({ chat_id: chatId, page: pg }),
        }).then(r => r.json);

      for (let pg = 1; ; pg += 2) {
        const [r1, r2] = await Promise.allSettled([fetchChatPage(pg), fetchChatPage(pg + 1)]);
        let hasData = false;

        for (const res of [r1, r2]) {
          if (res.status !== "fulfilled" || !res.value?.status) continue;
          const list = Array.isArray(res.value.response) ? res.value.response : [];
          if (list.length === 20) hasData = true;

          for (const msg of list) {
            // Extract participant IDs/names from first available message
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
              if (text) allMessages.push({ ts, author: isMale ? manName : womanName, isMe: !isMale, text, kind: "chat", mediaType: null });
            } else if (mtype === "SENT_IMAGE") {
              // message_content contains the image URL
              allMessages.push({ ts, author: isMale ? manName : womanName, isMe: !isMale, text: "", kind: "chat",
                mediaType: "image", mediaUrl: msg.message_content || msg.thumb_link || msg.message_thumb || "" });
            } else if (mtype === "SENT_VIDEO") {
              allMessages.push({ ts, author: isMale ? manName : womanName, isMe: !isMale, text: "", kind: "chat",
                mediaType: "video", mediaUrl: msg.message_content || msg.thumb_link || msg.message_thumb || "" });
            } else if (mtype === "SENT_AUDIO") {
              allMessages.push({ ts, author: isMale ? manName : womanName, isMe: !isMale, text: "", kind: "chat",
                mediaType: "audio", mediaUrl: msg.message_content || "" });
            } else if (mtype.includes("DELETED") || msg.is_deleted) {
              allMessages.push({ ts, author: isMale ? manName : womanName, isMe: !isMale, text: "", kind: "chat",
                mediaType: null, deleted: true });
            }
            // SENT_IMAGE_MAIL / SENT_VIDEO_MAIL belong to letters, skip here
          }
        }
        if (!hasData) break;  // both pages had < 20 items → end of history
        loadViewBtn.textContent = `⏳ Чат стр ${pg + 1}...`;
      }

      // ─────────────────────────────────────────────
      // 2. LETTERS / MAILBOX  (parallel 2-page fetch)
      // ─────────────────────────────────────────────
      if (manId && womanId) {
        loadViewBtn.textContent = "⏳ Письма...";
        const fetchMailPage = (pg) =>
          pageFetchJson("/api/mailbox/mails", {
            method: "POST", headers: hdr,
            body: JSON.stringify({ user_id: womanId, folder: "dialog", man_id: manId, page: pg }),
          }).then(r => r.json);

        // Page 1 first to get totalPages
        const firstMail = await fetchMailPage(1).catch(() => null);
        if (firstMail?.status) {
          const totalPages = firstMail.response?.pages || 1;
          const allEntries = [...(firstMail.response?.mails || [])];

          // Remaining pages in parallel pairs
          for (let pg = 2; pg <= totalPages; pg += 2) {
            const [r1, r2] = await Promise.allSettled([
              fetchMailPage(pg),
              pg + 1 <= totalPages ? fetchMailPage(pg + 1) : Promise.resolve(null),
            ]);
            for (const res of [r1, r2]) {
              if (res.status === "fulfilled" && res.value?.status) {
                allEntries.push(...(res.value.response?.mails || []));
              }
            }
            loadViewBtn.textContent = `⏳ Письма стр ${pg}/${totalPages}...`;
          }

          for (const entry of allEntries) {
            // API returns [{mail: {...}}, ...] — inner object has the data
            const mail = entry?.mail || entry;
            if (!mail) continue;

            const ts = tsDate(mail);
            const text = (mail.message_content || "").trim();
            const sName = (mail.sender_name || "").trim();

            // Determine sender side: compare name with known names (case-insensitive)
            // Letters FROM woman = operator sent them (isMe = true)
            // Letters FROM man   = man replied (isMe = false)
            const sNameLow = sName.toLowerCase();
            const womanLow = womanName.toLowerCase();
            const manLow   = manName.toLowerCase();
            let isMe;
            if (sNameLow && womanLow && sNameLow.includes(womanLow.split(",")[0]?.trim())) {
              isMe = true; // sent by woman (operator)
            } else if (sNameLow && manLow && sNameLow.includes(manLow.split(",")[0]?.trim())) {
              isMe = false; // sent by man
            } else {
              // Fallback: try sender_external_id
              isMe = String(mail.sender_external_id || mail.sender_id || "") !== String(manId);
            }

            // Check for media attachments in letter
            const hasMedia = Array.isArray(mail.attachments) && mail.attachments.length > 0;
            let mediaType = null, mediaUrl = "";
            if (hasMedia) {
              const att = mail.attachments[0];
              const url = att.link || att.url || att.thumb_link || att.content || "";
              const t = (att.content_type || att.type || "").toLowerCase();
              mediaType = t.includes("video") ? "video" : "image";
              mediaUrl = url;
            }

            allMessages.push({ ts, author: sName || (isMe ? womanName : manName), isMe, text, kind: "letter", mediaType, mediaUrl });
          }
        }
      }

      // ─────────────────────────────────────────────
      // 3. Sort all by time → render
      // ─────────────────────────────────────────────
      allMessages.sort((a, b) => a.ts - b.ts);
      renderChatView(searchInput.value);
      loadViewBtn.textContent = "🔄 Обновить";
      loadViewBtn.disabled = false;
      requestAnimationFrame(() => { chatViewBox.scrollTop = chatViewBox.scrollHeight; });
    };

    searchBtn.onclick = () => renderChatView(searchInput.value);
    searchInput.addEventListener("keydown", (e) => { 
      if (e.key === "Enter") renderChatView(searchInput.value);
      // Навигация стрелками вверх/вниз
      if (e.key === "ArrowUp" && matchedIndices.length > 0) {
        e.preventDefault();
        navigateSearch(-1);
      }
      if (e.key === "ArrowDown" && matchedIndices.length > 0) {
        e.preventDefault();
        navigateSearch(1);
      }
    });
    searchInput.addEventListener("input", () => { if (allMessages.length) renderChatView(searchInput.value); });

    viewCard.append(searchRow, chatViewBox, viewStatus);
    container.append(viewCard);
  }

  // ─── Stop List + Stats ──────────────────────────────────────────────────────

  const twoColRow = elt("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;" });

  // Stop List — заблокированная карточка
  const stopTABg = elt("textarea", {
    placeholder: "12345678\n87654321",
    style: "width:100%;min-height:120px;border:1px solid #f0f0f0;border-radius:10px;padding:10px 12px;font-size:12px;font-family:'Inter',system-ui,sans-serif;resize:none;box-sizing:border-box;color:#3a3a3a;background:#fafafa;",
    spellcheck: false,
  });
  stopTABg.value = "12345678\n87654321";
  twoColRow.append(mkLockedCard("Stop List", stopTABg));

  // Stats — заблокированная карточка
  const statGridBg = elt("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:6px;" });
  [["Инвайты","#007aff"],["Письма","#9c27b0"],["Personal","#6c5ce7"],["Ошибки","#d32f2f"]].forEach(([lbl, col]) => {
    const b = elt("div", { style: "background:#fafafa;border:1px solid #f0f0f0;border-radius:10px;padding:12px;text-align:center;" });
    b.append(elt("div", { style: `font-size:20px;font-weight:700;color:${col};line-height:1;font-family:'Inter',system-ui,sans-serif;` }, "0"));
    b.append(elt("div", { style: "font-size:10px;color:#c0c4cc;margin-top:4px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;font-family:'Inter',system-ui,sans-serif;" }, lbl));
    statGridBg.append(b);
  });
  twoColRow.append(mkLockedCard("Статистика", statGridBg));

  container.append(twoColRow);

  // ─── Медиа + Перевод ────────────────────────────────────────────────────────
  const BK = "telescopeSettings";
  const TK = "telescopeSettings";

  const mkTsToggle = (label, key) =>
    mkToggleRow(label,
      cb => chrome.storage.local.get(TK, r => { const v = (r[TK]||{})[key]; cb(!!v); }),
      v  => chrome.storage.local.get(TK, r => { const s=Object.assign({},r[TK]||{}); s[key]=v; chrome.storage.local.set({[TK]:s}); })
    );

  const mkSelect = (options, storageKey, subKey, defaultVal) => {
    const sel = elt("select", {
      style: [
        "border:1px solid #ebebeb;border-radius:8px;",
        "padding:5px 10px;font-size:12px;outline:none;",
        "color:#3a3a3a;background:#fff;cursor:pointer;",
        "font-family:'Inter',system-ui,sans-serif;",
      ].join("")
    });
    options.forEach(([v, t]) => sel.append(elt("option", { value: v }, t)));
    chrome.storage.local.get(storageKey, r => { sel.value = (r[storageKey]||{})[subKey] || defaultVal; });
    sel.onchange = () => chrome.storage.local.get(storageKey, r => {
      const s = Object.assign({}, r[storageKey]||{}); s[subKey] = sel.value; chrome.storage.local.set({[storageKey]:s});
    });
    return sel;
  };

  const LANGS = [
    ["ru","Русский"],["en","English"],["uk","Українська"],["de","Deutsch"],
    ["fr","Français"],["es","Español"],["ro","Română"],["bg","Български"],
    ["kk","Қазақша"],["hi","हिन्दी"],
  ];

  const mkSelectRow = (label, options, storageKey, subKey, defaultVal) => {
    const row = elt("div", {
      style: [
        "display:flex;align-items:center;justify-content:space-between;",
        "padding:10px 0;border-bottom:1px solid #f7f7f7;",
        "font-family:'Inter',system-ui,sans-serif;",
      ].join("")
    });
    row.append(
      elt("span", { style: "font-size:13px;color:#3a3a3a;font-weight:450;" }, label),
      mkSelect(options, storageKey, subKey, defaultVal)
    );
    return row;
  };

  container.append(mkCard("Медиа",
    mkTsToggle("Блюр входящих медиа", "blurIncoming"),
    mkTsToggle("Блюр исходящих медиа", "blurOutgoing"),
  ));

  container.append(mkCard("Перевод чата",
    mkTsToggle("Включить перевод", "translateEnabled"),
    mkSelectRow("Режим", [["auto","Авто"],["button","По кнопке"]], TK, "translateMode", "button"),
    mkSelectRow("Язык оригинала", LANGS, TK, "translateSource", "en"),
    mkSelectRow("Язык перевода", LANGS, TK, "targetLang", "ru"),
  ));

  container.append(mkCard("Перевод писем",
    mkTsToggle("Включить перевод писем", "letterTranslateEnabled"),
    mkSelectRow("Режим", [["auto","Авто"],["button","По кнопке"]], TK, "letterTranslateMode", "button"),
    mkSelectRow("Язык оригинала", LANGS, TK, "letterTranslateSource", "en"),
    mkSelectRow("Язык перевода", LANGS, TK, "letterTranslateTarget", "ru"),
  ));

  // ─── Уведомления + AHT ──────────────────────────────────────────────────────
  const mkEarnToggle = (label, tkKey, tkStorage) =>
    mkToggleRow(label,
      cb => chrome.storage.local.get([tkStorage], r => cb(r[tkStorage] === undefined ? true : r[tkStorage])),
      v  => {
        chrome.storage.local.set({ [tkStorage]: v });
        chrome.storage.local.get(["telescopeSettings"], res => {
          const s = Object.assign({}, res.telescopeSettings || {}); s[tkKey] = v;
          chrome.storage.local.set({ telescopeSettings: s });
        });
      }
    );

  container.append(mkCard("Уведомления",
    mkEarnToggle("Панель начислений", "earningsEnabled", "earningsEnabled"),
    (() => {
      const row = elt("div", {
        style: [
          "display:flex;align-items:center;justify-content:space-between;",
          "padding:10px 0;border-bottom:1px solid #f7f7f7;",
          "font-family:'Inter',system-ui,sans-serif;",
        ].join("")
      });
      const inp = elt("input", {
        type: "number", min: "1", max: "50",
        style: [
          "width:52px;border:1px solid #ebebeb;border-radius:8px;",
          "padding:4px 8px;font-size:13px;font-weight:600;",
          "text-align:center;outline:none;color:#3a3a3a;",
          "font-family:'Inter',system-ui,sans-serif;",
        ].join(""),
      });
      chrome.storage.local.get(["contentEarningsSettings"], r => {
        inp.value = (r.contentEarningsSettings?.rows) || 5;
      });
      inp.addEventListener("change", () => {
        let v = parseInt(inp.value) || 5;
        if (v < 1) v = 1;
        if (v > 50) v = 50;
        inp.value = v;
        chrome.storage.local.get(["contentEarningsSettings"], r => {
          const s = Object.assign({}, r.contentEarningsSettings || {});
          s.rows = v;
          chrome.storage.local.set({ contentEarningsSettings: s });
        });
      });
      row.append(
        elt("span", { style: "font-size:13px;color:#3a3a3a;font-weight:450;font-family:'Inter',system-ui,sans-serif;" }, "Строк истории"),
        inp,
      );
      return row;
    })(),
  ));

  // ====== НАСТРОЙКИ ЧИСЛОВЫХ ИНДИКАТОРОВ ЧАТОВ ======
  const limCard = elt("div", { className: "ah-card", style: "margin-top:12px;" });
  limCard.append(elt("div", {
    style: [
      "font-size:10px;font-weight:700;letter-spacing:1.2px;",
      "text-transform:uppercase;color:#c0c4cc;margin-bottom:14px;",
      "font-family:'Inter',system-ui,sans-serif;",
    ].join("")
  }, "Индикаторы лимитов чата"));

  const LK = "telescopeSettings";

  // Helper: save one key to telescopeSettings
  function limSave(key, val, cb) {
    chrome.storage.local.get([LK], r => {
      const s = Object.assign({}, r[LK] || {});
      s[key] = val;
      chrome.storage.local.set({ [LK]: s }, cb);
    });
  }
  function limGet(key, def, cb) {
    chrome.storage.local.get([LK], r => cb((r[LK] || {})[key] !== undefined ? (r[LK] || {})[key] : def));
  }

  // ── РЕЖИМ (3 кнопки: Выкл / Цифры / Цифры+Цвет) ──────────────────
  const limModeRow = elt("div", { style: "margin-bottom:14px;" });
  limModeRow.append(elt("div", { style: "font-size:10px;color:#c0c4cc;margin-bottom:8px;font-weight:700;letter-spacing:1px;font-family:'Inter',system-ui,sans-serif;text-transform:uppercase;" }, "Режим отображения"));
  const modeWrap = elt("div", { style: "display:flex;gap:6px;" });

  const MODES = [
    { key: "off",   label: "Выкл",         title: "Убрать всё, вернуть оригинальные иконки" },
    { key: "nums",  label: "Цифры",        title: "Только цифры, без цвета" },
    { key: "color", label: "Цифры + Цвет", title: "Цифры с цветом по порогам (по умолчанию)" },
  ];

  function setModeUI(active) {
    modeWrap.querySelectorAll(".lim-mode-btn").forEach(b => {
      const on = b.dataset.mode === active;
      b.style.background = on ? "var(--sa, #ff6b35)" : "#f1f2f6";
      b.style.color = on ? "#fff" : "#2d3436";
      b.style.borderColor = on ? "var(--sa, #ff6b35)" : "#dfe6e9";
    });
    // show/hide threshold & color sections
    const showThresh = active === "color";
    threshSection.style.display = showThresh ? "" : "none";
    colorSection.style.display = showThresh ? "" : "none";
  }

  MODES.forEach(m => {
    const btn = elt("button");
    btn.className = "lim-mode-btn";
    btn.dataset.mode = m.key;
    btn.textContent = m.label;
    btn.title = m.title;
    btn.style.cssText = [
      "flex:1;padding:7px 4px;border-radius:8px;",
      "border:1px solid #e8e8e8;font-size:12px;font-weight:600;",
      "cursor:pointer;transition:all .15s;",
      "background:#f7f7f7;color:#636e72;",
      "font-family:'Inter',system-ui,sans-serif;letter-spacing:-.1px;",
    ].join("");
    btn.addEventListener("click", () => { limSave("limMode", m.key); setModeUI(m.key); });
    modeWrap.append(btn);
  });
  limModeRow.append(modeWrap);
  limCard.append(limModeRow);

  // ── ЦВЕТА (3 пары: красный / жёлтый / зелёный) ─────────────────────
  const colorSection = elt("div", { style: "margin-bottom:14px;" });
  colorSection.append(elt("div", { style: "font-size:10px;color:#c0c4cc;margin-bottom:8px;font-weight:700;letter-spacing:1px;font-family:'Inter',system-ui,sans-serif;text-transform:uppercase;" }, "Цвета"));

  const DEFAULT_COLORS = { red: "#ff6b6b", yellow: "#ffc947", green: "#26de81" };
  const colorKeys = [
    { key: "colRed",    label: "🔴 Красный", def: "#ff6b6b" },
    { key: "colYellow", label: "🟡 Жёлтый",  def: "#ffc947" },
    { key: "colGreen",  label: "🟢 Зелёный", def: "#26de81" },
  ];

  const colorGrid = elt("div", { style: "display:flex;gap:8px;" });
  colorKeys.forEach(({ key, label, def }) => {
    const g = elt("div", { style: "flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;" });
    g.append(elt("span", { style: "font-size:11px;color:#636e72;text-align:center;" }, label));
    const picker = elt("input", { type: "color" });
    picker.value = def;
    picker.style.cssText = "width:100%;height:32px;border:1px solid #dfe6e9;border-radius:8px;cursor:pointer;padding:2px;background:#fff;";
    limGet(key, def, v => { picker.value = v; });
    picker.addEventListener("input", () => limSave(key, picker.value));
    picker.addEventListener("change", () => limSave(key, picker.value, refreshAllBars));
    // Reset button
    const rst = elt("button");
    rst.textContent = "↺";
    rst.title = "Сбросить";
    rst.style.cssText = "font-size:11px;background:none;border:none;cursor:pointer;color:#b2bec3;padding:0;";
    rst.addEventListener("click", () => { picker.value = def; limSave(key, def, refreshAllBars); });
    g.append(picker, rst);
    colorGrid.append(g);
  });
  colorSection.append(colorGrid);
  limCard.append(colorSection);

  // ── ПОРОГИ + живая полоса ────────────────────────────────────────────
  const threshSection = elt("div");

  function mkThreshBlock(label, keyMid, keyHi, defMid, defHi, isLetter) {
    const wrap = elt("div", { style: "margin-bottom:12px;" });
    wrap.append(elt("div", { style: "font-size:10px;color:#c0c4cc;margin-bottom:6px;font-weight:700;letter-spacing:1px;font-family:'Inter',system-ui,sans-serif;text-transform:uppercase;" }, label));

    // Live preview bar
    const bar = elt("div", { style: "display:flex;border-radius:6px;overflow:hidden;height:20px;font-size:10px;font-weight:700;color:#fff;margin-bottom:8px;" });
    bar.dataset.barFor = keyMid;

    function refreshBar() {
      chrome.storage.local.get([LK], r => {
        const st = r[LK] || {};
        const mid = st[keyMid] !== undefined ? Number(st[keyMid]) : defMid;
        const hi  = st[keyHi]  !== undefined ? Number(st[keyHi])  : defHi;
        const cR = st.colRed    || "#ff6b6b";
        const cY = st.colYellow || "#ffc947";
        const cG = st.colGreen  || "#26de81";
        const total = isLetter ? 3 : 10;
        const rW = isLetter ? (mid/total*100)       : ((mid-1)/total*100);
        const yW = isLetter ? ((hi-mid)/total*100)  : ((hi-mid)/total*100);
        const gW = 100-rW-yW;
        const mkSeg = (col, w, txt) => {
          const s = elt("div");
          s.style.cssText = "background:"+col+";width:"+Math.max(0,w)+"%;display:flex;align-items:center;justify-content:center;transition:all .3s;font-size:10px;font-weight:700;";
          if (w > 12) s.textContent = txt;
          return s;
        };
        bar.innerHTML = "";
        bar.append(
          mkSeg(cR, rW, isLetter ? "0" : "1–"+(mid-1)),
          mkSeg(cY, yW, isLetter ? "1" : mid+"–"+(hi-1)),
          mkSeg(cG, gW, isLetter ? "2+" : hi+"–"+total)
        );
      });
    }
    refreshBar();
    wrap._refreshBar = refreshBar;

    // Two threshold inputs side by side
    const irow = elt("div", { style: "display:flex;align-items:center;gap:6px;" });

    function mkThreshInput(labelTxt, valKey, defVal, min, max) {
      const g = elt("div", { style: "display:flex;align-items:center;gap:4px;flex:1;background:#f8f9fa;border-radius:8px;padding:6px 8px;font-family:'Inter',system-ui,sans-serif;" });
      const lbl2 = elt("span", { style: "font-size:12px;color:#636e72;white-space:nowrap;flex:1;letter-spacing:-.1px;" }, labelTxt);
      const inp2 = elt("input", { type: "number", min: String(min), max: String(max) });
      inp2.style.cssText = [
        "width:42px;border:1px solid #e8e8e8;border-radius:8px;",
        "padding:3px 5px;font-size:13px;font-weight:700;",
        "text-align:center;outline:none;background:#fff;",
        "font-family:'Inter',system-ui,sans-serif;color:#3a3a3a;",
      ].join("");
      inp2.value = String(defVal);
      limGet(valKey, defVal, v => { inp2.value = String(v); });
      const save = () => {
        let v = parseInt(inp2.value);
        if (isNaN(v)) v = defVal;
        v = Math.max(min, Math.min(max, v));
        inp2.value = String(v);
        limSave(valKey, v, refreshAllBars);
      };
      inp2.addEventListener("change", save);
      inp2.addEventListener("blur", save);
      g.append(lbl2, inp2);
      return g;
    }

    irow.append(
      mkThreshInput("🟡 жёлтый с:", keyMid, defMid, isLetter ? 1 : 1, isLetter ? 2 : 9),
      mkThreshInput("🟢 зелёный с:", keyHi, defHi, isLetter ? 2 : 2, isLetter ? 3 : 10)
    );
    wrap.append(bar, irow);
    return wrap;
  }

  const chatBlock = mkThreshBlock("💬 ЧАТЫ",    "chatLimMid", "chatLimHi", 4, 7, false);
  const letBlock  = mkThreshBlock("✉️ ПИСЬМА",  "letLimMid",  "letLimHi",  1, 2, true);
  threshSection.append(chatBlock, letBlock);
  limCard.append(threshSection);

  function refreshAllBars() {
    [chatBlock, letBlock].forEach(b => b._refreshBar && b._refreshBar());
  }

  container.append(limCard);

  // Инициализируем режим
  limGet("limMode", "color", mode => setModeUI(mode));

  // Стоп в Chance — используем pageFetchJson
  (function startStopInChanceChecker() {
    let lastAlertedIds = new Set();
    Notification.requestPermission();
    async function checkStopInChance() {
      const stop = (AH_STORE.mem.stop || "").trim().split(/\s+/).filter(v => v);
      if (!stop.length) return;
      try {
        const { json: _cd } = await pageFetchJson("/api/chatList/chatListByUserID?page=1&filter=chance");
        const users = Array.isArray(_cd?.response) ? _cd.response : [];
        users.forEach(u => {
          const manId = String(u.sender_external_id || u.male_id || u.man_id || "");
          if (!manId || !stop.includes(manId) || lastAlertedIds.has(manId)) return;
          lastAlertedIds.add(manId);
          const manName = u.man_name || u.name || ("ID " + manId);
          if (Notification.permission === "granted") {
            const n = new Notification("🛑 Стоп-лист в Chance!", {
              body: manName + " онлайн — " + new Date().toLocaleTimeString(),
              icon: chrome.runtime.getURL ? chrome.runtime.getURL("icon128.png") : "",
            });
            n.onclick = () => window.open("https://alpha.date/chance?search=" + manId, "_blank");
          }
          setTimeout(() => lastAlertedIds.delete(manId), 300000);
        });
      } catch(e) {}
    }
    checkStopInChance();
    setInterval(checkStopInChance, 30000);
  })();

  // ─── AHT Функции ────────────────────────────────────────────────────────────
  const AHT_KEY = "aht_settings_v1";

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
  const e = $("#ah-start"),
    t = loadSet();
  e.classList.toggle("stop");
  const n = e.classList.contains("stop");
  ((t.running = n), saveSet(t));
  const { jsonStr: o, hash: a } = await buildPayload();
  (chrome.runtime.sendMessage({
    cmd: "botAction",
    run: n ? "Start" : "Stop",
    json: o,
    hash: a,
    key: t.authKey,
    opId: t.operatorId,
  }),
    (t.lastHash = a),
    saveSet(t),
    (e.textContent = n ? "Stop" : "Start"),
    (e.style.background = n ? "#d32f2f" : "#4caf50"),
    setStatus(n));
}
function renderMediaTools(e) {
  let s = loadSet();
  let currentPid = s.invProfile;
  let activeMainTab = "Удаление";
  let activeMediaType = "images";
  let allMedia = [];
  let selectedIds = new Set();
  let isLoading = false;
  let isUploading = false;

  const layoutPromise = createProfileSidebar(
    e,
    currentPid,
    (newPid) => {
      currentPid = newPid;
      s.invProfile = newPid;
      saveSet(s);
      selectedIds.clear();
      renderRightSide();
    },
    "media",
  );

  let contentContainer = null;
  layoutPromise.then(({ content }) => {
    contentContainer = content;
    renderRightSide();
  });

  function renderRightSide() {
    if (!contentContainer) return;
    contentContainer.innerHTML = "";

    if (!currentPid) {
      contentContainer.innerHTML =
        "<div style='text-align:center;padding:50px;color:#999'>Выберите анкету слева</div>";
      return;
    }

    const mainTabsContainer = elt("div", {
      style: "display:flex; gap:10px; align-items:center; margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px",
    });

    // Кнопка удалить — СПРАВА, красная, появляется при выборе медиа
    const topDelBtn = elt("button", {
      id: "ah-top-del-btn",
      style: "display:none;padding:7px 16px;background:#ff7675;color:#fff;border:none;border-radius:20px;cursor:pointer;font-weight:700;font-size:13px;margin-left:auto;",
      onclick: () => { const b = document.getElementById("ah-inner-del-btn"); if (b) b.click(); },
    }, "🗑 Удалить");

    ["Удаление", "Загрузка"].forEach((tabName) => {
      const isActive = tabName === activeMainTab;
      const btn = elt(
        "div",
        {
          className: "mt-tab-btn",
          style: `padding:8px 16px; border-radius:20px; cursor:pointer; font-weight:600; font-size:13px; transition:0.2s; background:${isActive ? "var(--sa)" : "#f1f2f6"}; color:${isActive ? "#fff" : "#636e72"}`,
          onclick: () => {
            if (isUploading) return alert("Ждите...");
            activeMainTab = tabName;
            renderRightSide();
          },
        },
        tabName,
      );
      mainTabsContainer.append(btn);
    });
    mainTabsContainer.append(topDelBtn);

    contentContainer.append(
      elt("h3", { style: "margin:0 0 15px 0" }, "Media Tools"),
      mainTabsContainer,
    );

    const innerContent = elt("div", { style: "min-height:300px" });
    contentContainer.append(innerContent);

    if (activeMainTab === "Удаление") {
      renderDeleteUI(innerContent);
    } else {
      renderUploadUI(innerContent);
    }
  }

  function renderDeleteUI(container) {
    const typeTabs = elt("div", {
      style: "display:flex; gap:8px; margin-bottom:15px",
    });
    [
      { id: "images", lbl: "Медиа" },
      { id: "videos", lbl: "Видео" },
    ].forEach((t) => {
      const active = t.id === activeMediaType;
      typeTabs.append(
        elt(
          "div",
          {
            style: `padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;border:1px solid; ${active ? "background:#fff;color:var(--sa);border-color:var(--sa)" : "background:#fff;color:#636e72;border-color:#dfe6e9"}`,
            onclick: () => {
              activeMediaType = t.id;
              selectedIds.clear();
              renderRightSide();
            },
          },
          t.lbl,
        ),
      );
    });

    const statusLabel = elt(
      "div",
      { style: "font-weight:bold;font-size:13px" },
      "Выбрано: 0",
    );
    const btnDel = elt(
      "button",
      {
        id: "ah-inner-del-btn",
        style: "width:100%;margin-top:15px;padding:12px;background:#ff7675;color:#fff;border:none;border-radius:8px;cursor:pointer;display:none",
        onclick: executeDelete,
      },
      "Удалить выбранные",
    );

    const grid = elt("div", {
      style: "display:grid;grid-template-columns:repeat(auto-fill, minmax(95px, 1fr));gap:8px;max-height:450px;overflow-y:auto;align-items:start",
    });

    const toolsBar = elt(
      "div",
      {
        style:
          "display:flex;align-items:center;margin-bottom:10px;background:#f8f9fa;padding:8px;border-radius:8px;justify-content:space-between",
      },
      statusLabel,
      elt(
        "div",
        {},
        elt(
          "button",
          {
            style: "margin-right:5px",
            onclick: () => {
              allMedia.forEach((m) => selectedIds.add(m.id));
              refreshGrid();
            },
          },
          "Все",
        ),
        elt(
          "button",
          {
            onclick: () => {
              selectedIds.clear();
              refreshGrid();
            },
          },
          "Сброс",
        ),
      ),
    );

    container.append(typeTabs, toolsBar, grid, btnDel);

    grid.innerHTML =
      "<div style='grid-column:1/-1;text-align:center;padding:20px'>Загрузка...</div>";

    fetchMedia(currentPid, activeMediaType).then(async (items) => {
      allMedia = items.map((i) => ({
        id: i.id || i.content_id || i.video_id,
        url: i.url || i.link,
        name: i.filename || i.name || "",
        type: activeMediaType,
        // Превью: для видео берём thumb_link с сервера; для фото строим w-250-h-250
        thumb: (() => {
          // Для видео — thumb_link с сервера (chats-videos-thumbs.cdndate.net)
          if (activeMediaType === "videos" && i.thumb_link) return i.thumb_link;
          // Строим URL превью w-250-h-250 из оригинального link
          const link = i.thumb_link || i.url || i.link || "";
          if (!link) return "";
          // Если уже есть w-XXX-h-XXX — заменяем на 250
          if (/\/w-\d+-h-\d+-/.test(link)) return link.replace(/\/w-\d+-h-\d+-/, "/w-250-h-250-");
          // Иначе вставляем w-250-h-250 перед именем файла
          const parts = link.split("/");
          const fname = parts.pop();
          return [...parts, "w-250-h-250-" + fname].join("/");
        })(),
        type: activeMediaType,
      }));
      
      refreshGrid();
    });

    function refreshGrid() {
      grid.innerHTML = "";
      if (!allMedia.length) {
        grid.innerHTML =
          "<div style='grid-column:1/-1;text-align:center;padding:20px'>Нет файлов</div>";
        return;
      }

      allMedia.forEach((item) => {
        const sel = selectedIds.has(item.id);
        const el = elt("div", {
          style: `position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;cursor:pointer;border:3px solid ${sel ? "#ff7675" : "transparent"};transform:${sel ? "scale(0.95)" : "scale(1)"}`,
        });
        // Левый клик = мгновенный выбор, Правый клик = просмотр
        el.addEventListener("click", () => {
          if (selectedIds.has(item.id)) selectedIds.delete(item.id);
          else selectedIds.add(item.id);
          refreshGrid();
        });
        el.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          openLightbox(item);
        });
        void el;

        const img = elt("img", {
          src: item.thumb,
          style: "width:100%;height:100%;object-fit:cover",
        });

        // FIX: Обработка битых картинок
        img.onerror = function () {
          this.style.display = "none";
          el.style.display = "flex";
          el.style.alignItems = "center";
          el.style.justifyContent = "center";
          el.style.color = "#999";
          el.style.fontSize = "11px";
          el.textContent = activeMediaType === "videos" ? "VIDEO" : "IMAGE";
        };

        el.append(img);
        
        // Иконка Play для видео
        if (item.type === "videos") {
          el.append(
            elt("div", {
              style: "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.25);pointer-events:none",
            },
              elt("div", { style: "font-size:24px;color:#fff;text-shadow:0 2px 4px rgba(0,0,0,0.5)" }, "▶"),
            ),
          );
        }
        
        grid.append(el);
      });

      const _cnt = selectedIds.size;
      statusLabel.textContent = `Выбрано: ${_cnt}`;
      btnDel.style.display = _cnt > 0 ? "block" : "none";
      // Синхронизируем кнопку сверху
      const _topDelBtn = document.getElementById("ah-top-del-btn");
      if (_topDelBtn) {
        _topDelBtn.style.display = _cnt > 0 ? "inline-block" : "none";
        _topDelBtn.textContent = _cnt > 0 ? `🗑 Удалить (${_cnt})` : "🗑 Удалить";
      }
      const _topBtn = document.getElementById("ah-top-del-btn");
      if (_topBtn) {
        _topBtn.style.display = _cnt > 0 ? "inline-block" : "none";
        _topBtn.textContent = _cnt > 0 ? `🗑 Удалить (${_cnt})` : "🗑 Удалить";
      }
    }

    async function executeDelete() {
      if (!confirm("Удалить?")) return;
      btnDel.textContent = "Удаление...";
      btnDel.disabled = true;
      const token = localStorage.getItem("token");
      const ids = Array.from(selectedIds);
      let done = 0;
      for (const id of ids) {
        try {
          await pageFetchJson("/api/files/deleteMedia", {
            method: "POST",
            body: JSON.stringify({ id, user_id: currentPid }),
            headers: { authorization: "Bearer " + token, "content-type": "application/json" },
          });
          selectedIds.delete(id);
          done++;
          btnDel.textContent = `Удаление... ${done}/${ids.length}`;
        } catch(err) {
          console.error("deleteMedia error:", err);
        }
      }
      btnDel.disabled = false;
      selectedIds.clear();
      // Сбрасываем кэш медиа для текущего профиля, чтобы список обновился
      MEDIA_CACHE.delete(`${currentPid}_${activeMediaType}`);
      renderRightSide();
    }
  }

  function renderUploadUI(contentArea) {
    contentArea.innerHTML = "";

    const infoBox = elt(
      "div",
      {
        style:
          "background:#e8f8f5; padding:15px; border-radius:8px; color:var(--sa); font-size:13px; margin-bottom:15px; border:1px solid var(--sa)",
      },
      "📷 Выберите фото или видео — без лимита. Бот загружает напрямую через API.",
    );

    const fileInput = elt("input", {
      type: "file",
      multiple: true,
      accept: "image/jpeg, image/png, image/webp, image/gif, video/mp4, video/mov, video/quicktime, video/avi, video/webm",
      style: "display:none",
      onchange: (e) => handleFilesSelect(e.target.files),
    });

    const uploadBtn = elt(
      "button",
      {
        style:
          "width:100%; padding:20px; border:2px dashed #b2bec3; background:#fafbfc; color:#636e72; font-weight:600; cursor:pointer; border-radius:12px; font-size:15px; transition:.2s",
        onclick: () => fileInput.click(),
      },
      "📂 Выбрать фото / видео",
    );

    const logArea = elt("div", {
      style:
        "margin-top:20px; max-height:300px; overflow-y:auto; font-size:12px; font-family:'Inter', system-ui, sans-serif; background:#2d3436; color:#dfe6e9; padding:10px; border-radius:8px; display:none",
    });

    contentArea.append(infoBox, fileInput, uploadBtn, logArea);

    async function handleFilesSelect(files) {
      if (!files || files.length === 0) return;
      if (!currentPid) return alert("Ошибка: анкета не выбрана!");

      isUploading = true;
      uploadBtn.disabled = true;
      logArea.style.display = "block";
      logArea.innerHTML = "";

      const log = (msg, color = "#fff") => {
        const line = elt(
          "div",
          { style: `color:${color}; margin-bottom:4px` },
          `> ${msg}`,
        );
        logArea.append(line);
        logArea.scrollTop = logArea.scrollHeight;
      };

      log(`Выбрано файлов: ${files.length}. Старт...`, "#74b9ff");

      let success = 0;
      let fail = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const progress = `[${i + 1}/${files.length}]`;

        if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
          log(`${progress} Пропуск: ${file.name} (не фото и не видео)`, "#ff7675");
          continue;
        }

        log(`${progress} Обработка: ${file.name}...`);

        try {
          await processImageUpload(file, currentPid, log);
          success++;
          log(`${progress} ✅ Успешно!`, "#55efc4");
        } catch (err) {
          fail++;
          console.error(err);
          log(`${progress} ❌ Ошибка: ${err.message}`, "#ff7675");
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      log(
        `🏁 Готово! Загружено: ${success}, Ошибок: ${fail}`,
        success > 0 ? "#55efc4" : "#ff7675",
      );
      isUploading = false;
      uploadBtn.disabled = false;
      uploadBtn.textContent = "📂 Загрузить еще";
      // Сбрасываем кэш медиа, чтобы список обновился
      MEDIA_CACHE.delete(`${currentPid}_images`);
      MEDIA_CACHE.delete(`${currentPid}_videos`);

      // Браузерное уведомление о завершении
      if (Notification.permission === "granted") {
        new Notification("Snatch 💸 — Загрузка завершена", {
          body: `Загружено: ${success} файлов${fail > 0 ? `, Ошибок: ${fail}` : ""}`,
          icon: chrome.runtime.getURL("icon128.png"),
        });
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(p => {
          if (p === "granted") new Notification("Snatch 💸 — Загрузка завершена", {
            body: `Загружено: ${success} файлов${fail > 0 ? `, Ошибок: ${fail}` : ""}`,
            icon: chrome.runtime.getURL("icon128.png"),
          });
        });
      }
    }
  }
}
function snapAhTimeMinutes(e) {
  let t = Number(e);
  return (
    Number.isFinite(t) || (t = 0),
    (t = Math.trunc(t)),
    t < 0 && (t = 0),
    t > 2880 && (t = 2880),
    0 === t || t < 10
      ? 0
      : t < 30
        ? t < 15
          ? 10
          : t < 20
            ? 15
            : t < 25
              ? 20
              : 25
        : t < 60
          ? 10 * Math.floor(t / 10)
          : 60 * Math.floor(t / 60)
  );
}
function migrateTimeToMinutesIfNeeded() {
  const e = loadSet();
  let t = !1;
  if (!0 !== e.timemin) {
    for (const n of ["sendEvery", "mailEvery"]) {
      if (null === e[n] || void 0 === e[n]) continue;
      const o = Number(e[n]);
      Number.isFinite(o)
        ? ((e[n] = snapAhTimeMinutes(60 * Math.trunc(o))), (t = !0))
        : ((e[n] = null), (t = !0));
    }
    ((e.timemin = !0), (t = !0), t && saveSet(e));
  } else {
    for (const n of ["sendEvery", "mailEvery"]) {
      if (null === e[n] || void 0 === e[n]) continue;
      const o = snapAhTimeMinutes(e[n]);
      o !== e[n] && ((e[n] = o), (t = !0));
    }
    t && saveSet(e);
  }
}
function ahTimeIsHours(e) {
  return Number(e) >= 60;
}
function ahTimeUnit(e) {
  return ahTimeIsHours(e) ? "часы" : "минуты";
}
function ahTimeDisplay(e) {
  const t = Number(e) || 0;
  return ahTimeIsHours(t) ? String(Math.trunc(t / 60)) : String(Math.trunc(t));
}
function ahTimeStep(e, t) {
  let n = snapAhTimeMinutes(e);
  return (
    "up" === t
      ? n >= 60
        ? (n += 60)
        : n >= 50
          ? (n = 60)
          : n >= 30
            ? (n += 10)
            : (n =
                25 === n
                  ? 30
                  : 20 === n
                    ? 25
                    : 15 === n
                      ? 20
                      : 10 === n
                        ? 15
                        : 10)
      : n > 60
        ? (n -= 60)
        : 60 === n
          ? (n = 50)
          : n > 30
            ? (n -= 10)
            : 30 === n
              ? (n = 25)
              : n > 10
                ? (n -= 5)
                : (n = 0),
    snapAhTimeMinutes(n)
  );
}
function timeInput(e, t, n) {
  migrateTimeToMinutesIfNeeded();
  const o = loadSet();
  e in o ||
    ((o[e] = snapAhTimeMinutes(60 * Number(n))), (o.timemin = !0), saveSet(o));
  let a = snapAhTimeMinutes(o[e]);
  if (a !== o[e] || !0 !== o.timemin) {
    const t = loadSet();
    ((t[e] = a), (t.timemin = !0), saveSet(t));
  }
  const i = elt("span", { style: "font-weight:600" }, ""),
    r = elt("span", {}, t + " (", i, "):"),
    s = elt("input", {
      type: "number",
      value: 0,
      min: 0,
      inputMode: "none",
      autocomplete: "off",
      style:
        "width:80px;padding:6px;border:1px solid #ccc;border-radius:4px;margin-top:4px",
    });
  function l() {
    ((i.textContent = ahTimeUnit(a)),
      (s.value = ahTimeDisplay(a)),
      (s.dataset.prev = s.value));
  }
  function c(t) {
    const n = ahTimeStep(a, t);
    n !== a
      ? ((a = n),
        (function () {
          const t = loadSet();
          ((t[e] = a), (t.timemin = !0), saveSet(t));
        })(),
        l())
      : l();
  }
  return (
    s.addEventListener("keydown", (e) => {
      const t = e.key;
      if ("ArrowUp" === t) return (e.preventDefault(), void c("up"));
      if ("ArrowDown" === t) return (e.preventDefault(), void c("down"));
      new Set([
        "Tab",
        "Shift",
        "Escape",
        "Enter",
        "Home",
        "End",
        "ArrowLeft",
        "ArrowRight",
      ]).has(t) ||
        e.ctrlKey ||
        e.metaKey ||
        e.preventDefault();
    }),
    s.addEventListener("paste", (e) => e.preventDefault()),
    s.addEventListener("drop", (e) => e.preventDefault()),
    s.addEventListener("input", () => {
      const e = Number(s.dataset.prev),
        t = Number(s.value);
      Number.isFinite(e) && Number.isFinite(t)
        ? t > e
          ? c("up")
          : t < e
            ? c("down")
            : l()
        : l();
    }),
    s.addEventListener("blur", l),
    l(),
    elt(
      "div",
      { style: "display:flex;flex-direction:column;font-size:14px" },
      r,
      s,
    )
  );
}
function numberInput(e, t, n) {
  const o = loadSet();
  e in o || ((o[e] = n), saveSet(o));
  const a = o[e];
  return elt(
    "div",
    { style: "display:flex;flex-direction:column;font-size:14px" },
    elt("span", {}, t),
    elt("input", {
      type: "number",
      value: a,
      min: 0,
      style:
        "width:80px;padding:6px;border:1px solid #ccc;border-radius:4px;margin-top:4px",
      onchange: (t) => {
        const o = loadSet(),
          a = parseInt(t.target.value, 10);
        ((o[e] = isNaN(a) ? n : a), saveSet(o));
      },
    }),
  );
}
function resetAuthUI() {
  cleanupAuthUI();
  const modal = document.getElementById("ah-modal");
  if (modal) modal.remove();
  const overlay = document.getElementById("ah-overlay");
  if (overlay) overlay.remove();

  const s = loadSet();
  delete s.authKey;
  delete s.operatorId;
  s.running = false;
  saveSet(s);
}
function openStarMenu(e) {
  if (document.getElementById("star-menu"))
    return void document.getElementById("star-menu").remove();
  const t = e.currentTarget.getBoundingClientRect(),
    n = elt("div", {
      id: "star-menu",
      style: `position:fixed;left:${t.left - 20}px;top:${t.bottom + 4}px;\n            background:#fff;border:1px solid #ccc;border-radius:6px;\n            box-shadow:0 2px 8px rgba(0,0,0,.25);z-index:10001;\n            display:flex;flex-direction:column;min-width:120px;`,
    });
  n.append(
    elt(
      "button",
      {
        style:
          "padding:6px 10px;border:none;background:none;text-align:left;\n           font:14px 'Inter',system-ui,sans-serif;cursor:pointer;",
        onclick: async () => {
          const { jsonStr: e } = await buildPayload(!0),
            t = new Blob([e], { type: "application/json" }),
            o = URL.createObjectURL(t);
          (Object.assign(document.createElement("a"), {
            href: o,
            download: "alpha_helper_backup.json",
          }).click(),
            setTimeout(() => URL.revokeObjectURL(o), 800),
            n.remove());
        },
      },
      "Сохранить",
    ),
  );
  const o = elt("input", {
    type: "file",
    accept: "application/json",
    style: "display:none",
    onchange: async (e) => {
      const t = e.target.files[0];
      if (t)
        try {
          const e = await t.text();
          applyImportedPayload(JSON.parse(e));
          const n = [
            ...document.querySelectorAll("#ah-tabs .ah-tab"),
          ].findIndex((e) => e.classList.contains("ah-active"));
          (-1 !== n && (selectTab(0), 0 !== n && selectTab(n)),
            alert("Настройки загружены ✓"));
        } catch (e) {
          alert("Ошибка импорта: " + e.message);
        } finally {
          n.remove();
        }
    },
  });
  n.append(
    elt(
      "button",
      {
        style:
          "padding:6px 10px;border:none;background:none;text-align:left;\n           font:14px 'Inter',system-ui,sans-serif;cursor:pointer;",
        onclick: () => o.click(),
      },
      "Загрузить",
    ),
    o,
    elt(
      "button",
      {
        style:
          "padding:6px 10px;border:none;background:none;text-align:left;\n           font:14px 'Inter',system-ui,sans-serif;cursor:pointer;",
        onclick: () => { n.remove(); openSheetImportModal(); },
      },
      "📊 Импорт таблицы",
    ),
  );
  loadSet();
  const a = elt(
    "label",
    {
      style:
        "padding:6px 10px;display:flex;align-items:center;gap:8px;\n           font:14px 'Inter',system-ui,sans-serif;cursor:pointer;user-select:none",
    },
    (() => {
      const e = elt("input", { type: "checkbox" });
      return (
        chrome.storage.local.get("snAutoBackup", (t) => {
          e.checked = !!t.snAutoBackup;
        }),
        (e.onchange = (e) => {
          (chrome.storage.local.set({ snAutoBackup: e.target.checked }),
            chrome.runtime.sendMessage({
              cmd: "toggleAutoBackup",
              enable: e.target.checked,
            }));
        }),
        e
      );
    })(),
    "Автосохранение (24 ч)",
  );
  (n.append(a),
    n.append(
      elt(
        "button",
        {
          style:
            "padding:6px 10px;border:none;background:none;text-align:left;\n              font:14px 'Inter',system-ui,sans-serif;cursor:pointer;color:#d32f2f;",
          onclick: async () => {
            const e = loadSet();
            if (e.running)
              try {
                const { jsonStr: t, hash: n } = await buildPayload();
                await chrome.runtime.sendMessage({
                  cmd: "botAction",
                  run: "Stop",
                  json: t,
                  hash: n,
                  key: e.authKey,
                  opId: e.operatorId,
                });
              } catch (e) {}
            (resetAuthUI(),
              chrome.runtime.sendMessage({ cmd: "resetAuth" }).catch(() => {}),
              n.remove(),
              buildModal());
          },
        },
        "Log out",
      ),
    ));

  // ── COLOUR PALETTE ─────────────────────────────────────────
  const paletteWrap = elt("div", {
    style: "padding:8px 10px 10px;border-top:1px solid #eee;",
  });
  paletteWrap.append(
    elt("div", {
      style: "font:11px 'Inter',system-ui,sans-serif;color:#999;margin-bottom:6px;letter-spacing:.5px;text-transform:uppercase;",
    }, "🎨 Тема"),
  );
  const swatchRow = elt("div", { style: "display:flex;gap:5px;align-items:center;flex-wrap:wrap;" });
  const curTheme = (localStorage.getItem(SNATCH_THEME_KEY) || "#FF6B35").toLowerCase();
  SNATCH_THEME_PRESETS.forEach(({ color, name }) => {
    const isActive = color.toLowerCase() === curTheme;
    const sw = elt("div", {
      title: name,
      "data-sw": color,
      style: `width:20px;height:20px;border-radius:50%;background:${color};cursor:pointer;flex-shrink:0;`
        + `border:2px solid ${isActive ? "#fff" : color};`
        + `outline:2px solid ${isActive ? "#333" : "transparent"};`
        + `transition:transform .15s,outline .1s;`,
    });
    sw.onmouseenter = () => { sw.style.transform = "scale(1.18)"; };
    sw.onmouseleave = () => { sw.style.transform = "scale(1)"; };
    sw.onclick = () => {
      applySnatchTheme(color);
      swatchRow.querySelectorAll("[data-sw]").forEach((s) => {
        s.style.outline = "2px solid transparent";
        s.style.border = `2px solid ${s.dataset.sw}`;
      });
      sw.style.outline = "2px solid #333";
      sw.style.border = "2px solid #fff";
    };
    swatchRow.append(sw);
  });
  // Custom colour picker
  const customPick = elt("input", {
    type: "color",
    title: "Свой цвет",
    value: curTheme,
    style: "width:22px;height:22px;border-radius:50%;border:none;padding:0;cursor:pointer;background:none;outline:none;overflow:hidden;",
  });
  customPick.oninput = (e) => applySnatchTheme(e.target.value);
  swatchRow.append(customPick);
  paletteWrap.append(swatchRow);
  n.append(paletteWrap);
  // ───────────────────────────────────────────────────────────

  const i = (e) => {
    n.contains(e.target) ||
      (n.remove(), document.removeEventListener("mousedown", i));
  };
  (document.addEventListener("mousedown", i), document.body.append(n));
}
// ============================================================
// ИМПОРТ ИЗ GOOGLE SHEETS
// Формат: ID [Tab] Invite [Tab] Letter [Tab] Timer
// Строка 1 = заголовок (пропускается)
// ============================================================
function openSheetImportModal() {
  const token = localStorage.getItem("token") || "";

  const overlay = elt("div", {
    style: "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;",
  });

  const modal = elt("div", {
    style: "background:#fff;border-radius:16px;padding:24px;width:580px;max-width:95vw;max-height:85vh;display:flex;flex-direction:column;gap:12px;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden;",
  });

  const titleRow = elt("div", { style: "font-size:16px;font-weight:700;color:#2d3436;" }, "📊 Импорт из Google Sheets");

  // --- TABS ---
  const TAB_TABLE = "table";
  const TAB_WINK  = "wink";
  let activeTab = TAB_TABLE;

  const tabBar = elt("div", { style: "display:flex;gap:0;border-bottom:2px solid #f1f2f6;" });

  function mkTab(label, key) {
    const btn = elt("button", {
      style: "padding:7px 18px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;color:#b2bec3;border-bottom:2px solid transparent;margin-bottom:-2px;transition:.15s;",
      onclick: () => switchTab(key),
    }, label);
    btn.dataset.tabKey = key;
    return btn;
  }
  const tabTable = mkTab("📊 Таблица", TAB_TABLE);
  const tabWink  = mkTab("💨 Импорт Винк", TAB_WINK);
  tabBar.append(tabTable, tabWink);

  // --- PANELS ---
  // === Panel: Таблица ===
  const panelTable = elt("div", { style: "display:flex;flex-direction:column;gap:10px;" });

  const hintTable = elt("div", {
    style: "font-size:12px;color:#636e72;background:#f8f9fa;border-radius:8px;padding:10px 12px;line-height:1.6;",
  }, "Формат: Name → ID → Invite (Global Chat) → Letter → Timer (мин). Колонка Name игнорируется.");

  const taTable = elt("textarea", {
    placeholder: "Anna\t1504891954\tHello, I want to meet you...\tMy lips remember...\t60",
    style: "width:100%;min-height:130px;border:1px solid #dfe6e9;border-radius:10px;padding:10px;font-size:12px;font-family:'Inter', system-ui, sans-serif;resize:vertical;outline:none;box-sizing:border-box;line-height:1.5;",
  });
  const logTable = elt("div", {
    style: "font-size:11px;font-family:'Inter', system-ui, sans-serif;max-height:110px;overflow-y:auto;background:#2d3436;color:#dfe6e9;border-radius:8px;padding:8px;display:none;",
  });
  const btnRowTable = elt("div", { style: "display:flex;gap:10px;justify-content:flex-end;" });
  const cancelBtnTable = elt("button", {
    style: "padding:8px 20px;background:#f1f2f6;border:none;border-radius:8px;cursor:pointer;font-size:13px;color:#636e72;",
    onclick: () => overlay.remove(),
  }, "Отмена");
  const importBtnTable = elt("button", {
    style: "padding:8px 20px;background:var(--sa);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;",
    onclick: async () => {
      const raw = taTable.value.trim();
      if (!raw) return alert("Вставьте данные из таблицы");
      logTable.style.display = "block";
      logTable.innerHTML = "";
      const log = (msg, color = "#dfe6e9") => {
        logTable.append(elt("div", { style: `color:${color};margin-bottom:2px;` }, msg));
        logTable.scrollTop = logTable.scrollHeight;
      };
      let profiles = [];
      try {
        const { json } = await pageFetchJson("/api/operator/profiles", { method: "GET", headers: { authorization: "Bearer " + token } });
        profiles = Array.isArray(json) ? json : [];
      } catch(e) { log("❌ Не удалось загрузить список анкет: " + e.message, "#ff7675"); return; }
      const profileMap = {};
      profiles.forEach(p => { profileMap[String(p.external_id)] = p; });
      const lines = raw.split(/\r?\n/).filter(l => l.trim());
      let added = 0, skipped = 0;
      for (const line of lines) {
        const cols = line.split("\t");
        const id = (cols[1] || "").trim();
        const inviteText = (cols[2] || "").trim();
        const letterText = (cols[3] || "").trim();
        const timer = parseInt(cols[4]) || 60;
        if (!id || id.toLowerCase() === "id" || !/^\d+$/.test(id)) continue;
        if (!profileMap[id]) { log(`⚠️ ID ${id} — анкета не найдена`, "#fdcb6e"); skipped++; continue; }
        let changed = false;
        if (inviteText) {
          const allInv = loadInv(id);
          if (!allInv["Global chat"]) allInv["Global chat"] = [];
          allInv["Global chat"].push({ text: inviteText, media: null, picFirst: false, duration: timer });
          saveInv(allInv, id);
          changed = true;
        }
        if (letterText) {
          const letters = loadLetters(id);
          letters.push({ text: letterText, media: [], duration: timer });
          saveLetters(letters, id);
          changed = true;
        }
        if (changed) { log(`✅ ${profileMap[id].name || id} (${id})`, "#55efc4"); added++; }
        else { log(`ℹ️ ${id} — нет данных`, "#b2bec3"); }
      }
      log(`🏁 Готово: ${added} обновлено, ${skipped} пропущено`, added > 0 ? "var(--sa)" : "#b2bec3");
      importBtnTable.textContent = "✅ Импортировано";
      importBtnTable.disabled = true;
    },
  }, "📥 Импортировать");
  btnRowTable.append(cancelBtnTable, importBtnTable);
  panelTable.append(hintTable, taTable, logTable, btnRowTable);

  // === Panel: Импорт Винк ===
  const panelWink = elt("div", { style: "display:none;flex-direction:column;gap:10px;" });

  const hintWink = elt("div", {
    style: "font-size:12px;color:#636e72;background:#f8f9fa;border-radius:8px;padding:10px 12px;line-height:1.6;",
  }, "Формат (из Sheets): Name → ID → Like → View → Wink → Tell me about yourself → How your day going? → Dont you mind talking bit? → What are you up to? → Time (мин)");

  const taWink = elt("textarea", {
    placeholder: "Anna\t1504891954\tLike text\tView text\tWink text\tTell me about yourself\tHow your day going?\tDont you mind talking bit?\tWhat are you up to?\t60",
    style: "width:100%;min-height:130px;border:1px solid #dfe6e9;border-radius:10px;padding:10px;font-size:12px;font-family:'Inter', system-ui, sans-serif;resize:vertical;outline:none;box-sizing:border-box;line-height:1.5;",
  });
  const logWink = elt("div", {
    style: "font-size:11px;font-family:'Inter', system-ui, sans-serif;max-height:110px;overflow-y:auto;background:#2d3436;color:#dfe6e9;border-radius:8px;padding:8px;display:none;",
  });
  const btnRowWink = elt("div", { style: "display:flex;gap:10px;justify-content:flex-end;" });
  const cancelBtnWink = elt("button", {
    style: "padding:8px 20px;background:#f1f2f6;border:none;border-radius:8px;cursor:pointer;font-size:13px;color:#636e72;",
    onclick: () => overlay.remove(),
  }, "Отмена");
  const importBtnWink = elt("button", {
    style: "padding:8px 20px;background:var(--sa);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;",
    onclick: async () => {
      const raw = taWink.value.trim();
      if (!raw) return alert("Вставьте данные из таблицы");
      logWink.style.display = "block";
      logWink.innerHTML = "";
      const log = (msg, color = "#dfe6e9") => {
        logWink.append(elt("div", { style: `color:${color};margin-bottom:2px;` }, msg));
        logWink.scrollTop = logWink.scrollHeight;
      };
      let profiles = [];
      try {
        const { json } = await pageFetchJson("/api/operator/profiles", { method: "GET", headers: { authorization: "Bearer " + token } });
        profiles = Array.isArray(json) ? json : [];
      } catch(e) { log("❌ Не удалось загрузить список анкет: " + e.message, "#ff7675"); return; }
      const profileMap = {};
      profiles.forEach(p => { profileMap[String(p.external_id)] = p; });

      // Wink columns: [0]=Name [1]=ID [2]=Like [3]=View [4]=Wink [5]=Tell me... [6]=How your... [7]=Dont you... [8]=What are... [9]=Time
      const WINK_COLS = [
        { col: 2, cat: "Like" },
        { col: 3, cat: "View" },
        { col: 4, cat: "Wink" },
        { col: 5, cat: "Tell me about yourself" },
        { col: 6, cat: "How your day going?" },
        { col: 7, cat: "Dont you mind talking bit?" },
        { col: 8, cat: "What are you up to?" },
      ];

      const lines = raw.split(/\r?\n/).filter(l => l.trim());
      let added = 0, skipped = 0;
      for (const line of lines) {
        const cols = line.split("\t");
        const id = (cols[1] || "").trim();
        const timer = parseInt(cols[9]) || 60;
        if (!id || id.toLowerCase() === "id" || !/^\d+$/.test(id)) continue;
        if (!profileMap[id]) { log(`⚠️ ID ${id} — анкета не найдена`, "#fdcb6e"); skipped++; continue; }
        const allInv = loadInv(id);
        let changed = false;
        for (const { col, cat } of WINK_COLS) {
          const text = (cols[col] || "").trim();
          if (!text) continue;
          if (!allInv[cat]) allInv[cat] = [];
          allInv[cat].push({ text, media: null, picFirst: false, duration: timer });
          changed = true;
        }
        if (changed) {
          saveInv(allInv, id);
          log(`✅ ${profileMap[id].name || id} (${id}) — Wink добавлен`, "#55efc4");
          added++;
        } else { log(`ℹ️ ${id} — нет текстов для добавления`, "#b2bec3"); }
      }
      log(`🏁 Готово: ${added} профилей обновлено, ${skipped} пропущено`, added > 0 ? "var(--sa)" : "#b2bec3");
      importBtnWink.textContent = "✅ Импортировано";
      importBtnWink.disabled = true;
    },
  }, "📥 Импортировать");
  btnRowWink.append(cancelBtnWink, importBtnWink);
  panelWink.append(hintWink, taWink, logWink, btnRowWink);

  // --- Tab switch logic ---
  function switchTab(key) {
    activeTab = key;
    [tabTable, tabWink].forEach(btn => {
      const isActive = btn.dataset.tabKey === key;
      btn.style.color = isActive ? "var(--sa)" : "#b2bec3";
      btn.style.borderBottomColor = isActive ? "var(--sa)" : "transparent";
    });
    panelTable.style.display = key === TAB_TABLE ? "flex" : "none";
    panelWink.style.display  = key === TAB_WINK  ? "flex" : "none";
  }
  switchTab(TAB_TABLE);

  modal.append(titleRow, tabBar, panelTable, panelWink);
  overlay.append(modal);
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  document.body.append(overlay);
  setTimeout(() => taTable.focus(), 100);
}

function applyImportedPayload(e) {
  if (e.settings && "object" == typeof e.settings) {
    const t = loadSet(),
      n = {
        lastLike: "lastlike",
        factTimeMsg: "facttimemsg",
        stopMaybe: "stopmaybe",
        stopSpecial: "stopspecial",
        persToMaybe: "perstomaybe",
        persToSpecial: "perstospecial",
        emptyChatsToFolder: "emptychatstofolder",
      },
      o = !!(e.timemin || (e.settings && e.settings.timemin));
    for (const [a, i] of Object.entries(e.settings)) {
      const e = n[a] ?? a;
      if (("sendEvery" !== e && "mailEvery" !== e) || null == i)
        "timemin" !== e && (t[e] = i);
      else {
        const n = Number(i);
        t[e] = Number.isFinite(n) ? snapAhTimeMinutes(o ? n : 60 * n) : null;
      }
    }
    ((t.timemin = !0), saveSet(t));
  }
  ("string" == typeof e.stopList && saveStop(e.stopList),
    e.invites && saveInv(e.invites, null),
    Object.keys(e).forEach((t) => {
      const n = /^invites(\d+)$/.exec(t);
      n && "object" == typeof e[t] && saveInv(e[t], n[1]);
    }));

  // === ИСПРАВЛЕНИЕ: ТЕПЕРЬ ПИСЬМА ТОЖЕ СОХРАНЯЮТСЯ ПРИ ИМПОРТЕ ===
  if (e.letters && typeof e.letters === "object") {
    Object.keys(e.letters).forEach((k) => {
      saveLetters(e.letters[k], k === "global" ? null : k);
    });
  }
}
function waitBridgeReady(e = 2e3) {
  return AH_BRIDGE_READY
    ? Promise.resolve(!0)
    : new Promise((t) => {
        const n = Date.now(),
          o = () => {
            if (AH_BRIDGE_READY || Date.now() - n >= e)
              return t(AH_BRIDGE_READY);
            setTimeout(o, 50);
          };
        o();
      });
}
function openPort() {
  if (!port) {
    try {
      port = chrome.runtime.connect({ name: "KEEP_ALIVE_SN" });
    } catch (e) {
      return void setTimeout(openPort, 1e3);
    } finally {
      chrome.runtime.lastError;
    }
    port
      ? (port.onDisconnect.addListener(() => {
          (chrome.runtime.lastError,
            clearInterval(timer),
            (port = null),
            setTimeout(openPort, 1e3));
        }),
        (timer = setInterval(() => {
          if (port)
            try {
              port.postMessage({ ping: Date.now() });
            } catch {
              (clearInterval(timer), (port = null), setTimeout(openPort, 1e3));
            }
        }, 25e3)))
      : setTimeout(openPort, 1e3);
  }
}
(chrome.runtime.onMessage.addListener((e, t, n) => {
  if ("reloadStop" === e?.cmd) {
    if (e.value !== undefined) saveStop(String(e.value));
    return true;
  }
  if ("saveExp" !== e?.cmd)
    if ("openModal" !== e) {
      if ("resetAuth" !== e?.cmd)
        return "getPayload" === e?.cmd
          ? (buildPayload()
              .then(({ jsonStr: e, hash: t }) => {
                n({ ok: !0, json: e, hash: t });
              })
              .catch((e) => n({ ok: !1, err: String(e) })),
            !0)
          : "fetchViaPage" === e?.cmd
            ? ((async () => {
                try {
                  const t =
                    "number" == typeof e.bridgeTimeout ? e.bridgeTimeout : 2e3;
                  AH_BRIDGE_READY || (await waitBridgeReady(t));
                  const o = "ah_" + Math.random().toString(36).slice(2),
                    a = Math.max(500, e.timeout || 5e3),
                    i = new Promise((e, t) => {
                      const n = (a) => {
                        const r = a.data;
                        r &&
                          "SN_PAGE" === r.src &&
                          "SN_FETCH_RES" === r.type &&
                          r.id === o &&
                          (window.removeEventListener("message", n),
                          clearTimeout(i),
                          r.ok
                            ? e(r)
                            : t(new Error(r.error || "page fetch failed")));
                      };
                      window.addEventListener("message", n);
                      var i = setTimeout(() => {
                        window.removeEventListener("message", n);
                        try {
                          window.postMessage(
                            { src: "SN_SW", type: "SN_FETCH_CANCEL", id: o },
                            location.origin,
                          );
                        } catch {}
                        t(new Error("timeout"));
                      }, a);
                    });
                  window.postMessage(
                    {
                      src: "SN_SW",
                      type: "SN_FETCH_REQ",
                      id: o,
                      path: e.path,
                      method: e.method || "GET",
                      headers: e.headers || {},
                      bodyBase64: e.bodyBase64 || null,
                      timeoutMs: a,
                      referer: e.referer || null,
                    },
                    location.origin,
                  );
                  const r = await i;
                  n({
                    ok: !0,
                    status: r.status,
                    headers: r.headers,
                    bodyBase64: r.bodyBase64,
                  });
                } catch (e) {
                  n({ ok: !1, error: String((e && e.message) || e) });
                }
              })(),
              !0)
            : void (
                "SN_ping" !== e?.cmd ||
                n({ ok: !0, bridge: !0 === AH_BRIDGE_READY })
              );
      resetAuthUI();
    } else buildModal();
  else
    "number" == typeof e.exp_sec &&
      (setExpSecMem(e.exp_sec), updateHeaderExp());
}),
  openPort());

// ===== SETTINGS TAB =====
function renderSettings(container) {
  const KEY = "telescopeSettings";
  container.innerHTML = "";
  const wrap = elt("div", { style: "padding:20px;display:flex;flex-direction:column;gap:14px;" });
  wrap.append(elt("h3", { style: "margin:0;font-size:15px;color:#2d3436;border-bottom:2px solid var(--sa);padding-bottom:8px;" }, "🎭 Настройки медиа"));

  function makeToggle(label, key) {
    const row = elt("div", { style: "display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #e0e0e0;border-radius:10px;padding:12px 16px;" });
    const lbl = elt("label", { style: "position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0;" });
    const inp = elt("input", { type: "checkbox" });
    inp.style.cssText = "opacity:0;width:0;height:0;";
    const sl = elt("span", { style: "position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#ccc;border-radius:24px;transition:.3s;" });
    const kn = elt("span", { style: "position:absolute;height:18px;width:18px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.3s;" });
    sl.append(kn);
    lbl.append(inp, sl);
    row.append(elt("span", { style: "font-size:14px;color:#2d3436;" }, label), lbl);
    chrome.storage.local.get(KEY, r => {
      const s = r[KEY] || {};
      if (s[key] === true) { inp.checked = true; sl.style.background = "var(--sa)"; kn.style.transform = "translateX(20px)"; }
    });
    inp.addEventListener("change", () => {
      sl.style.background = inp.checked ? "var(--sa)" : "#ccc";
      kn.style.transform = inp.checked ? "translateX(20px)" : "translateX(0)";
      chrome.storage.local.get(KEY, r => {
        const s = Object.assign({}, r[KEY] || {});
        s[key] = inp.checked;
        chrome.storage.local.set({ [KEY]: s });
      });
    });
    return row;
  }

  wrap.append(
    makeToggle("👁 Блюр входящих медиа", "blurIncoming"),
    makeToggle("📤 Блюр исходящих медиа", "blurOutgoing")
  );
  container.append(wrap);
}

// ===== КНОПКА "В СТОП-ЛИСТadd" В ЧАТЕ =====
(function injectStopButton() {
  const ATTR = "data-ah-stop-injected";
  const SELECTOR_CHAT_HEADER = '[class*="chat_header"], [class*="chatHeader"], [class*="header_user"], [class*="headerUser"]';

  function getManIdFromUrl() {
    // alpha.date/chat/12345 или ?man_id=12345 или /dialogs/12345
    const m = location.href.match(/\/(?:chat|dialogs|profile)\/(\d+)/i) ||
              location.search.match(/[?&](?:man_id|user_id|id)=(\d+)/);
    return m ? m[1] : null;
  }

  function addStopBtn(header) {
    if (header.getAttribute(ATTR)) return;
    header.setAttribute(ATTR, "1");

    const btn = document.createElement("button");
    btn.textContent = "🛑 Стоп";
    btn.title = "Добавить мужчину в стоп-лист";
    Object.assign(btn.style, {
      marginLeft: "8px",
      padding: "4px 10px",
      background: "#ff7675",
      color: "#fff",
      border: "none",
      borderRadius: "6px",
      fontSize: "12px",
      fontWeight: "600",
      cursor: "pointer",
      zIndex: "9999",
      flexShrink: "0",
    });

    btn.addEventListener("click", () => {
      const manId = getManIdFromUrl();
      if (!manId) {
        alert("Не удалось определить ID мужчины из URL.\nОткройте чат напрямую.");
        return;
      }
      const current = (AH_STORE.mem.stop || "").trim();
      const ids = current ? current.split(/\s+/) : [];
      if (ids.includes(manId)) {
        alert("ID " + manId + " уже в стоп-листе.");
        return;
      }
      ids.push(manId);
      const newStop = ids.join("\n");
      saveStop(newStop);
      btn.textContent = "✅ Добавлен";
      btn.style.background = "var(--sa)";
      setTimeout(() => { btn.textContent = "🛑 Стоп"; btn.style.background = "#ff7675"; }, 2000);
    });

    // Добавляем кнопку в конец заголовка
    header.style.display = header.style.display || "flex";
    header.style.alignItems = header.style.alignItems || "center";
    header.appendChild(btn);
  }

  function scanHeaders() {
    document.querySelectorAll(SELECTOR_CHAT_HEADER).forEach(addStopBtn);
  }

  // Запускаем при загрузке и следим за изменениями DOM
  const obs = new MutationObserver(() => scanHeaders());
  obs.observe(document.body, { childList: true, subtree: true });
  scanHeaders();
})();

// ═══════════════════════════════════════════════════════════
// EARNINGS PANEL: шестерёнка → Tools, бейдж → тема
// ═══════════════════════════════════════════════════════════════════════════
  // 4. CONTENT EARNINGS PANEL (день / UTC, статистика, история) — как inject ContentEarningsPanel
  // ═══════════════════════════════════════════════════════════════════════════

  const EARNINGS_HISTORY_LIMIT = 50;
  const EARNINGS_DEFAULT_SETTINGS = {
    interval: 10,
    fade: 10,
    rows: 10,
    noMsg: false,
    noStk: false,
    hideHdr: false,
    hideStats: false,
  };
  const EARNINGS_LABELS = {
    SENT_TEXT: "Сообщения",
    SENT_MAIL: "Отправлено письмо",
    SENT_IMAGE: "Отправлено фото",
    READ_MAIL: "Прочитано письмо",
    SENT_STICKER: "Стикеры",
    SENT_AUDIO: "Отправлено аудио",
    SENT_VIDEO: "Отправлено видео",
    SENT_IMAGE_MAIL: "Отправлено фото (письмо)",
    SENT_VIRTUAL_GIFT: "Отправлен подарок",
    GET_IMAGE_MAIL: "Входящее фото (письмо)",
    GET_AUDIO: "Входящее аудио",
    GET_AUDIO_MAIL: "Входящее аудио (письмо)",
    SENT_AUDIO_MAIL: "Отправлено аудио (письмо)",
    GET_VIDEO: "Входящее видео",
    GET_VIDEO_MAIL: "Входящее видео (письмо)",
    SENT_VIDEO_MAIL: "Отправлено видео (письмо)",
    MAKE_ORDER_APPROVE: "Подтверждение заказа",
    GET_VIDEO_SHOW: "Видео шоу",
    GET_CONTACT_APPROVE: "Подтверждение контакта",
    APPRECIATION: "Поощрение",
    total: "ВСЕГО",
  };

  function earningsFindAutoToken() {
    const keys = ["token", "access_token", "auth", "user_token", "api_token"];
    for (let i = 0; i < keys.length; i++) {
      try {
        const v = localStorage.getItem(keys[i]);
        if (v && String(v).trim().startsWith("eyJ")) return String(v).trim();
      } catch (e) {}
    }
    return "";
  }

  function earningsFmtUtc(d) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  class ContentEarningsPanelWidget {
    constructor() {
      this.root = null;
      this.mountParent = null;
      this.telescopeSettings = null;
      this.panelSettings = Object.assign({}, EARNINGS_DEFAULT_SETTINGS);
      this.history = [];
      this.prevStats = {};
      this.isFirstRun = true;
      this.total = 0;
      this.currentDateDisplay = "";
      this.stats = [];
      this.mountTimer = null;
      this.fetchTimer = null;
      this.anchorObserver = null;
      this.diffTimer = null;
      this.diffToastTimer = null;
      this.els = {};
      this.init();
    }

    init() {
      try {
        chrome.storage.local.get(
          ["telescopeSettings", "contentEarningsSettings", "earningsHistory"],
          (r) => {
            this.telescopeSettings = r.telescopeSettings || {};
            this.panelSettings = Object.assign(
              {},
              EARNINGS_DEFAULT_SETTINGS,
              r.contentEarningsSettings || {},
            );
            if (Array.isArray(r.earningsHistory)) this.history = r.earningsHistory;
            if (this.telescopeSettings.showBalanceWidget !== false) {
              this.startMountLoop();
            }
          },
        );

        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== "local") return;
          if (changes.telescopeSettings) {
            this.telescopeSettings = changes.telescopeSettings.newValue || {};
            if (this.telescopeSettings.showBalanceWidget === false) {
              this.destroy();
            } else {
              this.startMountLoop();
            }
          }
          if (changes.contentEarningsSettings && this.root) {
            this.panelSettings = Object.assign(
              {},
              EARNINGS_DEFAULT_SETTINGS,
              changes.contentEarningsSettings.newValue || {},
            );
            this.syncSettingsPanel();
            this.renderStats();
            this.renderHistory();
          }
          if (changes.earningsHistory && this.root) {
            this.history = Array.isArray(changes.earningsHistory.newValue)
              ? changes.earningsHistory.newValue
              : [];
            this.renderHistory();
          }
        });
      } catch (e) {
        console.error("[EarningsPanel] Init error:", e);
      }
    }

    getMountTarget() {
      // Ищем контейнер напрямую (тот же селектор что в inject.js)
      return document.querySelector('[class^="Paid_clmn_4_block_list"]') || null;
    }

    persistPanelSettings() {
      try {
        chrome.storage.local.set({
          contentEarningsSettings: this.panelSettings,
        });
      } catch (e) {}
    }

    persistHistory() {
      try {
        const trimmed = this.history.slice(0, EARNINGS_HISTORY_LIMIT);
        this.history = trimmed;
        chrome.storage.local.set({ earningsHistory: trimmed });
      } catch (e) {}
    }

    startMountLoop() {
      if (this.mountTimer || this.root) return;
      this.mountTimer = setInterval(() => {
        const t = this.getMountTarget();
        if (!t) return;
        clearInterval(this.mountTimer);
        this.mountTimer = null;
        this.mountParent = t;
        this.buildUi();
        this.ensurePosition();
        this.anchorObserver = new MutationObserver(() => this.ensurePosition());
        this.anchorObserver.observe(document.body, {
          childList: true,
          subtree: true,
        });
        const ms = Math.max(5, Number(this.panelSettings.interval) || 10) * 1000;
        this.tickFetch();
        this.fetchTimer = setInterval(() => this.tickFetch(), ms);
      }, 500);
    }

    ensurePosition() {
      const target = this.getMountTarget();
      if (!target || !this.root) return;
      this.mountParent = target;

      // Используем портал inject.js как стабильную точку привязки
      const portal = document.querySelector('.ah-earnings-portal');
      if (portal && portal.parentElement === target) {
        // Вставляем перед порталом; portal.previousSibling проверка предотвращает повторные вставки
        if (portal.previousSibling !== this.root) {
          target.insertBefore(this.root, portal);
        }
      } else if (!target.contains(this.root)) {
        // Портала нет — вставляем только если виджет вообще не в контейнере
        target.insertBefore(this.root, target.firstChild);
      }
    }

    destroy() {
      if (this.mountTimer) {
        clearInterval(this.mountTimer);
        this.mountTimer = null;
      }
      if (this.fetchTimer) {
        clearInterval(this.fetchTimer);
        this.fetchTimer = null;
      }
      if (this.anchorObserver) {
        try {
          this.anchorObserver.disconnect();
        } catch (e) {}
        this.anchorObserver = null;
      }
      if (this.diffTimer) {
        clearTimeout(this.diffTimer);
        this.diffTimer = null;
      }
      if (this.diffToastTimer) {
        clearTimeout(this.diffToastTimer);
        this.diffToastTimer = null;
      }
      if (this.root && this.root.parentNode) {
        try {
          this.root.remove();
        } catch (e) {}
      }
      this.root = null;
      this.mountParent = null;
    }

    ensureEarningsStyles() {
      if (document.getElementById("sn-earnings-styles")) return;
      const st = document.createElement("style");
      st.id = "sn-earnings-styles";
      st.textContent =
        "#sn-content-earnings.sne-earn{box-sizing:border-box;width:100%;max-width:100%;" +
        "margin:0 0 12px;padding:0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;" +
        "font-size:13px;color:#171717;-webkit-font-smoothing:antialiased;}" +
        "#sn-content-earnings .sne-earn__inner{position:relative;background:#fafafa;" +
        "border:1px solid #e8e8e8;border-radius:14px;padding:14px 14px 12px;" +
        "box-shadow:0 1px 0 rgba(0,0,0,.04),0 8px 24px -12px rgba(0,0,0,.08);}" +
        "#sn-content-earnings .sne-earn__toast{overflow:hidden;max-height:0;opacity:0;" +
        "margin:0;padding:0 2px;border-radius:10px;background:linear-gradient(120deg,#ecfdf5,#f0fdf4);" +
        "border:1px solid rgba(5,150,105,.22);box-shadow:0 2px 12px -2px rgba(5,150,105,.2);" +
        "display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;" +
        "font-size:12px;font-weight:500;color:#065f46;letter-spacing:.01em;" +
        "transition:max-height .42s cubic-bezier(.4,0,.2,1),opacity .32s ease," +
        "margin .42s cubic-bezier(.4,0,.2,1),padding .42s cubic-bezier(.4,0,.2,1);" +
        "pointer-events:none;}" +
        "#sn-content-earnings .sne-earn__toast--open{max-height:56px;opacity:1;margin:0 0 12px;" +
        "padding:9px 12px;}" +
        "#sn-content-earnings .sne-earn__toast-amt{font-variant-numeric:tabular-nums;" +
        "font-weight:700;font-size:13px;color:#047857;}" +
        "#sn-content-earnings .sne-earn__toast-dot{opacity:.45;font-weight:300;}" +
        "#sn-content-earnings .sne-earn__toast-lbl{opacity:.92;font-weight:500;}" +
        "#sn-content-earnings .sne-earn__head{display:flex;justify-content:space-between;" +
        "align-items:flex-start;gap:10px;margin-bottom:2px;}" +
        "#sn-content-earnings .sne-earn__title{min-width:0;flex:1;}" +
        "#sn-content-earnings #sne-total{font-variant-numeric:tabular-nums;font-weight:600;" +
        "font-size:22px;line-height:1.15;letter-spacing:-.03em;color:#0a0a0a;}" +
        "#sn-content-earnings #sne-date{margin-top:4px;font-size:11px;color:#737373;" +
        "letter-spacing:.04em;}" +
        "#sn-content-earnings .sne-earn__actions{display:flex;gap:2px;flex-shrink:0;" +
        "padding-top:2px;}" +
        "#sn-content-earnings .sne-earn__iconbtn{display:inline-flex;align-items:center;" +
        "justify-content:center;width:32px;height:32px;margin:0;padding:0;border:none;" +
        "border-radius:9px;background:transparent;color:#525252;cursor:pointer;" +
        "transition:background .15s ease,color .15s ease;}" +
        "#sn-content-earnings .sne-earn__iconbtn:hover{background:#ececec;color:#171717;}" +
        "#sn-content-earnings .sne-earn__iconbtn:active{transform:scale(.96);}" +
        "#sn-content-earnings #sne-settings{display:none;margin-top:4px;margin-bottom:10px;" +
        "padding:10px 12px;background:#fff;border:1px solid #ebebeb;border-radius:10px;}" +
        "#sn-content-earnings #sne-settings.is-open{display:block;}" +
        "#sn-content-earnings #sne-rows{width:52px;padding:6px 9px;font-size:12px;" +
        "border:1px solid #e5e5e5;border-radius:8px;background:#fff;color:#171717;" +
        "outline:none;transition:border-color .15s;}" +
        "#sn-content-earnings #sne-rows:focus{border-color:#a3a3a3;}" +
        "#sn-content-earnings #sne-stats-wrap{margin-top:2px;}" +
        "#sn-content-earnings .sne-earn__statrow{display:flex;gap:10px;align-items:baseline;" +
        "padding:7px 2px;border-bottom:1px solid #f0f0f0;font-size:12px;line-height:1.35;}" +
        "#sn-content-earnings .sne-earn__statrow:last-child{border-bottom:none;padding-bottom:0;}" +
        "#sn-content-earnings .sne-earn__stat-amt{min-width:52px;text-align:right;" +
        "font-variant-numeric:tabular-nums;font-weight:600;font-size:12px;color:#047857;}" +
        "#sn-content-earnings .sne-earn__stat-lbl{flex:1;color:#404040;}" +
        "#sn-content-earnings .sne-earn__hist{margin-top:10px;padding-top:10px;" +
        "border-top:1px solid #ededed;}" +
        "#sn-content-earnings .sne-earn__histcap{font-size:10px;font-weight:600;" +
        "letter-spacing:.12em;text-transform:uppercase;color:#a3a3a3;margin:0 0 8px;}" +
        "#sn-content-earnings .sne-earn__histrow{display:flex;justify-content:space-between;" +
        "align-items:baseline;gap:8px;padding:5px 2px;font-size:12px;}" +
        "#sn-content-earnings .sne-earn__hist-amt{font-variant-numeric:tabular-nums;" +
        "font-weight:600;color:#059669;flex-shrink:0;}" +
        "#sn-content-earnings .sne-earn__hist-mid{display:flex;gap:6px;align-items:baseline;" +
        "min-width:0;flex:1;}" +
        "#sn-content-earnings .sne-earn__hist-lbl{color:#525252;white-space:nowrap;" +
        "overflow:hidden;text-overflow:ellipsis;}" +
        "#sn-content-earnings .sne-earn__hist-time{font-size:11px;color:#a3a3a3;" +
        "font-variant-numeric:tabular-nums;flex-shrink:0;}" +
        "#sn-content-earnings #sne-rows{font-variant-numeric:tabular-nums;}" +
        "#sn-content-earnings .sne-earn__setrow{display:flex;justify-content:space-between;" +
        "align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;color:#525252;}" +
        "#sn-content-earnings .sne-earn__setlab{display:flex;align-items:center;gap:10px;" +
        "font-size:12px;color:#525252;}" +
        "#sn-content-earnings #sne-clear{font-size:11px;padding:6px 12px;border-radius:8px;" +
        "border:1px solid #fecaca;background:#fff;color:#b91c1c;cursor:pointer;" +
        "transition:background .15s,border-color .15s;}" +
        "#sn-content-earnings #sne-clear:hover{background:#fef2f2;border-color:#f87171;}";
      (document.head || document.documentElement).appendChild(st);
    }

    buildUi() {
      if (this.root) return;
      this.ensureEarningsStyles();
      const w = document.createElement("div");
      w.id = "sn-content-earnings";
      w.className = "sne-earn";
      w.setAttribute("data-snatch-widget", "true");

      w.innerHTML =
        '<div class="sne-earn__inner">' +
        '<div id="sne-diff" class="sne-earn__toast" role="status" aria-live="polite"></div>' +
        '<div class="sne-earn__head">' +
        '<div class="sne-earn__title">' +
        '<div id="sne-total">$0.00</div>' +
        '<div id="sne-date">—</div></div>' +
        '<div class="sne-earn__actions">' +
        '<button type="button" class="sne-earn__iconbtn" id="sne-toggle-stats" aria-label="Статистика" title="Статистика">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6 1.41 1.41z"/></svg></button>' +
        '<button type="button" class="sne-earn__iconbtn" id="sne-toggle-settings" aria-label="Настройки" title="Настройки">' +
        '<svg width="16" height="16" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M14,7.77 L14,6.17 L12.06,5.53 L11.61,4.44 L12.49,2.6 L11.36,1.47 L9.55,2.38 L8.46,1.93 L7.77,0.01 L6.17,0.01 L5.54,1.95 L4.43,2.4 L2.59,1.52 L1.46,2.65 L2.37,4.46 L1.92,5.55 L0,6.23 L0,7.82 L1.94,8.46 L2.39,9.55 L1.51,11.39 L2.64,12.52 L4.45,11.61 L5.54,12.06 L6.23,13.98 L7.82,13.98 L8.45,12.04 L9.56,11.59 L11.4,12.47 L12.53,11.34 L11.61,9.53 L12.08,8.44 L14,7.75 L14,7.77 Z M7,10 C5.34,10 4,8.66 4,7 C4,5.34 5.34,4 7,4 C8.66,4 10,5.34 10,7 C10,8.66 8.66,10 7,10 Z"/></svg></button>' +
        "</div></div>" +
        '<div id="sne-settings"></div>' +
        '<div id="sne-stats-wrap"></div>' +
        '<div id="sne-history-outer"></div></div>';

      this.root = w;
      this.els.total = w.querySelector("#sne-total");
      this.els.date = w.querySelector("#sne-date");
      this.els.diff = w.querySelector("#sne-diff");
      this.els.statsWrap = w.querySelector("#sne-stats-wrap");
      this.els.historyOuter = w.querySelector("#sne-history-outer");
      this.els.settings = w.querySelector("#sne-settings");
      w.querySelector("#sne-toggle-stats").onclick = () => this.onToggleStats();
      w.querySelector("#sne-toggle-settings").onclick = () => this.onToggleSettings();
      this.buildSettingsPanel();
      this.mountParent.insertBefore(w, this.mountParent.firstChild);
      this.updateChevronIcon();
      this.renderStats();
      this.renderHistory();
    }

    buildSettingsPanel() {
      const s = this.els.settings;
      if (!s) return;
      s.innerHTML =
        '<div class="sne-earn__setrow">' +
        '<label class="sne-earn__setlab">Строк истории' +
        '<input id="sne-rows" type="number" min="1" max="50" /></label>' +
        '<button type="button" id="sne-clear">Очистить историю</button></div>';
      s.style.display = "none";
      s.classList.remove("is-open");
      const inp = s.querySelector("#sne-rows");
      inp.value = String(
        Math.min(50, Math.max(1, Number(this.panelSettings.rows) || 10)),
      );
      inp.onchange = () => {
        let v = parseInt(inp.value, 10) || 10;
        if (v > 50) v = 50;
        if (v < 1) v = 1;
        this.panelSettings.rows = v;
        this.persistPanelSettings();
        this.renderHistory();
      };
      s.querySelector("#sne-clear").onclick = () => {
        this.history = [];
        this.persistHistory();
        this.renderHistory();
      };
    }

    syncSettingsPanel() {
      const inp = this.root && this.root.querySelector("#sne-rows");
      if (inp)
        inp.value = String(
          Math.min(50, Math.max(1, Number(this.panelSettings.rows) || 10)),
        );
    }

    onToggleStats() {
      this.panelSettings.hideStats = !this.panelSettings.hideStats;
      this.persistPanelSettings();
      this.updateChevronIcon();
      this.renderStats();
    }

    onToggleSettings() {
      const open = this.els.settings.classList.contains("is-open");
      if (open) {
        this.els.settings.style.display = "none";
        this.els.settings.classList.remove("is-open");
      } else {
        this.els.settings.style.display = "block";
        this.els.settings.classList.add("is-open");
      }
      const btn = this.root.querySelector("#sne-toggle-settings");
      if (btn) {
        btn.innerHTML = open
          ? '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M14,7.77 L14,6.17 L12.06,5.53 L11.61,4.44 L12.49,2.6 L11.36,1.47 L9.55,2.38 L8.46,1.93 L7.77,0.01 L6.17,0.01 L5.54,1.95 L4.43,2.4 L2.59,1.52 L1.46,2.65 L2.37,4.46 L1.92,5.55 L0,6.23 L0,7.82 L1.94,8.46 L2.39,9.55 L1.51,11.39 L2.64,12.52 L4.45,11.61 L5.54,12.06 L6.23,13.98 L7.82,13.98 L8.45,12.04 L9.56,11.59 L11.4,12.47 L12.53,11.34 L11.61,9.53 L12.08,8.44 L14,7.75 L14,7.77 Z M7,10 C5.34,10 4,8.66 4,7 C4,5.34 5.34,4 7,4 C8.66,4 10,5.34 10,7 C10,8.66 8.66,10 7,10 Z"/></svg>'
          : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M.439,21.44a1.5,1.5,0,0,0,2.122,2.121L11.823,14.3a.25.25,0,0,1,.354,0l9.262,9.263a1.5,1.5,0,1,0,2.122-2.121L14.3,12.177a.25.25,0,0,1,0-.354l9.263-9.262A1.5,1.5,0,0,0,21.439.44L12.177,9.7a.25.25,0,0,1-.354,0L2.561.44A1.5,1.5,0,0,0,.439,2.561L9.7,11.823a.25.25,0,0,1,0,.354Z"/></svg>';
      }
    }

    updateChevronIcon() {
      const btn = this.root && this.root.querySelector("#sne-toggle-stats");
      if (!btn) return;
      const up = !this.panelSettings.hideStats;
      btn.innerHTML = up
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6 1.41 1.41z"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>';
    }

    showDiffBadge(amount, label) {
      const el = this.els.diff;
      if (!el) return;
      if (this.diffTimer) clearTimeout(this.diffTimer);
      if (this.diffToastTimer) clearTimeout(this.diffToastTimer);
      el.innerHTML =
        '<span class="sne-earn__toast-amt">+$' +
        amount.toFixed(2) +
        "</span>" +
        (label
          ? '<span class="sne-earn__toast-dot" aria-hidden="true">·</span><span class="sne-earn__toast-lbl">' +
            this.esc(label) +
            "</span>"
          : "");
      el.classList.add("sne-earn__toast--open");
      const sec = Math.max(1, Number(this.panelSettings.fade) || 10);
      const totalMs = Math.max(1800, sec * 1000);
      const fadeMs = 400;
      this.diffTimer = setTimeout(() => {
        el.classList.remove("sne-earn__toast--open");
        this.diffToastTimer = setTimeout(() => {
          el.innerHTML = "";
          this.diffToastTimer = null;
        }, fadeMs);
      }, Math.max(0, totalMs - fadeMs));
    }

    renderStats() {
      if (!this.els.statsWrap) return;
      if (this.panelSettings.hideStats) {
        this.els.statsWrap.innerHTML = "";
        this.els.statsWrap.style.display = "none";
        return;
      }
      this.els.statsWrap.style.display = "block";
      if (!this.stats.length) {
        this.els.statsWrap.innerHTML = "";
        return;
      }
      const rows = this.stats
        .map(
          (item) =>
            '<div class="sne-earn__statrow">' +
            '<span class="sne-earn__stat-amt">$' +
            item.amount.toFixed(2) +
            "</span>" +
            '<span class="sne-earn__stat-lbl">' +
            this.esc(item.label) +
            "</span></div>",
        )
        .join("");
      this.els.statsWrap.innerHTML = rows;
    }

    renderHistory() {
      if (!this.els.historyOuter) return;
      const rows = Math.min(
        this.history.length,
        Math.max(1, Number(this.panelSettings.rows) || 10),
      );
      if (!this.history.length) {
        this.els.historyOuter.innerHTML = "";
        return;
      }
      const list = this.history
        .slice(0, rows)
        .map(
          (item) =>
            '<div class="sne-earn__histrow">' +
            '<div class="sne-earn__hist-mid">' +
            '<span class="sne-earn__hist-amt">+' +
            Number(item.amount).toFixed(2) +
            "</span>" +
            '<span class="sne-earn__hist-lbl">' +
            this.esc(item.label) +
            "</span></div>" +
            '<span class="sne-earn__hist-time">' +
            this.esc(item.time) +
            "</span></div>",
        )
        .join("");
      this.els.historyOuter.innerHTML =
        '<div class="sne-earn__hist">' +
        '<p class="sne-earn__histcap">История (' +
        rows +
        ")</p>" +
        "<div>" +
        list +
        "</div></div>";
    }

    esc(s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    updateHeader() {
      if (this.els.total)
        this.els.total.textContent = "$" + this.total.toFixed(2);
      if (this.els.date) this.els.date.textContent = this.currentDateDisplay;
    }

    async tickFetch() {
      if (!this.root) return;
      const token = earningsFindAutoToken();
      if (!token) {
        if (this.els.total) this.els.total.textContent = "—";
        if (this.els.date) this.els.date.textContent = "Нет JWT (перезайдите)";
        return;
      }
      try {
        await waitBridgeReady(4e3);
      } catch (e) {}

      const now = new Date();
      const todayStr = earningsFmtUtc(now);
      this.currentDateDisplay = todayStr + " (UTC)";

      const past = new Date(now.getTime());
      past.setUTCDate(now.getUTCDate() - 1);
      const dateFrom = earningsFmtUtc(past);

      const path =
        "/api/statistic/profileActionGrouped?date_from=" +
        encodeURIComponent(dateFrom) +
        "&date_to=" +
        encodeURIComponent(todayStr);

      try {
        const { json: data } = await pageFetchJson(path, {
          method: "GET",
          headers: {
            Authorization: "Bearer " + token,
            Accept: "application/json",
          },
          timeout: 12e3,
        });

        if (!data || !Array.isArray(data.response)) return;

        let targetStats = data.response.find(function (item) {
          return item && item.date === todayStr;
        });
        if (!targetStats) targetStats = { total: "0.00" };

        const currentTotal = parseFloat(targetStats.total || 0);
        if (isNaN(currentTotal)) return;

        this.total = currentTotal;

        if (!this.isFirstRun) {
          const prevStats = this.prevStats;
          let foundDiff = false;
          const newHistoryItems = [];
          const timeString = new Date().toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
          });

          Object.keys(targetStats).forEach((key) => {
            if (key === "date" || key === "total") return;
            const currentVal = parseFloat(targetStats[key] || 0);
            const prevVal = parseFloat(prevStats[key] || 0);
            if (currentVal > prevVal) {
              const difference = currentVal - prevVal;
              this.showDiffBadge(difference, EARNINGS_LABELS[key] || key);
              foundDiff = true;
              newHistoryItems.push({
                amount: difference,
                label: EARNINGS_LABELS[key] || key,
                time: timeString,
                id: Date.now() + Math.random(),
              });
            }
          });

          if (newHistoryItems.length) {
            this.history = newHistoryItems.concat(this.history).slice(0, EARNINGS_HISTORY_LIMIT);
            this.persistHistory();
            this.renderHistory();
          }

          if (
            !foundDiff &&
            prevStats.total != null &&
            currentTotal > parseFloat(prevStats.total)
          ) {
            const diff = currentTotal - parseFloat(prevStats.total);
            this.showDiffBadge(diff, null);
            this.history = [
              {
                amount: diff,
                label: "Разное",
                time: timeString,
                id: Date.now(),
              },
            ].concat(this.history).slice(0, EARNINGS_HISTORY_LIMIT);
            this.persistHistory();
            this.renderHistory();
          }
        }

        this.prevStats = targetStats;
        this.isFirstRun = false;

        this.stats = Object.keys(targetStats)
          .filter(function (key) {
            return (
              key !== "date" &&
              key !== "total" &&
              parseFloat(targetStats[key] || 0) > 0
            );
          })
          .map(function (key) {
            return {
              label: EARNINGS_LABELS[key] || key,
              amount: parseFloat(targetStats[key] || 0),
            };
          })
          .sort(function (a, b) {
            return b.amount - a.amount;
          });

        this.updateHeader();
        this.renderStats();
        this.renderHistory();
      } catch (err) {
        console.error("[EarningsPanel] fetch:", err);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════

  
// ═══════════════════════════════════════════════════════════
// DIALOGS COUNTER (SnatchOne custom)
// ═══════════════════════════════════════════════════════════
(function initDialogsCounter() {
  // Счётчик диалогов от сервера
  function injectDialogsCounter() {
    const portal = document.querySelector('.sne-earn');
    if (!portal) return;

    // Находим строку с датой — вставим счётчик под ней
    const dateEl = portal.querySelector('#sne-date');
    if (!dateEl) return;

    // Уже вставлен?
    if (portal.querySelector('.sn-dialogs-counter')) return;

    const counter = document.createElement('div');
    counter.className = 'sn-dialogs-counter';
    counter.style.cssText = `
      font-size: 11px; color: #aaa; margin-top: 4px;
      display: flex; align-items: center; gap: 4px;
    `;
    counter.innerHTML = `<span class="sn-dialogs-dot" style="font-size:10px;transition:color .3s,text-shadow .3s;cursor:default;">●</span> <span class="sn-dialogs-num">—</span> диалогов в шансе`;

    // Вставляем после строки с датой
    dateEl.parentElement?.insertBefore(counter, dateEl.nextSibling);

    // Обновляем значение
    updateDialogsCounter();
  }

  function updateDialogsCounter() {
    chrome.storage.local.get(['snDialogsFound', 'snLastStatsTime', 'ahRunning'], r => {
      const n       = r.snDialogsFound  || 0;
      const lastTs  = r.snLastStatsTime || 0;
      const running = r.ahRunning       === true;
      // Сервер считается живым если STATS пришёл менее 30 сек назад
      const alive   = running && (Date.now() - lastTs < 30000);

      document.querySelectorAll('.sn-dialogs-counter').forEach(counter => {
        const dot = counter.querySelector('.sn-dialogs-dot');
        const num = counter.querySelector('.sn-dialogs-num');
        if (dot) {
          dot.style.color      = alive ? '#27ae60' : '#ccc';
          dot.style.textShadow = alive ? '0 0 6px rgba(39,174,96,.6)' : 'none';
          dot.title            = alive ? 'Сервер работает' : 'Сервер не активен';
        }
        if (num) {
          num.textContent  = n > 0 ? String(n) : '—';
          num.style.color  = n > 0 ? 'var(--sa, #6c5ce7)' : '#aaa';
          num.style.fontWeight = n > 0 ? '600' : '400';
        }
      });
    });
  }

  
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && ("snDialogsFound" in changes || "ahRunning" in changes || "snLastStatsTime" in changes)) {
      updateDialogsCounter();
    }
  });

  const obs = new MutationObserver(() => {
    injectDialogsCounter();
  });
  obs.observe(document.body, { childList: true, subtree: true });

  setInterval(updateDialogsCounter, 10000);
})();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { setTimeout(() => new ContentEarningsPanelWidget(), 500); });
} else {
  setTimeout(() => new ContentEarningsPanelWidget(), 500);
}

// ═══════════════════════════════════════════════════════════
(function initChatLimitsRefresh() {
  const STORAGE_KEY = "ADB_chat_limits_v1";
  const CHANNEL     = "adb-invites";
  const INTERVAL_MS = 30_000; // каждые 30 секунд

  let bc = null;
  try { bc = new BroadcastChannel(CHANNEL); } catch {}

  async function fetchAndUpdateLimits() {
    const token = localStorage.getItem("token");
    if (!token) return;

    // Определяем фильтр — берём текущий из URL или дефолт
    const filter = location.href.includes("chance") ? "chance" : "chat";

    try {
      const res = await fetch(
        `/api/chatList/chatListByUserID?page=1&filter=${filter}`,
        {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json, text/plain, */*",
            Authorization: "Bearer " + token,
          },
        }
      );
      if (!res.ok) return;

      const data = await res.json().catch(() => null);
      const list = data?.response;
      if (!Array.isArray(list) || !list.length) return;

      // Читаем текущий кэш
      let cache = {};
      try { cache = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch {}

      const now = Date.now();
      let changed = false;

      for (const item of list) {
        const uid = item?.chat_uid;
        if (!uid) continue;
        const msgLim = Number(item?.message_limit);
        const letLim = Number(item?.letter_limit);
        if (!Number.isFinite(msgLim) || !Number.isFinite(letLim)) continue;

        const prev = cache[uid];
        if (!prev || prev.message_limit !== msgLim || prev.letter_limit !== letLim) {
          cache[uid] = { message_limit: msgLim, letter_limit: letLim, ts: now };
          changed = true;
        }
      }

      if (!changed) return;

      // Сохраняем — storage event триггернёт перерисовку в page.js
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));

      // Также шлём через BroadcastChannel
      try { bc?.postMessage({ type: "chat-limits", ts: now, src: "snatch-refresh" }); } catch {}

    } catch { /* тихо */ }
  }

  // Запускаем сразу и потом каждые 30 секунд
  fetchAndUpdateLimits();
  setInterval(fetchAndUpdateLimits, INTERVAL_MS);
})();
