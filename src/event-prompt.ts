import { getState, getPendingEvent, answerPendingEvent, formatNumber } from './game-state';
import { setText, pick } from './dom';

/* 随机事件弹窗：只在「设置 - 通知」打开时出现。
   超时由主循环负责判定（advanceCamp 里到点就跳过），弹窗因此会随事件一起消失，不需要自己定计时器。 */
type PromptRefs = Record<string, HTMLElement | null> & { icon: HTMLElement | null; name: HTMLElement | null; desc: HTMLElement | null; stats: HTMLElement | null; count: HTMLElement | null };
let layer: HTMLElement | null = null;
let refs: PromptRefs | null = null;

function ensureLayer(): { layer: HTMLElement; refs: PromptRefs } {
  if (layer && refs) return { layer, refs };
  const element = document.createElement('div');
  element.className = 'event-prompt-layer';
  element.hidden = true;
  element.innerHTML = `<div class="event-prompt"><div class="event-prompt-head"><span class="event-prompt-icon" data-ref="icon"></span><div><span class="panel-kicker">CAMP ALERT</span><h3 data-ref="name"></h3></div></div><p class="event-prompt-desc" data-ref="desc"></p><p class="event-prompt-stats" data-ref="stats"></p><p class="event-prompt-count" data-ref="count"></p><div class="event-prompt-actions"><button class="primary-button" type="button" data-answer="accept">立即应对</button><button class="secondary-button" type="button" data-answer="decline">跳过</button></div></div>`;
  element.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLElement>('[data-answer]');
    if (button) answerPendingEvent(button.dataset.answer === 'accept');
  });
  document.body.appendChild(element);
  layer = element;
  refs = pick(element, 'icon', 'name', 'desc', 'stats', 'count') as PromptRefs;
  return { layer, refs };
}

/** 每次状态刷新都会调用：没有待响应事件或关了通知就把弹窗收起来。 */
export function updateEventPrompt(): void {
  const state = getState();
  const pending = getPendingEvent(state);
  if (!pending || !state.settings.notify) { if (layer) layer.hidden = true; return; }
  const { layer: element, refs: view } = ensureLayer();
  setText(view.icon, pending.icon);
  setText(view.name, pending.name);
  setText(view.desc, pending.desc);
  setText(view.stats, `事件生命 ${formatNumber(pending.hp)} · 攻击 ${formatNumber(pending.attack)} · 防御 ${formatNumber(pending.defense)}　｜　营地生命 ${formatNumber(getState().camp.hp)}`);
  setText(view.count, `剩余 ${Math.max(0, Math.ceil((pending.expiresAt - Date.now()) / 1000))} 秒未响应将自动跳过`);
  element.hidden = false;
}
