import { items, itemOrder, itemCategories, categoryOrder, formatNumber, getInventoryCapacity, getInventoryUsed, isEquipped, discardItem, useItem, equipItem } from '../game-state.js';
import { setText, setHtml, setWidth, pick } from '../dom.js';

let menuEl = null;
let menuTarget = null;

// 分类 → 在「丢弃」之上追加的菜单项。新增分类时在这里注册即可，无需改页面结构。
const CATEGORY_ACTIONS = {
  equipment: [{ id: 'equip', label: item => (isEquipped(item.id) ? '卸下' : '装备') }],
  consumable: [{ id: 'use', label: () => '使用' }]
};
const BASE_ACTIONS = [{ id: 'discard', label: () => '丢弃', danger: true }];

function actionsFor(item) { return [...(CATEGORY_ACTIONS[item.category] || []), ...BASE_ACTIONS]; }

function statLine(item) {
  if (item.equip) {
    const parts = [];
    if (item.equip.attack) parts.push(`攻击 +${item.equip.attack}`);
    if (item.equip.hp) parts.push(`生命 +${item.equip.hp}`);
    return parts.length ? `<div class="item-stats">${parts.join(' · ')}</div>` : '';
  }
  if (item.use) {
    const parts = [];
    if (item.use.heal) parts.push(`恢复 ${item.use.heal} 生命`);
    return parts.length ? `<div class="item-stats">${parts.join(' · ')}</div>` : '';
  }
  return '';
}

// 卡片常显：图标 / 名称 / 数量。类型、稀有度、描述放进 .item-detail，悬停才出现。
function cardMarkup(id, quantity) {
  const item = items[id];
  const equipped = isEquipped(id);
  return `<article class="item-card rarity-${item.rarity} ${equipped ? 'equipped' : ''}" data-item="${id}" data-category="${item.category}" tabindex="0">
<div class="item-icon">${item.icon}</div>
<div class="item-copy"><b>${item.name}</b>${equipped ? '<span class="item-equipped-tag">已装备</span>' : ''}</div>
<strong class="item-quantity">×${formatNumber(quantity)}</strong>
<div class="item-detail"><span class="item-type">${itemCategories[item.category].name} · ${item.type} · ${item.rarity}</span><p>${item.description}</p>${statLine(item)}</div>
</article>`;
}

function sectionsMarkup(state) {
  const buckets = new Map();
  itemOrder.forEach(id => {
    const quantity = state.inventory[id] || 0;
    if (quantity <= 0) return;
    const bucket = buckets.get(items[id].category) || { cards: [], kinds: 0, total: 0 };
    bucket.cards.push(cardMarkup(id, quantity));
    bucket.kinds += 1;
    bucket.total += quantity;
    buckets.set(items[id].category, bucket);
  });

  const sections = categoryOrder
    .filter(category => buckets.has(category))
    .map(category => {
      const bucket = buckets.get(category);
      return `<section class="item-section cat-${category}"><div class="item-section-head"><span class="item-section-bar"></span><h4 class="item-section-title">${itemCategories[category].name}</h4><span class="item-section-rule"></span><span class="item-section-count">${bucket.kinds} 种 · ${formatNumber(bucket.total)} 件</span></div><div class="item-grid">${bucket.cards.join('')}</div></section>`;
    })
    .join('');

  return sections || '<div class="inventory-empty">物品栏还是空的。开始冒险后，掉落物会自动收纳到这里。</div>';
}

function closeMenu() {
  if (!menuEl) return;
  menuEl.hidden = true;
  menuTarget = null;
}

function ensureMenu() {
  if (menuEl) return menuEl;
  menuEl = document.createElement('div');
  menuEl.className = 'item-context-menu';
  menuEl.hidden = true;
  document.body.appendChild(menuEl);

  menuEl.addEventListener('click', event => {
    const button = event.target.closest('[data-item-action]');
    if (!button || !menuTarget) return;
    const id = menuTarget;
    closeMenu();
    if (button.dataset.itemAction === 'discard') discardItem(id, 1);
    if (button.dataset.itemAction === 'use') useItem(id);
    if (button.dataset.itemAction === 'equip') equipItem(id);
  });

  // 点别处 / 按 Esc / 滚动 / 缩放都关掉菜单；切页时的点击也走这里。
  document.addEventListener('pointerdown', event => { if (!menuEl.contains(event.target)) closeMenu(); }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  window.addEventListener('scroll', closeMenu, true);
  window.addEventListener('resize', closeMenu);
  return menuEl;
}

function openMenu(itemId, x, y) {
  const item = items[itemId];
  if (!item) return;
  const menu = ensureMenu();
  menuTarget = itemId;
  menu.innerHTML = `<div class="context-menu-head"><b>${item.name}</b><span class="muted">${itemCategories[item.category].name}</span></div>`
    + actionsFor(item).map(action => `<button class="context-menu-item ${action.danger ? 'danger' : ''}" type="button" data-item-action="${action.id}">${action.label(item)}</button>`).join('');
  menu.hidden = false;

  // 先显示再量尺寸，然后贴边收进视口内。
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
}

const page = {
  id: 'inventory',
  template: './pages/inventory.html',

  mount(root) {
    const view = root.querySelector('#inventory-view');
    view.innerHTML = `<div class="inventory-heading"><div><span class="panel-kicker">ITEM STORAGE</span><h3>物品储藏</h3><div class="capacity-row"><p data-ref="summary"></p><div class="capacity-track"><div class="capacity-bar" data-ref="capacityBar"></div></div></div></div></div><div data-ref="content"></div>`;

    root.oncontextmenu = event => {
      const card = event.target.closest('[data-item]');
      if (!card) return;
      event.preventDefault();
      openMenu(card.dataset.item, event.clientX, event.clientY);
    };

    return { ...pick(view, 'summary', 'capacityBar', 'content'), signature: '' };
  },

  update(state, ctx) {
    const discovered = itemOrder.filter(id => (state.inventory[id] || 0) > 0);
    const totalItems = getInventoryUsed(state);
    const capacity = getInventoryCapacity(state);

    setText(ctx.summary, `已发现 ${discovered.length} / ${itemOrder.length} 种物品，共 ${formatNumber(totalItems)} / ${formatNumber(capacity)} 件。`);
    setWidth(ctx.capacityBar, totalItems / capacity * 100);

    // 物品清单只在种类/数量/装备状态变化时才重建。
    const equipped = Object.values(state.equipped || {}).join(',');
    const signature = `${equipped}|${discovered.map(id => `${id}:${state.inventory[id]}`).join(',')}`;
    if (ctx.signature === signature) return;
    ctx.signature = signature;
    setHtml(ctx.content, sectionsMarkup(state));
  }
};

export default page;
