import {
  workshopItems, LOGISTICS, logisticsTargets, getLogisticsAssigned, getIdleLogistics, getLogisticsTotal,
  getWorkshopCost, getWorkshopWorkTotal, getWorkshopRemaining, getWorkshopProgress, isWorkshopBusy, canStartWorkshop,
  assignLogistics, levelBonus, worksiteLevel, worksiteProgress, WORKSITE_BONUS, ITEM, isWorkshopUnlocked, isWorkshopItemUnlocked, formatNumber, formatDuration
} from '../game-state';
import { setText, setWidth, setClass, setDisabled, pick } from '../dom';
import { itemRefMarkup } from '../codex-ref';
import type { GameState, PageDefinition } from '../types';

/** 营地加成文案：只写数值，颜色由 CSS 给（等宽小字）。 */
const campBonusText = (hp: number, attack: number, defense: number): string => `生命 +${hp} · 攻击 +${attack} · 防御 +${defense}`;
/** 材料一行：需要 / 现有，由 update 决定标红还是标绿。
    label 有两种：金币不是物品，直接写文字；废料与装甲板是物品表里的物品，传物品引用
    （icon + 名称 + 稀有度色 + 可点开图鉴）。红绿只作用在数值上——标签本身是 muted，
    所以物品引用不会和「材料够不够」的语义色打架。 */
const matMarkup = (key: string, label: string): string => `<span class="shop-mat" data-mat="${key}"><i>${label}</i><b class="mat-value"></b></span>`;
/** 人数分配：批量按钮贴在步进器两侧 ——「«」把这一项的人全部撤下，「»」把待命的人全部投入。 */
const stepperMarkup = (target: number): string => `<button class="step-button batch" type="button" data-action="assign-none" data-target="${target}" data-ref="assignNone" title="撤下这一项的全部分配" aria-label="撤下这一项的全部分配">«</button><button class="step-button" type="button" data-action="assign" data-target="${target}" data-delta="-1" aria-label="减少一人">−</button><span class="logistics-count" data-ref="workers"></span><button class="step-button" type="button" data-action="assign" data-target="${target}" data-delta="1" aria-label="增加一人">+</button><button class="step-button batch" type="button" data-action="assign-all" data-target="${target}" data-ref="assignAll" title="把待命的后勤人数全部投入" aria-label="把待命的后勤人数全部投入">»</button>`;

const worksiteCard = `<article class="shop-item" data-shop="worksite" tabindex="0"><div class="shop-top"><div class="shop-left"><div class="shop-id"><span class="shop-icon" aria-hidden="true">${logisticsTargets[LOGISTICS.camp].icon}</span><div class="shop-id-text"><b class="shop-name">${logisticsTargets[LOGISTICS.camp].name}</b><span class="shop-level" data-ref="level"></span></div></div>
    <div class="capacity-track"><div class="capacity-bar" data-ref="progress"></div></div></div>
  <div class="shop-facts"><span class="shop-bonus" data-ref="bonus"></span><span class="shop-note">不消耗材料，只需人手</span></div></div>
  <div class="shop-assign">${stepperMarkup(LOGISTICS.camp)}</div>
  <div class="shop-detail"><span class="panel-kicker">CAMP WORKS</span><p class="shop-desc">${logisticsTargets[LOGISTICS.camp].desc}</p><span class="shop-work" data-ref="work"></span></div></article>`;
/* 制造项卡片：未解锁的不渲染，解锁后才被追加进网格（见 UI开发规范 §6.11）。 */
const fortCard = (item: typeof workshopItems[number], id: number): string => `<article class="shop-item" data-shop="${id}" tabindex="0"><div class="shop-top"><div class="shop-left"><div class="shop-id"><span class="shop-icon" aria-hidden="true">${item.icon}</span><div class="shop-id-text"><b class="shop-name">${item.name}</b><span class="shop-level" data-ref="level"></span></div></div>
    <div class="capacity-track"><div class="capacity-bar" data-ref="progress"></div></div></div>
  <div class="shop-facts"><span class="shop-bonus" data-ref="bonus"></span><span class="shop-mats">${matMarkup('gold', '金币')}${matMarkup('scrap', itemRefMarkup(ITEM.scrap))}${matMarkup('plate', itemRefMarkup(ITEM.armorPlate))}</span></div></div>
  <div class="shop-assign">${stepperMarkup(LOGISTICS.workshop)}</div>
  <div class="shop-detail"><span class="panel-kicker">FORTIFICATION</span><p class="shop-desc">${item.desc}</p><span class="shop-work" data-ref="work"></span></div></article>`;
/** 收集网格里当前已渲染的卡片引用（制造项是动态追加的，重建后必须重新收集）。 */
const collectCards = (grid: HTMLElement): any[] => [...grid.querySelectorAll<HTMLElement>('.shop-item')].map(card => ({
  card, ...pick(card, 'level', 'bonus', 'workers', 'progress', 'work', 'assignAll', 'assignNone'),
  /* 材料行：每个 <span data-mat> 一个，update 里按「需要 / 现有」标红或标绿。 */
  mats: [...card.querySelectorAll<HTMLElement>('[data-mat]')].map(wrap => ({ key: wrap.dataset.mat!, wrap, value: wrap.querySelector<HTMLElement>('.mat-value') }))
}));

const page: PageDefinition<any> = {
  id: 'workshop', template: './pages/workshop.html',
  /* 由主线节点「清理废弃边境」解锁：未解锁时导航入口会被替换成「❓未解锁」且不可点击（见 main.ts）。
     判定统一走 game-state 的 isWorkshopUnlocked —— 解锁提示用的是同一个函数，改条件只改一处。 */
  locked: (state: GameState) => !isWorkshopUnlocked(state),
  mount(root) {
    const view = root.querySelector<HTMLElement>('#workshop-view')!;
    /* 后勤小队人数放在最上面一行；冒号后面的数值用 <b> 强调。
       营垒修筑始终在，制造项由 update 按解锁状态追加。 */
    view.innerHTML = `<p class="camp-hint shop-hint">后勤小队：<b data-ref="hint"></b></p>
      <div class="shop-grid" data-ref="grid">${worksiteCard}</div>`;
    const grid = view.querySelector<HTMLElement>('[data-ref="grid"]')!;
    const ctx: any = {
      ...pick(view, 'hint'),
      grid,
      cards: collectCards(grid),
      signature: null
    };
    root.onclick = event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-action]');
      if (!button) return;
      const index = Number(button.dataset.target);
      /* 快捷分配：一次把待命的人都压上去 / 把这一项的人数清零（两个函数都默认读当前存档）。 */
      if (button.dataset.action === 'assign-all') assignLogistics(index, getIdleLogistics());
      else if (button.dataset.action === 'assign-none') assignLogistics(index, -getLogisticsAssigned(index));
      else if (button.dataset.action === 'assign') assignLogistics(index, Number(button.dataset.delta));
    };
    return ctx;
  },
  update(state: GameState, ctx: any) {
    setText(ctx.hint, `待命 ${getIdleLogistics(state)} / 总数 ${getLogisticsTotal(state)}`);
    /* 未解锁的制造项不渲染：按解锁状态同步网格（营垒修筑始终在），签名变了才重建。 */
    const visibleForts = workshopItems.map((_, id) => id).filter(id => isWorkshopItemUnlocked(id, state));
    const signature = visibleForts.join(',');
    if (ctx.signature !== signature) {
      ctx.signature = signature;
      ctx.grid.innerHTML = worksiteCard + visibleForts.map(id => fortCard(workshopItems[id], id)).join('');
      ctx.cards = collectCards(ctx.grid);
    }
    ctx.cards.forEach((refs: any) => {
      const isFort = refs.card.dataset.shop !== 'worksite';
      const workers = getLogisticsAssigned(isFort ? LOGISTICS.workshop : LOGISTICS.camp, state);
      setText(refs.workers, workers);
      const idle = getIdleLogistics(state);
      setDisabled(refs.card.querySelector('[data-delta="-1"]'), workers <= 0);
      setDisabled(refs.card.querySelector('[data-delta="1"]'), idle <= 0);
      /* 没人在待命就没什么可「全员投入」，这一项本来就是 0 人也没有可取消的。 */
      setDisabled(refs.assignAll, idle <= 0);
      setDisabled(refs.assignNone, workers <= 0);

      if (!isFort) {
        const level = worksiteLevel(state);
        setText(refs.level, `Lv.${level}`);
        setText(refs.bonus, campBonusText(level * WORKSITE_BONUS.hp, Math.round(level * WORKSITE_BONUS.attack), level * WORKSITE_BONUS.defense));
        setWidth(refs.progress, worksiteProgress(state));
        setText(refs.work, `进度 ${worksiteProgress(state).toFixed(0)} / 100 工时，每 100 工时 +1 级${workers ? '' : '（分配人手才会推进）'}`);
        return;
      }

      const id = Number(refs.card.dataset.shop);
      const item = workshopItems[id];
      const level = state.campWorkshop[id].level;
      const busy = isWorkshopBusy(id, state);
      const cost = getWorkshopCost(id, state);
      const owned: Record<string, number> = { gold: state.gold, scrap: state.scrap, plate: state.inventory[ITEM.armorPlate] || 0 };
      const need: Record<string, number> = { gold: cost.gold, scrap: cost.scrap, plate: cost.plate };
      setText(refs.level, `Lv.${level}`);
      setText(refs.bonus, campBonusText(levelBonus(level, item.perHp), levelBonus(level, item.perAttack), levelBonus(level, item.perDefense)));
      refs.mats.forEach((mat: any) => { setText(mat.value, `${formatNumber(need[mat.key])}/${formatNumber(owned[mat.key])}`); setClass(mat.wrap, 'ok', owned[mat.key] >= need[mat.key]); });
      const remaining = getWorkshopRemaining(id, state);
      setText(refs.work, busy ? `总工时 ${getWorkshopWorkTotal(id, state)}，已投入 ${state.campWorkshop[id].work.toFixed(0)}${workers ? `，预计剩余 ${formatDuration(remaining)}` : '，没有人手已暂停'}` : `本级总工时 ${getWorkshopWorkTotal(id, state)}；${workers ? (canStartWorkshop(id, state) ? '材料充足，自动开工中' : '材料不足，等待补给') : '分配人手后自动开工'}`);
      setWidth(refs.progress, getWorkshopProgress(id, state));
      setClass(refs.card, 'busy', busy);
    });
  }
};
export default page;
