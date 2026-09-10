// 物品分类表。新增分类只需要在这里加一条：物品栏会自动分组，
// 右键菜单也可以在 CATEGORY_ACTIONS 里为它注册额外操作。
export const itemCategories = {
  resource: { id: 'resource', name: '资源', order: 1 },
  equipment: { id: 'equipment', name: '装备', order: 2 },
  consumable: { id: 'consumable', name: '消耗品', order: 3 }
};

export const categoryOrder = Object.values(itemCategories)
  .sort((a, b) => a.order - b.order)
  .map(category => category.id);

export const items = {
  scrap: { id: 'scrap', name: '废旧零件', type: '材料', category: 'resource', rarity: 'common', icon: '◆', description: '从废弃机械上拆下的通用零件。' },
  oldBattery: { id: 'oldBattery', name: '旧电池', type: '材料', category: 'resource', rarity: 'uncommon', icon: '▣', description: '仍然残留微弱电量的旧时代电池。' },
  armorPlate: { id: 'armorPlate', name: '装甲板', type: '材料', category: 'resource', rarity: 'rare', icon: '◇', description: '重型单位身上的耐热装甲片。' },
  emberShard: { id: 'emberShard', name: '余烬碎片', type: '材料', category: 'resource', rarity: 'epic', icon: '✦', description: '污染核心凝结出的异常晶体。' },
  scavengedBlade: { id: 'scavengedBlade', name: '拾荒者短刃', type: '武器', category: 'equipment', slot: 'weapon', rarity: 'rare', icon: '†', description: '从锈蚀单位手里夺来的短刃，刃口还留着干涸的油污。', equip: { attack: 6 } },
  fieldRation: { id: 'fieldRation', name: '应急口粮', type: '补给', category: 'consumable', rarity: 'uncommon', icon: '◈', description: '压缩口粮与消毒水的组合，能让远征队立刻恢复状态。', use: { heal: 60 } }
};

export const itemOrder = ['scrap', 'oldBattery', 'armorPlate', 'emberShard', 'scavengedBlade', 'fieldRation'];
