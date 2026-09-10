import { getState, getPower, upgradeWorkshop, upgradeResearch, upgradeCompanions } from '../game-state.js';

const page = {
  id: 'systems',
  async render() {
    const root = document.querySelector('#page-content');
    if (root.dataset.page !== this.id) { root.innerHTML = await fetch('./pages/systems.html').then(response => response.text()); root.dataset.page = this.id; }
    const state = getState();
    const workshopCost = 40 + state.workshop * 35;
    const researchCost = 2 + state.research * 3;
    const companionGold = 100 + state.companions * 90;
    const companionEssence = 4 + state.companions * 3;
    const cards = [
      `<article class="system-card"><h3>自动冒险</h3><p>基础系统。离线期间继续推进已选择的区域。</p><div class="system-action"><span class="cost">永久运行</span><span class="zone-status">已解锁</span></div></article>`,
      `<article class="system-card ${state.mainlineIndex >= 2 ? '' : 'locked'}"><h3>工坊 · Lv.${state.workshop}</h3><p>${state.mainlineIndex >= 2 ? '消耗废料强化营地，每级提高冒险材料收益与战力。' : '完成第一片区域后解锁。'}</p><div class="system-action">${state.mainlineIndex >= 2 ? `<span class="cost">${workshopCost} 废料</span><button class="secondary-button" type="button" data-action="workshop" ${state.scrap < workshopCost ? 'disabled' : ''}>升级</button>` : '<span class="zone-status">未解锁</span>'}</div></article>`,
      `<article class="system-card ${state.mainlineIndex >= 3 ? '' : 'locked'}"><h3>研究 · Lv.${state.research}</h3><p>${state.mainlineIndex >= 3 ? '消耗精华研究新技术，每级提高全局冒险战力。' : '收集 3 个旧电池后解锁。'}</p><div class="system-action">${state.mainlineIndex >= 3 ? `<span class="cost">${researchCost} 精华</span><button class="secondary-button" type="button" data-action="research" ${state.essence < researchCost ? 'disabled' : ''}>研究</button>` : '<span class="zone-status">未解锁</span>'}</div></article>`,
      `<article class="system-card ${state.mainlineIndex >= 4 ? '' : 'locked'}"><h3>伙伴 · Lv.${state.companions}</h3><p>${state.mainlineIndex >= 4 ? '招募伙伴扩大队伍，每级提高战力。' : '收集 3 个装甲板后解锁。'}</p><div class="system-action">${state.mainlineIndex >= 4 ? `<span class="cost">${companionGold} 金币 · ${companionEssence} 精华</span><button class="secondary-button" type="button" data-action="companions" ${state.gold < companionGold || state.essence < companionEssence ? 'disabled' : ''}>招募</button>` : '<span class="zone-status">未解锁</span>'}</div></article>`
    ];
    document.querySelector('#systems-view').innerHTML = `<div class="systems-summary"><span class="panel-kicker">GLOBAL POWER</span><strong>${getPower()}</strong><span>当前远征战力</span></div><div class="system-list">${cards.join('')}</div>`;
    root.onclick = event => { const button = event.target.closest('[data-action]'); if (!button || button.disabled) return; if (button.dataset.action === 'workshop') upgradeWorkshop(); if (button.dataset.action === 'research') upgradeResearch(); if (button.dataset.action === 'companions') upgradeCompanions(); };
  }
};

export default page;
