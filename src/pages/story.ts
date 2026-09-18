import { FIRST_CHAPTER, mainline, storyChapters, getChapterProgress, getChapterNodeCount, isChapterVisible, isStoryNodeDone, currentStoryNode, achievements, isAchievementUnlocked, getUnlockedAchievementCount, getState } from '../game-state';
import { setText, setHtml, setClass, setHidden, pick } from '../dom';
import { renderCodexTags } from '../codex-ref';
import pageController from '../page-controller';
import type { GameState, PageDefinition } from '../types';

/* 章节旁白：**一章一张表，下标 = 那一章里的节序号**。它是节点的「剧情」，也是详情页里那段正文。
   新增一章时在这里补一张表（缺表不会出错 —— 正文留空而已；别去别的章节借句子）。 */
const chapterStory: string[][] = [
  ['你从一簇微弱的火星旁醒来。远处的荒原没有灯光，只有一条旧路通往黑暗。', '营火重新燃起，旧哨站边缘出现了第一条可通行的路。', '废弃边境的机械单位并非自然失控，它们都在寻找同一个旧电池信号。', '重装单位身上的装甲板来自庇护所旧仓库。有人曾经在这里建立过第二支队伍。', '余烬碎片指向更深处的道路。边境调查阶段完成，但真正的远征才刚刚开始。', '第一场天灾被挡在挡墙之外。庇护所开始相信这堆火能烧很久。', '兽潮退去。荒野深处还有更大的信号，而这次远征已经不再孤单。', '异种留下的痕迹指向更深的地方 —— 那边不再是边境，是要走进去的荒野。'],
  ['矿道比地图上画的深得多，结晶化的单位还在往更暗的地方退。清完这一段，基地要的样本也就够了。', '井壁上的读数一段比一段密。信号已经清晰到能被认出来 —— 它一直在重复同一句。', '裂谷尽头不是尽头，是一扇门。门后的东西从很早就开始听着这片荒野。', '门后面的东西没有留下任何取巧的余地 —— 它只是厚、只是烫。把它击碎的那一晚，基地第一次没有听见核心信号。']
];

/* ——— 左栏：章节树 ———
   一章下面挂若干节。**每一章都照第一章的做法**（R31）：
   - 章内**严格顺序推进**：上一节没做完，下一节就是 `???`（标题 / 正文 / 解锁条件 / 奖励全遮）；
   - **整章要等前面每一章都走完才出现**（`isChapterVisible()`，唯一判定点）；
   - 章号从 1 起，与玩家看到的编号一致。

   章节表由 game-state 的两份数据拼成：第一章（`FIRST_CHAPTER` + `mainline`）与后续章节（`storyChapters`）——
   这里不再各存一份标题，改标题只改那边一处。 */
const chapterTable = [{ ...FIRST_CHAPTER, nodes: mainline }, ...storyChapters];
/** 一节的唯一键（`2:1` = 第二章第一节）：选择状态存的就是它。 */
const nodeKey = (chapter: number, index: number): string => `${chapter}:${index}`;
/** 一节完成 / 正在进行：两者都由「那一章的进度」推出来（下标在前 = 已完成）。 */
const nodeDone = (chapter: number, index: number, state: GameState): boolean => isStoryNodeDone(chapter, index, state);
const nodeCurrent = (chapter: number, index: number, state: GameState): boolean => index === getChapterProgress(chapter, state);
const chapterMarkup = (chapter: typeof chapterTable[number], number: number): string => `<li class="tree-branch" data-chapter="${number}"><button class="tree-node" type="button" data-chapter="${number}"><span class="tree-caret" aria-hidden="true">▾</span><span class="tree-copy"><span class="tree-kicker">${chapter.kicker}</span><b class="tree-title">${chapter.title}</b></span><span class="tree-badge" data-ref="badge"></span></button><ul class="tree-children">${chapter.nodes.map((_, index) => `<li class="tree-leaf" data-node="${nodeKey(number, index)}"><span class="tree-dot" aria-hidden="true"></span><span class="tree-leaf-copy"><b class="tree-leaf-title" data-ref="title"></b><span class="tree-reward" data-ref="reward"></span></span><span class="tree-status" data-ref="status"></span></li>`).join('')}</ul></li>`;

/* ——— 右栏（主线剧情页签）：选中节点的剧情与解锁条件 ———
   「解锁条件」一句话 + 逐条进度 + 「解锁后」。 */
const detailMarkup = `<div class="panel-heading"><div><span class="panel-kicker" data-ref="detailKicker"></span><h3 data-ref="detailTitle"></h3></div><span class="muted" data-ref="detailStatus"></span></div>
  <p class="story-quote" data-ref="detailStory"></p>
  <div class="chapter-facts"><div class="chapter-fact"><span>解锁条件</span><b data-ref="detailGoal"></b></div><div class="chapter-requirements" data-ref="detailRequirements"></div><div class="chapter-fact"><span>解锁后</span><b data-ref="detailReward"></b></div></div>`;

/* 条件行两种渲染（见 UI开发规范 §6.7）：
   - **还没走完的节**：逐条现算 —— 达成了点亮、没达成给灰点，进度跟着背包实时变；
   - **已经走完的节**：一律渲染成「~~条件原文~~ 已完成」。**封存**，不再调 `done()` / 不再看背包：
     条件是「达成过」而不是「此刻仍然成立」（装甲板卖掉、精华花掉都不该让走完的主线退回未完成）。
     代价是原文里的进度数字保持实时（规则只给一个 `text()`，没有"达成时的快照"）——
     所以它才要划掉：要读的是后面那个「已完成」。 */
const requirementMarkup = (text: string, done: boolean): string => `<div class="requirement ${done ? 'done' : ''}"><span class="status-dot ${done ? '' : 'pending'}"></span><span>${renderCodexTags(text)}</span></div>`;
const requirementSettledMarkup = (text: string): string => `<div class="requirement done settled"><span class="status-dot"></span><span><s>${renderCodexTags(text)}</s> <b>已完成</b></span></div>`;

/* ——— 成就页签：卡片与物品储藏 / 研究项是**同一套磁贴**（`.item-card` + `.item-icon` + `.item-detail`），
   小一号（`.tile-compact`）—— 差别只有「没有稀有度描边」这一条（见 UI开发规范 §6.5）。
   卡面只有图标，名称 / 状态 / 解锁条件 / 解锁后 都在悬停浮层里；未解锁的也占着格子（图标换成 ❓）。 */
const achievementMarkup = (entry: typeof achievements[number], index: number): string => `<article class="item-card achievement-card" data-achievement="${index}" tabindex="0"><div class="item-icon" data-ref="icon" aria-hidden="true">${entry.icon}</div><div class="item-detail achievement-detail"><div class="achievement-head"><b>${entry.name}</b><span class="achievement-status" data-ref="status"></span></div><p class="achievement-line" data-ref="condition"></p><p class="achievement-line achievement-reward" data-ref="reward"></p></div></article>`;

const page: PageDefinition<any> = {
  id: 'story', template: './pages/story.html',
  mount(root) {
    const view = root.querySelector<HTMLElement>('#story-view')!;
    view.innerHTML = `
      <div class="tab-bar" role="tablist">${[['main', '主线剧情'], ['achievements', '成就']].map(([id, label]) => `<button class="tab" type="button" role="tab" data-tab="${id}">${label}</button>`).join('')}</div>
      <div class="tab-pane" data-pane="main"><div class="archive-layout">
        <section class="panel archive-panel">
          <div class="panel-heading"><div><span class="panel-kicker">CHAPTERS</span><h3>章节进度</h3></div></div>
          <p class="archive-hint">每一章都要等上一章全部走完才会出现。点任意节点，右边显示那一节的记录与解锁条件。</p>
          <ul class="tree">${chapterTable.map((chapter, index) => chapterMarkup(chapter, index + 1)).join('')}</ul>
        </section>
        <section class="panel archive-panel">${detailMarkup}</section>
      </div></div>
      <div class="tab-pane" data-pane="achievements"><section class="panel archive-panel">
        <div class="panel-heading"><div><span class="panel-kicker">ACHIEVEMENTS</span><h3>成就</h3></div><span class="muted" data-ref="achievementProgress"></span></div>
        <p class="archive-hint">悬停（或键盘聚焦）图标查看解锁条件与奖励。</p>
        <div class="item-grid storage-grid tile-compact">${achievements.map(achievementMarkup).join('')}</div>
      </section></div>`;
    const ctx: any = {
      ...pick(view, 'achievementProgress', 'detailKicker', 'detailTitle', 'detailStatus', 'detailStory', 'detailGoal', 'detailReward', 'detailRequirements'),
      tabs: [...view.querySelectorAll<HTMLElement>('[data-tab]')],
      panes: [...view.querySelectorAll<HTMLElement>('[data-pane]')],
      branches: [...view.querySelectorAll<HTMLElement>('.tree-branch')].map(branch => ({ branch, badge: branch.querySelector<HTMLElement>('.tree-badge'), leaves: [...branch.querySelectorAll<HTMLElement>('.tree-leaf')].map(leaf => ({ leaf, ...pick(leaf, 'title', 'reward', 'status') })) })),
      cards: [...view.querySelectorAll<HTMLElement>('.achievement-card')].map(card => ({ card, ...pick(card, 'icon', 'status', 'condition', 'reward') })),
      /* 树上**一次只展开一章**：`openChapter` 就是展开的那一章（从 1 起），-1 = 全折起来。
         初值取「当前这一章」（第一个还没走完的节所在的那章）；全走完时展开最后一章。 */
      openChapter: currentStoryNode(getState())?.chapter || chapterTable.length, selected: '', tab: 'main'
    };
    root.onclick = event => {
      const target = event.target as Element;
      const tab = target.closest<HTMLElement>('[data-tab]');
      if (tab) { ctx.tab = tab.dataset.tab; pageController.renderCurrent(); return; }
      const chapterButton = target.closest<HTMLElement>('button[data-chapter]');
      /* 点章节标题：展开这一章（其他章自动折起）；点已经展开的那一章 = 全部折起。 */
      if (chapterButton) { const number = Number(chapterButton.dataset.chapter); ctx.openChapter = ctx.openChapter === number ? -1 : number; pageController.renderCurrent(); return; }
      const leaf = target.closest<HTMLElement>('.tree-leaf');
      /* 选择状态存的是节点键（`2:1`），不是下标 —— 跨章之后下标会撞车。 */
      if (leaf) { ctx.selected = leaf.dataset.node || ''; pageController.renderCurrent(); }
    };
    return ctx;
  },
  update(state: GameState, ctx: any) {
    ctx.tabs.forEach((tab: HTMLElement) => setClass(tab, 'active', tab.dataset.tab === ctx.tab));
    ctx.panes.forEach((pane: HTMLElement) => setHidden(pane, pane.dataset.pane !== ctx.tab));

    /* 选中的节：没点过、或点过的那一节所在的章又不可见了（重开 / 改档），就落回**当前这一节** ——
       `currentStoryNode()` 是跨章的「第一个还没走完的节」，全部走完时返回 null，此时停在最后一节。
       注意 visibleKeys 只收**已出现**的章：隐藏的章里选不出东西来。 */
    const current = currentStoryNode(state);
    const visibleKeys: string[] = [];
    chapterTable.forEach((chapter, index) => { const number = index + 1; if (isChapterVisible(number, state)) chapter.nodes.forEach((_, nodeIndex) => visibleKeys.push(nodeKey(number, nodeIndex))); });
    const fallback = current ? nodeKey(current.chapter, current.index) : (visibleKeys[visibleKeys.length - 1] || '');
    const selected = visibleKeys.includes(ctx.selected) ? ctx.selected : fallback;
    const [selectedChapter, selectedIndex] = selected.split(':').map(Number);

    chapterTable.forEach((chapter, index) => {
      const number = index + 1;
      const refs = ctx.branches[index];
      if (!refs) return;
      /* 前一章没走完 ⇒ 整章**不出现**（不是变灰：连标题都不给）。已出现的章里，每一节都渲染。 */
      const visible = isChapterVisible(number, state);
      setHidden(refs.branch, !visible);
      if (!visible) return;
      setClass(refs.branch, 'collapsed', number !== ctx.openChapter);
      let completedCount = 0;
      chapter.nodes.forEach((node, nodeIndex) => {
        const leaf = refs.leaves[nodeIndex];
        if (!leaf) return;
        /* 三态互斥：done / current / unlock —— 每一节必落在其中一个里（样式见 §6.7）。 */
        const done = nodeDone(number, nodeIndex, state);
        const active = nodeCurrent(number, nodeIndex, state);
        const known = done || active;
        if (done) completedCount += 1;
        setClass(leaf.leaf, 'selected', nodeKey(number, nodeIndex) === selected);
        setClass(leaf.leaf, 'done', done);
        setClass(leaf.leaf, 'current', active);
        setClass(leaf.leaf, 'unlock', !known);
        /* 没轮到的节**什么都不露**（R31）：标题与奖励都藏着，只留状态。 */
        setText(leaf.title, known ? node.title : '未解锁记录');
        setText(leaf.reward, known ? node.reward : '??? 待恢复');
        setText(leaf.status, done ? '已完成' : active ? '进行中' : '未解锁');
      });
      setText(refs.badge, `${completedCount} / ${chapter.nodes.length}`);
    });

    /* 右侧详情：跟着选中的节点走。两种章共用同一块版式 —— 节点表本身就是同一个形状。 */
    const chapter = chapterTable[selectedChapter - 1] || chapterTable[0];
    const node = chapter.nodes[selectedIndex] || chapter.nodes[0];
    const known = nodeDone(selectedChapter, selectedIndex, state) || nodeCurrent(selectedChapter, selectedIndex, state);
    const completed = nodeDone(selectedChapter, selectedIndex, state);
    const active = current ? current.chapter === selectedChapter && current.index === selectedIndex : false;
    setText(ctx.detailKicker, active ? 'CURRENT OBJECTIVE' : `CHAPTER ${String(selectedChapter).padStart(2, '0')} / NODE ${String(selectedIndex + 1).padStart(2, '0')}`);
    setText(ctx.detailTitle, known ? node.title : '未解锁记录');
    setText(ctx.detailStatus, completed ? '已完成' : active ? '进行中' : '未解锁');
    /* 正文按「章 + 节」取（见 chapterStory）；某章还没写旁白时留空，不要用别的章去顶。 */
    setText(ctx.detailStory, known ? chapterStory[selectedChapter - 1]?.[selectedIndex] || '' : '完成前一节之后，这段记录会被恢复。');
    setText(ctx.detailGoal, known ? node.description : '???');
    /* 具体条件逐条列出：还没走完的现算，走完的一律「封存」（见 requirementSettledMarkup）。
       text() 返回的引用 HTML 直接可用；再过一遍 renderCodexTags 是兜底 —— 万一某条文案写成 [[kind:id]] 标记，也不会把标记原样显示出来。 */
    setHtml(ctx.detailRequirements, !known
      ? '<div class="requirement"><span class="status-dot pending"></span><span>???</span></div>'
      : completed
        ? node.requirements.map(entry => requirementSettledMarkup(entry.text(state))).join('')
        : node.requirements.map(entry => requirementMarkup(entry.text(state), entry.done(state))).join(''));
    setText(ctx.detailReward, known ? node.reward : '???');

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
