/* ——— 营地事件表 ———
   天灾、兽潮按固定顺序各来一次，之后只剩随机事件。

   名字 / 图标 / 描述 / 应对建议放在这里（纯静态），强度与奖励仍在 game-state 里按存档现算。
   这样图鉴（codex-ref.ts / wiki.ts）能读到事件而不用反过来依赖 game-state，
   game-state 反过来引用 campEventDef 也不会形成循环。 */

/** 事件类型：天灾、兽潮按固定顺序各来一次，之后只剩随机事件。 */
export const CAMP_EVENT = { disaster: 0, tide: 1, random: 2 };

/** 大事件（天灾 / 兽潮）：下标即 CAMP_EVENT 的取值。 */
const CAMP_EVENT_DEFS = [
  {
    name: '天灾', icon: '🌪️',
    desc: '沙暴与酸雨同时压向营地，挡墙能撑多久决定了远征的下一步。',
    advice: '营地生命、攻击、防御与恢复越高越稳：把后勤人手压在「营垒修筑」上，再让工坊把资源造成城防。脱战时营地生命会随时间自动恢复，修满再迎战更划算。'
  },
  {
    name: '兽潮', icon: '🐺',
    desc: '污染区的机械兽群朝营火方向推进，它们不打算绕路。',
    advice: '兽潮的攻击与出手频率都比天灾高一档。先确认营地攻击高于它的防御、营地生命是满的再开打；打不动就先回去升级营垒与城防。'
  }
];

/** 随机事件：按主线进度随机触发，强度随主线与胜场一起涨。 */
export const randomEventDefs = [
  { name: '流民求助', icon: '🚶', desc: '一队流民想借营地过夜，身后跟着零散的机械单位。', advice: '随机事件里最弱的一类，营地满血时可以直接应对。' },
  { name: '废弃补给车', icon: '🚚', desc: '翻倒的补给车旁有游荡的机械残骸，运回来就是一笔收获。', advice: '废料奖励比同强度的其他事件高，缺材料时优先打。' },
  { name: '余烬风暴', icon: '🔥', desc: '余烬核心泄漏，带着火星的风暴正朝营火飘来。', advice: '随机事件里最强的一种，精华奖励也最高。营地血量不满时建议跳过，跳过不扣任何东西。' }
];

/** 一条事件的静态定义（不含数值）。kind / index 越界时退回第一项。 */
export function campEventDef(kind: number, index: number): { name: string; icon: string; desc: string; advice: string } {
  if (kind === CAMP_EVENT.random) return randomEventDefs[index] || randomEventDefs[0];
  return CAMP_EVENT_DEFS[kind] || CAMP_EVENT_DEFS[0];
}

/* 图鉴的事件条目表：下标即事件条目 id。
   天灾、兽潮各一条；随机事件三种各一条（随机事件有解锁门槛，见 game-state 的 unlockNotices）。 */
export const campEventEntries: { kind: number; index: number }[] = [
  { kind: CAMP_EVENT.disaster, index: 0 },
  { kind: CAMP_EVENT.tide, index: 0 },
  ...randomEventDefs.map((_, index) => ({ kind: CAMP_EVENT.random, index }))
];

/** 按 kind + index 找条目 id；找不到返回 -1。 */
export function campEventEntryId(kind: number, index: number): number {
  return campEventEntries.findIndex(entry => entry.kind === kind && entry.index === index);
}
