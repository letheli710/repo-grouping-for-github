// Repo Grouping for GitHub — 设置面板
// 只读写 chrome.storage.local 里的设置（样式、是否显示原生列表、界面语言），不碰任何账号的分组数据。
// 内容脚本监听变化，已打开的 GitHub 页面会立即更新。同样不发任何网络请求。
(() => {
  'use strict';

  const SETTINGS_KEY = 'ghg:settings';
  const LEGACY_KEY = 'ghg:v1'; // 旧原型把设置和分组存在一起，只用来显示旧的样式选择
  const STYLES = ['card', 'band', 'bold']; // 和 content.js 保持一致
  const DEFAULT_STYLE = 'card';

  // 界面文字：跟随浏览器语言，支持 10 种，其他语言显示英文；缺失条目回退到英文。
  // 改动时请同步 content.js 和 _locales/。
  const I18N = {
    en: {
      style: 'Group style', card: 'Card', default: '(default)', cardDesc: 'One card per group, clearest edges',
      band: 'Title band', bandDesc: 'Shaded title + thin side bar',
      bold: 'Wings', boldDesc: 'Lightest; lines reach the edge',
      showNative: "Also show GitHub's original Top repositories list",
      safeTitle: '🔒 No login · Nothing uploaded',
      safeBody: 'Groups are kept per GitHub account, only in this browser on this computer, and are never sent to the developer or any third-party server. The "read and change your data on github.com" prompt at install time is what lets the extension show groups in the home page sidebar.',
      saved: 'Saved', saveFailed: 'Save failed, please try again', readFailed: 'Could not read settings',
      language: 'Language', auto: 'Follow browser',
    },
    zh: {
      style: '分组样式', card: '卡片', default: '（默认）', cardDesc: '每组一张卡片，边界最清楚',
      band: '标题色带', bandDesc: '标题横条 + 左侧细色条',
      bold: '长两翼', boldDesc: '最轻，线条延伸到右边缘',
      showNative: '同时显示 GitHub 原生的 Top repositories 列表',
      safeTitle: '🔒 不需要登录 · 不上传任何数据',
      safeBody: '分组按 GitHub 账号分开，只保存在这台电脑的浏览器里，不会发给开发者或任何第三方服务器。安装时 Chrome 提示的「读取和更改 github.com 上的数据」，是为了在首页侧边栏里显示分组。',
      saved: '已保存', saveFailed: '保存失败，请重试', readFailed: '读取设置失败',
      language: '界面语言', auto: '跟随浏览器',
    },
    zh_TW: {
      style: '群組樣式', card: '卡片', default: '（預設）', cardDesc: '每組一張卡片，邊界最清楚',
      band: '標題色帶', bandDesc: '標題橫條 + 左側細色條',
      bold: '長兩翼', boldDesc: '最輕，線條延伸到右邊緣',
      showNative: '同時顯示 GitHub 原生的 Top repositories 列表',
      safeTitle: '🔒 不需要登入 · 不上傳任何資料',
      safeBody: '群組按 GitHub 帳號分開，只儲存在這台電腦的瀏覽器裡，不會傳給開發者或任何第三方伺服器。安裝時 Chrome 提示的「讀取和變更 github.com 上的資料」，是為了在首頁側邊欄顯示群組。',
      saved: '已儲存', saveFailed: '儲存失敗，請重試', readFailed: '讀取設定失敗',
      language: '介面語言', auto: '跟隨瀏覽器',
    },
    ja: {
      style: 'グループのスタイル', card: 'カード', default: '（デフォルト）', cardDesc: 'グループごとにカード表示、境界がいちばん明確',
      band: 'タイトル帯', bandDesc: '色付きタイトル + 左側の細いライン',
      bold: 'ウイング', boldDesc: 'いちばん軽量、線が右端まで伸びる',
      showNative: 'GitHub の元の Top repositories リストも表示',
      safeTitle: '🔒 ログイン不要 · データ送信なし',
      safeBody: 'グループは GitHub アカウントごとに、このパソコンのブラウザ内だけに保存され、開発者や第三者のサーバーに送信されることはありません。インストール時に表示される「github.com 上のデータの読み取りと変更」は、ホームのサイドバーにグループを表示するために必要な権限です。',
      saved: '保存しました', saveFailed: '保存できませんでした。もう一度お試しください', readFailed: '設定を読み込めませんでした',
      language: '表示言語', auto: 'ブラウザに合わせる',
    },
    ko: {
      style: '그룹 스타일', card: '카드', default: '(기본)', cardDesc: '그룹마다 카드 하나, 경계가 가장 분명함',
      band: '제목 띠', bandDesc: '색칠된 제목 + 왼쪽 가는 선',
      bold: '날개', boldDesc: '가장 가벼움, 선이 오른쪽 끝까지',
      showNative: 'GitHub 원래 Top repositories 목록도 표시',
      safeTitle: '🔒 로그인 불필요 · 업로드 없음',
      safeBody: '그룹은 GitHub 계정별로 이 컴퓨터의 브라우저에만 저장되며, 개발자나 제3자 서버로 전송되지 않습니다. 설치할 때 표시되는 "github.com의 데이터 읽기 및 변경" 권한은 홈 사이드바에 그룹을 표시하는 데 필요합니다.',
      saved: '저장됨', saveFailed: '저장하지 못했습니다. 다시 시도해 주세요', readFailed: '설정을 읽지 못했습니다',
      language: '표시 언어', auto: '브라우저 설정 따르기',
    },
    es: {
      style: 'Estilo de los grupos', card: 'Tarjeta', default: '(predeterminado)', cardDesc: 'Una tarjeta por grupo, bordes más claros',
      band: 'Banda de título', bandDesc: 'Título sombreado + barra lateral fina',
      bold: 'Alas', boldDesc: 'El más ligero; las líneas llegan al borde',
      showNative: 'Mostrar también la lista original de Top repositories de GitHub',
      safeTitle: '🔒 Sin iniciar sesión · No se sube nada',
      safeBody: 'Los grupos se guardan por cuenta de GitHub, solo en este navegador de este ordenador, y nunca se envían al desarrollador ni a servidores de terceros. El aviso «leer y cambiar tus datos en github.com» al instalar es lo que permite mostrar los grupos en la barra lateral de la página de inicio.',
      saved: 'Guardado', saveFailed: 'No se pudo guardar; inténtalo de nuevo', readFailed: 'No se pudieron leer los ajustes',
      language: 'Idioma', auto: 'Igual que el navegador',
    },
    fr: {
      style: 'Style des groupes', card: 'Carte', default: '(par défaut)', cardDesc: 'Une carte par groupe, contours les plus nets',
      band: 'Bandeau de titre', bandDesc: 'Titre ombré + fine barre latérale',
      bold: 'Ailes', boldDesc: 'Le plus léger ; les lignes vont jusqu’au bord',
      showNative: 'Afficher aussi la liste Top repositories d’origine de GitHub',
      safeTitle: '🔒 Sans connexion · Rien n’est envoyé',
      safeBody: 'Les groupes sont enregistrés par compte GitHub, uniquement dans ce navigateur sur cet ordinateur, et ne sont jamais envoyés au développeur ni à un serveur tiers. L’avertissement « lire et modifier vos données sur github.com » à l’installation permet d’afficher les groupes dans la barre latérale de la page d’accueil.',
      saved: 'Enregistré', saveFailed: 'Échec de l’enregistrement, réessayez', readFailed: 'Impossible de lire les paramètres',
      language: 'Langue', auto: 'Comme le navigateur',
    },
    de: {
      style: 'Gruppenstil', card: 'Karte', default: '(Standard)', cardDesc: 'Eine Karte pro Gruppe, klarste Ränder',
      band: 'Titelband', bandDesc: 'Hinterlegter Titel + schmale Seitenleiste',
      bold: 'Flügel', boldDesc: 'Am leichtesten; Linien reichen bis zum Rand',
      showNative: 'Auch die ursprüngliche Top-repositories-Liste von GitHub anzeigen',
      safeTitle: '🔒 Kein Login · Nichts wird hochgeladen',
      safeBody: 'Gruppen werden pro GitHub-Konto nur in diesem Browser auf diesem Computer gespeichert und nie an den Entwickler oder Server Dritter gesendet. Der Hinweis „Ihre Daten auf github.com lesen und ändern“ bei der Installation ermöglicht es, Gruppen in der Seitenleiste der Startseite anzuzeigen.',
      saved: 'Gespeichert', saveFailed: 'Speichern fehlgeschlagen, bitte erneut versuchen', readFailed: 'Einstellungen konnten nicht gelesen werden',
      language: 'Sprache', auto: 'Wie im Browser',
    },
    pt_BR: {
      style: 'Estilo dos grupos', card: 'Cartão', default: '(padrão)', cardDesc: 'Um cartão por grupo, bordas mais claras',
      band: 'Faixa de título', bandDesc: 'Título sombreado + barra lateral fina',
      bold: 'Asas', boldDesc: 'O mais leve; as linhas vão até a borda',
      showNative: 'Mostrar também a lista original Top repositories do GitHub',
      safeTitle: '🔒 Sem login · Nada é enviado',
      safeBody: 'Os grupos ficam salvos por conta do GitHub, só neste navegador e neste computador, e nunca são enviados ao desenvolvedor nem a servidores de terceiros. O aviso "ler e alterar seus dados em github.com" na instalação é o que permite mostrar os grupos na barra lateral da página inicial.',
      saved: 'Salvo', saveFailed: 'Falha ao salvar, tente novamente', readFailed: 'Não foi possível ler as configurações',
      language: 'Idioma', auto: 'Igual ao navegador',
    },
    ru: {
      style: 'Стиль групп', card: 'Карточки', default: '(по умолчанию)', cardDesc: 'Каждая группа — отдельная карточка, самые чёткие границы',
      band: 'Полоса заголовка', bandDesc: 'Заголовок с фоном + тонкая боковая полоса',
      bold: 'Крылья', boldDesc: 'Самый лёгкий; линии доходят до края',
      showNative: 'Показывать также исходный список Top repositories на GitHub',
      safeTitle: '🔒 Без входа · Ничего не отправляется',
      safeBody: 'Группы хранятся отдельно для каждого аккаунта GitHub, только в этом браузере на этом компьютере, и никогда не отправляются разработчику или сторонним серверам. Предупреждение «Просмотр и изменение ваших данных на github.com» при установке нужно, чтобы показывать группы на боковой панели главной страницы.',
      saved: 'Сохранено', saveFailed: 'Не удалось сохранить, попробуйте ещё раз', readFailed: 'Не удалось прочитать настройки',
      language: 'Язык', auto: 'Как в браузере',
    },
  };
  // 和 content.js 用同一套规则选语言
  function pickLang() {
    const tags = [...(navigator.languages || []), navigator.language].filter(Boolean);
    for (const tag of tags) {
      const t = tag.toLowerCase();
      if (t.startsWith('zh')) return /-(tw|hk|mo)(-|$)|hant/.test(t) ? 'zh_TW' : 'zh';
      if (t.startsWith('pt')) return 'pt_BR';
      const base = t.split('-')[0];
      if (Object.prototype.hasOwnProperty.call(I18N, base)) return base;
    }
    return 'en';
  }
  // 用户可以在面板里手动选语言；'auto' 表示跟随浏览器
  const LANGS = Object.keys(I18N);
  const HTML_LANG = { zh: 'zh-CN', zh_TW: 'zh-TW', pt_BR: 'pt-BR' };
  let T = I18N.en;
  function applyLang(choice) {
    const lang = LANGS.includes(choice) ? choice : pickLang();
    T = { ...I18N.en, ...I18N[lang] };
    document.documentElement.lang = HTML_LANG[lang] || lang;
    for (const el of document.querySelectorAll('[data-i18n]')) {
      const v = T[el.dataset.i18n];
      if (v) el.textContent = v;
    }
    for (const el of document.querySelectorAll('[data-i18n-aria]')) {
      const v = T[el.dataset.i18nAria];
      if (v) el.setAttribute('aria-label', v);
    }
  }
  applyLang('auto');

  // 直接打开 popup.html 预览时没有 chrome.storage，退回到内存
  const area = globalThis.chrome?.storage?.local;
  const mem = {};
  const storage = area || {
    get: async (keys) => Object.fromEntries([].concat(keys).map((k) => [k, mem[k]])),
    set: async (obj) => { Object.assign(mem, obj); },
  };

  const sanitize = (raw) => {
    const r = raw && typeof raw === 'object' ? raw : {};
    return {
      style: STYLES.includes(r.style) ? r.style : DEFAULT_STYLE,
      showNative: r.showNative === true,
      lang: LANGS.includes(r.lang) ? r.lang : 'auto',
    };
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
    if (current.lang !== 'auto') applyLang(current.lang);
    const langSel = document.getElementById('lang');
    langSel.value = current.lang;
    langSel.addEventListener('change', () => {
      const v = langSel.value === 'auto' || LANGS.includes(langSel.value) ? langSel.value : 'auto';
      applyLang(v);
      update({ lang: v });
    });
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
