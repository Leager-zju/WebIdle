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
/** 主线节点数：同样由 game-state 注入（`unlockBy.mainlineDone()` 用它判「第一章全通」）。 */
let mainlineCount = 0;
export function setMainlineCount(count: number): void { mainlineCount = Math.max(0, Math.floor(Number(count)) || 0); }

/** 章节名与节名的查询函数：同样由 game-state 注入 —— 它那边才有 `storyChapters`，
    本模块反向 import 它就成了环（同 setMainlineTitles 的理由）。**章号与节号都从 1 起**。 */
let chapterTitle: (chapter: number) => string = () => '';
let chapterNodeTitle: (chapter: number, node: number) => string = () => '';
export function setChapterTitles(chapter: (chapter: number) => string, node: (chapter: number, node: number) => string): void { chapterTitle = chapter; chapterNodeTitle = node; }

/** 某章的进度（已完成几节）—— 直接读存档字段，不引 game-state（它依赖本模块）。
    这是 `unlockBy.chapter()` 的判据；界面上的那份在 game-state 的 `getChapterProgress()`，两处口径一致。 */
const chapterProgressOf = (state: GameState, chapter: number): number => chapter <= 1
  ? Math.max(0, Math.floor(Number(state.mainlineIndex) || 0))
  : Math.max(0, Math.floor(Number(state.chapters?.[chapter - 2]) || 0));

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
  /** 扛过第 n 波大事件（波次逐波递增，见 game-state 的 campWave）。
      ⚠️ 波次是「天灾 / 兽潮 / 异种」三件**全打完**才 +1 —— 想表达「击退第 n 次兽潮」别用它，
      那比兽潮晚一整场；「第一章走完」也别用它凑，见 mainlineDone。 */
  wave: (n: number): UnlockRule => ({
    text: state => `扛过第 ${n} 波大事件（当前第 ${waveNow(state)} 波）`,
    done: state => waveNow(state) > n,
    notice: () => `扛过第 ${n} 波大事件`
  }),
  /** 第一章（主线）**全部**节点走完 —— 第二章的章节门控用的就是这一个条件（`pages/story.ts` 的 chapterDone）。
      所以「第一章走完就该能开始」的内容（第二章第一节）**必须**用它：拿波次或进度数字去凑，
      迟早会和章节门控错开一格（错开的表现：第二章都出现了，第一节还写着「未解锁记录」）。
      ⚠️ 别写成 `mainline(固定数字)`：主线追加节点时那个数字不会自己跟着变。 */
  mainlineDone: (): UnlockRule => ({
    text: state => `完成第一章全部 ${mainlineCount} 个节点（当前 ${Math.min(Math.max(0, state.mainlineIndex), mainlineCount)} / ${mainlineCount}）`,
    done: state => mainlineCount > 0 && state.mainlineIndex >= mainlineCount,
    notice: () => '完成第一章'
  }),
  /** 完成**第二章起**的某一节（chapter 从 1 起 = 玩家看到的章号，node 从 1 起 = 那一章第几节）。
      章内是严格顺序推进的，所以「完成第 n 节」就等于「那一章的进度 ≥ n」。
      ⚠️ **故意不给 `notice`**：解锁提示手写在 `unlockNotices` 的末尾 —— 带了 notice 会被 entryNotices
      收进表的中段，旧存档的 notices 下标会整体错位（同 §6.12 里那条规矩）。 */
  chapter: (chapter: number, node: number): UnlockRule => ({
    text: state => `完成第${chapter}章「${chapterTitle(chapter)}」的第 ${node} 节「${chapterNodeTitle(chapter, node)}」（当前 ${Math.min(chapterProgressOf(state, chapter), node)} / ${node}）`,
    done: state => chapterProgressOf(state, chapter) >= node
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
