import { mainline, achievements, isAchievementUnlocked, getUnlockedAchievementCount, campaignQuests, QUEST_STATE, getQuestState, questTarget } from '../game-state';
import { setText, setHtml, setClass, setHidden, pick } from '../dom';
import { renderCodexTags, itemRefMarkup } from '../codex-ref';
import pageController from '../page-controller';
import type { GameState, PageDefinition } from '../types';

/* 章节节点的旁白：下标与 mainline 对应，既是节点的「剧情」，也是详情页里那段正文。 */
const storyLines = ['你从一簇微弱的火星旁醒来。远处的荒原没有灯光，只有一条旧路通往黑暗。', '营火重新燃起，旧哨站边缘出现了第一条可通行的路。', '废弃边境的机械单位并非自然失控，它们都在寻找同一个旧电池信号。', '重装单位身上的装甲板来自庇护所旧仓库。有人曾经在这里建立过第二支队伍。', '余烬碎片指向更深处的道路。边境调查阶段完成，但真正的远征才刚刚开始。', '第一场天灾被挡在挡墙之外。庇护所开始相信这堆火能烧很久。', '兽潮退去。荒野深处还有更大的信号，而这次远征已经不再孤单。'];

/* ——— 左栏：章节树 ———
   一章下面挂若干节，两种节：
   - `mainline`：主线节点（下标即 mainline 的下标）—— **顺序推进**，完成 = `index < mainlineIndex`；
   - `quest`：剧情任务（下标即 config/campaign.ts 的下标）—— **条件各自独立**，完成 = 已安装（`state.quests`）。

   第二个章节装的就是剧情任务。它们**不进 `mainline` 数组**：那条数组按下标存进存档，
   往里插节点会挪动既有下标（见 UI开发规范 R24）；也**不为它们单开页签** ——
   玩家视角里只有「这一路记下了什么」，所以两种节并列挂在同一棵树上。
   新增一章 = 往 chapters 末尾追加一条（节点条件自己带，不用改这里的渲染）。 */
type ChapterNode = { kind: 'mainline' | 'quest'; index: number };
const chapterNodesOf = (kind: ChapterNode['kind'], count: number): ChapterNode[] => Array.from({ length: count }, (_, index) => ({ kind, index }));
const chapters: { kicker: string; title: string; nodes: ChapterNode[] }[] = [
  { kicker: 'CHAPTER 01 / ASHEN ROAD', title: '灰烬之路', nodes: chapterNodesOf('mainline', mainline.length) },
  { kicker: 'CHAPTER 02 / BEYOND THE EMBERS', title: '余烬之外', nodes: chapterNodesOf('quest', campaignQuests.length) }
];
/** 节点的唯一键（`m:3` / `q:1`）：选择状态存的就是它 —— 两种节同在一棵树里，只存下标会撞车。 */
const nodeKey = (node: ChapterNode): string => `${node.kind === 'mainline' ? 'm' : 'q'}:${node.index}`;
/** 一节完成了吗：主线看 `mainlineIndex`（下标在前 = 已完成），剧情任务看 `state.quests`（已安装）。 */
function nodeDone(node: ChapterNode, state: GameState): boolean {
  return node.kind === 'mainline' ? node.index < state.mainlineIndex : getQuestState(node.index, state) >= QUEST_STATE.installed;
}
/** 一章是否**全部**完成 —— 章节门控只看这一个条件。 */
const chapterDone = (chapter: typeof chapters[number], state: GameState): boolean => chapter.nodes.every(node => nodeDone(node, state));
/** 一章是否出现：**前一章全部完成后才出现**（第一章没有前章 ⇒ 开局就在）。
    这是章节可见性的唯一判定点：整章隐藏（连标题都不出现），但**章内每一节一律渲染**，
    只靠 `.tree-leaf` 的 done / current / unlock 三态区分（见 UI开发规范 §6.7）。 */
const chapterVisible = (chapterIndex: number, state: GameState): boolean => chapters.slice(0, chapterIndex).every(chapter => chapterDone(chapter, state));
const chapterMarkup = (chapter: typeof chapters[number], chapterIndex: number): string => `<li class="tree-branch" data-chapter="${chapterIndex}"><button class="tree-node" type="button" data-chapter="${chapterIndex}"><span class="tree-caret" aria-hidden="true">▾</span><span class="tree-copy"><span class="tree-kicker">${chapter.kicker}</span><b class="tree-title">${chapter.title}</b></span><span class="tree-badge" data-ref="badge"></span></button><ul class="tree-children">${chapter.nodes.map(node => `<li class="tree-leaf" data-node="${nodeKey(node)}"><span class="tree-dot" aria-hidden="true"></span><span class="tree-leaf-copy"><b class="tree-leaf-title" data-ref="title"></b><span class="tree-reward" data-ref="reward"></span></span><span class="tree-status" data-ref="status"></span></li>`).join('')}</ul></li>`;

/* ——— 右栏（主线剧情页签）：选中节点的剧情与解锁条件 ———
   两种节共用这一块（主线的读 mainline，剧情任务的读 campaignQuests）：
   「解锁条件」一句话 + 逐条进度 + 「解锁后」。
   剧情任务的「解锁条件」直接用**条件规则自己的文案**（`requirement.text()`，带当前进度），
   下面逐条列的是「拿到图纸 / 走完安装」这两步 —— 奖励是条件达成时自动发的，没有"领取"这一步。
   最下面的 action 只有剧情任务在「待安装」时露出（图纸已经在包里了，提示玩家去用掉它）。 */
const detailMarkup = `<div class="panel-heading"><div><span class="panel-kicker" data-ref="detailKicker"></span><h3 data-ref="detailTitle"></h3></div><span class="muted" data-ref="detailStatus"></span></div>
  <p class="story-quote" data-ref="detailStory"></p>
  <div class="chapter-facts"><div class="chapter-fact"><span>解锁条件</span><b data-ref="detailGoal"></b></div><div class="chapter-requirements" data-ref="detailRequirements"></div><div class="chapter-fact"><span>解锁后</span><b data-ref="detailReward"></b></div></div>
  <div class="detail-actions" data-ref="detailActions" hidden><button class="secondary-button" type="button" data-page="inventory">去物品栏使用它</button></div>`;

/* 条件行两种渲染（见 UI开发规范 §6.7）：
   - **还没走完的节**：逐条现算 —— 达成了点亮、没达成给灰点，进度跟着背包实时变；
   - **已经走完的节**：一律渲染成「~~条件原文~~ 已完成」。**封存**，不再调 `done()` / 不再看背包：
     条件是「达成过」而不是「此刻仍然成立」（装甲板卖掉、精华花掉都不该让走完的主线退回未完成）。
     代价是原文里的进度数字保持实时（规则只给一个 `text()`，没有"达成时的快照"）——
     所以它才要划掉：要读的是后面那个「已完成」。 */
const requirementMarkup = (text: string, done: boolean): string => `<div class="requirement ${done ? 'done' : ''}"><span class="status-dot ${done ? '' : 'pending'}"></span><span>${renderCodexTags(text)}</span></div>`;
const requirementSettledMarkup = (text: string): string => `<div class="requirement done settled"><span class="status-dot"></span><span><s>${renderCodexTags(text)}</s> <b>已完成</b></span></div>`;

/** 剧情任务的「解锁后」一行：开出哪一项 + 这一种安装方式叫什么。 */
function questRewardLabel(index: number): string {
  const target = questTarget(index);
  const unlocks = target ? `${target.kind === 'workshop' ? '工坊' : '研究基地'}「${target.name}」` : '对应的建造项';
  return `解锁${unlocks} · 安装方式：${campaignQuests[index].install.mode === 'pay' ? '支付资源' : '解读线索'}`;
}

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
          <div class="panel-heading"><div><span class="panel-kicker">CHAPTERS</span><h3>章节进度</h3></div><span class="muted" data-ref="chapterProgress"></span></div>
          <p class="archive-hint">每一章都要等上一章全部走完才会出现；「余烬之外」的几节各自独立 —— 条件达成后，奖励会自己带回庇护所。</p>
          <ul class="tree">${chapters.map(chapterMarkup).join('')}</ul>
        </section>
        <section class="panel archive-panel">${detailMarkup}</section>
      </div></div>
      <div class="tab-pane" data-pane="achievements"><section class="panel archive-panel">
        <div class="panel-heading"><div><span class="panel-kicker">ACHIEVEMENTS</span><h3>成就</h3></div><span class="muted" data-ref="achievementProgress"></span></div>
        <p class="archive-hint">悬停（或键盘聚焦）图标查看解锁条件与奖励。</p>
        <div class="item-grid storage-grid tile-compact">${achievements.map(achievementMarkup).join('')}</div>
      </section></div>`;
    const ctx: any = {
      ...pick(view, 'chapterProgress', 'achievementProgress', 'detailKicker', 'detailTitle', 'detailStatus', 'detailStory', 'detailGoal', 'detailReward', 'detailRequirements', 'detailActions'),
      tabs: [...view.querySelectorAll<HTMLElement>('[data-tab]')],
      panes: [...view.querySelectorAll<HTMLElement>('[data-pane]')],
      branches: [...view.querySelectorAll<HTMLElement>('.tree-branch')].map(branch => ({ branch, badge: branch.querySelector<HTMLElement>('.tree-badge'), leaves: [...branch.querySelectorAll<HTMLElement>('.tree-leaf')].map(leaf => ({ leaf, ...pick(leaf, 'title', 'reward', 'status') })) })),
      cards: [...view.querySelectorAll<HTMLElement>('.achievement-card')].map(card => ({ card, ...pick(card, 'icon', 'status', 'condition', 'reward') })),
      collapsed: new Set<number>(), selected: '', tab: 'main'
    };
    root.onclick = event => {
      const target = event.target as Element;
      const tab = target.closest<HTMLElement>('[data-tab]');
      if (tab) { ctx.tab = tab.dataset.tab; pageController.renderCurrent(); return; }
      const chapterButton = target.closest<HTMLElement>('button[data-chapter]');
      if (chapterButton) { const index = Number(chapterButton.dataset.chapter); if (ctx.collapsed.has(index)) ctx.collapsed.delete(index); else ctx.collapsed.add(index); pageController.renderCurrent(); return; }
      const leaf = target.closest<HTMLElement>('.tree-leaf');
      /* 选择状态存的是节点键（`m:3` / `q:1`），不是下标 —— 两种节在同一棵树里。 */
      if (leaf) { ctx.selected = leaf.dataset.node || ''; pageController.renderCurrent(); }
    };
    return ctx;
  },
  update(state: GameState, ctx: any) {
    ctx.tabs.forEach((tab: HTMLElement) => setClass(tab, 'active', tab.dataset.tab === ctx.tab));
    ctx.panes.forEach((pane: HTMLElement) => setHidden(pane, pane.dataset.pane !== ctx.tab));

    setText(ctx.chapterProgress, `${Math.min(state.mainlineIndex, mainline.length)} / ${mainline.length}`);
    /* 没点选过、或点过的那一节所属的章又不可见了（重开 / 改档），就落回第一章正在推进的那一节
       （全部完成后停在最后一节）。选择状态只认已经出现的那几章 —— 隐藏的章里选不出东西来。 */
    const visibleKeys: string[] = [];
    chapters.forEach((chapter, chapterIndex) => { if (chapterVisible(chapterIndex, state)) chapter.nodes.forEach(node => visibleKeys.push(nodeKey(node))); });
    const selected = visibleKeys.includes(ctx.selected) ? ctx.selected : `m:${Math.min(state.mainlineIndex, mainline.length - 1)}`;
    chapters.forEach((chapter, chapterIndex) => {
      const refs = ctx.branches[chapterIndex];
      if (!refs) return;
      /* 前一章没走完 ⇒ 整章**不出现**（不是变灰：连标题都不给）。已出现的章里，每一节都渲染。 */
      const visible = chapterVisible(chapterIndex, state);
      setHidden(refs.branch, !visible);
      if (!visible) return;
      setClass(refs.branch, 'collapsed', ctx.collapsed.has(chapterIndex));
      let completedCount = 0;
      chapter.nodes.forEach((node, nodeIndex) => {
        const leaf = refs.leaves[nodeIndex];
        if (!leaf) return;
        /* 三态互斥：done / current / unlock —— 每一节必落在其中一个里（样式见 §6.7）。 */
        setClass(leaf.leaf, 'selected', nodeKey(node) === selected);
        if (node.kind === 'mainline') {
          const done = node.index < state.mainlineIndex;
          const current = node.index === state.mainlineIndex;
          const known = done || current;
          if (done) completedCount += 1;
          setClass(leaf.leaf, 'done', done);
          setClass(leaf.leaf, 'current', current);
          setClass(leaf.leaf, 'unlock', !known);
          /* 没走到的节不剧透：标题与奖励都藏着，只留状态（章节本身要等前一章走完才出现，理由见 §6.7）。 */
          setText(leaf.title, known ? mainline[node.index].title : '未解锁记录');
          setText(leaf.reward, known ? mainline[node.index].reward : '??? 待恢复');
          setText(leaf.status, done ? '已完成' : current ? '进行中' : '未解锁');
          return;
        }
        /* 剧情任务：条件各自独立，完成 = 已安装（`state.quests`，见 config/campaign.ts）。
           **没达成的节不剧透**：和第一章那些没走到的节一个口径（标题与奖励都藏着）。
           达成（图纸到手）之后才露出它是哪一节；「待安装」给 current 高亮 —— 就差去用掉它了。 */
        const progress = getQuestState(node.index, state);
        const installed = progress >= QUEST_STATE.installed;
        const granted = progress >= QUEST_STATE.granted;
        if (installed) completedCount += 1;
        setClass(leaf.leaf, 'done', installed);
        setClass(leaf.leaf, 'current', granted && !installed);
        setClass(leaf.leaf, 'unlock', !granted);
        setText(leaf.title, granted ? campaignQuests[node.index].name : '未解锁记录');
        setText(leaf.reward, granted ? questRewardLabel(node.index) : '??? 待恢复');
        setText(leaf.status, installed ? '已完成' : granted ? '待安装' : '未解锁');
      });
      setText(refs.badge, `${completedCount} / ${chapter.nodes.length}`);
    });
    /* 右侧详情：跟着选中的节点走。两种节共用这块版式，分叉只在这两段 if / else 里。 */
    const [selectedKind, selectedNumber] = selected.split(':');
    const node: ChapterNode = { kind: selectedKind === 'q' ? 'quest' : 'mainline', index: Math.max(0, Number(selectedNumber) || 0) };
    /* 章节号与节序号都**按当前这棵树现算** —— 两种节混在一棵树里，写死 CHAPTER 01 会错。 */
    const chapterIndex = Math.max(0, chapters.findIndex(chapter => chapter.nodes.some(entry => nodeKey(entry) === selected)));
    const nodeIndex = Math.max(0, chapters[chapterIndex].nodes.findIndex(entry => nodeKey(entry) === selected));
    const nodeKicker = `CHAPTER ${String(chapterIndex + 1).padStart(2, '0')} / NODE ${String(nodeIndex + 1).padStart(2, '0')}`;
    if (node.kind === 'quest') {
      const entry = campaignQuests[node.index];
      const progress = getQuestState(node.index, state);
      const installed = progress >= QUEST_STATE.installed;
      const granted = progress >= QUEST_STATE.granted;
      setText(ctx.detailKicker, nodeKicker);
      if (!granted) {
        /* 还没达成：走**不剧透**那一套，和第一章没走到的节完全一样 —— 标题 / 正文 / 条件 / 奖励都不给。
           （它什么时候露出来，由「条件达成」决定，见 config/campaign.ts。） */
        setHidden(ctx.detailActions, true);
        setText(ctx.detailTitle, '未解锁记录');
        setText(ctx.detailStatus, '未解锁');
        setText(ctx.detailStory, '条件达成之后，这段记录会被恢复。');
        setText(ctx.detailGoal, '???');
        setHtml(ctx.detailRequirements, '<div class="requirement"><span class="status-dot pending"></span><span>???</span></div>');
        setText(ctx.detailReward, '???');
      } else {
        setText(ctx.detailTitle, entry.name);
        setText(ctx.detailStatus, installed ? '已完成' : '待安装');
        /* 上方引文用任务自己的描述；条件用**规则自己的文案**（带当前进度），不要在这里重抄一遍。 */
        setText(ctx.detailStory, entry.desc);
        setHtml(ctx.detailGoal, renderCodexTags(entry.requirement.text(state)));
        /* 条件已经写在上面那一句里了，这里只列「奖励到手 / 装好」这两步进度。 */
        const steps = [
          { text: `拿到${itemRefMarkup(entry.itemId)}`, done: granted },
          { text: '在物品栏里使用它，走完安装', done: installed }
        ];
        /* 装好了就**封存**这两步：图纸用掉了、物品栏里那份自然没了，但这一节是走完的。 */
        setHtml(ctx.detailRequirements, installed
          ? steps.map(step => requirementSettledMarkup(step.text)).join('')
          : steps.map(step => requirementMarkup(step.text, step.done)).join(''));
        setText(ctx.detailReward, questRewardLabel(node.index));
        setHidden(ctx.detailActions, installed);
      }
    } else {
      const activeIndex = node.index;
      const quest = mainline[activeIndex];
      const known = activeIndex <= state.mainlineIndex;
      const completed = activeIndex < state.mainlineIndex;
      setHidden(ctx.detailActions, true);
      setText(ctx.detailKicker, activeIndex === state.mainlineIndex ? 'CURRENT OBJECTIVE' : nodeKicker);
      setText(ctx.detailTitle, known ? quest.title : '未解锁记录');
      setText(ctx.detailStatus, completed ? '已完成' : activeIndex === state.mainlineIndex ? '进行中' : '未解锁');
      setText(ctx.detailStory, known ? storyLines[Math.min(activeIndex, storyLines.length - 1)] : '完成前一节之后，这段记录会被恢复。');
      setText(ctx.detailGoal, known ? quest.description : '???');
      /* 具体条件逐条列出：还没走完的现算，走完的一律「封存」（见 requirementSettledMarkup）。
         text() 返回的引用 HTML 直接可用；再过一遍 renderCodexTags 是兜底 —— 万一某条文案写成 [[kind:id]] 标记，也不会把标记原样显示出来。 */
      setHtml(ctx.detailRequirements, !known
        ? '<div class="requirement"><span class="status-dot pending"></span><span>???</span></div>'
        : completed
          ? quest.requirements.map(entry => requirementSettledMarkup(entry.text(state))).join('')
          : quest.requirements.map(entry => requirementMarkup(entry.text(state), entry.done(state))).join(''));
      setText(ctx.detailReward, known ? quest.reward : '???');
    }

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
