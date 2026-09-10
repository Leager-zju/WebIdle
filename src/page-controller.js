import { getState } from './game-state.js';
import { toFragment, prefersReducedMotion } from './dom.js';

const templateCache = new Map();
// 页面高度"只增不减"：所有页共用这个下限，切到矮页面时滚动位置才不会被截断。
let tallestPageHeight = 0;

function loadTemplate(page) {
  if (!page.template) return Promise.resolve('');
  if (templateCache.has(page.id)) return templateCache.get(page.id);
  const request = fetch(page.template)
    .then(response => {
      if (!response.ok) throw new Error(`${response.status} ${page.template}`);
      return response.text();
    })
    .catch(error => {
      templateCache.delete(page.id);
      throw error;
    });
  templateCache.set(page.id, request);
  return request;
}

const pageController = {
  pages: new Map(),
  currentId: 'home',
  renderToken: 0,
  frame: 0,
  context: null,

  register(page) {
    this.pages.set(page.id, page);
  },

  // 预取：模板落缓存后，切换页面就是纯内存操作，零网络等待。
  prefetch(id) {
    const page = this.pages.get(id);
    if (!page || templateCache.has(id)) return;
    loadTemplate(page).catch(() => {});
  },

  prefetchAll() {
    const ids = [...this.pages.keys()];
    const run = () => ids.forEach(id => this.prefetch(id));
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2000 });
    else setTimeout(run, 200);
  },

  switchTo(id) {
    if (!this.pages.has(id)) { console.warn(`页面未注册：${id}`); return; }
    const content = document.querySelector('#page-content');
    if (this.currentId === id && content.dataset.page === id) return;
    this.currentId = id;
    content.removeAttribute('data-page');
    if (!content.childElementCount) content.innerHTML = '<div class="page-loading">正在打开页面…</div>';
    if (!templateCache.has(id)) content.classList.add('is-switching');
    this.mountPage(id);
  },

  async mountPage(id) {
    const token = ++this.renderToken;
    const page = this.pages.get(id);
    let html = '';
    try {
      html = await loadTemplate(page);
    } catch (error) {
      if (token !== this.renderToken) return;
      const content = document.querySelector('#page-content');
      content.classList.remove('is-switching');
      content.innerHTML = '<div class="page-error">页面加载失败，请刷新后重试。</div>';
      console.error(`Unable to load template: ${id}`, error);
      return;
    }
    if (token !== this.renderToken) return;

    const content = document.querySelector('#page-content');
    // 旧的页面句柄必须清掉：#page-content 本身是复用的，事件委托会跨页残留。
    content.onclick = null;
    content.onchange = null;
    content.oncontextmenu = null;

    // 离屏构建 + 一次原子替换：只触发一次布局，不会出现"先白后填"的闪烁。
    const apply = () => {
      content.replaceChildren(toFragment(html));
      content.dataset.page = id;
      this.context = typeof page.mount === 'function' ? page.mount(content) || {} : {};
      this.paint();
      // 不碰 window.scrollY：切换保持当前落点。只要各页高度一致就不会被浏览器 clamp。
      const height = content.scrollHeight;
      if (height > tallestPageHeight) {
        tallestPageHeight = height;
        content.style.minHeight = `${height}px`;
      }
    };

    const reduceMotion = prefersReducedMotion();
    const canTransition = typeof document.startViewTransition === 'function' && !reduceMotion;
    if (canTransition) {
      try { document.startViewTransition(apply); } catch { apply(); }
    } else {
      apply();
      if (!reduceMotion) {
        content.animate(
          [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
          { duration: 180, easing: 'ease-out' }
        );
      }
    }

    content.classList.remove('is-switching');
  },

  // 字体档位切换后页面高度整体变化，重置下限并重新测量，避免残留上一档位撑出的空白。
  remeasure() {
    const content = document.querySelector('#page-content');
    if (!content) return;
    content.style.minHeight = '';
    tallestPageHeight = content.scrollHeight;
    content.style.minHeight = `${tallestPageHeight}px`;
  },

  // rAF 合并：一帧内多次 notify 只画一次。
  renderCurrent() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.paint();
    });
  },

  paint() {
    const content = document.querySelector('#page-content');
    const page = this.pages.get(this.currentId);
    if (!page || content.dataset.page !== this.currentId) return;
    try {
      if (typeof page.update === 'function') page.update(getState(), this.context);
      else page.render();
    } catch (error) {
      console.error(`Unable to render page: ${page.id}`, error);
    }
  }
};

export default pageController;
