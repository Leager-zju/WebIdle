import { getPower, upgradeWorkshop, upgradeResearch, upgradeCompanions } from '../game-state.js';
import { setText, setClass, setHidden, setDisabled, pick } from '../dom.js';

const workshopCost = state => 40 + state.workshop * 35;
const researchCost = state => 2 + state.research * 3;
const companionGold = state => 100 + state.companions * 90;
const companionEssence = state => 4 + state.companions * 3;

const SYSTEMS = [
  {
    id: 'auto',
    cta: null,
    unlocked: () => true,
    title: () => '自动冒险',
    desc: () => '基础系统。离线期间继续推进已选择的区域。',
    cost: () => '永久运行',
    affordable: () => true
  },
  {
    id: 'workshop',
    cta: '升级',
    unlocked: state => state.mainlineIndex >= 2,
    title: state => `工坊 · Lv.${state.workshop}`,
    desc: state => (state.mainlineIndex >= 2 ? '消耗废料强化营地，每级提高冒险材料收益与战力。' : '完成第一片区域后解锁。'),
    cost: state => `${workshopCost(state)} 废料`,
    affordable: state => state.scrap >= workshopCost(state)
  },
  {
    id: 'research',
    cta: '研究',
    unlocked: state => state.mainlineIndex >= 3,
    title: state => `研究 · Lv.${state.research}`,
    desc: state => (state.mainlineIndex >= 3 ? '消耗精华研究新技术，每级提高全局冒险战力。' : '收集 3 个旧电池后解锁。'),
    cost: state => `${researchCost(state)} 精华`,
    affordable: state => state.essence >= researchCost(state)
  },
  {
    id: 'companions',
    cta: '招募',
    unlocked: state => state.mainlineIndex >= 4,
    title: state => `伙伴 · Lv.${state.companions}`,
    desc: state => (state.mainlineIndex >= 4 ? '招募伙伴扩大队伍，每级提高战力。' : '收集 3 个装甲板后解锁。'),
    cost: state => `${companionGold(state)} 金币 · ${companionEssence(state)} 精华`,
    affordable: state => state.gold >= companionGold(state) && state.essence >= companionEssence(state)
  }
];

const ACTIONS = { workshop: upgradeWorkshop, research: upgradeResearch, companions: upgradeCompanions };

const page = {
  id: 'systems',
  template: './pages/systems.html',

  mount(root) {
    const view = root.querySelector('#systems-view');
    const cards = SYSTEMS.map(system => `<article class="system-card" data-ref="card"><h3 data-ref="title"></h3><p data-ref="desc"></p><div class="system-action"><span class="cost" data-ref="cost"></span><button class="secondary-button" type="button" data-action="${system.id}" data-ref="cta"></button><span class="zone-status" data-ref="lock"></span></div></article>`).join('');
    view.innerHTML = `<div class="systems-summary"><span class="panel-kicker">GLOBAL POWER</span><strong data-ref="power"></strong><span>当前远征战力</span></div><div class="system-list">${cards}</div>`;

    root.onclick = event => {
      const button = event.target.closest('[data-action]');
      if (!button || button.disabled) return;
      ACTIONS[button.dataset.action]?.();
    };

    return {
      power: view.querySelector('[data-ref="power"]'),
      items: [...view.querySelectorAll('.system-card')].map(card => ({ card, ...pick(card, 'title', 'desc', 'cost', 'cta', 'lock') }))
    };
  },

  update(state, ctx) {
    setText(ctx.power, getPower(state));
    SYSTEMS.forEach((system, index) => {
      const refs = ctx.items[index];
      if (!refs) return;
      const unlocked = system.unlocked(state);
      const showCta = unlocked && !!system.cta;
      setClass(refs.card, 'locked', !unlocked);
      setText(refs.title, system.title(state));
      setText(refs.desc, system.desc(state));
      setHidden(refs.cost, !unlocked);
      setHidden(refs.cta, !showCta);
      setHidden(refs.lock, showCta);
      setText(refs.lock, unlocked ? '已解锁' : '未解锁');
      if (system.cta) {
        setText(refs.cta, system.cta);
        setDisabled(refs.cta, !system.affordable(state));
      }
    });
  }
};

export default page;
