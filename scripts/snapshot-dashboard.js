// 生成录制演示用的 1:1 GitHub 首页副本（只在你自己的浏览器里运行，不会改动页面）。
//
// 用法：登录 GitHub 打开 https://github.com/dashboard，等页面加载完，打开开发者工具的控制台，
// 粘贴本文件全部内容并回车。脚本会：
//   1. 复制当前页面的 DOM（不改动原页面），去掉所有脚本、隐藏表单、跟踪属性和 meta 信息；
//   2. 把侧边栏仓库换成虚构仓库，把你的登录名、仓库名、组织名、PR 标题和头像全部替换成虚构内容；
//   3. 在页面里检查替换后是否还残留你的账号、仓库名、PR 标题或邮箱，残留则不下载；
//   4. 检查通过才下载 github-dashboard-mock.html。
// 把下载的文件放到 .demo-artifacts/github-dashboard.html（已被 git 忽略），再运行 scripts/record-demo.cjs。
// 这份副本包含 GitHub 的页面代码，请不要提交到仓库。
(() => {
  const LOGIN = document.querySelector('meta[name="user-login"]').content;
  const FAKE = 'alex-dev';
  const AV_ME = 'https://avatars.githubusercontent.com/u/1001?v=4';
  const AV_ORG = 'https://avatars.githubusercontent.com/u/2002?v=4';
  // 和 scripts/record-demo.cjs 里的预置分组一致
  const DEMO = ['alex-dev/web-app', 'acme-corp/billing-service', 'alex-dev/infra-terraform', 'alex-dev/api-server',
    'alex-dev/k8s-manifests', 'alex-dev/blog', 'acme-corp/admin-portal', 'alex-dev/ml-experiments', 'alex-dev/cli-tool',
    'alex-dev/mobile-client', 'alex-dev/portfolio', 'alex-dev/design-system', 'alex-dev/dotfiles', 'alex-dev/data-pipeline'];
  const FAKE_TITLES = ['Add dark mode toggle to settings page', 'Retry failed webhooks with exponential backoff',
    'Migrate CI to reusable workflows', 'Fix flaky login test on Safari', 'Bump Terraform AWS provider to v6',
    'Add pagination to admin user list', 'Cache API responses for 60 seconds', 'Update README badges'];

  const nav = document.querySelector('nav[data-testid="dashboard-repositories"]');
  const realRepos = [...new Set([...nav.querySelectorAll('[data-testid="dynamic-side-panel-items-item"]')].map((a) => a.getAttribute('href').slice(1)))];
  const prLinks = [...document.querySelectorAll('a[href*="/pull/"]')];
  for (const a of prLinks) {
    const m = a.getAttribute('href').match(/^\/([^/]+\/[^/]+)\/pull\//);
    if (m && !realRepos.includes(m[1])) realRepos.push(m[1]);
  }
  const realTitles = prLinks.map((a) => a.textContent.trim()).filter(Boolean);

  // 真实名称 → 虚构名称的替换表（先替换长的，避免部分匹配）
  const repoMap = new Map(realRepos.map((r, i) => [r, DEMO[i] || `alex-dev/project-${i}`]));
  const pairs = [...repoMap];
  for (const [r, f] of repoMap) { const s = r.split('/')[1]; if (s.length > 3) pairs.push([s, f.split('/')[1]]); }
  const owners = [...new Set(realRepos.map((r) => r.split('/')[0]))].filter((o) => o.toLowerCase() !== LOGIN.toLowerCase());
  owners.forEach((o, i) => pairs.push([o, i === 0 ? 'acme-corp' : 'org-' + i]));
  pairs.push([LOGIN, FAKE]);
  pairs.sort((a, b) => b[0].length - a[0].length);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const big = new RegExp(pairs.map((p) => esc(p[0])).join('|'), 'gi');
  const lookup = new Map(pairs.map((p) => [p[0].toLowerCase(), p[1]]));
  const scrub = (s) => s.replace(big, (m) => lookup.get(m.toLowerCase()) ?? m);

  const root = document.documentElement.cloneNode(true);
  root.classList.remove('ghg-hide-native');
  const rm = (sel) => root.querySelectorAll(sel).forEach((e) => e.remove());
  rm('#ghg-root'); rm('script'); rm('noscript'); rm('template'); rm('iframe'); rm('input[type=hidden]');
  rm('link:not([rel=stylesheet])'); rm('link[rel=stylesheet]:not([href])');
  root.querySelectorAll('style').forEach((s) => { if (s.textContent.includes('ghg-')) s.remove(); });
  root.querySelectorAll('meta').forEach((m) => {
    if (!m.hasAttribute('charset') && !['viewport', 'color-scheme'].includes(m.getAttribute('name'))) m.remove();
  });
  const meta = document.createElement('meta');
  meta.setAttribute('name', 'user-login');
  meta.setAttribute('content', FAKE);
  root.querySelector('head').prepend(meta);
  const title = root.querySelector('title');
  if (title) title.textContent = 'GitHub';

  // 侧边栏：用虚构仓库重建列表，去掉 Show more
  const cnav = root.querySelector('nav[data-testid="dashboard-repositories"]');
  const items = [...cnav.querySelectorAll('[data-testid="dynamic-side-panel-items-item"]')];
  const tplLi = items[0].closest('li');
  const list = tplLi.parentElement;
  items.forEach((a) => a.closest('li').remove());
  [...cnav.querySelectorAll('button')].filter((b) => /show more/i.test(b.textContent)).forEach((b) => (b.closest('li') || b).remove());
  for (const full of DEMO) {
    const li = tplLi.cloneNode(true);
    const a = li.querySelector('a');
    a.setAttribute('href', '/' + full);
    const label = a.querySelector('[class*="ItemLabel"]');
    if (label) label.textContent = full;
    const img = a.querySelector('img');
    if (img) { img.setAttribute('src', full.startsWith('acme-corp') ? AV_ORG : AV_ME); img.removeAttribute('srcset'); img.setAttribute('alt', ''); }
    list.append(li);
  }

  // PR 标题和头像换成虚构的
  [...root.querySelectorAll('a[href*="/pull/"]')].forEach((a, i) => { if (a.textContent.trim()) a.textContent = FAKE_TITLES[i % FAKE_TITLES.length]; });
  root.querySelectorAll('img').forEach((img) => {
    const s = img.getAttribute('src') || '';
    if (s.includes('avatars.githubusercontent.com') && !s.includes('/u/1001') && !s.includes('/u/2002')) { img.setAttribute('src', AV_ME); img.removeAttribute('srcset'); }
  });

  // 去掉跟踪类属性、nonce、integrity；其余属性值和所有文字做名称替换
  const dropAttr = /^(nonce|integrity|data-hydro.*|data-analytics.*|data-ga-.*|data-octo.*|data-csrf.*|data-hpc|data-turbo.*|data-pjax.*|data-hovercard.*)$/i;
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const at of [...el.attributes]) {
      if (dropAttr.test(at.name)) el.removeAttribute(at.name);
      else { const v = scrub(at.value); if (v !== at.value) el.setAttribute(at.name, v); }
    }
  }
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) { const v = scrub(n.textContent); if (v !== n.textContent) n.textContent = v; }

  const html = '<!doctype html>\n' + root.outerHTML;
  const low = html.toLowerCase();
  const leaks = {
    login: low.includes(LOGIN.toLowerCase()),
    repos: realRepos.filter((r) => low.includes(r.toLowerCase())).length,
    shortNames: [...repoMap.keys()].map((r) => r.split('/')[1]).filter((s) => s.length > 3 && new RegExp('\\b' + esc(s) + '\\b', 'i').test(html)).length,
    titles: realTitles.filter((t) => t.length > 8 && html.includes(t)).length,
    emails: (html.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []).filter((e) => !/@(2x|3x)\b/.test(e)).slice(0, 5),
  };
  const clean = !leaks.login && !leaks.repos && !leaks.shortNames && !leaks.titles && leaks.emails.length === 0;
  if (clean) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = 'github-dashboard-mock.html';
    document.body.append(a);
    a.click();
    a.remove();
  }
  console.log(clean ? 'Downloaded github-dashboard-mock.html' : 'Leaks found, nothing downloaded:', leaks);
  return { clean, leaks, sizeKB: Math.round(html.length / 1024) };
})();
