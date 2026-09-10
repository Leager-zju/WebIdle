// 带脏检查的 DOM 写入工具：值没变就不碰 DOM，避免每帧无谓的重排/重绘。
export function setText(element, value) {
  if (!element) return;
  const next = String(value);
  if (element.textContent !== next) element.textContent = next;
}

export function setHtml(element, value) {
  if (!element) return;
  if (element.__html === value) return;
  element.__html = value;
  element.innerHTML = value;
}

export function setWidth(element, percent) {
  if (!element) return;
  const next = `${Math.max(0, Math.min(100, percent)).toFixed(2)}%`;
  if (element.style.width !== next) element.style.width = next;
}

export function setClass(element, name, enabled) {
  if (!element) return;
  element.classList.toggle(name, !!enabled);
}

export function setHidden(element, hidden) {
  if (!element) return;
  if (element.hidden !== !!hidden) element.hidden = !!hidden;
}

export function setDisabled(element, disabled) {
  if (!element) return;
  if (element.disabled !== !!disabled) element.disabled = !!disabled;
}

// 一次性抓取 data-ref 节点，后续更新不再重复查询。
export function pick(root, ...names) {
  const map = {};
  names.forEach(name => { map[name] = root.querySelector(`[data-ref="${name}"]`); });
  return map;
}

export function toFragment(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

export function prefersReducedMotion() {
  return window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
}
