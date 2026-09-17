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
  /** 系统物品（剧情任务的奖励：图纸一类）。它是**钥匙**不是行李，所以三条特殊待遇：
      不占物品栏负载、不能丢弃、只能由剧情任务发放（不进任何 dropTable）。
      用掉它（右键 → 使用 → 安装浮层）之后才会解锁它对应的工坊项 / 研究项 —— 见 config/campaign.ts。 */
  system?: boolean;
}

/** 套装加成：凑齐全部部件后额外生效的属性。attackInterval 是「出手间隔减少的秒数」。 */
export interface SetBonus { attack?: number; hp?: number; defense?: number; regen?: number; attackInterval?: number; }

/** itemId 是物品表下标。 */
export interface DropEntry { itemId: number; chance: number; min: number; max: number; }
/** art 是战斗卡片与图鉴里用的单字图标。defense 减免玩家造成的伤害，缺省按 0 处理。 */
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
/** enemyIds 是敌人表下标。icon 是区域在界面上的图标（区域引用、图鉴里用）。 */
export interface Zone { name: string; icon: string; description: string; enemyIds: number[]; /** 进入条件（可组合规则，见 UnlockRule）。 */ unlock: UnlockRule; /** 这个区域掉落的装备自带的精炼等级，缺省 0。越早的区域给得越高：早期装备靠喂太慢，直接送一档起步。 */ dropRefine?: number; /** 这个区域的「任务物品」物品下标（研究基地的委托要它）。非战斗区域没有，缺省 -1。 */ questItem?: number; }
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
export interface AdventureState { zoneId: number; running: boolean; enemyId: number; enemyHp: number; spawnTimer: number; playerHp: number; playerAttackTimer: number; enemyAttackTimer: number; autoPush: boolean; battleCount: number; attackCount: number; }
/** 装备词条：id 是词条表下标（config/affixes.ts），value 是当前数值。
    初始值取词条表的 base，上限固定为 base 的两倍；同一件装备上同名词条只会有一条，
    再次使用同款强化物就是给那一条加数值。 */
export interface Affix { id: number; value: number; }
/** 装备实例：同一件装备可以有多个，每一件都是独立个体。
    装备槽里存的是实例 id 而不是物品 id，所以「哪一张卡片被装备」是确定的；
    词条也挂在这里，同名装备的每一件各带各的词条。 */
export interface EquipmentInstance { id: number; itemId: number; affixes?: Affix[]; /** 精炼等级（0~REFINE_MAX）：每级让这件装备的自身属性 +1%。缺省按 0 处理。 */ refine?: number; }
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
export interface CampState { hp: number; worksiteProgress: number; disasterWins: number; tideWins: number; randomTimer: number; pendingKind: number; pendingId: number; pendingExpires: number;
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
export interface GameState { gold: number; scrap: number; essence: number; totalWins: number; mainlineIndex: number; workshop: number; equipped: EquipmentState; settings: SettingsState; inventory: number[]; equipment: EquipmentInstance[]; nextInstanceId: number; encountered: number[]; discoveredDrops: number[][]; adventure: AdventureState; logistics: LogisticsState; campWorkshop: WorkshopItemState[]; camp: CampState; achievements: number[]; notices: number[]; /** 剧情任务进度，下标即 config/campaign.ts 的下标（取值见那里的 QUEST_STATE）。 */ quests: number[]; /** 已经看过的新手指引 id（见 guide.ts 的 GUIDES）。 */ guides: string[]; log: LogEntry[]; lastTick: number; /** 开发者面板对派生数值的覆盖值，-1 表示不覆盖（正式构建里读取代码会被摇掉）。 */
  devOverrides: number[];
  /** 研究基地：研究点数、当前委托（itemId 为 -1 表示尚未发布）、各研究项等级。 */
  researchPoints: number; /** 当前委托已经刷新过几次：刷新费用按它递增，交委托后归零。 */ researchRefreshCount: number; researchTask: ResearchTaskState; researchLevels: number[]; /** 自动进食：研究项「自动进食」解锁后生效。 */ autoEat: AutoEatState; /** 曾经精炼到 100 级（【极致】）的物品下标。喂掉那件之后依然保留 —— 这是「达成过」的记录，不是持有状态。 */ perfectItems: number[]; }
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
  /** 系统物品（剧情任务的图纸）：界面开「安装」浮层，代价与谜题都在浮层里处理。
      **use 本身不消耗** —— 真正的消耗与解锁发生在 installQuest()（见 src/install.ts）。 */
  | { kind: 'open-install' };
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

/* ——— 剧情任务（config/campaign.ts）———
   一条任务 = 一件系统物品：条件达成 → 自动把物品发进物品栏 → 玩家在物品栏里**使用**它，
   走完那种安装形态之后，它指向的工坊项 / 研究项才解锁（见 UI开发规范 §7.19）。 */
/** 安装代价：三种资源都是可选的，缺省 0。 */
export interface QuestCost { gold?: number; scrap?: number; plate?: number; }
/** 安装形态 —— **一件物品一种形态**，这是"可插拔"的接缝：
    新增一种玩法（信号输入、多步确认…）= 这里加一个联合分支 + src/install.ts 加一个渲染分支 + 样式一个块，
    game-state 的 installQuest() 与剧情任务表都不用动。
    公平性护栏（写死在规范里）：线索与答案都要能从**浮层里给出的信息**推出来，
    不依赖游戏外的知识、记忆或跨页查找；答错无惩罚，可以无限重试。 */
export type QuestInstall =
  | { mode: 'pay'; cost: QuestCost }                                                                          // 单纯支付资源
  /** 解读线索：从 hint 与选项里推出答案。cost 可选 —— 要"答对 + 付资源"的双重形态时直接写在这里。 */
  | { mode: 'choice'; hint: string; options: { id: number; label: string }[]; answer: number; cost?: QuestCost };
export interface CampaignQuest {
  /** 奖励物品（config/items.ts 里 category: 'consumable' + system: true 的那件）。 */
  itemId: number;
  /** 任务名（和物品名保持一致，两处写的是同一件事）。 */
  name: string;
  icon: string;
  /** 右上的小标签，如 'QUEST 01'。 */
  kicker: string;
  /** 达成条件：和区域解锁同一套规则（跑 config/unlock.ts 的 unlockBy。**条件原文只写在这里**）。 */
  requirement: UnlockRule;
  install: QuestInstall;
  /** 世界观描述，显示在档案与安装浮层里。 */
  desc: string;
}
/* ⚠️ 「这条任务解锁了哪一项」**不写在这里**，而是写在被解锁的那一项上（`workshopItems[].quest` /
   `researchItems[].quest`）。理由：条目表住在 game-state，campaign 表不能反向依赖它（会成环）；
   反查由 game-state 的 questTarget() 提供，档案页 / 图鉴 / 物品详情共用那一处。 */
