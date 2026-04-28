(() => {
  "use strict";
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
    d = "",
    u =
      '\n    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">\n      <path fill="currentColor" d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/>\n    </svg>\n  ',
    p = {
      chatSent: new Set(),
      letterSent: new Set(),
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
      (t.textContent = `\n      .${n} {\n        margin-left: 8px;\n        height: 22px;\n        padding: 0 8px;\n        border-radius: 6px;\n        border: 1px solid rgba(255,255,255,.18);\n        background: rgba(255,255,255,.06);\n        color: inherit;\n        font: inherit;\n        font-size: 12px;\n        line-height: 20px;\n        display: inline-flex;\n        align-items: center;\n        gap: 6px;\n        cursor: pointer;\n        user-select: none;\n      }\n      .${n}:hover { background: rgba(255,255,255,.10); }\n      .${n}:active { transform: translateY(1px); }\n      .${n}[disabled] { opacity: .6; cursor: progress; }\n\n      .${r} {\n        display: inline-flex;\n        align-items: center;\n        justify-content: center;\n        height: 18px;\n        padding: 0 6px;\n        margin-right: 6px;\n        border-radius: 4px;\n        border: 1px solid rgba(255, 40, 40, .70);\n        background: rgba(255, 40, 40, .12);\n        color: rgba(255, 70, 70, .98);\n        font-size: 12px;\n        font-weight: 700;\n        line-height: 16px;\n        letter-spacing: .2px;\n        white-space: nowrap;\n        pointer-events: none; /* don't block clicks on trash icon */\n        gap: 4px;\n      }\n\n\n      .${l} {\n        margin-left: 12px;\n        margin-right: 6px;\n\n        width: 20px;\n        height: 20px;\n        padding: 0;\n        border: none;\n        background: transparent;\n        color: #2f80ff !important;\n\n        display: inline-flex;\n        align-items: center;\n        justify-content: center;\n        cursor: pointer;\n        user-select: none;\n\n        position: relative;\n        z-index: 50;\n        pointer-events: auto !important;\n        flex: 0 0 auto;\n      }\n      .${l}:hover {\n        color: #2f80ff !important;\n        background: rgba(255,255,255,.10);\n        border-radius: 999px;\n      }\n      .${l} svg {\n        width: 18px;\n        height: 18px;\n        display: block;\n        pointer-events: none;\n      }\n      .${l}:active { transform: translateY(1px); }\n\n      .${l} + .${n} { margin-left: 0 !important; }\n\n      .${s} {\n        position: fixed;\n        z-index: 2147483647;\n        width: 280px;\n        max-width: calc(100vw - 16px);\n        background: rgba(20,20,20,.96);\n        color: #fff;\n        border: 1px solid rgba(255,255,255,.12);\n        border-radius: 10px;\n        box-shadow: 0 12px 32px rgba(0,0,0,.45);\n        padding: 12px;\n        font-size: 12px;\n        line-height: 16px;\n      }\n      .${s} a {\n        color: #fff;\n        text-decoration: underline;\n        word-break: break-all;\n      }\n      .${c} {\n        position: absolute;\n        top: 6px;\n        right: 6px;\n        width: 22px;\n        height: 22px;\n        padding: 0;\n        border-radius: 8px;\n        border: 1px solid rgba(255,255,255,.14);\n        background: rgba(255,255,255,.06);\n        color: inherit;\n        font: inherit;\n        font-size: 14px;\n        line-height: 20px;\n        display: inline-flex;\n        align-items: center;\n        justify-content: center;\n        cursor: pointer;\n      }\n      .${c}:hover { background: rgba(255,255,255,.10); }\n      .${c}:active { transform: translateY(1px); }\n\n      .${i} .${o} {\n        display: none !important;\n      }\n      .${a} .upload_popup_tabs_content_item:not(.${o}),\n      .${a} .upload_popup_tabs_content_audio_item:not(.${o}) {\n        display: none !important;\n      }\n\n      .${selectedCounter} {\n        position: absolute;\n        bottom: 20px;\n        right: 300px;\n        padding: 10px 20px;\n        background: #4A90E2;\n        color: #fff;\n        border-radius: 8px;\n        font-size: 14px;\n        font-weight: 500;\n        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);\n        pointer-events: none;\n        z-index: 100;\n        display: none;\n        align-items: center;\n        gap: 8px;\n        transition: all 0.2s ease;\n        letter-spacing: 0.3px;\n        white-space: nowrap;\n      }\n      .${selectedCounter}.visible {\n        display: flex;\n      }\n      .${selectedCounter}::before {\n        content: "";\n      }\n    `),
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
  function _(t) {
    if (!t) return null;
    const e = t.getAttribute("data-id");
    if (e) return String(e);
    const n = t.querySelector("input[data-contentid]"),
      r = n?.getAttribute("data-contentid");
    return r ? String(r) : null;
  }
  function E(t) {
    const e = p.chatSent.has(t),
      n = p.letterSent.has(t);
    return e && n ? "CL" : e ? "C" : n ? "L" : null;
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
          ((p.applyScheduled = !1),
            (p.chatSent.size || p.letterSent.size) &&
              (async function (t) {
                if (!p.applyRunning) {
                  p.applyRunning = !0;
                  try {
                    const e = $(t);
                    if (!e) return;
                    const n = Array.from(
                        e.querySelectorAll(
                          ".upload_popup_tabs_content_item[data-id], .upload_popup_tabs_content_audio_item[data-id]",
                        ),
                      ),
                      r = 60;
                    for (let t = 0; t < n.length; t++) {
                      const e = n[t],
                        o = _(e);
                      (o && L(e, E(o)),
                        t > 0 &&
                          t % r == 0 &&
                          (await new Promise((t) =>
                            requestAnimationFrame(() => t()),
                          )));
                    }
                  } finally {
                    p.applyRunning = !1;
                  }
                }
              })(t));
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
      if (p.chatSent.size || p.letterSent.size)
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
        } = await (async function (t) {
          const [e, n] = await Promise.all([
              w("/api/chatList/operatorMedia", { chat_id: t }),
              w("/api/chatList/operatorMediaLetters", { chat_id: t }),
            ]),
            r = new Set(),
            o = new Set();
          if (e?.status && Array.isArray(e.response))
            for (const t of e.response)
              if (1 !== Number(t?.is_male) && null != t?.content_id) {
                r.add(String(t.content_id));
              }
          if (n?.status && Array.isArray(n.response))
            for (const t of n.response)
              if (1 !== Number(t?.is_male) && null != t?.content_id) {
                o.add(String(t.content_id));
              }
          return { chatSet: r, letterSet: o, chatJson: e, letterJson: n };
        })(t);
      if (o !== p.modalSession) return;
      ((p.chatSent = i),
        (p.letterSent = a),
        (p.lastChatId = t),
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
    if (!e) return;
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
  function T(t) {
    (O(),
      (p.modalRoot = t),
      (p.modalSession += 1),
      (p.chatSent = new Set()),
      (p.letterSent = new Set()),
      (p.lastChatId = null),
      (p.dataStatus = "idle"),
      (p.filterMode = 0),
      (p.refreshInFlight = !1),
      (function (t) {
        if (!t) return;
        (t.querySelectorAll(`.${r}`).forEach((t) => t.remove()),
          t.querySelectorAll(`.${o}`).forEach((t) => t.classList.remove(o)));
        const e = $(t);
        e?.classList.remove(i, a);
      })(t));
    const e = z(t);
    (R(t), k(e), M(t, e));
    
    // ═══════════════════════════════════════════════════════════
    // Отслеживание кликов по чекбоксам для счётчика
    // ═══════════════════════════════════════════════════════════
    t.addEventListener('change', (event) => {
      if (event.target.type === 'checkbox') {
        updateSelectedCounter(t);
      }
    }, true);
    // ═══════════════════════════════════════════════════════════
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
            (p.lastChatId = null),
            (p.dataStatus = "idle"),
            (p.filterMode = 0),
            (p.refreshInFlight = !1));
        })()
      );
    if (p.modalRoot !== t) return void T(t);
    !p.helpPopover || (p.helpAnchor && document.contains(p.helpAnchor)) || O();
    const e = z(t);
    (R(t), "ready" === p.dataStatus && (A(t), C(t), q(t)), k(e));
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
    
    // Считаем выбранные чекбоксы
    const checkboxes = modal.querySelectorAll('input[type="checkbox"]:checked');
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
    new MutationObserver(() => {
      p.modalScanScheduled ||
        ((p.modalScanScheduled = !0),
        requestAnimationFrame(() => {
          ((p.modalScanScheduled = !1), D());
        }));
    }).observe(document.documentElement, { childList: !0, subtree: !0 }));
})();
