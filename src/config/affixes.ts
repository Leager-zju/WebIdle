import { RARITY, rarities } from './rarity';
import type { Affix, UseHandler } from '../types';

/* ——— 技能表 ———
   词条可以给装备赋予技能，战斗中自动触发。interval 是每多少次出手触发一次，
   multiplier 是这一击的伤害倍率（还会再乘上词条强度 value / 100）。
   新增技能在末尾追加即可。 */
const SKILL_DEFS = {
  emberBurst: { name: '余烬爆裂', summary: '每 5 次出手打出一记 1.5 倍攻击力的爆发。', interval: 5, multiplier: 1.5 }
} satisfies Record<string, { name: string; summary: string; interval: number; multiplier: number }>;

export const skills = Object.values(SKILL_DEFS);
/** 名字 → 下标，用法同 ITEM。 */
export const SKILL = Object.fromEntries(Object.keys(SKILL_DEFS).map((name, id) => [name, id])) as { [K in keyof typeof SKILL_DEFS]: number };

/** 词条效果：每个字段表示「每 1 点数值提供多少」。
    attackPct / hpPct 是百分比，作用在玩家最终属性上；skill 是赋予的技能下标。 */
export interface AffixEffect { attack?: number; attackPct?: number; hp?: number; hpPct?: number; defense?: number; skill?: number; }

/* ——— 词条表 ———
   对象字面量的键顺序就是 affixId。
   tier 是词条品阶，沿用稀有度那套（普通 / 精良 / 稀有 / 史诗），和赋予它的强化物一致。
   base 是初始数值，step 是每次用同款强化物提升的量，上限固定为 base 的两倍。
   一件装备上同名词条只会有一条，再次使用同款强化物就是给那一条加数值，不会重复叠加。
   summary 是卡片与加成面板上的文案：{value} 替换成当前数值，{cap} 替换成上限（界面上用灰字显示）。
   unit 是数值单位，强化道具详情里的「首次 / 重复 / 最高」三行用它（百分比词条是 %，固定值词条为空）。 */
const AFFIX_DEFS = {
  keenEdge: { name: '锋锐', tier: RARITY.common, base: 6, step: 2, unit: '%', effect: { attackPct: 1 }, summary: '攻击力 +{value}%/{cap}%' },
  vitality: { name: '坚韧', tier: RARITY.common, base: 8, step: 4, unit: '%', effect: { hpPct: 1 }, summary: '生命上限 +{value}%/{cap}%' },
  bulwark: { name: '铁壁', tier: RARITY.uncommon, base: 4, step: 2, unit: '', effect: { defense: 1 }, summary: '防御 +{value}/{cap}' },
  emberBurst: { name: '余烬爆裂', tier: RARITY.rare, base: 100, step: 50, unit: '%', effect: { skill: SKILL.emberBurst }, summary: '赋予技能「余烬爆裂」（强度 {value}%/{cap}%）' }
} satisfies Record<string, { name: string; tier: number; base: number; step: number; unit: string; effect: AffixEffect; summary: string }>;

/* 显式标注成 AffixEffect：satisfies 会把每一项的 effect 收窄成各自的字面量类型，
   读的时候访问别的字段会报错（比如从 keenEdge.effect 上读 attack）。 */
export const affixes: { name: string; tier: number; base: number; step: number; unit: string; effect: AffixEffect; summary: string }[] = Object.values(AFFIX_DEFS);
/** 名字 → 下标，用法同 ITEM。 */
export const AFFIX = Object.fromEntries(Object.keys(AFFIX_DEFS).map((name, id) => [name, id])) as { [K in keyof typeof AFFIX_DEFS]: number };
/** 词条数值上限相对初始值的倍数：多次使用同款强化物最多把数值顶到初始值的这个倍数。 */
export const AFFIX_MAX_MULTIPLIER = 2;
/** 某条词条的数值上限。 */
export function affixCap(affixId: number): number { return affixes[affixId].base * AFFIX_MAX_MULTIPLIER; }
/** 把一条词条渲染成一段 HTML：当前数值加粗、上限用灰字跟在斜杠后面（卡片与选择窗口共用）。
    传入的 value 可以和实例上的当前值不同——道具详情用它渲染「首次 / 重复」两种效果。 */
export function affixMarkup(affix: Affix): string { const definition = affixes[affix.id]; if (!definition) return ''; return definition.summary.replace('{value}', `<b class="affix-value">${affix.value}</b>`).replace('{cap}', `<span class="affix-cap">${affixCap(affix.id)}</span>`); }

/* ——— 道具的使用行为 ———
   放在这里而不是 config/items.ts，是因为它们只和词条有关；两边都只依赖 UseContext，不反向引用 game-state。 */

/** 使用后点选一件装备，给它加上指定词条；已经有同名词条就提升数值。 */
export function grantAffixHandler(affixId: number): UseHandler { return context => { if (context.instanceId < 0) return { kind: 'pick-equipment' }; /* 顶到上限时 grantAffix 返回 false，这时不消耗道具。 */ if (!context.grantAffix(affixId)) return { kind: 'done' }; context.consume(); return { kind: 'done' }; }; }

/** 使用后点选一件装备，移除它身上一条指定品阶的词条。
    同品阶词条有多条时返回 pick-affix，由界面弹窗让玩家选，选完带着 affixIndex 再调一次。 */
export function removeAffixHandler(tier: number): UseHandler { return context => { if (context.instanceId < 0) return { kind: 'pick-equipment' }; const indices = context.affixes().map((affix, index) => (affixes[affix.id].tier === tier ? index : -1)).filter(index => index >= 0); if (!indices.length) { context.log(`这件装备上没有${rarities[tier].name}词条。`); return { kind: 'done' }; } const chosen = context.affixIndex >= 0 ? context.affixIndex : indices.length === 1 ? indices[0] : -1; if (chosen < 0) return { kind: 'pick-affix', instanceId: context.instanceId, affixIndices: indices }; context.removeAffix(chosen); context.consume(); return { kind: 'done' }; }; }
