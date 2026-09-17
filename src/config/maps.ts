import { ITEM } from './items';
import { CAMP_EVENT } from './events';
import type { MapSet } from '../types';

/* ——— 勘探图 ———
   庇护所大事件掉地图残片 → 残片按「套」收集 → 在研究基地的「勘探图」页签把同一张图的几片
   放进三个槽位 → 派勘探队出去（限时、有成功率）→ 成功才解锁地图指向的区域。

   三条刻意定下来的规则：
   1) **每套 3 片、按事件类型分套**（kind 决定哪张图掉片）。一波大事件里天灾 / 兽潮 / 异种
      依次出现，所以想集齐一套就得把三种都打下来 —— 没法只刷一种。
      随机事件是唯一的例外：它**不挑套，补最靠前的那个缺口**，给卡在某一波的玩家留一条
      靠时间慢慢磨的路（见 game-state 的 grantMapFragment）。
   2) **残片是物品**（config/items.ts 里 category: 'resource'）⇒ 自动进物品栏、自动进图鉴、
      掉落走 grantMapFragment（不进任何怪物的 dropTable，也不占「同一只怪物最多 3 条掉落」）。
      它们是**消耗品**：勘探成功时扣掉（失败不扣）—— 所以不算「没有出口的资源」。
   3) **哪张图解锁哪个区域不写在这里**，而是写在 config/zones.ts 的 unlockBy.map(...) 里 ——
      这张表只说「要哪几片、各自在拼图上占哪一格」，避免 maps ↔ zones 互相引用成环。
      `tiles` 的**长度就是槽位数**（页面按它生成格子），所以换套头（比如以后做 4 片一张图）
      不用改页面。

   ⚠️ 键顺序就是 mapId，而 camp.maps 是按下标存进存档的 ⇒ **新地图只能追加到末尾**。 */
const MAP_DEFS = {
  /* 天灾掉落。指向余烬矿脉 —— 进那片区域**只有这一条路**（区域的解锁规则见 config/zones.ts）。 */
  veinChart: {
    name: '矿脉图纸', icon: '🗺️', cols: 3, kind: CAMP_EVENT.disaster,
    description: '从沙暴里卷出来的一叠旧图纸，画的是一整条矿脉的走向。拼起来就能照着它摸到矿道口。',
    tiles: [
      { itemId: ITEM.veinChartA, col: 0, row: 0 },
      { itemId: ITEM.veinChartB, col: 1, row: 0 },
      { itemId: ITEM.veinChartC, col: 2, row: 0 }
    ]
  },
  /* 兽潮掉落。指向核心深井。 */
  deepProfile: {
    name: '深井剖面', icon: '🗺️', cols: 3, kind: CAMP_EVENT.tide,
    description: '兽群撞开的那段旧工程档案里夹着的剖面图。越往下，岩层画得越潦草。',
    tiles: [
      { itemId: ITEM.deepProfileA, col: 0, row: 0 },
      { itemId: ITEM.deepProfileB, col: 1, row: 0 },
      { itemId: ITEM.deepProfileC, col: 2, row: 0 }
    ]
  },
  /* 异种掉落。指向新区域「熔火裂谷」—— 井底之外的那片地热谷地。 */
  riftChart: {
    name: '裂谷坐标', icon: '🗺️', cols: 3, kind: CAMP_EVENT.mutant,
    description: '异种身上量出来的坐标：三片凑齐，就能把庇护所西南那片常年冒热气的地缝定死位置。',
    tiles: [
      { itemId: ITEM.riftChartA, col: 0, row: 0 },
      { itemId: ITEM.riftChartB, col: 1, row: 0 },
      { itemId: ITEM.riftChartC, col: 2, row: 0 }
    ]
  }
} satisfies Record<string, MapSet>;

export const mapSets: MapSet[] = Object.values(MAP_DEFS);
/** 名字 → 下标，用法同 ITEM / ZONE。 */
export const MAP = Object.fromEntries(Object.keys(MAP_DEFS).map((name, id) => [name, id])) as { [K in keyof typeof MAP_DEFS]: number };

/** camp.maps[mapId] 的状态。取值即存档值，所以只能追加。 */
export const MAP_STATE = {
  /** 还没勘探（残片可能已经攒够了，也可能没有 —— 攒够与否看物品栏，不记在这里）。 */
  none: 0,
  /** **已废弃**：上一版有过「拼合地图」这一步（碎片已扣、地图待派队）。
      现在三格槽位就是拼合，所以读档时会把 1 退回 0 **并把那三片碎片还给玩家**（见 game-state 的 rebuildState）。 */
  charted: 1,
  /** 勘探成功：它指向的区域已经解锁。 */
  explored: 2
} as const;

/** 这片碎片属于哪张图；不是碎片时返回 -1。
    图鉴的物品页靠它把碎片分流到「获取方式」那一套说明（碎片不在任何怪物的 dropTable 里，
    照「掉落来源」写只会得到一片占位）。 */
export function fragmentMapOf(itemId: number): number {
  return mapSets.findIndex(entry => entry.tiles.some(tile => tile.itemId === itemId));
}
