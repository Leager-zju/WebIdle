import {
  workshopItems, LOGISTICS, logisticsTargets, getLogisticsAssigned, getIdleLogistics, getLogisticsTotal,
  getWorkshopCost, getWorkshopWorkTotal, getWorkshopRemaining, getWorkshopProgress, isWorkshopBusy, canStartWorkshop,
  assignLogistics, levelBonus, worksiteLevel, worksiteProgress, WORKSITE_BONUS, ITEM, isWorkshopUnlocked, formatNumber, formatDuration
} from '../game-state';
import { setText, setWidth, setClass, setHidden, setDisabled, pick } from '../dom';
import type { GameState, PageDefinition } from '../types';

/** 工坊由主线节点「清理废弃边境」解锁（与远征档案里的说明一致）。 */
const UNLOCK_INDEX = 2;
/** 营地加成文案：只写数值，颜色由 CSS 给（等宽小字）。 */
const campBonusText = (hp: number, attack: number, defense: number): string => `生命 +${hp} · 攻击 +${attack} · 防御 +${defense}`;
/** 材料一行：需要 / 现有，由 update 决定标红还是标绿。 */
const matMarkup = (key: string, label: string): string => `<span class="shop-mat" data-mat="${key}"><i>${label}</i><b class="mat-value"></b></span>`;
/** 人数分配：批量按钮贴在步进器两侧 ——「«」把这一项的人全部撤下，「»」把待命的人全部投入。 */
const stepperMarkup = (target: number): string => `<button class="step-button batch" type="button" data-action="assign-none" data-target="${target}" data-ref="assignNone" title="撤下这一项的全部分配" aria-label="撤下这一项的全部分配">«</button><button class="step-button" type="button" data-action="assign" data-target="${target}" data-delta="-1" aria-label="减少一人">−</button><span class="logistics-count" data-ref="workers"></span><button class="step-button" type="button" data-action="assign" data-target="${target}" data-delta="1" aria-label="增加一人">+</button><button class="step-button batch" type="button" data-action="assign-all" data-target="${target}" data-ref="assignAll" title="把待命的后勤人数全部投入" aria-label="把待命的后勤人数全部投入">»</button>`;

const worksiteCard = `<article class="shop-item" data-shop="worksite" tabindex="0"><div class="shop-top"><div class="shop-left"><div class="shop-id"><span class="shop-icon" aria-hidden="true">${logisticsTargets[LOGISTICS.camp].icon}</span><div class="shop-id-text"><b class="shop-name">${logisticsTargets[LOGISTICS.camp].name}</b><span class="shop-level" data-ref="level"></span></div></div>
    <div class="capacity-track"><div class="capacity-bar" data-ref="progress"></div></div></div>
  <div class="shop-facts"><span class="shop-bonus" data-ref="bonus"></span><span class="shop-note">不消耗材料，只需人手</span></div></div>
  <div class="shop-assign">${stepperMarkup(LOGISTICS.camp)}</div>
  <div class="shop-detail"><span class="panel-kicker">CAMP WORKS</span><p class="shop-desc">${logisticsTargets[LOGISTICS.camp].desc}</p><span class="shop-work" data-ref="work"></span></div></article>`;
const fortCard = (item: typeof workshopItems[number], id: number): string => `<article class="shop-item" data-shop="${id}" tabindex="0"><div class="shop-top"><div class="shop-left"><div class="shop-id"><span class="shop-icon" aria-hidden="true">${item.icon}</span><div class="shop-id-text"><b class="shop-name">${item.name}</b><span class="shop-level" data-ref="level"></span></div></div>
    <div class="capacity-track"><div class="capacity-bar" data-ref="progress"></div></div></div>
  <div class="shop-facts"><span class="shop-bonus" data-ref="bonus"></span><span class="shop-mats">${matMarkup('gold', '金币')}${matMarkup('scrap', '废料')}${matMarkup('plate', '装甲板')}</span></div></div>
  <div class="shop-assign">${stepperMarkup(LOGISTICS.workshop)}</div>
  <div class="shop-detail"><span class="panel-kicker">FORTIFICATION</span><p class="shop-desc">${item.desc}</p><span class="shop-work" data-ref="work"></span></div></article>`;

const page: PageDefinition<any> = {
  id: 'workshop', template: './pages/workshop.html',
  /* 由主线节点「清理废弃边境」解锁：未解锁时导航入口会被替换成「❓未解锁」且不可点击（见 main.ts）。 */
  locked: (state: GameState) => state.mainlineIndex < UNLOCK_INDEX,
  mount(root) {
    const view = root.querySelector<HTMLElement>('#workshop-view')!;
    /* 后勤小队人数放在最上面一行；冒号后面的数值用 <b> 强调。 */
    view.innerHTML = `<p class="camp-hint shop-hint">后勤小队：<b data-ref="hint"></b></p>
      <div class="shop-grid">${worksiteCard}${workshopItems.map(fortCard).join('')}</div>`;
    const ctx: any = {
      ...pick(view, 'hint'),
      cards: [...view.querySelectorAll<HTMLElement>('.shop-item')].map(card => ({
        card, ...pick(card, 'level', 'bonus', 'workers', 'progress', 'work', 'assignAll', 'assignNone'),
        /* 材料行：每个 <span data-mat> 一个，update 里按「需要 / 现有」标红或标绿。 */
        mats: [...card.querySelectorAll<HTMLElement>('[data-mat]')].map(wrap => ({ key: wrap.dataset.mat!, wrap, value: wrap.querySelector<HTMLElement>('.mat-value') }))
      }))
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
      /* 主线进度不够的制造项整张卡片藏起来：解锁后不用重进页面就会冒出来。 */
      setHidden(refs.card, !isWorkshopUnlocked(id, state));
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
