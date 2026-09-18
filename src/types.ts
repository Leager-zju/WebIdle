export type ItemCategory = 'resource' | 'equipment' | 'consumable' | 'quest';
/** 稀有度下标（顺序见 config/rarity.ts 的 RARITY_DEFS）：**只影响物品名的显示颜色**，
    不参与任何数值计算。目前用到 gray(0) / white(1) / blue(2) / amber(15) 四档。 */
export type ItemRarity = number;
export type LogType = 'battle' | 'drop' | 'progress' | 'system' | 'defeat';

/* 下面这些"名字"类型只用于静态表内部和 UI 展示；运行时状态里保存的是数字下标。
   静态表的下标就是实体 id（见 config/items.ts、config/zones.ts），所以 Item / Enemy / Zone
   本身不再带 id 字段。 */

/** 装备类型下标：0 武器 / 1 头部 / 2 躯干 / 3 腿部 / 4 饰品（顺序见 config/items.ts 的 EQUIP_TYPE）。 */
export type EquipType = number;
/** 字体档位下标：0 = 小，1 = 中，2 = 大（顺序见 game-state.ts 的 fontScales）。 */
export type FontScaleId = number;
/** 数字显示方式下标：0 = 自动，1 = 工程计数法，2 = 科学计数法（顺序见 format.ts 的 numberFormats）。 */
export type NumberFormatId = number;

export interface Item {
  name: string;
  type: string;
  category: ItemCategory;
  /** false 表示按件显示：物品栏里一件一张卡片，卡片上不写「×数量」。拾取不受限制，数量照常累加。 */
  stackable: boolean;
  rarity: ItemRarity;
  icon: string;
  description: string;
  /** 装备物品必填：决定它能放进哪一类槽位。 */
  equipType?: EquipType;
  /** 装备属性：attack 攻击 / hp 生命 / defense 防御。装进槽位后计入玩家的对应属性。 */
  equip?: { attack?: number; hp?: number; defense?: number };
  /** 使用行为。需要玩家点选目标的道具，在 instanceId 为 -1 时返回 pick-equipment。 */
  use?: UseHandler;
  /** 这道具要**点选一件装备**才能用（强化 / 清洗类）。界面据此允许把它拖到装备上 ——
      拖放和「右键 → 使用 → 点装备」走的是同一条 useItem 路径，只是换了个更直接的入口。
      必须显式标注：use 是函数，界面没法在渲染时看出它要不要目标（真调一次会有副作用）。 */
  targetsEquipment?: boolean;
  /** 卡片上「使用效果」那一行的文案，纯展示，不参与逻辑。
      它是**拼进 HTML** 的（见 pages/inventory.ts 的 statLine），所以可以内嵌 span 给局部上色 ——
      清洗剂就是靠这个把「进攻 / 生存 / 功能」按类别着色（见 config/items.ts 的 solventText）。 */
  useText?: string;
  /** 纯展示：这道具会给装备附加哪条词条（下标），用来在详情里列出首次 / 重复强化的效果。 */
  grantsAffix?: number;
  /** 强化物的作用范围：只能刻在**这类装备**上（equipType 下标）；缺省不限。
      ⚠️ 判定在 game-state 的 grantAffixTo（唯一入口），被拒时**不消耗道具**；页面只读它来提示范围。 */
  affixEquipType?: number;
  /** true = **不能重复强化**：目标已经有这条词条时直接拒绝（不给「再刻一条提升数值」这条路）。
      缺省 false —— 普通强化物是「重复使用提升数值」的。 */
  affixUnique?: boolean;
  /** 系统物品（钥匙一类，不是行李）的两条特殊待遇：**不占物品栏负载、不能丢弃**。
      ⚠️ 目前没有物品用到它 —— 原来用它的是第二章那两件图纸（已整章移除）。
      重新引入系统物品时，把「发放 / 使用」那条链路（原 config/campaign.ts + src/install.ts）一起补上。 */
  system?: boolean;
  /** 装备特性标签（见 config/traits.ts）：现在是**装备自己的效果**（如【破甲】攻击时无视敌人固定防御），
     不再是「打某个 Boss 的门槛」（requires / immune 已整条移除，2026-09-18）。
     ⚠️ 特性是**物品定义**上的字段、不进存档 —— 同一件装备的所有实例带同样的标签。 */
  traits?: string[];
  /** 可成长饰品：初始 1 阶、上限 maxStage 阶。
      阶把自身属性按系数放大；精炼到【极致】之后还可以「升华」升阶（清空精炼），
      但**不给玩家任何提示**（见 庇护所扩展方案.md §4.13）。 */
  growth?: { maxStage: number };
}

/** 套装加成：凑齐全部部件后额外生效的属性。attackInterval 是「出手间隔减少的秒数」。 */
export interface SetBonus { attack?: number; hp?: number; defense?: number; regen?: number; attackInterval?: number; }

/** itemId 是物品表下标。tier 是**掉落档位**：缺省 = 所有难度都掉，
    `n` = 只在「第 n 档难度」的区域掉（Boss 的三档各自给一件独占，见 Zone.difficulties）。 */
export interface DropEntry { itemId: number; chance: number; min: number; max: number; tier?: number; }
/** art 是战斗卡片与图鉴里用的单字图标。defense 减免玩家造成的伤害（【破甲】可以让它整条不算），缺省按 0 处理。 */
export interface Enemy { art: string; name: string; description: string; maxHp: number; attack: number; defense?: number; attackInterval: number; gold: number; dropTable: DropEntry[]; }
/** 区域解锁规则。**刻意和主线条件（MainlineRequirement）用同一套形状** ——
    这样冒险页的解锁提示、图鉴的「进入条件」、解锁公告三处都能直接复用主线那套条件渲染，
    不用为「地图 / 任意组合」再各写一套显示。规则由 config/unlock.ts 的 unlockBy 生成。
    text() 返回的是**渲染层 HTML**（会内嵌图鉴引用），能直接 setHtml / 塞进 innerHTML；
    它现算、不进存档，所以用 markup 而不是标记。 */
export interface UnlockRule {
  text: (state: GameState) => string;
  done: (state: GameState) => boolean;
  /** 解锁提示（unlock-toast）里那行补语，纯文本；也可以给成函数，等真正解锁时再算。
      **不写这个字段 = 开局就满足**（例如废弃边境），因此不进解锁提示列表 ——
      否则一进游戏会刷一屏「解锁：冒险「废弃边境」」。 */
  notice?: string | (() => string);
}
/** 区域种类：战斗区 / Boss 区 / 庇护所（没有敌人）。
    **缺省由 enemyIds 推导**（空 = 庇护所，见 game-state 的 zoneKind）—— 只有 Boss 区域需要显式写。 */
export type ZoneKind = 'combat' | 'boss' | 'camp';
/** Boss 区域的一档难度：**换一组体态参数**（生命 / 攻击 / 防御 / 间隔各偏一头，不是把同一只怪乘个系数），
    再挂上这一档的特性门槛与掉落档位。数值覆盖敌人表里的同名项 —— 敌人表那一组就是第 0 档（常规）。 */
export interface ZoneDifficulty {
  name: string;
  hp: number; attack: number; defense: number; interval: number;
  /** 这一档的金币奖励；缺省用敌人表里的 gold。 */
  gold?: number;
  /** 这一档能掉的掉落档位：`DropEntry.tier` 与它**严格相等**才判定（想要另一件就去打另一档）。 */
  dropTier: number;
}
/** enemyIds 是敌人表下标。icon 是区域在界面上的图标（区域引用、图鉴里用）。 */
export interface Zone { name: string; icon: string; description: string; enemyIds: number[]; /** 进入条件（可组合规则，见 UnlockRule）。 */ unlock: UnlockRule; /** 这个区域掉落的装备自带的精炼等级，缺省 0。越早的区域给得越高：早期装备靠喂太慢，直接送一档起步。 */ dropRefine?: number; /** 这个区域的「任务物品」物品下标（研究基地的委托要它）。非战斗区域没有，缺省 -1。 */ questItem?: number; /** 区域种类；缺省由 enemyIds 推导（见 ZoneKind）。 */ kind?: ZoneKind; /** **复活计时**（秒）：击杀之后到下一只出现要等多久，缺省用全局的 `SPAWN_COOLDOWN`。⚠️ 它**不**作用于「进入区域 / 换难度」—— 那两种走全局值，否则每次进门都要干等一场复活。 */ spawnCooldown?: number; /** Boss 区域的难度档，**下标即 `adventure.difficulty`**。 */ difficulties?: ZoneDifficulty[]; }
/** 一张勘探图：集齐 tiles 里的碎片 → 拼合成地图 → 派勘探队 → 成功才解锁它指向的区域
    （哪张图解锁哪个区域，写在 config/zones.ts 的 unlockBy.map(...) 里）。 */
export interface MapSet {
  name: string;
  icon: string;
  description: string;
  /** 拼图网格的列数：碎片按 col / row 摆进去，纯 CSS grid 拼图。 */
  cols: number;
  /** 这一套碎片由哪种大事件产出（config/events.ts 的 CAMP_EVENT 取值）。 */
  kind: number;
  /** 碎片物品下标 + 它在拼图里的位置。顺序无关紧要，位置才是拼图的全部信息。 */
  tiles: { itemId: number; col: number; row: number }[];
}
export interface LogEntry { time: string; message: string; type: LogType; }
/** zoneId / enemyId 都是各自表的下标。spawnTimer 是距离下一个敌人出现的剩余秒数，0 表示场上已有敌人。
    attackCount 是累计出手次数，词条赋予的技能按它决定第几次触发。 */
export interface AdventureState { zoneId: number; running: boolean; enemyId: number; enemyHp: number; spawnTimer: number; /** 这一轮刷怪冷却的**总时长**（界面画环形进度用）：进场是全局值，击杀后是区域的复活计时 —— 两者可能不一样，所以单独记。 */ spawnTotal: number; playerHp: number; playerAttackTimer: number; enemyAttackTimer: number; autoPush: boolean; battleCount: number; attackCount: number;
  /** Boss 区域的难度档（下标，见 `Zone.difficulties`）；非 Boss 区域恒 0。
      换档时场上那只**未被击败**的会被作废、等全局刷怪冷却才有下一只（见 selectDifficulty）。 */
  difficulty: number;
  /** 手动模式：玩家侧不再自动出手，改由点技能触发（解锁见 2-4）。 */
  manual: boolean;
  /** 【格挡】的剩余窗口（秒）：> 0 时下一记受到的伤害按格挡值减少，挨完立刻清零（见 BLOCK）。 */
  blockTimer: number;
  /** 手动模式下各技能的剩余冷却（秒），下标即技能槽位；随 tick 递减。 */
  skillTimers: number[]; }
/** 装备词条：id 是词条表下标（config/affixes.ts），value 是当前数值。
    初始值取词条表的 base，上限固定为 base 的两倍；同一件装备上同名词条只会有一条，
    再次使用同款强化物就是给那一条加数值。 */
export interface Affix { id: number; value: number; }
/** 装备实例：同一件装备可以有多个，每一件都是独立个体。
    装备槽里存的是实例 id 而不是物品 id，所以「哪一张卡片被装备」是确定的；
    词条也挂在这里，同名装备的每一件各带各的词条。 */
export interface EquipmentInstance { id: number; itemId: number; affixes?: Affix[]; /** 精炼等级（0~REFINE_MAX）：每级让这件装备的自身属性 +1%。缺省按 0 处理。 */ refine?: number; /** 可成长饰品的阶（1 起，上限见物品的 `growth.maxStage`）。缺省按 1 处理。 */ stage?: number; }
/** equipped[装备类型][槽位下标] = 装备实例 id，-1 表示该槽位为空。 */
export type EquipmentState = number[][];
/** notify：随机事件触发时是否弹窗提醒（超时未响应一律跳过，见 game-state 的 PENDING_EVENT_TIMEOUT）。
    changelogSeen：玩家已经看过的更新日志版本（最新一条的短 hash）。它和当前版本不一致时，
    进入游戏会弹一次更新公告（见 changelog.ts）。存进存档是为了换设备导入后不重复弹。 */
export interface SettingsState { fontScale: FontScaleId; notify: boolean; numberFormat: NumberFormatId; changelogSeen: string; }
/** 后勤小队：assigned[i] 是分配给第 i 个后勤对象的人数 —— 0 号位是**已停用**的营垒修筑（占位），
    之后每个制造项各占一个下标（见 game-state 的 LOGISTICS / fortSlot / logisticsTargets）。
    人手是「派给这一项的人」，不存在工坊共用的池子；总人数不存档，
    由主线进度与胜场换算（getLogisticsTotal），避免两处数据不同步。 */
export interface LogisticsState { assigned: number[]; }
/** 工坊制造项：level 当前等级；target 正在建造的目标等级（-1 表示空闲）；work 已累计工时（人数 × 秒）。 */
export interface WorkshopItemState { level: number; target: number; work: number; }
/** 庇护所：hp 当前生命（脱战时按恢复速度回满）；worksiteProgress 是**已停用**的营垒修筑遗留字段（不再参与任何数值）；
    disasterWins / tideWins 是已通过的天灾、兽潮次数，决定下一场挑战与强度；
    randomTimer 是距离下一次随机事件的剩余秒数；pending* 是已触发、等待响应的事件（kind < 0 表示没有）。 */
export interface CampState { hp: number; worksiteProgress: number; disasterWins: number; tideWins: number; /** 异种通过次数（0 起）：主线「击退第一次异种」看的就是它。同样是**只追加**的存档字段。 */ mutantWins: number; randomTimer: number; pendingKind: number; pendingId: number; pendingExpires: number;
  /** 大事件波次（从 1 起）与本波打到第几场（0 起，对应 game-state 的 CAMP_WAVE_KINDS）。 */
  wave: number; stage: number;
  /** 庇护所人口：事件里救下来的幸存者，每 POP_PER_WORKER 人提供 1 名后勤人手。 */
  population: number;
  /** 每张勘探图的进度，下标即 config/maps.ts 的 mapId：0 未拼齐 / 1 已拼好待勘探 / 2 勘探完成（区域解锁）。 */
  maps: number[];
  /** 正在进行的勘探远征：目标地图下标（-1 表示没有）、结束时间戳（毫秒）、出发时锁定的成功率（0~1）。
      用**时间戳**而不是剩余秒数：关掉页面再回来也照常结算，与 pendingExpires 同一套做法。 */
  expeditionMap: number; expeditionEnds: number; expeditionRate: number; }
/** 正在进行的庇护所战斗。只存在于内存：刷新页面即视为放弃当前这场。 */
export interface CampBattleState { kind: number; id: number; name: string; icon: string; campHp: number; campMaxHp: number; eventHp: number; eventMaxHp: number; eventAttack: number; eventDefense: number; eventInterval: number; rewards: { gold: number; scrap: number; essence: number; survivors: number }; campTimer: number; eventTimer: number; }
/** inventory 只存可堆叠物品（资源、消耗品）的数量，下标是物品表下标；装备不放这里。
    equipment 存所有装备实例，含已经装在槽位上的那些（装备不会离开物品栏）。
    nextInstanceId 单调递增，删掉实例后不复用 id。
    encountered 的下标是敌人表下标，1 表示击杀过（图鉴收录条件）。
    discoveredDrops[enemyId] 是这只怪物已经实际掉落过（玩家拿到手）的物品下标列表，图鉴据此逐条揭示掉落表。 */
export interface GameState { gold: number; scrap: number; essence: number; totalWins: number; mainlineIndex: number; /** 逐物品的「不再拾取」开关（成就「精炼初学者」的奖励）：下标即物品下标，1 = 掉到地上也不捡。 */ noPickup: number[]; /** 后续章节的进度，下标即 game-state 的 storyChapters 下标（0 = 第二章）：与 mainlineIndex 同一套写法，下标在前 = 该节已完成。 */ chapters: number[]; /** 每个战斗区域的累计击杀数，下标即区域下标（主线第二章的「在该区域击杀 N 只」读它）。 */ zoneWins: number[]; workshop: number; equipped: EquipmentState; settings: SettingsState; inventory: number[]; equipment: EquipmentInstance[]; nextInstanceId: number; encountered: number[]; discoveredDrops: number[][]; adventure: AdventureState; logistics: LogisticsState; campWorkshop: WorkshopItemState[]; camp: CampState; achievements: number[]; notices: number[]; /** 已经看过的新手指引 id（见 guide.ts 的 GUIDES）。 */ guides: string[]; log: LogEntry[]; lastTick: number; /** 开发者面板对派生数值的覆盖值，-1 表示不覆盖（正式构建里读取代码会被摇掉）。 */
  devOverrides: number[];
  /** 研究基地：研究点数、当前委托（itemId 为 -1 表示尚未发布）、各研究项等级。 */
  researchPoints: number; /** 当前委托已经刷新过几次：刷新费用按它递增，交委托后归零。 */ researchRefreshCount: number; researchTask: ResearchTaskState; researchLevels: number[]; /** 自动进食：研究项「自动进食」解锁后生效。 */ autoEat: AutoEatState; /** 曾经精炼到 100 级（【极致】）的物品下标。喂掉那件之后依然保留 —— 这是「达成过」的记录，不是持有状态。 */ perfectItems: number[];
  /** 每只怪的击败总数，下标即敌人表下标（`unlockBy.boss()` 与图鉴读它）。 */
  enemyWins: number[];
  /** 每只 Boss **已通关的难度**：下标即敌人表下标、值是位掩码（第 n 位 = 第 n 档已通关）。
      条件「击败常规难度一次」要按档判，所以不能只看总击败数。 */
  bossClears: number[];
  /** 各技能槽位的等级，下标即 config/skills.ts 的下标（【普通攻击】初始 1 级）。 */
  skills: number[];
  /** 军事训练：每个技能槽一项（下标 = `config/skills.ts` 的下标，等级记在 `skills`）。 */
  drills: DrillState[]; }
/* ——— 道具的使用行为 ———
   use 是函数而不是数据：不同道具要做的事差别太大（回血、加词条、按品阶移除词条…），
   而且以后还要加更多「点击使用后选目标」的道具。配置表里的 use 只通过 UseContext 操作状态，
   所以 config 不需要反向依赖 game-state。 */
export interface UseContext {
  /** 道具自身的物品下标。 */
  itemId: number;
  /** 玩家点选的目标装备实例；-1 表示还没有目标。 */
  instanceId: number;
  /** 玩家在词条选择窗口里选中的词条下标；没经过选择时为 -1。 */
  affixIndex: number;
  /** 消耗 1 个道具并写盘、刷新界面。 */
  consume(): void;
  /** 记一条日志。 */
  log(message: string, type?: LogType): void;
  /** 按最大生命上限回复生命值。 */
  heal(amount: number): void;
  /** 目标装备当前的词条列表。 */
  affixes(): Affix[];
  /** 给目标装备加一条词条；已经有同名词条则改为提升它的数值。
      数值已经顶到上限、什么都没做时返回 false（调用方据此决定要不要消耗道具）。 */
  grantAffix(affixId: number): boolean;
  /** 移除目标装备的第 index 条词条。 */
  removeAffix(index: number): void;
}
/** 使用道具后界面要做的事。 */
export type UseOutcome =
  | { kind: 'done' }                                                          // 已生效（或没有可做的），流程结束
  | { kind: 'pick-equipment' }                                                // 需要玩家点选一件装备
  | { kind: 'pick-affix'; instanceId: number; affixIndices: number[] }        // 有多条可移除的词条，需要玩家选一条
  /* 第二章移除后没有「开安装浮层」这种结果了（原来是剧情任务的图纸用的）。
     要重新加系统物品时：这里补一个分支 + 把 src/install.ts 那条链路一起补回来。 */
/** 使用道具的行为。带 heal 标记的是「食物」—— 自动进食据此筛选，不用另维护一份 id 清单。 */
export type UseHandler = ((context: UseContext) => UseOutcome) & { heal?: number };
/** 自动进食：研究项「自动进食」解锁后生效。itemId 为 -1 表示还没指定食物。 */
export interface AutoEatState {
  itemId: number;
  /** 触发阈值（百分比）：生命值低于上限的这个比例时自动吃一份。 */
  threshold: number;
}
/** 主线节点的具体达成条件：text 是给玩家看的进度文案（如「收集旧电池 2/3 个」），done 决定状态点是否点亮。
    text 返回的字符串会当作 HTML 渲染（页面用 setHtml 输出），所以物品 / 怪物 / 区域名一律用
    itemRefMarkup / enemyRefMarkup / zoneRefMarkup 生成，不要直接拼名字字符串——
    否则界面上不会带 icon 与类型色，也点不开图鉴。
    这份文案不进存档（每次由 text() 现算），所以直接用 markup；日志那种要进存档的文本才用 xxxTag 标记。 */
export interface MainlineRequirement { text: (state: GameState) => string; done: (state: GameState) => boolean; }
/** 研究基地发布的收集委托：要交 zoneId 这个区域的**任务物品**（itemId）need 个。
    任务物品只在**当前委托正指向该区域**时由这里的怪物统一 10% 掉落（攒够了也照掉），
    所以委托的诉求是「去那个区域刷」而不是「挑某只怪刷」。
    itemId 为 -1 表示还没有委托。 */
export interface ResearchTaskState { itemId: number; /** 目标区域：任务物品由这个区域的怪物掉落。 */ zoneId: number; need: number; }
/** condition 由 requirements 推导（全部 done），两处条件不会写歪。 */
export interface MainlineQuest { title: string; description: string; condition: (state: GameState) => boolean; reward: string; requirements: MainlineRequirement[]; }
/** 工坊的一个制造项（表在 game-state 的 `workshopItems`）。下标即 `campWorkshop` 的下标，**只能末尾追加**。
    每级加成按 `per*` 逐项给：缺省 = 这一项不给那种加成（不要为了填满形状写 0 —— 工坊卡片会把它们列出来）。 */
export interface WorkshopItem {
  name: string; icon: string; desc: string; unlock: UnlockRule;
  /** 每级提高的庇护所生命 / 防御 / 攻击。 */
  perHp?: number; perDefense?: number; perAttack?: number;
  /** 每级提高的庇护所生命回复（点/秒）。 */
  perRegen?: number;
  /** 造价与工时：第 n 级 = base + step × (n - 1)。 */
  baseWork: number; workStep: number; baseGold: number; goldStep: number; baseScrap: number; scrapStep: number; basePlate: number; plateStep: number;
}
/** 成就：约定俗成的三段式——解锁条件（hint）+ 解锁后（reward）。
    secret 为 true 的成就，未解锁时条件一栏只显示「秘密成就，继续探索吧！」，奖励也留白。
    condition 一旦为真就自动解锁并记一条日志（见 game-state 的 checkAchievements）。 */
export interface Achievement {
  id: string; name: string; icon: string; hint: string; reward: string; secret?: boolean; condition: (state: GameState) => boolean;
  /** 奖励若解锁了别的系统（例如「初次冒险」解锁图鉴），在这里声明：解锁成就会额外弹一条该系统的提示。
      category 是它所在的页面 / 板块，用于提示文案里的「解锁：系统「图鉴」」。 */
  rewardUnlock?: { id: string; icon: string; category: string; name: string };
}
/** 更新公告的类型标签。文字与颜色由 changelog.ts 的 KIND_INFO 映射，不要在这里写中文。 */
export type ChangelogKind = 'feat' | 'balance' | 'fix' | 'perf' | 'misc';

/** 一条更新公告。**文案是写给玩家看的**，维护在 config/changelog.ts ——
    不是 git 提交信息的搬运：提交信息里有函数名与内部字段，那些不该出现在公告里。 */
export interface ChangelogNote {
  /** 这条更新的标记，玩家存档里记的就是它（settings.changelogSeen）。
      改文案不必动它，只有**新增一条**时才写一个新的。约定 `日期-序号`，如 '2026-09-14-3'。 */
  id: string;
  /** 更新日期，`YYYY-MM-DD`。 */
  date: string;
  kind: ChangelogKind;
  /** 一句话概括这次更新。 */
  title: string;
  /** 具体改动，一条一句，讲「玩家能感觉到什么变了」。 */
  details: string[];
}

/** locked 返回 true 时，导航栏里的入口会置灰、显示为「❓未解锁」且不可点击（见 main.ts 的 updateNavLocks）。
    没有声明 locked 的页面视为始终可用。 */
export interface PageDefinition<Context = any> { id: string; template: string; mount(root: HTMLElement): Context; update(state: GameState, context: Context): void; locked?(state: GameState): boolean; }

/** 帮助浮层里的一节：一个小标题 + 若干条「这一块怎么用」。 */
export interface HelpSection { title: string; lines: string[]; }
/** 一个页面的帮助。**「怎么用」只写在这里**，页面标题下那句 `<p>` 只负责氛围（见 UI开发规范 §7.18）——
    帮助文案维护在 config/help.ts，键是页面的 id（同时也是标题右侧【帮助】按钮上的 data-help 值）。 */
export interface HelpPage { name: string; sections: HelpSection[]; }

/** 军事训练的一项：`target` 是正在练的目标等级（-1 表示空闲），`work` 是已投入工时（人数 × 秒）。
    ⚠️ 与工坊制造项（`WorkshopItemState`）是**同一套形状**：两者都是「派人 → 攒工时 → 升级」，
    所以可以同时练几项（每个技能各占一个后勤位，见 game-state 的 drillSlot）。 */
export interface DrillState { target: number; work: number; }

/** 一个技能槽位的静态定义（表在 `config/skills.ts`，**下标即槽位**）。
    ⚠️ `state.skills` 与 `adventure.skillTimers` 都按下标存，所以槽位顺序不能动。 */
export interface Skill {
  id: string;
  /** 占位槽：名称与效果都还没定（界面显示锁定 + `???`，也不能被军事训练选到）。 */
  placeholder?: boolean;
  name: string;
  icon: string;
  /** 类别下标（`SKILL_CATEGORY`）：0 攻击 / 1 防御 / 2 辅助 —— 就是战斗控制区的三排。 */
  category: number;
  /** 冷却秒数；`fromAttackInterval` 为 true 时跟随玩家的出手间隔（普通攻击就是它）。 */
  cooldown: number;
  fromAttackInterval?: boolean;
  /** ⚠️ **没有等级上限**：技能可以一直练下去（坡度靠军事训练的成本与总工时，见 config/skills.ts）。 */
  unlock: UnlockRule;
  /** 当前等级的**紧凑数值**（军事训练卡片右上那一格，同工坊的「生命 +120」）。 */
  summary: (level: number) => string;
  /** 当前等级的效果说明（军事训练卡片的悬停浮层用它，现算、不进存档）。 */
  effect: (level: number) => string;
}

/* ——— 剧情任务（第二类「远征档案」章节）已整章移除 ———
   原来这里放 QuestCost / QuestInstall / CampaignQuest 三个类型，配套的是
   config/campaign.ts（任务表）、src/install.ts（安装浮层）、items.ts 的两件系统物品，
   以及 game-state 里的 getQuestState / canInstallQuest / installQuest / checkQuests。
   要重新做这条线时，按同样的形状补回来即可（跨域接缝的位置见 UI开发规范 §7.19）。 */
