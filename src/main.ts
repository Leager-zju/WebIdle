import pageController from './page-controller';
import { updateEventPrompt } from './event-prompt';
import { startHoverTip } from './hover-tip';
import { startUnlockToasts } from './unlock-toast';
import { startCodexWiki, openWikiPage } from './wiki';
import { initGuide, updateGuide, startGuide } from './guide';
import { startChangelog, openChangelog } from './changelog';
import { getState, currentZoneId, getFontScale, getNumberFormat, isWikiUnlocked, subscribe, startLoop, resetGame } from './game-state';
import { setText, setClass, setHtml } from './dom';
import { zoneRefMarkup, setWikiUnlocked } from './codex-ref';
import { setActiveNumberFormat } from './format';
import homePage from './pages/home';
import campPage from './pages/camp';
import adventurePage from './pages/adventure';
import inventoryPage from './pages/inventory';
import workshopPage from './pages/workshop';
import storyPage from './pages/story';
import researchPage from './pages/research';
import settingsPage from './pages/settings';

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const app = document.querySelector<HTMLElement>('#game-app')!;
const status = document.querySelector<HTMLElement>('#game-status')!;
const navToggle = document.querySelector<HTMLButtonElement>('#nav-toggle')!;
const navItems = [...document.querySelectorAll<HTMLButtonElement>('.nav-item')];
const statusText = status.querySelector('span')!;
[homePage, campPage, adventurePage, inventoryPage, workshopPage, researchPage, storyPage, settingsPage].forEach(page => pageController.register(page));
let appliedFontScale = '';
function applyFontScale(state: ReturnType<typeof getState>): void { const next = `${getFontScale(state).scale * 100}%`; if (next === appliedFontScale) return; appliedFontScale = next; document.documentElement.style.fontSize = next; requestAnimationFrame(() => pageController.remeasure()); }
/* 数字显示方式：把当前档位同步给 format 模块，本帧渲染出的所有数值就用新风格。 */
let appliedNumberFormat = -1;
function applyNumberFormat(state: ReturnType<typeof getState>): void { const id = getNumberFormat(state).id; if (id === appliedNumberFormat) return; appliedNumberFormat = id; setActiveNumberFormat(id); }
/* 图鉴（wiki）解锁状态：同步给 codex-ref，决定引用渲染成可点链接还是纯文本。
   右上角的 WIKI 按钮也看它 —— 图鉴没解锁就不该有入口。
   必须在页面渲染之前同步，否则本帧画出来的引用还是上一帧的形态。 */
let appliedWikiUnlocked: boolean | null = null;
const wikiButton = document.querySelector<HTMLButtonElement>('#wiki-open');
function applyWikiUnlock(state: ReturnType<typeof getState>): void { const next = isWikiUnlocked(state); if (next === appliedWikiUnlocked) return; appliedWikiUnlocked = next; setWikiUnlocked(next); if (wikiButton) wikiButton.hidden = !next; }
/* 右上角的 WIKI 按钮：直接打开图鉴主页（列表页里的条目照旧走引用点击）。 */
wikiButton?.addEventListener('click', () => openWikiPage('home'));
/* 导航项的原始图标与文字先记下来：未解锁时要换成「❓未解锁」，解锁后要能还原（重置存档会重新锁上）。 */
navItems.forEach(item => { item.dataset.icon = item.querySelector('.nav-index')?.textContent || ''; item.dataset.label = item.querySelector('.sidebar-label')?.textContent || ''; });
/* 未解锁的系统入口：置灰、换成「❓未解锁」、并 disabled（浏览器不会给 disabled 按钮派发 click，鼠标自然点不动）。
   解锁条件由各页面自己在 PageDefinition.locked 里声明，这里统一同步。 */
function updateNavLocks(state: ReturnType<typeof getState>): void {
  navItems.forEach(item => {
    const page = pageController.pages.get(item.dataset.page || '');
    const locked = !!page?.locked?.(state);
    /* 状态没变就整段跳过：这个函数每 500ms 会跟着渲染循环跑一次。 */
    if (item.dataset.locked === (locked ? '1' : '0')) return;
    item.dataset.locked = locked ? '1' : '0';
    setClass(item, 'locked', locked);
    item.disabled = locked;
    item.setAttribute('aria-disabled', String(locked));
    setText(item.querySelector('.nav-index'), locked ? '❓' : item.dataset.icon);
    setText(item.querySelector('.sidebar-label'), locked ? '未解锁' : item.dataset.label);
  });
  /* 当前停留的页面被锁上（例如刚重置存档）时，退回主界面，避免停在不可用的系统里。 */
  if (pageController.pages.get(pageController.currentId)?.locked?.(state)) pageController.switchTo('home');
}
function updateSharedHeader(state: ReturnType<typeof getState>): void { status.classList.toggle('paused', !state.adventure.running); setHtml(statusText, state.adventure.running ? `远征中 · ${zoneRefMarkup(currentZoneId(state))}` : '营地待命'); updateNavLocks(state); navItems.forEach(item => item.classList.toggle('active', item.dataset.page === pageController.currentId)); }
navToggle.addEventListener('click', () => { const collapsed = app.classList.toggle('nav-collapsed'); navToggle.setAttribute('aria-expanded', String(!collapsed)); });
document.querySelector<HTMLElement>('#main-nav')!.addEventListener('click', event => { const button = (event.target as Element).closest<HTMLElement>('[data-page]'); if (!button) return; pageController.switchTo(button.dataset.page!); updateSharedHeader(getState()); });
document.addEventListener('click', event => { const target = event.target as Element; const pageButton = target.closest<HTMLElement>('[data-page]'); if (pageButton && !pageButton.closest('#main-nav')) pageController.switchTo(pageButton.dataset.page!); if (target.closest('[data-action="reset"]')) { /* 只有真的重置了才重放首次引导（guide 进度已随存档清空）；玩家在 confirm 里点取消时 resetGame 返回 false，那时不该弹引导。 */ if (resetGame()) startGuide('intro'); } /* 设置页的「查看更新日志」：和 reset 一样走全局委托，页面重挂后不必重新绑。 */ if (target.closest('[data-action="changelog"]')) openChangelog(); });
navItems.forEach(item => { const prefetch = () => pageController.prefetch(item.dataset.page); ['mouseenter', 'focus', 'pointerdown'].forEach(type => item.addEventListener(type, prefetch, { once: true })); });
subscribe(state => { updateSharedHeader(state); applyFontScale(state); applyNumberFormat(state); applyWikiUnlock(state); pageController.renderCurrent(); updateEventPrompt(); /* 页面重绘会换掉目标节点，引导每帧重新定位一次。 */ updateGuide(); });
updateSharedHeader(getState()); applyFontScale(getState()); applyNumberFormat(getState()); applyWikiUnlock(getState()); pageController.switchTo('home'); pageController.prefetchAll(); startHoverTip(); startUnlockToasts(); startCodexWiki(); initGuide(); startChangelog(); startLoop();
/* 启动信号：index.html 的看门狗用它判断主模块是否真的跑起来了，未收到时才会输出错误日志。 */
(window as any).__idleBooted = true;
