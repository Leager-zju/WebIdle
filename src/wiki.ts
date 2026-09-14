import { items, rarities, itemCategories, equipTypes } from './config/items';
import { affixes, affixCap } from './config/affixes';
import { enemyTable, zones, zoneOfEnemy } from './config/zones';
import { CAMP_EVENT, campEventDef, campEventEntries } from './config/events';
import { codexEntry, codexRefMarkup, dropEntryMarkup, enemyRefMarkup, itemRefMarkup, zoneRefMarkup, onWikiUnlockChange } from './codex-ref';
import { getState, isEncountered, isDropDiscovered, isZoneUnlocked, isCampEventTimerRunning, getCampEventInfo, formatNumber, formatSeconds, mainline, setTable, setOfItem, getSetWorn, isPerfectItem, setBonusText, perfectBonusText, REFINE_MAX } from './game-state';
import type { ItemCategory } from './types';

/* ——— 内置 wiki：图鉴弹窗 ———
   页面上任何图鉴引用（见 codex-ref.ts）点击后都会打开它。两类页面：

   - 列表页：home（首页）/ items / enemies / zones / events
   - 条目页：item / enemy / zone / event（带下标）

   层级是固定的（条目页的父级就是它所属的列表页），所以路径直接按 page 推导，
   不需要历史栈 —— 点路径上任意一级就是「回退到那一页」。主页自身不显示路径。

   未解锁 / 未遭遇的内容不进列表（见 UI开发规范 §6.11）。

   和 hover-tip 一样挂在 body 上：wiki 层是 fixed 定位，而 #page-content 有 contain: layout，
   挂在页面里会被当成相对它定位（见 UI开发规范 §10-01）。 */

/** 列表页的标题与图标；键同时也是页面 id。
    items 下面还有一层分类页（items-equipment 等），层级靠 pathMarkup 拼出来。 */
const LIST_TITLES: Record<string, string> = {
  items: '物品', 'items-equipment': '装备', 'items-sets': '套装', 'items-resource': '资源', 'items-consumable': '消耗品',
  enemies: '怪物', zones: '区域', events: '事件'
};
const LIST_ICONS: Record<string, string> = {
  items: '📦', 'items-equipment': '⚔️', 'items-sets': '🧩', 'items-resource': '◆', 'items-consumable': '⚗️',
  enemies: '👾', zones: '🗺️', events: '⚡'
};
/** 物品页下的分类页：物品类别 → 页面 id。套装单独一页（它的条目是「套」而不是「件」）。 */
const ITEM_PAGE: Record<string, string> = { equipment: 'items-equipment', resource: 'items-resource', consumable: 'items-consumable' };
/** 物品页下的分类页（含套装页），顺序即展示顺序。 */
const ITEM_PAGES = ['items-equipment', 'items-sets', 'items-resource', 'items-consumable'];
/** 条目页 → 它所属的列表页。物品按类别落到对应分类页，套装落到套装页。 */
const ENTRY_LISTS: Record<string, string> = { enemy: 'enemies', zone: 'zones', event: 'events', set: 'items-sets' };
/** 条目页的父级列表页：item 要看它自己的类别，其余查表。 */
function entryListOf(kind: string, id: number): string {
  if (kind !== 'item') return ENTRY_LISTS[kind] || 'items';
  return ITEM_PAGE[items[id]?.category] || 'items';
}

let layer: HTMLElement | null = null;
/** 当前页面：page 是页面 id，id 只对条目页有意义。 */
let current: { page: string; id: number } = { page: 'home', id: -1 };

/* ——— 通用片段 ——— */

/** 列表里的一格：图标 + 名称（+ 可选角注）。colorClass 用来给名字上色。 */
function cellMarkup(codex: string, icon: string, name: string, colorClass = '', note = ''): string {
  return `<button class="wiki-cell ${colorClass}" type="button" data-codex="${codex}"><span class="wiki-cell-icon" aria-hidden="true">${icon}</span><span class="wiki-cell-name">${name}</span>${note ? `<span class="wiki-cell-note">${note}</span>` : ''}</button>`;
}
function factMarkup(label: string, value: string): string { return `<div><span>${label}</span><b>${value}</b></div>`; }
/** 条目格子：图标 / 名称 / 颜色类统一从 codexEntry 取，各处不要再自己拼。 */
function entryCellMarkup(kind: string, id: number, note = ''): string {
  const entry = codexEntry(kind, id)!;
  return cellMarkup(`${kind}:${id}`, entry.icon, entry.name, entry.colorClass, note);
}
/** 数值网格（.codex-stats：标签在左、数值在右的自适应格）。 */
function factsMarkup(facts: string[]): string { return facts.length ? `<div class="codex-stats">${facts.join('')}</div>` : ''; }
/** 「是否达成」统一用主线条件那一套样式：前面一个 status-dot，达成就点亮。 */
function statusLine(text: string, done: boolean): string {
  return `<div class="requirement ${done ? 'done' : ''}"><span class="status-dot ${done ? '' : 'pending'}"></span><span>${text}</span></div>`;
}
/** 一个小节：标题 + 内容。 */
function sectionMarkup(title: string, body: string): string { return `<section class="wiki-section"><h4 class="wiki-section-title">${title}</h4>${body}</section>`; }
/** 一排图鉴引用。 */
function refsMarkup(refs: string[]): string { return `<div class="wiki-refs">${refs.join('')}</div>`; }

/** 路径：主页 › 列表 › [分类] › 条目。主页自己不带路径；每一级可点，当前级是纯文本。 */
function pathMarkup(page: string, name: string): string {
  if (page === 'home') return '';
  const sep = '<span class="wiki-path-sep" aria-hidden="true">›</span>';
  const home = `<button class="wiki-path-link" type="button" data-codex="page:home">主页</button>`;
  const itemsLink = `<button class="wiki-path-link" type="button" data-codex="page:items">${LIST_TITLES.items}</button>`;
  if (LIST_TITLES[page]) {
    /* 物品下的分类页比别的列表多一级。 */
    const under = page.startsWith('items-') ? [itemsLink] : [];
    return `<nav class="wiki-path" aria-label="图鉴路径">${[home, ...under, `<span class="wiki-path-current">${LIST_TITLES[page]}</span>`].join(sep)}</nav>`;
  }
  const list = entryListOf(page, current.id);
  const under = list.startsWith('items-') ? [itemsLink] : [];
  const parts = [home, ...under, `<button class="wiki-path-link" type="button" data-codex="page:${list}">${LIST_TITLES[list]}</button>`, `<span class="wiki-path-current">${name}</span>`];
  return `<nav class="wiki-path" aria-label="图鉴路径">${parts.join(sep)}</nav>`;
}

/* ——— 列表页 ——— */

function homeBody(): string {
  return `<p class="wiki-lead">图鉴收录远征中遇到的一切。点任意名字都能跳到对应页面，路径上的「主页」随时可以回来。</p>
    <div class="wiki-grid">${Object.keys(LIST_TITLES).map(page => cellMarkup(`page:${page}`, LIST_ICONS[page], LIST_TITLES[page], 'codex-page')).join('')}</div>`;
}

function itemsBody(): string {
  return `<p class="wiki-lead">物品分四类。装备与套装是长期投入，资源与消耗品是沿途的补给。</p>
    <div class="wiki-grid">${ITEM_PAGES.map(page => cellMarkup(`page:${page}`, LIST_ICONS[page], LIST_TITLES[page], 'codex-page')).join('')}</div>`;
}

/** 某个物品类别下的所有物品。 */
function itemCategoryBody(category: ItemCategory): string {
  const ids = items.map((item, id) => (item.category === category ? id : -1)).filter(id => id >= 0);
  if (!ids.length) return '<p class="wiki-lead">这一类还没有收录任何东西。</p>';
  return `<p class="wiki-lead">共 ${ids.length} 种。名字的颜色代表稀有度，点开可以看它的效果与掉落来源。</p>
    <div class="wiki-grid">${ids.map(id => entryCellMarkup('item', id)).join('')}</div>`;
}

/** 套装列表：每套一张卡，角注是「已穿上的部件数 / 总部件数」。 */
function setsBody(): string {
  const state = getState();
  const done = setTable.filter((entry, id) => getSetWorn(id, state) >= entry.pieces.length).length;
  return `<p class="wiki-lead">每个战斗区域掉一整套装备。凑齐全部部件激活套装效果，全部精炼到 +${REFINE_MAX} 还会再给一次永久加成。</p>
    ${statusLine(`已凑齐 ${done} / ${setTable.length} 套`, done >= setTable.length)}
    <div class="wiki-grid">${setTable.map((entry, id) => entryCellMarkup('set', id, `${getSetWorn(id, state)} / ${entry.pieces.length}`)).join('')}</div>`;
}

/** 套装条目页：部件清单、凑齐效果、极致效果。装备条目页只链接到这里，不再重复这些内容。 */
function setBody(id: number): string {
  const entry = setTable[id];
  const state = getState();
  const total = entry.pieces.length;
  const worn = getSetWorn(id, state);
  const perfect = entry.pieces.filter(itemId => isPerfectItem(itemId, state)).length;
  return [
    `<p class="wiki-lead">${entry.desc}</p>`,
    sectionMarkup('掉落区域', `<p class="wiki-note">${zoneRefMarkup(entry.zone)} · 每次击杀有 ${Math.round(entry.dropChance * 100)}% 概率掉落一件随机部件。</p>`),
    sectionMarkup('部件', `<div class="wiki-refs">${entry.pieces.map(itemId => itemRefMarkup(itemId)).join('')}</div>`),
    sectionMarkup('凑齐效果', `${statusLine(`已穿 ${worn} / ${total}`, worn >= total)}<p class="wiki-note">${setBonusText(entry.bonus)}</p>`),
    sectionMarkup('极致效果', `${statusLine(`已极致 ${perfect} / ${total}`, perfect >= total)}<p class="wiki-note">全部部件精炼到 +${REFINE_MAX} 后永久获得：${perfectBonusText(entry.perfectBonus)}</p>`)
  ].join('');
}

function enemiesBody(): string {
  const state = getState();
  const known = enemyTable.map((_, id) => id).filter(id => isEncountered(id, state));
  if (!known.length) return '<p class="wiki-lead">还没有遭遇过任何怪物。进入战斗区域后，遇到过的怪物会收录到这里。</p>';
  return `<p class="wiki-lead">已经遭遇过的怪物，点开可以看它的属性与掉落。</p>
    ${statusLine(`已收录 ${known.length} / ${enemyTable.length} 种`, known.length >= enemyTable.length)}
    <div class="wiki-grid">${known.map(id => entryCellMarkup('enemy', id)).join('')}</div>`;
}

function zonesBody(): string {
  const state = getState();
  const known = zones.map((_, id) => id).filter(id => isZoneUnlocked(id, state));
  return `<p class="wiki-lead">已经可以前往的区域，点开可以看那里会遇到的怪物。</p>
    ${statusLine(`已开放 ${known.length} / ${zones.length} 处`, known.length >= zones.length)}
    <div class="wiki-grid">${known.map(id => entryCellMarkup('zone', id)).join('')}</div>`;
}

function eventsBody(): string {
  /* 随机事件有解锁门槛（主线推进后才开始计时），没解锁就不列出来。 */
  const randomUnlocked = isCampEventTimerRunning(getState());
  const visible = campEventEntries.map((entry, id) => ({ entry, id })).filter(item => item.entry.kind !== CAMP_EVENT.random || randomUnlocked);
  return `<p class="wiki-lead">营地在荒野里会遇到的突发状况。天灾与兽潮各只来一次，随机事件会在主线推进后开始计时。</p>
    <div class="wiki-grid">${visible.map(item => entryCellMarkup('event', item.id)).join('')}</div>`;
}

/* ——— 条目页 ——— */

/** 这个物品能从哪些「已经遭遇过」的怪物身上掉出来。 */
function dropSourceIds(itemId: number): number[] {
  const state = getState();
  return enemyTable.map((enemy, enemyId) => ({ enemy, enemyId }))
    .filter(entry => isEncountered(entry.enemyId, state) && entry.enemy.dropTable.some(drop => drop.itemId === itemId))
    .map(entry => entry.enemyId);
}

function itemBody(id: number): string {
  const item = items[id];
  const facts = [factMarkup('类别', itemCategories[item.category].name), factMarkup('类型', item.type), factMarkup('稀有度', rarities[item.rarity].name)];
  if (item.equipType !== undefined) facts.push(factMarkup('装备位置', equipTypes[item.equipType].name));
  const equip = item.equip;
  if (equip) {
    if (equip.attack) facts.push(factMarkup('攻击力', `+${formatNumber(equip.attack)}`));
    if (equip.hp) facts.push(factMarkup('生命上限', `+${formatNumber(equip.hp)}`));
    if (equip.defense) facts.push(factMarkup('防御力', `+${formatNumber(equip.defense)}`));
  }

  const lines = [`<p class="wiki-lead">${item.description}</p>`, factsMarkup(facts)];
  if (item.grantsAffix !== undefined) {
    const definition = affixes[item.grantsAffix];
    lines.push(sectionMarkup('附加词条', `<p class="wiki-note">给一件装备刻上「${definition.name}」：首次 +${definition.base}${definition.unit}，重复使用再 +${definition.step}${definition.unit}，最高 +${affixCap(item.grantsAffix)}${definition.unit}。同名词条只会有一条。</p>`));
  } else if (item.useText) {
    lines.push(sectionMarkup('使用效果', `<p class="wiki-note">${item.useText}</p>`));
  }
  const sources = dropSourceIds(id);
  lines.push(sectionMarkup('掉落来源', `${statusLine(sources.length ? `已在 ${sources.length} 种怪物身上确认到` : '还没有在遭遇过的怪物身上确认到', sources.length > 0)}${sources.length ? refsMarkup(sources.map(enemyId => enemyRefMarkup(enemyId))) : ''}`));
  /* 套装部件只给一个链接：套装效果、部件清单、极致进度都写在套装页（见 setBody）。
     一页只讲一件事，装备页不必重复整套的信息。 */
  const setId = setOfItem(id);
  if (setId >= 0) lines.push(sectionMarkup('套装', `${refsMarkup([codexRefMarkup('set', setId)])}<p class="wiki-note">套装效果与【极致】进度写在套装页。</p>`));
  if (isPerfectItem(id)) lines.push(sectionMarkup('极致', `${statusLine(`已精炼到 +${REFINE_MAX}`, true)}<p class="wiki-note">这是一次性达成的记录，之后把它当素材喂掉也会保留。</p>`));
  return lines.join('');
}

function enemyBody(id: number): string {
  const enemy = enemyTable[id];
  const state = getState();
  const facts = [
    factMarkup('生命上限', formatNumber(enemy.maxHp)),
    factMarkup('攻击力', formatNumber(enemy.attack)),
    factMarkup('防御力', formatNumber(enemy.defense || 0)),
    factMarkup('攻击间隔', formatSeconds(enemy.attackInterval)),
    factMarkup('金币', formatNumber(enemy.gold))
  ];
  /* 掉落逐条揭示：只有玩家真的从这只怪物身上拿到过该物品，才显示名称、概率与数量区间。 */
  const drops = enemy.dropTable.map(drop => dropEntryMarkup(drop, isDropDiscovered(id, drop.itemId, state))).join('');
  const zoneId = zoneOfEnemy(id);
  return [
    `<p class="wiki-lead">${enemy.description}</p>`,
    factsMarkup(facts),
    /* 掉落列表样式：.codex-drops > ul。 */
    sectionMarkup('掉落', `<div class="codex-drops"><ul>${drops}</ul></div>`),
    sectionMarkup('出现区域', zoneId >= 0 ? refsMarkup([zoneRefMarkup(zoneId)]) : '<p class="wiki-note">暂未确认。</p>')
  ].join('');
}

function zoneBody(id: number): string {
  const zone = zones[id];
  const state = getState();
  const camp = !zone.enemyIds.length;
  const goal = zone.unlockIndex > 0 ? mainline[zone.unlockIndex - 1] : null;
  const known = zone.enemyIds.filter(enemyId => isEncountered(enemyId, state));
  return [
    `<p class="wiki-lead">${zone.description}</p>`,
    sectionMarkup('进入条件', `<p class="wiki-note">${goal ? `完成主线「${goal.title}」后开放。` : '开局即可前往。'}</p>`),
    sectionMarkup(camp ? '这里有什么' : '会遇到的怪物', camp
      ? '<p class="wiki-note">非战斗区域：不会遭遇敌人，生命恢复速度远高于野外，适合修整与等待后勤推进。</p>'
      : (known.length ? refsMarkup(known.map(enemyId => enemyRefMarkup(enemyId))) : '<p class="wiki-note">这里的怪物还没有遭遇过。</p>'))
  ].join('');
}

function eventBody(id: number): string {
  const entry = campEventEntries[id];
  const state = getState();
  const def = campEventDef(entry.kind, entry.index);
  const stats = getCampEventInfo(entry.kind, entry.index, state);
  const facts = [
    factMarkup('事件生命', formatNumber(stats.hp)),
    factMarkup('事件攻击', formatNumber(stats.attack)),
    factMarkup('事件防御', formatNumber(stats.defense)),
    factMarkup('出手间隔', formatSeconds(stats.interval))
  ];
  const round = entry.kind === CAMP_EVENT.disaster ? state.camp.disasterWins + 1 : entry.kind === CAMP_EVENT.tide ? state.camp.tideWins + 1 : 0;
  const growth = entry.kind === CAMP_EVENT.random
    ? '强度与奖励随主线进度和累计胜场一起增长。'
    : `当前是第 ${round} 次。每次成功抵御后，它的强度与奖励都会提高一档。`;
  return [
    `<p class="wiki-lead">${def.desc}</p>`,
    factsMarkup(facts),
    sectionMarkup('击退奖励', `<p class="wiki-note">金币 ${formatNumber(stats.rewards.gold)} · 废料 ${formatNumber(stats.rewards.scrap)} · 精华 ${formatNumber(stats.rewards.essence)}</p>`),
    sectionMarkup('成长', `<p class="wiki-note">${growth}</p>`),
    sectionMarkup('应对建议', `<p class="wiki-note">${def.advice}</p>`)
  ].join('');
}

/* ——— 渲染 ——— */

const BODIES: Record<string, (id: number) => string> = {
  home: homeBody, items: itemsBody, enemies: enemiesBody, zones: zonesBody, events: eventsBody,
  'items-equipment': () => itemCategoryBody('equipment'),
  'items-resource': () => itemCategoryBody('resource'),
  'items-consumable': () => itemCategoryBody('consumable'),
  'items-sets': setsBody,
  item: itemBody, enemy: enemyBody, zone: zoneBody, event: eventBody, set: setBody
};

function ensureLayer(): HTMLElement {
  if (layer?.isConnected) return layer;
  const element = document.createElement('div');
  element.className = 'wiki-layer';
  element.hidden = true;
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');
  element.setAttribute('aria-label', '图鉴');
  element.innerHTML = `<article class="wiki"><div class="wiki-head"><span class="wiki-icon" data-wiki-icon aria-hidden="true"></span><div class="wiki-title"><span class="panel-kicker" data-wiki-kicker></span><h3 data-wiki-name></h3></div><button class="wiki-close" type="button" data-wiki-close aria-label="关闭">×</button></div><div class="wiki-body" data-wiki-body></div></article>`;
  element.addEventListener('click', event => {
    const target = event.target as Element;
    /* 点关闭按钮、或点在遮罩本身上（不是它的子节点）都关窗。 */
    if (target.closest('[data-wiki-close]') || target.classList.contains('wiki-layer')) closeWiki();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeWiki(); });
  document.body.appendChild(element);
  layer = element;
  return element;
}

function render(): void {
  const element = ensureLayer();
  const icon = element.querySelector<HTMLElement>('[data-wiki-icon]')!;
  const kicker = element.querySelector<HTMLElement>('[data-wiki-kicker]')!;
  const name = element.querySelector<HTMLElement>('[data-wiki-name]')!;
  const body = element.querySelector<HTMLElement>('[data-wiki-body]')!;

  const isList = !!LIST_TITLES[current.page];
  const isHome = current.page === 'home';
  const entry = isList || isHome ? null : codexEntry(current.page, current.id);
  if (!isList && !isHome && !entry) { closeWiki(); return; }

  /* 类型类挂在标题栏上：只给图标与标题取色。
     挂在窗口上的话会顺着继承把列表格子的稀有度色压掉（--codex-color 优先于 --rarity-color）。 */
  element.querySelector<HTMLElement>('.wiki-head')!.className = `wiki-head ${isHome ? 'codex-home' : isList ? `codex-${current.page}` : entry!.colorClass}`;
  icon.textContent = isHome ? '📖' : isList ? LIST_ICONS[current.page] : entry!.icon;
  kicker.textContent = isHome ? 'CODEX' : isList ? 'CODEX / INDEX' : entry!.kicker;
  name.textContent = isHome ? '图鉴' : isList ? LIST_TITLES[current.page] : entry!.name;

  /* 路径里的当前页名：条目页用条目名，列表页用列表名，主页不带路径。 */
  const pathName = isList ? LIST_TITLES[current.page] : entry ? entry.name : '';
  body.innerHTML = pathMarkup(current.page, pathName) + BODIES[current.page](current.id);
}

/** 打开某个条目页（kind: item / enemy / zone / event）。 */
export function openWiki(kind: string, id: number): void {
  if (!codexEntry(kind, id)) return;
  current = { page: kind, id };
  render();
  if (layer) layer.hidden = false;
}

/** 打开某个列表页（items / enemies / zones / events）或首页。 */
export function openWikiPage(page: string): void {
  if (page !== 'home' && !LIST_TITLES[page]) return;
  current = { page, id: -1 };
  render();
  if (layer) layer.hidden = false;
}

export function closeWiki(): void {
  if (layer && !layer.hidden) layer.hidden = true;
}

/** 应用启动时调用一次：全局委托图鉴引用与页面引用的点击。
    用捕获阶段并掐断冒泡 —— 页面自己的 root.onclick 不该因为「点了个名字」而被触发。 */
export function startCodexWiki(): void {
  /* 重置存档之类把 wiki 重新锁上时，正开着的弹窗要自己收起来。 */
  onWikiUnlockChange(unlocked => { if (!unlocked) closeWiki(); });
  document.addEventListener('click', event => {
    const ref = (event.target as Element | null)?.closest?.<HTMLElement>('[data-codex]');
    if (!ref) return;
    event.preventDefault();
    event.stopPropagation();
    const [kind, id] = (ref.dataset.codex || '').split(':');
    if (kind === 'page') openWikiPage(id);
    else openWiki(kind, Number(id));
  }, true);
}
