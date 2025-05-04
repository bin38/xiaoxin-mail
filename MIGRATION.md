# 小新邮箱迁移指南

本文档提供了将现有Python后端迁移到全Cloudflare架构的详细步骤，包含数据导出、资源创建、数据导入和前端配置等完整流程。

## 目录

- [迁移概述](#迁移概述)
- [准备工作](#准备工作)
- [数据导出](#数据导出)
- [创建Cloudflare资源](#创建cloudflare资源)
- [导入数据](#导入数据)
- [更新前端配置](#更新前端配置)
- [验证迁移结果](#验证迁移结果)
- [常见问题](#常见问题)
- [非Cloudflare部署指南](#非cloudflare部署指南)

## 迁移概述

迁移流程包括以下主要步骤：

1. **导出数据**
   - 从SQLite数据库导出用户和邮件数据
   - 从WebDAV导出存储的文件

2. **创建Cloudflare资源**
   - 创建R2存储桶
   - 创建KV命名空间
   - 创建D1数据库

3. **导入数据**
   - 将用户数据导入D1数据库
   - 将邮件元数据导入D1数据库
   - 将邮件内容和附件上传到R2
   - 导入用户配置到KV

4. **更新前端配置**
   - 修改API端点
   - 更新存储路径

5. **验证迁移结果**
   - 检查用户登录
   - 验证邮件访问
   - 测试新功能

## 准备工作

在开始迁移前，请确保安装必要的工具：

```bash
# 安装Wrangler CLI
npm install -g wrangler

# 安装数据处理依赖
npm install sqlite3 mime-types dotenv

# 安装其他必要工具
npm install node-fetch

# 登录Cloudflare账户
npx wrangler login

# 备份现有数据
cp xiaoxin-mail.db xiaoxin-mail.db.bak
```

## 数据导出

### 从SQLite导出数据

创建一个导出脚本 `export.js`：

```javascript
// export.js
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// 打开数据库连接
const db = new sqlite3.Database('./xiaoxin-mail.db');

// 导出用户数据
function exportUsers() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM users`, (err, rows) => {
      if (err) return reject(err);
      
      fs.writeFileSync(
        './export/users.json', 
        JSON.stringify(rows, null, 2)
      );
      
      console.log(`导出了 ${rows.length} 个用户`);
      resolve(rows);
    });
  });
}

// 导出邮件数据
function exportEmails() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM emails`, (err, rows) => {
      if (err) return reject(err);
      
      fs.writeFileSync(
        './export/emails.json', 
        JSON.stringify(rows, null, 2)
      );
      
      console.log(`导出了 ${rows.length} 封邮件`);
      resolve(rows);
    });
  });
}

// 导出附件数据
function exportAttachments() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM attachments`, (err, rows) => {
      if (err) return reject(err);
      
      fs.writeFileSync(
        './export/attachments.json', 
        JSON.stringify(rows, null, 2)
      );
      
      console.log(`导出了 ${rows.length} 个附件`);
      resolve(rows);
    });
  });
}

// 导出标签数据
function exportLabels() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM email_labels`, (err, rows) => {
      if (err) return reject(err);
      
      fs.writeFileSync(
        './export/labels.json', 
        JSON.stringify(rows, null, 2)
      );
      
      console.log(`导出了 ${rows.length} 个标签关联`);
      resolve(rows);
    });
  });
}

// 创建导出目录
if (!fs.existsSync('./export')) {
  fs.mkdirSync('./export');
}

// 执行导出
async function runExport() {
  try {
    await exportUsers();
    await exportEmails();
    await exportAttachments();
    await exportLabels();
    
    console.log('数据导出完成');
  } catch (error) {
    console.error('导出错误:', error);
  } finally {
    db.close();
  }
}

runExport();
```

运行导出脚本：

```bash
node export.js
```

### 从WebDAV导出文件

使用脚本或工具将WebDAV中的文件下载到本地：

```bash
# 创建目录
mkdir -p ./export/files/emails
mkdir -p ./export/files/attachments

# 使用WebDAV客户端下载文件
# 例如，使用rclone
rclone copy webdav:/emails ./export/files/emails
rclone copy webdav:/attachments ./export/files/attachments
```

## 创建Cloudflare资源

### 创建R2存储桶

```bash
# 创建主存储桶
npx wrangler r2 bucket create xiaoxin-mail-content

# 创建开发环境存储桶(可选)
npx wrangler r2 bucket create xiaoxin-mail-content-dev
```

### 创建KV命名空间

```bash
# 创建KV命名空间
npx wrangler kv:namespace create "XIAOXIN_MAIL_KV"

# 创建开发环境KV命名空间(可选)
npx wrangler kv:namespace create "XIAOXIN_MAIL_KV_DEV" --preview
```

### 创建D1数据库

```bash
# 创建D1数据库
npx wrangler d1 create xiaoxin-mail-db

# 导入数据库架构
npx wrangler d1 execute xiaoxin-mail-db --file=./cloudflare-deploy/worker/schema.sql
```

## 导入数据

创建一个导入脚本 `import.js`：

```javascript
// import.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Miniflare } = require('miniflare');
const mime = require('mime-types');

// 初始化Miniflare用于本地测试
const mf = new Miniflare({
  r2Buckets: ['MAIL_BUCKET'],
  kvNamespaces: ['MAIL_KV'],
  d1Databases: ['MAIL_DB'],
  d1Persist: true,
  modules: true,
  script: `
    export default {
      async fetch(request, env) {
        return new Response("Import tool running");
      }
    }
  `,
});

async function importUsers() {
  const users = JSON.parse(fs.readFileSync('./export/users.json', 'utf8'));
  const env = await mf.getBindings();
  
  for (const user of users) {
    try {
      // 插入用户数据到D1
      await env.MAIL_DB.prepare(`
        INSERT INTO users (id, username, password_hash, email, display_name, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        user.id,
        user.username,
        user.password_hash,
        user.email,
        user.display_name || user.username,
        user.status || 'active',
        user.created_at || new Date().toISOString(),
        user.updated_at || new Date().toISOString()
      ).run();
      
      console.log(`导入用户: ${user.username}`);
    } catch (error) {
      console.error(`导入用户 ${user.username} 错误:`, error);
    }
  }
}

async function importEmails() {
  const emails = JSON.parse(fs.readFileSync('./export/emails.json', 'utf8'));
  const env = await mf.getBindings();
  
  for (const email of emails) {
    try {
      // 读取邮件内容
      const contentPath = path.join('./export/files/emails', `${email.id}.html`);
      let content = '';
      
      if (fs.existsSync(contentPath)) {
        content = fs.readFileSync(contentPath, 'utf8');
        
        // 上传内容到R2
        const contentRef = `emails/${email.user_id}/${email.id}/content.html`;
        await env.MAIL_BUCKET.put(contentRef, content, {
          httpMetadata: {
            contentType: 'text/html',
          },
        });
        
        // 插入邮件记录到D1
        await env.MAIL_DB.prepare(`
          INSERT INTO mail_records (
            id, email_id, user_id, subject, sender, recipient, 
            received_time, content_ref, folder, is_read, is_starred, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          email.id,
          email.external_id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
          email.user_id,
          email.subject,
          email.sender,
          email.recipient,
          email.received_date || new Date().toISOString(),
          contentRef,
          email.folder || 'inbox',
          email.is_read ? 1 : 0,
          email.is_starred ? 1 : 0,
          email.created_at || new Date().toISOString()
        ).run();
        
        console.log(`导入邮件: ${email.subject}`);
      } else {
        console.warn(`未找到邮件内容: ${email.id}`);
      }
    } catch (error) {
      console.error(`导入邮件 ${email.id} 错误:`, error);
    }
  }
}

async function importAttachments() {
  const attachments = JSON.parse(fs.readFileSync('./export/attachments.json', 'utf8'));
  const env = await mf.getBindings();
  
  for (const attachment of attachments) {
    try {
      // 读取附件内容
      const filePath = path.join('./export/files/attachments', attachment.id.toString());
      
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath);
        const mimeType = mime.lookup(attachment.filename) || 'application/octet-stream';
        
        // 上传附件到R2
        const contentRef = `attachments/${attachment.email_id}/${attachment.id}/${attachment.filename}`;
        await env.MAIL_BUCKET.put(contentRef, fileContent, {
          httpMetadata: {
            contentType: mimeType,
          },
        });
        
        // 插入附件记录到D1
        await env.MAIL_DB.prepare(`
          INSERT INTO attachments (
            id, email_id, filename, content_type, size, content_ref, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          attachment.id,
          attachment.email_id,
          attachment.filename,
          mimeType,
          fileContent.length,
          contentRef,
          attachment.created_at || new Date().toISOString()
        ).run();
        
        console.log(`导入附件: ${attachment.filename}`);
      } else {
        console.warn(`未找到附件文件: ${attachment.id}`);
      }
    } catch (error) {
      console.error(`导入附件 ${attachment.id} 错误:`, error);
    }
  }
}

async function importLabels() {
  const labels = JSON.parse(fs.readFileSync('./export/labels.json', 'utf8'));
  const env = await mf.getBindings();
  
  for (const label of labels) {
    try {
      // 插入标签数据到D1
      await env.MAIL_DB.prepare(`
        INSERT INTO mail_labels (
          id, user_id, email_id, label_name, created_at
        )
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        label.id,
        label.user_id,
        label.email_id,
        label.label_name,
        label.created_at || new Date().toISOString()
      ).run();
      
      console.log(`导入标签: ${label.label_name} -> 邮件 ${label.email_id}`);
    } catch (error) {
      console.error(`导入标签 ${label.id} 错误:`, error);
    }
  }
}

async function runImport() {
  try {
    console.log('开始导入数据...');
    
    await importUsers();
    await importEmails();
    await importAttachments();
    await importLabels();
    
    console.log('数据导入完成');
  } catch (error) {
    console.error('导入过程中出错:', error);
  }
}

runImport();
```

运行导入脚本：

```bash
node import.js
```

## 更新前端配置

编辑前端配置文件，指向新的Cloudflare Worker端点：

```js
// public/env-config.js
window.ENV = {
  API_URL: 'https://xiaoxin-mail-api.yourdomain.workers.dev',
  ENVIRONMENT: 'production'
};
```

## 验证迁移结果

完成迁移后，执行以下验证步骤：

1. **登录测试**
   - 使用已迁移的用户账号登录
   - 验证用户配置是否正确

2. **邮件访问测试**
   - 检查邮件列表是否完整
   - 打开邮件详情，验证内容和附件是否正确
   - 测试邮件搜索、标签和文件夹功能

3. **功能测试**
   - 尝试发送新邮件
   - 测试附件上传和下载
   - 验证标签管理功能

4. **性能检查**
   - 邮件加载速度
   - 附件访问速度

## 常见问题

### 数据导入失败

**问题**: 导入过程中部分数据失败

**解决方案**: 检查错误日志，确认数据格式是否正确，以及是否有ID冲突。可能需要调整导入脚本处理特殊字符或数据类型转换。

### 附件无法访问

**问题**: 邮件中的附件链接无法正常工作

**解决方案**: 确认R2访问权限是否正确配置，检查附件路径格式是否与新系统匹配，可能需要更新附件URL生成逻辑。

### 用户无法登录

**问题**: 迁移后用户无法使用原密码登录

**解决方案**: 确认密码哈希算法是否兼容，可能需要在迁移过程中更新密码哈希或要求用户重置密码。

## 非Cloudflare部署指南

如果您需要在传统服务器上部署小新邮箱，而不使用Cloudflare的服务，可以按照以下指南进行操作。

### 服务器要求

- **Node.js**: 版本16.0.0或更高
- **数据库**: MySQL或SQLite
- **存储空间**: 最低10GB（根据邮件量增长）
- **内存**: 最低1GB RAM
- **操作系统**: Linux, Windows或macOS

### 部署步骤

1. **克隆代码库**

```bash
git clone https://github.com/your-username/xiaoxin-mail.git
cd xiaoxin-mail
```

2. **安装依赖**

```bash
# 安装后端依赖
cd server
npm install

# 安装前端依赖
cd ../client
npm install
```

3. **配置环境变量**

创建一个`.env`文件在server目录：

```
# 服务器配置
PORT=3000
NODE_ENV=production
APP_NAME=小新邮箱

# 数据库配置
DB_TYPE=mysql        # 或 sqlite
DB_HOST=localhost    # MySQL专用
DB_PORT=3306         # MySQL专用
DB_USER=xiaoxin      # MySQL专用
DB_PASSWORD=password # MySQL专用
DB_NAME=xiaoxin_mail
DB_PATH=./data/xiaoxin-mail.db  # SQLite专用

# 存储配置
STORAGE_TYPE=local
STORAGE_PATH=./data/storage
# 或使用S3兼容存储
# STORAGE_TYPE=s3
# S3_ENDPOINT=https://your-s3-endpoint
# S3_BUCKET=your-bucket
# S3_ACCESS_KEY=your-access-key
# S3_SECRET_KEY=your-secret-key
# S3_REGION=your-region

# 安全配置
JWT_SECRET=your-secure-random-string
SESSION_DURATION=604800
```

4. **初始化数据库**

```bash
cd server
node init-db.js
```

5. **构建前端**

```bash
cd ../client
npm run build
```

6. **配置Web服务器**

使用Nginx配置示例：

```nginx
server {
    listen 80;
    server_name mail.yourdomain.com;

    # 重定向到HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name mail.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # 前端静态文件
    location / {
        root /path/to/xiaoxin-mail/client/dist;
        try_files $uri $uri/ /index.html;
    }

    # API请求
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # 附件访问
    location /storage {
        alias /path/to/xiaoxin-mail/server/data/storage;
        add_header Content-Disposition "attachment";
    }
}
```

7. **启动服务**

```bash
cd ../server
npm start

# 或使用PM2进行进程管理
pm2 start ecosystem.config.js
```

### 数据迁移

如果您需要从Cloudflare版本迁移到传统服务器版本：

1. 从D1数据库导出数据到SQLite或MySQL
2. 从R2下载所有存储的文件
3. 更新前端配置以指向您的新服务器

### 性能优化

对于传统服务器部署，建议：

1. 使用PM2进行Node.js进程管理
2. 配置Nginx缓存静态资源
3. 考虑使用Redis缓存热点数据
4. 对大型数据库进行索引优化
5. 实现定期备份策略

### 扩展性考虑

随着用户和邮件数量增长：

1. 考虑分离静态资源到CDN
2. 实现数据库读写分离
3. 建立附件存储集群
4. 设置负载均衡器分发请求

这种传统部署方式虽然失去了Cloudflare边缘网络的全球分布式优势，但提供了更大的自定义灵活性和对基础设施的完全控制。 