/* 稀有度表：对象字面量的键顺序就是 rarity id（0,1,2…），新增稀有度在末尾追加即可。
   下标即 id；name 是界面上的显示名，className 是 CSS 类名后缀（对应 style.css 里的 .rarity-*）。
   物品表和词条表里都用 RARITY.rare 这类写法指代 id，和 EQUIP_TYPE.weapon 一个写法。
   稀有度本身不进存档（物品表是静态配置，存档只记物品下标），这里用 id 表是为了和
   EQUIP_TYPE 保持一致，并且以后要加「稀有度 → 掉落权重 / 颜色 / 排序」时直接往表里加字段。
   单独成一个模块，是为了让 config/items.ts 和 config/affixes.ts 都能用它而不互相引用。 */
const RARITY_DEFS = {
  common: { name: '普通' },
  uncommon: { name: '精良' },
  rare: { name: '稀有' },
  epic: { name: '史诗' }
} satisfies Record<string, { name: string }>;

export const rarities = Object.entries(RARITY_DEFS).map(([className, definition]) => ({ ...definition, className }));
/** 名字 → 下标，用法同 ITEM / EQUIP_TYPE。 */
export const RARITY = Object.fromEntries(Object.keys(RARITY_DEFS).map((name, id) => [name, id])) as { [K in keyof typeof RARITY_DEFS]: number };
