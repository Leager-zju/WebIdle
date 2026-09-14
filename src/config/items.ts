import { RARITY, rarities } from './rarity';
import { AFFIX, grantAffixHandler, removeAffixHandler } from './affixes';
import type { Item, ItemCategory, UseHandler } from '../types';

export { rarities, RARITY };

export const itemCategories: Record<ItemCategory, { id: ItemCategory; name: string; order: number }> = {
  resource: { id: 'resource', name: '资源', order: 1 },
  equipment: { id: 'equipment', name: '装备', order: 2 },
  consumable: { id: 'consumable', name: '消耗品', order: 3 }
};
export const categoryOrder: ItemCategory[] = Object.values(itemCategories).sort((a, b) => a.order - b.order).map(category => category.id);

/* 装备类型：键顺序就是 equipType（0,1,2…），state.equipped 按这个顺序排列。
   baseSlots 是该类型的基础槽位数。
   新增装备类型时在这里追加，UI 与槽位数组会自动跟着扩展。 */
const EQUIP_TYPE_DEFS = {
  weapon: { name: '武器', baseSlots: 1 },
  head: { name: '头部', baseSlots: 1 },
  torso: { name: '躯干', baseSlots: 1 },
  legs: { name: '腿部', baseSlots: 1 },
  accessory: { name: '饰品', baseSlots: 2 }
} satisfies Record<string, { name: string; baseSlots: number }>;

export const equipTypes = Object.values(EQUIP_TYPE_DEFS);
/** 名字 → 下标，用法同 ITEM。 */
export const EQUIP_TYPE = Object.fromEntries(Object.keys(EQUIP_TYPE_DEFS).map((name, id) => [name, id])) as { [K in keyof typeof EQUIP_TYPE_DEFS]: number };

/* 回血类道具（食物）的使用行为。回血量同时挂在函数上：自动进食靠这个标记识别「哪些是食物」。
   其余道具的 use 见 config/affixes.ts。 */
const healHandler = (amount: number): UseHandler => {
  const handler: UseHandler = context => { context.heal(amount); context.consume(); return { kind: 'done' }; };
  handler.heal = amount;
  return handler;
};

/* 物品表：对象字面量的键顺序就是 itemId（0,1,2…），运行时状态只保存这个下标。
   新增物品在末尾追加即可 —— ITEM 常量表会自动多出对应的键，下标永远与表一致，不需要手工维护。
   use 是函数：需要点选目标的道具在 instanceId 为 -1 时返回 pick-equipment，界面据此进入点选模式。
   useText 只用于卡片展示。 */
const ITEM_DEFS = {
  scrap: { name: '废旧零件', type: '材料', category: 'resource', stackable: true, rarity: RARITY.common, icon: '◆', description: '从废弃机械上拆下的通用零件。' },
  oldBattery: { name: '旧电池', type: '材料', category: 'resource', stackable: true, rarity: RARITY.uncommon, icon: '▣', description: '仍然残留微弱电量的旧时代电池。' },
  armorPlate: { name: '装甲板', type: '材料', category: 'resource', stackable: true, rarity: RARITY.rare, icon: '◇', description: '重型单位身上的耐热装甲片。' },
  emberShard: { name: '余烬碎片', type: '材料', category: 'resource', stackable: true, rarity: RARITY.epic, icon: '✦', description: '污染核心凝结出的异常晶体。' },
  scavengedBlade: { name: '拾荒者短刃', type: '武器', category: 'equipment', stackable: false, equipType: EQUIP_TYPE.weapon, rarity: RARITY.rare, icon: '†', description: '从锈蚀单位手里夺来的短刃，刃口还留着干涸的油污。', equip: { attack: 6 } },
  fieldRation: { name: '应急口粮', type: '补给', category: 'consumable', stackable: true, rarity: RARITY.uncommon, icon: '◈', description: '压缩口粮与消毒水的组合，能让远征队立刻恢复状态。', use: healHandler(60), useText: '恢复 60 生命' },
  whetOil: { name: '锐化油', type: '强化', category: 'consumable', stackable: true, rarity: RARITY.common, icon: '⚗', description: '一罐发苦的磨料。使用后点选一件装备，为它刻上「锋锐」。', use: grantAffixHandler(AFFIX.keenEdge), useText: '附加词条「锋锐」', grantsAffix: AFFIX.keenEdge },
  lifeSeed: { name: '生命之种', type: '强化', category: 'consumable', stackable: true, rarity: RARITY.common, icon: '❖', description: '还在缓慢搏动的种荚。使用后点选一件装备，为它刻上「坚韧」。', use: grantAffixHandler(AFFIX.vitality), useText: '附加词条「坚韧」', grantsAffix: AFFIX.vitality },
  platingGoo: { name: '铁壁涂层', type: '强化', category: 'consumable', stackable: true, rarity: RARITY.uncommon, icon: '▩', description: '冷却后会变硬的重浆。使用后点选一件装备，为它刻上「铁壁」。', use: grantAffixHandler(AFFIX.bulwark), useText: '附加词条「铁壁」', grantsAffix: AFFIX.bulwark },
  emberCore: { name: '余烬核心', type: '强化', category: 'consumable', stackable: true, rarity: RARITY.rare, icon: '◉', description: '仍在燃烧的核心。使用后点选一件装备，赋予它「余烬爆裂」——装到槽位上就会在战斗中触发。', use: grantAffixHandler(AFFIX.emberBurst), useText: '附加词条「余烬爆裂」', grantsAffix: AFFIX.emberBurst },
  commonSolvent: { name: '粗洗溶剂', type: '清洗', category: 'consumable', stackable: true, rarity: RARITY.common, icon: '◦', description: '廉价溶剂，只能洗掉最浅的那层刻痕。使用后点选一件装备，移除一条普通词条。', use: removeAffixHandler(RARITY.common), useText: '移除一条普通词条' },
  fineSolvent: { name: '精洗溶剂', type: '清洗', category: 'consumable', stackable: true, rarity: RARITY.uncommon, icon: '◦', description: '配比讲究的溶剂，能洗掉更深的刻痕。使用后点选一件装备，移除一条精良词条。', use: removeAffixHandler(RARITY.uncommon), useText: '移除一条精良词条' },
  deepSolvent: { name: '深度洗练剂', type: '清洗', category: 'consumable', stackable: true, rarity: RARITY.rare, icon: '◦', description: '能蚀穿余烬核心留下的痕迹。使用后点选一件装备，移除一条稀有词条。', use: removeAffixHandler(RARITY.rare), useText: '移除一条稀有词条' },

  /* ——— 拾荒者套装（废弃边境掉落，见 config/sets.ts）———
     风格：拼凑的废铁，单件平庸、整套耐打。 */
  rustHammer: { name: '锈钉锤', type: '武器', category: 'equipment', stackable: false, equipType: EQUIP_TYPE.weapon, rarity: RARITY.rare, icon: '⚒', description: '把废铁钉在木柄上做成的锤子。谈不上锋利，砸下去倒是很实在。', equip: { attack: 5 } },
  weldingMask: { name: '焊接面罩', type: '头部', category: 'equipment', stackable: false, equipType: EQUIP_TYPE.head, rarity: RARITY.rare, icon: '⛑', description: '镜片上有几道焊渣烫出的白痕，挡火花比挡子弹在行。', equip: { defense: 2 } },
  patchedVest: { name: '补丁护胸', type: '躯干', category: 'equipment', stackable: false, equipType: EQUIP_TYPE.torso, rarity: RARITY.rare, icon: '▤', description: '十几层不同来源的金属片缝在一起，重量惊人，胜在结实。', equip: { hp: 25 } },
  reinforcedGreaves: { name: '加固绑腿', type: '腿部', category: 'equipment', stackable: false, equipType: EQUIP_TYPE.legs, rarity: RARITY.rare, icon: '▥', description: '用捆扎带和螺栓固定住的护胫，走起路来哐当作响。', equip: { defense: 1, hp: 10 } },
  nutCharm: { name: '螺母护符', type: '饰品', category: 'equipment', stackable: false, equipType: EQUIP_TYPE.accessory, rarity: RARITY.rare, icon: '⚙', description: '一串大小不一的螺母。据说能挡住厄运——至少能挡住第一下。', equip: { hp: 15 } },

  /* ——— 余烬套装（余烬矿脉掉落）———
     风格：结晶化带来的高热，换来更快的出手。 */
  slagLance: { name: '熔渣长矛', type: '武器', category: 'equipment', stackable: false, equipType: EQUIP_TYPE.weapon, rarity: RARITY.epic, icon: '⚔', description: '矛尖凝着一层永远凉不透的熔渣，刺进去之后还在烧。', equip: { attack: 9 } },
  emberHood: { name: '余烬兜帽', type: '头部', category: 'equipment', stackable: false, equipType: EQUIP_TYPE.head, rarity: RARITY.epic, icon: '⌂', description: '内衬掺了结晶粉末，贴着皮肤时微微发烫，视线却比平时更清。', equip: { attack: 3 } },
  scorchedPlate: { name: '灼热胸甲', type: '躯干', category: 'equipment', stackable: false, equipType: EQUIP_TYPE.torso, rarity: RARITY.epic, icon: '▦', description: '被矿脉热量反复淬过的胸甲，表面的焦痕就是它自己的纹路。', equip: { hp: 20, defense: 2 } },
  cinderGreaves: { name: '焦痕胫甲', type: '腿部', category: 'equipment', stackable: false, equipType: EQUIP_TYPE.legs, rarity: RARITY.epic, icon: '▧', description: '踩着还在冒烟的矿道走出来的胫甲，鞋底已经磨得发亮。', equip: { hp: 15 } },
  crystalPendant: { name: '结晶吊坠', type: '饰品', category: 'equipment', stackable: false, equipType: EQUIP_TYPE.accessory, rarity: RARITY.epic, icon: '◈', description: '一枚仍在生长的结晶，凑近能听见细碎的嗡鸣。', equip: { attack: 4 } },

  /* ——— 核心套装（核心深井掉落）———
     风格：与核心信号同频，全面强化。 */
  signalCutter: { name: '信号切割者', type: '武器', category: 'equipment', stackable: false, equipType: EQUIP_TYPE.weapon, rarity: RARITY.epic, icon: '⚡', description: '刀刃上跑着一段没被解析完的核心信号，挥动时会留下一道亮痕。', equip: { attack: 14 } },
  coreVisor: { name: '核心目镜', type: '头部', category: 'equipment', stackable: false, equipType: EQUIP_TYPE.head, rarity: RARITY.epic, icon: '◎', description: '透过它看见的一切都慢了下来——包括敌人的下一次出手。', equip: { attack: 5, hp: 15 } },
  abyssArmor: { name: '深渊装甲', type: '躯干', category: 'equipment', stackable: false, equipType: EQUIP_TYPE.torso, rarity: RARITY.epic, icon: '▨', description: '井底重载单位身上的同款装甲，穿久了会觉得自己也变重了。', equip: { hp: 45, defense: 3 } },
  regulatorLegs: { name: '稳压腿甲', type: '腿部', category: 'equipment', stackable: false, equipType: EQUIP_TYPE.legs, rarity: RARITY.epic, icon: '▩', description: '把核心的震荡滤成稳定的节奏，站得比谁都稳。', equip: { hp: 30, defense: 2 } },
  pulsingCore: { name: '搏动核心', type: '饰品', category: 'equipment', stackable: false, equipType: EQUIP_TYPE.accessory, rarity: RARITY.epic, icon: '❂', description: '一小块仍在搏动的核心碎片，戴久了心跳会和它同步。', equip: { attack: 6, hp: 20 } }
} satisfies Record<string, Item>;

export const items: Item[] = Object.values(ITEM_DEFS);
/** 名字 → 下标。代码里用 ITEM.scrap 这类写法指代 id，既避免魔法数字，也不影响存档体积。 */
export const ITEM = Object.fromEntries(Object.keys(ITEM_DEFS).map((name, id) => [name, id])) as { [K in keyof typeof ITEM_DEFS]: number };
