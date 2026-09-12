import { defineConfig } from 'vite';

/* 开发者面板开关。默认开启；构建时把它关掉：
     DEV_TOOLS=false npm run build
   __DEV_TOOLS__ 会被替换成字面量 true / false，于是设置页里 `if (__DEV_TOOLS__)` 包住的
   那整段代码（面板 DOM、事件绑定、以及只为它服务的 dev* 函数）会被打包器直接摇掉，
   不会出现在 dist 产物里。 */
const devTools = process.env.DEV_TOOLS !== 'false';

export default defineConfig({
  define: { __DEV_TOOLS__: String(devTools) }
});
