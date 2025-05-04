# 花火邮箱助手 API 文档

## 目录

1. [简介](#简介)
2. [认证](#认证)
3. [用户管理](#用户管理)
4. [邮箱管理](#邮箱管理)
5. [系统配置](#系统配置)
6. [WebSocket API](#websocket-api)

## 简介

花火邮箱助手后端 API 提供了一系列接口，用于管理用户、邮箱账户以及邮件检查功能。所有 API 接口均使用 JSON 格式进行数据交换。

## 认证

### 登录

- **URL**: `/api/auth/login`
- **方法**: `POST`
- **描述**: 用户登录并获取 JWT 令牌
- **参数**:
  - `username`: 用户名
  - `password`: 密码
- **返回**:
  - 成功: `{ token: "JWT令牌", user: { id: 1, username: "用户名", is_admin: false } }`
  - 失败: `{ error: "错误信息" }`

### 登出

- **URL**: `/api/auth/logout`
- **方法**: `POST`
- **描述**: 用户登出，删除 Cookie 中的令牌
- **返回**: `{ message: "已成功登出" }`

### 注册

- **URL**: `/api/auth/register`
- **方法**: `POST`
- **描述**: 新用户注册
- **参数**:
  - `username`: 用户名（3-20个字符）
  - `password`: 密码（至少6个字符）
- **返回**:
  - 成功: `{ message: "注册成功", username: "用户名", is_admin: false }`
  - 失败: `{ error: "错误信息" }`

### 获取当前用户

- **URL**: `/api/auth/user`
- **方法**: `GET`
- **描述**: 获取当前登录用户信息
- **权限**: 需要认证
- **返回**: `{ id: 1, username: "用户名", is_admin: false }`

### 修改密码

- **URL**: `/api/auth/change-password`
- **方法**: `POST`
- **描述**: 修改当前用户密码
- **权限**: 需要认证
- **参数**:
  - `old_password`: 旧密码
  - `new_password`: 新密码（至少6个字符）
- **返回**:
  - 成功: `{ message: "密码已成功更新" }`
  - 失败: `{ error: "错误信息" }`

## 用户管理

### 获取所有用户

- **URL**: `/api/users`
- **方法**: `GET`
- **描述**: 获取所有用户信息
- **权限**: 需要管理员权限
- **返回**: 用户对象数组

### 创建用户

- **URL**: `/api/users`
- **方法**: `POST`
- **描述**: 创建新用户（管理员功能）
- **权限**: 需要管理员权限
- **参数**:
  - `username`: 用户名（3-20个字符）
  - `password`: 密码（至少6个字符）
  - `is_admin`: 是否设为管理员（可选）
- **返回**:
  - 成功: `{ message: "用户创建成功", username: "用户名", is_admin: false }`
  - 失败: `{ error: "错误信息" }`

### 删除用户

- **URL**: `/api/users/<user_id>`
- **方法**: `DELETE`
- **描述**: 删除指定用户
- **权限**: 需要管理员权限
- **参数**: `user_id` (路径参数)
- **返回**:
  - 成功: `{ message: "用户ID x 已删除" }`
  - 失败: `{ error: "错误信息" }`

### 重置用户密码

- **URL**: `/api/users/<user_id>/reset-password`
- **方法**: `POST`
- **描述**: 重置指定用户的密码
- **权限**: 需要管理员权限
- **参数**:
  - `user_id` (路径参数)
  - `new_password`: 新密码（至少6个字符）
- **返回**:
  - 成功: `{ message: "用户ID x 的密码已重置" }`
  - 失败: `{ error: "错误信息" }`

## 邮箱管理

### 获取所有邮箱

- **URL**: `/api/emails`
- **方法**: `GET`
- **描述**: 获取当前用户的所有邮箱（管理员可查看所有用户邮箱）
- **权限**: 需要认证
- **返回**: 邮箱对象数组

### 添加邮箱

- **URL**: `/api/emails`
- **方法**: `POST`
- **描述**: 添加新邮箱
- **权限**: 需要认证
- **参数**:
  - `email`: 邮箱地址
  - `password`: 邮箱密码
  - `client_id`: 客户端 ID
  - `refresh_token`: 刷新令牌
  - `mail_type`: 邮箱类型，默认为 "outlook"
- **返回**:
  - 成功: `{ message: "邮箱 xxx@example.com 添加成功" }`
  - 失败: `{ error: "错误信息" }`

### 删除邮箱

- **URL**: `/api/emails/<email_id>`
- **方法**: `DELETE`
- **描述**: 删除指定邮箱
- **权限**: 需要认证
- **参数**: `email_id` (路径参数)
- **返回**:
  - 成功: `{ message: "邮箱 ID x 已删除" }`
  - 失败: `{ error: "错误信息" }`

### 批量删除邮箱

- **URL**: `/api/emails/batch_delete`
- **方法**: `POST`
- **描述**: 批量删除多个邮箱
- **权限**: 需要认证
- **参数**:
  - `email_ids`: 邮箱 ID 数组
- **返回**:
  - 成功: `{ message: "已删除 x 个邮箱" }`
  - 失败: `{ error: "错误信息" }`

### 检查邮箱

- **URL**: `/api/emails/<email_id>/check`
- **方法**: `POST`
- **描述**: 检查单个邮箱的邮件
- **权限**: 需要认证
- **参数**: `email_id` (路径参数)
- **返回**:
  - 成功: `{ message: "开始检查邮箱 ID x", email: "xxx@example.com" }`
  - 正在处理: `{ message: "邮箱 ID x 正在处理中", status: "processing" }`
  - 失败: `{ error: "错误信息" }`

### 批量检查邮箱

- **URL**: `/api/emails/batch_check`
- **方法**: `POST`
- **描述**: 批量检查多个邮箱的邮件
- **权限**: 需要认证
- **参数**:
  - `email_ids`: 邮箱 ID 数组（可选，不提供则检查用户所有邮箱）
- **返回**:
  - 成功: `{ message: "开始检查 x 个邮箱", skipped: 0, total: x }`
  - 失败: `{ error: "错误信息" }`

### 获取邮件记录

- **URL**: `/api/emails/<email_id>/mail_records`
- **方法**: `GET`
- **描述**: 获取指定邮箱的邮件记录
- **权限**: 需要认证
- **参数**: `email_id` (路径参数)
- **返回**: 邮件记录对象数组

### 导入邮箱

- **URL**: `/api/emails/import`
- **方法**: `POST`
- **描述**: 批量导入邮箱
- **权限**: 需要认证
- **参数**:
  - `data`: 导入数据（每行格式：邮箱----密码----客户端ID----刷新令牌）
  - `mail_type`: 邮箱类型，默认为 "outlook"
- **返回**:
  - 成功: `{ total: x, success: y, failed: z, failed_details: [...] }`
  - 失败: `{ error: "错误信息" }`

## 系统配置

### 获取系统配置

- **URL**: `/api/config`
- **方法**: `GET`
- **描述**: 获取系统配置信息
- **返回**: `{ allow_register: true, server_time: "2023-12-31 23:59:59" }`

### 切换注册功能

- **URL**: `/api/admin/config/registration`
- **方法**: `POST`
- **描述**: 开启或关闭用户注册功能
- **权限**: 需要管理员权限
- **参数**:
  - `allow`: 是否允许注册
- **返回**:
  - 成功: `{ message: "已成功开启/关闭注册功能", allow_register: true/false }`
  - 失败: `{ error: "错误信息" }`

### 健康检查

- **URL**: `/api/health`
- **方法**: `GET`
- **描述**: 检查服务是否正常运行
- **返回**: `{ status: "ok", message: "花火邮箱助手服务正在运行" }`

## WebSocket API

WebSocket API 提供了实时通信功能，用于更新前端界面和推送邮箱检查进度。

### 连接地址

- **URL**: `ws://<host>:<ws_port>/`

### 消息格式

所有消息都使用 JSON 格式，包含 `action` 字段指定操作类型。

### 支持的操作

1. **获取所有邮箱**
   - 请求: `{ action: "get_all_emails" }`
   - 响应: `{ type: "emails_list", data: [...] }`

2. **添加邮箱**
   - 请求: `{ action: "add_email", email: "xxx@example.com", password: "xxx", client_id: "xxx", refresh_token: "xxx", mail_type: "outlook" }`
   - 响应: `{ type: "success", message: "Email xxx@example.com added successfully" }`

3. **删除邮箱**
   - 请求: `{ action: "delete_emails", email_ids: [1, 2, 3] }`
   - 响应: `{ type: "success", message: "Deleted x emails" }`

4. **检查邮箱**
   - 请求: `{ action: "check_emails", email_ids: [1, 2, 3] }`
   - 响应: `{ type: "info", message: "Started checking x emails" }`
   - 进度更新: `{ type: "check_progress", email_id: 1, progress: 50, message: "处理进度消息" }`

5. **获取邮件记录**
   - 请求: `{ action: "get_mail_records", email_id: 1 }`
   - 响应: `{ type: "mail_records", email_id: 1, records: [...] }`

6. **导入邮箱**
   - 请求: `{ action: "import_emails", data: { data: "邮箱----密码----客户端ID----刷新令牌\n...", mailType: "outlook" } }`
   - 响应: `{ type: "import_result", total: x, success: y, failed: z, failed_details: [...] }`

注意：所有操作响应中如有错误，将返回 `{ type: "error", message: "错误信息" }`。 