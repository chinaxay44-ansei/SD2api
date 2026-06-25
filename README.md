# Seedance 2 视频生成工具

本项目是本地/私有部署用的生成工具站，前端使用 React + Vite，后端使用 Express + TypeScript。页面支持 Seedance 2 视频生成、GPT Image 2 图片生成、素材上传到腾讯云 COS、任务状态轮询和 Supabase 任务持久化。

## 功能

- OpenAI Next API Key 由页面用户自行填写，后端只按 SHA-256 哈希隔离任务，不保存明文 Key。
- 视频生成支持 `doubao-seedance-2-0-260128` 和 `doubao-seedance-2-0-fast-260128`。
- 支持图片、视频、音频素材上传到 COS，并按素材顺序提交给生成接口。
- 成功的视频输出会自动归档到 COS，最近任务可按当前 API Key 查看。
- Supabase 可选启用；未配置时使用本地 `data/tasks.json`。

## 本地运行

```bash
npm install
cp .env.example .env
npm run dev
```

打开 `http://127.0.0.1:5173/`。

## 环境变量

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_TASKS_TABLE=generation_tasks
COS_BUCKET=
COS_REGION=
COS_SECRET_ID=
COS_SECRET_KEY=
COS_SIGNED_URL_EXPIRES_SECONDS=604800
SERVER_PORT=8787
OPENAI_NEXT_SEEDANCE_BASE_URL=https://api.openai-next.com/seedance
```

OpenAI Next 平台 Key 不放在 `.env`，由每个用户在前端页面输入。

## 常用命令

```bash
npm test
npm run typecheck
npm run build
npm start
```

## Supabase

迁移文件位于 `supabase/migrations/`。部署到云端时，先在 Supabase 项目中执行迁移，再配置 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`。
