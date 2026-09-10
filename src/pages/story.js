import { mainline } from '../game-state.js';
import { setText, setClass, pick } from '../dom.js';

const storyLines = [
  '你从一簇微弱的火星旁醒来。远处的荒原没有灯光，只有一条旧路通往黑暗。',
  '营火重新燃起，旧哨站边缘出现了第一条可通行的路。',
  '废弃边境的机械单位并非自然失控，它们都在寻找同一个旧电池信号。',
  '重装单位身上的装甲板来自营地旧仓库。有人曾经在这里建立过第二支队伍。',
  '余烬碎片指向更深处的道路。边境调查阶段完成，但真正的远征才刚刚开始。'
];

const page = {
  id: 'story',
  template: './pages/story.html',

  mount(root) {
    const view = root.querySelector('#story-view');
    const entries = mainline.map((quest, index) => `<article class="story-entry" data-index="${index}"><span class="story-index">${String(index + 1).padStart(2, '0')}</span><div><b data-ref="title"></b><p data-ref="desc"></p></div><span class="zone-status" data-ref="status"></span></article>`).join('');
    view.innerHTML = `<div class="panel-heading"><div><span class="panel-kicker">CHAPTER 01 / ASHEN ROAD</span><h3>灰烬之路</h3></div><span class="muted" data-ref="stage"></span></div><div class="story-quote large" data-ref="quote"></div><div class="story-progress" data-ref="progress"></div><div class="story-list">${entries}</div>`;

    return {
      ...pick(view, 'stage', 'quote', 'progress'),
      entries: [...view.querySelectorAll('.story-entry')].map(entry => ({ card: entry, ...pick(entry, 'title', 'desc', 'status') })),
      index: -1
    };
  },

  update(state, ctx) {
    // 剧情档案只随主线进度变化，进度没推进就完全不写 DOM。
    if (ctx.index === state.mainlineIndex) return;
    ctx.index = state.mainlineIndex;

    const current = Math.min(state.mainlineIndex, storyLines.length - 1);
    setText(ctx.stage, state.mainlineIndex === mainline.length ? 'STAGE CLEAR' : '进行中');
    setText(ctx.quote, storyLines[current]);
    setText(ctx.progress, `主线解锁 ${state.mainlineIndex} / ${mainline.length}`);

    mainline.forEach((quest, index) => {
      const refs = ctx.entries[index];
      if (!refs) return;
      const unlocked = index < state.mainlineIndex;
      setClass(refs.card, 'unlocked', unlocked);
      setText(refs.title, unlocked ? quest.title : '未解锁记录');
      setText(refs.desc, unlocked ? quest.description : '完成前置战斗和收集目标后，这段记录会被恢复。');
      setText(refs.status, unlocked ? '已解锁' : '未知');
    });
  }
};

export default page;
