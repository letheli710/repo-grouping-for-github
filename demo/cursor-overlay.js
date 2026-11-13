// 录屏辅助：无头浏览器的录像里没有系统鼠标指针，这里自绘一个指针、点击波纹，
// 以及拖拽时跟随指针的仓库名标签。由 scripts/record-demo.cjs 通过 addInitScript 注入演示页。
(() => {
  const css = `
    #demo-cursor { position: fixed; left: -50px; top: -50px; z-index: 2147483647; pointer-events: none; transform: translate(-2px, -1px); }
    #demo-cursor svg { display: block; filter: drop-shadow(0 1px 1px rgba(0,0,0,.35)); }
    #demo-ghost { position: fixed; z-index: 2147483646; pointer-events: none; display: none; padding: 4px 10px; border-radius: 6px;
      background: #fff; border: 1px solid #d1d9e0; box-shadow: 0 6px 18px rgba(37,41,46,.15); font: 13px -apple-system, "Segoe UI", sans-serif; color: #1f2328;
      transform: translate(14px, 10px); }
    .demo-ripple { position: fixed; z-index: 2147483645; width: 28px; height: 28px; margin: -14px 0 0 -14px; border-radius: 50%; pointer-events: none;
      background: rgba(9, 105, 218, .25); animation: demo-rip .45s ease-out forwards; }
    @keyframes demo-rip { from { transform: scale(.3); opacity: 1; } to { transform: scale(1.4); opacity: 0; } }`;

  function install() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    cursor.innerHTML = '<svg width="20" height="24" viewBox="0 0 20 24"><path d="M2 2 L2 19 L6.5 15 L9.5 22 L12.5 20.8 L9.6 14 L16 14 Z" fill="#fff" stroke="#1f2328" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const ghost = document.createElement('div');
    ghost.id = 'demo-ghost';
    document.body.append(cursor, ghost);

    const move = (x, y) => {
      cursor.style.left = x + 'px'; cursor.style.top = y + 'px';
      ghost.style.left = x + 'px'; ghost.style.top = y + 'px';
    };
    document.addEventListener('mousemove', (e) => move(e.clientX, e.clientY), true);
    document.addEventListener('dragover', (e) => move(e.clientX, e.clientY), true);
    document.addEventListener('drag', (e) => { if (e.clientX || e.clientY) move(e.clientX, e.clientY); }, true);
    document.addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      r.className = 'demo-ripple'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.body.append(r); setTimeout(() => r.remove(), 500);
    }, true);
    // 用冒泡阶段：扩展在自己的 dragstart 里写入仓库名之后，这里才读得到
    document.addEventListener('dragstart', (e) => {
      const name = e.dataTransfer?.getData('text/plain') || '';
      if (!name.includes('/')) return;
      ghost.textContent = name.split('/')[1];
      ghost.style.display = 'block';
    });
    const hide = () => { ghost.style.display = 'none'; };
    document.addEventListener('dragend', hide, true);
    document.addEventListener('drop', hide, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
