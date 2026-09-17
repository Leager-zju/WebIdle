import { ITEM } from './items';
import { unlockBy } from './unlock';
import type { CampaignQuest } from '../types';

/* ——— 剧情任务（远征档案 → 主线剧情 → 第二章「余烬之外」）———
   一条任务 = 一件**系统物品**，也是那一章里的一节。整条链路：

     条件达成（checkQuests 每帧检查）
       → 奖励物品自动进物品栏（不占负载、不能丢弃）
       → 玩家右键「使用」它
       → 安装浮层：按 install.mode 走那种形态（付资源 / 解读线索）
       → installQuest() 扣代价、把物品用掉、任务转「已安装」
       → 它解锁的那一项（工坊制造项 / 研究项）出现

   为什么写进档案章节、而不是"波末悄悄发一个"：它是一条**看得见的进度**（哪几节已经完成、
   哪一节正等着你去用图纸），而不是打到一半背包里突然多出个不认识的东西。
   ⚠️ 但**没达成的节不显示内容**（标题 / 条件 / 奖励都遮成「未解锁记录」/「???」）——
   和第一章没走到的节同一个口径，别在这里"提前剧透"。

   四条约定：
   1) **展示位置在 chapter 树里**：`pages/story.ts` 的 chapters 把这张表整体挂成第二章 ——
      它**不是**独立页签（那会和「主线剧情」重复），也**不进 `mainline` 数组**
      （那条数组按下标存进存档，插节点会挪动既有下标）。
   2) **哪一项解锁哪一条不写在这里** —— 写在被解锁的条目上（`workshopItems[].quest` /
      `researchItems[].quest`），反查走 game-state 的 questTarget()。这样 campaign 只单向依赖
      items / unlock，不会和 game-state 成环。
   3) **追加新任务只能放末尾**：`state.quests` 是按下标存的（同 mapSets / unlockNotices 的规矩）。
   4) `install` 是"可插拔"的接缝：新增一种安装玩法 = types.ts 的 QuestInstall 加一个分支 +
      src/install.ts 加一个渲染分支 + 样式一个块。**game-state 与这张表都不用动。**

   ⚠️ 谜题类形态（mode: 'choice'）的公平性护栏：线索与答案都得能从**浮层里给出的信息**推出来，
   不依赖游戏外的知识、记忆或跨页查找；答错无惩罚，可以无限重试。见 UI开发规范 §7.19。 */
const QUEST_DEFS = {
  /** 第 1 条：老玩家可能早就过了第 1 波 —— 条件是"当前波次 > 1"，所以一进来就会补发。 */
  sentryBlueprint: {
    itemId: ITEM.sentryBlueprint, name: '哨塔蓝图', icon: '📐', kicker: 'QUEST 01',
    requirement: unlockBy.wave(1),
    /* 单纯支付资源：数值待调，和工坊制造项的第一级造价对齐（图纸是"省工时"的那条路）。 */
    install: { mode: 'pay', cost: { gold: 150, scrap: 60 } },
    desc: '一张画着弩台射击位的旧图。原主人把射界标得极细，边上还写着「别让它空着」。'
  },
  /** 第 2 条：解读线索 —— 谜面自洽（三件仪表划掉了三个方位），不依赖任何外部信息。 */
  surveyParts: {
    itemId: ITEM.surveyParts, name: '测绘仪零件', icon: '🧭', kicker: 'QUEST 02',
    requirement: unlockBy.wave(2),
    install: {
      mode: 'choice',
      hint: '三件仪表背面各刻着一个方位，都被划掉了：不是东、不是南、也不是西。',
      options: [{ id: 0, label: '东' }, { id: 1, label: '南' }, { id: 2, label: '西' }, { id: 3, label: '北' }],
      answer: 3
    },
    desc: '从事件残骸里捡回来的几件仪表。基地说，装之前得先把方位校准。'
  }
} satisfies Record<string, CampaignQuest>;

export const campaignQuests: CampaignQuest[] = Object.values(QUEST_DEFS);
/** 任务名 → 下标，用法同 ITEM / RARITY。条目表里写 `quest: QUEST.sentryBlueprint`，不要写魔法数字。 */
export const QUEST = Object.fromEntries(Object.keys(QUEST_DEFS).map((name, index) => [name, index])) as { [K in keyof typeof QUEST_DEFS]: number };

/** 物品 → 任务下标（-1 表示这件物品不是任务奖励）。 */
export function questOfItem(itemId: number): number { return campaignQuests.findIndex(quest => quest.itemId === itemId); }
