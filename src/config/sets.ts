import { ITEM, items } from './items';
import { ZONE } from './zones';
import type { SetBonus } from '../types';

/** 一套套装的定义。bonus 里只写它真正给的那几项，缺的按 0 处理。 */
export interface SetDefinition {
  name: string;
  icon: string;
  /** 掉落这套装备的区域（zones 下标）。 */
  zone: number;
  /** 每次击杀掉落一件部件的概率。 */
  dropChance: number;
  desc: string;
  /** 全部部件（物品表下标）。 */
  pieces: number[];
  /** 凑齐全部部件后生效。 */
  bonus: SetBonus;
  /** 全部部件都精炼到 100 级（【极致】）后额外发放的永久加成，只给百分比。
      越早的套装越容易被后来的装备淘汰，所以早期套装的极致奖励给得更重 —— 它是「补上被淘汰的那部分」。 */
  perfectBonus: { attackPct?: number; hpPct?: number };
}

/* 套装表：键顺序就是 setId。装备本身不记自己属于哪套 —— 部件清单在这里列，是唯一来源。

   两条约定：
   1) 部件清单只写在这里（pieces 用 ITEM.xxx 引用）。物品表不反向引用套装表，
      否则 items ↔ sets 会形成循环依赖。
   2) 套装掉落不写进怪物的 dropTable —— 那里有「同一只怪物最多 3 条」的约束。
      套装走 grantSetDrop()，按区域独立判定，不占用那 3 条。

   套装效果在「这一套的全部部件都装在身上」时才生效（见 game-state 的 getSetBonus）。 */
const SET_DEFS = {
  /* 废弃边境：拼凑起来的废铁，靠厚度和修补活命。 */
  scavenger: {
    name: '拾荒者', icon: '🔧', zone: ZONE.wasteBorder, dropChance: .15,
    desc: '从废弃边境的机械残骸上拆下来的整套行头。单件都谈不上好，凑在一起却出奇地耐打。',
    pieces: [ITEM.rustHammer, ITEM.weldingMask, ITEM.patchedVest, ITEM.reinforcedGreaves, ITEM.nutCharm],
    bonus: { hp: 50, defense: 3, regen: 1 } satisfies SetBonus,
    /* 最早的一套：玩家在这一套上花的时间最长，极致奖励也最重 —— 生命百分比是全局乘算，后期依然吃得住。 */
    perfectBonus: { hpPct: 25 }
  },
  /* 余烬矿脉：结晶化带来的高热，换来更快的出手。 */
  ember: {
    name: '余烬', icon: '💠', zone: ZONE.emberVein, dropChance: .12,
    desc: '在矿脉里结晶化的护具。热量从缝隙里往外渗，出手因此比常人快上一截。',
    pieces: [ITEM.slagLance, ITEM.emberHood, ITEM.scorchedPlate, ITEM.cinderGreaves, ITEM.crystalPendant],
    bonus: { attack: 14, attackInterval: .2 } satisfies SetBonus,
    perfectBonus: { attackPct: 18 }
  },
  /* 核心深井：与核心信号同频，全面强化。 */
  core: {
    name: '核心', icon: '🕳️', zone: ZONE.coreDeep, dropChance: .12,
    desc: '用井底的核心碎片锻造的装备。穿着它的人会听见自己的心跳和核心同步。',
    pieces: [ITEM.signalCutter, ITEM.coreVisor, ITEM.abyssArmor, ITEM.regulatorLegs, ITEM.pulsingCore],
    bonus: { attack: 20, hp: 80, defense: 6 } satisfies SetBonus,
    perfectBonus: { attackPct: 12, hpPct: 12 }
  },
  /* 熔火裂谷：地热里淬出来的重装，攻防都比核心套再上一档。 */
  magma: {
    name: '熔火', icon: '🌋', zone: ZONE.magmaRift, dropChance: .1,
    desc: '在裂谷的地热里反复淬过的整套行头。重量惊人，但站在岩浆边也不会软。',
    pieces: [ITEM.magmaCleaver, ITEM.magmaVisor, ITEM.magmaPlate, ITEM.cinderLegs, ITEM.magmaCore],
    bonus: { attack: 26, hp: 75, defense: 8, regen: 1 } satisfies SetBonus,
    /* 越晚的套装【极致】奖励越轻：早期套装容易被淘汰，百分比留给它们补。 */
    perfectBonus: { attackPct: 8, hpPct: 8 }
  }
} satisfies Record<string, { name: string; icon: string; zone: number; dropChance: number; desc: string; pieces: number[]; bonus: SetBonus; perfectBonus: { attackPct?: number; hpPct?: number } }>;

export const sets: SetDefinition[] = Object.values(SET_DEFS);
/** 名字 → 下标，用法同 ITEM。 */
export const SET = Object.fromEntries(Object.keys(SET_DEFS).map((name, id) => [name, id])) as { [K in keyof typeof SET_DEFS]: number };
/** 下标 → 套装定义，越界返回 undefined。显式标注类型，否则拿到的是每套各自的字面量联合，取 bonus.xxx 会报错。 */
export const setTable: SetDefinition[] = sets;

/** 某个区域的掉落套装；该区域没有套装时返回 -1。 */
export function setOfZone(zoneId: number): number {
  return sets.findIndex(entry => entry.zone === zoneId);
}
/** 这件装备属于哪一套；不是套装部件时返回 -1。 */
export function setOfItem(itemId: number): number {
  return sets.findIndex(entry => entry.pieces.includes(itemId));
}
/** 这一套里玩家已经拥有的部件数（可堆叠物看数量，装备看实例数），用于图鉴 / 卡片展示。 */
export function setPieceNames(setId: number): string[] {
  return (sets[setId]?.pieces || []).map(itemId => items[itemId].name);
}
