import pageController from './page-controller';
import { hasSeenGuide, markGuideSeen, resetGuides, onUnlock, getState } from './game-state';
import { zones, ZONE } from './config/zones';
import { EQUIP_TYPE } from './config/items';
import type { GameState } from './types';

/* ——— 新手指引 ———
   全屏遮罩 + 高亮挖孔 + 说明气泡。遮罩由四块 div 拼成（上 / 下 / 左 / 右），
   中间留出的矩形就是「允许点击的范围」—— 那里没有任何元素，点击直接落到页面上。

   为什么不用 SVG mask 或 box-shadow 挖孔：那两种方案里遮罩层本身仍然铺满整屏，
   要么得再补一层点击拦截（SVG 的洞是视觉上的，元素还在），要么会被祖先的
   overflow / contain 裁掉（box-shadow）。四块 div 天然只挡该挡的地方。

   看过哪些存在存档里（state.guides），支持跳过与重置（设置页）。
   挂在 body 上：fixed 定位，而 #page-content 有 contain: layout（见 UI开发规范 §10-01）。 */

interface GuideStep {
  /** 高亮目标的选择器；缺省表示居中讲解、不挖孔。 */
  target?: string;
  /** 高亮区里**允许点击**的元素选择器（应当落在 target 内）。
      缺省时高亮区整体不可点 —— 只是展示某个面板时，面板里的按钮按不动，这是刻意的。
      需要「点这里进去」这类操作时，写 click（或直接 requireClick，见下）。 */
  click?: string;
  /** true 表示必须点中 click 元素才能继续（此时不显示「下一步」，只能点或跳过）。
      没写 click 时默认允许点 target 本身。 */
  requireClick?: boolean;
  /** 等到这个条件成立才放行「下一步」（成立前按钮禁用，并显示 waitHint）。
      用来让玩家在引导里真的做完一件事，例如「等这场战斗打完」。 */
  waitFor?: (state: GameState) => boolean;
  /** 等待期间显示在气泡里的提示，条件成立后自动收起。 */
  waitHint?: string;
  title: string;
  body: string;
}

interface Rect { name: string; x: number; y: number; w: number; h: number; }

/** 高亮框 / 可点区相对目标外扩的像素：让描边不贴着目标边缘，也让小按钮更好点。 */
const PAD = 6;
/** 气泡与高亮框 / 视口边缘的间距。 */
const GAP = 14;
/** 用来表示「这块不拦」的零尺寸矩形。 */
const ZERO_RECTS: Rect[] = [{ name: 'top', x: 0, y: 0, w: 0, h: 0 }, { name: 'bottom', x: 0, y: 0, w: 0, h: 0 }, { name: 'left', x: 0, y: 0, w: 0, h: 0 }, { name: 'right', x: 0, y: 0, w: 0, h: 0 }];
const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

/** 引导表。键同时是 state.guides 里的标记、以及解锁事件的 id（见 game-state 的 unlockNotices）。 */
const GUIDES: Record<string, GuideStep[]> = {
  /* 首次进游戏：把当时已解锁的面板挨个认一遍。 */
  intro: [
    { title: '欢迎来到荒野', body: '这里是远征队的落脚点。花十几秒认一遍界面，随时可以跳过。' },
    { target: '#home-hero', title: '远征状态', body: '远征队当前在哪、什么水平（攻击与防御）、正在和谁交战 —— 都在这里。换了装备回这一屏就能看到战力变化。' },
    { target: '#home-resources', title: '资源', body: '金币、废料、精华是所有系统的通用资源：工坊制造、研究委托、装备强化都靠它们。' },
    { target: '#home-quest', title: '主线目标', body: '当前主线。完成它会解锁新系统 —— 每解锁一个都会再带你认一次。' },
    { target: '#home-log', title: '日志', body: '战斗、掉落与成长的记录。日志里带下划线的名字都能点开图鉴。' },
    { target: '#main-nav', title: '面板入口', body: '所有面板都从左侧进入。还没解锁的会显示成「❓未解锁」，解锁后自动亮起。' },
    { target: '[data-page="camp"]', requireClick: true, title: '先去庇护所', body: '点这里进入庇护所。' },
    { target: '#camp-view', title: '庇护所', body: '后勤中心：分配人手修营垒、应对天灾与兽潮。庇护所生命归零就要重头再来。' },
    { target: '[data-page="adventure"]', requireClick: true, title: '然后是冒险', body: '点这里出发。' },
    { target: '#adventure-view', title: '冒险', body: '选一个目标区域，远征队会自动开打。打不动就换个区域，或者回庇护所休整。' },
    { target: '[data-page="inventory"]', requireClick: true, title: '物品栏', body: '点这里看战利品。' },
    { target: '#inventory-view', title: '物品栏', body: '装备、材料与词条强化都在这里。悬停卡片看详细属性，右键出操作菜单；左上角的「装备加成」能看身上这套一共给了多少。' },
    /* 让玩家真的把开局送的短刃穿上：装备不会自己生效，这一步不亲手做一遍，武器槽大概率一直空着。
       用 waitFor 而不是 requireClick —— 装备的两条路径（右键菜单、拖到槽位）都不是单纯左键点击，
       而 requireClick 的放行判定只认 click。所以这里把整个物品栏让出来（click 与 target 同为该容器），
       玩家怎么做都行，等「武器槽非空」成立才放行「下一步」。 */
    { target: '#inventory-view', click: '#inventory-view', waitFor: state => state.equipped[EQUIP_TYPE.weapon].some(instanceId => instanceId >= 0), waitHint: '把物品储藏里的「拾荒者短刃」穿上：右键那张卡片选「装备」，或者把它拖到左边的武器槽。', title: '先穿上武器', body: '开局送的那把拾荒者短刃还在包里 —— 装备不会自己生效。攻击力直接决定每一下的伤害，穿上之后回主界面就能看到「攻击」涨了。' },
    { target: '[data-page="story"]', requireClick: true, title: '远征档案', body: '点这里翻记录。' },
    { target: '#story-view', title: '远征档案', body: '主线进度、成就与解锁记录。有些成就会解锁新系统。' },
    { target: '[data-page="settings"]', requireClick: true, title: '最后是设置', body: '点这里。' },
    { target: '#settings-view', title: '设置', body: '字体大小、数字格式与通知开关，还能导出存档备份。想重看这份指引，点「重置新手指引」；「查看更新日志」里写着历次更新都改了什么。' },
    /* 认完面板，直接带玩家把第一条主线做掉：打赢一场。 */
    { target: '[data-page="adventure"]', requireClick: true, title: '做第一件事', body: '主线在等你：打赢一场。点这里回冒险。' },
    { target: '[data-action="zone-toggle"]', requireClick: true, title: '选择目标区域', body: '点这里挑一个要去的地方。' },
    { target: `[data-zone="${ZONE.wasteBorder}"]`, requireClick: true, title: `选「${zones[ZONE.wasteBorder].name}」`, body: '营火边上就是它，最适合起步。选中之后远征队会自动开打。' },
    { target: '#adventure-view', waitFor: state => state.totalWins >= 1, waitHint: '远征队正在交战，等这一场打完。', title: '等待战斗结束', body: '战斗是自动进行的：双方按各自的出手间隔互相攻击，生命值随时间回复。不用操作，等结果就行。' },
    { title: '第一场胜利', body: '主线「点亮第一座营火」完成。接着攒资源、往更深的区域推进，剩下的系统会自己找上门。' }
  ],
  /* 以下都是系统解锁时的一次性引导（id 与 unlockNotices 的条目 id 一致）。 */
  workshop: [
    { target: '[data-page="workshop"]', requireClick: true, title: '新系统 · 工坊', body: '左侧导航多了一个入口，点进去看看。' },
    { target: '#workshop-view', title: '工坊', body: '把后勤小队的人分到这里：工坊会用废料与装甲板自动制造城防，逐级提升庇护所战力。制造项按主线进度逐个开放。' }
  ],
  researchBase: [
    { target: '[data-page="research"]', requireClick: true, title: '新系统 · 研究基地', body: '左侧导航多了一个入口，点进去看看。' },
    { target: '#research-view', title: '研究基地', body: '基地会发布资源收集委托，交齐掉落物换研究点数。研究点数用来提升研究项，直接加强远征队自身。' }
  ],
  randomEvent: [
    { target: '[data-page="camp"]', requireClick: true, title: '庇护所 · 随机事件', body: '庇护所现在会被荒野上的随机事件打扰，点进去看看。' },
    { target: '#camp-view', title: '庇护所 · 随机事件', body: '事件会在倒计时结束后出现：接受就进入战斗，拒绝不扣任何东西。强度随主线与胜场一起涨。' }
  ],
  wiki: [
    { title: '新系统 · 图鉴', body: '所有带下划线的名字现在都能点开了：物品、怪物、区域、事件各有图鉴页，页面顶部还能沿着路径往回翻。' }
  ]
};

let layer: HTMLElement | null = null;
/** 正在放的引导 id；空串表示当前没有引导。 */
let activeId = '';
let steps: GuideStep[] = [];
let stepIndex = 0;
/** 排队等待的引导：解锁事件可能连着来（例如同时解锁研究基地与研究项）。 */
const queue: string[] = [];
/** 引导放完之后要执行的回调（见 whenGuideIdle）。 */
const idleCallbacks: Array<() => void> = [];

function ensureLayer(): HTMLElement {
  if (layer?.isConnected) return layer;
  const element = document.createElement('div');
  element.className = 'guide-layer';
  element.hidden = true;
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-label', '新手指引');
  element.innerHTML = `<div class="guide-shade" data-shade="top"></div><div class="guide-shade" data-shade="bottom"></div><div class="guide-shade" data-shade="left"></div><div class="guide-shade" data-shade="right"></div><div class="guide-block" data-block="top"></div><div class="guide-block" data-block="bottom"></div><div class="guide-block" data-block="left"></div><div class="guide-block" data-block="right"></div><div class="guide-ring" data-guide-ring></div><div class="guide-pocket" data-guide-pocket></div><div class="guide-bubble"><span class="panel-kicker">GUIDE</span><h3 data-guide-title></h3><p data-guide-body></p><p class="guide-hint" data-guide-hint></p><div class="guide-actions"><span class="guide-progress" data-guide-progress></span><button class="secondary-button" type="button" data-guide-skip>跳过</button><button class="primary-button" type="button" data-guide-next>下一步</button></div></div>`;
  element.addEventListener('click', event => {
    const target = event.target as Element;
    if (target.closest('[data-guide-skip]')) { finish(); return; }
    if (target.closest('[data-guide-next]')) next();
  });
  document.body.appendChild(element);
  layer = element;
  return element;
}

/** 把引导层里某一组矩形（shade / block）摆到指定位置。 */
function setBox(root: HTMLElement, kind: 'shade' | 'block', rect: Rect): void {
  const node = root.querySelector<HTMLElement>(`[data-${kind}="${rect.name}"]`)!;
  node.style.left = `${rect.x}px`;
  node.style.top = `${rect.y}px`;
  node.style.width = `${Math.max(0, rect.w)}px`;
  node.style.height = `${Math.max(0, rect.h)}px`;
}

/** 把四块遮罩、高亮区里的拦截层、描边与气泡摆到当前步骤对应的位置。每帧都可能重算（页面重绘会换掉目标节点）。 */
function place(): void {
  const element = layer;
  const step = steps[stepIndex];
  if (!element || !step || element.hidden) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const node = step.target ? document.querySelector<HTMLElement>(step.target) : null;
  const box = node?.getBoundingClientRect();
  /* 目标不在当前页面（还没切过去）或尺寸为 0：不挖孔，气泡居中，等下一帧再试。 */
  const hole = box && box.width > 1 && box.height > 1
    ? { x: Math.max(0, box.left - PAD), y: Math.max(0, box.top - PAD), w: box.width + PAD * 2, h: box.height + PAD * 2 }
    : null;

  const rects = hole
    ? [
      { name: 'top', x: 0, y: 0, w: vw, h: hole.y },
      { name: 'bottom', x: 0, y: hole.y + hole.h, w: vw, h: vh - hole.y - hole.h },
      { name: 'left', x: 0, y: hole.y, w: hole.x, h: hole.h },
      { name: 'right', x: hole.x + hole.w, y: hole.y, w: vw - hole.x - hole.w, h: hole.h }
    ]
    : [{ name: 'top', x: 0, y: 0, w: vw, h: vh }, ...ZERO_RECTS.slice(1)];
  rects.forEach(rect => setBox(element, 'shade', rect));

  /* 高亮区里的拦截层：默认整块拦死，只有 step.click 指定的元素被让出来 ——
     「展示某个面板时面板里的按钮按不动」就是靠这一层实现的。
     让出来的矩形要裁进 hole，否则会跑到外层遮罩底下去。 */
  const clickSelector = step.click ?? (step.requireClick ? step.target : undefined);
  const clickNode = clickSelector ? document.querySelector<HTMLElement>(clickSelector) : null;
  const clickBox = clickNode?.getBoundingClientRect();
  const pocket = clickBox && clickBox.width > 1
    ? { x: clickBox.left - PAD, y: clickBox.top - PAD, w: clickBox.width + PAD * 2, h: clickBox.height + PAD * 2 }
    /* 没有允许点击的元素：把「洞」收到高亮框正中心的一个零尺寸点，等于整块拦死。 */
    : hole ? { x: hole.x + hole.w / 2, y: hole.y + hole.h / 2, w: 0, h: 0 } : null;
  let blocks: Rect[] = ZERO_RECTS;
  if (hole && pocket) {
    const px = clamp(pocket.x, hole.x, hole.x + hole.w);
    const py = clamp(pocket.y, hole.y, hole.y + hole.h);
    const pw = clamp(pocket.w, 0, hole.x + hole.w - px);
    const ph = clamp(pocket.h, 0, hole.y + hole.h - py);
    blocks = [
      { name: 'top', x: hole.x, y: hole.y, w: hole.w, h: py - hole.y },
      { name: 'bottom', x: hole.x, y: py + ph, w: hole.w, h: hole.y + hole.h - py - ph },
      { name: 'left', x: hole.x, y: py, w: px - hole.x, h: ph },
      { name: 'right', x: px + pw, y: py, w: hole.x + hole.w - px - pw, h: ph }
    ];
  }
  blocks.forEach(rect => setBox(element, 'block', rect));

  const ring = element.querySelector<HTMLElement>('[data-guide-ring]')!;
  ring.hidden = !hole;
  if (hole) {
    ring.style.left = `${hole.x}px`;
    ring.style.top = `${hole.y}px`;
    ring.style.width = `${hole.w}px`;
    ring.style.height = `${hole.h}px`;
  }

  /* 可点区再单独描一圈：高亮框很大时可点的那一小块必须能一眼找到。 */
  const pocketRing = element.querySelector<HTMLElement>('[data-guide-pocket]')!;
  const showPocket = !!hole && !!pocket && !!clickBox && clickBox.width > 1;
  pocketRing.hidden = !showPocket;
  if (showPocket && pocket) {
    pocketRing.style.left = `${pocket.x}px`;
    pocketRing.style.top = `${pocket.y}px`;
    pocketRing.style.width = `${pocket.w}px`;
    pocketRing.style.height = `${pocket.h}px`;
  }

  /* 气泡优先放高亮框下方，放不下翻到上方；水平居中于高亮框，最后夹进视口。 */
  const bubble = element.querySelector<HTMLElement>('.guide-bubble')!;
  const bw = bubble.offsetWidth;
  const bh = bubble.offsetHeight;
  let bx = (vw - bw) / 2;
  let by = (vh - bh) / 2;
  if (hole) {
    const below = hole.y + hole.h + GAP;
    by = below + bh <= vh - GAP ? below : hole.y - bh - GAP;
    bx = hole.x + hole.w / 2 - bw / 2;
  }
  bubble.style.left = `${Math.min(Math.max(GAP, bx), Math.max(GAP, vw - bw - GAP))}px`;
  bubble.style.top = `${Math.min(Math.max(GAP, by), Math.max(GAP, vh - bh - GAP))}px`;
}

function render(): void {
  const element = ensureLayer();
  const step = steps[stepIndex];
  if (!step) { finish(); return; }
  element.hidden = false;
  element.querySelector<HTMLElement>('[data-guide-title]')!.textContent = step.title;
  element.querySelector<HTMLElement>('[data-guide-body]')!.textContent = step.body;
  element.querySelector<HTMLElement>('[data-guide-progress]')!.textContent = `${stepIndex + 1} / ${steps.length}`;
  /* 要求点目标的步骤不给「下一步」—— 只能点放行的元素，或者跳过。 */
  element.querySelector<HTMLElement>('[data-guide-next]')!.hidden = !!step.requireClick;
  const hint = element.querySelector<HTMLElement>('[data-guide-hint]')!;
  hint.textContent = step.waitHint ?? '';
  hint.hidden = !step.waitHint;
  syncWait();
  /* 文案长度决定气泡高度，等浏览器排版完再量尺寸。 */
  requestAnimationFrame(place);
}

/** 等待型步骤：条件成立前禁用「下一步」并显示提示，成立后自动放出来。 */
function syncWait(): void {
  const element = layer;
  const step = steps[stepIndex];
  if (!element || !step) return;
  const ready = !step.waitFor || step.waitFor(getState());
  const button = element.querySelector<HTMLButtonElement>('[data-guide-next]');
  const hint = element.querySelector<HTMLElement>('[data-guide-hint]');
  if (button) button.disabled = !!step.waitFor && !ready;
  if (hint && step.waitFor) hint.hidden = ready;
}

function next(): void {
  if (stepIndex >= steps.length - 1) { finish(); return; }
  stepIndex += 1;
  render();
}

function finish(): void {
  if (activeId) markGuideSeen(activeId);
  activeId = '';
  steps = [];
  stepIndex = 0;
  if (layer) layer.hidden = true;
  const queued = queue.shift();
  if (queued) startGuide(queued);
  /* 引导全放完了：放行等着「不抢屏」的全局弹窗（见 whenGuideIdle）。 */
  else if (idleCallbacks.length) idleCallbacks.splice(0).forEach(callback => callback());
}

/** 引导空闲时执行 callback：当前没有引导就立刻执行，否则等这一段（含排队中的）全部放完。
    给「不抢屏」的全局弹窗用 —— 引导层在最上层，压着它弹出来只会被盖住（见 changelog.ts）。 */
export function whenGuideIdle(callback: () => void): void {
  if (!activeId) { callback(); return; }
  idleCallbacks.push(callback);
}

/** 开始一段引导。正在放别的引导时排队，等它结束再放。 */
export function startGuide(id: string): void {
  if (!GUIDES[id]) return;
  if (activeId) { if (!queue.includes(id)) queue.push(id); return; }
  activeId = id;
  steps = GUIDES[id];
  stepIndex = 0;
  render();
}

/** 页面重绘 / 窗口尺寸变化后重新定位。main.ts 在每次状态同步时调用。 */
export function updateGuide(): void { if (!activeId) return; place(); syncWait(); }

/** 设置页的「重置新手指引」：清空进度、回主界面、从头放一遍。 */
export function restartGuides(): void {
  activeId = '';
  steps = [];
  stepIndex = 0;
  queue.length = 0;
  if (layer) layer.hidden = true;
  resetGuides();
  pageController.switchTo('home');
  startGuide('intro');
}

/** 应用启动时调用一次。 */
export function initGuide(): void {
  /* 新系统解锁 → 放一次它的引导（没在 GUIDES 里的解锁事件会被忽略，例如成就）。 */
  onUnlock(event => { if (!hasSeenGuide(event.id)) startGuide(event.id); });
  /* 点高亮区里的目标即前进。用捕获阶段：要在页面自己的 root.onclick 之前判断命中的是谁。 */
  document.addEventListener('click', event => {
    if (!activeId) return;
    const step = steps[stepIndex];
    if (!step?.requireClick) return;
    const selector = step.click ?? step.target;
    if (!selector) return;
    if (!(event.target as Element | null)?.closest?.(selector)) return;
    /* 目标是导航按钮：它自己的 onclick 会切页，等页面渲染完再走下一步。 */
    requestAnimationFrame(() => requestAnimationFrame(next));
  }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && activeId) finish(); });
  window.addEventListener('resize', () => { if (activeId) place(); });
  document.addEventListener('scroll', () => { if (activeId) place(); }, true);
  if (!hasSeenGuide('intro')) startGuide('intro');
}
