/**
 * 小新邮箱 - Cloudflare Worker入口文件
 * 处理所有API请求，包括认证、邮件管理、存储管理等
 */

// 导入模块
const { handleAuthRequests } = require('./auth');
const { handleEmailRequests } = require('./email');
const { handleStorageRequests } = require('./storage');
const { 
  APP_CONFIG,
  corsHeaders, 
  handleCORS, 
  authenticateUser, 
  errorResponse, 
  successResponse 
} = require('./utils');

// 环境配置
const ENV = {
  PRODUCTION: 'production',
  DEVELOPMENT: 'development',
  STAGING: 'staging'
};

/**
 * 主请求处理函数
 * @param {Request} request - 传入的请求
 * @param {Object} env - 环境变量和绑定
 * @param {Object} ctx - 执行上下文
 * @returns {Promise<Response>} - 响应
 */
async function handleRequest(request, env, ctx) {
  // 处理CORS预检请求
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  // 解析请求URL
  const url = new URL(request.url);
  const path = url.pathname;
  
  try {
    // 健康检查端点
    if (path === '/api/health') {
      return successResponse({
        status: 'ok',
        environment: env.ENVIRONMENT || ENV.PRODUCTION,
        timestamp: new Date().toISOString(),
        app: APP_CONFIG.NAME
      });
    }
    
    // 配置端点 - 返回前端需要的公共配置
    if (path === '/api/config') {
      const config = {
        app_name: APP_CONFIG.NAME,
        environment: env.ENVIRONMENT || ENV.PRODUCTION,
        max_attachment_size: APP_CONFIG.MAX_ATTACHMENT_SIZE,
        version: '1.0.0',
        features: {
          attachments: true,
          search: true,
          labels: true
        }
      };
      
      return successResponse(config);
    }

    // 路由请求到不同的处理模块
    if (path.startsWith('/api/auth')) {
      return await handleAuthRequests(request, env, ctx);
    }
    
    if (path.startsWith('/api/emails') || path.startsWith('/api/mail')) {
      return await handleEmailRequests(request, env, ctx);
    }
    
    if (path.startsWith('/api/storage') || path.startsWith('/api/files')) {
      return await handleStorageRequests(request, env, ctx);
    }
    
    // 用户信息端点
    if (path === '/api/user/me') {
      const user = await authenticateUser(request, env);
      if (!user) {
        return errorResponse('未授权访问', 401);
      }
      
      // 移除敏感信息
      delete user.password_hash;
      
      return successResponse({
        user
      });
    }
    
    // 未找到匹配的路由
    return errorResponse('未找到API端点', 404);
  } catch (error) {
    console.error('处理请求错误:', error);
    return errorResponse('服务器内部错误: ' + error.message, 500);
  }
}

// 导出请求处理函数
module.exports = {
  fetch: handleRequest
}; 