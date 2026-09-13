import { items, rarities, devStats, devGrantItem, devSetStat, devUnlockSystems, getState, getOwnedCount, fontScales, getFontScale, setFontScale, numberFormats, getNumberFormat, setNumberFormat, setNotify, formatNumberExact } from '../game-state';
import { setText, setNumber, setClass, pick } from '../dom';
import type { GameState, PageDefinition } from '../types';

/* ——— 开发者面板 ———
   下面这些只被 `if (__DEV_TOOLS__)` 引用。该常量在构建期就定死了：
   npm run dev / npm run build:devtools 为 true，npm run build 为 false。
   为 false 时条件分支被移除，这些函数连同它们依赖的
   devGrantItem / devSetStat / devUnlockSystems / devStats 都会作为死代码从产物里消失，
   也就是说线上产物里既看不到面板，也找不到这些作弊入口的实现代码。 */

/** 「增加物品」悬浮窗里的发放档位，值即按钮上的 data-dev-multiplier。 */
const DEV_AMOUNTS = [1, 5, 10, 100];
let devModalEl: HTMLElement | null = null;
let devMultiplier = DEV_AMOUNTS[0];

/* 一个物品一个按钮。装备这类不堆叠的物品，发 5 件就是 5 张卡片（见 pages/inventory.ts）。 */
function devItemButtonsMarkup(): string { return items.map((item, id) => `<button class="dev-item-button rarity-${rarities[item.rarity].className}" type="button" data-dev-grant="${id}"><span class="dev-item-icon">${item.icon}</span><span class="dev-item-name">${item.name}</span><span class="dev-item-owned" data-dev-owned="${id}"></span></button>`).join(''); }
/** 悬浮窗只建一次，之后复用；挂在 body 上，不受设置页重绘影响。 */
function ensureDevModal(): HTMLElement { if (devModalEl) return devModalEl; const modal = document.createElement('div'); modal.className = 'dev-modal-layer'; modal.hidden = true; modal.innerHTML = `<div class="dev-modal"><div class="dev-modal-head"><div><span class="panel-kicker">DEVELOPER</span><h3>增加物品</h3></div><button class="dev-modal-close" type="button" data-dev-close aria-label="关闭">×</button></div><div class="dev-item-grid">${devItemButtonsMarkup()}</div><div class="dev-modal-foot"><span class="dev-multiplier-label">每次发放</span><div class="segmented">${DEV_AMOUNTS.map(amount => `<button class="segment" type="button" data-dev-multiplier="${amount}">×${amount}</button>`).join('')}</div></div></div>`; modal.addEventListener('click', event => { const target = event.target as Element; /* 点关闭按钮、或点在遮罩本身上（不是它的子节点）都关窗。 */ if (target.closest('[data-dev-close]') || target.classList.contains('dev-modal-layer')) { closeDevModal(); return; } const amountButton = target.closest<HTMLElement>('[data-dev-multiplier]'); if (amountButton) { devMultiplier = Number(amountButton.dataset.devMultiplier); syncDevModal(); return; } const grantButton = target.closest<HTMLElement>('[data-dev-grant]'); if (grantButton) { devGrantItem(Number(grantButton.dataset.devGrant), devMultiplier); syncDevModal(); } }); document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDevModal(); }); document.body.appendChild(modal); devModalEl = modal; return modal; }
/** 同步档位高亮与每个物品按钮上的持有数。 */
function syncDevModal(): void { if (!devModalEl) return; devModalEl.querySelectorAll<HTMLElement>('[data-dev-multiplier]').forEach(button => setClass(button, 'active', Number(button.dataset.devMultiplier) === devMultiplier)); const state = getState(); devModalEl.querySelectorAll<HTMLElement>('[data-dev-owned]').forEach(element => setText(element, `×${formatNumberExact(getOwnedCount(Number(element.dataset.devOwned), state))}`)); }
function openDevModal(): void { const modal = ensureDevModal(); modal.hidden = false; syncDevModal(); }
function closeDevModal(): void { if (devModalEl) devModalEl.hidden = true; }

/* 修改属性：和「增加物品」一样是悬浮窗 —— 上面网格列出所有可改数值，下面一个输入框 + 一个「修改」按钮。
   先在网格里点中某一项，再填数值点修改（输入框里回车等效）。 */
let devStatsModalEl: HTMLElement | null = null;
let devStatSelected = -1;
const devStatButtonsMarkup = (): string => devStats.map((entry, index) => `<button class="dev-stat-button" type="button" data-dev-stat="${index}" data-ref="stat-${index}"><span class="dev-stat-name">${entry.name}</span><b class="dev-stat-value" data-dev-stat-value="${index}"></b></button>`).join('');
function ensureDevStatsModal(): HTMLElement {
  if (devStatsModalEl) return devStatsModalEl;
  const modal = document.createElement('div');
  modal.className = 'dev-modal-layer';
  modal.hidden = true;
  modal.innerHTML = `<div class="dev-modal"><div class="dev-modal-head"><div><span class="panel-kicker">DEVELOPER</span><h3>修改属性</h3></div><button class="dev-modal-close" type="button" data-dev-close aria-label="关闭">×</button></div><div class="dev-stat-grid">${devStatButtonsMarkup()}</div><div class="dev-modal-foot"><input class="dev-input dev-stat-input" type="number" min="0" placeholder="输入数值" data-dev-stat-input><button class="dev-button" type="button" data-dev-stat-apply>修改</button></div></div>`;
  const input = modal.querySelector<HTMLInputElement>('[data-dev-stat-input]')!;
  const apply = (): void => { if (devStatSelected < 0) { input.placeholder = '先在上方点选一个属性'; return; } devSetStat(devStatSelected, Number(input.value)); syncDevStatsModal(); };
  modal.addEventListener('click', event => {
    const target = event.target as Element;
    /* 点关闭按钮、或点在遮罩本身上（不是它的子节点）都关窗。 */
    if (target.closest('[data-dev-close]') || target.classList.contains('dev-modal-layer')) { closeDevStatsModal(); return; }
    const cell = target.closest<HTMLElement>('[data-dev-stat]');
    if (cell) { devStatSelected = Number(cell.dataset.devStat); input.value = String(devStats[devStatSelected].get(getState())); input.focus(); input.select(); syncDevStatsModal(); return; }
    if (target.closest('[data-dev-stat-apply]')) apply();
  });
  input.addEventListener('keydown', event => { if (event.key === 'Enter') apply(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.hidden) closeDevStatsModal(); });
  document.body.appendChild(modal);
  devStatsModalEl = modal;
  return modal;
}
function syncDevStatsModal(): void {
  if (!devStatsModalEl || devStatsModalEl.hidden) return;
  const state = getState();
  devStats.forEach((entry, index) => {
    setClass(devStatsModalEl!.querySelector(`[data-dev-stat="${index}"]`), 'selected', index === devStatSelected);
    /* 有些字段（区域、敌人、开关）直接读数字没意义，交给 entry.display 出可读文案。 */
    /* 属性按钮上的数值跟随「数字显示方式」设置：缩写后悬停仍能看到完整数字；
       带自定义文案的字段（区域、敌人、开关）交给 entry.display。 */
    const statValue = devStatsModalEl!.querySelector(`[data-dev-stat-value="${index}"]`);
    if (entry.display) setText(statValue, entry.display(state)); else setNumber(statValue, entry.get(state));
  });
  /* 正在输入的框不要回写，否则会打断输入。 */
  const input = devStatsModalEl.querySelector<HTMLInputElement>('[data-dev-stat-input]');
  if (input && devStatSelected >= 0 && document.activeElement !== input) input.value = String(devStats[devStatSelected].get(state));
}
function openDevStatsModal(): void { const modal = ensureDevStatsModal(); modal.hidden = false; syncDevStatsModal(); }
function closeDevStatsModal(): void { if (devStatsModalEl) devStatsModalEl.hidden = true; }

function devPanelMarkup(): string { return `<section class="dev-panel"><div class="dev-head"><span class="panel-kicker">DEVELOPER</span><h3>开发者功能</h3><p>直接修改存档数据，改动立即写入存档。这个面板只在构建时开启开发者开关的情况下才会出现在产物里。</p></div><div class="dev-group"><h4>增加物品</h4><div class="dev-list"><div class="dev-row"><span class="dev-row-name">发放物品到物品栏</span><span class="dev-row-actions"><button class="dev-button" type="button" data-dev-action="items">打开物品面板</button></span></div></div></div><div class="dev-group"><h4>修改属性</h4><div class="dev-list"><div class="dev-row"><span class="dev-row-name">修改金币、等级、营地与后勤等数值</span><span class="dev-row-actions"><button class="dev-button" type="button" data-dev-action="stats">打开属性面板</button></span></div></div></div><div class="dev-group"><h4>解锁系统</h4><div class="dev-list"><div class="dev-row"><span class="dev-row-name">一键解锁全部系统</span><span class="dev-row-actions"><button class="dev-button" type="button" data-dev-action="unlock">解锁</button></span></div></div></div></section>`; }
function devPanelMount(view: HTMLElement): void { view.addEventListener('click', event => { const action = (event.target as Element).closest<HTMLElement>('[data-dev-action]'); if (!action) return; if (action.dataset.devAction === 'items') openDevModal(); else if (action.dataset.devAction === 'stats') openDevStatsModal(); else if (action.dataset.devAction === 'unlock') devUnlockSystems(); }); }
function devPanelSync(): void { /* 悬浮窗开着时，里面的数值跟着刷新。 */ if (devModalEl && !devModalEl.hidden) syncDevModal(); syncDevStatsModal(); }

const page: PageDefinition<any> = { id: 'settings', template: './pages/settings.html', mount(root) { const view = root.querySelector<HTMLElement>('#settings-view')!; let devMarkup = ''; if (__DEV_TOOLS__) devMarkup = devPanelMarkup(); view.innerHTML = `<div class="setting-row"><div class="setting-copy"><span class="panel-kicker">FONT SIZE</span><h3>字体大小</h3><span data-ref="current" class="muted"></span></div><div class="segmented" data-ref="group">${fontScales.map((option, id) => `<button class="segment" type="button" data-scale="${id}">${option.label}</button>`).join('')}</div></div><div class="setting-row"><div class="setting-copy"><span class="panel-kicker">NUMBER FORMAT</span><h3>数字显示方式</h3><span data-ref="numberCurrent" class="muted"></span></div><div class="segmented" data-ref="numberGroup">${numberFormats.map(option => `<button class="segment" type="button" data-number-format="${option.id}">${option.label}</button>`).join('')}</div></div><div class="setting-row"><div class="setting-copy"><span class="panel-kicker">NOTIFICATION</span><h3>事件弹窗提醒</h3><span class="muted">随机事件触发时是否弹出提醒。关掉后仍可在营地页响应，超时（30 秒）一律跳过。</span></div><div class="segmented" data-ref="notifyGroup"><button class="segment" type="button" data-notify="1">开</button><button class="segment" type="button" data-notify="0">关</button></div></div><div class="setting-row"><div class="setting-copy"><span class="panel-kicker">DANGER ZONE</span><h3>重置存档</h3><p>清空当前远征进度，从一簇微弱的火星重新开始。</p></div><button class="secondary-button danger" type="button" data-action="reset">重置存档</button></div>${devMarkup}`; const refs = pick(view, 'current', 'group', 'numberCurrent', 'numberGroup', 'notifyGroup'); refs.group!.addEventListener('click', event => { const button = (event.target as Element).closest<HTMLButtonElement>('[data-scale]'); if (button) setFontScale(Number(button.dataset.scale)); });
refs.numberGroup!.addEventListener('click', event => { const button = (event.target as Element).closest<HTMLButtonElement>('[data-number-format]'); if (button) setNumberFormat(Number(button.dataset.numberFormat)); }); refs.notifyGroup!.addEventListener('click', event => { const button = (event.target as Element).closest<HTMLButtonElement>('[data-notify]'); if (button) setNotify(button.dataset.notify === '1'); }); const ctx: any = { current: refs.current, buttons: [...refs.group!.querySelectorAll<HTMLButtonElement>('[data-scale]')], notifyButtons: [...refs.notifyGroup!.querySelectorAll<HTMLButtonElement>('[data-notify]')], numberCurrent: refs.numberCurrent, numberButtons: [...refs.numberGroup!.querySelectorAll<HTMLButtonElement>('[data-number-format]')] }; if (__DEV_TOOLS__) devPanelMount(view); return ctx; }, update(state: GameState, ctx: any) { ctx.buttons.forEach((button: HTMLButtonElement) => setClass(button, 'active', Number(button.dataset.scale) === state.settings.fontScale)); ctx.notifyButtons.forEach((button: HTMLButtonElement) => setClass(button, 'active', (button.dataset.notify === '1') === !!state.settings.notify)); setText(ctx.current, `当前：${getFontScale(state).label}`);
    const format = getNumberFormat(state);
    ctx.numberButtons.forEach((button: HTMLButtonElement) => setClass(button, 'active', Number(button.dataset.numberFormat) === format.id));
    setText(ctx.numberCurrent, `当前：${format.label} —— ${format.hint}`); if (__DEV_TOOLS__) devPanelSync(); } };
export default page;
