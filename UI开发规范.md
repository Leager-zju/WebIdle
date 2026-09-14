# UI 开发规范（机器执行版）

```
PROJECT   WebIdle / 余烬远征（纯文字放置 RPG，单页多视图）
AUDIENCE  代码生成 / 修改代理（LLM）
USAGE     改 UI 前：先读 §0 §1 §2；按 §3 任务索引定位；写完后跑 §9 自检
RULES     规则编号 R01–R32，违反即缺陷；反模式见 §8
SOURCE    本文件由现有代码反向整理，每条规则对应既有实现，勿凭偏好"优化"
```

---

## §0 环境与文件地图

### 技术栈（R22：不得引入新依赖）

| 项 | 值 |
| --- | --- |
| 构建 | Vite 6 + TypeScript（`strict: false`） |
| 渲染 | 原生 DOM 手写，无框架 |
| 样式 | 唯一文件 `src/style.css`，纯 CSS + `:root` 变量，无预处理器 |
| 字体 | 外部 Google Fonts：`Manrope`（正文）/ `DM Mono`（数值·标签） |
| 状态 | 唯一数据源 `src/game-state.ts`，单向数据流 |

### 本地验证构建

| 命令 | 开发者面板 |
| --- | --- |
| `python server.py` | **开** —— 启动时自动跑 `build:devtools`，并校验产物里有没有 `dev-panel` |
| `npm run build:devtools` | **开** |
| `npm run build` | **关**（默认规则，防止含面板的产物被误部署到公网） |

本地改完代码要重新构建时**必须**用 `build:devtools`。`npm run build` 会把 `dist/` 覆盖成纯净产物，
页面里的开发者面板会直接消失 —— `__DEV_TOOLS__` 在构建期被替换成字面量 `false`，
`if (__DEV_TOOLS__)` 包住的整段面板代码会被打包器当死代码摇掉。**这不是缓存问题**，
`Ctrl+F5` 救不回来，只能重新用 `build:devtools` 构建。

### 文件地图

| 路径 | 职责 | 代理可否修改 |
| --- | --- | --- |
| `index.html` | 应用外壳：header / sidebar / `#page-content` | 仅新增 `.nav-item` |
| `src/style.css` | 全部样式（约 580 行，分区注释） | 是，追加式 |
| `src/dom.ts` | DOM 写入工具，**唯一写入通道** | 仅新增通用工具 |
| `src/format.ts` | 数值 / 时长格式化，**唯一出口** | 仅新增格式化函数 |
| `src/page-controller.ts` | 模板加载 / 挂载 / rAF 合并刷新 / 高度测量 | 一般不改 |
| `src/main.ts` | 注册页面、订阅状态、导航同步、启动全局模块 | 是（注册新页面） |
| `src/game-state.ts` | 状态 + 动作函数 | 是（新增动作） |
| `src/hover-tip.ts` | 悬停详情跟随鼠标 | 仅改 `HOST_SELECTOR` / `TIP_SELECTOR` |
| `src/unlock-toast.ts` | 解锁提示（顶部堆叠） | 一般不改 |
| `src/event-prompt.ts` | 随机事件弹窗 | 一般不改 |
| `src/codex-ref.ts` | 图鉴引用：物品 / 怪物 / 区域 / 事件 / 页面的 icon + 名称 + 类型色 + 可点开 wiki；wiki 未解锁时降级为纯文本 | 是（加引用类型） |
| `src/wiki.ts` | 内置 wiki 弹窗：首页 / 列表页 / 条目页 + 路径导航 | 是（往里填内容） |
| `src/changelog.ts` | 版本更新日志弹窗 + 进入游戏时的更新公告；公告文案表在 `config/changelog.ts` | 是 |
| `src/guide.ts` | 新手指引：四块遮罩挖孔 + 气泡 + 跳过 / 重置；步骤表在文件顶部 `GUIDES` | 是（往 `GUIDES` 加步骤） |
| `src/types.ts` | 类型定义 | 是 |
| `src/globals.d.ts` | 构建期常量声明 | 新增常量时改 |
| `src/config/*.ts` | 静态配置表（items / affixes / rarity / zones / events） | 仅末尾追加 |
| `src/pages/*.ts` | 页面逻辑（8 个） | 是 |
| `public/pages/*.html` | 页面静态骨架（fetch 加载） | 是 |

### 数据流（唯一方向）

```
game-state 变更 → notify() → main.ts subscribe 回调
  ├─ updateSharedHeader()            顶部状态 + 导航锁定/高亮
  ├─ applyFontScale()                根字号
  ├─ applyNumberFormat()             数字档位
  ├─ pageController.renderCurrent()  → rAF 合并 → page.update(state, ctx)   每 ~500ms
  └─ updateEventPrompt()             随机事件弹窗
```

**推论**：`update()` 会被高频调用 → 必须幂等；界面**只读** `state`，**只能通过 `game-state` 导出的动作函数**改状态。

---

## §1 硬约束（MUST / MUST NOT）

> 写任何 UI 代码前通读。带 ⚠️ 的是已踩坑项，正确做法见 §10。

### 数据与状态

| ID | 规则 |
| --- | --- |
| R01 | 写 DOM **必须**用 `src/dom.ts`：`setText` / `setNumber` / `setHtml` / `setWidth` / `setClass` / `setHidden` / `setDisabled` |
| R02 | **禁止**直接写 `el.textContent =` / `el.innerHTML =` / `el.classList.add/remove`。唯一例外：`mount()` 内一次性建骨架、`ensureXxxLayer()` 内建单例浮层 |
| R03 | 数值显示**必须**走 `setNumber()` 或 `formatNumber()`；**禁止** `toFixed()` / `toLocaleString()` 直出。例外：固定一位小数的秒数（`interval.toFixed(1) + ' 秒'`） |
| R04 | `update()` **必须**幂等、无副作用、不读布局（禁 `offsetHeight` / `getBoundingClientRect`）；不依赖调用次数 |
| R05 | 页面级 UI 状态（页签、选中项、展开态、过滤器）**必须**放 `ctx`；**禁止**写入 `GameState` |
| R06 | 界面**禁止**直接改 `state` 字段；**必须**调用 `game-state` 导出的动作函数（`equipItem` / `assignLogistics` / `selectZone` / `upgradeResearchItem` …） |
| R07 | 只有**结构**变化才重建 DOM（用 signature 判断）；**数量变化不进 signature**，只就地改文本 |
| R08 | 事件**必须**绑在 `mount()` 的 `root` 上且用赋值：`root.onclick = ...` / `root.oncontextmenu = ...`；**禁止**把监听绑到 `#page-content` |
| R09 | 全局浮层**必须**单例（`ensureXxxLayer()` 惰性建一次）、挂 `document.body`；**禁止**挂进 `#page-content` |
| R26 | 文案里的物品 / 怪物 / 区域名**必须**用 `itemRefMarkup` / `enemyRefMarkup` / `zoneRefMarkup`（渲染层）或 `itemTag` / `enemyTag` / `zoneTag`（存档文本）生成；**禁止**拼 `item.name` / `enemy.name` / `zone.name`。详见 §6.10 |
| R27 | 会写进存档的文本**只能**存 `[[kind:id]]` 标记，**禁止**存 HTML（渲染时 `renderCodexTags`）。详见 §6.10 |
| R29 | 有解锁门槛的内容，未解锁时**禁止**渲染（不占位、不置灰、不挂锁）；**必须**按解锁状态同步列表，解锁后追加。解锁提示统一走 `unlockNotices`，页面不要自己弹。详见 §6.11 |
| R30 | 未解锁的内容**禁止**参与游戏逻辑：动作入口（`canStartWorkshop`…）自带解锁判定，自动流程（`advanceLogistics`…）跳过未解锁项。详见 §6.11 |
| R31 | wiki 未解锁时，所有图鉴引用**必须**降级为纯文本（保留 icon 与类型色，去掉下划线、不可点、无 `data-codex`）。解锁状态由 `main.ts` 同步给 `setWikiUnlocked()`，渲染层不要自己判断。详见 §6.10 |
| R32 | 新手指引**必须**用「外层遮罩 + 高亮区拦截层」两层模型：引导层自身 `pointer-events: none`，高亮区**默认整体不可点**，只有 `step.click` 指定的元素被让出来。**禁止**用 SVG mask / `box-shadow` 挖孔。详见 §6.12 |

### 交互

| ID | 规则 |
| --- | --- |
| R10 | 悬停浮层**必须** `pointer-events: none`，且**浮层内不放可点内容**（点击目标放卡片本身） |
| R11 | 所有悬停交互**必须**同时支持 `:focus-visible`，并给 `outline: 1px solid var(--accent); outline-offset: 2px` |
| R12 | 弹窗**必须**具备三种关闭方式：关闭按钮（`×` + `aria-label="关闭"`）、点遮罩、按 `Esc` |
| R13 | 禁用**必须**用 `disabled` 属性 + `setDisabled()`；**禁止** `pointer-events: none` 代替 |
| R14 | 所有 `<button>` **必须**写 `type="button"` |
| R15 | 长列表**必须**增量插入 + 尾部裁剪（见 §2.8 `syncLog`），并维护 `ctx.anchor` |
| R28 | 悬停浮层的位置**只能**由指针移动与键盘（Tab）聚焦决定；**鼠标点击**（含点击卡片本身引起的 `focusin`）**禁止**改变浮层位置。`focusin` 里必须先判断聚焦来源（见 `hover-tip.ts` 的 `keyboardFocus`） |

### 样式

| ID | 规则 |
| --- | --- |
| R16 | 颜色**必须**用 `:root` 令牌（§4.1）；**禁止**在组件里写十六进制色（浮层深色底 `#101a1d` / `#131d21` 是既有例外，新组件复用即可） |
| R17 | 稀有度着色**必须**走 `.rarity-*` + `--rarity-color` 机制；**禁止**在元素上写死稀有度颜色 |
| R18 | 圆角**一律 0**，**禁止** `border-radius`（例外：血条 / 状态点为圆形） |
| R19 | 自带 `display: grid/flex` 的浮层容器**必须**显式补 `.xxx[hidden] { display: none }` |
| R20 | 会变化的数字容器**必须**有 `font-variant-numeric: tabular-nums`（追加到 §4.4 的选择器列表） |
| R21 | 等分条**必须**用 `grid-auto-flow: column` + `grid-auto-columns: minmax(0, 1fr)`；**禁止**写死列数 |
| R22 | 时间类指示**禁止**做成实心条（与血条混淆）；用刻度格子（`.camp-event-track`）或环形（`.spawn-ring`） |

### 工程

| ID | 规则 |
| --- | --- |
| R23 | 新增页面**必须**四处同步：`public/pages/<id>.html`、`src/pages/<id>.ts`、`main.ts` 注册、`index.html` 的 `.nav-item`。导航顺序由 `index.html` 决定，与注册顺序无关 |
| R24 | **禁止**改动 `config/*.ts` 中已有条目的顺序（下标即存档 id）；只能末尾追加 |
| R25 | 开发者面板代码**必须**包在 `if (__DEV_TOOLS__) { ... }` 内；新增构建期常量**必须**同步 `src/globals.d.ts` |

### z-index 取号区间（新增浮层按此区间取号）

| 区间 | 用途 |
| --- | --- |
| 6 / 7 | 悬停浮层 / 悬停宿主（`z-index: 7` 给宿主） |
| 40 | `.zone-menu` 自绘下拉 |
| 60 | `.item-context-menu` 右键菜单 |
| 65 | `.enhance-hint` 底部提示条 |
| 70 | 遮罩类弹窗（`.stats-layer` / `.dev-modal-layer` / `.affix-picker-layer`） |
| 75 | `.event-prompt-layer` |
| 76 | `.changelog-layer` 版本更新日志 / 更新公告 |
| 78 | `.wiki-layer` 内置 wiki（图鉴：物品 / 怪物 / 区域） |
| 80 | `.unlock-toast-layer` |

---

## §2 可复制骨架

### 2.1 新页面 `src/pages/<id>.ts`

```ts
import { formatNumber, getState } from '../game-state';
import { setText, setNumber, setHtml, setWidth, setClass, setHidden, setDisabled, pick } from '../dom';
import type { GameState, PageDefinition } from '../types';

const page: PageDefinition<any> = {
  id: 'xxx',                          // 必须等于 data-page、文件名、模板名
  template: './pages/xxx.html',
  locked: (state: GameState) => false, // 无门槛则删除本行
  mount(root) {
    const view = root.querySelector<HTMLElement>('#xxx-view')!;
    view.innerHTML = `<div class="panel-heading"><div><span class="panel-kicker">KICKER</span><h3>标题</h3></div><span class="muted" data-ref="count"></span></div>`;
    const ctx: any = { ...pick(view, 'count'), items: [] };
    root.onclick = event => {
      const action = (event.target as Element).closest<HTMLElement>('[data-action]');
      if (action) { /* 调 game-state 的动作函数 */ }
    };
    return ctx;
  },
  update(state: GameState, ctx: any) {
    setText(ctx.count, `共 ${formatNumber(state.totalWins)} 场`);
  }
};
export default page;
```

### 2.2 `public/pages/<id>.html`（只放静态外壳）

```html
<section class="page-heading"><div><span class="panel-kicker">KICKER / SUB</span><h2>页面名</h2><p>一句话说明这个页面能做什么。</p></div><span class="page-code">NAME / 09</span></section>
<section class="panel xxx-panel" id="xxx-view"></section>
```

编号沿用 `HOME / 01` … `SETTINGS / 08` 的两位数格式。

### 2.3 `index.html` 导航项 + `main.ts` 注册

```html
<!-- index.html：插在 .main-nav 内，位置即导航顺序 -->
<button class="nav-item" type="button" data-page="xxx"><span class="nav-index" aria-hidden="true">🔧</span><span class="sidebar-label">页面名</span></button>
```

```ts
// main.ts
import xxxPage from './pages/xxx';
[homePage, campPage, /* ... */, xxxPage].forEach(page => pageController.register(page));
```

⚠️ 导航项数量变化时同步 `style.css` 的 900px 断点：`.main-nav { grid-template-columns: repeat(N, 1fr) }`（当前 N=8）。

### 2.4 卡片（两种形态，按信息量选）

```html
<!-- 形态 A：信息卡（图鉴 / 工坊外的地方） -->
<article class="item-card rarity-rare" data-item="12" data-instance="-1" tabindex="0">
  <div class="item-icon">◆</div>
  <strong class="item-quantity">×1.23K</strong>
  <div class="item-detail">
    <b class="item-detail-name rarity-rare">名称</b>
    <span class="item-type">材料 · 稀有 · 已装备</span>
    <p>描述</p>
    <div class="item-stats">攻击 +12</div>
  </div>
</article>

<!-- 形态 B：图标磁贴（信息量低，aspect-ratio: 1/1，只有图标 + 数量） -->
<div class="item-grid storage-grid"><!-- 同上，去掉名称/类型/描述 --></div>
```

必带：`tabindex="0"`、`data-*` 标识（事件委托靠它）、稀有度类。可拖拽装备加 `draggable="true"`。

### 2.5 遮罩弹窗（单例 + 三关闭）

```css
.xxx-layer { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 24px; background: rgba(4, 9, 11, .74); }
.xxx-layer[hidden] { display: none; }   /* R19 */
.xxx { width: min(480px, 100%); max-height: 84vh; overflow: auto; border: 1px solid var(--line); background: #131d21; box-shadow: 0 24px 60px rgba(0, 0, 0, .55); }
.xxx-head { display: flex; align-items: start; justify-content: space-between; gap: 14px; padding: 16px 18px 12px; border-bottom: 1px solid var(--line-soft); }
.xxx-close { flex: 0 0 auto; width: 28px; height: 28px; border: 1px solid var(--line); background: transparent; color: var(--muted); font-size: 1rem; line-height: 1; }
```

```ts
let layer: HTMLElement | null = null;
function ensureLayer(): HTMLElement {
  if (layer) return layer;
  const el = document.createElement('div');
  el.className = 'xxx-layer';
  el.hidden = true;
  el.addEventListener('click', event => {
    const target = event.target as Element;
    if (target.closest('[data-xxx-close]') || target.classList.contains('xxx-layer')) close();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  document.body.appendChild(el);
  layer = el;
  return el;
}
function open(): void { const el = ensureLayer(); el.innerHTML = /* markup */ ''; el.hidden = false; }
function close(): void { if (layer) layer.hidden = true; }
```

### 2.6 悬停详情宿主（接入 `hover-tip.ts`）

```html
<article class="item-card xxx-card" tabindex="0"><div class="item-icon">◆</div><div class="item-detail">…</div></article>
```

```css
.xxx-card { position: relative; cursor: help; }
.xxx-card:hover, .xxx-card:focus-visible { z-index: 7; }
.xxx-card:focus-visible { outline: 1px solid var(--accent); outline-offset: 2px; }   /* R11 */
```

同时把宿主类加入 `src/hover-tip.ts` 的 `HOST_SELECTOR`，浮层类加入 `TIP_SELECTOR`，并把浮层类补进 `style.css` 的公共定位规则（**位置只由指针移动与 Tab 聚焦决定，鼠标点击不得改变它，见 R28 / §10-15**）：

```css
.item-detail, .shop-detail, .achievement-detail, .xxx-detail {
  position: absolute; left: 0; top: 0; right: auto; width: max-content;
  max-width: min(320px, 78vw);
  transform: translate(var(--tip-x, 0px), var(--tip-y, 0px));
  transition: opacity .14s ease, visibility .14s;
}
```

### 2.7 常用片段

```html
<!-- 按钮 -->
<button class="primary-button wide" type="button" data-action="submit">提交委托</button>
<button class="secondary-button danger" type="button" data-action="reset">重置存档</button>
<button class="step-button" type="button" data-action="assign" data-delta="-1" aria-label="减少一人">−</button>
<button class="segment active" type="button" data-scale="1">中</button>

<!-- 数值格 -->
<div class="camp-stat-grid"><div class="mini-stat"><span>营地生命</span><b data-ref="hp"></b></div></div>

<!-- 进度条 -->
<div class="health-track"><div class="health-bar player-health" data-ref="health"></div></div>
<div class="capacity-track load-track"><div class="capacity-bar load-bar" data-ref="bar"></div></div>

<!-- 条件行（达成条件 / 任务进度通用） -->
<div class="requirement done"><span class="status-dot"></span><span>条件文案</span></div>

<!-- 日志条目（默认三列；两列容器加 .home-log / .camp-log） -->
<div class="log-entry log-battle"><span class="log-time">12:03</span><span class="log-kind">battle</span><span>……</span></div>

<!-- 空态 -->
<div class="log-empty">当前过滤条件下暂无信息。</div>
```

### 2.8 增量日志刷新（长列表必用）

```ts
function syncLog(entries: any[], ctx: any): void {
  const container = ctx.log as HTMLElement;
  if (!entries.length) { if (ctx.anchor === EMPTY_LOG) return; ctx.anchor = EMPTY_LOG; container.replaceChildren(buildEntries(entries)); return; }
  const anchor = ctx.anchor ? entries.indexOf(ctx.anchor) : -1;
  if (anchor < 0) container.replaceChildren(buildEntries(entries));
  else if (anchor > 0) { const first = container.firstElementChild; if (first?.classList.contains('log-empty')) first.remove(); container.insertBefore(buildEntries(entries.slice(0, anchor)), container.firstElementChild); }
  const expected = Math.max(entries.length, 1);
  while (container.childElementCount > expected) container.lastElementChild?.remove();
  ctx.anchor = entries[0];   // ⚠️ 每帧都要推进，否则日志重复刷屏（§10-08）
}
```

### 2.9 结构签名（避免重建 DOM）

```ts
const signature = `${state.equipped.map(s => s.join('.')).join(',')}|${state.inventory.map(q => (q > 0 ? 1 : 0)).join(',')}|${ctx.category}`;
if (ctx.signature !== signature) { ctx.signature = signature; setHtml(ctx.content, storageMarkup(state, ctx.category)); }
// 数量单独就地更新，不进 signature
ctx.cardRefs.forEach(e => { if (e.quantity) setText(e.quantity, `×${formatNumber(state.inventory[e.itemId] || 0)}`); });
```

---

## §3 任务索引

| 我要做的事 | 读 | 改 |
| --- | --- | --- |
| 新增页面 | §2.1 §2.2 §2.3 §5 | `public/pages/*.html`、`src/pages/*.ts`、`main.ts`、`index.html`、`style.css` |
| 新增卡片 / 网格 | §2.4 §6.5 | `src/pages/*.ts`、`style.css` |
| 文案里要出现物品 / 怪物 / 区域名 | §6.10 §1-R26 R27 | `src/codex-ref.ts`（引用）、`src/pages/*.ts`、`src/game-state.ts`（日志） |
| 新增区域（含图标） | §6.10 §4.2 | `src/config/zones.ts`（末尾追加，必须给 `icon`）、`src/types.ts` |
| 新增有解锁门槛的内容 | §6.11 §1-R29 R30 | 配置表（给 `unlockIndex`）、`src/pages/*.ts`（列表同步）、`src/game-state.ts`（`unlockNotices` 会自动收录、动作函数加判定） |
| 改内置 wiki 内容 | §6.10 | `src/wiki.ts`、`style.css` |
| 新增事件（天灾 / 兽潮 / 随机事件） | §6.10 | `src/config/events.ts`（末尾追加；随机事件会自动进 `campEventEntries`） |
| 新增新手指引 | §6.12 §1-R32 | `src/guide.ts`（`GUIDES` 表，键要和解锁事件 id 对上） |
| 调整怪物数值 | §7.6 | `src/config/zones.ts`（**键顺序不能动**） |
| 新增弹窗 | §2.5 §1-R12 | `src/pages/*.ts`、`style.css` |
| 改更新公告文案 | §7.14 | `src/config/changelog.ts` |
| 新增悬停详情 | §2.6 §1-R10 R11 | `src/pages/*.ts`、`style.css`、`hover-tip.ts` 选择器 |
| 新增进度条 / 倒计时 | §6.4 §1-R22 | `style.css`、`src/pages/*.ts` |
| 新增颜色 / 稀有度 | §4.1 §4.2 §1-R16 R17 | `:root`、`config/rarity.ts`（仅末尾） |
| 新增数值格式化 | §7.2 §1-R03 | `src/format.ts` |
| 新增可交互动作 | §7.3 §1-R06 | `src/game-state.ts` + `src/pages/*.ts` |
| 加解锁门槛 | §6.1 §7.1 | `src/pages/*.ts` 的 `locked()` |
| 加开发者功能 | §1-R25 | `src/pages/settings.ts`、`globals.d.ts` |
| 加全局提示 / 浮层 | §1-R09 R10 | 新建模块或复用 `unlock-toast.ts` |

---

## §4 设计令牌

### 4.1 颜色（`:root`，唯一来源）

| 变量 | 值 | 语义（新组件必须沿用） |
| --- | --- | --- |
| `--bg` | `#0d1215` | 页面底色（叠右上径向光晕 `radial-gradient(circle at 82% 0%, #1a3933 0, transparent 32%)`） |
| `--surface` | `#151e23` | 面板底色 |
| `--surface-2` | `#1a272a` | 面板内次级块（数值格、卡片） |
| `--line` | `#2f3c42` | 主边框 / 分隔线 |
| `--line-soft` | `rgba(167,214,194,.13)` | 块内弱分隔线 |
| `--text` | `#edf2ec` | 正文 |
| `--muted` | `#91a09f` | 次要文字 / 标签 / 禁用 / 未达成 |
| `--accent` | `#8bf5c9` | 主色：玩家方 / 正向 / 可交互强调 / 成功 |
| `--accent-dim` | `#235b4b` | 主色暗版：图标框、卡片边框 |
| `--warm` | `#ffb86b` | 成本 / 倒计时 / 待响应 / 【极致】 |
| `--red` | `#ff8e7b` | 敌方 / 失败 / 材料不足 / 破坏性操作 |
| `--blue` | `#9ac8ff` | 信息 / 战斗日志 |

### 4.2 稀有度（`--rarity-color`，R17）

**稀有度只影响物品名的显示颜色，不参与任何数值计算** —— 掉率在 `dropTable` 里写死、装备数值在 `equip` 里写死，稀有度不参与其中。它粗略体现「价值与获取难度」，参考泰拉瑞亚的做法。

色板一次备足 **16 档**（`--rarity-0` ~ `--rarity-15`，见 `:root`），类名由 `rarityClass()` 从 `config/rarity.ts` 的 `className` 生成。**目前只用到 4 档**：

| id | 类 | 名称 | 令牌 | 分配给 |
| --- | --- | --- | --- | --- |
| 0 | `.rarity-gray` | 灰色 | `--rarity-0` | 废弃边境 |
| 1 | `.rarity-white` | 白色 | `--rarity-1` | 余烬矿脉 |
| 2 | `.rarity-blue` | 蓝色 | `--rarity-2` | 核心深井 |
| 15 | `.rarity-amber` | 琥珀色 | `--rarity-15` | 任务物品（跨区域，单独占最高档） |

3~14 档（绿 / 橙 / 浅红 / 粉红 / 浅紫 / 青柠 / 黄 / 青 / 红 / 紫 / 彩虹 / 火红）是留给后续区域的空位，颜色已经在 `:root` 里备好 —— **加区域时往上取一档即可，不用回来改 CSS**。分配规则因此只有一条：**越后期能拿到的物品，档位越高**。

用法：元素写 `color: var(--rarity-color, inherit)`；类名一律走 `rarityClass(rarity)`，不要手拼。**必须着色**的元素：`.codex-ref-name`（图鉴引用，首选）、`.item-name`（散文里的裸物品名）、`.equip-slot-name`、`.equip-stat-source`、`.item-detail-name`。边框着色只加卡片（`.item-card.rarity-*`）。

⚠️ **`.item-affix-name` 不再走稀有度**：词条改用类别色（§4.6），通道是 `--affix-color`。

**不显示稀有度的名字。** 物品卡片与 wiki 物品页都只给颜色，不写「灰色 / 白色 / 蓝色 / 琥珀色」这类文字 —— 颜色本身就是这个信息，再写一遍是冗余，而且把颜色名念出来反而让人分神去对照色板。稀有度名字（`rarities[].name`）现在**没有任何界面在用**，只在 `config/rarity.ts` 里作为档位的可读标识保留。

怪物 / 区域没有稀有度，走另一条通道 `--codex-color`（`.codex-enemy` 红 / `.codex-zone` 主色 / `.codex-zone-camp` 暖色）。图鉴引用统一读 `var(--codex-color, var(--rarity-color, inherit))`，两条通道都能接住。

### 4.3 类别色（`--cat-color`）

`.cat-resource`(blue) / `.cat-equipment`(accent) / `.cat-consumable`(warm)，由 `config/items.ts` 的 `itemCategories` 驱动。

### 4.4 字体与排版

| 用途 | 写法 |
| --- | --- |
| 正文 / 标题 / 按钮 | `body { font-family: Manrope, sans-serif }` |
| 数值 / 标签 / kicker / 时间 | `font: 500 .68rem/1 DM Mono, monospace` |
| 英文 kicker | 全大写 + `letter-spacing: .14em`；`.panel-kicker` 用 `--muted`，`.eyebrow` 用 `--accent` |
| `h1` | `font-size: clamp(45px, 7vw, 93px)`，**用 px，不随根字号缩放** |
| 其余字号 | 用 `rem`，跟随设置页档位（`fontScales`：小 `1` / 中 `1.2` / 大 `1.5`） |

等宽数字选择器（R20，新增同类元素追加到这一条）：

```css
.resource-value, .mini-stat b, .combatant-stats b, .codex-stats b, .camp-stat-grid b,
.item-stats b, .equip-stat-value, .dev-stat-value, .camp-timer, .capacity-summary { font-variant-numeric: tabular-nums; }
```

### 4.5 尺寸惯用值

| 项 | 值 |
| --- | --- |
| 圆角 | **0**（R18） |
| 面板内边距 | `22px`；块内 `--surface-2` 块 `18px` |
| 卡片内边距 | `16px`；磁贴 `12px` |
| 栅格间距 | 主布局 `18px`，网格内 `10–14px`，紧凑行 `6–8px` |
| 边框 | 块 `1px solid var(--line)`；块内 `1px solid var(--line-soft)` |
| 面板阴影 | `0 18px 42px rgba(0,0,0,.14)` |
| 浮层阴影 | `0 16px 34px rgba(0,0,0,.4)` ~ `0 24px 60px rgba(0,0,0,.55)` |
| 过渡 | 交互 `.16s ease`；进度条 `.25s–.3s`；浮层 `opacity .14s` |

### 4.6 词条类别色（`--affix-color`）

词条按**类别**着色，和稀有度是两条独立通道 —— 一件装备的名字按稀有度着色，它身上的词条按类别着色，两者可能同时出现在一段文本里，所以变量名不共用。`.equip-stat-source` 同时读两条：`var(--affix-color, var(--rarity-color, inherit))`。

| 类 | 类别 | 值 | 说明 |
| --- | --- | --- | --- |
| `.affix-offense` | 进攻 | `--red` | 直接提升输出：锋锐、余烬爆裂 |
| `.affix-survival` | 生存 | `--rarity-3`（绿） | 提升承伤能力：坚韧、铁壁 |
| `.affix-utility` | 功能 | `--rarity-2`（蓝） | 增益营地系统、不参与战斗：勤务 |

类名由 `affixCategoryClass(category)` 生成，别手拼。**类别不只是颜色**：它还决定哪个清洗剂能洗掉这条词条（一类一瓶，见 §7.12 旁边的道具说明）。

---

## §5 布局速查

### 5.1 外壳

```
.app-shell    width: min(1240px, calc(100% - 40px)); margin: 0 auto; padding: 46px 0 28px
  .game-header    品牌区 + #game-status（flex, space-between, 底部 1px --line）
  .app-body       grid: 210px minmax(0, 1fr); gap: 18px
    .sidebar        .sidebar-heading / .main-nav / .sidebar-foot
    .page-content   min-height: var(--page-min-height)  /* 620px 只是下限 */
```

- 折叠：`.app-shell.nav-collapsed` → 列宽 `64px`，隐藏 `.sidebar-label` / `.panel-kicker` / `.sidebar-foot`。
- ⚠️ **页面不要自己设 `min-height`**：`page-controller` 会记录最高页的 `scrollHeight` 回写到 `#page-content`，防止切页高度跳动。

### 5.2 栅格骨架

| 骨架类 | 列定义 | 用途 |
| --- | --- | --- |
| `.home-grid` | `repeat(2, minmax(0, 1fr))` | 主界面（`.home-log` 用 `grid-column: 1 / -1`） |
| `.camp-layout` | `minmax(0, 1.05fr) minmax(0, .95fr)`（默认 stretch） | 营地（两块血条底部对齐） |
| `.archive-layout` | `repeat(2, minmax(0, 1fr))` + `align-items: start` | 远征档案 / 研究基地 |
| `.inventory-layout` | `212px minmax(0, 1fr)` + `align-items: start` | 物品栏 |
| `.battle-arena` | `minmax(0, 1fr) 70px minmax(0, 1fr)` | 战斗（中间 VS） |
| `.shop-grid` | `repeat(auto-fill, minmax(320px, 1fr))` | 工坊 |
| `.item-grid` | `repeat(6, minmax(0, 1fr))` | 图鉴 / 磁贴 |
| `.achievement-grid` | `repeat(auto-fill, minmax(64px, 1fr))` | 成就 |
| `.resource-strip` / `.hero-stats` / `.camp-event-track` | `grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr)` | 等分条（R21） |

### 5.3 响应式（只有两个断点）

| 断点 | 行为 |
| --- | --- |
| `max-width: 900px` | 侧栏 → 顶部横向导航 `repeat(8, 1fr)`（导航项数量变化时同步 N）；`.home-grid` / `.inventory-layout` / `.archive-layout` / `.camp-layout` 单列；`.battle-arena` 中列 `44px` |
| `max-width: 600px` | `.app-shell` 收边距；`.game-header` 纵向；导航 `repeat(4, 1fr)`；资源条 2 列（末项 `1 / -1`）；`.battle-arena` 单列；`.item-grid` 5 列；工具栏纵向 |

新增多列布局**必须**在这两处给出降级规则。

---

## §6 组件速查

### 6.1 面板与标题

```html
<section class="page-heading"><div><span class="panel-kicker">COMMAND CENTER</span><h2>主界面</h2><p>说明</p></div><span class="page-code">HOME / 01</span></section>
<section class="panel xxx-panel" id="xxx-view"></section>
```

面板语义类：`.adventure-panel` `.camp-panel` `.shop-panel` `.research-panel` `.settings-panel` `.archive-panel` `.inventory-panel`（都设 `padding: 22px`）。面板内标题统一 `.panel-heading`（左 kicker+h3，右状态）。

### 6.2 按钮

| 类 | 用途 | 要点 |
| --- | --- | --- |
| `.primary-button` | 主操作，**一屏最多一个** | accent 实底，字色 `#09251c`，hover 上浮 1px；`.wide` 占满行 |
| `.secondary-button` | 次操作 | 透明底 + 边框，hover/`.active` 转 accent |
| `.secondary-button.danger` | 破坏性 | 红边框红字 |
| `.text-button` | 行内弱操作 | 无边框，hover 转 accent |
| `.step-button` | 加减步进器 | 26×26；`.batch` 用于「« / »」批量 |
| `.segment` | 分段选择（`.segmented` 包裹） | `.active` accent 实底 |
| `.filter-button` | 日志过滤器 | 小号 DM Mono，`.active` 转 accent |
| `.tab` | 页签（`.tab-bar` 包裹） | `.active` 与下方面板连成一体 |

禁用：`disabled` + `.xx:disabled { opacity: .4; cursor: not-allowed }`（R13）。

### 6.3 数值展示

- 一律 `setNumber()` 写入（自动缩写 + `title` 精确值）。
- 无数据统一 `—`（长破折号），不留空。
- 容器必须有 `tabular-nums`（R20）。

### 6.4 进度条 / 时间指示

| 类 | 用途 | 特征 |
| --- | --- | --- |
| `.health-track` / `.health-bar` | 生命（8px） | `.player-health`(accent) / `.enemy-health`(red) / `.camp-health`(accent) |
| `.interval-track` / `.interval-bar` | 出手间隔（4px） | `.enemy-interval` 半透明红 |
| `.capacity-track` / `.capacity-bar` | 制造 / 研究进度（6px） | accent |
| `.load-track` / `.load-bar` | 物品栏负载（10px） | 压力变色 `.load-mid`(warm) / `.load-high`(red) + `::after` 十等分刻度 |
| `.camp-event-track` / `.camp-event-cell` | 随机事件倒计时 | **刻度格子**（12 格，`.on` 点亮） |
| `.spawn-ring` | 刷怪冷却 | SVG 环形，`stroke-dasharray/dashoffset`；内容用 `visibility: hidden` 保占位 |

### 6.5 卡片与网格

| 形态 | 类 | 卡面 |
| --- | --- | --- |
| 信息卡 | `.item-card` + `.item-detail` | 图标 + 名称 + 类型 + 描述 + 属性 |
| 图标磁贴 | `.storage-grid .item-card`（`aspect-ratio: 1/1`） | 仅图标 + 数量，其余进浮层 |

状态类：`.equipped`（accent 边框）/ `.selected` / `.locked`（虚线 + `cursor: default`）/ `.dragging` / `.drop-target` / `.busy` / `.maxed` / `.level-0`（虚线）。
⚠️ **带悬停浮层的卡片**（`.item-card` / `.shop-item` / `.achievement-card`）置灰**禁用 `opacity`**，改用 `border-style: dashed`（§10-02）；无浮层的置灰卡片（如 `.codex-card.locked`）可用 `opacity: .45`。

### 6.6 日志列表

- 默认三列 `66px 46px 1fr`；`.home-log` / `.camp-log` 覆盖为两列 `66px minmax(0, 1fr)`。
- 类型着色：`.log-battle`(blue) / `.log-drop`(warm) / `.log-progress`(accent) / `.log-defeat`(red)。
- 高度上限：`.event-log` 310px，`.event-log.compact` 210px。
- 空态 `.log-empty`。增量刷新见 §2.8。

### 6.7 树与条件列表

- `.tree` > `.tree-branch`（`.collapsed` / `.locked`）> `.tree-node` + `.tree-children` > `.tree-leaf`（`.done` / `.current` / `.selected`）；连接线用 `::before/::after`；`▾` 用 `transform: rotate` 表展开态。
- 达成条件统一 `.requirement`（`.done` 转 accent）+ `.status-dot`（默认 accent 带光晕，`.pending` 灰且无光晕，`.paused` 转 warm）。

### 6.8 自绘下拉（区域选择）

**禁止使用原生 `<select>`**（原生弹层不可定制、无法加动画，且每 500ms 渲染循环回写 `select.value` 会打断用户操作）。用 `.zone-picker` + `.zone-trigger` + `.zone-menu` + `.zone-option`：

- 展开态 `.zone-picker.open`，同步 `aria-expanded`。
- 全局关闭：`pointerdown` 落在 `.zone-picker` 外、或按 `Esc`。
- 选项禁用（未解锁区域）：`setDisabled` + 文案后缀「（未解锁）」。

### 6.9 提示

| 类 | 用途 | 行为 |
| --- | --- | --- |
| `.unlock-toast-layer` / `.unlock-toast` | 解锁提示 | 顶部居中堆叠，停留 `4200ms`，最多 4 条，动画 `unlock-toast-in/out` |
| `.enhance-hint` | 底部操作提示条 | `position: fixed; bottom: 22px`，居中 |

### 6.10 图鉴引用与内置 wiki（R26 / R27）

**凡是指名某个具体条目的文本，一律用图鉴引用**，不要写裸名字字符串。格式为 `icon + 名称`，颜色按条目类型，点击打开内置 wiki。

| 类型 | 数据源 | 图标 | 颜色类 | `--codex-color` |
| --- | --- | --- | --- | --- |
| `item` 物品 | `items[id]` | `item.icon` | `.rarity-*`（走 `--rarity-color`） | — |
| `enemy` 怪物 | `enemyTable[id]` | `enemy.art` | `.codex-enemy` | `--red` |
| `zone` 区域 | `zones[id]` | `zone.icon` | `.codex-zone`（营地 `.codex-zone-camp`） | `--accent` / `--warm` |
| `event` 事件 | `campEventEntries[id]` | `campEventDef(...).icon` | `.codex-event` | `--warm` |
| `page` 页面 | —（列表页，无具体条目） | — | `.codex-page` | `--accent` |

```ts
// 渲染层直接拼 HTML 时（页面模板、掉落表、委托条件…）
import { itemRefMarkup, enemyRefMarkup, zoneRefMarkup, eventRefMarkup, pageRefMarkup } from '../codex-ref';
`掉落：${itemRefMarkup(drop.itemId)} ×${amount}`
`远征队正在与${enemyRefMarkup(enemyId)}交战。`
`到${zoneRefMarkup(task.zoneId)}狩猎`
`${eventRefMarkup(campEventEntryId(battle.kind, battle.id))} · 第 2 次`
`击杀${pageRefMarkup('enemies', '任意怪物')} 3/5 只`   // 指代一整类内容时用页面引用

// 日志这类「先存纯文本、之后渲染」的场合：存标记，渲染时解析
import { itemTag, enemyTag, zoneTag, renderCodexTags } from '../codex-ref';
addLog(target, `掉落：${itemTag(drop.itemId)} ×${amount}`, 'drop');   // 生成 [[item:12]]
addLog(target, `击败${enemyTag(enemyId)}，…`);                        // 生成 [[enemy:5]]
addLog(state, `远征队进入${zoneTag(zoneId)}，…`);                     // 生成 [[zone:2]]
`<span>${renderCodexTags(entry.message)}</span>`
```

**统一接口速查（禁止在页面里重写这些）**

| 要做的事 | 用这个 | 不要 |
| --- | --- | --- |
| 物品 / 怪物 / 区域 / 事件名 | `itemRefMarkup` / `enemyRefMarkup` / `zoneRefMarkup` / `eventRefMarkup` | 拼 `item.name`、`enemy.art` |
| 指代一整类内容 | `pageRefMarkup(page, label)` | 编一个不存在的条目引用 |
| 取条目的 icon / 名称 / 颜色类 | `codexEntry(kind, id)` | 各处分别取 `items[id].icon` + 拼类名 |
| 掉落表的一格 | `dropCellMarkup(drop, discovered)`（**wiki.ts 内部**，别处没有掉落表） | 各页面自己拼「概率 · 数量」 |
| 稀有度 CSS 类名 | `rarityClass(rarity)` | `` `rarity-${rarities[x].className}` `` |
| 怪物属于哪个区域 | `zoneOfEnemy(enemyId)` | `zones.find(...)` |
| 秒数 / 速率 | `formatSeconds` / `formatPerSecond` | `toFixed(1) + ' 秒'` |
| 解锁判定 | `isXxxUnlocked()` / `isXxxItemUnlocked()` | 重写 `mainlineIndex >= N` |

**入口怎么选（按「这段文字会不会进存档」判断）**

| 这段文字 | 生成 | 渲染 |
| --- | --- | --- |
| 会进存档（日志 `message`） | `itemTag` / `enemyTag` / `zoneTag` 标记 | **必须**过 `renderCodexTags` |
| 不进存档（主线条件 `MainlineRequirement.text()` 这类现算文案） | `itemRefMarkup` / `enemyRefMarkup` / `zoneRefMarkup` 直接出 HTML | 直接 `setHtml` 即可；**建议也过一遍** `renderCodexTags` 兜底 |

⚠️ 兜底那一步不是可选项的等价物：`renderCodexTags` 只在文本含 `[[` 时才做事，已渲染的 HTML 会原样返回。**渲染点漏掉解析 → 页面上就会直接显示 `[[item:1]]`**（踩过一次：`home.ts` 的主线卡与 `story.ts` 的章节详情）。

| 项 | 规则 |
| --- | --- |
| R26 | 物品 / 怪物 / 区域名**必须**通过 `itemRefMarkup` / `enemyRefMarkup` / `zoneRefMarkup`（渲染层）或 `itemTag` / `enemyTag` / `zoneTag`（存档文本）生成；**禁止**在文案里直接拼 `item.name` / `enemy.name` / `zone.name`（例外：`workshopItems` / `researchItems` / 营地事件名这类不在三张表里的条目） |
| R27 | **会写进存档**的字符串**只能**存 `[[kind:id]]` 标记，**禁止**存 HTML；**渲染任何可能含标记的文本时都要过 `renderCodexTags`**（无标记的旧文本、以及早期格式 `[[12]]`（按物品解析）都原样兼容）。渲染 `MainlineRequirement.text()` 的每个地方都不能漏 |

**引用不能放进高频重绘的 innerHTML**：`setHtml` 只在内容变化时重绘，但若字符串里混了每 500ms 都在变的数值，引用会被反复重建、悬停与点击都会被打断。做法是把段落拆成「稳定部分（含引用，`setHtml`）+ 变动部分（`setText`）」，见 `home.ts` 的 `copyMain` / `copyHp`。

**边界（不属于图鉴引用，保持原样）**

| 场景 | 处理 |
| --- | --- |
| 冒险页：区域下拉、战斗卡上的区域 / 怪物名 | 该页是实时战斗视图，保持原有形态；怪物资料统一由 wiki 提供（原先的「怪物图鉴」面板已移除） |
| 物品栏里的卡片、右键菜单、悬停浮层 | 卡面形态，不走 `.codex-ref` |
| 装备加成窗口的「装备名 · 词条名」（`getEquipBonusSources`） | 已按稀有度着色，名字是拼接结果，不改成引用 |
| 开发者面板的物品发放按钮 | 点击语义是「发放物品」，不能变成 wiki 链接 |
| 主界面资源条（金币 / 废料 / 精华）、物品栏分区标题 | HUD 聚合数值与类别标签，不是图鉴引用 |
| 营地事件名（天灾 / 兽潮 / 流民求助…） | 不在物品 / 怪物 / 区域三张表里 |

**内置 wiki（`src/wiki.ts`）：页面路由 + 路径**

两类页面，层级固定（条目页的父级就是它所属的列表页），所以**路径直接按 page 推导，不需要历史栈**：

| 页面 | page | 路径显示 |
| --- | --- | --- |
| 首页 | `home` | 不显示路径 |
| 列表页 | `items` / `enemies` / `zones` / `events` | `主页 › 怪物` |
| 条目页 | `item` / `enemy` / `zone` / `event` + 下标 | `主页 › 怪物 › 锈蚀哨兵` |

- 路径里可点的两级（`主页` 与列表名）**加粗**，当前一级不加粗；点任意一级就是「回退到那一页」（复用 `data-codex="page:xxx"`）。
- 单例浮层挂 `body`，`role="dialog"` + `aria-modal="true"`；遮罩 `rgba(4, 9, 11, .55)` + `backdrop-filter: blur(7px)`。
- 三种关闭方式：`×` 按钮、点遮罩、`Esc`（R12）。
- 标题栏按条目的 icon / 名称 / 类型色渲染（kicker：`CODEX` / `CODEX / INDEX` / `CODEX / MONSTER` …）。
- ⚠️ 类型色类**挂在 `.wiki-head` 上，不要挂在 `.wiki` 上**：挂在窗口上会顺着继承把列表格子的稀有度色压掉（`--codex-color` 优先于 `--rarity-color`）。
- 列表页**列全**：格子的数量是固定的，没见到 / 没解锁的换成 `lockedCellMarkup()` 占位（§6.11），不静默藏掉。条目页的掉落沿用「逐条揭示」，未发现的不剧透（`dropCellMarkup` / `dropSourceMarkup` 都只给占位格）。
- 点击委托由 `startCodexWiki()` 在**捕获阶段**注册，并 `stopPropagation()` —— 点名字不该触发页面自己的 `root.onclick`。

**事件条目（`src/config/events.ts`）**：名字 / 图标 / 描述 / 应对建议是静态的，放 config 里让 `codex-ref` 与 wiki 都能读；强度与奖励随存档现算，wiki 从 `getCampEventInfo()` 取。`campEventEntries` 的下标即事件条目 id，`campEventEntryId(kind, index)` 做反向查找。

**wiki 解锁前：引用降级（R31）**

- 所有引用（含 `pageRefMarkup`）在 wiki 未解锁时渲染成 `<span class="codex-ref is-plain">`：icon 与类型色照旧，去掉下划线、不可点、不带 `data-codex`。所以锁着的时候点不开 wiki，也不需要额外拦截。
- 解锁状态由 `main.ts` 每帧同步给 `setWikiUnlocked()`（同 `format.ts` 的数字档位），**必须在 `pageController.renderCurrent()` 之前**同步，否则本帧画出来的还是上一帧的形态。
- 为什么不直接让 `codex-ref` 读 state：`game-state` 反过来要引用 `itemTag` / `pageRefMarkup` 拼文案，直接依赖会成环，所以走注入式状态。
- 状态翻转回未解锁（如重置存档）时，`onWikiUnlockChange` 会通知 wiki 自己关掉弹窗。
- 解锁条件就是成就「初次冒险」（`isWikiUnlocked`），成就的 `rewardUnlock` 会额外弹一条「解锁：系统「图鉴」」。

### 6.11 wiki 的页面层级与「是否达成」（`wiki.ts`）

```
主页
└── 物品 ─┬─ 装备 ── 物品条目
         ├─ 套装 ── 套装条目
         ├─ 资源 ── 物品条目
         └─ 消耗品 ─ 物品条目
    怪物 / 区域 / 事件 ── 条目
```

**物品下面多一层分类。** 别的列表是两级，物品是三级 —— 层级由 `pathMarkup` 按 page id 拼出来，`items-` 前缀就是判据（`ITEM_PAGES` 定义分类页，`ITEM_PAGE` 把物品类别映射到页面 id）。

**套装是独立条目类型**（`set:id`），与 `item:id` 平级。装备条目页**只放一个套装链接**（`codexRefMarkup('set', setId)`），套装效果、部件清单、极致进度全部写在套装页的 `setBody()` —— 一页只讲一件事，同一份数据不在两处维护。

**「是否达成」统一用 `statusLine()`**

```ts
function statusLine(text: string, done: boolean): string {
  return `<div class="requirement ${done ? 'done' : ''}"><span class="status-dot ${done ? '' : 'pending'}"></span><span>${text}</span></div>`;
}
```

和主线条件（`story` 页的 `.requirement`）共用同一套样式与语义。凡是「已穿 / 已极致」这类进度都用它，**不要自己拼文字或另造样式**。

**wiki 内部一律用格子，不用行内引用。** `itemRefMarkup` / `enemyRefMarkup` / `zoneRefMarkup` / `codexRefMarkup` 那一套（`.codex-ref`，icon + 名字的行内文本链接）是给**页面正文**用的 —— 主线条件、研究委托、日志这些地方，名字夹在一句话中间，行内引用才合适。弹窗里则相反：条目一行行排开，格子（`wiki-cell`）比行内引用好扫得多，也能顺带挂角注（概率、`3 / 5`）。

所以 `wiki.ts` 从 `codex-ref` 只导入 `codexEntry`（取数）和 `onWikiUnlockChange`（订阅），**不导入任何 `xxxRefMarkup`**。新增小节时用 `cellGridMarkup([entryCellMarkup(kind, id)])` 而不是 `refsMarkup([xxxRefMarkup(id)])`。

**列表页不汇总进度。** 五个列表页（物品 / 套装 / 怪物 / 区域 / 事件）现在都只有格子本身，没有任何「已收录 N / M」式的汇总行。原因分两种：物品与套装的逐条角注已经写明进度（每套卡上的「3 / 5」），汇总行只是把同一份数据再算一遍；怪物与区域的格子数量本身就是进度，玩家数得出来。

`statusLine` 现在只出现在**条目页的小节内部** —— 套装页的「凑齐效果 / 极致效果」，标的是这一条自己在某个维度上的完成度，和下面那段效果说明配对。那是有用的信息，不要跟着列表页的汇总行一起删掉。

**物品条目页的「掉落来源」不用 `statusLine`**（`dropSourceMarkup()`）：一行汇总（「已在 N 种怪物身上确认到」）会把逐条揭示的信息压缩成一个数字，而玩家真正要的是「哪几只知道」。改成 **`wiki-cell` 格子**（`wiki-grid` + `entryCellMarkup('enemy', id)`，和列表页同一套骨架）—— 已经真的从它身上掉出来过的给可点格子，遭遇过但还没掉过的给 `lockedCellMarkup()` 占位，一条都没确认到时也留一个占位格而不是整段隐藏。边界仍是「已遭遇过的怪物」，没见过的怪不参与，不剧透还有几处来源。

**占位一律走 `lockedCellMarkup()`**（wiki.ts）：骨架与真格子相同，只是虚线边框 + 压暗 + 不带 `data-codex`，所以点不开、也没有悬停反馈。用 `<span>` 而不是 `disabled` 的 `<button>` —— 它本来就不是能操作的东西，别让 Tab 键在格子里停一堆按不动的按钮。

### 6.12 解锁与渐进披露（R29 / R30）

**凡是有解锁门槛的内容，未解锁时一律不渲染**——不占位、不置灰、不挂锁图标。解锁后由顶部 tips 告知，并把内容追加进列表。

| 项 | 规则 |
| --- | --- |
| R29 | 未解锁的内容**禁止**渲染占位 / 置灰 / 锁图标；**必须**按解锁状态同步列表（未解锁的不在 DOM 里，解锁后追加）。解锁提示统一由 `game-state` 的 `unlockNotices` + `checkUnlocks` 驱动（`unlock-toast.ts` 消费），页面不要自己弹 |
| R30 | 未解锁的内容**禁止**参与游戏逻辑：`canStartWorkshop` 这类动作入口要自带解锁判定，`advanceLogistics` 这类自动流程要跳过未解锁项 |

**列表同步的写法**（签名比对 + 重新收集引用）

```ts
// mount：容器留空，引用集合也留空
const grid = view.querySelector<HTMLElement>('[data-ref="grid"]')!;
const ctx: any = { grid, cards: [], signature: null };

// update：只渲染已解锁项，签名变了才重建（解锁单向，重置存档也能收回）
const visible = items.map((_, id) => id).filter(id => isUnlocked(id, state));
const signature = visible.join(',');
if (ctx.signature !== signature) {
  ctx.signature = signature;
  ctx.grid.innerHTML = visible.map(id => cardMarkup(items[id], id)).join('');
  ctx.cards = collectCards(ctx.grid);      // ⚠️ 重建后必须重新收集 data-ref
}
```

⚠️ 重建后**必须重新收集 `data-ref`**，否则 `update` 会往已被替换掉的旧节点上写。所以卡片模板里的 `data-ref` 不要带下标（`data-ref="level"` 而非 `data-ref="level-${id}"`），在卡片范围内 `pick` 即可。

**已经这样实现的**：研究基地的研究项、工坊的制造项、冒险的区域下拉。
**明确例外（保持原样）**

| 场景 | 处理 | 原因 |
| --- | --- | --- |
| 导航栏按钮 | 置灰 + `❓未解锁` + `disabled` | 需求明确排除；导航要一直占位 |
| 成就卡片 | `❓` 占位卡 | 需求明确排除；未解锁数量本身是收集目标 |
| 未发现的物品 / 掉落 | `❓待发现` 占位格（`lockedCellMarkup`） | 条目位置固定，藏掉会让人以为「这一类就这些」；占位反而告诉玩家还有没见过的 |
| 未遭遇的怪物 / 未开放的套装、区域 | 同上 | 列表页一律列全，只是把没见到的换成占位 |
| 未确认的掉落来源 | 同上 | 边界是「已遭遇过的怪物」，只标这一条没确认，不剧透总数 |
| 未完成的主线节点 | `未解锁记录` / `??? 待恢复` | 剧情进度，占位表达「还有内容」 |
| 营地随机事件计时块 | `setHidden` | 单个元素，隐藏与不渲染等效 |

### 6.13 新手指引（R32）

引擎在 `src/guide.ts`，步骤表是文件顶部的 `GUIDES` —— 键同时是存档标记（`state.guides`）和解锁事件的 id。

**两层拦截（R32）**

高亮区**默认整体不可点**，只有 `step.click` 指定的元素被让出来 —— 讲某个面板时面板里的按钮按不动，是刻意的。

| 层 | 覆盖范围 | 作用 |
| --- | --- | --- |
| `.guide-shade`（4 块） | 高亮区**之外** | 挡住页面其他部分 |
| `.guide-block`（4 块） | 高亮区**之内** | 挡住面板里的按钮，默认整块拦死 |

`.guide-block` 围出的"洞"就是**允许点击的范围**：`step.click` 元素的矩形（裁进高亮区）。没写 `click` 时洞收缩成高亮框正中心的一个零尺寸点 = 整块拦死。

```css
.guide-layer  { position: fixed; inset: 0; z-index: 90; pointer-events: none; }  /* 层本身不挡 */
.guide-shade  { position: absolute; pointer-events: auto; }                       /* 外层：挡高亮区之外 */
.guide-block  { position: absolute; pointer-events: auto; }                       /* 内层：挡高亮区之内 */
.guide-ring   { pointer-events: none; }                                           /* 高亮框：虚线细边，纯展示 */
.guide-pocket { pointer-events: none; }                                           /* 可点区：实线脉冲，一眼找到 */
.guide-bubble { pointer-events: auto; }
```

`.guide-ring` 用虚线、`.guide-pocket` 用实线粗边 + 更快脉冲 —— 两者视觉上必须拉开差距，否则玩家分不清"在讲这个"和"要点这个"。

为什么不用 SVG mask / `box-shadow`：那两种方案里遮罩层仍然铺满整屏 —— SVG 的"洞"只是视觉上的、元素还在，得再补一层点击拦截；`box-shadow` 会被祖先的 `overflow` / `contain` 裁掉。四块 div 天然只挡该挡的地方。

**步骤写法**

```ts
{ target: '#camp-view', title: '营地', body: '…' }                          // 高亮面板，面板里的按钮按不动
{ target: '[data-page="camp"]', requireClick: true, title: '…' }            // 没写 click → 默认放行 target 本身
{ target: '#inventory-view', click: '[data-action="equip-stats"]', requireClick: true, title: '…' }  // 只放行面板里的某一个按钮
{ target: '#adventure-view', waitFor: state => state.totalWins >= 1, waitHint: '远征队正在交战，等这一场打完。', title: '…' }  // 等玩家真的做完一件事
{ title: '…', body: '…' }                                                    // 不挖孔，气泡居中
```

- `click` 与 `requireClick` 都不写 → 高亮区整体不可点。
- `requireClick: true` 且没写 `click` → 默认放行 `target` 本身（"点这里进去"这类）。
- `requireClick` 的步骤不显示「下一步」，只能点放行的元素或跳过。
- `waitFor` 成立前「下一步」禁用并显示 `waitHint`，成立后自动放行 —— 用来让玩家在引导里**真的做完一件事**（打赢一场、交一次委托）。判定只用 `GameState` 里的持久字段，刷新后能正确恢复；不要用 DOM 状态或一次性事件。
- 目标不在当前页面（还没切过去）时不挖孔、气泡居中，下一帧再试 —— 所以 `updateGuide()` 每次状态同步都重算位置，`waitFor` 也靠它轮询，不需要额外定时器。

**进度与触发**

- 「看过哪些」存 `state.guides`（id 字符串数组，新增引导不会让旧存档错位）。
- 首次进游戏放 `intro`；`onUnlock` 收到解锁事件时放同 id 的引导（不在 `GUIDES` 里的会被忽略，例如成就）。
- 跳过 = 标记已看 + 结束；多段引导自动排队播放。
- 重置入口：设置页「重置新手指引」（`restartGuides`）；重置存档后也会重放 `intro`。

---

## §7 API 契约

### 7.1 `PageDefinition`（`src/types.ts`）

```ts
interface PageDefinition<Context = any> {
  id: string;                                        // = data-page = 文件名 = 模板名
  template: string;                                  // './pages/<id>.html'（位于 public/）
  mount(root: HTMLElement): Context;                 // 建骨架、绑事件、返回 ctx
  update(state: GameState, context: Context): void;  // 只读 state，刷新 DOM
  locked?(state: GameState): boolean;                // true → 导航置灰不可点
}
```

### 7.2 写入 API（`src/dom.ts`，R01）

| 函数 | 语义 | 关键行为 |
| --- | --- | --- |
| `setText(el, value)` | 写文本 | 值相同则**不写** |
| `setNumber(el, value, precise?)` | 写数值 | 自动 `formatNumber` + 同步 `title` 精确值；`precise=true` 用 `formatNumberExact` |
| `setHtml(el, html)` | 写 HTML | `dataset.html` 缓存，相同内容不重绘 |
| `setWidth(el, percent)` | 写宽度 | 夹到 `0–100%`，2 位小数 |
| `setClass(el, name, enabled)` | 切类 | `classList.toggle` |
| `setHidden(el, hidden)` | 显隐 | 用 `hidden` 属性（配合 R19） |
| `setDisabled(el, disabled)` | 禁用 | 用 `disabled` 属性 |
| `pick(root, ...names)` | 收集 `[data-ref]` | 返回 `{ name: element }` |
| `toFragment(html)` | 字符串 → 片段 | 走 `<template>` |
| `prefersReducedMotion()` | 动效偏好 | 用于跳过动画 |
| `reportError(scope, msg, detail)` | 统一错误出口 | 只输出控制台，`[WebIdle]` 前缀 |

### 7.3 数值 API（`src/format.ts`，R03）

| 函数 | 输出规则 |
| --- | --- |
| `formatNumber(v)` | `<1e6` 完整 + 千分位；`1e6–1e15` 用 M/B/T（3 位有效数字）；`≥1e15` 工程计数法 |
| `formatNumberExact(v)` | 完整数字（开发者面板、输入回显） |
| `formatSigned(v)` | `+1,234` / `-1.23M` |
| `numberHint(v)` | 悬停精确值；与缩写结果相同则返回空串 |
| `formatDuration(s)` | 秒 → 分秒 → 小时分 → 天小时 |
| `formatSeconds(v)` | 一段秒数：`1.4 秒`（出手间隔这类只显示一位小数，**不要再自己写 `toFixed(1)`**） |
| `formatPerSecond(v)` | 每秒速率：`1.5 / 秒` |
| `NUMBER_FORMAT` / `numberFormats` | 档位常量与选项（自动 / 工程 / 科学） |

> 只有两种场景可以保留 `toFixed`：①「数值 + 自定义单位」的文案（如「每秒恢复 1.5 点生命」）；②非显示用途（SVG `stroke-dashoffset`、`setWidth` 内部）。其余一律走上面的函数。

非有限值：`NaN` → `—`，`±Infinity` → `∞` / `-∞`。缩写只在显示层，存档与计算用原始 `number`。

### 7.4 状态与动作（`src/game-state.ts`）

- **只读**：`getState()`、各 `getXxx(state)` 派生值、配置表 `items` / `zones` / `enemyTable` / `rarities` / `affixes` / `equipTypes` / `itemCategories` / `categoryOrder` / `equipBonusStats` / `fontScales` / `numberFormats` / `researchItems` / `workshopItems` / `logisticsTargets` / `campEventEntries` / `mainline` / `achievements`。
- **配置表自带的查询函数**（不要在页面里重写遍历）：`rarityClass(rarity)`（`config/rarity`）、`zoneOfEnemy(enemyId)`（`config/zones`）、`campEventDef(kind, index)` / `campEventEntryId(kind, index)`（`config/events`）。
- **动作（界面唯一允许的状态修改方式，R06）**：`selectZone` `equipItem` `equipToSlot` `discardItem` `discardEquipment` `useItem` `assignLogistics` `startWorkshopUpgrade` `startCampChallenge` `answerPendingEvent` `submitResearchTask` `upgradeResearchItem` `upgradeResearchItemToMax` `setResearchDifficulty` `setFontScale` `setNumberFormat` `setNotify` `resetGame` `devGrantItem` `devSetStat` `devUnlockSystems`。
- **订阅 / 启动**：`subscribe(cb)`、`onUnlock(cb)`、`startLoop()`（内部 `notify()` 由动作函数调用，界面不直接用）。

### 7.5 未解锁系统的统一表达（由 `main.ts` 统一处理，页面不要重复实现）

```
.locked + opacity .5 → disabled + aria-disabled="true" → 图标 ❓、文字「未解锁」→ 点击无响应
```

页面只在 `locked(state)` 里声明条件（如工坊 `state.mainlineIndex < 2`、研究基地 `!isResearchUnlocked(state)`）。
⚠️ 若当前停留页被锁上（如重置存档），`updateNavLocks` 会自动退回主界面。

### 7.6 敌人数值（`src/config/zones.ts`）

改 `ENEMY_DEFS` 前先读文件顶部的注释，三条约束：

| 约束 | 怎么保证 |
| --- | --- |
| 区域内强度相当 | 用「无装备玩家击杀这只怪的**净损失生命**」当强度指标，同区域所有怪物落在同一区间 |
| 偏科不同 | 强度拉平的前提下，攻击 / 出手间隔 / 血量 / 防御各偏一头（高攻慢手、低攻快攻、高血高防低攻…） |
| 开局区域无装备可过 | 新档 `inventory` 全 0、`equipment` 为空，废弃边境每一只都必须在「攻 12 / 防 0 / 血 100 / 回复 2」下打得赢 |

净损失 ≈ `T × (怪物 DPS − 玩家回复)`，`T = 玩家出手次数 × 出手间隔`。
「血厚 + 防高」的怪 `T` 天然更长，**攻击必须相应压低**，净损失才拉得平。

各区域的玩家基准（穿齐上一区域的套装 + 对应营火等级，见 §7.9）：

| 区域 | 玩家基准 | 净损失区间（占生命上限） |
| --- | --- | --- |
| 废弃边境 | 攻 12 / 防 0 / 血 100 / 回复 2 / 间隔 2.2（**裸装**） | 16~20% |
| 余烬矿脉 | 攻 30 / 防 6 / 血 240 / 回复 5.4（拾荒者套装齐 + 营火 3） | 27~33% |
| 核心深井 | 攻 50 / 防 8 / 血 260 / 回复 6 / 间隔 2.1（余烬套装齐 + 营火 5） | 32~33%（泰坦 43%） |

**金币按「每秒产出大致不变」折算**：击杀变慢的区域，单只金币同步抬高 —— 否则加强怪物会顺带砍掉经济。

**改套装属性就要重算这里** —— 套装是玩家战力的主要来源，基准一漂，整张表的净损失全偏。

⚠️ **`ENEMY_DEFS` 的键顺序不能动** —— `enemyId` 就是下标，`state.encountered` / `state.discoveredDrops` / `adventure.enemyId` 全按下标存，重排会让旧存档整体错位。新增怪物追加到所属区域分组的末尾。

### 7.7 物品储藏的页签（`src/pages/inventory.ts`）

页签集合是**「全部」+ `categoryOrder`**，不是纯 `categoryOrder`：

```ts
const ALL_TAB = 'all';                                    // 不是 ItemCategory，只在物品储藏内部用
const STORAGE_TABS: string[] = [ALL_TAB, ...categoryOrder];
const inTab = (category, tab) => tab === ALL_TAB || category === tab;
const tabLabel = (tab) => tab === ALL_TAB ? '全部' : itemCategories[tab].name;
```

- `ctx.category` 存的是**页签 id**（可能是 `'all'`），所以类型是 `string` 而不是 `ItemCategory`。
- 新增分类只改 `config/items.ts` 的 `categoryOrder`，页签会自动多一个 —— **不要**在页面里手写页签列表。
- 默认页签是 `ALL_TAB`（打开物品栏先看到全部东西）。

**强化道具的目标可以是装备槽**

使用模式（`body.enhancing`）下，点选目标统一由 `instanceAt()` 解析：

| 点击位置 | 怎么拿到 instanceId |
| --- | --- |
| 物品卡片 | `data-instance` 属性 |
| 装备槽 | 装备槽不记装着谁，用 `getState().equipped[equipType][slot]` 反查 |

空槽 / 可堆叠物品卡片 / 空白处都返回 `-1`，等同于「取消」。装备槽的可点状态由 CSS 给（`body.enhancing .equip-slot.filled`），JS 不重复判断。

### 7.8 自动进食（`game-state.ts` + `pages/adventure.ts`）

研究项「自动进食」解锁后，冒险页的远征队卡片下方出现一个栏位（未解锁时 `setClass(..., 'is-hidden', true)` 收起，不重建 DOM），可以指定一种**食物**与触发阈值；生命值低于阈值时自动吃一份。

**「食物」怎么判定（不要维护 id 清单）**

看道具 `use` 上有没有 `heal` 标记：

```ts
// config/items.ts —— 回血量同时挂在函数上
const healHandler = (amount: number): UseHandler => {
  const handler: UseHandler = context => { context.heal(amount); context.consume(); return { kind: 'done' }; };
  handler.heal = amount;
  return handler;
};
// game-state.ts —— 候选从这里来
export function foodItemIds(): number[] {
  return items.map((item, itemId) => (item.category === 'consumable' && item.use?.heal ? itemId : -1)).filter(id => id >= 0);
}
```

新增回血道具时**不需要改任何地方** —— 在 `ITEM_DEFS` 里写 `use: healHandler(N)` 就会自动进候选。

**触发点只有一个：`enemyAttack` 末尾**

```
enemyAttack → 扣血 → 血归零则撤回营地（return）→ tryAutoEat
```

- 挨打是**唯一会掉血**的时机，挂在这里最准。
- **不能**挂在 `advanceAdventure` 外层：一次 tick 可能推进多秒（离线最多 8 小时），会出现「先死再吃」。
- 吃一份后若仍低于阈值，下次挨打会再吃一份 —— 天然限流，不需要额外冷却。

**存档**

`state.autoEat = { itemId, threshold }`，`readAutoEat` 负责校验：`itemId` 必须仍然是食物（否则归 -1），`threshold` 夹进 `AUTO_EAT.minThreshold ~ maxThreshold`。委托需求区间调整过两次（90~110 → 20~40 → 8~12），`readResearchState` 会把旧存档的 `need` 一并压回 `RESEARCH.needMax`。

### 7.9 套装（`config/sets.ts`）

**部件清单只在套装表里**

`sets.ts` 的 `pieces` 是唯一来源；**物品表不写 `setId`** —— 否则 `items ↔ sets` 会形成循环依赖（`sets` 需要用 `ITEM` 来引用部件）。

```ts
scavenger: { name: '拾荒者', icon: '🔧', zone: ZONE.wasteBorder, dropChance: .15,
  pieces: [ITEM.rustHammer, ITEM.weldingMask, ITEM.patchedVest, ITEM.reinforcedGreaves, ITEM.nutCharm],
  bonus: { hp: 50, defense: 3, regen: 1 },       // 凑齐部件
  perfectBonus: { hpPct: 25 } }                  // 全部部件【极致】（见 §7.10）
```

`bonus` 与 `perfectBonus` 是两级奖励：前者凑齐部件就给，后者要求每个部件都精炼到 100 级。**越早的套装 `perfectBonus` 给得越重** —— 早期套装容易被后来的装备淘汰，百分比加成是唯一不会被淘汰的形式。

**掉落不占 dropTable 的名额**

`grantSetDrop()` 在 `defeatEnemy` 里独立调用：按 `setOfZone(zoneOfEnemy(enemyId))` 找到该区域的套装，按 `dropChance` 判定，随机给一个部位。它**不写进怪物的 `dropTable`**，所以不受「同一只怪物最多 3 条掉落」那条约束。

**生效条件：全部部件都在身上**

`getSetBonus()` 把已装备的实例按**物品 id 去重**后检查 `pieces.every(...)`：

- 装两件同名装备不会重复计数；
- **少一件就完全不生效**（不是按件数递增）。

加成并入玩家派生属性：

| 属性 | 汇入点 |
| --- | --- |
| `attack` / `hp` / `defense` | `getPlayerAttack` / `getPlayerMaxHp` / `getPlayerDefense`（排在 `getEquipBonus` 之后、词条百分比之前） |
| `regen` | `getPlayerRegen` |
| `attackInterval` | `getPlayerAttackInterval`（从 `PLAYER_ATTACK_INTERVAL` 2.2 秒里减，下限 0.9 秒） |

**新增一套的步骤**：在 `SET_DEFS` 追加一条（`pieces` 用 `ITEM.xxx`）+ 在 `ITEM_DEFS` 追加那几件装备。两边都追加在**末尾**，`setId` 与 `itemId` 自动对齐，不会动到存档里的既有下标。

**物品栏容量不含已装备的**

`getInventoryUsed()` 会把穿在身上的实例排除掉。不这么做的话，凑齐一套（5 件）反而把物品栏挤爆 —— 装备越多越没地方放东西。

### 7.10 精炼（`game-state.ts` + `pages/inventory.ts`）

重复装备的出路：**同名装备可以喂给同一件，把它的自身属性顶上去**。

```ts
export const REFINE_MAX = 100;   // 每级 +1% 自身属性，满级 = 属性翻倍
export function getRefine(instance: EquipmentInstance | undefined): number;
export function canRefineWith(instanceId: number, feederId: number, target?): boolean;
export function refineWithFeeder(instanceId: number, feederId: number): boolean;
```

**新等级 = `min(100, 目标等级 + 素材等级 + 1)`**

等级是**相加**的，不是「取较高者」也不是「素材等级 + 1」：两件都要投进去，所以拖拽没有方向之分，结果也永远大于目标原等级。

| 拖拽 | 结果 |
| --- | --- |
| +10 → +0 | **+11** |
| +0 → +10 | **+11**（对称） |
| +10 → +10 | **+21** |
| +60 → +60 | 121 → 夹到 **+100** |

攒够 100 级比一件件喂快得多，这是「掉落自带等级」这条设计的配套。

**入口是拖拽，不是右键菜单**：把装备 A 拖到同名装备 B 上。物品栏的 `dragover` / `drop` 同时认两类目标——装备槽（换装）与同名装备卡片（精炼），都不匹配就不 `preventDefault`，浏览器会显示禁止光标。

**只放大「装备自身属性」**

`getInstanceBonus()` 里乘 `1 + refine / 100`，**词条与套装加成都不过这一层**：

| 加成来源 | 受精炼影响 |
| --- | --- |
| `equip.attack / hp / defense`（装备自身） | **是** |
| 词条（`instance.affixes`） | 否 |
| 套装效果（`getSetBonus`） | 否 |

所以 `getEquipBonus` / `getEquipBonusSources` / 悬停浮层都会自动反映精炼 —— 它们都走 `getInstanceBonus`。**任何地方都不要直接读 `items[id].equip`**，那会漏掉精炼。

**素材规则（`canRefineWith`）**

1. 同名；
2. 素材没装在槽位上（已装备的不能当素材，否则玩家会把自己身上的装备喂掉）；
3. 目标还没满级。

**不要**加「素材等级必须比目标高」这类限制 —— 那会让低等级拖不到高等级上，方向不对称（踩过）。「不倒退」是相加公式天然的性质（`目标 + 素材 + 1` 恒大于目标），不需要在 `canRefineWith` 里额外判断。不满足条件时靠 `dragover` 不 `preventDefault` 体现（光标变禁止）。

**UI**

精炼等级显示在两处，**都要保留**：

| 位置 | 写法 | 为什么 |
| --- | --- | --- |
| 装备名右边 | `refineMarkup(level)` → `名称+N`（含 `+0`） | 看单件时最清楚 |
| 图标右下角 | `.item-refine` 角标 | 网格里一眼扫过去时，名字往往看不清，角标更快 |

卡片、装备槽、悬停浮层三处的名字侧显示必须一致（都走 `refineMarkup`）。满级两处都用暖色标【极致】。拖拽时目标卡片加 `.refine-target` 高亮。

**卡片描边 = `border` + `inset` 阴影，视觉粗细是两者之和**

```css
.item-card { border: 1px solid var(--card-line, var(--line-soft)); box-shadow: inset 0 0 0 7px var(--card-line, var(--line-soft)); }
.item-card[class*="rarity-"] { --card-line: color-mix(in srgb, var(--rarity-color) 30%, transparent); }
.item-card.equipped { --card-line: var(--accent); box-shadow: inset 0 0 0 11px var(--accent); }
```

| 状态 | 视觉粗细 | 阴影层 |
| --- | --- | --- |
| 普通卡片 | 8px | `inset 0 0 0 7px var(--card-line)` |
| 已装备 | 12px | `inset 0 0 0 11px var(--accent)` |
| 强化可选目标 / 精炼目标 | 2px | `inset 0 0 0 1px rgba(139, 245, 201, .45)` |

加粗只动阴影那一层，`border` 永远是 1px。

⚠️ **`--card-line` 必须从 `--rarity-color` 派生，不要手写每一档。** 曾经给 4 个稀有度类手写了 `--card-line`，结果清洗剂改用火红色（第 15 档）时描边掉回灰色 —— 两个变量要同步维护，加档位时必然漏。现在用 `color-mix` 从文字色派生一条 30% 透明度的描边，一条规则覆盖全部 16 档。

⚠️ **不要用 `border-width` 加粗** —— 那会让卡片外廓变大，网格跟着抖。装备槽的 `.filled` 同理（它也是 `border` + `inset 1px`）。

**【极致】**

精炼到 `REFINE_MAX`（100）称为【极致】。达成时把物品 id 记进 `state.perfectItems` —— 这是**「达成过」的记录而不是持有状态**，把那件装备当素材喂掉之后依然保留，wiki 与套装奖励都看它。

wiki 的物品条目页**不单开「极致」小节**：那只是一个是 / 否状态，占一节会把「掉落来源」这类真正有信息量的内容挤下去。改成物品名旁边的一个方框徽章（`.wiki-perfect`，`render()` 里按 `isPerfectItem(current.id)` 开关），标记常驻 DOM、靠 `hidden` 属性切换。徽章用 `align-self: stretch` 让上下边框贴着物品名的行高，比写死 `height` 稳 —— 物品名的行高会随根字号档位变。

**套装【极致】奖励**

一套的全部部件都进过 `perfectItems` 时，发放 `perfectBonus`（见 §7.9）—— **只给百分比**，因为越早的套装越容易被后来的装备淘汰，百分比是唯一不会被淘汰的形式。发放时只写一条日志，**不触发 unlock tips**（那套提示留给系统级解锁）。

判定是「这套的每个部件都达成过极致」，不是「同时穿着」—— 玩家可以分批精炼，不必同时持有。

**掉落自带的精炼等级（`ZONE_DEFS.dropRefine`）**

区域表里的字段，缺省 0：这个区域掉落的装备（套装部件与 `dropTable` 里的装备都算）自带几级精炼。

| 区域 | dropRefine |
| --- | --- |
| 废弃边境 | **10** |
| 余烬矿脉 | **5** |
| 核心深井 | **1** |

越早的区域给得越高 —— 早期装备靠一件件喂太慢，直接送一档起步；后期区域基本靠自己喂，所以只给 +1。新增区域不写就是 0。取值走 `zoneDropRefine(enemyId)`（按怪物反查区域），发放点是 `grantDrops` 与 `grantSetDrop`。

### 7.11 存档格式与导入导出（`game-state.ts` + `pages/settings.ts`）

**存档 = 编码后的信封 + `GameState`。** `localStorage` 里存的、导出成文本 / 文件的，都是同一段编码文本，只有一条格式定义。

信封本身是四个字段：

```json
{ "format": "ember-expedition", "version": 7, "savedAt": 1757836800000, "state": { /* GameState */ } }
```

- `format` —— 解码后判断「这是不是本游戏的存档」。**没有它就没法拒绝一段无关的文本**。
- `version` —— 比当前新就拒绝（提示先更新游戏），比当前旧就交给迁移表升级。
- `savedAt` —— 备份时间，也用来生成文件名。

**编码层（`encodeEnvelope` / `decodeEnvelope`）**：`JSON → UTF-8 字节 → 逐字节异或 → Base64 → 加 `EMBER7.` 前缀`。前缀用来一眼认出「这段文本是不是本游戏的存档」，不必先尝试解码；`7` 只是给人看的，解析时不读它。

⚠️ **这不是加密，是混淆。** 密钥（`XOR_KEY`）就在产物里，会看代码的人都能还原。它的作用只是让存档「看起来不是能直接改的文本」，挡住随手改数值的念头。单机游戏里真正的防作弊做不到 —— 密钥必然在客户端 —— 所以不往那个方向投入，也不要把 `XOR_KEY` 当成安全边界。

两个实现细节：走 `TextEncoder` / `TextDecoder` 而不是直接 `btoa(json)`，因为 `btoa` 只吃 Latin-1，存档里一旦出现非 ASCII 字符就会炸；逐字节拼 `binary` 而不是 `String.fromCharCode(...bytes)`，因为存档上千字节，展开成参数会爆栈。

代价是体积约 **1.35x**（Base64 的固有开销，异或不改变长度）。几 KB 的存档多出几百字节，可以接受。

`log` 与 `devOverrides` **都不入档**（见 `serialize()`）：`log` 占了全量 JSON 的绝大部分、刷新后重建成本极低；`devOverrides` 是开发者面板的临时覆盖值，带出去会让导入方的数值对不上。

**版本规则（改动 `GameState` 时按这里走）**

| 改动 | `SAVE_VERSION` | `MIGRATIONS` |
| --- | --- | --- |
| **新增字段** | 不动 | 不用加。`rebuildState` 以 `freshState()` 为底再覆盖（`{ ...initial, ...data }`），新字段自动拿到初始值 |
| **改动已有字段**（改名 / 拆字段 / 换类型 / 枚举重排） | **+1** | 补一条「从旧版本升到新版本」的转换 |
| **删除字段** | +1 | 可不写 —— `rebuildState` 会忽略多余字段 |

这是「可扩展 + 旧档永远能读」的全部机制，两点都要守住：

- **`parseSave()` 是唯一的解析入口**：解信封 → 按存档自己的版本依次跑 `MIGRATIONS` 升到当前版本 → `rebuildState()` 逐字段校验。读盘（`hydrate`）与导入（`importSaveText`）走的是同一条路，所以手改过的文件、旧版本的备份都能被同一套规则兜住。
- **迁移项只做结构转换，不补默认值** —— 补默认值是 `rebuildState` 的活，两处都做会互相打架。

**旧存档兼容**：`unwrapSave()` 认三种输入，这是「换格式不丢档」的全部保障：

| 输入 | 来源 | 处理 |
| --- | --- | --- |
| 编码文本（带 `SAVE_PREFIX`） | 当前格式 | 解码 → 取信封 |
| 明文信封对象（有 `format` 字段） | v7 的中间格式（当时 `state` 还是明文 JSON） | 直接用 |
| 裸 `GameState` | v6 及更早（版本号在 localStorage 的 key 名里） | 按 `SAVE_VERSION - 1` 处理 |

`readStoredSave()` 读不到新 key 时按 `LEGACY_SAVE_KEYS`（`ember-expedition-save-v6`）顺序兜底并**顺手搬到新 key**；`parseStored()` 对存量值先按 JSON 试、失败就当文本，所以 key 换了、格式换了都不会丢档。

**API**

| 入口 | 说明 |
| --- | --- |
| `exportSaveText()` | 返回编码后的存档文本。存成文件、复制粘贴、写进 localStorage 用的都是它，**只有一条编码路径** |
| `importSaveText(text)` | 返回 `SaveIoResult`（`{ ok, message }`）。失败时**不动当前存档**；成功前弹一次 `window.confirm` |
| `SaveIoResult` | `message` 直接就是给玩家看的一行话，UI 层不要再翻译一遍 |

`importSaveText` 会先 `trim()` 并去掉所有空白（存档文本是一整段 Base64，内部没有空白，但粘贴时容易带进换行）；开头是 `{` 时按明文 JSON 解析，兼容 v7 中间格式的备份。

**导入不补偿离线。** `importSaveText` 把 `lastTick` 直接对齐到当前时间，不走 `applyOfflineProgress` —— 否则「存一份备份、挂一周、再导入」就成了刷进度的捷径。导入的语义是「恢复进度」，不是「继续挂机」。

**导入必须先校验、后落盘。** `parseSave()` 对**任何**输入都会「成功」（无关 JSON 会被补成一份初始存档），所以 `validateSave()` 要先挡一道：解不出信封 → 「这不是本游戏的存档」；`version` 比当前新 → 「请先更新游戏」。没有这道判断，导入一个无关的 JSON 文件会得到「导入成功但进度没了」。

**四条通道，两种搬法**（`mountSaveIo()`）：导出为文本 / 从文本导入在 `textarea` 里贴文本，导出为文件 / 从文件导入走 `Blob` + 隐藏的 `<a download>` 与隐藏的 `input[type=file]`。两条通道的数据**完全一样**，区别只在「怎么搬」—— 换设备时文件更省事，手机上复制粘贴更方便。文本通道之所以成立，正是因为内容已经编码（见上）：一串 Base64 适合复制粘贴，明文 JSON 反而更适合存文件用编辑器看。

反馈写在按钮下面那一行文字上（`.save-feedback` + `.ok` / `.error`），不另做 toast。

### 7.12 词条与清洗剂（`config/affixes.ts` + `config/items.ts`）

**词条按类别划分，清洗剂按类别移除**。类别在 `AFFIX_CATEGORY` 里定义（`offense` / `survival` / `utility`），它同时决定两件事：词条名的颜色（§4.6），以及**哪个清洗剂能洗掉它**。

**清洗剂的效果文案带局部着色**：`useText` 是拼进 HTML 的（`statLine`），所以文案里可以内嵌 `<span class="affix-offense">` 之类把类别名染成对应的颜色 —— 「移除一条【<span>进攻</span>】词条」。文案由 `config/items.ts` 的 `solventText(category)` 统一生成，不要在物品表里手拼类名。

**词条名在详细信息里加粗**（`.item-affix-name { font-weight: 700 }`）：它是「这条属性叫什么」，要和后面的数值区分开。这个类只在 `statLine` 里用，所以规则不会外溢。

**词条带一句白话描述**（`AFFIX_DEFS[].desc`）：强化道具的详情里显示成「附加词条：锋锐 - 增加一定攻击力」，wiki 的「附加词条」小节也用它。**描述只讲作用方向、不写数值** —— 数值归下面三行「首次 / 重复 / 最高」管，两处都写会出现改了一处忘另一处的情况。改词条的实际效果时，`desc` 和 `summary` 要一起核对。

| 类别 | 现有词条 | 强化道具 | 清洗剂 |
| --- | --- | --- | --- |
| 进攻 | 锋锐（攻击力 %）、余烬爆裂（技能） | 锐化油、余烬核心 | 卸刃剂 |
| 生存 | 坚韧（生命上限 %）、铁壁（防御） | 生命之种、铁壁涂层 | 祛壳剂 |
| 功能 | 勤务（工坊工时 %） | 勤务手册 | 解构剂 |

**功能类不参与战斗**，只增益营地系统 —— 「勤务」加的是 `workshopRate`（每人每秒的工坊工时），在 `advanceLogistics` 里生效，不进任何战斗公式。后续这类「增益其他系统」的词条（研究速度、掉落加成…）都往这个类别加。

`removeAffixHandler(category)` 按类别筛词条；同类有多条时返回 `pick-affix`，由 `pages/inventory.ts` 的词条选择窗口让玩家选。

**清洗剂走独立的掉落通道**（`config/zones.ts` 的 `SOLVENT_DROP_CHANCE = .001`）：

- **任何**怪物都可能掉，与区域、怪物种类无关 —— 所以它不写进任何 `dropTable`，也不占「同一只怪物最多 3 条掉落」的名额，更不需要给 15 只怪各写一条。
- 掉哪一瓶随机，三种等概率（`SOLVENT_IDS`，见 `config/items.ts`）。
- **0.1%** 是刻意压到极低的档：洗词条是「纠错」而不是「日常」，不该随手就能用。按这个掉率，一千次击杀大约出一瓶。
- 稀有度统一**火红色**（14）—— 琥珀色（15）是任务物品专用的最高档，火红色是普通物品能到的最高一档。

和任务物品一样，wiki 的物品页对清洗剂走另一条说明（`solventSourceMarkup`）：它不在任何 `dropTable` 里，用「掉落来源」那套只会得到一片占位。

### 7.13 研究基地的委托（`game-state.ts` + `pages/research.ts`）

**委托只索取「任务物品」**：每个战斗区域在 `config/zones.ts` 里声明一个 `questItem`（共 3 种，`category: 'quest'`，稀有度统一琥珀色），该区域**所有**怪物统一 `QUEST_DROP_CHANCE`（10%）掉落。

这样改的理由：旧的委托要求「怪物的普通掉落物」，而一个物品常常只有 1~2 只怪会掉 —— 委托就变成了「挑某只怪刷」，玩家在区域里没有选择权。任务物品让诉求回到「去那个区域刷」，任何一只怪都可能带着它。

**掉落不走 `dropTable`**：`grantQuestDrop()` 和套装掉落一样独立成一步，所以不占「同一只怪物最多 3 条掉落」的名额，也不需要给 15 只怪各写一条。图鉴的物品页对任务物品走另一条说明（`questSourceMarkup`）—— 它不在任何 `dropTable` 里，用「掉落来源」那套只会得到一片占位。

**没有难度选择**：委托随机落在某个已解锁的战斗区域，奖励固定（`getResearchReward()` = 基础值 + 「信号放大」等级）。越深的区域靠怪物本身的金币与掉落拉开收益差，不需要再加一层倍率。研究项「任务需求降低 I」只压需求数量上限。

**需求数量 `8~12`**：10% 掉率下约等于 80~120 次击杀，按一场战斗 20~30 秒算是半小时左右 —— 这是刻意选的「刷得久」档。

**刷新**：`refreshResearchTask()` 花金币重抽一份，费用 = `refreshCostBase × (已刷新次数 + 1)`，交委托后归零。递增是为了让「反复刷到满意」有代价，而正常接单不受影响。

**旧存档的委托会被自动换掉**：`getResearchTask()` 的校验里带「必须是这个区域的任务物品」，所以版本更新后老玩家不会背着一份再也交不上的委托（要交的东西已经不在任何掉落表里了）。

### 7.14 更新日志与更新公告（`config/changelog.ts` + `src/changelog.ts`）

**公告文案是单独维护的，不是 git 提交信息的搬运。** 提交信息写给开发者：里面有函数名、文件名、CSS 类名、内部字段，
玩家读不懂也不该读（细节留在提交信息里）。玩家视角的文案写在 `src/config/changelog.ts` 的 `changelogNotes` 表里，
`src/changelog.ts` 只负责展示与「已读」判断。

| 项 | 规则 |
| --- | --- |
| 顺序 | 数组**由新到旧**，最新一条在最前面 |
| `id` | 玩家的已读标记（`settings.changelogSeen`）。**只有新增一条时才写一个新的**，改文案不要动它 —— 动一下所有人都会再收到一次公告。约定 `日期-序号`（如 `2026-09-14-3`） |
| `date` | `YYYY-MM-DD`，展示用 |
| `kind` | `feat` 新内容 / `balance` 平衡 / `fix` 修复 / `perf` 优化 / `misc` 调整。中文标签与颜色由 `changelog.ts` 的 `KIND_INFO` 映射，表里**不写标签文字、不写颜色类** |
| 未收录的提交 | **不进公告**。重构、构建配置、内部字段调整、开发工具这类改动不该打扰玩家，不必为它们补条目 |
| 发布流程 | **每次推送产出两份文案**：提交信息写给开发者（可用函数名 / 文件名 / 实现细节），公告条目写在这张表里给玩家看，**不要拿提交信息充当公告**。过一遍 `git log`，把玩家能感知的改动补到数组顶部 |

**已读版本存进存档**（`settings.changelogSeen`），不是 localStorage：它随存档走，换设备导入备份后不会重复弹，重置存档则会再弹一次。
新增字段不动 `SAVE_VERSION`，但设置项在 `rebuildState` 里走的是 `readSettings()`（逐字段校验）——**不要退回 `{ ...initial.settings, ...saved.settings }`**，那样 `changelogSeen` 会拿到 `undefined`。

| 入口 | 行为 |
| --- | --- |
| 设置页「版本更新日志」按钮（`data-action="changelog"`，在「存档操作」下方） | 全局点击委托（`main.ts`，与 `reset` 同一处）→ `openChangelog()`，列出全部记录 |
| 启动时的更新公告 | `startChangelog()`，`main.ts` 在 `initGuide()` 之后调用一次 |

**公告的两条豁免**（都不弹，并顺手把版本记成已读）：**没有任何存档**（新玩家不是「版本更新了」，而且新档还要放首次引导，两屏一起弹也看不过来，见 `hasExistingSave()`）；**首次引导还没放完**（引导层 `z-index: 90` 在最上层，压着它弹出来只会被盖住，走 `guide.ts` 的 `whenGuideIdle()` 等它结束）。

**「本次新增」怎么标**：比 `settings.changelogSeen` 新的那些记录加 `.is-new`（左侧主色竖线）。查不到已读 id（第一次带日志的版本、或那条记录已经被删掉）时只把最新一条当新内容。

**展示层**：单例浮层挂 `body`（`#page-content` 有 `contain: layout`，见 §10-01），`z-index: 76`，三种关闭方式齐全（R12）。文案仍过 `escapeHtml()` 再进 `innerHTML`（正文里可能带 `<` / `&`）。

---

## §8 反模式对照（❌ → ✅）

| # | ❌ 错误写法 | ✅ 正确写法 | 原因 |
| --- | --- | --- | --- |
| 01 | `el.textContent = v` / `el.innerHTML = h` | `setText(el, v)` / `setHtml(el, h)` | 无幂等保护，每帧触发重排/重绘 |
| 02 | `card.style.opacity = .5`（**带悬停浮层的**卡片置灰） | `setClass(card, 'locked', true)` + `.locked { border-style: dashed }` | `opacity < 1` 建层叠上下文，悬停浮层被后面的卡片盖住（无浮层的置灰卡片仍可用 `opacity: .45`） |
| 03 | `.tip { position: fixed }` | `.tip { position: absolute }` + `--tip-x/--tip-y` | `#page-content` 的 `contain: layout` 会把 `fixed` 后代改成相对它定位 |
| 04 | 浮层定位直接"夹进视口" | 右下 → 翻左 / 翻上 → 最后夹紧 | 夹紧会让浮层停在鼠标下，被自己 `:hover` 抓住 |
| 05 | 浮层内放按钮 | 点击目标放卡片上，浮层只展示 | 浮层 `pointer-events: none`（R10） |
| 06 | `.layer { display: grid }` 后靠 `[hidden]` 藏 | 显式补 `.layer[hidden] { display: none }` | 自带 `display` 会盖掉浏览器默认的 `[hidden]` |
| 07 | `.resource-strip { grid-template-columns: repeat(4, 1fr) }` | `grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr)` | 写死列数删项后右侧空一格 |
| 08 | 倒计时用实心条 | `.camp-event-track` 刻度格子 / `.spawn-ring` 环形 | 与血条视觉混淆 |
| 09 | 冷却时 `display: none` 藏卡片内容 | `visibility: hidden` | 保留占位，卡片高度不跳 |
| 10 | 数值容器不设 `tabular-nums` | 追加到 §4.4 选择器列表 | 位数变化时左右抖动 |
| 11 | `signature` 里包含数量 | 数量只就地 `setText`，不进 signature | 每次掉落重绘网格，悬停浮层跳动 |
| 12 | `#page-content.addEventListener(...)` | `root.onclick = ...`（mount 内赋值） | 跨页面累积监听器 |
| 13 | 每帧 `select.value = ...` | 自绘 `.zone-picker` | 打断用户正在进行的下拉选择 |
| 14 | `addEventListener` 给页面按钮 | `root.onclick` + `closest('[data-action]')` 委托 | 重绘后旧监听残留 / 内存泄漏 |
| 15 | 把选中项存进 `GameState` | 存进页面 `ctx` | 污染存档、触发无意义存盘 |
| 16 | 面板里写 `border-radius: 8px` | 圆角 0 | 破坏硬边风格（R18） |
| 17 | 组件里写 `color: #8bf5c9` | `color: var(--accent)` | 令牌集中管理（R16） |
| 18 | 稀有度写死颜色 | `.rarity-*` + `var(--rarity-color, inherit)` | 新增稀有度只改一处（R17） |
| 19 | `pointer-events: none` 做禁用 | `disabled` + `:disabled` 样式 | 键盘仍可聚焦、语义缺失（R13） |
| 20 | 在 `update()` 里读 `offsetHeight` | 在 `mount()` 或 `requestAnimationFrame` 里读 | 强制同步重排 |
| 21 | 文案里写 `` `${item.name}` `` / `${enemy.name}` / `${zone.name}` | `itemRefMarkup` / `enemyRefMarkup` / `zoneRefMarkup`（渲染层）；`itemTag` / `enemyTag` / `zoneTag`（存档文本） | 裸名字没有 icon、没有类型色、点不开图鉴（R26） |
| 22 | 把 HTML 拼进 `addLog` 的 message | 存 `[[kind:id]]` 标记，渲染时 `renderCodexTags` | message 会写进存档（R27） |
| 23 | 图鉴引用放在每 500ms 重绘的 innerHTML 里 | 段落拆成稳定部分（`setHtml`）+ 变动部分（`setText`） | 引用被反复重建，悬停与点击都会被打断 |

---

## §9 自检清单（逐条可判定，全部 YES 才算完成）

**结构**

- [ ] 新页面四处已同步：模板 html / 页面 ts / `main.ts` 注册 / `index.html` 导航项
- [ ] `PageDefinition.id` == `data-page` == 文件名 == 模板名
- [ ] 导航项数量变化时，`style.css` 900px 断点的 `repeat(N, 1fr)` 已同步
- [ ] 新增多列布局已在 900px / 600px 给出降级

**写入**

- [ ] 所有 DOM 写入都走 `dom.ts`（R01/R02）
- [ ] 所有数值都走 `setNumber` / `formatNumber`（R03）
- [ ] `update()` 内无布局读取、无副作用、可重复执行（R04）
- [ ] 结构重建用 signature，且 signature 不含数量（R07）
- [ ] 事件绑在 `root` 上且用赋值（R08）
- [ ] 文案里的物品 / 怪物 / 区域名都走 `xxxRefMarkup` / `xxxTag`，没有裸 `item.name` / `enemy.name` / `zone.name`（R26）
- [ ] 写进存档的文本只含 `[[kind:id]]` 标记、不含 HTML（R27）
- [ ] 所有渲染这类文本的地方都过了 `renderCodexTags`（含 `MainlineRequirement.text()` 的每个调用处），页面上不会出现 `[[…]]` 原文
- [ ] 有解锁门槛的内容未解锁时不渲染、解锁后才追加（R29）；未解锁项不参与任何逻辑（R30）
- [ ] 动态列表重建后重新收集了 `data-ref`（卡片模板里的 `data-ref` 不带下标）
- [ ] 含引用的段落没有被高频重绘的数值污染（拆成 `setHtml` + `setText` 两段）
- [ ] 新增区域在 `config/zones.ts` 里给了 `icon`

**交互**

- [ ] 悬停浮层 `pointer-events: none`，内部无可点内容（R10）
- [ ] 指代一整类内容（「任意怪物」这类）用 `pageRefMarkup`，不是编一个不存在的条目引用
- [ ] 对照 §6.10 的「统一接口速查」逐项检查：没有页面自己重写条目取数、稀有度类名、掉落行、秒数格式化、解锁判定
- [ ] wiki 未解锁时引用是纯文本（`.is-plain`）、解锁后才是可点链接（R31）；`main.ts` 的同步在页面渲染之前
- [ ] 引导层 `pointer-events: none`；高亮区默认被 `.guide-block` 拦死，只有 `step.click`（或 `requireClick` 时的 `target`）被让出来（R32）
- [ ] 高亮框（虚线）与可点区（实线脉冲）视觉上能一眼区分（R32）
- [ ] 等待型步骤的 `waitFor` 只读 `GameState` 的持久字段，不依赖 DOM 状态（刷新后仍能恢复）
- [ ] 物品储藏的页签由 `STORAGE_TABS`（全部 + `categoryOrder`）生成，页面里没有手写的页签列表
- [ ] 「食物」判定走 `use.heal` 标记，没有硬编码的 id 清单；新增回血道具只需写 `healHandler`
- [ ] 自动进食的触发只在 `enemyAttack` 末尾，没有挂到 `advanceAdventure` 外层
- [ ] 套装部件清单只写在 `config/sets.ts` 的 `pieces` 里，物品表没有 `setId`（避免循环依赖）
- [ ] 新增套装时 `SET_DEFS` 与 `ITEM_DEFS` 都是**追加到末尾**，没有插队改到既有下标
- [ ] 读装备属性一律走 `getInstanceBonus(instance)`，没有直接读 `items[id].equip`（会漏掉精炼）
- [ ] 精炼走的是 `canRefineWith`（同名 + 素材未装备 + 素材等级够高），入口是拖拽而不是右键菜单
- [ ] 精炼等级显示在装备名右边（`refineMarkup`），卡片 / 槽位 / 悬停三处一致
- [ ] 会滚动 / 有状态的弹窗，`update()` 里重写 `innerHTML` 前先比签名（R22 陷阱）
- [ ] wiki 里凡是「已穿 / 已极致」这类进度都走 `statusLine()`，没有自己拼文字；列表页没有汇总进度行
- [ ] 套装效果只写在套装页（`setBody`），装备条目页只放一个套装链接
- [ ] 悬停元素支持 `:focus-visible` 且有 outline（R11）
- [ ] 点击卡片不会让悬停浮层移动（`focusin` 已按键盘 / 鼠标来源区分，R28）
- [ ] 弹窗三种关闭方式齐全（按钮 / 遮罩 / Esc）（R12）
- [ ] 禁用项用 `disabled`（R13）；按钮都写了 `type="button"`（R14）
- [ ] 新增浮层 z-index 落在 §1 区间内

**样式**

- [ ] 颜色全部来自令牌（R16）；稀有度走 `--rarity-color`（R17）
- [ ] 无 `border-radius`（R18）
- [ ] 浮层容器补了 `[hidden] { display: none }`（R19）
- [ ] 变化的数字容器已加入 `tabular-nums` 选择器（R20）
- [ ] 等分条用 `grid-auto-flow: column`（R21）
- [ ] 时间指示不是实心条（R22）

**工程**

- [ ] `npm run build` 通过（含 `tsc --noEmit`）
- [ ] 未改动 `config/*.ts` 已有条目顺序（R24）
- [ ] 新增构建期常量已同步 `globals.d.ts`（R25）
- [ ] 开发者功能包在 `if (__DEV_TOOLS__)` 内（R25）

**人工可验证**

- [ ] Tab 能聚焦所有可交互元素，Enter 能触发，Esc 能关浮层
- [ ] 900px / 600px 下无横向溢出
- [ ] 悬停浮层不被视口裁切，鼠标移开能收起
- [ ] 切换字体档位（小/中/大）后布局不错乱、页面高度不跳

---

## §10 已知陷阱（现象 → 正确做法，勿回退）

| # | 现象 | 正确做法 |
| --- | --- | --- |
| 01 | 浮层被裁进页面容器 | 用 `absolute` + CSS 变量传坐标，不用 `fixed`（`contain: layout` 影响） |
| 02 | 悬停浮层被后面的卡片盖住 | 带浮层的卡片置灰用 `border-style: dashed`，不用 `opacity` |
| 03 | 弹窗藏不住 | 显式 `.xxx[hidden] { display: none }` |
| 04 | 鼠标移开浮层仍显示 | 定位用"翻转"而非"夹紧"；浮层 `pointer-events: none` |
| 05 | 等分条删项后右侧空一格 | `grid-auto-flow: column` + `grid-auto-columns` |
| 06 | 数值位数变化左右抖动 | `font-variant-numeric: tabular-nums` |
| 07 | 下拉选择被强行改回 | 自绘 `.zone-picker`，不用原生 `<select>` |
| 08 | 暂停后日志重复刷屏 | `ctx.anchor` **每帧**推进到最新一条（见 §2.8） |
| 09 | 悬停浮层跳动 / 卡片被换掉 | signature 不含数量；数量只就地 `setText` |
| 10 | 时间指示与血条混淆 | 用刻度格子 / 环形进度 |
| 11 | 刷怪冷却时卡片高度跳动 | 内容 `visibility: hidden` 保占位 |
| 12 | 自定义光标压不住拖拽光标 | 单独声明 `body.enhancing .item-card[draggable="true"] { cursor: var(--enhance-cursor) }` |
| 13 | 浮层 z-index 打架 | 按 §1 区间取号 |
| 14 | 浮层位置随页面滚动跑偏 | `hover-tip.ts` 已在 `scroll`（capture）/ `blur` / `pointerout` 时归位，勿删 |
| 15 | 点一下卡片，详情浮层瞬移到卡片下方 | `focusin` 里先看聚焦来源：只有 Tab（`keyboardFocus`）才 `placeBelowCard`，鼠标点击引起的聚焦直接 return | 卡片带 `tabindex="0"`，鼠标点它同样触发 `focusin`（R28） |
| 16 | 页面上直接显示 `[[item:1]]` 原文 | 渲染点过 `renderCodexTags`（`MainlineRequirement.text()` 的每个调用处都不能漏） | 生成时写了标记、渲染时没解析（R27） |
| 17 | 动态列表重建后 `update` 写到旧节点上 | 重建后重新 `collectCards(ctx.grid)`；模板里的 `data-ref` 不带下标 | 旧节点已从 DOM 摘掉，引用成了悬空对象（R29） |
| 18 | 未解锁的内容仍被自动流程处理（如后勤把未解锁的制造项造出来） | 动作入口加解锁判定，自动流程 `continue` 跳过 | 未解锁的内容不该参与逻辑（R30） |
| 19 | 引导高亮某个面板时，面板里的按钮被误点 | 高亮区**默认整体不可点**，只有 `step.click` 的元素被让出来（靠 `.guide-block` 围洞） | 高亮区若直接敞开，玩家会点到正在被讲解的按钮（R32） |
| 20 | `requireClick` 的步骤卡死，怎么点都不前进 | 引导层自身 `pointer-events: none`；放行元素要写进 `step.click`，或依赖 `requireClick` 时默认放行 `target` | 拦截层盖过头，会把该点的地方也挡上（R32） |
| 21 | 本地重新构建后，`python server.py` 托管的页面里开发者面板消失了 | 本地验证一律用 `npm run build:devtools`（或直接重启 `python server.py`） | `npm run build` 按设计关闭开发者功能，会把 `dist/` 覆盖成纯净产物；`__DEV_TOOLS__` → `false` 后面板代码被摇树删掉，`Ctrl+F5` 无效 |
| 22 | 弹窗内容滚不动，每次滚轮都弹回顶部 | 给弹窗内容算签名，**只在签名变化时**才重写 `innerHTML` | `update()` 每 500ms 跑一次，无条件重写 `innerHTML` 会把滚动位置一起重置（装备加成窗口踩过） |
| 23 | 连续选同一个文件，`change` 不触发 | 读完文件立刻 `input.value = ''` | 值没变浏览器不派发 `change`（存档导入踩过） |
| 24 | 导入一份无关的文本，提示「导入成功」但进度没了 | 先 `validateSave()` 挡一道，再 `parseSave()` | `parseSave` 对任何输入都会「成功」（补成初始存档），不校验就等于接受一切 |
| 25 | 复制按钮点了没反应，也没提示 | `navigator.clipboard` 可能不存在（非 HTTPS / localhost），失败时退回「已选中，请手动 Ctrl+C」 | `writeText` 在非安全上下文不可用；静默失败会让玩家以为复制成功了 |
