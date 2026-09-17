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
| `index.html` | 应用外壳：header / sidebar / `#page-content` / 右侧概览栏 `#hud` | 仅新增 `.nav-item` / 往 `#hud` 里加块 |
| `src/style.css` | 全部样式（约 580 行，分区注释） | 是，追加式 |
| `src/dom.ts` | DOM 写入工具，**唯一写入通道** | 仅新增通用工具 |
| `src/format.ts` | 数值 / 时长格式化，**唯一出口** | 仅新增格式化函数 |
| `src/page-controller.ts` | 模板加载 / 挂载 / rAF 合并刷新 / 高度测量 | 一般不改 |
| `src/main.ts` | 注册页面、订阅状态、导航同步、启动全局模块 | 是（注册新页面） |
| `src/hud.ts` | 右侧常驻概览栏（`#hud`：资源 / 冒险状态 / 当前主线）的取引用与每帧更新 | 是 |
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
| `src/config/*.ts` | 静态配置表（items / affixes / rarity / zones / events / maps / unlock） | 仅末尾追加 |
| `src/pages/*.ts` | 页面逻辑（7 个：庇护所 / 冒险 / 物品栏 / 工坊 / 研究基地 / 远征档案 / 设置） | 是 |
| `public/pages/*.html` | 页面静态骨架（fetch 加载） | 是 |

### 数据流（唯一方向）

```
game-state 变更 → notify() → main.ts subscribe 回调
  ├─ updateSharedHeader()            顶部状态 + 导航锁定/高亮
  ├─ updateNavLoad()                 物品栏入口的负载徽标
  ├─ updateHud()                     右侧概览栏（资源 / 冒险状态 / 当前主线）
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
| R33 | **玩家可见的说明性文字只在明确要求时写**：按钮 / 开关下方的解释、面板页脚与页面说明、图鉴 / 帮助里的补充段都算 —— 没明说就不加，也不要「顺手补一句」。缺文案就留空，要加先问 |

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
| 1 / 0 | 页面内容列 `.page-content` / 右侧概览栏 `.hud`（内容列压住概览栏 —— 悬停浮层住在内容列里，`contain: layout` 让它跑不出这一列，见 §10-36） |
| 6 / 7 | 悬停浮层 / 悬停宿主（`z-index: 7` 给宿主） |
| 40 | `.zone-menu` 自绘下拉 |
| 60 | `.item-context-menu` 右键菜单 |
| 65 | `.enhance-hint` 底部提示条 |
| 70 | 遮罩类弹窗（`.stats-layer` / `.dev-modal-layer` / `.affix-picker-layer` / `.discard-layer` / `.help-layer` / `.install-layer`） |
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
<section class="page-heading">
  <div><span class="panel-kicker">KICKER / SUB</span><h2>页面名</h2><p>一句剧情向的氛围句（不写操作）</p></div>
  <div class="page-heading-side">
    <span class="page-code">NAME / 09</span>
    <button class="help-button" type="button" data-help="xxx">帮助</button>
  </div>
</section>
<section class="panel xxx-panel" id="xxx-view"></section>
```

⚠️ 标题下那句**只写氛围**，「怎么用」写进 `config/help.ts`（见 §7.18）—— 每个页面都要有【帮助】按钮，键就是页面 id。

⚠️ **带页签的页面**（远征档案 / 研究基地 / 之后所有页签页）视图根**不能是 `.panel`**，面板写进页签里：

```html
<div id="xxx-view"></div>
```

编号沿用 `ARCHIVE / 01` … `SETTINGS / 07` 的两位数格式。

### 2.3 `index.html` 导航项 + `main.ts` 注册

```html
<!-- index.html：插在 .main-nav 内，位置即导航顺序 -->
<button class="nav-item" type="button" data-page="xxx"><span class="nav-index" aria-hidden="true">🔧</span><span class="sidebar-label">页面名</span></button>
```

```ts
// main.ts
import xxxPage from './pages/xxx';
[campPage, adventurePage, /* ... */, xxxPage].forEach(page => pageController.register(page));
```

⚠️ 导航项数量变化时同步 `style.css` 的 900px 断点：`.main-nav { grid-template-columns: repeat(N, 1fr) }`（当前 N=7）。
导航顺序由 `index.html` 决定，页面右侧的 `page-code` 编号（`ADVENTURE / 01` …）也要跟着顺延。
当前顺序：**远征档案 / 冒险 / 庇护所 / 物品栏 / 工坊 / 研究基地 / 设置**（只有「设置」固定在最下面，
`style.css` 里那一行 `order: 1` 只管它一项 —— 新系统的导航项插在它之前）。

⚠️ **新系统的导航项一律插在「设置」之前**：只有「设置」固定在最下面（`style.css` 用
`.nav-item[data-page="settings"] { order: 1 }` 兜底，防止新项被直接追加到末尾把它挤到中间去）。
「远征档案」现在排在最上面（自己一行，不再钉在底部 —— 别再把它加回那条 `order` 规则）。
侧栏高度跟着导航项数量走（不写 `min-height`），所以加减导航项不需要动侧栏的高度。

⚠️ **新内容优先做成已有页面的页签，而不是新页面**：多一个导航项就要同步断点、`page-code` 与手机端列数。
「勘探图」原来是自己一个页面，后来并进研究基地做成了页签（见 §7.17）—— 页签的写法与结构照 §6.2 的「页签的标准接法」来。

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

<!-- 形态 B-小：小号磁贴（比上面小一圈）。研究项与成就用它，两处共用同一份尺寸 -->
<div class="item-grid storage-grid tile-compact"><!-- 同上 --></div>
```

必带：`tabindex="0"`、`data-*` 标识（事件委托靠它）。物品的卡片还要稀有度类；
成就 / 研究项这类**没有稀有度**的磁贴不写稀有度类（`--card-line` 走回落值，见 §6.5）。可拖拽装备加 `draggable="true"`。

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

**先用现成的那一对**：物品 / 研究项 / 成就都是 `.item-card` + `.item-detail`，`hover-tip.ts` 的选择器里已经有了 ——
这类卡片照 §2.4 的磁贴抄一行就完事，**不要动 `hover-tip.ts`**（见 §6.5）。只有全新的宿主形态
（`.shop-item` / `.equip-slot` 那种）才照下面接一遍。

```html
<article class="xxx-host" tabindex="0">…<div class="xxx-detail">…</div></article>
```

```css
.xxx-host { position: relative; cursor: help; }
.xxx-host:hover, .xxx-host:focus-visible { z-index: 7; }   /* §1 的 7 号：悬停宿主 */
.xxx-host:focus-visible { outline: 1px solid var(--accent); outline-offset: 2px; }   /* R11 */
```

同时把宿主类加入 `src/hover-tip.ts` 的 `HOST_SELECTOR`，浮层类加入 `TIP_SELECTOR`，并把浮层类补进 `style.css` 的公共定位规则（**位置只由指针移动与 Tab 聚焦决定，鼠标点击不得改变它，见 R28 / §10-15**）：

```css
.item-detail, .shop-detail, .xxx-detail {
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
<div class="camp-stat-grid"><div class="mini-stat"><span>庇护所生命</span><b data-ref="hp"></b></div></div>

<!-- 进度条 -->
<div class="health-track"><div class="health-bar player-health" data-ref="health"></div></div>
<div class="capacity-track load-track"><div class="capacity-bar load-bar" data-ref="bar"></div></div>

<!-- 条件行（达成条件 / 任务进度通用） -->
<div class="requirement done"><span class="status-dot"></span><span>条件文案</span></div>

<!-- 日志条目（三列：时间 / 类型 / 正文） -->
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
| 新增页面 | §2.1 §2.2 §2.3 §5 §7.18 | `public/pages/*.html`、`src/pages/*.ts`、`src/config/help.ts`（补一条帮助）、`main.ts`、`index.html`、`style.css` |
| 改页面上的一句话说明 | §7.18 | 氛围句在 `public/pages/*.html` 的 `<p>`；操作说明在 `src/config/help.ts` |
| 改右侧概览栏（`#hud`）显示的内容 | §6.14 §5.3 | `index.html` 的 `#hud`、`src/hud.ts`、`style.css`、本文件 §6.14 |
| 新增卡片 / 网格 | §2.4 §6.5 | `src/pages/*.ts`、`style.css` |
| 文案里要出现物品 / 怪物 / 区域名 | §6.10 §1-R26 R27 | `src/codex-ref.ts`（引用）、`src/pages/*.ts`、`src/game-state.ts`（日志） |
| 新增区域（含图标） | §6.10 §4.2 §7.17 | `src/config/zones.ts`（末尾追加，必须给 `icon` 与 `unlock`）、`src/types.ts` |
| 新增区域解锁规则 | §7.17 | `src/config/unlock.ts`（`unlockBy`）、`src/config/zones.ts`（在 `unlock:` 里组合） |
| 新增一节**第一章**的主线 | §6.7 §7.19 | `src/game-state.ts`（`mainline` **末尾**追加 —— 下标即存档值，不能插队）、`src/pages/story.ts`（`chapterStory[0]` 补一行旁白） |
| 新增一章 / 后续章节的一节 | §6.7 §7.19 | `src/game-state.ts`（`storyChapters` 末尾追加 + 奖励条目写 `unlockBy.chapter(章, 节)`）、`src/pages/story.ts`（`chapterStory` 补一张旁白表）、`unlockNotices` **末尾**手写一条提示 |
| 新增勘探图 / 地图残片 | §7.17 | `src/config/maps.ts`（追加到末尾）、`src/config/items.ts`（残片实物）、`src/pages/research.ts`（勘探图页签） |
| 新增有解锁门槛的内容 | §6.11 §7.17 §1-R29 R30 | 制造项 / 研究项给 `unlockIndex`，**区域给 `unlock` 规则**（见 §7.17）；`src/pages/*.ts`（列表同步）；`src/game-state.ts`（`unlockNotices` 自动收录、动作函数加判定） |
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
| 改后勤人数 / 工坊人手分配 | §7.15 | `src/game-state.ts`（`LOGISTICS` / `fortSlot` / `logisticsTargets` / `advanceLogistics`）、`src/pages/workshop.ts` |
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

色板一次备足 **17 档**（`--rarity-0` ~ `--rarity-16`，见 `:root`），类名由 `rarityClass()` 从 `config/rarity.ts` 的 `className` 生成。**目前已用到 7 档**：

| id | 类 | 名称 | 令牌 | 分配给 |
| --- | --- | --- | --- | --- |
| 0 | `.rarity-gray` | 灰色 | `--rarity-0` | 废弃边境 |
| 1 | `.rarity-white` | 白色 | `--rarity-1` | 余烬矿脉 |
| 2 | `.rarity-blue` | 蓝色 | `--rarity-2` | 核心深井 |
| 3 | `.rarity-green` | 绿色 | `--rarity-3` | 熔火裂谷 |
| 14 | `.rarity-fireRed` | 火红色 | `--rarity-14` | 特殊渠道物品（清洗剂、地图碎片） |
| 15 | `.rarity-amber` | 琥珀色 | `--rarity-15` | 任务物品（跨区域，单独占最高档） |
| 16 | `.rarity-indigo` | 靛蓝色 | `--rarity-16` | 系统物品（钥匙一类，见 §7.19；**当前没有物品使用**，档位留着） |

4~13 档（橙 / 浅红 / 粉红 / 浅紫 / 青柠 / 黄 / 青 / 红 / 紫 / 彩虹）是留给后续区域的空位，颜色已经在 `:root` 里备好 —— **加区域时往上取一档即可，不用回来改 CSS**。分配规则因此只有一条：**越后期能拿到的物品，档位越高**。三档「特殊渠道」（14 / 15 / 16）不和区域抢位置：它们的物品不是按区域进度拿到的（走独立通道），谁先拿到谁后拿到都一样。**再往上加档就往后取（17、18…），但别插在中间** —— 色板与档位语义都是只追加。

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
.mini-stat b, .hud-row b, .nav-load, .combatant-stats b, .codex-stats b, .camp-stat-grid b,
.item-stats b, .equip-stat-value, .dev-stat-value, .camp-timer, .capacity-summary, .discard-owned { font-variant-numeric: tabular-nums; }
```

### 4.5 尺寸惯用值

| 项 | 值 |
| --- | --- |
| 圆角 | **0**（R18） |
| 面板内边距 | `22px`；块内 `--surface-2` 块 `18px` |
| 卡片内边距 | 信息卡 `16px`；磁贴 `8px` |
| 卡片描边 | 视觉 8px（`border` 1px + `inset 0 0 0 7px`），颜色由 `--card-line` 给（见 §6.5） |
| 磁贴图标框 | 物品栏 `min(60px, calc(100% - 25px))` / 小号 `min(46px, calc(100% - 10px))`，与字号同比（见 §6.5、§10-27）
| 栅格间距 | 主布局 `18px`，网格内 `10–14px`，紧凑行 `6–8px` |
| 边框 | 块 `1px solid var(--line)`；块内 `1px solid var(--line-soft)` |
| 概览栏列宽 | `--hud-width`：展开 `400px` / 收起 `44px`（`.hud-collapsed`），见 §6.14 |
| 面板阴影 | `0 18px 42px rgba(0,0,0,.14)` |
| 浮层阴影 | `0 16px 34px rgba(0,0,0,.4)` ~ `0 24px 60px rgba(0,0,0,.55)` |
| 过渡 | 交互 `.16s ease`；进度条 `.25s–.3s`；浮层 `opacity .14s` |
| 预留固定行高 | 用 `Nlh`（如 `min-height: 3lh`），不要写死 px / em —— `lh` 按元素自己的 `line-height` 算，改行高时不用回来改 |

### 4.6 词条类别色（`--affix-color`）

词条按**类别**着色，和稀有度是两条独立通道 —— 一件装备的名字按稀有度着色，它身上的词条按类别着色，两者可能同时出现在一段文本里，所以变量名不共用。`.equip-stat-source` 同时读两条：`var(--affix-color, var(--rarity-color, inherit))`。

| 类 | 类别 | 值 | 说明 |
| --- | --- | --- | --- |
| `.affix-offense` | 进攻 | `--red` | 直接提升输出：锋锐、余烬爆裂 |
| `.affix-survival` | 生存 | `--rarity-3`（绿） | 提升承伤能力：坚韧、铁壁 |
| `.affix-utility` | 功能 | `--rarity-2`（蓝） | 增益庇护所系统、不参与战斗：勤务 |

类名由 `affixCategoryClass(category)` 生成，别手拼。**类别不只是颜色**：它还决定哪个清洗剂能洗掉这条词条（一类一瓶，见 §7.12 旁边的道具说明）。

---

## §5 布局速查

### 5.1 外壳

```
.app-shell    width: 100%; padding: 46px 32px 28px   /* 铺满视口，两侧只留 32px（≤600px 收到 12px） */
  .game-header    品牌区 + #game-status（flex, space-between, 底部 1px --line）
  .app-body       grid: 210px minmax(0, 1fr) var(--hud-width); gap: 18px   /* ≤1300px 收回两列，概览栏变横条 */
    .sidebar        .sidebar-heading / .main-nav / .sidebar-foot
    .page-content   min-height: var(--page-min-height)  /* 620px 只是下限 */
    .hud (#hud)     右侧常驻概览栏：资源 / 冒险状态 / 当前主线（见 §6.14）
```

默认落点是**冒险页**（`page-controller` 的 `currentId`、`main.ts` 的启动 `switchTo`、被锁页面的退回目标，三处都是 `'adventure'`）。
⚠️ 它必须是**任何存档都不会被锁**的页面：庇护所是挣来的（§7.16），落点不能放它。

**导航项右侧的负载徽标**（`.nav-load`，只有物品栏那一项有）：`已占格数/上限`，由 `main.ts` 的 `updateNavLoad()` 每帧写。

- 口径与物品栏页那条容量条**必须一致**：`getInventoryUsed()` / `getInventoryCapacity()`，压力档也是同一套（`<50%` 原色 → `50~80%` `.load-mid` 暖色 → `>80%` `.load-high` 红色）。两处的阈值分头写会立刻出现「侧栏说红了、页里还是黄的」。
- 它与 `updateNavLocks` 分开写：那个函数是「状态没变就整段跳过」的，而负载每帧都可能变。
- **折叠态（`.nav-collapsed`）与 `≤900px` 都不显示**（`.nav-load { display: none }`）：那两种形态下导航项只剩图标 + 三字标签，塞不下。

- 折叠：`.app-shell.nav-collapsed` → 列宽 `64px`，隐藏 `.sidebar-label` / `.panel-kicker` / `.sidebar-foot`。
- 侧栏高度**跟着导航项走**：`align-self: start` + 不写 `min-height`（grid 子项默认拉伸成整行高，不 start 就又跟内容一样长），
  项少时侧栏就短，设置底下不留空档。
- 导航最后一项固定是「设置」（`order: 1`）：新系统插在它之前，见 §2.3。
- 概览栏收起：`.app-shell.hud-collapsed` → `--hud-width` 变 `44px`，三个 `.hud-block` 全部 `display: none`，
  只留栏内顶部那个 `.hud-toggle`（窄屏横条形态同理，收起后只剩开关那一行）。
  两个折叠状态都**不进存档**（刷新回到展开），也互不影响（列定义分别读 `64px` 与 `var(--hud-width)`）。
- ⚠️ **页面不要自己设 `min-height`**：`page-controller` 会记录最高页的 `scrollHeight` 回写到 `#page-content`，防止切页高度跳动。

### 5.2 栅格骨架

| 骨架类 | 列定义 | 用途 |
| --- | --- | --- |
| `.camp-layout` | `repeat(2, minmax(0, 1fr))`（默认 stretch） | 庇护所：两块**等宽等高** —— 里面的 `.mini-stat` 才会逐格一样大（血条由 `margin-top: auto` 压到底部对齐） |
| `.archive-layout` | `repeat(2, minmax(0, 1fr))` + `align-items: start` | 两个面板并排：远征档案的主线页签、研究基地的委托页签。**只有一个面板的页签（成就 / 勘探图）不套这一层** —— 面板自己占满整行 |
| `.inventory-layout` | `212px minmax(0, 1fr)` + `align-items: start` | 物品栏 |
| `.battle-arena` | `minmax(0, 1fr) 70px minmax(0, 1fr)` | 战斗（中间 VS） |
| `.shop-grid` | `repeat(2, minmax(0, 1fr))`（≤600px 降为 `1fr`） | 工坊：制造项只有两项，**固定两列**、卡片自适应吃掉整行宽度；**不要**用 `auto-fill` / `auto-fit`（宽屏会摊成 3~5 条窄卡，概览栏开合还会让宽度跳） |
| `.atlas-slots` | `repeat(3, minmax(0, 1fr))` | 勘探图的三格槽位（残片数由配置表给，见 §7.17） |
| `.item-grid` | `repeat(6, minmax(0, 1fr))` | 磁贴（物品储藏） |
| `.storage-grid` | 列数随断点降级（6 / 5 / 3），见 §5.3 | 图标磁贴：正方形，卡面只有图标 + 数量 |
| `.storage-grid.tile-compact` | `repeat(auto-fill, 76px)` | 小号磁贴：研究项 / 成就共用，列宽**写死**（不随容器摊开，见 §6.5） |
| `.camp-event-track` | `grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr)` | 等分条（R21） |

### 5.3 响应式（只有两个断点）

| 断点 | 行为 |
| --- | --- |
| `max-width: 1300px` | 概览栏从右列改**整行横条**、排到内容**上方**（`order: -1` + `grid-column: 1 / -1` + `position: static` + 三块并排）；`.app-body` 回到两列。**不能直接藏掉**，也不能落在内容下方 —— 金币 / 废料 / 精华与远征状态只剩这一处显示，而 `#page-content` 带着「最高页」的 min-height |
| `max-width: 900px` | 侧栏（`order: -2`，仍排在概览栏之前）→ 顶部横向导航 `repeat(7, 1fr)`（导航项数量变化时同步 N）；`.inventory-layout` / `.archive-layout` / `.camp-layout` 单列；`.storage-grid` 5 列；`.battle-arena` 中列 `44px` |
| `max-width: 600px` | `.app-shell` 侧边距 32px → 12px；`.game-header` 纵向；导航 `repeat(4, 1fr)`；概览栏三块改单列；`.battle-arena` 单列；`.storage-grid` 3 列；`.atlas-slots` 单列（三格横排在手机上放不下残片名）；工具栏纵向 |

新增多列布局**必须**在这几处给出降级规则。

**磁贴格子的基线（§10-27）**：列数就是「格子有多大」的唯一来源，格子里**不能放写死尺寸的元素**。
两档磁贴的取值（字号与图标框同比）：

| 档 | 列定义 | 图标框 | 减掉的竖向占位 |
| --- | --- | --- | --- |
| 物品栏 | `.storage-grid`：6 / 5 / 3 列随断点降级 | `min(60px, calc(100% - 25px))` | 5px 间距 + 一行数量 + 余量 |
| 小号（`.tile-compact`） | `repeat(auto-fill, 76px)`，**列宽定死** | `min(46px, calc(100% - 10px))` | 卡面没有数量行，只留一点余量 |

- `100%` 只在卡片给出**一条宽度确定的轨道**（`grid-template-columns: minmax(0, 1fr)`）时才解析得出来；
- 格子是正方形（高 = 宽），所以**内容总高 ≤ 格子内容高**：小号磁贴 `76 − 16 padding − 2 边框 = 58 ≥ 46` ✓；
- 少减了竖向占位，有数量那一行的卡片就会把图标顶出格子顶边（见 §10-27）。

改了列数、加了新的磁贴容器、或者给磁贴加了一行文字，都要照 §5.3 的断点重新算一遍：
**格子内容宽（高）≥ 图标框 + 其余全部占位**。

---

## §6 组件速查

### 6.1 面板与标题

```html
<section class="page-heading"><div><span class="panel-kicker">AUTO ADVENTURE / LIVE COMBAT</span><h2>冒险</h2><p>氛围句</p></div><div class="page-heading-side"><span class="page-code">ADVENTURE / 01</span><button class="help-button" type="button" data-help="camp">帮助</button></div></section>
<section class="panel xxx-panel" id="xxx-view"></section>
```

**标题下的 `<p>` 只写氛围**：一句剧情向的话，不写「怎么点」。操作说明全部写进 `config/help.ts`，
由右列（`.page-heading-side`：`page-code` 在上、【帮助】按钮在下）的按钮弹出（见 §7.18）。
右列的排法和 `.header-actions` 一样：`flex-direction: column` + `align-items: flex-end`。

面板语义类：`.adventure-panel` `.camp-panel` `.shop-panel` `.settings-panel` `.archive-panel` `.atlas-panel` `.inventory-panel`（都设 `padding: 22px`）。面板内标题统一 `.panel-heading`（左 kicker+h3，右状态）。

⚠️ 面板层级只有一层：`.panel` 里**不要再套 `.panel`**（内边距会叠成 44px、边框变成双线）。带页签的页面把面板放进 `.tab-pane`（见 §6.2）。

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
| `.tab` | 页签（`.tab-bar` 包裹） | `margin-bottom: -1px` 与 `.tab-bar` 的下划线咬合，`.active` 与下方面板连成一体；接法见下 |
| `.help-button` | 页面标题右侧的【帮助】 | 小号 DM Mono 描边按钮；**每个页面都要有**（`data-help="<页面 id>"`，见 §7.18） |
| `.nav-toggle` / `.hud-toggle` | 折叠开关（侧栏 ☰ / 概览栏 `›` `‹`） | 30×30 描边方块，**外观共用一条规则**（hover 与 `:focus-visible` 都转主色），只有定位各自写（flex 排 / grid 排）；≤600px 一起缩到 28×28 |

禁用：`disabled` + `.xx:disabled { opacity: .4; cursor: not-allowed }`（R13）。

**页签的标准接法**（远征档案 / 研究基地，以及之后所有页签页面都照这个来）

```html
<!-- public/pages/xxx.html：视图根**不是** .panel -->
<div id="xxx-view"></div>
```

```ts
// mount()：tab-bar 与面板同级，每个页签一块 tab-pane
view.innerHTML = `<div class="tab-bar" role="tablist">${TABS.map(([id, label]) => `<button class="tab" type="button" role="tab" data-tab="${id}">${label}</button>`).join('')}</div>
  <div class="tab-pane" data-pane="a"><div class="archive-layout">…两个面板…</div></div>
  <div class="tab-pane" data-pane="b"><section class="panel xxx-panel">…</section></div>`;

// update()：切换只改显示，不碰存档
ctx.tabs.forEach(tab => setClass(tab, 'active', tab.dataset.tab === ctx.tab));
ctx.panes.forEach(pane => setHidden(pane, pane.dataset.pane !== ctx.tab));
```

| 规则 | 说明 |
| --- | --- |
| `.tab-bar` 是视图根的**直接子节点**，和面板同级 | 它是**页面级**的分段。塞进 `.panel` 会连面板的 22px 内边距一起吃：下划线缩进一圈、还和下面的面板叠成双线（研究基地原来就是这样，见 §10-29） |
| 面板写在 `.tab-pane` 里 | 一个页签一块；页签负责分段，外框交给面板 |
| 切换不动存档 | 页签是界面状态，存在 `ctx` 里；`pageController.renderCurrent()` 重渲染前先写回 ctx |
| 未解锁的页签用 `hidden` 收起 | 不渲染即不可见（R29）；同时兜住「停在未解锁页签时被重置存档」→ 退回第一个页签 |
| 例外：容器内部的页签 | 物品栏「物品储藏」那三个分类跟着容器走，`.tab-bar` 住在 `.storage-box` 里，不算页面级页签 |

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

**三种卡片是同一套**（`.item-card` + `.item-icon` + `.item-detail`）—— 差别只有两条：

1. **物品栏的卡片描边按稀有度着色**（`.item-card[class*="rarity-"]` 给 `--card-line`）；
   成就 / 研究项**没有稀有度**，`--card-line` 走回落值（灰），状态改由状态类表达；
2. **研究项与成就小一圈**：网格加 `.tile-compact`（尺寸只在 `style.css` 里定义一份，两个网格共用）。

| 形态 | 类 | 卡面 |
| --- | --- | --- |
| 信息卡 | `.item-card` + `.item-detail` | 图标 + 名称 + 类型 + 描述 + 属性 |
| 图标磁贴 | `.item-grid.storage-grid` 里的 `.item-card`（`aspect-ratio: 1/1`） | 仅图标 + 数量，其余进浮层 |
| 小号磁贴 | 同上 + 网格加 `.tile-compact` | 同上（没有数量行）；研究项与成就 |

新增一个「图标 + 悬停详情」的网格时：抄 `item-grid storage-grid`（要不要小号看信息密度），**不要再写一套卡片样式**。
没有稀有度的卡片（成就）直接把状态类叠在 `.item-card` 上：`.locked`（虚线 + 灰图标）/ `.unlocked`（`--card-line: var(--accent-dim)`）。
悬停宿主与浮层就是 `.item-card` / `.item-detail` 这一对 —— **不需要往 `hover-tip.ts` 的选择器里加东西**。

状态类：`.equipped`（accent 边框，视觉 12px）/ `.selected` / `.locked`（虚线 + 灰图标；没有悬停详情的卡片才配 `cursor: default`）/ `.dragging` / `.drop-target` / `.busy` / `.maxed`（**与 `.equipped` 同一套高亮**，见下面那条）/ `.level-0`（虚线）。

⚠️ **`.item-icon` 不画边框**：卡面上的图标就是图标本身，唯一的边框是**卡片按稀有度派生的那一条**（`--card-line`）。
曾经给图标框加过一圈 `--accent-dim` 绿边，在小格子里会被误当成「选中 / 高亮」状态，而且它把「这张卡是什么状态」这件事
拆成了两个视觉通道（图标框 + 卡片描边）。**状态一律只用卡片描边表达**：普通（稀有度 30% 混透明）、
`level-0`（虚线）、`equipped` 与 `.maxed`（主色 + 加粗到视觉 12px）。
⚠️ **带悬停浮层的卡片**（`.item-card` / `.shop-item` / `.achievement-card`）置灰**禁用 `opacity`**，改用 `border-style: dashed`（§10-02）；无浮层的置灰卡片（如 `.codex-card.locked`）可用 `opacity: .45`。

### 6.6 日志列表

- 三列 `66px 46px 1fr`（时间 / 类型 / 正文）。
  **日志只有一处**：冒险页（`#adventure-log`，带筛选按钮）—— 不要在第二页再放一块（主界面与庇护所页原来那两块都已删除）。
- 类型着色：`.log-battle`(blue) / `.log-drop`(warm) / `.log-progress`(accent) / `.log-defeat`(red)。
- 高度上限：`.event-log` 310px。
- 空态 `.log-empty`。增量刷新见 §2.8。

### 6.7 树与条件列表

- `.tree` > `.tree-branch`（`.collapsed`）> `.tree-node` + `.tree-children` > `.tree-leaf`（`.done` / `.current` / `.unlock` / `.selected`）；连接线用 `::before/::after`；`▾` 用 `transform: rotate` 表展开态。
- **树上一次只展开一章**：`ctx.openChapter` 记着展开的那一章（从 1 起，`-1` = 全折起）。点章节标题 = 展开它（**其他章自动折起**），
  再点同一章 = 全折起。初值是**当前这一章**（`currentStoryNode()` 所在的那章；全部走完时是最后一章）。
- **章节数据在 game-state**：第一章 = `mainline`（进度 `state.mainlineIndex`），第二章起 = `storyChapters`
  （进度 `state.chapters[章号 - 2]`）；`FIRST_CHAPTER` 放第一章的 kicker / 标题，后续章节的跟着 `storyChapters` 走 ——
  档案页只把它们拼成渲染用的表，**不另存一份标题**。查询一律走 `getChapterProgress` / `getChapterNodeCount` /
  `isChapterVisible` / `isStoryNodeDone` / `currentStoryNode`，页面不要自己去读 `state.chapters`。
- **门控在「章」这一级，不在「节」**：第 N 章要在第 N-1 章**全部完成**后才出现（`isChapterVisible()` 是唯一判定点，
  在 game-state）。未出现的章整块 `hidden`（**不是变灰** —— 连 `.tree-node` 的标题都不给）；已出现的章里**每一节都渲染**，不要在章内再藏节。
- 章内的节三态**互斥、必居其一**：`done`（实心绿点）/ `current`（暖色点 + 底色，正在推进的那一节）/ `unlock`（虚线 + `opacity: .45`，还没轮到）。
- ⚠️ **没轮到的节一律遮成 `???`，没有例外**：树上写「未解锁记录 / ??? 待恢复」，右栏的标题 / 正文 / **解锁条件** / 奖励**全部**遮住
  （`pages/story.ts` 的 `known` 分支）。**只以第一章为准** —— 第一章怎么做，后面每一章就怎么做，
  不要为「这一章的条件比较特殊」开任何特例（第二章就是这么走歪的：先是给未达成的节露出条件，接着整套节奏都散了，见 §7.19）。
  唯一可见的是**当前这一节**（`currentStoryNode()` 指的那一节，跨章取）：它必须写全条件，那是唯一的方向牌。
- **章内严格顺序推进**，「还没轮到」永远只等于「上一节没做完」—— 所以遮住条件不会让人没方向。
  想让某一节各自独立门槛（谁先做都行）= 先改这一条设计，不要在渲染层打补丁。
- 章节旁白（右栏那段正文）是 `pages/story.ts` 的 `chapterStory[章号 - 1][节序号]`，**一章一张表**；
  新章还没写旁白就留空，不要去别的章借句子。
- `ctx.selected` 只认**已出现**的章：选中的键落在隐藏的章里就落回**第一个还没走完的节**
  （重开 / 改档后不悬空；全部走完时停在最后一节）。⚠️ 门控放行之后（例如新一章刚出现）**不要让右栏停在刚做完的那一节上** —— 树上高亮的是新的那一节，两处说的得是同一件事。
- 达成条件统一 `.requirement`（`.done` 转 accent）+ `.status-dot`（默认 accent 带光晕，`.pending` 灰且无光晕，`.paused` 转 warm）。
- **已走完的节，条件行要「封存」**（`.requirement.done.settled` → `<s>条件原文</s> <b>已完成</b>`）：
  **不要再调 `done()` / 不要再看背包**。条件是「达成过」，不是「此刻仍然成立」——
  卖掉了装甲板、花掉了精华，都不该让一条早就走完的主线反过来显示「未完成」（远征档案踩过，见 §10-32）。
  原文里的进度数字仍是实时的（规则只给一个 `text()`，没有「达成时的快照」），所以它必须划掉：
  要读的是后面那个「已完成」。
- **主线节点的「解锁后」（`mainline[].reward`）必须点名这一节真正解锁的东西** —— 它对玩家来说是
  **这一节唯一的预告**（远征档案右栏的「解锁后」+ 概览栏主线卡），漏一个就等于那个系统凭空冒出来。
  第 1 节「点亮第一座营火」写「解锁「庇护所」」是**真解锁**：庇护所页面与区域都挂在这一节上（`unlockBy.mainline(1)`），
  做完它远征队还会从「原地待命」自动入驻庇护所（见 §7.16）。

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
| `zone` 区域 | `zones[id]` | `zone.icon` | `.codex-zone`（庇护所 `.codex-zone-camp`） | `--accent` / `--warm` |
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

⚠️ 兜底那一步不是可选项的等价物：`renderCodexTags` 只在文本含 `[[` 时才做事，已渲染的 HTML 会原样返回。**渲染点漏掉解析 → 页面上就会直接显示 `[[item:1]]`**（踩过一次：当时主界面那张主线卡，以及 `story.ts` 的章节详情）。

| 项 | 规则 |
| --- | --- |
| R26 | 物品 / 怪物 / 区域名**必须**通过 `itemRefMarkup` / `enemyRefMarkup` / `zoneRefMarkup`（渲染层）或 `itemTag` / `enemyTag` / `zoneTag`（存档文本）生成；**禁止**在文案里直接拼 `item.name` / `enemy.name` / `zone.name`（例外：`workshopItems` / `researchItems` / 庇护所事件名这类不在三张表里的条目） |
| R27 | **会写进存档**的字符串**只能**存 `[[kind:id]]` 标记，**禁止**存 HTML；**渲染任何可能含标记的文本时都要过 `renderCodexTags`**（无标记的旧文本、以及早期格式 `[[12]]`（按物品解析）都原样兼容）。渲染 `MainlineRequirement.text()` 的每个地方都不能漏 |

**引用不能放进高频重绘的 innerHTML**：`setHtml` 只在内容变化时重绘，但若字符串里混了每 500ms 都在变的数值，引用会被反复重建、悬停与点击都会被打断。做法是把段落拆成「稳定部分（含引用，`setHtml`）+ 变动部分（`setText`）」，见 `hud.ts`：目标是区域 / 敌人（`setHtml`，只在换目标时才变）与生命值（`setText`，每 tick 都动）分属两行。

**边界（不属于图鉴引用，保持原样）**

| 场景 | 处理 |
| --- | --- |
| 冒险页：区域下拉、战斗卡上的区域 / 怪物名 | 该页是实时战斗视图，保持原有形态；怪物资料统一由 wiki 提供（原先的「怪物图鉴」面板已移除） |
| 物品栏里的卡片、右键菜单、悬停浮层 | 卡面形态，不走 `.codex-ref` |
| 装备加成窗口的来源行（`getEquipBonusSources`：「装备名 · 词条名」与「XX套装」） | 已按稀有度 / 类别 / 主色着色，名字是拼接结果，不改成引用 |
| 开发者面板的物品发放按钮 | 点击语义是「发放物品」，不能变成 wiki 链接 |
| 右侧概览栏的资源格（金币 / 废料 / 精华 / 后勤小队）、物品栏分区标题 | HUD 聚合数值与类别标签，不是图鉴引用 |
| 庇护所事件名（天灾 / 兽潮 / 流民求助…） | 不在物品 / 怪物 / 区域三张表里 |

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
- **怪物页的掉落表用单列网格**：`cellGridMarkup(drops, 'is-stacked')` → `.wiki-grid.is-stacked { grid-template-columns: 1fr }`，每条占满一整行、垂直排列。掉落条目数不固定、名字又长，默认的 `auto-fill` 多列会把它们挤成一行行窄条。格子本身已经是「图标 · 名称 ……… 角注」的横向 flex，占满一行正好排成清单。
- **怪物页的掉落分三段**，对应三条互不影响的通道：`专属掉落`（这只怪自己的 `dropTable`，逐条揭示）、`区域掉落`（这一区所有怪物共有的：套装部件 + 任务物品，由 `zoneDropCells()` 生成、**一律揭示**，没有就整段不渲染）、`通用掉落`（清洗剂，任何怪物 0.1%，只给一段说明）。**区域掉落不走逐条揭示**：这两条通道都不记 `discoveredDrops`（见 `grantSetDrop` / `grantQuestDrop`），做逐条揭示只会永远显示成占位格；而且它们是区域级情报，套装页与物品页本来就写着。
- 点击委托由 `startCodexWiki()` 在**捕获阶段**注册，并 `stopPropagation()` —— 点名字不该触发页面自己的 `root.onclick`。

**事件条目（`src/config/events.ts`）**：名字 / 图标 / 描述 / 应对建议是静态的，放 config 里让 `codex-ref` 与 wiki 都能读；强度与奖励随存档现算，wiki 从 `getCampEventInfo()` 取。`campEventEntries` 的下标即事件条目 id，`campEventEntryId(kind, index)` 做反向查找。

**wiki 解锁前：引用降级（R31）**

- 所有引用（含 `pageRefMarkup`）在 wiki 未解锁时渲染成 `<span class="codex-ref is-plain">`：icon 与类型色照旧，去掉下划线、不可点、不带 `data-codex`。所以锁着的时候点不开 wiki，也不需要额外拦截。
- 解锁状态由 `main.ts` 每帧同步给 `setWikiUnlocked()`（同 `format.ts` 的数字档位），**必须在 `pageController.renderCurrent()` 之前**同步，否则本帧画出来的还是上一帧的形态。
- 为什么不直接让 `codex-ref` 读 state：`game-state` 反过来要引用 `itemTag` / `pageRefMarkup` 拼文案，直接依赖会成环，所以走注入式状态。
- 状态翻转回未解锁（如重置存档）时，`onWikiUnlockChange` 会通知 wiki 自己关掉弹窗。
- 解锁条件就是成就「初次冒险」（`isWikiUnlocked`），成就的 `rewardUnlock` 会额外弹一条「解锁：系统「图鉴」」。
- **成就的奖励可以是真的机制**，不只是文案：「初次冒险」解锁图鉴、「精炼初学者」给物品页加下面那个开关、
  「精炼专家」给掉落精炼 +2%。写这类奖励时判据一律用 `isAchievementUnlockedById('id', target)` **现算**，
  不要另存一个标记位（成就表本身就是那条记录）。

**物品页的「不再拾取」开关**（成就「精炼初学者」的奖励，`itemFilterMarkup`）：

| 项 | 规则 |
| --- | --- |
| 出现条件 | 拿到成 **并且** 这件物品已经发现过（`isItemFilterUnlocked()` + `isItemDiscovered(id)`）—— 没解锁就没有这东西（R29） |
| 状态 | `state.noPickup[itemId]`（0 拾取 / 1 不拾取，**存档值，只能追加**）；读写走 `isItemNoPickup` / `setItemNoPickup` |
| 动作 | 按钮只负责显示与调用；动作函数自己再复验一遍成就与物品下标（R30），改完写日志 + `saveState` + `notify` |
| 生效点 | **掉落的四个通道都要过闸门**：怪物掉落（`grantDrops`）、套装部件（`grantSetDrop`）、委托任务物品（`grantQuestDrop`）、地图残片（`grantMapFragment`）。新增掉落通道时**必须**一起加 —— 漏一条这个开关就是假的 |
| 不生效的 | 大事件的资源奖励（金币 / 废料 / 精华）与开发者面板发物品：那是「结算奖励」，不是从地上捡的 |
| 用途 | 主要是**别再捡同名垃圾装备** —— 装备按实例占物品栏格数，材料只按种类占、捡不捡都不占新格 |

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

和主线条件（`story` 页的 `.requirement`）共用同一套样式与语义。凡是「已极致」这类进度都用它，**不要自己拼文字或另造样式**（属性增益不走它，见下面那两段）。

**wiki 内部一律用格子，不用行内引用。** `itemRefMarkup` / `enemyRefMarkup` / `zoneRefMarkup` / `codexRefMarkup` 那一套（`.codex-ref`，icon + 名字的行内文本链接）是给**页面正文**用的 —— 主线条件、研究委托、日志这些地方，名字夹在一句话中间，行内引用才合适。弹窗里则相反：条目一行行排开，格子（`wiki-cell`）比行内引用好扫得多，也能顺带挂角注（概率、`3 / 5`）。

所以 `wiki.ts` 从 `codex-ref` 只导入 `codexEntry`（取数）和 `onWikiUnlockChange`（订阅），**不导入任何 `xxxRefMarkup`**。新增小节时用 `cellGridMarkup([entryCellMarkup(kind, id)])` 而不是 `refsMarkup([xxxRefMarkup(id)])`。

**列表页不汇总进度。** 五个列表页（物品 / 套装 / 怪物 / 区域 / 事件）现在都只有格子本身，没有任何「已收录 N / M」式的汇总行。原因分两种：物品与套装的逐条角注已经写明进度（每套卡上的「3 / 5」），汇总行只是把同一份数据再算一遍；怪物与区域的格子数量本身就是进度，玩家数得出来。

`statusLine` 现在只出现在**条目页的小节内部**，而且只剩套装页的「极致效果」一处。它是给上面那行收益配的完成度（`当前进度：3 / 5`），那是有用的信息，不要跟着列表页的汇总行一起删掉 —— 套装列表的角注是「已穿 / 总数」，**不含极致数**，删了就真没地方看了。

**套装条目页的两个小节都以「属性增益怎么展示」为准，统一走 `bonusFactsMarkup()`**：

- **「凑齐效果」只有收益**，用 `.codex-stats` 数值网格 —— 装备条目页的属性描述就是同一套格子，属性增益该长得像属性表，而不是主线那种打勾的条件行。进度不在这里重复：套装列表每张卡的角注就是「已穿 / 总数」。
- **「极致效果」是「收益 + 进度」**：上面同样是数值网格（数据来自 `perfectBonusEntries()`），下面跟一条 `statusLine('当前进度：N / 5')`。**这条进度不能删** —— 套装列表的角注只有「已穿 / 总数」、不含极致数，删了就真没地方看了。两者之间的间距由 `.codex-stats + .requirement` 给。
- **不要把收益做成 `wiki-cell`**：格子是「点得开 / 指向某个条目」的东西，收益没有可点开的条目，硬套只会得到一个点不动、却会亮起悬停边框的假按钮。

属性增益的**标签与数值统一由 `game-state.ts` 的 `setBonusEntries()` / `perfectBonusEntries()` 给出**，标签跟装备条目页对齐（`攻击力` / `生命上限` / `防御力` / `生命恢复` / `出手间隔`）。只能放一行的**散文**位置（如达成日志的 `perfectBonusText()`）才用 `setBonusText()` / `perfectBonusText()` 拼，**不要各写一份标签**。
（`setBonusText()` 目前没有调用点 —— 装备加成窗口的套装收益已经由来源列表给出，见 §6.16；留着是给之后的散文位置用。）

**物品条目页的「掉落来源」不用 `statusLine`**（`dropSourceMarkup()`）：一行汇总（「已在 N 种怪物身上确认到」）会把逐条揭示的信息压缩成一个数字，而玩家真正要的是「哪几只知道」。改成 **`wiki-cell` 格子**（`wiki-grid` + `entryCellMarkup('enemy', id)`，和列表页同一套骨架）—— 已经真的从它身上掉出来过的给可点格子，遭遇过但还没掉过的给 `lockedCellMarkup()` 占位，一条都没确认到时也留一个占位格而不是整段隐藏。边界仍是「已遭遇过的怪物」，没见过的怪不参与，不剧透还有几处来源。

**占位一律走 `lockedCellMarkup()`**（wiki.ts）：骨架与真格子相同，只是虚线边框 + 压暗 + 不带 `data-codex`，所以点不开、也没有悬停反馈。用 `<span>` 而不是 `disabled` 的 `<button>` —— 它本来就不是能操作的东西，别让 Tab 键在格子里停一堆按不动的按钮。

### 6.12 解锁与渐进披露（R29 / R30）

**凡是有解锁门槛的内容，未解锁时一律不渲染**——不占位、不置灰、不挂锁图标。解锁后由顶部 tips 告知，并把内容追加进列表。

| 项 | 规则 |
| --- | --- |
| R29 | 未解锁的内容**禁止**渲染占位 / 置灰 / 锁图标；**必须**按解锁状态同步列表（未解锁的不在 DOM 里，解锁后追加）。解锁提示统一由 `game-state` 的 `unlockNotices` + `checkUnlocks` 驱动（`unlock-toast.ts` 消费），页面不要自己弹 |
| R30 | 未解锁的内容**禁止**参与游戏逻辑：`canStartWorkshop` 这类动作入口要自带解锁判定，`advanceLogistics` 这类自动流程要跳过未解锁项 |
| R31 | 章节**一律照第一章的做法**：章内严格顺序推进、**没轮到的节一律遮成 `???`**（标题 / 正文 / 解锁条件 / 奖励），章与章串行出现。**不要**为任何一章开渲染特例、不要「顺便」补条件 —— 要改的是那一章的设计，不是渲染层 |

⚠️ **`unlockNotices` 的下标就是 `state.notices` 的存档下标**：新条目一律**追加到整张表的末尾** ——
插在中段会让旧存档的 notices 整体错位（弹错提示、或该弹的不弹）。由 `entryNotices()` 自动收录的那些也一样：
某一组里多出一条，它后面所有条目都会往后挪一格。
所以「解锁规则**故意不给 `notice`**」是一条常规手段（`unlockBy.chapter()` 就是如此）：规则不带 notice 就不会被自动
收进表的中段，提示改在末尾手写一条（现有三条：勘探仪、工坊的「医护帐篷」、研究基地的「回收精炼」）。

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
| 庇护所随机事件计时块 | `setHidden` | 单个元素，隐藏与不渲染等效 |

### 6.13 新手指引（R32）

引擎在 `src/guide.ts`，步骤表是文件顶部的 `GUIDES` —— 键同时是存档标记（`state.guides`）和解锁事件的 id。
解锁事件的 id 出自 `unlockNotices`（见 §6.12）：机制是名字（`workshop` / `randomEvent`）、条目是 `<类>:<下标>`（`research:3` / `research:6`）、
**区域是 `zone:<下标>`** —— 庇护所（zone 表 0 号）的引导键因此写作 `'zone:0'`。加系统时照这条对一下键。

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
{ target: '#camp-view', title: '庇护所', body: '…' }                          // 高亮面板，面板里的按钮按不动
{ target: '[data-page="camp"]', requireClick: true, title: '…' }            // 没写 click → 默认放行 target 本身
{ target: '#inventory-view', click: '[data-action="equip-stats"]', requireClick: true, title: '…' }  // 只放行面板里的某一个按钮
{ target: '#adventure-view', waitFor: state => state.totalWins >= 1, waitHint: '远征队正在交战，等这一场打完。', title: '…' }  // 等玩家真的做完一件事
{ title: '…', body: '…' }                                                    // 不挖孔，气泡居中
```

- `click` 与 `requireClick` 都不写 → 高亮区整体不可点。
- `requireClick: true` 且没写 `click` → 默认放行 `target` 本身（"点这里进去"这类）。
- `requireClick` 的步骤不显示「下一步」，只能点放行的元素或跳过。
- `waitFor` 成立前「下一步」禁用并显示 `waitHint`，成立后自动放行 —— 用来让玩家在引导里**真的做完一件事**（打赢一场、把开局送的装备穿上）。判定只用 `GameState` 里的持久字段，刷新后能正确恢复；不要用 DOM 状态或一次性事件。
- ⚠️ **操作不是「左键点一下」时不能写 `requireClick`**：它的放行判定只认 click（见 `initGuide` 的捕获监听），而右键菜单、拖拽都发不出那个事件。这种情况改成 `click` + `waitFor`：`click` 把可操作区域让出来（`click` 与 `target` 写成同一个容器，就整块都能操作），`waitFor` 负责放行。引导里「把装备穿上」这一步就是这么写的。
- 目标不在当前页面（还没切过去）时不挖孔、气泡居中，下一帧再试 —— 所以 `updateGuide()` 每次状态同步都重算位置，`waitFor` 也靠它轮询，不需要额外定时器。

**进度与触发**

- 「看过哪些」存 `state.guides`（id 字符串数组，新增引导不会让旧存档错位）。
- 首次进游戏放 `intro`；`onUnlock` 收到解锁事件时放同 id 的引导（不在 `GUIDES` 里的会被忽略，例如成就）。
- 跳过 = 标记已看 + 结束；多段引导自动排队播放。
- 重置入口：设置页「重置新手指引」（`restartGuides`）；重置存档后也会重放 `intro` —— 但**只在真的重置了**的时候：`resetGame()` 返回是否重置成功，玩家在 `confirm` 里点取消时返回 `false`，`main.ts` 据此决定不重放（曾经无条件调用 `startGuide('intro')`，点取消也会弹一遍）。

### 6.14 右侧常驻概览栏（`#hud`）

**资源 / 冒险状态 / 当前主线** —— 全局唯一的「远征队现在怎么样」面板（**「主界面」这个页面已经撤掉**，
它原来承担的东西全在这一栏里）。它不是页面 —— 不住在 `#page-content` 里，所以切页面不重挂，
也不吃 `page-controller` 的 mount/update 那一套。

| 项 | 位置 |
| --- | --- |
| 骨架（静态标签 + `data-ref`） | `index.html` 的 `.app-body` 里、`<main class="page-content">` 之后 |
| 取值与更新 | `src/hud.ts`：`initHud()` 收引用（启动时一次）、`updateHud(state)` 跟着 500ms 的通知写值 |
| 布局 | `.app-body` 的第三列（宽 `var(--hud-width)`，展开 `400px` / 收起 `44px`），`.hud` 是 `sticky` 的；`≤1300px` 变整行横条排到内容上方（§5.3） |
| 收起开关 | `#hud-toggle`（`index.html`，栏内第一个子节点，30×30 与 `.nav-toggle` 同款）→ `main.ts` 切 `#game-app` 的 `.hud-collapsed` |

- 三块：`#hud-resources`（金币 / 废料 / 精华 / 后勤小队）、`#hud-adventure`（状态点 + 目标区域 / 当前敌人 / 生命值 / 勘探队）、
  `#hud-mainline`（当前节点卡，与远征档案同一套 `.requirement` 条件行）。id 是给新手指引挖孔用的。
  ⚠️ 节点**跨章取**（`currentStoryNode()`）：第一章走完之后，这张卡接着显示第二章的当前节；
  全部走完才换成那句「当前章节的目标都已经完成」的收尾文案。
- 区块都是 `.panel` + `.hud-block`；资源格复用 `.mini-stat`（自带 `tabular-nums`），
  键值行走 `.hud-row`（值一律 `nowrap` + 省略号，窄栏里名字长的区域 / 怪物不能把行撑破）。
- **后勤小队只给 `待命/总数` 两个数字**（如 `2/3`），标签就是「后勤小队」四个字：总人数不存档、由主线 / 胜场 / 人口现算，
  写「待命 X / 总数 Y」是在一行里把标签重复两遍。它是工坊的系统，未解锁时整格**不渲染**（R29）。
- 状态文案只有五个：**原地待命**（还没驻扎任何区域，`zoneId < 0`）/ 休整（在庇护所）/ 搜寻中 / 战斗中 / 待命（脱战）。
  ⚠️「原地待命」与「休整」是两件事：前者没有庇护所那份回血加成（见 §7.16）。**「刷怪冷却期间显示等待而不是那只已经死掉的怪」**
  这条判定别漏（`spawnTimer > 0`，`adventure.enemyId` 那时还留着上一只）。
- 新区块 / 新行照样守 R29：**有解锁门槛就整块不渲染**（`setHidden` + `.hud-row[hidden] { display: none }`，R19）。
- 区块标题行的小按钮是 `data-page` 的 `.text-button`（走 `main.ts` 的全局委托，与页面里的跳转按钮同一套）。
  ⚠️ **只往不会被锁的页面导**（冒险 / 物品栏 / 远征档案）：全局委托不看 `locked`，指向被锁的页面会直接切进未解锁的系统。
- ⚠️ 它是**背景板**（`.hud { z-index: 0 }`，`.page-content` 是 `1`）：卡片 / 装备槽的悬停详情是卡片内部的
  绝对定位元素，而内容列带 `contain: layout`（自成层叠上下文）—— 浮层只能靠**这一列**去压住概览栏。
  **别把 `.hud` 的 z-index 调到 1 以上**，那会把悬停详情重新盖住（踩过，见 §10-36 与 §1 取号表）。
- ⚠️ **`≤1300px` 不是藏起来，是变成整行横条**（`order: -1`）**排到内容上方**：撤掉主界面之后，
  金币 / 废料 / 精华与远征状态只剩这一栏显示，藏掉等于窄屏玩家看不到家底；而落在内容下方更糟 ——
  `#page-content` 带着「最高页」的 min-height，横条会被顶到要滚一屏才看得见。真要改这个行为，先给窄屏想好替代位置。

### 6.15 开发者面板（`pages/settings.ts`，只在 devtools 构建里）

代码位置在 `settings.ts` 的 `if (__DEV_TOOLS__)` 分支里，**不进公网产物**（R25；必须保持可摇树：不要把这些函数
引到分支之外）。设置页那一段是入口（`.dev-panel`），两个浮层 `.dev-modal-layer` 沿用 §2.5 的骨架。

| 窗口 | 类 | 要点 |
| --- | --- | --- |
| 增加物品 | `.dev-modal.dev-item-modal` | 窗口放宽到 `min(1080px, 100%)`，**按类别分块**（顺序与名称读 `categoryOrder` / `itemCategories`，和物品栏页签同源）；网格 `repeat(auto-fill, minmax(148px, 1fr))`（1080px 下 6 列），窄屏自动降级 |
| 修改属性 | `.dev-modal` | 默认 `min(560px, 100%)` —— 只有十来格，不要跟着放宽 |

- ⚠️ 物品列表**不要退回成一个平铺网格**：58 件物品没有分组时只能一行行扫，找一件装备非常难受。
- 新增类别时不用改这里：分块由 `categoryOrder` 驱动，空类别整块不渲染。
- 面板上的「解锁系统」一组是**动作按钮**（不是浮层）：`完成当前主线任务`（`devCompleteMainline()`，往前推一节，
  **条件不满足也照推**，推完还会走一遍 `updateMainline` —— 下一节条件本来就成立时会继续往前）
  与 `一键解锁全部系统`（`devUnlockSystems()`，把主线推到底）。调试单节内容时用前者，别再用后者推到底。

### 6.16 装备加成窗口（`pages/inventory.ts`，`.stats-layer`）

一行一项（行表就是 `equipBonusStats`：总攻击力 / 总生命 / 总防御）。**合计 = 固定来源合计 ×（1 + 百分比来源合计 / 100）**
—— 与 `getPlayerAttack` / `getPlayerMaxHp` 同一套口径，区别只是那边还多加了基础值（攻击 12 / 生命 100）：
这里的「总」是**身上这套东西一共给了多少**，不是角色面板上的最终数值。

- 合计右边的 `.equip-stat-toggle` 展开/收起该项的来源（`data-stats-row="<key>"`，**默认收起**）：
  点它**只改这一段的显隐 + 箭头 + `.collapsed` 类**，不要重画整个窗口（重画会重置滚动位置，§10-22）。
  展开状态存模块级的 `expandedStats`（界面状态，不进存档），重建窗口时照着它画。
- 来源列表分两段：**固定值**（装备自身 / 固定词条 / 套装）在上，`.equip-stat-split` 一条分隔线，**百分比**（百分比词条 / 套装【极致】）在下。
  分隔线只在两段都有内容时才画 —— 只有一半时它就是一条悬空的线。
- **套装与【极致】也是来源**（`getEquipBonusSources` 里把 `setTable` 走了一遍）：凑齐那条与 `getSetBonus` 同判据（整套穿在身上），
  【极致】那条与 `getPerfectBonus` 同判据（**永久解锁**，不看现在还穿不穿着）。着色走 `.set-source`（主色）。
- 下面的套装进度块**只给进度与部件清单**（`N / M` + 每件穿没穿）：生效与否看 `.equip-stat.empty`（整块压暗，与上面的行同一套），
  收益数值已经在上面的来源列表里（「XX套装」与「XX套装【极致】」两条）——这里**不再抄一遍文案**，也不写「凑齐后 / 已激活」。
- ⚠️ 这一窗口的行标签是「总 X」（面板语义），**不要**去跟装备条目页的 `攻击力` / `生命上限` / `防御力` 对齐 ——
  那条约定（§6.11）管的是 `setBonusEntries` / `perfectBonusEntries` 给出的套装 · 极致收益标签。

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

- **只读**：`getState()`、各 `getXxx(state)` 派生值、配置表 `items` / `zones` / `enemyTable` / `rarities` / `affixes` / `equipTypes` / `itemCategories` / `categoryOrder` / `equipBonusStats` / `fontScales` / `numberFormats` / `researchItems` / `workshopItems` / `logisticsTargets` / `campEventEntries` / `mapSets` / `MAP_STATE` / `EXPEDITION` / `mainline` / `achievements`。
- **配置表自带的查询函数**（不要在页面里重写遍历）：`rarityClass(rarity)`（`config/rarity`）、`zoneOfEnemy(enemyId)` / `zoneOfMap(mapId)`（`config/zones`）、`campEventDef(kind, index)` / `campEventEntryId(kind, index)`（`config/events`）、`fragmentMapOf(itemId)` （`config/maps`）。
- **动作（界面唯一允许的状态修改方式，R06）**：`selectZone` `equipItem` `equipToSlot` `discardItem` `discardEquipment` `useItem` `assignLogistics` `startWorkshopUpgrade` `startCampChallenge` `answerPendingEvent` `craftMap` `startExpedition` `submitResearchTask` `upgradeResearchItem` `upgradeResearchItemToMax` `setResearchDifficulty` `setFontScale` `setNumberFormat` `setNotify` `resetGame` `devGrantItem` `devSetStat` `devUnlockSystems`。
- **订阅 / 启动**：`subscribe(cb)`、`onUnlock(cb)`、`startLoop()`（内部 `notify()` 由动作函数调用，界面不直接用）。

### 7.5 未解锁系统的统一表达（由 `main.ts` 统一处理，页面不要重复实现）

```
.locked + opacity .5 → disabled + aria-disabled="true" → 图标 ❓、文字「未解锁」→ 点击无响应
```

页面只在 `locked(state)` 里声明条件（如工坊 `state.mainlineIndex < 2`、研究基地 `!isResearchUnlocked(state)`）。
⚠️ 若当前停留页被锁上（如重置存档），`updateNavLocks` 会自动退回冒险页（默认落点，永远可用）。

### 7.6 敌人数值（`src/config/zones.ts`）

改 `ENEMY_DEFS` 前先读文件顶部的注释，三条约束：

| 约束 | 怎么保证 |
| --- | --- |
| 区域内强度相当 | 用「**净损失生命占玩家生命上限的比例**」当强度指标，同区域所有怪物落在同一区间（终点怪除外） |
| 偏科不同 | 强度拉平的前提下，攻击 / 出手间隔 / 血量 / 防御各偏一头（高攻慢手、低攻快攻、高血高防低攻…）；偏的是「怎么打」，不是「打不打得过」 |
| 开局区域无装备可过 | 新档**身上不穿任何装备**（`equipped` 全空、`inventory` 全 0），废弃边境每一只都必须在「攻 12 / 防 0 / 血 100 / 回复 2」下打得赢。开局送的那把拾荒者短刃（+0）只放在包里、不预装，所以这个基准没变 |

净损失 ≈ `T ×（怪物 DPS − 玩家回复）`，`T = ⌈怪物生命 ÷（玩家攻击 − 怪物防御）⌉ × 玩家出手间隔`。
「血厚 + 防高」的怪 `T` 天然更长，**攻击必须相应压低**，净损失才拉得平。

**各区域的玩家基准 = 穿齐上一区域的整套套装**（见 §7.9），净损失一律压在 **25~35%** 生命上限
（一条命能连打三场左右，回庇护所按 ×5 回复修整后再出门）：

| 区域 | 玩家基准（穿齐上一区套装） | 净损失 |
| --- | --- | --- |
| 废弃边境 | **裸装** 攻 12 / 防 0 / 血 100 / 回复 2 / 间隔 2.2 | 16~23（16~23%） |
| 余烬矿脉 | 拾荒者套装齐 攻 17 / 防 6 / 血 200 / 回复 3 / 间隔 2.2 | 51~67（25~34%） |
| 核心深井 | 余烬套装齐 攻 42 / 防 2 / 血 135 / 回复 2 / 间隔 2.0 | 36~52（27~39%，泰坦最高） |
| 熔火裂谷 | 核心套装齐 攻 57 / 防 11 / 血 290 / 回复 2 / 间隔 2.2 | 84~92（29~32%） |

⚠️ **余烬矿脉与核心深井是批次 2 重新校准过的。** 它们原来的数值是按「套装齐 + 营火 N 级」算的，
而**营火那条成长线已经整条移除**（见 `庇护所扩展方案.md` §4.3）—— 旧数值等于按一个不存在的成长线设计，
新档按当前公式去打算，净损失是生命上限的 1.5~3.5 倍，**根本打不过**。
现在四档一律按上表的「穿齐上一区域套装」重算过，`zones.ts` 文件头留着这张基准表。
**改数值时别只调一个区域** —— 套装是玩家战力的主要来源，基准一漂整张表都偏。

**核心泰坦故意留高一档**（净损失约 39%、血量最厚、出手最慢），是同区唯一的例外；
其余四只一律拉平。「不允许出现明显更强的隐藏 Boss」约束普通怪，不约束明写的终点怪。

**金币按「每秒产出大致不变」折算**：击杀变慢的区域，单只金币同步抬高 —— 否则加强怪物会顺带砍掉经济。
四个区域的产出档位大致是 0.7~1.7 / 2.4 / 4.0 / 6.0 金币每秒。

**区域解锁走 `unlock` 规则**（可组合，见 §7.17），不再是单一的主线门槛。
`isZoneUnlocked()` 仍是**全游戏唯一的判定点**，区域下拉（`pages/adventure.ts`）、研究委托池
（`researchZones()`）、图鉴的「进入条件」、解锁公告全部读它：

| 区域 | 解锁规则 | 含义 |
| --- | --- | --- |
| 庇护所 / 废弃边境 | `unlockBy.mainline(0)` | 开局 |
| 余烬矿脉 | `map(veinChart)` | **只能靠勘探图**：天灾掉矿脉图纸，勘探成功才开 |
| 核心深井 | `map(deepProfile)` | **只能靠勘探图**：兽潮掉深井剖面，勘探成功才开 |
| 熔火裂谷 | `map(riftChart)` | **只能靠勘探图**：异种掉裂谷坐标，勘探成功才开 |

⚠️ **三个后期区域一律只留勘探图这一个入口，不要再加「主线全通」这类并行通道。**
曾经有 `any(mainline(7), map(...))`：结果「一键清剿推完第一章」会顺手把两个新区域白送出去，
勘探图整条线（碎片 → 地图 → 勘探远征）就成了摆设，玩家根本不需要碰它 —— 踩过，见 §10-33。
新增区域时照这张表的写法，只给 `unlockBy.map(...)`。

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
- **卡片有两种出法**：可堆叠的一格写「×数量」；`stackable: false` 的（目前只有地图残片那 9 件图纸）一件一张卡片、不写数量。
  ⚠️ `stackable` **只管显示、不管计数**：计数一律「**装备看实例、其它看 `inventory[]` 的数量**」
  （`getOwnedCount` / `grantDrops` / `devGrantItem` / `discardItem` / `dropStack` / `cardsOf` 与结构签名都按这条口径写 —— 加新的非堆叠非装备物品时，这几处都要能走通）。

**强化道具的目标可以是装备槽**

使用模式（`body.enhancing`）下，点选目标统一由 `instanceAt()` 解析：

| 点击位置 | 怎么拿到 instanceId |
| --- | --- |
| 物品卡片 | `data-instance` 属性 |
| 装备槽 | 装备槽不记装着谁，用 `getState().equipped[equipType][slot]` 反查 |

空槽 / 可堆叠物品卡片 / 空白处都返回 `-1`，等同于「取消」。装备槽的可点状态由 CSS 给（`body.enhancing .equip-slot.filled`），JS 不重复判断。

**装备槽也有悬停详情**

`.equip-slot` 已加入 `hover-tip.ts` 的 `HOST_SELECTOR`，浮层复用 `.item-detail`（与物品卡片同一个类，展开规则是 `.equip-slot:hover .item-detail` / `:focus-visible`）。内容由 `detailMarkup(itemId, instance, equipped)` 生成，**卡片与槽位共用同一个函数** —— 两处显示的信息必须一致。宿主自身要 `position: relative` + 悬停时 `z-index: 7`（§1 的取号区间）。

⚠️ **槽位是 `<button>`，浮层内容只能用 phrasing 元素**（`span` / `b`）。所以描述行是 `<span class="item-desc">` 而不是 `<p>`，属性行是 `<span class="item-stats">` 而不是 `<div>`（靠 CSS 的 `display: block` 保持块级排版）。**往 `detailMarkup` / `statLine` 里加东西时别再引入块级元素** —— `<div>` / `<p>` 放进 `<button>` 是非法 HTML。`.item-detail p` 那条规则留给研究基地的研究项卡片，它自己写的 `<p>`。

**右键菜单的第一项是「查看图鉴」**

`WIKI_ACTION` 排在 `actionsFor()` 的最前面（它只读、和后面的操作不是一类），点击走 `wiki.ts` 的 `openWiki('item', itemId)` —— 和点行内引用是同一个弹窗。图鉴没解锁时**整项不出现**（`isWikiUnlocked()` 判定，R29）。顺序是：查看图鉴 → 类别操作（装备 / 使用）→ 丢弃。

**「丢弃」在数量 > 1 时要先问一句**（`.discard-layer`，`pages/inventory.ts` 的 `openDiscardWindow`）：

- 可堆叠物品手里不止一份 → 弹窗给「保留一份 / 丢弃全部」两个选择（原来只有丢一份，清空一叠要点十几次）；
  只有一份 → 照旧直接丢，不要弹只有一个答案的窗口。装备是独立实例、没有份数，`discardEquipment(instanceId)` 直接执行。
- 两个按钮说的都是**终态**（点完手里剩一份 / 剩零份），所以份数要**点的时候现读**（`getState().inventory[itemId]`），
  不能用打开窗口时的快照；「保留一份」丢的是 `owned - 1`。标签必须和动作对上 —— 别把「保留一份」接成丢一份。
- 单例挂 body（R09）+ 三种关闭方式（× / 点遮罩 / Esc，R12）；`丢弃全部` 是 `.secondary-button.danger`，
  「保留一份」保持中性 —— 严重程度靠颜色分，不靠再加一个「取消」。

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
enemyAttack → 扣血 → 血归零则撤回庇护所（return）→ tryAutoEat
```

- 挨打是**唯一会掉血**的时机，挂在这里最准。
- **不能**挂在 `advanceAdventure` 外层：一次 tick 可能推进多秒（离线最多 8 小时），会出现「先死再吃」。
- 吃一份后若仍低于阈值，下次挨打会再吃一份 —— 天然限流，不需要额外冷却。

**存档**

`state.autoEat = { itemId, threshold }`，`readAutoEat` 负责校验：`itemId` 必须仍然是食物（否则归 -1），`threshold` 夹进 `AUTO_EAT.minThreshold ~ maxThreshold`。委托需求区间调整过三次（90~110 → 20~40 → 8~12 → 50~60），`readResearchState` 会把旧存档的 `need` 压回 `RESEARCH.needMax` —— **只压上限**，区间上调时不抬高旧值（手上那份小委托照旧能交，交完重抽的就是新区间）。

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

⚠️ **配套：图鉴里套装部件必须走「获取方式」小节**（`setSourceMarkup(setId)`）。物品条目页的「掉落来源」只扫 `enemy.dropTable`，套装部件不在里面 —— 照那条路走只会得到一片占位，**拾荒者套装曾经就因此在物品页显示成「待发现」**（玩家明明刷出来一堆）。现在有条并列的分支：

| 物品 | 走哪个 | 为什么 |
| --- | --- | --- |
| `category === 'quest'` | `questSourceMarkup` | 由「委托指向的区域」统一掉落 |
| `type === '清洗'` | `solventSourceMarkup` | 任何怪物 0.1%，与区域无关 |
| 地图碎片（`fragmentMapOf(id) >= 0`） | `fragmentSourceMarkup` | 由庇护所的大事件带回（见 §7.17） |
| 套装部件（`setOfItem(id) >= 0`） | `setSourceMarkup` | 走 `grantSetDrop` 的独立通道 |
| 其余 | `dropSourceMarkup` | 真的写在某只怪的 `dropTable` 里 |

**新增「不走 `dropTable` 的掉落通道」时，这段必须同步加一条分支。**

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

**每次强化的增量（`AFFIX_DEFS[].step`）取 `base` 的 1/4**（锋锐除外 —— 它已经是 1 点粒度，降不了）。上限固定是 `base × AFFIX_MAX_MULTIPLIER`（2），所以**满级需要的道具数 = `1 + (cap − base) / step`**：

| 词条 | base | step | cap | 满级道具数 |
| --- | --- | --- | --- | --- |
| 锋锐 | 2 | 1 | 4 | 3 |
| 坚韧 | 12 | 3 | 24 | 5 |
| 铁壁 | 4 | 1 | 8 | 5 |
| 余烬爆裂 | 100 | 25 | 200 | 5 |
| 勤务 | 8 | 2 | 16 | 5 |

⚠️ **改 `step` 前先算一遍这个数** —— `step` 越小，同一个上限要的道具越多（词条本身不会变弱，只是更难顶到）。掉落率那边同步压过一轮：`config/zones.ts` 里强化道具的 `chance` 统一 ×0.6（见该文件头部的说明）。

**功能类不参与战斗**，只增益庇护所系统 —— 「勤务」加的是 `workshopRate`（每人每秒的工坊工时），在 `advanceLogistics` 里生效，不进任何战斗公式。后续这类「增益其他系统」的词条（研究速度、掉落加成…）都往这个类别加。

`removeAffixHandler(category)` 按类别筛词条；同类有多条时返回 `pick-affix`，由 `pages/inventory.ts` 的词条选择窗口让玩家选。

**清洗剂走独立的掉落通道**（`config/zones.ts` 的 `SOLVENT_DROP_CHANCE = .001`）：

- **任何**怪物都可能掉，与区域、怪物种类无关 —— 所以它不写进任何 `dropTable`，也不占「同一只怪物最多 3 条掉落」的名额，更不需要给 15 只怪各写一条。
- 掉哪一瓶随机，三种等概率（`SOLVENT_IDS`，见 `config/items.ts`）。
- **0.1%** 是刻意压到极低的档：洗词条是「纠错」而不是「日常」，不该随手就能用。按这个掉率，一千次击杀大约出一瓶。
- 稀有度统一**火红色**（14）—— 琥珀色（15）是任务物品专用的最高档，火红色是普通物品能到的最高一档。

和任务物品一样，wiki 的物品页对清洗剂走另一条说明（`solventSourceMarkup`）：它不在任何 `dropTable` 里，用「掉落来源」那套只会得到一片占位。

### 7.13 研究基地的委托（`game-state.ts` + `pages/research.ts`）

**委托只索取「任务物品」**：每个战斗区域在 `config/zones.ts` 里声明一个 `questItem`（共 3 种，`category: 'quest'`，稀有度统一琥珀色）。

⚠️ **掉落加了区域闸门：当且仅当当前委托正指向这个区域时，这里的怪物才按 `QUEST_DROP_CHANCE`（10%）掉它。** 任务物品除了交委托没有别的用途，在委托不指向的区域刷出来的只会白占物品栏格数；研究基地还没解锁时没有委托，自然也不掉（否则玩家会在不知道这物品干什么用的阶段就开始攒它）。判定写在 `grantQuestDrop()` 里，用 `isResearchUnlocked()` 短路后再比 `getResearchTask().zoneId`。

**不按 `need` 封顶**：攒够了照掉 —— 交委托只扣 `need` 个，多出来的留在包里。

**冒险页有一行委托提示**：`pages/adventure.ts` 在「目标区域」选择下面渲染「研究基地的委托：到 X 收集 Y（n/N）」。没有这一行，在委托不指向的区域怎么刷都不掉会被当成运气差。未解锁 / 还没有委托时整行 `setHidden`（R29），已经站在目标区域里时加 `.on-target` 转主色。

这样改的理由：旧的委托要求「怪物的普通掉落物」，而一个物品常常只有 1~2 只怪会掉 —— 委托就变成了「挑某只怪刷」，玩家在区域里没有选择权。任务物品让诉求回到「去那个区域刷」，任何一只怪都可能带着它。

**掉落不走 `dropTable`**：`grantQuestDrop()` 和套装掉落一样独立成一步，所以不占「同一只怪物最多 3 条掉落」的名额，也不需要给 15 只怪各写一条。图鉴的物品页对任务物品走另一条说明（`questSourceMarkup`）—— 它不在任何 `dropTable` 里，用「掉落来源」那套只会得到一片占位。

**没有难度选择**：委托随机落在某个已解锁的战斗区域，奖励固定（`getResearchReward()` = 基础值 + 「信号放大」等级）。越深的区域靠怪物本身的金币与掉落拉开收益差，不需要再加一层倍率。研究项「任务需求降低 I」只压需求数量上限。

**需求数量 `50~60`**：10% 掉率下约等于 500~600 次击杀，按一场战斗 20~30 秒算是 3~5 小时 —— 这是刻意选的「刷得久」档。

⚠️ **区间宽度必须 ≥ 研究项「任务需求降低 I」的 `maxLevel`**：`getResearchNeedMax()` 是 `max(needMin, needMax - 等级)`，区间比满级窄就会出现「点到某一级之后白点」。现在宽 10 档、满级 10 级，刚好把上限从 60 压到 50，每一级都算数（旧值 `8~12` 只有 4 档，第 4 级之后就压到底了）。**改这两个数前先看 `maxLevel`。**

**研究项升级消耗固定**：`RESEARCH.costStep` 固定为 `0`，每级都花 `costBase`（10 点），和第一级一致 —— 点满一项 = `costBase × maxLevel` = 100 点。`getResearchCost()` 的公式保留着 `costStep`，但**不要把它改回递增**：一份委托要 3~5 小时，递增会让后几级实际点不动。

**刷新**：`refreshResearchTask()` 花金币重抽一份，费用 = `refreshCostBase × (已刷新次数 + 1)`，交委托后归零。递增是为了让「反复刷到满意」有代价，而正常接单不受影响。

**旧存档的委托会被自动换掉**：`getResearchTask()` 的校验里带「必须是这个区域的任务物品」，所以版本更新后老玩家不会背着一份再也交不上的委托（要交的东西已经不在任何掉落表里了）。

### 7.14 更新日志与更新公告（`config/changelog.ts` + `src/changelog.ts`）

**公告文案是单独维护的，不是 git 提交信息的搬运。** 提交信息写给开发者：里面有函数名、文件名、CSS 类名、内部字段，
玩家读不懂也不该读（细节留在提交信息里）。玩家视角的文案写在 `src/config/changelog.ts` 的 `changelogNotes` 表里，
`src/changelog.ts` 只负责展示与「已读」判断。

| 项 | 规则 |
| --- | --- |
| 顺序 | 数组**由新到旧**，最新一条在最前面 |
| **一条公告 = 一批未提交的改动** | **只要还没提交，后续改动一律并进最前面那一条的 `details`，不要另起新条目** —— 玩家看到的是「这次更新改了什么」，不是「开发者提交了几次」。推送（提交）之后才开新条目 |
| 同批跨主题 | `title` 概括这一批、`details` 分条列全，`kind` 取最主要的那个（拿不准就用 `misc` 调整）。所以 `title` 允许是一串并列的短句，不必凑成一句话 |
| `id` | 玩家的已读标记（`settings.changelogSeen`）。**只在开新条目时写一个新的**，改文案不要动它 —— 动一下所有人都会再收到一次公告。约定 `日期-序号`（如 `2026-09-14-3`），序号按当天先后从 1 开始数 |
| `date` | `YYYY-MM-DD`，展示用 |
| `kind` | `feat` 新内容 / `balance` 平衡 / `fix` 修复 / `perf` 优化 / `misc` 调整。中文标签与颜色由 `changelog.ts` 的 `KIND_INFO` 映射，表里**不写标签文字、不写颜色类** |
| 未收录的提交 | **不进公告**。重构、构建配置、内部字段调整、开发工具这类改动不该打扰玩家，不必为它们补条目 |
| 发布流程 | **每次推送产出两份文案**：提交信息写给开发者（可用函数名 / 文件名 / 实现细节），公告条目写在这张表里给玩家看，**不要拿提交信息充当公告**。推送前过一遍 `git log`，确认这批玩家能感知的改动都已经并进最前面那一条 |

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

### 7.15 后勤小队与工坊制造（`game-state.ts` + `pages/workshop.ts`）

**制造项的解锁是一条规则，不是一个进度数字**：`workshopItems[].unlock`（`UnlockRule`，同区域解锁那套）+
`isWorkshopItemUnlocked()` 是唯一判定点 —— 页面渲染、后勤自动流程（`advanceLogistics` 里逐项 `continue`）、
`canStartWorkshop()` 都读它。解锁渠道可以是主线、地图、波次、或任意组合：

```ts
{ name: '哨戒弩台', unlock: unlockBy.mainline(4), ... }
{ name: '哨塔蓝图', unlock: unlockBy.any(unlockBy.map(MAP.veinChart), unlockBy.wave(2)), ... }   // 组合的写法
```

⚠️ **给既有条目加新渠道时用 `any` 并行，不要把原条件换掉** —— 老存档可能已经把它造到好几级，
只留新渠道会让它在工坊里凭空消失，而等级还在给它加数值（见 §7.19）。
研究项（`researchItems[]`）同理。**改判据本身也一样要当心**：第一章加了一节之后，「第一章全通」的语义就变了，
原来挂在这个语义上的条目会被重新锁上（勘探仪踩过，见 §7.19）。

**每级的加成写在 `per*` 上**：`perHp` / `perDefense` / `perAttack` / **`perRegen`**（庇护所回血，点/秒）。
缺省 = 这一项不给那种加成，**不要为了填满形状写 0** —— 工坊卡片的加成文案只列真的有值的那几项
（`campBonusText(level, item)` 里逐项 push，空的话写「尚未开工」）。
制造项的下标走 `WORKSHOP_ITEM`（新项追加到末尾时在那里补一行），别在业务代码里写 `campWorkshop[2]` 这类字面量。

**后勤总人数只有一个来源，不存档**：

```ts
/** 总人数 = 基础 1 + 主线每 2 个节点 +1 + 累计每 20 胜 +1。 */
export function getLogisticsTotal(target: GameState = state): number { return 1 + Math.floor(target.mainlineIndex / 2) + Math.floor(target.totalWins / 20); }
```

存档里只记 `logistics.assigned`（分配），不记总数 —— 总数由上面两项换算，避免两处数据不同步。

**人手是按「项」分配的，不存在工坊共用的池子**。下标布局（`LOGISTICS` / `fortSlot`）：

| 下标 | 去处 |
| --- | --- |
| `LOGISTICS.camp` = 0 | **已停用**（原来是营垒修筑）—— 只占位，`logisticsTargets[0].retired = true` |
| `fortSlot(id)` = `LOGISTICS.fort + id` | 第 id 个制造项（`workshopItems`） |

⚠️ **0 号位停用后只剩占位价值，但一个字节都别动**：`logistics.assigned` 按下标存进存档，删掉这一格
会让旧存档的城防 / 弩台人手整体错位。`syncLogistics()` 每次都会把这一格清成 0（把人**释放回待命**）——
旧存档的营垒人手因此不会卡在一个没有卡可以调的槽里（见 §10-31）。

- **界面**：`pages/workshop.ts` 每张卡片一个 `stepperMarkup(fortSlot(id))`，操作的是**这一项自己**的人手；读数同样按 `fortSlot(id)` 取。
- **推进**：`advanceLogistics()` 逐项取 `getLogisticsAssigned(fortSlot(id))`，各自算 `output = 人数 × getWorkshopRate()`、各自开工。两项同时在建也各走各的进度 —— 一个人只可能待在一个下标里，不会重复计入（`assignLogistics` 的上限是 `getIdleLogistics()`）。
- **剩余时间**：`getWorkshopRemaining(id)` 必须用**这一项**的人手，否则卡上的倒计时会和真实进度对不上。
- **新增制造项**：往 `workshopItems` 末尾追加就行，`fortSlot` 与 `logisticsTargets` 会自动跟上，**不要把下标写死**。
- **旧存档**：`rebuildState` 按 `logisticsTargets` 的长度逐下标读，老存档那格「工坊制造」的总池子会落到下标 1（基础城防）名下。

---

### 7.16 庇护所：营火 / 事件波次 / 人口（`game-state.ts` + `pages/camp.ts`）

**术语**：「庇护所」是页面与系统名（原「营地」），**只改文案** —— `state.camp` / `campWorkshop` 等字段名一律保留，
存档格式零改动。「营火」（那堆火本身）与「营垒」（工事名）是另外两个词，不要跟着改。

**庇护所是挣来的，不是开局就有的**：页面与区域都挂 `unlockBy.mainline(1)`（完成「点亮第一座营火」），
页面锁定读 `isCampUnlocked()` —— 它就是 zone 表里庇护所区域的解锁规则，**判定只有这一处**。

**开局是「原地待命」**：`adventure.zoneId = -1`（荒野上还没落脚点），不刷怪、也不吃庇护所那份回血加成 ——
区域取值见 `currentZoneId()`（无效即 `-1`）、`isIdleZone()`（待命）与 `isCampZone()`（庇护所**或**任何无敌人区域，两类别混判）。
点亮第一座营火之后，还在待命的远征队由 `updateMainline()` 末尾自动入驻庇护所（玩家已经自己选了区域就不动他）。

**营火机制已移除**（做过「花精华提升营火等级」，用来抬高远征队与庇护所的数值；后来整条撤掉）。
**「营垒修筑」也整条移除了**（它靠待命人手白嫖庇护所三围、不花材料，把第一波的门槛拉没了 —— 见 §7.15 / §10-31）。
现在的状态：

- 玩家侧六个 getter 里，**庇护所那三个（`getCampMaxHp` / `Attack` / `Defense`）只由工坊制造项决定**
  （`CAMP_BASE` + `workshopBonus`：装备 / 套装 / 词条 / 研究都**不**影响庇护所）；`getCampRegen` 是常数 1.5。
  以后要加庇护所的成长线，请**新增制造项**（`workshopItems` 末尾追加）或另立一条独立通道，
  **别再借道 `state.workshop`**，也别把「不花材料的白嫖通道」加回来
- **`state.workshop` 是遗留字段**：新存档恒为 0、只有老存档带着旧值，它现在**只剩 `getInventoryCapacity()`
  一处引用**（`20 + workshop × 2`）。要不要彻底删掉取决于「老存档那几十格留不留」——
  改之前先看 `庇护所扩展方案.md` §4.3
- 精华仍然只有产出、**没有出口**（原来的出口就是营火）—— 已知缺口，见 `庇护所扩展方案.md` §2 的
  「不引入没有出口的资源」原则
- 精华与物品「余烬碎片」的数量仍要同步（`grantDrops` / `discardItem` / `finishCampBattle`）：
  **加要一起加、减要一起减**，否则资源条和物品栏会各说各的

**事件波次**（`CAMP_WAVE` / `CAMP_WAVE_KINDS` / `CAMP_EVENT_BASE`）：

- **第一波的强度由 `CAMP_EVENT_BASE` 决定，它不是「随手写的初始值」**：这一档按「基础城防要升到几级」反推，
  裸庇护所一场都打不过 —— 玩家得先在冒险里攒金币 / 废料 / 装甲板，把城防堆上去。第一波的实测对照（不穿装备）：

  | 场次 | 基准值（生命 / 攻击 / 防御 / 间隔） | 城防 0~1 级 | 险胜 | 稳过 |
  | --- | --- | --- | --- | --- |
  | 天灾 | `340 / 15 / 4 / 1.3` | 打不过 | 2 级（剩 5 血） | 3 级（剩 135） |
  | 兽潮 | `380 / 17 / 5 / 1.2` | 打不过 | 3 级（剩 16 血） | 4 级（剩 130） |
  | 异种（波末） | `450 / 19 / 6 / 1.15` | 打不过 | 4 级差 9% | 5 级（剩 130） |

  **三个数是同一组**：波内一场比一场强（各差约一级城防），别只调其中一个。改完用「城防 0~6 级 × 三场」跑一遍，
  公式就是 `伤害 = max(1, 攻击 − 防御)`、双方各按自己的间隔出手、战斗中**不回血**（见 `hitDamage` / `advanceCampBattle`）
- **不要用主线门控代替数值**：曾经试过「推到「抵御第一场天灾」才给打」（`mainlineIndex >= 5`），已撤掉 ——
  那既挡住了玩家自己攒资源的节奏，也让「城防 / 弩台」这两条花钱的成长线失去意义。**要它更难就抬它的数值**，
  顺序问题交给数值本身解决
- 大事件**永远有下一场**：`getNextCampChallenge()` 不再返回 `null`，界面里没有「大事件已清空」这个状态
- 每波 3 场（天灾 → 兽潮 → 异种）；`camp.stage` 记本波打到第几场，打完一场 +1，满 3 场进下一波
- 强度按波次**等比**抬高：生命 / 攻击 `× CAMP_WAVE.growth^(wave-1)`（防御走线性、奖励只跟涨平方根，
  理由都在常量注释里）。这个系数**决定「墙」在哪** —— 玩家侧是线性成长，等比迟早追上；
  改它之前先看 `庇护所扩展方案.md` §8 的实测对照表
- **大事件没有图鉴条目**：它们只差属性、不做内容差异化，所以 `campEventEntries` **只收随机事件**，
  `campEventEntryId()` 对任何大事件都返回 `-1`。`pages/camp.ts` 的 `threatTitleMarkup()` 据此决定
  是渲染成可点开的图鉴引用（随机事件）还是纯文本（大事件 —— 名字里已经带了波次）
- 图鉴那个分类页的显示名是**「随机事件」**（页面 id 仍是 `events`）：别再叫回「事件」，
  也别往里加大事件的条目
- `disasterWins` / `tideWins` **仍然要照记**：主线「抵御第一场天灾」「击退第一次兽潮」看的是它们，不是波次
- 新增 `CAMP_EVENT` 取值**只能追加**（它是 `camp.pendingKind` 的存档值）；
  `campEventEntries`（图鉴条目表）的新条目也**只能追加到末尾**（条目 id 由它的下标算出）

**人口与后勤**：

- `camp.population` 来自事件奖励里的 `survivors`
- `getLogisticsSources()` 是总人数三个来源（主线 / 胜场 / 人口）的**唯一出处**，界面要展示来源就调它，不要自己算
- 每 `POP_PER_WORKER` 人换 1 名后勤
- **庇护所页不单列人口**：那一页两块各排成 2×2 四个数值格（庇护所：生命 / 攻击 / 防御 / 恢复；威胁：事件的同四项），
  人口在这里既不占格也不参与排版 —— 它在右侧概览栏的「后勤小队」那一格看（`待命/总数`，见 §6.14）。
  两块**等宽**（`.camp-layout` 两列 1fr）是为了让同一套 `.mini-stat` 逐格一样大，不要改回不等宽
- **庇护所页没有日志块**：日志只有冒险页（`#adventure-log`）一处（见 §6.6）

**读档校验**：`camp` 的每个新字段（`wave` / `stage` / `population`，以及勘探图那四个，见 §7.17）都在
`rebuildState` 里**逐字段**夹上下限，不要退回 `{ ...initial.camp, ...saved.camp }` 一把梭 ——
那个写法拦不住被手改过的值。

**一键清剿**（`countSafeCampFights()` / `sweepCampWaves()` / `simulateCampFight()`）：

- 「能不能稳赢」靠**模拟**整场战斗，不是估公式：双方都是固定数值 + 固定间隔、没有随机数，所以结果是确定的
- **`simulateCampFight()` 与 `advanceCampBattle()` 必须共用 `hitDamage()` 和同一套出手节奏** ——
  各写一份就会出现「模拟说稳赢、真打却输」。改伤害公式只改 `hitDamage()`
- **模拟从当前生命起步**（不是满血）：带伤时清剿会自动判定为不稳、拒绝执行，与 `beginCampBattle` 用
  `getCampHp()` 开打一致。每打赢一场 `settleCampWin()` 会把防线修满，所以只有第一场看当前血量
- 门槛是 `SAFE_FIGHT_HP`（全程生命不低于满血的 60%），单次上限 `SWEEP_LIMIT`（200 场）—— 两个都是可调常量
- **账必须走 `settleCampWin()`**（单场战斗与清剿共用）：奖励、`disasterWins` / `tideWins`、人口、波次推进
  只有这一份实现。它**只记账不播报**，播报交给调用方 —— 单场战斗一条日志、清剿只出一条汇总
- 界面上的场次是**缓存过的参考值**（签名 = 波次 + 场次 + 四项数值 + 生命 10% 分档），
  所以 `sweepCampWaves()` **每场都要重新验一遍**，不能照那个数字直接结算

---

### 7.17 勘探图与勘探远征（`config/unlock.ts` + `config/maps.ts` + `game-state.ts` + `pages/research.ts`）

**一、区域解锁是可组合规则**（`config/unlock.ts`）

```ts
interface UnlockRule {
  text: (state: GameState) => string;      // 渲染层 HTML，可内嵌图鉴引用
  done: (state: GameState) => boolean;
  notice?: string | (() => string);        // 解锁提示的补语；不写 = 开局就满足 ⇒ 不进提示列表
}
unlockBy.mainline(index) / map(mapId) / all(...) / any(...)
```

| 项 | 规则 |
| --- | --- |
| 形状 | 规则**刻意和主线条件（`MainlineRequirement`）同形状** —— 图鉴的「进入条件」与解锁公告两处直接复用主线那套条件渲染，不用为每种规则各写一份显示 |
| `text()` | **必须给**，而且必须可读（玩家看完要知道去哪做什么）。返回的是渲染层 HTML（可内嵌 `xxxRefMarkup`），能直接 `setHtml`；它现算、不进存档 |
| `notice` | 写的是**达成条件的描述，不含「解锁」二字** —— 提示标题已经是「icon 解锁：分类「名称」」，再补一遍会变成「解锁：……解锁」。`all` / `any` 会把子规则的 notice 拼起来（`，并且` / `，或`） |
| 判定点 | 仍然只有 `isZoneUnlocked()` 一处。**不要**在页面里重写 `mainlineIndex >= N` |
| 选中区域 | `selectZone()` 挡着「进不去的区域不给选」；读档时 `adventure.zoneId` 若指向**不存在或还没解锁**的区域，`rebuildState` 也把它退回庇护所 —— 否则冒险页会顶着一个进不去的区域打，而下拉框里根本没有它（区域下拉只列已解锁的，见 §6.8） |
| 展示位置 | 条件文案**只在图鉴的「进入条件」与解锁公告里说**。冒险页原来有一行「还有一片区域没定下位置」，已删除 —— 那一页只留「研究基地的委托」那一条提示，区域解锁的账不在这里摊开（区域名在开放前是剧透，图鉴的区域列表对未开放区域是「待发现」占位格） |
| 主线节点名 | 靠**注入**：`setMainlineTitles()` 由 game-state 在启动时给一次。config **不能**反向 import game-state，否则 `zones → unlock → game-state` 成环（同 `codex-ref` 的 `setWikiUnlocked`） |
| 还没实现的 helper | `event` / `boss` / `challenge` 留给后续批次（要等对应的状态字段落地）。加它们时照 `map` 的写法补，并且**必须给出 `text()`** |
| 新增区域 | `zones.ts` 末尾追加一条（带 `icon` 与 `unlock`）即可；`unlockNotices` 里区域那一段由规则自动推导（`zoneNotices()`），不用手写 |

**二、地图残片（`config/maps.ts`）**

| 项 | 规则 |
| --- | --- |
| 下标 | `mapSets` 的键顺序就是 mapId，而 `camp.maps` 按下标存进存档 ⇒ **新地图只能追加到末尾**（R24 同款约束） |
| 残片是物品 | 每片都是 `category: 'resource'` 的可堆叠物品（自动进物品栏、自动进图鉴）。稀有度用**火红色**（14）：它和清洗剂同属「不走 `dropTable` 的特殊渠道」，不和区域档位抢位置 |
| 掉落通道 | 走 `grantMapFragment()`，**不写进任何怪物的 `dropTable`**，也不占「同一只怪物最多 3 条掉落」的名额 |
| 分套 | 大事件**按波次**发（`grantMapFragment`）：第 1 波 → 第 1 套、第 2 波 → 第 2 套、第 3 波 → 第 3 套，三套都发过之后补任意还没集齐的那一套。⚠️ 别退回「按事件类型分套」（天灾→矿脉图纸 / 兽潮→深井剖面 / 异种→裂谷坐标）—— 那样每一波都在发同一套，区域解锁顺序会和波次错开 |
| 随机事件 | 唯一的例外：**不挑套，补最靠前的那个缺口**。它每小时来一次、与波次进度无关，给卡在某一波的玩家留一条靠时间慢慢磨的路 |
| 解锁闸门 | **勘探图没解锁就不掉**（同任务物品那道闸门，见 §7.13）：大事件开局就能打，那时掉出来只会白占物品栏 |
| 上限 | 每套最多 3 片：集齐后不再掉，勘探完成后更不掉 —— 不留没有出口的囤积（`庇护所扩展方案.md` §2 的原则）。它们是**消耗品**：勘探成功时各扣 1（见「三」） |
| 槽位数 | `mapSets[].tiles.length` **就是槽位数**（页面按它生成格子），换套头（以后做 4 片一张图）不用改页面 |
| 图鉴 | 残片不在任何 `dropTable` 里，物品页必须走 `fragmentSourceMarkup` 那条分支（见 §7.9 的表） |

**三、三格槽位与勘探（`game-state.ts` + `pages/research.ts`）**

```
选三片（界面上的临时选择，不进存档）→ 三片正好是同一张图 → startExpedition(mapId)
  → 成功：camp.maps[mapId] = 2（已勘探）+ 各扣 1 片残片   → 失败：什么都不动，残片还在手里
```

| 项 | 规则 |
| --- | --- |
| 状态常量 | `MAP_STATE`（0 未勘探 / 1 **已废弃** / 2 已勘探）在 `config/maps.ts`，**取值就是存档值** ⇒ 只能追加 |
| 槽位是界面状态 | 三格放的是物品下标，存在**页面的 `ctx`**（R05），**不进 `GameState`** —— 它只是个临时的选择，刷新/切页丢掉也无所谓 |
| 判据 | 三片必须**正好等于某张图的全部残片**（`matchedMap()`：部件都在 **且** 没有重复）。所以「同一片摆两格」凑不出图 |
| 动作入口自校验 | `canStartExpedition()` 会再验一遍「这套残片真的在物品栏里」（`hasMapSet`）—— 界面状态不可信（R30） |
| 消耗时机 | **成功那一刻**才扣残片：失败不扣，可以立刻再派一次；队伍在路上时残片仍在玩家手里，掉落判定自然不会再补第二套 |
| 出发门槛 | 待命后勤 ≥ `EXPEDITION.minWorkers`（2 人）。**不占用 `logistics.assigned`** —— 那会把后勤分配系统搅成一锅粥，「派人去」的语义用门槛 + 成功率加成表达 |
| 成功率 | `baseRate` + 每名待命后勤 `ratePerWorker`，夹在 `[baseRate, maxRate]`；**出发时算一次并锁进存档**，途中等候区再招到人也不改这一趟的结果 |
| 结算 | `resolveExpedition()` 在 `advanceCamp()` 的**最前面**跑，看 `Date.now()` 而不是累计秒数 ⇒ 交战中、离线期间都能正常收尾（与 `camp.pendingExpires` 同一套做法） |
| 新字段 | `camp.maps` / `camp.expeditionMap` / `camp.expeditionEnds` / `camp.expeditionRate` 都在 `rebuildState` 里**逐字段**校验（`maps` 按 `mapSets` 长度对齐、`expeditionMap` 指向不存在的地图就当没出发过）。新增字段不动 `SAVE_VERSION` |
| 记录成对 | `expeditionMap` 与 `expeditionEnds` **一起写、一起清**：判「有没有队伍」看的是 `ends > 0`（`getExpedition` / `resolveExpedition` / `rebuildState` / `normalizeState` 四处同一条判据）。只有 `mapId`、没有 `ends` 的记录（手改存档、或老存档缺这个字段）一律当没出发过 —— `ends` 为 0 会被读成「早就到点了」，于是**凭空结算一趟从没派出过的勘探**：掷一次成功率，赢了就解锁那个区域还扣掉残片（这条踩过，见 §10-30） |
| 旧值兼容 | 上一版有过「拼合地图」独立一步（`camp.maps` 记 1、残片已扣掉）。`rebuildState` 会把 1 **退回 0 并把那三片还给玩家**（只跑一次），`normalizeMapState()` 之后只认 0 / 2 |

**四、页面（`pages/research.ts`，研究基地的第二个页签）**

- **勘探图不是独立页面，是研究基地的页签**（`TABS` + `data-pane`，抄 `pages/story.ts` 的写法）。
  页签可见性走 `setHidden(ctx.atlasTab, !isAtlasUnlocked(state))`：与随机事件同一个主线节点，未解锁时**不渲染**（R29）。
  留在勘探图页签上又被重新锁上（重置存档）就退回委托页。
- **面板只有三格槽位**（`SLOT_COUNT = mapSets[0].tiles.length`）：点一格开**页内**的选片窗口（不是浮层，不需要单例与三关闭），
  候选是物品栏里现成的残片；已经放进别格的残片置灰（同一片不能占两格）。
- **槽位骨架一次性建好**（数量固定），每帧只改文本与类名；**只有选片窗口按签名重建** ——
  它每 500ms 无条件重写会打断点击（同 §10-22）。
- **区域名在勘探成功之前不剧透**：未开放时只写「走通就解锁」，成功之后才换成区域引用 ——
  和图鉴区域列表的「待发现」占位口径一致。
- 庇护所页在 `camp-actions` 末尾补一行「勘探队：… · 剩余 X」；**它只是提示，详细进度在研究基地的勘探图页签里**。

---

### 7.18 页面帮助（`config/help.ts` + `src/help.ts`）

**每个页面标题右侧都有一个【帮助】按钮**，点开是这个页面的「怎么用」。两条文案各归其位：

| 位置 | 写什么 | 例子 |
| --- | --- | --- |
| 标题下的 `<p>`（`public/pages/*.html`） | **氛围**：这是个什么地方。一句剧情向的话，不写操作 | 「墙外的动静从来没停过：天灾、兽潮、异种，一波压下去，下一波已经在路上。」 |
| 帮助浮层（`config/help.ts`） | **操作**：点哪里、会发生什么、要注意什么 | 「「一键清剿」把能稳赢的场次一次打完 —— 带伤时不会硬上，按钮上写着能打几场。」 |

| 项 | 规则 |
| --- | --- |
| 入口 | 按钮写在**静态模板**里（`.page-heading-side` 内，`page-code` 下方），带 `data-help="<页面 id>"`；点击走 `main.ts` 的全局委托 → `openHelp(id)`，页面重挂后不必重新绑 |
| 键 | `helpPages` 的键 = `data-help` = `PageDefinition.id`。**新增页面要一并补一条** —— 漏了会显示「这个页面还没有写帮助」，不是静默失效 |
| 文案 | `sections` 按页面上的板块分节（面板名 / 页签名），一节 2~4 条，一条一句，讲操作与后果；**不写数值公式、不写实现细节** |
| 纯文本 | 帮助**不解析图鉴标记**（写 `[[item:1]]` 会原样显示出来）—— 要指路就用面板名。文案进 `innerHTML` 前过 `escapeHtml()` |
| 浮层 | 单例挂 `body`（`#page-content` 有 `contain: layout`，见 §10-01），`z-index: 70`（遮罩类），三种关闭方式齐全（R12） |
| 分界线 | 标题下那句一旦开始写「怎么点」，页面第一眼读到的就永远是操作而不是氛围。`p` 里出现「点击 / 可以 / 需要 / 页签里」就该往帮助里搬 |
| 与新手引导的分工 | 引导（§6.13）讲「第一次进来先干什么」，只放一次；帮助是随时可查的说明书。两边难免重叠 —— 别为了避重写成两套说法，各自把自己的事说清楚就行 |

---

### 7.19 第二章起的章节内容（`game-state.ts` 的 `storyChapters`）

**第二章「愈深之处」的基调是「区域探索 + Boss」**：第一章教玩法（一节一个明确的小目标），
从第二章开始是**放置** —— 每一节都是「去某个区域刷够击杀数 + 收够那片区域的特产」，
数值刻意往大里放（一节按 1~2 小时估，第一章的节点是十几分钟级的）。

| 节 | 区域 | 要求 | 奖励 |
| --- | --- | --- | --- |
| 2-1 扫清矿脉 | 余烬矿脉 | 区域击杀 1200 · 生命之种 ×35 | 工坊「医护帐篷」（每级 +0.75 庇护所回血） |
| 2-2 下探深井 | 核心深井 | 区域击杀 1800 · 装甲板 ×4000 | 研究项「回收精炼」（每级 1% 概率掉落装备精炼 +1，10 级封顶） |
| 2-3 穿过裂谷 | 熔火裂谷 | 区域击杀 2400 · 余烬核心 ×250 | **占位**：文案写「BOSS 区域尚未开放」，机制等 Boss 落地再补 |
| 2-4 打 Boss | — | — | Boss 区域还没做（见 `庇护所扩展方案.md` §4.6），做完再往 `nodes` 末尾追加这一节 |

两条要求都用**存档里现成的数字**：区域击杀数 `state.zoneWins[zoneId]`（`defeatEnemy` 里自增）、
掉落物就是**怪物 `dropTable` 里的常规材料**。

⚠️ **收集项不许用任务物品**（结晶样本 / 核心读数 / 熔火晶核那三种）：它们只在研究基地的**委托**指向该区域时才掉
（`grantQuestDrop`），把委托状态绑进主线，玩家会被一条自己控制不了的线卡住 —— 委托一换，进度就停了。

**收集项还要选该区独占的掉落物**：2-1 原来收「余烬碎片」，但它同时是废弃边境「重装拾荒者」的掉落
（第一章「追踪核心信号」的出口 —— 那一节在 1-6 之前就要凑够 2 个），不算余烬矿脉的特产，
现在换成只有余烬水蛭掉的「生命之种」。选之前把候选物品在 `zones.ts` 里搜一遍，确认只有这一区掉。

选常规材料时按**该区域的每小时期望产量**定数量（3 秒一只 ≈ 1200 杀/小时）：生命之种在余烬矿脉 ≈12~14/h、
装甲板在核心深井 ≈1440/h、余烬核心在熔火裂谷 ≈50/h —— 这样三节的时长才大致对齐（约 3 / 3 / 5 小时）。

**新增一章 / 一节**：

1. 往 `storyChapters` **末尾**追加一条（或往那一章的 `nodes` 末尾追加一节），节点用 `quest(...)` 造；
2. `pages/story.ts` 的 `chapterStory` 补一张旁白表（缺了只是那一段留空）；
3. 奖励要挂在被解锁的条目上：工坊项 / 研究项写 `unlockBy.chapter(章号, 节号)`（**章号与节号都从 1 起**）；
4. 因为 `unlockBy.chapter()` **故意不给 `notice`**，去 `unlockNotices` 的**末尾**手写一条提示
   （插在中段会让旧存档的 notices 下标整体错位，见 §6.12）；
5. 铁律照旧：**章内严格顺序推进、没轮到的节一律 `???`**（§6.7 / R31）。

**为什么第一版被推翻（别再走那条路）**：原来的第二章是「几节各自独立、谁先做都行」，每节挂一个波次门槛 ——
而大事件 1 小时一件、还要手动点「应对」，相邻两节之间隔了好几场纯等待；当时的应对方式是
**给未达成的节露出条件**（「不然玩家没方向」），等于在渲染层给一节独立的门槛打补丁，越补越乱。
整条线（`config/campaign.ts` / `src/install.ts` / 两件系统物品 / `unlockBy.quest` / `state.quests`）
因此被整章删除，第二章按上面的形状重做。教训两条：**① 章节一律照第一章的做法；② 相邻两节的门槛不要隔超过一场大事件**。

**旧版留下的痕迹**：

| 项 | 现状 |
| --- | --- |
| 「勘探仪」 | 判据是「击退第一次兽潮」（`camp.tideWins >= 1`），与旧版时机一致。⚠️ **别改挂到「第一章全通」** —— 1-8 是后加的，改挂会把「打完兽潮、还没打异种」的存档重新锁上（等级还在、项却消失）。规则**故意不给 `notice`**，提示手写在 `unlockNotices` 末尾（见 §6.12 的下标规则） |
| 「哨戒弩台」 | 只留 `unlockBy.mainline(4)`。旧版那条 quest 通道生效的前提就是第一章走完，砍掉不影响任何老存档 |
| `item.system` | 标记与两处守卫（不占负载 / 不能丢弃）留着，但现在**没有物品使用它** |
| 图鉴 | 物品「获取方式」少了一条 `item.system` 分支（见 §7.9 那张表） |

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
| 07 | `.camp-event-track { grid-template-columns: repeat(4, 1fr) }` | `grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr)` | 写死列数删项后右侧空一格 |
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
- [ ] 新增区域在 `config/zones.ts` 里给了 `icon` 与 `unlock`（规则里必须有可读的 `text()`，见 §7.17）
- [ ] 新增区域 / 制造项 / 研究项是**追加到配置表末尾**，`unlockNotices` 的新条目也是（下标即 `state.notices` 的存档下标）
- [ ] 页面级门槛用 `isXxxUnlocked()`，导航项数量变化时 `style.css` 的 `repeat(N, 1fr)` 与 `page-code` 编号已同步

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
- [ ] 新增一章时只往 `chapters` 末尾追加一条：章内照 `mainline` 顺序推进、章与章串行出现；**没轮到的节一律 `???`**（标题 / 正文 / 解锁条件 / 奖励），没有为这一章开的渲染特例（§6.7 / R31）
- [ ] 给既有条目加解锁渠道用的是 `any(原条件, 新条件)`，没有把原条件换掉（老存档不回退，§7.15）
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
- [ ] 新增的磁贴没有另写一套卡片样式：卡片是 `.item-card` + `.item-icon` + `.item-detail`，尺寸只取 §6.5 的两档（`.storage-grid` / `.tile-compact`）
- [ ] 磁贴里没有写死尺寸的元素：图标框用 `min(设计值, calc(100% - 竖向占位))`，且列数在 §5.3 的两个断点里降级（§10-27）

**工程**

- [ ] `npm run build` 通过（含 `tsc --noEmit`）
- [ ] 未改动 `config/*.ts` 已有条目顺序（R24）
- [ ] 新增构建期常量已同步 `globals.d.ts`（R25）
- [ ] 开发者功能包在 `if (__DEV_TOOLS__)` 内（R25）

**人工可验证**

- [ ] 页面标题下那句是**氛围句**（没有「点击 / 可以 / 需要」这类操作词），「怎么用」在【帮助】浮层里，且 `config/help.ts` 有这个页面的条目（§7.18）
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
| 26 | 工坊人手「串台」：给弩台分配人数，基础城防的人数也跟着涨；而且只有基础城防在推进 | 人手**按项分配**（`fortSlot(id)`，一项一个下标），推进时逐项取自己那一份 | 曾经是「工坊共用一个池子、按项顺序喂」的模型，而界面上每张卡各有一个步进器 —— 界面说 A、模型做 B，两边都是错的（见 §7.15） |
| 27 | 磁贴里的图标框顶出卡片：图标压到相邻卡片上、网格看着错位、溢出面板边框；**有数量的卡片还会把图标框往上顶**（没 stack 时正常） | 磁贴里**不放写死尺寸的元素**：图标框写 `min(60px, calc(100% - 25px))` + `aspect-ratio: 1/1`（小号磁贴 `min(46px, calc(100% - 10px))`，减掉的是**自己那一档**的竖向占位）；卡片必须给一条**宽度确定的轨道**（`grid-template-columns: minmax(0, 1fr)`，**不要**用 `place-content: center`，那种写法下轨道按「最大内容宽度」定尺寸，图标框永远不跟着缩、百分比也解析不出来）；列数按 §5.3 的断点降级 | `.storage-grid` 的方格子（`aspect-ratio: 1/1`）等于「格子多大 = 能放多大的图标」。横向：研究项网格住在 `.archive-layout` 的半宽栏里（约 453px），曾经按 6 列排、每格只有 67px，装不下 60px 的图标框（现在研究项与成就走 `.tile-compact` 的定宽 76px 格子）；纵向：格子高 = 宽，内容高 = 图标框 + 5 间距 + 一行数量 + 16 padding + 2 边框，只按宽度收缩的话**有数量行的卡片**会高出格子，而 `align-content: center` 把多出来的部分上下平分 ⇒ 图标框被顶出格子顶边。所以收缩公式要**把竖向占位一起减掉**，两个方向同时成立 |
| 28 | 同一套磁贴风格在两个网格里长出两个尺寸（半宽栏里的研究项约 83px、整行铺开的成就约 71px） | 小号磁贴的列宽**定死**（`.tile-compact` → `repeat(auto-fill, 76px)`），不要用 `minmax(..., 1fr)`；行末剩下的空隙留着（auto-fill 不回收空轨道） | 「研究项与成就共用一套卡片」要求尺寸**可复现**：`1fr` 会让轨道跟着容器摊开，容器宽度不同尺寸就不同（见 §6.5）。列宽定死之后轨道宽度不再依赖内容，「内容顶出格子」这类问题也一并消失 |
| 29 | 页签的下划线比下面的面板窄一圈、还多出一条横线 | `.tab-bar` 是**视图根的直接子节点**（`<div id="xxx-view"></div>`），别套 `.panel`；面板写进 `.tab-pane` | 视图根写成 `.panel` 会把 22px 内边距加在整块（页签 + 面板）外面，而里面的面板又各带一份 22px —— 页签缩进一圈，`.tab-bar` 的下划线还和面板顶边叠成双线（研究基地踩过，见 §6.2） |
| 30 | 没派过勘探队，新的区域却自己开了（下拉框里冒出一片没勘探过的区域、残片还被扣了） | 判「有没有勘探队在路上」一律看 **`camp.expeditionEnds > 0`**，不能只看 `expeditionMap >= 0`（见 §7.17） | 两个字段是**一起写、一起清**的。只有 `mapId`、`ends` 为 0 的记录（手改存档、老存档缺字段）会被 `Date.now() < (ends \|\| 0)` 读成「早就到点了」→ 下一 tick 凭空结算一趟从没出发过的勘探：掷一次成功率（55% 起步），赢了就写 `camp.maps[mapId] = 已勘探`、扣掉那三片残片，区域随之解锁 |

| 31 | 刚解锁工坊就能把第一波天灾 / 兽潮打完，主线「组建第二支小队」「追踪核心信号」给的东西像没用 | ① 庇护所的成长通道**一律要花材料**（「不花材料、只花时间」的通道不要再加回来，原「营垒修筑」已移除，见 §7.15）；② **要它难就抬 `CAMP_EVENT_BASE`**（见 §7.16 的对照表），**不要**用主线门控顶上 | 营垒把待命后勤直接换成庇护所三围、造价为零、没有上限 ⇒ 挂着就有战力；而数值本身也偏软（旧的第一波天灾 180/9/3，裸庇护所剩 90 血就赢了）⇒ 花钱的城防线还没走就过关了。顺序问题（先打天灾还是先做前一节）**由数值解决**，加门控只是把玩家的选择权拿掉 |
| 32 | 已经完成的主线小节又显示成「未完成」（把装甲板卖光之后） | 已走完的节一律走**封存**渲染：`.requirement.done.settled` → `<s>条件原文</s> <b>已完成</b>`，渲染时**不再调 `done()` / 不再看背包**（`pages/story.ts` 的 `requirementSettledMarkup`，见 §6.7） | 条件是「**达成过**」，不是「此刻仍然成立」。主线节点的完成态在 `mainlineIndex` 里早就翻页了（`index < mainlineIndex` 是终态），界面却拿实时背包重算一遍 —— 两套判据打架，于是卖材料、用道具、花资源都会把历史记录改写成「未完成」 |
| 33 | 一键清剿推完第一章，顺带白送了「余烬矿脉 / 核心深井」两个区域（玩家一次都没碰勘探图） | 后期区域的解锁**只留 `unlockBy.map(...)` 这一个入口**，不要再写 `any(mainline(7), map(...))` 这类并行通道（见 §7.15） | `mainline(7)` = 第一章全通（现在改用 `unlockBy.mainlineDone()`，别再把节点数写死），而第一章正好以「击退第一次兽潮」收尾 —— 也就是说玩家刚打完第一波，就同时拿到两个后期区域，勘探图（碎片 → 地图 → 勘探远征）整条线被绕过，连地图碎片都不必攒 |
| 34 | 第二章「余烬之外」整章推翻重做：为了给「各自独立门槛」的几节补方向，渲染层给未达成的节漏出了「解锁条件」，接着节奏也散了（相邻两节隔好几场大事件） | 章节一律照第一章：章内顺序推进、没轮到的节**全遮 `???`**、章与章串行出现（§6.7 / R31）。要「谁先做都行」的章节，先把设计改了，不要边做边给渲染开特例 | 「玩家没方向」的**根因是那几节各自挂门槛**，不是渲染藏了条件 —— 在渲染层补一块，等于用界面去圆一个没想清楚的机制：先是条件露出来，接着为了补节奏又放宽门槛，最后整章重做。一个章节做完才显示下一章，章内只有「上一节做完」一种前进条件，才不会出现这种要补的窟窿（见 §7.19） |
| 35 | 「原地待命」被当成「休整」：还没驻扎区域的远征队按庇护所的倍率回血、界面上显示篝火与「庇护所休整」 | 两种状态**分开判**：`isIdleZone(zoneId)`（`!zones[zoneId]`）与 `isCampZone(zoneId)`（有区域、且 `enemyIds` 为空）。区域取值一律走 `currentZoneId()`，**无效即 `-1`**；`isCampZone` **不再**把「无效下标」算作庇护所 | 老写法 `!zones[id] || 没敌人` 一条判死，把「没有区域」也归进了庇护所 —— 而庇护所现在是挣来的（`unlockBy.mainline(1)`），开局那段时间既不该有篝火、也不该拿那份回血加成。同类：`advanceAdventure` / `applyOffline` / `rebuildState` / 概览栏 / 冒险页 五处都要判「待命」这一支（见 §7.16） |
| 36 | 卡片飘出来的悬停详情被右侧概览栏盖住（浮层已经按 §1 取了 `z-index: 7` 也没用） | 在**列**这一级解决：`.page-content { position: relative; z-index: 1 }` + `.hud { z-index: 0 }` | `#page-content` 带 `contain: layout` ⇒ **它自己就是一个层叠上下文**：里面的 `.item-detail` 无论取多大的号，都只在内容列内部比较；而 `.hud` 是它后面的定位兄弟（sticky），按 DOM 顺序自然压住它。所以这类「浮层被相邻列盖住」要在列这一级调号，别给卡片继续加号（§1 取号表 / §6.14 / §10-03） |
