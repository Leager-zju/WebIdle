import { zones as zoneConfig } from './config/zones.js';
import { items, itemOrder } from './config/items.js';

export const MAX_OFFLINE_SECONDS = 8 * 60 * 60;
const SAVE_KEY = 'ember-expedition-save-v1';
export const zones = zoneConfig;
export { items, itemOrder };

export const mainline = [
  { title: '点亮第一座营火', description: '让远征队完成第一次战斗，确认荒原边缘仍然可以被穿越。', condition: state => state.totalWins >= 1, reward: '获得初始远征资格' },
  { title: '清理废弃边境', description: '击退一批盘踞在旧哨站的机械单位，营地才有空间继续扩建。', condition: state => state.totalWins >= 5, reward: '解锁「工坊」系统' },
  { title: '分析异常电池', description: '收集旧电池，研究它们为何仍在污染区域中保持电量。', condition: state => (state.inventory.oldBattery || 0) >= 3, reward: '解锁「研究」系统' },
  { title: '组建第二支小队', description: '从重装单位身上回收装甲板，为新伙伴准备一套可靠的装备。', condition: state => (state.inventory.armorPlate || 0) >= 3, reward: '解锁「伙伴」系统' },
  { title: '追踪核心信号', description: '余烬碎片正在指向更深处的区域。第一章的下一段道路已经出现。', condition: state => (state.inventory.emberShard || 0) >= 2, reward: '完成边境调查阶段' }
];

const freshAdventure = () => ({
  zoneId: zones[0].id,
  running: false,
  enemyId: zones[0].enemies[0].id,
  enemyHp: zones[0].enemies[0].maxHp,
  playerHp: 100,
  playerAttackTimer: 0,
  enemyAttackTimer: 0,
  autoPush: true,
  battleCount: 0
});
const freshState = () => ({
  gold: 45, scrap: 24, essence: 0, xp: 0, level: 1, totalWins: 0, zoneClears: 0, mainlineIndex: 0,
  workshop: 0, research: 0, companions: 0,
  inventory: { ...Object.fromEntries(itemOrder.map(itemId => [itemId, 0])), scrap: 24 },
  adventure: freshAdventure(),
  log: [],
  lastTick: Date.now()
});

let state = freshState();
const listeners = new Set();
let lastSave = Date.now();

export function getState() { return state; }
export function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
function notify() { listeners.forEach(listener => listener(state)); }
export function formatNumber(value) { return Math.floor(value).toLocaleString('zh-CN'); }
export function formatDuration(seconds) { const total = Math.max(0, Math.floor(seconds)); const hours = Math.floor(total / 3600); const minutes = Math.floor((total % 3600) / 60); const secs = total % 60; return hours ? `${hours}小时${minutes}分` : minutes ? `${minutes}分${secs}秒` : `${secs}秒`; }
export function levelNeed(target = state) { return 45 + (target.level - 1) * 35; }
export function getPlayerMaxHp(target = state) { return 100 + target.workshop * 15 + target.companions * 25; }
export function getPlayerRegen(target = state) { return 2 + target.workshop * .8 + target.companions * 1.5; }
export function getPlayerAttack(target = state) {
  return 12 + target.level * 4 + target.workshop * 3 + target.research * 5 + target.companions * 4;
}
export function getPlayerAttackInterval(target = state) { return Math.max(.9, 2.2 - target.research * .08); }
export function getInventoryCapacity(target = state) { return 32 + target.workshop * 8 + target.companions * 4; }
export function getInventoryUsed(target = state) { return itemOrder.reduce((total, itemId) => total + (target.inventory[itemId] || 0), 0); }
export function getPower(target = state) { return getPlayerAttack(target); }
export function currentZone(target = state) { return zones.find(zone => zone.id === target.adventure.zoneId) || zones[0]; }
export function currentEnemy(target = state) { const zone = currentZone(target); return zone.enemies.find(enemy => enemy.id === target.adventure.enemyId) || zone.enemies[0]; }
export function getEnemyAttackInterval(target = state) { return currentEnemy(target).attackInterval; }
export function isZoneUnlocked(zone) { return zone.id === zones[0].id; }

function addLog(target, message, type = 'system') {
  target.log = [{ time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), message, type }, ...(target.log || [])].slice(0, 160);
}
function addExperience(target, amount) {
  target.xp += amount;
  while (target.xp >= levelNeed(target)) { target.xp -= levelNeed(target); target.level += 1; addLog(target, `远征队成长至 Lv.${target.level}，基础攻击力提升。`, 'progress'); }
}
function updateMainline(target) {
  while (target.mainlineIndex < mainline.length && mainline[target.mainlineIndex].condition(target)) {
    target.mainlineIndex += 1;
    const messages = {
      2: '旧工坊重新亮起。现在可以把冒险带回的废料变成长期战力。',
      3: '研究台接入了旧电池。新的升级路线已经开放。',
      4: '你收到了幸存者的回应。伙伴系统已经可以使用。',
      5: '余烬碎片指向更深处的道路。边境调查阶段完成。'
    };
    addLog(target, messages[target.mainlineIndex] || '主线记录已更新。', 'progress');
  }
}
function chooseEnemy(target) {
  const zone = currentZone(target);
  return zone.enemies[Math.floor(Math.random() * zone.enemies.length)];
}
function prepareEnemy(target, enemy = chooseEnemy(target)) {
  const shouldRestore = !Number.isFinite(target.adventure.playerHp) || target.adventure.playerHp <= 0;
  target.adventure.enemyId = enemy.id;
  target.adventure.enemyHp = enemy.maxHp;
  if (shouldRestore) target.adventure.playerHp = getPlayerMaxHp(target);
  target.adventure.playerAttackTimer = 0;
  target.adventure.enemyAttackTimer = 0;
}
function randomAmount(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
function grantDrops(target, enemy) {
  enemy.dropTable.forEach(drop => {
    if (Math.random() > drop.chance) return;
    const requested = randomAmount(drop.min, drop.max);
    const freeSpace = Math.max(0, getInventoryCapacity(target) - getInventoryUsed(target));
    const amount = Math.min(requested, freeSpace);
    if (amount <= 0) { addLog(target, `物品栏已满，${items[drop.itemId].name}未能收取。`, 'system'); return; }
    target.inventory[drop.itemId] = (target.inventory[drop.itemId] || 0) + amount;
    if (drop.itemId === 'scrap') target.scrap += amount;
    if (drop.itemId === 'emberShard') target.essence += amount;
    addLog(target, `掉落：${items[drop.itemId].name} ×${amount}${amount < requested ? '（物品栏已满）' : ''}`, 'drop');
  });
}
function defeatEnemy(target, enemy) {
  target.gold += enemy.gold;
  target.totalWins += 1;
  target.adventure.battleCount += 1;
  addExperience(target, enemy.exp);
  addLog(target, `击败「${enemy.name}」，获得 ${enemy.gold} 金币和 ${enemy.exp} 经验。`, 'battle');
  grantDrops(target, enemy);
  updateMainline(target);
  prepareEnemy(target);
}
function playerAttack(target) {
  const enemy = currentEnemy(target);
  const damage = getPlayerAttack(target);
  target.adventure.enemyHp = Math.max(0, target.adventure.enemyHp - damage);
  addLog(target, `你攻击「${enemy.name}」，造成 ${damage} 点伤害。`, 'battle');
  if (target.adventure.enemyHp <= 0) defeatEnemy(target, enemy);
}
function enemyAttack(target) {
  const enemy = currentEnemy(target);
  target.adventure.playerHp = Math.max(0, target.adventure.playerHp - enemy.attack);
  addLog(target, `「${enemy.name}」反击，造成 ${enemy.attack} 点伤害。`, 'battle');
  if (target.adventure.playerHp <= 0) {
    target.adventure.running = false;
    target.adventure.playerHp = getPlayerMaxHp(target);
    target.adventure.playerAttackTimer = 0;
    target.adventure.enemyAttackTimer = 0;
    addLog(target, '远征队生命值归零，已撤回营地并恢复状态。', 'defeat');
  }
}
function advanceAdventure(target, seconds) {
  if (!target.adventure.running) return;
  let remaining = Math.max(0, seconds);
  while (remaining > 0 && target.adventure.running) {
    const enemy = currentEnemy(target);
    const playerInterval = getPlayerAttackInterval(target);
    const playerWait = Math.max(0, playerInterval - target.adventure.playerAttackTimer);
    const enemyWait = Math.max(0, enemy.attackInterval - target.adventure.enemyAttackTimer);
    const step = Math.min(remaining, playerWait, enemyWait);
    target.adventure.playerAttackTimer += step;
    target.adventure.enemyAttackTimer += step;
    target.adventure.playerHp = Math.min(getPlayerMaxHp(target), target.adventure.playerHp + getPlayerRegen(target) * step);
    remaining -= step;
    if (target.adventure.playerAttackTimer >= playerInterval - .0001) { target.adventure.playerAttackTimer = 0; playerAttack(target); }
    if (target.adventure.running && target.adventure.enemyAttackTimer >= enemy.attackInterval - .0001) { target.adventure.enemyAttackTimer = 0; enemyAttack(target); }
    if (step === 0 && target.adventure.running) { target.adventure.playerAttackTimer = 0; target.adventure.enemyAttackTimer = 0; }
  }
}
function hydrate() {
  const initial = freshState();
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!saved) { state = initial; return; }
    state = { ...initial, ...saved, adventure: { ...initial.adventure, ...saved.adventure }, inventory: { ...initial.inventory, ...saved.inventory }, log: Array.isArray(saved.log) ? saved.log : [] };
    delete state.equippedSet;
    delete state.setPieces;
    state.inventory = Object.fromEntries(itemOrder.map(itemId => [itemId, Math.max(0, Number(state.inventory[itemId]) || 0)]));
    state.inventory.scrap = Math.max(state.inventory.scrap, Math.min(state.scrap, 24));
    if (!zones.some(zone => zone.id === state.adventure.zoneId)) state.adventure.zoneId = zones[0].id;
    if (!currentEnemy(state) || !state.adventure.enemyHp) prepareEnemy(state);
    const offlineSeconds = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, (Date.now() - (saved.lastTick || Date.now())) / 1000));
    if (offlineSeconds >= 3 && state.adventure.running) { const before = state.totalWins; advanceAdventure(state, offlineSeconds); addLog(state, `你离开了 ${formatDuration(offlineSeconds)}。远征队完成了 ${formatNumber(state.totalWins - before)} 场战斗。`, 'system'); }
  } catch { state = initial; }
  state.lastTick = Date.now();
}
function saveState() { state.lastTick = Date.now(); try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch {} }

export function startAdventure() {
  if (state.adventure.running) { state.adventure.running = false; addLog(state, '远征队返回营地，自动战斗已暂停。', 'system'); }
  else { if (state.adventure.playerHp <= 0 || state.adventure.enemyHp <= 0) prepareEnemy(state); state.adventure.running = true; addLog(state, `远征队在「${currentZone().name}」遭遇「${currentEnemy().name}」，战斗开始。`, 'system'); }
  saveState(); notify();
}
export function selectZone(id) { const zone = zones.find(item => item.id === id); if (!zone || !isZoneUnlocked(zone) || state.adventure.running) return; state.adventure.zoneId = id; prepareEnemy(state, zone.enemies[0]); notify(); }
export function toggleAutoPush() { state.adventure.autoPush = !state.adventure.autoPush; saveState(); notify(); }
export function upgradeWorkshop() { if (state.mainlineIndex < 2) return; const cost = 40 + state.workshop * 35; if (state.scrap < cost) return; state.scrap -= cost; state.inventory.scrap = Math.max(0, state.inventory.scrap - cost); state.workshop += 1; addLog(state, `工坊升级至 Lv.${state.workshop}，生命值和攻击力提高。`, 'progress'); saveState(); notify(); }
export function upgradeResearch() { const cost = 2 + state.research * 3; if (state.mainlineIndex < 3 || state.essence < cost) return; state.essence -= cost; state.research += 1; addLog(state, `研究完成：攻击间隔缩短，当前攻击力 ${getPlayerAttack()}。`, 'progress'); saveState(); notify(); }
export function upgradeCompanions() { const goldCost = 100 + state.companions * 90; const essenceCost = 4 + state.companions * 3; if (state.mainlineIndex < 4 || state.gold < goldCost || state.essence < essenceCost) return; state.gold -= goldCost; state.essence -= essenceCost; state.companions += 1; addLog(state, `伙伴编入队伍。生命值和攻击力提高。`, 'progress'); saveState(); notify(); }
export function resetGame() { if (!window.confirm('确定要删除当前远征存档吗？')) return; state = freshState(); addLog(state, '新的远征从一簇微弱的火星开始。', 'system'); saveState(); notify(); }
export function startLoop() { let lastTick = Date.now(); setInterval(() => { const now = Date.now(); advanceAdventure(state, (now - lastTick) / 1000); lastTick = now; if (now - lastSave > 5000) { saveState(); lastSave = now; } notify(); }, 500); window.addEventListener('beforeunload', saveState); }

hydrate();
if (!state.log.length) addLog(state, '营火重新燃起。选择「冒险」，开始自动战斗。', 'system');
