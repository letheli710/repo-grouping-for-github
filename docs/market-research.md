# GitHub 仓库分组：市场调研

> 调研日期：2026-11-12
> 问题：市场上有没有工具，能把 GitHub 侧边栏里的仓库手动拖拽或选择放进自定义分组？

## 结论（先看这个）

1. **GitHub 官方没有这个功能。** 社区请求 [#41348 "Create groups of repositories"](https://github.com/orgs/community/discussions/41348) 从 2022-12 开到现在，有约 414 个 👍、159 位参与者，最新评论在 2026-10。截至目前没有官方回复，也没有路线图。
2. **第三方工具有，但都很小，而且都没有做在首页左侧边栏上。** 现有扩展大多改的是 Repositories 列表页（`github.com/<user>?tab=repositories`），或者另开一个面板。用户量最高的那个也只有 55 人。
3. **首页左侧「Top repositories」现在只能做到「置顶」**（Better GitHub、Better GitHub Navigation 脚本），**没找到能在那里建命名分组、再拖拽归类的工具**。这就是你的切入点。
4. **需求在 GitHub 自己的产品里也出现了**：GitHub Copilot 桌面应用的 [github/app#3463](https://github.com/github/app/issues/3463)（2026-09 提出，仍为 open）要的就是给侧边栏仓库建文件夹或分组，官方贡献者已把多个重复请求合并到这一条。说明痛点真实存在，但也意味着 GitHub 迟早可能自己做。

## 一、GitHub 官方现有能力（都不是「手动分组」）

| 能力 | 能做什么 | 为什么不能解决这个痛点 |
|---|---|---|
| 首页侧边栏 Top repositories | 按最近 push 排序，默认显示 10 个 | 不能自定义顺序或分组 |
| [Stars Lists](https://docs.github.com/en/get-started/exploring-projects-on-github/saving-repositories-with-stars)（公开预览） | 把 star 过的仓库放进列表，一个仓库可以进多个列表 | 只针对 star，而且**列表只能公开**，也不显示在侧边栏 |
| [Repository dashboard](https://github.blog/changelog/2026-02-24-repository-dashboard-is-now-generally-available/)（`github.com/repos`，2026-02 GA） | 按可见性、语言、组织等条件过滤，可以保存自定义视图 | 基于过滤条件，不是手动归类，没有拖拽 |
| Topics / 命名前缀 | 给仓库打 topic，或用 `proj-xxx` 前缀让同类仓库排在一起 | 是变通办法，要改仓库本身，侧边栏看不出效果 |
| Organizations / Teams / Custom properties | 组织层面的归类 | 太重，只适合组织，不适合个人整理 |

补充：2026-10-01 起[新版 Dashboard 成为默认](https://github.blog/changelog/2026-10-01-new-dashboard-experience-now-the-default)（主体是 agent sessions、issues、PR，可以切回旧版）。changelog 没写左侧边栏变了没有，**动手前需要在真实页面上确认一下当前的 DOM 结构**。

## 二、第三方竞品

| 工具 | 形态 | 分组出现在哪 | 归类方式 | 存储/同步 | 规模/活跃度 |
|---|---|---|---|---|---|
| [GitFolders](https://chromewebstore.google.com/detail/gitfolders/jomibicoiciembfmjadghcnoomoefjpi) | Chrome 扩展 | 可收起的右侧面板 | 新建、重命名、删除文件夹；商店页没提拖拽 | 要注册 GitFolders 账号才能跨设备同步，有内购 | 55 用户，4.4★（5 条评分），2026-01 更新 |
| [GitHub Repo Folders](https://chromewebstore.google.com/detail/omkhhmjinnijkbanpicofdceokjjlmni) | Chrome 扩展 | Repositories 列表页 | 每个仓库旁有下拉框选文件夹，有「Unfiled」区，可折叠，可合并分页 | 按 GitHub 账号分开存储 | 8 用户，2025-12 更新 |
| [GitHub Repository Folders](https://addons.mozilla.org/firefox/addon/github-repository-folders/) | Firefox 扩展 | Repositories 标签页 | 可折叠文件夹 | 导入/导出配置，借 Firefox Sync | 2 用户，2025-09 更新 |
| [gh-groups/chrome-extension](https://github.com/gh-groups/chrome-extension) | 开源 Chrome 扩展 | **只在组织**的仓库页加一个「Groups」标签 | 拖拽 | README 说存在本地并跨设备同步 | 2 star，活跃度看不出来 |
| [Better GitHub](https://github.com/rrbe/better-github) | 开源 Chrome 扩展（功能合集） | 首页 Top repositories | **只能置顶收藏的仓库**，并自动展开列表 | — | 2 star |
| [Better GitHub Navigation](https://greasyfork.org/en/scripts/567335-better-github-navigation) | Tampermonkey 脚本 | 首页 Top repositories | 每个仓库旁有置顶按钮 | — | — |
| [GitHub Sidebar](https://chromewebstore.google.com/detail/github-sidebar/lblnbldblpeiikndppnekobccdocccho) | Chrome 扩展 | 独立的书签侧边栏 | 收藏仓库后拖拽排序（据搜索摘要） | 部分功能要 token | 商店页没加载出来，**未核实** |

和「仓库分组」无关、但常被搜到的：Octotree、Octofree（仓库内文件树）、Refined GitHub（没有仓库分组功能）、gh-dash（CLI 看板）。

## 三、空白点和机会

现有竞品共同的短板：

- **位置不对**：没有一个是在首页左侧边栏里直接分组。而首页侧边栏才是每天用得最多、也最容易「晕头转向」的地方。
- **交互弱**：大多用下拉框或按钮归类，真正支持拖拽的只有只服务组织的 gh-groups。
- **门槛**：要么得注册第三方账号（GitFolders），要么只能手动导入导出配置。
- **几乎没人知道**：用户量都是个位数到几十。这也提醒我们：要么是分发和曝光没做好，要么愿意为此装扩展的人本来就少。

可以做出差异的方向（供后续讨论）：

1. 分组直接注入首页左侧边栏（Top repositories），Repositories 页同样可用
2. 原生拖拽，同时提供右键或菜单「移到分组」
3. 免注册：用 `chrome.storage.sync` 跨设备同步，不需要 token，数据不出浏览器
4. 一个仓库可以进多个分组（社区讨论和 github/app#3463 都提到了）
5. 可选的自动建议：按 owner、名称前缀或 topic 一键生成初始分组
6. 分组可折叠、可排序、可配颜色，支持导入/导出

## 四、风险

- **GitHub 页面改版频繁**：2026-10 新版 Dashboard 刚成为默认，注入 DOM 的扩展会经常坏，需要设计得容易修。
- **官方可能下场**：#41348 热度高，github/app#3463 已有官方贡献者在整理需求。不过网页端那条讨论近 4 年都没有官方回应。
- **需求强度存疑**：竞品用户量都很低。建议先做个能自己天天用的 MVP，再看值不值得推广。

## 五、实地查看：当前首页左侧边栏（2026-11-12，已登录账号）

**页面和位置**

- 打开 `github.com` 会跳到 `/feed`。左上角有 Home（`/dashboard`，新版 Dashboard，带 Preview 标记）和 Feed 两个入口。
- `/dashboard` 和 `/feed` 的左侧边栏一样：顶部是 Home / Feed，下面是 **「Top repositories」**，标题右边有一个搜索按钮，列表默认 10 条，底部有「Show more」。
- 点「Show more」后，前端从 github.com 拉数据，列表一次性展开成全部（测试账号一次就展开完了），没有分页。
- 左上角汉堡菜单打开的全局抽屉里也有一份「Top repositories」，默认 5 条加「Show more」。这一处在**所有页面**都能打开。

**DOM 结构（做扩展时的挂载点）**

| 位置 | 稳定选择器 | 说明 |
|---|---|---|
| 首页侧边栏容器 | `react-partial[partial-name="dashboard-repositories"]` | React 组件，数据在客户端渲染，嵌入的 JSON 里只有 `title` |
| 侧边栏列表 | `nav[data-testid="dashboard-repositories"]` | 用的是 Primer ActionList |
| 每个仓库条目 | `[data-testid="dynamic-side-panel-items-item"]` | 是一个 `<a>`，href 为 `/owner/repo` |
| 全局抽屉中的列表 | 没有专属的 data-testid | 只能靠「Top repositories」标题文字或结构定位，比较脆弱 |

- CSS 类名都带哈希（如 `prc-ActionList-ActionListItem-So4vC`），**不能拿来当选择器**，GitHub 每次发版都可能变。要用 `data-testid` 和 `partial-name`。
- 列表由 React 管理，直接改它内部的 DOM，下次重渲染时会被覆盖。

**对实现的启示**

1. **推荐「旁挂」方案**：在 `nav[data-testid="dashboard-repositories"]` 前面插入我们自己的「分组」区块（独立的 Shadow DOM 或单独的根节点），自己渲染分组和仓库，不去改 GitHub 的 React 列表。原生列表保留，或者让用户选择隐藏。
2. **仓库数据从哪来**：可以从原生条目的 href 里读（需要先触发 Show more 才能拿到全部），也可以在扩展里调用 GitHub API。前者不需要 token，但只覆盖 Top repositories 里的仓库。
3. 用 `MutationObserver` 监听 Turbo 软导航和 React 重渲染，挂载点消失后要自动重新挂上。
4. 全局抽屉可以放到第二阶段，那里没有稳定选择器。

## 待核实

- GitHub Sidebar 扩展的实际功能
- GitFolders 的具体交互和收费模式（商店页信息有限，没有实际安装）
