const pageController = {
  pages: new Map(),
  currentId: 'home',
  renderToken: 0,

  register(page) {
    this.pages.set(page.id, page);
  },

  switchTo(id) {
    if (!this.pages.has(id)) return;
    const content = document.querySelector('#page-content');
    if (this.currentId === id && content.dataset.page === id) return;
    this.currentId = id;
    content.removeAttribute('data-page');
    content.innerHTML = '<div class="page-loading">正在打开页面…</div>';
    this.renderCurrent();
  },

  renderCurrent() {
    const page = this.pages.get(this.currentId);
    if (!page) return;
    const token = ++this.renderToken;
    page.render().catch(error => {
      if (token !== this.renderToken) return;
      const content = document.querySelector('#page-content');
      content.innerHTML = '<div class="page-error">页面加载失败，请刷新后重试。</div>';
      console.error(`Unable to render page: ${page.id}`, error);
    });
  }
};

export default pageController;
