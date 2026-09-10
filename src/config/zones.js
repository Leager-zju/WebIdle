export const zones = [
  {
    id: 'waste-border',
    name: '废弃边境',
    description: '营火以北，失去联络的旧哨站。这里仍有两类掠食者在废墟中徘徊。',
    enemies: [
      {
        id: 'scavenger',
        name: '锈蚀拾荒者',
        description: '动作敏捷但装甲脆弱的机械单位。',
        maxHp: 86,
        attack: 9,
        attackInterval: 2.8,
        gold: 13,
        exp: 18,
        dropTable: [
          { itemId: 'scrap', chance: 1, min: 2, max: 5 },
          { itemId: 'oldBattery', chance: .34, min: 1, max: 1 }
        ]
      },
      {
        id: 'brute',
        name: '重装拾荒者',
        description: '缓慢但危险的重型单位，携带更多装甲材料。',
        maxHp: 142,
        attack: 16,
        attackInterval: 3.7,
        gold: 25,
        exp: 30,
        dropTable: [
          { itemId: 'scrap', chance: 1, min: 4, max: 8 },
          { itemId: 'armorPlate', chance: .3, min: 1, max: 1 },
          { itemId: 'emberShard', chance: .1, min: 1, max: 1 }
        ]
      }
    ]
  }
];
