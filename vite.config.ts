import { defineConfig, loadEnv } from 'vite';
import { execFileSync } from 'node:child_process';

/* 开发者面板开关规则（构建期决定，线上无法再打开）：
     npm run dev              -> 开（本地开发默认可用）
     npm run build            -> 关（部署到 GitHub Pages 的产物默认不含开发者功能）
     npm run build:devtools   -> 开（需要用 vite build --mode devtools 显式指定）
     DEV_TOOLS=1 npm run build     -> 开（环境变量显式开启，等价于 --mode devtools）
     DEV_TOOLS=0 npm run dev       -> 关（环境变量显式关闭，优先级最高，任何场景都生效）
   __DEV_TOOLS__ 会被替换成字面量 true / false，于是设置页里 `if (__DEV_TOOLS__)` 包住的
   那整段代码（面板 DOM、事件绑定、以及只为它服务的 dev* 函数）会被打包器直接摇掉，
   不会出现在 dist 产物里。 */
const OFF_VALUES = ['0', 'false', 'no', 'off'];
const ON_VALUES = ['1', 'true', 'yes', 'on'];

/* ——— 更新日志：构建期从 git 提交历史里抓一次 ———
   纯前端产物在运行时读不到 .git，所以只能在构建（或开发服务器启动）时抓，再把结果
   通过 define 内联成 __CHANGELOG__（做法同 __DEV_TOOLS__，见 globals.d.ts）。
   设置页的「版本更新日志」弹窗与进入游戏时的更新公告都读它（见 src/changelog.ts）。

   三条边界：
   - 不是 git 仓库（从压缩包构建、机器上没装 git）时给空数组，界面退化成「这份构建没有带
     更新记录」，不要让构建直接失败；
   - 只取最近 CHANGELOG_LIMIT 条：产物里内联的是全量文本，历史变长后得有个上限；
   - 配置只在启动时读一次，所以新提交要重启 dev server / 重新构建才会出现在日志里。 */
const CHANGELOG_LIMIT = 60;
/** 记录 / 字段分隔符用 ASCII 控制字符：正常提交信息里不会出现，省掉一整套转义规则。 */
const RECORD_SEP = '\x1e';
const FIELD_SEP = '\x1f';
/** 提交类型前缀 → 界面上的中文标签与颜色类（.kind-* 见 style.css）。没写前缀的按「其他」。 */
const CHANGELOG_KINDS: Record<string, [string, string]> = {
  feat: ['新内容', 'kind-feat'],
  fix: ['修复', 'kind-fix'],
  balance: ['平衡', 'kind-balance'],
  perf: ['优化', 'kind-balance'],
  chore: ['维护', 'kind-misc'],
  docs: ['文档', 'kind-misc'],
  refactor: ['重构', 'kind-misc'],
  style: ['样式', 'kind-misc'],
  test: ['测试', 'kind-misc'],
  build: ['构建', 'kind-misc']
};

/** 提交正文 → 改动要点。有 `-` 列表就按列表取（缩进的续行并进上一条），
    没有列表就按行取 —— 大多数提交的正文本来就是一（几）段话。 */
function readDetails(body: string): string[] {
  const lines = body.split('\n').map(line => line.trim()).filter(Boolean);
  const bullets: string[] = [];
  lines.forEach(line => {
    if (/^[-*·]\s*/.test(line)) bullets.push(line.replace(/^[-*·]\s*/, ''));
    else if (bullets.length) bullets[bullets.length - 1] += ` ${line}`;
  });
  return bullets.length ? bullets : lines;
}

/** 读出提交历史，返回**已经序列化好的 JSON 文本**（define 还会再 stringify 一次，
    把它变成字符串字面量）。字段见 types.ts 的 ChangelogEntry。 */
function readChangelog(): string {
  try {
    const output = execFileSync('git', [
      'log', `-${CHANGELOG_LIMIT}`, '--no-merges', '--date=format:%Y-%m-%d %H:%M',
      `--pretty=format:%h${FIELD_SEP}%ad${FIELD_SEP}%s${FIELD_SEP}%b${RECORD_SEP}`
    ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    const entries = output.split(RECORD_SEP).map(record => record.trim()).filter(Boolean).map(record => {
      const [version, date, subject, body = ''] = record.split(FIELD_SEP);
      /* `feat(inventory): xxx` 这种带 scope 的前缀也要认。 */
      const prefix = /^([a-z]+)(?:\([^)]*\))?:\s*(.*)$/.exec(subject);
      const [kind, kindClass] = CHANGELOG_KINDS[prefix?.[1] ?? ''] ?? ['其他', 'kind-misc'];
      return { version, date, kind, kindClass, title: prefix ? prefix[2] : subject, details: readDetails(body) };
    });
    return JSON.stringify(entries);
  } catch {
    return '[]';
  }
}

export default defineConfig(({ command, mode }) => {
  /* 用 vite 的 loadEnv 读取开关：不依赖 process（省掉 @types/node），并顺带支持 .env 文件。 */
  const envValue = (loadEnv(mode, '.', 'DEV_TOOLS').DEV_TOOLS ?? '').trim().toLowerCase();
  /* vite preview 复用的也是 serve 命令（mode 为 production），它预览的是已有产物，不算开发环境。 */
  const isPreview = command === 'serve' && mode === 'production';
  /* 显式关闭 > 显式开启 > 默认规则（开发服务器开、devtools 模式开、其余构建关）。 */
  const devTools = OFF_VALUES.includes(envValue)
    ? false
    : ON_VALUES.includes(envValue) || (!isPreview && (command === 'serve' || mode === 'devtools'));

  /* 构建态开着就明确告警，避免含开发者面板的产物被误部署到公网。 */
  if (devTools && command === 'build') {
    console.warn('[vite] 开发者功能已开启：本次产物包含开发者面板，请勿部署到公网。');
  }

  /* 更新日志只在构建 / 开发服务器启动时抓一次。 */
  const changelog = readChangelog();

  return {
    /* GitHub Pages 是项目站点（https://<user>.github.io/WebIdle/），资源若用绝对路径 /assets/... 会 404。
       使用相对路径 ./ 后，dist 既能在子目录下部署，也能被 python server.py 直接托管。 */
    base: './',
    /* define 的值会被当作代码原样插入，所以 __CHANGELOG__ 要再 stringify 一次变成字符串字面量
       （代码里用 JSON.parse(__CHANGELOG__) 取回）。 */
    define: { __DEV_TOOLS__: String(devTools), __CHANGELOG__: JSON.stringify(changelog) }
  };
});
