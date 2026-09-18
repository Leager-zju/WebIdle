/* ——— 工坊 / 军事训练共用的卡片零件 ———
   两页的卡片是**同一个形状**（`pages/workshop.ts` 的 `.shop-item`）：图标 / 名称 / 等级在左 + 进度条，
   右侧是当前值与「需要 / 现有」的材料行，操作（派人 / 开工）独占一行，说明留在悬停浮层里。
   这两段标记放这里共用 —— 改样式时别只改一页：两页的卡片必须长得一模一样。 */

/** 材料一行：需要 / 现有，由页面的 update 决定标红还是标绿。
    label 有两种：金币不是物品，直接写文字；废料与装甲板是物品表里的物品，传物品引用
    （icon + 名称 + 稀有度色 + 可点开图鉴）。红绿只作用在数值上 —— 标签本身是 muted，
    所以物品引用不会和「材料够不够」的语义色打架。 */
export const matMarkup = (key: string, label: string): string => `<span class="shop-mat" data-mat="${key}"><i>${label}</i><b class="mat-value"></b></span>`;

/** 人数分配：批量按钮贴在步进器两侧 ——「«」把这一项的人全部撤下，「»」把待命的人全部投入。
    target 是**后勤下标**：工坊传 `fortSlot(id)`、军事训练传 `drillSlot(slot)`。 */
export const stepperMarkup = (target: number): string => `<button class="step-button batch" type="button" data-action="assign-none" data-target="${target}" data-ref="assignNone" title="撤下这一项的全部分配" aria-label="撤下这一项的全部分配">«</button><button class="step-button" type="button" data-action="assign" data-target="${target}" data-delta="-1" aria-label="减少一人">−</button><span class="logistics-count" data-ref="workers"></span><button class="step-button" type="button" data-action="assign" data-target="${target}" data-delta="1" aria-label="增加一人">+</button><button class="step-button batch" type="button" data-action="assign-all" data-target="${target}" data-ref="assignAll" title="把待命的后勤人数全部投入" aria-label="把待命的后勤人数全部投入">»</button>`;

/** 步进器的点击处理：撤下全部 / 减少 / 增加 / 全员投入（两个页面共用同一份语义）。
    返回 true 表示这次点击被它吃掉了。 */
export function handleStepperClick(button: HTMLElement, assign: (index: number, delta: number) => void, idle: () => number, assigned: (index: number) => number): boolean {
  const action = button.dataset.action;
  if (action !== 'assign' && action !== 'assign-all' && action !== 'assign-none') return false;
  const index = Number(button.dataset.target);
  if (action === 'assign-all') assign(index, idle());
  else if (action === 'assign-none') assign(index, -assigned(index));
  else assign(index, Number(button.dataset.delta));
  return true;
}
