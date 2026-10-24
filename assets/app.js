/* ---------------------------------------------------------
   随想 · 一个只存在浏览器里的极简日记
   --------------------------------------------------------- */

(function () {
  "use strict";

  var STORE_KEY = "suixiang.entries.v1";
  var DRAFT_KEY = "suixiang.draft.v1";
  var SESSION_KEY = "suixiang.session.v1";
  var WEEK_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  var entries = [];
  var state = { q: "" };
  var editingId = null;
  var editDraft = "";

  var $ = function (sel, root) {
    return (root || document).querySelector(sel);
  };

  var compose = $("#composeText");
  var charCountEl = $("#charCount");
  var saveBtn = $("#saveBtn");
  var draftHint = $("#draftHint");
  var searchInput = $("#searchInput");
  var searchClear = $("#searchClear");
  var timeline = $("#timeline");
  var feedHead = $(".feed-head");
  var feedTitle = $("#feedTitle");
  var feedCount = $("#feedCount");
  var todayText = $("#todayText");
  var toastStack = $("#toastStack");
  var fileInput = $("#fileInput");
  var accountBtn = $("#accountBtn");
  var footNote = $("#footNote");
  var syncModal = $("#syncModal");
  var authForm = $("#authForm");
  var authEmail = $("#authEmail");
  var authPassword = $("#authPassword");
  var authError = $("#authError");
  var authSubmit = $("#authSubmit");
  var authSwitch = $("#authSwitch");
  var syncPanel = $("#syncPanel");
  var syncEmail = $("#syncEmail");
  var syncStatus = $("#syncStatus");
  var syncNowBtn = $("#syncNowBtn");
  var signOutBtn = $("#signOutBtn");

  var syncConfig = window.SUIXIANG_SUPABASE || {};
  var syncUrl = String(syncConfig.url || "").replace(/\/+$/, "");
  var syncKey = String(syncConfig.anonKey || "");
  var syncConfigured = !!(syncUrl && syncKey);
  var session = null;
  var authMode = "login";
  var syncBusy = false;
  var syncAgain = false;
  var syncState = "idle";
  var syncMessage = "";
  var lastSyncAt = null;
  var syncTimer = null;

  /* ---------------------------------------------------------
     基础工具
     --------------------------------------------------------- */

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function escRe(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function charCount(text) {
    return String(text).replace(/\s+/g, "").length;
  }

  function startOfDay(date) {
    var d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function dayKey(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function fmtTime(date) {
    return pad(date.getHours()) + ":" + pad(date.getMinutes());
  }

  function fmtMonthDay(date) {
    return date.getMonth() + 1 + "月" + date.getDate() + "日";
  }

  function dateFrom(value) {
    var d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  function highlight(text, query) {
    var q = String(query || "").trim();
    if (!q) return esc(text);
    var parts = String(text).split(new RegExp("(" + escRe(q) + ")", "gi"));
    return parts
      .map(function (part, i) {
        return i % 2 === 1 ? "<mark>" + esc(part) + "</mark>" : esc(part);
      })
      .join("");
  }

  function autoGrow(el, max) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight + 2, max) + "px";
  }

  function isTyping() {
    var el = document.activeElement;
    return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
  }

  /* ---------------------------------------------------------
     存储
     --------------------------------------------------------- */

  var storageOk = true;
  try {
    localStorage.setItem("__suixiang_probe__", "1");
    localStorage.removeItem("__suixiang_probe__");
  } catch (err) {
    storageOk = false;
  }

  function normalize(raw) {
    if (!raw || typeof raw.text !== "string" || !raw.text.trim()) return null;
    var created = dateFrom(raw.createdAt) || new Date();
    var updated = raw.updatedAt ? dateFrom(raw.updatedAt) : null;
    var deleted = raw.deletedAt ? dateFrom(raw.deletedAt) : null;
    var tags = [];
    if (Array.isArray(raw.tags)) {
      tags = raw.tags.filter(function (t) {
        return typeof t === "string" && t;
      }).slice(0, 32);
    }
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
      text: raw.text,
      createdAt: created.toISOString(),
      updatedAt: updated ? updated.toISOString() : null,
      deletedAt: deleted ? deleted.toISOString() : null,
      mood: typeof raw.mood === "string" ? raw.mood : "",
      tags: tags,
      fav: raw.fav === true
    };
  }

  function loadEntries() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      var list = Array.isArray(data) ? data : data && Array.isArray(data.entries) ? data.entries : [];
      var cutoff = Date.now() - 90 * 86400000;
      return list
        .map(normalize)
        .filter(Boolean)
        .filter(function (entry) {
          return !entry.deletedAt || new Date(entry.deletedAt).getTime() > cutoff;
        });
    } catch (err) {
      return [];
    }
  }

  function liveEntries() {
    return entries.filter(function (entry) {
      return !entry.deletedAt;
    });
  }

  function persist() {
    if (!storageOk) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(entries));
    } catch (err) {
      storageOk = false;
      toast("存储空间不足，请先导出备份");
    }
  }

  /* ---------------------------------------------------------
     时间格式
     --------------------------------------------------------- */

  function updateToday() {
    var now = new Date();
    todayText.textContent = fmtMonthDay(now) + " · " + WEEK_CN[now.getDay()];
  }

  function dayLabel(date, now) {
    var diff = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
    if (diff === 0) return "今天";
    if (diff === 1) return "昨天";
    var sameYear = date.getFullYear() === now.getFullYear();
    return (
      (sameYear ? "" : date.getFullYear() + "年") +
      fmtMonthDay(date)
    );
  }

  function dayMeta(date, now) {
    var diff = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
    var week = WEEK_CN[date.getDay()];
    if (diff === 0) return week;
    if (diff === 1) return fmtMonthDay(date) + " · " + week;
    return week;
  }

  /* ---------------------------------------------------------
     渲染
     --------------------------------------------------------- */

  function visibleEntries() {
    var q = state.q.toLowerCase();
    var list = entries.filter(function (entry) {
      if (entry.deletedAt) return false;
      if (!q) return true;
      var haystack = (entry.text + " " + entry.tags.join(" ")).toLowerCase();
      return haystack.indexOf(q) !== -1;
    });
    list.sort(function (a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    return list;
  }

  function groupByDay(list) {
    var groups = [];
    var current = null;
    list.forEach(function (entry) {
      var date = new Date(entry.createdAt);
      var key = dayKey(date);
      if (!current || current.key !== key) {
        current = { key: key, date: startOfDay(date), items: [] };
        groups.push(current);
      }
      current.items.push(entry);
    });
    return groups;
  }

  function entryActions(entry) {
    if (editingId === entry.id) {
      return (
        '<button type="button" class="entry-action is-save" data-act="save">保存</button>' +
        '<button type="button" class="entry-action" data-act="cancel">取消</button>'
      );
    }
    return (
      '<button type="button" class="entry-action" data-act="edit">编辑</button>' +
      '<button type="button" class="entry-action is-danger" data-act="del">删除</button>'
    );
  }

  function entryNode(entry) {
    var date = new Date(entry.createdAt);
    var editing = editingId === entry.id;
    var node = document.createElement("article");
    node.className = "entry" + (editing ? " is-editing" : "");
    node.dataset.id = entry.id;

    var body = editing
      ? '<textarea class="edit-area" id="editText" aria-label="编辑这条记录" spellcheck="false">' +
        esc(editDraft) +
        "</textarea>"
      : '<div class="entry-body">' + highlight(entry.text, state.q) + "</div>";

    node.innerHTML =
      '<div class="entry-head">' +
        '<time class="entry-time" datetime="' + date.toISOString() + '">' + fmtTime(date) + "</time>" +
        (entry.updatedAt ? '<span class="entry-edited">已编辑</span>' : "") +
        '<div class="entry-actions">' + entryActions(entry) + "</div>" +
      "</div>" +
      body;

    return node;
  }

  function emptyNode() {
    var empty = document.createElement("div");
    empty.className = "empty";

    if (state.q) {
      empty.innerHTML =
        "<h3>没有找到</h3><p>换个关键词试试。</p>" +
        '<button type="button" data-act="clear-search">清除搜索</button>';
    } else if (!liveEntries().length) {
      empty.innerHTML =
        "<h3>还没有记录</h3><p>此刻在想什么？写下来吧。</p>";
    } else {
      empty.innerHTML = "<h3>还没有记录</h3><p>此刻在想什么？写下来吧。</p>";
    }

    return empty;
  }

  function renderFeed() {
    var list = visibleEntries();
    var live = liveEntries();
    var now = new Date();

    timeline.innerHTML = "";
    feedHead.hidden = !live.length && !state.q;

    if (state.q) {
      feedTitle.textContent = "搜索";
      feedCount.textContent = list.length + " 条";
    } else {
      feedTitle.textContent = "记录";
      feedCount.textContent = live.length ? "共 " + live.length + " 条" : "";
    }

    if (!list.length) {
      timeline.appendChild(emptyNode());
      return;
    }

    groupByDay(list).forEach(function (group) {
      var section = document.createElement("section");
      section.className = "day";

      var head = document.createElement("div");
      head.className = "day-head";
      head.innerHTML =
        '<span class="day-title">' + dayLabel(group.date, now) + "</span>" +
        '<span class="day-meta">' + dayMeta(group.date, now) + "</span>";
      section.appendChild(head);

      group.items.forEach(function (entry) {
        section.appendChild(entryNode(entry));
      });

      timeline.appendChild(section);
    });
  }

  function render() {
    renderFeed();
  }

  /* ---------------------------------------------------------
     撰写
     --------------------------------------------------------- */

  function updateComposer() {
    var count = charCount(compose.value);
    charCountEl.textContent = count + " 字";
    saveBtn.disabled = !compose.value.trim();
  }

  function addEntry() {
    var text = compose.value.trim();
    if (!text) return;

    commitEditingSilently();

    entries.push({
      id: uid(),
      text: text,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      deletedAt: null,
      mood: "",
      tags: [],
      fav: false
    });

    persist();
    queueSync();

    compose.value = "";
    autoGrow(compose, 360);
    updateComposer();
    clearDraft();
    draftHint.hidden = true;
    editingId = null;
    editDraft = "";

    if (state.q) {
      state.q = "";
      searchInput.value = "";
      searchClear.hidden = true;
    }

    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    compose.focus();
    toast("已保存");
  }

  /* ---------------------------------------------------------
     草稿
     --------------------------------------------------------- */

  var draftTimer = null;

  function scheduleDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraft, 350);
  }

  function saveDraft() {
    if (!storageOk) return;
    try {
      if (compose.value.trim()) {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ text: compose.value, savedAt: Date.now() })
        );
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch (err) {
      /* 草稿失败不打扰 */
    }
  }

  function clearDraft() {
    clearTimeout(draftTimer);
    if (!storageOk) return;
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch (err) {
      /* ignore */
    }
  }

  function restoreDraft() {
    if (!storageOk) return;
    var saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    } catch (err) {
      saved = null;
    }
    if (!saved || typeof saved.text !== "string" || !saved.text.trim()) return;
    compose.value = saved.text;
    autoGrow(compose, 360);
    draftHint.hidden = false;
  }

  /* ---------------------------------------------------------
     编辑
     --------------------------------------------------------- */

  function findEntry(id) {
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].id === id) return entries[i];
    }
    return null;
  }

  function commitEditingSilently() {
    if (!editingId) return;
    var entry = findEntry(editingId);
    if (!entry) return;
    var area = $("#editText");
    var text = (area ? area.value : editDraft).trim();
    if (!text) return;
    entry.text = text;
    entry.updatedAt = new Date().toISOString();
    persist();
    queueSync();
  }

  function openEdit(id) {
    var entry = findEntry(id);
    if (!entry) return;
    if (editingId && editingId !== id) commitEditingSilently();
    editingId = id;
    editDraft = entry.text;
    render();

    var area = $("#editText");
    if (area) {
      area.focus();
      area.setSelectionRange(area.value.length, area.value.length);
      autoGrow(area, 420);
    }
  }

  function saveEdit() {
    var entry = findEntry(editingId);
    if (!entry) {
      editingId = null;
      editDraft = "";
      render();
      return;
    }

    var area = $("#editText");
    var text = (area ? area.value : editDraft).trim();
    if (!text) {
      toast("内容不能为空");
      if (area) area.focus();
      return;
    }

    entry.text = text;
    entry.updatedAt = new Date().toISOString();
    editingId = null;
    editDraft = "";

    persist();
    render();
    queueSync();
    toast("已保存修改");
  }

  function cancelEdit() {
    editingId = null;
    editDraft = "";
    render();
  }

  function deleteEntry(id) {
    var entry = findEntry(id);
    if (!entry || entry.deletedAt) return;

    var now = new Date().toISOString();
    entry.deletedAt = now;
    entry.updatedAt = now;
    if (editingId === id) {
      editingId = null;
      editDraft = "";
    }

    persist();
    render();
    queueSync();

    toast("已删除", {
      action: "撤销",
      duration: 6000,
      onAction: function () {
        if (!entry.deletedAt) return;
        entry.deletedAt = null;
        entry.updatedAt = new Date().toISOString();
        persist();
        render();
        queueSync();
        toast("已恢复");
      }
    });
  }

  /* ---------------------------------------------------------
     搜索
     --------------------------------------------------------- */

  var searchTimer = null;

  function clearSearch() {
    searchInput.value = "";
    state.q = "";
    searchClear.hidden = true;
    clearTimeout(searchTimer);
  }

  /* ---------------------------------------------------------
     导入 / 导出
     --------------------------------------------------------- */

  function download(text, filename) {
    var blob = new Blob([text], { type: "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1500);
  }

  function stamp() {
    var now = new Date();
    return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
  }

  function exportJSON() {
    var payload = {
      app: "随想",
      version: 2,
      exportedAt: new Date().toISOString(),
      entries: liveEntries()
    };
    download(JSON.stringify(payload, null, 2), "随想备份_" + stamp() + ".json");
    toast("已导出备份");
  }

  function importFile(file) {
    var reader = new FileReader();

    reader.onload = function () {
      var data;
      try {
        data = JSON.parse(String(reader.result));
      } catch (err) {
        toast("文件格式不正确");
        return;
      }

      var list = Array.isArray(data) ? data : data && Array.isArray(data.entries) ? data.entries : null;
      if (!list) {
        toast("文件里没有记录");
        return;
      }

      var existing = {};
      entries.forEach(function (entry) {
        existing[entry.id] = entry;
      });

      var added = 0;
      list.forEach(function (raw) {
        var entry = normalize(raw);
        if (!entry) return;
        var current = existing[entry.id];
        if (!current) {
          entries.push(entry);
          existing[entry.id] = entry;
          added++;
          return;
        }
        if (current.deletedAt && !entry.deletedAt) {
          current.deletedAt = null;
          current.text = entry.text;
          current.updatedAt = new Date().toISOString();
          added++;
        }
      });

      entries.sort(function (a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

      persist();
      editingId = null;
      editDraft = "";
      clearSearch();
      render();
      queueSync();
      toast(added ? "已导入 " + added + " 条" : "没有新的记录");
    };

    reader.onerror = function () {
      toast("读取文件失败");
    };

    reader.readAsText(file, "utf-8");
  }

  /* ---------------------------------------------------------
     云同步（可选）
     --------------------------------------------------------- */

  function authMessage(data) {
    var code = data && (data.error_code || data.code);
    var msg = data && (data.msg || data.message || data.error_description || data.error);
    if (code === "invalid_credentials" || msg === "Invalid login credentials") {
      return "邮箱或密码不正确";
    }
    if (code === "email_not_confirmed" || msg === "Email not confirmed") {
      return "邮箱还没确认，请先到邮箱里点确认链接";
    }
    if (code === "user_already_exists" || msg === "User already registered") {
      return "这个邮箱已经注册过，直接登录即可";
    }
    if (code === "weak_password" || /Password should be at least/i.test(msg || "")) {
      return "密码至少需要 6 位";
    }
    if (msg === "Failed to fetch" || msg === "Load failed") {
      return "网络连接失败，请检查网络";
    }
    return msg || "操作失败，请稍后重试";
  }

  function saveSession(data) {
    var raw = data && data.session ? data.session : data;
    if (!raw || !raw.access_token) return false;
    var prevUser = session && session.user;
    session = {
      access_token: raw.access_token,
      refresh_token: raw.refresh_token || (session && session.refresh_token) || "",
      expires_at: Date.now() + (Number(raw.expires_in) || 3600) * 1000,
      user: raw.user || prevUser || null
    };
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (err) {
      /* 存不下 session 时仍然可以本次使用 */
    }
    return true;
  }

  function loadSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var saved = JSON.parse(raw);
      if (!saved || !saved.access_token) return null;
      return saved;
    } catch (err) {
      return null;
    }
  }

  function clearSession() {
    session = null;
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (err) {
      /* ignore */
    }
  }

  async function authRequest(path, body) {
    var res;
    try {
      res = await fetch(syncUrl + path, {
        method: "POST",
        headers: {
          apikey: syncKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
    } catch (err) {
      throw new Error("网络连接失败，请检查网络");
    }
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) throw new Error(authMessage(data));
    return data;
  }

  async function signIn(email, password) {
    var data = await authRequest("/auth/v1/token?grant_type=password", {
      email: email,
      password: password
    });
    if (!saveSession(data)) throw new Error("登录失败，请稍后重试");
  }

  async function signUp(email, password) {
    var data = await authRequest("/auth/v1/signup", {
      email: email,
      password: password
    });
    if (!saveSession(data)) {
      var info = new Error("注册成功，请到邮箱里点确认链接，然后再回来登录");
      info.info = true;
      throw info;
    }
  }

  async function ensureSession(force) {
    if (!session) throw new Error("请先登录");
    if (!force && session.expires_at && session.expires_at - 60000 > Date.now()) {
      return session;
    }
    if (!session.refresh_token) {
      clearSession();
      throw new Error("登录已过期，请重新登录");
    }

    var res;
    try {
      res = await fetch(syncUrl + "/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        headers: {
          apikey: syncKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ refresh_token: session.refresh_token })
      });
    } catch (err) {
      throw new Error("网络连接失败，请检查网络");
    }

    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok || !saveSession(data)) {
      clearSession();
      throw new Error("登录已过期，请重新登录");
    }
    return session;
  }

  async function api(path, options, retried) {
    await ensureSession(false);
    var opts = options || {};
    var headers = opts.headers || {};
    headers.apikey = syncKey;
    headers.Authorization = "Bearer " + session.access_token;
    if (opts.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

    var res;
    try {
      res = await fetch(syncUrl + path, {
        method: opts.method || "GET",
        headers: headers,
        body: opts.body
      });
    } catch (err) {
      throw new Error("网络连接失败，请检查网络");
    }

    if (res.status === 401 && !retried) {
      await ensureSession(true);
      return api(path, options, true);
    }
    if (!res.ok) {
      var info = await res.json().catch(function () {
        return {};
      });
      throw new Error(info.message || info.hint || "同步失败（" + res.status + "）");
    }
    return res;
  }

  async function pullRemote() {
    var all = [];
    var pageSize = 1000;
    var offset = 0;
    for (;;) {
      var path =
        "/rest/v1/entries?select=id,text,created_at,updated_at,deleted_at" +
        "&order=updated_at.asc&limit=" + pageSize + "&offset=" + offset;
      var res = await api(path);
      var rows = await res.json().catch(function () {
        return [];
      });
      if (!Array.isArray(rows) || !rows.length) break;
      all = all.concat(rows);
      if (rows.length < pageSize) break;
      offset += pageSize;
    }
    return all;
  }

  async function pushRemote(list) {
    for (var i = 0; i < list.length; i += 100) {
      var chunk = list.slice(i, i + 100).map(function (entry) {
        return {
          id: entry.id,
          text: entry.text,
          created_at: entry.createdAt,
          updated_at: entry.updatedAt || entry.createdAt,
          deleted_at: entry.deletedAt || null
        };
      });
      await api("/rest/v1/entries?on_conflict=id", {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(chunk)
      });
    }
  }

  function mergeRemote(rows) {
    var remoteIds = {};
    var dirty = {};
    var changed = false;

    rows.forEach(function (row) {
      remoteIds[row.id] = true;
      var local = findEntry(row.id);
      var remoteTime = Date.parse(row.updated_at || row.created_at) || 0;

      if (!local) {
        if (!row.deleted_at) {
          var created = normalize({
            id: row.id,
            text: row.text,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            deletedAt: null
          });
          if (created) entries.push(created);
          changed = true;
        }
        return;
      }

      var localTime = Date.parse(local.updatedAt || local.createdAt) || 0;
      if (remoteTime > localTime + 1000) {
        local.text = row.text;
        local.updatedAt = row.updated_at || local.updatedAt;
        local.deletedAt = row.deleted_at || null;
        changed = true;
      } else if (localTime > remoteTime + 1000) {
        dirty[local.id] = local;
      } else if (row.deleted_at && !local.deletedAt) {
        local.deletedAt = row.deleted_at;
        local.updatedAt = row.updated_at || local.updatedAt;
        changed = true;
      } else if (local.deletedAt && !row.deleted_at) {
        dirty[local.id] = local;
      } else if (!local.deletedAt && row.text !== local.text) {
        local.text = row.text;
        changed = true;
      }
    });

    entries.forEach(function (local) {
      if (!remoteIds[local.id]) dirty[local.id] = local;
    });

    if (changed) {
      entries.sort(function (a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    }

    return Object.keys(dirty).map(function (id) {
      return dirty[id];
    });
  }

  function setSyncState(next, message) {
    syncState = next;
    syncMessage = message || "";
    updateSyncUI();
  }

  async function syncNow(options) {
    var opts = options || {};
    if (!syncConfigured || !session) {
      updateSyncUI();
      return;
    }
    if (syncBusy) {
      syncAgain = true;
      return;
    }
    if (editingId) return;

    syncBusy = true;
    setSyncState("syncing");

    try {
      await ensureSession(false);
      var rows = await pullRemote();
      var dirty = mergeRemote(rows);
      if (dirty.length) await pushRemote(dirty);

      persist();
      if (!editingId) render();
      lastSyncAt = new Date();
      setSyncState("ok");
      if (!opts.quiet) toast("已同步");
    } catch (err) {
      setSyncState("error", err.message || "同步失败");
      if (!opts.quiet) toast(err.message || "同步失败");
    } finally {
      syncBusy = false;
      updateSyncUI();
      if (syncAgain) {
        syncAgain = false;
        clearTimeout(syncTimer);
        syncTimer = setTimeout(function () {
          syncNow({ quiet: true });
        }, 500);
      }
    }
  }

  function queueSync() {
    if (!syncConfigured || !session) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      syncNow({ quiet: true });
    }, 800);
  }

  function updateSyncPanel() {
    if (!session) return;
    syncEmail.textContent = session.user && session.user.email ? session.user.email : "已登录";
    syncStatus.classList.toggle("is-error", syncState === "error");
    if (syncBusy) {
      syncStatus.textContent = "正在同步…";
    } else if (syncState === "error") {
      syncStatus.textContent = syncMessage || "同步失败";
    } else if (lastSyncAt) {
      syncStatus.textContent = "上次同步 " + fmtTime(lastSyncAt);
    } else {
      syncStatus.textContent = "等待第一次同步";
    }
    syncNowBtn.disabled = syncBusy;
  }

  function updateSyncUI() {
    if (!syncConfigured) return;
    accountBtn.hidden = false;
    accountBtn.classList.toggle("is-error", syncState === "error");

    if (!session) {
      accountBtn.textContent = "登录同步";
      footNote.textContent = "仅保存在此浏览器";
      footNote.title = "";
    } else {
      accountBtn.textContent = syncBusy
        ? "同步中…"
        : syncState === "error"
          ? "同步失败"
          : lastSyncAt
            ? "已同步"
            : "待同步";
      footNote.textContent = syncBusy
        ? "正在同步…"
        : syncState === "error"
          ? "同步失败，记录仍保存在本机"
          : lastSyncAt
            ? "已同步到云端"
            : "等待同步";
      footNote.title = session.user && session.user.email ? session.user.email : "";
    }
    updateSyncPanel();
  }

  function showAuthError(message, info) {
    authError.textContent = message || "";
    authError.hidden = !message;
    authError.classList.toggle("is-info", !!info);
  }

  function updateAuthView() {
    authForm.hidden = !!session;
    syncPanel.hidden = !session;

    if (!session) {
      authSubmit.textContent = authMode === "login" ? "登录" : "注册";
      authSwitch.textContent = authMode === "login" ? "没有账号？注册" : "已有账号？登录";
      authPassword.autocomplete = authMode === "login" ? "current-password" : "new-password";
      syncLead.textContent =
        authMode === "login"
          ? "登录后，记录会在你的手机和电脑之间同步。"
          : "注册后，记录会在你的手机和电脑之间同步。";
    } else {
      syncLead.textContent = "已登录。记录会自动同步到云端。";
      updateSyncPanel();
    }
  }

  function openSyncModal() {
    if (!syncConfigured) return;
    authMode = "login";
    showAuthError("");
    authPassword.value = "";
    syncModal.hidden = false;
    updateAuthView();
    if (!session) {
      setTimeout(function () {
        authEmail.focus();
      }, 30);
    }
  }

  function closeSyncModal() {
    syncModal.hidden = true;
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    var email = authEmail.value.trim();
    var password = authPassword.value;

    if (!email || email.indexOf("@") === -1) {
      showAuthError("请输入有效的邮箱");
      authEmail.focus();
      return;
    }
    if (password.length < 6) {
      showAuthError("密码至少需要 6 位");
      authPassword.focus();
      return;
    }

    showAuthError("");
    authSubmit.disabled = true;
    authSubmit.textContent = authMode === "login" ? "登录中…" : "注册中…";

    try {
      if (authMode === "login") await signIn(email, password);
      else await signUp(email, password);

      authPassword.value = "";
      lastSyncAt = null;
      syncState = "idle";
      syncMessage = "";
      closeSyncModal();
      updateSyncUI();
      toast(authMode === "login" ? "已登录，开始同步" : "注册成功，开始同步");
      await syncNow({ quiet: true });
    } catch (err) {
      showAuthError(err.message || "操作失败", err.info);
      if (err.info) {
        authMode = "login";
        authSubmit.textContent = "登录";
        authSwitch.textContent = "没有账号？注册";
      }
    } finally {
      authSubmit.disabled = false;
      if (authForm.hidden === false) {
        authSubmit.textContent = authMode === "login" ? "登录" : "注册";
      }
    }
  }

  function signOut() {
    clearSession();
    lastSyncAt = null;
    syncState = "idle";
    syncMessage = "";
    closeSyncModal();
    updateSyncUI();
    toast("已退出登录，记录仍保留在本机");
  }

  function bindSyncEvents() {
    if (!syncConfigured) return;
    accountBtn.addEventListener("click", openSyncModal);
    authForm.addEventListener("submit", handleAuthSubmit);
    authSwitch.addEventListener("click", function () {
      authMode = authMode === "login" ? "signup" : "login";
      showAuthError("");
      updateAuthView();
      authEmail.focus();
    });
    syncNowBtn.addEventListener("click", function () {
      syncNow({ quiet: false });
    });
    signOutBtn.addEventListener("click", signOut);
    syncModal.addEventListener("click", function (e) {
      if (e.target === syncModal) closeSyncModal();
    });
    $("[data-close='syncModal']").addEventListener("click", closeSyncModal);

    window.addEventListener("online", function () {
      if (session) syncNow({ quiet: true });
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && session) syncNow({ quiet: true });
    });
    setInterval(function () {
      if (session && !document.hidden) syncNow({ quiet: true });
    }, 60000);
  }

  function initSync() {
    if (!syncConfigured) return;
    accountBtn.hidden = false;
    session = loadSession();
    updateSyncUI();
    bindSyncEvents();
    if (session) {
      syncNow({ quiet: true });
    }
  }

  /* ---------------------------------------------------------
     提示
     --------------------------------------------------------- */

  function toast(message, opts) {
    opts = opts || {};
    var el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");

    var label = document.createElement("span");
    label.textContent = message;
    el.appendChild(label);

    var dismissed = false;
    var timer = null;

    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      clearTimeout(timer);
      el.classList.remove("in");
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 220);
    }

    if (opts.action) {
      var action = document.createElement("button");
      action.type = "button";
      action.textContent = opts.action;
      action.addEventListener("click", function () {
        dismiss();
        if (typeof opts.onAction === "function") opts.onAction();
      });
      el.appendChild(action);
    }

    toastStack.appendChild(el);
    requestAnimationFrame(function () {
      el.classList.add("in");
    });
    timer = setTimeout(dismiss, opts.duration || 3000);
  }

  /* ---------------------------------------------------------
     事件
     --------------------------------------------------------- */

  compose.addEventListener("input", function () {
    autoGrow(compose, 360);
    updateComposer();
    scheduleDraft();
  });

  saveBtn.addEventListener("click", addEntry);

  $("#discardDraft").addEventListener("click", function () {
    compose.value = "";
    clearDraft();
    draftHint.hidden = true;
    updateComposer();
    autoGrow(compose, 360);
    compose.focus();
  });

  searchInput.addEventListener("input", function () {
    searchClear.hidden = !searchInput.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.q = searchInput.value.trim();
      render();
    }, 120);
  });

  searchClear.addEventListener("click", function () {
    clearSearch();
    render();
    searchInput.focus();
  });

  timeline.addEventListener("click", function (e) {
    var button = e.target.closest("[data-act]");
    if (!button) return;

    var action = button.dataset.act;
    if (action === "clear-search") {
      clearSearch();
      render();
      return;
    }

    var node = button.closest(".entry");
    if (!node) return;
    var id = node.dataset.id;

    if (action === "edit") openEdit(id);
    else if (action === "save") saveEdit();
    else if (action === "cancel") cancelEdit();
    else if (action === "del") deleteEntry(id);
  });

  timeline.addEventListener("input", function (e) {
    if (e.target && e.target.id === "editText") {
      editDraft = e.target.value;
      autoGrow(e.target, 420);
    }
  });

  document.addEventListener("keydown", function (e) {
    var meta = e.ctrlKey || e.metaKey;

    if (meta && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }

    if (meta && e.key === "Enter") {
      if (editingId) {
        e.preventDefault();
        saveEdit();
        return;
      }
      if (document.activeElement === compose) {
        e.preventDefault();
        addEntry();
        return;
      }
    }

    if (e.key === "Escape") {
      if (syncConfigured && syncModal && !syncModal.hidden) {
        closeSyncModal();
        return;
      }
      if (editingId) {
        cancelEdit();
        return;
      }
      if (searchInput.value) {
        clearSearch();
        render();
        searchInput.focus();
        return;
      }
      if (document.activeElement === searchInput) {
        searchInput.blur();
        return;
      }
    }

    if (e.key === "/" && !isTyping() && !editingId) {
      e.preventDefault();
      searchInput.focus();
    }
  });

  document.getElementById("exportBtn").addEventListener("click", exportJSON);

  document.getElementById("importBtn").addEventListener("click", function () {
    fileInput.click();
  });

  fileInput.addEventListener("change", function (e) {
    var file = e.target.files && e.target.files[0];
    if (file) importFile(file);
    e.target.value = "";
  });

  window.addEventListener("beforeunload", saveDraft);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") saveDraft();
  });

  /* ---------------------------------------------------------
     初始化
     --------------------------------------------------------- */

  function init() {
    entries = loadEntries();
    entries.sort(function (a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    restoreDraft();
    updateComposer();
    autoGrow(compose, 360);
    updateToday();
    render();

    if (!storageOk) {
      toast("浏览器禁用了本地存储，记录可能无法保存", { duration: 6000 });
    }

    initSync();

    var lastDay = dayKey(new Date());
    setInterval(function () {
      updateToday();
      var key = dayKey(new Date());
      if (key !== lastDay) {
        lastDay = key;
        render();
      }
    }, 60000);
  }

  init();
})();
