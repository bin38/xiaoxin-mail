# --- Builder Stage ---
FROM node:22-alpine AS builder

# Copy application files
COPY . /app

# Enable pnpm
RUN corepack enable pnpm

# Install and build frontend
WORKDIR /app/frontend
RUN pnpm install
RUN pnpm install dayjs # 漏了一个依赖
RUN pnpm build

# --- Final Stage ---
FROM alpine

# Environment variables
ENV HOST=0.0.0.0 \
    FLASK_PORT=5000 \
    WS_PORT=8765 \
    FRONTEND_PORT=3000 \
    TZ=Asia/Shanghai \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    JWT_SECRET_KEY=huohuo_email_secret_key \
    DB_TYPE=sqlite \
    WEBDAV_ENABLED=false

# Install Python and required packages
RUN apk add --no-cache py3-pip caddy bash mysql-client mariadb-connector-c-dev build-base python3-dev

# Copy necessary files from builder stage
COPY --from=builder /app /app

# 显式复制启动脚本并设置权限
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# Set working directory
WORKDIR /app

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt --break-system-packages

# Create data directory
RUN mkdir -p /app/backend/data && \
    mkdir -p /app/backend/data/backups && \
    chmod -R 777 /app/backend/data

# Expose port
EXPOSE 80

# Startup command
ENTRYPOINT ["/bin/bash", "/app/docker-entrypoint.sh"]
