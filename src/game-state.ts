import { zones, enemyTable, ENEMY, ZONE } from './config/zones';
import { items, ITEM, equipTypes, EQUIP_TYPE, itemCategories, categoryOrder, rarities, RARITY } from './config/items';
import { affixes, AFFIX, affixCap, affixMarkup, skills, SKILL, AFFIX_MAX_MULTIPLIER } from './config/affixes';
import type { Achievement, AdventureState, CampBattleState, EquipmentInstance, GameState, LogType, MainlineQuest, MainlineRequirement, ResearchTaskState, UseOutcome } from './types';

export const MAX_OFFLINE_SECONDS = 8 * 60 * 60;
/* v6：强化等级换成词条——实例上存 affixes，道具的 use 变成函数。
   v5：移除等级与经验（xp / level 字段不再存在）。
   v4：装备改成「实例」——物品栏只存可堆叠物品的数量，装备放进 equipment 实例列表，
   equipped 里存实例 id。这样同名装备的每一件都是独立的，词条也挂在实例上。
   v5 及更早的存档格式不兼容，直接作废。 */
const SAVE_KEY = 'ember-expedition-save-v6';
/* ——— 开发者面板的数值覆盖 ———
   攻击力 / 防御力 / 生命上限 / 生命回复 / 出手间隔 / 刷怪间隔 都是算出来的派生值，
   开发者面板不直接改公式，而是用 state.devOverrides 覆盖最终结果（-1 表示不覆盖）。
   正式构建里 __DEV_TOOLS__ 是字面量 false，devOverride 整个函数体会被摇成 `return null`，
   于是线上产物既读不到覆盖值，也不带这些分支。
   注意：这些常量必须在 freshState 之前初始化——它建初始存档时要用 Object.keys(DEV_STAT) 定数组长度。 */
const DEV_STAT = { attack: 0, defense: 1, maxHp: 2, regen: 3, attackInterval: 4, spawnCooldown: 5 };
function devOverride(index: number, target: GameState): number | null {
  if (!__DEV_TOOLS__) return null;
  const value = target.devOverrides?.[index];
  return typeof value === 'number' && value >= 0 ? value : null;
}
export { zones, enemyTable, items, ITEM, ENEMY, ZONE, equipTypes, EQUIP_TYPE, itemCategories, categoryOrder, rarities, RARITY, affixes, AFFIX, affixCap, affixMarkup, skills, SKILL, AFFIX_MAX_MULTIPLIER };

/** 初始区域：营地（不刷怪，只休整）。 */
const CAMP_ZONE_ID = ZONE.camp;
/** 初始战斗区域与初始敌人。 */
const FIRST_COMBAT_ZONE_ID = ZONE.wasteBorder;
const FIRST_ENEMY_ID = zones[FIRST_COMBAT_ZONE_ID].enemyIds[0];

/** 进度文案：x/y，当前值超过目标就按目标显示。 */
const progressText = (current: number, need: number): string => `${Math.min(Math.max(0, Math.floor(current)), need)}/${need}`;
/** 组一个主线节点：condition 由 requirements 推导，具体条件只写一处。 */
const quest = (title: string, description: string, reward: string, requirements: MainlineRequirement[]): MainlineQuest => ({ title, description, reward, requirements, condition: (state: GameState) => requirements.every(entry => entry.done(state)) });

export const mainline: MainlineQuest[] = [
  quest('点亮第一座营火', '让远征队完成第一次战斗，确认荒原边缘仍然可以被穿越。', '获得初始远征资格', [
    { text: (state: GameState) => `击杀怪物 ${progressText(state.totalWins, 1)} 只`, done: (state: GameState) => state.totalWins >= 1 }
  ]),
  quest('清理废弃边境', '击退一批盘踞在旧哨站的机械单位，营地才有空间继续扩建。', '解锁「工坊」系统', [
    { text: (state: GameState) => `累计击杀 ${progressText(state.totalWins, 5)} 只`, done: (state: GameState) => state.totalWins >= 5 }
  ]),
  quest('分析异常电池', '收集旧电池，研究它们为何仍在污染区域中保持电量。', '解锁「研究基地」系统', [
    { text: (state: GameState) => `收集旧电池 ${progressText(state.inventory[ITEM.oldBattery], 3)} 个`, done: (state: GameState) => state.inventory[ITEM.oldBattery] >= 3 }
  ]),
  quest('组建第二支小队', '从重装单位身上回收装甲板，为新伙伴准备一套可靠的装备。', '解锁工坊制造「哨戒弩台」', [
    { text: (state: GameState) => `收集装甲板 ${progressText(state.inventory[ITEM.armorPlate], 3)} 片`, done: (state: GameState) => state.inventory[ITEM.armorPlate] >= 3 }
  ]),
  quest('追踪核心信号', '余烬碎片正在指向更深处的区域。第一章的下一段道路已经出现。', '解锁研究项「信号放大 I」', [
    { text: (state: GameState) => `收集余烬碎片 ${progressText(state.inventory[ITEM.emberShard], 2)} 个`, done: (state: GameState) => state.inventory[ITEM.emberShard] >= 2 }
  ]),
  quest('抵御第一场天灾', '把工坊造出来的城防和后勤小队都压上去，让营地在沙暴里站住。', '营地进入长期战备', [
    { text: (state: GameState) => `成功应对天灾 ${progressText(state.camp.disasterWins, 1)} 次`, done: (state: GameState) => state.camp.disasterWins >= 1 }
  ]),
  quest('击退第一次兽潮', '兽潮不打算绕路。营地攻防与营垒等级决定了这堵墙能不能撑到最后。', '完成营地战备阶段', [
    { text: (state: GameState) => `成功应对兽潮 ${progressText(state.camp.tideWins, 1)} 次`, done: (state: GameState) => state.camp.tideWins >= 1 }
  ])
];

/* ——— 营地 / 后勤小队 / 工坊制造 ———
   营地不直接升级，它靠「其他系统」变强：工坊把资源造成实物（基础城防），后勤小队把人力换成进度。
   主线也因此延伸出两个节点：抵御第一场天灾、击退第一次兽潮。 */
/** 随机事件触发间隔（秒），默认 1 小时。营地页的倒计时进度条要用它算比例。 */
export const RANDOM_EVENT_INTERVAL = 60 * 60;
const PENDING_EVENT_TIMEOUT = 30;        // 事件等待玩家响应的秒数，超时直接跳过
const CAMP_ATTACK_INTERVAL = 1.2;        // 营地出手间隔（秒）
/** 营地裸值：等级 0、没有任何强化时的基础数值。 */
const CAMP_BASE = { hp: 200, attack: 10, defense: 4 };
/** 事件类型：天灾、兽潮按固定顺序各来一次，之后只剩随机事件。 */
export const CAMP_EVENT = { disaster: 0, tide: 1, random: 2 };
/** 后勤小队的可分配去处：下标即 state.logistics.assigned 的下标，顺序不能随意调整。 */
export const LOGISTICS = { camp: 0, workshop: 1 };
export const logisticsTargets = [
  { id: 'camp', name: '营垒修筑', icon: '🧱', desc: '每人每秒贡献 1 工时，每 100 工时提升 1 级营垒，提高营地生命、攻击与防御。' },
  { id: 'workshop', name: '工坊制造', icon: '🔧', desc: '分配的人数就是建造速度：制造耗时 = 该项总工时 ÷ 分配人数。' }
];
/** 工坊的制造项：下标即 state.campWorkshop 的下标，追加新项要放在末尾。
   unlockIndex 是解锁所需的主线进度（mainlineIndex 达到这个值才会在工坊里出现）。 */
export const workshopItems = [
  { name: '基础城防', unlockIndex: 0, icon: '🛡️', desc: '加固营地外围的挡墙与射击位。每级提高营地生命、防御与攻击。', perHp: 25, perDefense: 2, perAttack: 1.5, baseWork: 40, workStep: 30, baseGold: 60, goldStep: 45, baseScrap: 20, scrapStep: 15, basePlate: 1, plateStep: .5 },
  /* 第二支小队到位后才有人值守：弩台偏攻击，造价与工时都比城防高一档。 */
  { name: '哨戒弩台', unlockIndex: 4, icon: '🏹', desc: '在营地四角架起自动弩台。每级提高营地攻击，并小幅提高防御与生命。',
    perHp: 10, perDefense: 1, perAttack: 3, baseWork: 55, workStep: 35, baseGold: 90, goldStep: 70, baseScrap: 30, scrapStep: 22, basePlate: 2, plateStep: .7 }
];
/** 制造项是否已解锁：主线进度不够时工坊里不显示它。 */
export function isWorkshopUnlocked(id: number, target: GameState = state): boolean { return !!workshopItems[id] && target.mainlineIndex >= workshopItems[id].unlockIndex; }
/* ——— 研究基地 ———
   完成「分析异常电池」解锁（mainlineIndex >= 3）。基地会发布资源收集委托：
   交齐指定掉落物换研究点数，研究点数用来提升研究项。 */
export const RESEARCH = {
  /** 委托要求的数量区间：needMin ~ needMax，上限会被「任务难度降低」压低。 */
  needMin: 90, needMax: 110,
  /** 每份委托的研究点数奖励。 */
  reward: 10,
  /** 研究项升级消耗：costBase + costStep × 当前等级。 */
  costBase: 10, costStep: 5
};
/** 研究项：下标即 state.researchLevels 的下标，追加新项要放在末尾。 */
export const RESEARCH_ITEM = { taskNeed: 0, reward: 1 };
export const researchItems = [
  {
    name: '任务难度降低 I', icon: '📉', maxLevel: 10, unlockIndex: 3,
    desc: '整理委托流程，让基地少要点东西。',
    /** 每级的效果：需求数量上限 -1。 */
    effect: (level: number): string => level ? `委托要求的数量上限 -${level} 点` : '尚未研究：研究后每级让要求的数量上限 -1 点'
  },
  {
    name: '信号放大 I', icon: '📡', maxLevel: 10, unlockIndex: 5,
    desc: '把核心信号放大后再解析：同样的委托能换到更多研究点数。',
    effect: (level: number): string => level ? `每份委托的研究点数 +${level}` : '尚未研究：研究后每级让每份委托的研究点数 +1'
  }
];
/** 研究项是否已解锁：主线进度不够时卡片锁着、点了也没反应。 */
export function isResearchItemUnlocked(id: number, target: GameState = state): boolean { return !!researchItems[id] && target.mainlineIndex >= researchItems[id].unlockIndex; }
/** 每份委托的研究点数奖励：基础值 + 「信号放大」的等级。 */
export function getResearchReward(target: GameState = state): number { return RESEARCH.reward + getResearchLevel(RESEARCH_ITEM.reward, target); }

/** 等级加成曲线：前 10 级按 perLevel 线性增长，之后每级只给一半收益（避免后期数值失控）。 */
export function levelBonus(level: number, perLevel: number): number { return Math.round(perLevel * (Math.min(level, 10) + Math.max(0, level - 10) * .5)); }
/** 营垒每级的加成（由营垒修筑的工时堆出来，和工坊制造无关）。 */
export const WORKSITE_BONUS = { hp: 12, attack: 1.5, defense: 1 };
/** 营垒等级：由营垒修筑累计的工时换算而来。 */
export function worksiteLevel(target: GameState = state): number { return Math.floor(Math.max(0, target.camp.worksiteProgress) / 100); }
/** 营垒修筑进度：朝下一级的百分比。 */
export function worksiteProgress(target: GameState = state): number { return Math.max(0, target.camp.worksiteProgress) % 100; }
/** 后勤小队总人数：初始 1 人，随主线进度与累计胜场增长。 */
export function getLogisticsTotal(target: GameState = state): number { return 1 + Math.floor(target.mainlineIndex / 2) + Math.floor(target.totalWins / 20); }
/** 某个后勤系统分到的人数。 */
export function getLogisticsAssigned(index: number, target: GameState = state): number { return Math.max(0, target.logistics.assigned[index] || 0); }
/** 还没分配出去、可以随时调动的人数。 */
export function getIdleLogistics(target: GameState = state): number { return Math.max(0, getLogisticsTotal(target) - assignedSum(target)); }
function assignedSum(target: GameState): number { return target.logistics.assigned.reduce((total, count) => total + Math.max(0, count || 0), 0); }
/** 人数总和不会超过总人数：读档、主线推进导致总人数变化时靠它对齐（用法同 syncEquipSlots）。 */
function syncLogistics(target: GameState): void {
  const total = getLogisticsTotal(target);
  const slots = target.logistics.assigned.length ? target.logistics.assigned : (target.logistics.assigned = logisticsTargets.map(() => 0));
  slots.length = logisticsTargets.length;
  for (let index = 0; index < slots.length; index++) slots[index] = Math.max(0, Math.floor(Number(slots[index]) || 0));
  /* 超出总人数的部分从最后一个分配项开始回收。 */
  let overflow = assignedSum(target) - total;
  for (let index = slots.length - 1; index >= 0 && overflow > 0; index--) { const cut = Math.min(slots[index], overflow); slots[index] -= cut; overflow -= cut; }
}
/** 调整某个后勤系统的人数：delta 为正表示调入，为负表示调出，上限是待命人数。 */
export function assignLogistics(index: number, delta: number): void {
  const current = getLogisticsAssigned(index);
  const target = Math.max(0, Math.min(current + delta, current + (delta > 0 ? getIdleLogistics() : 0)));
  if (target === current) return;
  state.logistics.assigned[index] = target;
  addLog(state, `${logisticsTargets[index].name}的后勤人数调整为 ${target} 人。`, 'system');
  saveState(); notify();
}
/* ——— 营地数值：基础值 + 城防等级加成 + 营垒等级加成 + 其他系统（营火强化 / 研究 / 伙伴）的加成。
   这三个字段目前没有升级入口（对应的快速强化已精简掉），只作为后续系统的数值保留。 */
/** 工坊所有制造项的等级加成之和：按各自等级 × 各自系数累加。 */
function workshopBonus(target: GameState, key: 'perHp' | 'perAttack' | 'perDefense'): number {
  return workshopItems.reduce((total, item, id) => total + levelBonus(target.campWorkshop[id]?.level || 0, item[key]), 0);
}
export function getCampMaxHp(target: GameState = state): number { return Math.round(CAMP_BASE.hp + workshopBonus(target, 'perHp') + worksiteLevel(target) * WORKSITE_BONUS.hp + target.workshop * 20 + target.companions * 15); }
export function getCampAttack(target: GameState = state): number { return Math.round(CAMP_BASE.attack + workshopBonus(target, 'perAttack') + worksiteLevel(target) * WORKSITE_BONUS.attack + target.workshop * 2 + target.research * 3 + target.companions * 2); }
export function getCampDefense(target: GameState = state): number { return Math.round(CAMP_BASE.defense + workshopBonus(target, 'perDefense') + worksiteLevel(target) * WORKSITE_BONUS.defense + target.workshop); }
export function getCampRegen(target: GameState = state): number { return 1.5 + worksiteLevel(target) * .3; }
export function getCampHp(target: GameState = state): number { return Math.max(0, Math.min(getCampMaxHp(target), target.camp.hp)); }
/* ——— 工坊制造 ——— */
/** 这一级需要的总工时；实际耗时 = 总工时 ÷ 分配人数（见 getWorkshopRemaining）。 */
export function getWorkshopWorkTotal(id: number, target: GameState = state): number { const item = workshopItems[id]; return item.baseWork + item.workStep * target.campWorkshop[id].level; }
/** 造这一级要花的资源：金币 + 废料 + 冒险掉落物（装甲板）。 */
export function getWorkshopCost(id: number, target: GameState = state): { gold: number; scrap: number; plate: number } { const item = workshopItems[id]; const level = target.campWorkshop[id].level; return { gold: item.baseGold + item.goldStep * level, scrap: item.baseScrap + item.scrapStep * level, plate: Math.ceil(item.basePlate + item.plateStep * level) }; }
export function isWorkshopBusy(id: number, target: GameState = state): boolean { return target.campWorkshop[id].target >= 0; }
export function canStartWorkshop(id: number, target: GameState = state): boolean { const cost = getWorkshopCost(id, target); return !isWorkshopBusy(id, target) && target.gold >= cost.gold && target.scrap >= cost.scrap && target.inventory[ITEM.armorPlate] >= cost.plate; }
/** 剩余秒数：没有分配后勤人数时返回 Infinity（进度会停住）。 */
export function getWorkshopRemaining(id: number, target: GameState = state): number {
  const workers = getLogisticsAssigned(LOGISTICS.workshop, target);
  const item = target.campWorkshop[id];
  if (!workers || item.target < 0) return Infinity;
  return Math.max(0, (getWorkshopWorkTotal(id, target) - item.work) / workers);
}
/** 制造进度百分比（0~100）。 */
export function getWorkshopProgress(id: number, target: GameState = state): number { const item = target.campWorkshop[id]; if (item.target < 0) return item.level > 0 ? 100 : 0; return Math.max(0, Math.min(100, item.work / getWorkshopWorkTotal(id, target) * 100)); }
/** 真正开工：扣资源、挂上目标等级。auto 表示由后勤小队自动接续（不额外记「开工」日志，只记完工）。 */
function beginWorkshopBuild(id: number, target: GameState, auto = false): boolean {
  if (!canStartWorkshop(id, target)) return false;
  const cost = getWorkshopCost(id, target);
  target.gold -= cost.gold; target.scrap -= cost.scrap; target.inventory[ITEM.armorPlate] -= cost.plate;
  /* 原地改这个对象：advanceLogistics 的循环持有同一个引用，换成新对象会让后续写入丢失。 */
  const item = target.campWorkshop[id];
  item.target = item.level + 1; item.work = 0;
  if (!auto) addLog(target, `工坊开工：${workshopItems[id].name} → Lv.${item.level + 1}（总工时 ${getWorkshopWorkTotal(id, target)}）。`, 'progress');
  return true;
}
/** 手动开工（界面上现在由「分配人数 > 0」自动触发，保留给脚本与调试用）。 */
export function startWorkshopUpgrade(id: number, target: GameState = state): boolean { if (!beginWorkshopBuild(id, target)) return false; saveState(); notify(); return true; }
/* ——— 营地事件 ——— */
const RANDOM_EVENT_DEFS = [
  { name: '流民求助', icon: '🚶', desc: '一队流民想借营地过夜，身后跟着零散的机械单位。' },
  { name: '废弃补给车', icon: '🚚', desc: '翻倒的补给车旁有游荡的机械残骸，运回来就是一笔收获。' },
  { name: '余烬风暴', icon: '🔥', desc: '余烬核心泄漏，带着火星的风暴正朝营火飘来。' }
];
/** 某场事件的强度与奖励：天灾、兽潮随已通过次数变强，随机事件随主线进度变强。 */
function campEventStats(kind: number, id: number, target: GameState): { kind: number; id: number; name: string; icon: string; desc: string; hp: number; attack: number; defense: number; interval: number; rewards: { gold: number; scrap: number; essence: number } } {
  if (kind === CAMP_EVENT.disaster) { const wins = target.camp.disasterWins; return { kind, id, name: `天灾 · 第 ${wins + 1} 次`, icon: '🌪️', desc: '沙暴与酸雨同时压向营地，挡墙能撑多久决定了远征的下一步。', hp: 180 + wins * 140, attack: 9 + wins * 5, defense: 3 + wins * 3, interval: 1.4, rewards: { gold: 150 + wins * 80, scrap: 60 + wins * 30, essence: 1 + wins } }; }
  if (kind === CAMP_EVENT.tide) { const wins = target.camp.tideWins; return { kind, id, name: `兽潮 · 第 ${wins + 1} 次`, icon: '🐺', desc: '污染区的机械兽群朝营火方向推进，它们不打算绕路。', hp: 260 + wins * 200, attack: 12 + wins * 6, defense: 4 + wins * 3, interval: 1.2, rewards: { gold: 220 + wins * 110, scrap: 90 + wins * 40, essence: 2 + wins * 2 } }; }
  const def = RANDOM_EVENT_DEFS[id] || RANDOM_EVENT_DEFS[0];
  const scale = target.mainlineIndex + Math.floor(target.totalWins / 10);
  return { kind: CAMP_EVENT.random, id, name: def.name, icon: def.icon, desc: def.desc, hp: 120 + scale * 45, attack: 7 + scale * 2, defense: 2 + scale, interval: 1.6, rewards: { gold: 90 + scale * 30, scrap: 40 + scale * 15, essence: 1 + Math.floor(scale / 2) } };
}
/** 界面统一按「当前 / 最大」显示事件生命：未开打时两者相同，所以这里把 hp 同时当作 maxHp 给出。 */
export type CampEventStats = ReturnType<typeof campEventStats> & { maxHp: number };
function withMaxHp(stats: ReturnType<typeof campEventStats>): CampEventStats { return { ...stats, maxHp: stats.hp }; }
/** 界面用：拿一场事件的可展示数据（不含战斗中的实时血量）。 */
export function getCampEventInfo(kind: number, id = 0, target: GameState = state): CampEventStats { return withMaxHp(campEventStats(kind, id, target)); }
/** 天灾打完才轮到兽潮；两个都打完就没有大事件了（之后只有随机事件）。 */
export function getNextCampChallenge(target: GameState = state): CampEventStats | null { if (target.camp.disasterWins < 1) return getCampEventInfo(CAMP_EVENT.disaster, 0, target); if (target.camp.tideWins < 1) return getCampEventInfo(CAMP_EVENT.tide, 0, target); return null; }
/** 已经触发、等待玩家响应的事件；没有则返回 null。 */
export function getPendingEvent(target: GameState = state): (CampEventStats & { expiresAt: number }) | null { if (target.camp.pendingKind < 0) return null; return { ...withMaxHp(campEventStats(target.camp.pendingKind, target.camp.pendingId, target)), expiresAt: target.camp.pendingExpires }; }
let campBattle: CampBattleState | null = null;
export function getCampBattle(): CampBattleState | null { return campBattle; }
function beginCampBattle(target: GameState, stats: ReturnType<typeof campEventStats>): void {
  campBattle = { kind: stats.kind, id: stats.id, name: stats.name, icon: stats.icon, campHp: getCampHp(target), campMaxHp: getCampMaxHp(target), eventHp: stats.hp, eventMaxHp: stats.hp, eventAttack: stats.attack, eventDefense: stats.defense, eventInterval: stats.interval, rewards: stats.rewards, campTimer: 0, eventTimer: 0 };
  addLog(target, `${stats.name}来袭，营地防线进入战斗。`, 'battle');
  saveState(); notify();
}
function clearPending(target: GameState): void { target.camp.pendingKind = -1; target.camp.pendingId = -1; target.camp.pendingExpires = 0; }
/** 迎接下一场天灾 / 兽潮（没有时间间隔，玩家随时可以来）。 */
export function startCampChallenge(): boolean { if (campBattle) return false; const stats = getNextCampChallenge(); if (!stats) return false; beginCampBattle(state, stats); return true; }
/** 响应随机事件的弹窗：接受就进入战斗，拒绝（或超时）就跳过。 */
export function answerPendingEvent(accept: boolean): void {
  if (state.camp.pendingKind < 0 || campBattle) return;
  const stats = campEventStats(state.camp.pendingKind, state.camp.pendingId, state);
  clearPending(state);
  if (!accept) { addLog(state, `营地选择回避「${stats.name}」。`, 'system'); saveState(); notify(); return; }
  beginCampBattle(state, stats);
}
/** 设置页的通知开关：决定随机事件是否弹窗提醒（不弹窗也能在营地页看到倒计时）。 */
export function setNotify(enabled: boolean): void { state.settings.notify = !!enabled; addLog(state, enabled ? '随机事件将弹窗提醒。' : '随机事件不再弹窗提醒。', 'system'); saveState(); notify(); }

/* ——— 成就 ———
   条件一旦为真就自动解锁并记一条日志。目前只有「开始游戏」这一条。 */
export const achievements: Achievement[] = [
  { id: 'start', name: '开始游戏', icon: '💋', hint: '进入游戏', reward: '作者的一个飞吻', condition: () => true },
  { id: 'firstBlood', name: '初次冒险', icon: '⚔️', hint: '首次击杀一个怪物', reward: '解锁【怪物图鉴】', condition: (target: GameState) => target.totalWins >= 1, rewardUnlock: { icon: '📖', category: '冒险', name: '怪物图鉴' } }
];
/* ——— 解锁提示 ———
   机制（工坊、研究基地…）解锁时和成就一样弹一条顶部 tips。
   开局就有的系统（营地、后勤小队…）不列在这里，免得一进游戏刷一屏。
   下标即 state.notices 的下标，追加新项要放在末尾（删中间项会让旧存档的「已提示过」标记整体前移，
   最坏只是重复弹一条提示，读档时按新表长度重建即可，不做迁移）。 */
export const unlockNotices = [
  { id: 'workshop', icon: '🔨', category: '工坊', name: '工坊', hint: '完成「清理废弃边境」解锁', unlocked: (target: GameState) => target.mainlineIndex >= 2 },
  { id: 'researchBase', icon: '🧪', category: '研究基地', name: '研究基地', hint: '完成「分析异常电池」解锁', unlocked: (target: GameState) => target.mainlineIndex >= 3 }
];
/** 解锁事件：界面（unlock-toast.ts）订阅它来弹 tips。
    category 是这项东西所在的页面 / 板块，提示会写成「icon 解锁：category「name」」。 */
export interface UnlockEvent { icon: string; category: string; name: string; detail?: string; }
const unlockListeners = new Set<(event: UnlockEvent) => void>();
/** 没有订阅者时先攒着：技能解锁可能发生在界面接管之前（例如读档时立刻检查一次）。 */
const bufferedUnlocks: UnlockEvent[] = [];
export function onUnlock(listener: (event: UnlockEvent) => void): () => void {
  unlockListeners.add(listener);
  if (bufferedUnlocks.length) { bufferedUnlocks.splice(0).forEach(event => listener(event)); }
  return () => unlockListeners.delete(listener);
}
function emitUnlock(event: UnlockEvent): void { if (unlockListeners.size) unlockListeners.forEach(listener => listener(event)); else bufferedUnlocks.push(event); }
function checkUnlocks(target: GameState): void {
  let unlockedAny = false;
  unlockNotices.forEach((entry, index) => {
    if (target.notices[index] || !entry.unlocked(target)) return;
    target.notices[index] = 1;
    unlockedAny = true;
    addLog(target, `新机制解锁：${entry.category}「${entry.name}」`, 'progress');
    emitUnlock({ icon: entry.icon, category: entry.category, name: entry.name, detail: entry.hint });
  });
  /* 立刻写盘：这些「已提示过」的标记如果留到下一次自动保存，刷新后会重复弹同一条 tips。 */
  if (unlockedAny) saveState();
}
export function isAchievementUnlocked(index: number, target: GameState = state): boolean { return !!target.achievements?.[index]; }
/** 按 id 查解锁状态：界面上的「解锁后」奖励项据此生效，避免条件写在两处。 */
export function isAchievementUnlockedById(id: string, target: GameState = state): boolean { const index = achievements.findIndex(entry => entry.id === id); return index >= 0 && isAchievementUnlocked(index, target); }
/** 怪物图鉴的解锁条件就是成就「初次冒险」，所以直接复用它的状态。 */
export function isCodexUnlocked(target: GameState = state): boolean { return isAchievementUnlockedById('firstBlood', target); }
/** 解锁数量，用于界面上的「已解锁 x / y」。 */
export function getUnlockedAchievementCount(target: GameState = state): number { return achievements.reduce((total, _, index) => total + (isAchievementUnlocked(index, target) ? 1 : 0), 0); }
function checkAchievements(target: GameState): void {
  let unlockedAny = false;
  achievements.forEach((entry, index) => {
    if (target.achievements[index] || !entry.condition(target)) return;
    target.achievements[index] = 1;
    unlockedAny = true;
    addLog(target, `成就解锁：${entry.name} —— 解锁后：${entry.reward}`, 'progress');
    emitUnlock({ icon: entry.icon, category: '成就', name: entry.name, detail: `解锁后：${entry.reward}` });
    /* 奖励本身解锁了别的系统时，再补一条那个系统的提示（例如成就「初次冒险」→ 冒险「怪物图鉴」）。 */
    if (entry.rewardUnlock) emitUnlock({ icon: entry.rewardUnlock.icon, category: entry.rewardUnlock.category, name: entry.rewardUnlock.name, detail: `由成就「${entry.name}」解锁` });
  });
  if (unlockedAny) saveState();
}

/** 下标即字体档位 id。 */
export const fontScales = [
  { label: '小', scale: 1 },
  { label: '中', scale: 1.2 },
  { label: '大', scale: 1.5 }
];

const freshAdventure = (): AdventureState => ({
  zoneId: CAMP_ZONE_ID, running: false, enemyId: FIRST_ENEMY_ID, enemyHp: enemyTable[FIRST_ENEMY_ID].maxHp, spawnTimer: 0,
  playerHp: 100, playerAttackTimer: 0, enemyAttackTimer: 0, autoPush: true, battleCount: 0, attackCount: 0
});
const freshState = (): GameState => ({
  gold: 45, scrap: 24, essence: 0, totalWins: 0, mainlineIndex: 0,
  workshop: 0, research: 0, companions: 0, researchPoints: 0, researchTask: { itemId: -1, zoneId: -1, need: 0 }, researchLevels: researchItems.map(() => 0), equipped: equipTypes.map(type => new Array(type.baseSlots).fill(-1)), settings: { fontScale: 0, notify: true, numberFormat: 0 },
  inventory: new Array(items.length).fill(0), equipment: [], nextInstanceId: 1, encountered: new Array(enemyTable.length).fill(0), discoveredDrops: enemyTable.map(() => []), adventure: freshAdventure(),
  /* 后勤小队开局 1 人（全部待命）；工坊只有一个制造项，0 级且空闲；营地满血、随机事件从满间隔开始倒数。 */
  logistics: { assigned: logisticsTargets.map(() => 0) },
  campWorkshop: workshopItems.map(() => ({ level: 0, target: -1, work: 0 })),
  camp: { hp: CAMP_BASE.hp, worksiteProgress: 0, disasterWins: 0, tideWins: 0, randomTimer: RANDOM_EVENT_INTERVAL, pendingKind: -1, pendingId: -1, pendingExpires: 0 },
  achievements: achievements.map(() => 0),
  notices: unlockNotices.map(() => 0),
  devOverrides: new Array(Object.keys(DEV_STAT).length).fill(-1),
  log: [], lastTick: Date.now()
});

let state = freshState();
const listeners = new Set<(state: GameState) => void>();
let lastSave = Date.now();

export function getState(): GameState { return state; }
export function subscribe(listener: (state: GameState) => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
function notify(): void { syncEquipSlots(state); syncLogistics(state); syncCamp(state); checkAchievements(state); checkUnlocks(state); listeners.forEach(listener => listener(state)); }
/** 营地生命值只做上下限对齐：上限随城防 / 营垒提升，脱战时由 tick 的回血填满。 */
function syncCamp(target: GameState): void { target.camp.hp = Math.max(0, Math.min(getCampMaxHp(target), Number(target.camp.hp) || 0)); if (!(target.camp.randomTimer > 0)) target.camp.randomTimer = RANDOM_EVENT_INTERVAL; }
/* 数值与时长格式化统一放在 format.ts，这里转出一份，页面照旧从 game-state 引入。 */
import { formatNumber, formatNumberExact, formatSigned, numberHint, formatDuration, numberFormats, NUMBER_FORMAT } from './format';
export { formatNumber, formatNumberExact, formatSigned, numberHint, formatDuration, numberFormats, NUMBER_FORMAT };

/** 各装备类型的槽位数。目前就是各类型的基础槽位，固定不变。 */
export function getEquipSlotCounts(): number[] { return equipTypes.map(type => type.baseSlots); }
/** 把 equipped 的每个类型对齐到当前应有的槽位数。多出来的槽位直接截掉——装备实例本来就在 equipment 列表里，只会被卸下，不会丢失。 */
function syncEquipSlots(target: GameState): void { const counts = getEquipSlotCounts(); for (let equipType = 0; equipType < counts.length; equipType++) { const slots = target.equipped[equipType] || (target.equipped[equipType] = []); while (slots.length < counts[equipType]) slots.push(-1); slots.length = counts[equipType]; } }
/** 实例 id → 实例。 */
function findEquipment(instanceId: number, target: GameState = state): EquipmentInstance | undefined { return target.equipment.find(instance => instance.id === instanceId); }
/** 实例 id → 实例；实例不存在时返回 undefined。 */
export function getEquipmentInstance(instanceId: number, target: GameState = state): EquipmentInstance | undefined { return findEquipment(instanceId, target); }
/** 实例 id → 物品 id；实例不存在时返回 -1。 */
export function getInstanceItemId(instanceId: number, target: GameState = state): number { const instance = findEquipment(instanceId, target); return instance ? instance.itemId : -1; }
/** 新增 count 个装备实例：每件都是独立个体，id 不复用。 */
function addEquipment(target: GameState, itemId: number, count: number): void { for (let index = 0; index < count; index++) target.equipment.push({ id: target.nextInstanceId++, itemId }); }
/** 持有数量：可堆叠物品看数量，装备数实例个数。物品栏上限按「种类」算，用它判断是不是新种类。 */
export function getOwnedCount(itemId: number, target: GameState = state): number { return items[itemId].stackable ? target.inventory[itemId] || 0 : target.equipment.reduce((total, instance) => (instance.itemId === itemId ? total + 1 : total), 0); }
/** 把某个装备实例从所有槽位上摘掉。正常流程下一个实例只占一个槽位，这里逐槽扫描做兜底。 */
function unequipEverywhere(target: GameState, instanceId: number): void { target.equipped.forEach(slots => { for (let index = 0; index < slots.length; index++) if (slots[index] === instanceId) slots[index] = -1; }); }
/** 单个装备实例自身提供的属性（不含词条）。 */
export function getInstanceBonus(instance: EquipmentInstance): { attack: number; hp: number; defense: number } {
  const base = items[instance.itemId].equip || {};
  return { attack: base.attack || 0, hp: base.hp || 0, defense: base.defense || 0 };
}
/** 已装备实例自身提供的全部加成（不含词条）。装备栏的加成面板和玩家的攻击/生命/防御都从这里取。 */
export function getEquipBonus(target: GameState = state): { attack: number; hp: number; defense: number } {
  const bonus = { attack: 0, hp: 0, defense: 0 };
  for (const slots of target.equipped) for (const instanceId of slots) { const instance = instanceId >= 0 ? findEquipment(instanceId, target) : undefined; if (!instance) continue; const stats = getInstanceBonus(instance); bonus.attack += stats.attack; bonus.hp += stats.hp; bonus.defense += stats.defense; }
  return bonus;
}
/** 已装备实例上所有词条的汇总。pct 是百分比（6 表示 +6%），在最后一步放大玩家的最终属性。 */
export interface AffixTotals { attack: number; hp: number; defense: number; attackPct: number; hpPct: number; skills: { skill: number; value: number }[] }
export function getAffixTotals(target: GameState = state): AffixTotals {
  const totals: AffixTotals = { attack: 0, hp: 0, defense: 0, attackPct: 0, hpPct: 0, skills: [] };
  for (const slots of target.equipped) for (const instanceId of slots) {
    const instance = instanceId >= 0 ? findEquipment(instanceId, target) : undefined;
    if (!instance?.affixes) continue;
    for (const affix of instance.affixes) {
      const effect = affixes[affix.id]?.effect;
      if (!effect) continue;
      totals.attack += (effect.attack || 0) * affix.value;
      totals.hp += (effect.hp || 0) * affix.value;
      totals.defense += (effect.defense || 0) * affix.value;
      totals.attackPct += (effect.attackPct || 0) * affix.value;
      totals.hpPct += (effect.hpPct || 0) * affix.value;
      if (effect.skill !== undefined) totals.skills.push({ skill: effect.skill, value: affix.value });
    }
  }
  return totals;
}
/** 装备栏加成面板的取值键。flat 来自装备自身与固定数值词条，pct 来自百分比词条。 */
export type EquipBonusKey = 'attack' | 'hp' | 'defense' | 'attackPct' | 'hpPct';
/** 装备栏加成面板要列哪几项：下标即面板里的行顺序。flat 表示固定值，pct 表示百分比。 */
export const equipBonusStats: { key: EquipBonusKey; label: string; kind: 'flat' | 'pct' }[] = [
  { key: 'attack', label: '装备攻击力', kind: 'flat' },
  { key: 'hp', label: '装备生命', kind: 'flat' },
  { key: 'defense', label: '装备防御', kind: 'flat' },
  { key: 'attackPct', label: '攻击加成', kind: 'pct' },
  { key: 'hpPct', label: '生命加成', kind: 'pct' }
];
/** 某一项加成的逐件来源：装备自身一条、每条词条一条，没有贡献的不列（悬停详情用）。
    tier 是词条品阶（装备自身用物品稀有度），界面据此着色。 */
export function getEquipBonusSources(key: EquipBonusKey, target: GameState = state): { name: string; value: number; tier: number }[] {
  const sources: { name: string; value: number; tier: number }[] = [];
  for (const slots of target.equipped) for (const instanceId of slots) {
    const instance = instanceId >= 0 ? findEquipment(instanceId, target) : undefined;
    if (!instance) continue;
    const item = items[instance.itemId];
    const base = key === 'attackPct' || key === 'hpPct' ? 0 : getInstanceBonus(instance)[key];
    if (base) sources.push({ name: item.name, value: base, tier: item.rarity });
    for (const affix of instance.affixes || []) { const definition = affixes[affix.id]; const value = (definition.effect[key] || 0) * affix.value; if (value) sources.push({ name: `${item.name} · ${definition.name}`, value, tier: definition.tier }); }
  }
  return sources;
}
/** 防御力：来自装备自身与词条，减免受到的伤害（见 enemyAttack）。 */
export function getPlayerDefense(target: GameState = state): number { const override = devOverride(DEV_STAT.defense, target); if (override !== null) return override; return getEquipBonus(target).defense + getAffixTotals(target).defense; }
/** 这个装备实例是否在某个槽位上。参数是实例 id 而不是物品 id——同名装备的各件互不影响。 */
export function isEquipped(instanceId: number, target: GameState = state): boolean { return instanceId >= 0 && target.equipped.some(slots => slots.includes(instanceId)); }
/** 生命上限：先加固定值（基础 + 工坊 + 伙伴 + 装备 + 固定词条），最后按百分比词条放大。 */
export function getPlayerMaxHp(target: GameState = state): number { const override = devOverride(DEV_STAT.maxHp, target); if (override !== null) return override; const totals = getAffixTotals(target); const flat = 100 + target.workshop * 15 + target.companions * 25 + getEquipBonus(target).hp + totals.hp; return Math.round(flat * (1 + totals.hpPct / 100)); }
export function getPlayerRegen(target: GameState = state): number { const override = devOverride(DEV_STAT.regen, target); if (override !== null) return override; return 2 + target.workshop * .8 + target.companions * 1.5; }
/** 进入战斗区域、以及击杀敌人之后，下一个敌人出现所需的刷新冷却（秒）。 */
export const SPAWN_COOLDOWN = 3;
/** 营地区域的基础回复倍率：在营地里生命回复速度 = 野外回复速度 × 这个值。 */
export const CAMP_REGEN_MULTIPLIER = 5;
/** 当前区域的回复倍率：营地用营地倍率，战斗区域为 1。 */
export function getRegenMultiplier(target: GameState = state): number { return isCampZone(currentZoneId(target)) ? CAMP_REGEN_MULTIPLIER : 1; }
/** 攻击力：先加固定值（基础 + 工坊 + 研究 + 伙伴 + 装备 + 固定词条），最后按百分比词条放大。 */
export function getPlayerAttack(target: GameState = state): number { const override = devOverride(DEV_STAT.attack, target); if (override !== null) return override; const totals = getAffixTotals(target); const flat = 12 + target.workshop * 3 + target.research * 5 + target.companions * 4 + getEquipBonus(target).attack + totals.attack; return Math.round(flat * (1 + totals.attackPct / 100)); }
/* 出手间隔下限 0.1 秒：覆盖值给到 0 会让战斗循环里 step 恒为 0，卡死主循环。 */
export function getPlayerAttackInterval(target: GameState = state): number { const override = devOverride(DEV_STAT.attackInterval, target); if (override !== null) return Math.max(.1, override); return Math.max(.9, 2.2 - target.research * .08); }
/** 刷怪间隔：击杀 / 进入区域后到下一个敌人出现的秒数（可被开发者面板覆盖，同样有 0.1 秒下限）。 */
export function getSpawnCooldown(target: GameState = state): number { const override = devOverride(DEV_STAT.spawnCooldown, target); return override !== null ? Math.max(.1, override) : SPAWN_COOLDOWN; }
/* 物品栏上限按「种类」算：同一种物品可以无限叠加，只有新种类才会占用空位。 */
export function getInventoryCapacity(target: GameState = state): number { return 8 + target.workshop * 2 + target.companions; }
/** 已占用格数：可堆叠物品按「种类」算一类一格；不可堆叠（装备）一件一格，同名的每一件都要各自占一格。 */
export function getInventoryUsed(target: GameState = state): number { let kinds = 0; for (const quantity of target.inventory) if (quantity > 0) kinds += 1; return kinds + target.equipment.length; }
export function currentZoneId(target: GameState = state): number { return zones[target.adventure.zoneId] ? target.adventure.zoneId : CAMP_ZONE_ID; }
export function currentZone(target: GameState = state) { return zones[currentZoneId(target)]; }
/** 营地这类没有敌人的区域：不刷怪，只按倍率回复生命值。 */
export function isCampZone(zoneId: number): boolean { return !zones[zoneId] || zones[zoneId].enemyIds.length === 0; }
/** 该怪物是否已经遭遇过（击杀过）：只有击杀过的怪物才会被图鉴收录。 */
export function isEncountered(enemyId: number, target: GameState = state): boolean { return !!target.encountered?.[enemyId]; }
/** 这只怪物的这条掉落是否已经被玩家实际拿到过：图鉴据此逐条揭示掉落表。 */
export function isDropDiscovered(enemyId: number, itemId: number, target: GameState = state): boolean { return !!target.discoveredDrops?.[enemyId]?.includes(itemId); }
export function currentEnemy(target: GameState = state) { return enemyTable[target.adventure.enemyId] || enemyTable[zones[currentZoneId(target)].enemyIds[0]] || enemyTable[FIRST_ENEMY_ID]; }
export function getEnemyAttackInterval(target: GameState = state): number { return currentEnemy(target).attackInterval; }
/* 目前所有区域都开放；后续做进度门槛时改这里的判断即可。 */
/** 区域是否解锁：主线进度达到 unlockIndex 才开放（营地为 0，一直可进）。 */
export function isZoneUnlocked(zoneId: number, target: GameState = state): boolean { return !!zones[zoneId] && target.mainlineIndex >= zones[zoneId].unlockIndex; }

function addLog(target: GameState, message: string, type: LogType = 'system'): void { target.log = [{ time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), message, type }, ...target.log].slice(0, 160); }
function updateMainline(target: GameState): void { while (target.mainlineIndex < mainline.length && mainline[target.mainlineIndex].condition(target)) { target.mainlineIndex += 1; const messages: Record<number, string> = { 2: '旧工坊重新亮起。现在可以把冒险带回的废料变成长期战力。', 3: '研究台接入了旧电池。新的升级路线已经开放。', 4: '你收到了幸存者的回应。伙伴系统已经可以使用。', 5: '余烬碎片指向更深处的道路。边境调查阶段完成。', 6: '营地挡下了第一场天灾，防线经验开始积累。', 7: '兽潮退去，营地战备阶段完成。荒野深处还有更大的信号。' }; addLog(target, messages[target.mainlineIndex] || '主线记录已更新。', 'progress'); } }
function chooseEnemyId(target: GameState): number { const ids = zones[currentZoneId(target)].enemyIds; return ids.length ? ids[Math.floor(Math.random() * ids.length)] : FIRST_ENEMY_ID; }
function prepareEnemy(target: GameState, enemyId = chooseEnemyId(target)): void { const enemy = enemyTable[enemyId]; const shouldRestore = !Number.isFinite(target.adventure.playerHp) || target.adventure.playerHp <= 0; target.adventure.enemyId = enemyId; target.adventure.enemyHp = enemy.maxHp; target.adventure.spawnTimer = 0; if (shouldRestore) target.adventure.playerHp = getPlayerMaxHp(target); target.adventure.playerAttackTimer = 0; target.adventure.enemyAttackTimer = 0; }
/** 敌人离场（被击杀或进入区域）后进入刷新冷却，冷却结束才会 prepareEnemy 出新敌人。 */
function startSpawnCooldown(target: GameState): void { target.adventure.spawnTimer = getSpawnCooldown(target); }
function randomAmount(min: number, max: number): number { return min + Math.floor(Math.random() * (max - min + 1)); }
/** 记录「这只怪物的这条掉落已经拿到过」，图鉴据此揭示对应条目。 */
function revealDrop(target: GameState, enemyId: number, itemId: number): void { const list = target.discoveredDrops[enemyId] || (target.discoveredDrops[enemyId] = []); if (!list.includes(itemId)) list.push(itemId); }
/* 只有真正进了包才算「获得」：被物品栏上限拒收的不揭示。 */
function grantDrops(target: GameState, enemyId: number): void { const enemy = enemyTable[enemyId]; enemy.dropTable.forEach(drop => { if (Math.random() > drop.chance) return; const item = items[drop.itemId]; /* 可堆叠的进数量，装备每件都建成独立实例；拿完如果超出上限，就丢掉刚拿到的这一件。 */
const amount = randomAmount(drop.min, drop.max); /* 装备每件都建成独立实例，可堆叠的进数量。 */ if (item.stackable) { target.inventory[drop.itemId] += amount; if (drop.itemId === ITEM.scrap) target.scrap += amount; if (drop.itemId === ITEM.emberShard) target.essence += amount; } else addEquipment(target, drop.itemId, amount); revealDrop(target, enemyId, drop.itemId); addLog(target, `掉落：${item.name} ×${amount}`, 'drop'); /* 超上限就把刚拿到的这件丢掉，不动玩家原有的东西。 */ trimInventoryOverflow(target, drop.itemId); }); }
/* 击杀才记入图鉴：仅仅遇到（prepareEnemy）不算。 */
function defeatEnemy(target: GameState, enemyId: number): void { const enemy = enemyTable[enemyId]; target.gold += enemy.gold; target.totalWins += 1; target.adventure.battleCount += 1; target.encountered[enemyId] = 1; addLog(target, `击败「${enemy.name}」，获得 ${enemy.gold} 金币。`, 'battle'); grantDrops(target, enemyId); updateMainline(target); startSpawnCooldown(target); }
/* 伤害 = 攻击力 − 对方防御，至少 1 点：防御只能减免，不能完全免伤。
   词条赋予的技能按出手次数触发，额外叠一记倍率伤害（强度取词条数值的百分比）。 */
function playerAttack(target: GameState): void { const enemy = currentEnemy(target); target.adventure.attackCount += 1; const attack = getPlayerAttack(target); let damage = Math.max(1, attack - (enemy.defense || 0)); const triggered = []; for (const entry of getAffixTotals(target).skills) { const skill = skills[entry.skill]; if (!skill || target.adventure.attackCount % skill.interval !== 0) continue; damage += Math.round(attack * skill.multiplier * entry.value / 100); triggered.push(skill.name); } target.adventure.enemyHp = Math.max(0, target.adventure.enemyHp - damage); addLog(target, `${triggered.length ? `${triggered.join('、')}触发！` : ''}你攻击「${enemy.name}」，造成 ${damage} 点伤害。`, 'battle'); if (target.adventure.enemyHp <= 0) defeatEnemy(target, target.adventure.enemyId); }
function enemyAttack(target: GameState): void { const enemy = currentEnemy(target); const damage = Math.max(1, enemy.attack - getPlayerDefense(target)); target.adventure.playerHp = Math.max(0, target.adventure.playerHp - damage); addLog(target, `「${enemy.name}」反击，造成 ${damage} 点伤害。`, 'battle'); if (target.adventure.playerHp <= 0) { target.adventure.running = false; target.adventure.playerHp = getPlayerMaxHp(target); target.adventure.playerAttackTimer = 0; target.adventure.enemyAttackTimer = 0; target.adventure.spawnTimer = 0; target.adventure.zoneId = CAMP_ZONE_ID; addLog(target, '远征队生命值归零，已撤回营地并恢复状态。', 'defeat'); } }
/** 按当前区域的回复倍率回血：营地是野外的 CAMP_REGEN_MULTIPLIER 倍。 */
function applyRegen(target: GameState, seconds: number): void { if (!(seconds > 0)) return; target.adventure.playerHp = Math.min(getPlayerMaxHp(target), target.adventure.playerHp + getPlayerRegen(target) * getRegenMultiplier(target) * seconds); }
function advanceAdventure(target: GameState, seconds: number): void { if (isCampZone(currentZoneId(target))) { applyRegen(target, seconds); return; } if (!target.adventure.running) return; let remaining = Math.max(0, seconds); while (remaining > 0 && target.adventure.running) { /* 刷怪冷却：场上没有敌人，只回复生命值。 */ if (target.adventure.spawnTimer > 0) { const wait = Math.min(remaining, target.adventure.spawnTimer); target.adventure.spawnTimer -= wait; applyRegen(target, wait); remaining -= wait; if (target.adventure.spawnTimer > 0) break; prepareEnemy(target); continue; } const enemy = currentEnemy(target); const playerInterval = getPlayerAttackInterval(target); const playerWait = Math.max(0, playerInterval - target.adventure.playerAttackTimer); const enemyWait = Math.max(0, enemy.attackInterval - target.adventure.enemyAttackTimer); const step = Math.min(remaining, playerWait, enemyWait); target.adventure.playerAttackTimer += step; target.adventure.enemyAttackTimer += step; applyRegen(target, step); remaining -= step; if (target.adventure.playerAttackTimer >= playerInterval - .0001) { target.adventure.playerAttackTimer = 0; playerAttack(target); } if (target.adventure.running && target.adventure.enemyAttackTimer >= enemy.attackInterval - .0001) { target.adventure.enemyAttackTimer = 0; enemyAttack(target); } if (step === 0 && target.adventure.running) { target.adventure.playerAttackTimer = 0; target.adventure.enemyAttackTimer = 0; } } }
/* ——— 营地 / 后勤小队的推进 ———
   分配出去的每个人每秒贡献 1 工时：营垒修筑把它换成营垒等级，工坊制造把它换成制造进度。 */
function advanceLogistics(target: GameState, seconds: number): void {
  if (!(seconds > 0)) return;
  const builders = getLogisticsAssigned(LOGISTICS.camp, target);
  if (builders > 0) target.camp.worksiteProgress += builders * seconds;
  const workers = getLogisticsAssigned(LOGISTICS.workshop, target);
  if (workers <= 0) return;
  /* 只要分到工坊的人 > 0，就自动接着造下一级：资源不够时 beginWorkshopBuild 会失败，进度自然停住。
     budget 是这一轮能投入的秒数，循环让离线追赶（一大段 seconds）也能连造好几级。 */
  /* 人手按制造项顺序投入：先把人给第一个能开工的项，做完再轮到下一个。
     不能让每项各用一次 workers —— 那样同一批人会被算两遍，两项一起造反而更快。 */
  let budget = seconds;
  for (let id = 0; id < target.campWorkshop.length && budget > 0; id++) {
    const item = target.campWorkshop[id];
    for (let guard = 0; guard < 100 && budget > 0; guard++) {
      if (item.target < 0 && !beginWorkshopBuild(id, target, true)) break;
      const need = (getWorkshopWorkTotal(id, target) - item.work) / workers;
      if (need > budget) { item.work += workers * budget; budget = 0; break; }
      budget -= need; item.level = item.target; item.target = -1; item.work = 0;
      addLog(target, `工坊完成制造：${workshopItems[id].name} 提升至 Lv.${item.level}，营地数值提高。`, 'progress');
      updateMainline(target);
    }
  }
}
/** 营地战斗：双方按各自间隔出手，谁先归零谁输。 */
function advanceCampBattle(target: GameState, seconds: number): void {
  const battle = campBattle!;
  let remaining = Math.max(0, seconds);
  while (remaining > 0 && campBattle) {
    const campWait = Math.max(0, CAMP_ATTACK_INTERVAL - battle.campTimer);
    const eventWait = Math.max(0, battle.eventInterval - battle.eventTimer);
    const step = Math.min(remaining, campWait, eventWait);
    battle.campTimer += step; battle.eventTimer += step; remaining -= step;
    if (battle.campTimer >= CAMP_ATTACK_INTERVAL - .0001) {
      battle.campTimer = 0;
      const damage = Math.max(1, getCampAttack(target) - battle.eventDefense);
      battle.eventHp = Math.max(0, battle.eventHp - damage);
      addLog(target, `营地防线反击「${battle.name}」，造成 ${damage} 点伤害。`, 'battle');
    }
    if (campBattle && battle.eventTimer >= battle.eventInterval - .0001) {
      battle.eventTimer = 0;
      const damage = Math.max(1, battle.eventAttack - getCampDefense(target));
      battle.campHp = Math.max(0, battle.campHp - damage);
      addLog(target, `「${battle.name}」冲击营地，造成 ${damage} 点伤害。`, 'battle');
    }
    if (!battle.eventHp) { finishCampBattle(target, true); return; }
    if (!battle.campHp) { finishCampBattle(target, false); return; }
    /* 两边间隔都还没走完时 step 会是 0，清掉计时避免死循环。 */
    if (step === 0 && campBattle) { battle.campTimer = 0; battle.eventTimer = 0; }
  }
}
function finishCampBattle(target: GameState, won: boolean): void {
  const battle = campBattle!;
  campBattle = null;
  if (won) {
    target.gold += battle.rewards.gold; target.scrap += battle.rewards.scrap; target.essence += battle.rewards.essence;
    if (battle.kind === CAMP_EVENT.disaster) target.camp.disasterWins += 1;
    if (battle.kind === CAMP_EVENT.tide) target.camp.tideWins += 1;
    target.camp.hp = getCampMaxHp(target);
    addLog(target, `「${battle.name}」被击退：获得 ${battle.rewards.gold} 金币、${battle.rewards.scrap} 废料、${battle.rewards.essence} 精华。`, 'progress');
    updateMainline(target);
  } else {
    /* 输了不归零：营地留下 35% 生命，修整后可以再迎战（资源不退还）。 */
    target.camp.hp = Math.max(1, Math.round(getCampMaxHp(target) * .35));
    addLog(target, `「${battle.name}」冲垮了防线，营地受损。强化营地后再来一次。`, 'defeat');
  }
  saveState(); notify();
}
/** 没有战斗时：营地按恢复速度回血；随机事件倒计时到点就触发，等待响应超时则跳过。 */
function advanceCamp(target: GameState, seconds: number): void {
  if (!(seconds > 0)) return;
  if (campBattle) { advanceCampBattle(target, seconds); return; }
  target.camp.hp = Math.min(getCampMaxHp(target), getCampHp(target) + getCampRegen(target) * seconds);
  if (target.camp.pendingKind >= 0) {
    if (Date.now() >= target.camp.pendingExpires) { clearPending(target); addLog(target, `${PENDING_EVENT_TIMEOUT} 秒内没有响应，这次突发状况已经过去。`, 'system'); }
    return;
  }
  target.camp.randomTimer -= seconds;
  if (target.camp.randomTimer > 0) return;
  target.camp.randomTimer = RANDOM_EVENT_INTERVAL;
  const id = Math.floor(Math.random() * RANDOM_EVENT_DEFS.length);
  target.camp.pendingKind = CAMP_EVENT.random; target.camp.pendingId = id; target.camp.pendingExpires = Date.now() + PENDING_EVENT_TIMEOUT * 1000;
  addLog(target, `营地收到警报：${RANDOM_EVENT_DEFS[id].name}。${PENDING_EVENT_TIMEOUT} 秒内决定是否应对。`, 'progress');
}
function hydrate(): void { const initial = freshState(); try { const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (!saved) { state = initial; return; } /* 装备实例先重建出来：equipped 里存的是实例 id，要据此校验槽位引用是否还有效。 */ const equipment: EquipmentInstance[] = (Array.isArray(saved.equipment) ? saved.equipment : []).filter((entry: any) => entry && items[entry.itemId] && items[entry.itemId].category === 'equipment').map((entry: any) => ({ id: Math.max(1, Math.floor(Number(entry.id) || 0)), itemId: entry.itemId, affixes: (Array.isArray(entry.affixes) ? entry.affixes : []).filter((affix: any) => affix && affixes[affix.id]).map((affix: any) => ({ id: affix.id, value: Math.min(affixCap(affix.id), Math.max(0, Math.floor(Number(affix.value) || 0))) })) })); const equipmentIds = new Set(equipment.map(instance => instance.id)); state = { ...initial, ...saved, equipped: equipTypes.map((type, equipType) => { const savedSlots = saved.equipped?.[equipType]; return Array.isArray(savedSlots) ? savedSlots.map(instanceId => (equipmentIds.has(instanceId) ? instanceId : -1)) : new Array(type.baseSlots).fill(-1); }), equipment, nextInstanceId: equipment.reduce((next, instance) => Math.max(next, instance.id + 1), 1), settings: { ...initial.settings, ...saved.settings }, inventory: initial.inventory.map((_, itemId) => (items[itemId].stackable ? Math.max(0, Math.floor(Number(saved.inventory?.[itemId]) || 0)) : 0)), encountered: enemyTable.map((_, enemyId) => (saved.encountered?.[enemyId] ? 1 : 0)), discoveredDrops: enemyTable.map((_, enemyId) => (Array.isArray(saved.discoveredDrops?.[enemyId]) ? saved.discoveredDrops[enemyId].filter((itemId: number) => items[itemId]) : [])), adventure: { ...initial.adventure, ...saved.adventure }, logistics: { assigned: logisticsTargets.map((_, index) => Math.max(0, Math.floor(Number(saved.logistics?.assigned?.[index]) || 0))) }, campWorkshop: workshopItems.map((_, id) => { const entry = saved.campWorkshop?.[id]; return { level: Math.max(0, Math.floor(Number(entry?.level) || 0)), target: Number.isFinite(entry?.target) ? Math.floor(entry.target) : -1, work: Math.max(0, Number(entry?.work) || 0) }; }), camp: { ...initial.camp, ...saved.camp, hp: Math.max(0, Number(saved.camp?.hp) || initial.camp.hp) }, achievements: achievements.map((_, index) => (saved.achievements?.[index] ? 1 : 0)), notices: unlockNotices.map((_, index) => (saved.notices?.[index] ? 1 : 0)), devOverrides: initial.devOverrides.map((_, index) => (Number.isFinite(saved.devOverrides?.[index]) ? Math.floor(saved.devOverrides[index]) : -1)), ...readResearchState(saved), log: [] }; if (!zones[state.adventure.zoneId]) state.adventure.zoneId = CAMP_ZONE_ID; if (isCampZone(state.adventure.zoneId)) state.adventure.running = false; if (!Number.isFinite(state.adventure.spawnTimer)) state.adventure.spawnTimer = 0; if (state.adventure.spawnTimer <= 0 && (!enemyTable[state.adventure.enemyId] || !state.adventure.enemyHp)) prepareEnemy(state); const offlineSeconds = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, (Date.now() - (saved.lastTick || Date.now())) / 1000)); if (offlineSeconds >= 3) { if (state.adventure.running) { const before = state.totalWins; advanceAdventure(state, offlineSeconds); addLog(state, `你离开了 ${formatDuration(offlineSeconds)}。远征队完成了 ${formatNumber(state.totalWins - before)} 场战斗。`, 'system'); } else if (isCampZone(currentZoneId(state))) { advanceAdventure(state, offlineSeconds); addLog(state, `你离开了 ${formatDuration(offlineSeconds)}。远征队在营地休整。`, 'system'); } } } catch { state = initial; }
  /* 离线期间后勤小队与营地也要继续走：营垒 / 工坊进度、营地回血、随机事件计时与待响应事件的超时。
     state.lastTick 此刻还是存档里的旧时间戳（{ ...initial, ...saved } 覆盖而来）。 */
  const offlineForCamp = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, (Date.now() - state.lastTick) / 1000));
  if (offlineForCamp >= 1) { advanceLogistics(state, offlineForCamp); advanceCamp(state, offlineForCamp); }
  state.lastTick = Date.now(); syncEquipSlots(state); syncLogistics(state); syncCamp(state); checkAchievements(state); checkUnlocks(state);
  /* 旧存档（或改过的存档）可能带着超过上限的负载：进来先压回上限。 */
  trimInventoryOverflow(state); }
function saveState(): void { state.lastTick = Date.now(); try { /* 战斗日志不写入存档：它占了全量 JSON 的绝大部分，而刷新后重建的成本极低。 */ const { log, ...persisted } = state; localStorage.setItem(SAVE_KEY, JSON.stringify(persisted)); } catch {} }

/* 进入战斗区域立刻自动开战；进入营地这类非战斗区域则停下战斗、开始休整。 */
export function selectZone(zoneId: number): void { const zone = zones[zoneId]; if (!zone || !isZoneUnlocked(zoneId)) return; state.adventure.zoneId = zoneId; state.adventure.playerAttackTimer = 0; state.adventure.enemyAttackTimer = 0; if (isCampZone(zoneId)) { state.adventure.running = false; state.adventure.spawnTimer = 0; addLog(state, `远征队回到「${zone.name}」，开始休整。`, 'system'); } else { state.adventure.running = true; startSpawnCooldown(state); addLog(state, `远征队进入「${zone.name}」，等待敌人出现。`, 'system'); } saveState(); notify(); }
export function toggleAutoPush(): void { state.adventure.autoPush = !state.adventure.autoPush; saveState(); notify(); }
/* ——— 研究基地 ———
   委托只索取「已解锁区域里怪物会掉的、可堆叠的」物品，数量在 needMin ~ needMax 之间随机；
   needMax 会被研究项「任务难度降低」压低。交齐即得研究点数，研究点数用来提升研究项。 */
/** 由「分析异常电池」解锁（mainline 下标 2 完成后 mainlineIndex 变成 3）。 */
export function isResearchUnlocked(target: GameState = state): boolean { return target.mainlineIndex >= 3; }
/** 读档时把研究基地的字段规整成合法值：旧存档没有这些字段，越界的等级也要压回上限。 */
function readResearchState(saved: any): { researchPoints: number; researchTask: ResearchTaskState; researchLevels: number[] } {
  const task = saved?.researchTask;
  return {
    researchPoints: Math.max(0, Math.floor(Number(saved?.researchPoints) || 0)),
    researchTask: { itemId: Number.isFinite(task?.itemId) ? Math.floor(task.itemId) : -1, zoneId: Number.isFinite(task?.zoneId) ? Math.floor(task.zoneId) : -1, need: Math.max(0, Math.floor(Number(task?.need) || 0)) },
    researchLevels: researchItems.map((entry, id) => Math.min(entry.maxLevel, Math.max(0, Math.floor(Number(saved?.researchLevels?.[id]) || 0))))
  };
}
/** 委托物品池：已解锁区域里的怪物会掉的、可堆叠的物品（装备一件一格，不适合当收集目标）。 */
/** 委托候选：物品 + 它所在的区域（同一掉落物可能多个区域都掉，取最先出现的那个区域）。 */
function researchDropPool(target: GameState): { itemId: number; zoneId: number }[] {
  const pool = new Map<number, number>();
  zones.forEach((zone, zoneId) => {
    if (!zone.enemyIds.length || !isZoneUnlocked(zoneId, target)) return;
    zone.enemyIds.forEach(enemyId => enemyTable[enemyId]?.dropTable?.forEach(drop => { if (items[drop.itemId]?.stackable && !pool.has(drop.itemId)) pool.set(drop.itemId, zoneId); }));
  });
  return [...pool].map(([itemId, zoneId]) => ({ itemId, zoneId }));
}
/** 需求数量的上限：被「任务难度降低」逐级压低，但不低于下限。 */
export function getResearchNeedMax(target: GameState = state): number { return Math.max(RESEARCH.needMin, RESEARCH.needMax - getResearchLevel(RESEARCH_ITEM.taskNeed, target)); }
function rollResearchTask(target: GameState): ResearchTaskState {
  const pool = researchDropPool(target);
  if (!pool.length) return { itemId: -1, zoneId: -1, need: 0 };
  const min = RESEARCH.needMin;
  const max = getResearchNeedMax(target);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return { itemId: pick.itemId, zoneId: pick.zoneId, need: min + Math.floor(Math.random() * (max - min + 1)) };
}
/** 当前委托：没有（或存档里的数据失效）就立刻发布一份。 */
export function getResearchTask(target: GameState = state): ResearchTaskState {
  const task = target.researchTask;
  if (!task || !items[task.itemId] || !zones[task.zoneId] || !(task.need > 0)) target.researchTask = rollResearchTask(target);
  return target.researchTask;
}
/** 已交数量（按 need 截断，避免进度条超过 100%）。 */
export function getResearchProgress(target: GameState = state): number { const task = getResearchTask(target); return Math.min(target.inventory[task.itemId] || 0, task.need); }
export function canSubmitResearchTask(target: GameState = state): boolean {
  if (!isResearchUnlocked(target)) return false;
  const task = getResearchTask(target);
  return task.itemId >= 0 && (target.inventory[task.itemId] || 0) >= task.need;
}
export function submitResearchTask(): void {
  if (!canSubmitResearchTask(state)) return;
  const task = getResearchTask(state);
  state.inventory[task.itemId] -= task.need;
  /* 金币 / 精华是与物品栏同步的镜像资源，扣物品时一起扣（见 discardItem）。 */
  if (task.itemId === ITEM.scrap) state.scrap = Math.max(0, state.scrap - task.need);
  if (task.itemId === ITEM.emberShard) state.essence = Math.max(0, state.essence - task.need);
  const reward = getResearchReward(state);
  state.researchPoints += reward;
  addLog(state, `研究基地完成委托：交付 ${items[task.itemId].name} ×${task.need}，获得研究点数 ${reward}。`, 'progress');
  state.researchTask = rollResearchTask(state);
  saveState(); notify();
}
export function getResearchLevel(id: number, target: GameState = state): number {
  const entry = researchItems[id];
  return entry ? Math.min(entry.maxLevel, Math.max(0, Math.floor(target.researchLevels?.[id] || 0))) : 0;
}
/** 升级消耗：costBase + costStep × 当前等级。 */
export function getResearchCost(id: number, target: GameState = state): number { return RESEARCH.costBase + RESEARCH.costStep * getResearchLevel(id, target); }
export function canUpgradeResearch(id: number, target: GameState = state): boolean {
  const entry = researchItems[id];
  if (!entry || !isResearchUnlocked(target) || !isResearchItemUnlocked(id, target)) return false;
  return getResearchLevel(id, target) < entry.maxLevel && target.researchPoints >= getResearchCost(id, target);
}
/** 升一级（内部用：不写盘、不记日志，方便「升到最大」连续调用）。 */
function levelUpResearch(id: number): boolean {
  if (!canUpgradeResearch(id, state)) return false;
  state.researchPoints -= getResearchCost(id, state);
  state.researchLevels[id] = getResearchLevel(id, state) + 1;
  return true;
}
export function upgradeResearchItem(id: number): void {
  if (!levelUpResearch(id)) return;
  addLog(state, `研究「${researchItems[id].name}」提升至 Lv.${getResearchLevel(id)}。`, 'progress');
  saveState(); notify();
}
/** 右键：一直升到点数不够或满级为止。 */
export function upgradeResearchItemToMax(id: number): void {
  let count = 0;
  while (levelUpResearch(id)) count += 1;
  if (!count) return;
  addLog(state, `研究「${researchItems[id].name}」连升 ${count} 级，当前 Lv.${getResearchLevel(id)}。`, 'progress');
  saveState(); notify();
}
/** 丢弃可堆叠物品（资源、消耗品）。装备请用 discardEquipment —— 每一件都是独立实例。 */
export function discardItem(itemId: number, amount = 1): void { const item = items[itemId]; const owned = state.inventory[itemId] || 0; const count = Math.min(owned, Math.max(1, Math.floor(amount))); if (!item || !item.stackable || !count) return; state.inventory[itemId] = owned - count; if (itemId === ITEM.scrap) state.scrap = Math.max(0, state.scrap - count); if (itemId === ITEM.emberShard) state.essence = Math.max(0, state.essence - count); addLog(state, `丢弃了 ${item.name} ×${count}。`, 'system'); saveState(); notify(); }
/* ——— 物品栏上限 ———
   负载必须 ≤ 上限。旧存档、开发者面板都可能把负载顶到上限以上，所以超出时直接丢弃多出来的部分：
   先丢装备实例（一件一格、最容易超），再整类丢可堆叠物品。 */
function dropStack(target: GameState, itemId: number): void {
  const item = items[itemId];
  const count = target.inventory[itemId] || 0;
  if (!item || !item.stackable || count <= 0) return;
  target.inventory[itemId] = 0;
  if (itemId === ITEM.scrap) target.scrap = Math.max(0, target.scrap - count);
  if (itemId === ITEM.emberShard) target.essence = Math.max(0, target.essence - count);
  addLog(target, `物品栏已满，${item.name} ×${count} 被丢弃。`, 'system');
}
/** 把负载压回上限。
    preferItemId 是「刚获得的那件物品」：优先把它丢掉（丢新不丢旧）——
    装备实例从末尾出栈（最后加进来的就是最新那件），可堆叠物品则整类丢掉刚拿到的那种。
    没给 preferItemId（例如读档时清理旧存档）就按老顺序：先丢装备实例，再丢最靠前的可堆叠种类。 */
export function trimInventoryOverflow(target: GameState = state, preferItemId = -1): void {
  let overflow = getInventoryUsed(target) - getInventoryCapacity(target);
  if (overflow <= 0) return;
  if (preferItemId >= 0 && items[preferItemId]?.stackable && target.inventory[preferItemId] > 0) { dropStack(target, preferItemId); overflow -= 1; }
  while (overflow > 0 && target.equipment.length) {
    const instance = target.equipment.pop()!;
    unequipEverywhere(target, instance.id);
    addLog(target, `物品栏已满，${items[instance.itemId].name}被丢弃。`, 'system');
    overflow -= 1;
  }
  while (overflow > 0) {
    const itemId = target.inventory.findIndex(quantity => quantity > 0);
    if (itemId < 0) return;
    dropStack(target, itemId);
    overflow -= 1;
  }
}

/** 丢弃一件装备：先把它从槽位上摘掉，再从实例列表里移除。 */
export function discardEquipment(instanceId: number): void { const instance = findEquipment(instanceId); if (!instance) return; const item = items[instance.itemId]; unequipEverywhere(state, instanceId); state.equipment = state.equipment.filter(entry => entry.id !== instanceId); addLog(state, `丢弃了 ${item.name}。`, 'system'); saveState(); notify(); }

/* ——— 道具使用 ———
   item.use 是函数，执行器只负责准备上下文、跑完保存并刷新界面。
   需要点选目标的道具会先返回 pick-equipment，界面进入点选模式后再带着 instanceId 调一次。 */
/** 给某个实例加词条：已有同名则加数值，顶到上限就什么都不做。返回是否真的改了。 */
function grantAffixTo(instanceId: number, affixId: number, sourceName: string): boolean { const instance = findEquipment(instanceId); const definition = affixes[affixId]; if (!instance || !definition) return false; const list = instance.affixes || (instance.affixes = []); const existing = list.find(affix => affix.id === affixId); const targetName = items[instance.itemId].name; if (!existing) { list.push({ id: affixId, value: definition.base }); addLog(state, `${sourceName}为「${targetName}」刻上词条「${definition.name}」。`, 'progress'); return true; } const cap = affixCap(affixId); if (existing.value >= cap) { addLog(state, `「${definition.name}」已经到上限 ${cap} 了，${sourceName}没有消耗。`, 'system'); return false; } existing.value = Math.min(cap, existing.value + definition.step); addLog(state, `${sourceName}把「${definition.name}」提升到 ${existing.value}（上限 ${cap}）。`, 'progress'); return true; }
/** 移除某个实例的第 index 条词条。 */
function removeAffixFrom(instanceId: number, index: number, sourceName: string): boolean { const instance = findEquipment(instanceId); const affix = instance?.affixes?.[index]; if (!instance || !affix) return false; const definition = affixes[affix.id]; instance.affixes!.splice(index, 1); addLog(state, `${sourceName}洗掉了「${items[instance.itemId].name}」上的「${definition.name}」。`, 'system'); return true; }
/** 使用一件道具。instanceId 是玩家点选的目标装备实例，-1 表示还没有目标。
    返回界面接下来要做什么：直接结束 / 需要点选装备 / 需要选一条词条。 */
export function useItem(itemId: number, instanceId = -1, affixIndex = -1): UseOutcome {
  const item = items[itemId];
  if (!item || item.category !== 'consumable' || !item.use || !(state.inventory[itemId] > 0)) return { kind: 'done' };
  const outcome = item.use({
    itemId, instanceId, affixIndex,
    consume: () => { state.inventory[itemId] -= 1; },
    log: (message, type = 'system') => addLog(state, message, type),
    heal: amount => { const maxHp = getPlayerMaxHp(state); const healed = Math.min(amount, Math.max(0, maxHp - state.adventure.playerHp)); state.adventure.playerHp = Math.min(maxHp, state.adventure.playerHp + amount); addLog(state, healed > 0 ? `使用了 ${item.name}，恢复 ${healed} 点生命值。` : `使用了 ${item.name}。`, 'system'); },
    affixes: () => { const instance = instanceId >= 0 ? findEquipment(instanceId) : undefined; return instance?.affixes ? instance.affixes.map(affix => ({ ...affix })) : []; },
    grantAffix: affixId => grantAffixTo(instanceId, affixId, `「${item.name}」`),
    removeAffix: index => removeAffixFrom(instanceId, index, `「${item.name}」`)
  });
  saveState(); notify();
  return outcome;
}
/* 拖拽 → 把某个装备实例放进指定槽位。类型不匹配、槽位不存在或实例不存在时返回 false。 */
export function equipToSlot(instanceId: number, equipType: number, slotIndex: number): boolean { const itemId = getInstanceItemId(instanceId); const item = itemId >= 0 ? items[itemId] : null; const slots = state.equipped[equipType]; if (!item || item.equipType !== equipType || !slots || slotIndex < 0 || slotIndex >= slots.length) return false; unequipEverywhere(state, instanceId); /* 同一个实例不能同时占两个槽位，先把它从原槽位摘掉。 */ slots[slotIndex] = instanceId; addLog(state, `装备了 ${item.name}，远征战力提升。`, 'progress'); saveState(); notify(); return true; }
/* 右键 → 装备 / 卸下：一律进该类型的第一个槽位（武器、饰品等多槽类型同理）。
   参数是装备实例 id：同名装备的每一件都是独立实例，点哪一件就操作哪一件，标记也跟着落在那一张卡片上。 */
export function equipItem(instanceId: number): void { const itemId = getInstanceItemId(instanceId); const item = itemId >= 0 ? items[itemId] : null; if (!item) return; const equipType = item.equipType ?? EQUIP_TYPE.weapon; if (isEquipped(instanceId)) { unequipEverywhere(state, instanceId); addLog(state, `卸下了 ${item.name}。`, 'system'); saveState(); notify(); return; } equipToSlot(instanceId, equipType, 0); }
export function getFontScale(target: GameState = state) { return fontScales[target.settings?.fontScale] || fontScales[0]; }
export function setFontScale(id: number): void { if (!fontScales[id]) return; state.settings.fontScale = id; saveState(); notify(); }
/* 数字显示方式：只决定「怎么显示」，数值本身不变。真正的格式化在 format.ts，
   由 main.ts 每帧把当前档位同步过去（setActiveNumberFormat）。 */
export function getNumberFormat(target: GameState = state) { return numberFormats[target.settings?.numberFormat] || numberFormats[0]; }
export function setNumberFormat(id: number): void { if (!numberFormats[id]) return; state.settings.numberFormat = id; saveState(); notify(); }
/* ——— 以下仅供设置页的开发者面板使用。__DEV_TOOLS__ 为 false 时没有任何引用，会被打包器整段摇掉。 ——— */

/** 开发者面板可改的数值：名字 + 取值 + 赋值。下标即面板里的 data-dev-stat。
    覆盖存档里所有有意义的标量；废料 / 精华要同步写回物品栏计数，否则会和物品栏脱节。 */
export const devStats = [
  { name: '金币', get: (target: GameState) => target.gold, set: (target: GameState, value: number) => { target.gold = value; } },
  { name: '废料', get: (target: GameState) => target.scrap, set: (target: GameState, value: number) => { target.scrap = value; target.inventory[ITEM.scrap] = value; } },
  { name: '精华', get: (target: GameState) => target.essence, set: (target: GameState, value: number) => { target.essence = value; target.inventory[ITEM.emberShard] = value; } },
  { name: '累计胜场', get: (target: GameState) => target.totalWins, set: (target: GameState, value: number) => { target.totalWins = value; } },
  { name: '主线进度', get: (target: GameState) => target.mainlineIndex, set: (target: GameState, value: number) => { target.mainlineIndex = Math.min(mainline.length, value); } },
  { name: '营火强化', get: (target: GameState) => target.workshop, set: (target: GameState, value: number) => { target.workshop = value; } },
  { name: '研究', get: (target: GameState) => target.research, set: (target: GameState, value: number) => { target.research = value; } },
  { name: '伙伴', get: (target: GameState) => target.companions, set: (target: GameState, value: number) => { target.companions = value; } },
  { name: '营地生命', get: (target: GameState) => Math.floor(target.camp.hp), set: (target: GameState, value: number) => { target.camp.hp = Math.min(getCampMaxHp(target), value); } },
  { name: '营垒工时', get: (target: GameState) => Math.floor(target.camp.worksiteProgress), set: (target: GameState, value: number) => { target.camp.worksiteProgress = value; } },
  { name: '天灾通过', get: (target: GameState) => target.camp.disasterWins, set: (target: GameState, value: number) => { target.camp.disasterWins = value; } },
  { name: '兽潮通过', get: (target: GameState) => target.camp.tideWins, set: (target: GameState, value: number) => { target.camp.tideWins = value; } },
  { name: '城防等级', get: (target: GameState) => target.campWorkshop[0].level, set: (target: GameState, value: number) => { target.campWorkshop[0].level = value; } },
  { name: '城防工时', get: (target: GameState) => Math.floor(target.campWorkshop[0].work), set: (target: GameState, value: number) => { target.campWorkshop[0].work = value; } },
  { name: '营垒后勤', get: (target: GameState) => getLogisticsAssigned(LOGISTICS.camp, target), set: (target: GameState, value: number) => { target.logistics.assigned[LOGISTICS.camp] = value; } },
  { name: '工坊后勤', get: (target: GameState) => getLogisticsAssigned(LOGISTICS.workshop, target), set: (target: GameState, value: number) => { target.logistics.assigned[LOGISTICS.workshop] = value; } },
  /* 冒险：只关心玩家自身的派生战斗属性，写的是覆盖值（见 devOverride）。
     攻击力 / 防御力 / 生命上限是整数，回复与两个间隔带小数，所以给它们单独的 display。 */
  { name: '自身攻击力', get: (target: GameState) => getPlayerAttack(target), set: (target: GameState, value: number) => { target.devOverrides[DEV_STAT.attack] = value; } },
  { name: '防御力', get: (target: GameState) => getPlayerDefense(target), set: (target: GameState, value: number) => { target.devOverrides[DEV_STAT.defense] = value; } },
  { name: '最大生命', get: (target: GameState) => getPlayerMaxHp(target), set: (target: GameState, value: number) => { target.devOverrides[DEV_STAT.maxHp] = value; } },
  { name: '生命回复', float: true, get: (target: GameState) => getPlayerRegen(target), display: (target: GameState) => `${getPlayerRegen(target).toFixed(1)} / 秒`, set: (target: GameState, value: number) => { target.devOverrides[DEV_STAT.regen] = value; } },
  { name: '出手间隔', float: true, get: (target: GameState) => getPlayerAttackInterval(target), display: (target: GameState) => `${getPlayerAttackInterval(target).toFixed(1)} 秒`, set: (target: GameState, value: number) => { target.devOverrides[DEV_STAT.attackInterval] = value; } },
  { name: '刷怪间隔', float: true, get: (target: GameState) => getSpawnCooldown(target), display: (target: GameState) => `${getSpawnCooldown(target).toFixed(1)} 秒`, set: (target: GameState, value: number) => { target.devOverrides[DEV_STAT.spawnCooldown] = value; } }
];
/** 直接发物品：废料与余烬碎片要同步累加到对应的资源字段上，否则会和物品栏脱节；
    装备则生成等量的独立实例，所以发 5 件就是 5 张卡片。 */
export function devGrantItem(itemId: number, amount: number): void { const item = items[itemId]; if (!item) return; const count = Math.max(1, Math.floor(amount)); if (item.stackable) { state.inventory[itemId] += count; if (itemId === ITEM.scrap) state.scrap += count; if (itemId === ITEM.emberShard) state.essence += count; } else addEquipment(state, itemId, count); addLog(state, `[DEV] 获得 ${item.name} ×${count}。`, 'system'); trimInventoryOverflow(state, itemId); saveState(); notify(); }
/** entry.float 的项（回复、两个间隔）保留两位小数，其余按整数取整。 */
export function devSetStat(index: number, value: number): void { const entry = devStats[index]; if (!entry || !Number.isFinite(value)) return; const safe = Math.max(0, entry.float ? Math.round(value * 100) / 100 : Math.floor(value)); entry.set(state, safe); trimInventoryOverflow(state); addLog(state, `[DEV] ${entry.name} 设为 ${entry.display ? entry.display(state) : formatNumber(entry.get(state))}。`, 'system'); saveState(); notify(); }
/** 一键解锁全部系统（等价于把主线推到底）。 */
export function devUnlockSystems(): void { state.mainlineIndex = mainline.length; addLog(state, '[DEV] 已解锁全部系统。', 'progress'); saveState(); notify(); }

export function resetGame(): void { if (!window.confirm('确定要删除当前远征存档吗？')) return; state = freshState(); addLog(state, '新的远征从一簇微弱的火星开始。', 'system'); saveState(); notify(); }
export function startLoop(): void { let lastTick = Date.now(); setInterval(() => { const now = Date.now(); const seconds = (now - lastTick) / 1000; lastTick = now; advanceAdventure(state, seconds); advanceLogistics(state, seconds); advanceCamp(state, seconds); if (now - lastSave > 5000) { saveState(); lastSave = now; } notify(); }, 500); window.addEventListener('beforeunload', saveState); }

hydrate();
if (!state.log.length) addLog(state, '营火重新燃起。在「冒险」里选好区域，进入战斗区域就会自动开战。', 'system');
