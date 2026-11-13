// 生成扩展图标：把 SVG 渲染成 16/32/48/128 像素的 PNG。
// 用法：NODE_PATH=<含 playwright 的 node_modules> node scripts/build-icons.cjs
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs/promises');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'extension', 'icons');

// 深色圆角底 + 两张叠放的卡片（上面一张是强调色），对应默认的「卡片」分组样式
const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#1f2328"/>
  <rect x="20" y="22" width="88" height="38" rx="9" fill="#4493f8"/>
  <rect x="32" y="34" width="34" height="6" rx="3" fill="#ffffff" opacity=".95"/>
  <rect x="32" y="45" width="52" height="5" rx="2.5" fill="#ffffff" opacity=".7"/>
  <rect x="20" y="68" width="88" height="38" rx="9" fill="#e6edf3"/>
  <rect x="32" y="80" width="34" height="6" rx="3" fill="#1f2328" opacity=".9"/>
  <rect x="32" y="91" width="52" height="5" rx="2.5" fill="#1f2328" opacity=".55"/>
</svg>`;

(async () => {
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'icon.svg'), svg(128).trim() + '\n');
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const size of [16, 32, 48, 128]) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(`<html><body style="margin:0;background:transparent">${svg(size)}</body></html>`);
      await page.locator('svg').screenshot({ path: path.join(outDir, `icon-${size}.png`), omitBackground: true });
      console.log('icon', size);
    }
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
