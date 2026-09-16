import { items, equipTypes } from './config/items';
import { affixes, affixCap } from './config/affixes';
import { enemyTable, zones, zoneOfEnemy, questItemOf, QUEST_DROP_CHANCE, SOLVENT_DROP_CHANCE } from './config/zones';
import { campEventDef, campEventEntries } from './config/events';
import { codexEntry, onWikiUnlockChange } from './codex-ref';
import { getState, isEncountered, isDropDiscovered, isItemDiscovered, isZoneUnlocked, isCampEventTimerRunning, getCampEventInfo, formatNumber, formatSeconds, mainline, setTable, setOfItem, setOfZone, getSetWorn, isPerfectItem, setBonusEntries, perfectBonusEntries } from './game-state';
import type { ItemCategory } from './types';

/* ——— 内置 wiki：图鉴弹窗 ———
   页面上任何图鉴引用（见 codex-ref.ts）点击后都会打开它。两类页面：

   - 列表页：home（首页）/ items / enemies / zones / events
   - 条目页：item / enemy / zone / event（带下标）

   层级是固定的（条目页的父级就是它所属的列表页），所以路径直接按 page 推导，
   不需要历史栈 —— 点路径上任意一级就是「回退到那一页」。主页自身不显示路径。

   wiki 内部一律用「格子」（wiki-cell）呈现条目，不用 codex-ref 那种行内引用 ——
   行内引用是给页面正文用的（主线条件、日志），在弹窗里一行行排开反而不如格子好扫。
   未见到 / 未解锁的条目占位而不是藏掉，列表长度因此固定（见 UI开发规范 §6.11）。

   和 hover-tip 一样挂在 body 上：wiki 层是 fixed 定位，而 #page-content 有 contain: layout，
   挂在页面里会被当成相对它定位（见 UI开发规范 §10-01）。 */

/** 列表页的标题与图标；键同时也是页面 id。
    items 下面还有一层分类页（items-equipment 等），层级靠 pathMarkup 拼出来。 */
const LIST_TITLES: Record<string, string> = {
  items: '物品', 'items-equipment': '装备', 'items-sets': '套装', 'items-resource': '资源', 'items-consumable': '消耗品', 'items-quest': '任务物品',
  enemies: '怪物', zones: '区域', events: '随机事件'
};
const LIST_ICONS: Record<string, string> = {
  items: '📦', 'items-equipment': '⚔️', 'items-sets': '🧩', 'items-resource': '◆', 'items-consumable': '⚗️', 'items-quest': '📋',
  enemies: '👾', zones: '🗺️', events: '⚡'
};
/** 物品页下的分类页：物品类别 → 页面 id。套装单独一页（它的条目是「套」而不是「件」）。 */
const ITEM_PAGE: Record<string, string> = { equipment: 'items-equipment', resource: 'items-resource', consumable: 'items-consumable', quest: 'items-quest' };
/** 物品页下的分类页（含套装页），顺序即展示顺序。 */
const ITEM_PAGES = ['items-equipment', 'items-sets', 'items-resource', 'items-consumable', 'items-quest'];
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
/** 数值网格里的一格。 */
function factMarkup(label: string, value: string): string {
  return `<div><span>${label}</span><b>${value}</b></div>`;
}
/** 条目格子：图标 / 名称 / 颜色类统一从 codexEntry 取，各处不要再自己拼。 */
function entryCellMarkup(kind: string, id: number, note = ''): string {
  const entry = codexEntry(kind, id)!;
  return cellMarkup(`${kind}:${id}`, entry.icon, entry.name, entry.colorClass, note);
}
/** 还没发现 / 还没确认的条目占位：和真格子同一套骨架，占住位置但不带 data-codex（点不开）。
    用 <span> 而不是 disabled 的 <button> —— 它本来就不是能操作的东西，
    别让 Tab 键在格子里停一堆按不动的按钮。 */
function lockedCellMarkup(): string {
  return '<span class="wiki-cell wiki-cell-locked"><span class="wiki-cell-icon" aria-hidden="true">❓</span><span class="wiki-cell-name">待发现</span></span>';
}
/** 数值网格（.codex-stats：标签在左、数值在右的自适应格）。 */
function factsMarkup(facts: string[]): string { return facts.length ? `<div class="codex-stats">${facts.join('')}</div>` : ''; }
/** 属性增益的数值网格：装备的属性描述、套装页的凑齐 / 极致效果共用一套 ——
    「标签 + 数值」的条目来自 game-state 的 setBonusEntries / perfectBonusEntries。 */
function bonusFactsMarkup(entries: { label: string; value: string }[]): string {
  return factsMarkup(entries.map(entry => factMarkup(entry.label, entry.value)));
}
/** 「是否达成」统一用主线条件那一套样式：前面一个 status-dot，达成就点亮。 */
function statusLine(text: string, done: boolean): string {
  return `<div class="requirement ${done ? 'done' : ''}"><span class="status-dot ${done ? '' : 'pending'}"></span><span>${text}</span></div>`;
}
/** 一个小节：标题 + 内容。 */
function sectionMarkup(title: string, body: string): string { return `<section class="wiki-section"><h4 class="wiki-section-title">${title}</h4>${body}</section>`; }
/** 一排格子。列表页与条目页的小节统一走它，不要再各自拼 `wiki-grid`。
    extraClass 目前只有 'is-stacked'（单列，每条占满一整行，见怪物页的掉落表）。 */
function cellGridMarkup(cells: string[], extraClass = ''): string { return `<div class="wiki-grid${extraClass ? ` ${extraClass}` : ''}">${cells.join('')}</div>`; }
/** 掉落表的一格：物品格 + 角注写概率与数量区间。没拿到过的不剧透，只给占位格。 */
function dropCellMarkup(drop: { itemId: number; chance: number; min: number; max: number }, discovered: boolean): string {
  return discovered ? entryCellMarkup('item', drop.itemId, `${Math.round(drop.chance * 100)}% · ${drop.min}~${drop.max} 个`) : lockedCellMarkup();
}

/** 区域掉落：不在任何怪物的 dropTable 里，而是这一区**所有**怪物统一走的通道
    （套装部件见 grantSetDrop，任务物品见 grantQuestDrop）。
    这里一律揭示，不走「逐条揭示」—— 它们是区域级情报（套装页与物品页本来就写着），
    而且这两条通道都不记 discoveredDrops，做逐条揭示只会永远显示成占位格。
    没有区域掉落时返回空数组，调用处据此整段不渲染。 */
function zoneDropCells(zoneId: number): string[] {
  const cells: string[] = [];
  const setId = setOfZone(zoneId);
  if (setId >= 0) {
    const entry = setTable[setId];
    cells.push(entryCellMarkup('set', setId, `${Math.round(entry.dropChance * 100)}% · ${entry.pieces.length} 件随机`));
  }
  const questItem = questItemOf(zoneId);
  if (questItem >= 0) cells.push(entryCellMarkup('item', questItem, `${Math.round(QUEST_DROP_CHANCE * 100)}% · 需委托`));
  return cells;
}

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
  return cellGridMarkup(Object.keys(LIST_TITLES).map(page => cellMarkup(`page:${page}`, LIST_ICONS[page], LIST_TITLES[page], 'codex-page')));
}

function itemsBody(): string {
  return cellGridMarkup(ITEM_PAGES.map(page => cellMarkup(`page:${page}`, LIST_ICONS[page], LIST_TITLES[page], 'codex-page')));
}

/** 某个物品类别下的所有物品。格子的数量是固定的 —— 没发现过的也在，只是显示成占位，
    这样玩家能看出「这一类还有几样没见过」，而不是被静默地藏掉。 */
function itemCategoryBody(category: ItemCategory): string {
  const state = getState();
  const ids = items.map((item, id) => (item.category === category ? id : -1)).filter(id => id >= 0);
  if (!ids.length) return '<p class="wiki-note">这一类还没有收录任何东西。</p>';
  return cellGridMarkup(ids.map(id => (isItemDiscovered(id, state) ? entryCellMarkup('item', id) : lockedCellMarkup())));
}

/** 套装列表：每套一张卡，角注是「已穿上的部件数 / 总部件数」—— 收集进度逐套看就够了，
    不再单独汇总一行「已凑齐 N / M 套」。
    没拿到过任何一件部件的套装显示成占位（判定口径同物品页：有一件算见过）。 */
function setsBody(): string {
  const state = getState();
  return cellGridMarkup(setTable.map((entry, id) => (entry.pieces.some(itemId => isItemDiscovered(itemId, state))
    ? entryCellMarkup('set', id, `${getSetWorn(id, state)} / ${entry.pieces.length}`)
    : lockedCellMarkup())));
}

/** 套装条目页：部件清单、凑齐效果、极致效果。装备条目页只链接到这里，不再重复这些内容。 */
function setBody(id: number): string {
  const entry = setTable[id];
  const state = getState();
  const total = entry.pieces.length;
  const perfect = entry.pieces.filter(itemId => isPerfectItem(itemId, state)).length;
  /* 两个小节的属性增益都走 .codex-stats 数值网格，和装备条目页的属性描述同一套样式 ——
     属性增益就该长得像属性表，而不是主线那种打勾的条件行。
     凑齐效果的进度（已穿 N / M）不在这里重复：套装列表的角注就是它。
     极致效果的进度没有别处可看，所以附在收益下面一条（间距见 .codex-stats + .requirement）。 */
  return [
    `<p class="wiki-desc">${entry.desc}</p>`,
    sectionMarkup('掉落区域', `${cellGridMarkup([entryCellMarkup('zone', entry.zone)])}<p class="wiki-note">每次击杀有 ${Math.round(entry.dropChance * 100)}% 概率掉落一件随机部件。</p>`),
    sectionMarkup('部件', cellGridMarkup(entry.pieces.map(itemId => (isItemDiscovered(itemId, state) ? entryCellMarkup('item', itemId) : lockedCellMarkup())))),
    sectionMarkup('凑齐效果', bonusFactsMarkup(setBonusEntries(entry.bonus))),
    sectionMarkup('极致效果', `${bonusFactsMarkup(perfectBonusEntries(entry.perfectBonus))}${statusLine(`当前进度：${perfect} / ${total}`, perfect >= total)}`)
  ].join('');
}

/** 怪物列表：格子的数量固定 —— 没遭遇过的也在，只是显示成占位。
    和物品分类页一个口径：藏掉会让人以为「这游戏就这几只怪」，占位反而说明还有没见过的。 */
function enemiesBody(): string {
  const state = getState();
  return cellGridMarkup(enemyTable.map((_, id) => (isEncountered(id, state) ? entryCellMarkup('enemy', id) : lockedCellMarkup())));
}

/** 区域列表：同上，还没开放的区域也占位。 */
function zonesBody(): string {
  const state = getState();
  return cellGridMarkup(zones.map((_, id) => (isZoneUnlocked(id, state) ? entryCellMarkup('zone', id) : lockedCellMarkup())));
}

/** 随机事件列表。这一页**只有随机事件** —— 大事件不做内容差异化、只差属性，没有图鉴条目。
    没解锁之前整页是空的，所以给一句说明而不是留一个空格子。 */
function eventsBody(): string {
  if (!isCampEventTimerRunning(getState())) return '<p class="wiki-note">随机事件会在完成主线「抵御第一场天灾」之后开始出现。</p>';
  return cellGridMarkup(campEventEntries.map((_, id) => entryCellMarkup('event', id)));
}

/* ——— 条目页 ——— */

/** 这个物品的掉落来源，一格一只怪（wiki-cell 风格，和列表页统一）。
    边界是「已经遭遇过」的怪物 —— 没见过的怪不参与，不剧透还有几处来源。
    已经真的从它身上掉出来过的给可点的怪物格子，遭遇过但还没掉过的给占位格，
    和怪物页的掉落表用同一套揭示规则（见 dropCellMarkup）。一条都没确认到时也留一个占位格，
    而不是把整段藏起来 —— 空着会让人以为这物品没有来源。 */
function dropSourceMarkup(itemId: number): string {
  const state = getState();
  const sources = enemyTable.map((enemy, enemyId) => ({ enemy, enemyId }))
    .filter(entry => isEncountered(entry.enemyId, state) && entry.enemy.dropTable.some(drop => drop.itemId === itemId));
  if (!sources.length) return cellGridMarkup([lockedCellMarkup()]);
  return cellGridMarkup(sources.map(entry => (isDropDiscovered(entry.enemyId, itemId, state) ? entryCellMarkup('enemy', entry.enemyId) : lockedCellMarkup())));
}

/** 任务物品的获取说明。它不在任何怪物的 dropTable 里 —— 委托指向这个区域时，由这里的
    **所有**怪物统一掉落，所以这里给的是「去哪个区域刷」，而不是一份来源清单。 */
function questSourceMarkup(itemId: number): string {
  const zoneId = zones.findIndex(zone => zone.questItem === itemId);
  if (zoneId < 0) return '<p class="wiki-note">暂时没有已知的获取途径。</p>';
  return `${cellGridMarkup([entryCellMarkup('zone', zoneId)])}<p class="wiki-note">研究基地的委托指向这个区域时，在这里狩猎的每一只怪物都有 ${Math.round(QUEST_DROP_CHANCE * 100)}% 概率掉落；委托指向别处时不会掉。攒够了也照掉，多出来的留在包里。</p>`;
}

/** 清洗剂的获取说明。它也不在任何怪物的 dropTable 里 —— 任何怪物都有极低概率掉一瓶，三选一。
    所以这里给的是「掉率多少、和什么无关」，而不是一份来源清单。 */
function solventSourceMarkup(): string {
  return `<p class="wiki-note">任何怪物都有 ${(SOLVENT_DROP_CHANCE * 100).toFixed(1)}% 的概率掉落一瓶清洗剂，三种随机出一种。掉率与区域、怪物种类都无关。</p>`;
}

/** 套装部件的获取说明。它**不在任何怪物的 dropTable 里** —— 走的是套装掉落通道
    （见 game-state 的 grantSetDrop）：按怪物所在区域判定，随机给一个部位。
    所以这里给的是「去哪个区域刷、多大几率掉一件」，而不是一份来源清单 ——
    照「掉落来源」那套写只会得到一片占位（拾荒者套装曾经就是这么显示成「待发现」的）。 */
function setSourceMarkup(setId: number): string {
  const entry = setTable[setId];
  if (!entry) return '<p class="wiki-note">暂时没有已知的获取途径。</p>';
  return `${cellGridMarkup([entryCellMarkup('zone', entry.zone)])}<p class="wiki-note">在${zones[entry.zone].name}狩猎时，每次击杀有 ${Math.round(entry.dropChance * 100)}% 概率掉落一件随机部件（${entry.pieces.length} 个部位等概率）。这一区的所有怪物都一样。</p>`;
}

function itemBody(id: number): string {
  const item = items[id];
  const facts = [factMarkup('类型', item.type)];
  if (item.equipType !== undefined) facts.push(factMarkup('装备位置', equipTypes[item.equipType].name));
  const equip = item.equip;
  if (equip) {
    if (equip.attack) facts.push(factMarkup('攻击力', `+${formatNumber(equip.attack)}`));
    if (equip.hp) facts.push(factMarkup('生命上限', `+${formatNumber(equip.hp)}`));
    if (equip.defense) facts.push(factMarkup('防御力', `+${formatNumber(equip.defense)}`));
  }

  const lines = [`<p class="wiki-desc">${item.description}</p>`, factsMarkup(facts)];
  if (item.grantsAffix !== undefined) {
    const definition = affixes[item.grantsAffix];
    lines.push(sectionMarkup('附加词条', `<p class="wiki-note">给一件装备刻上「${definition.name}」—— ${definition.desc}。首次 +${definition.base}${definition.unit}，重复使用再 +${definition.step}${definition.unit}，最高 +${affixCap(item.grantsAffix)}${definition.unit}。同名词条只会有一条。</p>`));
  } else if (item.useText) {
    lines.push(sectionMarkup('使用效果', `<p class="wiki-note">${item.useText}</p>`));
  }
  const setId = setOfItem(id);
  /* 任务物品、清洗剂、套装部件都不在 dropTable 里，用「掉落来源」那套只会得到一片占位，各走自己的说明。 */
  if (item.category === 'quest') lines.push(sectionMarkup('获取方式', questSourceMarkup(id)));
  else if (item.type === '清洗') lines.push(sectionMarkup('获取方式', solventSourceMarkup()));
  else if (setId >= 0) lines.push(sectionMarkup('获取方式', setSourceMarkup(setId)));
  else lines.push(sectionMarkup('掉落来源', dropSourceMarkup(id)));
  /* 套装部件只给一个链接：套装效果、部件清单、极致进度都写在套装页（见 setBody）。
     一页只讲一件事，装备页不必重复整套的信息。 */
  if (setId >= 0) lines.push(sectionMarkup('套装', cellGridMarkup([entryCellMarkup('set', setId)])));
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
  /* 掉落分三段，对应三条互不影响的通道：
     专属 —— 这只怪物自己的 dropTable，逐条揭示（真的从它身上拿到过才显示名称与概率）；
     区域 —— 这一区所有怪物共有的（套装部件 + 任务物品），一律揭示；
     通用 —— 清洗剂，任何怪物都可能掉，与区域和种类都无关。 */
  const drops = enemy.dropTable.map(drop => dropCellMarkup(drop, isDropDiscovered(id, drop.itemId, state)));
  const zoneId = zoneOfEnemy(id);
  const zoneDrops = zoneId >= 0 ? zoneDropCells(zoneId) : [];
  return [
    `<p class="wiki-desc">${enemy.description}</p>`,
    factsMarkup(facts),
    sectionMarkup('专属掉落', cellGridMarkup(drops, 'is-stacked')),
    zoneDrops.length ? sectionMarkup('区域掉落', `${cellGridMarkup(zoneDrops, 'is-stacked')}<p class="wiki-note">${zones[zoneId].name}的所有怪物共用这几项，和各自的掉落表互不影响。任务物品只在研究基地的委托指向这一区时才会掉。</p>`) : '',
    sectionMarkup('通用掉落', `<p class="wiki-note">任何怪物都有 ${(SOLVENT_DROP_CHANCE * 100).toFixed(1)}% 的概率掉一瓶清洗剂，三种随机出一种 —— 与区域、怪物种类都无关。</p>`),
    sectionMarkup('出现区域', zoneId >= 0 ? cellGridMarkup([entryCellMarkup('zone', zoneId)]) : '<p class="wiki-note">暂未确认。</p>')
  ].join('');
}

function zoneBody(id: number): string {
  const zone = zones[id];
  const state = getState();
  const camp = !zone.enemyIds.length;
  const goal = zone.unlockIndex > 0 ? mainline[zone.unlockIndex - 1] : null;
  return [
    `<p class="wiki-desc">${zone.description}</p>`,
    sectionMarkup('进入条件', `<p class="wiki-note">${goal ? `完成主线「${goal.title}」后开放。` : '开局即可前往。'}</p>`),
    sectionMarkup(camp ? '这里有什么' : '会遇到的怪物', camp
      ? '<p class="wiki-note">非战斗区域：不会遭遇敌人，生命恢复速度远高于野外，适合修整与等待后勤推进。</p>'
      : cellGridMarkup(zone.enemyIds.map(enemyId => (isEncountered(enemyId, state) ? entryCellMarkup('enemy', enemyId) : lockedCellMarkup()))))
  ].join('');
}

/** 一场事件的数值 + 击退奖励：四项属性走数值网格，奖励写成网格下面的一行注。
    大事件页与随机事件页共用它。 */
function eventStatsMarkup(stats: ReturnType<typeof getCampEventInfo>): string {
  const { gold, scrap, essence, survivors } = stats.rewards;
  return `${factsMarkup([
    factMarkup('事件生命', formatNumber(stats.hp)),
    factMarkup('事件攻击', formatNumber(stats.attack)),
    factMarkup('事件防御', formatNumber(stats.defense)),
    factMarkup('出手间隔', formatSeconds(stats.interval))
  ])}<p class="wiki-note">击退奖励：金币 ${formatNumber(gold)} · 废料 ${formatNumber(scrap)} · 精华 ${formatNumber(essence)}${survivors ? ` · 幸存者 ${formatNumber(survivors)}` : ''}</p>`;
}
/** 事件条目页。这一页**只有随机事件**：大事件没有条目（见 config/events.ts）。 */
function eventBody(id: number): string {
  const entry = campEventEntries[id];
  const def = campEventDef(entry.kind, entry.index);
  return [
    `<p class="wiki-desc">${def.desc}</p>`,
    eventStatsMarkup(getCampEventInfo(entry.kind, entry.index, getState())),
    sectionMarkup('成长', '<p class="wiki-note">强度与奖励随主线进度和累计胜场一起增长。</p>'),
    sectionMarkup('应对建议', `<p class="wiki-note">${def.advice || ''}</p>`)
  ].join('');
}

/* ——— 渲染 ——— */

const BODIES: Record<string, (id: number) => string> = {
  home: homeBody, items: itemsBody, enemies: enemiesBody, zones: zonesBody, events: eventsBody,
  'items-equipment': () => itemCategoryBody('equipment'),
  'items-resource': () => itemCategoryBody('resource'),
  'items-consumable': () => itemCategoryBody('consumable'),
  'items-quest': () => itemCategoryBody('quest'),
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
  /* 【极致】徽章常驻在 DOM 里、靠 hidden 开关：物品名旁边多一个节点，比每次重建标题栏便宜。
     用 hidden 属性而不是删节点，是因为 render() 会反复跑（点路径来回切页）。 */
  element.innerHTML = `<article class="wiki"><div class="wiki-head"><span class="wiki-icon" data-wiki-icon aria-hidden="true"></span><div class="wiki-title"><span class="panel-kicker" data-wiki-kicker></span><div class="wiki-name-row"><h3 data-wiki-name></h3><span class="wiki-perfect" data-wiki-perfect hidden>极致</span></div></div><button class="wiki-close" type="button" data-wiki-close aria-label="关闭">×</button></div><div class="wiki-body" data-wiki-body></div></article>`;
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
  const perfect = element.querySelector<HTMLElement>('[data-wiki-perfect]')!;

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
  /* 【极致】只在物品条目页出现，且只给已经精炼到顶的那一件。 */
  perfect.hidden = !(current.page === 'item' && isPerfectItem(current.id));

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
