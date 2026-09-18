import { ITEM } from './items';
import { MAP } from './maps';
import { unlockBy } from './unlock';
import type { Enemy, Zone } from '../types';

/* 敌人表：键顺序就是 enemyId（0,1,2…）。dropTable 里引用的是物品表下标。

   ⚠️ 键顺序不能动：state.encountered / state.discoveredDrops / adventure.enemyId 都是按下标存的，
   重排会让旧存档整体错位。新增怪物一律追加到末尾（或追加到所属区域分组的末尾），
   改数值直接改字段即可。

   ——— 数值设计的三条约束（改数值前先读这里）———
   1) 区域内强度相当 —— 用「净损失生命占玩家生命上限的比例」当强度指标，
      同一区域所有怪物必须落在同一区间，不允许出现明显更强的「隐藏 Boss」（终点怪除外）。
   2) 偏科不同 —— 强度拉平的前提下，攻击 / 出手间隔 / 血量 / 防御各偏一头：
      高攻慢手、低攻快攻、高血高防低攻…… 让玩家面对不同怪时有不同的应对感。
      偏的是「怎么打」，不是「打不打得过」。
   3) 开局区域必须无装备可过 —— 新档 inventory 全 0、equipped 全空（开局送的「拾荒者短刃」
      只放在包里、不预装），所以废弃边境每一只都必须在
      「攻击 12 / 防御 0 / 生命 100 / 回复 2」这套裸数值下打得赢。

   怎么算：净损失 ≈ 击杀耗时 T ×（怪物 DPS − 玩家回复），T = 玩家出手次数 × 出手间隔，
   玩家出手次数 = ⌈怪物生命 ÷（玩家攻击 − 怪物防御）⌉。
   所以「血厚 + 防高」的怪 T 天然更长，攻击必须相应压低，净损失才拉得平。

   ⚠️ 各区域的玩家基准 = **穿齐上一区域的整套套装**（见 config/sets.ts）。按这套基准现算，
   每个区域的净损失都压在玩家生命上限的 **25~35%** —— 一条命能连打三场左右，回庇护所
   （回复速度 ×5）修整后再来。改任何一只怪之前先想清楚它在拿哪一套装备打它。

     废弃边境  裸装           攻 12 / 防 0 / 血 100 / 回复 2 / 间隔 2.2 → 净损失 16~23（16~23%）
     余烬矿脉  拾荒者套装齐   攻 17 / 防 6 / 血 200 / 回复 3 / 间隔 2.2 → 净损失 51~67（25~34%）
     核心深井  余烬套装齐     攻 42 / 防 2 / 血 135 / 回复 2 / 间隔 2.0 → 净损失 36~52（27~39%）
     熔火裂谷  核心套装齐     攻 57 / 防 11 / 血 290 / 回复 2 / 间隔 2.2 → 净损失 84~92（29~32%）

   余烬矿脉与核心深井的数值是批次 2 **重新校准**过的：原来的设计基准里含一条「营火等级」
   成长线（花精华升全局等级），而那条线已经整条移除（见 庇护所扩展方案.md §4.3）——
   残留的旧数值是按一个不存在的成长线算的，实际打不过。现在这 10 只怪一律按上表的
   「实际基准」重算，和废弃边境、熔火裂谷用同一个口径。
   核心泰坦是核心深井的终点怪，**刻意留高一档**（净损失约 39%、血量最厚），其余四只拉平。

   强化道具（锐化油 / 生命之种 / 铁壁涂层 / 余烬核心 / 勤务手册）的掉率统一按 ×0.6 压过一轮
   （08→05、06/07→04、09→05、10→06、20→12），配合 config/affixes.ts 里 step 的下调 ——
   强化是长期投入，不该几个道具就顶到上限。

   金币按「每秒产出大致不变」折算：击杀变慢的区域，单只金币同步抬高。
   三个后期区域的产出档位大致是 废弃边境 0.7~1.7 / 余烬矿脉 2.4 / 核心深井 4.0 / 熔火裂谷 6.0 金币每秒。

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
     基准「拾荒者套装齐：攻 17 / 防 6 / 血 200 / 回复 3 / 间隔 2.2」→ 净损失 51~67。
     这一区的怪防御普遍不高（4~8），玩家的 17 点攻击落在 9~13 之间 —— 打得动，但打得久。 */
  emberMite: { art: '螨', name: '余烬螨虫', description: '成群啃食结晶碎屑的小型单位，单体弱，胜在数量与出手频率。', maxHp: 145, attack: 11, defense: 4, attackInterval: 1, gold: 65, dropTable: [{ itemId: ITEM.emberShard, chance: .5, min: 1, max: 2 }, { itemId: ITEM.scrap, chance: 1, min: 4, max: 7 }] },
  ashCrawler: { art: '爬', name: '灰烬爬行者', description: '在矿道顶壁上爬行的多足机械，落下来时带着一身高热灰。', maxHp: 170, attack: 13, defense: 5, attackInterval: 1.5, gold: 80, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 5, max: 9 }, { itemId: ITEM.emberShard, chance: .34, min: 1, max: 1 }, { itemId: ITEM.platingGoo, chance: .04, min: 1, max: 1 }] },
  veinWarden: { art: '卫', name: '矿脉守卫', description: '守着主矿脉的重甲单位，装甲板就是从它身上撬下来的标准件。', maxHp: 160, attack: 16, defense: 8, attackInterval: 2.2, gold: 95, dropTable: [{ itemId: ITEM.armorPlate, chance: .6, min: 1, max: 2 }, { itemId: ITEM.scrap, chance: 1, min: 8, max: 12 }, { itemId: ITEM.emberCore, chance: .002, min: 1, max: 1 }] },
  emberLeech: { art: '蛭', name: '余烬水蛭', description: '吸附在结晶上取热的软体机械，被打散时会溅出灼热的体液。', maxHp: 155, attack: 19, defense: 4, attackInterval: 2.4, gold: 65, dropTable: [{ itemId: ITEM.emberShard, chance: .4, min: 1, max: 1 }, { itemId: ITEM.lifeSeed, chance: .05, min: 1, max: 1 }, { itemId: ITEM.scrap, chance: 1, min: 4, max: 8 }] },
  moltenHound: { art: '渣', name: '熔渣猎犬', description: '关节处凝着熔渣的追猎单位，越打越烫。', maxHp: 155, attack: 15, defense: 5, attackInterval: 1.6, gold: 70, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 6, max: 10 }, { itemId: ITEM.emberCore, chance: .002, min: 1, max: 1 }] },

  /* ——— 核心深井（enemyId 10-14）：信号最深处，井壁上全是结晶 ———
     基准「余烬套装齐：攻 42 / 防 2 / 血 135 / 回复 2 / 间隔 2.0」→ 净损失 36~52。
     余烬套装把生命换成了攻击（血只有 135），所以这里的怪防御偏高、单次伤害压得低 ——
     靠「打得快」而不是「扛得住」过关。泰坦是终点，刻意留高一档。 */
  coreDrone: { art: '机', name: '核心无人机', description: '围绕井口盘旋的维护机，炮口对准一切还在动的东西。', maxHp: 300, attack: 8, defense: 12, attackInterval: 1.4, gold: 80, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 10, max: 16 }, { itemId: ITEM.emberCore, chance: .0025, min: 1, max: 1 }, { itemId: ITEM.logisticsManual, chance: .05, min: 1, max: 1 }] },
  signalAdept: { art: '祭', name: '信号祭司', description: '把核心信号当祷文反复播放的人形单位，靠近时能听见自己的名字。', maxHp: 335, attack: 9, defense: 14, attackInterval: 1.9, gold: 95, dropTable: [{ itemId: ITEM.emberShard, chance: .6, min: 2, max: 3 }, { itemId: ITEM.scrap, chance: 1, min: 8, max: 14 }] },
  echoWraith: { art: '影', name: '回声残影', description: '一段没能散掉的旧信号，出手快得只留下一道残影。', maxHp: 350, attack: 14, defense: 10, attackInterval: 2.8, gold: 90, dropTable: [{ itemId: ITEM.emberCore, chance: .0025, min: 1, max: 1 }, { itemId: ITEM.emberShard, chance: .4, min: 1, max: 2 }] },
  abyssBrute: { art: '渊', name: '深渊重装者', description: '井底的重载单位，每一块装甲都比远征队整支队伍还厚。', maxHp: 410, attack: 8, defense: 18, attackInterval: 2, gold: 145, dropTable: [{ itemId: ITEM.armorPlate, chance: 1, min: 2, max: 3 }, { itemId: ITEM.scrap, chance: 1, min: 12, max: 18 }, { itemId: ITEM.emberCore, chance: .003, min: 1, max: 1 }] },
  coreTitan: { art: '枢', name: '核心泰坦', description: '井底那颗仍在搏动的核心本身。所有信号的源头。', maxHp: 480, attack: 13, defense: 18, attackInterval: 3.2, gold: 160, dropTable: [{ itemId: ITEM.emberCore, chance: .006, min: 1, max: 1 }, { itemId: ITEM.armorPlate, chance: 1, min: 3, max: 4 }, { itemId: ITEM.emberShard, chance: .8, min: 2, max: 3 }] },

  /* ——— 熔火裂谷（enemyId 15-19）：核心深井之外那片终年冒热气的地缝 ———
     基准「核心套装齐：攻 57 / 防 11 / 血 290 / 回复 2 / 间隔 2.2」→ 净损失 84~92。
     这是当前最深的一档，怪的血量整体上到 490~585，玩家的 57 点攻击落在 39~49 之间。
     进入这里的唯一途径是集齐「裂谷坐标」（见 config/maps.ts）并完成一次勘探远征。 */
  riftScavenger: { art: '扫', name: '熔渣清道夫', description: '在裂谷底部来回刮取热渣的六足机械，被撞散时会甩出一身熔浆。', maxHp: 490, attack: 19, defense: 8, attackInterval: 1.3, gold: 130, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 12, max: 18 }, { itemId: ITEM.armorPlate, chance: .5, min: 1, max: 2 }] },
  magmaSentry: { art: '哨', name: '岩浆哨卫', description: '立在裂口两侧的旧时代哨戒塔，炮管被地热烫得发亮。', maxHp: 515, attack: 22, defense: 14, attackInterval: 2, gold: 160, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 14, max: 20 }, { itemId: ITEM.emberCore, chance: .003, min: 1, max: 1 }] },
  cinderWraith: { art: '影', name: '灰烬幽影', description: '一团不肯散去的热浪，靠近时连呼吸都在发烫。', maxHp: 515, attack: 25, defense: 10, attackInterval: 2.4, gold: 145, dropTable: [{ itemId: ITEM.emberShard, chance: .7, min: 2, max: 4 }, { itemId: ITEM.emberCore, chance: .0025, min: 1, max: 1 }] },
  forgeHound: { art: '犬', name: '熔炉猎犬', description: '在熔炉残骸里出生的一群四足机械，关节处的火光就是它们的眼睛。', maxHp: 495, attack: 20, defense: 12, attackInterval: 1.6, gold: 145, dropTable: [{ itemId: ITEM.scrap, chance: 1, min: 10, max: 16 }, { itemId: ITEM.armorPlate, chance: .45, min: 1, max: 2 }] },
  riftColossus: { art: '像', name: '裂谷巨像', description: '从裂谷壁上整片剥下来又自己站起来的岩层，走一步震一下。', maxHp: 585, attack: 25, defense: 18, attackInterval: 3, gold: 200, dropTable: [{ itemId: ITEM.emberCore, chance: .005, min: 1, max: 1 }, { itemId: ITEM.armorPlate, chance: 1, min: 2, max: 3 }, { itemId: ITEM.emberShard, chance: .7, min: 2, max: 3 }] },

  /* ——— 熔核之扉（第一个 Boss）———
     前三个区域的东西在裂谷尽头汇聚成的**同一个实体**：结晶为骨、核心信号为神经、地热为血。
     **没有机制，只有肉搏** —— 数值就是它的全部（阶段弹窗那套已撤出，见 庇护所扩展方案 §4.8）。

     这里是**第 0 档（常规）**的体态；强化与绝境在区域表的 difficulties 里覆盖，三档**逐档全面更强**，
     而且台阶刻意拉陡：净损失 常规 ≈86% → 强化 ≈126% → 绝境 ≈176%（各自带上该有的那件饰品）。
     校准基准 =「全极致深井套 + 锐化油 / 生命之种 / 铁壁涂层打满」
     ＝ 攻 114 / 防 56 / 血 582 / 回复 2 / 间隔 2.2（2-3 刷完之后的典型身板，见 庇护所扩展方案 §8）：
     常规一场打掉约 86% 生命 —— 一场一条命，打完回庇护所修整，这正是「复活计时 60 秒」的用处。
     ⚠️ 难度**不再靠特性门槛**（requires / immune 已整条移除）：高防的那两档靠【破甲】（无视固定防御）
     与更多的精炼 / 词条去破，破不了就是实打实的砍不动。
     掉落表有 5 条：2 条常规材料 + 3 条**逐档独占**（`tier` 就是档位，走 grantDrops 的档位过滤）——
     「同一只怪最多 3 条掉落」是给普通怪的约束，Boss 是逐档解锁的收集位，不受它限制。 */
  moltenWarden: { art: '核', name: '熔核守卫', description: '矿脉的结晶、深井的信号、裂谷的地热在门后合成了同一个东西。它没有招式，只是比谁都厚、比谁都烫。', maxHp: 2700, attack: 79, defense: 30, attackInterval: 2.6, gold: 550, dropTable: [{ itemId: ITEM.armorPlate, chance: 1, min: 4, max: 6 }, { itemId: ITEM.emberCore, chance: .04, min: 1, max: 1 }, { itemId: ITEM.shatterSpike, chance: .35, min: 1, max: 1, tier: 0 }, { itemId: ITEM.heatShell, chance: .35, min: 1, max: 1, tier: 1 }, { itemId: ITEM.lostEdge, chance: .25, min: 1, max: 1, tier: 2 }] }
} satisfies Record<string, Enemy>;

export const enemyTable: Enemy[] = Object.values(ENEMY_DEFS);
/** 名字 → 下标，用法同 ITEM。 */
export const ENEMY = Object.fromEntries(Object.keys(ENEMY_DEFS).map((name, id) => [name, id])) as { [K in keyof typeof ENEMY_DEFS]: number };

/* 区域表：键顺序就是 zoneId。enemyIds 引用敌人表下标；
   enemyIds 为空的区域是「非战斗区域」（庇护所），不刷怪、只按倍率回复生命值。
   icon 是区域在界面上的图标：区域引用（icon + 名称）与图鉴标题栏都用它。
   questItem 是这个区域的任务物品（见 config/items.ts 的 quest 类别）—— 研究基地的委托
   只索取任务物品，一个区域一种；**只有当前委托正指向这个区域时**，这里的怪物才会按
   QUEST_DROP_CHANCE 掉它（见 game-state 的 grantQuestDrop）。
   这样委托的诉求是「去那个区域刷」，而不是「挑某只怪刷」。

   **unlock 是可组合的解锁规则**（见 config/unlock.ts），不再是单一的「主线进度到 N」：
   主线 / 地图 / 任意组合。区域开放的三处显示（冒险页的解锁提示、图鉴的「进入条件」、
   解锁公告）都直接读它，所以每种规则都必须给出可读的 text()。 */
const ZONE_DEFS = {
  /* 庇护所**不是开局就有的**：点亮第一座营火（主线第 1 节）之后才算挣下这片安全区域。
     它同时也是「家园」那一页的解锁条件（见 game-state 的 isCampUnlocked）—— 判定只有这一处。 */
  camp: { name: '庇护所', icon: '🔥', description: '远征队的落脚点。营火不灭，这里不会遭遇敌人，生命恢复速度远高于野外。', enemyIds: [], unlock: unlockBy.mainline(1) },
  /* dropRefine：这个区域掉落的装备自带几级精炼。越早的区域给得越高 ——
     早期装备靠一件件喂太慢，直接送一档起步；后期区域基本靠自己喂，所以只有 +1。 */
  wasteBorder: { name: '废弃边境', icon: '🏚️', description: '营火以北，失去联络的旧哨站。锈蚀的机械单位仍在街区与哨塔之间徘徊。', enemyIds: [ENEMY.scavenger, ENEMY.brute, ENEMY.wirehound, ENEMY.scrapGolem, ENEMY.rustSentry], unlock: unlockBy.mainline(0), dropRefine: 10, questItem: ITEM.borderTag },
  /* 只能靠勘探图进：它是「碎片 → 地图 → 勘探远征 → 新区域」这条链的出口之一。
     ⚠️ 这里**不再有**「主线全通」那条并行通道：那会让「一键清剿推完第一章」顺带白送两个新区域，
     勘探图整条线就成了摆设（踩过，见 UI开发规范 §10-33）。新区域一律只留勘探图这一个入口。 */
  emberVein: { name: '余烬矿脉', icon: '💠', description: '被结晶污染的旧矿井，渗出的热量让整条矿道都在发光。守卫这里的单位已经开始结晶化。', enemyIds: [ENEMY.emberMite, ENEMY.ashCrawler, ENEMY.veinWarden, ENEMY.emberLeech, ENEMY.moltenHound], unlock: unlockBy.map(MAP.veinChart), dropRefine: 5, questItem: ITEM.crystalSample },
  /* 同余烬矿脉：核心深井也只能靠勘探图（deepProfile 由兽潮掉）。 */
  coreDeep: { name: '核心深井', icon: '🕳️', description: '核心信号的源头。井壁上结满结晶，越往下信号越清晰，也越致命。', enemyIds: [ENEMY.coreDrone, ENEMY.signalAdept, ENEMY.echoWraith, ENEMY.abyssBrute, ENEMY.coreTitan], unlock: unlockBy.map(MAP.deepProfile), dropRefine: 1, questItem: ITEM.coreReading },
  /* 批次 2 的新区域：和上面两个同一条规矩 —— 只留勘探图这一个入口。 */
  magmaRift: { name: '熔火裂谷', icon: '🌋', description: '核心深井之外那片终年冒热气的地缝。裂开的岩层下面还亮着光，走进去的人说脚下一直是烫的。', enemyIds: [ENEMY.riftScavenger, ENEMY.magmaSentry, ENEMY.cinderWraith, ENEMY.forgeHound, ENEMY.riftColossus], unlock: unlockBy.map(MAP.riftChart), questItem: ITEM.riftSample },
  /* 第一个 Boss 区域：由第二章第 3 节「穿过裂谷」解锁（它**不**走勘探图 —— 那是批次 2 三张图的路子）。
     三档难度各自一组体态 + 特性门槛 + 掉落档位。
     `spawnCooldown` 60 秒是**复活计时**：击杀之后才等这么久（有喘息与回血的余地，独占件也不会被刷爆）；
     ⚠️ **进入区域 / 换难度不走它**，用全局的 3 秒 —— 否则每次进门都要干等一场复活（见 getRespawnCooldown）。 */
  moltenGate: { name: '熔核之扉', icon: '🌑', kind: 'boss', spawnCooldown: 60, description: '裂谷尽头的那扇门。门后面没有路，只有一个一直在等的东西 —— 前三个区域里散落的东西，在这里凑成了同一个。', enemyIds: [ENEMY.moltenWarden], unlock: unlockBy.chapter(2, 3), difficulties: [
    /* 第 0 档（常规）：体态 = 敌人表那一组，这里显式写出便于对照与调参。
       基准身板（攻 114 / 防 56 / 血 582）打它：33 下、约 73 秒，净损失 ≈86% —— 一场一条命。 */
    { name: '常规', hp: 2700, attack: 79, defense: 30, interval: 2.6, gold: 550, dropTier: 0 },
    /* 第 1 档（强化）：防御抬到 42 —— 这里【破甲】（无视固定防御）最值钱：带与不带，有效伤害差一大截。
       净损失 ≈126%（基准 + 裂甲锥）；不带破甲时 ≈223%，必死。 */
    { name: '强化', hp: 3000, attack: 94, defense: 42, interval: 2.4, gold: 750, dropTier: 1 },
    /* 第 2 档（绝境）：防御 48、出手更快。净损失 ≈176%（基准 + 裂甲锥）——
       要过它得再堆到 攻 ≈140 / 血 ≈750（精炼、词条、手动模式一起上）。 */
    { name: '绝境', hp: 3200, attack: 100, defense: 48, interval: 2.2, gold: 1000, dropTier: 2 }
  ] }
} satisfies Record<string, Zone>;

export const zones: Zone[] = Object.values(ZONE_DEFS);
/** 名字 → 下标，用法同 ITEM。 */
export const ZONE = Object.fromEntries(Object.keys(ZONE_DEFS).map((name, id) => [name, id])) as { [K in keyof typeof ZONE_DEFS]: number };

/** 哪张勘探图指向哪个区域（反向查表）：勘探图页要写「勘探成功就解锁 XXX」，
    区域表那一侧写的是解锁规则，两边只在这一处对齐。 */
const MAP_ZONE: Record<number, number> = {
  [MAP.veinChart]: ZONE.emberVein,
  [MAP.deepProfile]: ZONE.coreDeep,
  [MAP.riftChart]: ZONE.magmaRift
};
/** 这张图指向哪个区域；没有对应的返回 -1。 */
export function zoneOfMap(mapId: number): number { return MAP_ZONE[mapId] ?? -1; }

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
