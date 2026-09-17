/* 悬停详情跟随鼠标。
   详情元素仍然留在卡片内部（这样 :hover 链、卡片抬升的 z-index、以及浮层里的按钮都照常工作），
   只是把坐标写进 CSS 变量 --tip-x / --tip-y，由 details 的 transform: translate() 使用。
   坐标是「相对卡片左上角」的像素值：详情用 position: absolute 定位在卡片里，
   这样不受 .page-content 的 contain: layout（会把 fixed 后代改成相对它定位）影响。 */
/* 装备槽（.equip-slot）也是宿主：它的浮层同样用 .item-detail，内容和物品卡片一致
   （两处共用 pages/inventory.ts 的 detailMarkup）。
   成就与物品储藏 / 研究项是同一套磁贴，所以走的就是 `.item-card` + `.item-detail` ——
   这里**不为它们另开选择器**：任何一个新的磁贴网格接进来（见 UI开发规范 §6.5）都不用改这张表。 */
const HOST_SELECTOR = '.item-card, .shop-item, .equip-slot';
const TIP_SELECTOR = '.item-detail, .shop-detail';
const OFFSET = 16;      // 鼠标与浮层的间距
const MARGIN = 8;       // 与视口边缘的最小距离

/** 兜底位置：贴在卡片下方（键盘聚焦、以及需要把浮层挪开鼠标时用）。 */
function placeBelowCard(tip: HTMLElement, host: HTMLElement): void {
  tip.style.setProperty('--tip-x', '0px');
  tip.style.setProperty('--tip-y', `${host.offsetHeight + 6}px`);
}

/** 把浮层贴到鼠标右下角；放不下就翻到左侧 / 上方，最后才夹进视口。

    这里刻意用「翻转」而不是直接夹紧：夹紧会让浮层正好停在鼠标底下，
    而浮层是卡片的子孙元素，指针停在它上面依然满足 :hover —— 表现就是「鼠标离开卡片了，浮层还挂着」。
    翻转后浮层与鼠标之间至少隔着 OFFSET 的距离，不会再被自己抓住。 */
function place(tip: HTMLElement, host: HTMLElement, clientX: number, clientY: number): void {
  const hostRect = host.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  const width = tipRect.width || tip.offsetWidth;
  const height = tipRect.height || tip.offsetHeight;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  let x = clientX + OFFSET;
  if (x + width + MARGIN > viewportWidth) x = clientX - OFFSET - width;
  let y = clientY + OFFSET;
  if (y + height + MARGIN > viewportHeight) y = clientY - OFFSET - height;
  /* 两侧都放不下（浮层比视口还大）时才退回夹紧。 */
  x = Math.min(Math.max(MARGIN, x), Math.max(MARGIN, viewportWidth - width - MARGIN));
  y = Math.min(Math.max(MARGIN, y), Math.max(MARGIN, viewportHeight - height - MARGIN));
  tip.style.setProperty('--tip-x', `${x - hostRect.left}px`);
  tip.style.setProperty('--tip-y', `${y - hostRect.top}px`);
}

/** 最近一次命中的卡片，用于兜底处理（失焦、滚动、指针离开窗口）。 */
let activeHost: HTMLElement | null = null;

function move(event: PointerEvent): void {
  const target = event.target as Element | null;
  if (!target?.closest) return;
  /* 指针已经进入浮层：不再更新坐标，否则浮层会一直躲着鼠标，里面的按钮永远点不到。 */
  if (target.closest(TIP_SELECTOR)) return;
  const host = target.closest<HTMLElement>(HOST_SELECTOR);
  const tip = host?.querySelector<HTMLElement>(TIP_SELECTOR);
  activeHost = host;
  if (host && tip) place(tip, host, event.clientX, event.clientY);
}

let pending: PointerEvent | null = null;
let scheduled = false;
/** pointermove 触发极密，用 rAF 合并，避免每个事件都读写布局。 */
function onPointerMove(event: PointerEvent): void {
  pending = event;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    if (pending) { move(pending); pending = null; }
  });
}

/* 最近一次聚焦是不是键盘（Tab）发起的。
   卡片带 tabindex="0"，鼠标点它同样会触发 focusin —— 那时玩家的指针还停在卡片上，
   把浮层挪到卡片下方就成了「点一下就瞬移」。所以鼠标来源的聚焦一律忽略。 */
let keyboardFocus = false;

/** 键盘聚焦时没有鼠标坐标：退回「贴在卡片下方」的老位置，至少不会盖住卡面。
    鼠标点击引起的聚焦直接跳过：浮层不该对点击有任何响应，指针在哪它就留在哪。 */
function onFocusIn(event: FocusEvent): void {
  if (!keyboardFocus) return;
  const host = (event.target as Element | null)?.closest<HTMLElement>(HOST_SELECTOR);
  const tip = host?.querySelector<HTMLElement>(TIP_SELECTOR);
  if (host && tip) { activeHost = host; placeBelowCard(tip, host); }
}

/** 指针离开窗口 / 窗口失焦 / 滚动时，把浮层挪回卡片下方。
    这样万一它正好压在鼠标底下（浏览器没重算 :hover 的少数情况），挪开后 hover 会立刻失效、浮层收起。 */
function park(): void {
  const host = activeHost;
  if (!host?.isConnected) { activeHost = null; return; }
  const tip = host.querySelector<HTMLElement>(TIP_SELECTOR);
  if (tip) placeBelowCard(tip, host);
}

export function startHoverTip(): void {
  /* 聚焦来源：Tab 之后紧接着的 focusin 算键盘，其余（鼠标按下、脚本聚焦）算鼠标。
     两个监听都走捕获，保证在 focusin 之前拿到最新的来源。 */
  document.addEventListener('keydown', event => { keyboardFocus = event.key === 'Tab'; }, true);
  document.addEventListener('pointerdown', () => { keyboardFocus = false; }, true);
  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('pointerout', event => { if (!event.relatedTarget) park(); }, true);
  document.addEventListener('scroll', park, { capture: true, passive: true });
  window.addEventListener('blur', park);
}
