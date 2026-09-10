import { getState, items, itemOrder, formatNumber, getInventoryCapacity, getInventoryUsed } from '../game-state.js';

let viewMode = 'grid';
const page = {
  id: 'inventory',
  async render() {
    const root = document.querySelector('#page-content');
    if (root.dataset.page !== this.id) { root.innerHTML = await fetch('./pages/inventory.html').then(response => response.text()); root.dataset.page = this.id; }
    const state = getState();
    const discoveredItems = itemOrder.filter(id => (state.inventory[id] || 0) > 0);
    const totalKinds = discoveredItems.length;
    const totalItems = getInventoryUsed(state);
    const capacity = getInventoryCapacity(state);
    const cards = discoveredItems.map(id => { const item = items[id]; const quantity = state.inventory[id]; return `<article class="item-card rarity-${item.rarity}"><div class="item-icon">${item.icon}</div><div class="item-copy"><b>${item.name}</b><span class="item-type">${item.type} · ${item.rarity}</span><p>${item.description}</p></div><strong class="item-quantity">×${formatNumber(quantity)}</strong></article>`; }).join('');
    const content = cards ? (viewMode === 'grid' ? `<div class="item-grid">${cards}</div>` : `<div class="item-list">${cards}</div>`) : '<div class="inventory-empty">物品栏还是空的。开始冒险后，掉落物会自动收纳到这里。</div>';
    document.querySelector('#inventory-view').innerHTML = `<div class="inventory-heading"><div><span class="panel-kicker">ITEM STORAGE</span><h3>物品储藏</h3><p>已发现 ${totalKinds} / ${itemOrder.length} 种物品，共 ${formatNumber(totalItems)} / ${formatNumber(capacity)} 件。</p><div class="capacity-track"><div class="capacity-bar" style="width:${Math.min(100, totalItems / capacity * 100)}%"></div></div></div><div class="view-switch"><button class="secondary-button ${viewMode === 'grid' ? 'active' : ''}" type="button" data-view="grid">网格</button><button class="secondary-button ${viewMode === 'list' ? 'active' : ''}" type="button" data-view="list">列表</button></div></div>${content}`;
    root.onclick = event => { const button = event.target.closest('[data-view]'); if (!button) return; viewMode = button.dataset.view; this.render(); };
  }
};

export default page;
