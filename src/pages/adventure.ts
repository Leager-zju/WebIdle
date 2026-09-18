import { zones, currentZoneId, currentEnemy, isCampZone, isIdleZone, getSpawnCooldown, isZoneUnlocked, CAMP_REGEN_MULTIPLIER, getPlayerAttack, getPlayerDefense, getPlayerRegen, getPlayerMaxHp, getPlayerAttackInterval, getEnemyAttackInterval, formatSeconds, formatPerSecond, selectZone, getState, items, formatNumber, isAutoEatUnlocked, getAutoEatItem, getAutoEatThreshold, setAutoEatItem, setAutoEatThreshold, foodItemIds, AUTO_EAT, isResearchUnlocked, getResearchTask, getResearchProgress, getDifficulties, difficultyOf, selectDifficulty, isManualUnlocked, isManualMode, setManual, useSkill, getSkillTimer, isSkillUnlocked } from '../game-state';
import { skills as battleSkills } from '../config/skills';
import { rarityClass } from '../config/rarity';
import { setText, setNumber, setWidth, setClass, setHtml, setHidden, setDisabled, pick, toFragment } from '../dom';
import { renderCodexTags, zoneRefMarkup, itemRefMarkup } from '../codex-ref';
import pageController from '../page-controller';
import type { GameState, PageDefinition } from '../types';

/* 怪物资料与掉落表统一由内置 wiki 提供（见 wiki.ts），这一页只负责实时战斗。
   原先的「怪物图鉴」面板已移除：它是同一份数据的第二套展示，与 wiki 重复。 */

let logFilter = 'all';
const filterOptions = [{ id: 'all', label: '全部' }, { id: 'battle', label: '战斗' }, { id: 'drop', label: '掉落' }, { id: 'progress', label: '成长' }, { id: 'system', label: '系统' }, { id: 'defeat', label: '撤退' }];
function attackProgress(value: number, interval: number): number { return Math.min(100, Math.max(0, value / interval * 100)); }
/* 日志正文里的 [[类型:下标]] 标记渲染成图鉴引用（icon + 名称 + 类型色 + 可点开图鉴）。 */
function entryMarkup(entry: any): string { return `<div class="log-entry log-${entry.type}"><span class="log-time">${entry.time}</span><span class="log-kind">${entry.type}</span><span>${renderCodexTags(entry.message)}</span></div>`; }
function buildEntries(entries: any[]): DocumentFragment { return toFragment(entries.length ? entries.map(entryMarkup).join('') : '<div class="log-empty">当前过滤条件下暂无信息。</div>'); }
const EMPTY_LOG = {};
/* anchor 记录上次渲染时的最新一条日志，用来只插入新增的部分。同步结束后必须把它推进到当前最新一条：
   否则在没有新日志的那一帧，entries.indexOf(anchor) 仍然大于 0，会把同一批日志再插一次，而末尾裁剪只从尾部删除，
   结果就是最新几条被反复复制、旧记录被挤掉——暂停战斗后日志不再增长，这个重复就会持续刷屏。 */
function syncLog(entries: any[], ctx: any): void { const container = ctx.log as HTMLElement; if (!entries.length) { if (ctx.anchor === EMPTY_LOG) return; ctx.anchor = EMPTY_LOG; container.replaceChildren(buildEntries(entries)); return; } const anchor = ctx.anchor ? entries.indexOf(ctx.anchor) : -1; if (anchor < 0) { container.replaceChildren(buildEntries(entries)); } else if (anchor > 0) { const first = container.firstElementChild; if (first?.classList.contains('log-empty')) first.remove(); container.insertBefore(buildEntries(entries.slice(0, anchor)), container.firstElementChild); } const expected = Math.max(entries.length, 1); while (container.childElementCount > expected) container.lastElementChild?.remove(); ctx.anchor = entries[0]; }
/* 刷怪冷却用的环形进度条：半径固定，圆周长用来换算 stroke-dashoffset。 */
const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
/* 区域选择改成自绘下拉，不再用原生 <select>。原因见 README 里的说明：
   原生弹层由浏览器绘制，没法定制外观也没法加动画；而且每 500ms 的渲染循环会写 select.value，
   一旦此刻状态变化（例如角色阵亡自动撤回庇护所），用户正在进行的下拉选择会被强行改回去，表现就是「点了没反应」。
   全局关闭逻辑只注册一次，指向当前挂载的 ctx。 */
let zonePickerCtx: any = null;
function closeZonePicker(): void { if (!zonePickerCtx || !zonePickerCtx.zoneOpen) return; zonePickerCtx.zoneOpen = false; pageController.renderCurrent(); }
document.addEventListener('pointerdown', event => { if (zonePickerCtx?.zoneOpen && !(event.target as Element)?.closest?.('.zone-picker')) closeZonePicker(); }, true);
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeZonePicker(); });
/* ——— 自动进食的食物选择窗口 ———
   单例挂 body（#page-content 有 contain: layout，挂页面里会被当成相对它定位）。
   内容每次打开时按当前状态重算：食物清单、剩余数量、阈值都会变。 */
let autoEatLayer: HTMLElement | null = null;
function closeAutoEatWindow(): void { if (autoEatLayer) autoEatLayer.hidden = true; }
function foodOptionMarkup(itemId: number, selected: number): string {
  const item = items[itemId];
  const quantity = getState().inventory[itemId] || 0;
  return `<button class="auto-eat-option ${itemId === selected ? 'active' : ''}" type="button" data-auto-eat-pick="${itemId}"><span class="auto-eat-option-icon">${item.icon}</span><span class="auto-eat-option-copy"><b class="${rarityClass(item.rarity)}">${item.name}</b><em>${item.useText || '恢复生命'} · 剩 ${formatNumber(quantity)}</em></span></button>`;
}
function autoEatWindowMarkup(): string {
  const state = getState();
  const selected = getAutoEatItem(state);
  const foods = foodItemIds();
  const list = foods.length
    ? foods.map(itemId => foodOptionMarkup(itemId, selected)).join('')
    : '<p class="auto-eat-empty">物品栏里还没有食物。带回能回血的补给后，它们会出现在这里。</p>';
  return `<div class="auto-eat-window"><div class="auto-eat-window-head"><div><span class="panel-kicker">AUTO FEED</span><h3>自动进食</h3></div><button class="auto-eat-close" type="button" data-auto-eat-close aria-label="关闭">×</button></div><p class="auto-eat-window-copy">生命值低于上限的这个比例时，自动吃掉一份选定的食物。「食物」指所有使用后能恢复生命的消耗品。</p><div class="auto-eat-threshold"><span>触发阈值</span><div class="auto-eat-steps"><button class="step-button" type="button" data-auto-eat-threshold="-1" aria-label="降低">−</button><b data-ref="threshold">${getAutoEatThreshold(state)}%</b><button class="step-button" type="button" data-auto-eat-threshold="1" aria-label="提高">+</button></div></div><div class="auto-eat-list">${list}</div><button class="secondary-button wide" type="button" data-auto-eat-pick="-1"${selected < 0 ? ' disabled' : ''}>关闭自动进食</button></div>`;
}
function ensureAutoEatLayer(): HTMLElement {
  if (autoEatLayer) return autoEatLayer;
  const layer = document.createElement('div');
  layer.className = 'auto-eat-layer';
  layer.hidden = true;
  layer.addEventListener('click', event => {
    const target = event.target as Element;
    if (target.closest('[data-auto-eat-close]') || target.classList.contains('auto-eat-layer')) { closeAutoEatWindow(); return; }
    const step = target.closest<HTMLElement>('[data-auto-eat-threshold]');
    if (step) { setAutoEatThreshold(getAutoEatThreshold() + Number(step.dataset.autoEatThreshold) * AUTO_EAT.thresholdStep); renderAutoEatWindow(); return; }
    const option = target.closest<HTMLElement>('[data-auto-eat-pick]');
    if (option) { setAutoEatItem(Number(option.dataset.autoEatPick)); closeAutoEatWindow(); }
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeAutoEatWindow(); });
  document.body.appendChild(layer);
  autoEatLayer = layer;
  return layer;
}
function renderAutoEatWindow(): void { ensureAutoEatLayer().innerHTML = autoEatWindowMarkup(); }
function openAutoEatWindow(): void { renderAutoEatWindow(); ensureAutoEatLayer().hidden = false; }

/* ——— 手动模式的战斗控制区（第二章第 4 节解锁）———
   3 行 4 列：第 1 列是自动 / 手动切换（跨 3 行），右侧 3×3 是技能槽
   （第一排攻击 / 第二排防御 / 第三排辅助，表在 config/skills.ts）。
   骨架一次性建好（槽位数固定），每帧只改文本与类名；未解锁时整块不渲染（R29）。 */
function manualPanelMarkup(): string {
  return `<div class="manual-panel" data-ref="manualPanel" hidden><button class="mode-toggle" type="button" data-action="mode-toggle" data-ref="modeToggle"><span class="mode-toggle-label" data-ref="modeLabel"></span><em class="mode-toggle-hint" data-ref="modeHint"></em></button><div class="skill-grid" data-ref="skillGrid">${battleSkills.map((_, slot) => `<button class="skill-slot" type="button" data-skill="${slot}"><span class="skill-face"><span class="skill-icon" data-ref="icon"></span><span class="skill-name" data-ref="name"></span></span><span class="skill-cd" data-ref="cd"></span></button>`).join('')}</div></div>`;
}
/* 没有开战按钮：进入战斗区域即自动开战，进入庇护所则自动休整。 */
function battleSkeleton(): string { return `<div class="adventure-toolbar"><div class="toolbar-group"><span class="field-label" id="zone-picker-label">目标区域</span><div class="toolbar-row"><div class="zone-picker" data-ref="zonePicker"><button class="zone-trigger" type="button" data-action="zone-toggle" data-ref="zoneTrigger" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="zone-picker-label"><span data-ref="zoneLabel"></span><span class="zone-caret" aria-hidden="true">▾</span></button><div class="zone-menu" data-ref="zoneMenu" role="listbox"></div></div></div><div class="toolbar-row difficulty-row" data-ref="difficultyRow" hidden><span class="field-label">难度</span><div class="segmented" data-ref="difficultyGroup"></div></div><p class="task-hint" data-ref="taskHint"></p></div><div class="battle-state"><span class="status-dot" data-ref="statusDot"></span><span data-ref="statusText"></span></div></div>${manualPanelMarkup()}<div class="battle-arena" data-ref="arena"><article class="combatant player-side"><div class="combatant-heading"><div><span class="panel-kicker">YOUR EXPEDITION</span><h3>远征队</h3></div><span class="combatant-tag">PLAYER</span></div><div class="auto-eat is-hidden" data-ref="autoEat"><button class="auto-eat-button" type="button" data-action="auto-eat" aria-haspopup="dialog"><span class="auto-eat-icon" data-ref="autoEatIcon">🍖</span><span class="auto-eat-copy"><b data-ref="autoEatName"></b><em data-ref="autoEatHint"></em></span><span class="auto-eat-caret" aria-hidden="true">▾</span></button></div><div class="combatant-body"><div class="combatant-art player-art">队</div><div class="combatant-stats"><div><span>攻击力</span><b data-ref="playerAttack"></b></div><div><span>防御力</span><b data-ref="playerDefense"></b></div><div><span>当前生命</span><b><span data-ref="playerHp"></span><em>/</em><span data-ref="playerMaxHp"></span></b></div><div><span>生命恢复</span><b data-ref="playerRegen"></b></div></div></div><div class="health-track"><div class="health-bar player-health" data-ref="playerHealth"></div></div><div class="interval-row"><span data-ref="playerInterval"></span></div><div class="interval-track"><div class="interval-bar" data-ref="playerIntervalBar"></div></div></article><div class="versus">VS</div><article class="combatant enemy-side" data-ref="enemyCard"><div class="spawn-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="spawn-ring-track" cx="60" cy="60" r="${RING_RADIUS}"></circle><circle class="spawn-ring-bar" cx="60" cy="60" r="${RING_RADIUS}" stroke-dasharray="${RING_CIRCUMFERENCE.toFixed(2)}" data-ref="spawnRingBar"></circle></svg></div><div class="combatant-heading"><div><span class="panel-kicker" data-ref="enemyKicker"></span><h3 data-ref="enemyName"></h3></div><span class="combatant-tag enemy-tag" data-ref="enemyTag"></span></div><p class="enemy-description" data-ref="enemyDesc"></p><div class="combatant-body"><div class="combatant-art enemy-art" data-ref="enemyArt"></div><div class="combatant-stats"><div><span>攻击力</span><b data-ref="enemyAttack"></b></div><div><span>防御力</span><b data-ref="enemyDefense"></b></div><div><span>当前生命</span><b><span data-ref="enemyHp"></span><em>/</em><span data-ref="enemyMaxHp"></span></b></div><div><span>生命恢复</span><b data-ref="enemyRegen"></b></div></div></div><div class="health-track"><div class="health-bar enemy-health" data-ref="enemyHealth"></div></div><div class="interval-row"><span data-ref="enemyInterval"></span></div><div class="interval-track"><div class="interval-bar enemy-interval" data-ref="enemyIntervalBar"></div></div></article></div>`; }
const page: PageDefinition<any> = { id: 'adventure', template: './pages/adventure.html', mount(root) { const view = root.querySelector<HTMLElement>('#adventure-view')!; closeAutoEatWindow(); view.innerHTML = battleSkeleton(); root.querySelector<HTMLElement>('#log-toolbar')!.innerHTML = filterOptions.map(option => `<button class="filter-button" type="button" data-filter="${option.id}">${option.label}</button>`).join(''); const filters = [...root.querySelectorAll<HTMLButtonElement>('#log-toolbar .filter-button')]; filters.forEach(button => setClass(button, 'active', button.dataset.filter === logFilter)); /* battle 这一组 ref 必须挂在 ctx.battle 下，update 读的是 ctx.battle.xxx。 */
const ctx: any = { battle: pick(view, 'statusDot', 'statusText', 'playerAttack', 'playerDefense', 'playerHp', 'playerMaxHp', 'playerRegen', 'playerInterval', 'playerHealth', 'playerIntervalBar', 'enemyCard', 'spawnRingBar', 'enemyKicker', 'enemyName', 'enemyArt', 'enemyTag', 'enemyDesc', 'enemyAttack', 'enemyDefense', 'enemyHp', 'enemyMaxHp', 'enemyRegen', 'enemyInterval', 'enemyHealth', 'enemyIntervalBar'), ...pick(view, 'zonePicker', 'zoneTrigger', 'zoneLabel', 'zoneMenu', 'difficultyRow', 'difficultyGroup', 'taskHint', 'manualPanel', 'modeToggle', 'modeLabel', 'modeHint', 'autoEat', 'autoEatIcon', 'autoEatName', 'autoEatHint'), zoneOptions: [], zoneSignature: null, difficultyButtons: [], difficultySignature: '', skillSlots: [...view.querySelectorAll<HTMLElement>('.skill-slot')].map(slot => ({ root: slot, ...pick(slot, 'icon', 'name', 'cd') })), filters, log: root.querySelector<HTMLElement>('#adventure-log'), filter: logFilter, anchor: null, zoneOpen: false }; zonePickerCtx = ctx; root.onclick = event => { const target = event.target as Element; const action = target.closest<HTMLElement>('[data-action]')?.dataset.action; if (action === 'zone-toggle') { ctx.zoneOpen = !ctx.zoneOpen; pageController.renderCurrent(); return; } if (action === 'auto-eat') { openAutoEatWindow(); return; } /* 自动 / 手动切换：只改战斗规则，不动区域。 */ if (action === 'mode-toggle') { setManual(!isManualMode(getState())); return; } const zoneOption = target.closest<HTMLElement>('[data-zone]'); if (zoneOption) { ctx.zoneOpen = false; selectZone(Number(zoneOption.dataset.zone)); return; } /* 难度档（只对 Boss 区域可见）：换档会重刷当前敌人。 */ const difficultyButton = target.closest<HTMLElement>('[data-difficulty]'); if (difficultyButton) { selectDifficulty(Number(difficultyButton.dataset.difficulty)); return; } /* 技能槽：手动模式下点了才出手（冷却没好 / 未解锁时按钮本身是禁用的）。 */ const skillButton = target.closest<HTMLButtonElement>('[data-skill]'); if (skillButton && !skillButton.disabled) { useSkill(Number(skillButton.dataset.skill)); return; } const filter = target.closest<HTMLElement>('[data-filter]'); if (filter && filter.dataset.filter !== logFilter) { logFilter = filter.dataset.filter!; pageController.renderCurrent(); } }; return ctx; }, update(state: GameState, ctx: any) { if (ctx.filter !== logFilter) { ctx.filter = logFilter; ctx.anchor = null; ctx.filters.forEach((button: HTMLButtonElement) => setClass(button, 'active', button.dataset.filter === logFilter)); } const zoneId = currentZoneId(state); const camp = isCampZone(zoneId); /* 原地待命：还没有驻扎任何区域（开局与庇护所解锁之前）。 */ const idle = isIdleZone(zoneId); const spawning = !camp && !idle && state.adventure.spawnTimer > 0; const enemy = currentEnemy(state); const maxHp = getPlayerMaxHp(state); const playerDefense = getPlayerDefense(state); const playerRegen = getPlayerRegen(state); const playerInterval = getPlayerAttackInterval(state); const enemyInterval = getEnemyAttackInterval(state); const playerHp = Math.min(maxHp, state.adventure.playerHp); const enemyHp = Math.max(0, state.adventure.enemyHp); const battle = ctx.battle; setText(ctx.zoneLabel, idle ? '原地待命' : zones[zoneId].name); setClass(ctx.zonePicker, 'open', ctx.zoneOpen); ctx.zoneTrigger.setAttribute('aria-expanded', String(ctx.zoneOpen)); /* 未解锁的区域不进下拉：主线进度到了才追加（见 UI开发规范 §6.11）。 */
    const visibleZones = zones.map((_, id) => id).filter(id => isZoneUnlocked(id, state));
    const zoneSignature = visibleZones.join(',');
    if (ctx.zoneSignature !== zoneSignature) {
      ctx.zoneSignature = zoneSignature;
      ctx.zoneMenu.innerHTML = visibleZones.map(id => `<button class="zone-option" type="button" role="option" data-zone="${id}">${zones[id].name}</button>`).join('');
      ctx.zoneOptions = [...(ctx.zoneMenu as HTMLElement).querySelectorAll<HTMLElement>('.zone-option')];
    }
    ctx.zoneOptions.forEach((option: HTMLElement) => {
      const id = Number(option.dataset.zone);
      setClass(option, 'active', id === zoneId);
      option.setAttribute('aria-selected', String(id === zoneId));
    });
    /* 难度档：只有 Boss 区域有。按钮按名称签名重建（换档会作废场上那只未击败的，见 selectDifficulty）。 */
    const difficulties = getDifficulties(zoneId);
    setHidden(ctx.difficultyRow, difficulties.length === 0);
    if (difficulties.length) {
      const difficultySignature = difficulties.map(entry => entry.name).join(',');
      if (ctx.difficultySignature !== difficultySignature) {
        ctx.difficultySignature = difficultySignature;
        ctx.difficultyGroup.innerHTML = difficulties.map((entry, index) => `<button class="segment" type="button" data-difficulty="${index}">${entry.name}</button>`).join('');
        ctx.difficultyButtons = [...(ctx.difficultyGroup as HTMLElement).querySelectorAll<HTMLElement>('[data-difficulty]')];
      }
      ctx.difficultyButtons.forEach((button: HTMLElement, index: number) => setClass(button, 'active', index === difficultyOf(state)));
    }
    /* 研究基地的委托目标：任务物品只在委托指向的区域掉落（见 game-state 的 grantQuestDrop），
       没有这一行的话，在别处怎么刷都不掉会被当成运气差。未解锁 / 还没有委托时整行不渲染（R29）；
       已经在目标区域里时整行转主色 —— 玩家最想知道的就是「我刷对地方了吗」。 */
    const task = isResearchUnlocked(state) ? getResearchTask(state) : null;
    const taskOn = !!task && task.itemId >= 0;
    setHidden(ctx.taskHint, !taskOn);
    if (taskOn) {
      setHtml(ctx.taskHint, `研究基地的委托：到${zoneRefMarkup(task.zoneId)}收集${itemRefMarkup(task.itemId)}（${formatNumber(getResearchProgress(state))}/${formatNumber(task.need)}）。任务物品只在委托指向的区域掉落。`);
      setClass(ctx.taskHint, 'on-target', task.zoneId === zoneId);
    }
    /* 还没开放的区域**不在这里摊开**：这一页只留「研究基地的委托」那一条提示，
       区域解锁条件在图鉴的「进入条件」与解锁公告里说（两处共用同一套条件渲染，见 config/unlock.ts）。 */
    /* 自动进食栏位：研究项解锁后才出现，显示当前指定的食物与剩余数量。 */
const autoEatOn = isAutoEatUnlocked(state);
setClass(ctx.autoEat, 'is-hidden', !autoEatOn);
if (autoEatOn) {
  const foodId = getAutoEatItem(state);
  const food = foodId >= 0 ? items[foodId] : null;
  setText(ctx.autoEatIcon, food ? food.icon : '🍖');
  setText(ctx.autoEatName, food ? food.name : '未指定食物');
  setText(ctx.autoEatHint, food ? `${getAutoEatThreshold(state)}% 自动进食 · 剩 ${formatNumber(state.inventory[foodId] || 0)}` : `低于 ${getAutoEatThreshold(state)}% 时自动进食`);
}
/* 手动模式：解锁后才出现（R29）。自动模式下所有技能槽禁用 —— 切到手动才由玩家点。 */
const manualUnlocked = isManualUnlocked(state);
setHidden(ctx.manualPanel, !manualUnlocked);
if (manualUnlocked) {
  const manual = isManualMode(state);
  setText(ctx.modeLabel, manual ? '手动模式' : '自动模式');
  setText(ctx.modeHint, manual ? '点技能出手' : '自动出手');
  setClass(ctx.modeToggle, 'manual', manual);
  ctx.skillSlots.forEach((slotView: any, slot: number) => {
    const skill = battleSkills[slot];
    const unlocked = isSkillUnlocked(slot);
    const timer = getSkillTimer(slot);
    const cooling = timer > 0;
    setText(slotView.icon, skill.placeholder ? '❔' : skill.icon);
    /* 槽位上只写技能名 —— 等级在军事训练页看（那里才是练它的地方）。 */
    setText(slotView.name, !unlocked || skill.placeholder ? '???' : skill.name);
    setClass(slotView.root, 'locked', !unlocked);
    /* 冷却中：整块换成倒计时（icon 与名称让位）—— 「这一下还差多久」只用一个数字说。
       向上取到 0.1 秒：不会在最后半帧显示出「0.0s」还点不动。 */
    setClass(slotView.root, 'cooling', cooling);
    setText(slotView.cd, cooling ? `${(Math.ceil(timer * 10) / 10).toFixed(1)}s` : '');
    setDisabled(slotView.root, !manual || !unlocked || cooling);
  });
}
setClass(battle.enemyCard, 'spawning', spawning); setClass(battle.statusDot, 'paused', camp || idle || spawning); setText(battle.statusText, idle ? '原地待命' : camp ? '庇护所休整' : spawning ? '等待敌人出现' : '自动战斗中'); setNumber(battle.playerAttack, getPlayerAttack(state)); setNumber(battle.playerDefense, playerDefense); setNumber(battle.playerHp, playerHp); setNumber(battle.playerMaxHp, maxHp); setText(battle.playerRegen, formatPerSecond(playerRegen)); setText(battle.playerInterval, `攻击间隔 ${formatSeconds(playerInterval)}`); setWidth(battle.playerHealth, playerHp / maxHp * 100); setWidth(battle.playerIntervalBar, attackProgress(state.adventure.playerAttackTimer, playerInterval)); /* 刷怪冷却期间：怪物卡片里只画环形进度条，其他元素由 CSS 全部隐藏。 */
if (spawning) { const ring = battle.spawnRingBar; if (ring) { /* 分母用**这一轮**的总时长：进场是全局值、击杀后是区域的复活计时（见 startSpawnCooldown）。 */ const total = Math.max(.1, Number(state.adventure.spawnTotal) || getSpawnCooldown(state)); const progress = Math.max(0, Math.min(1, 1 - state.adventure.spawnTimer / total)); const offset = (RING_CIRCUMFERENCE * (1 - progress)).toFixed(2); if (ring.getAttribute('stroke-dashoffset') !== offset) ring.setAttribute('stroke-dashoffset', offset); } } /* 庇护所区域不刷怪：右侧卡片改成篝火，不显示敌人属性。 */
else if (idle) { setText(battle.enemyKicker, 'STANDING BY'); setText(battle.enemyTag, 'IDLE'); setText(battle.enemyName, '原地待命'); setText(battle.enemyArt, '待'); setClass(battle.enemyArt, 'camp-art', true); setText(battle.enemyDesc, '远征队还在荒野上待命 —— 从上面挑一个区域，他们就会自动出发。'); setText(battle.enemyAttack, '—'); setText(battle.enemyDefense, '—'); setText(battle.enemyHp, '—'); setText(battle.enemyMaxHp, '—'); setText(battle.enemyRegen, '—'); setWidth(battle.enemyHealth, 0); setText(battle.enemyInterval, '待命中'); setWidth(battle.enemyIntervalBar, 0); } else if (camp) { setText(battle.enemyKicker, 'RESTING POINT'); setText(battle.enemyTag, 'CAMP'); setText(battle.enemyName, '篝火'); setText(battle.enemyArt, '火'); setClass(battle.enemyArt, 'camp-art', true); setText(battle.enemyDesc, `营火不灭。这里不会遭遇敌人，生命恢复速度是野外的 ${CAMP_REGEN_MULTIPLIER} 倍。`); setText(battle.enemyAttack, '—'); setText(battle.enemyDefense, '—'); setText(battle.enemyHp, '—'); setText(battle.enemyMaxHp, '—'); setText(battle.enemyRegen, '—'); setWidth(battle.enemyHealth, 0); setText(battle.enemyInterval, '休整中'); setWidth(battle.enemyIntervalBar, 0); } else { setText(battle.enemyKicker, 'CURRENT TARGET'); setText(battle.enemyTag, 'ENEMY'); setText(battle.enemyName, enemy.name); setText(battle.enemyArt, enemy.art); setClass(battle.enemyArt, 'camp-art', false); setText(battle.enemyDesc, enemy.description); setNumber(battle.enemyAttack, enemy.attack); setNumber(battle.enemyDefense, enemy.defense || 0); /* 怪物不会自行回血，这一格固定显示「—」。 */ setText(battle.enemyRegen, '—'); setNumber(battle.enemyHp, enemyHp); setNumber(battle.enemyMaxHp, enemy.maxHp); setWidth(battle.enemyHealth, enemyHp / enemy.maxHp * 100); setText(battle.enemyInterval, `攻击间隔 ${formatSeconds(enemyInterval)}`); setWidth(battle.enemyIntervalBar, attackProgress(state.adventure.enemyAttackTimer, enemyInterval)); } syncLog(logFilter === 'all' ? state.log : state.log.filter(entry => entry.type === logFilter), ctx); } };
export default page;
