import { getState, currentZone, currentEnemy, getPlayerAttack, getPlayerMaxHp, levelNeed, formatNumber, mainline } from '../game-state.js';

const page = {
  id: 'home',
  async render() {
    const root = document.querySelector('#page-content');
    if (root.dataset.page !== this.id) { root.innerHTML = await fetch('./pages/home.html').then(response => response.text()); root.dataset.page = this.id; }
    const state = getState();
    const zone = currentZone();
    const enemy = currentEnemy();
    document.querySelector('#home-resources').innerHTML = `<div class="resource"><span class="resource-label">金币 / GOLD</span><strong class="resource-value">${formatNumber(state.gold)}</strong><span class="resource-rate">击败敌人获得</span></div><div class="resource"><span class="resource-label">废料 / SCRAP</span><strong class="resource-value">${formatNumber(state.scrap)}</strong><span class="resource-rate">工坊 Lv.${state.workshop}</span></div><div class="resource"><span class="resource-label">精华 / ESSENCE</span><strong class="resource-value">${formatNumber(state.essence)}</strong><span class="resource-rate">研究资源</span></div><div class="resource"><span class="resource-label">经验 / EXP</span><strong class="resource-value">${formatNumber(state.xp)} / ${formatNumber(levelNeed())}</strong><span class="resource-rate">Lv.${state.level}</span></div><div class="resource"><span class="resource-label">远征攻击力 / POWER</span><strong class="resource-value">${formatNumber(getPlayerAttack())}</strong><span class="resource-rate">${state.adventure.running ? '战斗中' : '待命'}</span></div>`;
    document.querySelector('#home-hero').innerHTML = `<div class="panel-heading"><div><span class="panel-kicker">EXPEDITION STATUS</span><h3>${zone.name}</h3></div><span class="zone-status">${state.adventure.running ? '战斗中' : '待命'}</span></div><p class="hero-copy">${state.adventure.running ? `远征队正在与「${enemy.name}」交战。当前生命值 ${formatNumber(state.adventure.playerHp)} / ${formatNumber(getPlayerMaxHp())}。` : `目标区域：${zone.name}。下一场可能遭遇「${enemy.name}」或重装拾荒者。`}</p><div class="hero-stats"><div class="mini-stat"><span>已完成战斗</span><b>${formatNumber(state.totalWins)}</b></div><div class="mini-stat"><span>当前敌人</span><b>${enemy.name}</b></div><div class="mini-stat"><span>当前目标</span><b>${state.mainlineIndex >= mainline.length ? '调查阶段完成' : mainline[state.mainlineIndex].title}</b></div></div><button class="primary-button" data-page="adventure" type="button">${state.adventure.running ? '查看实时战斗' : '前往冒险页面'}</button>`;
    document.querySelector('#home-quest').innerHTML = `<div class="panel-heading"><div><span class="panel-kicker">MAINLINE</span><h3>当前主线</h3></div><span class="muted">${state.mainlineIndex}/${mainline.length}</span></div>${state.mainlineIndex < mainline.length ? `<article class="quest"><div class="quest-title"><span>${mainline[state.mainlineIndex].title}</span><span>进行中</span></div><p class="quest-desc">${mainline[state.mainlineIndex].description}</p><div class="quest-reward">${mainline[state.mainlineIndex].reward}</div></article>` : '<div class="story-quote">边境调查阶段已经完成。新的区域信号正在等待确认。</div>'}<button class="secondary-button wide" data-page="inventory" type="button">打开物品栏</button>`;
    document.querySelector('#home-log').innerHTML = state.log.length ? state.log.slice(0, 6).map(entry => `<div class="log-entry log-${entry.type || 'system'}"><span class="log-time">${entry.time}</span><span>${entry.message}</span></div>`).join('') : '<div class="log-entry"><span class="log-time">现在</span><span>战斗记录将在远征队出发后出现。</span></div>';
  }
};

export default page;
