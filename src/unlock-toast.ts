import { onUnlock, type UnlockEvent } from './game-state';

/* 解锁提示：页面上方居中弹出的 tips。
   机制解锁与成就解锁都由 game-state 的 onUnlock 事件推过来，这里只负责显示与回收。
   多条同时解锁时向下堆叠，各自到点淡出。 */
const DURATION = 4200;   // 每条提示停留的毫秒数
const MAX_VISIBLE = 4;   // 同时最多显示几条，避免一进游戏刷一屏

let layer: HTMLElement | null = null;

function ensureLayer(): HTMLElement {
  if (layer?.isConnected) return layer;
  const element = document.createElement('div');
  element.className = 'unlock-toast-layer';
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  document.body.appendChild(element);
  layer = element;
  return element;
}

/** 弹一条解锁提示：格式为「icon 解锁：分类「名称」」，下面一行是可选的补充说明。 */
export function showUnlock(event: UnlockEvent): void {
  const host = ensureLayer();
  const toast = document.createElement('div');
  toast.className = 'unlock-toast';
  const title = document.createElement('span');
  title.className = 'unlock-toast-title';
  title.textContent = `${event.icon} 解锁：${event.category}「${event.name}」`;
  toast.appendChild(title);
  if (event.detail) {
    const detail = document.createElement('span');
    detail.className = 'unlock-toast-detail';
    detail.textContent = event.detail;
    toast.appendChild(detail);
  }
  host.appendChild(toast);
  while (host.childElementCount > MAX_VISIBLE) host.firstElementChild?.remove();
  setTimeout(() => {
    toast.classList.add('leaving');
    /* 等淡出动画走完再移除；动画被跳过时（无 transition 环境）兜底也要摘掉。 */
    setTimeout(() => toast.remove(), 300);
  }, DURATION);
}

/** 应用启动时调用一次：把 game-state 的解锁事件接到提示上。 */
export function startUnlockToasts(): void { onUnlock(showUnlock); }
