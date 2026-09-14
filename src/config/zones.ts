import { ITEM } from './items';
import type { Enemy, Zone } from '../types';

/* 敌人表：键顺序就是 enemyId（0,1,2…）。dropTable 里引用的是物品表下标。

   ⚠️ 键顺序不能动：state.encountered / state.discoveredDrops / adventure.enemyId 都是按下标存的，
   重排会让旧存档整体错位。新增怪物一律追加到末尾（或追加到所属区域分组的末尾），
   改数值直接改字段即可。

   ——— 数值设计的三条约束（改数值前先读这里）———
   1) 区域内强度相当 —— 用「无装备玩家击杀这只怪的净损失生命」当强度指标，
      同一区域所有怪物必须落在同一区间，不允许出现明显更强的「隐藏 Boss」。
   2) 偏科不同 —— 强度拉平的前提下，攻击 / 出手间隔 / 血量 / 防御各偏一头：
      高攻慢手、低攻快攻、高血高防低攻…… 让玩家面对不同怪时有不同的应对感。
   3) 开局区域必须无装备可过 —— 新档 inventory 全 0、equipment 为空，唯一的武器
      「拾荒者短刃」还是锈蚀哨兵掉的，所以废弃边境每一只都必须在
      「攻击 12 / 防御 0 / 生命 100 / 回复 2」这套裸数值下打得赢。

   怎么算：净损失 ≈ 击杀耗时 T ×（怪物 DPS − 玩家回复 2），T = 玩家出手次数 × 2.2 秒。
   所以「血厚 + 防高」的怪 T 天然更长，攻击必须相应压低，净损失才拉得平。
   参考区间：废弃边境 21~23（100 生命可连打 4 只）、余烬矿脉 35~38、核心深井 48~60。

   两条硬约束保持不变：
   - 每个战斗区域至少 5 种怪物（区域表在文件下方按 enemyIds 分组）；
   - 同一只怪物的掉落物最多 3 条 —— 再多会稀释每一条的期望产出，图鉴一页也塞不下。 */
const ENEMY_DEFS = {
  /* ——— 废弃边境（enemyId 0-4）：失去联络的旧哨站与锈蚀街区 ———
     基准区，玩家按「攻 12 / 防 0 / 血 100」算，净损失全部压在 21~23。 */
  scavenger: { art: '拾', name: '锈蚀拾荒者', description: '动作敏捷但装甲脆弱的机械单位。', maxHp: 86, attack: 9, defense: 0, attackInterval: 2.8, gold: 13, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 2, max: 5 }, { itemId: ITEM.oldBattery, chance: .34, min: 1, max: 1 }, { itemId: ITEM.fieldRation, chance: .16, min: 1, max: 1 }] },
  brute: { art: '重', name: '重装拾荒者', description: '缓慢但危险的重型单位，携带更多装甲材料。', maxHp: 100, attack: 10, defense: 2, attackInterval: 3.6, gold: 25, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 4, max: 8 }, { itemId: ITEM.armorPlate, chance: .3, min: 1, max: 1 }, { itemId: ITEM.emberShard, chance: .1, min: 1, max: 1 }] },
  wirehound: { art: '犬', name: '线缆猎犬', description: '用断裂电缆当腿的四足机械，扑咬极快，但一撞就散。', maxHp: 64, attack: 6, defense: 0, attackInterval: 1.7, gold: 15, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 2, max: 4 }, { itemId: ITEM.whetOil, chance: .2, min: 1, max: 1 }, { itemId: ITEM.oldBattery, chance: .2, min: 1, max: 1 }] },
  scrapGolem: { art: '偶', name: '废铁傀儡', description: '被人一层层焊上废铁的搬运单位，外壳厚得离谱，攻击却没什么章法。', maxHp: 130, attack: 7, defense: 2, attackInterval: 2.5, gold: 30, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 6, max: 10 }, { itemId: ITEM.armorPlate, chance: .34, min: 1, max: 1 }, { itemId: ITEM.platingGoo, chance: .12, min: 1, max: 1 }] },
  rustSentry: { art: '哨', name: '锈蚀哨兵', description: '仍在按旧指令巡逻的哨戒炮台，火力远超它的装甲厚度。', maxHp: 70, attack: 14, defense: 0, attackInterval: 4.4, gold: 22, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 3, max: 6 }, { itemId: ITEM.scavengedBlade, chance: .1, min: 1, max: 1 }, { itemId: ITEM.commonSolvent, chance: .14, min: 1, max: 1 }] },

  /* ——— 余烬矿脉（enemyId 5-9）：被结晶污染、仍在往外渗热量的旧矿井 ———
     玩家此时大约「攻 22 / 防 2 / 血 120」（一两件装备 + 少量工坊研究加成），净损失压在 35~38。 */
  emberMite: { art: '螨', name: '余烬螨虫', description: '成群啃食结晶碎屑的小型单位，单体弱，胜在数量与出手频率。', maxHp: 150, attack: 10, defense: 3, attackInterval: 2, gold: 48, dropTable: [{ itemId: ITEM.emberShard, chance: .5, min: 1, max: 2 }, { itemId: ITEM.scrap, chance: 1, min: 4, max: 7 }] },
  ashCrawler: { art: '爬', name: '灰烬爬行者', description: '在矿道顶壁上爬行的多足机械，落下来时带着一身高热灰。', maxHp: 200, attack: 12, defense: 4, attackInterval: 3, gold: 62, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 5, max: 9 }, { itemId: ITEM.emberShard, chance: .34, min: 1, max: 1 }, { itemId: ITEM.platingGoo, chance: .18, min: 1, max: 1 }] },
  veinWarden: { art: '卫', name: '矿脉守卫', description: '守着主矿脉的重甲单位，装甲板就是从它身上撬下来的标准件。', maxHp: 250, attack: 10, defense: 6, attackInterval: 2.6, gold: 88, dropTable: [{ itemId: ITEM.armorPlate, chance: .6, min: 1, max: 2 }, { itemId: ITEM.scrap, chance: 1, min: 8, max: 12 }, { itemId: ITEM.emberCore, chance: .12, min: 1, max: 1 }] },
  emberLeech: { art: '蛭', name: '余烬水蛭', description: '吸附在结晶上取热的软体机械，被打散时会溅出灼热的体液。', maxHp: 170, attack: 16, defense: 2, attackInterval: 3.7, gold: 76, dropTable: [{ itemId: ITEM.emberShard, chance: .4, min: 1, max: 1 }, { itemId: ITEM.lifeSeed, chance: .2, min: 1, max: 1 }, { itemId: ITEM.scrap, chance: 1, min: 4, max: 8 }] },
  moltenHound: { art: '熔', name: '熔渣猎犬', description: '关节处凝着熔渣的追猎单位，越打越烫。', maxHp: 190, attack: 13, defense: 4, attackInterval: 3.4, gold: 95, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 6, max: 10 }, { itemId: ITEM.emberCore, chance: .16, min: 1, max: 1 }, { itemId: ITEM.fineSolvent, chance: .18, min: 1, max: 1 }] },

  /* ——— 核心深井（enemyId 10-14）：信号最深处，井壁上全是结晶 ———
     玩家此时大约「攻 34 / 防 6 / 血 170」，净损失 48~60；泰坦作为终点故意留高一档。 */
  coreDrone: { art: '机', name: '核心无人机', description: '围绕井口盘旋的维护机，炮口对准一切还在动的东西。', maxHp: 260, attack: 16, defense: 5, attackInterval: 2.2, gold: 150, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 10, max: 16 }, { itemId: ITEM.emberCore, chance: .2, min: 1, max: 1 }] },
  signalAdept: { art: '祭', name: '信号祭司', description: '把核心信号当祷文反复播放的人形单位，靠近时能听见自己的名字。', maxHp: 340, attack: 18, defense: 7, attackInterval: 3, gold: 190, dropTable: [{ itemId: ITEM.emberShard, chance: .6, min: 2, max: 3 }, { itemId: ITEM.deepSolvent, chance: .2, min: 1, max: 1 }, { itemId: ITEM.scrap, chance: 1, min: 8, max: 14 }] },
  echoWraith: { art: '影', name: '回声残影', description: '一段没能散掉的旧信号，出手快得只留下一道残影。', maxHp: 240, attack: 12, defense: 5, attackInterval: 1.3, gold: 210, dropTable: [{ itemId: ITEM.emberCore, chance: .22, min: 1, max: 1 }, { itemId: ITEM.deepSolvent, chance: .16, min: 1, max: 1 }, { itemId: ITEM.emberShard, chance: .4, min: 1, max: 2 }] },
  abyssBrute: { art: '渊', name: '深渊重装者', description: '井底的重载单位，每一块装甲都比远征队整支队伍还厚。', maxHp: 420, attack: 16, defense: 10, attackInterval: 2.9, gold: 240, dropTable: [{ itemId: ITEM.armorPlate, chance: 1, min: 2, max: 3 }, { itemId: ITEM.scrap, chance: 1, min: 12, max: 18 }, { itemId: ITEM.emberCore, chance: .25, min: 1, max: 1 }] },
  coreTitan: { art: '坦', name: '核心泰坦', description: '井底那颗仍在搏动的核心本身。所有信号的源头。', maxHp: 480, attack: 28, defense: 12, attackInterval: 6.2, gold: 420, dropTable: [{ itemId: ITEM.emberCore, chance: .5, min: 1, max: 2 }, { itemId: ITEM.armorPlate, chance: 1, min: 3, max: 4 }, { itemId: ITEM.emberShard, chance: .8, min: 2, max: 3 }] }
} satisfies Record<string, Enemy>;

export const enemyTable: Enemy[] = Object.values(ENEMY_DEFS);
/** 名字 → 下标，用法同 ITEM。 */
export const ENEMY = Object.fromEntries(Object.keys(ENEMY_DEFS).map((name, id) => [name, id])) as { [K in keyof typeof ENEMY_DEFS]: number };

/* 区域表：键顺序就是 zoneId。enemyIds 引用敌人表下标；
   enemyIds 为空的区域是「非战斗区域」（营地），不刷怪、只按倍率回复生命值。
   unlockIndex 是进入所需的主线进度（mainlineIndex 达到这个值才算解锁）。
   icon 是区域在界面上的图标：区域引用（icon + 名称）与图鉴标题栏都用它。 */
const ZONE_DEFS = {
  camp: { name: '营地', icon: '🔥', description: '远征队的落脚点。营火不灭，这里不会遭遇敌人，生命恢复速度远高于野外。', enemyIds: [], unlockIndex: 0 },
  wasteBorder: { name: '废弃边境', icon: '🏚️', description: '营火以北，失去联络的旧哨站。锈蚀的机械单位仍在街区与哨塔之间徘徊。', enemyIds: [ENEMY.scavenger, ENEMY.brute, ENEMY.wirehound, ENEMY.scrapGolem, ENEMY.rustSentry], unlockIndex: 0 },
  emberVein: { name: '余烬矿脉', icon: '💠', description: '被结晶污染的旧矿井，渗出的热量让整条矿道都在发光。守卫这里的单位已经开始结晶化。', enemyIds: [ENEMY.emberMite, ENEMY.ashCrawler, ENEMY.veinWarden, ENEMY.emberLeech, ENEMY.moltenHound], unlockIndex: 5 },
  coreDeep: { name: '核心深井', icon: '🕳️', description: '核心信号的源头。井壁上结满结晶，越往下信号越清晰，也越致命。', enemyIds: [ENEMY.coreDrone, ENEMY.signalAdept, ENEMY.echoWraith, ENEMY.abyssBrute, ENEMY.coreTitan], unlockIndex: 7 }
} satisfies Record<string, Zone>;

export const zones: Zone[] = Object.values(ZONE_DEFS);
/** 名字 → 下标，用法同 ITEM。 */
export const ZONE = Object.fromEntries(Object.keys(ZONE_DEFS).map((name, id) => [name, id])) as { [K in keyof typeof ZONE_DEFS]: number };

/** 这只怪物出现在哪个区域（战斗信息与图鉴都要反查）。找不到返回 -1。 */
export function zoneOfEnemy(enemyId: number): number {
  return zones.findIndex(zone => zone.enemyIds.includes(enemyId));
}
