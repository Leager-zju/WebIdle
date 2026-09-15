import {
  researchItems, isResearchUnlocked, getResearchTask, getResearchProgress, canSubmitResearchTask, submitResearchTask,
  getResearchLevel, getResearchCost, canUpgradeResearch, upgradeResearchItem, upgradeResearchItemToMax,
  isResearchItemUnlocked, getResearchReward, canRefreshResearchTask, getResearchRefreshCost, refreshResearchTask,
  items, zones, RESEARCH, getState, formatNumber
} from '../game-state';
import { setText, setHtml, setClass, setDisabled, pick } from '../dom';
import { itemRefMarkup, zoneRefMarkup } from '../codex-ref';
import type { GameState, PageDefinition } from '../types';

/* ——— 左栏：当前委托（UI 参考远征档案的章节详情：一句话描述 + 达成条件 + 提交按钮）———
   委托要的是「某个区域的任务物品」—— 只在这份委托正指向那个区域时，该区域的怪物才按 10% 掉它，
   所以诉求是「去那个区域刷」而不是「挑某只怪刷」。不满意这份委托可以花钱刷新，费用递增。 */
const taskMarkup = `<div class="panel-heading"><div><span class="panel-kicker">CONTRACT</span><h3>当前委托</h3></div></div>
  <p class="task-desc" data-ref="desc"></p>
  <div class="task-requirement" data-ref="requirement"></div>
  <button class="primary-button wide" type="button" data-action="submit" data-ref="submit">提交委托</button>
  <button class="secondary-button wide" type="button" data-action="refresh" data-ref="refresh"></button>
  <p class="research-refresh-hint" data-ref="refreshHint"></p>`;

/* ——— 右栏：研究项 ———
   卡面只有图标，名称 / 等级 / 效果 / 消耗都在悬停浮层里（浮层逻辑见 hover-tip.ts，
   它认 .item-card + .item-detail 这一对，所以这里直接复用物品储藏的卡片样式）。
   未解锁的研究项不渲染：解锁后才被追加进网格（见 UI开发规范 §6.11）。
   data-ref 不带下标 —— 卡片是动态追加的，引用按卡片范围收集（见 collectCards）。 */
const researchCardMarkup = (entry: typeof researchItems[number], id: number): string => `<article class="item-card research-card" data-research="${id}" tabindex="0"><div class="item-icon" aria-hidden="true" data-ref="icon">${entry.icon}</div><div class="item-detail"><b class="item-detail-name">${entry.name}</b><p class="research-level" data-ref="level"></p><p data-ref="effect"></p><p class="research-cost" data-ref="cost"></p></div></article>`;
/** 收集网格里当前已渲染的研究项卡片引用（重建后必须重新收集）。 */
const collectCards = (grid: HTMLElement): any[] => [...grid.querySelectorAll<HTMLElement>('[data-research]')].map(card => {
  const id = Number(card.dataset.research);
  return { id, entry: researchItems[id], card, ...pick(card, 'icon', 'level', 'effect', 'cost') };
});

const page: PageDefinition<any> = {
  id: 'research',
  template: './pages/research.html',
  /** 与主线「分析异常电池」的奖励一致：那条主线完成后才开放。 */
  locked: (state: GameState) => !isResearchUnlocked(state),
  mount(root) {
    const view = root.querySelector<HTMLElement>('#research-view')!;
    view.innerHTML = `<div class="archive-layout">
      <section class="panel archive-panel">${taskMarkup}</section>
      <section class="panel archive-panel">
        <div class="panel-heading"><div><span class="panel-kicker">RESEARCH</span><h3>可研究项</h3></div><span class="muted" data-ref="points"></span></div>
        <p class="archive-hint">左键提升一级，右键尝试升到最大等级；悬停（或键盘聚焦）图标查看详情。</p>
        <div class="item-grid storage-grid research-grid" data-ref="grid"></div>
      </section>
    </div>`;
    const ctx: any = {
      ...pick(view, 'points', 'desc', 'requirement', 'submit', 'refresh', 'refreshHint'),
      grid: view.querySelector<HTMLElement>('[data-ref="grid"]'),
      cards: [], signature: ''
    };
    root.onclick = event => {
      const target = event.target as Element;
      const action = target.closest<HTMLElement>('[data-action]');
    if (action?.dataset.action === 'submit') { submitResearchTask(); return; }
    if (action?.dataset.action === 'refresh') { refreshResearchTask(); return; }
      const card = target.closest<HTMLElement>('[data-research]');
      if (card) upgradeResearchItem(Number(card.dataset.research));
    };
    /* 右键：一直升到点数不够或满级。浏览器默认的右键菜单在这里没有意义，直接拦掉。 */
    root.oncontextmenu = event => {
      const card = (event.target as Element).closest<HTMLElement>('[data-research]');
      if (!card) return;
      event.preventDefault();
      upgradeResearchItemToMax(Number(card.dataset.research));
    };
    return ctx;
  },
  update(state: GameState, ctx: any) {
    const task = getResearchTask(state);
    const item = items[task.itemId];
    const owned = getResearchProgress(state);
    const done = owned >= task.need;
    setHtml(ctx.points, `研究点数 <b class="research-points">${formatNumber(state.researchPoints)}</b>`);
    const zone = zones[task.zoneId];
    const reward = item ? getResearchReward(state) : 0;
    /* 一句话说完：要什么（物品引用）、去哪儿（区域引用）、给多少点。 */
    setHtml(ctx.desc, item && zone
      ? `基地正在分析异常电池，需要一批${itemRefMarkup(task.itemId)}。到${zoneRefMarkup(task.zoneId)}狩猎，这里的每一只怪物都可能带着它，凑齐即可交付，可获得<b class="research-points">${reward} 研究点数</b>。`
      : '暂时没有可发布的委托：先在冒险里解锁新的区域。');
    /* 条件行沿用远征档案的 .requirement：物品写成物品引用（icon + 名称），够了就点亮。 */
    setHtml(ctx.requirement, item ? `<div class="requirement ${done ? 'done' : ''}"><span class="status-dot ${done ? '' : 'pending'}"></span><span>${itemRefMarkup(task.itemId)} ${formatNumber(owned)}/${formatNumber(task.need)}</span></div>` : '');
    setDisabled(ctx.submit, !canSubmitResearchTask(state));
    /* 刷新：费用随刷新次数递增，交委托后归零。按钮上直接写价钱，不用再点一次才知道要花多少。 */
    const refreshCost = getResearchRefreshCost(state);
    setText(ctx.refresh, `刷新委托（${formatNumber(refreshCost)} 金币）`);
    setDisabled(ctx.refresh, !canRefreshResearchTask(state));
    setText(ctx.refreshHint, state.researchRefreshCount > 0
      ? `已刷新 ${state.researchRefreshCount} 次，每次刷新费用 +${formatNumber(RESEARCH.refreshCostBase)}；交委托后重新计数。`
      : `换一个区域。首次 ${formatNumber(RESEARCH.refreshCostBase)} 金币，连续刷会越来越贵。`);

    /* 未解锁的研究项不渲染：按解锁状态同步网格，签名变了才重建（解锁是单向的，重置存档也能收回）。 */
    const visible = researchItems.map((_, id) => id).filter(id => isResearchItemUnlocked(id, state));
    const signature = visible.join(',');
    if (ctx.signature !== signature) {
      ctx.signature = signature;
      ctx.grid.innerHTML = visible.map(id => researchCardMarkup(researchItems[id], id)).join('');
      ctx.cards = collectCards(ctx.grid);
    }
    ctx.cards.forEach((entry: any) => {
      const id = entry.id;
      const level = getResearchLevel(id, state);
      const max = entry.entry.maxLevel;
      setClass(entry.card, 'level-0', level <= 0);
      setClass(entry.card, 'maxed', level >= max);
      setText(entry.level, `等级 ${level} / ${max}`);
      setText(entry.effect, entry.entry.effect(level));
      /* 满级之后不再显示消耗；点数不够时提示还差多少。 */
      const cost = getResearchCost(id, state);
      setText(entry.cost, level >= max ? '已满级' : canUpgradeResearch(id, state) ? `升级消耗 ${cost} 点研究点数` : `升级消耗 ${cost} 点研究点数（还差 ${Math.max(0, cost - state.researchPoints)} 点）`);
    });
  }
};
export default page;
