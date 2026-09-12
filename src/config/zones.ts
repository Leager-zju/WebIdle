import { ITEM } from './items';
import type { Enemy, Zone } from '../types';

/* 敌人表：键顺序就是 enemyId（0,1,2…）。dropTable 里引用的是物品表下标。 */
const ENEMY_DEFS = {
  scavenger: { art: '拾', name: '锈蚀拾荒者', description: '动作敏捷但装甲脆弱的机械单位。', maxHp: 86, attack: 9, defense: 0, attackInterval: 2.8, gold: 13, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 2, max: 5 }, { itemId: ITEM.oldBattery, chance: .34, min: 1, max: 1 }, { itemId: ITEM.fieldRation, chance: .16, min: 1, max: 1 }, { itemId: ITEM.whetOil, chance: .18, min: 1, max: 1 }, { itemId: ITEM.lifeSeed, chance: .14, min: 1, max: 1 }, { itemId: ITEM.commonSolvent, chance: .12, min: 1, max: 1 }] },
  brute: { art: '重', name: '重装拾荒者', description: '缓慢但危险的重型单位，携带更多装甲材料。', maxHp: 142, attack: 16, defense: 2, attackInterval: 3.7, gold: 25, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 4, max: 8 }, { itemId: ITEM.armorPlate, chance: .3, min: 1, max: 1 }, { itemId: ITEM.emberShard, chance: .1, min: 1, max: 1 }, { itemId: ITEM.scavengedBlade, chance: .12, min: 1, max: 1 }, { itemId: ITEM.platingGoo, chance: .12, min: 1, max: 1 }, { itemId: ITEM.fineSolvent, chance: .08, min: 1, max: 1 }, { itemId: ITEM.emberCore, chance: .05, min: 1, max: 1 }, { itemId: ITEM.deepSolvent, chance: .03, min: 1, max: 1 }] }
} satisfies Record<string, Enemy>;

export const enemyTable: Enemy[] = Object.values(ENEMY_DEFS);
/** 名字 → 下标，用法同 ITEM。 */
export const ENEMY = Object.fromEntries(Object.keys(ENEMY_DEFS).map((name, id) => [name, id])) as { [K in keyof typeof ENEMY_DEFS]: number };

/* 区域表：键顺序就是 zoneId。enemyIds 引用敌人表下标；
   enemyIds 为空的区域是「非战斗区域」（营地），不刷怪、只按倍率回复生命值。 */
const ZONE_DEFS = {
  camp: { name: '营地', description: '远征队的落脚点。营火不灭，这里不会遭遇敌人，生命恢复速度远高于野外。', enemyIds: [] },
  wasteBorder: { name: '废弃边境', description: '营火以北，失去联络的旧哨站。这里仍有两类掠食者在废墟中徘徊。', enemyIds: [ENEMY.scavenger, ENEMY.brute] }
} satisfies Record<string, Zone>;

export const zones: Zone[] = Object.values(ZONE_DEFS);
/** 名字 → 下标，用法同 ITEM。 */
export const ZONE = Object.fromEntries(Object.keys(ZONE_DEFS).map((name, id) => [name, id])) as { [K in keyof typeof ZONE_DEFS]: number };
