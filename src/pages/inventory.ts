import { items, affixes, affixMarkup, affixCap, itemCategories, categoryOrder, equipTypes, getEquipSlotCounts, formatNumber, getInventoryCapacity, getInventoryUsed, getInstanceItemId, getEquipmentInstance, getInstanceBonus, equipBonusStats, getEquipBonusSources, isEquipped, getState, discardItem, discardEquipment, useItem, equipItem, equipToSlot, sets, setTable, setOfItem, getSetWorn, getRefine, canRefineWith, refineWithFeeder, REFINE_MAX, isPerfectItem, getPerfectBonus, perfectBonusText, isWikiUnlocked } from '../game-state';
import { rarityClass } from '../config/rarity';
import { affixCategoryClass } from '../config/affixes';
/* 右键菜单的「查看图鉴」直接用 wiki 的公开入口 —— 和点行内引用走的是同一个弹窗。
   wiki.ts 不反向引用页面，所以这里没有循环依赖。 */
import { openWiki } from '../wiki';
import { setText, setHtml, setWidth, setClass, setHidden, pick } from '../dom';
import pageController from '../page-controller';
import type { EquipmentInstance, GameState, ItemCategory, PageDefinition, SetBonus, UseOutcome } from '../types';
/* 右键菜单的目标：可堆叠物品记 itemId，装备记实例 id（menuInstanceId 为 -1 表示不是装备）。 */
let menuEl: HTMLDivElement | null = null; let menuItemId = -1; let menuInstanceId = -1; let draggingInstanceId = -1;
/* 正在拖的「需要点选装备的道具」（强化 / 清洗）。和 draggingInstanceId 互斥：
   装备拖出去是换装或精炼，道具拖出去是对目标使用。 */
let draggingConsumableId = -1;
type ItemAction = { id: string; label: (instanceId: number) => string; danger?: boolean };
/* 精炼不在这里：它是「把一件装备拖到另一件同名装备上」，见 view 的 drop 处理。 */
const CATEGORY_ACTIONS: Record<string, ItemAction[]> = {
  equipment: [{ id: 'equip', label: instanceId => isEquipped(instanceId) ? '卸下' : '装备' }],
  consumable: [{ id: 'use', label: () => '使用' }]
};
const BASE_ACTIONS: ItemAction[] = [{ id: 'discard', label: () => '丢弃', danger: true }];
/** 「查看图鉴」排在最前：它是只读入口，和后面的操作（装备 / 使用 / 丢弃）不是一类。
    图鉴没解锁时整项不出现（R29：未解锁的内容不渲染）。 */
const WIKI_ACTION: ItemAction = { id: 'wiki', label: () => '查看图鉴' };
/** 系统物品（`item.system`，钥匙一类）不给「丢弃」—— 目前没有物品用到这个标记。
    （game-state 的 discardItem 与 trimInventoryOverflow 也各挡了一道。） */
function actionsFor(item: any) { return [...(isWikiUnlocked(getState()) ? [WIKI_ACTION] : []), ...(CATEGORY_ACTIONS[item.category] || []), ...(item.system ? [] : BASE_ACTIONS)]; }
/* 装备卡片显示装备自身的属性 + 它带的词条（词条名按品阶着色，数值后面用灰字跟上上限）；
   强化道具显示附加的词条与首次 / 重复强化效果；其他消耗品显示使用效果。 */
function statLine(itemId: number, instance?: EquipmentInstance | null): string { const item = items[itemId]; const lines = []; if (item.equip) { /* 属性走实例：精炼会把它按等级放大，不能直接读配置里的基础值。 */ const bonus = instance ? getInstanceBonus(instance) : { attack: item.equip.attack || 0, hp: item.equip.hp || 0, defense: item.equip.defense || 0 }; const parts = []; if (bonus.attack) parts.push(`攻击 +${bonus.attack}`); if (bonus.hp) parts.push(`生命 +${bonus.hp}`); if (bonus.defense) parts.push(`防御 +${bonus.defense}`); if (parts.length) lines.push(`<span class="item-stats">${parts.join(' · ')}</span>`); } for (const affix of instance?.affixes || []) { const definition = affixes[affix.id]; lines.push(`<span class="item-stats">${affixNameMarkup(affix.id)}：${affixMarkup(affix)}</span>`); } if (item.grantsAffix !== undefined) { const definition = affixes[item.grantsAffix]; const unit = definition.unit; lines.push(`<span class="item-stats">附加词条：${affixNameMarkup(item.grantsAffix)} - ${definition.desc}</span>`); lines.push(`<span class="item-stats">首次 <b class="affix-value">+${definition.base}${unit}</b></span>`); lines.push(`<span class="item-stats">重复 <b class="affix-value">+${definition.step}${unit}</b></span>`); lines.push(`<span class="item-stats">最高 <b class="affix-value">+${affixCap(item.grantsAffix)}${unit}</b></span>`); } else if (item.useText) lines.push(`<span class="item-stats">${item.useText}</span>`); /* 套装部件要写清归属与进度：玩家得知道它属于哪套、还差几件。 */
const setId = setOfItem(itemId);
if (setId >= 0) { const entry = setTable[setId]; const worn = getSetWorn(setId); lines.push(`<span class="item-stats">${entry.icon} ${entry.name}套装 · 已穿 ${worn}/${entry.pieces.length}</span>`); } return lines.join(''); }
/** 悬停详情的内容：名称（按稀有度着色 + 精炼等级）、类型、描述、属性与词条。
    物品卡片的浮层与装备槽的浮层共用这一段 —— 两处显示的信息必须一致。
    **只用 phrasing 元素**（span / b）：装备槽是 <button>，块级元素放进去是非法 HTML。
    equipped 只决定类型行要不要写「· 已装备」—— 装备槽里本来就是已装备，调用处传 false。 */
function detailMarkup(itemId: number, instance: EquipmentInstance | null, equipped: boolean): string {
  const item = items[itemId];
  return `<b class="item-detail-name ${rarityClass(item.rarity)}">${item.name}${instance ? refineMarkup(getRefine(instance)) : ''}</b><span class="item-type">${item.type}${equipped ? ' · 已装备' : ''}</span><span class="item-desc">${item.description}</span>${statLine(itemId, instance)}`;
}
/** 精炼等级：跟在装备名右边。满级标【极致】。 */
function refineMarkup(refine: number): string { return refine >= REFINE_MAX ? `<span class="refine-tag perfect">+${refine} 极致</span>` : `<span class="refine-tag">+${refine}</span>`; }
/** 词条名，颜色跟随类别（进攻红 / 生存绿 / 功能蓝）。 */
function affixNameMarkup(affixId: number): string { const definition = affixes[affixId]; return `<span class="item-affix-name ${affixCategoryClass(definition.category)}">${definition.name}</span>`; }
/* 卡片上不画类别：物品储藏已经按类别分了区，卡面只留 icon、名字和数量。
   可堆叠物品（资源、消耗品）只有一张卡片，数量写在名字下方；装备与图纸一件一张卡片、不写数量。
   instanceId 是装备实例 id（可堆叠物品为 -1），「已装备」标记落在具体那一个实例上——
   所以持有两把相同短刃时，装上哪一把就只有哪一张卡片带标记。 */
/* 卡面只剩图标与数量：名称、稀有度、属性、词条全部放进悬停浮层。
   已装备的装备不再写「已装备」文字，只靠 .equipped 的边框高亮区分。 */
function cardMarkup(itemId: number, quantity: number, instance: EquipmentInstance | null): string { const item = items[itemId]; const equipped = !!instance && isEquipped(instance.id); /* 装备拖出去是换装 / 精炼；需要点选装备的道具拖出去是对目标使用。 */ const draggable = item.category === 'equipment' || item.targetsEquipment ? ' draggable="true"' : ''; const refine = getRefine(instance || undefined); return `<article class="item-card ${rarityClass(item.rarity)} ${equipped ? 'equipped' : ''}" data-item="${itemId}" data-instance="${instance ? instance.id : -1}"${draggable} tabindex="0"><div class="item-icon">${item.icon}${instance && refine ? `<span class="item-refine${refine >= REFINE_MAX ? ' perfect' : ''}">+${refine}</span>` : ''}</div>${item.stackable ? `<strong class="item-quantity">×${formatNumber(quantity)}</strong>` : ''}<div class="item-detail">${detailMarkup(itemId, instance, equipped)}</div></article>`; }
/* 卡片来源：inventory 按数量出卡片 —— 可堆叠的一格写「×数量」，按件显示的（图纸）一件一张；
   equipment 是装备实例（一件一张卡片）。装备先按物品 id 排一下，同名装备的卡片才会挨在一起。 */
/* 「全部」页签：它不是物品类别，只在物品储藏内部用，所以不并进 ItemCategory。 */
const ALL_TAB = 'all';
/** 页签顺序：全部排最前，后面跟各分类（顺序由 categoryOrder 决定）。 */
const STORAGE_TABS: string[] = [ALL_TAB, ...categoryOrder];
/** 这张卡片属于当前页签吗？「全部」不过滤。 */
const inTab = (category: ItemCategory, tab: string): boolean => tab === ALL_TAB || category === tab;
/** 页签标题：「全部」单独给名字，其余取分类名。 */
const tabLabel = (tab: string): string => tab === ALL_TAB ? '全部' : itemCategories[tab as ItemCategory].name;
function cardsOf(state: GameState, tab: string): string[] { const cards: string[] = []; state.inventory.forEach((quantity, itemId) => { if (quantity <= 0 || !inTab(items[itemId].category, tab)) return; /* 按件显示的（图纸）一件一张卡片：数量就是卡片数，卡片上不写 ×N。 */ if (!items[itemId].stackable) { for (let index = 0; index < quantity; index++) cards.push(cardMarkup(itemId, 1, null)); return; } cards.push(cardMarkup(itemId, quantity, null)); }); [...state.equipment].sort((a, b) => a.itemId - b.itemId).forEach(instance => { if (inTab(items[instance.itemId].category, tab)) cards.push(cardMarkup(instance.itemId, 1, instance)); }); return cards; }
/* 物品储藏：页签（全部 / 资源 / 装备 / 消耗品）+ 当前页签的图标网格。 */
function storageMarkup(state: GameState, tab: string): string { const buckets = STORAGE_TABS.map(id => cardsOf(state, id)); const tabs = STORAGE_TABS.map((id, index) => `<button class="tab ${id === tab ? 'active' : ''}" type="button" role="tab" data-storage-tab="${id}">${tabLabel(id)}<span class="tab-count">${buckets[index].length}</span></button>`).join(''); const cards = buckets[STORAGE_TABS.indexOf(tab)] || []; const body = cards.length ? `<div class="item-grid storage-grid">${cards.join('')}</div>` : '<div class="inventory-empty">这一格还是空的。开始冒险后，掉落物会自动收纳到这里。</div>'; return `<div class="tab-bar" role="tablist">${tabs}</div>${body}`; }
/* 装备栏骨架：按装备类型分组，每组渲染该类型当前的槽位数。槽位内容由 update 填充。 */
function equipGroupsMarkup(counts: number[]): string { return equipTypes.map((type, equipType) => `<section class="equip-group"><div class="equip-group-head"><span class="equip-group-name">${type.name}</span><span class="equip-group-count" data-ref="count"></span></div><div class="equip-slots">${Array.from({ length: counts[equipType] }, (_, slotIndex) => `<button class="equip-slot" type="button" data-equip-type="${equipType}" data-slot="${slotIndex}"></button>`).join('')}</div></section>`).join(''); }
/* 装备加成窗口：一行一项「合计 + 展开按钮」，来源折在下面（默认收起）——
   只统计身上这套东西的贡献，装备自身 / 词条 / 套装都在来源里。
   合计 = 固定来源合计 ×（1 + 百分比来源合计 / 100），与 getPlayerAttack 同一套口径。
   展开状态存 expandedStats（界面状态，不进存档）：重建窗口时照着它画，所以换了装备不会把展开的段收回去。 */
const expandedStats = new Set<string>();
function statsSourcesMarkup(sources: { name: string; value: number; colorClass: string }[], suffix: string): string {
  return sources.map(source => `<div class="equip-stat-source ${source.colorClass}"><span>${source.name}</span><b>+${formatNumber(source.value)}${suffix}</b></div>`).join('');
}
function statsRowMarkup(stat: typeof equipBonusStats[number], state: GameState): string {
  const fixed = getEquipBonusSources(stat.key, state);
  const pct = stat.pctKey ? getEquipBonusSources(stat.pctKey, state) : [];
  const flatSum = fixed.reduce((sum, source) => sum + source.value, 0);
  const pctSum = pct.reduce((sum, source) => sum + source.value, 0);
  const total = Math.round(flatSum * (1 + pctSum / 100));
  const open = expandedStats.has(stat.key);
  const rows = !fixed.length && !pct.length
    ? '<div class="equip-stat-source empty"><span>还没有装备提供这项加成。</span></div>'
    /* 分隔线只在两段都有内容时才画：只有一半时它就是一条悬空的线。 */
    : `${statsSourcesMarkup(fixed, '')}${fixed.length && pct.length ? '<div class="equip-stat-split" aria-hidden="true"></div>' : ''}${statsSourcesMarkup(pct, '%')}`;
  return `<div class="equip-stat${total ? '' : ' empty'}${open ? '' : ' collapsed'}"><div class="equip-stat-head"><span class="equip-stat-label">${stat.label}</span><span class="equip-stat-total"><b class="equip-stat-value">+${formatNumber(total)}</b><button class="equip-stat-toggle" type="button" data-stats-row="${stat.key}" aria-expanded="${open}" aria-label="展开或收起加成来源">${open ? '▴' : '▾'}</button></span></div><div class="equip-stat-sources"${open ? '' : ' hidden'}>${rows}</div></div>`;
}
function statsWindowMarkup(state: GameState): string { return `<div class="stats-window"><div class="stats-window-head"><div><span class="panel-kicker">EQUIPMENT BONUS</span><h3>装备加成</h3></div><button class="stats-window-close" type="button" data-stats-close aria-label="关闭">×</button></div><div class="stats-window-list">${equipBonusStats.map(stat => statsRowMarkup(stat, state)).join('')}</div><div class="stats-window-sets"><span class="panel-kicker">SET BONUS</span>${setRowsMarkup(state)}</div></div>`; }
/** 套装进度：只列「身上至少穿了一件」的套装 —— 一件都没穿时列出来只是噪音。 */
function setRowsMarkup(state: GameState): string {
  const rows = setTable.map((entry, setId) => ({ entry, setId, worn: getSetWorn(setId, state) })).filter(row => row.worn > 0);
  if (!rows.length) return '<p class="set-empty">还没有穿上任何套装部件。</p>';
  return rows.map(({ entry, setId, worn }) => {
    const total = entry.pieces.length;
    const active = worn >= total;
    const pieces = entry.pieces.map(itemId => `<span class="set-piece ${isEquippedOn(state, itemId) ? 'on' : ''}">${items[itemId].icon} ${items[itemId].name}</span>`).join('');
    return `<div class="equip-stat ${active ? '' : 'empty'}"><div class="equip-stat-head"><span class="equip-stat-label">${entry.icon} ${entry.name}套装</span><b class="equip-stat-value">${worn} / ${total}</b></div><div class="set-pieces">${pieces}</div></div>`;
  }).join('');
}
/** 这一件（按物品 id）现在有没有被穿在身上。 */
function isEquippedOn(state: GameState, itemId: number): boolean {
  return state.equipped.some(slots => slots.some(instanceId => instanceId >= 0 && getInstanceItemId(instanceId, state) === itemId));
}
function ensureStatsLayer(): HTMLElement { if (statsLayer) return statsLayer; statsLayer = document.createElement('div'); statsLayer.className = 'stats-layer'; statsLayer.hidden = true; statsLayer.addEventListener('click', event => {
  const target = event.target as Element;
  if (target.closest('[data-stats-close]') || target.classList.contains('stats-layer')) { closeStatsWindow(); return; }
  /* 展开 / 收起某一项的来源：只改这一段的显隐与箭头，**不重画整个窗口**（重画会重置滚动位置，见 §10-22）。 */
  const toggle = target.closest<HTMLButtonElement>('[data-stats-row]');
  if (!toggle) return;
  const key = toggle.dataset.statsRow || '';
  const open = !expandedStats.has(key);
  if (open) expandedStats.add(key); else expandedStats.delete(key);
  const row = toggle.closest<HTMLElement>('.equip-stat');
  setHidden(row?.querySelector<HTMLElement>('.equip-stat-sources'), !open);
  setClass(row, 'collapsed', !open);
  setText(toggle, open ? '▴' : '▾');
  toggle.setAttribute('aria-expanded', String(open));
}); document.addEventListener('keydown', event => { if (event.key === 'Escape') closeStatsWindow(); }); document.body.appendChild(statsLayer); return statsLayer; }
/** 装备加成窗口的内容签名：只看「身上穿了哪些实例 + 它们的精炼与词条」。
    内容没变就不重建 —— 重建会重置滚动位置（见 update 里的说明）。 */
function statsWindowSignature(state: GameState): string {
  const worn: string[] = [];
  for (const slots of state.equipped) for (const instanceId of slots) {
    if (instanceId < 0) continue;
    const instance = getEquipmentInstance(instanceId, state);
    if (instance) worn.push(`${instance.id}:${instance.itemId}:${getRefine(instance)}:${(instance.affixes || []).map(affix => `${affix.id}.${affix.value}`).join('+')}`);
  }
  return worn.join(',');
}
function openStatsWindow(): void { const layer = ensureStatsLayer(); layer.dataset.signature = statsWindowSignature(getState()); layer.innerHTML = statsWindowMarkup(getState()); layer.hidden = false; }
function closeStatsWindow(): void { if (statsLayer) statsLayer.hidden = true; }
function closeMenu(): void { if (!menuEl) return; menuEl.hidden = true; menuItemId = -1; menuInstanceId = -1; }
function ensureMenu(): HTMLDivElement { if (menuEl) return menuEl; menuEl = document.createElement('div'); menuEl.className = 'item-context-menu'; menuEl.hidden = true; document.body.appendChild(menuEl); menuEl.addEventListener('click', event => { const button = (event.target as Element).closest<HTMLButtonElement>('[data-item-action]'); if (!button || menuItemId < 0) return; /* closeMenu 会清空 menuItemId / menuInstanceId，先把它们取出来。 */ const itemId = menuItemId; const instanceId = menuInstanceId; closeMenu(); /* 可堆叠物品手里不止一份时先问「一份还是全部」（装备是独立实例，没有份数，直接丢）。 */
if (button.dataset.itemAction === 'discard') { if (instanceId >= 0) discardEquipment(instanceId); else if ((getState().inventory[itemId] || 0) > 1) openDiscardWindow(itemId); else discardItem(itemId, 1); } /* 需要点选目标的道具先进使用模式，等玩家点了装备才真正生效。 */
if (button.dataset.itemAction === 'use') beginUse(itemId); if (button.dataset.itemAction === 'equip') equipItem(instanceId); if (button.dataset.itemAction === 'wiki') openWiki('item', itemId); }); document.addEventListener('pointerdown', event => { if (!menuEl!.contains(event.target as Node)) closeMenu(); }, true); document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); }); window.addEventListener('scroll', closeMenu, true); window.addEventListener('resize', closeMenu); return menuEl; }
function openMenu(itemId: number, instanceId: number, x: number, y: number): void { const item = items[itemId]; if (!item) return; const menu = ensureMenu(); menuItemId = itemId; menuInstanceId = instanceId; menu.innerHTML = `<div class="context-menu-head"><b>${item.name}</b><span class="muted">${itemCategories[item.category].name}</span></div>${actionsFor(item).map(action => `<button class="context-menu-item ${action.danger ? 'danger' : ''}" type="button" data-item-action="${action.id}">${action.label(instanceId)}</button>`).join('')}`; menu.hidden = false; const rect = menu.getBoundingClientRect(); menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`; menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`; }
/* ——— 道具使用模式 ———
   右键消耗品的「使用」进入：光标换成瞄准样式、可点选的装备卡片高亮、底部出现提示条。
   此时左键点装备卡片，把 instanceId 交给 item.use 再跑一次；返回 pick-affix 时弹出词条选择窗口。
   其他任何点击（或 Esc）退出。只影响界面，不写存档。 */
let usingItemId = -1; let hintEl: HTMLElement | null = null; let pickerEl: HTMLElement | null = null; let statsLayer: HTMLElement | null = null;
let pendingAffix: { itemId: number; instanceId: number; indices: number[] } | null = null;
function ensureHint(): HTMLElement { if (hintEl) return hintEl; hintEl = document.createElement('div'); hintEl.className = 'enhance-hint'; hintEl.hidden = true; document.body.appendChild(hintEl); return hintEl; }
function syncUseHint(): void { const hint = ensureHint(); if (usingItemId < 0) { hint.hidden = true; return; } const item = items[usingItemId]; hint.innerHTML = `<span class="enhance-hint-icon">${item.icon}</span><b>${item.name}</b><span class="muted">${item.useText || '使用'} · 点击一件装备或装备槽 · 其他任意点击取消</span>`; hint.hidden = false; }
/** 开始使用一件道具：先不带目标跑一次，要求点选装备就进入点选模式。 */
function beginUse(itemId: number): void {
  const outcome = useItem(itemId, -1);
  if (outcome.kind === 'pick-equipment') setUseMode(itemId);
}
/** 带着点选到的装备再跑一次。道具用完了就退出模式。 */
/** 带着点选到的装备再跑一次。道具用完了就退出模式。
    itemId 默认取「使用模式」里的那件；拖拽进来的调用显式传（那时没有使用模式）。 */
function useOnInstance(instanceId: number, itemId = usingItemId): void { const outcome = useItem(itemId, instanceId); if (outcome.kind === 'pick-affix') { pendingAffix = { itemId, instanceId: outcome.instanceId, indices: outcome.affixIndices }; openAffixPicker(); return; } /* 拖拽场景 usingItemId 是 -1，这两句自然空转。 */ if (getState().inventory[itemId] > 0) syncUseHint(); else setUseMode(-1); }
function onUseKeydown(event: KeyboardEvent): void { if (event.key === 'Escape') setUseMode(-1); }
/** 点击位置对应的装备实例：物品卡片读 data-instance，装备槽回存档里反查。都不是返回 -1。 */
function instanceAt(target: Element): number {
  const card = target.closest<HTMLElement>('[data-instance]');
  if (card) return Number(card.dataset.instance);
  /* 装备槽本身不记装着谁，得用 equipped 反查；空槽返回 -1（等于没点中装备）。 */
  const slot = target.closest<HTMLElement>('.equip-slot');
  if (slot) return getState().equipped[Number(slot.dataset.equipType)]?.[Number(slot.dataset.slot)] ?? -1;
  return -1;
}
function onUseClick(event: MouseEvent): void { const target = event.target as Element; /* 触发进入模式的那次点击就落在右键菜单里，菜单内的点击不参与判定。 */ if (target.closest('.item-context-menu')) return; if (usingItemId < 0) return; const instanceId = instanceAt(target); /* 没点在装备上（可堆叠物品的卡片、空装备槽、空白处）就当作取消。 */ if (instanceId < 0) { setUseMode(-1); return; } useOnInstance(instanceId); }
function setUseMode(itemId: number): void { const wasOn = usingItemId >= 0; const nowOn = itemId >= 0; usingItemId = itemId; document.body.classList.toggle('enhancing', nowOn); syncUseHint(); if (nowOn && !wasOn) { document.addEventListener('click', onUseClick); document.addEventListener('keydown', onUseKeydown); } if (!nowOn && wasOn) { document.removeEventListener('click', onUseClick); document.removeEventListener('keydown', onUseKeydown); closeAffixPicker(); } }
/* 词条选择窗口：一件装备上有同品阶的多条词条时，用对应品阶的清洗道具必须选一条。 */
function ensurePicker(): HTMLElement { if (pickerEl) return pickerEl; pickerEl = document.createElement('div'); pickerEl.className = 'affix-picker-layer'; pickerEl.hidden = true; pickerEl.addEventListener('click', event => { const target = event.target as Element; if (target.closest('[data-affix-cancel]') || target.classList.contains('affix-picker-layer')) { closeAffixPicker(); setUseMode(-1); return; } const option = target.closest<HTMLElement>('[data-affix-pick]'); if (option) pickAffix(Number(option.dataset.affixPick)); }); document.body.appendChild(pickerEl); return pickerEl; }
function openAffixPicker(): void { if (!pendingAffix) return; const instance = getEquipmentInstance(pendingAffix.instanceId); if (!instance) { closeAffixPicker(); return; } const list = instance.affixes || []; const picker = ensurePicker(); picker.innerHTML = `<div class="affix-picker"><div class="affix-picker-head"><div><span class="panel-kicker">REMOVE AFFIX</span><h3>选择要移除的词条</h3></div><button class="affix-picker-close" type="button" data-affix-cancel aria-label="关闭">×</button></div><p class="affix-picker-copy">「${items[instance.itemId].name}」上有 ${pendingAffix.indices.length} 条可移除的词条，用「${items[pendingAffix.itemId].name}」洗掉其中一条。</p><div class="affix-picker-list">${pendingAffix.indices.map(index => { const affix = list[index]; const definition = affixes[affix.id]; return `<button class="affix-picker-option ${affixCategoryClass(definition.category)}" type="button" data-affix-pick="${index}"><span class="affix-picker-name">${definition.name}</span><span class="affix-picker-text">${affixMarkup(affix)}</span></button>`; }).join('')}</div></div>`; picker.hidden = false; }
function closeAffixPicker(): void { pendingAffix = null; if (pickerEl) pickerEl.hidden = true; }
function pickAffix(index: number): void { const pending = pendingAffix; closeAffixPicker(); if (!pending) return; const outcome = useItem(pending.itemId, pending.instanceId, index); if (outcome.kind === 'pick-affix') { pendingAffix = { itemId: pending.itemId, instanceId: pending.instanceId, indices: outcome.affixIndices }; openAffixPicker(); return; } setUseMode(-1); }
/* ——— 丢弃确认窗口 ———
   可堆叠物品手里不止一份时，右键「丢弃」不直接执行，先问「只留一份，还是全部丢掉」——
   原来只有丢一份这一条路，想清空一叠要连点十几次。数量只有一份的物品照旧直接丢：弹一个只有一个答案的窗口没有意义。
   两个按钮说的都是**终态**（点完手里剩一份 / 剩零份），所以份数一律点的时候现读。
   单例挂 body（R09），三种关闭方式齐全（× / 点遮罩 / Esc，R12）；结构与 .affix-picker 同款。 */
let discardLayer: HTMLElement | null = null;
let discardItemId = -1;
function closeDiscardWindow(): void { discardItemId = -1; if (discardLayer) discardLayer.hidden = true; }
/** 窗口里那两个按钮：keep-one = 只留一份（丢掉多出来的），all = 一份不留。
    份数**现读**，不用打开窗口时的快照（窗口开着时也可能有进出账）。 */
function discardFromWindow(mode: 'keep-one' | 'all'): void {
  const itemId = discardItemId;
  const owned = itemId >= 0 ? getState().inventory[itemId] || 0 : 0;
  closeDiscardWindow();
  if (itemId < 0 || owned <= 0) return;
  const amount = mode === 'all' ? owned : owned - 1;
  if (amount > 0) discardItem(itemId, amount);
}
function ensureDiscardLayer(): HTMLElement {
  if (discardLayer) return discardLayer;
  const el = document.createElement('div');
  el.className = 'discard-layer';
  el.hidden = true;
  el.addEventListener('click', event => {
    const target = event.target as Element;
    if (target.closest('[data-discard-cancel]') || target.classList.contains('discard-layer')) { closeDiscardWindow(); return; }
    if (target.closest('[data-discard-keep]')) discardFromWindow('keep-one');
    else if (target.closest('[data-discard-all]')) discardFromWindow('all');
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && discardLayer && !discardLayer.hidden) closeDiscardWindow(); });
  document.body.appendChild(el);
  discardLayer = el;
  return el;
}
function openDiscardWindow(itemId: number): void {
  const item = items[itemId];
  const owned = getState().inventory[itemId] || 0;
  if (!item || owned <= 0) return;
  discardItemId = itemId;
  const layer = ensureDiscardLayer();
  /* 稀有度类挂在 .discard-copy 上：图标与名字都读同一个 --rarity-color（同 .item-card 的做法）。 */
  layer.innerHTML = `<div class="discard-window"><div class="discard-head"><div><span class="panel-kicker">DISCARD ITEM</span><h3>丢弃物品</h3></div><button class="discard-close" type="button" data-discard-cancel aria-label="关闭">×</button></div><p class="discard-copy ${rarityClass(item.rarity)}"><span class="discard-icon" aria-hidden="true">${item.icon}</span><b class="discard-name item-name">${item.name}</b><span class="discard-owned">当前拥有 ${formatNumber(owned)}</span></p><div class="discard-actions"><button class="secondary-button" type="button" data-discard-keep>保留一份</button><button class="secondary-button danger" type="button" data-discard-all>丢弃全部</button></div></div>`;
  layer.hidden = false;
}

const page: PageDefinition<any> = { id: 'inventory', template: './pages/inventory.html', mount(root) { const view = root.querySelector<HTMLElement>('#inventory-view')!; /* 每次进页面都从干净状态开始：退出使用模式、关掉加成窗口与丢弃确认窗口（它们都挂 body，不关会飘到别的页面上）。 */ setUseMode(-1); closeStatsWindow(); closeDiscardWindow(); view.innerHTML = `<aside class="panel equip-panel"><div class="panel-heading"><div><span class="panel-kicker">EQUIPMENT</span><h3>装备栏</h3></div><button class="secondary-button equip-stats-toggle" type="button" data-equip-stats="open">装备加成</button></div><div class="equip-groups" data-ref="equipGroups"></div></aside><article class="panel inventory-panel"><div class="inventory-heading"><div><span class="panel-kicker">ITEM STORAGE</span><h3>物品储藏</h3></div><span class="capacity-summary" data-ref="summary"></span></div>
  <div class="capacity-track load-track"><div class="capacity-bar load-bar" data-ref="capacityBar"></div></div><div class="storage-box" data-ref="content"></div></article>`; /* ctx 要先建出来：下面的 root.onclick 里会用到它（切换物品储藏的页签）。 */
const ctx: any = { ...pick(view, 'equipGroups', 'summary', 'capacityBar', 'content'), slots: [], countLabels: [], slotSignature: '', signature: '', cardRefs: [], category: ALL_TAB };
root.oncontextmenu = event => { const card = (event.target as Element).closest<HTMLElement>('[data-item]'); if (!card) return; event.preventDefault(); openMenu(Number(card.dataset.item), Number(card.dataset.instance ?? -1), event.clientX, event.clientY); }; /* 装备加成窗口：只读界面，不碰存档。 */ root.onclick = event => { const target = event.target as Element; if (target.closest('[data-equip-stats]')) { openStatsWindow(); return; } /* 物品储藏的页签：只切分类，不动存档。 */ const tab = target.closest<HTMLElement>('[data-storage-tab]'); if (tab) { ctx.category = tab.dataset.storageTab; pageController.renderCurrent(); } }; /* 拖拽监听挂在 view 上：每次挂载 view 都是新元素，不会像 #page-content 那样累积监听器。 */ view.addEventListener('dragstart', event => { const card = (event.target as Element).closest<HTMLElement>('[data-item]'); if (!card) return; const itemId = Number(card.dataset.item); const instanceId = Number(card.dataset.instance ?? -1); /* 装备实例拖出去是换装 / 精炼；需要点选装备的道具拖出去是对目标使用。 */ if (instanceId >= 0) draggingInstanceId = instanceId; else if (items[itemId]?.targetsEquipment) draggingConsumableId = itemId; else return; setClass(card, 'dragging', true); event.dataTransfer?.setData('text/plain', String(instanceId >= 0 ? instanceId : itemId)); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; }); view.addEventListener('dragend', () => { draggingInstanceId = -1; draggingConsumableId = -1; view.querySelectorAll('.item-card.dragging').forEach(card => card.classList.remove('dragging')); view.querySelectorAll('.equip-slot.drop-target').forEach(slot => slot.classList.remove('drop-target')); view.querySelectorAll('.item-card.refine-target').forEach(card => card.classList.remove('refine-target')); }); /* 拖拽目标有三类：装备槽（换装）、同名装备卡片（精炼）、任意装备（道具对它使用）。都不匹配就不 preventDefault，浏览器会显示禁止光标。 */
view.addEventListener('dragover', event => { const target = event.target as Element; /* 道具 → 装备：装备卡片和装备槽都能接收（槽位回存档反查它装着的实例）。 */ if (draggingConsumableId >= 0) { if (instanceAt(target) < 0) return; event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; setClass(target.closest<HTMLElement>('.equip-slot') || target.closest<HTMLElement>('.item-card[data-instance]'), 'drop-target', true); return; } if (draggingInstanceId < 0) return; const slot = target.closest<HTMLElement>('.equip-slot'); if (!slot) { const card = target.closest<HTMLElement>('.item-card[data-instance]'); if (!card || !canRefineWith(Number(card.dataset.instance), draggingInstanceId)) return; event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; setClass(card, 'refine-target', true); return; } const itemId = getInstanceItemId(draggingInstanceId); /* 只接受类型匹配的槽位：不匹配就不 preventDefault，浏览器会显示禁止光标。 */ if (itemId < 0 || items[itemId].equipType !== Number(slot.dataset.equipType)) return; event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; setClass(slot, 'drop-target', true); }); view.addEventListener('dragleave', event => { const target = event.target as Element; const node = target.closest<HTMLElement>('.equip-slot') || target.closest<HTMLElement>('.item-card[data-instance]'); if (!node || node.contains(event.relatedTarget as Node)) return; setClass(node, 'drop-target', false); setClass(node, 'refine-target', false); }); view.addEventListener('drop', event => { const target = event.target as Element; /* 道具 → 装备：等于「右键 → 使用 → 点这件装备」，走同一条 useItem 路径。 */ if (draggingConsumableId >= 0) { const instanceId = instanceAt(target); const itemId = draggingConsumableId; draggingConsumableId = -1; view.querySelectorAll('.drop-target').forEach(node => node.classList.remove('drop-target')); if (instanceId < 0) return; event.preventDefault(); useOnInstance(instanceId, itemId); return; } const slot = target.closest<HTMLElement>('.equip-slot'); if (slot) { event.preventDefault(); setClass(slot, 'drop-target', false); equipToSlot(Number(event.dataTransfer?.getData('text/plain')), Number(slot.dataset.equipType), Number(slot.dataset.slot)); return; } /* 卡片 → 卡片：消耗拖拽的那件，把目标件的精炼顶到「素材等级 + 1」。 */ const card = target.closest<HTMLElement>('.item-card[data-instance]'); if (!card) return; event.preventDefault(); setClass(card, 'refine-target', false); refineWithFeeder(Number(card.dataset.instance), Number(event.dataTransfer?.getData('text/plain'))); }); return ctx; }, update(state: GameState, ctx: any) { const counts = getEquipSlotCounts(); const slotSignature = counts.join(','); if (ctx.slotSignature !== slotSignature) { ctx.slotSignature = slotSignature; ctx.equipGroups.innerHTML = equipGroupsMarkup(counts); ctx.slots = [...(ctx.equipGroups as HTMLElement).querySelectorAll<HTMLElement>('.equip-slot')]; ctx.countLabels = [...(ctx.equipGroups as HTMLElement).querySelectorAll<HTMLElement>('.equip-group-count')]; } const filled = counts.map(() => 0); ctx.slots.forEach((slot: HTMLElement) => { const equipType = Number(slot.dataset.equipType); const instanceId = state.equipped[equipType]?.[Number(slot.dataset.slot)] ?? -1; const itemId = instanceId >= 0 ? getInstanceItemId(instanceId, state) : -1; const item = itemId >= 0 ? items[itemId] : null; const instance = instanceId >= 0 ? getEquipmentInstance(instanceId, state) : null; if (item) filled[equipType] += 1; setClass(slot, 'filled', !!item); const refine = getRefine(instance || undefined);
setHtml(slot, item ? `<span class="equip-slot-icon">${item.icon}</span><span class="equip-slot-name ${rarityClass(item.rarity)}">${item.name}${refineMarkup(refine)}</span>${instance?.affixes?.length ? `<span class="equip-slot-affix">${instance.affixes.length}</span>` : ''}<span class="item-detail">${detailMarkup(itemId, instance, false)}</span>` : '<span class="equip-slot-icon">+</span><span class="equip-slot-name">空</span>'); }); counts.forEach((count, equipType) => setText(ctx.countLabels[equipType], `${filled[equipType]} / ${count}`)); const load = getInventoryUsed(state); const capacity = getInventoryCapacity(state); setText(ctx.summary, `物品栏负载 ${load} / ${capacity}`);
    const ratio = capacity ? load / capacity : 0;
    setWidth(ctx.capacityBar, Math.min(100, ratio * 100));
    /* 压力越大越靠近红：绿的 <50%、黄的 50~80%、红的 >80%。 */
    setClass(ctx.capacityBar, 'load-mid', ratio >= .5 && ratio <= .8);
    setClass(ctx.capacityBar, 'load-high', ratio > .8); /* 词条要进签名：只加/洗词条不换装备时，卡片上的词条列表和属性也要跟着刷新。 */
/* 结构签名只关心「有哪些卡片」：装备实例、可堆叠物品的种类（有/无）、按件显示的件数（图纸）、词条与当前页签。
   可堆叠物品的数量不进签名，否则每次掉落都会重绘整片网格 —— 正在悬停的卡片会被换掉，浮层的位置与内容一起跳。 */
const signature = `${state.equipped.map(slots => slots.join('.')).join(',')}|${state.inventory.map((quantity, itemId) => (items[itemId].stackable ? (quantity > 0 ? 1 : 0) : quantity)).join(',')}|${state.equipment.map(instance => `${instance.id}:${(instance.affixes || []).map(affix => `${affix.id}.${affix.value}`).join('+')}`).join(',')}|${ctx.category}`;
if (ctx.signature !== signature) { ctx.signature = signature; setHtml(ctx.content, storageMarkup(state, ctx.category)); ctx.cardRefs = [...(ctx.content as HTMLElement).querySelectorAll<HTMLElement>('.item-card')].map(card => ({ itemId: Number(card.dataset.item), quantity: card.querySelector<HTMLElement>('.item-quantity') })); if (statsLayer && !statsLayer.hidden) statsLayer.innerHTML = statsWindowMarkup(state); }
/* 数量就地刷新：只改文本，不动 DOM 结构，悬停中的浮层因此不会受影响。 */
ctx.cardRefs.forEach((entry: any) => { if (entry.quantity) setText(entry.quantity, `×${formatNumber(state.inventory[entry.itemId] || 0)}`); }); /* 加成窗口只在内容真的变了才重建：无条件重绘会每 500ms 把滚动位置打回顶部，根本没法往下滚。 */
const statsSignature = statsWindowSignature(state);
if (statsLayer && !statsLayer.hidden && statsLayer.dataset.signature !== statsSignature) { statsLayer.dataset.signature = statsSignature; statsLayer.innerHTML = statsWindowMarkup(state); } } };
export default page;
