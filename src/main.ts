import pageController from './page-controller';
import { getState, currentZone, getFontScale, subscribe, startLoop, resetGame } from './game-state';
import homePage from './pages/home';
import adventurePage from './pages/adventure';
import inventoryPage from './pages/inventory';
import storyPage from './pages/story';
import settingsPage from './pages/settings';

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const app = document.querySelector<HTMLElement>('#game-app')!;
const status = document.querySelector<HTMLElement>('#game-status')!;
const navToggle = document.querySelector<HTMLButtonElement>('#nav-toggle')!;
const navItems = [...document.querySelectorAll<HTMLElement>('.nav-item')];
const statusText = status.querySelector('span')!;
[homePage, adventurePage, inventoryPage, storyPage, settingsPage].forEach(page => pageController.register(page));
let appliedFontScale = '';
function applyFontScale(state: ReturnType<typeof getState>): void { const next = `${getFontScale(state).scale * 100}%`; if (next === appliedFontScale) return; appliedFontScale = next; document.documentElement.style.fontSize = next; requestAnimationFrame(() => pageController.remeasure()); }
function updateSharedHeader(state: ReturnType<typeof getState>): void { status.classList.toggle('paused', !state.adventure.running); statusText.textContent = state.adventure.running ? `远征中 · ${currentZone(state).name}` : '营地待命'; navItems.forEach(item => item.classList.toggle('active', item.dataset.page === pageController.currentId)); }
navToggle.addEventListener('click', () => { const collapsed = app.classList.toggle('nav-collapsed'); navToggle.setAttribute('aria-expanded', String(!collapsed)); });
document.querySelector<HTMLElement>('#main-nav')!.addEventListener('click', event => { const button = (event.target as Element).closest<HTMLElement>('[data-page]'); if (!button) return; pageController.switchTo(button.dataset.page!); updateSharedHeader(getState()); });
document.addEventListener('click', event => { const target = event.target as Element; const pageButton = target.closest<HTMLElement>('[data-page]'); if (pageButton && !pageButton.closest('#main-nav')) pageController.switchTo(pageButton.dataset.page!); if (target.closest('[data-action="reset"]')) resetGame(); });
navItems.forEach(item => { const prefetch = () => pageController.prefetch(item.dataset.page); ['mouseenter', 'focus', 'pointerdown'].forEach(type => item.addEventListener(type, prefetch, { once: true })); });
subscribe(state => { updateSharedHeader(state); applyFontScale(state); pageController.renderCurrent(); });
updateSharedHeader(getState()); applyFontScale(getState()); pageController.switchTo('home'); pageController.prefetchAll(); startLoop();
/* 启动信号：index.html 的看门狗用它判断主模块是否真的跑起来了，未收到时才会输出错误日志。 */
(window as any).__idleBooted = true;
