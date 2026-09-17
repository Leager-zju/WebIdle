import {
  currentZoneId, isCampZone, isIdleZone, getExpedition, getIdleLogistics, getLogisticsTotal, getPlayerMaxHp,
  isWorkshopUnlocked, currentStoryNode, formatDuration, formatNumber
} from './game-state';
import { pick, setClass, setHidden, setHtml, setNumber, setText } from './dom';
import { enemyRefMarkup, renderCodexTags, zoneRefMarkup } from './codex-ref';
import type { GameState, MainlineQuest } from './types';

/* 右侧常驻概览栏：资源 / 冒险状态 / 当前主线。
   它是全局唯一的「远征队现在怎么样」面板（主界面撤掉后就靠它了）—— 骨架写在 index.html
   （切页面时不重挂，也不占 page-controller 的份额），这里只做两件事：
   initHud() 取一次引用，updateHud() 跟着 500ms 的状态通知写值。 */

/** 当前节点的达成条件：与远征档案共用一套 .requirement 行。
    text() 返回的引用 HTML 直接可用；再过一遍 renderCodexTags 兜住 [[kind:id]] 标记（R27）。 */
function questRequirements(state: GameState, node: MainlineQuest): string {
  return node.requirements
    .map(entry => { const done = entry.done(state); return `<div class="requirement ${done ? 'done' : ''}"><span class="status-dot ${done ? '' : 'pending'}"></span><span>${renderCodexTags(entry.text(state))}</span></div>`; })
    .join('');
}
/** 当前节点：标题 + 描述 + 条件行。条件文案里带实时进度数字，所以整块走 setHtml（内容不变时不重绘）。
    节点**跨章**取（`currentStoryNode()`）：第一章走完之后这里接着显示第二章的当前节。 */
function questMarkup(state: GameState, node: MainlineQuest): string {
  return `<article class="quest"><div class="quest-title"><span>${node.title}</span><span>进行中</span></div><p class="quest-desc">${node.description}</p><div class="quest-requirements">${questRequirements(state, node)}</div></article>`;
}

let refs: Record<string, HTMLElement | null> | null = null;

/** 启动时调一次：把 index.html 里的 data-ref 收成引用（此后每帧只写不查）。 */
export function initHud(): void {
  const root = document.querySelector<HTMLElement>('#hud');
  if (!root) return;
  refs = pick(root, 'gold', 'scrap', 'essence', 'logisticsCell', 'logistics', 'cta', 'state', 'statusText', 'zone', 'enemy', 'hpRow', 'hp', 'expeditionRow', 'expedition', 'quest');
}

/** 每 500ms 跟着状态通知跑一次：只写值，不重建 DOM（R04/R07）。 */
export function updateHud(state: GameState): void {
  if (!refs) return;

  /* ——— 资源 ——— */
  setNumber(refs.gold, state.gold);
  setNumber(refs.scrap, state.scrap);
  setNumber(refs.essence, state.essence);
  /* 后勤小队：只给「待命 / 总数」两个数字。总人数不存档，由主线 / 胜场 / 人口现算
     （getLogisticsSources），所以这里不写「待命」「总数」这些字，格子的标签就是它。
     它是工坊的系统：未解锁不渲染（R29）。 */
  const logisticsOpen = isWorkshopUnlocked(state);
  setHidden(refs.logisticsCell, !logisticsOpen);
  if (logisticsOpen) setText(refs.logistics, `${formatNumber(getIdleLogistics(state))}/${formatNumber(getLogisticsTotal(state))}`);

  /* ——— 冒险状态 ——— */
  const zoneId = currentZoneId(state);
  const camp = isCampZone(zoneId);
  /* 原地待命：还没驻扎任何区域（开局、以及庇护所解锁之前）。它**不是**「休整」—— 那是庇护所。
     刷怪冷却期间场上没有敌人（adventure.enemyId 还留着上一只被打掉的怪），
     这时「当前敌人」要显示等待，而不是那只已经死掉的怪。 */
  const idle = isIdleZone(zoneId);
  const spawning = !camp && !idle && state.adventure.spawnTimer > 0;
  setClass(refs.state, 'paused', camp || idle);
  setText(refs.statusText, idle ? '原地待命' : camp ? '休整' : spawning ? '搜寻中' : state.adventure.running ? '战斗中' : '待命');
  setText(refs.cta, state.adventure.running ? '查看实时战斗 →' : '前往冒险 →');
  setHtml(refs.zone, idle ? '原地待命' : zoneRefMarkup(zoneId));
  setHtml(refs.enemy, camp ? '篝火' : idle ? '—' : spawning ? '等待敌人出现' : enemyRefMarkup(state.adventure.enemyId));
  /* 生命值只在战斗区域才有意义（庇护所里它一直在回，占一行是噪音）。 */
  setHidden(refs.hpRow, camp || idle);
  if (!camp && !idle) setText(refs.hp, `${formatNumber(state.adventure.playerHp)} / ${formatNumber(getPlayerMaxHp(state))}`);

  /* 勘探队在路上时才占一行：它属于「远征队现在在干什么」，平时不出现。 */
  const expedition = getExpedition(state);
  setHidden(refs.expeditionRow, !expedition);
  if (expedition) setText(refs.expedition, `${expedition.icon} ${expedition.name} · 剩 ${formatDuration(Math.ceil(expedition.remaining))}`);

  /* ——— 当前主线 ———
     标题行不给「x / y」进度：主线是顺序推进的，卡片本身就写着当前是第几节（`CHAPTER 01 / NODE 03`），
     右上角再挂一个「3/7」是同一件事说两遍。 */
  /* 当前节点跨章取：第一章走完之后，这里接着显示第二章的当前节（全部走完才换成那句收尾文案）。 */
  const current = currentStoryNode(state);
  setHtml(refs.quest, current ? questMarkup(state, current.node) : '<div class="story-quote">当前章节的目标都已经完成。新的信号还在更深处等着。</div>');
}
