import { defineConfig, loadEnv } from 'vite';

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

  return {
    /* GitHub Pages 是项目站点（https://<user>.github.io/WebIdle/），资源若用绝对路径 /assets/... 会 404。
       使用相对路径 ./ 后，dist 既能在子目录下部署，也能被 python server.py 直接托管。 */
    base: './',
    define: { __DEV_TOOLS__: String(devTools) }
  };
});
