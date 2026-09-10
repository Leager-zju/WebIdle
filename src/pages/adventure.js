import { zones, currentZone, currentEnemy, getPlayerAttack, getPlayerMaxHp, getPlayerAttackInterval, getEnemyAttackInterval, formatNumber, startAdventure, selectZone } from '../game-state.js';
import { setText, setWidth, setClass, pick, toFragment } from '../dom.js';
import pageController from '../page-controller.js';

let logFilter = 'all';
const filterOptions = [
  { id: 'all', label: '全部' },
  { id: 'battle', label: '战斗' },
  { id: 'drop', label: '掉落' },
  { id: 'progress', label: '成长' },
  { id: 'system', label: '系统' },
  { id: 'defeat', label: '撤退' }
];

function attackProgress(value, interval) { return Math.min(100, Math.max(0, value / interval * 100)); }
function entryMarkup(entry) {
  return `<div class="log-entry log-${entry.type}"><span class="log-time">${entry.time}</span><span class="log-kind">${entry.type}</span><span>${entry.message}</span></div>`;
}
function buildEntries(entries) {
  return toFragment(entries.length
    ? entries.map(entryMarkup).join('')
    : '<div class="log-empty">当前过滤条件下暂无信息。</div>');
}
const EMPTY_LOG = {};
// 日志只增不减（上限 160 条），因此只在头部插入新增条目并裁掉尾部，不重建整列表。
function syncLog(entries, ctx) {
  const container = ctx.log;
  if (!entries.length) {
    if (ctx.anchor === EMPTY_LOG) return;
    ctx.anchor = EMPTY_LOG;
    container.replaceChildren(buildEntries(entries));
    return;
  }
  const anchor = ctx.anchor ? entries.indexOf(ctx.anchor) : -1;
  if (anchor < 0) {
    ctx.anchor = entries[0] || null;
    container.replaceChildren(buildEntries(entries));
    return;
  }
  if (anchor > 0) {
    const first = container.firstElementChild;
    if (first && first.classList.contains('log-empty')) first.remove();
    container.insertBefore(buildEntries(entries.slice(0, anchor)), container.firstElementChild);
  }
  const expected = Math.max(entries.length, 1);
  while (container.childElementCount > expected) container.lastElementChild.remove();
}

function battleSkeleton() {
  return `<div class="adventure-toolbar"><label class="field-label" for="zone-select">目标区域<select id="zone-select">${zones.map(item => `<option value="${item.id}">${item.name}</option>`).join('')}</select></label><div class="battle-state"><span class="status-dot" data-ref="statusDot"></span><span data-ref="statusText"></span></div></div>
<div class="battle-arena">
<article class="combatant player-side"><div class="combatant-heading"><div><span class="panel-kicker">YOUR EXPEDITION</span><h3>远征队</h3></div><span class="combatant-tag">PLAYER</span></div><div class="combatant-art player-art">队</div><div class="combatant-stats"><div><span>攻击力</span><b data-ref="playerAttack"></b></div><div><span>当前生命</span><b><span data-ref="playerHp"></span><em>/</em><span data-ref="playerMaxHp"></span></b></div></div><div class="health-track"><div class="health-bar player-health" data-ref="playerHealth"></div></div><div class="interval-row"><span data-ref="playerInterval"></span></div><div class="interval-track"><div class="interval-bar" data-ref="playerIntervalBar"></div></div></article>
<div class="versus">VS<span data-ref="count"></span></div>
<article class="combatant enemy-side"><div class="combatant-heading"><div><span class="panel-kicker">CURRENT TARGET</span><h3 data-ref="enemyName"></h3></div><span class="combatant-tag enemy-tag">ENEMY</span></div><div class="combatant-art enemy-art" data-ref="enemyArt"></div><p class="enemy-description" data-ref="enemyDesc"></p><div class="combatant-stats"><div><span>攻击力</span><b data-ref="enemyAttack"></b></div><div><span>当前生命</span><b><span data-ref="enemyHp"></span><em>/</em><span data-ref="enemyMaxHp"></span></b></div></div><div class="health-track"><div class="health-bar enemy-health" data-ref="enemyHealth"></div></div><div class="interval-row"><span data-ref="enemyInterval"></span></div><div class="interval-track"><div class="interval-bar enemy-interval" data-ref="enemyIntervalBar"></div></div></article>
</div>
<div class="adventure-controls"><button class="primary-button" type="button" data-action="start" data-ref="toggle"></button></div>`;
}

const page = {
  id: 'adventure',
  template: './pages/adventure.html',

  mount(root) {
    const view = root.querySelector('#adventure-view');
    view.innerHTML = battleSkeleton();
    root.querySelector('#log-toolbar').innerHTML = filterOptions
      .map(option => `<button class="filter-button" type="button" data-filter="${option.id}">${option.label}</button>`)
      .join('');

    const filters = [...root.querySelectorAll('#log-toolbar .filter-button')];
    filters.forEach(button => setClass(button, 'active', button.dataset.filter === logFilter));
    view.querySelector('#zone-select').value = currentZone().id;

    root.onclick = event => {
      const action = event.target.closest('[data-action]');
      const filter = event.target.closest('[data-filter]');
      if (action?.dataset.action === 'start') startAdventure();
      if (filter && filter.dataset.filter !== logFilter) { logFilter = filter.dataset.filter; pageController.renderCurrent(); }
    };
    root.onchange = event => { if (event.target.id === 'zone-select') selectZone(event.target.value); };

    return {
      battle: pick(view, 'statusDot', 'statusText', 'playerAttack', 'playerHp', 'playerMaxHp', 'playerInterval', 'playerHealth', 'playerIntervalBar', 'count', 'enemyName', 'enemyArt', 'enemyDesc', 'enemyAttack', 'enemyHp', 'enemyMaxHp', 'enemyInterval', 'enemyHealth', 'enemyIntervalBar', 'toggle'),
      zoneSelect: view.querySelector('#zone-select'),
      filters,
      log: root.querySelector('#adventure-log'),
      filter: logFilter,
      anchor: null
    };
  },

  update(state, ctx) {
    if (ctx.filter !== logFilter) {
      ctx.filter = logFilter;
      ctx.anchor = null;
      ctx.filters.forEach(button => setClass(button, 'active', button.dataset.filter === logFilter));
    }

    const zone = currentZone(state);
    const enemy = currentEnemy(state);
    const playerMaxHp = getPlayerMaxHp(state);
    const playerInterval = getPlayerAttackInterval(state);
    const enemyInterval = getEnemyAttackInterval(state);
    const playerHp = Math.min(playerMaxHp, state.adventure.playerHp);
    const enemyHp = Math.max(0, state.adventure.enemyHp);
    const battle = ctx.battle;

    if (ctx.zoneSelect && ctx.zoneSelect.value !== zone.id) ctx.zoneSelect.value = zone.id;
    setClass(battle.statusDot, 'paused', !state.adventure.running);
    setText(battle.statusText, state.adventure.running ? '自动战斗中' : '战斗已暂停');
    setText(battle.playerAttack, formatNumber(getPlayerAttack(state)));
    setText(battle.playerHp, formatNumber(playerHp));
    setText(battle.playerMaxHp, formatNumber(playerMaxHp));
    setText(battle.playerInterval, `攻击间隔 ${playerInterval.toFixed(1)} 秒`);
    setWidth(battle.playerHealth, playerHp / playerMaxHp * 100);
    setWidth(battle.playerIntervalBar, attackProgress(state.adventure.playerAttackTimer, playerInterval));
    setText(battle.count, `第 ${formatNumber(state.adventure.battleCount + 1)} 场`);
    setText(battle.enemyName, enemy.name);
    setText(battle.enemyArt, enemy.id === 'brute' ? '重' : '拾');
    setText(battle.enemyDesc, enemy.description);
    setText(battle.enemyAttack, formatNumber(enemy.attack));
    setText(battle.enemyHp, formatNumber(enemyHp));
    setText(battle.enemyMaxHp, formatNumber(enemy.maxHp));
    setText(battle.enemyInterval, `攻击间隔 ${enemyInterval.toFixed(1)} 秒`);
    setWidth(battle.enemyHealth, enemyHp / enemy.maxHp * 100);
    setWidth(battle.enemyIntervalBar, attackProgress(state.adventure.enemyAttackTimer, enemyInterval));
    setText(battle.toggle, state.adventure.running ? '暂停自动战斗' : '开始自动战斗');

    syncLog(logFilter === 'all' ? state.log : state.log.filter(entry => entry.type === logFilter), ctx);
  }
};

export default page;
