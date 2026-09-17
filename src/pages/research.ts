import {
  researchItems, isResearchUnlocked, getResearchTask, getResearchProgress, canSubmitResearchTask, submitResearchTask,
  getResearchLevel, getResearchCost, canUpgradeResearch, upgradeResearchItem, upgradeResearchItemToMax,
  isResearchItemUnlocked, getResearchReward, canRefreshResearchTask, getResearchRefreshCost, refreshResearchTask,
  items, zones, RESEARCH, getState, formatNumber,
  mapSets, MAP_STATE, EXPEDITION, zoneOfMap, isAtlasUnlocked, getMapState, canStartExpedition, startExpedition,
  getExpedition, getExpeditionRate, isZoneUnlocked, getIdleLogistics, formatDuration, fragmentMapOf
} from '../game-state';
import { setText, setHtml, setClass, setHidden, setDisabled, setWidth, pick } from '../dom';
import { itemRefMarkup, zoneRefMarkup } from '../codex-ref';
import { campEventDef } from '../config/events';
import { rarityClass } from '../config/rarity';
import pageController from '../page-controller';
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
   它认 .item-card + .item-detail 这一对，所以这里直接复用物品储藏的磁贴）。
   网格加 .tile-compact：和物品栏同一套卡片、小一号（成就那边是同一个类，见 UI开发规范 §6.5）。
   未解锁的研究项不渲染：解锁后才被追加进网格（见 UI开发规范 §6.11）。
   data-ref 不带下标 —— 卡片是动态追加的，引用按卡片范围收集（见 collectCards）。 */
const researchCardMarkup = (entry: typeof researchItems[number], id: number): string => `<article class="item-card research-card" data-research="${id}" tabindex="0"><div class="item-icon" aria-hidden="true" data-ref="icon">${entry.icon}</div><div class="item-detail"><b class="item-detail-name">${entry.name}</b><p class="research-level" data-ref="level"></p><p data-ref="effect"></p><p class="research-cost" data-ref="cost"></p></div></article>`;
/** 收集网格里当前已渲染的研究项卡片引用（重建后必须重新收集）。 */
const collectCards = (grid: HTMLElement): any[] => [...grid.querySelectorAll<HTMLElement>('[data-research]')].map(card => {
  const id = Number(card.dataset.research);
  return { id, entry: researchItems[id], card, ...pick(card, 'icon', 'level', 'effect', 'cost') };
});

/* ——— 页签：委托与研究 / 勘探图 ———
   勘探图原来是自己一个页面，现在并进研究基地做页签 —— 两者本来就是同一条线：
   基地负责解析，勘探图负责把解析出来的坐标变成能走的路。切换方式与远征档案一致。 */
const TABS = [['contracts', '委托与研究'], ['atlas', '勘探图']] as const;

/* ——— 勘探图 ———
   面板只有**三格槽位**：点某一格，从物品栏里挑一片残片放进去。
   三格凑成**同一张图**（而且三片都不重复）才能派勘探队 —— 判据是「正好等于某张图的全部残片」，
   所以同系列的残片摆错组合（比如同一片摆两格）不算数。
   槽位是**界面上的临时选择**，不进存档（R05）；真正决定能不能出发的是 game-state 的 canStartExpedition，
   它会再验一遍「这三片真的在物品栏里」。 */
/** 槽位数 = 每张图的残片数（由配置表说了算，不写死 3）。 */
const SLOT_COUNT = mapSets[0]?.tiles.length || 3;
const atlasSlotMarkup = (index: number): string => `<button class="atlas-slot" type="button" data-slot="${index}"><span class="atlas-slot-icon" data-ref="icon" aria-hidden="true"></span><span class="atlas-slot-name" data-ref="name"></span></button>`;
const atlasMarkup = `<div class="panel-heading"><div><span class="panel-kicker">RECON ATLAS</span><h3>勘探图</h3></div><span class="muted" data-ref="atlasState"></span></div>
  <p class="atlas-hint">庇护所被大事件冲击时会带回来地图残片，按波次成套发放：第 1 波「矿脉图纸」→ 第 2 波「深井剖面」→ 第 3 波「裂谷坐标」（随机事件也会补一片，只是慢）。把同一张图的残片放进下面三个格子，就能派勘探队出去 —— 走通了，那张图指向的区域才会开放。</p>
  <div class="atlas-slots">${Array.from({ length: SLOT_COUNT }, (_, index) => atlasSlotMarkup(index)).join('')}</div>
  <div class="atlas-picker" data-ref="atlasPicker" hidden></div>
  <div class="requirement" data-ref="atlasRequirement"><span class="status-dot" data-ref="atlasDot"></span><span data-ref="atlasRequirementText"></span></div>
  <div class="atlas-actions"><button class="primary-button wide" type="button" data-action="expedition" data-ref="atlasAction"></button></div>
  <div class="atlas-expedition" data-ref="atlasExpedition" hidden>
    <div class="panel-heading"><div><span class="panel-kicker">ON THE ROAD</span><h3>勘探队</h3></div><span class="muted" data-ref="atlasExpeditionState"></span></div>
    <p class="atlas-desc" data-ref="atlasExpeditionCopy"></p>
    <div class="capacity-track"><div class="capacity-bar" data-ref="atlasExpeditionBar"></div></div>
  </div>`;

/** 三个槽位选中的残片是不是正好凑成一张图；不是返回 -1。
    要「每个部件都在」**而且「没有重复」** —— 同一片摆两格凑不出图。 */
function matchedMap(slots: number[]): number {
  if (slots.some(itemId => itemId < 0) || new Set(slots).size !== slots.length) return -1;
  return mapSets.findIndex(entry => entry.tiles.length === slots.length && entry.tiles.every(tile => slots.includes(tile.itemId)));
}
/** 物品栏里现成的残片（选片窗口的候选）。 */
function ownedFragments(state: GameState): number[] {
  return items.map((_, itemId) => ((state.inventory[itemId] || 0) > 0 && fragmentMapOf(itemId) >= 0 ? itemId : -1)).filter(itemId => itemId >= 0);
}
/** 选片窗口的内容：候选残片 + 「清空这一格」。已经放进别格的残片置灰 —— 同一片不能占两格。 */
function pickerMarkup(state: GameState, slots: number[], activeSlot: number): string {
  const current = slots[activeSlot] ?? -1;
  const owned = ownedFragments(state);
  const title = `<p class="atlas-pick-title">选一片残片放进第 ${activeSlot + 1} 格</p>`;
  if (!owned.length) return `${title}<p class="atlas-pick-empty">物品栏里还没有地图残片。庇护所击退天灾 / 兽潮 / 异种时会带回来一片，随机事件也会补。</p>`;
  const entries = owned.map(itemId => {
    const item = items[itemId];
    const usedElsewhere = slots.some((slotId, index) => index !== activeSlot && slotId === itemId);
    const mapId = fragmentMapOf(itemId);
    const note = `${mapSets[mapId]?.name || ''}${usedElsewhere ? ' · 已放进其他格' : ''}`;
    return `<button class="atlas-pick ${itemId === current ? 'active' : ''}" type="button" data-pick="${itemId}"${usedElsewhere ? ' disabled' : ''}><span class="atlas-pick-icon" aria-hidden="true">${item.icon}</span><span class="atlas-pick-name ${rarityClass(item.rarity)}">${item.name}</span><span class="atlas-pick-note">${note}</span></button>`;
  }).join('');
  const clear = current >= 0 ? '<button class="atlas-pick atlas-pick-clear" type="button" data-clear="1">清空这一格</button>' : '';
  return `${title}${entries}${clear}`;
}

const page: PageDefinition<any> = {
  id: 'research',
  template: './pages/research.html',
  /** 与主线「分析异常电池」的奖励一致：那条主线完成后才开放。 */
  locked: (state: GameState) => !isResearchUnlocked(state),
  mount(root) {
    const view = root.querySelector<HTMLElement>('#research-view')!;
    view.innerHTML = `<div class="tab-bar" role="tablist">${TABS.map(([id, label], index) => `<button class="tab" type="button" role="tab" data-tab="${id}"${index ? ' data-ref="atlasTab" hidden' : ''}>${label}</button>`).join('')}</div>
    <div class="tab-pane" data-pane="contracts"><div class="archive-layout">
      <section class="panel archive-panel">${taskMarkup}</section>
      <section class="panel archive-panel">
        <div class="panel-heading"><div><span class="panel-kicker">RESEARCH</span><h3>可研究项</h3></div><span class="muted" data-ref="points"></span></div>
        <p class="archive-hint">左键提升一级，右键尝试升到最大等级；悬停（或键盘聚焦）图标查看详情。</p>
        <div class="item-grid storage-grid tile-compact" data-ref="grid"></div>
      </section>
    </div></div>
    <div class="tab-pane" data-pane="atlas"><section class="panel atlas-panel">${atlasMarkup}</section></div>`;
    const ctx: any = {
      ...pick(view, 'points', 'desc', 'requirement', 'submit', 'refresh', 'refreshHint',
        'atlasTab', 'atlasState', 'atlasPicker', 'atlasRequirement', 'atlasDot', 'atlasRequirementText', 'atlasAction', 'atlasExpedition', 'atlasExpeditionState', 'atlasExpeditionCopy', 'atlasExpeditionBar'),
      grid: view.querySelector<HTMLElement>('[data-ref="grid"]'),
      cards: [], signature: '',
      tabs: [...view.querySelectorAll<HTMLElement>('[data-tab]')],
      panes: [...view.querySelectorAll<HTMLElement>('[data-pane]')],
      /* 勘探图的界面状态：当前页签、三格槽位（存残片的物品下标，-1 为空）、正在选片的那一格。 */
      tab: 'contracts', slots: new Array<number>(SLOT_COUNT).fill(-1), activeSlot: -1, pickerSignature: '',
      atlasSlots: [...view.querySelectorAll<HTMLElement>('.atlas-slot')].map(slot => ({ root: slot, ...pick(slot, 'icon', 'name') }))
    };
    root.onclick = event => {
      const target = event.target as Element;
      /* 页签切换：只换显示，不动存档（同远征档案）。切页签时顺手收起选片窗口。 */
      const tab = target.closest<HTMLElement>('[data-tab]');
      if (tab) { ctx.tab = tab.dataset.tab; ctx.activeSlot = -1; ctx.pickerSignature = ''; pageController.renderCurrent(); return; }
      /* 点槽位 → 开 / 收起选片窗口；再点同一格就是收起。 */
      const slot = target.closest<HTMLElement>('[data-slot]');
      if (slot && !(slot as HTMLButtonElement).disabled) {
        const index = Number(slot.dataset.slot);
        ctx.activeSlot = ctx.activeSlot === index ? -1 : index;
        ctx.pickerSignature = '';
        pageController.renderCurrent();
        return;
      }
      /* 选中一片残片放进当前那一格。 */
      const pickButton = target.closest<HTMLButtonElement>('[data-pick]');
      if (pickButton && !pickButton.disabled && ctx.activeSlot >= 0) {
        ctx.slots[ctx.activeSlot] = Number(pickButton.dataset.pick);
        ctx.activeSlot = -1;
        ctx.pickerSignature = '';
        pageController.renderCurrent();
        return;
      }
      if (target.closest('[data-clear]') && ctx.activeSlot >= 0) {
        ctx.slots[ctx.activeSlot] = -1;
        ctx.activeSlot = -1;
        ctx.pickerSignature = '';
        pageController.renderCurrent();
        return;
      }
      const action = target.closest<HTMLElement>('[data-action]');
      if (action?.dataset.action === 'submit') { submitResearchTask(); return; }
      if (action?.dataset.action === 'refresh') { refreshResearchTask(); return; }
      /* 派队：三格凑成一张图才给点（按钮本身也是禁用的，这里再判一次）。 */
      if (action?.dataset.action === 'expedition') { const mapId = matchedMap(ctx.slots); if (mapId >= 0) startExpedition(mapId); return; }
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
    /* ——— 页签 ——— */
    const atlasOpen = isAtlasUnlocked(state);
    /* 未解锁的页签不渲染（R29）：勘探图要等庇护所开始被大事件冲击（碎片就是从那里来的）。
       留在勘探图页签上时又被重新锁上（重置存档）就退回委托页。 */
    setHidden(ctx.atlasTab, !atlasOpen);
    if (ctx.tab === 'atlas' && !atlasOpen) ctx.tab = 'contracts';
    ctx.tabs.forEach((tab: HTMLElement) => setClass(tab, 'active', tab.dataset.tab === ctx.tab));
    ctx.panes.forEach((pane: HTMLElement) => setHidden(pane, pane.dataset.pane !== ctx.tab));

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

    /* ——— 勘探图页签 ——— */
    if (ctx.tab !== 'atlas' || !atlasOpen) return;
    const slots: number[] = ctx.slots;
    const expedition = getExpedition(state);
    const exploring = !!expedition;
    const idle = getIdleLogistics(state);
    let mapId = matchedMap(slots);
    /* 勘探成功后那三片就被消耗掉了：把槽位清空，别让面板停在「放着三片、但这张图已经勘探过」的怪状态。 */
    if (!exploring && mapId >= 0 && getMapState(mapId, state) === MAP_STATE.explored) {
      slots.fill(-1);
      ctx.activeSlot = -1;
      ctx.pickerSignature = '';
      mapId = -1;
    }
    const exploredCount = mapSets.filter((_, id) => getMapState(id, state) === MAP_STATE.explored).length;
    setText(ctx.atlasState, `已勘探 ${exploredCount} / ${mapSets.length} 张图`);

    /* 槽位：选中了显示残片，空着显示「＋」。勘探队在路上时不给改（图纸已经跟着队伍走了）。 */
    ctx.atlasSlots.forEach((slot: any, index: number) => {
      const itemId = slots[index] ?? -1;
      const chosen = itemId >= 0 ? items[itemId] : null;
      setDisabled(slot.root, exploring);
      setClass(slot.root, 'filled', !!chosen);
      setClass(slot.root, 'active', ctx.activeSlot === index);
      setText(slot.icon, chosen ? chosen.icon : '＋');
      setText(slot.name, chosen ? chosen.name : '空');
    });

    /* 选片窗口：只在「点开了某一格」而且没有队伍在路上时出现。
       内容按（当前格 + 三格选择 + 物品栏里的残片）签名重建 —— 每 500ms 重写会打断点击。 */
    if (ctx.activeSlot >= 0 && !exploring) {
      const pickSignature = `${ctx.activeSlot}|${slots.join(',')}|${ownedFragments(state).join(',')}`;
      if (ctx.pickerSignature !== pickSignature) {
        ctx.pickerSignature = pickSignature;
        setHtml(ctx.atlasPicker, pickerMarkup(state, slots, ctx.activeSlot));
      }
      setHidden(ctx.atlasPicker, false);
    } else {
      ctx.pickerSignature = '';
      setHidden(ctx.atlasPicker, true);
    }

    /* 状态行 + 按钮：四种情形 —— 队伍在路上 / 没凑齐 / 凑齐了 / 这张图已经勘探过。 */
    let requirementText = '';
    let requirementDone = false;
    let actionLabel = '派出勘探队';
    let actionEnabled = false;
    if (exploring) {
      requirementText = `勘探队正在路上，剩余 ${formatDuration(Math.ceil(expedition!.remaining))}。`;
      actionLabel = '勘探中…';
    } else if (mapId < 0) {
      const filled = slots.filter(itemId => itemId >= 0).length;
      requirementText = filled === 0
        ? '点上面三个格子，从物品栏里挑残片。'
        : `三片必须正好是同一张图的残片（已放入 ${filled} / ${SLOT_COUNT}）。`;
      actionLabel = '凑齐三片残片';
    } else if (getMapState(mapId, state) === MAP_STATE.explored) {
      requirementText = `「${mapSets[mapId].name}」已经勘探过了。`;
      actionLabel = '已勘探';
    } else {
      const entry = mapSets[mapId];
      const target = zoneOfMap(mapId);
      /* 区域名只在**已经能进去**之后才露出来 —— 区域列表对未开放的区域也是「待发现」占位格。 */
      const revealed = target >= 0 && isZoneUnlocked(target, state);
      actionEnabled = canStartExpedition(mapId, state);
      requirementDone = actionEnabled;
      requirementText = idle >= EXPEDITION.minWorkers
        ? `「${entry.name}」凑齐了 —— 派队要 ${EXPEDITION.minWorkers} 名待命后勤（当前 ${formatNumber(idle)}），成功率 ${Math.round(getExpeditionRate(state) * 100)}%${revealed ? `，走通就解锁${zoneRefMarkup(target)}` : ''}。`
        : `「${entry.name}」凑齐了，但待命后勤不够：需要 ${EXPEDITION.minWorkers} 人，当前只有 ${formatNumber(idle)} 人（在工坊页把人撤下来）。`;
    }
    setClass(ctx.atlasRequirement, 'done', requirementDone);
    setClass(ctx.atlasDot, 'pending', !requirementDone);
    setHtml(ctx.atlasRequirementText, requirementText);
    setText(ctx.atlasAction, actionLabel);
    setDisabled(ctx.atlasAction, !actionEnabled);

    /* 勘探队：剩余时间与进度条。进度按「已过时间占比」算，所以它每 tick 都在动。 */
    setHidden(ctx.atlasExpedition, !exploring);
    if (exploring) {
      const progress = Math.max(0, Math.min(1, 1 - expedition!.remaining / EXPEDITION.duration));
      setText(ctx.atlasExpeditionState, `剩余 ${formatDuration(Math.ceil(expedition!.remaining))}`);
      setText(ctx.atlasExpeditionCopy, `${expedition!.icon} 勘探队正带着「${expedition!.name}」在外面找路，成功率 ${Math.round(expedition!.rate * 100)}%。失败的话残片还在，可以再派一次。`);
      setWidth(ctx.atlasExpeditionBar, progress * 100);
    }
  }
};
export default page;
