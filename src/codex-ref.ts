import { items } from './config/items';
import { rarityClass } from './config/rarity';
import { enemyTable, zones } from './config/zones';
import { campEventDef, campEventEntries } from './config/events';
import { setTable } from './config/sets';

/* ——— 图鉴引用 ———
   界面上凡是「指名某个具体条目」的文本，都渲染成「icon + 名称」的一小段文本，
   颜色按条目类型区分，点击后打开内置 wiki（wiki.ts）。
   物品栏里的卡片、冒险页的战斗卡与图鉴卡片是另外的呈现形态，不走这里。

   三种条目：
   item  物品：物品图标 + 名称，颜色跟随稀有度（--rarity-color）
   enemy 怪物：单字 art + 名称，红色（沿用「红 = 敌方」的既有语义）
   zone  区域：区域图标 + 名称，庇护所暖色、其余用主色

   两个入口：
   1) itemRefMarkup / enemyRefMarkup / zoneRefMarkup：渲染层直接拼 HTML 时用。
   2) itemTag / enemyTag / zoneTag + renderCodexTags(text)：日志这类
      「先存成纯文本、之后再渲染」的场合用。日志的 message 会写进存档，
      所以存的是 [[kind:id]] 标记，渲染时再由 renderCodexTags 换成引用。

   本模块只依赖静态配置表，不依赖 game-state ——
   这样 game-state 可以反过来引用 itemTag / enemyTag / zoneTag 去拼日志文案，而不会形成循环依赖。 */

/** 标记：[[item:12]] / [[enemy:5]] / [[zone:2]]。早期只支持物品时写的是 [[12]]，继续按物品解析。 */
const TAG_PATTERN = /\[\[(?:(\w+):)?(\d+)\]\]/g;

/* ——— wiki 解锁状态 ———
   wiki 未解锁时，所有引用降级成「icon + 名称 + 类型色」的纯文本：没有下划线、不可点。
   状态由 main.ts 每帧同步进来（同 format.ts 的数字档位），
   这样本模块不用依赖 game-state —— game-state 反过来要引用 itemTag 拼日志文案，依赖会成环。 */
let wikiUnlocked = false;
const wikiUnlockListeners = new Set<(unlocked: boolean) => void>();
/** 由 main.ts 同步：wiki 是否已解锁。状态翻转时通知订阅者（wiki 弹窗据此在重新锁上时关闭自己）。 */
export function setWikiUnlocked(enabled: boolean): void {
  const next = !!enabled;
  if (next === wikiUnlocked) return;
  wikiUnlocked = next;
  wikiUnlockListeners.forEach(listener => listener(next));
}
/** 订阅解锁状态变化（wiki.ts 用）。 */
export function onWikiUnlockChange(listener: (unlocked: boolean) => void): void { wikiUnlockListeners.add(listener); }

/** 一条图鉴条目的展示数据。渲染引用与 wiki 标题栏共用，避免两处各写一份取数逻辑。 */
export interface CodexEntry {
  icon: string;
  name: string;
  /** wiki 标题栏上的英文小标。 */
  kicker: string;
  /** 提供颜色的类名：物品是 .rarity-*（给 --rarity-color），怪物 / 区域是 .codex-*（给 --codex-color）。 */
  colorClass: string;
  description: string;
}

/** 按下标取一条图鉴条目；类型或下标无效时返回 null。 */
export function codexEntry(kind: string, id: number): CodexEntry | null {
  if (kind === 'enemy') {
    const enemy = enemyTable[id];
    return enemy ? { icon: enemy.art, name: enemy.name, kicker: 'CODEX / MONSTER', colorClass: 'codex-enemy', description: enemy.description } : null;
  }
  if (kind === 'zone') {
    const zone = zones[id];
    /* enemyIds 为空的区域就是庇护所（见 config/zones.ts），用暖色和战斗区域区分开。 */
    return zone ? { icon: zone.icon, name: zone.name, kicker: 'CODEX / ZONE', colorClass: zone.enemyIds.length ? 'codex-zone' : 'codex-zone-camp', description: zone.description } : null;
  }
  if (kind === 'event') {
    const entry = campEventEntries[id];
    if (!entry) return null;
    const def = campEventDef(entry.kind, entry.index);
    return { icon: def.icon, name: def.name, kicker: 'CODEX / EVENT', colorClass: 'codex-event', description: def.desc };
  }
  if (kind === 'set') {
    const entry = setTable[id];
    return entry ? { icon: entry.icon, name: `${entry.name}套装`, kicker: 'CODEX / SET', colorClass: 'codex-set', description: entry.desc } : null;
  }
  const item = items[id];
  return item ? { icon: item.icon, name: item.name, kicker: 'CODEX / ITEM', colorClass: rarityClass(item.rarity), description: item.description } : null;
}

/** 生成图鉴标记（写进日志、条件文案这类会存档的纯文本里）。 */
export function itemTag(itemId: number): string { return `[[item:${itemId}]]`; }
export function enemyTag(enemyId: number): string { return `[[enemy:${enemyId}]]`; }
export function zoneTag(zoneId: number): string { return `[[zone:${zoneId}]]`; }

/** 图鉴引用：icon + 名称，颜色按条目类型，点击打开内置 wiki（委托见 wiki.ts 的 startCodexWiki）。
    wiki 未解锁时退化成纯文本 —— icon 与颜色照旧，只是不带链接样式、点不开。 */
export function codexRefMarkup(kind: string, id: number): string {
  const entry = codexEntry(kind, id);
  if (!entry) return '';
  const inner = `<span class="codex-ref-icon" aria-hidden="true">${entry.icon}</span><span class="codex-ref-name">${entry.name}</span>`;
  if (!wikiUnlocked) return `<span class="codex-ref ${entry.colorClass} is-plain">${inner}</span>`;
  return `<button class="codex-ref ${entry.colorClass}" type="button" data-codex="${kind}:${id}" title="查看「${entry.name}」图鉴">${inner}</button>`;
}

export function itemRefMarkup(itemId: number): string { return codexRefMarkup('item', itemId); }
export function enemyRefMarkup(enemyId: number): string { return codexRefMarkup('enemy', enemyId); }
export function zoneRefMarkup(zoneId: number): string { return codexRefMarkup('zone', zoneId); }
export function eventRefMarkup(eventId: number): string { return codexRefMarkup('event', eventId); }

/** 图鉴「页面」引用：没有具体条目，点开的是 wiki 的某个列表页（见 wiki.ts 的页面路由）。
    用来写「击杀任意怪物」这类指代一整类内容的文案。wiki 未解锁时同样退化成纯文本。 */
export function pageRefMarkup(page: string, label: string): string {
  if (!wikiUnlocked) return `<span class="codex-ref codex-page is-plain">${label}</span>`;
  return `<button class="codex-ref codex-page" type="button" data-codex="page:${page}">${label}</button>`;
}

/** 把纯文本里的图鉴标记渲染成引用。没有标记（或下标无效）时原样返回。 */
export function renderCodexTags(text: string): string {
  if (!text || text.indexOf('[[') < 0) return text;
  return text.replace(TAG_PATTERN, (match, kind, id) => codexRefMarkup(kind || 'item', Number(id)) || match);
}
