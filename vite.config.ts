import { defineConfig } from 'vite';

/* 开发者面板开关规则（构建期决定，线上无法再打开）：
     npm run dev              -> 开（本地开发默认可用）
     npm run build            -> 关（部署到 GitHub Pages 的产物默认不含开发者功能）
     npm run build:devtools   -> 开（需要用 vite build --mode devtools 显式指定）
   另外 DEV_TOOLS=false 可以强制关闭任何场景：DEV_TOOLS=false npm run dev
   __DEV_TOOLS__ 会被替换成字面量 true / false，于是设置页里 `if (__DEV_TOOLS__)` 包住的
   那整段代码（面板 DOM、事件绑定、以及只为它服务的 dev* 函数）会被打包器直接摇掉，
   不会出现在 dist 产物里。 */
const OFF_VALUES = ['0', 'false', 'no', 'off'];

export default defineConfig(({ command, mode }) => {
  const envValue = (process.env.DEV_TOOLS ?? '').trim().toLowerCase();
  const forcedOff = OFF_VALUES.includes(envValue);
  const devTools = !forcedOff && (command === 'serve' || mode === 'devtools');

  return {
    /* GitHub Pages 是项目站点（https://<user>.github.io/WebIdle/），资源若用绝对路径 /assets/... 会 404。
       使用相对路径 ./ 后，dist 既能在子目录下部署，也能被 python server.py 直接托管。 */
    base: './',
    define: { __DEV_TOOLS__: String(devTools) }
  };
});
