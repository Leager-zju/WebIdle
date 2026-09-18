/* ——— 装备特性（trait）———
   一件装备可以带若干条特性标签，特性是**装备自己的效果**，对所有怪物生效：
   - `piercing`【破甲】：攻击时**无视敌人的固定防御**（伤害 = 攻击力，不减防御）——
     高防的怪身上这一条最值钱（见 game-state 的 playerAttack）；
   - `insulated`【隔热】：**受到的伤害减少 15%**（见 game-state 的 enemyAttack）。
   两条都要在装备详情与图鉴物品页里写出来（名字 + 效果说明）。

   ⚠️ 2026-09-18 起**没有「门槛特性」了**：敌人身上的 `requires` / `immune` 整条移除 ——
   原来那套（没带某条特性就受伤 ×2.5 / 伤害 ÷3）会把 Boss 变成「翻包找钥匙」，
   现在难度只由身板与数值决定。docs 侧同步改的是 庇护所扩展方案 §4.7 与 UI开发规范 §7.20。
   ⚠️ 判定只有一处（game-state 的 hasTrait），显示两处（装备详情、图鉴的物品页）——
   加新特性时记得在下面补一条，否则界面上只会显示 key。

   ⚠️ key 是写在 config/items.ts 里的标识，**改名只动 name**、不要动 key。
   ⚠️ `sonar`（声呐）本批**没有任何物品使用** —— 它留给批次 5 的无声之海 / 齿轮深渊，
   现在只是把名字占住（见 `庇护所扩展方案.md` §4.7）。 */
/** 带数值的特性把数值放这一处，desc 跟着它生成 —— 免得「15%」在代码与文案里各写一份。 */
export const TRAIT_EFFECT = {
  /** 【隔热】：受到的伤害减少这个比例（0~1），对所有敌人生效（见 game-state 的 enemyAttack）。 */
  insulatedDamageCut: .15
};
const TRAIT_DEFS = {
  insulated: { name: '隔热', desc: `受到的伤害减少 ${Math.round(TRAIT_EFFECT.insulatedDamageCut * 100)}%。` },
  piercing: { name: '破甲', desc: '攻击时无视敌人的固定防御。' },
  sonar: { name: '声呐', desc: '在静默里也能听出东西的位置。' }
} satisfies Record<string, { name: string; desc: string }>;

export const traits = Object.entries(TRAIT_DEFS).map(([id, definition]) => ({ id, ...definition }));
/** 特性名的显示文案；未知 key 原样返回（不至于在界面上显示成空白）。 */
export function traitName(id: string): string {
  const entry = traits.find(candidate => candidate.id === id);
  return entry ? entry.name : id;
}
/** 特性的效果说明（装备详情与图鉴的物品页用它 —— 特性必须有出口，不能只有名字）。未知 key 返回空串。 */
export function traitDesc(id: string): string {
  const entry = traits.find(candidate => candidate.id === id);
  return entry ? entry.desc : '';
}

