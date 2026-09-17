/* 稀有度表：对象字面量的键顺序就是 rarity id（0,1,2…），新增稀有度在末尾追加即可。
   下标即 id；name 是界面上的显示名，className 是 CSS 类名后缀（对应 style.css 里的 .rarity-*）。

   参考泰拉瑞亚的设计：稀有度**只影响物品名的显示颜色**，粗略体现「价值与获取难度」，
   不参与任何数值计算（掉率在 dropTable 里写死、装备数值在 equip 里写死）。
   分配规则因此可以很简单：**越后期能拿到的物品，档位越高**。

   色板一次备足 17 档，后续每加一个区域往上取一档，不用再回来改这里。
   目前已用到 0 / 1 / 2 / 3 / 14 / 15 / 16 七档 —— 四个战斗区域各一档，加上三档「特殊渠道」：

     灰色（0）  废弃边境
     白色（1）  余烬矿脉
     蓝色（2）  核心深井
     绿色（3）  熔火裂谷
     火红色（14）特殊渠道物品（清洗剂、地图碎片 —— 不走 dropTable 的那两条通道）
     琥珀色（15）任务物品（跨区域，所以单独占最高一档，不和区域抢位置）
     靛蓝色（16）系统物品（钥匙一类 —— 排在任务物品之后，和区域、和上面两条渠道都不抢位置）

   中间 4~13 档是留给后续区域的空位，现在没有物品使用，颜色已经在 style.css 里备好。

   单独成一个模块，是为了让 config/items.ts 和 config/affixes.ts 都能用它而不互相引用。 */
const RARITY_DEFS = {
  gray: { name: '灰色' },
  white: { name: '白色' },
  blue: { name: '蓝色' },
  green: { name: '绿色' },
  orange: { name: '橙色' },
  lightRed: { name: '浅红' },
  pink: { name: '粉红' },
  lightPurple: { name: '浅紫' },
  lime: { name: '青柠' },
  yellow: { name: '黄色' },
  cyan: { name: '青色' },
  red: { name: '红色' },
  purple: { name: '紫色' },
  rainbow: { name: '彩虹色' },
  fireRed: { name: '火红色' },
  amber: { name: '琥珀色' },
  indigo: { name: '靛蓝色' }
} satisfies Record<string, { name: string }>;

export const rarities = Object.entries(RARITY_DEFS).map(([className, definition]) => ({ ...definition, className }));
/** 名字 → 下标，用法同 ITEM / EQUIP_TYPE。 */
export const RARITY = Object.fromEntries(Object.keys(RARITY_DEFS).map((name, id) => [name, id])) as { [K in keyof typeof RARITY_DEFS]: number };

/** 稀有度对应的 CSS 类名（style.css 里的 .rarity-*，它提供 --rarity-color）。
    所有需要给元素上稀有度色的地方都用它，不要再手拼 `rarity-${rarities[...].className}`。 */
export function rarityClass(rarity: number): string {
  return `rarity-${(rarities[rarity] || rarities[0]).className}`;
}
