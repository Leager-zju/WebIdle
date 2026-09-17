import { campaignQuests, getQuestCost, canInstallQuest, installQuest, questTarget, ITEM, getState, formatNumber } from './game-state';
import { itemRefMarkup } from './codex-ref';
import { setHtml } from './dom';

/* ——— 安装浮层：系统物品的「使用」落到这里 ———
   入口只有一个：物品栏右键 → 使用（物品的 use 返回 `open-install`，见 config/items.ts）。
   浮层按 `campaignQuests[i].install.mode` 渲染出**那种**交互体 —— 这就是"可插拔"的接缝：

     新增一种安装玩法 = 三处：① types.ts 的 QuestInstall 加一个联合分支
                              ② 本文件加一个 `xxxBody()` 渲染函数 + 提交分支
                              ③ style.css 加一个样式块
     game-state 的 installQuest / canInstallQuest 与剧情任务表都不用动
     （结算只认"代价够不够 + 谜题答对没答对"，与形态无关）。

   三条约定：
   1) **浮层是纯界面状态**：打开、答错、取消都不写存档（R05）。真正的结算只在 installQuest() 里发生，
      而且它会再复验一遍（R30）—— 界面状态不可信。
   2) **取消 = 什么都没发生**：物品不消耗（物品的 use 里没有 consume），代价也不扣。
   3) 谜题类形态：答错**不惩罚**，可以无限重试；线索与答案都能从浮层里给出的信息推出来
      （不依赖游戏外知识、记忆或跨页查找）。见 UI开发规范 §7.19。 */

let layer: HTMLElement | null = null;
/** 当前打开的任务下标（-1 = 没开）。 */
let currentQuest = -1;
/** 上一次提交没成功时的提示（答错 / 资源不够），重渲染时显示。 */
let message = '';

/** 代价行：缺的标红、够的标绿 —— 复用工坊材料行那套 `.shop-mat`（标签 + 需要 / 现有）。 */
function costMarkup(questId: number): string {
  const cost = getQuestCost(questId);
  const state = getState();
  const rows: string[] = [];
  const row = (label: string, need: number, have: number): void => {
    if (!need) return;
    rows.push(`<span class="shop-mat${have >= need ? ' ok' : ''}"><i>${label}</i><b class="mat-value">${formatNumber(need)} / 有 ${formatNumber(have)}</b></span>`);
  };
  row('金币', cost.gold, state.gold);
  row(itemRefMarkup(ITEM.scrap), cost.scrap, state.inventory[ITEM.scrap] || 0);
  row(itemRefMarkup(ITEM.armorPlate), cost.plate, state.inventory[ITEM.armorPlate] || 0);
  return rows.length ? `<div class="install-mats">${rows.join('')}</div>` : '';
}

/** 谜题体：线索 + 选项。点选项就是提交（少一步），答错原地提示、可以接着点。 */
function choiceBody(install: { hint: string; options: { id: number; label: string }[] }): string {
  return `<p class="install-hint">${install.hint}</p><div class="install-options">${install.options.map(option => `<button class="secondary-button" type="button" data-install-option="${option.id}">${option.label}</button>`).join('')}</div>`;
}

function bodyMarkup(questId: number): string {
  const quest = campaignQuests[questId];
  const install = quest.install;
  const target = questTarget(questId);
  const unlocks = target ? `${target.kind === 'workshop' ? '工坊' : '研究基地'}「${target.name}」` : '对应的建造项';
  const body = install.mode === 'choice' ? choiceBody(install) : '';
  /* 「开始安装」只在"没有谜题"的形态下出现：有谜题的形态点选项就已经是提交了。 */
  const confirm = install.mode === 'pay'
    ? `<div class="install-actions"><button class="primary-button wide" type="button" data-install-confirm${canInstallQuest(questId) ? '' : ' disabled'}>开始安装</button></div>`
    : '';
  return `<p class="install-target">装好之后：解锁${unlocks}</p><p class="install-desc">${quest.desc}</p>${costMarkup(questId)}${body}${message ? `<p class="install-message">${message}</p>` : ''}${confirm}`;
}

function render(): void {
  const element = ensureLayer();
  const quest = campaignQuests[currentQuest];
  if (!quest) { element.hidden = true; return; }
  setHtml(element.querySelector<HTMLElement>('[data-install-title]'), `安装 · ${quest.name}`);
  setHtml(element.querySelector<HTMLElement>('[data-install-body]'), bodyMarkup(currentQuest));
  element.hidden = false;
}

/** 提交一次安装尝试：成功就关窗（notify 会把解锁提示弹出来），失败就原地给出提示。 */
function submit(choiceId = -1): void {
  const quest = campaignQuests[currentQuest];
  if (!quest) return;
  if (installQuest(currentQuest, choiceId)) { closeInstallWindow(); return; }
  message = quest.install.mode === 'choice' && choiceId !== quest.install.answer ? '不对，再试一次。' : '代价还不够，先去攒一点。';
  render();
}

function ensureLayer(): HTMLElement {
  if (layer?.isConnected) return layer;
  const element = document.createElement('div');
  element.className = 'install-layer';
  element.hidden = true;
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');
  element.setAttribute('aria-label', '安装');
  element.innerHTML = `<article class="install"><div class="install-head"><div><span class="panel-kicker">INSTALL</span><h3 data-install-title></h3></div><button class="install-close" type="button" data-install-close aria-label="关闭">×</button></div><div class="install-body" data-install-body></div></article>`;
  element.addEventListener('click', event => {
    const target = event.target as Element;
    /* 点关闭按钮、或点在遮罩本身上（不是它的子节点）都关窗。 */
    if (target.closest('[data-install-close]') || target.classList.contains('install-layer')) { closeInstallWindow(); return; }
    if (target.closest('[data-install-confirm]')) { submit(); return; }
    const option = target.closest<HTMLElement>('[data-install-option]');
    if (option) submit(Number(option.dataset.installOption));
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeInstallWindow(); });
  document.body.appendChild(element);
  layer = element;
  return element;
}

/** 打开某条剧情任务的安装浮层（物品栏「使用」系统物品时调它）。 */
export function openInstallWindow(questId: number): void {
  currentQuest = questId;
  message = '';
  render();
}

export function closeInstallWindow(): void {
  currentQuest = -1;
  message = '';
  if (layer) layer.hidden = true;
}
