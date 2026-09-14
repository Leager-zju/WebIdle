/** 构建期常量，由 vite.config.ts 的 define 注入。
    npm run dev -> true；npm run build -> false（线上产物不含开发者功能）；
    npm run build:devtools -> true。
    为 false 时，所有 `if (__DEV_TOOLS__)` 包住的开发者代码都不会进入构建产物。 */
declare const __DEV_TOOLS__: boolean;

/** 构建期常量：git 提交历史，内容是 `ChangelogEntry[]` 的 JSON 文本（见 types.ts / changelog.ts）。
    构建时由 vite.config.ts 跑 `git log` 抓取；不是 git 仓库时是 '[]'。
    游戏是纯前端产物，运行时读不到 .git，所以只能在构建期抓这一次。 */
declare const __CHANGELOG__: string;
