/* ——— 庇护所事件表 ———
   大事件（天灾 / 兽潮 / 异种）按波次反复来，随机事件按主线进度随机触发。

   名字 / 图标 / 描述放在这里（纯静态），强度与奖励仍在 game-state 里按存档现算。
   这样图鉴（codex-ref.ts / wiki.ts）能读到事件而不用反过来依赖 game-state，
   game-state 反过来引用 campEventDef 也不会形成循环。
   **图鉴里只收随机事件** —— 大事件只差属性、不做内容差异化，没有单独的页面。 */

/** 事件类型。大事件按波次反复来（见 game-state 的 CAMP_WAVE_KINDS），另有随机事件。
    ⚠️ 取值是**存档字段**（camp.pendingKind），只能追加，不能重排。 */
export const CAMP_EVENT = { disaster: 0, tide: 1, random: 2, mutant: 3 };

/** 大事件（天灾 / 兽潮 / 异种）：键就是 CAMP_EVENT 的取值。
    一张表按 kind 取，而不是按下标排 —— 中间留不留空位都不影响取值（random 走另一张表）。
    **三者不做内容差异化**（差别全在 game-state 的 CAMP_EVENT_BASE 那组数值里），
    这里也只留 name / icon / desc：**大事件没有图鉴条目**（见文件末尾），
    所以 desc 唯一的作用是游戏内「当前威胁」卡片上那句 flavour。 */
const CAMP_EVENT_DEFS: Record<number, { name: string; icon: string; desc: string }> = {
  [CAMP_EVENT.disaster]: { name: '天灾', icon: '🌪️', desc: '沙暴与酸雨同时压向庇护所，挡墙能撑多久决定了远征的下一步。' },
  [CAMP_EVENT.tide]: { name: '兽潮', icon: '🐺', desc: '污染区的机械兽群朝营火方向推进，它们不打算绕路。' },
  [CAMP_EVENT.mutant]: { name: '异种', icon: '☣️', desc: '被余烬信号重组的机械与血肉长在了一起，它们比兽群更耐打，出手也更没有规律。' }
};

/** 随机事件：按主线进度随机触发，强度随主线与胜场一起涨。 */
export const randomEventDefs = [
  { name: '流民求助', icon: '🚶', desc: '一队流民想借庇护所过夜，身后跟着零散的机械单位。', advice: '随机事件里最弱的一类，庇护所满血时可以直接应对。' },
  { name: '废弃补给车', icon: '🚚', desc: '翻倒的补给车旁有游荡的机械残骸，运回来就是一笔收获。', advice: '废料奖励比同强度的其他事件高，缺材料时优先打。' },
  { name: '余烬风暴', icon: '🔥', desc: '余烬核心泄漏，带着火星的风暴正朝营火飘来。', advice: '随机事件里最强的一种，精华奖励也最高。庇护所血量不满时建议跳过，跳过不扣任何东西。' }
];

/** 一条事件的静态定义（不含数值）。kind / index 越界时退回天灾。
    大事件不做内容差异化，所以它们没有 advice。 */
export function campEventDef(kind: number, index: number): { name: string; icon: string; desc: string; advice?: string } {
  if (kind === CAMP_EVENT.random) return randomEventDefs[index] || randomEventDefs[0];
  return CAMP_EVENT_DEFS[kind] || CAMP_EVENT_DEFS[CAMP_EVENT.disaster];
}

/* 图鉴的事件条目表：下标即条目 id。
   **只收随机事件** —— 大事件（天灾 / 兽潮 / 异种）不做内容差异化、只差属性，没有单独的图鉴页；
   游戏里点「当前威胁」的标题不会再跳图鉴（见 pages/camp.ts 的 threatTitleMarkup）。
   这张表**只在运行时用，不进存档**（notices 里只按大类记「随机事件」一条），
   所以可以自由增删；但仍请把新条目**追加到末尾**，免得以后有人误以为 id 是稳定的。 */
export const campEventEntries: { kind: number; index: number }[] = [
  ...randomEventDefs.map((_, index) => ({ kind: CAMP_EVENT.random, index }))
];

/** 按 kind + index 找条目 id；找不到返回 -1（大事件一律返回 -1）。 */
export function campEventEntryId(kind: number, index: number): number {
  return campEventEntries.findIndex(entry => entry.kind === kind && entry.index === index);
}
