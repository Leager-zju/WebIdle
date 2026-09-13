/* ——— 数值表示体系 ———
   随着游戏推进，金币 / 生命 / 伤害 / 工时都会涨到很多位。为了让这些数字在任何量级下都只占固定宽度，
   「一个 number 怎么变成字符串」只在这里决定，其它模块一律调用 formatNumber / setNumber。

   三档规则：
   1) 小于 1e6：完整整数 + 千分位。早期数值都在这里，玩家能逐个核对材料数量，可读性优先。
   2) 1e6 ~ 1e15：短标单位（M 百万 / B 十亿 / T 万亿）+ 3 位有效数字，如 1.23M、12.3B、999T。
   3) 大于等于 1e15：工程技术法 —— 指数恒为 3 的倍数，尾数 1.00 ~ 999，如 1.23e15、45.6e18。
      取 3 的倍数而不是科学计数法的 1 位整数，是为了和前面的单位档保持同一套量级直觉。

   缩写只发生在显示层：存档、计算、比较全部仍然用原始 number。
   需要精确值时用 formatNumberExact（开发者面板、输入回显），或读 numberHint（悬停显示完整数字）。 */

/** 完整显示的界限：小于一百万直接写完整整数。 */
const FULL_LIMIT = 1e6;
/** 单位后缀：下标 i 对应 10^(3i)。K 这一档平时用不到（1e3 还在完整显示区），只在进位时借用。 */
const UNIT_SUFFIX = ['', 'K', 'M', 'B', 'T'];

/** 千分位整数：zh-CN 的分组就是三位一逗号。 */
function grouped(value: number): string { return Math.floor(value).toLocaleString('zh-CN'); }

/** 保留三位有效数字：123 → "123"，12.3 → "12.3"，1.23 → "1.23"。 */
function significant(value: number): string {
  if (value >= 100) return String(Math.round(value));
  if (value >= 10) return (Math.round(value * 10) / 10).toFixed(1);
  return (Math.round(value * 100) / 100).toFixed(2);
}

/** 把绝对值拆成「尾数 + 以 1000 为底的档位」，并处理四舍五入造成的进位：999.6M 会变成 1.00B。 */
function split(value: number): { text: string; tier: number } {
  let tier = Math.floor(Math.log10(value) / 3);
  let text = significant(value / 10 ** (tier * 3));
  if (Number(text) >= 1000) { tier += 1; text = significant(value / 10 ** (tier * 3)); }
  return { text, tier };
}

/** 非有限值的兜底：NaN 显示破折号，正负无穷显示 ∞。 */
function fallback(value: number): string { return Number.isNaN(value) ? '—' : value < 0 ? '-∞' : '∞'; }

/* ——— 数字显示方式（设置页选项）————
   缩写规则因人而异：有人要一眼看出量级，有人要精确核对材料。这里提供三档，
   由设置项 settings.numberFormat 决定，main.ts 每帧把当前档位同步进来。 */

/** 档位 id：顺序即 numberFormats 的下标。 */
export const NUMBER_FORMAT = { auto: 0, engineering: 1, scientific: 2 };

/** 设置页的选项：label 上按钮，hint 是按钮下方的说明。 */
export const numberFormats = [
  { id: NUMBER_FORMAT.auto, label: '自动', hint: '小数字完整显示，大数字缩写为 M / B / T，再大用工程计数法' },
  { id: NUMBER_FORMAT.engineering, label: '工程', hint: '大数字用工程计数法：指数恒为 3 的倍数，如 1.23e6、999e9' },
  { id: NUMBER_FORMAT.scientific, label: '科学', hint: '大数字用科学计数法：尾数 1.00 ~ 9.99，如 1.23e9' }
];

/** 当前生效的档位。只影响显示，存档与计算始终是原始 number。 */
let activeFormat: number = NUMBER_FORMAT.auto;
export function setActiveNumberFormat(id: number): void { activeFormat = numberFormats.some(entry => entry.id === id) ? id : NUMBER_FORMAT.auto; }
export function getActiveNumberFormat(): number { return activeFormat; }

/** 科学计数法：尾数 1.00 ~ 9.99，指数为任意整数（区别于工程计数法的 3 的倍数）。 */
function scientific(value: number): string {
  let exponent = Math.floor(Math.log10(value));
  let text = significant(value / 10 ** exponent);
  /* 四舍五入把尾数顶到 10（如 9.999 → 10.0）时，指数进一位重新算。 */
  if (Number(text) >= 10) { exponent += 1; text = significant(value / 10 ** exponent); }
  return `${text}e${exponent}`;
}

/** 通用数值显示：小数字完整显示，大数字自动缩写。所有界面数值都应该走这里。 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return fallback(value);
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  /* 小数字在任何档位下都写完整（可读性优先）：12,345 没人想看成 12.3e3。 */
  if (abs < FULL_LIMIT) return sign + grouped(abs);
  if (activeFormat === NUMBER_FORMAT.scientific) return sign + scientific(abs);
  const { text, tier } = split(abs);
  /* 工程技术法：指数写成 3 的倍数，尾数 1.00 ~ 999。
     自动档在有单位后缀时优先用 M / B / T（更好读），超出单位表才回落到 e 记法；工程档一律用 e 记法。 */
  return activeFormat === NUMBER_FORMAT.auto && tier < UNIT_SUFFIX.length
    ? `${sign}${text}${UNIT_SUFFIX[tier]}`
    : `${sign}${text}e${tier * 3}`;
}

/** 完整显示（不缩写）：开发者面板、需要精确核对的场合用。 */
export function formatNumberExact(value: number): string {
  if (!Number.isFinite(value)) return fallback(value);
  const abs = Math.abs(value);
  return (value < 0 ? '-' : '') + grouped(abs);
}

/** 带符号的增减量：+1,234 / -1.23M。日志与提示里的收益用。 */
export function formatSigned(value: number): string {
  if (!Number.isFinite(value)) return fallback(value);
  return (value < 0 ? '-' : '+') + formatNumber(Math.abs(value));
}

/** 悬停时给的完整数字；与缩写结果相同时返回空串，省掉没有意义的 title。 */
export function numberHint(value: number): string {
  if (!Number.isFinite(value)) return '';
  const exact = formatNumberExact(value);
  return exact === formatNumber(value) ? '' : exact;
}

/** 时长。离线结算与工时都可能跨天，所以最大单位做到「天」。 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (days) return `${days}天${hours}小时`;
  if (hours) return `${hours}小时${minutes}分`;
  if (minutes) return `${minutes}分${secs}秒`;
  return `${secs}秒`;
}
