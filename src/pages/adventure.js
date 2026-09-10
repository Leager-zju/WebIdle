import { getState, zones, currentZone, currentEnemy, getPlayerAttack, getPlayerMaxHp, getPlayerAttackInterval, getEnemyAttackInterval, formatNumber, startAdventure, selectZone } from '../game-state.js';

let logFilter = 'all';
let templatePromise;
const filterOptions = [
  { id: 'all', label: '全部' },
  { id: 'battle', label: '战斗' },
  { id: 'drop', label: '掉落' },
  { id: 'progress', label: '成长' },
  { id: 'system', label: '系统' },
  { id: 'defeat', label: '撤退' }
];

function attackProgress(value, interval) { return Math.min(100, Math.max(0, value / interval * 100)); }
function renderLog(state) {
  const entries = logFilter === 'all' ? state.log : state.log.filter(entry => entry.type === logFilter);
  return entries.length ? entries.map(entry => `<div class="log-entry log-${entry.type}"><span class="log-time">${entry.time}</span><span class="log-kind">${entry.type}</span><span>${entry.message}</span></div>`).join('') : '<div class="log-empty">当前过滤条件下暂无信息。</div>';
}
function text(id, value) { const element = document.querySelector(`#${id}`); if (element) element.textContent = value; }
function mountBattleView(zone) {
  document.querySelector('#adventure-view').innerHTML = `<div class="adventure-toolbar"><label class="field-label" for="zone-select">目标区域<select id="zone-select">${zones.map(item => `<option value="${item.id}">${item.name}</option>`).join('')}</select></label><div class="battle-state"><span class="status-dot" id="battle-status-dot"></span><span id="battle-status-text"></span></div></div><div class="battle-arena"><article class="combatant player-side"><div class="combatant-heading"><div><span class="panel-kicker">YOUR EXPEDITION</span><h3>远征队</h3></div><span class="combatant-tag">PLAYER</span></div><div class="combatant-art player-art">队</div><div class="combatant-stats"><div><span>攻击力</span><b id="player-attack"></b></div><div><span>当前生命</span><b><span id="player-hp"></span><em>/</em><span id="player-max-hp"></span></b></div></div><div class="health-track"><div class="health-bar player-health" id="player-health-bar"></div></div><div class="interval-row"><span id="player-interval"></span></div><div class="interval-track"><div class="interval-bar" id="player-interval-bar"></div></div></article><div class="versus">VS<span id="battle-count"></span></div><article class="combatant enemy-side"><div class="combatant-heading"><div><span class="panel-kicker">CURRENT TARGET</span><h3 id="enemy-name"></h3></div><span class="combatant-tag enemy-tag">ENEMY</span></div><div class="combatant-art enemy-art" id="enemy-art"></div><p class="enemy-description" id="enemy-description"></p><div class="combatant-stats"><div><span>攻击力</span><b id="enemy-attack"></b></div><div><span>当前生命</span><b><span id="enemy-hp"></span><em>/</em><span id="enemy-max-hp"></span></b></div></div><div class="health-track"><div class="health-bar enemy-health" id="enemy-health-bar"></div></div><div class="interval-row"><span id="enemy-interval"></span></div><div class="interval-track"><div class="interval-bar enemy-interval" id="enemy-interval-bar"></div></div></article></div><div class="adventure-controls"><button class="primary-button" type="button" data-action="start" id="combat-toggle"></button></div>`;
  document.querySelector('#zone-select').value = zone.id;
}
function updateBattleView(state) {
  const zone = currentZone();
  const enemy = currentEnemy();
  const playerMaxHp = getPlayerMaxHp();
  const playerAttackInterval = getPlayerAttackInterval();
  const enemyAttackInterval = getEnemyAttackInterval();
  const playerHp = Math.min(playerMaxHp, state.adventure.playerHp);
  const enemyHp = Math.max(0, state.adventure.enemyHp);
  const playerProgress = attackProgress(state.adventure.playerAttackTimer, playerAttackInterval);
  const enemyProgress = attackProgress(state.adventure.enemyAttackTimer, enemyAttackInterval);
  const select = document.querySelector('#zone-select');
  if (select && select.value !== zone.id) select.value = zone.id;
  text('battle-status-text', state.adventure.running ? '自动战斗中' : '战斗已暂停');
  document.querySelector('#battle-status-dot')?.classList.toggle('paused', !state.adventure.running);
  text('player-attack', formatNumber(getPlayerAttack()));
  text('player-hp', formatNumber(playerHp));
  text('player-max-hp', formatNumber(playerMaxHp));
  text('player-interval', `攻击间隔 ${playerAttackInterval.toFixed(1)} 秒`);
  document.querySelector('#player-health-bar').style.width = `${playerHp / playerMaxHp * 100}%`;
  document.querySelector('#player-interval-bar').style.width = `${playerProgress}%`;
  text('battle-count', `第 ${formatNumber(state.adventure.battleCount + 1)} 场`);
  text('enemy-name', enemy.name);
  text('enemy-art', enemy.id === 'brute' ? '重' : '拾');
  text('enemy-description', enemy.description);
  text('enemy-attack', formatNumber(enemy.attack));
  text('enemy-hp', formatNumber(enemyHp));
  text('enemy-max-hp', formatNumber(enemy.maxHp));
  text('enemy-interval', `攻击间隔 ${enemyAttackInterval.toFixed(1)} 秒`);
  document.querySelector('#enemy-health-bar').style.width = `${enemyHp / enemy.maxHp * 100}%`;
  document.querySelector('#enemy-interval-bar').style.width = `${enemyProgress}%`;
  text('combat-toggle', state.adventure.running ? '暂停自动战斗' : '开始自动战斗');
}

const page = {
  id: 'adventure',
  async render() {
    const root = document.querySelector('#page-content');
    if (root.dataset.page !== this.id) {
      templatePromise ||= fetch('./pages/adventure.html').then(response => response.text());
      root.innerHTML = await templatePromise;
      root.dataset.page = this.id;
      mountBattleView(currentZone());
      root.onclick = event => {
        const action = event.target.closest('[data-action]');
        const filter = event.target.closest('[data-filter]');
        if (action?.dataset.action === 'start') startAdventure();
        if (filter) { logFilter = filter.dataset.filter; page.render(); }
      };
      root.onchange = event => { if (event.target.id === 'zone-select') selectZone(event.target.value); };
    }
    const state = getState();
    updateBattleView(state);
    document.querySelector('#log-toolbar').innerHTML = filterOptions.map(option => `<button class="filter-button ${logFilter === option.id ? 'active' : ''}" type="button" data-filter="${option.id}">${option.label}</button>`).join('');
    document.querySelector('#adventure-log').innerHTML = renderLog(state);
  }
};

export default page;
