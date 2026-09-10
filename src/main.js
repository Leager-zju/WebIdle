import pageController from './page-controller.js';
import { getState, currentZone, subscribe, startLoop, resetGame } from './game-state.js';
import homePage from './pages/home.js';
import adventurePage from './pages/adventure.js';
import inventoryPage from './pages/inventory.js';
import systemsPage from './pages/systems.js';
import storyPage from './pages/story.js';

const app = document.querySelector('#game-app');
const status = document.querySelector('#game-status');
const navToggle = document.querySelector('#nav-toggle');

[homePage, adventurePage, inventoryPage, systemsPage, storyPage].forEach(page => pageController.register(page));

function updateSharedHeader(state) {
  const zoneName = state.adventure.running ? `远征中 · ${currentZone(state).name}` : '营地待命';
  status.classList.toggle('paused', !state.adventure.running);
  status.querySelector('span').textContent = zoneName;
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.page === pageController.currentId));
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

subscribe(state => { updateSharedHeader(state); pageController.renderCurrent(); });
updateSharedHeader(getState());
pageController.switchTo('home');
startLoop();
