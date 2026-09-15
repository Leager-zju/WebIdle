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
   3) 开局区域必须无装备可过 —— 新档 inventory 全 0、equipped 全空（开局送的「拾荒者短刃」
      只放在包里、不预装），所以废弃边境每一只都必须在
      「攻击 12 / 防御 0 / 生命 100 / 回复 2」这套裸数值下打得赢。

   怎么算：净损失 ≈ 击杀耗时 T ×（怪物 DPS − 玩家回复），T = 玩家出手次数 × 出手间隔。
   所以「血厚 + 防高」的怪 T 天然更长，攻击必须相应压低，净损失才拉得平。

   ⚠️ 各区域的玩家基准（穿齐上一区域的套装，见 config/sets.ts）。下面「设计」是按
   「套装齐 + 营火 N 级」算的旧值，「实际」是按**当前代码**（攻 12 + 装备 + 套装 + 词条，
   营火那一项恒为 0，见下）现算的 —— 后两个区域的差距很大，**现在都打不过**：
     废弃边境  实际 = 设计：攻 12 / 防 0 / 血 100 / 回复 2 / 间隔 2.2（裸装）→ 净损失 16~23
     余烬矿脉  设计：攻 30 / 防 6 / 血 240 / 回复 5.4 → 净损失 65~78（27~33%）
               实际：攻 17 / 防 6 / 血 200 / 回复 3   → 净损失 305~451（153~226% 生命）
     核心深井  设计：攻 50 / 防 8 / 血 260 / 回复 6   → 净损失 84~116（32~45%）
               实际：攻 42 / 防 2 / 血 135 / 回复 2   → 净损失 261~468（193~347% 生命）

   ⚠️ 差距的来源是 state.workshop（原「营火强化」）：它仍出现在 getPlayerAttack（+3/级）、
   getPlayerMaxHp（+15/级）、getPlayerRegen（+0.8/级）与三个营地数值里，但**升级入口已经删掉**，
   只有开发者面板能改（且名字还叫「营火强化」）。rebuildState 走 { ...initial, ...saved }，
   所以**老存档保留着旧值、新存档恒为 0** —— 新老玩家战力不一致。
   要修就得二选一：给玩家补回这部分战力，或按上面「实际」那一列重算这 10 只怪。
   别只调一个区域 —— 套装是玩家战力的主要来源，基准一漂整张表都偏。

   强化道具（锐化油 / 生命之种 / 铁壁涂层 / 余烬核心 / 勤务手册）的掉率统一按 ×0.6 压过一轮
   （08→05、06/07→04、09→05、10→06、20→12），配合 config/affixes.ts 里 step 的下调 ——
   强化是长期投入，不该几个道具就顶到上限。

   金币按「每秒产出大致不变」折算：击杀变慢的区域，单只金币同步抬高。

   两条硬约束保持不变：
   - 每个战斗区域至少 5 种怪物（区域表在文件下方按 enemyIds 分组）；
   - 同一只怪物的掉落物最多 3 条 —— 再多会稀释每一条的期望产出，图鉴一页也塞不下。 */
const ENEMY_DEFS = {
  /* ——— 废弃边境（enemyId 0-4）：失去联络的旧哨站与锈蚀街区 ———
     基准区：玩家按「攻 12 / 防 0 / 血 100 / 回复 2」裸装算，净损失压在 16~23。
     这一区不依赖任何已删除的系统，所以设计值与实际值一致，可以放心当基准。 */
  scavenger: { art: '拾', name: '锈蚀拾荒者', description: '动作敏捷但装甲脆弱的机械单位。', maxHp: 86, attack: 9, defense: 0, attackInterval: 2.8, gold: 13, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 2, max: 5 }, { itemId: ITEM.oldBattery, chance: .34, min: 1, max: 1 }, { itemId: ITEM.fieldRation, chance: .16, min: 1, max: 1 }] },
  /* art 是名字之外的单字标记：要和名字的首字错开，否则「重 重装拾荒者」看起来像把首字写了两遍。 */
  brute: { art: '甲', name: '重装拾荒者', description: '缓慢但危险的重型单位，携带更多装甲材料。', maxHp: 100, attack: 10, defense: 2, attackInterval: 3.6, gold: 25, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 4, max: 8 }, { itemId: ITEM.armorPlate, chance: .3, min: 1, max: 1 }, { itemId: ITEM.emberShard, chance: .1, min: 1, max: 1 }] },
  wirehound: { art: '犬', name: '线缆猎犬', description: '用断裂电缆当腿的四足机械，扑咬极快，但一撞就散。', maxHp: 64, attack: 6, defense: 0, attackInterval: 1.7, gold: 15, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 2, max: 4 }, { itemId: ITEM.whetOil, chance: .05, min: 1, max: 1 }, { itemId: ITEM.oldBattery, chance: .2, min: 1, max: 1 }] },
  scrapGolem: { art: '偶', name: '废铁傀儡', description: '被人一层层焊上废铁的搬运单位，外壳厚得离谱，攻击却没什么章法。', maxHp: 130, attack: 7, defense: 2, attackInterval: 2.5, gold: 30, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 6, max: 10 }, { itemId: ITEM.armorPlate, chance: .34, min: 1, max: 1 }, { itemId: ITEM.platingGoo, chance: .04, min: 1, max: 1 }] },
  rustSentry: { art: '哨', name: '锈蚀哨兵', description: '仍在按旧指令巡逻的哨戒炮台，火力远超它的装甲厚度。', maxHp: 70, attack: 14, defense: 0, attackInterval: 4.4, gold: 22, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 3, max: 6 }, { itemId: ITEM.scavengedBlade, chance: .1, min: 1, max: 1 }] },

  /* ——— 余烬矿脉（enemyId 5-9）：被结晶污染、仍在往外渗热量的旧矿井 ———
     设计基准「攻 30 / 防 6 / 血 240 / 回复 5.4」（拾荒者套装齐 + 营火 3 级）→ 净损失 65~78（27~33% 生命）。
     但营火强化已经删掉，实际只有「攻 17 / 防 6 / 血 200 / 回复 3」→ 净损失 305~451（153~226% 生命）：
     **这一区现在打不过**，等基准修好再回来核对（见文件头）。 */
  emberMite: { art: '螨', name: '余烬螨虫', description: '成群啃食结晶碎屑的小型单位，单体弱，胜在数量与出手频率。', maxHp: 260, attack: 14, defense: 8, attackInterval: 1, gold: 70, dropTable: [{ itemId: ITEM.emberShard, chance: .5, min: 1, max: 2 }, { itemId: ITEM.scrap, chance: 1, min: 4, max: 7 }] },
  ashCrawler: { art: '爬', name: '灰烬爬行者', description: '在矿道顶壁上爬行的多足机械，落下来时带着一身高热灰。', maxHp: 300, attack: 18, defense: 6, attackInterval: 1.5, gold: 65, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 5, max: 9 }, { itemId: ITEM.emberShard, chance: .34, min: 1, max: 1 }, { itemId: ITEM.platingGoo, chance: .04, min: 1, max: 1 }] },
  veinWarden: { art: '卫', name: '矿脉守卫', description: '守着主矿脉的重甲单位，装甲板就是从它身上撬下来的标准件。', maxHp: 380, attack: 14, defense: 9, attackInterval: 1.1, gold: 105, dropTable: [{ itemId: ITEM.armorPlate, chance: .6, min: 1, max: 2 }, { itemId: ITEM.scrap, chance: 1, min: 8, max: 12 }, { itemId: ITEM.emberCore, chance: .04, min: 1, max: 1 }] },
  emberLeech: { art: '蛭', name: '余烬水蛭', description: '吸附在结晶上取热的软体机械，被打散时会溅出灼热的体液。', maxHp: 280, attack: 26, defense: 6, attackInterval: 2.4, gold: 100, dropTable: [{ itemId: ITEM.emberShard, chance: .4, min: 1, max: 1 }, { itemId: ITEM.lifeSeed, chance: .05, min: 1, max: 1 }, { itemId: ITEM.scrap, chance: 1, min: 4, max: 8 }] },
  moltenHound: { art: '渣', name: '熔渣猎犬', description: '关节处凝着熔渣的追猎单位，越打越烫。', maxHp: 300, attack: 20, defense: 8, attackInterval: 1.8, gold: 120, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 6, max: 10 }, { itemId: ITEM.emberCore, chance: .04, min: 1, max: 1 }] },

  /* ——— 核心深井（enemyId 10-14）：信号最深处，井壁上全是结晶 ———
     设计基准「攻 50 / 防 8 / 血 260 / 回复 6 / 间隔 2.1」（余烬套装齐 + 营火 5 级）→ 净损失 84~116，
     泰坦作为终点故意留高一档。但营火强化已经删掉，实际只有「攻 42 / 防 2 / 血 135 / 回复 2 / 间隔 2.0」
     → 净损失 261~468（193~347% 生命）：**这一区现在打不过**，等基准修好再回来核对（见文件头）。 */
  coreDrone: { art: '机', name: '核心无人机', description: '围绕井口盘旋的维护机，炮口对准一切还在动的东西。', maxHp: 400, attack: 22, defense: 12, attackInterval: 1.4, gold: 175, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 10, max: 16 }, { itemId: ITEM.emberCore, chance: .05, min: 1, max: 1 }, { itemId: ITEM.logisticsManual, chance: .05, min: 1, max: 1 }] },
  signalAdept: { art: '祭', name: '信号祭司', description: '把核心信号当祷文反复播放的人形单位，靠近时能听见自己的名字。', maxHp: 520, attack: 25, defense: 14, attackInterval: 1.9, gold: 210, dropTable: [{ itemId: ITEM.emberShard, chance: .6, min: 2, max: 3 }, { itemId: ITEM.scrap, chance: 1, min: 8, max: 14 }] },
  echoWraith: { art: '影', name: '回声残影', description: '一段没能散掉的旧信号，出手快得只留下一道残影。', maxHp: 380, attack: 38, defense: 10, attackInterval: 2.8, gold: 225, dropTable: [{ itemId: ITEM.emberCore, chance: .05, min: 1, max: 1 }, { itemId: ITEM.emberShard, chance: .4, min: 1, max: 2 }] },
  abyssBrute: { art: '渊', name: '深渊重装者', description: '井底的重载单位，每一块装甲都比远征队整支队伍还厚。', maxHp: 620, attack: 24, defense: 18, attackInterval: 2, gold: 255, dropTable: [{ itemId: ITEM.armorPlate, chance: 1, min: 2, max: 3 }, { itemId: ITEM.scrap, chance: 1, min: 12, max: 18 }, { itemId: ITEM.emberCore, chance: .06, min: 1, max: 1 }] },
  coreTitan: { art: '枢', name: '核心泰坦', description: '井底那颗仍在搏动的核心本身。所有信号的源头。', maxHp: 640, attack: 36, defense: 18, attackInterval: 3.2, gold: 365, dropTable: [{ itemId: ITEM.emberCore, chance: .12, min: 1, max: 1 }, { itemId: ITEM.armorPlate, chance: 1, min: 3, max: 4 }, { itemId: ITEM.emberShard, chance: .8, min: 2, max: 3 }] }
} satisfies Record<string, Enemy>;

export const enemyTable: Enemy[] = Object.values(ENEMY_DEFS);
/** 名字 → 下标，用法同 ITEM。 */
export const ENEMY = Object.fromEntries(Object.keys(ENEMY_DEFS).map((name, id) => [name, id])) as { [K in keyof typeof ENEMY_DEFS]: number };

/* 区域表：键顺序就是 zoneId。enemyIds 引用敌人表下标；
   enemyIds 为空的区域是「非战斗区域」（营地），不刷怪、只按倍率回复生命值。
   unlockIndex 是进入所需的主线进度（mainlineIndex 达到这个值才算解锁）。
   icon 是区域在界面上的图标：区域引用（icon + 名称）与图鉴标题栏都用它。
   questItem 是这个区域的任务物品（见 config/items.ts 的 quest 类别）—— 研究基地的委托
   只索取任务物品，一个区域一种；**只有当前委托正指向这个区域时**，这里的怪物才会按
   QUEST_DROP_CHANCE 掉它（见 game-state 的 grantQuestDrop）。
   这样委托的诉求是「去那个区域刷」，而不是「挑某只怪刷」。 */
const ZONE_DEFS = {
  camp: { name: '营地', icon: '🔥', description: '远征队的落脚点。营火不灭，这里不会遭遇敌人，生命恢复速度远高于野外。', enemyIds: [], unlockIndex: 0 },
  /* dropRefine：这个区域掉落的装备自带几级精炼。越早的区域给得越高 ——
     早期装备靠一件件喂太慢，直接送一档起步；后期区域基本靠自己喂，所以只有 +1。 */
  wasteBorder: { name: '废弃边境', icon: '🏚️', description: '营火以北，失去联络的旧哨站。锈蚀的机械单位仍在街区与哨塔之间徘徊。', enemyIds: [ENEMY.scavenger, ENEMY.brute, ENEMY.wirehound, ENEMY.scrapGolem, ENEMY.rustSentry], unlockIndex: 0, dropRefine: 10, questItem: ITEM.borderTag },
  /* unlockIndex 与核心深井同为 7：两个区域在完成「击退第一次兽潮」（当前主线的最后一个节点）后同时开放。 */
  emberVein: { name: '余烬矿脉', icon: '💠', description: '被结晶污染的旧矿井，渗出的热量让整条矿道都在发光。守卫这里的单位已经开始结晶化。', enemyIds: [ENEMY.emberMite, ENEMY.ashCrawler, ENEMY.veinWarden, ENEMY.emberLeech, ENEMY.moltenHound], unlockIndex: 7, dropRefine: 5, questItem: ITEM.crystalSample },
  coreDeep: { name: '核心深井', icon: '🕳️', description: '核心信号的源头。井壁上结满结晶，越往下信号越清晰，也越致命。', enemyIds: [ENEMY.coreDrone, ENEMY.signalAdept, ENEMY.echoWraith, ENEMY.abyssBrute, ENEMY.coreTitan], unlockIndex: 7, dropRefine: 1, questItem: ITEM.coreReading }
} satisfies Record<string, Zone>;

export const zones: Zone[] = Object.values(ZONE_DEFS);
/** 名字 → 下标，用法同 ITEM。 */
export const ZONE = Object.fromEntries(Object.keys(ZONE_DEFS).map((name, id) => [name, id])) as { [K in keyof typeof ZONE_DEFS]: number };

/** 任务物品的掉率：**仅当当前委托指向这个区域时**才判定，区域内所有怪物统一，和各自的 dropTable 无关。
    10% 是「刷得久」档 —— 按一场战斗约 20~30 秒算，一个委托（50~60 个）要 3~5 小时。
    委托的区间取这么宽，是为了让研究项「任务需求降低 I」的 10 级每一级都算数
    （见 game-state 的 RESEARCH.needMin / needMax）。 */
export const QUEST_DROP_CHANCE = .1;
/** 清洗剂的掉率：**任何**怪物统一，和各自的 dropTable 无关，掉哪一瓶随机（三选一）。
    0.1% 是刻意压到极低的档 —— 洗词条是「纠错」而不是「日常」，不该随手就能用。
    按这个掉率，一千次击杀大约出一瓶。 */
export const SOLVENT_DROP_CHANCE = .001;
/** 这个区域的任务物品下标；非战斗区域返回 -1。 */
export function questItemOf(zoneId: number): number { return zones[zoneId]?.questItem ?? -1; }

/** 这只怪物出现在哪个区域（战斗信息与图鉴都要反查）。找不到返回 -1。 */
export function zoneOfEnemy(enemyId: number): number {
  return zones.findIndex(zone => zone.enemyIds.includes(enemyId));
}
