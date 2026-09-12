/** 构建期常量，由 vite.config.ts 的 define 注入。
    npm run dev -> true；npm run build -> false（线上产物不含开发者功能）；
    npm run build:devtools -> true。
    为 false 时，所有 `if (__DEV_TOOLS__)` 包住的开发者代码都不会进入构建产物。 */
declare const __DEV_TOOLS__: boolean;
