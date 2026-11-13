// Repo Grouping for GitHub — 设置面板
// 只读写 chrome.storage.local 里的设置（样式、是否显示原生列表），不碰任何账号的分组数据。
// 内容脚本监听变化，已打开的 GitHub 页面会立即更新。同样不发任何网络请求。
(() => {
  'use strict';

  const SETTINGS_KEY = 'ghg:settings';
  const LEGACY_KEY = 'ghg:v1'; // 旧原型把设置和分组存在一起，只用来显示旧的样式选择
  const STYLES = ['card', 'band', 'bold']; // 和 content.js 保持一致
  const DEFAULT_STYLE = 'card';

  // 界面文字：中文浏览器显示中文，其他一律英文
  const I18N = {
    en: {
      style: 'Group style', card: 'Card', default: '(default)', cardDesc: 'One card per group, clearest edges',
      band: 'Title band', bandDesc: 'Shaded title + thin side bar',
      bold: 'Wings', boldDesc: 'Lightest; lines reach the edge',
      showNative: "Also show GitHub's original Top repositories list",
      safeTitle: '🔒 No login · Nothing uploaded',
      safeBody: 'Groups are kept per GitHub account, only in this browser on this computer, and are never sent to the developer or any third-party server. The "read and change your data on github.com" prompt at install time is what lets the extension show groups in the home page sidebar.',
      saved: 'Saved', saveFailed: 'Save failed, please try again', readFailed: 'Could not read settings',
    },
    zh: {
      style: '分组样式', card: '卡片', default: '（默认）', cardDesc: '每组一张卡片，边界最清楚',
      band: '标题色带', bandDesc: '标题横条 + 左侧细色条',
      bold: '长两翼', boldDesc: '最轻，线条延伸到右边缘',
      showNative: '同时显示 GitHub 原生的 Top repositories 列表',
      safeTitle: '🔒 不需要登录 · 不上传任何数据',
      safeBody: '分组按 GitHub 账号分开，只保存在这台电脑的浏览器里，不会发给开发者或任何第三方服务器。安装时 Chrome 提示的「读取和更改 github.com 上的数据」，是为了在首页侧边栏里显示分组。',
      saved: '已保存', saveFailed: '保存失败，请重试', readFailed: '读取设置失败',
    },
  };
  const zh = /^zh\b/i.test(navigator.language || '');
  const T = zh ? I18N.zh : I18N.en;
  document.documentElement.lang = zh ? 'zh-CN' : 'en';
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const v = T[el.dataset.i18n];
    if (v) el.textContent = v;
  }
  for (const el of document.querySelectorAll('[data-i18n-aria]')) {
    const v = T[el.dataset.i18nAria];
    if (v) el.setAttribute('aria-label', v);
  }

  // 直接打开 popup.html 预览时没有 chrome.storage，退回到内存
  const area = globalThis.chrome?.storage?.local;
  const mem = {};
  const storage = area || {
    get: async (keys) => Object.fromEntries([].concat(keys).map((k) => [k, mem[k]])),
    set: async (obj) => { Object.assign(mem, obj); },
  };

  const sanitize = (raw) => {
    const r = raw && typeof raw === 'object' ? raw : {};
    return { style: STYLES.includes(r.style) ? r.style : DEFAULT_STYLE, showNative: r.showNative === true };
  };

  const savedEl = document.getElementById('saved');
  let timer = 0;
  const flash = (text) => {
    savedEl.textContent = text;
    clearTimeout(timer);
    timer = setTimeout(() => { savedEl.textContent = ''; }, 1500);
  };

  // 面板里的当前设置是唯一来源；每次改动都写入完整设置，并且排队依次写，
  // 连续快速修改两项也不会互相覆盖。
  let current = sanitize(null);
  let chain = Promise.resolve();
  function update(patch) {
    current = { ...current, ...patch };
    const snapshot = current;
    chain = chain.then(async () => {
      try {
        await storage.set({ [SETTINGS_KEY]: snapshot });
        flash(T.saved);
      } catch (e) {
        console.warn('[Repo Grouping] Save failed:', e);
        flash(T.saveFailed);
      }
    });
  }

  async function init() {
    try {
      const got = await storage.get([SETTINGS_KEY, LEGACY_KEY]);
      current = sanitize(got[SETTINGS_KEY] ?? got[LEGACY_KEY]);
    } catch (e) {
      console.warn('[Repo Grouping] Could not read settings:', e);
      flash(T.readFailed);
    }
    for (const r of document.querySelectorAll('input[name="style"]')) {
      r.checked = r.value === current.style;
      r.addEventListener('change', () => { if (r.checked && STYLES.includes(r.value)) update({ style: r.value }); });
    }
    const native = document.getElementById('showNative');
    native.checked = current.showNative;
    native.addEventListener('change', () => update({ showNative: native.checked }));
  }

  init();
})();
