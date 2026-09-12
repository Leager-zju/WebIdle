export type ItemCategory = 'resource' | 'equipment' | 'consumable';
/** 稀有度下标：0 普通 / 1 精良 / 2 稀有 / 3 史诗（顺序见 config/items.ts 的 RARITY_DEFS）。 */
export type ItemRarity = number;
export type LogType = 'battle' | 'drop' | 'progress' | 'system' | 'defeat';

/* 下面这些"名字"类型只用于静态表内部和 UI 展示；运行时状态里保存的是数字下标。
   静态表的下标就是实体 id（见 config/items.ts、config/zones.ts），所以 Item / Enemy / Zone
   本身不再带 id 字段。 */

/** 装备类型下标：0 武器 / 1 头部 / 2 躯干 / 3 腿部 / 4 饰品（顺序见 config/items.ts 的 EQUIP_TYPE）。 */
export type EquipType = number;
/** 字体档位下标：0 = 小，1 = 中，2 = 大（顺序见 game-state.ts 的 fontScales）。 */
export type FontScaleId = number;

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
  /** 卡片上「使用效果」那一行的文案，纯展示，不参与逻辑。 */
  useText?: string;
  /** 纯展示：这道具会给装备附加哪条词条（下标），用来在详情里列出首次 / 重复强化的效果。 */
  grantsAffix?: number;
}

/** itemId 是物品表下标。 */
export interface DropEntry { itemId: number; chance: number; min: number; max: number; }
/** art 是战斗卡片与图鉴里用的单字图标。defense 减免玩家造成的伤害，缺省按 0 处理。 */
export interface Enemy { art: string; name: string; description: string; maxHp: number; attack: number; defense?: number; attackInterval: number; gold: number; dropTable: DropEntry[]; }
/** enemyIds 是敌人表下标。 */
export interface Zone { name: string; description: string; enemyIds: number[]; }
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
export interface EquipmentInstance { id: number; itemId: number; affixes?: Affix[]; }
/** equipped[装备类型][槽位下标] = 装备实例 id，-1 表示该槽位为空。 */
export type EquipmentState = number[][];
export interface SettingsState { fontScale: FontScaleId; }
/** inventory 只存可堆叠物品（资源、消耗品）的数量，下标是物品表下标；装备不放这里。
    equipment 存所有装备实例，含已经装在槽位上的那些（装备不会离开物品栏）。
    nextInstanceId 单调递增，删掉实例后不复用 id。
    encountered 的下标是敌人表下标，1 表示击杀过（图鉴收录条件）。
    discoveredDrops[enemyId] 是这只怪物已经实际掉落过（玩家拿到手）的物品下标列表，图鉴据此逐条揭示掉落表。 */
export interface GameState { gold: number; scrap: number; essence: number; totalWins: number; mainlineIndex: number; workshop: number; research: number; companions: number; equipped: EquipmentState; settings: SettingsState; inventory: number[]; equipment: EquipmentInstance[]; nextInstanceId: number; encountered: number[]; discoveredDrops: number[][]; adventure: AdventureState; log: LogEntry[]; lastTick: number; }
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
  | { kind: 'pick-affix'; instanceId: number; affixIndices: number[] };       // 有多条可移除的词条，需要玩家选一条
export type UseHandler = (context: UseContext) => UseOutcome;
export interface MainlineQuest { title: string; description: string; condition: (state: GameState) => boolean; reward: string; }
export interface PageDefinition<Context = any> { id: string; template: string; mount(root: HTMLElement): Context; update(state: GameState, context: Context): void; }
