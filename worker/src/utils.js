/**
 * 小新邮箱工具函数库
 * 这个模块提供了常用的辅助函数，包括CORS处理、身份验证、错误处理等
 */

// 应用常量
const APP_CONFIG = {
  NAME: process.env.APP_NAME || '小新邮箱',
  DEFAULT_STORAGE_PROVIDER: process.env.STORAGE_PROVIDER || 'r2',
  SESSION_DURATION: parseInt(process.env.SESSION_DURATION || '604800', 10),
  MAX_ATTACHMENT_SIZE: parseInt(process.env.MAX_ATTACHMENT_SIZE || '10485760', 10)
};

/**
 * 生成CORS头部
 * @param {string} origin - 请求来源
 * @returns {Object} - CORS头部对象
 */
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * 处理CORS预检请求
 * @param {Request} request - 请求对象
 * @returns {Response|null} - 如果是OPTIONS请求返回Response，否则返回null
 */
function handleCORS(request) {
  const origin = request.headers.get('Origin');
  
  // 处理预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(origin),
        'Content-Length': '0',
      }
    });
  }
  
  return null;
}

/**
 * 验证用户身份
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @returns {Promise<Object|null>} - 用户对象或null(未授权)
 */
async function authenticateUser(request, env) {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.split(' ')[1];
  if (!token) {
    return null;
  }
  
  // 从KV中获取会话
  const sessionKey = `sessions:${token}`;
  const sessionData = await env.MAIL_KV.get(sessionKey, { type: 'json' });
  
  if (!sessionData) {
    return null;
  }
  
  // 检查会话是否过期
  const now = Math.floor(Date.now() / 1000);
  if (sessionData.expires < now) {
    // 会话已过期，从KV中删除
    await env.MAIL_KV.delete(sessionKey);
    return null;
  }
  
  // 获取用户信息
  const { results } = await env.MAIL_DB.prepare(
    `SELECT id, username, email, display_name, avatar, status 
     FROM users 
     WHERE id = ? AND status = 'active'`
  ).bind(sessionData.userId).all();
  
  if (results.length === 0) {
    return null;
  }
  
  return results[0];
}

/**
 * 检查用户是否是管理员
 * @param {Object} user - 用户对象
 * @param {Object} env - 环境变量
 * @returns {Promise<boolean>} - 是否为管理员
 */
async function isAdmin(user, env) {
  if (!user) return false;
  
  // 从系统配置获取管理员用户列表
  const adminConfig = await env.MAIL_KV.get('system:admin_users', { type: 'json' });
  
  if (!adminConfig || !Array.isArray(adminConfig.emails)) {
    // 如果配置不存在，检查环境变量中的管理员
    const adminEmail = env.ADMIN_EMAIL;
    return adminEmail ? user.email === adminEmail : false;
  }
  
  return adminConfig.emails.includes(user.email);
}

/**
 * 格式化字节大小为人类可读的字符串
 * @param {number} bytes - 字节数
 * @param {number} decimals - 小数位数
 * @returns {string} - 格式化后的字符串
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * 生成错误响应
 * @param {string} message - 错误消息
 * @param {number} status - HTTP状态码
 * @param {Object} extra - 额外数据
 * @returns {Response} - 响应对象
 */
function errorResponse(message, status = 400, extra = {}) {
  const body = JSON.stringify({
    success: false,
    error: message,
    ...extra
  });
  
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(null),
    }
  });
}

/**
 * 生成成功响应
 * @param {Object} data - 响应数据
 * @param {number} status - HTTP状态码
 * @returns {Response} - 响应对象
 */
function successResponse(data, status = 200) {
  const body = JSON.stringify({
    success: true,
    data
  });
  
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(null),
    }
  });
}

/**
 * 解析请求JSON体
 * @param {Request} request - 请求对象
 * @returns {Promise<Object>} - 解析后的JSON对象
 */
async function parseJsonBody(request) {
  try {
    return await request.json();
  } catch (error) {
    throw new Error('无效的JSON格式');
  }
}

// 导出所有公共函数
module.exports = {
  APP_CONFIG,
  corsHeaders,
  handleCORS,
  authenticateUser,
  isAdmin,
  formatBytes,
  errorResponse,
  successResponse,
  parseJsonBody
}; 