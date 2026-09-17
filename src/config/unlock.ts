import { mapSets, MAP_STATE } from './maps';
import type { GameState, UnlockRule } from '../types';

/* ——— 区域解锁规则（unlockBy）———
   区域不再只有「主线进度到 N」这一条通道，而是可组合的规则：
   主线 / 地图 / 任意组合。规则刻意用**和主线条件（MainlineRequirement）同一套形状** ——
   `{ text, done }` —— 于是冒险页的解锁提示、图鉴的「进入条件」、解锁公告三处
   全都直接复用主线那套条件渲染，不用为每种规则各写一份显示。

   写规则时的两条约定：
   1) **text() 必须给出可读的说明**（不是可选项）：玩家看完要知道「我该去哪做什么」。
      它返回渲染层 HTML（可以内嵌图鉴引用），能直接 setHtml。
   2) **notice 不写 = 开局就满足**：这类区域（废弃边境）不进解锁提示列表，
      否则一进游戏会刷一屏「解锁：冒险「废弃边境」」。 */

/** 主线节点标题的查询函数：由 game-state 在启动时注入。
    这里不能直接 import mainline —— game-state 引用 zones、zones 引用本模块，
    直接依赖会成环（这个项目里 codex-ref / format 都用同一套注入式做法绕开它）。 */
let mainlineTitle: (index: number) => string = () => '';
export function setMainlineTitles(lookup: (index: number) => string): void { mainlineTitle = lookup; }

/** 剧情任务名的查询函数：同样靠注入 —— config/campaign.ts 依赖本模块（它要 unlockBy），
    本模块反向 import 它就成了环（同 setMainlineTitles 的理由）。 */
let questName: (index: number) => string = () => '';
export function setQuestNames(lookup: (index: number) => string): void { questName = lookup; }

/** 剧情任务进度（`state.quests` 的取值）：0 未达成 / 1 奖励已发（物品在物品栏里）/ 2 已安装（解锁生效）。
    **这是存档值**，只能追加语义、不能重排。
    之所以放在本模块：unlockBy.quest() 要拿它做判据，而 config/campaign.ts 依赖本模块（同 MAP_STATE 那样，
    常量跟着「用它的那条规则」走）。 */
export const QUEST_STATE = { locked: 0, granted: 1, installed: 2 } as const;

/** 当前波次（从 1 起）。读存档字段，不引 game-state。 */
const waveNow = (state: GameState): number => Math.max(1, Math.floor(Number(state.camp?.wave)) || 1);

/** 一张地图的勘探是否已经完成（区域据此解锁）。只看存档字段，不需要 game-state。 */
function mapExplored(state: GameState, mapId: number): boolean {
  return Number(state.camp?.maps?.[mapId]) === MAP_STATE.explored;
}
const mapName = (mapId: number): string => mapSets[mapId]?.name || '地图';

/** 把子规则的 notice 合成父规则的 notice：一个都没有（全是开局就有的）时整个不写。 */
function combineNotices(rules: UnlockRule[], separator: string): (() => string) | undefined {
  const listed = rules.filter(rule => rule.notice);
  if (!listed.length) return undefined;
  /* notice 存的是**达成条件**的描述（不含「解锁」二字）—— 提示的标题已经写着「解锁：」了，
    这里再补一遍会变成「解锁：……解锁」。 */
  return () => listed.map(rule => (typeof rule.notice === 'function' ? rule.notice() : rule.notice!)).join(separator);
}

export const unlockBy = {
  /** 主线进度达到第 index 个节点（index 为 0 表示开局即可）。 */
  mainline: (index: number): UnlockRule => index <= 0
    ? { text: () => '开局即可进入', done: () => true }
    : {
      text: state => `完成主线「${mainlineTitle(index)}」（当前 ${Math.min(Math.max(0, state.mainlineIndex), index)} / ${index}）`,
      done: state => state.mainlineIndex >= index,
      notice: () => `完成主线「${mainlineTitle(index)}」`
    },
  /** 拼出这张勘探图并完成一次成功的勘探远征（见 config/maps.ts）。 */
  map: (mapId: number): UnlockRule => ({
    text: () => `在「勘探图」拼出${mapName(mapId)}，并派勘探队成功完成一次勘探`,
    done: state => mapExplored(state, mapId),
    notice: () => `拼出「${mapName(mapId)}」并完成勘探`
  }),
  /** 扛过第 n 波大事件（波次逐波递增，见 game-state 的 campWave）。 */
  wave: (n: number): UnlockRule => ({
    text: state => `扛过第 ${n} 波大事件（当前第 ${waveNow(state)} 波）`,
    done: state => waveNow(state) > n,
    notice: () => `扛过第 ${n} 波大事件`
  }),
  /** 完成远征档案第二章「余烬之外」里的这一节：拿到奖励物品、再用掉它装好（见 config/campaign.ts）。
      文案只指向那一节 —— 具体条件写在那里，不要在别处再抄一遍。 */
  quest: (index: number): UnlockRule => ({
    text: () => `完成远征档案第二章里的「${questName(index)}」`,
    done: state => (state.quests?.[index] || 0) >= QUEST_STATE.installed,
    notice: () => `装好「${questName(index)}」`
  }),
  /** 全部子规则都达成。 */
  all: (...rules: UnlockRule[]): UnlockRule => ({
    text: state => rules.map(rule => rule.text(state)).join('，并且'),
    done: state => rules.every(rule => rule.done(state)),
    notice: combineNotices(rules, '，并且')
  }),
  /** 任意一条子规则达成即可。 */
  any: (...rules: UnlockRule[]): UnlockRule => ({
    text: state => rules.map(rule => rule.text(state)).join('，或'),
    done: state => rules.some(rule => rule.done(state)),
    notice: combineNotices(rules, '，或')
  })
};
