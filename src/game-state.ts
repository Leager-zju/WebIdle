import { zones, enemyTable, ENEMY, ZONE } from './config/zones';
import { items, ITEM, equipTypes, EQUIP_TYPE, itemCategories, categoryOrder, rarities, RARITY } from './config/items';
import { affixes, AFFIX, affixCap, affixMarkup, skills, SKILL, AFFIX_MAX_MULTIPLIER } from './config/affixes';
import type { AdventureState, EquipmentInstance, GameState, LogType, UseOutcome } from './types';

export const MAX_OFFLINE_SECONDS = 8 * 60 * 60;
/* v6：强化等级换成词条——实例上存 affixes，道具的 use 变成函数。
   v5：移除等级与经验（xp / level 字段不再存在）。
   v4：装备改成「实例」——物品栏只存可堆叠物品的数量，装备放进 equipment 实例列表，
   equipped 里存实例 id。这样同名装备的每一件都是独立的，词条也挂在实例上。
   v5 及更早的存档格式不兼容，直接作废。 */
const SAVE_KEY = 'ember-expedition-save-v6';
export { zones, enemyTable, items, ITEM, ENEMY, ZONE, equipTypes, EQUIP_TYPE, itemCategories, categoryOrder, rarities, RARITY, affixes, AFFIX, affixCap, affixMarkup, skills, SKILL, AFFIX_MAX_MULTIPLIER };

/** 初始区域：营地（不刷怪，只休整）。 */
const CAMP_ZONE_ID = ZONE.camp;
/** 初始战斗区域与初始敌人。 */
const FIRST_COMBAT_ZONE_ID = ZONE.wasteBorder;
const FIRST_ENEMY_ID = zones[FIRST_COMBAT_ZONE_ID].enemyIds[0];

export const mainline = [
  { title: '点亮第一座营火', description: '让远征队完成第一次战斗，确认荒原边缘仍然可以被穿越。', condition: (state: GameState) => state.totalWins >= 1, reward: '获得初始远征资格' },
  { title: '清理废弃边境', description: '击退一批盘踞在旧哨站的机械单位，营地才有空间继续扩建。', condition: (state: GameState) => state.totalWins >= 5, reward: '解锁「工坊」系统' },
  { title: '分析异常电池', description: '收集旧电池，研究它们为何仍在污染区域中保持电量。', condition: (state: GameState) => state.inventory[ITEM.oldBattery] >= 3, reward: '解锁「研究」系统' },
  { title: '组建第二支小队', description: '从重装单位身上回收装甲板，为新伙伴准备一套可靠的装备。', condition: (state: GameState) => state.inventory[ITEM.armorPlate] >= 3, reward: '解锁「伙伴」系统' },
  { title: '追踪核心信号', description: '余烬碎片正在指向更深处的区域。第一章的下一段道路已经出现。', condition: (state: GameState) => state.inventory[ITEM.emberShard] >= 2, reward: '完成边境调查阶段' }
];

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
  workshop: 0, research: 0, companions: 0, equipped: equipTypes.map(type => new Array(type.baseSlots).fill(-1)), settings: { fontScale: 0 },
  inventory: new Array(items.length).fill(0), equipment: [], nextInstanceId: 1, encountered: new Array(enemyTable.length).fill(0), discoveredDrops: enemyTable.map(() => []), adventure: freshAdventure(), log: [], lastTick: Date.now()
});

let state = freshState();
const listeners = new Set<(state: GameState) => void>();
let lastSave = Date.now();

export function getState(): GameState { return state; }
export function subscribe(listener: (state: GameState) => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
function notify(): void { syncEquipSlots(state); listeners.forEach(listener => listener(state)); }
export function formatNumber(value: number): string { return Math.floor(value).toLocaleString('zh-CN'); }
export function formatDuration(seconds: number): string { const total = Math.max(0, Math.floor(seconds)); const hours = Math.floor(total / 3600); const minutes = Math.floor((total % 3600) / 60); const secs = total % 60; return hours ? `${hours}小时${minutes}分` : minutes ? `${minutes}分${secs}秒` : `${secs}秒`; }
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
export function getPlayerDefense(target: GameState = state): number { return getEquipBonus(target).defense + getAffixTotals(target).defense; }
/** 这个装备实例是否在某个槽位上。参数是实例 id 而不是物品 id——同名装备的各件互不影响。 */
export function isEquipped(instanceId: number, target: GameState = state): boolean { return instanceId >= 0 && target.equipped.some(slots => slots.includes(instanceId)); }
/** 生命上限：先加固定值（基础 + 工坊 + 伙伴 + 装备 + 固定词条），最后按百分比词条放大。 */
export function getPlayerMaxHp(target: GameState = state): number { const totals = getAffixTotals(target); const flat = 100 + target.workshop * 15 + target.companions * 25 + getEquipBonus(target).hp + totals.hp; return Math.round(flat * (1 + totals.hpPct / 100)); }
export function getPlayerRegen(target: GameState = state): number { return 2 + target.workshop * .8 + target.companions * 1.5; }
/** 进入战斗区域、以及击杀敌人之后，下一个敌人出现所需的刷新冷却（秒）。 */
export const SPAWN_COOLDOWN = 3;
/** 营地区域的基础回复倍率：在营地里生命回复速度 = 野外回复速度 × 这个值。 */
export const CAMP_REGEN_MULTIPLIER = 5;
/** 当前区域的回复倍率：营地用营地倍率，战斗区域为 1。 */
export function getRegenMultiplier(target: GameState = state): number { return isCampZone(currentZoneId(target)) ? CAMP_REGEN_MULTIPLIER : 1; }
/** 攻击力：先加固定值（基础 + 工坊 + 研究 + 伙伴 + 装备 + 固定词条），最后按百分比词条放大。 */
export function getPlayerAttack(target: GameState = state): number { const totals = getAffixTotals(target); const flat = 12 + target.workshop * 3 + target.research * 5 + target.companions * 4 + getEquipBonus(target).attack + totals.attack; return Math.round(flat * (1 + totals.attackPct / 100)); }
export function getPlayerAttackInterval(target: GameState = state): number { return Math.max(.9, 2.2 - target.research * .08); }
/* 物品栏上限按「种类」算：同一种物品可以无限叠加，只有新种类才会占用空位。 */
export function getInventoryCapacity(target: GameState = state): number { return 8 + target.workshop * 2 + target.companions; }
export function getInventoryUsed(target: GameState = state): number { let kinds = 0; for (const quantity of target.inventory) if (quantity > 0) kinds += 1; const equipmentKinds = new Set<number>(); for (const instance of target.equipment) equipmentKinds.add(instance.itemId); return kinds + equipmentKinds.size; }
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
export function isZoneUnlocked(zoneId: number): boolean { return !!zones[zoneId]; }

function addLog(target: GameState, message: string, type: LogType = 'system'): void { target.log = [{ time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), message, type }, ...target.log].slice(0, 160); }
function updateMainline(target: GameState): void { while (target.mainlineIndex < mainline.length && mainline[target.mainlineIndex].condition(target)) { target.mainlineIndex += 1; const messages: Record<number, string> = { 2: '旧工坊重新亮起。现在可以把冒险带回的废料变成长期战力。', 3: '研究台接入了旧电池。新的升级路线已经开放。', 4: '你收到了幸存者的回应。伙伴系统已经可以使用。', 5: '余烬碎片指向更深处的道路。边境调查阶段完成。' }; addLog(target, messages[target.mainlineIndex] || '主线记录已更新。', 'progress'); } }
function chooseEnemyId(target: GameState): number { const ids = zones[currentZoneId(target)].enemyIds; return ids.length ? ids[Math.floor(Math.random() * ids.length)] : FIRST_ENEMY_ID; }
function prepareEnemy(target: GameState, enemyId = chooseEnemyId(target)): void { const enemy = enemyTable[enemyId]; const shouldRestore = !Number.isFinite(target.adventure.playerHp) || target.adventure.playerHp <= 0; target.adventure.enemyId = enemyId; target.adventure.enemyHp = enemy.maxHp; target.adventure.spawnTimer = 0; if (shouldRestore) target.adventure.playerHp = getPlayerMaxHp(target); target.adventure.playerAttackTimer = 0; target.adventure.enemyAttackTimer = 0; }
/** 敌人离场（被击杀或进入区域）后进入刷新冷却，冷却结束才会 prepareEnemy 出新敌人。 */
function startSpawnCooldown(target: GameState): void { target.adventure.spawnTimer = SPAWN_COOLDOWN; }
function randomAmount(min: number, max: number): number { return min + Math.floor(Math.random() * (max - min + 1)); }
/** 记录「这只怪物的这条掉落已经拿到过」，图鉴据此揭示对应条目。 */
function revealDrop(target: GameState, enemyId: number, itemId: number): void { const list = target.discoveredDrops[enemyId] || (target.discoveredDrops[enemyId] = []); if (!list.includes(itemId)) list.push(itemId); }
/* 只有真正进了包才算「获得」：被物品栏上限拒收的不揭示。 */
function grantDrops(target: GameState, enemyId: number): void { const enemy = enemyTable[enemyId]; enemy.dropTable.forEach(drop => { if (Math.random() > drop.chance) return; const item = items[drop.itemId]; /* 上限按种类算：已持有的种类继续叠加，只有新种类才需要空位。 */ if (!getOwnedCount(drop.itemId, target) && getInventoryUsed(target) >= getInventoryCapacity(target)) { addLog(target, `物品栏已满，${item.name}未能收取。`, 'system'); return; } const amount = randomAmount(drop.min, drop.max); /* 装备每件都建成独立实例，可堆叠的进数量。 */ if (item.stackable) { target.inventory[drop.itemId] += amount; if (drop.itemId === ITEM.scrap) target.scrap += amount; if (drop.itemId === ITEM.emberShard) target.essence += amount; } else addEquipment(target, drop.itemId, amount); revealDrop(target, enemyId, drop.itemId); addLog(target, `掉落：${item.name} ×${amount}`, 'drop'); }); }
/* 击杀才记入图鉴：仅仅遇到（prepareEnemy）不算。 */
function defeatEnemy(target: GameState, enemyId: number): void { const enemy = enemyTable[enemyId]; target.gold += enemy.gold; target.totalWins += 1; target.adventure.battleCount += 1; target.encountered[enemyId] = 1; addLog(target, `击败「${enemy.name}」，获得 ${enemy.gold} 金币。`, 'battle'); grantDrops(target, enemyId); updateMainline(target); startSpawnCooldown(target); }
/* 伤害 = 攻击力 − 对方防御，至少 1 点：防御只能减免，不能完全免伤。
   词条赋予的技能按出手次数触发，额外叠一记倍率伤害（强度取词条数值的百分比）。 */
function playerAttack(target: GameState): void { const enemy = currentEnemy(target); target.adventure.attackCount += 1; const attack = getPlayerAttack(target); let damage = Math.max(1, attack - (enemy.defense || 0)); const triggered = []; for (const entry of getAffixTotals(target).skills) { const skill = skills[entry.skill]; if (!skill || target.adventure.attackCount % skill.interval !== 0) continue; damage += Math.round(attack * skill.multiplier * entry.value / 100); triggered.push(skill.name); } target.adventure.enemyHp = Math.max(0, target.adventure.enemyHp - damage); addLog(target, `${triggered.length ? `${triggered.join('、')}触发！` : ''}你攻击「${enemy.name}」，造成 ${damage} 点伤害。`, 'battle'); if (target.adventure.enemyHp <= 0) defeatEnemy(target, target.adventure.enemyId); }
function enemyAttack(target: GameState): void { const enemy = currentEnemy(target); const damage = Math.max(1, enemy.attack - getPlayerDefense(target)); target.adventure.playerHp = Math.max(0, target.adventure.playerHp - damage); addLog(target, `「${enemy.name}」反击，造成 ${damage} 点伤害。`, 'battle'); if (target.adventure.playerHp <= 0) { target.adventure.running = false; target.adventure.playerHp = getPlayerMaxHp(target); target.adventure.playerAttackTimer = 0; target.adventure.enemyAttackTimer = 0; target.adventure.spawnTimer = 0; target.adventure.zoneId = CAMP_ZONE_ID; addLog(target, '远征队生命值归零，已撤回营地并恢复状态。', 'defeat'); } }
/** 按当前区域的回复倍率回血：营地是野外的 CAMP_REGEN_MULTIPLIER 倍。 */
function applyRegen(target: GameState, seconds: number): void { if (!(seconds > 0)) return; target.adventure.playerHp = Math.min(getPlayerMaxHp(target), target.adventure.playerHp + getPlayerRegen(target) * getRegenMultiplier(target) * seconds); }
function advanceAdventure(target: GameState, seconds: number): void { if (isCampZone(currentZoneId(target))) { applyRegen(target, seconds); return; } if (!target.adventure.running) return; let remaining = Math.max(0, seconds); while (remaining > 0 && target.adventure.running) { /* 刷怪冷却：场上没有敌人，只回复生命值。 */ if (target.adventure.spawnTimer > 0) { const wait = Math.min(remaining, target.adventure.spawnTimer); target.adventure.spawnTimer -= wait; applyRegen(target, wait); remaining -= wait; if (target.adventure.spawnTimer > 0) break; prepareEnemy(target); continue; } const enemy = currentEnemy(target); const playerInterval = getPlayerAttackInterval(target); const playerWait = Math.max(0, playerInterval - target.adventure.playerAttackTimer); const enemyWait = Math.max(0, enemy.attackInterval - target.adventure.enemyAttackTimer); const step = Math.min(remaining, playerWait, enemyWait); target.adventure.playerAttackTimer += step; target.adventure.enemyAttackTimer += step; applyRegen(target, step); remaining -= step; if (target.adventure.playerAttackTimer >= playerInterval - .0001) { target.adventure.playerAttackTimer = 0; playerAttack(target); } if (target.adventure.running && target.adventure.enemyAttackTimer >= enemy.attackInterval - .0001) { target.adventure.enemyAttackTimer = 0; enemyAttack(target); } if (step === 0 && target.adventure.running) { target.adventure.playerAttackTimer = 0; target.adventure.enemyAttackTimer = 0; } } }
function hydrate(): void { const initial = freshState(); try { const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (!saved) { state = initial; return; } /* 装备实例先重建出来：equipped 里存的是实例 id，要据此校验槽位引用是否还有效。 */ const equipment: EquipmentInstance[] = (Array.isArray(saved.equipment) ? saved.equipment : []).filter((entry: any) => entry && items[entry.itemId] && items[entry.itemId].category === 'equipment').map((entry: any) => ({ id: Math.max(1, Math.floor(Number(entry.id) || 0)), itemId: entry.itemId, affixes: (Array.isArray(entry.affixes) ? entry.affixes : []).filter((affix: any) => affix && affixes[affix.id]).map((affix: any) => ({ id: affix.id, value: Math.min(affixCap(affix.id), Math.max(0, Math.floor(Number(affix.value) || 0))) })) })); const equipmentIds = new Set(equipment.map(instance => instance.id)); state = { ...initial, ...saved, equipped: equipTypes.map((type, equipType) => { const savedSlots = saved.equipped?.[equipType]; return Array.isArray(savedSlots) ? savedSlots.map(instanceId => (equipmentIds.has(instanceId) ? instanceId : -1)) : new Array(type.baseSlots).fill(-1); }), equipment, nextInstanceId: equipment.reduce((next, instance) => Math.max(next, instance.id + 1), 1), settings: { ...initial.settings, ...saved.settings }, inventory: initial.inventory.map((_, itemId) => (items[itemId].stackable ? Math.max(0, Math.floor(Number(saved.inventory?.[itemId]) || 0)) : 0)), encountered: enemyTable.map((_, enemyId) => (saved.encountered?.[enemyId] ? 1 : 0)), discoveredDrops: enemyTable.map((_, enemyId) => (Array.isArray(saved.discoveredDrops?.[enemyId]) ? saved.discoveredDrops[enemyId].filter((itemId: number) => items[itemId]) : [])), adventure: { ...initial.adventure, ...saved.adventure }, log: [] }; if (!zones[state.adventure.zoneId]) state.adventure.zoneId = CAMP_ZONE_ID; if (isCampZone(state.adventure.zoneId)) state.adventure.running = false; if (!Number.isFinite(state.adventure.spawnTimer)) state.adventure.spawnTimer = 0; if (state.adventure.spawnTimer <= 0 && (!enemyTable[state.adventure.enemyId] || !state.adventure.enemyHp)) prepareEnemy(state); const offlineSeconds = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, (Date.now() - (saved.lastTick || Date.now())) / 1000)); if (offlineSeconds >= 3) { if (state.adventure.running) { const before = state.totalWins; advanceAdventure(state, offlineSeconds); addLog(state, `你离开了 ${formatDuration(offlineSeconds)}。远征队完成了 ${formatNumber(state.totalWins - before)} 场战斗。`, 'system'); } else if (isCampZone(currentZoneId(state))) { advanceAdventure(state, offlineSeconds); addLog(state, `你离开了 ${formatDuration(offlineSeconds)}。远征队在营地休整。`, 'system'); } } } catch { state = initial; } state.lastTick = Date.now(); syncEquipSlots(state); }
function saveState(): void { state.lastTick = Date.now(); try { /* 战斗日志不写入存档：它占了全量 JSON 的绝大部分，而刷新后重建的成本极低。 */ const { log, ...persisted } = state; localStorage.setItem(SAVE_KEY, JSON.stringify(persisted)); } catch {} }

/* 进入战斗区域立刻自动开战；进入营地这类非战斗区域则停下战斗、开始休整。 */
export function selectZone(zoneId: number): void { const zone = zones[zoneId]; if (!zone || !isZoneUnlocked(zoneId)) return; state.adventure.zoneId = zoneId; state.adventure.playerAttackTimer = 0; state.adventure.enemyAttackTimer = 0; if (isCampZone(zoneId)) { state.adventure.running = false; state.adventure.spawnTimer = 0; addLog(state, `远征队回到「${zone.name}」，开始休整。`, 'system'); } else { state.adventure.running = true; startSpawnCooldown(state); addLog(state, `远征队进入「${zone.name}」，等待敌人出现。`, 'system'); } saveState(); notify(); }
export function toggleAutoPush(): void { state.adventure.autoPush = !state.adventure.autoPush; saveState(); notify(); }
export function upgradeWorkshop(): void { if (state.mainlineIndex < 2) return; const cost = 40 + state.workshop * 35; if (state.scrap < cost) return; state.scrap -= cost; state.inventory[ITEM.scrap] = Math.max(0, state.inventory[ITEM.scrap] - cost); state.workshop += 1; addLog(state, `工坊升级至 Lv.${state.workshop}，生命值和攻击力提高。`, 'progress'); saveState(); notify(); }
export function upgradeResearch(): void { const cost = 2 + state.research * 3; if (state.mainlineIndex < 3 || state.essence < cost) return; state.essence -= cost; state.research += 1; addLog(state, `研究完成：攻击间隔缩短，当前攻击力 ${getPlayerAttack()}。`, 'progress'); saveState(); notify(); }
export function upgradeCompanions(): void { const goldCost = 100 + state.companions * 90; const essenceCost = 4 + state.companions * 3; if (state.mainlineIndex < 4 || state.gold < goldCost || state.essence < essenceCost) return; state.gold -= goldCost; state.essence -= essenceCost; state.companions += 1; addLog(state, '伙伴编入队伍。生命值和攻击力提高。', 'progress'); saveState(); notify(); }
/** 丢弃可堆叠物品（资源、消耗品）。装备请用 discardEquipment —— 每一件都是独立实例。 */
export function discardItem(itemId: number, amount = 1): void { const item = items[itemId]; const owned = state.inventory[itemId] || 0; const count = Math.min(owned, Math.max(1, Math.floor(amount))); if (!item || !item.stackable || !count) return; state.inventory[itemId] = owned - count; if (itemId === ITEM.scrap) state.scrap = Math.max(0, state.scrap - count); if (itemId === ITEM.emberShard) state.essence = Math.max(0, state.essence - count); addLog(state, `丢弃了 ${item.name} ×${count}。`, 'system'); saveState(); notify(); }
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
/* ——— 以下仅供设置页的开发者面板使用。__DEV_TOOLS__ 为 false 时没有任何引用，会被打包器整段摇掉。 ——— */

/** 开发者面板可改的属性：名字 + 取值 + 赋值。下标即面板里的 data-dev-stat。 */
export const devStats = [
  { name: '金币', get: (target: GameState) => target.gold, set: (target: GameState, value: number) => { target.gold = value; } },
  { name: '工坊等级', get: (target: GameState) => target.workshop, set: (target: GameState, value: number) => { target.workshop = value; } },
  { name: '研究等级', get: (target: GameState) => target.research, set: (target: GameState, value: number) => { target.research = value; } },
  { name: '伙伴数量', get: (target: GameState) => target.companions, set: (target: GameState, value: number) => { target.companions = value; } },
  { name: '主线进度', get: (target: GameState) => target.mainlineIndex, set: (target: GameState, value: number) => { target.mainlineIndex = Math.min(mainline.length, value); } },
  { name: '累计胜场', get: (target: GameState) => target.totalWins, set: (target: GameState, value: number) => { target.totalWins = value; } }
];
/** 直接发物品：废料与余烬碎片要同步累加到对应的资源字段上，否则会和物品栏脱节；
    装备则生成等量的独立实例，所以发 5 件就是 5 张卡片。 */
export function devGrantItem(itemId: number, amount: number): void { const item = items[itemId]; if (!item) return; const count = Math.max(1, Math.floor(amount)); if (item.stackable) { state.inventory[itemId] += count; if (itemId === ITEM.scrap) state.scrap += count; if (itemId === ITEM.emberShard) state.essence += count; } else addEquipment(state, itemId, count); addLog(state, `[DEV] 获得 ${item.name} ×${count}。`, 'system'); saveState(); notify(); }
export function devSetStat(index: number, value: number): void { const entry = devStats[index]; if (!entry || !Number.isFinite(value)) return; entry.set(state, Math.max(0, Math.floor(value))); addLog(state, `[DEV] ${entry.name} 设为 ${formatNumber(entry.get(state))}。`, 'system'); saveState(); notify(); }
/** 一键解锁全部系统（等价于把主线推到底）。 */
export function devUnlockSystems(): void { state.mainlineIndex = mainline.length; addLog(state, '[DEV] 已解锁全部系统。', 'progress'); saveState(); notify(); }

export function resetGame(): void { if (!window.confirm('确定要删除当前远征存档吗？')) return; state = freshState(); addLog(state, '新的远征从一簇微弱的火星开始。', 'system'); saveState(); notify(); }
export function startLoop(): void { let lastTick = Date.now(); setInterval(() => { const now = Date.now(); advanceAdventure(state, (now - lastTick) / 1000); lastTick = now; if (now - lastSave > 5000) { saveState(); lastSave = now; } notify(); }, 500); window.addEventListener('beforeunload', saveState); }

hydrate();
if (!state.log.length) addLog(state, '营火重新燃起。在「冒险」里选好区域，进入战斗区域就会自动开战。', 'system');
