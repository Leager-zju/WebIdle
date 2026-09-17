import { helpPages } from './config/help';
import { setHtml } from './dom';

/* ——— 页面帮助 ———
   一个页面一个入口：标题右侧（page-code 下方）的【帮助】按钮带 `data-help="<页面 id>"`，
   点了就在浮层里列出这个页面的「怎么用」。文案维护在 config/help.ts，这个模块只管展示。

   为什么单独开一个浮层、而不是把说明留在标题下面：标题下那句是**给这个世界**的（氛围），
   操作说明是**给玩家的**（说明书）。两者混在一起时，页面第一眼读到的永远是「怎么点」，
   而不是「这是个什么地方」。所以氛围留在标题，操作收进这里（见 UI开发规范 §7.18）。

   单例浮层挂 body：fixed 定位，而 #page-content 有 contain: layout（见 UI开发规范 §10-01）。
   三种关闭方式齐全（R12）：关闭按钮、点遮罩、Esc。 */

/** 文案里可能带 `<` / `&` 这类字符，进 innerHTML 前转义（同 changelog.ts）。 */
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
function escapeHtml(text: string): string { return text.replace(/[&<>"]/g, char => ESCAPES[char]); }

function bodyMarkup(pageId: string): string {
  const page = helpPages[pageId];
  /* 表格里没有这个页面：按钮是新加的、文案还没写 —— 说清是「没写」而不是装作没事，
     免得新人以为帮助功能坏了。 */
  if (!page) return '<p class="help-empty">这个页面还没有写帮助。</p>';
  return page.sections.map(section => `<section class="help-section"><h4 class="help-section-title">${escapeHtml(section.title)}</h4><ul class="help-list">${section.lines.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul></section>`).join('');
}

let layer: HTMLElement | null = null;
function ensureLayer(): HTMLElement {
  if (layer?.isConnected) return layer;
  const element = document.createElement('div');
  element.className = 'help-layer';
  element.hidden = true;
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');
  element.setAttribute('aria-label', '页面帮助');
  element.innerHTML = `<article class="help"><div class="help-head"><div><span class="panel-kicker">HELP</span><h3 data-help-title></h3></div><button class="help-close" type="button" data-help-close aria-label="关闭">×</button></div><div class="help-body" data-help-body></div></article>`;
  element.addEventListener('click', event => {
    const target = event.target as Element;
    /* 点关闭按钮、或点在遮罩本身上（不是它的子节点）都关窗。 */
    if (target.closest('[data-help-close]') || target.classList.contains('help-layer')) closeHelp();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeHelp(); });
  document.body.appendChild(element);
  layer = element;
  return element;
}

/** 打开某个页面的帮助。pageId 就是 PageDefinition.id（也是按钮上的 data-help）。 */
export function openHelp(pageId: string): void {
  const element = ensureLayer();
  const page = helpPages[pageId];
  setHtml(element.querySelector<HTMLElement>('[data-help-title]'), page ? `${escapeHtml(page.name)} · 使用说明` : '帮助');
  setHtml(element.querySelector<HTMLElement>('[data-help-body]'), bodyMarkup(pageId));
  element.hidden = false;
}

export function closeHelp(): void { if (layer) layer.hidden = true; }
