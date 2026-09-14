import { mainline, achievements, isAchievementUnlocked, getUnlockedAchievementCount } from '../game-state';
import { setText, setHtml, setClass, setHidden, pick } from '../dom';
import { renderCodexTags } from '../codex-ref';
import pageController from '../page-controller';
import type { GameState, PageDefinition } from '../types';

/* 章节节点的旁白：下标与 mainline 对应，既是节点的「剧情」，也是详情页里那段正文。 */
const storyLines = ['你从一簇微弱的火星旁醒来。远处的荒原没有灯光，只有一条旧路通往黑暗。', '营火重新燃起，旧哨站边缘出现了第一条可通行的路。', '废弃边境的机械单位并非自然失控，它们都在寻找同一个旧电池信号。', '重装单位身上的装甲板来自营地旧仓库。有人曾经在这里建立过第二支队伍。', '余烬碎片指向更深处的道路。边境调查阶段完成，但真正的远征才刚刚开始。', '第一场天灾被挡在挡墙之外。营地开始相信这堆火能烧很久。', '兽潮退去。荒野深处还有更大的信号，而这次远征已经不再孤单。'];

/* ——— 左栏：章节树 ———
   一章下面挂若干个主线节点（下标即 mainline 的下标）。
   第二章目前还没有内容，用 locked 占位：第一章的记录全部恢复后才会开放。 */
const chapters = [
  { kicker: 'CHAPTER 01 / ASHEN ROAD', title: '灰烬之路', nodes: mainline.map((_, index) => index), locked: false },
  { kicker: 'CHAPTER 02 / LOCKED', title: '后续章节', nodes: [] as number[], locked: true }
];
const chapterMarkup = (chapter: typeof chapters[number], chapterIndex: number): string => `<li class="tree-branch" data-chapter="${chapterIndex}"><button class="tree-node" type="button" data-chapter="${chapterIndex}"><span class="tree-caret" aria-hidden="true">▾</span><span class="tree-copy"><span class="tree-kicker">${chapter.kicker}</span><b class="tree-title">${chapter.title}</b></span><span class="tree-badge" data-ref="badge"></span></button><ul class="tree-children">${chapter.nodes.map(index => `<li class="tree-leaf" data-node="${index}"><span class="tree-dot" aria-hidden="true"></span><span class="tree-leaf-copy"><b class="tree-leaf-title" data-ref="title"></b><span class="tree-reward" data-ref="reward"></span></span><span class="tree-status" data-ref="status"></span></li>`).join('')}</ul></li>`;

/* ——— 右栏（主线剧情页签）：选中节点的剧情与解锁条件 ——— */
const detailMarkup = `<div class="panel-heading"><div><span class="panel-kicker" data-ref="detailKicker"></span><h3 data-ref="detailTitle"></h3></div><span class="muted" data-ref="detailStatus"></span></div>
  <p class="story-quote" data-ref="detailStory"></p>
  <div class="chapter-facts"><div class="chapter-fact"><span>解锁条件</span><b data-ref="detailGoal"></b></div><div class="chapter-requirements" data-ref="detailRequirements"></div><div class="chapter-fact"><span>解锁后</span><b data-ref="detailReward"></b></div></div>`;

/* ——— 成就页签：卡面只有图标，名称 / 状态 / 解锁条件 / 解锁后 在悬停浮层里 ——— */
const achievementMarkup = (entry: typeof achievements[number], index: number): string => `<article class="achievement-card" data-achievement="${index}" tabindex="0"><span class="achievement-icon" data-ref="icon" aria-hidden="true">${entry.icon}</span><div class="achievement-detail"><div class="achievement-head"><b>${entry.name}</b><span class="achievement-status" data-ref="status"></span></div><p class="achievement-line" data-ref="condition"></p><p class="achievement-line achievement-reward" data-ref="reward"></p></div></article>`;

const page: PageDefinition<any> = {
  id: 'story', template: './pages/story.html',
  mount(root) {
    const view = root.querySelector<HTMLElement>('#story-view')!;
    view.innerHTML = `
      <div class="tab-bar" role="tablist">${[['main', '主线剧情'], ['achievements', '成就']].map(([id, label]) => `<button class="tab" type="button" role="tab" data-tab="${id}">${label}</button>`).join('')}</div>
      <div class="tab-pane" data-pane="main"><div class="archive-layout">
        <section class="panel archive-panel">
          <div class="panel-heading"><div><span class="panel-kicker">CHAPTERS</span><h3>章节进度</h3></div><span class="muted" data-ref="chapterProgress"></span></div>
          <ul class="tree">${chapters.map(chapterMarkup).join('')}</ul>
        </section>
        <section class="panel archive-panel">${detailMarkup}</section>
      </div></div>
      <div class="tab-pane" data-pane="achievements"><div class="archive-layout">
        <section class="panel archive-panel">
          <div class="panel-heading"><div><span class="panel-kicker">ACHIEVEMENTS</span><h3>成就</h3></div><span class="muted" data-ref="achievementProgress"></span></div>
          <p class="archive-hint">悬停（或键盘聚焦）图标查看解锁条件与奖励。</p>
          <div class="achievement-grid">${achievements.map(achievementMarkup).join('')}</div>
        </section>
      </div></div>`;
    const ctx: any = {
      ...pick(view, 'chapterProgress', 'achievementProgress', 'detailKicker', 'detailTitle', 'detailStatus', 'detailStory', 'detailGoal', 'detailReward', 'detailRequirements'),
      tabs: [...view.querySelectorAll<HTMLElement>('[data-tab]')],
      panes: [...view.querySelectorAll<HTMLElement>('[data-pane]')],
      branches: [...view.querySelectorAll<HTMLElement>('.tree-branch')].map(branch => ({ branch, badge: branch.querySelector<HTMLElement>('.tree-badge'), leaves: [...branch.querySelectorAll<HTMLElement>('.tree-leaf')].map(leaf => ({ leaf, ...pick(leaf, 'title', 'reward', 'status') })) })),
      cards: [...view.querySelectorAll<HTMLElement>('.achievement-card')].map(card => ({ card, ...pick(card, 'icon', 'status', 'condition', 'reward') })),
      collapsed: new Set<number>(), selected: -1, tab: 'main'
    };
    root.onclick = event => {
      const target = event.target as Element;
      const tab = target.closest<HTMLElement>('[data-tab]');
      if (tab) { ctx.tab = tab.dataset.tab; pageController.renderCurrent(); return; }
      const chapterButton = target.closest<HTMLElement>('button[data-chapter]');
      if (chapterButton) { const index = Number(chapterButton.dataset.chapter); if (ctx.collapsed.has(index)) ctx.collapsed.delete(index); else ctx.collapsed.add(index); pageController.renderCurrent(); return; }
      const leaf = target.closest<HTMLElement>('.tree-leaf');
      if (leaf) { ctx.selected = Number(leaf.dataset.node); pageController.renderCurrent(); }
    };
    return ctx;
  },
  update(state: GameState, ctx: any) {
    ctx.tabs.forEach((tab: HTMLElement) => setClass(tab, 'active', tab.dataset.tab === ctx.tab));
    ctx.panes.forEach((pane: HTMLElement) => setHidden(pane, pane.dataset.pane !== ctx.tab));

    setText(ctx.chapterProgress, `${Math.min(state.mainlineIndex, mainline.length)} / ${mainline.length}`);
    /* 没有点选过任何节点时，默认展示当前正在推进的那一节（全部完成后停在最后一节）。 */
    const activeIndex = ctx.selected >= 0 ? ctx.selected : Math.min(state.mainlineIndex, mainline.length - 1);
    chapters.forEach((chapter, chapterIndex) => {
      const refs = ctx.branches[chapterIndex];
      if (!refs) return;
      const locked = !!chapter.locked && state.mainlineIndex < mainline.length;
      setClass(refs.branch, 'locked', locked);
      setClass(refs.branch, 'collapsed', ctx.collapsed.has(chapterIndex));
      const done = Math.min(state.mainlineIndex, chapter.nodes.length);
      setText(refs.badge, locked ? '未开放' : chapter.nodes.length ? `${done} / ${chapter.nodes.length}` : '待开放');
      chapter.nodes.forEach((index, nodeIndex) => {
        const leaf = refs.leaves[nodeIndex];
        if (!leaf) return;
        const completed = index < state.mainlineIndex;
        const current = index === state.mainlineIndex;
        const known = completed || current;
        setClass(leaf.leaf, 'done', completed);
        setClass(leaf.leaf, 'current', current);
        setClass(leaf.leaf, 'selected', index === activeIndex);
        setText(leaf.title, known ? mainline[index].title : '未解锁记录');
        setText(leaf.reward, known ? mainline[index].reward : '??? 待恢复');
        setText(leaf.status, completed ? '已完成' : current ? '进行中' : '未解锁');
      });
    });
    /* 右侧详情：跟着选中的节点走。 */
    const quest = mainline[activeIndex];
    const known = activeIndex <= state.mainlineIndex;
    const completed = activeIndex < state.mainlineIndex;
    setText(ctx.detailKicker, activeIndex === state.mainlineIndex ? 'CURRENT OBJECTIVE' : `CHAPTER 01 / NODE ${String(activeIndex + 1).padStart(2, '0')}`);
    setText(ctx.detailTitle, known ? quest.title : '未解锁记录');
    setText(ctx.detailStatus, completed ? '已完成' : activeIndex === state.mainlineIndex ? '进行中' : '未解锁');
    setText(ctx.detailStory, known ? storyLines[Math.min(activeIndex, storyLines.length - 1)] : '完成前一节之后，这段记录会被恢复。');
    setText(ctx.detailGoal, known ? quest.description : '???');
    /* 具体条件逐条列出，达成的用 status-dot 点亮（与冒险页的状态点同一个类）。 */
    setHtml(ctx.detailRequirements, known
      /* text() 返回的引用 HTML 直接可用；再过一遍 renderCodexTags 是兜底——万一某条文案写成 [[kind:id]] 标记，也不会把标记原样显示出来。 */
      ? quest.requirements.map(entry => { const done = entry.done(state); return `<div class="requirement ${done ? 'done' : ''}"><span class="status-dot ${done ? '' : 'pending'}"></span><span>${renderCodexTags(entry.text(state))}</span></div>`; }).join('')
      : '<div class="requirement"><span class="status-dot pending"></span><span>???</span></div>');
    setText(ctx.detailReward, known ? quest.reward : '???');

    achievements.forEach((entry, index) => {
      const refs = ctx.cards[index];
      if (!refs) return;
      const unlocked = isAchievementUnlocked(index, state);
      setClass(refs.card, 'unlocked', unlocked);
      setClass(refs.card, 'locked', !unlocked);
      /* 未解锁的成就连图标都不露，只给一个问号（秘密成就在浮层里也不提条件）。 */
      setText(refs.icon, unlocked ? entry.icon : '❓');
      setText(refs.status, unlocked ? '已解锁' : '未解锁');
      setText(refs.condition, unlocked || !entry.secret ? `解锁条件：${entry.hint}` : '秘密成就，继续探索吧！');
      setText(refs.reward, unlocked || !entry.secret ? `解锁奖励：${entry.reward}` : '解锁奖励：???');
    });
    setText(ctx.achievementProgress, `已解锁 ${getUnlockedAchievementCount(state)} / ${achievements.length}`);
  }
};
export default page;
