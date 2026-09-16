import { zones, enemyTable, ENEMY, ZONE, zoneOfEnemy, questItemOf, QUEST_DROP_CHANCE, SOLVENT_DROP_CHANCE } from './config/zones';
import { sets, setTable, SET, setOfZone, setOfItem } from './config/sets';
import { items, ITEM, equipTypes, EQUIP_TYPE, itemCategories, categoryOrder, rarities, RARITY, SOLVENT_IDS } from './config/items';
import { affixes, AFFIX, affixCap, affixMarkup, affixCategoryClass, affixCategories, AFFIX_CATEGORY, skills, SKILL, AFFIX_MAX_MULTIPLIER } from './config/affixes';
import { rarityClass } from './config/rarity';
import { CAMP_EVENT, randomEventDefs, campEventDef } from './config/events';
/* 物品 / 怪物 / 区域名不直接写文字，交给 codex-ref.ts 生成「icon + 名称 + 类型色 + 可点开图鉴」的引用。
   按「这段文字会不会进存档」选入口：
   - 进存档（日志的 message）：写 itemTag / enemyTag / zoneTag 标记，渲染时由 renderCodexTags 解析；
   - 不进存档（主线条件文案，每次都由 text() 现算）：直接用 itemRefMarkup 拼出 HTML。
   存档里不能存 HTML，所以日志那条路必须走标记。 */
import { itemTag, itemRefMarkup, enemyTag, zoneTag, pageRefMarkup } from './codex-ref';
import type { Achievement, AdventureState, AutoEatState, CampBattleState, EquipmentInstance, GameState, LogType, MainlineQuest, MainlineRequirement, ResearchTaskState, SetBonus, SettingsState, UseOutcome } from './types';

export const MAX_OFFLINE_SECONDS = 8 * 60 * 60;

/* ——— 存档格式 ———
   存档 = 信封（SaveEnvelope）+ GameState。信封带 format / version / savedAt：
   format 用来识别「这是不是本游戏的存档」，version 用来判断兼容性。
   导出到文本 / 文件、以及 localStorage 里存的都是这一份结构，只有一条格式定义。

   版本规则（改动 GameState 时按这里走）：
   - **新增字段**：不用动 SAVE_VERSION。rebuildState 以 freshState() 为底，
     新字段自动拿到初始值（见 rebuildState 里的 { ...initial, ...data }）。
   - **改动已有字段**（改名、拆字段、换类型、枚举重排）：SAVE_VERSION + 1，
     并在 MIGRATIONS 里补一条「从旧版本升到新版本」的转换。
   - **删除字段**：同样 +1。迁移里不写也行 —— rebuildState 会忽略多余字段。

   低版本存档永远读得进来：parseSave 先按存档自己的版本依次跑 MIGRATIONS 升到当前版本，
   再交给 rebuildState 做逐字段校验。导入的文本走的是同一条路。

   版本历史（旧格式说明，保留备查）：
   v8：委托重做 —— 删掉 researchDifficulty 与 researchTask.difficulty，新增 researchRefreshCount；
       物品表新增 quest 类别（任务物品）与三个任务物品、清洗剂改按类别移除。
       这些都不需要数据转换：多余字段由 rebuildState 忽略，新字段拿 freshState() 的初始值，
       失效的委托由 getResearchTask 的校验重新抽一份。
   v7：存档加信封，版本号从 localStorage 的 key 名移进内容（key 里的 -v6 是历史遗留）。
   v6：强化等级换成词条 —— 实例上存 affixes，道具的 use 变成函数。
   v5：移除等级与经验（xp / level 字段不再存在）。
   v4：装备改成「实例」—— 物品栏只存可堆叠物品的数量，装备放进 equipment 实例列表，
       equipped 里存实例 id。这样同名装备的每一件都是独立的，词条也挂在实例上。
   v3 及更早：格式不兼容，直接作废（那时版本号还在 key 名里，换 key 就等于作废旧档）。 */
const SAVE_KEY = 'ember-expedition-save';
/** v7 之前版本号写在 key 名里，读盘时按顺序兜底；读到就顺手搬到新 key。 */
const LEGACY_SAVE_KEYS = ['ember-expedition-save-v6'];
/** 当前存档格式版本。改结构时 +1，并在 MIGRATIONS 里补一条。 */
const SAVE_VERSION = 8;
/** 信封上的 format 标记：导入时据此拒绝无关的 JSON。 */
const SAVE_FORMAT = 'ember-expedition';

/** 存档信封。state 是明文 GameState；整体编码后变成一段文本（见 encodeEnvelope）。 */
interface SaveEnvelope { format: string; version: number; savedAt: number; state: any }
/** 导出 / 导入的结果：message 是给玩家看的一行话。 */
export interface SaveIoResult { ok: boolean; message: string }

/* 存档文本的前缀。用来一眼认出「这段文本是不是本游戏的存档」，不必先尝试解码。
   末尾的版本号只是给人看的（真正的版本在信封里），解析时不读它。 */
const SAVE_PREFIX = 'EMBER7.';
/* 编码用的异或密钥。**这不是加密** —— 密钥就在产物里，会看代码的人都能还原；
   它只让存档「看起来不是能直接改的文本」，挡住随手改数值的念头。
   单机游戏里真正的防作弊做不到（密钥必然在客户端），所以不往那个方向投入。 */
const XOR_KEY = [0x45, 0x6d, 0x62, 0x65, 0x72, 0x2d, 0x49, 0x64];   // "Ember-Id"

/** 把信封编码成存档文本：JSON → UTF-8 字节 → 异或 → Base64 → 加前缀。
    走 UTF-8 而不是直接 btoa：万一以后存档里出现非 ASCII 字符（物品备注之类）不会炸。 */
function encodeEnvelope(envelope: SaveEnvelope): string {
  const bytes = new TextEncoder().encode(JSON.stringify(envelope));
  let binary = '';
  /* 逐字节拼而不是 String.fromCharCode(...bytes)：存档上千字节，展开成参数会爆栈。 */
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index] ^ XOR_KEY[index % XOR_KEY.length]);
  return SAVE_PREFIX + btoa(binary);
}

/** 解出存档文本里的信封。前缀不对、Base64 坏了、JSON 坏了、format 不对，一律返回 null。 */
function decodeEnvelope(text: string): SaveEnvelope | null {
  if (!text.startsWith(SAVE_PREFIX)) return null;
  try {
    const binary = atob(text.slice(SAVE_PREFIX.length));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index) ^ XOR_KEY[index % XOR_KEY.length];
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === 'object' && parsed.format === SAVE_FORMAT ? parsed : null;
  } catch { return null; }
}

/** 迁移表：键是「旧版本号」，值把它升到「旧版本号 + 1」。依次跑过去就能从任意旧版本升到当前版本。
    每一项只做结构转换，不要顺手补默认值 —— 那是 rebuildState 的活，两处都做会互相打架。 */
const MIGRATIONS: Record<number, (data: any) => any> = {
  /* 6 → 7 只是加了信封，GameState 结构没变。
     7 → 8 删了两个字段、加了一个字段，也都不需要转换：
     被删的字段 rebuildState 会忽略，新字段从 freshState() 拿初始值。
     以后遇到「字段改名 / 拆字段 / 换类型」这类真要转换的情况，在这里补，例如：
     8: data => ({ ...data, newField: data.oldField || 0 }), */
};
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
export { zones, enemyTable, items, ITEM, ENEMY, ZONE, equipTypes, EQUIP_TYPE, itemCategories, categoryOrder, rarities, RARITY, affixes, AFFIX, affixCap, affixMarkup, skills, SKILL, AFFIX_MAX_MULTIPLIER, CAMP_EVENT, randomEventDefs, sets, setTable, SET, setOfItem, setOfZone };

/** 初始区域：庇护所（不刷怪，只休整）。 */
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
    { text: (state: GameState) => `击杀${pageRefMarkup('enemies', '任意怪物')} ${progressText(state.totalWins, 1)} 只`, done: (state: GameState) => state.totalWins >= 1 }
  ]),
  quest('清理废弃边境', '击退一批盘踞在旧哨站的机械单位，庇护所才有空间继续扩建。', '解锁「工坊」系统', [
    { text: (state: GameState) => `累计击杀${pageRefMarkup('enemies', '任意怪物')} ${progressText(state.totalWins, 5)} 只`, done: (state: GameState) => state.totalWins >= 5 }
  ]),
  quest('分析异常电池', '收集旧电池，研究它们为何仍在污染区域中保持电量。', '解锁「研究基地」系统', [
    { text: (state: GameState) => `收集${itemRefMarkup(ITEM.oldBattery)} ${progressText(state.inventory[ITEM.oldBattery], 3)} 个`, done: (state: GameState) => state.inventory[ITEM.oldBattery] >= 3 }
  ]),
  quest('组建第二支小队', '从重装单位身上回收装甲板，为新伙伴准备一套可靠的装备。', '解锁工坊制造「哨戒弩台」', [
    { text: (state: GameState) => `收集${itemRefMarkup(ITEM.armorPlate)} ${progressText(state.inventory[ITEM.armorPlate], 3)} 片`, done: (state: GameState) => state.inventory[ITEM.armorPlate] >= 3 }
  ]),
  quest('追踪核心信号', '余烬碎片正在指向更深处的区域。第一章的下一段道路已经出现。', '解锁研究项「信号放大 I」', [
    { text: (state: GameState) => `收集${itemRefMarkup(ITEM.emberShard)} ${progressText(state.inventory[ITEM.emberShard], 2)} 个`, done: (state: GameState) => state.inventory[ITEM.emberShard] >= 2 }
  ]),
  quest('抵御第一场天灾', '把工坊造出来的城防和后勤小队都压上去，让庇护所在沙暴里站住。', '庇护所进入长期战备，荒野开始注意到这里（解锁随机事件）', [
    { text: (state: GameState) => `成功应对天灾 ${progressText(state.camp.disasterWins, 1)} 次`, done: (state: GameState) => state.camp.disasterWins >= 1 }
  ]),
  quest('击退第一次兽潮', '兽潮不打算绕路。庇护所攻防与营垒等级决定了这堵墙能不能撑到最后。', '完成庇护所战备阶段', [
    { text: (state: GameState) => `成功应对兽潮 ${progressText(state.camp.tideWins, 1)} 次`, done: (state: GameState) => state.camp.tideWins >= 1 }
  ])
];

/* ——— 庇护所 / 后勤小队 / 工坊制造 ———
   庇护所不直接升级，它靠「其他系统」变强：工坊把资源造成实物（基础城防），后勤小队把人力换成进度。
   主线也因此延伸出两个节点：抵御第一场天灾、击退第一次兽潮。 */
/** 随机事件触发间隔（秒），默认 1 小时。庇护所页的倒计时进度条要用它算比例。 */
export const RANDOM_EVENT_INTERVAL = 60 * 60;
/** 随机事件从第几步主线开始计时：它是「抵御第一场天灾」（mainline 下标 5）的奖励，
   完成那条主线后 mainlineIndex 才是 6，在此之前庇护所完全不会被荒野上的随机事件打扰。 */
const RANDOM_EVENT_START_INDEX = 6;
/** 随机事件计时是否已经在走。 */
export function isCampEventTimerRunning(target: GameState = state): boolean { return target.mainlineIndex >= RANDOM_EVENT_START_INDEX; }
const PENDING_EVENT_TIMEOUT = 30;        // 事件等待玩家响应的秒数，超时直接跳过
const CAMP_ATTACK_INTERVAL = 1.2;        // 庇护所出手间隔（秒）
/** 庇护所裸值：等级 0、没有任何强化时的基础数值。 */
const CAMP_BASE = { hp: 200, attack: 10, defense: 4 };
/** 大事件的波次强度：每波的每项属性都是**上一波的 growth 倍**（等比，越往后越陡）。
    防御单列：它进的是减法（伤害 = 攻击 − 防御，最低 1 点），跟着等比会让伤害迅速压到 1 点，
    把「打不过」变成「磨不完」，所以它走线性。
    growth 决定「墙」在哪：玩家侧（工坊 / 营垒）是线性成长，等比迟早追上 ——
    调大更陡、能推进的波次更少。 */
export const CAMP_WAVE = { growth: 1.35, defenseStep: 1.5, intervalStep: .03, intervalMin: .7, rewardDamp: .5 };
/** 每波的场次顺序：天灾 → 兽潮 → 异种（异种是波末）。下标即 camp.stage。
    图鉴的「威胁」页也按这个顺序列三张数值表。 */
export const CAMP_WAVE_KINDS = [CAMP_EVENT.disaster, CAMP_EVENT.tide, CAMP_EVENT.mutant];
/** 大事件的基础数值：第 1 波就是这一档，之后按 CAMP_WAVE 逐波抬高。 */
const CAMP_EVENT_BASE: Record<number, { hp: number; attack: number; defense: number; interval: number; gold: number; scrap: number; essence: number; survivors: number }> = {
  [CAMP_EVENT.disaster]: { hp: 180, attack: 9, defense: 3, interval: 1.4, gold: 150, scrap: 60, essence: 2, survivors: 1 },
  [CAMP_EVENT.tide]: { hp: 260, attack: 12, defense: 4, interval: 1.2, gold: 220, scrap: 90, essence: 3, survivors: 2 },
  [CAMP_EVENT.mutant]: { hp: 330, attack: 14, defense: 5, interval: 1.1, gold: 300, scrap: 120, essence: 4, survivors: 3 }
};
/** 人口换算：每 3 人提供 1 名后勤。人口只来自事件奖励（救下来的人）。 */
export const POP_PER_WORKER = 3;
/** 工坊的制造项：下标即 state.campWorkshop 的下标，追加新项要放在末尾。
   unlockIndex 是解锁所需的主线进度（mainlineIndex 达到这个值才会在工坊里出现）。 */
export const workshopItems = [
  { name: '基础城防', unlockIndex: 0, icon: '🛡️', desc: '加固庇护所外围的挡墙与射击位。每级提高庇护所生命、防御与攻击。', perHp: 25, perDefense: 2, perAttack: 1.5, baseWork: 40, workStep: 30, baseGold: 60, goldStep: 45, baseScrap: 20, scrapStep: 15, basePlate: 1, plateStep: .5 },
  /* 第二支小队到位后才有人值守：弩台偏攻击，造价与工时都比城防高一档。 */
  { name: '哨戒弩台', unlockIndex: 4, icon: '🏹', desc: '在庇护所四角架起自动弩台。每级提高庇护所攻击，并小幅提高防御与生命。',
    perHp: 10, perDefense: 1, perAttack: 3, baseWork: 55, workStep: 35, baseGold: 90, goldStep: 70, baseScrap: 30, scrapStep: 22, basePlate: 2, plateStep: .7 }
];
/** 后勤小队的可分配去处：下标即 state.logistics.assigned 的下标，顺序不能随意调整。
    0 是营垒修筑，之后**每个制造项各占一个下标**（见 fortSlot）—— 人手是「派给这一项的人」，
    不是工坊共用一个池子：分给弩台的人不会跑去修城防，两项也就能同时开工。
    总人数由 getLogisticsTotal 换算，assigned 只记分配，不存总数。 */
export const LOGISTICS = { camp: 0, fort: 1 };
/** 制造项 id → 后勤下标。制造项自己不用关心下标是怎么排的。 */
export const fortSlot = (id: number): number => LOGISTICS.fort + id;
export const logisticsTargets = [
  { id: 'camp', name: '营垒修筑', icon: '🧱', desc: '每人每秒贡献 1 工时，每 100 工时提升 1 级营垒，提高庇护所生命、攻击与防御。' },
  /* 每个制造项一行：分配的人数就是这一项的建造速度。
     每人每秒的工时基础为 1，可被装备词条「勤务」提升（见 getWorkshopRate）。 */
  ...workshopItems.map(item => ({ id: 'fort', name: item.name, icon: item.icon, desc: `把人数派到${item.name}上：每人每秒贡献 1 工时，攒够本级总工时就会提升 1 级。制造耗时 = 本级总工时 ÷（人数 × 每人每秒工时）。` }))
];
/** 工坊页面本身的解锁进度：完成「清理废弃边境」（mainline 下标 1）后 mainlineIndex 才是 2。 */
const WORKSHOP_UNLOCK_INDEX = 2;
/** 研究基地页面本身的解锁进度：完成「分析异常电池」（mainline 下标 2）后 mainlineIndex 才是 3。 */
const RESEARCH_UNLOCK_INDEX = 3;
/** 工坊是否已解锁（页面级）：完成主线「清理废弃边境」。导航锁定与解锁提示共用这一处判定。 */
export function isWorkshopUnlocked(target: GameState = state): boolean { return target.mainlineIndex >= WORKSHOP_UNLOCK_INDEX; }
/** 某个制造项是否已解锁：主线进度不够时工坊里不显示它。 */
export function isWorkshopItemUnlocked(id: number, target: GameState = state): boolean { return !!workshopItems[id] && target.mainlineIndex >= workshopItems[id].unlockIndex; }
/* ——— 研究基地 ———
   完成「分析异常电池」解锁（mainlineIndex >= 3）。基地会发布收集委托：
   去某个已解锁的战斗区域收集该区域的**任务物品**（见 config/zones.ts 的 questItem），
   交齐换研究点数，研究点数用来提升研究项。

   委托不再要求「怪物的普通掉落物」—— 那种委托逼玩家挑怪刷（一个物品常常只有 1~2 只怪会掉），
   而任务物品只在**当前委托指向该区域**时由这里的怪物统一 10% 掉落，诉求因此变成「去那个区域刷」。
   难度选择也一并去掉：委托随机落在某个已解锁区域、奖励固定 —— 越深的区域任务物品一样难掉，
   但那里的怪本身更值钱，收益差已经体现在刷的过程中，不需要再加一层倍率。 */
export const RESEARCH = {
  /** 委托要求的数量区间：needMin ~ needMax，上限会被「任务需求降低 I」压低。
      **区间必须比那个研究项的 maxLevel 宽**，否则满级之前就会压到底，后面几级白点：
      这里宽 10 档，研究项满级 10 级，刚好把上限从 60 一路压到 50，每一级都算数
      （旧值 8~12 只有 4 档，点到第 4 级就压到底了）。改这两个数前先看 maxLevel。
      10% 掉率下 50~60 个约等于 500~600 次击杀，按一场战斗 20~30 秒算是 3~5 小时。 */
  needMin: 50, needMax: 60,
  /** 每份委托的研究点数奖励。 */
  reward: 10,
  /** 研究项升级消耗：costBase + costStep × 当前等级。
      **costStep 固定为 0** —— 每级消耗都一样，和第一级一致；点满一项的总花费 = costBase × maxLevel。
      想改回「越升越贵」就把它调大，但要连带看一眼满级总花费（委托的产出很慢，见 needMin / needMax）。 */
  costBase: 10, costStep: 0,
  /** 刷新委托的首次费用：之后每次多花一个基数（见 getResearchRefreshCost）。 */
  refreshCostBase: 100
};
/** 刷新这份委托要花多少金币：首次 refreshCostBase，之后每刷一次多一个基数。
    交委托后计数归零，所以「反复刷到满意」的代价是递增的，正常接单不受影响。 */
export function getResearchRefreshCost(target: GameState = state): number {
  return RESEARCH.refreshCostBase * (Math.max(0, Math.floor(target.researchRefreshCount) || 0) + 1);
}
/** 能不能刷新：金币够就行（未解锁研究基地时也不给刷）。 */
export function canRefreshResearchTask(target: GameState = state): boolean { return isResearchUnlocked(target) && target.gold >= getResearchRefreshCost(target); }
/** 刷新委托：扣金币、重抽一份、计数 +1。返回是否真的刷新了（金币不够时 false）。 */
export function refreshResearchTask(): boolean {
  if (!canRefreshResearchTask(state)) return false;
  const cost = getResearchRefreshCost(state);
  state.gold -= cost;
  state.researchTask = rollResearchTask(state);
  state.researchRefreshCount += 1;
  addLog(state, `支付 ${cost} 金币，研究基地重新发布了委托。`, 'system');
  saveState(); notify();
  return true;
}
/** 研究项：下标即 state.researchLevels 的下标，追加新项要放在末尾。 */
export const RESEARCH_ITEM = { taskNeed: 0, reward: 1, autoEat: 2 };
export const researchItems = [
  {
    name: '任务需求降低 I', icon: '📉', maxLevel: 10, unlockIndex: 3,
    desc: '整理委托流程，让基地少要点东西。',
    /** 每级的效果：需求数量上限 -1。 */
    effect: (level: number): string => level ? `委托要求的数量上限 -${level} 点` : '尚未研究：研究后每级让要求的数量上限 -1 点'
  },
  {
    name: '信号放大 I', icon: '📡', maxLevel: 10, unlockIndex: 5,
    desc: '把核心信号放大后再解析：同样的委托能换到更多研究点数。',
    effect: (level: number): string => level ? `每份委托的研究点数 +${level}` : '尚未研究：研究后每级让每份委托的研究点数 +1'
  },
  {
    name: '自动进食', icon: '🍖', maxLevel: 1, unlockIndex: 3,
    desc: '把口粮分发流程固化下来：远征队会在生命值过低时自己吃掉指定的食物。',
    effect: (level: number): string => level ? '已解锁：在冒险页指定食物与触发阈值' : '尚未研究：研究后可在冒险页指定食物与触发阈值'
  }
];
/** 研究项是否已解锁：主线进度不够时卡片锁着、点了也没反应。 */
export function isResearchItemUnlocked(id: number, target: GameState = state): boolean { return !!researchItems[id] && target.mainlineIndex >= researchItems[id].unlockIndex; }
/** 一份委托的研究点数：基础值 + 「信号放大」等级。奖励不再随区域或难度浮动 ——
    越深的区域靠怪物本身的金币与掉落拉开收益差，不需要再加一层倍率。 */
export function getResearchReward(target: GameState = state): number {
  return RESEARCH.reward + getResearchLevel(RESEARCH_ITEM.reward, target);
}

/* ——— 自动进食（研究项「自动进食」解锁）———
   解锁后可以在冒险页指定一种「食物」，生命值掉到阈值以下时自动吃一份。
   「食物」的判定不看 id 清单，而是看道具的 use 上有没有 heal 标记（见 config/items.ts 的 healHandler）——
   以后新增回血道具会自动出现在候选里，不需要改这里。 */
export const AUTO_EAT = {
  /** 默认触发阈值（百分比）。 */
  defaultThreshold: 30,
  /** 可调范围：太低来不及救，太高会一直吃。 */
  minThreshold: 10, maxThreshold: 90, thresholdStep: 5
};
/** 「自动进食」研究项是否已解锁。 */
export function isAutoEatUnlocked(target: GameState = state): boolean { return getResearchLevel(RESEARCH_ITEM.autoEat, target) > 0; }
/** 物品栏里所有的「食物」：使用后能回血的消耗品。 */
export function foodItemIds(): number[] { return items.map((item, itemId) => (item.category === 'consumable' && item.use?.heal ? itemId : -1)).filter(itemId => itemId >= 0); }
/** 当前指定的食物：没指定、或指定的东西已经不是食物都返回 -1。
    数量为 0 时仍然返回它 —— 界面要显示「剩 0」，玩家才知道该去补货。 */
export function getAutoEatItem(target: GameState = state): number { const itemId = target.autoEat?.itemId ?? -1; return itemId >= 0 && items[itemId]?.use?.heal ? itemId : -1; }
export function getAutoEatThreshold(target: GameState = state): number { return Math.max(AUTO_EAT.minThreshold, Math.min(AUTO_EAT.maxThreshold, Math.floor(Number(target.autoEat?.threshold) || AUTO_EAT.defaultThreshold))); }
/** 指定自动进食的食物；传 -1 表示关掉。未解锁、或传的不是食物时不生效。 */
export function setAutoEatItem(itemId: number): void {
  if (!isAutoEatUnlocked(state)) return;
  if (itemId >= 0 && !items[itemId]?.use?.heal) return;
  if (getAutoEatItem(state) === itemId) return;
  state.autoEat.itemId = itemId;
  addLog(state, itemId >= 0 ? `自动进食已指定：${itemTag(itemId)}。` : '自动进食已关闭。', 'system');
  saveState(); notify();
}
/** 调整触发阈值（百分比），会夹进可调范围。 */
export function setAutoEatThreshold(value: number): void {
  const next = Math.max(AUTO_EAT.minThreshold, Math.min(AUTO_EAT.maxThreshold, Math.floor(Number(value) || 0)));
  if (next === getAutoEatThreshold(state)) return;
  state.autoEat.threshold = next;
  saveState(); notify();
}
/** 自动进食：生命值掉到阈值以下就吃一份指定食物。
    只在挨打之后调用 —— 那是唯一会掉血的时机，也保证一次 tick 推进多秒时不会「先死再吃」。 */
function tryAutoEat(target: GameState): void {
  if (!isAutoEatUnlocked(target)) return;
  const itemId = getAutoEatItem(target);
  if (itemId < 0 || !(target.inventory[itemId] > 0)) return;
  if (target.adventure.playerHp > getPlayerMaxHp(target) * getAutoEatThreshold(target) / 100) return;
  useItem(itemId);
}

/** 等级加成曲线：前 10 级按 perLevel 线性增长，之后每级只给一半收益（避免后期数值失控）。 */
export function levelBonus(level: number, perLevel: number): number { return Math.round(perLevel * (Math.min(level, 10) + Math.max(0, level - 10) * .5)); }
/** 营垒每级的加成（由营垒修筑的工时堆出来，和工坊制造无关）。 */
export const WORKSITE_BONUS = { hp: 12, attack: 1.5, defense: 1 };
/** 营垒等级：由营垒修筑累计的工时换算而来。 */
export function worksiteLevel(target: GameState = state): number { return Math.floor(Math.max(0, target.camp.worksiteProgress) / 100); }
/** 营垒修筑进度：朝下一级的百分比。 */
export function worksiteProgress(target: GameState = state): number { return Math.max(0, target.camp.worksiteProgress) % 100; }
/** 总人数的来源拆分：界面拿它解释「为什么又多了一个人」。
    三个来源分别是主线进度、累计胜场、庇护所人口（事件里救下来的幸存者）。 */
export function getLogisticsSources(target: GameState = state): { mainline: number; wins: number; population: number } {
  return {
    mainline: Math.floor(target.mainlineIndex / 2),
    wins: Math.floor(target.totalWins / 20),
    population: Math.floor(Math.max(0, Number(target.camp.population) || 0) / POP_PER_WORKER)
  };
}
/** 后勤小队总人数：基础 1 人 + 三个来源。
    人数**不存档**，只由这几项换算，避免两处数据不同步。 */
export function getLogisticsTotal(target: GameState = state): number {
  const sources = getLogisticsSources(target);
  return 1 + sources.mainline + sources.wins + sources.population;
}
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
/* ——— 庇护所数值：基础值 + 城防等级加成 + 营垒等级加成 + 其他系统（研究 / 伙伴）的加成。 */
/** 工坊所有制造项的等级加成之和：按各自等级 × 各自系数累加。 */
function workshopBonus(target: GameState, key: 'perHp' | 'perAttack' | 'perDefense'): number {
  return workshopItems.reduce((total, item, id) => total + levelBonus(target.campWorkshop[id]?.level || 0, item[key]), 0);
}
export function getCampMaxHp(target: GameState = state): number { return Math.round(CAMP_BASE.hp + workshopBonus(target, 'perHp') + worksiteLevel(target) * WORKSITE_BONUS.hp); }
export function getCampAttack(target: GameState = state): number { return Math.round(CAMP_BASE.attack + workshopBonus(target, 'perAttack') + worksiteLevel(target) * WORKSITE_BONUS.attack); }
export function getCampDefense(target: GameState = state): number { return Math.round(CAMP_BASE.defense + workshopBonus(target, 'perDefense') + worksiteLevel(target) * WORKSITE_BONUS.defense); }
export function getCampRegen(target: GameState = state): number { return 1.5 + worksiteLevel(target) * .3; }
export function getCampHp(target: GameState = state): number { return Math.max(0, Math.min(getCampMaxHp(target), target.camp.hp)); }
/* ——— 工坊制造 ——— */
/** 这一级需要的总工时；实际耗时 = 总工时 ÷ 分配人数（见 getWorkshopRemaining）。 */
export function getWorkshopWorkTotal(id: number, target: GameState = state): number { const item = workshopItems[id]; return item.baseWork + item.workStep * target.campWorkshop[id].level; }
/** 造这一级要花的资源：金币 + 废料 + 冒险掉落物（装甲板）。 */
export function getWorkshopCost(id: number, target: GameState = state): { gold: number; scrap: number; plate: number } { const item = workshopItems[id]; const level = target.campWorkshop[id].level; return { gold: item.baseGold + item.goldStep * level, scrap: item.baseScrap + item.scrapStep * level, plate: Math.ceil(item.basePlate + item.plateStep * level) }; }
export function isWorkshopBusy(id: number, target: GameState = state): boolean { return target.campWorkshop[id].target >= 0; }
/** 能不能开工：未解锁的制造项一律不能（它本来就不该出现在界面与后勤流程里）。 */
export function canStartWorkshop(id: number, target: GameState = state): boolean { if (!isWorkshopItemUnlocked(id, target)) return false; const cost = getWorkshopCost(id, target); return !isWorkshopBusy(id, target) && target.gold >= cost.gold && target.scrap >= cost.scrap && target.inventory[ITEM.armorPlate] >= cost.plate; }
/** 剩余秒数：没有分配后勤人数时返回 Infinity（进度会停住）。 */
export function getWorkshopRemaining(id: number, target: GameState = state): number {
  const workers = getLogisticsAssigned(fortSlot(id), target);
  const item = target.campWorkshop[id];
  if (!workers || item.target < 0) return Infinity;
  /* 剩余秒数同样要按「每人每秒的实际工时」算，否则界面上的倒计时会和真实进度对不上。 */
  return Math.max(0, (getWorkshopWorkTotal(id, target) - item.work) / (workers * getWorkshopRate(target)));
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
/* ——— 庇护所事件 ———
   名字 / 图标 / 描述在 config/events.ts（图鉴也要读），这里只负责按存档算强度与奖励。
   大事件按**波次**反复来（每波 3 场：天灾 → 兽潮 → 异种），不再有「打一次就清空」。 */
/** 当前波次，从 1 起。 */
export function campWave(target: GameState = state): number { return Math.max(1, Math.floor(Number(target.camp.wave) || 1)); }
/** 本波打到第几场（0 起，对应 CAMP_WAVE_KINDS 的下标）。 */
export function campWaveStage(target: GameState = state): number { return Math.max(0, Math.min(CAMP_WAVE_KINDS.length - 1, Math.floor(Number(target.camp.stage) || 0))); }
/** 当前该打的事件类型。 */
function campWaveKind(target: GameState): number { return CAMP_WAVE_KINDS[campWaveStage(target)]; }
/** 某场事件的强度与奖励：大事件按**波次线性**变强，随机事件随主线进度变强。
    survivors 是救下来的幸存者，结算时转成庇护所人口。 */
function campEventStats(kind: number, id: number, target: GameState): { kind: number; id: number; name: string; icon: string; desc: string; hp: number; attack: number; defense: number; interval: number; rewards: { gold: number; scrap: number; essence: number; survivors: number } } {
  const def = campEventDef(kind, id);
  if (kind === CAMP_EVENT.random) {
    const scale = target.mainlineIndex + Math.floor(target.totalWins / 10);
    return { kind, id, name: def.name, icon: def.icon, desc: def.desc, hp: 120 + scale * 45, attack: 7 + scale * 2, defense: 2 + scale, interval: 1.6, rewards: { gold: 90 + scale * 30, scrap: 40 + scale * 15, essence: 1 + Math.floor(scale / 2), survivors: 0 } };
  }
  const wave = campWave(target);
  const base = CAMP_EVENT_BASE[kind] || CAMP_EVENT_BASE[CAMP_EVENT.disaster];
  const scale = Math.pow(CAMP_WAVE.growth, wave - 1);
  /* 奖励跟着难度涨，但只取**平方根**那一档：全额跟涨会让金币 / 废料 / 精华的数值爆炸，
     完全不跟涨又没人愿意往上推。 */
  const rewardScale = Math.pow(scale, CAMP_WAVE.rewardDamp);
  return {
    kind, id, name: `${def.name} · 第 ${wave} 波`, icon: def.icon, desc: def.desc,
    hp: Math.round(base.hp * scale),
    attack: Math.round(base.attack * scale),
    defense: Math.round(base.defense + (wave - 1) * CAMP_WAVE.defenseStep),
    /* 出手间隔只在第 3 波之后开始压，且有下限 —— 压到 0 会让战斗循环里 step 恒为 0。 */
    interval: Math.max(CAMP_WAVE.intervalMin, base.interval - Math.max(0, wave - 3) * CAMP_WAVE.intervalStep),
    rewards: {
      gold: Math.round(base.gold * rewardScale),
      scrap: Math.round(base.scrap * rewardScale),
      essence: Math.round(base.essence * rewardScale),
      survivors: Math.round(base.survivors * rewardScale)
    }
  };
}
/** 界面统一按「当前 / 最大」显示事件生命：未开打时两者相同，所以这里把 hp 同时当作 maxHp 给出。 */
export type CampEventStats = ReturnType<typeof campEventStats> & { maxHp: number };
function withMaxHp(stats: ReturnType<typeof campEventStats>): CampEventStats { return { ...stats, maxHp: stats.hp }; }
/** 界面用：拿一场事件的可展示数据（不含战斗中的实时血量）。 */
export function getCampEventInfo(kind: number, id = 0, target: GameState = state): CampEventStats { return withMaxHp(campEventStats(kind, id, target)); }
/** 当前该打哪一场：每波 3 场，打完进下一波。
    永远返回一场 —— 庇护所不再有「大事件已清空」这个状态。 */
export function getNextCampChallenge(target: GameState = state): CampEventStats { return getCampEventInfo(campWaveKind(target), 0, target); }
/** 已经触发、等待玩家响应的事件；没有则返回 null。 */
export function getPendingEvent(target: GameState = state): (CampEventStats & { expiresAt: number }) | null { if (target.camp.pendingKind < 0) return null; return { ...withMaxHp(campEventStats(target.camp.pendingKind, target.camp.pendingId, target)), expiresAt: target.camp.pendingExpires }; }
let campBattle: CampBattleState | null = null;
export function getCampBattle(): CampBattleState | null { return campBattle; }
function beginCampBattle(target: GameState, stats: ReturnType<typeof campEventStats>): void {
  campBattle = { kind: stats.kind, id: stats.id, name: stats.name, icon: stats.icon, campHp: getCampHp(target), campMaxHp: getCampMaxHp(target), eventHp: stats.hp, eventMaxHp: stats.hp, eventAttack: stats.attack, eventDefense: stats.defense, eventInterval: stats.interval, rewards: stats.rewards, campTimer: 0, eventTimer: 0 };
  addLog(target, `${stats.name}来袭，庇护所防线进入战斗。`, 'battle');
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
  if (!accept) { addLog(state, `庇护所选择回避「${stats.name}」。`, 'system'); saveState(); notify(); return; }
  beginCampBattle(state, stats);
}
/** 设置页的通知开关：决定随机事件是否弹窗提醒（不弹窗也能在庇护所页看到倒计时）。 */
export function setNotify(enabled: boolean): void { state.settings.notify = !!enabled; addLog(state, enabled ? '随机事件将弹窗提醒。' : '随机事件不再弹窗提醒。', 'system'); saveState(); notify(); }

/* ——— 更新日志（见 changelog.ts） ———
   已读版本存进 settings 而不是 localStorage：它随存档走，换设备导入备份后不会重复弹公告；
   重置存档会连它一起清掉，于是新档会再弹一次（重置本身就会重放新手指引，语义一致）。 */
export function getChangelogSeen(target: GameState = state): string { return String(target.settings?.changelogSeen || ''); }
/** 记下「这个版本玩家已经看过公告」。版本没变时什么都不做，避免无意义存盘。 */
export function markChangelogSeen(version: string): void {
  if (!version || getChangelogSeen() === version) return;
  state.settings.changelogSeen = version;
  saveState(); notify();
}

/* ——— 成就 ———
   条件一旦为真就自动解锁并记一条日志。目前只有「开始游戏」这一条。 */
export const achievements: Achievement[] = [
  { id: 'start', name: '开始游戏', icon: '💋', hint: '进入游戏', reward: '作者的一个飞吻', condition: () => true },
  { id: 'firstBlood', name: '初次冒险', icon: '⚔️', hint: '首次击杀一个怪物', reward: '解锁【图鉴】', condition: (target: GameState) => target.totalWins >= 1, rewardUnlock: { id: 'wiki', icon: '📖', category: '系统', name: '图鉴' } }
];
/* ——— 解锁提示 ———
   机制（工坊、研究基地…）与条目（制造项、研究项、区域…）解锁时都弹一条顶部 tips，
   界面也据此决定「显示 / 不显示」：未解锁的内容不渲染，解锁后追加进列表（见 UI开发规范 §6.11）。
   开局就有的内容（unlockIndex 为 0）不列在这里，免得一进游戏刷一屏。
   下标即 state.notices 的下标，追加新项要放在末尾（删中间项会让旧存档的「已提示过」标记整体前移，
   最坏只是重复弹一条提示，读档时按新表长度重建即可，不做迁移）。 */
/** 条目级解锁的提示文案：统一写成「完成主线「XXX」解锁」。 */
function unlockHint(unlockIndex: number): string {
  const goal = unlockIndex > 0 ? mainline[unlockIndex - 1] : null;
  return goal ? `完成主线「${goal.title}」解锁` : '主线推进后解锁';
}
/** 条目级解锁：直接由各自配置表的 unlockIndex 推导，新增条目不用在这里再写一遍。 */
function entryNotices<T extends { icon: string; name: string; unlockIndex: number }>(entries: T[], category: string, prefix: string, isUnlocked: (id: number, target: GameState) => boolean) {
  return entries.flatMap((entry, id) => entry.unlockIndex > 0
    ? [{ id: `${prefix}:${id}`, icon: entry.icon, category, name: entry.name, hint: unlockHint(entry.unlockIndex), unlocked: (target: GameState) => isUnlocked(id, target) }]
    : []);
}

export const unlockNotices = [
  /* 机制级：条件一律引用 game-state 自己的判定函数，不要在表里重写一遍 mainlineIndex 比较。 */
  { id: 'workshop', icon: '🔨', category: '工坊', name: '工坊', hint: '完成「清理废弃边境」解锁', unlocked: isWorkshopUnlocked },
  { id: 'researchBase', icon: '🧪', category: '研究基地', name: '研究基地', hint: '完成「分析异常电池」解锁', unlocked: isResearchUnlocked },
  { id: 'randomEvent', icon: '🌪️', category: '庇护所', name: '随机事件', hint: '完成「抵御第一场天灾」解锁', unlocked: isCampEventTimerRunning },
  ...entryNotices(workshopItems, '工坊', 'workshop', isWorkshopItemUnlocked),
  ...entryNotices(researchItems, '研究基地', 'research', isResearchItemUnlocked),
  ...entryNotices(zones, '冒险', 'zone', isZoneUnlocked)
];
/** 解锁事件：界面（unlock-toast.ts）订阅它来弹 tips，新手指引（guide.ts）也订阅它来放该系统的引导。
    id 与 guide.ts 的 GUIDES 键对应（没有对应引导的会被忽略）；
    category 是这项东西所在的页面 / 板块，提示会写成「icon 解锁：category「name」」。 */
export interface UnlockEvent { id: string; icon: string; category: string; name: string; detail?: string; }
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
    addLog(target, `解锁：${entry.category}「${entry.name}」`, 'progress');
    emitUnlock({ id: entry.id, icon: entry.icon, category: entry.category, name: entry.name, detail: entry.hint });
  });
  /* 立刻写盘：这些「已提示过」的标记如果留到下一次自动保存，刷新后会重复弹同一条 tips。 */
  if (unlockedAny) saveState();
}
/* ——— 新手指引的进度 ———
   引导本身在 guide.ts（UI 层），这里只存「看过哪些」。
   存 id 字符串而不是下标：以后新增引导不会让旧存档的标记整体错位。 */
/** 这条引导是否已经看过（首次引导的 id 是 'intro'）。 */
export function hasSeenGuide(id: string, target: GameState = state): boolean { return !!target.guides?.includes(id); }
/** 标记引导已看过。立刻写盘，避免刷新后重复弹。 */
export function markGuideSeen(id: string): void { if (!state.guides) state.guides = []; if (state.guides.includes(id)) return; state.guides.push(id); saveState(); }
/** 重置全部引导进度（设置页的「重置新手指引」用）。 */
export function resetGuides(): void { state.guides = []; saveState(); }

export function isAchievementUnlocked(index: number, target: GameState = state): boolean { return !!target.achievements?.[index]; }
/** 按 id 查解锁状态：界面上的「解锁后」奖励项据此生效，避免条件写在两处。 */
export function isAchievementUnlockedById(id: string, target: GameState = state): boolean { const index = achievements.findIndex(entry => entry.id === id); return index >= 0 && isAchievementUnlocked(index, target); }
/** 图鉴（wiki）的解锁条件就是成就「初次冒险」，所以直接复用它的状态。
    未解锁时所有图鉴引用降级成纯文本（icon + 颜色，不可点），见 codex-ref.ts 的 setWikiUnlocked。 */
export function isWikiUnlocked(target: GameState = state): boolean { return isAchievementUnlockedById('firstBlood', target); }
/** 解锁数量，用于界面上的「已解锁 x / y」。 */
export function getUnlockedAchievementCount(target: GameState = state): number { return achievements.reduce((total, _, index) => total + (isAchievementUnlocked(index, target) ? 1 : 0), 0); }
function checkAchievements(target: GameState): void {
  let unlockedAny = false;
  achievements.forEach((entry, index) => {
    if (target.achievements[index] || !entry.condition(target)) return;
    target.achievements[index] = 1;
    unlockedAny = true;
    addLog(target, `成就解锁：${entry.name} —— 解锁奖励：${entry.reward}`, 'progress');
    emitUnlock({ id: `achievement:${entry.id}`, icon: entry.icon, category: '成就', name: entry.name, detail: `解锁奖励：${entry.reward}` });
    /* 奖励本身解锁了别的系统时，再补一条那个系统的提示（例如成就「初次冒险」→ 系统「图鉴」）。 */
    if (entry.rewardUnlock) emitUnlock({ id: entry.rewardUnlock.id, icon: entry.rewardUnlock.icon, category: entry.rewardUnlock.category, name: entry.rewardUnlock.name, detail: `由成就「${entry.name}」解锁` });
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
  workshop: 0, researchPoints: 0, researchRefreshCount: 0, researchTask: { itemId: -1, zoneId: -1, need: 0 }, researchLevels: researchItems.map(() => 0), autoEat: { itemId: -1, threshold: AUTO_EAT.defaultThreshold }, equipped: equipTypes.map(type => new Array(type.baseSlots).fill(-1)), settings: { fontScale: 0, notify: true, numberFormat: 0, changelogSeen: '' },
  inventory: new Array(items.length).fill(0),
  /* 开局送一把拾荒者短刃（+0，攻击 +6）。两处刻意的限制：
     - **只放在包里、不预装**（equipped 仍是全空）—— 废弃边境的怪物数值是按裸装校准的
       （见 UI开发规范 §7.6），要变强得玩家自己把它穿上；
     - **只给全新存档** —— rebuildState 的 equipment / nextInstanceId 都取自存档，
       老存档不会被补发（resetGame 走的是 freshState，所以重置后会重新拿到）。
     这里直接写实例字面量而不是调 addEquipment：后者读 REFINE_MAX，而那个常量声明在
     本函数之后，模块初始化时调用会踩暂时性死区。id 从 1 起，nextInstanceId 跟着写 2。 */
  equipment: [{ id: 1, itemId: ITEM.scavengedBlade, refine: 0 }], nextInstanceId: 2,
  encountered: new Array(enemyTable.length).fill(0), discoveredDrops: enemyTable.map(() => []), perfectItems: [], adventure: freshAdventure(),
  /* 后勤小队开局 1 人（全部待命）；工坊只有一个制造项，0 级且空闲；庇护所满血、随机事件从满间隔开始倒数。 */
  logistics: { assigned: logisticsTargets.map(() => 0) },
  campWorkshop: workshopItems.map(() => ({ level: 0, target: -1, work: 0 })),
  camp: { hp: CAMP_BASE.hp, worksiteProgress: 0, disasterWins: 0, tideWins: 0, randomTimer: RANDOM_EVENT_INTERVAL, pendingKind: -1, pendingId: -1, pendingExpires: 0, wave: 1, stage: 0, population: 0 },
  achievements: achievements.map(() => 0),
  notices: unlockNotices.map(() => 0),
  guides: [],
  devOverrides: new Array(Object.keys(DEV_STAT).length).fill(-1),
  log: [], lastTick: Date.now()
});

let state = freshState();
const listeners = new Set<(state: GameState) => void>();
let lastSave = Date.now();

export function getState(): GameState { return state; }
export function subscribe(listener: (state: GameState) => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
function notify(): void { syncEquipSlots(state); syncLogistics(state); syncCamp(state); checkAchievements(state); checkUnlocks(state); listeners.forEach(listener => listener(state)); }
/** 庇护所生命值只做上下限对齐：上限随城防 / 营垒提升，脱战时由 tick 的回血填满。
    波次 / 场次 / 人口也在这里夹一次上下限（读档、手改存档都可能给出越界值）。 */
function syncCamp(target: GameState): void {
  target.camp.hp = Math.max(0, Math.min(getCampMaxHp(target), Number(target.camp.hp) || 0));
  if (!(target.camp.randomTimer > 0)) target.camp.randomTimer = RANDOM_EVENT_INTERVAL;
  target.camp.wave = campWave(target);
  target.camp.stage = campWaveStage(target);
  target.camp.population = Math.max(0, Math.floor(Number(target.camp.population) || 0));
}
/* 数值与时长格式化统一放在 format.ts，这里转出一份，页面照旧从 game-state 引入。 */
import { formatNumber, formatNumberExact, formatSigned, numberHint, formatDuration, formatSeconds, formatPerSecond, numberFormats, NUMBER_FORMAT } from './format';
export { formatNumber, formatNumberExact, formatSigned, numberHint, formatDuration, formatSeconds, formatPerSecond, numberFormats, NUMBER_FORMAT };

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
function addEquipment(target: GameState, itemId: number, count: number, refine = 0): void { const level = Math.max(0, Math.min(REFINE_MAX, Math.floor(Number(refine) || 0))); for (let index = 0; index < count; index++) target.equipment.push({ id: target.nextInstanceId++, itemId, refine: level }); }
/** 某个区域掉落的装备自带几级精炼（见 config/zones.ts 的 dropRefine）。 */
function zoneDropRefine(enemyId: number): number { const zone = zones[zoneOfEnemy(enemyId)]; return Math.max(0, Math.floor(Number(zone?.dropRefine) || 0)); }
/** 持有数量：可堆叠物品看数量，装备数实例个数。物品栏上限按「种类」算，用它判断是不是新种类。 */
export function getOwnedCount(itemId: number, target: GameState = state): number { return items[itemId].stackable ? target.inventory[itemId] || 0 : target.equipment.reduce((total, instance) => (instance.itemId === itemId ? total + 1 : total), 0); }
/** 把某个装备实例从所有槽位上摘掉。正常流程下一个实例只占一个槽位，这里逐槽扫描做兜底。 */
function unequipEverywhere(target: GameState, instanceId: number): void { target.equipped.forEach(slots => { for (let index = 0; index < slots.length; index++) if (slots[index] === instanceId) slots[index] = -1; }); }
/** 精炼等级上限。每级让这件装备的自身属性 +1%，所以满级是「属性翻倍」。
    提升靠把同名装备拖到它身上（见 refineWithFeeder），新等级取「素材等级 + 1」——
    所以刷到一件高等级的掉落，比攒一堆 +0 快得多。 */
export const REFINE_MAX = 100;
/** 这件装备的精炼等级，越界与缺省都按 0 处理。 */
export function getRefine(instance: EquipmentInstance | undefined): number { return instance ? Math.max(0, Math.min(REFINE_MAX, Math.floor(Number(instance.refine) || 0))) : 0; }
/** 单个装备实例自身提供的属性（不含词条）。精炼每级把这几项放大 1%。 */
export function getInstanceBonus(instance: EquipmentInstance): { attack: number; hp: number; defense: number } {
  const base = items[instance.itemId].equip || {};
  const scale = 1 + getRefine(instance) / 100;
  return { attack: Math.round((base.attack || 0) * scale), hp: Math.round((base.hp || 0) * scale), defense: Math.round((base.defense || 0) * scale) };
}
/** 能不能把 feederId 喂给 instanceId：同名、素材没装在槽位上、目标还没满级。
    两个方向都允许 —— 低等级喂给高等级是合法操作，结果由 refineWithFeeder 保证不倒退。
    已装备的不能当素材：不能让玩家把自己身上的装备喂掉。 */
export function canRefineWith(instanceId: number, feederId: number, target: GameState = state): boolean {
  if (instanceId === feederId || instanceId < 0 || feederId < 0) return false;
  const instance = findEquipment(instanceId, target);
  const feeder = findEquipment(feederId, target);
  if (!instance || !feeder || feeder.itemId !== instance.itemId) return false;
  if (isEquipped(feederId, target)) return false;
  return getRefine(instance) < REFINE_MAX;
}
/** 精炼：消耗一件同名备用件，目标件的新等级 = 目标等级 + 素材等级 + 1（夹在 REFINE_MAX 以内）。
    等级是「相加」而不是「取较高者」：两件都要投进去，所以拖拽没有方向之分，也永远大于原等级。
    掉落的 +10 喂进 +0 是 +11；两件 +10 互喂是 +21；攒够 100 级比一件件喂快得多。 */
export function refineWithFeeder(instanceId: number, feederId: number): boolean {
  if (!canRefineWith(instanceId, feederId)) return false;
  const instance = findEquipment(instanceId)!;
  const feeder = findEquipment(feederId)!;
  const from = getRefine(instance);
  const feederLevel = getRefine(feeder);
  state.equipment = state.equipment.filter(entry => entry.id !== feederId);
  instance.refine = Math.min(REFINE_MAX, from + feederLevel + 1);
  addLog(state, `精炼：${itemTag(instance.itemId)} +${from} → +${instance.refine}（消耗同名装备 +${feederLevel}）。`, 'progress');
  /* 满级记为【极致】。这是「达成过」的记录，喂掉那件也保留（wiki 与套装奖励都看它）。
     整套部件都极致时再发一次永久加成 —— 只记日志，不弹 tips：unlock 提示留给系统级解锁。 */
  if (instance.refine >= REFINE_MAX && !state.perfectItems.includes(instance.itemId)) {
    state.perfectItems.push(instance.itemId);
    addLog(state, `${itemTag(instance.itemId)} 达成【极致】。`, 'progress');
    const setId = setOfItem(instance.itemId);
    const entry = setId >= 0 ? setTable[setId] : undefined;
    if (entry && entry.pieces.every(itemId => state.perfectItems.includes(itemId))) {
      addLog(state, `${entry.name}套装全部达成【极致】：永久获得${perfectBonusText(entry.perfectBonus)}。`, 'progress');
    }
  }
  saveState(); notify();
  return true;
}
/** 这件装备是否曾经精炼到 100 级（【极致】）。 */
export function isPerfectItem(itemId: number, target: GameState = state): boolean { return !!target.perfectItems?.includes(itemId); }
/** 套装加成（凑齐部件）的「标签 + 数值」条目。
    标签跟装备条目页的属性描述保持同一套词（攻击力 / 生命上限 / 防御力），
    图鉴的凑齐效果直接拿它铺数值网格，不要再另写一份标签。 */
export function setBonusEntries(bonus: SetBonus): { label: string; value: string }[] {
  const entries: { label: string; value: string }[] = [];
  if (bonus.attack) entries.push({ label: '攻击力', value: `+${bonus.attack}` });
  if (bonus.hp) entries.push({ label: '生命上限', value: `+${bonus.hp}` });
  if (bonus.defense) entries.push({ label: '防御力', value: `+${bonus.defense}` });
  if (bonus.regen) entries.push({ label: '生命恢复', value: `+${bonus.regen}/秒` });
  if (bonus.attackInterval) entries.push({ label: '出手间隔', value: `-${bonus.attackInterval} 秒` });
  return entries;
}
/** 套装加成的单行文案：装备加成面板这类只能放一行的位置用它，
    内容由 setBonusEntries 拼出来，两边不会各说各的。 */
export function setBonusText(bonus: SetBonus): string {
  return setBonusEntries(bonus).map(entry => `${entry.label} ${entry.value}`).join(' · ');
}
/** 【极致】奖励的「标签 + 数值」条目。标签跟 setBonusEntries 同一套词（攻击力 / 生命上限）。 */
export function perfectBonusEntries(bonus: { attackPct?: number; hpPct?: number }): { label: string; value: string }[] {
  const entries: { label: string; value: string }[] = [];
  if (bonus.attackPct) entries.push({ label: '攻击力', value: `+${bonus.attackPct}%` });
  if (bonus.hpPct) entries.push({ label: '生命上限', value: `+${bonus.hpPct}%` });
  return entries;
}
/** 【极致】奖励的单行文案：每一项单独用【】括起来（如【生命上限+25%】）。
    它是「这套拿到手会多什么」的结论，不是夹在句子里的描述，所以不用「 · 」串，各括各的。
    只给日志这类散文位置用 —— 图鉴里的极致效果是数值网格，走 perfectBonusEntries。 */
export function perfectBonusText(bonus: { attackPct?: number; hpPct?: number }): string {
  return perfectBonusEntries(bonus).map(entry => `【${entry.label}${entry.value}】`).join('');
}
/** 【极致】奖励：一套的全部部件都精炼到过 100 级时生效的永久百分比加成。
    只给百分比 —— 越早的套装越容易被后来的装备淘汰，百分比是唯一不会被淘汰的形式。 */
export function getPerfectBonus(target: GameState = state): { attackPct: number; hpPct: number } {
  const totals = { attackPct: 0, hpPct: 0 };
  const perfect = target.perfectItems || [];
  if (!perfect.length) return totals;
  for (const entry of setTable) {
    if (!entry.pieces.length || !entry.pieces.every(itemId => perfect.includes(itemId))) continue;
    totals.attackPct += entry.perfectBonus.attackPct || 0;
    totals.hpPct += entry.perfectBonus.hpPct || 0;
  }
  return totals;
}
/** 已装备实例自身提供的全部加成（不含词条）。装备栏的加成面板和玩家的攻击/生命/防御都从这里取。 */
export function getEquipBonus(target: GameState = state): { attack: number; hp: number; defense: number } {
  const bonus = { attack: 0, hp: 0, defense: 0 };
  for (const slots of target.equipped) for (const instanceId of slots) { const instance = instanceId >= 0 ? findEquipment(instanceId, target) : undefined; if (!instance) continue; const stats = getInstanceBonus(instance); bonus.attack += stats.attack; bonus.hp += stats.hp; bonus.defense += stats.defense; }
  return bonus;
}
/** 套装加成：一套的**全部**部件都装在身上才生效。
    已装备的物品按 id 去重，所以装两件同名装备不会重复计数。 */
export function getSetBonus(target: GameState = state): { attack: number; hp: number; defense: number; regen: number; attackInterval: number } {
  const totals = { attack: 0, hp: 0, defense: 0, regen: 0, attackInterval: 0 };
  const worn = new Set<number>();
  for (const slots of target.equipped) for (const instanceId of slots) {
    if (instanceId < 0) continue;
    const instance = findEquipment(instanceId, target);
    if (instance) worn.add(instance.itemId);
  }
  for (const entry of setTable) {
    if (!entry.pieces.length || !entry.pieces.every(itemId => worn.has(itemId))) continue;
    totals.attack += entry.bonus.attack || 0;
    totals.hp += entry.bonus.hp || 0;
    totals.defense += entry.bonus.defense || 0;
    totals.regen += entry.bonus.regen || 0;
    totals.attackInterval += entry.bonus.attackInterval || 0;
  }
  return totals;
}
/** 某套已经穿上几件（同名去重），界面用来显示套装进度。 */
export function getSetWorn(setId: number, target: GameState = state): number {
  const pieces = setTable[setId]?.pieces || [];
  if (!pieces.length) return 0;
  const worn = new Set<number>();
  for (const slots of target.equipped) for (const instanceId of slots) {
    if (instanceId < 0) continue;
    const instance = findEquipment(instanceId, target);
    if (instance) worn.add(instance.itemId);
  }
  return pieces.filter(itemId => worn.has(itemId)).length;
}
/** 已装备实例上所有词条的汇总。pct 是百分比（6 表示 +6%），在最后一步放大玩家的最终属性。
    workshopRate 是「工坊工时」的百分比加成，属于功能类 —— 不参与战斗，只作用在后勤推进上。 */
export interface AffixTotals { attack: number; hp: number; defense: number; attackPct: number; hpPct: number; workshopRate: number; skills: { skill: number; value: number }[] }
export function getAffixTotals(target: GameState = state): AffixTotals {
  const totals: AffixTotals = { attack: 0, hp: 0, defense: 0, attackPct: 0, hpPct: 0, workshopRate: 0, skills: [] };
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
      totals.workshopRate += (effect.workshopRate || 0) * affix.value;
      if (effect.skill !== undefined) totals.skills.push({ skill: effect.skill, value: affix.value });
    }
  }
  return totals;
}
/** 工坊工时倍率：每人每秒的工时 = 1 × 这个值。功能类词条「勤务」是唯一来源。
    只影响工坊制造，不影响营垒修筑 —— 词条写的是「工坊工时」。 */
export function getWorkshopRate(target: GameState = state): number { return 1 + getAffixTotals(target).workshopRate / 100; }
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
    colorClass 是给这一行着色的类名 —— 装备自身用稀有度色，词条用类别色。 */
export function getEquipBonusSources(key: EquipBonusKey, target: GameState = state): { name: string; value: number; colorClass: string }[] {
  const sources: { name: string; value: number; colorClass: string }[] = [];
  for (const slots of target.equipped) for (const instanceId of slots) {
    const instance = instanceId >= 0 ? findEquipment(instanceId, target) : undefined;
    if (!instance) continue;
    const item = items[instance.itemId];
    const base = key === 'attackPct' || key === 'hpPct' ? 0 : getInstanceBonus(instance)[key];
    /* colorClass 直接给出类名：装备自身走稀有度色，词条走类别色（进攻红 / 生存绿 / 功能蓝），
       消费方不需要知道这两套颜色是从哪来的。 */
    if (base) sources.push({ name: item.name, value: base, colorClass: rarityClass(item.rarity) });
    for (const affix of instance.affixes || []) { const definition = affixes[affix.id]; const value = (definition.effect[key] || 0) * affix.value; if (value) sources.push({ name: `${item.name} · ${definition.name}`, value, colorClass: affixCategoryClass(definition.category) }); }
  }
  return sources;
}
/** 防御力：来自装备自身与词条，减免受到的伤害（见 enemyAttack）。 */
export function getPlayerDefense(target: GameState = state): number { const override = devOverride(DEV_STAT.defense, target); if (override !== null) return override; return getEquipBonus(target).defense + getSetBonus(target).defense + getAffixTotals(target).defense; }
/** 这个装备实例是否在某个槽位上。参数是实例 id 而不是物品 id——同名装备的各件互不影响。 */
export function isEquipped(instanceId: number, target: GameState = state): boolean { return instanceId >= 0 && target.equipped.some(slots => slots.includes(instanceId)); }
/** 生命上限：先加固定值（基础 + 装备 + 套装 + 固定词条），最后按百分比词条放大。 */
export function getPlayerMaxHp(target: GameState = state): number { const override = devOverride(DEV_STAT.maxHp, target); if (override !== null) return override; const totals = getAffixTotals(target); const flat = 100 + getEquipBonus(target).hp + getSetBonus(target).hp + totals.hp; return Math.round(flat * (1 + (totals.hpPct + getPerfectBonus(target).hpPct) / 100)); }
export function getPlayerRegen(target: GameState = state): number { const override = devOverride(DEV_STAT.regen, target); if (override !== null) return override; return 2 + getSetBonus(target).regen; }
/** 进入战斗区域、以及击杀敌人之后，下一个敌人出现所需的刷新冷却（秒）。 */
export const SPAWN_COOLDOWN = 3;
/** 庇护所区域的基础回复倍率：在庇护所里生命回复速度 = 野外回复速度 × 这个值。 */
export const CAMP_REGEN_MULTIPLIER = 5;
/** 当前区域的回复倍率：庇护所用庇护所倍率，战斗区域为 1。 */
export function getRegenMultiplier(target: GameState = state): number { return isCampZone(currentZoneId(target)) ? CAMP_REGEN_MULTIPLIER : 1; }
/** 攻击力：先加固定值（基础 + 工坊 + 装备 + 套装 + 固定词条），最后按百分比词条放大。 */
export function getPlayerAttack(target: GameState = state): number { const override = devOverride(DEV_STAT.attack, target); if (override !== null) return override; const totals = getAffixTotals(target); const flat = 12 + getEquipBonus(target).attack + getSetBonus(target).attack + totals.attack; return Math.round(flat * (1 + (totals.attackPct + getPerfectBonus(target).attackPct) / 100)); }
/* 出手间隔下限 0.1 秒：覆盖值给到 0 会让战斗循环里 step 恒为 0，卡死主循环。
   基础值 2.2 秒，套装加成可以把它压低（下限 0.9 秒，防止堆到瞬发）。 */
export const PLAYER_ATTACK_INTERVAL = 2.2;
export function getPlayerAttackInterval(target: GameState = state): number { const override = devOverride(DEV_STAT.attackInterval, target); if (override !== null) return Math.max(.1, override); return Math.max(.9, PLAYER_ATTACK_INTERVAL - getSetBonus(target).attackInterval); }
/** 刷怪间隔：击杀 / 进入区域后到下一个敌人出现的秒数（可被开发者面板覆盖，同样有 0.1 秒下限）。 */
export function getSpawnCooldown(target: GameState = state): number { const override = devOverride(DEV_STAT.spawnCooldown, target); return override !== null ? Math.max(.1, override) : SPAWN_COOLDOWN; }
/* 物品栏上限按「种类」算：同一种物品可以无限叠加，只有新种类才会占用空位。
   初始 20 格：开局不加工坊与伙伴也放得下三个区域的掉落种类，不会刚出门就被上限卡住。
   `target.workshop` 是**遗留字段**（原「营火强化」，升级入口早就删了）：新存档恒为 0，
   只有老存档还带着旧值。它现在**只剩这一处引用** —— 要彻底清掉得同时决定
   「老存档那几十格要不要留」，所以先摆在明面上，别让它再悄悄影响别的数值。 */
export function getInventoryCapacity(target: GameState = state): number { return 20 + target.workshop * 2; }
/** 已占用格数：可堆叠物品按「种类」算一类一格；不可堆叠（装备）一件一格，同名的每一件都要各自占一格。
    例外：**已经穿在身上的装备不算占格** —— 穿戴本身就该腾出背包空间。
    否则凑齐套装（5 件）反而会把物品栏挤爆，装备越多越没地方放东西。 */
export function getInventoryUsed(target: GameState = state): number {
  let kinds = 0;
  for (const quantity of target.inventory) if (quantity > 0) kinds += 1;
  const worn = new Set<number>();
  for (const slots of target.equipped) for (const instanceId of slots) if (instanceId >= 0) worn.add(instanceId);
  return kinds + target.equipment.filter(instance => !worn.has(instance.id)).length;
}
export function currentZoneId(target: GameState = state): number { return zones[target.adventure.zoneId] ? target.adventure.zoneId : CAMP_ZONE_ID; }
export function currentZone(target: GameState = state) { return zones[currentZoneId(target)]; }
/** 庇护所这类没有敌人的区域：不刷怪，只按倍率回复生命值。 */
export function isCampZone(zoneId: number): boolean { return !zones[zoneId] || zones[zoneId].enemyIds.length === 0; }
/** 该怪物是否已经遭遇过（击杀过）：只有击杀过的怪物才会被图鉴收录。 */
export function isEncountered(enemyId: number, target: GameState = state): boolean { return !!target.encountered?.[enemyId]; }
/** 这只怪物的这条掉落是否已经被玩家实际拿到过：图鉴据此逐条揭示掉落表。 */
export function isDropDiscovered(enemyId: number, itemId: number, target: GameState = state): boolean { return !!target.discoveredDrops?.[enemyId]?.includes(itemId); }
/** 这个物品是否已经被发现过。三个来源取「或」：真的掉落过、当前物品栏里有、身上有这件装备实例。
    只看 discoveredDrops 不够 —— 研究委托的奖励、开发者面板发的物品都不经过掉落，
    那些途径拿到的东西在物品栏里躺着，图鉴却还标着「待发现」说不过去。
    图鉴的物品列表据此把没见过的显示成占位，而不是直接列出名字。 */
export function isItemDiscovered(itemId: number, target: GameState = state): boolean {
  if (target.discoveredDrops?.some(list => list?.includes(itemId))) return true;
  if ((target.inventory?.[itemId] || 0) > 0) return true;
  return !!target.equipment?.some(instance => instance.itemId === itemId);
}
export function currentEnemy(target: GameState = state) { return enemyTable[target.adventure.enemyId] || enemyTable[zones[currentZoneId(target)].enemyIds[0]] || enemyTable[FIRST_ENEMY_ID]; }
export function getEnemyAttackInterval(target: GameState = state): number { return currentEnemy(target).attackInterval; }
/* 目前所有区域都开放；后续做进度门槛时改这里的判断即可。 */
/** 区域是否解锁：主线进度达到 unlockIndex 才开放（庇护所为 0，一直可进）。 */
export function isZoneUnlocked(zoneId: number, target: GameState = state): boolean { return !!zones[zoneId] && target.mainlineIndex >= zones[zoneId].unlockIndex; }

function addLog(target: GameState, message: string, type: LogType = 'system'): void { target.log = [{ time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), message, type }, ...target.log].slice(0, 160); }
function updateMainline(target: GameState): void { while (target.mainlineIndex < mainline.length && mainline[target.mainlineIndex].condition(target)) { target.mainlineIndex += 1; const messages: Record<number, string> = { 2: '旧工坊重新亮起。现在可以把冒险带回的废料变成长期战力。', 3: '研究台接入了旧电池。新的升级路线已经开放。', 4: '你收到了幸存者的回应。伙伴系统已经可以使用。', 5: '余烬碎片指向更深处的道路。边境调查阶段完成。', 6: '庇护所挡下了第一场天灾，防线经验开始积累。', 7: '兽潮退去，庇护所战备阶段完成。荒野深处还有更大的信号。' }; addLog(target, messages[target.mainlineIndex] || '主线记录已更新。', 'progress'); } }
function chooseEnemyId(target: GameState): number { const ids = zones[currentZoneId(target)].enemyIds; return ids.length ? ids[Math.floor(Math.random() * ids.length)] : FIRST_ENEMY_ID; }
function prepareEnemy(target: GameState, enemyId = chooseEnemyId(target)): void { const enemy = enemyTable[enemyId]; const shouldRestore = !Number.isFinite(target.adventure.playerHp) || target.adventure.playerHp <= 0; target.adventure.enemyId = enemyId; target.adventure.enemyHp = enemy.maxHp; target.adventure.spawnTimer = 0; if (shouldRestore) target.adventure.playerHp = getPlayerMaxHp(target); target.adventure.playerAttackTimer = 0; target.adventure.enemyAttackTimer = 0; }
/** 敌人离场（被击杀或进入区域）后进入刷新冷却，冷却结束才会 prepareEnemy 出新敌人。 */
function startSpawnCooldown(target: GameState): void { target.adventure.spawnTimer = getSpawnCooldown(target); }
function randomAmount(min: number, max: number): number { return min + Math.floor(Math.random() * (max - min + 1)); }
/** 记录「这只怪物的这条掉落已经拿到过」，图鉴据此揭示对应条目。 */
function revealDrop(target: GameState, enemyId: number, itemId: number): void { const list = target.discoveredDrops[enemyId] || (target.discoveredDrops[enemyId] = []); if (!list.includes(itemId)) list.push(itemId); }
/* 只有真正进了包才算「获得」：被物品栏上限拒收的不揭示。 */
function grantDrops(target: GameState, enemyId: number): void { const enemy = enemyTable[enemyId]; enemy.dropTable.forEach(drop => { if (Math.random() > drop.chance) return; const item = items[drop.itemId]; /* 可堆叠的进数量，装备每件都建成独立实例；拿完如果超出上限，就丢掉刚拿到的这一件。 */
const amount = randomAmount(drop.min, drop.max); /* 装备每件都建成独立实例，可堆叠的进数量。 */ if (item.stackable) { target.inventory[drop.itemId] += amount; if (drop.itemId === ITEM.scrap) target.scrap += amount; if (drop.itemId === ITEM.emberShard) target.essence += amount; } else addEquipment(target, drop.itemId, amount, zoneDropRefine(enemyId)); revealDrop(target, enemyId, drop.itemId); addLog(target, `掉落：${itemTag(drop.itemId)} ×${amount}`, 'drop'); /* 超上限就把刚拿到的这件丢掉，不动玩家原有的东西。 */ trimInventoryOverflow(target, drop.itemId); }); }
/** 任务物品掉落：**当且仅当这个区域正是当前委托的目标时**才判定，掉率区域内所有怪物统一
    （QUEST_DROP_CHANCE），与各自的 dropTable 无关。和套装掉落一样独立成一步 ——
    不占「同一只怪物最多 3 条掉落」的名额。
    为什么加这道区域判定：任务物品除了交委托没有别的用途，在委托不指向的区域刷出来的只会
    白占物品栏格数。研究基地还没解锁时没有委托，自然也不掉 —— 否则玩家会在完全不知道这物品
    干什么用的阶段就开始攒它。
    **不按 need 封顶**：攒够了照掉 —— 交委托只扣 need 个，多出来的留在包里。 */
function grantQuestDrop(target: GameState, enemyId: number): void {
  const zoneId = zoneOfEnemy(enemyId);
  const itemId = questItemOf(zoneId);
  if (itemId < 0 || Math.random() > QUEST_DROP_CHANCE) return;
  if (!isResearchUnlocked(target) || getResearchTask(target).zoneId !== zoneId) return;
  target.inventory[itemId] += 1;
  revealDrop(target, enemyId, itemId);
  addLog(target, `掉落：${itemTag(itemId)} ×1`, 'drop');
  trimInventoryOverflow(target, itemId);
}
/** 清洗剂掉落：**任何**怪物都有 SOLVENT_DROP_CHANCE 的概率掉一瓶，三选一。
    和任务物品、套装掉落一样独立成一步 —— 不写进 dropTable，所以不占
    「同一只怪物最多 3 条掉落」的名额，也不需要给 15 只怪各写一条。
    掉率极低，这里不做任何区域或难度上的区分：它就是一张随手刮的彩票。 */
function grantSolventDrop(target: GameState, enemyId: number): void {
  if (Math.random() > SOLVENT_DROP_CHANCE) return;
  const itemId = SOLVENT_IDS[Math.floor(Math.random() * SOLVENT_IDS.length)];
  target.inventory[itemId] += 1;
  revealDrop(target, enemyId, itemId);
  addLog(target, `掉落：${itemTag(itemId)} ×1`, 'drop');
  trimInventoryOverflow(target, itemId);
}
/** 套装掉落：按怪物所在区域掉对应的套装部件，随机给其中一个部位。
    与怪物的 dropTable 完全独立 —— 它不写进 dropTable，所以不占用「同一只怪物最多 3 条掉落」的名额。 */
function grantSetDrop(target: GameState, enemyId: number): void {
  const setId = setOfZone(zoneOfEnemy(enemyId));
  const entry = setId >= 0 ? setTable[setId] : undefined;
  if (!entry || !entry.pieces.length || Math.random() > entry.dropChance) return;
  const itemId = entry.pieces[Math.floor(Math.random() * entry.pieces.length)];
  addEquipment(target, itemId, 1, zoneDropRefine(enemyId));
  addLog(target, `掉落：${itemTag(itemId)} ×1（${entry.name}套装）`, 'drop');
  trimInventoryOverflow(target, itemId);
}
/* 击杀才记入图鉴：仅仅遇到（prepareEnemy）不算。 */
function defeatEnemy(target: GameState, enemyId: number): void { const enemy = enemyTable[enemyId]; target.gold += enemy.gold; target.totalWins += 1; target.adventure.battleCount += 1; target.encountered[enemyId] = 1; addLog(target, `击败${enemyTag(enemyId)}，获得 ${enemy.gold} 金币。`, 'battle'); grantDrops(target, enemyId); grantSetDrop(target, enemyId); grantQuestDrop(target, enemyId); grantSolventDrop(target, enemyId); updateMainline(target); startSpawnCooldown(target); }
/* 伤害 = 攻击力 − 对方防御，至少 1 点：防御只能减免，不能完全免伤。
   词条赋予的技能按出手次数触发，额外叠一记倍率伤害（强度取词条数值的百分比）。 */
function playerAttack(target: GameState): void { const enemy = currentEnemy(target); target.adventure.attackCount += 1; const attack = getPlayerAttack(target); let damage = Math.max(1, attack - (enemy.defense || 0)); const triggered = []; for (const entry of getAffixTotals(target).skills) { const skill = skills[entry.skill]; if (!skill || target.adventure.attackCount % skill.interval !== 0) continue; damage += Math.round(attack * skill.multiplier * entry.value / 100); triggered.push(skill.name); } target.adventure.enemyHp = Math.max(0, target.adventure.enemyHp - damage); addLog(target, `${triggered.length ? `${triggered.join('、')}触发！` : ''}你攻击${enemyTag(target.adventure.enemyId)}，造成 ${damage} 点伤害。`, 'battle'); if (target.adventure.enemyHp <= 0) defeatEnemy(target, target.adventure.enemyId); }
function enemyAttack(target: GameState): void { const enemy = currentEnemy(target); const damage = Math.max(1, enemy.attack - getPlayerDefense(target)); target.adventure.playerHp = Math.max(0, target.adventure.playerHp - damage); addLog(target, `${enemyTag(target.adventure.enemyId)}反击，造成 ${damage} 点伤害。`, 'battle'); if (target.adventure.playerHp <= 0) { target.adventure.running = false; target.adventure.playerHp = getPlayerMaxHp(target); target.adventure.playerAttackTimer = 0; target.adventure.enemyAttackTimer = 0; target.adventure.spawnTimer = 0; target.adventure.zoneId = CAMP_ZONE_ID; addLog(target, '远征队生命值归零，已撤回庇护所并恢复状态。', 'defeat'); return; } /* 挨完这一下才判断要不要自动进食：放在这里最准 —— 一次 tick 可能推进多秒，挂在外层会出现「先死再吃」。 */ tryAutoEat(target); }
/** 按当前区域的回复倍率回血：庇护所是野外的 CAMP_REGEN_MULTIPLIER 倍。 */
function applyRegen(target: GameState, seconds: number): void { if (!(seconds > 0)) return; target.adventure.playerHp = Math.min(getPlayerMaxHp(target), target.adventure.playerHp + getPlayerRegen(target) * getRegenMultiplier(target) * seconds); }
function advanceAdventure(target: GameState, seconds: number): void { if (isCampZone(currentZoneId(target))) { applyRegen(target, seconds); return; } if (!target.adventure.running) return; let remaining = Math.max(0, seconds); while (remaining > 0 && target.adventure.running) { /* 刷怪冷却：场上没有敌人，只回复生命值。 */ if (target.adventure.spawnTimer > 0) { const wait = Math.min(remaining, target.adventure.spawnTimer); target.adventure.spawnTimer -= wait; applyRegen(target, wait); remaining -= wait; if (target.adventure.spawnTimer > 0) break; prepareEnemy(target); continue; } const enemy = currentEnemy(target); const playerInterval = getPlayerAttackInterval(target); const playerWait = Math.max(0, playerInterval - target.adventure.playerAttackTimer); const enemyWait = Math.max(0, enemy.attackInterval - target.adventure.enemyAttackTimer); const step = Math.min(remaining, playerWait, enemyWait); target.adventure.playerAttackTimer += step; target.adventure.enemyAttackTimer += step; applyRegen(target, step); remaining -= step; if (target.adventure.playerAttackTimer >= playerInterval - .0001) { target.adventure.playerAttackTimer = 0; playerAttack(target); } if (target.adventure.running && target.adventure.enemyAttackTimer >= enemy.attackInterval - .0001) { target.adventure.enemyAttackTimer = 0; enemyAttack(target); } if (step === 0 && target.adventure.running) { target.adventure.playerAttackTimer = 0; target.adventure.enemyAttackTimer = 0; } } }
/* ——— 庇护所 / 后勤小队的推进 ———
   分配出去的每个人每秒贡献 1 工时：营垒修筑把它换成营垒等级，工坊把它换成制造进度。
   工坊这一侧的工时会被功能类词条「勤务」放大（getWorkshopRate），营垒不受影响。
   每个制造项各用**自己那一份**人手（fortSlot），互不抢人，也就能同时开工。 */
function advanceLogistics(target: GameState, seconds: number): void {
  if (!(seconds > 0)) return;
  const builders = getLogisticsAssigned(LOGISTICS.camp, target);
  if (builders > 0) target.camp.worksiteProgress += builders * seconds;
  for (let id = 0; id < target.campWorkshop.length; id++) {
    /* 未解锁的制造项不参与：后勤人手不会投到还没解锁的东西上，它也不该被自动造出来。 */
    if (!isWorkshopItemUnlocked(id, target)) continue;
    const workers = getLogisticsAssigned(fortSlot(id), target);
    if (workers <= 0) continue;
    /* 每人每秒的实际工时：基础 1，被功能类词条「勤务」放大。人手乘上它才是这一轮的总产出。 */
    const output = workers * getWorkshopRate(target);
    /* 只要这一项分到了人就自动接着造下一级：资源不够时 beginWorkshopBuild 会失败，进度自然停住。
       budget 是这一轮能投入的秒数，循环让离线追赶（一大段 seconds）也能连造好几级。 */
    let budget = seconds;
    const item = target.campWorkshop[id];
    for (let guard = 0; guard < 100 && budget > 0; guard++) {
      if (item.target < 0 && !beginWorkshopBuild(id, target, true)) break;
      const need = (getWorkshopWorkTotal(id, target) - item.work) / output;
      if (need > budget) { item.work += output * budget; budget = 0; break; }
      budget -= need; item.level = item.target; item.target = -1; item.work = 0;
      addLog(target, `工坊完成制造：${workshopItems[id].name} 提升至 Lv.${item.level}，庇护所数值提高。`, 'progress');
      updateMainline(target);
    }
  }
}
/** 庇护所战斗：双方按各自间隔出手，谁先归零谁输。 */
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
      const damage = hitDamage(getCampAttack(target), battle.eventDefense);
      battle.eventHp = Math.max(0, battle.eventHp - damage);
      addLog(target, `庇护所防线反击「${battle.name}」，造成 ${damage} 点伤害。`, 'battle');
    }
    if (campBattle && battle.eventTimer >= battle.eventInterval - .0001) {
      battle.eventTimer = 0;
      const damage = hitDamage(battle.eventAttack, getCampDefense(target));
      battle.campHp = Math.max(0, battle.campHp - damage);
      addLog(target, `「${battle.name}」冲击庇护所，造成 ${damage} 点伤害。`, 'battle');
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
    const waveDone = settleCampWin(target, battle);
    addLog(target, `「${battle.name}」被击退：获得 ${battle.rewards.gold} 金币、${battle.rewards.scrap} 废料、${battle.rewards.essence} 精华${battle.rewards.survivors ? `，救下 ${battle.rewards.survivors} 名幸存者` : ''}。`, 'progress');
    if (waveDone) addLog(target, `第 ${campWave(target)} 波的动静已经传到庇护所。`, 'progress');
  } else {
    /* 输了不归零：庇护所留下 35% 生命，修整后可以再迎战（资源不退还）。 */
    target.camp.hp = Math.max(1, Math.round(getCampMaxHp(target) * .35));
    addLog(target, `「${battle.name}」冲垮了防线，庇护所受损。强化庇护所后再来一次。`, 'defeat');
  }
  saveState(); notify();
}
/** 结算一场胜利：发奖励、记次数、救下的人进人口、推进波次。返回**这一场是不是波末**。
    **只记账、不播报** —— 播报交给调用方（单场战斗一条日志、一键清剿只出一条汇总），
    这样两边的账走的是同一条路，不会各算各的。 */
function settleCampWin(target: GameState, stats: { kind: number; rewards: { gold: number; scrap: number; essence: number; survivors: number } }): boolean {
  target.gold += stats.rewards.gold; target.scrap += stats.rewards.scrap;
  /* 精华同时是物品「余烬碎片」的数量：两边一起加，否则资源条和物品栏会各说各的。 */
  target.essence += stats.rewards.essence;
  target.inventory[ITEM.emberShard] = (target.inventory[ITEM.emberShard] || 0) + stats.rewards.essence;
  /* disasterWins / tideWins 仍然记着：主线「抵御第一场天灾」「击退第一次兽潮」看的就是它们。 */
  if (stats.kind === CAMP_EVENT.disaster) target.camp.disasterWins += 1;
  if (stats.kind === CAMP_EVENT.tide) target.camp.tideWins += 1;
  /* 幸存者进人口，人口按 POP_PER_WORKER 换后勤人手（见 getLogisticsSources）。 */
  target.camp.population = Math.max(0, Number(target.camp.population) || 0) + stats.rewards.survivors;
  /* 波次推进：本波三场打完就进下一波（异种是波末）。 */
  target.camp.stage = (Number(target.camp.stage) || 0) + 1;
  const waveDone = target.camp.stage >= CAMP_WAVE_KINDS.length;
  if (waveDone) { target.camp.stage = 0; target.camp.wave = campWave(target) + 1; }
  /* 打赢就把防线修满 —— 下一场从这里重新开始算。 */
  target.camp.hp = getCampMaxHp(target);
  updateMainline(target);
  return waveDone;
}

/* ——— 一键清剿：把「能稳赢」的波次一次打完 ———
   判定靠**模拟**而不是估公式：双方都是固定数值 + 固定间隔，没有随机数，所以结果是确定的，
   与 advanceCampBattle 走同一套伤害公式（hitDamage）与同一套出手节奏。 */
/** 「能轻易通过」的门槛：整场下来生命不低于满血的这个比例才算稳。数值可调。 */
const SAFE_FIGHT_HP = .6;
/** 一次清剿最多结算多少场：防止某些数值组合把循环推到天荒地老。 */
const SWEEP_LIMIT = 200;
/** 一次攻击的伤害：双方同一套公式（最低 1 点）。战斗循环与「能不能稳赢」的模拟共用它 ——
    改了这里两边一起变，不会出现「模拟说稳赢、真打却输」。 */
function hitDamage(attack: number, defense: number): number { return Math.max(1, attack - defense); }
/** 模拟当前这一场：返回会不会赢、以及全程最低的生命比例。
    startHp 缺省取当前生命 —— 带伤硬上要算进去（打完一场才会回满）。 */
function simulateCampFight(stats: CampEventStats, target: GameState, startHp = getCampHp(target)): { won: boolean; lowest: number } {
  const maxHp = getCampMaxHp(target);
  const regen = getCampRegen(target);
  const campDamage = hitDamage(getCampAttack(target), stats.defense);
  const eventDamage = hitDamage(stats.attack, getCampDefense(target));
  let campHp = Math.min(maxHp, Math.max(0, startHp));
  let eventHp = stats.hp;
  let lowest = maxHp > 0 ? campHp / maxHp : 1;
  /* 时间上限：两边各自打死对方所需的出手次数，换算成秒再加余量。 */
  const limit = (stats.hp / campDamage + maxHp / eventDamage + 4) * Math.max(CAMP_ATTACK_INTERVAL, stats.interval);
  let elapsed = 0, campTimer = 0, eventTimer = 0;
  while (elapsed < limit && campHp > 0 && eventHp > 0) {
    const step = Math.min(CAMP_ATTACK_INTERVAL - campTimer, stats.interval - eventTimer);
    campTimer += step; eventTimer += step; elapsed += step;
    campHp = Math.min(maxHp, campHp + regen * step);
    if (campTimer >= CAMP_ATTACK_INTERVAL - .0001) { campTimer = 0; eventHp -= campDamage; }
    if (eventHp <= 0) break;
    if (eventTimer >= stats.interval - .0001) { eventTimer = 0; campHp -= eventDamage; lowest = Math.min(lowest, campHp / maxHp); }
  }
  return { won: eventHp <= 0 && campHp > 0, lowest };
}
/** 这一场能不能稳赢。 */
function isSafeCampFight(stats: CampEventStats, target: GameState): boolean {
  const result = simulateCampFight(stats, target);
  return result.won && result.lowest >= SAFE_FIGHT_HP;
}
/** 从当前这一场往后还能稳赢几场（只算，不落账）。界面拿它显示按钮上的数字。
    每场打赢后防线会修满、波次可能推进，所以这里只推进 wave / stage —— 它们才是影响强度的量。
    界面上这个数字是**参考值**：真正落地时 sweepCampWaves 会逐场重新验一遍。 */
export function countSafeCampFights(target: GameState = state): number {
  /* 用一份只改 wave / stage 的浅拷贝去取事件数值；campEventStats 不会改它。 */
  const probe: GameState = { ...target, camp: { ...target.camp } };
  let count = 0;
  let startHp = getCampHp(target);
  while (count < SWEEP_LIMIT) {
    const stats = withMaxHp(campEventStats(campWaveKind(probe), 0, probe));
    const result = simulateCampFight(stats, target, startHp);
    if (!result.won || result.lowest < SAFE_FIGHT_HP) break;
    count += 1;
    probe.camp.stage += 1;
    if (probe.camp.stage >= CAMP_WAVE_KINDS.length) { probe.camp.stage = 0; probe.camp.wave += 1; }
    startHp = getCampMaxHp(target);
  }
  return count;
}
/** 一键清掉所有能稳赢的波次：返回实际结算了几场。
    **每场都重新验一遍**，不照 countSafeCampFights 的数字走 —— 界面上的数字可能是缓存的，
    落地必须以当下状态为准（真打起来是稳赢的，所以这里不会翻车）。 */
export function sweepCampWaves(): number {
  if (campBattle || state.camp.pendingKind >= 0) return 0;
  const gained = { gold: 0, scrap: 0, essence: 0, survivors: 0, fights: 0 };
  while (gained.fights < SWEEP_LIMIT) {
    const stats = withMaxHp(campEventStats(campWaveKind(state), 0, state));
    if (!isSafeCampFight(stats, state)) break;
    gained.gold += stats.rewards.gold; gained.scrap += stats.rewards.scrap;
    gained.essence += stats.rewards.essence; gained.survivors += stats.rewards.survivors;
    gained.fights += 1;
    settleCampWin(state, stats);
    /* 打赢后生命回满，下一场从满血重新判 —— 与真实流程一致。 */
  }
  if (!gained.fights) return 0;
  addLog(state, `一键清剿：连打 ${gained.fights} 场，推进到第 ${campWave(state)} 波 —— 获得 ${gained.gold} 金币、${gained.scrap} 废料、${gained.essence} 精华${gained.survivors ? `，救下 ${gained.survivors} 名幸存者` : ''}。`, 'progress');
  saveState(); notify();
  return gained.fights;
}
/** 没有战斗时：庇护所按恢复速度回血；随机事件倒计时到点就触发，等待响应超时则跳过。 */
function advanceCamp(target: GameState, seconds: number): void {
  if (!(seconds > 0)) return;
  if (campBattle) { advanceCampBattle(target, seconds); return; }
  target.camp.hp = Math.min(getCampMaxHp(target), getCampHp(target) + getCampRegen(target) * seconds);
  if (target.camp.pendingKind >= 0) {
    if (Date.now() >= target.camp.pendingExpires) { clearPending(target); addLog(target, `${PENDING_EVENT_TIMEOUT} 秒内没有响应，这次突发状况已经过去。`, 'system'); }
    return;
  }
  /* 开局先不计时：随机事件要等远征真正开始（打完第一场战斗）之后才会找上门。 */
  if (!isCampEventTimerRunning(target)) return;
  target.camp.randomTimer -= seconds;
  if (target.camp.randomTimer > 0) return;
  target.camp.randomTimer = RANDOM_EVENT_INTERVAL;
  const id = Math.floor(Math.random() * randomEventDefs.length);
  target.camp.pendingKind = CAMP_EVENT.random; target.camp.pendingId = id; target.camp.pendingExpires = Date.now() + PENDING_EVENT_TIMEOUT * 1000;
  addLog(target, `庇护所收到警报：${randomEventDefs[id].name}。${PENDING_EVENT_TIMEOUT} 秒内决定是否应对。`, 'progress');
}
/** 设置项的存档校验：两个档位必须是已知下标，通知开关按布尔取（缺省开），
    「更新日志已读版本」只认字符串 —— 旧存档没有这个字段，从空串开始。 */
function readSettings(saved: any): SettingsState {
  return {
    fontScale: fontScales[saved?.fontScale] ? Math.floor(saved.fontScale) : 0,
    notify: saved?.notify !== false,
    numberFormat: numberFormats[saved?.numberFormat] ? Math.floor(saved.numberFormat) : 0,
    changelogSeen: typeof saved?.changelogSeen === 'string' ? saved.changelogSeen : ''
  };
}

/** 把一份（已经跑过迁移的）存档数据校验重建。每个字段都单独取默认值与上下限：
    存档可能来自旧版本、手改过的文件、或者被截断的文本，不能直接信。
    以 freshState() 为底再覆盖，所以新增字段会自动拿到初始值 —— 这就是「加字段不用改版本号」的原因。 */
function rebuildState(saved: any): GameState {
  const initial = freshState();
  /* 装备实例先重建出来：equipped 里存的是实例 id，要据此校验槽位引用是否还有效。 */ const equipment: EquipmentInstance[] = (Array.isArray(saved.equipment) ? saved.equipment : []).filter((entry: any) => entry && items[entry.itemId] && items[entry.itemId].category === 'equipment').map((entry: any) => ({ id: Math.max(1, Math.floor(Number(entry.id) || 0)), itemId: entry.itemId, refine: Math.max(0, Math.min(REFINE_MAX, Math.floor(Number(entry.refine) || 0))), affixes: (Array.isArray(entry.affixes) ? entry.affixes : []).filter((affix: any) => affix && affixes[affix.id]).map((affix: any) => ({ id: affix.id, value: Math.min(affixCap(affix.id), Math.max(0, Math.floor(Number(affix.value) || 0))) })) })); const equipmentIds = new Set(equipment.map(instance => instance.id)); const rebuilt: GameState = { ...initial, ...saved, equipped: equipTypes.map((type, equipType) => { const savedSlots = saved.equipped?.[equipType]; return Array.isArray(savedSlots) ? savedSlots.map(instanceId => (equipmentIds.has(instanceId) ? instanceId : -1)) : new Array(type.baseSlots).fill(-1); }), equipment, nextInstanceId: equipment.reduce((next, instance) => Math.max(next, instance.id + 1), 1), settings: readSettings(saved.settings), inventory: initial.inventory.map((_, itemId) => (items[itemId].stackable ? Math.max(0, Math.floor(Number(saved.inventory?.[itemId]) || 0)) : 0)), encountered: enemyTable.map((_, enemyId) => (saved.encountered?.[enemyId] ? 1 : 0)), discoveredDrops: enemyTable.map((_, enemyId) => (Array.isArray(saved.discoveredDrops?.[enemyId]) ? saved.discoveredDrops[enemyId].filter((itemId: number) => items[itemId]) : [])), adventure: { ...initial.adventure, ...saved.adventure }, logistics: { assigned: logisticsTargets.map((_, index) => Math.max(0, Math.floor(Number(saved.logistics?.assigned?.[index]) || 0))) }, campWorkshop: workshopItems.map((_, id) => { const entry = saved.campWorkshop?.[id]; return { level: Math.max(0, Math.floor(Number(entry?.level) || 0)), target: Number.isFinite(entry?.target) ? Math.floor(entry.target) : -1, work: Math.max(0, Number(entry?.work) || 0) }; }), camp: { ...initial.camp, ...saved.camp, hp: Math.max(0, Number(saved.camp?.hp) || initial.camp.hp), wave: Math.max(1, Math.floor(Number(saved.camp?.wave) || 1)), stage: Math.max(0, Math.min(CAMP_WAVE_KINDS.length - 1, Math.floor(Number(saved.camp?.stage) || 0))), population: Math.max(0, Math.floor(Number(saved.camp?.population) || 0)) }, perfectItems: (Array.isArray(saved.perfectItems) ? saved.perfectItems : []).map((itemId: number) => Math.floor(Number(itemId) || -1)).filter((itemId: number) => itemId >= 0 && !!items[itemId]),
achievements: achievements.map((_, index) => (saved.achievements?.[index] ? 1 : 0)), notices: unlockNotices.map((_, index) => (saved.notices?.[index] ? 1 : 0)), devOverrides: initial.devOverrides.map((_, index) => (Number.isFinite(saved.devOverrides?.[index]) ? Math.floor(saved.devOverrides[index]) : -1)), ...readResearchState(saved), autoEat: readAutoEat(saved), log: [] };
  /* 区域 / 敌人这类字段存的是配置表下标，配置删项后可能指向不存在的位置，进来先对齐一次。 */
  if (!zones[rebuilt.adventure.zoneId]) rebuilt.adventure.zoneId = CAMP_ZONE_ID;
  if (isCampZone(rebuilt.adventure.zoneId)) rebuilt.adventure.running = false;
  if (!Number.isFinite(rebuilt.adventure.spawnTimer)) rebuilt.adventure.spawnTimer = 0;
  if (rebuilt.adventure.spawnTimer <= 0 && (!enemyTable[rebuilt.adventure.enemyId] || !rebuilt.adventure.enemyHp)) prepareEnemy(rebuilt);
  return rebuilt;
}

/** 解析一份存档数据：解信封 → 按存档自己的版本跑迁移 → 校验重建。
    localStorage 读盘与「从文本 / 文件导入」都走这里，两条路共用同一套兜底规则。 */
function parseSave(raw: unknown): GameState {
  const unwrapped = unwrapSave(raw);
  if (!unwrapped) return freshState();
  let data = unwrapped.data;
  for (let from = unwrapped.version; from < SAVE_VERSION; from += 1) {
    const migrate = MIGRATIONS[from];
    if (migrate) data = migrate(data);
  }
  return rebuildState(data);
}

/** 从任意来源读出一个存档载荷与它的版本号；读不出来（不是存档）时返回 null。三种输入都认：
    1) 编码后的存档文本（当前格式，带 SAVE_PREFIX）；
    2) 明文信封对象（v7 的中间格式 —— 那时 state 还是明文 JSON，没有编码层）；
    3) 裸 GameState（v6 及更早 —— 那时版本号在 localStorage 的 key 名里）。 */
function unwrapSave(raw: unknown): { version: number; data: any } | null {
  if (typeof raw === 'string') {
    const envelope = decodeEnvelope(raw);
    if (!envelope || !envelope.state || typeof envelope.state !== 'object') return null;
    return { version: Math.floor(Number(envelope.version)) || SAVE_VERSION, data: envelope.state };
  }
  if (!raw || typeof raw !== 'object') return null;
  const envelope = raw as Partial<SaveEnvelope>;
  if (envelope.format === SAVE_FORMAT) {
    if (!envelope.state || typeof envelope.state !== 'object') return null;
    return { version: Math.floor(Number(envelope.version)) || SAVE_VERSION, data: envelope.state };
  }
  return isRawState(raw) ? { version: SAVE_VERSION - 1, data: raw } : null;
}

/** 粗判「这是不是一个 GameState」：只看两个每个版本都一定有的字段。
    导入时要靠它把无关的 JSON 挡在外面 —— parseSave 对任何输入都会「成功」（补成初始存档），
    没有这道判断，玩家贴一段无关文本会得到「导入成功但进度没了」。 */
function isRawState(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return Array.isArray(data.inventory) && typeof data.gold === 'number';
}

/** 离线补偿：远征、后勤、庇护所各推进一段。上限 MAX_OFFLINE_SECONDS，超出部分不算。
    不到 3 秒不值得记一条日志，但后勤与庇护所的进度照走。 */
function applyOfflineProgress(target: GameState): void {
  const seconds = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, (Date.now() - target.lastTick) / 1000));
  if (seconds < 1) return;
  if (seconds >= 3) {
    if (target.adventure.running) {
      const before = target.totalWins;
      advanceAdventure(target, seconds);
      addLog(target, `你离开了 ${formatDuration(seconds)}。远征队完成了 ${formatNumber(target.totalWins - before)} 场战斗。`, 'system');
    } else if (isCampZone(currentZoneId(target))) {
      advanceAdventure(target, seconds);
      addLog(target, `你离开了 ${formatDuration(seconds)}。远征队在庇护所休整。`, 'system');
    }
  }
  advanceLogistics(target, seconds);
  advanceCamp(target, seconds);
}

/** 读 localStorage 里的存档：先试新 key，再按顺序试历史 key（v7 之前版本号写在 key 名里）。
    读到历史 key 就顺手搬一次家，下次启动不必再兜底。
    存量值的格式有三种（见 unwrapSave），所以这里不假定它是 JSON：先按 JSON 试，失败就当文本。 */
function readStoredSave(): unknown {
  const current = localStorage.getItem(SAVE_KEY);
  if (current) return parseStored(current);
  for (const key of LEGACY_SAVE_KEYS) {
    const legacy = localStorage.getItem(key);
    if (!legacy) continue;
    localStorage.setItem(SAVE_KEY, legacy);
    localStorage.removeItem(key);
    return parseStored(legacy);
  }
  return null;
}

/** localStorage 里的存量值可能是编码文本（当前格式）或 JSON（v7 中间格式与更早）。
    先按 JSON 试，失败就当文本 —— 编码文本带 EMBER7. 前缀，JSON.parse 必然失败。 */
function parseStored(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return raw; }
}

/** 这次启动有没有读到存档。新玩家（没有任何存档）不弹更新公告 —— 那是「版本更新了」的提示，
    不是新手欢迎语；而且新档还要放首次引导，两屏一起弹也看不过来。 */
let hadSave = false;
export function hasExistingSave(): boolean { return hadSave; }

/** 启动时读盘。没有存档、或存档坏了，都退回全新状态。 */
function hydrate(): void {
  const stored = readStoredSave();
  hadSave = stored !== null && stored !== undefined;
  try { state = parseSave(stored); } catch { state = freshState(); hadSave = false; }
  applyOfflineProgress(state);
  state.lastTick = Date.now(); syncEquipSlots(state); syncLogistics(state); syncCamp(state); checkAchievements(state); checkUnlocks(state);
  /* 旧存档（或改过的存档）可能带着超过上限的负载：进来先压回上限。 */
  trimInventoryOverflow(state);
}

/** 序列化成信封。log 与 devOverrides 都不入档：
    log 占了全量 JSON 的绝大部分、刷新后重建成本极低；
    devOverrides 是开发者面板的临时覆盖值，带出去会让导入方的数值对不上。 */
function serialize(): SaveEnvelope {
  const { log, devOverrides, ...persisted } = state;
  return { format: SAVE_FORMAT, version: SAVE_VERSION, savedAt: Date.now(), state: persisted };
}

function saveState(): void { state.lastTick = Date.now(); try { localStorage.setItem(SAVE_KEY, exportSaveText()); } catch {} }

/* ——— 存档的导出与导入 ———
   导出成一段文本（`EMBER7.` + Base64），存成文件下载，或复制到别处保存；
   导入接受同一段文本，从文件读或直接粘贴都行。

   导入走 parseSave，所以进来的数据和读盘一样会被逐字段校验 —— 改过的、截断的、
   旧版本的备份都兜得住。 */

/** 导出成存档文本。存成文件、复制粘贴、写进 localStorage 用的都是它，只有一条编码路径。 */
export function exportSaveText(): string { return encodeEnvelope(serialize()); }

/** JSON.parse 的静默版：解析失败返回 null，不抛。 */
function safeParseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

/** 校验一段数据能不能当成本游戏的存档读。返回给玩家看的错误说明，null 表示通过。 */
function validateSave(raw: unknown): string | null {
  const unwrapped = unwrapSave(raw);
  if (!unwrapped) return '这不是本游戏的存档。';
  if (unwrapped.version > SAVE_VERSION) return `存档格式版本（v${unwrapped.version}）比当前游戏（v${SAVE_VERSION}）新，请先更新游戏再导入。`;
  return null;
}

/** 从存档文本导入。成功返回 { ok: true }，失败返回原因 —— **失败时不动当前存档**。
    会先弹一次确认：导入不可撤销。
    导入不补偿离线（lastTick 直接对齐到当前时间）—— 否则「存一份备份、挂一周、再导入」
    就成了刷进度的捷径，而导入本身是「恢复进度」，不是「继续挂机」。 */
export function importSaveText(text: string): SaveIoResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, message: '存档文本是空的。' };
  /* 存档文本是一整段 Base64（内部没有空白），粘贴时带进来的换行与空格先去掉。
     另外也接受明文 JSON：v7 的中间格式就是它，手改过的备份可能长这样。 */
  let raw: unknown = trimmed.startsWith('{') ? safeParseJson(trimmed) : trimmed.replace(/\s+/g, '');
  if (raw === null) return { ok: false, message: '不是有效的存档文本。' };
  const error = validateSave(raw);
  if (error) return { ok: false, message: error };
  if (!window.confirm('导入会覆盖当前进度，且无法撤销。确定继续吗？')) return { ok: false, message: '已取消导入。' };
  state = parseSave(raw);
  state.lastTick = Date.now();
  addLog(state, '已从备份导入存档。', 'system');
  saveState();
  notify();
  return { ok: true, message: '存档已导入。' };
}

/* 进入战斗区域立刻自动开战；进入庇护所这类非战斗区域则停下战斗、开始休整。 */
export function selectZone(zoneId: number): void { const zone = zones[zoneId]; if (!zone || !isZoneUnlocked(zoneId)) return; state.adventure.zoneId = zoneId; state.adventure.playerAttackTimer = 0; state.adventure.enemyAttackTimer = 0; if (isCampZone(zoneId)) { state.adventure.running = false; state.adventure.spawnTimer = 0; addLog(state, `远征队回到${zoneTag(zoneId)}，开始休整。`, 'system'); } else { state.adventure.running = true; startSpawnCooldown(state); addLog(state, `远征队进入${zoneTag(zoneId)}，等待敌人出现。`, 'system'); } saveState(); notify(); }
export function toggleAutoPush(): void { state.adventure.autoPush = !state.adventure.autoPush; saveState(); notify(); }
/* ——— 研究基地 ———
   委托只索取**任务物品**（每个战斗区域一种，见 config/zones.ts 的 questItem），
   数量在 needMin ~ needMax 之间随机，上限会被研究项「任务需求降低 I」压低。
   交齐即得研究点数，研究点数用来提升研究项。 */
/** 由「分析异常电池」解锁（mainline 下标 2 完成后 mainlineIndex 变成 3）。 */
export function isResearchUnlocked(target: GameState = state): boolean { return target.mainlineIndex >= RESEARCH_UNLOCK_INDEX; }
/** 读档时把研究基地的字段规整成合法值：旧存档没有这些字段，越界的等级也要压回上限。 */
function readResearchState(saved: any): { researchPoints: number; researchRefreshCount: number; researchTask: ResearchTaskState; researchLevels: number[] } {
  const task = saved?.researchTask;
  return {
    researchPoints: Math.max(0, Math.floor(Number(saved?.researchPoints) || 0)),
    /* 需求区间调整过三次（90~110 → 20~40 → 8~12 → 50~60）：这里只压**上限**，
       不让旧存档背着一份要交上百个的委托。区间上调时不把旧值抬起来 ——
       手上那份 8~12 的委托照旧能交（已攒的数量不浪费），交完重抽的就是新区间了。 */
    researchTask: { itemId: Number.isFinite(task?.itemId) ? Math.floor(task.itemId) : -1, zoneId: Number.isFinite(task?.zoneId) ? Math.floor(task.zoneId) : -1, need: Math.min(RESEARCH.needMax, Math.max(0, Math.floor(Number(task?.need) || 0))) },
    /* 刷新次数是 v8 新增字段，旧存档没有，从 0 开始。 */
    researchRefreshCount: Math.max(0, Math.floor(Number(saved?.researchRefreshCount) || 0)),
    researchLevels: researchItems.map((entry, id) => Math.min(entry.maxLevel, Math.max(0, Math.floor(Number(saved?.researchLevels?.[id]) || 0))))
  };
}
/** 自动进食的存档校验：指定的东西必须仍然存在且确实是食物，阈值夹进可调范围。 */
function readAutoEat(saved: any): AutoEatState {
  const itemId = Number.isFinite(saved?.autoEat?.itemId) ? Math.floor(saved.autoEat.itemId) : -1;
  const threshold = Math.floor(Number(saved?.autoEat?.threshold) || AUTO_EAT.defaultThreshold);
  return {
    itemId: items[itemId]?.use?.heal ? itemId : -1,
    threshold: Math.max(AUTO_EAT.minThreshold, Math.min(AUTO_EAT.maxThreshold, threshold))
  };
}
/** 需求数量的上限：被「任务需求降低」逐级压低，但不低于下限。 */
export function getResearchNeedMax(target: GameState = state): number { return Math.max(RESEARCH.needMin, RESEARCH.needMax - getResearchLevel(RESEARCH_ITEM.taskNeed, target)); }
/** 可发布委托的区域：已解锁的战斗区域（庇护所这类没有任务物品的区域排除在外）。 */
function researchZones(target: GameState): number[] {
  return zones.map((zone, zoneId) => (zone.enemyIds.length && isZoneUnlocked(zoneId, target) && questItemOf(zoneId) >= 0 ? zoneId : -1)).filter(zoneId => zoneId >= 0);
}
/** 抽一份委托：随机挑一个已解锁区域，要它的任务物品。 */
function rollResearchTask(target: GameState): ResearchTaskState {
  const pool = researchZones(target);
  if (!pool.length) return { itemId: -1, zoneId: -1, need: 0 };
  const zoneId = pool[Math.floor(Math.random() * pool.length)];
  const min = RESEARCH.needMin;
  const max = getResearchNeedMax(target);
  return { itemId: questItemOf(zoneId), zoneId, need: min + Math.floor(Math.random() * (max - min + 1)) };
}
/** 当前委托：没有（或存档里的数据失效）就立刻发布一份。
    校验里带「必须是这个区域的任务物品」—— 旧存档里的委托要的是普通掉落物，
    版本更新后会被这一步换掉，玩家不会背着一份再也交不上的委托。 */
export function getResearchTask(target: GameState = state): ResearchTaskState {
  const task = target.researchTask;
  const valid = !!task && task.need > 0 && task.zoneId >= 0 && task.itemId >= 0
    && items[task.itemId]?.category === 'quest' && task.itemId === questItemOf(task.zoneId);
  if (!valid) target.researchTask = rollResearchTask(target);
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
  /* 任务物品是普通可堆叠物品，直接扣数量。它不是金币 / 精华的镜像资源，不用同步那两个字段。 */
  state.inventory[task.itemId] -= task.need;
  const reward = getResearchReward(state);
  state.researchPoints += reward;
  addLog(state, `研究基地完成委托：交付 ${itemTag(task.itemId)} ×${task.need}，获得研究点数 ${reward}。`, 'progress');
  state.researchTask = rollResearchTask(state);
  /* 交完委托，刷新计数归零 —— 递增费用是「反复挑单」的代价，不该跟着玩家一辈子。 */
  state.researchRefreshCount = 0;
  saveState(); notify();
}
export function getResearchLevel(id: number, target: GameState = state): number {
  const entry = researchItems[id];
  return entry ? Math.min(entry.maxLevel, Math.max(0, Math.floor(target.researchLevels?.[id] || 0))) : 0;
}
/** 升级消耗：costBase + costStep × 当前等级。costStep 是 0，所以每一级都是同一个数 ——
    签名保留 target，和这里其他 getter（getResearchLevel / getResearchNeedMax）保持一致。 */
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
export function discardItem(itemId: number, amount = 1): void { const item = items[itemId]; const owned = state.inventory[itemId] || 0; const count = Math.min(owned, Math.max(1, Math.floor(amount))); if (!item || !item.stackable || !count) return; state.inventory[itemId] = owned - count; if (itemId === ITEM.scrap) state.scrap = Math.max(0, state.scrap - count); if (itemId === ITEM.emberShard) state.essence = Math.max(0, state.essence - count); addLog(state, `丢弃了 ${itemTag(itemId)} ×${count}。`, 'system'); saveState(); notify(); }
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
  addLog(target, `物品栏已满，${itemTag(itemId)} ×${count} 被丢弃。`, 'system');
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
    addLog(target, `物品栏已满，${itemTag(instance.itemId)}被丢弃。`, 'system');
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
export function discardEquipment(instanceId: number): void { const instance = findEquipment(instanceId); if (!instance) return; unequipEverywhere(state, instanceId); state.equipment = state.equipment.filter(entry => entry.id !== instanceId); addLog(state, `丢弃了 ${itemTag(instance.itemId)}。`, 'system'); saveState(); notify(); }

/* ——— 道具使用 ———
   item.use 是函数，执行器只负责准备上下文、跑完保存并刷新界面。
   需要点选目标的道具会先返回 pick-equipment，界面进入点选模式后再带着 instanceId 调一次。 */
/** 给某个实例加词条：已有同名则加数值，顶到上限就什么都不做。返回是否真的改了。
    sourceItemId 是消耗掉的强化物（记日志用），日志里的物品名统一写成物品标记。 */
function grantAffixTo(instanceId: number, affixId: number, sourceItemId: number): boolean { const instance = findEquipment(instanceId); const definition = affixes[affixId]; if (!instance || !definition) return false; const list = instance.affixes || (instance.affixes = []); const existing = list.find(affix => affix.id === affixId); const source = `「${itemTag(sourceItemId)}」`; if (!existing) { list.push({ id: affixId, value: definition.base }); addLog(state, `${source}为「${itemTag(instance.itemId)}」刻上词条「${definition.name}」。`, 'progress'); return true; } const cap = affixCap(affixId); if (existing.value >= cap) { addLog(state, `「${definition.name}」已经到上限 ${cap} 了，${source}没有消耗。`, 'system'); return false; } existing.value = Math.min(cap, existing.value + definition.step); addLog(state, `${source}把「${definition.name}」提升到 ${existing.value}（上限 ${cap}）。`, 'progress'); return true; }
/** 移除某个实例的第 index 条词条。 */
function removeAffixFrom(instanceId: number, index: number, sourceItemId: number): boolean { const instance = findEquipment(instanceId); const affix = instance?.affixes?.[index]; if (!instance || !affix) return false; const definition = affixes[affix.id]; instance.affixes!.splice(index, 1); addLog(state, `「${itemTag(sourceItemId)}」洗掉了「${itemTag(instance.itemId)}」上的「${definition.name}」。`, 'system'); return true; }
/** 使用一件道具。instanceId 是玩家点选的目标装备实例，-1 表示还没有目标。
    返回界面接下来要做什么：直接结束 / 需要点选装备 / 需要选一条词条。 */
export function useItem(itemId: number, instanceId = -1, affixIndex = -1): UseOutcome {
  const item = items[itemId];
  if (!item || item.category !== 'consumable' || !item.use || !(state.inventory[itemId] > 0)) return { kind: 'done' };
  const outcome = item.use({
    itemId, instanceId, affixIndex,
    consume: () => { state.inventory[itemId] -= 1; },
    log: (message, type = 'system') => addLog(state, message, type),
    heal: amount => { const maxHp = getPlayerMaxHp(state); const healed = Math.min(amount, Math.max(0, maxHp - state.adventure.playerHp)); state.adventure.playerHp = Math.min(maxHp, state.adventure.playerHp + amount); addLog(state, healed > 0 ? `使用了 ${itemTag(itemId)}，恢复 ${healed} 点生命值。` : `使用了 ${itemTag(itemId)}。`, 'system'); },
    affixes: () => { const instance = instanceId >= 0 ? findEquipment(instanceId) : undefined; return instance?.affixes ? instance.affixes.map(affix => ({ ...affix })) : []; },
    grantAffix: affixId => grantAffixTo(instanceId, affixId, itemId),
    removeAffix: index => removeAffixFrom(instanceId, index, itemId)
  });
  saveState(); notify();
  return outcome;
}
/* 拖拽 → 把某个装备实例放进指定槽位。类型不匹配、槽位不存在或实例不存在时返回 false。 */
export function equipToSlot(instanceId: number, equipType: number, slotIndex: number): boolean { const itemId = getInstanceItemId(instanceId); const item = itemId >= 0 ? items[itemId] : null; const slots = state.equipped[equipType]; if (!item || item.equipType !== equipType || !slots || slotIndex < 0 || slotIndex >= slots.length) return false; unequipEverywhere(state, instanceId); /* 同一个实例不能同时占两个槽位，先把它从原槽位摘掉。 */ slots[slotIndex] = instanceId; addLog(state, `装备了 ${itemTag(itemId)}，远征战力提升。`, 'progress'); saveState(); notify(); return true; }
/* 右键 → 装备 / 卸下：一律进该类型的第一个槽位（武器、饰品等多槽类型同理）。
   参数是装备实例 id：同名装备的每一件都是独立实例，点哪一件就操作哪一件，标记也跟着落在那一张卡片上。 */
export function equipItem(instanceId: number): void { const itemId = getInstanceItemId(instanceId); const item = itemId >= 0 ? items[itemId] : null; if (!item) return; const equipType = item.equipType ?? EQUIP_TYPE.weapon; if (isEquipped(instanceId)) { unequipEverywhere(state, instanceId); addLog(state, `卸下了 ${itemTag(itemId)}。`, 'system'); saveState(); notify(); return; } equipToSlot(instanceId, equipType, 0); }
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
  { name: '物品栏扩充（遗留）', get: (target: GameState) => target.workshop, set: (target: GameState, value: number) => { target.workshop = value; } },
  { name: '研究点数', get: (target: GameState) => target.researchPoints, set: (target: GameState, value: number) => { target.researchPoints = value; } },
  { name: '庇护所生命', get: (target: GameState) => Math.floor(target.camp.hp), set: (target: GameState, value: number) => { target.camp.hp = Math.min(getCampMaxHp(target), value); } },
  { name: '营垒工时', get: (target: GameState) => Math.floor(target.camp.worksiteProgress), set: (target: GameState, value: number) => { target.camp.worksiteProgress = value; } },
  { name: '天灾通过', get: (target: GameState) => target.camp.disasterWins, set: (target: GameState, value: number) => { target.camp.disasterWins = value; } },
  { name: '兽潮通过', get: (target: GameState) => target.camp.tideWins, set: (target: GameState, value: number) => { target.camp.tideWins = value; } },
  { name: '城防等级', get: (target: GameState) => target.campWorkshop[0].level, set: (target: GameState, value: number) => { target.campWorkshop[0].level = value; } },
  { name: '城防工时', get: (target: GameState) => Math.floor(target.campWorkshop[0].work), set: (target: GameState, value: number) => { target.campWorkshop[0].work = value; } },
  { name: '营垒后勤', get: (target: GameState) => getLogisticsAssigned(LOGISTICS.camp, target), set: (target: GameState, value: number) => { target.logistics.assigned[LOGISTICS.camp] = value; } },
  /* 每个制造项一行后勤：人手是分到具体某一项的，不再有「工坊后勤」这个总池子。 */
  ...workshopItems.map((item, id) => ({ name: `${item.name}后勤`, get: (target: GameState) => getLogisticsAssigned(fortSlot(id), target), set: (target: GameState, value: number) => { target.logistics.assigned[fortSlot(id)] = value; } })),
  /* 冒险：只关心玩家自身的派生战斗属性，写的是覆盖值（见 devOverride）。
     攻击力 / 防御力 / 生命上限是整数，回复与两个间隔带小数，所以给它们单独的 display。 */
  { name: '自身攻击力', get: (target: GameState) => getPlayerAttack(target), set: (target: GameState, value: number) => { target.devOverrides[DEV_STAT.attack] = value; } },
  { name: '防御力', get: (target: GameState) => getPlayerDefense(target), set: (target: GameState, value: number) => { target.devOverrides[DEV_STAT.defense] = value; } },
  { name: '最大生命', get: (target: GameState) => getPlayerMaxHp(target), set: (target: GameState, value: number) => { target.devOverrides[DEV_STAT.maxHp] = value; } },
  { name: '生命回复', float: true, get: (target: GameState) => getPlayerRegen(target), display: (target: GameState) => formatPerSecond(getPlayerRegen(target)), set: (target: GameState, value: number) => { target.devOverrides[DEV_STAT.regen] = value; } },
  { name: '出手间隔', float: true, get: (target: GameState) => getPlayerAttackInterval(target), display: (target: GameState) => formatSeconds(getPlayerAttackInterval(target)), set: (target: GameState, value: number) => { target.devOverrides[DEV_STAT.attackInterval] = value; } },
  { name: '刷怪间隔', float: true, get: (target: GameState) => getSpawnCooldown(target), display: (target: GameState) => formatSeconds(getSpawnCooldown(target)), set: (target: GameState, value: number) => { target.devOverrides[DEV_STAT.spawnCooldown] = value; } }
];
/** 直接发物品：废料与余烬碎片要同步累加到对应的资源字段上，否则会和物品栏脱节；
    装备则生成等量的独立实例，所以发 5 件就是 5 张卡片。 */
export function devGrantItem(itemId: number, amount: number): void { const item = items[itemId]; if (!item) return; const count = Math.max(1, Math.floor(amount)); if (item.stackable) { state.inventory[itemId] += count; if (itemId === ITEM.scrap) state.scrap += count; if (itemId === ITEM.emberShard) state.essence += count; } else addEquipment(state, itemId, count); addLog(state, `[DEV] 获得 ${itemTag(itemId)} ×${count}。`, 'system'); trimInventoryOverflow(state, itemId); saveState(); notify(); }
/** entry.float 的项（回复、两个间隔）保留两位小数，其余按整数取整。 */
export function devSetStat(index: number, value: number): void { const entry = devStats[index]; if (!entry || !Number.isFinite(value)) return; const safe = Math.max(0, entry.float ? Math.round(value * 100) / 100 : Math.floor(value)); entry.set(state, safe); trimInventoryOverflow(state); addLog(state, `[DEV] ${entry.name} 设为 ${entry.display ? entry.display(state) : formatNumber(entry.get(state))}。`, 'system'); saveState(); notify(); }
/** 一键解锁全部系统（等价于把主线推到底）。 */
export function devUnlockSystems(): void { state.mainlineIndex = mainline.length; addLog(state, '[DEV] 已解锁全部系统。', 'progress'); saveState(); notify(); }

/** 重置存档。返回**是否真的重置了** —— 玩家在 confirm 里点取消时返回 false，
    调用方（main.ts）据此决定要不要重放首次引导：取消了就不该弹引导。 */
export function resetGame(): boolean { if (!window.confirm('确定要删除当前远征存档吗？')) return false; state = freshState(); addLog(state, '新的远征从一簇微弱的火星开始。', 'system'); saveState(); notify(); return true; }
export function startLoop(): void { let lastTick = Date.now(); setInterval(() => { const now = Date.now(); const seconds = (now - lastTick) / 1000; lastTick = now; advanceAdventure(state, seconds); advanceLogistics(state, seconds); advanceCamp(state, seconds); if (now - lastSave > 5000) { saveState(); lastSave = now; } notify(); }, 500); window.addEventListener('beforeunload', saveState); }

hydrate();
if (!state.log.length) addLog(state, '营火重新燃起。在「冒险」里选好区域，进入战斗区域就会自动开战。', 'system');
