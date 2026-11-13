// 录制 README 用的演示动图和截图。
// 在临时的无头 Chrome 里加载真实扩展，打开本地仿 GitHub 首页（demo/dashboard.html），
// 所有请求都在本地拦截处理，不访问真实 GitHub、不用任何真实账号。
//
// 用法：NODE_PATH=<含 playwright 的 node_modules> node scripts/record-demo.cjs [en|zh]
// 需要 ffmpeg 在 PATH 里。输出到 docs/images/。
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const fss = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const LANG = process.argv[2] === 'zh' ? 'zh' : 'en';
const root = path.resolve(__dirname, '..');
const work = path.join(root, '.demo-artifacts');
const outDir = path.join(root, 'docs', 'images');
const suffix = LANG === 'zh' ? '.zh-CN' : '';
const W = 1000;
const H = 720;
const CROP_W = 660;

const L = {
  en: { work: 'Work · Acme', side: 'Side projects', infra: 'Infra', band: 'Title band', bold: 'Wings', card: 'Card (default)' },
  zh: { work: 'Acme 工作', side: '业余项目', infra: '基础设施', band: '标题色带', bold: '长两翼', card: '卡片（默认）' },
}[LANG];

const initialGroups = [
  { id: 'work', name: L.work, color: 'accent', collapsed: false, repos: ['acme-corp/billing-service', 'acme-corp/admin-portal', 'alex-dev/api-server'] },
  { id: 'side', name: L.side, color: null, collapsed: false, repos: ['alex-dev/blog', 'alex-dev/portfolio', 'alex-dev/cli-tool'] },
];

// 头像：本地生成的纯色圆形，代替真实头像
const avatarSvg = (color, letter) => `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="20" fill="${color}"/><text x="20" y="27" font-family="Arial" font-size="20" font-weight="bold" fill="#fff" text-anchor="middle">${letter}</text></svg>`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await fs.mkdir(work, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });
  const profile = await fs.mkdtemp(path.join(work, 'profile-'));
  const frameDir = await fs.mkdtemp(path.join(work, 'frames-'));
  // 尝试让扩展的界面语言跟着变：写入浏览器的语言偏好
  await fs.mkdir(path.join(profile, 'Default'), { recursive: true });
  const langs = LANG === 'zh' ? 'zh-CN,zh' : 'en-US,en';
  await fs.writeFile(path.join(profile, 'Default', 'Preferences'), JSON.stringify({ intl: { accept_languages: langs, selected_languages: langs } }));

  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging', '--no-first-run', `--lang=${LANG === 'zh' ? 'zh-CN' : 'en-US'}`],
    locale: LANG === 'zh' ? 'zh-CN' : 'en-US',
  });
  try {
    const demoHtml = await fs.readFile(path.join(root, 'demo', 'dashboard.html'), 'utf8');
    await ctx.route(/^https?:/, async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === 'github.com' && route.request().isNavigationRequest()) {
        return route.fulfill({ contentType: 'text/html', body: demoHtml });
      }
      if (url.hostname === 'avatars.githubusercontent.com') {
        const acme = url.pathname.includes('2002');
        return route.fulfill({ contentType: 'image/svg+xml', body: avatarSvg(acme ? '#8250df' : '#2da44e', acme ? 'A' : 'X') });
      }
      return route.abort();
    });

    const cdp = await ctx.browser().newBrowserCDPSession();
    const extId = (await cdp.send('Extensions.loadUnpacked', { path: path.join(root, 'extension') })).id;

    // 预置分组（只写进这个临时浏览器配置）
    const setup = await ctx.newPage();
    await setup.goto(`chrome-extension://${extId}/popup.html`);
    await setup.evaluate((groups) => chrome.storage.local.clear().then(() => chrome.storage.local.set({
      'ghg:settings': { style: 'card', showNative: false },
      'ghg:groups:alex-dev': { v: 2, rev: 1, groups },
    })), initialGroups);

    const page = ctx.pages()[0];
    await page.bringToFront();
    await page.goto('https://github.com/dashboard');
    await page.locator('#ghg-root').waitFor();
    await page.waitForFunction(() => document.querySelector('#ghg-root')?.shadowRoot?.querySelectorAll('.repo').length >= 14);
    const settingsLabel = await page.locator('#ghg-root button[data-act="settings"]').getAttribute('aria-label');
    if (LANG === 'zh' && settingsLabel !== '设置') {
      throw new Error(`扩展界面不是中文（设置按钮是「${settingsLabel}」），放弃录制中文版`);
    }
    await sleep(400);

    // 用 Chrome 的 screencast 逐帧截图（不需要额外下载录像组件），按时间戳合成动图
    const frames = [];
    const cast = await ctx.newCDPSession(page);
    cast.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
      frames.push({ t: metadata.timestamp, data });
      cast.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    await cast.send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: W, maxHeight: H });

    // ---------- 动作 ----------
    const $ = (sel) => page.locator('#ghg-root ' + sel);
    let cx = W / 2;
    let cy = H / 2;
    async function glide(x, y, steps = 18) {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease-in-out
        await page.mouse.move(cx + (x - cx) * e, cy + (y - cy) * e);
        await sleep(14);
      }
      cx = x; cy = y;
    }
    async function center(loc, dx = 0) {
      await loc.scrollIntoViewIfNeeded();
      const b = await loc.boundingBox();
      return [b.x + b.width / 2 + dx, b.y + b.height / 2];
    }
    async function click(loc, dx = 0) {
      const [x, y] = await center(loc, dx);
      await glide(x, y);
      await sleep(180);
      await page.mouse.down();
      await page.mouse.up();
    }
    async function drag(src, dst) {
      const [sx, sy] = await center(src, -60);
      await glide(sx, sy);
      await sleep(250);
      await page.mouse.down();
      await page.mouse.move(sx + 6, sy + 4, { steps: 3 });
      cx = sx + 6; cy = sy + 4;
      await sleep(120);
      const [tx, ty] = await center(dst, -40);
      await glide(tx, ty, 30);
      await sleep(350);
      await page.mouse.move(tx + 1, ty + 1);
      await page.mouse.up();
      await sleep(500);
    }

    await page.mouse.move(cx, cy);
    await sleep(1200);

    // 1. 新建分组并命名
    await click($('button[data-act="new-group"]'));
    await sleep(500);
    await page.keyboard.press('Control+A');
    await page.keyboard.type(L.infra, { delay: 110 });
    await sleep(300);
    await page.keyboard.press('Enter');
    await sleep(700);

    // 2. 把两个仓库拖进新分组
    const infra = () => $(`section.group:has(.g-name:text-is("${L.infra}")) .g-head`);
    await drag($('li.repo[data-repo="alex-dev/infra-terraform"]'), infra());
    await drag($('li.repo[data-repo="alex-dev/k8s-manifests"]'), infra());

    // 3. 用「⋯」菜单移动一个仓库
    const ml = $('li.repo[data-repo="alex-dev/ml-experiments"]');
    const [mx, my] = await center(ml, -40);
    await glide(mx, my);
    await sleep(300);
    await click($('li.repo[data-repo="alex-dev/ml-experiments"] .r-more'));
    await sleep(700);
    await click($('.menu .mi').filter({ hasText: L.side }));
    await sleep(900);

    // 4. 折叠一个分组
    await click($(`section.group:has(.g-name:text-is("${L.work}")) .g-name`));
    await sleep(900);
    await click($(`section.group:has(.g-name:text-is("${L.work}")) .g-name`));
    await sleep(700);

    // 5. 切换三种样式
    for (const label of [L.band, L.bold, L.card]) {
      await click($('button[data-act="settings"]'));
      await sleep(650);
      await click($('.menu .mi').filter({ hasText: label }));
      await sleep(1500);
    }
    await glide(W - 120, H - 80);
    await sleep(800);
    await cast.send('Page.stopScreencast');
    const tEnd = Date.now() / 1000;

    // ---------- 截图：三种样式对比 + 商店截图 ----------
    const shots = [];
    for (const [style, label] of [['card', L.card], ['band', L.band], ['bold', L.bold]]) {
      await setup.evaluate((s) => chrome.storage.local.set({ 'ghg:settings': { style: s, showNative: false } }), style);
      await sleep(400);
      const file = path.join(work, `style-${style}${suffix}.png`);
      await page.screenshot({ path: file, clip: { x: 0, y: 56, width: 335, height: 600 } });
      shots.push({ file, label });
    }
    await setup.evaluate(() => chrome.storage.local.set({ 'ghg:settings': { style: 'card', showNative: false } }));

    console.log('frames', frames.length);

    // 对比图：三张截图并排
    const cmp = await ctx.newPage();
    await cmp.setViewportSize({ width: 1100, height: 700 });
    const imgs = await Promise.all(shots.map(async (s) => ({ label: s.label, data: (await fs.readFile(s.file)).toString('base64') })));
    await cmp.setContent(`<html><body style="margin:0;padding:0;background:#f6f8fa;font:600 15px -apple-system,Segoe UI,Arial,sans-serif;color:#1f2328">
      <div style="display:flex;gap:24px;padding:20px 24px;background:#f6f8fa">${imgs.map((i) => `<figure style="margin:0"><figcaption style="margin:0 0 10px">${i.label}</figcaption>
      <img src="data:image/png;base64,${i.data}" style="display:block;width:335px;border:1px solid #d1d9e0;border-radius:10px"></figure>`).join('')}</div></body></html>`);
    await cmp.locator('body > div').screenshot({ path: path.join(outDir, `styles${suffix}.png`) });

    // 商店截图 1280×800（只在英文版生成）
    if (LANG === 'en') {
      await page.setViewportSize({ width: 1280, height: 800 });
      await sleep(400);
      await page.screenshot({ path: path.join(outDir, 'store-screenshot-1280x800.png') });
    }

    await ctx.close();

    // 帧 → GIF：每帧显示到下一帧的时间戳为止，结尾多停 1.5 秒；只保留侧边栏和一部分正文
    let list = '';
    frames.forEach((fr, i) => {
      const name = `f${String(i).padStart(5, '0')}.png`;
      fss.writeFileSync(path.join(frameDir, name), Buffer.from(fr.data, 'base64'));
      const next = i + 1 < frames.length ? frames[i + 1].t : tEnd + 1.5;
      list += `file '${name}'
duration ${Math.max(0.01, next - fr.t).toFixed(3)}
`;
    });
    list += `file 'f${String(frames.length - 1).padStart(5, '0')}.png'
`;
    fss.writeFileSync(path.join(frameDir, 'list.txt'), list);
    const gif = path.join(outDir, `demo${suffix}.gif`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(frameDir, 'list.txt'),
      '-vf', `crop=${CROP_W}:${H}:0:0,fps=12,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
      '-loop', '0', gif], { stdio: 'inherit' });
    console.log('gif', gif, (fss.statSync(gif).size / 1024 / 1024).toFixed(2) + ' MB');
  } finally {
    await ctx.close().catch(() => {});
    // 只删除本次新建的临时浏览器配置
    const resolved = path.resolve(profile);
    if (path.dirname(resolved) === path.resolve(work) && path.basename(resolved).startsWith('profile-')) {
      await fs.rm(resolved, { recursive: true, force: true });
    }
    const framesResolved = path.resolve(frameDir);
    if (path.dirname(framesResolved) === path.resolve(work) && path.basename(framesResolved).startsWith('frames-')) {
      await fs.rm(framesResolved, { recursive: true, force: true });
    }
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
