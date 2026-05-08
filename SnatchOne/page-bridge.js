const INFLIGHT = new Map();
!(function () {
  function t(t) {
    let e = "";
    for (let r = 0; r < t.length; r += 32768)
      e += String.fromCharCode(...t.subarray(r, r + 32768));
    return btoa(e);
  }
  function e(t) {
    return "string" == typeof t && t.startsWith("/api/");
  }
  function r(t, e) {
    if (!t) return !1;
    const r = e.toLowerCase();
    for (const e of Object.keys(t)) if (e.toLowerCase() === r) return !0;
    return !1;
  }
  function o(t, e) {
    if (!t) return;
    const r = e.toLowerCase();
    for (const e of Object.keys(t)) e.toLowerCase() === r && delete t[e];
  }
  const n = [
    /^\/api\/chatList\/chatListByUserID\b/i,
    /^\/api\/chatList\/userDetail\b/i,
    /^\/api\/chatList\/lastMessage\b/i,
    /^\/api\/chatList\/chatHistory\b/i,
    /^\/api\/chatList\/chatUidByProfileAndUserIds\b/i,
  ];
  try {
    window.postMessage({ src: "SN_PAGE", type: "SN_READY" }, location.origin);
  } catch {}
  window.addEventListener("message", async (i) => {
    const s = i.data;
    if (!s || "SN_SW" !== s.src) return;
    if ("SN_PING" === s.type) {
      try {
        window.postMessage(
          { src: "SN_PAGE", type: "SN_READY" },
          location.origin,
        );
      } catch {}
      return;
    }
    if ("SN_FETCH_CANCEL" === s.type && s.id) {
      const t = INFLIGHT.get(s.id);
      if (t) {
        try {
          t.ctrl.abort("cancelled");
        } catch {}
        (clearTimeout(t.killer), INFLIGHT.delete(s.id));
      }
      return;
    }
    if ("SN_FETCH_REQ" !== s.type) return;
    const {
      id: a,
      path: c,
      method: l = "GET",
      headers: d = {},
      bodyBase64: u = null,
      timeoutMs: x,
      referer: h = null,
    } = s;
    try {
      const i = { ...d };
      (e(c) &&
        !r(i, "Accept") &&
        (i.Accept = "application/json, text/plain, */*"),
        ((t) => e(t) && !n.some((e) => e.test(t)))(c) &&
          !r(i, "X-Request-Id") &&
          (i["X-Request-Id"] =
            "-" +
            "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (t) => {
              const e = (16 * Math.random()) | 0;
              return ("x" === t ? e : (3 & e) | 8).toString(16);
            })),
        "GET" === l.toUpperCase() && o(i, "Content-Type"));
      const s = new AbortController(),
        p = setTimeout(
          () => {
            try {
              s.abort("timeout");
            } catch {}
          },
          Math.max(500, Number(x) || 5e3),
        );
      (INFLIGHT.set(a, { ctrl: s, killer: p }), o(i, "Referer"));
      const f = {
        method: l,
        headers: i,
        credentials: "include",
        signal: s.signal,
      };
      (u &&
        (f.body = new TextDecoder().decode(
          (function (t) {
            const e = atob(t),
              r = new Uint8Array(e.length);
            for (let t = 0; t < e.length; t++) r[t] = e.charCodeAt(t);
            return r;
          })(u),
        )),
        h && (f.referrer = h));
      const y = await fetch("https://alpha.date" + c, f),
        A = new Uint8Array(await y.arrayBuffer());
      (clearTimeout(p),
        INFLIGHT.delete(a),
        window.postMessage(
          {
            src: "SN_PAGE",
            type: "SN_FETCH_RES",
            id: a,
            ok: !0,
            status: y.status,
            headers: Object.fromEntries(y.headers.entries()),
            bodyBase64: t(A),
          },
          location.origin,
        ));
    } catch (t) {
      const e = INFLIGHT.get(a);
      (e && (clearTimeout(e.killer), INFLIGHT.delete(a)),
        window.postMessage(
          {
            src: "SN_PAGE",
            type: "SN_FETCH_RES",
            id: a,
            ok: !1,
            error: String(t),
          },
          location.origin,
        ));
    }
  });
})();
