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
    attackPct / hpPct 是百分比，作用在玩家最终属性上；skill 是赋予的技能下标；
    workshopRate 是工坊工时倍率（百分比），作用在后勤推进上。 */
export interface AffixEffect { attack?: number; attackPct?: number; hp?: number; hpPct?: number; defense?: number; skill?: number; workshopRate?: number; }

/* ——— 词条分类 ———
   键顺序就是 category id。清洗道具按**类别**移除词条（不再按品阶），
   所以类别是词条的核心属性之一：一类一个清洗剂，玩家要洗掉哪条就带对应的那瓶。
   颜色走 CSS 的 .affix-*（进攻红 / 生存绿 / 功能蓝），名字与颜色在这里定义一次。 */
const CATEGORY_DEFS = {
  offense: { name: '进攻', className: 'offense' },
  survival: { name: '生存', className: 'survival' },
  utility: { name: '功能', className: 'utility' }
} satisfies Record<string, { name: string; className: string }>;

export const affixCategories = Object.entries(CATEGORY_DEFS).map(([id, definition]) => ({ id, ...definition }));
/** 名字 → 下标，用法同 ITEM。 */
export const AFFIX_CATEGORY = Object.fromEntries(Object.keys(CATEGORY_DEFS).map((name, id) => [name, id])) as { [K in keyof typeof CATEGORY_DEFS]: number };
/** 某个类别的 CSS 类名（style.css 里的 .affix-*，它提供 --affix-color）。 */
export function affixCategoryClass(category: number): string { return `affix-${(affixCategories[category] || affixCategories[0]).className}`; }

/* ——— 词条表 ———
   对象字面量的键顺序就是 affixId。
   category 是词条类别（进攻 / 生存 / 功能），决定用哪个清洗剂能洗掉它。
   desc 是一句「这条词条做什么」的白话描述，强化道具的详情里跟在词条名后面
   （「附加词条：锋锐 - 增加一定攻击力」）。**只讲作用方向，不写数值** ——
   数值由下面三行「首次 / 重复 / 最高」负责，两处都写会出现改了一处忘另一处的情况。
   base 是初始数值，step 是每次用同款强化物提升的量，上限固定为 base 的两倍。
   ⚠️ step 现在都取 base 的 1/4（锋锐除外 —— 它已经是 1 点粒度，降不了）：
   满级需要的道具数因此从 3 个涨到 5 个，**词条上限不变**（上限是 base 的两倍，只看 base）。
   改 step 前先算一遍「满级要几个道具」：1 + (cap − base) / step。
   一件装备上同名词条只会有一条，再次使用同款强化物就是给那一条加数值，不会重复叠加。
   summary 是卡片与加成面板上的文案：{value} 替换成当前数值，{cap} 替换成上限（界面上用灰字显示）。
   unit 是数值单位，强化道具详情里的「首次 / 重复 / 最高」三行用它（百分比词条是 %，固定值词条为空）。 */
const AFFIX_DEFS = {
  keenEdge: { name: '锋锐', desc: '增加一定攻击力', category: AFFIX_CATEGORY.offense, base: 2, step: 1, unit: '', effect: { attack: 1 }, summary: '攻击力 +{value}/{cap}' },
  emberBurst: { name: '余烬爆裂', desc: '出手时周期性打出一记爆发伤害', category: AFFIX_CATEGORY.offense, base: 100, step: 25, unit: '%', effect: { skill: SKILL.emberBurst }, summary: '赋予技能「余烬爆裂」（强度 {value}%/{cap}%）' },
  vitality: { name: '坚韧', desc: '增加一定生命上限', category: AFFIX_CATEGORY.survival, base: 12, step: 3, unit: '', effect: { hp: 1 }, summary: '生命上限 +{value}/{cap}' },
  bulwark: { name: '铁壁', desc: '增加一定防御力', category: AFFIX_CATEGORY.survival, base: 4, step: 1, unit: '', effect: { defense: 1 }, summary: '防御 +{value}/{cap}' },
  /* 功能类：不加战斗属性，而是给庇护所系统加速。后续这类「增益其他系统」的词条都可以往这里加
     （研究速度、掉落加成……），它们在战斗里没有直接收益，价值在于把整条生产线推快。 */
  logistics: { name: '勤务', desc: '提高工坊的建造速度', category: AFFIX_CATEGORY.utility, base: 8, step: 2, unit: '%', effect: { workshopRate: 1 }, summary: '工坊工时 +{value}%/{cap}%' }
} satisfies Record<string, { name: string; desc: string; category: number; base: number; step: number; unit: string; effect: AffixEffect; summary: string }>;

/* 显式标注成 AffixEffect：satisfies 会把每一项的 effect 收窄成各自的字面量类型，
   读的时候访问别的字段会报错（比如从 keenEdge.effect 上读 attack）。 */
export const affixes: { name: string; desc: string; category: number; base: number; step: number; unit: string; effect: AffixEffect; summary: string }[] = Object.values(AFFIX_DEFS);
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

/** 使用后点选一件装备，移除它身上一条指定**类别**的词条。
    同类词条有多条时返回 pick-affix，由界面弹窗让玩家选，选完带着 affixIndex 再调一次。 */
export function removeAffixHandler(category: number): UseHandler {
  return context => {
    if (context.instanceId < 0) return { kind: 'pick-equipment' };
    const indices = context.affixes().map((affix, index) => (affixes[affix.id].category === category ? index : -1)).filter(index => index >= 0);
    if (!indices.length) { context.log(`这件装备上没有${affixCategories[category].name}词条。`); return { kind: 'done' }; }
    const chosen = context.affixIndex >= 0 ? context.affixIndex : indices.length === 1 ? indices[0] : -1;
    if (chosen < 0) return { kind: 'pick-affix', instanceId: context.instanceId, affixIndices: indices };
    context.removeAffix(chosen); context.consume();
    return { kind: 'done' };
  };
}
