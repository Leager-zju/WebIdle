import {
  researchItems, RESEARCH, isResearchUnlocked, getResearchTask, getResearchProgress, canSubmitResearchTask, submitResearchTask,
  getResearchLevel, getResearchCost, canUpgradeResearch, upgradeResearchItem, upgradeResearchItemToMax,
  isResearchItemUnlocked, getTaskReward, getResearchDifficulty, getResearchMaxDifficulty, setResearchDifficulty,
  getResearchDifficultyMultiplier, researchDifficultyRarity, items, rarities, zones, mainline, getState, formatNumber
} from '../game-state';
import { setText, setHtml, setNumber, setClass, setDisabled, setWidth, pick } from '../dom';
import type { GameState, PageDefinition } from '../types';

/* ——— 左栏：当前委托（UI 参考远征档案的章节详情：一句话描述 + 达成条件 + 提交按钮）——— */
const taskMarkup = `<div class="panel-heading"><div><span class="panel-kicker">CONTRACT</span><h3>当前委托</h3></div></div>
  <p class="task-desc" data-ref="desc"></p>
  <div class="task-requirement" data-ref="requirement"></div>
  <div class="research-difficulty"><span class="field-label">委托难度</span>
    <div class="difficulty-stepper"><button class="step-button" type="button" data-action="difficulty" data-delta="-1" data-ref="difficultyDown" aria-label="降低难度">−</button>
      <span class="difficulty-value" data-ref="difficulty"></span>
      <button class="step-button" type="button" data-action="difficulty" data-delta="1" data-ref="difficultyUp" aria-label="提高难度">+</button></div>
    <span class="muted" data-ref="difficultyHint"></span></div>
  <button class="primary-button wide" type="button" data-action="submit" data-ref="submit">提交委托</button>`;

/* ——— 右栏：研究项 ———
   卡面只有图标，名称 / 等级 / 效果 / 消耗都在悬停浮层里（浮层逻辑见 hover-tip.ts，
   它认 .item-card + .item-detail 这一对，所以这里直接复用物品储藏的卡片样式）。 */
const researchCardMarkup = (entry: typeof researchItems[number], id: number): string => `<article class="item-card research-card" data-research="${id}" tabindex="0" data-ref="card-${id}"><div class="item-icon" aria-hidden="true" data-ref="icon-${id}">${entry.icon}</div><div class="item-detail"><b class="item-detail-name">${entry.name}</b><p class="research-level" data-ref="level-${id}"></p><p data-ref="effect-${id}"></p><p class="research-cost" data-ref="cost-${id}"></p></div></article>`;

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
        <div class="item-grid storage-grid research-grid">${researchItems.map(researchCardMarkup).join('')}</div>
      </section>
    </div>`;
    const ctx: any = {
      ...pick(view, 'points', 'desc', 'requirement', 'difficulty', 'difficultyDown', 'difficultyUp', 'difficultyHint', 'submit'),
      cards: researchItems.map((entry, id) => ({
        entry,
        card: view.querySelector<HTMLElement>(`[data-research="${id}"]`)!,
        icon: view.querySelector<HTMLElement>(`[data-ref="icon-${id}"]`)!,
        ...pick(view, `level-${id}`, `effect-${id}`, `cost-${id}`)
      }))
    };
    root.onclick = event => {
      const target = event.target as Element;
      const action = target.closest<HTMLElement>('[data-action]');
    if (action?.dataset.action === 'submit') { submitResearchTask(); return; }
    /* 难度只影响下一份委托：改完当前这份的报酬不变。 */
    if (action?.dataset.action === 'difficulty') { setResearchDifficulty(getResearchDifficulty(getState()) + Number(action.dataset.delta)); return; }
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
    /* 一句话说完：要什么、去哪儿，物品名与区域名加粗，其余交给下面的 requirement。 */
    const rarityClass = item ? `rarity-${rarities[item.rarity].className}` : '';
    const reward = item ? getTaskReward(task, state) : 0;
    /* 一句话说完：要什么（按稀有度着色）、去哪儿、给多少点。 */
    setHtml(ctx.desc, item && zone
      ? `基地正在分析异常电池，需要一批<b class="item-name ${rarityClass}">${item.icon} ${item.name}</b>。到<b>${zone.name}</b>狩猎，把掉落物带回来即可交付，可获得<b class="research-points">${reward} 研究点数</b>。`
      : '暂时没有可发布的委托：先在冒险里解锁新的区域。');
    /* 条件行沿用远征档案的 .requirement：物品名写成「▣ 旧电池」并加粗（同 chapter-fact 的值），够了就点亮。 */
    ctx.requirement.innerHTML = item ? `<div class="requirement ${done ? 'done' : ''}"><span class="status-dot ${done ? '' : 'pending'}"></span><span><b class="item-name ${rarityClass}">${item.icon} ${item.name}</b> ${formatNumber(owned)}/${formatNumber(task.need)}</span></div>` : '';
    setDisabled(ctx.submit, !canSubmitResearchTask(state));
    const difficulty = getResearchDifficulty(state);
    const maxDifficulty = getResearchMaxDifficulty(state);
    setText(ctx.difficulty, `${difficulty} / ${maxDifficulty}`);
    setText(ctx.difficultyHint, `下一份委托索取${rarities[researchDifficultyRarity(difficulty)].name}物品，奖励 ×${getResearchDifficultyMultiplier(difficulty)}`);
    setDisabled(ctx.difficultyDown, difficulty <= 1);
    setDisabled(ctx.difficultyUp, difficulty >= maxDifficulty);

    ctx.cards.forEach((entry: any, id: number) => {
      const unlocked = isResearchItemUnlocked(id, state);
      const level = unlocked ? getResearchLevel(id, state) : 0;
      const max = entry.entry.maxLevel;
      setClass(entry.card, 'locked', !unlocked);
      /* 未解锁：图标换成锁，详情里写清楚要完成哪条主线。 */
      setText(entry.icon, unlocked ? entry.entry.icon : '🔒');
      if (!unlocked) {
        const goal = mainline[entry.entry.unlockIndex - 1];
        setText(entry[`level-${id}`], '未解锁');
        setText(entry[`effect-${id}`], goal ? `完成主线「${goal.title}」后开放` : '暂未开放');
        setText(entry[`cost-${id}`], '');
        return;
      }
      setClass(entry.card, 'level-0', level <= 0);
      setClass(entry.card, 'maxed', level >= max);
      setText(entry[`level-${id}`], `等级 ${level} / ${max}`);
      setText(entry[`effect-${id}`], entry.entry.effect(level));
      /* 满级之后不再显示消耗；点数不够时提示还差多少。 */
      const cost = getResearchCost(id, state);
      setText(entry[`cost-${id}`], level >= max ? '已满级' : canUpgradeResearch(id, state) ? `升级消耗 ${cost} 点研究点数` : `升级消耗 ${cost} 点研究点数（还差 ${Math.max(0, cost - state.researchPoints)} 点）`);
    });
  }
};
export default page;
