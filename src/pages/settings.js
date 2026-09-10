import { fontScales, getFontScale, setFontScale } from '../game-state.js';
import { setText, setClass, pick } from '../dom.js';

const page = {
  id: 'settings',
  template: './pages/settings.html',

  mount(root) {
    const view = root.querySelector('#settings-view');
    view.innerHTML = `<div class="setting-row"><div class="setting-copy"><span class="panel-kicker">FONT SIZE</span><h3>字体大小</h3></div><div class="segmented" data-ref="group">${fontScales.map(option => `<button class="segment" type="button" data-scale="${option.id}">${option.label}</button>`).join('')}</div></div>`;

    const refs = pick(view, 'current', 'group');
    refs.group.onclick = event => {
      const button = event.target.closest('[data-scale]');
      if (button) setFontScale(button.dataset.scale);
    };

    return { current: refs.current, buttons: [...refs.group.querySelectorAll('[data-scale]')] };
  },

  update(state, ctx) {
    const active = getFontScale(state);
    ctx.buttons.forEach(button => setClass(button, 'active', button.dataset.scale === active.id));
    setText(ctx.current, active.label);
  }
};

export default page;
