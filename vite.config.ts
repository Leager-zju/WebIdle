import { defineConfig } from 'vite';

/* 开发者面板开关。默认开启；构建时把它关掉：
     DEV_TOOLS=false npm run build
   __DEV_TOOLS__ 会被替换成字面量 true / false，于是设置页里 `if (__DEV_TOOLS__)` 包住的
   那整段代码（面板 DOM、事件绑定、以及只为它服务的 dev* 函数）会被打包器直接摇掉，
   不会出现在 dist 产物里。 */
const devTools = process.env.DEV_TOOLS !== 'false';

export default defineConfig({
  /* GitHub Pages 是项目站点（https://<user>.github.io/WebIdle/），资源若用绝对路径 /assets/... 会 404。
     使用相对路径 ./ 后，dist 既能在子目录下部署，也能被 python server.py 直接托管。 */
  base: './',
  define: { __DEV_TOOLS__: String(devTools) }
});
