import {
  startCampChallenge, answerPendingEvent, getCampMaxHp, getCampAttack, getCampDefense, getCampRegen, getCampHp,
  getCampBattle, getNextCampChallenge, getPendingEvent, formatNumber, formatDuration, RANDOM_EVENT_INTERVAL
} from '../game-state';
import { setText, setNumber, setHtml, setWidth, setClass, setHidden, setDisabled, pick } from '../dom';
import type { GameState, PageDefinition } from '../types';

/* 两块并排：左边营地状态，右边当前威胁；下面是整行的行动按钮，最后是营地日志。 */
const statusMarkup = `<div class="panel-heading"><div><span class="panel-kicker">CAMP VITALS</span><h3>营地</h3></div></div>
  <p class="camp-hint" data-ref="copy"></p>
  <div class="camp-stat-grid"><div class="mini-stat"><span>营地生命</span><b data-ref="hp"></b></div><div class="mini-stat"><span>营地攻击</span><b data-ref="attack"></b></div><div class="mini-stat"><span>营地防御</span><b data-ref="defense"></b></div><div class="mini-stat"><span>生命恢复</span><b data-ref="regen"></b></div></div>
  <div class="health-track"><div class="health-bar camp-health" data-ref="health"></div></div>`;
const threatMarkup = `<div class="panel-heading"><div><span class="panel-kicker">THREAT</span><h3 data-ref="threatTitle"></h3></div><span class="muted" data-ref="threatState"></span></div>
  <p class="camp-hint" data-ref="threatDesc"></p>
  <div class="camp-stat-grid"><div class="mini-stat"><span>事件生命</span><b data-ref="eventHp"></b></div><div class="mini-stat"><span>事件攻击</span><b data-ref="eventAttack"></b></div><div class="mini-stat"><span>事件防御</span><b data-ref="eventDefense"></b></div><div class="mini-stat"><span>出手间隔</span><b data-ref="eventInterval"></b></div></div>
  <div class="health-track"><div class="health-bar enemy-health" data-ref="eventHealth"></div></div>`;
/** 营地状态的一行描述：按当前处境（交战 / 受损 / 待响应 / 已清空）给玩家一句可读的提示。 */
function campCopy(state: GameState, battle: ReturnType<typeof getCampBattle>, pending: ReturnType<typeof getPendingEvent>): string {
  if (battle) return `防线正在与「${battle.name}」交战，谁的生命先归零谁输。`;
  const maxHp = getCampMaxHp(state);
  const hp = getCampHp(state);
  if (hp <= maxHp * .35) return `营地刚挨过一次冲击，正在抢修：脱战时每秒恢复 ${getCampRegen(state).toFixed(1)} 点生命，修满再迎战更稳。`;
  if (hp < maxHp) return `营地在整修中，当前生命 ${Math.round(hp / maxHp * 100)}%，会随时间自动恢复。`;
  if (pending) return `营地收到警报「${pending.name}」，等你决定应对还是跳过。`;
  if (state.camp.disasterWins + state.camp.tideWins >= 2) return '天灾与兽潮都已击退，营火照亮了通往更远处的路。';
  return '营火稳定，防线完整';
}
/** 倒计时刻度：12 格，每格代表「随机事件间隔 ÷ 12」（默认 5 分钟）。 */
const TIMER_CELLS = Array.from({ length: 12 });
const logMarkup = (state: GameState): string => state.log.length ? state.log.slice(0, 8).map(entry => `<div class="log-entry log-${entry.type || 'system'}"><span class="log-time">${entry.time}</span><span>${entry.message}</span></div>`).join('') : '<div class="log-empty">营地暂无记录。</div>';

const page: PageDefinition<any> = {
  id: 'camp', template: './pages/camp.html',
  mount(root) {
    const view = root.querySelector<HTMLElement>('#camp-view')!;
    view.innerHTML = `<div class="camp-event-timer">
        <div class="camp-event-head"><span class="panel-kicker">NEXT RANDOM EVENT</span><span class="camp-timer" data-ref="randomTimer"></span></div>
        <div class="camp-event-track" data-ref="randomTimerBar">${TIMER_CELLS.map(() => '<i class="camp-event-cell"></i>').join('')}</div>
      </div>
      <div class="camp-layout"><section class="camp-block camp-status">${statusMarkup}</section><section class="camp-block camp-threat">${threatMarkup}</section></div>
      <div class="camp-actions"><span class="camp-countdown" data-ref="countdown"></span><button class="primary-button camp-challenge" type="button" data-action="challenge" data-ref="challenge"></button><button class="secondary-button camp-accept" type="button" data-action="accept" data-ref="accept">应对</button><button class="secondary-button" type="button" data-action="decline" data-ref="decline">跳过</button></div>
      <div class="event-log compact camp-log" data-ref="log"></div>`;
    const ctx: any = {
      ...pick(view, 'copy', 'hp', 'attack', 'defense', 'regen', 'health', 'threatTitle', 'threatState', 'threatDesc',
        'eventHp', 'eventAttack', 'eventDefense', 'eventInterval', 'eventHealth', 'randomTimer', 'randomTimerBar', 'countdown', 'challenge', 'accept', 'decline', 'log'),
      cells: [...view.querySelectorAll<HTMLElement>('.camp-event-cell')],
      threat: view.querySelector<HTMLElement>('.camp-threat')
    };
    root.onclick = event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-action]');
      if (!button || button.disabled) return;
      if (button.dataset.action === 'challenge') startCampChallenge();
      else if (button.dataset.action === 'accept') answerPendingEvent(true);
      else if (button.dataset.action === 'decline') answerPendingEvent(false);
    };
    return ctx;
  },
  update(state: GameState, ctx: any) {
    const battle = getCampBattle();
    /* 战斗中显示战斗里的实时血量，脱战时显示按恢复速度回血的营地生命。 */
    const maxHp = battle ? battle.campMaxHp : getCampMaxHp(state);
    const hp = battle ? battle.campHp : getCampHp(state);
    setText(ctx.hp, `${formatNumber(hp)} / ${formatNumber(maxHp)}`);
    setNumber(ctx.attack, getCampAttack(state));
    setNumber(ctx.defense, getCampDefense(state));
    setText(ctx.regen, `${getCampRegen(state).toFixed(1)} / 秒`);
    setWidth(ctx.health, maxHp ? hp / maxHp * 100 : 0);

    const pending = getPendingEvent(state);
    const challenge = getNextCampChallenge(state);
    setText(ctx.copy, campCopy(state, battle, pending));
    setClass(ctx.threat, 'in-battle', !!battle);
    if (battle) {
      setText(ctx.threatTitle, battle.name);
      setText(ctx.threatState, '交战中');
      setText(ctx.threatDesc, '营地防线与事件正面碰撞：谁的生命先归零谁输。');
      /* 事件生命全程都是「当前 / 最大」：未开打时两者相同，开战后当前值随交战下降。 */
      setText(ctx.eventHp, `${formatNumber(battle.eventHp)} / ${formatNumber(battle.eventMaxHp)}`);
      setNumber(ctx.eventAttack, battle.eventAttack);
      setNumber(ctx.eventDefense, battle.eventDefense);
      setText(ctx.eventInterval, `${battle.eventInterval.toFixed(1)} 秒`);
      setWidth(ctx.eventHealth, battle.eventMaxHp ? battle.eventHp / battle.eventMaxHp * 100 : 0);
      setText(ctx.challenge, '交战中…');
    } else if (pending) {
      setText(ctx.threatTitle, `${pending.icon} ${pending.name}`);
      setText(ctx.threatState, '等待响应');
      setText(ctx.threatDesc, pending.desc);
      setText(ctx.eventHp, `${formatNumber(pending.hp)} / ${formatNumber(pending.maxHp)}`);
      setNumber(ctx.eventAttack, pending.attack);
      setNumber(ctx.eventDefense, pending.defense);
      setText(ctx.eventInterval, `${pending.interval.toFixed(1)} 秒`);
      setWidth(ctx.eventHealth, 100);
      setText(ctx.challenge, '应对');
    } else if (challenge) {
      setText(ctx.threatTitle, `${challenge.icon} ${challenge.name}`);
      setText(ctx.threatState, '随时可迎战');
      setText(ctx.threatDesc, challenge.desc);
      setText(ctx.eventHp, `${formatNumber(challenge.hp)} / ${formatNumber(challenge.maxHp)}`);
      setNumber(ctx.eventAttack, challenge.attack);
      setNumber(ctx.eventDefense, challenge.defense);
      setText(ctx.eventInterval, `${challenge.interval.toFixed(1)} 秒`);
      setWidth(ctx.eventHealth, 100);
      setText(ctx.challenge, '迎接挑战');
    } else {
      setText(ctx.threatTitle, '营地暂时安全');
      setText(ctx.threatState, '大事件已清空');
      setText(ctx.threatDesc, '天灾与兽潮都已经被击退。之后只有荒野里的随机事件会打断营地的日常。');
      setText(ctx.eventHp, '—');
      setText(ctx.eventAttack, '—');
      setText(ctx.eventDefense, '—');
      setText(ctx.eventInterval, '—');
      setWidth(ctx.eventHealth, 0);
      setText(ctx.challenge, '暂无挑战');
    }
    setDisabled(ctx.challenge, !!battle || (!pending && !challenge));
    setHidden(ctx.accept, !pending);
    setHidden(ctx.decline, !pending);
    setHidden(ctx.challenge, !!pending);
    /* 下一次随机事件的倒计时：交战、等待响应时计时暂停（见 game-state 的 advanceCamp）。 */
    /* 下一次随机事件的倒计时：条长按剩余时间占比，交战与等待响应时计时暂停（见 advanceCamp）。 */
    const timerLeft = Math.max(0, Math.min(RANDOM_EVENT_INTERVAL, state.camp.randomTimer));
    setText(ctx.randomTimer, battle ? '交战中，计时暂停' : pending ? '突发状况等待响应中' : `下一次随机事件 ${formatDuration(Math.ceil(timerLeft))}`);
    /* 点亮剩下的格子：靠右对齐，时间流逝时从左往右熄灭。 */
    const lit = Math.ceil(timerLeft / RANDOM_EVENT_INTERVAL * ctx.cells.length);
    ctx.cells.forEach((cell: HTMLElement, index: number) => setClass(cell, 'on', index >= ctx.cells.length - lit));
    setText(ctx.countdown, pending ? `剩余响应时间 ${Math.max(0, Math.ceil((pending.expiresAt - Date.now()) / 1000))} 秒` : '');
    setHtml(ctx.log, logMarkup(state));
  }
};
export default page;
