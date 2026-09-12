import { mainline, equipTypes, getEquipSlotCounts, enemyTable, isEncountered, getInventoryCapacity, getInventoryUsed, MAX_OFFLINE_SECONDS, upgradeWorkshop, upgradeResearch, upgradeCompanions } from '../game-state';
import { setText, setClass, setHidden, setDisabled, pick } from '../dom';
import pageController from '../page-controller';
import type { GameState, PageDefinition } from '../types';

/* 章节节点的旁白：下标与 mainline 对应，取最近一条已完成节点的记录。 */
const storyLines = ['你从一簇微弱的火星旁醒来。远处的荒原没有灯光，只有一条旧路通往黑暗。', '营火重新燃起，旧哨站边缘出现了第一条可通行的路。', '废弃边境的机械单位并非自然失控，它们都在寻找同一个旧电池信号。', '重装单位身上的装甲板来自营地旧仓库。有人曾经在这里建立过第二支队伍。', '余烬碎片指向更深处的道路。边境调查阶段完成，但真正的远征才刚刚开始。'];

/* ——— 左栏：章节树 ———
   一章下面挂若干个主线节点（下标即 mainline 的下标）。
   第二章目前还没有内容，用 locked 占位：第一章的记录全部恢复后才会开放。 */
const chapters = [
  { kicker: 'CHAPTER 01 / ASHEN ROAD', title: '灰烬之路', nodes: mainline.map((_, index) => index), locked: false },
  { kicker: 'CHAPTER 02 / LOCKED', title: '后续章节', nodes: [] as number[], locked: true }
];
const chapterMarkup = (chapter: typeof chapters[number], chapterIndex: number): string => `<li class="tree-branch" data-chapter="${chapterIndex}"><button class="tree-node" type="button" data-chapter="${chapterIndex}"><span class="tree-caret" aria-hidden="true">▾</span><span class="tree-copy"><span class="tree-kicker">${chapter.kicker}</span><b class="tree-title">${chapter.title}</b></span><span class="tree-badge" data-ref="badge"></span></button><ul class="tree-children">${chapter.nodes.map(index => `<li class="tree-leaf" data-node="${index}"><span class="tree-dot" aria-hidden="true"></span><span class="tree-leaf-copy"><b class="tree-leaf-title" data-ref="title"></b><span class="tree-reward" data-ref="reward"></span></span><span class="tree-status" data-ref="status"></span></li>`).join('')}</ul></li>`;

/* ——— 右栏：机制卡片 ———
   source 表示这项机制由第几个主线节点解锁：在左栏选中该节点时，对应卡片会高亮。
   locked 里的文案是未解锁时显示的提示。可升级的机制额外带 cost / cta / run。 */
const workshopCost = (state: GameState) => 40 + state.workshop * 35;
const researchCost = (state: GameState) => 2 + state.research * 3;
const companionGold = (state: GameState) => 100 + state.companions * 90;
const companionEssence = (state: GameState) => 4 + state.companions * 3;
/** 已装备件数（跨全部槽位）。 */
const equippedCount = (state: GameState) => state.equipped.reduce((total, slots) => total + slots.filter(id => id >= 0).length, 0);
/** 所有装备实例上已刻上的词条总数。 */
const affixCount = (state: GameState) => state.equipment.reduce((total, instance) => total + (instance.affixes?.length || 0), 0);
/** 各装备类型的槽位概览，例如「武器 1 · 头部 1 · 饰品 2」。 */
const slotSummary = (): string => { const counts = getEquipSlotCounts(); return equipTypes.map((type, index) => `${type.name} ${counts[index]}`).join(' · '); };
const codexCount = (state: GameState) => enemyTable.reduce((total, _, id) => total + (isEncountered(id, state) ? 1 : 0), 0);

const MECHANICS = [
  { id: 'auto', icon: '⚡', name: '自动冒险', source: 0, unlocked: () => true, level: () => '常驻', desc: () => `进入战斗区域即自动交战，回到营地自动休整；离线最多推进 ${MAX_OFFLINE_SECONDS / 3600} 小时。`, locked: '' },
  { id: 'workshop', icon: '🔨', name: '工坊', source: 1, unlocked: (state: GameState) => state.mainlineIndex >= 2, level: (state: GameState) => `Lv.${state.workshop}`, desc: () => '每级提高生命上限 15、攻击 3、生命恢复 0.8，物品栏 +2 种。', cost: (state: GameState) => `${workshopCost(state)} 废料`, affordable: (state: GameState) => state.scrap >= workshopCost(state), cta: '升级', run: upgradeWorkshop, locked: '完成「清理废弃边境」后开放。' },
  { id: 'research', icon: '🔬', name: '研究', source: 2, unlocked: (state: GameState) => state.mainlineIndex >= 3, level: (state: GameState) => `Lv.${state.research}`, desc: () => '每级提高攻击 5，并把攻击间隔缩短 0.08 秒。', cost: (state: GameState) => `${researchCost(state)} 精华`, affordable: (state: GameState) => state.essence >= researchCost(state), cta: '研究', run: upgradeResearch, locked: '完成「分析异常电池」后开放。' },
  { id: 'companions', icon: '🤝', name: '伙伴', source: 3, unlocked: (state: GameState) => state.mainlineIndex >= 4, level: (state: GameState) => `Lv.${state.companions}`, desc: () => '每级提高生命上限 25、攻击 4、生命恢复 1.5，物品栏 +1 种。', cost: (state: GameState) => `${companionGold(state)} 金币 · ${companionEssence(state)} 精华`, affordable: (state: GameState) => state.gold >= companionGold(state) && state.essence >= companionEssence(state), cta: '招募', run: upgradeCompanions, locked: '完成「组建第二支小队」后开放。' },
  { id: 'equipment', icon: '🧰', name: '装备槽', unlocked: (state: GameState) => state.equipment.length > 0, level: (state: GameState) => `${equippedCount(state)} 件已装备`, desc: () => `${slotSummary()}。同类装备是各自独立的实例，属性只算已装上的那些。`, locked: '获得第一件装备后开放。' },
  { id: 'affixes', icon: '✳️', name: '词条强化', unlocked: (state: GameState) => affixCount(state) > 0, level: (state: GameState) => `${affixCount(state)} 条`, desc: () => '锐化油、生命之种这类强化物可以给装备刻上词条；同名词条会继续提升数值，直到上限。', locked: '还没有装备带上词条。' },
  { id: 'codex', icon: '📖', name: '怪物图鉴', unlocked: (state: GameState) => state.totalWins > 0, level: (state: GameState) => `${codexCount(state)} / ${enemyTable.length}`, desc: () => '在冒险页打开图鉴：击败过的怪物会被收录，并逐条揭示它们的掉落表。', locked: '击败第一只怪物后开放。' },
  { id: 'storage', icon: '🎒', name: '物品栏扩容', unlocked: (state: GameState) => state.workshop > 0 || state.companions > 0, level: (state: GameState) => `上限 ${getInventoryCapacity(state)} 种`, desc: (state: GameState) => `基础 8 种，工坊每级 +2、伙伴每级 +1。当前已占用 ${getInventoryUsed(state)} 种。`, locked: '升级工坊或招募伙伴后开放。' }
];
const mechanicMarkup = (mechanic: typeof MECHANICS[number]): string => `<article class="mechanic-card" data-mechanic="${mechanic.id}"><span class="mechanic-icon" aria-hidden="true">${mechanic.icon}</span><div class="mechanic-head"><b>${mechanic.name}</b><span class="mechanic-level" data-ref="level"></span></div><p class="mechanic-desc" data-ref="desc"></p><div class="mechanic-foot"><span class="cost" data-ref="cost"></span><button class="secondary-button" type="button" data-action="upgrade" data-target="${mechanic.id}" data-ref="cta"></button><span class="mechanic-lock" data-ref="lock"></span></div></article>`;

const page: PageDefinition<any> = {
  id: 'story', template: './pages/story.html',
  mount(root) {
    const view = root.querySelector<HTMLElement>('#story-view')!;
    view.innerHTML = `<div class="archive-layout">
      <section class="archive-column">
        <div class="panel-heading"><div><span class="panel-kicker">CHAPTERS</span><h3>章节进度</h3></div><span class="muted" data-ref="chapterProgress"></span></div>
        <ul class="tree">${chapters.map(chapterMarkup).join('')}</ul>
        <p class="story-quote" data-ref="quote"></p>
      </section>
      <section class="archive-column">
        <div class="panel-heading"><div><span class="panel-kicker">UNLOCKED MECHANICS</span><h3>已解锁机制</h3></div><span class="muted" data-ref="mechanicProgress"></span></div>
        <div class="mechanic-grid">${MECHANICS.map(mechanicMarkup).join('')}</div>
      </section>
    </div>`;
    const ctx: any = {
      ...pick(view, 'chapterProgress', 'mechanicProgress', 'quote'),
      branches: [...view.querySelectorAll<HTMLElement>('.tree-branch')].map(branch => ({ branch, badge: branch.querySelector<HTMLElement>('.tree-badge'), leaves: [...branch.querySelectorAll<HTMLElement>('.tree-leaf')].map(leaf => ({ leaf, ...pick(leaf, 'title', 'reward', 'status') })) })),
      cards: [...view.querySelectorAll<HTMLElement>('.mechanic-card')].map(card => ({ card, ...pick(card, 'level', 'desc', 'cost', 'cta', 'lock') })),
      collapsed: new Set<number>(), selected: -1
    };
    root.onclick = event => {
      const target = event.target as Element;
      const chapterButton = target.closest<HTMLElement>('button[data-chapter]');
      if (chapterButton) { const index = Number(chapterButton.dataset.chapter); if (ctx.collapsed.has(index)) ctx.collapsed.delete(index); else ctx.collapsed.add(index); pageController.renderCurrent(); return; }
      const leaf = target.closest<HTMLElement>('.tree-leaf');
      if (leaf) { const index = Number(leaf.dataset.node); ctx.selected = ctx.selected === index ? -1 : index; pageController.renderCurrent(); return; }
      const upgrade = target.closest<HTMLButtonElement>('[data-action="upgrade"]');
      if (upgrade && !upgrade.disabled) MECHANICS.find(mechanic => mechanic.id === upgrade.dataset.target)?.run?.();
    };
    return ctx;
  },
  update(state: GameState, ctx: any) {
    setText(ctx.chapterProgress, `${Math.min(state.mainlineIndex, mainline.length)} / ${mainline.length}`);
    setText(ctx.quote, storyLines[Math.min(state.mainlineIndex, storyLines.length - 1)]);
    chapters.forEach((chapter, chapterIndex) => {
      const refs = ctx.branches[chapterIndex];
      if (!refs) return;
      /* 章节本身在第一章全部完成后才开放；未开放时整条分支置灰。 */
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
        setClass(leaf.leaf, 'selected', ctx.selected === index);
        setText(leaf.title, known ? mainline[index].title : '未解锁记录');
        setText(leaf.reward, known ? mainline[index].reward : '??? 待恢复');
        setText(leaf.status, completed ? '已完成' : current ? '进行中' : '未解锁');
      });
    });
    let unlockedCount = 0;
    MECHANICS.forEach((mechanic, index) => {
      const refs = ctx.cards[index];
      if (!refs) return;
      const unlocked = mechanic.unlocked(state);
      if (unlocked) unlockedCount += 1;
      /* 左栏选中某个节点时，它解锁的那张卡片跟着高亮。 */
      setClass(refs.card, 'locked', !unlocked);
      setClass(refs.card, 'highlight', ctx.selected >= 0 && ctx.selected === mechanic.source);
      setText(refs.level, unlocked ? mechanic.level(state) : '未解锁');
      setText(refs.desc, unlocked ? mechanic.desc(state) : mechanic.locked);
      const showCta = unlocked && !!mechanic.cta;
      setHidden(refs.cost, !showCta);
      setHidden(refs.cta, !showCta);
      setHidden(refs.lock, showCta);
      if (!showCta) setText(refs.lock, unlocked ? '已启用' : '未解锁');
      else { setText(refs.cost, mechanic.cost!(state)); setDisabled(refs.cta as HTMLButtonElement, !mechanic.affordable!(state)); }
    });
    setText(ctx.mechanicProgress, `${unlockedCount} / ${MECHANICS.length}`);
  }
};
export default page;
