import { getState, getChangelogSeen, markChangelogSeen, hasExistingSave } from './game-state';
import { whenGuideIdle } from './guide';
import { changelogNotes } from './config/changelog';
import { setHtml } from './dom';
import type { ChangelogKind, ChangelogNote } from './types';

/* ——— 版本更新日志 ———
   文案**不是**从 git 提交信息里来的：提交信息写给开发者，里面有函数名、文件名与内部字段，
   那些不该出现在公告里。玩家视角的公告单独维护在 config/changelog.ts，这个模块只负责
   展示与「已读」判断。

   两个入口：
   - 设置页「查看更新日志」按钮 → openChangelog()
   - 进入游戏时若存档里的已读版本不是最新 → startChangelog() 自动弹一次公告

   「已读版本」存在存档里（settings.changelogSeen），所以换设备导入备份后不会重复弹。
   单例浮层挂 body：fixed 定位，而 #page-content 有 contain: layout（见 UI开发规范 §10-01）。 */

/** 类型标签的文字与颜色类（`.kind-*` 见 style.css）。 */
const KIND_INFO: Record<ChangelogKind, { label: string; className: string }> = {
  feat: { label: '新内容', className: 'kind-feat' },
  balance: { label: '平衡', className: 'kind-balance' },
  fix: { label: '修复', className: 'kind-fix' },
  perf: { label: '优化', className: 'kind-misc' },
  misc: { label: '调整', className: 'kind-misc' }
};

/** 文案里可能带 `<` / `&` 这类字符，进 innerHTML 前转义。 */
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
function escapeHtml(text: string): string { return text.replace(/[&<>"]/g, char => ESCAPES[char]); }

/** 最新一条的标记；公告表是空的（理论上不会）时是空串。 */
function latestId(): string { return changelogNotes[0]?.id || ''; }

function entryMarkup(entry: ChangelogNote, isNew: boolean): string {
  const kind = KIND_INFO[entry.kind] || KIND_INFO.misc;
  const details = entry.details.length ? `<ul class="changelog-list">${entry.details.map(detail => `<li>${escapeHtml(detail)}</li>`).join('')}</ul>` : '';
  return `<section class="changelog-entry${isNew ? ' is-new' : ''}"><div class="changelog-meta"><time class="changelog-date">${escapeHtml(entry.date)}</time><span class="changelog-kind ${kind.className}">${kind.label}</span></div><h4 class="changelog-title">${escapeHtml(entry.title)}</h4>${details}</section>`;
}

/** 正文：按时间由新到旧列出「更新时间 + 改动内容」。
    seenId 之后的记录（比它新）标成「本次新增」—— 公告要让人一眼看出这次改了什么。 */
function bodyMarkup(seenId: string): string {
  if (!changelogNotes.length) return '<p class="changelog-note">还没有更新记录。</p>';
  const seenIndex = seenId ? changelogNotes.findIndex(entry => entry.id === seenId) : -1;
  /* 没记到已读版本（第一次带日志的版本、或那条记录已经被删掉）时，只把最新一条当新内容。 */
  const isNew = (index: number): boolean => (seenIndex < 0 ? index === 0 : index < seenIndex);
  return changelogNotes.map((entry, index) => entryMarkup(entry, isNew(index))).join('');
}

let layer: HTMLElement | null = null;
function ensureLayer(): HTMLElement {
  if (layer?.isConnected) return layer;
  const element = document.createElement('div');
  element.className = 'changelog-layer';
  element.hidden = true;
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');
  element.setAttribute('aria-label', '版本更新日志');
  element.innerHTML = `<article class="changelog"><div class="changelog-head"><div><span class="panel-kicker">CHANGELOG</span><h3>版本更新日志</h3></div><button class="changelog-close" type="button" data-changelog-close aria-label="关闭">×</button></div><div class="changelog-body" data-changelog-body></div></article>`;
  element.addEventListener('click', event => {
    const target = event.target as Element;
    /* 点关闭按钮、或点在遮罩本身上（不是它的子节点）都关窗。 */
    if (target.closest('[data-changelog-close]') || target.classList.contains('changelog-layer')) closeChangelog();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeChangelog(); });
  document.body.appendChild(element);
  layer = element;
  return element;
}

function render(seenId: string): void {
  const element = ensureLayer();
  setHtml(element.querySelector<HTMLElement>('[data-changelog-body]'), bodyMarkup(seenId));
  element.hidden = false;
}

export function closeChangelog(): void { if (layer) layer.hidden = true; }

/** 设置页的「查看更新日志」按钮：列出全部记录，已读之后的那些标成新内容。 */
export function openChangelog(): void { render(getChangelogSeen(getState())); }

/** 应用启动时调用一次：存档里的已读版本不是最新就弹一次公告。
    两种情况不弹：
    - 没有任何存档 —— 那是新玩家，不是「版本更新了」；
    - 首次引导还没放完 —— 引导层在最上层，压着它弹出来只会被盖住（等它结束再弹）。 */
export function startChangelog(): void {
  const latest = latestId();
  if (!latest || getChangelogSeen(getState()) === latest) return;
  if (!hasExistingSave()) { markChangelogSeen(latest); return; }
  whenGuideIdle(() => {
    render(getChangelogSeen(getState()));
    markChangelogSeen(latest);
  });
}
