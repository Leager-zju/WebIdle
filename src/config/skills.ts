import type { Skill } from '../types';

/* ——— 战斗技能（手动模式）———
   9 项 = 冒险页战斗控制区的 3×3 槽位：第一排攻击、第二排防御、第三排辅助。
   **下标就是槽位下标** —— `state.skills` 按下标存等级、`adventure.skillTimers` 按下标存冷却，
   所以槽位顺序不能动；换技能只改这一条定义，不要插在中间。

   目前已有两项：【普通攻击】（攻击排第 1）与【格挡】（防御排第 1）——都开局就能用，
   等级在研究基地的「军事训练」里练。其余 7 项是**占位**：名称与效果留到定下解锁方式时再写，
   现在只占住槽位（界面显示锁定 + `???`）。 */

/** 技能类别：下标即战斗控制区的行。 */
export const SKILL_CATEGORY = { attack: 0, defense: 1, utility: 2 };

/** 技能等级：每级 +1.5% 伤害（「高成本极低增长」）。**没有等级上限**（2026-09-18）——
    后面的坡度全由军事训练的成本（×1.35/级）与总工时（×1.15/级）撑着，练到哪一级都是投不投得起的问题。
    军事训练的成本 / 时长在 game-state 的 MILITARY 里（那边读这个常量）。 */
export const SKILL_LEVEL = { damagePerLevel: .015 };

/* ——— 格挡（防御排第 1）———
   按一次：**接下来 3 秒内受到的下一记伤害**按格挡值减少，挨完就消耗掉 ——
   时机由玩家自己找（这也是手动模式下「节奏」的用处），超时没挨打就白用一次。
   每级在 20% 的基础上 +0.1%，**300 级之后每级只按 1/10 计**（严重降低）：
   技能没有等级上限（见 SKILL_LEVEL），这两档系数就是它自己的长期坡度。 */
export const BLOCK = {
  /** 格挡窗口（秒）：从按下的那一刻起算。 */
  window: 3,
  /** 基础减伤比例。 */
  baseCut: .20,
  /** 每级增量（`slowFrom` 级之前）。 */
  perLevel: .001,
  /** `slowFrom` 级之后的增量还要再乘上它（「严重降低」：只剩 1/10）。 */
  slowFactor: .1,
  /** 从这个等级之后转慢档（含这一级本身之后）。 */
  slowFrom: 300,
  /** 减伤上限：再往上是天文级投入，别让公式翻到负值（伤害那边另有 min 1 兜底）。 */
  maxCut: .9
};
/** 某个等级下的格挡减伤比例（0~`maxCut`）。**界面与结算共用这一份**，别各写一套。 */
export function blockCut(level: number): number {
  const steps = Math.max(0, level - 1);
  const fast = Math.min(steps, BLOCK.slowFrom - 1);
  const slow = Math.max(0, steps - (BLOCK.slowFrom - 1)) * BLOCK.slowFactor;
  return Math.min(BLOCK.maxCut, BLOCK.baseCut + (fast + slow) * BLOCK.perLevel);
}

/** 一个占位槽位：既没有名字也没有效果，解锁方式待定。 */
const placeholder = (id: string, category: number): Skill => ({
  id, placeholder: true, name: '', icon: '❔', category,
  cooldown: 0,
  unlock: { text: () => '解锁方式尚未确定', done: () => false },
  summary: () => '',
  effect: () => ''
});

export const skills: Skill[] = [
  {
    id: 'basicAttack', name: '普通攻击', icon: '⚔', category: SKILL_CATEGORY.attack,
    /* fromAttackInterval：冷却跟随玩家的出手间隔（手动不会比自动更快 —— 手动的价值在技能与节奏）。 */
    cooldown: 0, fromAttackInterval: true,
    unlock: { text: () => '开局即可使用', done: () => true },
    /* summary 是卡片右上那一行紧凑数值（同工坊的「生命 +120」那一格），effect 是悬停浮层里的一句话。 */
    summary: level => `伤害 +${Math.round(Math.max(0, level - 1) * SKILL_LEVEL.damagePerLevel * 100)}%`,
    effect: () => `一次普通攻击（攻击 − 敌防），每级再 +${Math.round(SKILL_LEVEL.damagePerLevel * 100)}% 伤害。`
  },
  placeholder('attackB', SKILL_CATEGORY.attack),
  placeholder('attackC', SKILL_CATEGORY.attack),
  {
    id: 'block', name: '格挡', icon: '🛡', category: SKILL_CATEGORY.defense,
    /* 冷却 10 秒：窗口只有 3 秒，所以这一下挡在什么时候是玩家自己的判断。 */
    cooldown: 10,
    unlock: { text: () => '开局即可使用', done: () => true },
    summary: level => `减伤 ${(blockCut(level) * 100).toFixed(1)}%`,
    effect: () => `${BLOCK.window} 秒内受到的下一记伤害减少 ${(BLOCK.baseCut * 100).toFixed(0)}%，每级 +${(BLOCK.perLevel * 100).toFixed(1)}%（${BLOCK.slowFrom} 级之后每级只按 1/10 计）。`
  },
  placeholder('defenseB', SKILL_CATEGORY.defense),
  placeholder('defenseC', SKILL_CATEGORY.defense),
  placeholder('utilityA', SKILL_CATEGORY.utility),
  placeholder('utilityB', SKILL_CATEGORY.utility),
  placeholder('utilityC', SKILL_CATEGORY.utility)
];
