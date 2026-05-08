// ── Защита от двойной загрузки (Bug #1) ─────────────────────────────────────
const __ADGM_VERSION__ = "adgm-gallery-marker-2026-05-07";
if (window.__ADGM_LOADED_VERSION__ === __ADGM_VERSION__) {
  // Уже загружена актуальная версия — выходим
} else {
  // Убиваем старую версию (если была)
  if (window.__ADGM_LOADED_VERSION__) {
    window.dispatchEvent(new CustomEvent("__ADGM_SHUTDOWN__", { detail: { version: __ADGM_VERSION__ } }));
  }
  window.__ADGM_LOADED_VERSION__ = __ADGM_VERSION__;

(() => {
  "use strict";

  // Слушаем сигнал завершения от более новой версии
  const __adgmShutdownHandler__ = (ev) => {
    if (ev.detail?.version !== __ADGM_VERSION__) {
      window.removeEventListener("__ADGM_SHUTDOWN__", __adgmShutdownHandler__);
      // Отключаем глобальный наблюдатель если он есть
      try { __adgmGlobalObserver__?.disconnect(); } catch {}
      window.__ADGM_LOADED_VERSION__ = null;
    }
  };
  window.addEventListener("__ADGM_SHUTDOWN__", __adgmShutdownHandler__);
  let __adgmGlobalObserver__ = null;

  const t = "adgm",
    e = `${t}-styles`,
    n = `${t}-btn`,
    r = `${t}-badge`,
    o = `${t}-is-sent`,
    i = `${t}-filter-hide-sent`,
    a = `${t}-filter-only-sent`,
    l = `${t}-help-btn`,
    s = `${t}-help-popover`,
    c = `${t}-help-close`,
    selectedCounter = `${t}-selected-counter`,
    VIEW_MARKER_CLS = `${t}-view-marker`,
    BULK_TRASH_BTN_CLS = `${t}-bulk-trash-btn`,
    DELETED_HIDE_CLS = `${t}-deleted-hide`,
    d = "",
    u =
      '\n    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">\n      <path fill="currentColor" d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/>\n    </svg>\n  ',
    p = {
      chatSent: new Set(),
      letterSent: new Set(),
      // Map<content_id_string, boolean> — просмотрено ли (payed)
      readStatusByContentId: new Map(),
      // Map<url_or_filename_string, boolean> — для матчинга без content_id
      readStatusByMediaKey: new Map(),
      // Set<content_id_string> — удалённые через Bulk Delete
      deletedIds: new Set(),
      lastChatId: null,
      listObserver: null,
      listObservedEl: null,
      applyRunning: !1,
      applyScheduled: !1,
      modalScanScheduled: !1,
      modalRoot: null,
      modalSession: 0,
      dataStatus: "idle",
      filterMode: 0,
      refreshInFlight: !1,
      helpPopover: null,
      helpAnchor: null,
      helpListeners: null,
    },
    h = (...e) => console.debug(`[${t}]`, ...e);
  function f() {
    if (document.getElementById(e)) return;
    const t = document.createElement("style");
    ((t.id = e),
      (t.textContent = `\n      .${n} {\n        margin-left: 8px;\n        height: 22px;\n        padding: 0 8px;\n        border-radius: 6px;\n        border: 1px solid rgba(255,255,255,.18);\n        background: rgba(255,255,255,.06);\n        color: inherit;\n        font: inherit;\n        font-size: 12px;\n        line-height: 20px;\n        display: inline-flex;\n        align-items: center;\n        gap: 6px;\n        cursor: pointer;\n        user-select: none;\n      }\n      .${n}:hover { background: rgba(255,255,255,.10); }\n      .${n}:active { transform: translateY(1px); }\n      .${n}[disabled] { opacity: .6; cursor: progress; }\n\n      .${r} {\n        display: inline-flex;\n        align-items: center;\n        justify-content: center;\n        height: 18px;\n        padding: 0 6px;\n        margin-right: 6px;\n        border-radius: 4px;\n        border: 1px solid rgba(255, 40, 40, .70);\n        background: rgba(255, 40, 40, .12);\n        color: rgba(255, 70, 70, .98);\n        font-size: 12px;\n        font-weight: 700;\n        line-height: 16px;\n        letter-spacing: .2px;\n        white-space: nowrap;\n        pointer-events: none; /* don't block clicks on trash icon */\n        gap: 4px;\n      }\n\n\n      .${l} {\n        margin-left: 12px;\n        margin-right: 6px;\n\n        width: 20px;\n        height: 20px;\n        padding: 0;\n        border: none;\n        background: transparent;\n        color: #2f80ff !important;\n\n        display: inline-flex;\n        align-items: center;\n        justify-content: center;\n        cursor: pointer;\n        user-select: none;\n\n        position: relative;\n        z-index: 50;\n        pointer-events: auto !important;\n        flex: 0 0 auto;\n      }\n      .${l}:hover {\n        color: #2f80ff !important;\n        background: rgba(255,255,255,.10);\n        border-radius: 999px;\n      }\n      .${l} svg {\n        width: 18px;\n        height: 18px;\n        display: block;\n        pointer-events: none;\n      }\n      .${l}:active { transform: translateY(1px); }\n\n      .${l} + .${n} { margin-left: 0 !important; }\n\n      .${s} {\n        position: fixed;\n        z-index: 2147483647;\n        width: 280px;\n        max-width: calc(100vw - 16px);\n        background: rgba(20,20,20,.96);\n        color: #fff;\n        border: 1px solid rgba(255,255,255,.12);\n        border-radius: 10px;\n        box-shadow: 0 12px 32px rgba(0,0,0,.45);\n        padding: 12px;\n        font-size: 12px;\n        line-height: 16px;\n      }\n      .${s} a {\n        color: #fff;\n        text-decoration: underline;\n        word-break: break-all;\n      }\n      .${c} {\n        position: absolute;\n        top: 6px;\n        right: 6px;\n        width: 22px;\n        height: 22px;\n        padding: 0;\n        border-radius: 8px;\n        border: 1px solid rgba(255,255,255,.14);\n        background: rgba(255,255,255,.06);\n        color: inherit;\n        font: inherit;\n        font-size: 14px;\n        line-height: 20px;\n        display: inline-flex;\n        align-items: center;\n        justify-content: center;\n        cursor: pointer;\n      }\n      .${c}:hover { background: rgba(255,255,255,.10); }\n      .${c}:active { transform: translateY(1px); }\n\n      .${i} .${o} {\n        display: none !important;\n      }\n      .${a} .upload_popup_tabs_content_item:not(.${o}),\n      .${a} .upload_popup_tabs_content_audio_item:not(.${o}) {\n        display: none !important;\n      }\n\n      .${selectedCounter} {\n        position: absolute;\n        bottom: 20px;\n        right: 300px;\n        padding: 10px 20px;\n        background: #4A90E2;\n        color: #fff;\n        border-radius: 8px;\n        font-size: 14px;\n        font-weight: 500;\n        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);\n        pointer-events: none;\n        z-index: 100;\n        display: none;\n        align-items: center;\n        gap: 8px;\n        transition: all 0.2s ease;\n        letter-spacing: 0.3px;\n        white-space: nowrap;\n      }\n      .${selectedCounter}.visible {\n        display: flex;\n      }\n      .${selectedCounter}::before {\n        content: "";\n      }\n\n      /* ── View Marker ── */\n      .${VIEW_MARKER_CLS} {\n        display: inline-flex;\n        align-items: center;\n        gap: 3px;\n        height: 18px;\n        padding: 0 5px;\n        margin-right: 4px;\n        border-radius: 4px;\n        font-size: 11px;\n        font-weight: 600;\n        line-height: 16px;\n        white-space: nowrap;\n        pointer-events: none;\n        user-select: none;\n      }\n      .${VIEW_MARKER_CLS}[data-view-state="1"] {\n        border: 1px solid rgba(40,200,80,.70);\n        background: rgba(40,200,80,.12);\n        color: rgba(30,180,60,.98);\n      }\n      .${VIEW_MARKER_CLS}[data-view-state="0"] {\n        border: 1px solid rgba(200,80,40,.70);\n        background: rgba(200,80,40,.12);\n        color: rgba(200,70,30,.98);\n      }\n      .${VIEW_MARKER_CLS} svg {\n        width: 12px;\n        height: 12px;\n        flex-shrink: 0;\n      }\n\n      /* ── Bulk Trash Button ── */\n      .${BULK_TRASH_BTN_CLS} {\n        margin-left: 6px;\n        height: 22px;\n        padding: 0 8px;\n        border-radius: 6px;\n        border: 1px solid rgba(255,80,80,.40);\n        background: rgba(255,80,80,.08);\n        color: rgba(255,90,90,.95);\n        font: inherit;\n        font-size: 12px;\n        line-height: 20px;\n        display: inline-flex;\n        align-items: center;\n        gap: 5px;\n        cursor: pointer;\n        user-select: none;\n      }\n      .${BULK_TRASH_BTN_CLS}:hover { background: rgba(255,80,80,.18); }\n      .${BULK_TRASH_BTN_CLS}:active { transform: translateY(1px); }\n      .${BULK_TRASH_BTN_CLS}[disabled] { opacity: .5; cursor: progress; }\n      .${BULK_TRASH_BTN_CLS} svg {\n        width: 13px;\n        height: 13px;\n        pointer-events: none;\n      }\n\n      /* ── Deleted items ── */\n      .${DELETED_HIDE_CLS} {\n        display: none !important;\n      }\n    `),
      document.documentElement.appendChild(t));
  }
  function m() {
    return (function (t) {
      if (!t) return null;
      let e = String(t).trim();
      try {
        ((e.startsWith('"') && e.endsWith('"')) ||
          (e.startsWith("'") && e.endsWith("'"))) &&
          (e = JSON.parse(e));
      } catch {}
      try {
        if (e.startsWith("{") && e.endsWith("}")) {
          const t = JSON.parse(e);
          t && "string" == typeof t.token && (e = t.token);
        }
      } catch {}
      return (
        (e = String(e).trim()),
        e
          ? (e.toLowerCase().startsWith("bearer ") && (e = e.slice(7).trim()),
            e || null)
          : null
      );
    })(
      window.localStorage?.getItem("token") ??
        window.sessionStorage?.getItem("token"),
    );
  }
  function g(t) {
    return new URL(t, location.origin).toString();
  }
  function b() {
    try {
      if (crypto?.randomUUID) return crypto.randomUUID();
    } catch {}
    return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
  }
  async function y(t, e, n = 2e4) {
    const r = new AbortController(),
      o = setTimeout(() => r.abort("timeout"), n);
    try {
      return await fetch(t, { ...e, signal: r.signal });
    } finally {
      clearTimeout(o);
    }
  }
  async function S() {
    const t = (function () {
      const t = String(location.pathname || "").match(/^\/chat\/([^\/?#]+)/i);
      return t ? decodeURIComponent(t[1]) : null;
    })();
    if (t) return t;
    const e = (function () {
      const t = document.querySelector('[data-testid="chat-header"]');
      if (!t) return null;
      const e = t.querySelector('[data-testid="man-external_id"]'),
        n = t.querySelector('[data-testid="woman-external_id"]'),
        r = e?.textContent || "",
        o = n?.textContent || "",
        i = r.match(/ID\s*(\d+)/i),
        a = o.match(/ID\s*(\d+)/i);
      return i && a ? { maleId: i[1], femaleId: a[1] } : null;
    })();
    if (!e) throw new Error("Не удалось определить chat_id");
    const n = m();
    if (!n) throw new Error("Не найден token");
    const r = g(
        `/api/operator/chatWithProfile?male_id=${encodeURIComponent(e.maleId)}&female_id=${encodeURIComponent(e.femaleId)}`,
      ),
      o = await y(r, {
        method: "GET",
        headers: {
          accept: "application/json, text/plain, */*",
          authorization: `Bearer ${n}`,
          "x-request-id": b(),
          "access-control-allow-headers":
            '"Origin, X-Requested-With, Content-Type, Accept"',
          "access-control-allow-methods": "GET,PUT,POST,DELETE",
          "access-control-allow-origin": "*",
          "x-requested-with": "XMLHttpRequest",
          "cache-control": "no-cache",
          pragma: "no-cache",
        },
        credentials: "include",
        cache: "no-store",
      });
    if (!o.ok) throw new Error(`chatWithProfile вернул HTTP ${o.status}`);
    const i = await o.json().catch(() => null),
      a = i?.chat_uid;
    if (!a) throw new Error("В ответе chatWithProfile нет chat_uid.");
    return a;
  }
  function v(t) {
    return {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json",
      authorization: `Bearer ${t}`,
      "access-control-allow-headers":
        '"Origin, X-Requested-With, Content-Type, Accept"',
      "access-control-allow-methods": "GET,PUT,POST,DELETE",
      "access-control-allow-origin": "*",
      "x-requested-with": "XMLHttpRequest",
      "cache-control": "no-cache",
      pragma: "no-cache",
    };
  }
  async function w(t, e) {
    const n = m();
    if (!n) throw new Error("Не найден token.");
    const r = g(t),
      o = await y(r, {
        method: "POST",
        headers: v(n),
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(e),
      });
    if (!o.ok) {
      const e = await o.text().catch(() => "");
      throw new Error(
        `${t} вернул HTTP ${o.status}${e ? `: ${e.slice(0, 200)}` : ""}`,
      );
    }
    const i = await o.text();
    if (!i) return null;
    try {
      return JSON.parse(i);
    } catch {
      throw new Error(`${t} вернул не-JSON ответ: ${i.slice(0, 200)}`);
    }
  }
  function x(t) {
    return t?.querySelector(".attach_new_popup_tab_content_top_sort");
  }
  function $(t) {
    return t?.querySelector('[data-testid="file-list"]');
  }
  // Bug #2 fix: input[data-contentid] — первичный ключ (это реальный content_id из API).
  // data-id — это внутренний UI-идентификатор, он может не совпадать с content_id.
  function _(t) {
    if (!t) return null;
    // Сначала ищем реальный content_id через чекбокс
    const n = t.querySelector("input[data-contentid]"),
      r = n?.getAttribute("data-contentid");
    if (r) return String(r);
    // Fallback: data-id (только если нет чекбокса)
    const e = t.getAttribute("data-id");
    return e ? String(e) : null;
  }
  function E(t) {
    const e = p.chatSent.has(t),
      n = p.letterSent.has(t);
    return e && n ? "CL" : e ? "C" : n ? "L" : null;
  }

  // ── SVG иконки для view-marker ──────────────────────────────
  const SVG_EYE_OPEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>';
  const SVG_EYE_OFF  = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>';

  /**
   * Определяет статус просмотра для DOM-элемента медиа.
   * Матчинг по нескольким ключам: content_id, URL, popup-URL, thumbnail, filename.
   * @returns {boolean|null} true=просмотрено, false=не просмотрено, null=нет данных
   */
  function getViewedStatus(el) {
    if (!el) return null;
    const { readStatusByContentId: byId, readStatusByMediaKey: byKey } = p;
    if (!byId.size && !byKey.size) return null;

    // 1. По content_id (самый надёжный)
    const cid = _(el);
    if (cid != null && byId.has(cid)) return byId.get(cid);

    // 2. По data-contentid на чекбоксе
    const cbCid = el.querySelector("input[data-contentid]")?.getAttribute("data-contentid");
    if (cbCid && byId.has(cbCid)) return byId.get(cbCid);

    // 3. По URL/thumbnail/filename из атрибутов элемента
    function checkAttr(node, ...attrs) {
      for (const attr of attrs) {
        const v = node?.getAttribute(attr);
        if (!v) continue;
        if (byKey.has(v)) return byKey.get(v);
        // Имя файла из URL
        try {
          const fname = new URL(v, location.origin).pathname.split("/").pop();
          if (fname && byKey.has(fname)) return byKey.get(fname);
        } catch {}
      }
      return undefined;
    }

    // Bug #3 fix: переименовано v → attrVal чтобы не затенять внешнюю функцию v()
    function checkAttr(node, ...attrs) {
      for (const attr of attrs) {
        const attrVal = node?.getAttribute(attr);
        if (!attrVal) continue;
        if (byKey.has(attrVal)) return byKey.get(attrVal);
        // Имя файла из URL
        try {
          const fname = new URL(attrVal, location.origin).pathname.split("/").pop();
          if (fname && byKey.has(fname)) return byKey.get(fname);
        } catch {}
      }
      return undefined;
    }

    // img/video src, data-src, data-url, data-popup-url, data-thumb
    for (const child of el.querySelectorAll("img, video, [data-src], [data-url], [data-popup-url], [data-thumb]")) {
      const res = checkAttr(child, "src", "data-src", "data-url", "data-popup-url", "data-thumb", "poster");
      if (res !== undefined) return res;
    }

    // Атрибуты самого элемента
    const res2 = checkAttr(el, "data-src", "data-url", "data-popup-url", "data-thumb", "data-filename");
    if (res2 !== undefined) return res2;

    return null;
  }

  /**
   * Добавляет/обновляет div.adgm-view-marker на элементе медиа.
   * isViewed: true → иконка глаза (просмотрено)
   *           false → иконка глаза с перечёркиванием + текст "Unviewed"
   *           null → удаляет маркер
   */
  function ce(element, isViewed) {
    if (!element) return;
    let marker = element.querySelector(`.${VIEW_MARKER_CLS}`);

    if (isViewed === null || isViewed === undefined) {
      marker && marker.remove();
      return;
    }

    if (!marker) {
      marker = document.createElement("div");
      marker.className = VIEW_MARKER_CLS;
      // Вставляем рядом с badge (если есть) или в bottom-контейнер
      const badge = element.querySelector(`.${r}`);
      if (badge && badge.parentElement) {
        badge.parentElement.insertBefore(marker, badge);
      } else {
        const bottom = element.querySelector(
          ".upload_popup_tabs_content_item_bottom, .popup_audio_item_bottom"
        ) || element;
        bottom.appendChild(marker);
      }
    }

    const newState = isViewed ? "1" : "0";
    if (marker.getAttribute("data-view-state") === newState) return; // без лишних перерисовок

    marker.setAttribute("data-view-state", newState);
    if (isViewed) {
      marker.innerHTML = SVG_EYE_OPEN;
      marker.title = "Просмотрено";
    } else {
      marker.innerHTML = SVG_EYE_OFF ;
      marker.title = "Не просмотрено";
    }
  }
  
  function L(t, e) {
    const n = t.querySelector(`.${r}`);
    if (!e) return (n && n.remove(), void t.classList.remove(o));
    t.classList.contains(o) || t.classList.add(o);
    
    const i = `${e}`;
    let a = n;
    if (!a) {
      ((a = document.createElement("span")), (a.className = r));
      const e = t.querySelector(".popup_trash, .popup_audio_item_delete");
      if (e && e.parentElement) e.parentElement.insertBefore(a, e);
      else {
        (
          t.querySelector(
            ".upload_popup_tabs_content_item_bottom, .popup_audio_item_bottom",
          ) || t
        ).appendChild(a);
      }
    }
    
    // Обновляем текст бейджа
    if (a.textContent !== i) {
      a.textContent = i;
    }
    
    (a.getAttribute("data-label") !== e && a.setAttribute("data-label", e));
    const l =
      "C" === e
        ? "отправлено в Chat"
        : "L" === e
          ? "отправлено в Letter"
          : "отправлено в Chat и Letter";
    a.getAttribute("title") !== l && a.setAttribute("title", l);
  }
  function C(t) {
    t &&
      (p.applyScheduled ||
        ((p.applyScheduled = !0),
        requestAnimationFrame(() => {
          p.applyScheduled = !1;
          if (!(p.chatSent.size || p.letterSent.size || p.readStatusByContentId.size || p.deletedIds.size)) return;
          // Bug #4 fix: если батч уже выполняется — перепланируем вместо молчаливого дропа
          if (p.applyRunning) { C(t); return; }
          (async function (t) {
            p.applyRunning = !0;
            try {
              const e = $(t);
              if (!e) return;
              const n = Array.from(
                  e.querySelectorAll(
                    ".upload_popup_tabs_content_item[data-id], .upload_popup_tabs_content_audio_item[data-id]",
                  ),
                ),
                batchSize = 60;
              for (let t = 0; t < n.length; t++) {
                const el = n[t],
                  cid = _(el);

                // Скрываем удалённые
                if (cid && p.deletedIds.has(cid)) {
                  el.classList.add(DELETED_HIDE_CLS);
                  const cb = el.querySelector("input[data-contentid]");
                  if (cb) cb.disabled = true;
                  continue;
                }

                // Бейдж отправки (C/L/CL)
                if (cid) L(el, E(cid));

                // Метка просмотра
                const viewed = getViewedStatus(el);
                ce(el, viewed);

                if (t > 0 && t % batchSize === 0)
                  await new Promise((r) => requestAnimationFrame(() => r()));
              }
            } finally {
              p.applyRunning = !1;
            }
          })(t);
        })));
  }
  function A(t) {
    const e = $(t);
    if (!e) return;
    if (p.listObserver && p.listObservedEl === e) return;
    if (p.listObserver) {
      try {
        p.listObserver.disconnect();
      } catch {}
      p.listObserver = null;
    }
    p.listObservedEl = e;
    const n = new MutationObserver((e) => {
      if (p.chatSent.size || p.letterSent.size || p.readStatusByContentId.size || p.deletedIds.size)
        for (const n of e)
          if (
            "childList" === n.type &&
            (n.addedNodes?.length || n.removedNodes?.length)
          ) {
            C(t);
            break;
          }
    });
    (n.observe(e, { childList: !0, subtree: !0 }), (p.listObserver = n));
  }
  function q(t) {
    const e = $(t);
    e &&
      (e.classList.remove(i, a),
      1 === p.filterMode && e.classList.add(i),
      2 === p.filterMode && e.classList.add(a));
  }
  function k(t) {
    if (!t) return;
    const e = p.chatSent.size,
      n = p.letterSent.size,
      r =
        1 === (o = p.filterMode) ? "Hide Sent" : 2 === o ? "Only Sent" : "All";
    var o;
    if ("loading" === p.dataStatus) {
      (t.disabled || (t.disabled = !0),
        "loading" !== t.dataset.state && (t.dataset.state = "loading"),
        "..." !== t.textContent && (t.textContent = "..."));
      const e = "Загружаю отправленные медиа...";
      return void (t.title !== e && (t.title = e));
    }
    t.disabled && (t.disabled = !1);
    const i = p.dataStatus;
    t.dataset.state !== i && (t.dataset.state = i);
    const a = `${r} - (Chat ${e} / Letter ${n})`;
    t.textContent !== a && (t.textContent = a);
    const l = `${1 === p.filterMode ? "Скрыты отправленные" : 2 === p.filterMode ? "Показываются только отправленные" : "Показываются все"}. Chat=${e}, Letter=${n}.`;
    t.title !== l && (t.title = l);
  }
  async function M(e, r) {
    if (p.refreshInFlight) return;
    ((p.refreshInFlight = !0), (p.dataStatus = "loading"), k(r));
    const o = p.modalSession;
    try {
      const t = await S(),
        {
          chatSet: i,
          letterSet: a,
          chatJson: l,
          letterJson: s,
          readById,   // Bug #10 fix: были не деструктурированы → ReferenceError
          readByKey,  // Bug #10 fix: были не деструктурированы → ReferenceError
        } = await (async function (t) {
          const [e, n] = await Promise.all([
              w("/api/chatList/operatorMedia", { chat_id: t }),
              w("/api/chatList/operatorMediaLetters", { chat_id: t }),
            ]),
            r = new Set(),
            o = new Set(),
            // readStatus maps — строятся из поля payed
            readById = new Map(),
            readByKey = new Map();

          // Вспомогательная функция: извлекает все URL/имена файла из записи
          function extractMediaKeys(item) {
            const keys = [];
            // Прямые URL-поля
            for (const field of ["link", "url", "src", "file_url", "content_url", "thumb", "thumbnail", "thumb_url"]) {
              const v = item[field];
              if (v && typeof v === "string") {
                keys.push(v);
                // Имя файла из URL
                try {
                  const fname = new URL(v, location.origin).pathname.split("/").pop();
                  if (fname) keys.push(fname);
                } catch {}
              }
            }
            // Имя файла напрямую
            for (const field of ["filename", "file_name", "name", "original_name"]) {
              const v = item[field];
              if (v && typeof v === "string") keys.push(v);
            }
            return keys;
          }

          if (e?.status && Array.isArray(e.response))
            for (const item of e.response)
              if (1 !== Number(item?.is_male) && null != item?.content_id) {
                const cid = String(item.content_id);
                r.add(cid);
                // payed: 1 = просмотрено, 0 = нет
                const viewed = Number(item.payed) === 1;
                readById.set(cid, viewed);
                for (const k of extractMediaKeys(item)) readByKey.set(k, viewed);
              }

          if (n?.status && Array.isArray(n.response))
            for (const item of n.response)
              if (1 !== Number(item?.is_male) && null != item?.content_id) {
                const cid = String(item.content_id);
                o.add(cid);
                const viewed = Number(item.payed) === 1;
                // Не перезаписываем если уже есть из chat (chat приоритетнее)
                if (!readById.has(cid)) readById.set(cid, viewed);
                for (const k of extractMediaKeys(item)) {
                  if (!readByKey.has(k)) readByKey.set(k, viewed);
                }
              }

          return { chatSet: r, letterSet: o, chatJson: e, letterJson: n, readById, readByKey };
        })(t);
      if (o !== p.modalSession) return;
      ((p.chatSent = i),
        (p.letterSent = a),
        (p.lastChatId = t),
        (p.readStatusByContentId = readById),
        (p.readStatusByMediaKey = readByKey),
        (p.dataStatus = "ready"));
      (k(x(e)?.querySelector(`.${n}`) || r),
        C(e),
        A(e),
        q(e),
        h("Refreshed for chat:", t, "Chat:", i.size, "Letter:", a.size),
        l && !1 === l.status && h("operatorMedia status=false payload:", l),
        s &&
          !1 === s.status &&
          h("operatorMediaLetters status=false payload:", s));
    } catch (o) {
      (console.error(`[${t}]`, o), (p.dataStatus = "idle"));
      const i = x(e)?.querySelector(`.${n}`) || r;
      i &&
        ((i.disabled = !1),
        (i.dataset.state = "error"),
        (i.textContent = "C/L !"),
        (i.title = `${t}: ${o?.message || o}`));
    } finally {
      p.refreshInFlight = !1;
    }
  }
  function I() {
    const t = p.helpPopover,
      e = p.helpAnchor;
    if (!t || !e) return;
    const n = e.getBoundingClientRect(),
      r = t.getBoundingClientRect(),
      o = document.documentElement.clientWidth || window.innerWidth,
      i = document.documentElement.clientHeight || window.innerHeight;
    let a = n.left,
      l = n.bottom + 8;
    (a + r.width > o - 8 && (a = o - r.width - 8),
      a < 8 && (a = 8),
      l + r.height > i - 8 && (l = n.top - r.height - 8),
      l < 8 && (l = 8),
      (t.style.left = `${Math.round(a)}px`),
      (t.style.top = `${Math.round(l)}px`));
  }
  function O() {
    const t = p.helpPopover;
    if (!t) return;
    try {
      t.remove();
    } catch {}
    ((p.helpPopover = null), (p.helpAnchor = null));
    const e = p.helpListeners;
    if (e) {
      try {
        document.removeEventListener("pointerdown", e.onDocPointerDown, !0);
      } catch {}
      try {
        document.removeEventListener("keydown", e.onKeyDown, !0);
      } catch {}
      try {
        window.removeEventListener("resize", e.onReposition, !0);
      } catch {}
      try {
        window.removeEventListener("scroll", e.onReposition, !0);
      } catch {}
      p.helpListeners = null;
    }
  }
  function P(t) {
    O();
    const e = (function () {
      const t = document.createElement("div");
      return (
        (t.className = s),
        t.setAttribute("role", "dialog"),
        t.setAttribute("aria-label", "Справка Gallery Sent Marker"),
        (t.innerHTML = `\n      <button type="button" class="${c}" aria-label="Закрыть">×</button>\n      <div style="font-weight:800; margin-right:26px; margin-bottom:8px;">Справка Gallery Sent Marker</div>\n      <div style="display:flex; flex-direction:column; gap:4px; margin-bottom:10px;">\n        <div><b>C</b> — отправлено в Chat</div>\n        <div><b>L</b> — отправлено в Letter</div>\n        <div><b>CL</b> — отправлено в Chat и Letter</div>\n      </div>\n      <div style="margin-bottom:10px;">\n        Кнопка переключает фильтр:\n\t\t<div><b>All</b> - отображается вся медийка</div>\n\t\t<div><b>Hide Sent</b> - скрывает уже отправленное</div>\n\t\t<div><b>Only Sent</b> - отображает только отправленное</div>\n      </div>\n      <div style="margin-bottom:10px;">\n\t<b>Важно</b>: расширение подсвечивает только те медиа которые есть в галерее на момент проверки и не были перезалиты после отправки.   \n      </div>\n      <div style="margin-bottom:10px;">\n        \n\t\t<div><a href="${d}" target="_blank" rel="noopener noreferrer">${d}</a></div>\n      </div>\n    `),
        t
      );
    })();
    (document.body.appendChild(e), (p.helpPopover = e), (p.helpAnchor = t));
    const n = e.querySelector(`.${c}`);
    n?.addEventListener("click", (t) => {
      (t.preventDefault(), t.stopPropagation(), O());
    });
    const r = (t) => {
        const e = p.helpPopover,
          n = p.helpAnchor;
        if (!e || !n) return;
        const r = t.target;
        (r && (e.contains(r) || n.contains(r))) || O();
      },
      o = (t) => {
        "Escape" === t.key && O();
      },
      i = () => I();
    ((p.helpListeners = { onDocPointerDown: r, onKeyDown: o, onReposition: i }),
      document.addEventListener("pointerdown", r, !0),
      document.addEventListener("keydown", o, !0),
      window.addEventListener("resize", i, !0),
      window.addEventListener("scroll", i, !0),
      requestAnimationFrame(() => I()));
  }
  function R(t) {
    if (!t) return null;
    f();
    const e = x(t);
    if (!e) return null;
    const r = Array.from(e.querySelectorAll(`.${l}`));
    if (r.length > 1)
      for (let t = 1; t < r.length; t++)
        try {
          r[t].remove();
        } catch {}
    let o = r[0] || e.querySelector(`.${l}`);
    if (
      (o ||
        ((o = document.createElement("button")),
        (o.type = "button"),
        (o.className = l),
        (o.title = "Справка Gallery Sent Marker"),
        o.setAttribute("aria-label", "Справка Gallery Sent Marker")),
      "1" !== o.dataset.adgmIcon &&
        ((o.dataset.adgmIcon = "1"), (o.innerHTML = u)),
      "1" !== o.dataset.adgmBound)
    ) {
      o.dataset.adgmBound = "1";
      const t = (t) => {
        try {
          t.stopPropagation();
        } catch {}
        try {
          t.stopImmediatePropagation();
        } catch {}
      };
      (o.addEventListener("pointerdown", t, !0),
        o.addEventListener("mousedown", t, !0),
        o.addEventListener(
          "click",
          (e) => {
            try {
              e.preventDefault();
            } catch {}
            var n;
            (t(e), (n = o), p.helpPopover ? O() : P(n));
          },
          !0,
        ));
    }
    const i = e.querySelector(`.${n}`),
      a = e.querySelector("span");
    return (
      i && o.nextElementSibling !== i
        ? e.insertBefore(o, i)
        : !i && a && a.nextElementSibling !== o
          ? a.insertAdjacentElement("afterend", o)
          : i || a || e.appendChild(o),
      o
    );
  }
  function z(t) {
    if (!t) return null;
    f();
    const e = x(t);
    if (!e) return null; // Bug #11 fix: было `return;` (undefined), теперь явный null
    const r = Array.from(e.querySelectorAll(`.${n}`));
    if (r.length > 1)
      for (let t = 1; t < r.length; t++)
        try {
          r[t].remove();
        } catch {}
    let o = r[0] || null;
    return (
      o ||
        ((o = document.createElement("button")),
        (o.type = "button"),
        (o.className = n),
        e.appendChild(o)),
      "1" !== o.dataset.adgmBound &&
        ((o.dataset.adgmBound = "1"),
        o.addEventListener("click", () =>
          (function (t) {
            ((p.filterMode = (p.filterMode + 1) % 3), q(t));
            const e = x(t)?.querySelector(`.${n}`);
            k(e);
          })(t),
        )),
      o.parentElement !== e && e.appendChild(o),
      o
    );
  }
  // ══════════════════════════════════════════════════════════════
  // BULK DELETE — кнопка корзины
  // ══════════════════════════════════════════════════════════════

  /** SVG иконка корзины */
  const SVG_TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';

  /**
   * Создаёт/обновляет кнопку Bulk Delete рядом с кнопкой фильтра.
   * Bug #8 fix: проверяем флаг на toolbar чтобы не делать querySelector на каждый MO-тик.
   */
  function buildBulkTrashBtn(modalRoot) {
    if (!modalRoot) return null;
    const toolbar = x(modalRoot);
    if (!toolbar) return null;
    // Уже создана — выходим без лишних querySelector
    if (toolbar.dataset.adgmTrashBound === "1") return toolbar.querySelector(`.${BULK_TRASH_BTN_CLS}`);

    let btn = toolbar.querySelector(`.${BULK_TRASH_BTN_CLS}`);
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = BULK_TRASH_BTN_CLS;
      btn.title = "Удалить выбранные медиа";
      btn.setAttribute("aria-label", "Bulk Delete");
      btn.innerHTML = SVG_TRASH + '<span>Delete</span>';

      // Вставляем после кнопки фильтра
      const filterBtn = toolbar.querySelector(`.${n}`);
      if (filterBtn && filterBtn.parentElement) {
        filterBtn.insertAdjacentElement("afterend", btn);
      } else {
        toolbar.appendChild(btn);
      }

      btn.addEventListener("click", () => doBulkDelete(modalRoot));
    }
    toolbar.dataset.adgmTrashBound = "1";
    return btn;
  }

  /**
   * Выполняет массовое удаление отмеченных медиа.
   */
  async function doBulkDelete(modalRoot) {
    if (!modalRoot) return;

    // Собираем все отмеченные чекбоксы с data-contentid
    const checked = Array.from(
      modalRoot.querySelectorAll('input[type="checkbox"][data-contentid]:checked')
    );

    if (!checked.length) {
      alert("Нет выбранных файлов.");
      return;
    }

    if (!confirm(`Удалить ${checked.length} файл(ов)? Это действие необратимо.`)) return;

    // Определяем woman_id из DOM
    const womanEl = document.querySelector('[data-testid="woman-external_id"]');
    const womanIdMatch = womanEl?.textContent?.match(/\d+/);
    const womanId = womanIdMatch ? womanIdMatch[0] : null;

    if (!womanId) {
      alert("Не удалось определить woman_id. Удаление отменено.");
      return;
    }

    const btn = modalRoot.querySelector(`.${BULK_TRASH_BTN_CLS}`);
    if (btn) btn.disabled = true;

    let deletedCount = 0;
    const errors = [];

    for (const cb of checked) {
      const contentId = cb.getAttribute("data-contentid");
      if (!contentId) continue;

      try {
        await w("/api/files/deleteMedia", {
          content_id: contentId,
          user_id: womanId,
        });

        // Bug #5 fix: убран [data-id] фильтр — closest() ищет по классу элемента,
        // не по атрибуту, который может отсутствовать или не совпадать с content_id
        const item = cb.closest(
          ".upload_popup_tabs_content_item, .upload_popup_tabs_content_audio_item"
        );
        if (item) item.classList.add(DELETED_HIDE_CLS);

        // Отключаем чекбокс
        cb.disabled = true;
        cb.checked = false;

        // Запоминаем удалённый ID
        p.deletedIds.add(String(contentId));

        deletedCount++;
      } catch (err) {
        errors.push(`${contentId}: ${err?.message || err}`);
        console.error(`[adgm] deleteMedia failed for ${contentId}`, err);
      }
    }

    if (btn) btn.disabled = false;

    // Обновляем счётчик выбранных
    updateSelectedCounter(modalRoot);

    h(`Bulk Delete: удалено ${deletedCount}, ошибок ${errors.length}`);
    if (errors.length) {
      console.warn("[adgm] Bulk Delete errors:", errors);
    }
  }
  // ══════════════════════════════════════════════════════════════

  function T(t) {
    (O(),
      (p.modalRoot = t),
      (p.modalSession += 1),
      (p.chatSent = new Set()),
      (p.letterSent = new Set()),
      (p.readStatusByContentId = new Map()),
      (p.readStatusByMediaKey = new Map()),
      (p.deletedIds = new Set()),
      (p.lastChatId = null),
      (p.dataStatus = "idle"),
      (p.filterMode = 0),
      (p.refreshInFlight = !1),
      (function (t) {
        if (!t) return;
        (t.querySelectorAll(`.${r}`).forEach((t) => t.remove()),
          t.querySelectorAll(`.${o}`).forEach((t) => t.classList.remove(o)),
          t.querySelectorAll(`.${VIEW_MARKER_CLS}`).forEach((t) => t.remove()),
          t.querySelectorAll(`.${DELETED_HIDE_CLS}`).forEach((t) => t.classList.remove(DELETED_HIDE_CLS)));
        const e = $(t);
        e?.classList.remove(i, a);
      })(t));
    const e = z(t);
    (R(t), buildBulkTrashBtn(t), k(e), M(t, e));
    
    // Bug #6 fix: guard против накопления change-листенеров при повторном T()
    if (!t.dataset.adgmChangeBound) {
      t.dataset.adgmChangeBound = "1";
      t.addEventListener('change', (event) => {
        if (event.target.type === 'checkbox') {
          updateSelectedCounter(t);
        }
      }, true);
    }
  }
  function D() {
    const t = document.querySelector(
      '.upload_popup_wrap[data-testid="file-modal"]',
    );
    if (!t)
      return void (
        p.modalRoot &&
        (function () {
          if ((O(), p.listObserver)) {
            try {
              p.listObserver.disconnect();
            } catch {}
            p.listObserver = null;
          }
          ((p.listObservedEl = null),
            (p.modalRoot = null),
            (p.chatSent = new Set()),
            (p.letterSent = new Set()),
            (p.readStatusByContentId = new Map()),
            (p.readStatusByMediaKey = new Map()),
            (p.deletedIds = new Set()),
            (p.lastChatId = null),
            (p.dataStatus = "idle"),
            (p.filterMode = 0),
            (p.refreshInFlight = !1));
        })()
      );
    if (p.modalRoot !== t) return void T(t);
    !p.helpPopover || (p.helpAnchor && document.contains(p.helpAnchor)) || O();
    const e = z(t);
    (R(t), buildBulkTrashBtn(t), "ready" === p.dataStatus && (A(t), C(t), q(t)), k(e));
    updateSelectedCounter(t);
  }

  // ═══════════════════════════════════════════════════════════
  // СЧЁТЧИК ВЫБРАННЫХ МЕДИА
  // ═══════════════════════════════════════════════════════════
  function updateSelectedCounter(modal) {
    if (!modal) return;
    
    // Находим или создаём счётчик
    let counter = modal.querySelector(`.${selectedCounter}`);
    if (!counter) {
      counter = document.createElement('div');
      counter.className = selectedCounter;
      modal.appendChild(counter);
    }
    
    // Bug #12 fix: считаем только чекбоксы медиа-элементов (data-contentid),
    // а не все чекбоксы в модале (включая UI-контролы)
    const checkboxes = modal.querySelectorAll('input[type="checkbox"][data-contentid]:checked');
    const count = checkboxes.length;
    
    // Обновляем текст и видимость
    if (count > 0) {
      counter.textContent = `✓ Selected: ${count}`;
      counter.classList.add('visible');
    } else {
      counter.classList.remove('visible');
    }
  }
  // ═══════════════════════════════════════════════════════════
  (f(),
    D(),
    (__adgmGlobalObserver__ = new MutationObserver(() => {
      p.modalScanScheduled ||
        ((p.modalScanScheduled = !0),
        requestAnimationFrame(() => {
          ((p.modalScanScheduled = !1), D());
        }));
    })),
    __adgmGlobalObserver__.observe(document.documentElement, { childList: !0, subtree: !0 }));
})();

} // end VERSION guard
