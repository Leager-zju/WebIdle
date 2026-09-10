import { getState, mainline } from '../game-state.js';

const storyLines = [
  '你从一簇微弱的火星旁醒来。远处的荒原没有灯光，只有一条旧路通往黑暗。',
  '营火重新燃起，旧哨站边缘出现了第一条可通行的路。',
  '废弃边境的机械单位并非自然失控，它们都在寻找同一个旧电池信号。',
  '重装单位身上的装甲板来自营地旧仓库。有人曾经在这里建立过第二支队伍。',
  '余烬碎片指向更深处的道路。边境调查阶段完成，但真正的远征才刚刚开始。'
];

const page = {
  id: 'story',
  async render() {
    const root = document.querySelector('#page-content');
    if (root.dataset.page !== this.id) { root.innerHTML = await fetch('./pages/story.html').then(response => response.text()); root.dataset.page = this.id; }
    const state = getState();
    const current = Math.min(state.mainlineIndex, storyLines.length - 1);
    document.querySelector('#story-view').innerHTML = `<div class="panel-heading"><div><span class="panel-kicker">CHAPTER 01 / ASHEN ROAD</span><h3>灰烬之路</h3></div><span class="muted">${state.mainlineIndex === mainline.length ? 'STAGE CLEAR' : '进行中'}</span></div><div class="story-quote large">${storyLines[current]}</div><div class="story-progress">主线解锁 ${state.mainlineIndex} / ${mainline.length}</div><div class="story-list">${mainline.map((quest, index) => `<article class="story-entry ${index < state.mainlineIndex ? 'unlocked' : ''}"><span class="story-index">${String(index + 1).padStart(2, '0')}</span><div><b>${index < state.mainlineIndex ? quest.title : '未解锁记录'}</b><p>${index < state.mainlineIndex ? quest.description : '完成前置战斗和收集目标后，这段记录会被恢复。'}</p></div><span class="zone-status">${index < state.mainlineIndex ? '已解锁' : '未知'}</span></article>`).join('')}</div>`;
  }
};

export default page;
