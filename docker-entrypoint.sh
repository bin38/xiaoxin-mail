#!/bin/bash
set -e

# 创建必要的数据目录
mkdir -p /app/backend/data
mkdir -p /app/backend/data/backups

# 设置环境变量
export HOST="${HOST:-0.0.0.0}"
export FLASK_PORT="${FLASK_PORT:-5000}"
export WS_PORT="${WS_PORT:-8765}"
export FRONTEND_PORT="${FRONTEND_PORT:-3000}"
export JWT_SECRET_KEY="${JWT_SECRET_KEY:-huohuo_email_secret_key}"
export TZ="${TZ:-Asia/Shanghai}"

# 数据库配置
export DB_TYPE="${DB_TYPE:-sqlite}"
export MYSQL_HOST="${MYSQL_HOST:-localhost}"
export MYSQL_PORT="${MYSQL_PORT:-3306}"
export MYSQL_USER="${MYSQL_USER:-firemail}"
export MYSQL_PASSWORD="${MYSQL_PASSWORD:-}"
export MYSQL_DATABASE="${MYSQL_DATABASE:-firemail}"

# WebDAV配置
export WEBDAV_ENABLED="${WEBDAV_ENABLED:-false}"
export WEBDAV_URL="${WEBDAV_URL:-}"
export WEBDAV_USERNAME="${WEBDAV_USERNAME:-}"
export WEBDAV_PASSWORD="${WEBDAV_PASSWORD:-}"
export WEBDAV_ROOT_PATH="${WEBDAV_ROOT_PATH:-/firemail/}"
export WEBDAV_DB_NAME="${WEBDAV_DB_NAME:-firemail.db}"

echo "花火邮箱助手正在启动..."
echo "后端API地址: http://$HOST:$FLASK_PORT"
echo "WebSocket服务地址: ws://$HOST:$WS_PORT"
echo "前端服务地址: http://$HOST:80"
echo "注册功能: 默认开启，第一个注册的用户为管理员，之后管理员可在系统设置中控制"
echo "数据库类型: $DB_TYPE"
echo "WebDAV同步: ${WEBDAV_ENABLED}"

# 创建前端环境变量文件
mkdir -p /app/frontend/dist
cat > /app/frontend/dist/env-config.js << EOF
// 环境配置
window.API_URL = '/api';  // 使用相对路径
window.WS_URL = '/ws';    // 使用相对路径
console.log('env-config.js已加载，API_URL:', window.API_URL, 'WS_URL:', window.WS_URL);
EOF

echo "已创建环境配置文件，内容如下:"
cat /app/frontend/dist/env-config.js

# 确保Caddy日志目录存在
mkdir -p /var/log/caddy

# 检查Caddy配置文件
echo "检查Caddy配置..."
caddy validate --config /app/Caddyfile || (echo "Caddy配置错误" && exit 1)

# 如果使用MySQL数据库，等待MySQL连接可用
if [ "$DB_TYPE" = "mysql" ]; then
    echo "等待MySQL数据库连接..."
    max_retry=30
    counter=0
    until mysql -h$MYSQL_HOST -P$MYSQL_PORT -u$MYSQL_USER -p$MYSQL_PASSWORD -e "SELECT 1" &>/dev/null
    do
        sleep 1
        counter=$((counter+1))
        if [ $counter -ge $max_retry ]; then
            echo "无法连接到MySQL数据库，请检查配置"
            exit 1
        fi
        echo "尝试连接MySQL ($counter/$max_retry)..."
    done
    echo "MySQL数据库连接成功"
fi

# 启动Caddy服务
echo "启动Caddy服务..."
caddy run --config /app/Caddyfile &

# 启动Python后端应用
cd /app
echo "启动后端服务..."
exec python3 ./backend/app.py --host "$HOST" --port "$FLASK_PORT" --ws-port "$WS_PORT"
