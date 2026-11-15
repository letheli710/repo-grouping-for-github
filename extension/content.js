// Repo Grouping for GitHub — 内容脚本
//
// 安全约束（改代码前请先读）：
//   1. 不向开发者或任何第三方服务器发送数据：不用 fetch / XMLHttpRequest / WebSocket / sendBeacon。
//      会间接产生的请求只有两类，且都指向 GitHub 自己：
//      复用原生列表里同一个 avatars.githubusercontent.com 头像地址（通常命中缓存），
//      以及点击 GitHub 自己的「Show more」按钮展开侧边栏列表。
//   2. 不用 innerHTML / outerHTML / insertAdjacentHTML，所有文字都走 textContent。
//   3. 只在首页读取侧边栏仓库链接的 href，不读取页面上的其他内容。
//   4. 分组按 GitHub 账号分开存放；读不到登录账号时什么都不做。
//   5. 读取失败、出错或找不到挂载点时恢复 GitHub 原生列表，最坏结果是「和没装一样」。
(() => {
  'use strict';

  const NAV_SEL = 'nav[data-testid="dashboard-repositories"]';
  const ITEM_SEL = '[data-testid="dynamic-side-panel-items-item"]';
  const HOME_PATHS = new Set(['/', '/dashboard', '/feed']);
  const SETTINGS_KEY = 'ghg:settings';
  const GROUPS_PREFIX = 'ghg:groups:';
  const LEGACY_KEY = 'ghg:v1'; // 0.1 / 0.2 原型的全局数据，只在确认归属后迁移
  const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
  const AVATAR_PREFIX = 'https://avatars.githubusercontent.com/';
  const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
  const COLORS = ['accent', 'success', 'attention', 'severe', 'danger', 'done', 'sponsors'];
  const MAX_GROUPS = 100;
  const MAX_NAME = 40;
  const MAX_REPOS = 2000;
  const MAX_EXPAND_CLICKS = 10;
  const EXPAND_WAIT_MS = 3000;
  const LOAD_RETRY_MS = 5000;
  // 分组样式：卡片（默认）/ 标题色带 / 长两翼。和 popup.js 保持一致。
  const STYLES = ['card', 'band', 'bold'];
  const DEFAULT_STYLE = 'card';

  // ---------- 界面文字：跟随浏览器语言，支持 10 种，其他语言显示英文 ----------
  // 缺失的条目会回退到英文（见下方 pickLang / T 的合并）。改动时请同步 popup.js 和 _locales/。
  const I18N = {
    en: {
      newGroup: 'New group', settings: 'Settings',
      unsaved: "Some changes weren't saved and will be lost if you reload.", retry: 'Retry', discard: 'Discard changes',
      expand: 'Click to expand', collapse: 'Click to collapse', groupOptions: 'Group options',
      dropHere: 'Drag repositories here', ungrouped: 'Ungrouped', loadMore: 'Load more repositories',
      repoOptions: 'Move to group', groupName: 'Group name', moveTo: 'Move to group',
      newGroupMenu: '+ New group…', removeFrom: 'Remove from group',
      rename: 'Rename', color: 'Color', noColor: 'No color', deleteGroup: 'Delete group (repos go back to Ungrouped)',
      style: 'Group style', showNative: "Also show GitHub's original list", dropNew: 'Drop here to create a group',
      defaultName: 'New group',
      styles: { card: 'Card (default)', band: 'Title band', bold: 'Wings' },
      colors: { accent: 'Blue', success: 'Green', attention: 'Yellow', severe: 'Orange', danger: 'Red', done: 'Purple', sponsors: 'Pink' },
    },
    zh: {
      newGroup: '新建分组', settings: '设置',
      unsaved: '有修改没保存成功，刷新页面会丢失。', retry: '重试', discard: '撤销这些修改',
      expand: '点击展开', collapse: '点击折叠', groupOptions: '分组选项',
      dropHere: '把仓库拖到这里', ungrouped: '未分组', loadMore: '加载更多仓库',
      repoOptions: '移动到分组', groupName: '分组名称', moveTo: '移到分组',
      newGroupMenu: '＋ 新建分组…', removeFrom: '移出分组',
      rename: '重命名', color: '颜色', noColor: '无颜色', deleteGroup: '删除分组（仓库回到未分组）',
      style: '分组样式', showNative: '同时显示 GitHub 原生列表', dropNew: '拖到这里新建分组',
      defaultName: '新分组',
      styles: { card: '卡片（默认）', band: '标题色带', bold: '长两翼' },
      colors: { accent: '蓝', success: '绿', attention: '黄', severe: '橙', danger: '红', done: '紫', sponsors: '粉' },
    },
    zh_TW: {
      newGroup: '新增群組', settings: '設定',
      unsaved: '有變更尚未儲存，重新整理頁面就會遺失。', retry: '重試', discard: '捨棄這些變更',
      expand: '點擊展開', collapse: '點擊收合', groupOptions: '群組選項',
      dropHere: '把儲存庫拖到這裡', ungrouped: '未分組', loadMore: '載入更多儲存庫',
      repoOptions: '移到群組', groupName: '群組名稱', moveTo: '移到群組',
      newGroupMenu: '＋ 新增群組…', removeFrom: '移出群組',
      rename: '重新命名', color: '顏色', noColor: '無顏色', deleteGroup: '刪除群組（儲存庫回到未分組）',
      style: '群組樣式', showNative: '同時顯示 GitHub 原生列表', dropNew: '拖到這裡建立新群組',
      defaultName: '新群組',
      styles: { card: '卡片（預設）', band: '標題色帶', bold: '長兩翼' },
      colors: { accent: '藍', success: '綠', attention: '黃', severe: '橙', danger: '紅', done: '紫', sponsors: '粉' },
    },
    ja: {
      newGroup: '新しいグループ', settings: '設定',
      unsaved: '保存されていない変更があります。再読み込みすると失われます。', retry: '再試行', discard: '変更を破棄',
      expand: 'クリックで展開', collapse: 'クリックで折りたたむ', groupOptions: 'グループのオプション',
      dropHere: 'ここにリポジトリをドラッグ', ungrouped: '未分類', loadMore: 'さらにリポジトリを読み込む',
      repoOptions: 'グループに移動', groupName: 'グループ名', moveTo: 'グループに移動',
      newGroupMenu: '＋ 新しいグループ…', removeFrom: 'グループから外す',
      rename: '名前を変更', color: '色', noColor: '色なし', deleteGroup: 'グループを削除（リポジトリは未分類に戻ります）',
      style: 'グループのスタイル', showNative: 'GitHub の元のリストも表示', dropNew: 'ここにドロップして新しいグループを作成',
      defaultName: '新しいグループ',
      styles: { card: 'カード（デフォルト）', band: 'タイトル帯', bold: 'ウイング' },
      colors: { accent: '青', success: '緑', attention: '黄', severe: '橙', danger: '赤', done: '紫', sponsors: 'ピンク' },
    },
    ko: {
      newGroup: '새 그룹', settings: '설정',
      unsaved: '저장되지 않은 변경 사항이 있습니다. 새로고침하면 사라집니다.', retry: '다시 시도', discard: '변경 사항 버리기',
      expand: '클릭하여 펼치기', collapse: '클릭하여 접기', groupOptions: '그룹 옵션',
      dropHere: '여기로 저장소를 드래그하세요', ungrouped: '그룹 없음', loadMore: '저장소 더 불러오기',
      repoOptions: '그룹으로 이동', groupName: '그룹 이름', moveTo: '그룹으로 이동',
      newGroupMenu: '+ 새 그룹…', removeFrom: '그룹에서 제거',
      rename: '이름 바꾸기', color: '색상', noColor: '색상 없음', deleteGroup: '그룹 삭제 (저장소는 그룹 없음으로 돌아갑니다)',
      style: '그룹 스타일', showNative: 'GitHub 원래 목록도 표시', dropNew: '여기에 놓아 새 그룹 만들기',
      defaultName: '새 그룹',
      styles: { card: '카드 (기본)', band: '제목 띠', bold: '날개' },
      colors: { accent: '파랑', success: '초록', attention: '노랑', severe: '주황', danger: '빨강', done: '보라', sponsors: '분홍' },
    },
    es: {
      newGroup: 'Nuevo grupo', settings: 'Ajustes',
      unsaved: 'Algunos cambios no se guardaron y se perderán si recargas la página.', retry: 'Reintentar', discard: 'Descartar cambios',
      expand: 'Clic para expandir', collapse: 'Clic para contraer', groupOptions: 'Opciones del grupo',
      dropHere: 'Arrastra repositorios aquí', ungrouped: 'Sin grupo', loadMore: 'Cargar más repositorios',
      repoOptions: 'Mover a un grupo', groupName: 'Nombre del grupo', moveTo: 'Mover a un grupo',
      newGroupMenu: '+ Nuevo grupo…', removeFrom: 'Quitar del grupo',
      rename: 'Renombrar', color: 'Color', noColor: 'Sin color', deleteGroup: 'Eliminar grupo (los repositorios vuelven a Sin grupo)',
      style: 'Estilo de los grupos', showNative: 'Mostrar también la lista original de GitHub', dropNew: 'Suelta aquí para crear un grupo',
      defaultName: 'Nuevo grupo',
      styles: { card: 'Tarjeta (predeterminado)', band: 'Banda de título', bold: 'Alas' },
      colors: { accent: 'Azul', success: 'Verde', attention: 'Amarillo', severe: 'Naranja', danger: 'Rojo', done: 'Morado', sponsors: 'Rosa' },
    },
    fr: {
      newGroup: 'Nouveau groupe', settings: 'Paramètres',
      unsaved: 'Certaines modifications n’ont pas été enregistrées et seront perdues au rechargement.', retry: 'Réessayer', discard: 'Annuler les modifications',
      expand: 'Cliquer pour développer', collapse: 'Cliquer pour réduire', groupOptions: 'Options du groupe',
      dropHere: 'Glissez des dépôts ici', ungrouped: 'Sans groupe', loadMore: 'Charger plus de dépôts',
      repoOptions: 'Déplacer vers un groupe', groupName: 'Nom du groupe', moveTo: 'Déplacer vers un groupe',
      newGroupMenu: '+ Nouveau groupe…', removeFrom: 'Retirer du groupe',
      rename: 'Renommer', color: 'Couleur', noColor: 'Aucune couleur', deleteGroup: 'Supprimer le groupe (les dépôts reviennent dans Sans groupe)',
      style: 'Style des groupes', showNative: 'Afficher aussi la liste d’origine de GitHub', dropNew: 'Déposez ici pour créer un groupe',
      defaultName: 'Nouveau groupe',
      styles: { card: 'Carte (par défaut)', band: 'Bandeau de titre', bold: 'Ailes' },
      colors: { accent: 'Bleu', success: 'Vert', attention: 'Jaune', severe: 'Orange', danger: 'Rouge', done: 'Violet', sponsors: 'Rose' },
    },
    de: {
      newGroup: 'Neue Gruppe', settings: 'Einstellungen',
      unsaved: 'Einige Änderungen wurden nicht gespeichert und gehen beim Neuladen verloren.', retry: 'Erneut versuchen', discard: 'Änderungen verwerfen',
      expand: 'Zum Aufklappen klicken', collapse: 'Zum Zuklappen klicken', groupOptions: 'Gruppenoptionen',
      dropHere: 'Repositorys hierher ziehen', ungrouped: 'Ohne Gruppe', loadMore: 'Weitere Repositorys laden',
      repoOptions: 'In Gruppe verschieben', groupName: 'Gruppenname', moveTo: 'In Gruppe verschieben',
      newGroupMenu: '+ Neue Gruppe…', removeFrom: 'Aus Gruppe entfernen',
      rename: 'Umbenennen', color: 'Farbe', noColor: 'Keine Farbe', deleteGroup: 'Gruppe löschen (Repositorys kommen zurück zu „Ohne Gruppe“)',
      style: 'Gruppenstil', showNative: 'Auch die ursprüngliche GitHub-Liste anzeigen', dropNew: 'Hier ablegen, um eine Gruppe zu erstellen',
      defaultName: 'Neue Gruppe',
      styles: { card: 'Karte (Standard)', band: 'Titelband', bold: 'Flügel' },
      colors: { accent: 'Blau', success: 'Grün', attention: 'Gelb', severe: 'Orange', danger: 'Rot', done: 'Lila', sponsors: 'Pink' },
    },
    pt_BR: {
      newGroup: 'Novo grupo', settings: 'Configurações',
      unsaved: 'Algumas alterações não foram salvas e serão perdidas se você recarregar a página.', retry: 'Tentar novamente', discard: 'Descartar alterações',
      expand: 'Clique para expandir', collapse: 'Clique para recolher', groupOptions: 'Opções do grupo',
      dropHere: 'Arraste repositórios para cá', ungrouped: 'Sem grupo', loadMore: 'Carregar mais repositórios',
      repoOptions: 'Mover para um grupo', groupName: 'Nome do grupo', moveTo: 'Mover para um grupo',
      newGroupMenu: '+ Novo grupo…', removeFrom: 'Remover do grupo',
      rename: 'Renomear', color: 'Cor', noColor: 'Sem cor', deleteGroup: 'Excluir grupo (os repositórios voltam para Sem grupo)',
      style: 'Estilo dos grupos', showNative: 'Mostrar também a lista original do GitHub', dropNew: 'Solte aqui para criar um grupo',
      defaultName: 'Novo grupo',
      styles: { card: 'Cartão (padrão)', band: 'Faixa de título', bold: 'Asas' },
      colors: { accent: 'Azul', success: 'Verde', attention: 'Amarelo', severe: 'Laranja', danger: 'Vermelho', done: 'Roxo', sponsors: 'Rosa' },
    },
    ru: {
      newGroup: 'Новая группа', settings: 'Настройки',
      unsaved: 'Некоторые изменения не сохранены и пропадут после перезагрузки страницы.', retry: 'Повторить', discard: 'Отменить изменения',
      expand: 'Нажмите, чтобы развернуть', collapse: 'Нажмите, чтобы свернуть', groupOptions: 'Параметры группы',
      dropHere: 'Перетащите сюда репозитории', ungrouped: 'Без группы', loadMore: 'Загрузить ещё репозитории',
      repoOptions: 'Переместить в группу', groupName: 'Название группы', moveTo: 'Переместить в группу',
      newGroupMenu: '+ Новая группа…', removeFrom: 'Убрать из группы',
      rename: 'Переименовать', color: 'Цвет', noColor: 'Без цвета', deleteGroup: 'Удалить группу (репозитории вернутся в «Без группы»)',
      style: 'Стиль групп', showNative: 'Показывать также исходный список GitHub', dropNew: 'Отпустите здесь, чтобы создать группу',
      defaultName: 'Новая группа',
      styles: { card: 'Карточки (по умолчанию)', band: 'Полоса заголовка', bold: 'Крылья' },
      colors: { accent: 'Синий', success: 'Зелёный', attention: 'Жёлтый', severe: 'Оранжевый', danger: 'Красный', done: 'Фиолетовый', sponsors: 'Розовый' },
    },
  };

  // 按浏览器的语言偏好挑第一个支持的语言：繁体（台湾、香港、澳门、Hant）单独处理，葡萄牙语用巴西版
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
  // 设置里的 lang：'auto' 跟随浏览器，或者用户在设置面板里手动选的语言
  const LANGS = Object.keys(I18N);
  const HTML_LANG = { zh: 'zh-CN', zh_TW: 'zh-TW', pt_BR: 'pt-BR' };
  let T = null;
  let langUI = '';
  function applyLang(choice) {
    const lang = LANGS.includes(choice) ? choice : pickLang();
    if (lang === langUI) return;
    langUI = lang;
    // 某种语言缺条目时回退到英文
    T = {
      ...I18N.en,
      ...I18N[lang],
      styles: { ...I18N.en.styles, ...I18N[lang].styles },
      colors: { ...I18N.en.colors, ...I18N[lang].colors },
    };
  }
  applyLang('auto');

  // 重复注入（开发预览时）先拆掉旧实例
  if (typeof globalThis.__ghgTeardown === 'function') globalThis.__ghgTeardown();

  // 读不到登录账号（未登录、页面结构变化）时完全不工作，避免把分组显示给错误的人
  const loginRaw = document.querySelector('meta[name="user-login"]')?.content || '';
  if (!LOGIN_RE.test(loginRaw)) return;
  const login = loginRaw.toLowerCase();
  const GROUPS_KEY = GROUPS_PREFIX + login;

  const newId = () => Math.random().toString(36).slice(2, 10);

  // ---------- 存储 ----------
  // 扩展环境用 chrome.storage.local；在普通页面里预览时退回到内存。
  const area = globalThis.chrome?.storage?.local;
  const mem = globalThis.__ghgPreviewStore || (globalThis.__ghgPreviewStore = {});
  const storage = area || {
    get: async (keys) => Object.fromEntries([].concat(keys).map((k) => [k, mem[k]])),
    set: async (obj) => { Object.assign(mem, obj); },
    remove: async (key) => { delete mem[key]; },
  };
  const read = async (key) => (await storage.get(key))[key];

  function sanitizeSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return {
      // 不认识的样式（包括原型阶段删掉的 subtle / tabs）一律回到默认
      style: STYLES.includes(r.style) ? r.style : DEFAULT_STYLE,
      showNative: r.showNative === true,
      lang: LANGS.includes(r.lang) ? r.lang : 'auto',
    };
  }

  // 读进来的分组一律清洗：字段白名单、仓库名格式、长度和数量上限。
  function sanitizeGroups(raw) {
    const doc = { v: 2, rev: 0, groups: [] };
    if (!raw || typeof raw !== 'object') return doc;
    if (Number.isSafeInteger(raw.rev) && raw.rev > 0) doc.rev = raw.rev;
    const seen = new Set();
    let total = 0;
    const groups = Array.isArray(raw.groups) ? raw.groups.slice(0, MAX_GROUPS) : [];
    for (const g of groups) {
      if (!g || typeof g !== 'object') continue;
      const name = typeof g.name === 'string' ? g.name.trim().slice(0, MAX_NAME) : '';
      if (!name) continue;
      const repos = [];
      for (const r of Array.isArray(g.repos) ? g.repos : []) {
        if (typeof r === 'string' && REPO_RE.test(r) && !seen.has(r) && total < MAX_REPOS) {
          seen.add(r);
          repos.push(r);
          total++;
        }
      }
      doc.groups.push({
        id: typeof g.id === 'string' && /^[a-z0-9]{1,16}$/.test(g.id) ? g.id : newId(),
        name,
        color: COLORS.includes(g.color) ? g.color : null,
        collapsed: g.collapsed === true,
        repos,
      });
    }
    return doc;
  }

  // ---------- DOM 小工具（只用 textContent，不拼 HTML） ----------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c);
    return el;
  }

  const SVGNS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    plus: ['M8 3.5v9M3.5 8h9'],
    kebab: ['M3.5 8h.01M8 8h.01M12.5 8h.01'],
    chevron: ['M6 4l4 4-4 4'],
    sliders: [
      'M2 5h7M12.5 5H14M2 11h2M7.5 11H14',
      'M9 5a1.75 1.75 0 1 0 3.5 0a1.75 1.75 0 1 0 -3.5 0',
      'M4 11a1.75 1.75 0 1 0 3.5 0a1.75 1.75 0 1 0 -3.5 0',
    ],
    repo: ['M4.5 2.5h8v11h-8A1.5 1.5 0 0 1 3 12V4a1.5 1.5 0 0 1 1.5-1.5z', 'M3 11.5A1.5 1.5 0 0 1 4.5 10h8'],
  };
  function icon(name, cls) {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'ic ic-' + name + (cls ? ' ' + cls : ''));
    for (const d of ICONS[name]) {
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', d);
      svg.append(p);
    }
    return svg;
  }

  // ---------- 运行时状态 ----------
  let settings = sanitizeSettings(null);
  let doc = sanitizeGroups(null); // 当前账号的分组（界面看到的，可能含尚未保存成功的修改）
  let loaded = false;
  let loading = false;
  let loadFailedAt = 0;
  let legacy = null;
  let nativeOrder = [];
  const avatars = new Map();
  let host = null;
  let wrap = null;
  let menuEl = null;
  let menuAnchor = null;
  let closedAnchor = null;
  let drag = null;
  let renamingGid = null;
  let lastSig = '';
  let expand = { nav: null, clicks: 0, lastCount: 0, lastAt: 0, gaveUp: false, timer: 0 };
  let hasMore = false;
  // 保存相关
  let writeChain = Promise.resolve();
  let pendingWrites = 0;
  let failedOps = [];
  let settingsChain = Promise.resolve();
  let settingsFailed = false;

  const globalStyle = document.createElement('style');
  globalStyle.textContent = `html.ghg-hide-native ${NAV_SEL}{display:none !important}`;
  document.head.append(globalStyle);
  const setNativeHidden = (b) => document.documentElement.classList.toggle('ghg-hide-native', b);

  // ---------- 读取 ----------
  async function load() {
    if (loading) return;
    loading = true;
    try {
      const got = await storage.get([SETTINGS_KEY, GROUPS_KEY, LEGACY_KEY]);
      settings = sanitizeSettings(got[SETTINGS_KEY] ?? got[LEGACY_KEY]);
      doc = sanitizeGroups(got[GROUPS_KEY]);
      legacy = got[GROUPS_KEY] === undefined && got[LEGACY_KEY] ? got[LEGACY_KEY] : null;
      loaded = true;
    } catch (err) {
      // 读取失败 ≠ 没有数据：不接管侧边栏，免得在空数据上编辑后覆盖旧分组
      loadFailedAt = Date.now();
      console.warn('[Repo Grouping] Could not read groups; leaving the sidebar untouched:', err);
    } finally {
      loading = false;
    }
    schedule();
  }

  // 旧版原型把所有账号的分组存在同一个键里。只有当大部分仓库属于当前账号
  // （owner 是自己，或者出现在自己的 Top repositories 里）时才迁移，否则原样留着。
  function maybeMigrateLegacy(order) {
    if (!legacy || !order.length) return;
    const old = sanitizeGroups(legacy);
    legacy = null;
    const repos = old.groups.flatMap((g) => g.repos);
    const mine = repos.filter((r) => r.split('/')[0].toLowerCase() === login || order.includes(r)).length;
    if (!repos.length || mine / repos.length < 0.5) return;
    const migrated = old.groups;
    commit((d) => { if (d.groups.length === 0) d.groups = structuredClone(migrated); }, { removeLegacy: true });
    updateSettings({});
  }

  // ---------- 读取原生列表 ----------
  function readNative(nav) {
    const order = [];
    for (const a of nav.querySelectorAll(ITEM_SEL)) {
      const full = (a.getAttribute('href') || '').replace(/^\//, '');
      if (!REPO_RE.test(full) || order.includes(full)) continue;
      order.push(full);
      // 只复用 GitHub 头像服务器上的地址，别的来源一律不用
      const src = a.querySelector('img')?.src;
      if (src && src.startsWith(AVATAR_PREFIX)) avatars.set(full, src);
    }
    return order;
  }

  // 原生列表默认只显示一部分。每次有新仓库加载出来才继续点「Show more」，
  // 最多点 MAX_EXPAND_CLICKS 次；停下后在界面里给一个手动「加载更多」入口。
  const findMore = (nav) => [...nav.querySelectorAll('button')]
    .find((b) => /^\s*show more\s*$/i.test(b.textContent) && !b.disabled && !b.hidden);

  function maybeExpand(nav, count) {
    if (expand.nav !== nav) {
      clearTimeout(expand.timer);
      expand = { nav, clicks: 0, lastCount: 0, lastAt: 0, gaveUp: false, timer: 0 };
    }
    const more = findMore(nav);
    hasMore = !!more;
    if (!more || expand.gaveUp) return;
    const waiting = expand.clicks > 0 && count <= expand.lastCount;
    if (waiting && Date.now() - expand.lastAt < EXPAND_WAIT_MS) {
      if (!expand.timer) expand.timer = setTimeout(() => { expand.timer = 0; schedule(); }, EXPAND_WAIT_MS);
      return;
    }
    if (waiting || expand.clicks >= MAX_EXPAND_CLICKS) {
      expand.gaveUp = true;
      return;
    }
    expand.clicks++;
    expand.lastCount = count;
    expand.lastAt = Date.now();
    more.click();
  }

  // ---------- 挂载 ----------
  function ensureMounted(nav) {
    const anchor = nav.closest('react-partial') || nav;
    if (host && host.isConnected && host.nextElementSibling === anchor) return false;
    unmount();
    host = h('div', { id: 'ghg-root' });
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    wrap = h('div', { class: 'wrap' });
    shadow.append(style, wrap);
    // 插在 React 根节点外面，GitHub 重渲染时不会把我们冲掉
    anchor.before(host);
    bindDnD(wrap);
    return true;
  }

  function unmount() {
    closeMenu();
    endDrag();
    host?.remove();
    host = null;
    wrap = null;
    lastSig = '';
    setNativeHidden(false);
  }

  function sync() {
    try {
      if (!HOME_PATHS.has(location.pathname)) { unmount(); return; }
      const nav = document.querySelector(NAV_SEL);
      if (!nav) { unmount(); return; }
      if (!loaded) {
        if (!loading && Date.now() - loadFailedAt > LOAD_RETRY_MS) load();
        unmount();
        return;
      }
      const order = readNative(nav);
      maybeMigrateLegacy(order);
      maybeExpand(nav, order.length);
      const remounted = ensureMounted(nav);
      const sig = order.join('|') + '#' + (hasMore && expand.gaveUp ? 1 : 0);
      if (remounted || sig !== lastSig) {
        nativeOrder = order;
        lastSig = sig;
        render();
      }
      // 自己的列表画成功之后，才隐藏原生列表
      setNativeHidden(!settings.showNative);
    } catch (err) {
      console.warn('[Repo Grouping] Error; restored the native list:', err);
      unmount();
    }
  }

  // ---------- 保存 ----------
  // 每次修改都是一个「操作」：先在本地生效让界面立即响应，再排队保存。
  // 保存时读出存储里最新的数据、在上面重放操作再写回，所以其他标签页刚做的修改不会被覆盖。
  function commit(op, opts = {}) {
    op(doc);
    render();
    persist([op], opts);
  }

  function persist(ops, opts = {}) {
    const batch = failedOps.concat(ops);
    failedOps = [];
    pendingWrites++;
    writeChain = writeChain.then(async () => {
      try {
        const latest = sanitizeGroups(await read(GROUPS_KEY));
        for (const op of batch) op(latest);
        latest.rev += 1;
        await storage.set({ [GROUPS_KEY]: latest });
        if (opts.removeLegacy) await storage.remove(LEGACY_KEY);
        pendingWrites--;
        if (pendingWrites === 0 && failedOps.length === 0) adopt(latest);
      } catch (err) {
        pendingWrites--;
        failedOps = batch.concat(failedOps);
        console.warn('[Repo Grouping] Save failed:', err);
        render();
      }
    });
  }

  // 保存成功后采用存储里的版本（可能合并了其他标签页的修改）
  function adopt(latest) {
    const changed = JSON.stringify(latest.groups) !== JSON.stringify(doc.groups);
    doc = latest;
    if (changed || !settingsFailed) render();
  }

  function updateSettings(patch) {
    settings = { ...settings, ...patch };
    render();
    if (wrap) setNativeHidden(!settings.showNative);
    const snapshot = settings;
    settingsChain = settingsChain.then(async () => {
      try {
        await storage.set({ [SETTINGS_KEY]: snapshot });
        if (settingsFailed) { settingsFailed = false; render(); }
      } catch (err) {
        settingsFailed = true;
        console.warn('[Repo Grouping] Saving settings failed:', err);
        render();
      }
    });
  }

  function retrySave() {
    if (failedOps.length) persist([]);
    if (settingsFailed) updateSettings({});
  }

  async function discardUnsaved() {
    try {
      const got = await storage.get([SETTINGS_KEY, GROUPS_KEY]);
      failedOps = [];
      settingsFailed = false;
      if (got[SETTINGS_KEY]) settings = sanitizeSettings(got[SETTINGS_KEY]);
      doc = sanitizeGroups(got[GROUPS_KEY]);
      render();
      if (wrap) setNativeHidden(!settings.showNative);
    } catch (err) {
      console.warn('[Repo Grouping] Reload failed:', err);
    }
  }

  // ---------- 数据操作（都作用在传入的数据上，只按 id 和仓库名定位） ----------
  const findGroup = (d, id) => d.groups.find((g) => g.id === id);

  function removeRepoIn(d, full) {
    for (const g of d.groups) {
      const i = g.repos.indexOf(full);
      if (i >= 0) g.repos.splice(i, 1);
    }
  }

  function moveRepoIn(d, full, gid, ref, after) {
    const g = findGroup(d, gid);
    if (!g) return; // 目标分组可能已在其他标签页被删掉
    removeRepoIn(d, full);
    if (d.groups.reduce((n, x) => n + x.repos.length, 0) >= MAX_REPOS) return;
    let i = ref ? g.repos.indexOf(ref) : -1;
    i = i < 0 ? g.repos.length : i + (after ? 1 : 0);
    g.repos.splice(i, 0, full);
  }

  function setGroupIn(d, id, patch) {
    const g = findGroup(d, id);
    if (g) Object.assign(g, patch);
  }

  function moveGroupIn(d, id, targetId, after) {
    const g = findGroup(d, id);
    if (!g) return;
    d.groups = d.groups.filter((x) => x !== g);
    let i = d.groups.findIndex((x) => x.id === targetId);
    i = i < 0 ? d.groups.length : i + (after ? 1 : 0);
    d.groups.splice(i, 0, g);
  }

  function createGroup(repo) {
    if (doc.groups.length >= MAX_GROUPS) return;
    const id = newId();
    renamingGid = id;
    commit((d) => {
      if (d.groups.length >= MAX_GROUPS || findGroup(d, id)) return;
      d.groups.push({ id, name: T.defaultName, color: null, collapsed: false, repos: [] });
      if (repo) moveRepoIn(d, repo, id, null, false);
    });
  }

  // ---------- 渲染 ----------
  function render() {
    if (!wrap) return;
    const grouped = new Set(doc.groups.flatMap((g) => g.repos));
    const ungrouped = nativeOrder.filter((r) => !grouped.has(r));
    closeMenu();
    // 每次重绘都按当前设置取语言，设置面板里改了语言，已打开的页面会立即切换
    applyLang(settings.lang);
    wrap.lang = HTML_LANG[langUI] || langUI;
    wrap.className = 'wrap style-' + settings.style;
    // replaceChildren 不会展开数组，这里先 flat
    wrap.replaceChildren(...[
      header(),
      failedOps.length || settingsFailed ? saveBanner() : null,
      doc.groups.map(groupEl),
      ungroupedEl(ungrouped),
      h('div', { class: 'new-drop' }, icon('plus'), T.dropNew),
    ].flat(Infinity).filter(Boolean));
  }

  function header() {
    return h('div', { class: 'head' },
      h('h3', { text: 'Top repositories' }),
      h('span', { class: 'spacer' }),
      h('button', { class: 'icon-btn', title: T.newGroup, 'aria-label': T.newGroup, 'data-act': 'new-group', onclick: () => createGroup() }, icon('plus')),
      h('button', {
        class: 'icon-btn', title: T.settings, 'aria-label': T.settings, 'data-act': 'settings',
        onclick: (e) => openMenu(e.currentTarget, settingsMenu()),
      }, icon('sliders')),
    );
  }

  function saveBanner() {
    return h('div', { class: 'banner', role: 'alert' },
      h('span', { text: T.unsaved }),
      h('button', { onclick: retrySave }, T.retry),
      h('button', { onclick: discardUnsaved }, T.discard),
    );
  }

  function groupEl(g) {
    const sec = h('section', {
      class: 'group' + (g.collapsed ? ' collapsed' : '') + (g.color ? ' colored' : ''),
      'data-gid': g.id,
      // g.color 来自白名单，拼进 style 是安全的
      style: g.color ? `--ghg-c: var(--fgColor-${g.color})` : null,
    });
    const nameEl = renamingGid === g.id ? renameInput(g) : h('span', { class: 'g-name', text: g.name });
    const head = h('div', {
      class: 'g-head', draggable: 'true', title: g.collapsed ? T.expand : T.collapse,
      onclick: (e) => {
        if (e.target.closest('button, input')) return;
        const next = !g.collapsed;
        commit((d) => setGroupIn(d, g.id, { collapsed: next }));
      },
    },
      nameEl,
      h('span', { class: 'g-count', text: String(g.repos.length) }),
      icon('chevron', 'chev'),
      h('span', { class: 'wing' }),
      h('button', {
        class: 'icon-btn g-more', 'aria-label': T.groupOptions,
        onclick: (e) => openMenu(e.currentTarget, groupMenu(g)),
      }, icon('kebab')),
    );
    sec.append(head);
    if (!g.collapsed) {
      sec.append(h('ul', { class: 'list' },
        g.repos.map((r) => repoEl(r, g)),
        g.repos.length ? null : h('li', { class: 'empty', text: T.dropHere }),
      ));
    }
    return sec;
  }

  function ungroupedEl(list) {
    return h('section', { class: 'ungrouped' },
      doc.groups.length
        ? h('div', { class: 'u-head' }, h('span', { text: T.ungrouped }), h('span', { class: 'g-count', text: String(list.length) }))
        : null,
      h('ul', { class: 'list' }, list.map((r) => repoEl(r, null))),
      hasMore && expand.gaveUp
        ? h('button', {
          class: 'more-btn',
          onclick: () => {
            expand.gaveUp = false;
            expand.clicks = 0;
            expand.lastCount = 0;
            schedule();
          },
        }, T.loadMore)
        : null,
    );
  }

  function repoEl(full, g) {
    const [owner, name] = full.split('/');
    // 头像复用原生列表里的同一个地址；没有头像时用本地绘制的仓库图标
    const av = avatars.get(full);
    const a = h('a', { href: '/' + full, title: full, draggable: 'false' },
      av ? h('img', { class: 'av', src: av, alt: '', width: 16, height: 16, draggable: 'false' }) : icon('repo'),
      h('span', { class: 'label' },
        owner.toLowerCase() === login ? null : h('span', { class: 'owner', text: owner + '/' }),
        h('span', { class: 'name', text: name }),
      ),
    );
    return h('li', { class: 'repo', draggable: 'true', 'data-repo': full },
      a,
      h('button', {
        class: 'icon-btn r-more', 'aria-label': T.repoOptions,
        onclick: (e) => openMenu(e.currentTarget, repoMenu(full, g)),
      }, icon('kebab')),
    );
  }

  function renameInput(g) {
    const id = g.id;
    const oldName = g.name;
    const input = h('input', { class: 'g-input', value: oldName, maxlength: MAX_NAME, 'aria-label': T.groupName });
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      renamingGid = null;
      const v = input.value.trim().slice(0, MAX_NAME);
      if (ok && v && v !== oldName) commit((d) => setGroupIn(d, id, { name: v }));
      else render();
    };
    // 拦住按键，避免触发 GitHub 的键盘快捷键
    for (const t of ['keydown', 'keypress', 'keyup']) input.addEventListener(t, (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    requestAnimationFrame(() => {
      if (!input.isConnected) return;
      input.focus();
      input.select();
    });
    return input;
  }

  // ---------- 菜单 ----------
  // 菜单用 fixed 定位，按窗口剩余空间决定向下还是向上展开，放不下时菜单内部滚动；
  // 窗口缩放或页面滚动时重新定位，按钮离开可视区域就关闭。
  function openMenu(anchor, items) {
    if (closedAnchor === anchor) return; // 再点一次同一个按钮 = 关闭
    closeMenu();
    const m = h('div', { class: 'menu', role: 'menu' }, items);
    wrap.append(m);
    menuEl = m;
    menuAnchor = anchor;
    placeMenu();
  }

  function placeMenu() {
    if (!menuEl) return;
    if (!menuAnchor || !menuAnchor.isConnected) { closeMenu(); return; }
    const ar = menuAnchor.getBoundingClientRect();
    const vw = innerWidth;
    const vh = innerHeight;
    const EDGE = 8;
    const GAP = 4;
    if (ar.bottom < 0 || ar.top > vh) { closeMenu(); return; }
    const m = menuEl;
    m.style.maxHeight = 'none';
    m.style.top = '0px';
    m.style.left = '0px';
    const natural = m.offsetHeight;
    const width = m.offsetWidth;
    const below = Math.max(0, vh - ar.bottom - GAP - EDGE);
    const above = Math.max(0, ar.top - GAP - EDGE);
    let top;
    let maxH;
    if (natural <= below || below >= above) {
      maxH = below;
      top = ar.bottom + GAP;
    } else {
      maxH = above;
      top = ar.top - GAP - Math.min(natural, above);
    }
    const left = Math.min(Math.max(EDGE, ar.right - width), Math.max(EDGE, vw - width - EDGE));
    // 向下展开时高度上限跟随视口：窗口变矮的那一刻 CSS 就会收缩，不必等 resize 事件
    m.style.maxHeight = maxH === below
      ? `max(0px, calc(100vh - ${Math.round(top) + EDGE}px))`
      : Math.floor(maxH) + 'px';
    m.style.top = Math.round(top) + 'px';
    m.style.left = Math.round(left) + 'px';
    // 祖先元素有 transform 时 fixed 会相对它定位，按实际位置校正一次
    const r = m.getBoundingClientRect();
    if (Math.abs(r.top - top) > 1 || Math.abs(r.left - left) > 1) {
      m.style.top = Math.round(2 * top - r.top) + 'px';
      m.style.left = Math.round(2 * left - r.left) + 'px';
    }
  }

  function closeMenu() {
    menuEl?.remove();
    menuEl = null;
    menuAnchor = null;
  }

  function onDocClick(e) {
    if (!menuEl) return;
    const path = e.composedPath();
    if (path.includes(menuEl)) return;
    closedAnchor = path.includes(menuAnchor) ? menuAnchor : null;
    closeMenu();
    setTimeout(() => { closedAnchor = null; }, 0);
  }

  function onDocKey(e) {
    if (e.key === 'Escape' && menuEl) closeMenu();
  }

  // 定位只是读几个矩形、写几个样式，开销很小，直接同步执行，避免窗口变化后有一帧菜单停在旧位置
  function onViewportChange() {
    if (menuEl) placeMenu();
  }

  const mi = (label, fn, opts = {}) => h('button', {
    class: 'mi' + (opts.danger ? ' danger' : ''), role: 'menuitem',
    onclick: () => { closeMenu(); fn(); },
  },
    'checked' in opts ? h('span', { class: 'check', text: opts.checked ? '✓' : '' }) : null,
    h('span', { class: 'mi-text', text: label }),
  );
  const msep = () => h('div', { class: 'sep' });
  const mlabel = (t) => h('div', { class: 'ml', text: t });

  function repoMenu(full, current) {
    const targets = doc.groups.filter((g) => g !== current);
    return [
      mlabel(T.moveTo),
      targets.map((g) => mi(g.name, () => commit((d) => moveRepoIn(d, full, g.id, null, false)))),
      mi(T.newGroupMenu, () => createGroup(full)),
      current ? [msep(), mi(T.removeFrom, () => commit((d) => removeRepoIn(d, full)))] : null,
    ];
  }

  function groupMenu(g) {
    const id = g.id;
    const swatch = (c) => h('button', {
      class: 'sw' + (c ? '' : ' none') + (g.color === c ? ' on' : ''),
      title: c ? T.colors[c] : T.noColor, 'aria-label': c ? T.colors[c] : T.noColor,
      style: c ? `--sw: var(--fgColor-${c})` : null,
      onclick: () => { closeMenu(); commit((d) => setGroupIn(d, id, { color: c })); },
    });
    return [
      mi(T.rename, () => { renamingGid = id; render(); }),
      mlabel(T.color),
      h('div', { class: 'swatches' }, swatch(null), COLORS.map(swatch)),
      msep(),
      mi(T.deleteGroup, () => commit((d) => { d.groups = d.groups.filter((x) => x.id !== id); }), { danger: true }),
    ];
  }

  function settingsMenu() {
    return [
      mlabel(T.style),
      STYLES.map((s) => mi(T.styles[s], () => updateSettings({ style: s }), { checked: settings.style === s })),
      msep(),
      mi(T.showNative, () => updateSettings({ showNative: !settings.showNative }), { checked: settings.showNative }),
    ];
  }

  // ---------- 拖拽 ----------
  function bindDnD(root) {
    root.addEventListener('dragstart', (e) => {
      const el = e.target;
      const li = el.closest?.('li.repo');
      const gh = el.closest?.('.g-head');
      if (li) drag = { type: 'repo', repo: li.dataset.repo, el: li };
      else if (gh) drag = { type: 'group', gid: gh.parentElement.dataset.gid, el: gh.parentElement };
      else return;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', drag.repo || drag.gid);
      closeMenu();
      requestAnimationFrame(() => {
        drag?.el.classList.add('dragging');
        if (drag) root.classList.add('is-dragging');
      });
    });
    root.addEventListener('dragover', (e) => {
      if (!drag) return;
      const t = dropTarget(e);
      clearMarks();
      if (!t) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      t.el.classList.add('drop-' + t.pos);
    });
    root.addEventListener('dragleave', (e) => {
      if (!e.relatedTarget || !root.contains(e.relatedTarget)) clearMarks();
    });
    root.addEventListener('drop', (e) => {
      if (!drag) return;
      e.preventDefault();
      const t = dropTarget(e);
      const d = drag;
      endDrag();
      if (t) applyDrop(t, d);
    });
    root.addEventListener('dragend', endDrag);
  }

  function clearMarks() {
    wrap?.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach((x) =>
      x.classList.remove('drop-before', 'drop-after', 'drop-into'));
  }

  function endDrag() {
    drag?.el.classList.remove('dragging');
    wrap?.classList.remove('is-dragging');
    clearMarks();
    drag = null;
  }

  function dropTarget(e) {
    const el = e.target.nodeType === 1 ? e.target : e.target.parentElement;
    if (!el) return null;
    if (drag.type === 'repo') {
      const nd = el.closest('.new-drop');
      if (nd) return { kind: 'new', el: nd, pos: 'into' };
      const sec = el.closest('section.group, section.ungrouped');
      if (!sec) return null;
      if (sec.classList.contains('ungrouped')) return { kind: 'ungroup', el: sec, pos: 'into' };
      const gid = sec.dataset.gid;
      const li = el.closest('li.repo');
      if (li === drag.el) return null;
      if (li) {
        const r = li.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        return { kind: 'repo', gid, ref: li.dataset.repo, after, el: li, pos: after ? 'after' : 'before' };
      }
      return { kind: 'repo', gid, ref: null, after: false, el: sec, pos: 'into' };
    }
    const sec = el.closest('section.group');
    if (!sec || sec === drag.el) return null;
    const r = sec.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    return { kind: 'group', gid: sec.dataset.gid, after, el: sec, pos: after ? 'after' : 'before' };
  }

  function applyDrop(t, d) {
    if (t.kind === 'new') return createGroup(d.repo);
    if (t.kind === 'ungroup') return commit((s) => removeRepoIn(s, d.repo));
    if (t.kind === 'repo') return commit((s) => moveRepoIn(s, d.repo, t.gid, t.ref, t.after));
    if (t.kind === 'group') return commit((s) => moveGroupIn(s, d.gid, t.gid, t.after));
  }

  // ---------- 样式 ----------
  const CSS = `
:host { display: block; }
* { box-sizing: border-box; }
.wrap {
  position: relative; padding-bottom: 8px; font-size: 14px;
  color: var(--fgColor-default, #1f2328);
  --ghg-bracket: color-mix(in srgb, var(--fgColor-default, #1f2328) 18%, transparent);
}
.head { display: flex; align-items: center; gap: 2px; height: 32px; padding: 0 8px; }
.head h3 { margin: 0; font-size: 12px; font-weight: 600; color: var(--fgColor-muted, #59636e); }
.spacer { flex: 1; }
.icon-btn {
  all: unset; display: inline-grid; place-items: center; flex: none;
  width: 24px; height: 24px; border-radius: 6px; cursor: pointer;
  color: var(--fgColor-muted, #59636e);
}
.icon-btn:hover { background: var(--bgColor-neutral-muted, #818b981f); color: var(--fgColor-default, #1f2328); }
.icon-btn:focus-visible { outline: 2px solid var(--fgColor-accent, #0969da); outline-offset: -2px; }
.ic { fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; flex: none; }
.ic-kebab { stroke-width: 2.4; }

.banner {
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin: 2px 8px 8px; padding: 6px 8px;
  border-radius: 6px; font-size: 12px; color: var(--fgColor-danger, #d1242f);
  background: color-mix(in srgb, var(--fgColor-danger, #d1242f) 10%, transparent);
}
.banner button { all: unset; cursor: pointer; font-weight: 600; text-decoration: underline; }
.banner button:focus-visible { outline: 2px solid var(--fgColor-accent, #0969da); }

.list { list-style: none; margin: 0; padding: 0; }
.repo { position: relative; display: flex; align-items: center; margin: 0 8px; border-radius: 6px; }
.repo:hover { background: var(--bgColor-neutral-muted, #818b981f); }
.repo a {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; line-height: 20px; color: inherit; text-decoration: none; border-radius: 6px;
}
.repo a:focus-visible { outline: 2px solid var(--fgColor-accent, #0969da); outline-offset: -2px; }
.repo .av { border-radius: 50%; flex: none; }
.repo .ic-repo { color: var(--fgColor-muted, #59636e); }
.label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.owner { color: var(--fgColor-muted, #59636e); }
.r-more { position: absolute; right: 4px; visibility: hidden; }
.repo:hover .r-more, .r-more:focus-visible { visibility: visible; }
.more-btn {
  all: unset; display: block; margin: 4px 8px 0; padding: 6px 8px; border-radius: 6px;
  font-size: 12px; color: var(--fgColor-accent, #0969da); cursor: pointer;
}
.more-btn:hover { background: var(--bgColor-neutral-muted, #818b981f); }
.more-btn:focus-visible { outline: 2px solid var(--fgColor-accent, #0969da); }

/* ---- 分组公共部分：标题行、折叠、空组提示；左侧方括号是「长两翼」的基础，卡片和色带会覆盖它 ---- */
.group { position: relative; margin: 10px 8px 6px; }
.group::before {
  content: ''; position: absolute; left: 0; top: 12px; bottom: 0; width: 7px;
  border: 2px solid var(--ghg-bracket); border-right: none; border-radius: 3px 0 0 3px;
  pointer-events: none;
}
.group.colored { --ghg-bracket: color-mix(in srgb, var(--ghg-c) 70%, transparent); }
.g-head {
  position: relative; display: flex; align-items: center; gap: 6px; height: 24px; padding-left: 12px;
  font-size: 12px; font-weight: 600; color: var(--fgColor-muted, #59636e); cursor: pointer; user-select: none;
}
.group.colored .g-name { color: var(--ghg-c); }
.g-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.g-count { font-weight: 400; font-size: 12px; color: var(--fgColor-muted, #59636e); }
.chev { width: 12px; height: 12px; transform: rotate(90deg); transition: transform .15s; opacity: 0; }
.g-head:hover .chev, .collapsed .chev { opacity: 1; }
.collapsed .chev { transform: none; }
.wing { display: none; }
.g-more { position: absolute; right: 0; visibility: hidden; background: var(--bgColor-default, #fff); }
.g-head:hover .g-more, .g-more:focus-visible { visibility: visible; }
.group .list { padding: 2px 0 6px; }
.group .repo { margin: 0 0 0 10px; }
.group.collapsed { padding-bottom: 6px; }
.empty {
  margin: 2px 0 0 12px; padding: 6px 8px; font-size: 12px; color: var(--fgColor-muted, #59636e);
  border: 1px dashed var(--borderColor-default, #d1d9e0); border-radius: 6px;
}
.g-input {
  all: unset; min-width: 0; width: 140px; font: inherit; font-weight: 600;
  color: var(--fgColor-default, #1f2328); border-bottom: 1px solid var(--fgColor-accent, #0969da);
}

/* ---- 长两翼：方括号上下两条横线一直延伸到侧边栏右缘 ---- */
.style-bold .group { margin-right: 0; }
.style-bold .group .repo { margin-right: 8px; }
.style-bold .wing {
  display: block; flex: 1; min-width: 12px; height: 2px; margin-left: 2px;
  background: var(--ghg-bracket); border-radius: 1px;
}
.style-bold .group::after {
  content: ''; position: absolute; left: 7px; right: 0; bottom: 0; height: 2px;
  background: var(--ghg-bracket); border-radius: 0 1px 1px 0; pointer-events: none;
}

/* ---- 卡片（默认）：浅底 + 边框的圆角卡片 ---- */
.style-card .group {
  margin: 8px; padding: 2px 0 4px; border-radius: 8px;
  border: 1px solid var(--borderColor-default, #d1d9e0); background: var(--bgColor-muted, #f6f8fa);
}
.style-card .group::before { display: none; }
.style-card .g-head { height: 30px; padding: 0 6px 0 10px; color: var(--fgColor-default, #1f2328); }
.style-card .g-more { right: 4px; background: transparent; }
.style-card .group .repo { margin: 0 4px; }
.style-card .group.colored {
  border-color: color-mix(in srgb, var(--ghg-c) 45%, transparent);
  background: color-mix(in srgb, var(--ghg-c) 7%, var(--bgColor-default, #fff));
}
.style-card .group.collapsed { padding-bottom: 2px; }
.style-card .empty { margin: 2px 6px 4px; }

/* ---- 标题色带：标题是一条底色横条，组内左侧一条细色条 ---- */
.style-band .group { margin: 10px 8px 4px; }
.style-band .group::before {
  top: 32px; bottom: 6px; left: 4px; width: 3px; border: none; border-radius: 2px;
  background: var(--borderColor-default, #d1d9e0);
}
.style-band .group.colored::before { background: var(--ghg-c); }
.style-band .group.collapsed::before { display: none; }
.style-band .g-head {
  height: 28px; padding: 0 6px 0 10px; border-radius: 6px;
  background: var(--bgColor-neutral-muted, #818b981f); color: var(--fgColor-default, #1f2328);
}
.style-band .group.colored .g-head { background: color-mix(in srgb, var(--ghg-c) 14%, transparent); }
.style-band .g-more { background: transparent; }
.style-band .group .list { padding: 4px 0 2px; }
.style-band .group .repo { margin-left: 14px; }

/* ---- 未分组 ---- */
.ungrouped { margin-top: 10px; }
.u-head {
  display: flex; align-items: center; gap: 6px; height: 24px; padding-left: 20px;
  font-size: 12px; font-weight: 600; color: var(--fgColor-muted, #59636e);
}

/* ---- 拖拽反馈 ---- */
.dragging { opacity: .4; }
.repo.drop-before { box-shadow: inset 0 2px 0 var(--fgColor-accent, #0969da); }
.repo.drop-after { box-shadow: inset 0 -2px 0 var(--fgColor-accent, #0969da); }
.group.drop-before { box-shadow: 0 -3px 0 -1px var(--fgColor-accent, #0969da); }
.group.drop-after { box-shadow: 0 3px 0 -1px var(--fgColor-accent, #0969da); }
section.drop-into { background: var(--bgColor-accent-muted, #ddf4ff); border-radius: 6px; }
.new-drop {
  display: none; align-items: center; justify-content: center; gap: 6px;
  margin: 10px 8px 0; padding: 8px; font-size: 12px; color: var(--fgColor-muted, #59636e);
  border: 1px dashed var(--borderColor-default, #d1d9e0); border-radius: 6px;
}
.is-dragging .new-drop { display: flex; }
.new-drop.drop-into { color: var(--fgColor-accent, #0969da); border-color: var(--fgColor-accent, #0969da); background: var(--bgColor-accent-muted, #ddf4ff); }

/* ---- 菜单：fixed 定位，高度受窗口限制，放不下时内部滚动 ---- */
.menu {
  position: fixed; z-index: 1000; min-width: 180px; max-width: 280px; padding: 6px;
  overflow-y: auto; overscroll-behavior: contain;
  background: var(--overlay-bgColor, var(--bgColor-default, #fff));
  border: 1px solid var(--borderColor-default, #d1d9e0); border-radius: 12px;
  box-shadow: var(--shadow-floating-small, 0 6px 16px rgba(0,0,0,.15));
}
.mi {
  all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 14px; color: var(--fgColor-default, #1f2328);
}
.mi-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mi:hover, .mi:focus-visible { background: var(--bgColor-neutral-muted, #818b981f); }
.mi.danger { color: var(--fgColor-danger, #d1242f); }
.check { width: 14px; flex: none; color: var(--fgColor-accent, #0969da); }
.ml { padding: 4px 8px; font-size: 12px; font-weight: 600; color: var(--fgColor-muted, #59636e); }
.sep { height: 1px; margin: 6px -6px; background: var(--borderColor-muted, #d1d9e0b3); }
.swatches { display: flex; gap: 8px; padding: 4px 8px 6px; }
.sw {
  all: unset; width: 16px; height: 16px; border-radius: 50%; cursor: pointer;
  background: var(--sw); box-shadow: inset 0 0 0 1px rgba(0,0,0,.12);
}
.sw.none { background: transparent; box-shadow: inset 0 0 0 1.5px var(--borderColor-default, #d1d9e0); }
.sw.on { outline: 2px solid var(--fgColor-default, #1f2328); outline-offset: 2px; }
`;

  // ---------- 启动 ----------
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; sync(); }, 120);
  }

  // 观察 documentElement 而不是 body：GitHub 软导航可能整个替换 body
  const mo = new MutationObserver(schedule);
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // 只改地址、不改页面结构的导航也要重新判断（GitHub 软导航、浏览器前进后退）
  const navApi = globalThis.navigation;
  const docEvents = ['turbo:load', 'turbo:render', 'pjax:end'];
  window.addEventListener('popstate', schedule);
  for (const t of docEvents) document.addEventListener(t, schedule);
  navApi?.addEventListener?.('currententrychange', schedule);

  document.addEventListener('click', onDocClick, true);
  document.addEventListener('keydown', onDocKey, true);
  document.addEventListener('scroll', onViewportChange, true);
  window.addEventListener('resize', onViewportChange);

  const onStorageChanged = (changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes[SETTINGS_KEY]) {
      const next = sanitizeSettings(changes[SETTINGS_KEY].newValue);
      if (JSON.stringify(next) !== JSON.stringify(settings) && !settingsFailed) {
        settings = next;
        render();
        if (wrap) setNativeHidden(!settings.showNative);
      }
    }
    // 其他标签页改了分组：自己没有排队中的保存时，直接采用最新版本
    if (changes[GROUPS_KEY] && pendingWrites === 0 && failedOps.length === 0) {
      const next = sanitizeGroups(changes[GROUPS_KEY].newValue);
      if (next.rev !== doc.rev || JSON.stringify(next.groups) !== JSON.stringify(doc.groups)) {
        doc = next;
        render();
      }
    }
  };
  if (area) globalThis.chrome.storage.onChanged.addListener(onStorageChanged);

  load();

  // 预览模式（不在扩展里运行时）留一个切换样式的入口，方便截图对比
  if (!area) globalThis.__ghgPreview = { setStyle: (s) => { if (STYLES.includes(s)) updateSettings({ style: s }); } };

  globalThis.__ghgTeardown = () => {
    mo.disconnect();
    window.removeEventListener('popstate', schedule);
    for (const t of docEvents) document.removeEventListener(t, schedule);
    navApi?.removeEventListener?.('currententrychange', schedule);
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onDocKey, true);
    document.removeEventListener('scroll', onViewportChange, true);
    window.removeEventListener('resize', onViewportChange);
    if (area) globalThis.chrome.storage.onChanged.removeListener(onStorageChanged);
    clearTimeout(expand.timer);
    unmount();
    globalStyle.remove();
    globalThis.__ghgTeardown = null;
  };
})();
