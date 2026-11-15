// Read-only product audit. Uses a temporary Chrome profile and intercepted fixture
// responses; never navigates an authenticated browser or sends fixture data online.
// Run with Playwright available through NODE_PATH: node scripts/audit-extension.cjs
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const out = path.join(root, '.audit-artifacts');
// 0.3.0 storage layout: settings in one key, groups per GitHub login.
const SETTINGS_KEY = 'ghg:settings';
const groupsKey = (login = 'alice') => 'ghg:groups:' + login;
const LEGACY_KEY = 'ghg:v1';
const results = [];
const errors = [];
const requests = [];
const base = () => ({
  v: 1, style: 'card', showNative: false,
  groups: [
    { id: 'alpha', name: '项目 Alpha', color: 'accent', collapsed: false, repos: ['alice/repo-1', 'alice/repo-2'] },
    { id: 'beta', name: '项目 Beta', color: null, collapsed: false, repos: ['alice/repo-3'] },
  ],
});

function fixture(url) {
  const p = new URL(url).searchParams;
  const total = Number(p.get('total') || 20);
  const initial = Number(p.get('initial') || 10);
  const batch = Number(p.get('batch') || 10);
  // An explicit empty ?login= simulates a page where no signed-in user is detected.
  const login = p.has('login') ? p.get('login') : 'alice';
  const avatar = p.get('avatar') === '1';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="user-login" content="${login}">
  <title>Local GitHub Group audit fixture</title><style>
  :root { --fgColor-default:#1f2328; --fgColor-muted:#59636e; --fgColor-accent:#0969da; --bgColor-default:#fff; --bgColor-muted:#f6f8fa; --borderColor-default:#d1d9e0; }
  * { box-sizing:border-box } body { margin:0; font-family:Arial,sans-serif; }
  aside { width:min(296px,100vw); height:100vh; overflow:auto; padding:16px; border-right:1px solid #ddd; }
  nav a { display:block; height:32px } </style></head><body>
  <aside id="sidebar"><react-partial><nav data-testid="dashboard-repositories"><div id="native-items"></div><button id="more">Show more</button></nav></react-partial></aside>
  <script>
  let shown=0; window.moreClicks=0;
  function addBatch(count) { for(let i=0;i<count && shown<${total};i++) {
    shown++; const a=document.createElement('a'); a.setAttribute('data-testid','dynamic-side-panel-items-item');
    a.href='/${login}/repo-'+shown; a.textContent='${login}/repo-'+shown;
    if(${avatar}) { const img=document.createElement('img'); img.src='https://avatars.githubusercontent.com/u/12345?audit='+shown; a.prepend(img); }
    document.getElementById('native-items').append(a);
  } document.getElementById('more').hidden=shown>=${total}; }
  document.getElementById('more').onclick=()=>{window.moreClicks++;addBatch(${batch})};addBatch(${initial});
  </script></body></html>`;
}

function check(name, expected, observed, ok) {
  const result = { name, status: ok ? 'pass' : 'finding', expected, observed };
  results.push(result);
  console.log(`${result.status.toUpperCase()}: ${name}`);
}

// Documented platform behavior rather than a product defect.
function info(name, observed) {
  results.push({ name, status: 'info', observed });
  console.log(`INFO: ${name}`);
}

(async () => {
  await fs.mkdir(out, { recursive: true });
  const profile = await fs.mkdtemp(path.join(out, 'chrome-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true, viewport: { width: 1440, height: 900 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging', '--no-first-run'],
  });
  const version = context.browser().version();
  let extensionId;
  try {
    // Fulfill every HTTP(S) request locally, including all avatars. No GitHub
    // or avatar requests are allowed to reach the network from these pages.
    await context.route(/^https?:/, async route => {
      const req = route.request();
      requests.push({ url: req.url(), type: req.resourceType() });
      if (req.url() === 'https://github.com/__audit_network_probe') {
        return route.fulfill({ contentType: 'text/plain', body: 'local audit response' });
      }
      if (req.isNavigationRequest() && new URL(req.url()).hostname === 'github.com') {
        return route.fulfill({ contentType: 'text/html', body: fixture(req.url()) });
      }
      if (new URL(req.url()).hostname === 'avatars.githubusercontent.com') {
        return route.fulfill({ contentType: 'image/png', headers: { 'cache-control': 'no-store' }, body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=', 'base64') });
      }
      return route.abort();
    });
    const browserCDP = await context.browser().newBrowserCDPSession();
    extensionId = (await browserCDP.send('Extensions.loadUnpacked', { path: path.join(root, 'extension') })).id;
    const page = context.pages()[0];
    page.on('pageerror', e => errors.push(String(e)));
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const fixtureTabId = await popup.evaluate(async () => {
      const self = await chrome.tabs.getCurrent();
      return (await chrome.tabs.query({})).find(t => t.id !== self.id).id;
    });
    async function zoom(factor) {
      await popup.evaluate(({ id, factor }) => chrome.tabs.setZoom(id, factor), { id: fixtureTabId, factor });
      await page.waitForTimeout(40);
    }
    async function save(state, login = 'alice') {
      const items = {
        [SETTINGS_KEY]: { style: state.style, showNative: state.showNative },
        [groupsKey(login)]: { v: 2, rev: 1, groups: state.groups },
      };
      await popup.evaluate(items => chrome.storage.local.set(items), items);
    }
    async function saved(login = 'alice') {
      const got = await popup.evaluate(keys => chrome.storage.local.get(keys), [SETTINGS_KEY, groupsKey(login)]);
      return { ...(got[SETTINGS_KEY] || {}), groups: (got[groupsKey(login)] || {}).groups || [] };
    }
    async function rawStorage() {
      return popup.evaluate(() => chrome.storage.local.get(null));
    }
    async function clearStorage() {
      await popup.evaluate(() => chrome.storage.local.clear());
    }
    async function mount(state = base(), params = {}) {
      await clearStorage();
      if (state) await save(state, params.login || 'alice');
      await page.setViewportSize({ width: 1440, height: 900 });
      await zoom(1);
      await page.goto('https://github.com/dashboard?' + new URLSearchParams(params));
      await page.locator('#ghg-root').waitFor();
      await page.waitForTimeout(320);
    }
    const s = '#ghg-root';
    await mount();
    const baseline = await page.evaluate(() => ({
      repos: document.querySelector('#ghg-root').shadowRoot.querySelectorAll('.repo').length,
      nativeHidden: getComputedStyle(document.querySelector('nav')).display === 'none',
      moreClicks: window.moreClicks,
      scriptGlobalVisibleToPage: typeof globalThis.__ghgTeardown !== 'undefined',
    }));
    check('Real extension mounting, one-page expansion, and isolated globals', '20 repos; native hidden; one expansion; globals isolated', baseline,
      baseline.repos === 20 && baseline.nativeHidden && baseline.moreClicks === 1 && !baseline.scriptGlobalVisibleToPage);

    // Native Chrome tab zoom, not CSS zoom, pageScaleFactor, or DPR emulation.
    const matrix = [];
    for (const style of ['card', 'band', 'bold']) {
      await save({ ...base(), style });
      await page.waitForTimeout(60);
      for (const size of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 800, height: 600 }]) {
        await page.setViewportSize(size);
        for (const factor of [0.5, 0.67, 0.8, 1, 1.25, 1.5, 1.75, 2]) {
          await zoom(factor);
          const m = await page.evaluate(() => {
            const h = document.querySelector('#ghg-root');
            const r = h.getBoundingClientRect();
            return { repos: h.shadowRoot.querySelectorAll('.repo').length, width: r.width,
              horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
              dpr: devicePixelRatio, innerWidth };
          });
          matrix.push({ style, ...size, factor, ...m });
        }
      }
    }
    check('72 native browser zoom / viewport / style combinations', '20 repos and no document horizontal overflow in every combination',
      { combinations: matrix.length, failures: matrix.filter(m => m.repos !== 20 || m.horizontalOverflow), zoomVerified: [...new Set(matrix.map(m => m.dpr))] },
      matrix.every(m => m.repos === 20 && !m.horizontalOverflow));

    await mount();
    await page.locator(`${s} button[data-act="settings"]`).click();
    const menuBefore = await page.locator(`${s} .menu`).boundingBox();
    await page.setViewportSize({ width: 800, height: 180 });
    const menuAfter = await page.locator(`${s} .menu`).boundingBox();
    const menuClipping = { before: menuBefore, after: menuAfter, viewportHeight: 180, bottom: menuAfter.y + menuAfter.height };
    await page.screenshot({ path: path.join(out, 'menu-after-window-resize.png') });
    check('Open menu remains usable after reducing window height', 'Menu stays within the visible viewport or has its own bounded scrolling', menuClipping,
      menuAfter.y >= 0 && menuAfter.y + menuAfter.height <= 180);

    await mount();
    await page.setViewportSize({ width: 1024, height: 600 });
    await page.locator(`${s} li[data-repo="alice/repo-20"]`).hover();
    await page.locator(`${s} li[data-repo="alice/repo-20"] .r-more`).click();
    const bottomMenu = await page.locator(`${s} .menu`).boundingBox();
    await page.screenshot({ path: path.join(out, 'menu-at-sidebar-bottom.png') });
    check('Repo menu near the sidebar bottom at normal zoom', 'Menu stays within the viewport or has bounded scrolling',
      { menu: bottomMenu, viewportHeight: 600, bottom: bottomMenu.y + bottomMenu.height },
      bottomMenu.y >= 0 && bottomMenu.y + bottomMenu.height <= 600);

    await mount();
    const drop = page.locator(`${s} section[data-gid="beta"] .g-head`);
    await page.locator(`${s} li[data-repo="alice/repo-1"]`).dragTo(drop);
    await page.waitForTimeout(80);
    const afterDrag = await saved();
    check('Native mouse drag moves a repo between groups', 'repo-1 belongs to beta only', afterDrag.groups,
      afterDrag.groups.find(g => g.id === 'beta').repos.includes('alice/repo-1') && !afterDrag.groups.find(g => g.id === 'alpha').repos.includes('alice/repo-1'));
    await zoom(2);
    await page.locator(`${s} li[data-repo="alice/repo-2"]`).dragTo(page.locator(`${s} section[data-gid="beta"] .g-head`));
    await page.waitForTimeout(80);
    check('Native mouse drag at 200% browser zoom', 'repo-2 moves to beta', (await saved()).groups,
      (await saved()).groups.find(g => g.id === 'beta').repos.includes('alice/repo-2'));

    await page.locator(`${s} li[data-repo="alice/repo-2"]`).dragTo(page.locator(`${s} li[data-repo="alice/repo-3"]`), { targetPosition: { x: 10, y: 2 } });
    await page.waitForTimeout(80);
    const reorderedRepos = (await saved()).groups.find(g => g.id === 'beta').repos;
    check('Repo sorting within a group at 200% zoom', 'repo-2 comes before repo-3', reorderedRepos,
      reorderedRepos.indexOf('alice/repo-2') < reorderedRepos.indexOf('alice/repo-3'));
    await page.locator(`${s} section[data-gid="beta"] .g-head`).dragTo(page.locator(`${s} section[data-gid="alpha"] .g-head`));
    await page.waitForTimeout(80);
    check('Group sorting at 200% browser zoom', 'beta is the first group', (await saved()).groups.map(g => g.id), (await saved()).groups[0].id === 'beta');

    await mount();
    const sourceBox = await page.locator(`${s} li[data-repo="alice/repo-1"]`).boundingBox();
    await page.mouse.move(sourceBox.x + 24, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(sourceBox.x + 40, sourceBox.y + sourceBox.height / 2 + 12, { steps: 8 });
    await page.locator(`${s} .is-dragging`).waitFor();
    await page.setViewportSize({ width: 800, height: 600 });
    const resizedTarget = await page.locator(`${s} section[data-gid="beta"] .g-head`).boundingBox();
    await page.mouse.move(resizedTarget.x + 30, resizedTarget.y + resizedTarget.height / 2, { steps: 8 });
    await page.mouse.move(resizedTarget.x + 31, resizedTarget.y + resizedTarget.height / 2);
    await page.mouse.up();
    await page.waitForTimeout(80);
    check('Resize the viewport while a native repo drag is in progress', 'repo-1 reaches beta and drag feedback clears',
      { groups: (await saved()).groups, draggingRoots: await page.locator(`${s} .is-dragging`).count() },
      (await saved()).groups.find(g => g.id === 'beta').repos.includes('alice/repo-1') && await page.locator(`${s} .is-dragging`).count() === 0);

    await mount(base(), { total: '25', initial: '10', batch: '10' });
    const pagination = await page.evaluate(() => ({
      repos: document.querySelector('#ghg-root').shadowRoot.querySelectorAll('.repo').length,
      nativeRepos: document.querySelectorAll('nav [data-testid="dynamic-side-panel-items-item"]').length,
      moreClicks: window.moreClicks, moreStillAvailable: !document.querySelector('#more').hidden,
      nativeHidden: getComputedStyle(document.querySelector('nav')).display === 'none',
    }));
    check('Repository list requiring more than one Show more expansion', 'All 25 repos reachable, or remaining native expansion available to the user', pagination,
      pagination.repos === 25 || !pagination.nativeHidden);

    const privateState = base();
    privateState.groups[0].name = 'Alice 私密客户项目';
    privateState.groups[0].repos = ['alice/private-client-project'];
    await mount(privateState);
    await page.goto('https://github.com/dashboard?login=bob');
    await page.locator('#ghg-root').waitFor();
    await page.waitForTimeout(320);
    const crossAccount = await page.evaluate(() => {
      const r = document.querySelector('#ghg-root').shadowRoot;
      return { currentLogin: document.querySelector('meta[name="user-login"]').content,
        previousAccountGroupVisible: r.textContent.includes('Alice 私密客户项目'),
        previousPrivateRepoVisible: !!r.querySelector('a[href="/alice/private-client-project"]') };
    });
    check('Metadata isolation when another GitHub account uses the same browser profile', 'Alice group names and private repo names absent on Bob dashboard', crossAccount,
      !crossAccount.previousAccountGroupVisible && !crossAccount.previousPrivateRepoVisible);

    // Legacy 0.1/0.2 data lived in one global key. It must only move to an account
    // that plausibly owns it, and must not be shown to a different account.
    const legacyState = { v: 1, style: 'band', showNative: false, groups: [
      { id: 'old1', name: 'Alice 旧分组', color: null, collapsed: false, repos: ['alice/repo-1', 'alice/repo-2'] }] };
    await clearStorage();
    await popup.evaluate(({ k, v }) => chrome.storage.local.set({ [k]: v }), { k: LEGACY_KEY, v: legacyState });
    await page.goto('https://github.com/dashboard?login=bob');
    await page.locator('#ghg-root').waitFor();
    await page.waitForTimeout(400);
    const legacyBob = { visible: await page.evaluate(() => document.querySelector('#ghg-root').shadowRoot.textContent.includes('Alice 旧分组')),
      legacyKept: !!(await rawStorage())[LEGACY_KEY], bobGroups: (await saved('bob')).groups.length };
    check('Legacy global data is not migrated to an account that does not own it', 'Bob sees no Alice groups; legacy data left untouched', legacyBob,
      !legacyBob.visible && legacyBob.legacyKept && legacyBob.bobGroups === 0);
    await page.goto('https://github.com/dashboard?login=alice');
    await page.locator('#ghg-root').waitFor();
    await page.waitForTimeout(400);
    const afterMigration = await rawStorage();
    const legacyAlice = { visible: await page.evaluate(() => document.querySelector('#ghg-root').shadowRoot.textContent.includes('Alice 旧分组')),
      legacyRemoved: !afterMigration[LEGACY_KEY], aliceGroups: ((afterMigration[groupsKey('alice')] || {}).groups || []).map(g => g.name),
      style: (afterMigration[SETTINGS_KEY] || {}).style };
    check('Legacy global data migrates to the owning account', 'Alice sees the old group, it is stored under her key, legacy key removed, style kept', legacyAlice,
      legacyAlice.visible && legacyAlice.legacyRemoved && legacyAlice.aliceGroups.includes('Alice 旧分组') && legacyAlice.style === 'band');

    await mount(base());
    await page.goto('https://github.com/dashboard?login=');
    await page.waitForTimeout(500);
    const loggedOut = { roots: await page.locator('#ghg-root').count(), nativeHidden: await page.evaluate(() => document.documentElement.classList.contains('ghg-hide-native')) };
    check('No login detected on the page', 'Extension stays inactive; native list untouched', loggedOut, loggedOut.roots === 0 && !loggedOut.nativeHidden);

    await mount();
    await page.evaluate(() => document.querySelector('nav[data-testid="dashboard-repositories"]').remove());
    await page.waitForTimeout(300);
    const missingNav = await page.evaluate(() => ({ rootRemains: !!document.querySelector('#ghg-root'), hideClassRemains: document.documentElement.classList.contains('ghg-hide-native') }));
    check('Cleanup after GitHub removes the sidebar mounting point', 'No stale root or native-hide class remains', missingNav,
      !missingNav.rootRemains && !missingNav.hideClassRemains);

    await mount();
    await page.evaluate(() => { history.pushState({}, '', '/alice/repo-1'); document.body.append(document.createElement('span')); });
    await page.waitForTimeout(300);
    const away = await page.locator('#ghg-root').count();
    await page.evaluate(() => { history.pushState({}, '', '/dashboard'); document.body.append(document.createElement('span')); });
    await page.locator('#ghg-root').waitFor();
    check('Soft navigation with GitHub DOM mutations', 'Unmount on repo page and remount on dashboard', { rootsAway: away, rootsBack: await page.locator('#ghg-root').count() }, away === 0);

    await mount();
    await page.evaluate(() => history.pushState({}, '', '/alice/repo-1'));
    await page.waitForTimeout(300);
    check('Path change without DOM mutations', 'Unmount after a path change', { rootsAway: await page.locator('#ghg-root').count() }, await page.locator('#ghg-root').count() === 0);

    const malicious = base();
    malicious.style = 'bad-style';
    malicious.groups[0].name = '<img src=x onerror=alert(1)>';
    malicious.groups[0].color = 'red;background:url(https://evil.invalid)';
    malicious.groups[0].repos = ['javascript:alert(1)', '//evil.invalid', 'alice/repo-1'];
    await mount(malicious);
    const xss = await page.evaluate(() => {
      const r = document.querySelector('#ghg-root').shadowRoot;
      return { literalText: r.querySelector('.g-name').textContent, insertedImg: !!r.querySelector('.g-name img'),
        groupStyle: r.querySelector('.group').getAttribute('style'), style: r.querySelector('.wrap').className,
        links: [...r.querySelectorAll('a')].map(a => a.getAttribute('href')) };
    });
    check('Stored XSS strings, CSS tokens, and malicious repo URLs', 'Literal group text; rejected CSS/style tokens; local repo links only', xss,
      !xss.insertedImg && !xss.groupStyle && xss.style === 'wrap style-card' && xss.links.every(l => /^\/[\w.-]+\/[\w.-]+$/.test(l)));

    // Product decision (0.3.0): avatars are kept, but only by reusing the exact
    // avatars.githubusercontent.com URLs GitHub's own list already uses. No new hosts.
    await mount(base(), { avatar: '1' });
    const avatarRequests = requests.filter(r => r.type === 'image' && r.url.startsWith('https://avatars.githubusercontent.com/')).length;
    const avatarNodes = await page.evaluate(() => {
      const native = [...document.querySelectorAll('nav img')].map(i => i.src);
      const ext = [...document.querySelector('#ghg-root').shadowRoot.querySelectorAll('img')].map(i => i.src);
      return { native: native.length, extension: ext.length,
        extensionOnlyGithubAvatars: ext.every(u => u.startsWith('https://avatars.githubusercontent.com/')),
        extensionReusesNativeUrls: ext.every(u => native.includes(u)) };
    });
    check('Extension images only reuse GitHub avatar URLs already on the page', 'No new hosts; every extension image URL also appears in the native list',
      { avatarRequests, avatarNodes, note: 'With no-store fixtures each <img> is fetched; on real GitHub these are normally cache hits.' },
      avatarNodes.extensionOnlyGithubAvatars && avatarNodes.extensionReusesNativeUrls);
    const nonGithubRequests = requests.filter(r => !/^https:\/\/(github\.com|avatars\.githubusercontent\.com)\//.test(r.url));
    check('No requests to hosts other than GitHub and its avatar CDN', 'Zero requests elsewhere', { count: nonGithubRequests.length, sample: nonGithubRequests.slice(0, 5) }, nonGithubRequests.length === 0);

    await mount();
    await save(base());
    await popup.reload();
    await popup.locator('#showNative').waitFor();
    await popup.evaluate(() => {
      const style = document.querySelector('input[value="band"]');
      style.checked = true; style.dispatchEvent(new Event('change', { bubbles: true }));
      const native = document.querySelector('#showNative');
      native.checked = true; native.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    const rapidSettings = await saved();
    check('Two quick popup setting changes preserve both values', 'style=band and showNative=true', { style: rapidSettings.style, showNative: rapidSettings.showNative },
      rapidSettings.style === 'band' && rapidSettings.showNative === true);

    // Manual UI language: chosen in the popup, applied live to the open GitHub tab, kept with other settings.
    const newGroupTitle = () => page.evaluate(() =>
      document.querySelector('#ghg-root').shadowRoot.querySelector('[data-act="new-group"]').title);
    const pickPopupLang = (v) => popup.evaluate((v) => {
      const sel = document.querySelector('#lang');
      sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, v);
    await pickPopupLang('ja');
    await page.waitForTimeout(300);
    const langJa = {
      stored: await saved(),
      pageTitle: await newGroupTitle(),
      popupLang: await popup.evaluate(() => document.documentElement.lang),
      popupHeading: await popup.evaluate(() => document.querySelector('h2[data-i18n="style"]').textContent),
    };
    await popup.reload();
    await popup.locator('#lang').waitFor();
    const langAfterReload = await popup.evaluate(() => ({ sel: document.querySelector('#lang').value, lang: document.documentElement.lang }));
    await pickPopupLang('auto');
    await page.waitForTimeout(300);
    const langAuto = { stored: (await saved()).lang, pageTitle: await newGroupTitle() };
    await save({ ...base(), style: 'card', showNative: false });
    await popup.evaluate((k) => chrome.storage.local.set({ [k]: { style: 'card', showNative: false, lang: '<img src=x>' } }), SETTINGS_KEY);
    await page.waitForTimeout(300);
    const langBogus = await newGroupTitle();
    check('Manual interface language from the popup', 'Japanese applied live to page and popup, kept after reopening, other settings kept; "auto" and unknown values fall back to the browser language',
      { langJa, langAfterReload, langAuto, langBogus },
      langJa.stored.lang === 'ja' && langJa.stored.style === 'band' && langJa.stored.showNative === true &&
      langJa.pageTitle === '新しいグループ' && langJa.popupLang === 'ja' && langJa.popupHeading === 'グループのスタイル' &&
      langAfterReload.sel === 'ja' && langAfterReload.lang === 'ja' &&
      langAuto.stored === 'auto' && langAuto.pageTitle === 'New group' && langBogus === 'New group');

    // Find the real extension's isolated execution context for fault injection.
    // This changes only this test page, not product files or the browser profile.
    await mount();
    const cdp = await context.newCDPSession(page);
    const worlds = [];
    cdp.on('Runtime.executionContextCreated', e => worlds.push(e.context));
    await cdp.send('Runtime.enable');
    const isolated = worlds.find(w => w.name === extensionId || w.origin === `chrome-extension://${extensionId}` || w.origin === `chrome-extension://${extensionId}/`);
    if (isolated) {
      const networkProbe = await cdp.send('Runtime.evaluate', { contextId: isolated.id, awaitPromise: true, returnByValue: true,
        expression: "fetch('/__audit_network_probe').then(r => r.status).catch(e => String(e))" });
      info('Extension-page CSP does not apply to content scripts (platform behavior)',
        { status: networkProbe.result.value, note: 'Probe code only; product has no fetch call. Docs must not cite connect-src as a content-script guarantee.' });
      await cdp.send('Runtime.evaluate', { contextId: isolated.id,
        expression: "chrome.storage.local.set = () => Promise.reject(new Error('Audit simulated storage write failure'))" });
      await page.locator(`${s} button[data-act="new-group"]`).click();
      await page.locator(`${s} .g-input`).fill('临时分组');
      await page.locator(`${s} .g-input`).press('Enter');
      await page.waitForTimeout(80);
      const saveFailure = { groupsVisible: await page.locator(`${s} .group`).count(), groupsPersisted: (await saved()).groups.length,
        visibleError: await page.evaluate(() => !!document.querySelector('#ghg-root').shadowRoot.querySelector('.banner[role="alert"]')) };
      check('Storage failure is visible instead of appearing successfully saved', 'A visible save error or rollback when persistence fails', saveFailure,
        saveFailure.visibleError || saveFailure.groupsVisible === saveFailure.groupsPersisted);
    } else {
      results.push({ name: 'Storage fault injection', status: 'not-run', observed: worlds.map(w => ({ name: w.name, origin: w.origin })) });
    }
    await cdp.detach();

    const hashes = {};
    for (const f of ['manifest.json', 'content.js', 'popup.html', 'popup.js']) {
      hashes[f] = crypto.createHash('sha256').update(await fs.readFile(path.join(root, 'extension', f))).digest('hex');
    }
    const output = { date: '2026-11-14', browser: version, extensionVersion: '1.2.0', extensionId, hashes,
      method: 'Real MV3 extension in isolated temporary headless Chrome; all HTTP(S) fulfilled locally; synthetic GitHub dashboard DOM; native tabs.setZoom.',
      limitation: 'Does not assert current live GitHub DOM, responsive breakpoints, account enforcement, or real multi-page Show more behavior.',
      results, errors, matrix, requests };
    await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(output, null, 2) + '\n');
    console.log(JSON.stringify({ browser: version, passed: results.filter(r => r.status === 'pass').length,
      findings: results.filter(r => r.status === 'finding').length, info: results.filter(r => r.status === 'info').length, notRun: results.filter(r => r.status === 'not-run').length,
      results: path.join(out, 'results.json'), pageErrors: errors }));
  } finally {
    await context.close();
    // Only remove the freshly generated test profile, after verifying its absolute
    // resolved path is a direct child of this audit artifact directory.
    const resolved = path.resolve(profile);
    if (path.dirname(resolved) !== path.resolve(out) || !path.basename(resolved).startsWith('chrome-profile-')) {
      throw new Error('Refusing to clean an unexpected profile path');
    }
    await fs.rm(resolved, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
