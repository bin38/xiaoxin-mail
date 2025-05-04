# 小新邮箱 - Cloudflare全栈部署指南

本文档提供了完整的小新邮箱在Cloudflare平台上的部署指南，让您可以创建一个高性能、分布式的应用体验，而无需依赖传统后端服务器。

## 目录

- [概述](#概述)
- [一键部署](#一键部署)
- [部署前准备](#部署前准备)
- [通过Cloudflare控制台部署](#通过cloudflare控制台部署)
- [环境变量配置](#环境变量配置)
- [多存储解决方案](#多存储解决方案)
- [故障排除](#故障排除)
- [高级配置](#高级配置)
- [参考资源](#参考资源)

## 概述

小新邮箱采用全Cloudflare架构，完全基于Cloudflare服务构建，包括：

1. **前端 (Cloudflare Pages)**:
   - 托管静态资源
   - 提供全球CDN
   - 处理CI/CD自动部署

2. **后端 (Cloudflare Workers)**:
   - 处理API请求
   - 实现业务逻辑
   - 管理数据存储

3. **数据存储**:
   - **D1数据库**: 存储邮件元数据、用户信息等结构化数据
   - **R2对象存储**: 存储邮件内容和附件
   - **KV命名空间**: 存储配置、会话信息等

通过这种架构，所有服务都运行在Cloudflare的边缘网络中，提供低延迟、高可用性的用户体验。

## 一键部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/your-username/xiaoxin-mail)

点击上方按钮将自动跳转到Cloudflare部署界面，系统会引导您完成部署过程，包括：

1. 授权Cloudflare访问您的GitHub账户
2. Fork项目存储库
3. 自动创建必要的Cloudflare资源
4. 配置环境变量
5. 部署应用程序

## 部署前准备

在开始部署前，请确保：

1. 您已拥有[Cloudflare账户](https://dash.cloudflare.com/sign-up)
2. 您的账户已启用[Cloudflare Pages](https://pages.cloudflare.com/)
3. 您已登录[GitHub账户](https://github.com/login)（用于Fork项目）

## 通过Cloudflare控制台部署

如果您偏好手动部署，可按照以下步骤在Cloudflare控制台操作：

### 1. Fork项目仓库

1. 访问[小新邮箱GitHub仓库](https://github.com/your-username/xiaoxin-mail)
2. 点击右上角的"Fork"按钮
3. 等待Fork完成

### 2. 部署Worker后端

1. 登录[Cloudflare控制台](https://dash.cloudflare.com/)
2. 从左侧菜单选择"Workers & Pages"
3. 点击"创建应用程序"
4. 选择"连接到Git"
5. 授权GitHub访问并选择您刚Fork的仓库
6. 在设置中：
   - 应用名称：填写自定义名称（如`xiaoxin-mail-api`）
   - 生产分支：选择`main`
   - 构建命令：`cd cloudflare-deploy/worker && npm install`
   - 构建输出目录：`cloudflare-deploy/worker/dist`
7. 点击"环境变量"并添加必要的环境变量（见下方[环境变量配置](#环境变量配置)）
8. 点击"保存并部署"

### 3. 创建存储资源

在Cloudflare控制台中：

1. 创建R2存储桶
   - 导航至"R2"菜单
   - 点击"创建存储桶"
   - 输入名称（如`xiaoxin-mail-content`）

2. 创建KV命名空间
   - 导航至"Workers" > "KV"
   - 点击"创建命名空间"
   - 输入名称（如`XIAOXIN_MAIL_KV`）

3. 创建D1数据库
   - 导航至"D1"
   - 点击"创建数据库"
   - 输入名称（如`xiaoxin-mail-db`）
   - 数据库创建后，导入初始架构：
     - 点击"查询"，复制粘贴`cloudflare-deploy/worker/schema.sql`内容
     - 点击"运行"

### 4. 部署前端

1. 回到"Workers & Pages"
2. 点击"创建应用程序"
3. 再次选择您Fork的仓库
4. 在设置中：
   - 应用名称：填写自定义名称（如`xiaoxin-mail-app`）
   - 构建命令：`cd cloudflare-deploy/frontend && npm install && npm run build`
   - 构建输出目录：`cloudflare-deploy/frontend/dist`
5. 添加前端环境变量
6. 点击"保存并部署"

## 环境变量配置

以下是所有可配置的环境变量完整列表：

| 变量名 | 必填 | 描述 | 默认值 | 示例 |
|-------|-----|------|------|------|
| **Worker通用配置** |
| `ENVIRONMENT` | 否 | 运行环境 | `production` | `development`, `staging` |
| `APP_NAME` | 否 | 应用名称 | `小新邮箱` | `企业小新邮箱` |
| `JWT_SECRET_KEY` | 是 | JWT令牌加密密钥 | - | `random_secure_string_here` |
| `ADMIN_EMAIL` | 否 | 管理员邮箱 | - | `admin@example.com` |
| `MAX_ATTACHMENT_SIZE` | 否 | 最大附件大小(字节) | `10485760` | `20971520` (20MB) |
| `SESSION_DURATION` | 否 | 会话持续时间(秒) | `604800` | `1209600` (14天) |
| **存储配置** |
| `STORAGE_PROVIDER` | 否 | 默认存储提供商 | `r2` | `r2`, `s3`, `gcs`, `b2`, `custom` |
| **AWS S3配置** |
| `S3_ACCESS_KEY` | 否* | S3访问密钥 | - | `AKIAIOSFODNN7EXAMPLE` |
| `S3_SECRET_KEY` | 否* | S3秘密密钥 | - | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `S3_REGION` | 否* | S3区域 | `us-east-1` | `eu-west-1` |
| `S3_BUCKET` | 否* | S3存储桶名称 | - | `my-xiaoxin-mail-storage` |
| `S3_ENDPOINT` | 否 | 自定义S3端点(兼容S3时) | - | `https://s3.example.com` |
| **Google Cloud Storage配置** |
| `GCS_PROJECT_ID` | 否* | GCS项目ID | - | `my-gcs-project-123` |
| `GCS_CLIENT_EMAIL` | 否* | GCS服务账号邮箱 | - | `service-account@project.iam.gserviceaccount.com` |
| `GCS_PRIVATE_KEY` | 否* | GCS服务账号密钥 | - | `-----BEGIN PRIVATE KEY-----\nXXX...\n-----END PRIVATE KEY-----\n` |
| `GCS_BUCKET` | 否* | GCS存储桶名称 | - | `xiaoxin-mail-bucket` |
| **Backblaze B2配置** |
| `B2_APPLICATION_KEY_ID` | 否* | B2应用密钥ID | - | `001234567890abcdef` |
| `B2_APPLICATION_KEY` | 否* | B2应用密钥 | - | `K001234567890abcdef` |
| `B2_BUCKET` | 否* | B2存储桶名称 | - | `xiaoxin-mail-storage` |
| **Azure Blob Storage配置** |
| `AZURE_CONNECTION_STRING` | 否* | Azure连接字符串 | - | `DefaultEndpointsProtocol=https;...` |
| `AZURE_CONTAINER` | 否* | Azure容器名称 | - | `xiaoxinmail` |
| **自定义配置** |
| `CUSTOM_STORAGE_ENDPOINT` | 否* | 自定义存储端点 | - | `https://storage.example.com` |
| `CUSTOM_STORAGE_ACCESS_KEY` | 否* | 自定义存储访问密钥 | - | `your_access_key` |
| `CUSTOM_STORAGE_SECRET_KEY` | 否* | 自定义存储密钥 | - | `your_secret_key` |
| **前端配置** |
| `API_URL` | 否 | API基础URL | `/api` | `https://api.xiaoxinmail.com` |
| `WEBSITE_TITLE` | 否 | 网站标题 | `小新邮箱` | `企业小新邮箱` |
| `THEME_COLOR` | 否 | 主题色 | `#3b82f6` | `#10b981` |

*：仅当使用对应存储提供商时必填

## 文件结构

```
cloudflare-deploy/
├── frontend/              # 前端代码
│   ├── public/            # 静态资源
│   ├── functions/         # Pages Functions
│   ├── index.html         # 主HTML文件
│   ├── vite.config.js     # Vite配置
│   └── package.json       # 前端依赖
├── worker/                # Worker代码
│   ├── src/               # Worker源代码
│   │   ├── index.js       # 主入口文件
│   │   ├── auth.js        # 认证模块
│   │   ├── email.js       # 邮件处理模块
│   │   ├── storage.js     # 存储管理模块
│   │   └── utils.js       # 工具函数库
│   ├── schema.sql         # D1数据库架构
│   ├── init-db.js         # 数据库初始化脚本
│   ├── wrangler.toml      # Worker配置
│   └── package.json       # Worker依赖
├── MIGRATION.md           # 迁移指南
└── README.md              # 部署文档
```

## 多存储解决方案

为解决Cloudflare R2 10GB免费额度的限制，小新邮箱支持多种存储提供商:

| 存储方案 | 免费额度 | 配置复杂度 | 访问速度 | 成本参考 |
|---------|--------|----------|--------|---------|
| Cloudflare R2 | 10GB/月 | 简单 | 极快 | 超过10GB: $0.015/GB |
| AWS S3 | 新用户12个月5GB | 中等 | 快 | $0.023/GB |
| Google Cloud Storage | 5GB | 中等 | 快 | $0.020/GB |
| Backblaze B2 | 10GB | 中等 | 快 | $0.005/GB |
| Azure Blob Storage | 5GB | 中等 | 快 | $0.018/GB |
| 自定义S3兼容存储 | 取决于提供商 | 复杂 | 取决于提供商 | 取决于提供商 |

### 配置多存储策略

通过管理界面设置智能存储策略:

1. 登录管理面板
2. 导航至"设置" > "存储配置"
3. 配置各存储提供商凭证
4. 设置存储策略，例如:
   - 小文件(<1MB)存储在KV
   - 中等文件(1MB-10MB)存储在R2
   - 大文件(>10MB)存储在B2

## 数据存储架构

### D1数据库表结构

小新邮箱使用以下D1数据库表：

#### users表

存储用户信息：

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email TEXT UNIQUE,
  display_name TEXT,
  avatar TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT
);
```

#### mail_records表

存储邮件元数据：

```sql
CREATE TABLE mail_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  subject TEXT,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  received_time TEXT NOT NULL,
  content_ref TEXT NOT NULL,
  folder TEXT DEFAULT 'inbox',
  is_read INTEGER DEFAULT 0,
  is_starred INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### R2存储路径

R2对象存储使用以下路径结构：

| 内容类型 | 存储路径格式 | 示例 |
|---------|-------------|------|
| 邮件内容 | `emails/{userId}/{emailId}/content.html` | `emails/1/42/content.html` |
| 附件 | `attachments/{emailId}/{attachmentId}/{filename}` | `attachments/42/5/report.pdf` |
| 用户头像 | `avatars/{userId}/{filename}` | `avatars/1/profile.jpg` |

### KV命名空间键

KV命名空间存储以下类型的数据：

| 数据类型 | 键格式 | 示例 |
|---------|------|------|
| 用户会话 | `sessions:{token}` | `sessions:abc123def456` |
| 系统配置 | `system:{configKey}` | `system:admin_users` |
| 用户设置 | `user:{userId}:{settingKey}` | `user:1:theme` |

## WebSocket替代方案

由于Cloudflare Workers不直接支持WebSocket，小新邮箱实现了一种长轮询机制作为替代方案。

### 实现原理

前端通过定期HTTP请求查询新事件：

```javascript
// 前端实现示例
class EventPoller {
  constructor(apiUrl, interval = 10000) {
    this.apiUrl = apiUrl;
    this.interval = interval;
    this.lastEventId = '0';
    this.callbacks = [];
    this.isPolling = false;
  }
  
  // 注册事件处理器
  on(eventCallback) {
    this.callbacks.push(eventCallback);
    return this;
  }
  
  // 开始轮询
  start() {
    if (this.isPolling) return;
    
    this.isPolling = true;
    this.poll();
    return this;
  }
  
  // 停止轮询
  stop() {
    this.isPolling = false;
    return this;
  }
  
  // 执行轮询
  async poll() {
    if (!this.isPolling) return;
    
    try {
      const response = await fetch(
        `${this.apiUrl}/realtime/events?lastEventId=${this.lastEventId}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );
      
      const data = await response.json();
      
      if (data.success && data.events.length > 0) {
        // 更新最后事件ID
        this.lastEventId = data.lastEventId;
        
        // 触发回调
        for (const callback of this.callbacks) {
          callback(data.events);
        }
      }
    } catch (error) {
      console.error('轮询错误:', error);
    }
    
    // 设置下一次轮询
    setTimeout(() => this.poll(), this.interval);
  }
}

// 使用示例
const poller = new EventPoller('https://xiaoxin-mail-api.your-workers.dev/api')
  .on(events => {
    for (const event of events) {
      console.log('收到新邮件:', event);
      // 更新UI
    }
  })
  .start();
```

## 故障排除

### API请求问题

| 症状 | 可能原因 | 解决方法 |
|------|----------|----------|
| 401 Unauthorized | 身份验证失败 | 检查令牌是否有效，可能需要重新登录 |
| 403 Forbidden | 权限不足 | 确认用户权限设置 |
| 404 Not Found | API路径错误 | 检查API URL是否正确 |
| 413 Payload Too Large | 上传内容过大 | 减小附件大小，确认是否超过限制 |

### 长轮询连接问题

| 症状 | 可能原因 | 解决方法 |
|------|----------|----------|
| 轮询频繁失败 | 网络不稳定 | 实现退避算法，逐渐增加重试间隔 |
| 未收到更新 | lastEventId错误 | 重置lastEventId尝试重新获取全部事件 |
| 重复事件 | 客户端未正确更新lastEventId | 确保每次收到事件后更新lastEventId |

### 数据存储问题

| 症状 | 可能原因 | 解决方法 |
|------|----------|----------|
| 附件上传失败 | 存储权限问题 | 检查存储桶配置和权限 |
| KV操作失败 | KV限额超出 | 检查KV用量，考虑优化存储策略 |
| D1查询错误 | SQL语法错误 | 检查并修正SQL查询语句 |

## 高级配置

### 自定义域名

若要为API和Pages配置自定义域名：

1. 在Cloudflare控制台中添加您的域名
2. 为Worker配置自定义路由：
   ```
   *.api.yourdomain.com/*  ->  xiaoxin-mail-api
   ```
3. 为Pages配置自定义域名：
   ```
   mail.yourdomain.com  ->  your-pages-project
   ```

### CI/CD自动部署

使用GitHub Actions自动部署：

1. 创建GitHub仓库并推送代码
2. 添加以下Secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
3. 创建部署工作流(`.github/workflows/deploy.yml`):

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-worker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
        working-directory: worker
      - run: npx wrangler deploy
        working-directory: worker
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          
  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
        working-directory: frontend
      - run: npm run build
        working-directory: frontend
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: xiaoxin-mail-app
          directory: frontend/dist
```

## 参考资源

- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
- [Cloudflare D1 数据库文档](https://developers.cloudflare.com/d1/)
- [Cloudflare R2 存储文档](https://developers.cloudflare.com/r2/)
- [Cloudflare KV 存储文档](https://developers.cloudflare.com/kv/)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/) 