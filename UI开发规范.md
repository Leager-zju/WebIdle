# UI 开发规范（机器执行版）

```
PROJECT   WebIdle / 余烬远征（纯文字放置 RPG，单页多视图）
AUDIENCE  代码生成 / 修改代理（LLM）
USAGE     改 UI 前：先读 §0 §1 §2；按 §3 任务索引定位；写完后跑 §9 自检
RULES     规则编号 R01–R30，违反即缺陷；反模式见 §8
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
| 新增弹窗 | §2.5 §1-R12 | `src/pages/*.ts`、`style.css` |
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
| `--warm` | `#ffb86b` | 成本 / 倒计时 / 待响应 / 稀有度 rare |
| `--red` | `#ff8e7b` | 敌方 / 失败 / 材料不足 / 破坏性操作 |
| `--blue` | `#9ac8ff` | 信息 / 战斗日志 / 稀有度 uncommon |

### 4.2 稀有度（`--rarity-color`，R17）

| 类 | 名称 | 值 |
| --- | --- | --- |
| `.rarity-common` | 普通 | `--text` |
| `.rarity-uncommon` | 精良 | `--blue` |
| `.rarity-rare` | 稀有 | `--warm` |
| `.rarity-epic` | 史诗 | `#d69dff` |

用法：元素写 `color: var(--rarity-color, inherit)`；类名用 `` `rarity-${rarities[item.rarity].className}` `` 拼。**必须着色**的元素：`.codex-ref-name`（图鉴引用，首选）、`.item-name`（散文里的裸物品名）、`.item-affix-name`、`.equip-slot-name`、`.equip-stat-source`、`.item-detail-name`。边框着色只加卡片（`.item-card.rarity-*`）。

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
| 掉落表的一行 | `dropEntryMarkup(drop, discovered)` | 各页面自己拼「概率 · 数量」 |
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
- 列表页只列已解锁 / 已遭遇的内容（§6.11）；条目页的掉落沿用「逐条揭示」，未发现的不剧透。
- 点击委托由 `startCodexWiki()` 在**捕获阶段**注册，并 `stopPropagation()` —— 点名字不该触发页面自己的 `root.onclick`。

**事件条目（`src/config/events.ts`）**：名字 / 图标 / 描述 / 应对建议是静态的，放 config 里让 `codex-ref` 与 wiki 都能读；强度与奖励随存档现算，wiki 从 `getCampEventInfo()` 取。`campEventEntries` 的下标即事件条目 id，`campEventEntryId(kind, index)` 做反向查找。

**wiki 解锁前：引用降级（R31）**

- 所有引用（含 `pageRefMarkup`）在 wiki 未解锁时渲染成 `<span class="codex-ref is-plain">`：icon 与类型色照旧，去掉下划线、不可点、不带 `data-codex`。所以锁着的时候点不开 wiki，也不需要额外拦截。
- 解锁状态由 `main.ts` 每帧同步给 `setWikiUnlocked()`（同 `format.ts` 的数字档位），**必须在 `pageController.renderCurrent()` 之前**同步，否则本帧画出来的还是上一帧的形态。
- 为什么不直接让 `codex-ref` 读 state：`game-state` 反过来要引用 `itemTag` / `pageRefMarkup` 拼文案，直接依赖会成环，所以走注入式状态。
- 状态翻转回未解锁（如重置存档）时，`onWikiUnlockChange` 会通知 wiki 自己关掉弹窗。
- 解锁条件就是成就「初次冒险」（`isWikiUnlocked`），成就的 `rewardUnlock` 会额外弹一条「解锁：系统「图鉴」」。

### 6.11 解锁与渐进披露（R29 / R30）

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
| 未遭遇的怪物 | wiki 的怪物列表里不出现 | 这是「发现」不是「解锁」，由 `isEncountered` 过滤 |
| 未发现的掉落 | `??? 待发现` | 同上 |
| 未完成的主线节点 | `未解锁记录` / `??? 待恢复` | 剧情进度，占位表达「还有内容」 |
| 营地随机事件计时块 | `setHidden` | 单个元素，隐藏与不渲染等效 |

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
