import { currentZone, currentEnemy, getPlayerAttack, getPlayerMaxHp, levelNeed, formatNumber, mainline } from '../game-state.js';
import { setText, setHtml, pick } from '../dom.js';

const RESOURCES = [
  { label: '金币 / GOLD', value: state => formatNumber(state.gold), rate: () => '击败敌人获得' },
  { label: '废料 / SCRAP', value: state => formatNumber(state.scrap), rate: state => `工坊 Lv.${state.workshop}` },
  { label: '精华 / ESSENCE', value: state => formatNumber(state.essence), rate: () => '研究资源' },
  { label: '经验 / EXP', value: state => `${formatNumber(state.xp)} / ${formatNumber(levelNeed(state))}`, rate: state => `Lv.${state.level}` },
  { label: '远征攻击力 / POWER', value: state => formatNumber(getPlayerAttack(state)), rate: state => (state.adventure.running ? '战斗中' : '待命') }
];

const HERO_SKELETON = `<div class="panel-heading"><div><span class="panel-kicker">EXPEDITION STATUS</span><h3 data-ref="zone"></h3></div><span class="zone-status" data-ref="status"></span></div>
<p class="hero-copy" data-ref="copy"></p>
<div class="hero-stats"><div class="mini-stat"><span>已完成战斗</span><b data-ref="wins"></b></div><div class="mini-stat"><span>当前敌人</span><b data-ref="enemy"></b></div><div class="mini-stat"><span>当前目标</span><b data-ref="goal"></b></div></div>
<button class="primary-button" data-page="adventure" type="button" data-ref="cta"></button>`;

const QUEST_SKELETON = `<div class="panel-heading"><div><span class="panel-kicker">MAINLINE</span><h3>当前主线</h3></div><span class="muted" data-ref="progress"></span></div><div data-ref="body"></div>
<button class="secondary-button wide" data-page="inventory" type="button">打开物品栏</button>`;

function logMarkup(state) {
  if (!state.log.length) return '<div class="log-entry"><span class="log-time">现在</span><span>战斗记录将在远征队出发后出现。</span></div>';
  return state.log.slice(0, 6).map(entry => `<div class="log-entry log-${entry.type || 'system'}"><span class="log-time">${entry.time}</span><span>${entry.message}</span></div>`).join('');
}

const page = {
  id: 'home',
  template: './pages/home.html',

  mount(root) {
    const resources = root.querySelector('#home-resources');
    resources.innerHTML = RESOURCES
      .map(item => `<div class="resource"><span class="resource-label">${item.label}</span><strong class="resource-value"></strong><span class="resource-rate"></span></div>`)
      .join('');
    setHtml(root.querySelector('#home-hero'), HERO_SKELETON);
    setHtml(root.querySelector('#home-quest'), QUEST_SKELETON);

    return {
      values: [...resources.querySelectorAll('.resource-value')],
      rates: [...resources.querySelectorAll('.resource-rate')],
      hero: pick(root.querySelector('#home-hero'), 'zone', 'status', 'copy', 'wins', 'enemy', 'goal', 'cta'),
      quest: pick(root.querySelector('#home-quest'), 'progress', 'body'),
      log: root.querySelector('#home-log')
    };
  },

  update(state, ctx) {
    RESOURCES.forEach((item, index) => {
      setText(ctx.values[index], item.value(state));
      setText(ctx.rates[index], item.rate(state));
    });

    const zone = currentZone(state);
    const enemy = currentEnemy(state);
    const maxHp = getPlayerMaxHp(state);
    setText(ctx.hero.zone, zone.name);
    setText(ctx.hero.status, state.adventure.running ? '战斗中' : '待命');
    setText(ctx.hero.copy, state.adventure.running
      ? `远征队正在与「${enemy.name}」交战。当前生命值 ${formatNumber(state.adventure.playerHp)} / ${formatNumber(maxHp)}。`
      : `目标区域：${zone.name}。下一场可能遭遇「${enemy.name}」或重装拾荒者。`);
    setText(ctx.hero.wins, formatNumber(state.totalWins));
    setText(ctx.hero.enemy, enemy.name);
    setText(ctx.hero.goal, state.mainlineIndex >= mainline.length ? '调查阶段完成' : mainline[state.mainlineIndex].title);
    setText(ctx.hero.cta, state.adventure.running ? '查看实时战斗' : '前往冒险页面');

    setText(ctx.quest.progress, `${state.mainlineIndex}/${mainline.length}`);
    setHtml(ctx.quest.body, state.mainlineIndex < mainline.length
      ? `<article class="quest"><div class="quest-title"><span>${mainline[state.mainlineIndex].title}</span><span>进行中</span></div><p class="quest-desc">${mainline[state.mainlineIndex].description}</p><div class="quest-reward">${mainline[state.mainlineIndex].reward}</div></article>`
      : '<div class="story-quote">边境调查阶段已经完成。新的区域信号正在等待确认。</div>');

    setHtml(ctx.log, logMarkup(state));
  }
};

export default page;
