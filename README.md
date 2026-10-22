# 插个 U 盘

一个斜上方桌面视角的 3D 插 U 盘跑酷游戏。U 盘持续向前，电脑从上方落下；对准三种位置并翻转方向，插对后电脑散架，插错即结束。

[打开游戏](https://usb-flip-game.vercel.app) · [制作计划](制作计划.md) · [操作说明](使用说明.md) · [部署验证](部署验证.md)

- 左右方向键 / A、D / 屏幕滑动：移动；空格 / ↑ / W：翻转。
- 起始速度 5.52，每次成功后目标速度乘以 1.05。
- 昵称首次填写后在本机记住，每局结束自动保存成绩。
- 左侧全国排行榜，右侧循环演示；手机通过图标展开。
- 全国榜和全部历史保存在 Supabase；离线 HTML 使用独立本机榜。

## 技术结构

浏览器 → Vercel `/api/runs`、`/api/scores`、`/api/leaderboard` → Supabase Edge Function → PostgreSQL。

`src/engine.js` 同时用于客户端和服务端操作重放校验。成绩表启用 RLS，匿名角色不能直接写表或调用内部数据库函数。Vercel 只保存项目 URL 和应用 anon JWT；数据库管理密钥使用 Supabase 运行环境注入值，不放入网页或 GitHub。

## 本地运行

使用 Node.js 24：

```sh
npm ci
cp .env.example .env.local
# 填写自己的 Supabase 项目 URL 和 legacy anon JWT
npm run build
npm start
```

访问 `http://127.0.0.1:8357/`。双击根目录的 `插个U盘_离线版.html` 可离线游玩，无需配置数据库。

## Supabase 部署

已部署项目名为 `usb-flip-game`。自行部署时，先创建自己的项目，在 CLI 完成登录并关联项目，再执行：

```sh
npx supabase@2.121.0 link --project-ref YOUR_PROJECT_REF
npx supabase@2.121.0 db push
npm run build:edge
npx supabase@2.121.0 functions deploy usb-game-api --project-ref YOUR_PROJECT_REF
```

函数保持 `verify_jwt = true`。更改游戏引擎或成绩规则后，需要重新构建并部署 Edge Function，使前后端的重放逻辑保持一致。

## Vercel 部署

导入此 GitHub 仓库，Framework 选择 Other，构建命令 `npm run build`，输出目录 `dist`。配置以下服务端环境变量：

| 名称 | 内容 |
| --- | --- |
| `SUPABASE_URL` | Supabase 项目 URL |
| `SUPABASE_ANON_KEY` | 启用的 legacy anon JWT，供函数网关校验 |
| `SUPABASE_FUNCTION_NAME` | 可选，默认 `usb-game-api` |

配置保存在 Vercel 环境变量中，`*.local` 文件不入库。GitHub 推送到 main 后，已连接的 Vercel 项目会构建前端及 API。Edge Function 按上面的命令部署。

## 验证

`npm test` 运行引擎、服务端操作重放和代理边界检查；`npm run build` 生成可部署网页和离线文件；`npm run build:edge` 生成 Supabase 函数。GitHub Actions 自动执行这三项，并检查函数构建产物是否与源码一致。

浏览器和 API 集成脚本会创建挑战记录，只应连接独立测试项目；不要对正式榜单运行批量测试脚本。正式验证只使用可识别的临时测试局并在验证后清理，不删除真实成绩。

模型和音效在本机生成；Three.js 遵循 MIT 协议，见 `vendor/THREE-LICENSE.txt`。Supabase 的创建信息和项目 ID 不等于访问密钥。
