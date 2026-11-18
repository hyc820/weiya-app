# 尾牙积分竞技暨竞标平台

> 基于 React + Supabase 构建的尾牙活动互动平台，支持 100+ 人同时在线使用。

## 功能特性

- 🔐 **工号扫码登录**：预导入员工名单，扫工号 QR 码直接登录
- 💰 **积分系统**：签到得 100 分，游戏加分，竞标扣分
- 🎮 **闯关加分**：关主扫员工工号加分，防重复
- 🏆 **实时排行榜**：按积分排名，自动刷新
- 🎁 **密封竞标**：出价冻结积分，防超额出价
- ⚡ **高并发设计**：所有积分操作用数据库事务，100 人同时操作不崩溃
- 👑 **多角色**：员工/关主/管理员权限分离

## 技术栈

- 前端：React 18 + React Router + Vite
- 后端：Supabase（PostgreSQL + RPC 函数）
- 部署：Vercel（免费）

## 快速开始

### 1. 注册账号（免费）

1. GitHub 账号：https://github.com/signup
2. Supabase 账号：https://supabase.com（用 GitHub 登录）
3. Vercel 账号：https://vercel.com（用 GitHub 登录）

### 2. 创建 Supabase 项目

1. 登录 Supabase → New Project
2. 项目名：`尾牙平台`
3. 数据库密码：自己设一个（记下来）
4. 区域：选离你近的（如 Southeast Asia）
5. 创建后等待 2 分钟

### 3. 执行数据库脚本

1. 进入项目 → 左侧菜单 **SQL Editor**
2. 点击 **New query**
3. 打开本项目的 `supabase/schema.sql` 文件，**全部复制粘贴**到 SQL Editor
4. 点击 **Run** 执行
5. 看到「Success. No rows returned」就是成功了

### 4. 获取 API 密钥

1. 左侧菜单 **Project Settings** → **API**
2. 复制 **Project URL**（形如 `https://xxxx.supabase.co`）
3. 复制 **anon public** key

### 5. 本地运行

```bash
# 1. 安装 Node.js（如果没有）
# 下载地址：https://nodejs.org/（选 LTS 版本）

# 2. 进入项目目录
cd 尾牙Web应用

# 3. 复制环境变量文件并填入你的密钥
cp .env.example .env
# 编辑 .env 文件，填入 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY

# 4. 安装依赖
npm install

# 5. 启动开发服务器
npm run dev
```

浏览器打开 http://localhost:5173 即可看到界面。

### 6. 测试账号

数据库脚本里已插入测试数据，用工号登录：

| 工号 | 姓名 | 角色 |
|------|------|------|
| EMP001 | 黄有超 | 管理员 |
| EMP002 | 张三 | 关主 |
| EMP003 | 李四 | 关主 |
| EMP004 | 王五 | 员工 |
| EMP005 | 赵六 | 员工 |

## 部署到 Vercel（免费）

### 方法一：导入 GitHub 仓库（推荐）

1. 把本项目上传到 GitHub（新建仓库，把文件传上去）
2. 登录 Vercel → **Add New** → **Project**
3. 选择你的 GitHub 仓库 → **Import**
4. 在 **Environment Variables** 里添加：
   - `VITE_SUPABASE_URL` = 你的 Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = 你的 anon key
5. 点击 **Deploy**
6. 等待 1-2 分钟，部署完成后会给你一个网址（形如 `https://xxx.vercel.app`）

### 方法二：用 Vercel CLI

```bash
npm install -g vercel
cd 尾牙Web应用
vercel
# 按提示操作，自动部署
```

## 现场使用

### 生成活动 QR 码

1. 拿到 Vercel 部署的网址
2. 打开 https://www.qr-code-generator.com/
3. 粘贴网址 → 生成 QR 码 → 打印出来贴在活动现场

### 生成员工个人工号 QR 码

每个员工的 QR 码内容就是他们的工号（如 `EMP001`）。
- 批量生成：用 Excel CONCATENATE 函数生成工号列表，再用 QR 批量生成工具
- 打印在员工名牌/工牌上

### 现场流程

```
员工手机扫活动大 QR → 打开网页 → 扫自己的工号 QR → 登录成功
    ↓
玩游戏 → 找关主扫工号 QR 加分
    ↓
用积分竞标奖品
    ↓
管理员后台结标 → 公布得标结果
```

## 导入真实员工名单

1. 准备 Excel，列名：`employee_no, name, department, role`
2. role 填：`admin` / `gamemaster` / `employee`
3. 另存为 CSV 文件
4. Supabase 控制台 → **Table Editor** → `employees` 表
5. 点击 **Insert** → **Import data from CSV**
6. 上传 CSV

## 高并发保障说明

| 机制 | 说明 |
|------|------|
| 数据库事务 | 所有积分操作（加分/出价/结标）都在 PostgreSQL 函数内用事务执行，原子性保证 |
| 行锁 `FOR UPDATE` | 出价时锁定员工行，防止并发出价导致积分超扣 |
| UNIQUE 约束 | `(employee_id, game_name)` 防止重复加分；`(item_id, employee_id)` 防止重复出价 |
| 积分冻结 | 出价时冻结对应积分，可用积分 = 总积分 - 冻结积分，防止同一积分多次出价 |
| 自动结标 | 结标函数内一次完成：选最高价、扣分、释放冻结、写记录 |

## 项目结构

```
尾牙Web应用/
├── src/
│   ├── lib/supabase.js        # Supabase 客户端 + 数据库函数封装
│   ├── context/AuthContext.jsx # 登录认证上下文
│   ├── pages/                 # 12 个页面
│   │   ├── Login.jsx          # 登录
│   │   ├── Home.jsx           # 首页
│   │   ├── MyPoints.jsx       # 我的积分
│   │   ├── Ranking.jsx        # 排行榜
│   │   ├── Game.jsx           # 闯关游戏
│   │   ├── GameMaster.jsx     # 关主加分
│   │   ├── Auction.jsx        # 竞标中心
│   │   ├── Bid.jsx            # 出价页
│   │   ├── MyBids.jsx         # 我的出价
│   │   ├── Winners.jsx        # 得标结果
│   │   ├── Announcement.jsx   # 活动公告
│   │   └── Admin.jsx          # 管理员后台
│   ├── App.jsx                # 路由配置
│   ├── main.jsx               # 入口
│   └── index.css              # 样式
├── supabase/schema.sql        # 数据库建表脚本（含事务函数）
├── package.json
├── vite.config.js
└── .env.example
```

## 常见问题

**Q: 扫码登录怎么实现？**
A: 当前版本是手动输入工号。如需扫码，可在 `Login.jsx` 中接入 `html5-qrcode` 库，扫到工号后调用 `login(工号)` 即可。

**Q: 100 人同时用会卡吗？**
A: 不会。所有积分操作用数据库事务保证原子性，Supabase 是托管的 PostgreSQL，支持上千并发。

**Q: 竞标结标是自动的吗？**
A: 当前版本需要管理员在后台点「立即结标」。如需自动，可加一个定时任务（Vercel Cron 或 Supabase 定时函数）调用 `settle_auction`。

**Q: 怎么加商品？**
A: 管理员登录 → 后台 → 商品管理 → 新增商品。或直接在 Supabase Table Editor 的 `auction_items` 表里加。
