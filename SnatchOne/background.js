const EXT_VERSION = "139",
  tabCooldown = new Map(),
  isCooling = (e) => (tabCooldown.get(e) || 0) > Date.now(),
  penalize = (e, t = 15e3) => tabCooldown.set(e, Date.now() + t);

// ═══════════════════════════════════════════════════════════
// LRU CACHE для userDetail и lastMessage (TTL: 30 сек)
// ═══════════════════════════════════════════════════════════
const USER_DETAIL_CACHE = new Map(); // chat_uid → { data, ts }
const LAST_MESSAGE_CACHE = new Map(); // chat_uid → { data, ts }
const CACHE_TTL = 30000; // 30 секунд
let cacheHits = 0;
let cacheMisses = 0;

function getCachedUserDetail(chatUid) {
  const cached = USER_DETAIL_CACHE.get(chatUid);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    cacheHits++;
    return cached.data;
  }
  cacheMisses++;
  return null;
}

function setCachedUserDetail(chatUid, data) {
  USER_DETAIL_CACHE.set(chatUid, { data, ts: Date.now() });
  // Ограничиваем размер кэша (макс 500 записей)
  if (USER_DETAIL_CACHE.size > 500) {
    const firstKey = USER_DETAIL_CACHE.keys().next().value;
    USER_DETAIL_CACHE.delete(firstKey);
  }
}

function getCachedLastMessage(chatUid) {
  const cached = LAST_MESSAGE_CACHE.get(chatUid);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    cacheHits++;
    return cached.data;
  }
  cacheMisses++;
  return null;
}

function setCachedLastMessage(chatUid, data) {
  LAST_MESSAGE_CACHE.set(chatUid, { data, ts: Date.now() });
  if (LAST_MESSAGE_CACHE.size > 500) {
    const firstKey = LAST_MESSAGE_CACHE.keys().next().value;
    LAST_MESSAGE_CACHE.delete(firstKey);
  }
}

function getCacheStats() {
  const total = cacheHits + cacheMisses;
  const hitRate = total > 0 ? ((cacheHits / total) * 100).toFixed(1) : 0;
  return {
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: `${hitRate}%`,
    userDetailSize: USER_DETAIL_CACHE.size,
    lastMessageSize: LAST_MESSAGE_CACHE.size
  };
}
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// МОНИТОРИНГ ПРОИЗВОДИТЕЛЬНОСТИ
// ═══════════════════════════════════════════════════════════
const PERF_LOG = [];

function logPerf(label, duration) {
  PERF_LOG.push({ label, duration, ts: Date.now() });
  if (PERF_LOG.length > 100) PERF_LOG.shift();
  console.log(`⚡ ${label}: ${duration.toFixed(0)}ms`);
}

// Экспорт статистики (доступно через chrome.runtime.sendMessage)
globalThis.getPerformanceStats = () => {
  if (PERF_LOG.length === 0) return { avg: 0, log: [] };
  const avg = PERF_LOG.reduce((sum, x) => sum + x.duration, 0) / PERF_LOG.length;
  return { 
    avg: avg.toFixed(0), 
    count: PERF_LOG.length,
    log: PERF_LOG.slice(-20) // последние 20 записей
  };
};
// ═══════════════════════════════════════════════════════════

let lastPayload = "",
  lastHash = "",
  lastHeaders = {},
  ahWs = null,
  wsSid = null,
  wsAuth = null,
  wsUrl = null,
  wsPingTmr = null,
  wsActive = !1,
  bearerToken = null,
  lastSenderTabId = null;
(chrome.runtime.onInstalled.addListener(async (e) => {
  try {
    const t = await new Promise((e) =>
      chrome.storage.local.get(
        ["ahRunning", "ahLastPayload", "ahLastHash", "ahLastHeaders", "ahSet"],
        e,
      ),
    );
    if (
      (chrome.storage.local.set({ ahLastVersion: EXT_VERSION }),
      "install" === e.reason)
    ) {
      (await chrome.storage.local.set({ ahRunning: !1 }), setBadge("Stopped"));
      try {
        chrome.alarms.clear("ahUpdate");
      } catch {}
      try {
        ahWs && ahWs.close();
      } catch {}
      return (
        (ahWs = null),
        (wsActive = !1),
        chrome.storage.local.get(["ahAutoBackup", "ahLastBackup"], (e) => {
          void 0 === e.ahAutoBackup
            ? chrome.storage.local.set({
                ahAutoBackup: !0,
                ahLastBackup: Date.now(),
              })
            : e.ahAutoBackup &&
              void 0 === e.ahLastBackup &&
              chrome.storage.local.set({ ahLastBackup: Date.now() });
        }),
        void (
          t.ahSet &&
          t.ahSet.running &&
          ((t.ahSet.running = !1), chrome.storage.local.set({ ahSet: t.ahSet }))
        )
      );
    }
    "update" === e.reason &&
      t.ahRunning &&
      (await doBotAction(
        {
          run: "Stop",
          json: t.ahLastPayload || "",
          hash: t.ahLastHash || "",
          key: (t.ahLastHeaders || {})["AH-Auth"] || "",
          opId: (t.ahLastHeaders || {})["AH-OperatorID"] || "",
        },
        {},
      ),
      t.ahSet &&
        t.ahSet.running &&
        ((t.ahSet.running = !1), chrome.storage.local.set({ ahSet: t.ahSet })));
  } catch (e) {
    (console.warn("[onInstalled] force-stop failed", e), (wsActive = !1));
    try {
      ahWs && ahWs.close();
    } catch {}
    ((ahWs = null),
      setBadge("Stopped"),
      chrome.storage.local.set({ ahRunning: !1 }));
    try {
      chrome.alarms.clear("ahUpdate");
    } catch {}
  }
}),
  chrome.storage.local.get("ahJwt", (e) => {
    bearerToken = e.ahJwt || null;
  }));
const FULL_TABLE_CMD = "BuildFullTable",
  FT_RESUME_KEY = "ahFTResume";
let ftResumePage = 0;
chrome.storage.local.get(FT_RESUME_KEY, (e) => {
  ftResumePage = Number(e[FT_RESUME_KEY]) || 0;
});
const DEFAULT_ENDPOINT = "http://127.0.0.1:3000/";
let ahEndpoint = DEFAULT_ENDPOINT;
function switchEndpoint(e) {
  "string" == typeof e &&
    ((e = e.endsWith("/") ? e : e + "/"),
    /^https:\/\/[a-z0-9-]+\.alpha-helper\.date\/$/i.test(e) &&
      e !== ahEndpoint &&
      ((ahEndpoint = e),
      chrome.storage.local.set({ ahBaseHost: e }),
      ahWs && (ahWs.close(), (ahWs = null)),
      (wsUrl = null),
      (wsSid = null),
      (wsAuth = null)));
}
const profilesCache = { list: null, ts: 0 };
async function getProfiles(e, t = 5e3) {
  if (!e) return [];
  const a = Date.now();
  if (profilesCache.list && a - profilesCache.ts < t) return profilesCache.list;
  try {
    const t = await alphaFetchViaAnyTab("/api/operator/profiles", {
        method: "GET",
        headers: { authorization: "Bearer " + e },
      }),
      r = new TextDecoder().decode(b64ToUint8(t.bodyBase64 || "")),
      s = JSON.parse(r);
    if (Array.isArray(s))
      return ((profilesCache.list = s), (profilesCache.ts = a), s);
  } catch {}
  return [];
}
async function fetchCurrentOperatorId(e, t = null) {
  if (!e) return null;
  const a = {
      authorization: "Bearer " + e,
      "content-type": "application/json",
    },
    r = Array.isArray(t) ? t : await getProfiles(e),
    s = r.length ? r[0] : null;
  if (!s) return null;
  const { external_id: o, id: n } = s;
  try {
    const e = await alphaFetchViaAnyTab(
        `/api/sender/inviteList?external_id=${o}&mail_type=Chat`,
        { method: "GET", headers: a },
      ),
      t = new TextDecoder().decode(b64ToUint8(e.bodyBase64 || "")),
      r = Array.isArray(JSON.parse(t)) ? JSON.parse(t) : [];
    try {
      const e = r.filter(
        (e) =>
          "string" == typeof e?.message_content &&
          "test" === e.message_content.trim().toLowerCase(),
      );
      e.length &&
        (await Promise.allSettled(
          e.map((e) =>
            alphaFetchViaAnyTab(
              `/api/sender/deleteInvite?external_id=${o}&id=${e.id}&mail_type=Chat`,
              { method: "GET", headers: a },
            ),
          ),
        ));
    } catch {}
    const s = r.find((e) => e.operator_id);
    if (s) return s.operator_id;
  } catch {}
  try {
    const e = JSON.stringify({
        external_id: o,
        woman_id: n,
        message_content: "test",
        message_type: "SENT_TEXT",
        sender_type: "chat",
      }),
      t = await alphaFetchViaAnyTab("/api/sender/addInvite", {
        method: "POST",
        headers: a,
        bodyStr: e,
      }),
      r = new TextDecoder().decode(b64ToUint8(t.bodyBase64 || "")),
      s = JSON.parse(r) || {},
      i = Array.isArray(s?.inviteList) ? s.inviteList : [],
      c = i.find((e) => e.operator_id),
      l = c?.operator_id || null,
      h = i.find(
        (e) =>
          "string" == typeof e?.message_content &&
          "test" === e.message_content.trim().toLowerCase(),
      );
    if (h?.id)
      try {
        await alphaFetchViaAnyTab(
          `/api/sender/deleteInvite?external_id=${o}&id=${h.id}&mail_type=Chat`,
          { method: "GET", headers: a },
        );
      } catch {}
    return l;
  } catch {
    return null;
  }
}
function waitTabComplete(e, t = 3500) {
  return new Promise((a) => {
    try {
      chrome.tabs.get(e, (e) =>
        chrome.runtime.lastError || !e
          ? a(!1)
          : "complete" === e.status
            ? a(!0)
            : void 0,
      );
    } catch {
      return a(!1);
    }
    const r = (t, s) => {
      t === e &&
        "complete" === s.status &&
        (chrome.tabs.onUpdated.removeListener(r), a(!0));
    };
    (chrome.tabs.onUpdated.addListener(r),
      setTimeout(() => {
        try {
          chrome.tabs.onUpdated.removeListener(r);
        } catch {}
        a(!1);
      }, t));
  });
}
async function waitContentReady(e, t = 6e3) {
  const a = Date.now();
  for (; Date.now() - a < t; ) {
    try {
      const t = await sendToTabWithTimeout(e, { cmd: "ah_ping" }, 800);
      if (t && t.ok && t.bridge) return !0;
    } catch {}
    await waitTabComplete(e, 1200);
  }
  return !1;
}
async function getAlphaTabs() {
  return new Promise((e) =>
    chrome.tabs.query({ url: "https://alpha.date/*" }, (t) =>
      e((t || []).filter((e) => !e.discarded)),
    ),
  );
}
function orderAlphaTabs(e) {
  const t = [...(e || [])];
  if (lastSenderTabId) {
    const e = t.findIndex((e) => e.id === lastSenderTabId);
    if (e >= 0) {
      const [a] = t.splice(e, 1);
      t.unshift(a);
    }
  }
  return t;
}
function sendToTabWithTimeout(e, t, a = 8e3) {
  return new Promise((r, s) => {
    let o = !1;
    const n = setTimeout(() => {
      o || ((o = !0), s(new Error("timeout")));
    }, a);
    try {
      chrome.tabs.sendMessage(e, t, (e) => {
        o ||
          (clearTimeout(n),
          chrome.runtime.lastError || !e
            ? s(new Error(chrome.runtime.lastError?.message || "no receiver"))
            : r(e));
      });
    } catch (e) {
      (clearTimeout(n), s(e));
    }
  });
}
function killWsNoTabs() {
  try {
    wsActive = !1;
  } catch {}
  if ((wsPingTmr && (clearInterval(wsPingTmr), (wsPingTmr = null)), ahWs)) {
    try {
      ahWs.close();
    } catch {}
    ahWs = null;
  }
}
async function alphaFetchViaAnyTab(
  e,
  {
    method: t = "GET",
    headers: a = {},
    bodyStr: r = null,
    referer: s = null,
  } = {},
  o = 5e3,
  n = {},
) {
  const i = await getAlphaTabs();
  if (!i.length) throw new Error("no alpha tabs");
  const c = orderAlphaTabs(i.filter((e) => !isCooling(e.id))),
    l = c.length ? c : orderAlphaTabs(i);
  let h;
  for (const i of l) {
    const c = Date.now(),
      l = await waitContentReady(i.id, Math.min(Math.floor(0.6 * o), 4e3)),
      d = o - (Date.now() - c);
    if (!l || d <= 300) penalize(i.id, n.cooldownMs || 1e4);
    else
      try {
        const o = await sendToTabWithTimeout(
          i.id,
          {
            cmd: "fetchViaPage",
            path: e,
            method: t,
            headers: a,
            bodyBase64: r ? uint8ToB64(new TextEncoder().encode(r)) : null,
            timeout: Math.max(500, d - 200),
            bridgeTimeout: n.bridgeTimeoutMs || 1200,
            referer: s || null,
          },
          Math.max(800, d),
        );
        if (o?.ok) return ((lastSenderTabId = i.id), o);
        (penalize(i.id, n.cooldownMs || 1e4),
          (h = new Error(o?.error || "bad response")));
      } catch (e) {
        (penalize(i.id, n.cooldownMs || 1e4), (h = e));
      }
  }
  throw h || new Error("all tabs failed");
}
async function ensureEndpointLoaded() {
  if (ahEndpoint === DEFAULT_ENDPOINT)
    try {
      const e = await new Promise((e) =>
        chrome.storage.local.get("ahBaseHost", e),
      );
      "string" == typeof e.ahBaseHost &&
        e.ahBaseHost &&
        (ahEndpoint = e.ahBaseHost);
    } catch {}
}
function makeWsUrl(e, t) {
  return e.replace(/^https:/, "wss:").replace(/\/$/, "") + "/client/" + t;
}
function uint8ToB64(e) {
  let t = "";
  for (let a = 0; a < e.length; a += 32768)
    t += String.fromCharCode(...e.subarray(a, a + 32768));
  return btoa(t);
}
async function getBearerToken() {
  return (
    bearerToken ||
    new Promise((e) => {
      chrome.storage.local.get("ahJwt", (t) => {
        ((bearerToken = t.ahJwt || null), e(bearerToken));
      });
    })
  );
}
function askForFreshPayload(e = 1e4) {
  return new Promise((t) => {
    let a = !1;
    (chrome.tabs.query({}, (e) => {
      for (const r of e)
        chrome.tabs.sendMessage(r.id, { cmd: "getPayload" }, (e) => {
          a || (!chrome.runtime.lastError && e?.ok && ((a = !0), t(e)));
        });
    }),
      setTimeout(() => {
        a || t(null);
      }, e));
  });
}
function handleWsInbound(e) {
  e.action !== FULL_TABLE_CMD
    ? e.method && e.path && proxyFetch(e)
    : (async () => {
        try {
          await buildFullTable(e);
        } catch (e) {
          killWsNoTabs();
        }
      })();
}
function connectWs(e, t, a) {
  return !wsActive || ahWs
    ? Promise.resolve()
    : new Promise((r) => {
        ((wsSid = e),
          (wsAuth = t),
          (wsUrl = a || makeWsUrl(ahEndpoint, e)),
          (ahWs = new WebSocket(`${wsUrl}?AH-Auth=${t}`)));
        const s = setTimeout(() => {
          if (ahWs && 1 !== ahWs.readyState) {
            console.warn("[WS] open timeout, force close");
            try {
              ahWs.close();
            } catch {}
            ahWs = null;
          }
          r();
        }, 8e3);
        ((ahWs.onopen = () => {
          (clearTimeout(s),
            console.log("[WS] open", e),
            (wsPingTmr = setInterval(() => {
              1 === ahWs?.readyState && ahWs.send('{"type":"ping"}');
            }, 25e3)),
            lastSenderTabId ||
              chrome.tabs.query({ url: "https://alpha.date/*" }, (e) => {
                e.length &&
                  ((lastSenderTabId = e[0].id), ensureWsPort(lastSenderTabId));
              }),
            r());
        }),
          (ahWs.onerror = (e) => console.warn("[WS] err", e)),
          (ahWs.onclose = () => {
            (clearTimeout(s),
              console.log("[WS] close"),
              clearInterval(wsPingTmr),
              (wsPingTmr = null),
              (ahWs = null),
              r());
          }));
        let o = "";
        ahWs.onmessage = async (e) => {
          let t = e.data;
          // Обработка Blob, если пришел бинарник
          if (t instanceof Blob) t = await t.text();

          t = t.replace(/\r?\n$/, "");
          o += t; // o - это буфер (let o = "") объявленный выше в твоем коде

          try {
            const msg = JSON.parse(o);
            o = ""; // Очищаем буфер после успешного парсинга

            // --- НОВОЕ: СОХРАНЕНИЕ СТАТИСТИКИ ---
            // --- НОВОЕ: СОХРАНЕНИЕ СТАТИСТИКИ ---
            if (msg.type === "STATS") {
              // Сохраняем и статистику, и состояние ротации
              chrome.storage.local.set({
                ahDailyStats: msg.stats,
                ahRotationState: msg.rotation || {},
                ahLastStatsTime: Date.now(),
                ahDialogsFound: msg.dialogsFound || 0,
              });
              return; // Дальше не обрабатываем
            }
            // ------------------------------------

            handleWsInbound(msg);
          } catch (err) {
            // Ждем следующий чанк данных, если JSON неполный
          }
        };
      });
}
function b64ToUint8(e) {
  const t = atob(e);
  return Uint8Array.from(t, (e) => e.charCodeAt(0));
}
function b64ToUtf8(e) {
  return new TextDecoder("utf-8").decode(b64ToUint8(e));
}
async function proxyFetch(e) {
  const t = async () => {
      const t = { ...e.headers };
      if (!("Authorization" in t)) {
        const e = await getBearerToken();
        e && (t.Authorization = "Bearer " + e);
      }
      const a = e.body ? b64ToUtf8(e.body) : null,
        r = alphaFetchViaAnyTab(
          e.path,
          {
            method: e.method,
            headers: t,
            bodyStr: a,
            referer: e.referer || null,
          },
          Math.max(4700, 500),
        );
      return await Promise.race([
        r,
        new Promise((e, t) => setTimeout(() => t(new Error("timeout")), 5e3)),
      ]);
    },
    a = (e) => {
      try {
        const t = e?.headers || {},
          a = String(
            t["content-type"] || t["Content-Type"] || "",
          ).toLowerCase(),
          r =
            !(!t["cf-ray"] && !t["CF-RAY"]) ||
            String(t.server || t.Server || "")
              .toLowerCase()
              .includes("cloudflare");
        if (!a.includes("text/html") && !r) return !1;
        const s = new TextDecoder()
            .decode(b64ToUint8(e.bodyBase64 || ""))
            .slice(0, 4096),
          o =
            /Just a moment/i.test(s) ||
            /cf[-_]?challenge/i.test(s) ||
            /cdn-cgi\/challenge-platform/i.test(s) ||
            /name="cf_chl_/i.test(s) ||
            /turnstile/i.test(s) ||
            /hcaptcha/i.test(s);
        return (
          (a.includes("text/html") && o) ||
          (r &&
            (403 === e.status || 503 === e.status || a.includes("text/html")))
        );
      } catch {
        return !1;
      }
    };
  let r;
  try {
    r = await t();
  } catch (e) {
    try {
      if (!(await getAlphaTabs()).length) return void killWsNoTabs();
    } catch {
      return void killWsNoTabs();
    }
    try {
      r = await t();
    } catch (e) {
      return void killWsNoTabs();
    }
  }
  if (a(r)) {
    await sleep(1e4);
    try {
      r = await t();
    } catch {
      return void killWsNoTabs();
    }
    if (a(r)) return void killWsNoTabs();
  }
  let s = r.bodyBase64;
  if (
    ("string" == typeof e.path ? e.path : "").toLowerCase().includes("personal")
  )
    try {
      const e = JSON.parse(new TextDecoder().decode(b64ToUint8(s))),
        t = Math.floor(Date.now() / 1e3),
        a = 900,
        r = (e, r = !1) =>
          Array.isArray(e)
            ? [
                ...new Map(
                  e
                    .filter((e) => {
                      const r = Number(e?.userProfileAlias?.last_online) || 0;
                      return !!r && t - r <= a;
                    })
                    .map((e) => [
                      e?.man_external_id,
                      {
                        man_external_id: e?.man_external_id,
                        active: r ? 0 : Number(e?.active) || 0,
                        created_at: e?.created_at,
                      },
                    ]),
                ).values(),
              ]
            : [];
      if (e && (Array.isArray(e.newList) || Array.isArray(e.historyList))) {
        const t = {
          newList: r(e.newList, !0),
          historyList: r(e.historyList, !1),
        };
        s = uint8ToB64(new TextEncoder().encode(JSON.stringify(t)));
      }
    } catch {}
  try {
    ahWs?.send(
      JSON.stringify({
        id: e.id,
        status: r.status,
        headers: r.headers,
        body: s,
      }),
    );
  } catch {}
}
async function buildFullTable({ id: e, firstPageOnly: t = 0 }) {
  const a = await getBearerToken(),
    r = a ? { authorization: "Bearer " + a } : {},
    s = performance.now(),
    o = ftResumePage || 0,
    n = [],
    i = new Set();
  async function c(e, t = !1) {
    const a = t ? [e] : Array.from({ length: 5 }, (t, a) => e + a); // 3 → 5 страниц
    let o = !1;
    for (let e = 0; e < a.length; e += 5) { // 3 → 5 параллельно
      const t = a.slice(e, e + 5);
      for (const e of t)
        if (performance.now() - s > 19700)
          return (
            (ftResumePage = e),
            chrome.storage.local.set({ [FT_RESUME_KEY]: ftResumePage }),
            { aborted: !0, end: !1 }
          );
      const c = await Promise.all(
          t.map(async (e) => {
            try {
              return {
                ok: !0,
                p: e,
                json: await fetchJSON(
                  "/api/chatList/chatListByUserID",
                  {
                    user_id: "",
                    chat_uid: !1,
                    page: e,
                    freeze: !0,
                    limits: null,
                    ONLINE_STATUS: 1,
                    SEARCH: "",
                    CHAT_TYPE: "CHANCE",
                  },
                  r,
                  { referer: "https://alpha.date/chance", perTryMs: 3000 }, // Уменьшили таймаут
                ),
              };
            } catch (t) {
              return { ok: !1, p: e, err: t };
            }
          }),
        ),
        l = c.filter((e) => e.ok).sort((e, t) => e.p - t.p),
        h = c.filter((e) => !e.ok).sort((e, t) => e.p - t.p);
      if (!l.length)
        return (
          (ftResumePage = h[0].p),
          chrome.storage.local.set({ [FT_RESUME_KEY]: ftResumePage }),
          { aborted: !0, end: !1 }
        );
      const d = l.map(({ p: e, json: t }) => {
          const a = Array.isArray(t?.response) ? t.response : [],
            r = a.filter((e) => e && 0 === e.female_block);
          return (a.length < 30 && (o = !0), { p: e, rows: r });
        }),
        u = Array.from(
          new Set(d.flatMap((e) => e.rows.map((e) => e.chat_uid))),
        );
      let m = { response: [] },
        p = { response: [] };
      if (u.length)
        try {
          // ═══════════════════════════════════════════════════════════
          // ОПТИМИЗАЦИЯ: Проверяем LRU кэш перед запросом
          // ═══════════════════════════════════════════════════════════
          const cachedDetails = [];
          const cachedMessages = [];
          const uncachedUids = [];
          
          for (const uid of u) {
            const detail = getCachedUserDetail(uid);
            const message = getCachedLastMessage(uid);
            if (detail && message) {
              cachedDetails.push(detail);
              cachedMessages.push(message);
            } else {
              uncachedUids.push(uid);
            }
          }
          
          // Логируем эффективность кэша
          if (cachedDetails.length > 0) {
            console.log(`🎯 Cache hit: ${cachedDetails.length}/${u.length} (${((cachedDetails.length/u.length)*100).toFixed(0)}%)`);
          }
          
          // Запрашиваем только некэшированные
          if (uncachedUids.length > 0) {
            [m, p] = await Promise.all([
              fetchJSON("/api/chatList/userDetail", { chat_uid: uncachedUids }, r, {
                referer: "https://alpha.date/chance",
              }),
              fetchJSON("/api/chatList/lastMessage", { chat_uid: uncachedUids }, r, {
                referer: "https://alpha.date/chance",
              }),
            ]);
            
            // Сохраняем в кэш
            if (m?.response) {
              for (const item of m.response) setCachedUserDetail(item.chat_uid, item);
            }
            if (p?.response) {
              for (const item of p.response) setCachedLastMessage(item.chat_uid, item);
            }
          }
          
          // Объединяем кэшированные и новые данные
          m.response = [...cachedDetails, ...(m?.response || [])];
          p.response = [...cachedMessages, ...(p?.response || [])];
          // ═══════════════════════════════════════════════════════════
        } catch {
          return (
            (ftResumePage = l[0].p),
            chrome.storage.local.set({ [FT_RESUME_KEY]: ftResumePage }),
            { aborted: !0, end: !1 }
          );
        }
      const f = Object.fromEntries(
          (m?.response || []).map((e) => [e.chat_uid, e]),
        ),
        y = Object.fromEntries((p?.response || []).map((e) => [e.chat_uid, e]));
      for (const { p: e, rows: t } of d) {
        if (!t.every((e) => f[e.chat_uid] && y[e.chat_uid]))
          return (
            (ftResumePage = e),
            chrome.storage.local.set({ [FT_RESUME_KEY]: ftResumePage }),
            { aborted: !0, end: !1 }
          );
        for (const e of t) {
          const t = e.chat_uid;
          i.has(t) ||
            (i.add(t), n.push({ ...e, ...(f[t] || {}), ...(y[t] || {}) }));
        }
      }
      if (h.length)
        return (
          (ftResumePage = h[0].p),
          chrome.storage.local.set({ [FT_RESUME_KEY]: ftResumePage }),
          { aborted: !0, end: !1 }
        );
    }
    return { end: o };
  }
  if (t) return (await c(1, !0), h());
  {
    const e = await c(1);
    if (e?.aborted) return h();
    if (e?.end)
      return (
        (ftResumePage = 0),
        chrome.storage.local.remove(FT_RESUME_KEY),
        h()
      );
  }
  let l = o ? Math.max(4, o - 4) : 4;
  for (;;) {
    if (performance.now() - s > 2e4) {
      ((ftResumePage = l),
        chrome.storage.local.set({ [FT_RESUME_KEY]: ftResumePage }));
      break;
    }
    const { end: e, aborted: t } = await c(l);
    if (t) break;
    if (e) {
      ((ftResumePage = 0), chrome.storage.local.remove(FT_RESUME_KEY));
      break;
    }
    l += 3;
  }
  // ═══════════════════════════════════════════════════════════
  // МОНИТОРИНГ: Логируем время выполнения BuildFullTable
  // ═══════════════════════════════════════════════════════════
  const totalDuration = performance.now() - s;
  logPerf('BuildFullTable', totalDuration);
  // ═══════════════════════════════════════════════════════════
  return h();
  function h() {
    const t = JSON.stringify(n),
      a = uint8ToB64(new TextEncoder().encode(t));
    1 === ahWs?.readyState &&
      ahWs.send(JSON.stringify({ id: e, status: 200, body: a }));
  }
}
function sleep(e) {
  return new Promise((t) => setTimeout(t, e));
}
function parseRetryAfter(e) {
  if (!e) return 0;
  const t = Number(e);
  if (Number.isFinite(t)) return Math.max(0, Math.floor(1e3 * t));
  const a = Date.parse(e);
  return Number.isFinite(a) ? Math.max(0, a - Date.now()) : 0;
}
async function fetchJSON(e, t, a = {}, r = {}) {
  const s = Number.isFinite(r.attempts) ? Math.max(1, r.attempts) : 3,
    o = Number.isFinite(r.perTryMs) ? Math.max(800, r.perTryMs) : 5e3,
    n = { "Content-Type": "application/json", ...a },
    i = JSON.stringify(t || {});
  let c;
  for (let t = 0; t < s; t++) {
    try {
      const t = await Promise.race([
          alphaFetchViaAnyTab(
            e,
            {
              method: "POST",
              headers: n,
              bodyStr: i,
              referer: r.referer || null,
            },
            Math.max(500, o - 200),
          ),
          new Promise((e, t) => setTimeout(() => t(new Error("timeout")), o)),
        ]),
        a = new TextDecoder().decode(b64ToUint8(t.bodyBase64 || "")),
        s = 0 | t.status;
      try {
        const e = t.headers || {},
          r = String(
            e["content-type"] || e["Content-Type"] || "",
          ).toLowerCase(),
          o =
            !(!e["cf-ray"] && !e["CF-RAY"]) ||
            String(e.server || e.Server || "")
              .toLowerCase()
              .includes("cloudflare"),
          n =
            /Just a moment/i.test(a) ||
            /cf[-_]?challenge/i.test(a) ||
            /cdn-cgi\/challenge-platform/i.test(a) ||
            /name="cf_chl_/i.test(a) ||
            /turnstile/i.test(a) ||
            /hcaptcha/i.test(a);
        if (
          (r.includes("text/html") && n) ||
          (o && (403 === s || 503 === s || r.includes("text/html")))
        ) {
          (await sleep(1e4), (c = new Error("cloudflare_challenge")));
          continue;
        }
      } catch {}
      if (s < 200 || s > 299) {
        const r = new Error(`fetch ${e} → ${s}\n${a}`);
        if (429 === s) {
          const e = parseRetryAfter(
              (t.headers || {})["retry-after"] ||
                (t.headers || {})["Retry-After"],
            ),
            a = Math.floor(200 * Math.random());
          (await sleep(e + a || 500 + a), (c = r));
          continue;
        }
        if (s >= 400 && s < 500 && ![408, 429].includes(s)) throw r;
        c = r;
      } else
        try {
          return JSON.parse(a);
        } catch (e) {
          c = new Error(`json parse failed: ${e.message}`);
        }
    } catch (e) {
      c = e;
    }
    if (t < s - 1) {
      const e = 150 * Math.pow(2, t),
        a = Math.floor(120 * Math.random());
      await sleep(e + a);
    }
  }
  throw c || new Error("request failed");
}
function ahUrl(e, { auth: t, opId: a, action: r, hash: s }) {
  const o = (t || "").slice(0, 16);
  return `${e}?${new URLSearchParams({ "AH-Auth": o, "AH-OperatorID": a || "", "AH-Action": r || "", "AH-JSON-SHA1": s || "", "AH-JSON-Len": String(lastPayload?.length || 0), ver: EXT_VERSION }).toString()}`;
}
function handleForbidden(e) {
  const t = e && 403 === e.status && "ok" === e.headers.get("AH-Origin");
  return (
    t &&
      (chrome.storage.local.remove([
        "ahLastPayload",
        "ahLastHash",
        "ahLastHeaders",
        "ahRunning",
      ]),
      (lastPayload = ""),
      (lastHash = ""),
      (lastHeaders = {}),
      setBadge("None"),
      chrome.tabs.query({}, (e) => {
        for (const t of e)
          chrome.tabs.sendMessage(t.id, { cmd: "resetAuth" }, () => {
            chrome.runtime.lastError;
          });
      })),
    t
  );
}
function purgeAuth() {
  // Мы отключаем очистку данных, чтобы локальная сессия не прерывалась
  console.log("Заблокирована попытка сброса авторизации (Local Bypass Active)");

  /* Оригинальная логика удаления данных закомментирована:
  chrome.storage.local.remove(["ahLastPayload", "ahLastHash", "ahLastHeaders", "ahRunning"]);
  lastPayload = "";
  lastHash = "";
  lastHeaders = {};
  wsActive = false;
  setBadge("None");
  */
}
function setBadge(e) {
  "Running" === e
    ? (chrome.action.setBadgeText({ text: "▶" }),
      chrome.action.setBadgeBackgroundColor({ color: "#4caf50" }))
    : "Stopped" === e
      ? (chrome.action.setBadgeText({ text: "Ⅱ" }),
        chrome.action.setBadgeBackgroundColor({ color: "#d32f2f" }))
      : (chrome.action.setBadgeText({ text: "" }),
        chrome.action.setBadgeBackgroundColor({ color: [0, 0, 0, 0] }));
}
async function extractExpSec(e) {
  try {
    const t = await e.clone().json();
    if (
      (t.endpoint && switchEndpoint(t.endpoint), "number" == typeof t.exp_sec)
    ) {
      const e = t.exp_sec;
      chrome.tabs.query({}, (t) => {
        for (const a of t)
          chrome.tabs.sendMessage(a.id, { cmd: "saveExp", exp_sec: e }, () => {
            chrome.runtime.lastError;
          });
      });
    }
    Array.isArray(t.stats_daily) &&
      t.stats_daily.length &&
      chrome.storage.local.set({ ahStatsDaily: t.stats_daily[0] });
  } catch {}
}
async function sendUpdate() {
  if ((checkAutoBackup(), ahWs && 0 === ahWs.readyState)) {
    console.warn("[WS] stuck in CONNECTING, reset");
    try {
      ahWs.close();
    } catch {}
    ahWs = null;
  }
  const e = await askForFreshPayload();
  if (!lastHeaders?.["AH-Auth"]) return;
  e?.ok &&
    ((lastPayload = e.json),
    (lastHash = e.hash),
    chrome.storage.local.set({
      ahLastPayload: lastPayload,
      ahLastHash: lastHash,
    }));
  const t = await getBearerToken(),
    a = await getProfiles(t);
  if (!a.some((e) => 1 === Number(e.online ?? e.is_online)))
    return (
      (wsActive = !1),
      wsPingTmr && (clearInterval(wsPingTmr), (wsPingTmr = null)),
      void (ahWs && (ahWs.close(), (ahWs = null)))
    );
  const r = await fetchCurrentOperatorId(t, a);
  if (r && r !== lastHeaders["AH-OperatorID"])
    return (
      (wsActive = !1),
      wsPingTmr && (clearInterval(wsPingTmr), (wsPingTmr = null)),
      void (ahWs && (ahWs.close(), (ahWs = null)))
    );
  await ensureEndpointLoaded();
  const s = ahUrl(ahEndpoint, {
    auth: lastHeaders["AH-Auth"],
    opId: lastHeaders["AH-OperatorID"],
    action: "Start",
    hash: lastHash,
  });
  try {
    const e = await fetch(s, {
      method: "POST",
      body: lastPayload,
      keepalive: !0,
    });
    (handleForbidden(e), extractExpSec(e));
    let t = {};
    try {
      t = await e.clone().json();
    } catch {}
    t.sid &&
      t.wss_url &&
      t.auth &&
      !ahWs &&
      ((wsActive = !0),
      await connectWs(t.sid, t.auth, t.wss_url),
      lastSenderTabId && ensureWsPort(lastSenderTabId));
  } catch (e) {
    console.warn("[sendUpdate]", e);
  }
}
async function checkAutoBackup() {
  const e = await new Promise((e) =>
    chrome.storage.local.get(["ahAutoBackup", "ahLastBackup"], e),
  );
  if (!e.ahAutoBackup) return;
  const t = Date.now();
  if (!(t - (e.ahLastBackup || 0) < 864e5))
    try {
      (await makeBackup(),
        chrome.storage.local.set({ ahLastBackup: t }),
        console.log("[AB] backup done", new Date(t).toLocaleString()));
    } catch (e) {
      console.warn("[AB] failed:", e);
    }
}
async function makeBackup() {
  const e = await askForFreshPayload(3e3);
  if (!e?.ok) return void console.warn("[AB] no payload");
  const t = new Date(),
    a = (e) => String(e).padStart(2, "0"),
    r = `alpha_helper_backup_${t.getFullYear()}-${a(t.getMonth() + 1)}-${a(t.getDate())}_${a(t.getHours())}-${a(t.getMinutes())}-${a(t.getSeconds())}.json`,
    s =
      "data:application/json;base64," +
      btoa(unescape(encodeURIComponent(e.json)));
  (chrome.downloads.download(
    { url: s, filename: r, conflictAction: "uniquify", saveAs: !1 },
    (e) => {
      (chrome.runtime.lastError,
        chrome.storage.local.set({ ahLastBackup: Date.now() }));
    },
  ),
    await new Promise((e) => setTimeout(e, 1e3)));
}
function getCfCookie() {
  return new Promise((e) => {
    chrome.cookies.get(
      {
        url: "https://alpha.date",
        name: "cf_clearance",
        partitionKey: { topLevelSite: "https://alpha.date" },
      },
      (t) => {
        if (t?.value) return e(t.value);
        chrome.cookies.getAll({ name: "cf_clearance" }, (t) =>
          e(t[0]?.value || ""),
        );
      },
    );
  });
}
async function doBotAction(e, t) {
  const a = t?.tab?.id || null;
  (await ensureEndpointLoaded(),
    e.json && e.hash && ((lastPayload = e.json), (lastHash = e.hash)),
    (lastHeaders = { "AH-Auth": e.key, "AH-OperatorID": e.opId }),
    chrome.storage.local.set({
      ahLastPayload: lastPayload,
      ahLastHash: lastHash,
      ahLastHeaders: lastHeaders,
    }));
  try {
    const t = ahUrl(ahEndpoint, {
        auth: lastHeaders["AH-Auth"],
        opId: lastHeaders["AH-OperatorID"],
        action: e.run,
        hash: lastHash,
      }),
      r = await fetch(t, { method: "POST", body: lastPayload, keepalive: !0 });
    if (403 === r.status) return void purgeAuth();
    handleForbidden(r);
    extractExpSec(r);
    const s = await r
      .clone()
      .json()
      .catch(() => ({}));
    "Start" === e.run &&
      s.sid &&
      s.wss_url &&
      s.auth &&
      ((wsActive = !0),
      connectWs(s.sid, s.auth, s.wss_url),
      a && ((lastSenderTabId = a), ensureWsPort(a)));
  } catch (e) {
    console.warn("[botAction] network error", e);
  }
  "Start" === e.run
    ? ((wsActive = !0),
      setBadge("Running"),
      chrome.storage.local.set({ ahRunning: !0 }),
      chrome.alarms.create("ahUpdate", { periodInMinutes: 1 }))
    : "Stop" === e.run &&
      ((wsActive = !1),
      wsPingTmr && (clearInterval(wsPingTmr), (wsPingTmr = null)),
      ahWs && (ahWs.close(), (ahWs = null)),
      setBadge("Stopped"),
      chrome.storage.local.set({ ahRunning: !1 }),
      chrome.alarms.clear("ahUpdate"));
}
async function doPostHelper(e) {
  if ((await ensureEndpointLoaded(), !e.jwt))
    return { error: "JWT отсутствует - войдите в оператор" };
  if (!e.key) return { error: "Пустой AUTH-KEY" };
  const t = {
    authorization: "Bearer " + e.jwt,
    "content-type": "application/json",
  };
  let a;
  try {
    const e = await alphaFetchViaAnyTab("/api/operator/profiles", {
        method: "GET",
        headers: t,
      }),
      r = new TextDecoder().decode(b64ToUint8(e.bodyBase64 || ""));
    if (((a = JSON.parse(r)), !Array.isArray(a) || !a.length))
      return { error: "Анкет нет" };
  } catch (e) {
    return { error: "Ошибка fetch profiles: " + e };
  }
  const { external_id: r, id: s } = a[0];
  let o = null,
    n = [];
  try {
    const e = await alphaFetchViaAnyTab(
        `/api/sender/inviteList?external_id=${r}&mail_type=Chat`,
        { method: "GET", headers: t },
      ),
      a = new TextDecoder().decode(b64ToUint8(e.bodyBase64 || ""));
    n = Array.isArray(JSON.parse(a)) ? JSON.parse(a) : [];
  } catch (e) {
    n = [];
  }
  try {
    const e = (Array.isArray(n) ? n : []).filter(
      (e) =>
        "string" == typeof e?.message_content &&
        "test" === e.message_content.trim().toLowerCase(),
    );
    e.length &&
      (await Promise.allSettled(
        e.map((e) =>
          alphaFetchViaAnyTab(
            `/api/sender/deleteInvite?external_id=${r}&id=${e.id}&mail_type=Chat`,
            { method: "GET", headers: t },
          ),
        ),
      ));
  } catch {}
  try {
    const e = (Array.isArray(n) ? n : []).find((e) => e.operator_id);
    e && (o = e.operator_id);
  } catch {}
  if (!o)
    try {
      const e = JSON.stringify({
          external_id: r,
          woman_id: s,
          message_content: "test",
          message_type: "SENT_TEXT",
          sender_type: "chat",
        }),
        a = await alphaFetchViaAnyTab("/api/sender/addInvite", {
          method: "POST",
          headers: t,
          bodyStr: e,
        }),
        n = new TextDecoder().decode(b64ToUint8(a.bodyBase64 || "")),
        i = JSON.parse(n) || {},
        c = Array.isArray(i?.inviteList) ? i.inviteList : [],
        l = c.find((e) => e.operator_id);
      l && (o = l.operator_id);
      const h = c.find(
        (e) =>
          "string" == typeof e?.message_content &&
          "test" === e.message_content.trim().toLowerCase(),
      );
      if (h?.id)
        try {
          await alphaFetchViaAnyTab(
            `/api/sender/deleteInvite?external_id=${r}&id=${h.id}&mail_type=Chat`,
            { method: "GET", headers: t },
          );
        } catch {}
    } catch {}
  if (!o) return { error: "operator_id не найден (inviteList/addInvite)" };
  try {
    const t = ahUrl(ahEndpoint, {
        auth: e.key,
        opId: o,
        action: "Init",
        hash: "",
      }),
      a = await fetch(t, { method: "POST" });
    return (
      extractExpSec(a),
      {
        status: a.status,
        statusText: a.statusText,
        body: await a.text(),
        origin: "ok" === a.headers.get("AH-Origin"),
        operator_id: o,
      }
    );
  } catch (e) {
    return { error: "Ошибка POST Init: " + e };
  }
}
function handleToggleAuto(e) {
  chrome.storage.local.get(["ahAutoBackup", "ahLastBackup"], (t) => {
    if (e) {
      const e = { ahAutoBackup: !0 };
      (t.ahAutoBackup || (e.ahLastBackup = Date.now()),
        chrome.storage.local.set(e));
    } else chrome.storage.local.set({ ahAutoBackup: !1 });
  });
}
async function handleGetCookies(e) {
  try {
    e({ cf: await getCfCookie() });
  } catch {
    e({ cf: "" });
  }
}
async function handleBotAction(e, t, a) {
  try {
    (await doBotAction(e, t), a({ ok: !0 }));
  } catch (e) {
    a({ ok: !1, error: String(e) });
  }
}
async function handlePostHelper(e, t) {
  try {
    t(await doPostHelper(e));
  } catch (e) {
    t({ error: String(e) });
  }
}

// --- ЛОГИКА ВКЛЮЧЕНИЯ СЕНДЕРОВ ---

async function processEnableSenders() {
  const token = await getBearerToken();
  if (!token) throw new Error("Нет токена");

  // 1. Получаем все анкеты
  const profiles = await getProfiles(token);
  if (!profiles || !profiles.length) throw new Error("Анкеты не найдены");

  console.log(
    `[Senders] Найдено анкет: ${profiles.length}. Начинаем включение...`,
  );

  let count = 0;

  for (const p of profiles) {
    console.log(`[Senders] Обработка анкеты: ${p.name} (ID: ${p.external_id})`);

    // Мы должны попытаться включить и ЧАТ, и ПИСЬМА
    await enableSenderForProfile(p, "Chat", token);
    await enableSenderForProfile(p, "Letter", token); // Используем "Letter" как mail_type

    count++;
    await sleep(1000); // Пауза между анкетами
  }

  console.log(`[Senders] Готово! Обработано анкет: ${count}`);
}

async function enableSenderForProfile(profile, type, token) {
  // type = "Chat" или "Letter"
  try {
    const extId = profile.external_id;

    // 1. Получаем список инвайтов
    // В запросе mail_type: Chat или Letter
    const listRes = await alphaFetchViaAnyTab(
      `/api/sender/inviteList?external_id=${extId}&mail_type=${type}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    const listBody = new TextDecoder().decode(
      b64ToUint8(listRes.bodyBase64 || ""),
    );
    const invites = JSON.parse(listBody);

    if (!Array.isArray(invites) || invites.length === 0) {
      console.warn(`   ⚠️ [${type}] Нет инвайтов для ${profile.name}`);
      return;
    }

    // Берем первый попавшийся активный инвайт (обычно они отсортированы)
    const invite = invites[0];
    if (!invite || !invite.id) return;

    console.log(`   👉 [${type}] Включаем инвайт ID: ${invite.id}`);

    // 2. Формируем Payload для create
    // Нам нужны данные, часть из профиля, часть из инвайта
    const payload = {
      operator_id: invite.operator_id || profile.operator_id, // Берем из инвайта, надежнее
      agency_id: profile.agency_id, // Надеемся, что в profiles есть agency_id
      woman_id: invite.profile_id || profile.id, // Внутренний ID девушки
      woman_external_id: extId,

      sender_type: type, // "Chat" или "Letter"
      message_type: "SENT_TEXT", // Обычно всегда текст, даже если есть фото (оно в attachments)
      message_content: invite.message_content,

      audience: "online",
      exclude_audience: "null",
      invite_id: invite.invite_id || invite.id, // В inviteList ID инвайта это просто "id"
    };

    const createRes = await alphaFetchViaAnyTab("/api/sender/create", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      bodyStr: JSON.stringify(payload),
    });

    const createBody = new TextDecoder().decode(
      b64ToUint8(createRes.bodyBase64 || ""),
    );
    const createJson = JSON.parse(createBody);

    if (
      createJson.success ||
      createJson.status === true ||
      typeof createJson.response === "number"
    ) {
      console.log(`   ✅ [${type}] Успешно включен!`);
    } else {
      console.error(`   ❌ [${type}] Ошибка:`, createJson);
    }
  } catch (e) {
    console.error(`   ❌ [${type}] Критическая ошибка:`, e);
  }
}

(chrome.runtime.onStartup.addListener(async () => {
  const e = await new Promise((e) =>
    chrome.storage.local.get(
      [
        "ahLastVersion",
        "ahRunning",
        "ahLastPayload",
        "ahLastHash",
        "ahLastHeaders",
      ],
      e,
    ),
  );
  if (
    e.ahLastVersion !== EXT_VERSION &&
    (chrome.storage.local.set({ ahLastVersion: EXT_VERSION }), e.ahRunning)
  )
    return void (await doBotAction(
      {
        run: "Stop",
        json: e.ahLastPayload || "",
        hash: e.ahLastHash || "",
        key: (e.ahLastHeaders || {})["AH-Auth"] || "",
        opId: (e.ahLastHeaders || {})["AH-OperatorID"] || "",
      },
      {},
    ));
  const t = await new Promise((e) =>
    chrome.storage.local.get(
      [
        "ahRunning",
        "ahLastPayload",
        "ahLastHash",
        "ahLastHeaders",
        "ahBaseHost",
      ],
      e,
    ),
  );
  if (
    (setBadge(t.ahRunning ? "Running" : "Stopped"),
    (ahEndpoint = t.ahBaseHost || DEFAULT_ENDPOINT),
    !t.ahRunning)
  )
    return;
  ((lastPayload = t.ahLastPayload || ""),
    (lastHash = t.ahLastHash || ""),
    (lastHeaders = t.ahLastHeaders || {}));
  const a = await askForFreshPayload();
  if (
    (a?.ok &&
      ((lastPayload = a.json),
      (lastHash = a.hash),
      chrome.storage.local.set({
        ahLastPayload: lastPayload,
        ahLastHash: lastHash,
      })),
    !lastHeaders?.["AH-Auth"])
  )
    return void chrome.alarms.create("ahUpdate", { periodInMinutes: 1 });
  const r = await getBearerToken(),
    s = await getProfiles(r);
  if (!s.some((e) => 1 === Number(e.online ?? e.is_online)))
    return void chrome.alarms.create("ahUpdate", { periodInMinutes: 1 });
  const o = await fetchCurrentOperatorId(r, s);
  if (o && o !== lastHeaders["AH-OperatorID"])
    chrome.alarms.create("ahUpdate", { periodInMinutes: 1 });
  else {
    try {
      const e = ahUrl(ahEndpoint, {
          auth: lastHeaders["AH-Auth"],
          opId: lastHeaders["AH-OperatorID"],
          action: "Start",
          hash: lastHash,
        }),
        t = await fetch(e, {
          method: "POST",
          body: lastPayload,
          keepalive: !0,
        });
      (handleForbidden(t), extractExpSec(t));
      let a = {};
      try {
        a = await t.clone().json();
      } catch {}
      a.sid &&
        a.wss_url &&
        a.auth &&
        ((wsActive = !0), connectWs(a.sid, a.auth, a.wss_url));
    } catch (e) {
      console.warn("[onStartup]", e);
    }
    chrome.alarms.create("ahUpdate", { periodInMinutes: 1 });
  }
}),
  chrome.alarms.onAlarm.addListener(async (e) => {
    if ("ahUpdate" === e.name) {
      if (!lastPayload || !lastHeaders?.["AH-Auth"]) {
        const e = await new Promise((e) =>
          chrome.storage.local.get(
            ["ahLastPayload", "ahLastHash", "ahLastHeaders"],
            e,
          ),
        );
        ((lastPayload = e.ahLastPayload || ""),
          (lastHash = e.ahLastHash || ""),
          (lastHeaders = e.ahLastHeaders || {}));
      }
      try {
        await sendUpdate();
      } catch (e) {
        console.warn("[ahUpdate]", e);
      }
    }
  }),
  chrome.action.onClicked.addListener((e) => {
    e.id &&
      chrome.tabs.sendMessage(e.id, "openModal", () => {
        chrome.runtime.lastError;
      });
  }),
  chrome.runtime.onMessage.addListener((e, t, a) => {
    if ("token" === e?.type)
      return (
        (bearerToken = e.value || null),
        void chrome.storage.local.set({ ahJwt: bearerToken })
      );
    if ("stopListUpdated" === e?.cmd) {
      // inject.js добавил ID в стоп-лист — уведомляем все вкладки чтобы content.js обновил AH_STORE
      chrome.tabs.query({ url: "https://alpha.date/*" }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { cmd: "reloadStop", value: e.value }).catch(() => {});
        });
      });
      return true;
    }
    if ("clearHistory" === e?.cmd) {
      if (ahWs && ahWs.readyState === 1) {
        ahWs.send(JSON.stringify({ type: "CLEAR_HISTORY" }));
        console.log("Команда очистки истории отправлена на сервер");
      }
      return true;
    }
    if ("enableAllSenders" === e?.cmd) {
      processEnableSenders()
        .then(() => a({ ok: true }))
        .catch((err) => {
          console.error(err);
          a({ ok: false, error: String(err) });
        });
      return true;
    }
    if ("getCookies" === e) return (handleGetCookies(a), !0);
    if ("botAction" === e?.cmd) return (handleBotAction(e, t, a), !0);
    if ("setBadge" !== e?.cmd) {
      if ("saveEndpoint" !== e?.cmd)
        return "postHelper" === e?.cmd
          ? (handlePostHelper(e, a), !0)
          : void ("toggleAutoBackup" !== e?.cmd
              ? "resetAuth" !== e?.cmd || purgeAuth()
              : handleToggleAuto(e.enable));
      switchEndpoint(e.ep);
    } else setBadge(e.state);
  }));
const keepAlivePorts = new Set(),
  wsKeepPorts = new Map();
function ensureWsPort(e) {
  wsKeepPorts.has(e) ||
    chrome.tabs.get(e, (t) => {
      if (chrome.runtime.lastError || !t) return;
      if ("complete" !== t.status) return;
      if (!/^https:\/\/alpha\.date\//i.test(t.url || "")) return;
      let a = chrome.tabs.connect(e, { name: "AH_WS_KEEP" });
      !chrome.runtime.lastError &&
        a &&
        (wsKeepPorts.set(e, a),
        a.onMessage.addListener(() => {}),
        a.onDisconnect.addListener(() => {
          (chrome.runtime.lastError, wsKeepPorts.delete(e));
        }));
    });
}
(chrome.tabs.onActivated.addListener(({ tabId: e }) => {
  ensureWsPort(e);
}),
  chrome.tabs.onUpdated.addListener((e, t) => {
    "complete" === t.status && ensureWsPort(e);
  }),
  chrome.runtime.onConnect.addListener((e) => {
    "KEEP_ALIVE_AH" === e.name &&
      (keepAlivePorts.add(e),
      e.onMessage.addListener(() => {}),
      e.onDisconnect.addListener(() => {
        try {
          chrome.runtime.lastError;
        } catch {}
        keepAlivePorts.delete(e);
      }));
  }));

// --- БАЛАНС + SPEND МУЖЧИНЫ ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'getBalance') {
    fetch("http://45.82.255.216:8080/balanceUdp/" + request.profileId)
      .then(r => r.json())
      .then(data => sendResponse({ balance: data.balance, dob: data.dob }))
      .catch(() => sendResponse({ error: "Нет связи" }));
    return true;
  }
  // Спенд мужчины с внешнего сервера
  if (request.type === 'getManSpend') {
    fetch("http://45.82.255.216:8080/balanceUdp/" + request.manId)
      .then(r => r.json())
      .then(data => sendResponse({ spend: data.balance, dob: data.dob }))
      .catch(() => sendResponse({ error: "Нет связи" }));
    return true;
  }
});

// ============================================================
// AHT MODULE SUPPORT — Chat Credits, Local Time, Mark Chats,
//                      Mails-All-Chats, Personal Timer, 10-2 Highlight
// No telemetry: sync.endpoint is null in dom-dump-defaults.js
// ============================================================

const AHT_SETTINGS_KEY = "aht_settings_v1";
const AHT_DEFAULT_SETTINGS = {
  features: {
    inactiveChatLabels: true,
    personalBadge: true,
    chatLimitHighlight: true,
    personalTimer: true,
  },
  modules: {
    chatCredits: true,
    contentBlocker: false,
    mailsAllChats: true,
    localTime: true,
    markChats: true,
    balanceMonitor: false,
    translator: false,
    galleryMarker: false,
  },
  options: {
    uiLanguage: "ru",
    translator: { fontSizePx: 13, fontColor: "inherit", fontFamily: "inherit", italic: false },
    chatCredits: { fontSizePx: 11, fontColor: "inherit", fontFamily: "inherit", italic: false },
  },
};

// Initialize aht_settings_v1 if not present (runs on every extension start)
chrome.storage.local.get(AHT_SETTINGS_KEY, (result) => {
  if (!result[AHT_SETTINGS_KEY]) {
    chrome.storage.local.set({ [AHT_SETTINGS_KEY]: AHT_DEFAULT_SETTINGS });
  }
});

// AHT_GET_SETTINGS message handler — used by chat-credits and other AHT modules
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "AHT_GET_SETTINGS") return false;
  chrome.storage.local.get(AHT_SETTINGS_KEY, (result) => {
    const settings = result[AHT_SETTINGS_KEY] || AHT_DEFAULT_SETTINGS;
    sendResponse({ ok: true, settings });
  });
  return true;
});

// getTimezone handler — used by Local Time module (Open Meteo geocoding, no API key needed)
// Also handles empty city: returns country-level default timezone for known countries.

// Country → primary timezone (for single-TZ countries or good approximations)
const COUNTRY_DEFAULT_TZ = {
  // Europe
  GB: "Europe/London",   IE: "Europe/Dublin",   PT: "Europe/Lisbon",
  IS: "Atlantic/Reykjavik",
  FR: "Europe/Paris",    BE: "Europe/Brussels",  NL: "Europe/Amsterdam",
  DE: "Europe/Berlin",   AT: "Europe/Vienna",    CH: "Europe/Zurich",
  LU: "Europe/Luxembourg",
  ES: "Europe/Madrid",   IT: "Europe/Rome",      MT: "Europe/Malta",
  GR: "Europe/Athens",   CY: "Asia/Nicosia",
  PL: "Europe/Warsaw",   CZ: "Europe/Prague",    SK: "Europe/Bratislava",
  HU: "Europe/Budapest", SI: "Europe/Ljubljana", HR: "Europe/Zagreb",
  BA: "Europe/Sarajevo", RS: "Europe/Belgrade",  ME: "Europe/Podgorica",
  MK: "Europe/Skopje",   AL: "Europe/Tirane",
  RO: "Europe/Bucharest", BG: "Europe/Sofia",
  TR: "Europe/Istanbul",
  SE: "Europe/Stockholm", NO: "Europe/Oslo",     DK: "Europe/Copenhagen",
  FI: "Europe/Helsinki",
  EE: "Europe/Tallinn",  LV: "Europe/Riga",     LT: "Europe/Vilnius",
  BY: "Europe/Minsk",    UA: "Europe/Kiev",      MD: "Europe/Chisinau",
  // FSU
  RU: "Europe/Moscow",   KZ: "Asia/Almaty",
  GE: "Asia/Tbilisi",    AM: "Asia/Yerevan",     AZ: "Asia/Baku",
  UZ: "Asia/Tashkent",   TM: "Asia/Ashgabat",    TJ: "Asia/Dushanbe",
  KG: "Asia/Bishkek",
  // Middle East
  IL: "Asia/Jerusalem",  JO: "Asia/Amman",       LB: "Asia/Beirut",
  SY: "Asia/Damascus",   IQ: "Asia/Baghdad",     IR: "Asia/Tehran",
  SA: "Asia/Riyadh",     AE: "Asia/Dubai",       QA: "Asia/Qatar",
  KW: "Asia/Kuwait",     BH: "Asia/Bahrain",     OM: "Asia/Muscat",
  YE: "Asia/Aden",
  // Asia
  IN: "Asia/Kolkata",    PK: "Asia/Karachi",     BD: "Asia/Dhaka",
  LK: "Asia/Colombo",    NP: "Asia/Kathmandu",   MM: "Asia/Rangoon",
  TH: "Asia/Bangkok",    VN: "Asia/Ho_Chi_Minh", KH: "Asia/Phnom_Penh",
  LA: "Asia/Vientiane",  MY: "Asia/Kuala_Lumpur", SG: "Asia/Singapore",
  ID: "Asia/Jakarta",    PH: "Asia/Manila",
  CN: "Asia/Shanghai",   HK: "Asia/Hong_Kong",   TW: "Asia/Taipei",
  JP: "Asia/Tokyo",      KR: "Asia/Seoul",        MN: "Asia/Ulaanbaatar",
  // Americas
  US: "America/New_York",  CA: "America/Toronto", MX: "America/Mexico_City",
  GT: "America/Guatemala", HN: "America/Tegucigalpa", SV: "America/El_Salvador",
  NI: "America/Managua",  CR: "America/Costa_Rica", PA: "America/Panama",
  CU: "America/Havana",   DO: "America/Santo_Domingo", PR: "America/Puerto_Rico",
  CO: "America/Bogota",   VE: "America/Caracas",  EC: "America/Guayaquil",
  PE: "America/Lima",     BO: "America/La_Paz",   PY: "America/Asuncion",
  AR: "America/Argentina/Buenos_Aires", UY: "America/Montevideo",
  BR: "America/Sao_Paulo", CL: "America/Santiago",
  // Africa
  EG: "Africa/Cairo",    LY: "Africa/Tripoli",   TN: "Africa/Tunis",
  DZ: "Africa/Algiers",  MA: "Africa/Casablanca", SN: "Africa/Dakar",
  GH: "Africa/Accra",    NG: "Africa/Lagos",      CM: "Africa/Douala",
  KE: "Africa/Nairobi",  ET: "Africa/Addis_Ababa", TZ: "Africa/Dar_es_Salaam",
  UG: "Africa/Kampala",  RW: "Africa/Kigali",     ZA: "Africa/Johannesburg",
  // Oceania
  AU: "Australia/Sydney", NZ: "Pacific/Auckland",
};

const _tzCache = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "getTimezone") return false;

  const city = String(msg.city || "").trim();
  const countryCode = String(msg.countryCode || "").trim().toUpperCase();

  // No city — return country default timezone (for "Not specified" profiles)
  if (!city) {
    const tz = countryCode ? (COUNTRY_DEFAULT_TZ[countryCode] || null) : null;
    sendResponse({ timezone: tz });
    return true;
  }

  const cacheKey = `${countryCode}|${city.toLowerCase()}`;
  if (_tzCache.has(cacheKey)) {
    sendResponse({ timezone: _tzCache.get(cacheKey) });
    return true;
  }

  (async () => {
    try {
      const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
      url.searchParams.set("name", city);
      url.searchParams.set("count", "10");
      url.searchParams.set("language", "en");
      url.searchParams.set("format", "json");
      // Always pass countryCode when we have it — Open Meteo uses it as a hint
      if (countryCode) url.searchParams.set("countryCode", countryCode);

      const resp = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      if (resp.ok) {
        const data = await resp.json();
        const results = Array.isArray(data?.results) ? data.results : [];

        // Strict country filter first
        let candidates = countryCode
          ? results.filter(r => String(r?.country_code || "").toUpperCase() === countryCode)
          : results;

        // If strict filter gave nothing, retry without countryCode param
        if (!candidates.length && countryCode) {
          const url2 = new URL("https://geocoding-api.open-meteo.com/v1/search");
          url2.searchParams.set("name", city);
          url2.searchParams.set("count", "10");
          url2.searchParams.set("language", "en");
          url2.searchParams.set("format", "json");
          const resp2 = await fetch(url2.toString(), { headers: { Accept: "application/json" } });
          if (resp2.ok) {
            const data2 = await resp2.json();
            const results2 = Array.isArray(data2?.results) ? data2.results : [];
            candidates = results2.filter(r => String(r?.country_code || "").toUpperCase() === countryCode);
          }
        }

        if (candidates.length) {
          const tz = String(candidates[0].timezone || "");
          if (tz) {
            _tzCache.set(cacheKey, tz);
            sendResponse({ timezone: tz });
            return;
          }
        }
      }

      // Geocoding failed or no results — fall back to country default
      const fallback = countryCode ? (COUNTRY_DEFAULT_TZ[countryCode] || null) : null;
      if (fallback) _tzCache.set(cacheKey, fallback);
      sendResponse({ timezone: fallback });
    } catch {
      const fallback = countryCode ? (COUNTRY_DEFAULT_TZ[countryCode] || null) : null;
      sendResponse({ timezone: fallback });
    }
  })();
  return true;
});
