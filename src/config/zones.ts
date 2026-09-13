import { ITEM } from './items';
import type { Enemy, Zone } from '../types';

/* 敌人表：键顺序就是 enemyId（0,1,2…）。dropTable 里引用的是物品表下标。

   两条硬约束：
   - 每个战斗区域至少 5 种怪物（区域表在文件下方按 enemyIds 分组）；
   - 同一只怪物的掉落物最多 3 条 —— 再多会稀释每一条的期望产出，图鉴一页也塞不下。
   数值按区域整体抬一档：血量约 ×2.5、攻击约 ×2、金币约 ×2.5，掉落从「废旧零件 + 旧电池」这类
   低阶材料逐步换成「装甲板 / 余烬碎片 / 余烬核心」这类高阶材料。 */
const ENEMY_DEFS = {
  /* ——— 废弃边境：失去联络的旧哨站与锈蚀街区 ——— */
  scavenger: { art: '拾', name: '锈蚀拾荒者', description: '动作敏捷但装甲脆弱的机械单位。', maxHp: 86, attack: 9, defense: 0, attackInterval: 2.8, gold: 13, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 2, max: 5 }, { itemId: ITEM.oldBattery, chance: .34, min: 1, max: 1 }, { itemId: ITEM.fieldRation, chance: .16, min: 1, max: 1 }] },
  brute: { art: '重', name: '重装拾荒者', description: '缓慢但危险的重型单位，携带更多装甲材料。', maxHp: 142, attack: 16, defense: 2, attackInterval: 3.7, gold: 25, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 4, max: 8 }, { itemId: ITEM.armorPlate, chance: .3, min: 1, max: 1 }, { itemId: ITEM.emberShard, chance: .1, min: 1, max: 1 }] },
  wirehound: { art: '犬', name: '线缆猎犬', description: '用断裂电缆当腿的四足机械，扑咬极快，但一撞就散。', maxHp: 64, attack: 12, defense: 0, attackInterval: 1.9, gold: 15, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 2, max: 4 }, { itemId: ITEM.whetOil, chance: .2, min: 1, max: 1 }, { itemId: ITEM.oldBattery, chance: .2, min: 1, max: 1 }] },
  scrapGolem: { art: '偶', name: '废铁傀儡', description: '被人一层层焊上废铁的搬运单位，动作迟缓却极难打穿。', maxHp: 260, attack: 14, defense: 6, attackInterval: 4.2, gold: 30, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 6, max: 10 }, { itemId: ITEM.armorPlate, chance: .34, min: 1, max: 1 }, { itemId: ITEM.platingGoo, chance: .12, min: 1, max: 1 }] },
  rustSentry: { art: '哨', name: '锈蚀哨兵', description: '仍在按旧指令巡逻的哨戒炮台，火力远超它的装甲厚度。', maxHp: 110, attack: 22, defense: 1, attackInterval: 3.2, gold: 22, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 3, max: 6 }, { itemId: ITEM.scavengedBlade, chance: .1, min: 1, max: 1 }, { itemId: ITEM.commonSolvent, chance: .14, min: 1, max: 1 }] },

  /* ——— 余烬矿脉：被结晶污染、仍在往外渗热量的旧矿井 ——— */
  emberMite: { art: '螨', name: '余烬螨虫', description: '成群啃食结晶碎屑的小型单位，单体弱，胜在数量与出手频率。', maxHp: 190, attack: 26, defense: 3, attackInterval: 2.4, gold: 48, dropTable: [{ itemId: ITEM.emberShard, chance: .5, min: 1, max: 2 }, { itemId: ITEM.scrap, chance: 1, min: 4, max: 7 }] },
  ashCrawler: { art: '爬', name: '灰烬爬行者', description: '在矿道顶壁上爬行的多足机械，落下来时带着一身高热灰。', maxHp: 320, attack: 34, defense: 5, attackInterval: 3, gold: 62, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 5, max: 9 }, { itemId: ITEM.emberShard, chance: .34, min: 1, max: 1 }, { itemId: ITEM.platingGoo, chance: .18, min: 1, max: 1 }] },
  veinWarden: { art: '卫', name: '矿脉守卫', description: '守着主矿脉的重甲单位，装甲板就是从它身上撬下来的标准件。', maxHp: 520, attack: 40, defense: 11, attackInterval: 3.8, gold: 88, dropTable: [{ itemId: ITEM.armorPlate, chance: .6, min: 1, max: 2 }, { itemId: ITEM.scrap, chance: 1, min: 8, max: 12 }, { itemId: ITEM.emberCore, chance: .12, min: 1, max: 1 }] },
  emberLeech: { art: '蛭', name: '余烬水蛭', description: '吸附在结晶上取热的软体机械，被打散时会溅出灼热的体液。', maxHp: 400, attack: 52, defense: 4, attackInterval: 2.2, gold: 76, dropTable: [{ itemId: ITEM.emberShard, chance: .4, min: 1, max: 1 }, { itemId: ITEM.lifeSeed, chance: .2, min: 1, max: 1 }, { itemId: ITEM.scrap, chance: 1, min: 4, max: 8 }] },
  moltenHound: { art: '熔', name: '熔渣猎犬', description: '关节处凝着熔渣的追猎单位，越打越烫。', maxHp: 460, attack: 58, defense: 7, attackInterval: 2.6, gold: 95, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 6, max: 10 }, { itemId: ITEM.emberCore, chance: .16, min: 1, max: 1 }, { itemId: ITEM.fineSolvent, chance: .18, min: 1, max: 1 }] },

  /* ——— 核心深井：信号最深处，井壁上全是结晶 ——— */
  coreDrone: { art: '机', name: '核心无人机', description: '围绕井口盘旋的维护机，炮口对准一切还在动的东西。', maxHp: 700, attack: 78, defense: 9, attackInterval: 2.3, gold: 150, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 10, max: 16 }, { itemId: ITEM.emberCore, chance: .2, min: 1, max: 1 }] },
  signalAdept: { art: '祭', name: '信号祭司', description: '把核心信号当祷文反复播放的人形单位，靠近时能听见自己的名字。', maxHp: 880, attack: 96, defense: 12, attackInterval: 2.8, gold: 190, dropTable: [{ itemId: ITEM.emberShard, chance: .6, min: 2, max: 3 }, { itemId: ITEM.deepSolvent, chance: .2, min: 1, max: 1 }, { itemId: ITEM.scrap, chance: 1, min: 8, max: 14 }] },
  echoWraith: { art: '影', name: '回声残影', description: '一段没能散掉的旧信号，出手快得只留下一道残影。', maxHp: 760, attack: 132, defense: 6, attackInterval: 1.8, gold: 210, dropTable: [{ itemId: ITEM.emberCore, chance: .22, min: 1, max: 1 }, { itemId: ITEM.deepSolvent, chance: .16, min: 1, max: 1 }, { itemId: ITEM.emberShard, chance: .4, min: 1, max: 2 }] },
  abyssBrute: { art: '渊', name: '深渊重装者', description: '井底的重载单位，每一块装甲都比远征队整支队伍还厚。', maxHp: 1400, attack: 110, defense: 18, attackInterval: 3.6, gold: 240, dropTable: [{ itemId: ITEM.armorPlate, chance: 1, min: 2, max: 3 }, { itemId: ITEM.scrap, chance: 1, min: 12, max: 18 }, { itemId: ITEM.emberCore, chance: .25, min: 1, max: 1 }] },
  coreTitan: { art: '坦', name: '核心泰坦', description: '井底那颗仍在搏动的核心本身。所有信号的源头。', maxHp: 1600, attack: 150, defense: 24, attackInterval: 4, gold: 420, dropTable: [{ itemId: ITEM.emberCore, chance: .5, min: 1, max: 2 }, { itemId: ITEM.armorPlate, chance: 1, min: 3, max: 4 }, { itemId: ITEM.emberShard, chance: .8, min: 2, max: 3 }] }
} satisfies Record<string, Enemy>;

export const enemyTable: Enemy[] = Object.values(ENEMY_DEFS);
/** 名字 → 下标，用法同 ITEM。 */
export const ENEMY = Object.fromEntries(Object.keys(ENEMY_DEFS).map((name, id) => [name, id])) as { [K in keyof typeof ENEMY_DEFS]: number };

/* 区域表：键顺序就是 zoneId。enemyIds 引用敌人表下标；
   enemyIds 为空的区域是「非战斗区域」（营地），不刷怪、只按倍率回复生命值。
   unlockIndex 是进入所需的主线进度（mainlineIndex 达到这个值才算解锁）。 */
const ZONE_DEFS = {
  camp: { name: '营地', description: '远征队的落脚点。营火不灭，这里不会遭遇敌人，生命恢复速度远高于野外。', enemyIds: [], unlockIndex: 0 },
  wasteBorder: { name: '废弃边境', description: '营火以北，失去联络的旧哨站。锈蚀的机械单位仍在街区与哨塔之间徘徊。', enemyIds: [ENEMY.scavenger, ENEMY.brute, ENEMY.wirehound, ENEMY.scrapGolem, ENEMY.rustSentry], unlockIndex: 0 },
  emberVein: { name: '余烬矿脉', description: '被结晶污染的旧矿井，渗出的热量让整条矿道都在发光。守卫这里的单位已经开始结晶化。', enemyIds: [ENEMY.emberMite, ENEMY.ashCrawler, ENEMY.veinWarden, ENEMY.emberLeech, ENEMY.moltenHound], unlockIndex: 5 },
  coreDeep: { name: '核心深井', description: '核心信号的源头。井壁上结满结晶，越往下信号越清晰，也越致命。', enemyIds: [ENEMY.coreDrone, ENEMY.signalAdept, ENEMY.echoWraith, ENEMY.abyssBrute, ENEMY.coreTitan], unlockIndex: 7 }
} satisfies Record<string, Zone>;

export const zones: Zone[] = Object.values(ZONE_DEFS);
/** 名字 → 下标，用法同 ITEM。 */
export const ZONE = Object.fromEntries(Object.keys(ZONE_DEFS).map((name, id) => [name, id])) as { [K in keyof typeof ZONE_DEFS]: number };
