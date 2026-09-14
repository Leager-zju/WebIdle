import { getState, getChangelogSeen, markChangelogSeen, hasExistingSave } from './game-state';
import { whenGuideIdle } from './guide';
import { setHtml, reportError } from './dom';
import type { ChangelogEntry } from './types';

/* ——— 版本更新日志 ———
   数据来自 git 提交历史：游戏是纯前端产物，运行时读不到 .git，所以由 vite.config.ts 在
   构建期跑一次 `git log`，把结果内联成 __CHANGELOG__（见 globals.d.ts）。这个模块只负责
   解析与展示，不碰构建逻辑。

   两个入口：
   - 设置页「查看更新日志」按钮 → openChangelog()
   - 进入游戏时若存档里的已读版本不是最新 → startChangelog() 自动弹一次公告

   「已读版本」存在存档里（settings.changelogSeen），所以换设备导入备份后不会重复弹。
   单例浮层挂 body：fixed 定位，而 #page-content 有 contain: layout（见 UI开发规范 §10-01）。 */

/** 构建期注入的记录。解析失败（理论上只有手改产物才会遇到）就当没有记录，不让它拖垮启动。 */
const ENTRIES: ChangelogEntry[] = (() => {
  try {
    const parsed = JSON.parse(__CHANGELOG__);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    reportError('changelog', '更新日志解析失败', error);
    return [];
  }
})();

/** 提交信息是纯文本，进 innerHTML 前必须转义（提交正文里出现过 `≤3` 这类写法）。 */
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
function escapeHtml(text: string): string { return text.replace(/[&<>"]/g, char => ESCAPES[char]); }

/** 最新一条的版本号；没有记录时是空串（不是 git 仓库构建的产物）。 */
function latestVersion(): string { return ENTRIES[0]?.version || ''; }

function entryMarkup(entry: ChangelogEntry, isNew: boolean): string {
  const details = entry.details.length ? `<ul class="changelog-list">${entry.details.map(detail => `<li>${escapeHtml(detail)}</li>`).join('')}</ul>` : '';
  return `<section class="changelog-entry${isNew ? ' is-new' : ''}"><div class="changelog-meta"><time class="changelog-date">${escapeHtml(entry.date)}</time><span class="changelog-kind ${entry.kindClass}">${escapeHtml(entry.kind)}</span></div><h4 class="changelog-title">${escapeHtml(entry.title)}</h4>${details}</section>`;
}

/** 正文：按时间由新到旧列出「更新时间 + 改动内容」。
    seenVersion 之后的记录（比它新）标成「本次新增」—— 公告要让人一眼看出这次改了什么。 */
function bodyMarkup(seenVersion: string): string {
  if (!ENTRIES.length) return '<p class="changelog-note">这份构建没有带更新记录。</p>';
  const seenIndex = seenVersion ? ENTRIES.findIndex(entry => entry.version === seenVersion) : -1;
  /* 没记到已读版本（首次带日志的版本、或那条记录已经不在列表里）时，只把最新一条当新内容。 */
  const isNew = (index: number): boolean => (seenIndex < 0 ? index === 0 : index < seenIndex);
  return ENTRIES.map((entry, index) => entryMarkup(entry, isNew(index))).join('');
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

function render(seenVersion: string): void {
  const element = ensureLayer();
  setHtml(element.querySelector<HTMLElement>('[data-changelog-body]'), bodyMarkup(seenVersion));
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
  const latest = latestVersion();
  if (!latest || getChangelogSeen(getState()) === latest) return;
  if (!hasExistingSave()) { markChangelogSeen(latest); return; }
  whenGuideIdle(() => {
    render(getChangelogSeen(getState()));
    markChangelogSeen(latest);
  });
}
