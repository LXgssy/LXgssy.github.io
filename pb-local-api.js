/* pb-local-api.js v13 — 页面内嵌本地 API 仿真 (IndexedDB 单机账号/存档)
 * 由 pb-sw.js v13 移植; 由 game.html/index.html 的 fetch hook 调用 */
"use strict";
(function(){
var DB = 'pb-local-api';
var MEDIA_RE = /\.(png|ogg|glb|jpg|jpeg|webp|mp3|wav|woff2?|ico|gz)(\?|#|$)/i;

self.addEventListener('install', function (e) { self.skipWaiting(); e && e.waitUntil && e.waitUntil(Promise.resolve()); });
self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    var names = await caches.keys();
    await Promise.all(names.map(function (n) { return (n === STATIC || n === MEDIA) ? null : caches.delete(n); }));
    await self.clients.claim();
  })());
});

/* ---------------- IndexedDB 帮助 ---------------- */
function db() {
  return new Promise(function (res, rej) {
    var r = indexedDB.open(DB, 1);
    r.onupgradeneeded = function () {
      var d = r.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('users')) d.createObjectStore('users', { keyPath: 'uid' });
      if (!d.objectStoreNames.contains('sessions')) d.createObjectStore('sessions', { keyPath: 'token' });
    };
    r.onsuccess = function () { res(r.result); };
    r.onerror = function () { rej(r.error); };
  });
}
function idb(store, mode, fn) {
  return db().then(function (d) {
    return new Promise(function (res, rej) {
      var tx = d.transaction(store, mode);
      var st = tx.objectStore(store);
      var out = fn(st);
      tx.oncomplete = function () { res(out && out.__v !== undefined ? out.__v : out); };
      tx.onerror = function () { rej(tx.error); };
    });
  });
}
function kvGet(k) { return idb('kv', 'readonly', function (st) { var q = st.get(k); q.onsuccess = function () { q.__v = q.result; }; return q; }).then(function (q) { return q && q.__v !== undefined ? q.__v : q; }).then(function (v) { /* unwrap */ return v; }); }
/* 简化: 直接用 promise 包装 request */
function req2p(rq) { return new Promise(function (res, rej) { rq.onsuccess = function () { res(rq.result); }; rq.onerror = function () { rej(rq.error); }; }); }
function kvGet2(k) { return db().then(function (d) { return req2p(d.transaction('kv', 'readonly').objectStore('kv').get(k)); }); }
function kvSet2(k, v) { return db().then(function (d) { return new Promise(function (res, rej) { var tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = function () { rej(tx.error); }; }); }); }
function userGet(uid) { return db().then(function (d) { return req2p(d.transaction('users', 'readonly').objectStore('users').get(uid)); }); }
function userPut(u) { return db().then(function (d) { return new Promise(function (res, rej) { var tx = d.transaction('users', 'readwrite'); tx.objectStore('users').put(u); tx.oncomplete = res; tx.onerror = function () { rej(tx.error); }; }); }); }
function userByName(name) { return db().then(function (d) { return req2p(d.transaction('users', 'readonly').objectStore('users').getAll()); }).then(function (arr) { arr = arr || []; for (var i = 0; i < arr.length; i++) if (arr[i].name === name) return arr[i]; return null; }); }
function sessGet(token) { return db().then(function (d) { return req2p(d.transaction('sessions', 'readonly').objectStore('sessions').get(token)); }); }
function sessPut(s) { return db().then(function (d) { return new Promise(function (res, rej) { var tx = d.transaction('sessions', 'readwrite'); tx.objectStore('sessions').put(s); tx.oncomplete = res; tx.onerror = function () { rej(tx.error); }; }); }); }
function sessDel(token) { return db().then(function (d) { return new Promise(function (res) { var tx = d.transaction('sessions', 'readwrite'); tx.objectStore('sessions').delete(token); tx.oncomplete = res; }); }); }

/* ---------------- 工具 ---------------- */
function rnd(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); var s = ''; for (var i = 0; i < n; i++) s += (a[i] | 0).toString(16).padStart(2, '0'); return s.slice(0, n * 2); }
function nowMs() { return Date.now(); }
function hex(s) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (b) { var a = new Uint8Array(b), o = ''; for (var i = 0; i < a.length; i++) o += a[i].toString(16).padStart(2, '0'); return o; }); }
function jsonResp(obj, status) {
  status = status || 200;
  return new Response(JSON.stringify(obj), { status: status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

var DEFAULT_SETTINGS = { "master": .8, "music": .5, "sfx": .7, "cries": .6, "quality": "high", "aimMode": "auto", "sensitivity": 1, "invertY": false, "damageNumbers": true, "floatText": true, "shakeOn": true, "screenShake": 1, "fov": 70, "showFps": false, "reduceFlashes": false, "pixel": 0, "muteHidden": true, "hudScale": 1, "hudOpacity": 1, "bossBarOpacity": 1, "showBanners": true, "showMinimap": true, "autoAim": true };
function defaultProfile(name) {
  return { "v": 1, "name": name, "created": nowMs(), "stardust": 0, "totalStardust": 0,
    "unlocked": [], "league": [], "starter": 0, "forms": [], "research": {}, "captured": {},
    "seen": [], "played": [], "shinies": [], "classics": [], "skins": [], "team": [],
    "lab": {}, "biomes": { "forest": 0 }, "quests": {}, "counters": {}, "runs": [], "best": {},
    "times": {}, "kills": {}, "medals": {}, "endless": {}, "settings": DEFAULT_SETTINGS,
    "lastSpecies": 4, "lastBiome": "forest", "banished": [], "itemsOwned": [], "itemsOff": [],
    "daily": { "ids": [], "prog": [], "claimed": [] }, "weekly": { "ids": [], "prog": [], "claimed": [] },
    "dailyStreak": { "last": 0, "n": 0 }, "bag": {}, "avatar": "", "frame": "", "title": "", "cosmetics": [],
    "bonk": 0, "totalBonk": 0, "shop": { "day": 0, "n": {} }, "treasures": {} };
}
function publicSession(u, token) {
  var s = { "name": u.name, "guest": !!u.guest, "admin": false, "id": u.uid };
  if (token) s["token"] = token;
  return s;
}

var STATUS_TPL = { "maintenance": { "on": false, "title": "Server upgrade", "message": "We are moving PokéBonk to a bigger, faster server so everyone can play smoothly at peak time. Your runs in progress are kept. Back as soon as possible!", "eta": 1793201580000 }, "bypass": false, "season": { "n": 1, "name": "", "start": 1793030660243, "end": 1798214660243, "live": true, "dust": 1, "message": "", "next": null }, "events": [], "serverTime": 0 };

/* ---------------- API 仿真 ---------------- */
async function handleAPI(route, method, body, authHdr, qparams) {
  var _n = qparams._n;
  function J(obj, status) {
    if (_n && obj && typeof obj === 'object' && !(obj instanceof Array)) { obj = Object.assign({}, obj); obj._n = String(_n).slice(0, 24); }
    return jsonResp(obj, status);
  }
  async function authUser() {
    if (!authHdr || authHdr.indexOf('Bearer ') !== 0) return null;
    var s = await sessGet(authHdr.slice(7).trim());
    if (!s) return null;
    var u = await userGet(s.uid);
    return u || null;
  }
  function saveProfile(u) { return userPut(u); }

  try {
    /* --- 健康与公告 --- */
    if (route === '/status') { var st = JSON.parse(JSON.stringify(STATUS_TPL)); st.serverTime = nowMs(); return J(st); }
    if (route === '/news') return J({ "items": [], "updated": nowMs() });
    if (route === '/build') return J({ "build": "mvsahmm8", "v": 13 });

    /* --- 认证 --- */
    if (route === '/auth/guest' && method === 'POST') {
      var name = 'Entrenador' + rnd(1).toUpperCase();
      var u = { uid: rnd(8), lkey: 'guest-' + rnd(6), name: name, guest: true, created: nowMs(), last: nowMs(), banned: false, pass: null, profile: defaultProfile(name) };
      u.profile.name = name;
      await userPut(u);
      var tok = rnd(24);
      await sessPut({ token: tok, uid: u.uid, name: u.name, guest: true, at: nowMs() });
      return J(publicSession(u, tok));
    }
    if (route === '/auth/register' && method === 'POST') {
      var nm = (body && (body.name || body.username)) || '', pw = (body && (body.password || body.pass)) || '';
      if (!nm || !pw) return J({ "error": "Faltan datos." }, 400);
      if (await userByName(nm)) return J({ "error": "Ese nombre ya existe." }, 400);
      var u2 = { uid: rnd(8), lkey: 'acct-' + rnd(6), name: nm, guest: false, created: nowMs(), last: nowMs(), banned: false, pass: await hex('pb1:' + nm + ':' + pw), profile: defaultProfile(nm) };
      await userPut(u2);
      var tk2 = rnd(24);
      await sessPut({ token: tk2, uid: u2.uid, name: nm, guest: false, at: nowMs() });
      return J(publicSession(u2, tk2));
    }
    if (route === '/auth/login' && method === 'POST') {
      var nm3 = (body && (body.name || body.username)) || '', pw3 = (body && (body.password || body.pass)) || '';
      var u3 = await userByName(nm3);
      if (!u3) return J({ "error": "Cuenta no encontrada." }, 404);
      var h3 = await hex('pb1:' + nm3 + ':' + pw3);
      if (u3.pass && u3.pass !== h3) return J({ "error": "Contraseña incorrecta." }, 401);
      var tk3 = rnd(24);
      await sessPut({ token: tk3, uid: u3.uid, name: u3.name, guest: !!u3.guest, at: nowMs() });
      return J(publicSession(u3, tk3));
    }
    if (route === '/auth/me') {
      var um = await authUser();
      if (!um) return J({ "error": "No session." }, 401);
      return J(publicSession(um));
    }
    if (route === '/auth/logout') { if (authHdr) await sessDel(authHdr.slice(7).trim()); return J({ "ok": true }); }
    if (route === '/auth/captcha') return J({ "ok": true, "token": "local", "img": "" });
    if (route === '/auth/captcha/verify') return J({ "ok": true });
    if (route === '/auth/upgrade' && method === 'POST') {
      var uu = await authUser(); if (!uu) return J({ "error": "No session." }, 401);
      var nmw = (body && (body.name || body.username)) || '', pww = (body && (body.password || body.pass)) || '';
      if (nmw && await userByName(nmw) && nmw !== uu.name) return J({ "error": "Ese nombre ya existe." }, 400);
      if (nmw) uu.name = nmw;
      if (pww) uu.pass = await hex('pb1:' + uu.name + ':' + pww);
      uu.guest = false; uu.profile.name = uu.name;
      await userPut(uu);
      return J(publicSession(uu));
    }
    if (route === '/auth/name' && method === 'POST') {
      var un = await authUser(); if (!un) return J({ "error": "No session." }, 401);
      var nn = body && body.name; if (!nn) return J({ "error": "Falta nombre." }, 400);
      if (await userByName(nn) && nn !== un.name) return J({ "error": "Ese nombre ya existe." }, 400);
      un.name = nn; un.profile.name = nn; await userPut(un);
      return J({ "ok": true, "name": nn });
    }

    /* --- 需要 session 的 --- */
    var user = await authUser();
    if (route === '/profile') {
      if (!user) return J({ "error": "No session." }, 401);
      if (method === 'GET') return J(user.profile);
      if (method === 'POST') {
        /* 合并保存 */
        var p = body || {};
        if (p && typeof p === 'object') {
          for (var k in p) { try { user.profile[k] = p[k]; } catch (e) {} }
          await saveProfile(user);
        }
        return J(user.profile);
      }
    }
    if (route === '/profile/starter' && method === 'POST') {
      if (!user) return J({ "error": "No session." }, 401);
      user.profile.starter = (body && body.id) || (body && body.starter) || 0;
      await saveProfile(user);
      return J({ "ok": true, "starter": user.profile.starter });
    }
    if (route === '/profile/prefs' || route === '/profile/actions') {
      if (!user) return J({ "error": "No session." }, 401);
      if (method === 'POST' && body && typeof body === 'object') {
        for (var k2 in body) { try { user.profile[k2] = body[k2]; } catch (e) {} }
        await saveProfile(user);
      }
      return J({ "ok": true });
    }
    if (route === '/account/rename' && method === 'POST') {
      if (!user) return J({ "error": "No session." }, 401);
      var rn = body && body.name; if (rn) { user.name = rn; user.profile.name = rn; await saveProfile(user); }
      return J({ "ok": true, "name": user.name });
    }
    if (route === '/account/reset' || route === '/account/delete') {
      if (!user) return J({ "error": "No session." }, 401);
      user.profile = defaultProfile(user.name); await saveProfile(user);
      return J({ "ok": true });
    }
    if (route.indexOf('/runs') === 0) {
      if (!user) return J({ "error": "No session." }, 401);
      var rk = 'runs:' + user.uid;
      var arr = (await kvGet2(rk)) || [];
      if (route === '/runs' && method === 'GET') return J(arr);
      if (route === '/runs' && method === 'POST') {
        var run = body || {}; run.id = run.id || ('r' + rnd(6)); run.at = nowMs();
        arr.push(run); await kvSet2(rk, arr.slice(-50));
        return J(run);
      }
      var rid = route.split('/')[2];
      if (rid) {
        if (method === 'GET') { for (var i = 0; i < arr.length; i++) if (arr[i].id === rid) return J(arr[i]); return J({ "error": "not found" }, 404); }
        if (method === 'POST') {
          var b = body || {}; b.id = rid;
          for (var j = 0; j < arr.length; j++) if (arr[j].id === rid) arr[j] = b; else arr.push(b);
          await kvSet2(rk, arr.slice(-50)); return J(b);
        }
      }
      return J({ "ok": true });
    }
    if (route === '/records' || route === '/records/endless') {
      if (!user) return J({ "error": "No session." }, 401);
      var rec = (await kvGet2('rec:' + user.uid)) || {};
      if (method === 'POST' && body && typeof body === 'object') { for (var k3 in body) rec[k3] = body[k3]; await kvSet2('rec:' + user.uid, rec); }
      return J(rec);
    }
    if (route === '/leaderboard' || route === '/leaderboard/pokemon') {
      if (!user) return J({ "error": "No session." }, 401);
      var me = { "name": user.name, "guest": !!user.guest, "score": (user.profile && user.profile.totalStardust) || 0, "self": true };
      return J({ "board": [me], "me": me, "items": [me] });
    }
    if (route === '/seasons/awards' || route === '/seasons/claim') return J({ "ok": true, "claimed": [], "awards": [] });

    /* --- 社交/商店: 最小成功响应 --- */
    if (route === '/mail' || route.indexOf('/mail') === 0) return J({ "items": [], "unread": 0 });
    if (route === '/friends' || route.indexOf('/friends') === 0) return J({ "items": [], "friends": [], "requests": [] });
    if (route === '/clans' || route.indexOf('/clans') === 0) return J({ "items": [], "clan": null, "board": [] });
    if (route === '/coop' || route.indexOf('/coop') === 0) return J({ "items": [], "rooms": [], "invites": [] });
    if (route === '/players' || route.indexOf('/players') === 0) return J({ "items": [], "players": [] });
    if (route === '/events' || route.indexOf('/events') === 0) return J({ "items": [], "events": [] });
    if (route === '/shop/buy' || route === '/lab/buy' || route === '/items/buy' || route === '/treasures/spin') {
      if (!user) return J({ "error": "No session." }, 401);
      return J({ "ok": true, "item": (body && (body.item || body.id)) || null, "n": 0 });
    }
    if (route === '/quests/claim' || route === '/tasks/claim' || route === '/tasks/reroll') return J({ "ok": true, "claimed": [], "reward": null });
    if (route === '/feedback' || route === '/report' || route === '/rescue') return J({ "ok": true });

    /* --- 万能兜底: 未知端点返回 ok (防游戏崩溃) --- */
    return J({ "ok": true });
  } catch (e) {
    return jsonResp({ "error": "local api error", "detail": String(e).slice(0, 120) }, 500);
  }
}

async function routeAPI(url, init) {
  var u = new URL(url);
  var enc = u.searchParams.get('u') || '';
  var route = '';
  try { route = decodeURIComponent(enc); } catch (e) { route = enc; }
  var qi = route.indexOf('?');
  var qparams = {};
  if (qi >= 0) {
    route.slice(qi + 1).split('&').forEach(function (kv) { var p = kv.split('='); qparams[p[0]] = p.slice(1).join('='); });
    route = route.slice(0, qi);
  }
  var method = (init && init.method) || 'GET';
  var body = null;
  if (init && init.body) {
    try { body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body; } catch (e) { body = null; }
  }
  var auth = null;
  if (init && init.headers) {
    var hs = init.headers;
    if (hs.get) auth = hs.get('Authorization'); else auth = hs['Authorization'] || null;
  }
  return handleAPI(route, method, body, auth, qparams);
}


window.__pbLocalAPI = function(search, io) {
  var url = location.origin + "/pbapi.py" + (search ? "?" + search : "");
  var init = io || {};
  return routeAPI(url, init);
};
})();
