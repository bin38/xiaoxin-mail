#!/bin/bash
# 花火邮箱助手 - Cloudflare部署脚本
# 自动部署Worker、R2存储桶、KV命名空间和D1数据库

set -e  # 遇到错误立即退出
echo "花火邮箱助手 - Cloudflare全栈部署脚本"
echo "======================================"

# 检查依赖
command -v wrangler >/dev/null 2>&1 || { echo "错误: 需要安装wrangler CLI。运行 'npm install -g wrangler'。"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "错误: 需要安装jq。请安装后重试。"; exit 1; }

# 检查登录状态
echo "检查Cloudflare登录状态..."
wrangler whoami >/dev/null 2>&1 || { echo "请先登录Cloudflare账户: wrangler login"; exit 1; }
echo "已登录到Cloudflare账户。"

# 定义项目名称和配置变量
PROJECT_NAME="firemail"
WORKER_NAME="${PROJECT_NAME}-api"
KV_NAMESPACE="${PROJECT_NAME}-kv"
R2_BUCKET="${PROJECT_NAME}"
D1_DB="${PROJECT_NAME}"

# 当前目录
CURRENT_DIR=$(pwd)
WORKER_DIR="${CURRENT_DIR}/worker"
FRONTEND_DIR="${CURRENT_DIR}/frontend"

# 创建存储服务
echo "正在创建/确认存储服务..."

# 创建R2存储桶
echo "检查R2存储桶..."
R2_EXISTS=$(wrangler r2 bucket list --json | jq -r ".[] | select(.name==\"$R2_BUCKET\") | .name")
if [ -z "$R2_EXISTS" ]; then
  echo "创建R2存储桶: $R2_BUCKET"
  wrangler r2 bucket create $R2_BUCKET
else
  echo "R2存储桶已存在: $R2_BUCKET"
fi

# 创建KV命名空间
echo "检查KV命名空间..."
KV_EXISTS=$(wrangler kv:namespace list --json | jq -r ".[] | select(.title==\"$KV_NAMESPACE\") | .title")
if [ -z "$KV_EXISTS" ]; then
  echo "创建KV命名空间: $KV_NAMESPACE"
  KV_OUTPUT=$(wrangler kv:namespace create $KV_NAMESPACE --json)
  KV_ID=$(echo $KV_OUTPUT | jq -r '.id')
else
  echo "KV命名空间已存在: $KV_NAMESPACE"
  KV_ID=$(wrangler kv:namespace list --json | jq -r ".[] | select(.title==\"$KV_NAMESPACE\") | .id")
fi
echo "KV命名空间ID: $KV_ID"

# 创建D1数据库
echo "检查D1数据库..."
D1_EXISTS=$(wrangler d1 list --json | jq -r ".[] | select(.name==\"$D1_DB\") | .name")
if [ -z "$D1_EXISTS" ]; then
  echo "创建D1数据库: $D1_DB"
  D1_OUTPUT=$(wrangler d1 create $D1_DB --json)
  D1_ID=$(echo $D1_OUTPUT | jq -r '.uuid')
else
  echo "D1数据库已存在: $D1_DB"
  D1_ID=$(wrangler d1 list --json | jq -r ".[] | select(.name==\"$D1_DB\") | .uuid")
fi
echo "D1数据库ID: $D1_ID"

# 更新wrangler.toml配置
echo "更新Worker配置..."
cd $WORKER_DIR

# 替换wrangler.toml中的ID
sed -i.bak "s/bucket_name = \"firemail\"/bucket_name = \"$R2_BUCKET\"/" wrangler.toml
sed -i.bak "s/id = \"your-kv-namespace-id\"/id = \"$KV_ID\"/" wrangler.toml
sed -i.bak "s/database_id = \"your-d1-database-id\"/database_id = \"$D1_ID\"/" wrangler.toml
sed -i.bak "s/name = \"firemail-api\"/name = \"$WORKER_NAME\"/" wrangler.toml
rm -f wrangler.toml.bak

echo "Worker配置已更新"

# 初始化数据库
echo "初始化D1数据库..."
wrangler d1 execute $D1_DB --file=./init-db.js
echo "D1数据库初始化完成"

# 安装Worker依赖并发布
echo "安装Worker依赖..."
npm install
echo "发布Worker..."
wrangler publish
cd $CURRENT_DIR
echo "Worker已发布"

# 发布前端
echo "准备发布前端..."
cd $FRONTEND_DIR

# 检查npm依赖
echo "安装前端依赖..."
npm install

# 构建前端
echo "构建前端..."
npm run build

# 发布Pages
echo "发布前端到Cloudflare Pages..."
wrangler pages publish dist --project-name=$PROJECT_NAME

# 完成
cd $CURRENT_DIR
echo "======================================"
echo "部署完成!"
echo "前端网址: https://$PROJECT_NAME.pages.dev"
echo "Worker网址: https://$WORKER_NAME.workers.dev"
echo ""
echo "请注意:"
echo "1. 如果是首次部署，需要在Cloudflare Dashboard设置Pages环境变量"
echo "2. 默认账号: admin / admin123"
echo "======================================" 