import pageController from './page-controller.js';
import { getState, currentZone, getFontScale, subscribe, startLoop, resetGame } from './game-state.js';
import homePage from './pages/home.js';
import adventurePage from './pages/adventure.js';
import inventoryPage from './pages/inventory.js';
import systemsPage from './pages/systems.js';
import storyPage from './pages/story.js';
import settingsPage from './pages/settings.js';

// 关掉浏览器滚动恢复：否则刷新后它会把窗口滚回上次位置，污染页面的初始定位。
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

const app = document.querySelector('#game-app');
const status = document.querySelector('#game-status');
const navToggle = document.querySelector('#nav-toggle');
const navItems = [...document.querySelectorAll('.nav-item')];
const statusText = status.querySelector('span');

[homePage, adventurePage, inventoryPage, systemsPage, storyPage, settingsPage].forEach(page => pageController.register(page));

// 字体档位通过根字号缩放，界面里所有 rem 尺寸一起跟着变。
let appliedFontScale = '';
function applyFontScale(state) {
  const next = `${getFontScale(state).scale * 100}%`;
  if (next === appliedFontScale) return;
  appliedFontScale = next;
  document.documentElement.style.fontSize = next;
  requestAnimationFrame(() => pageController.remeasure());
}

function updateSharedHeader(state) {
  const zoneName = state.adventure.running ? `远征中 · ${currentZone(state).name}` : '营地待命';
  status.classList.toggle('paused', !state.adventure.running);
  statusText.textContent = zoneName;
  navItems.forEach(item => item.classList.toggle('active', item.dataset.page === pageController.currentId));
}

navToggle.addEventListener('click', () => {
  const collapsed = app.classList.toggle('nav-collapsed');
  navToggle.setAttribute('aria-expanded', String(!collapsed));
});

document.querySelector('#main-nav').addEventListener('click', event => {
  const pageButton = event.target.closest('[data-page]');
  if (!pageButton) return;
  pageController.switchTo(pageButton.dataset.page);
  updateSharedHeader(getState());
});

document.addEventListener('click', event => {
  const pageButton = event.target.closest('[data-page]');
  if (pageButton && !pageButton.closest('#main-nav')) pageController.switchTo(pageButton.dataset.page);
  if (event.target.closest('[data-action="reset"]')) resetGame();
});

// 鼠标悬停/聚焦即预取，等真正点击时模板已就绪。
navItems.forEach(item => {
  const prefetch = () => pageController.prefetch(item.dataset.page);
  ['mouseenter', 'focus', 'pointerdown'].forEach(type => item.addEventListener(type, prefetch, { once: true }));
});

subscribe(state => { updateSharedHeader(state); applyFontScale(state); pageController.renderCurrent(); });
updateSharedHeader(getState());
applyFontScale(getState());
pageController.switchTo('home');
pageController.prefetchAll();
startLoop();
