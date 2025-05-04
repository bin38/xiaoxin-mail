/**
 * 配置API处理函数 - 返回前端需要的环境变量配置
 */

export async function onRequest(context) {
  // 获取请求对象和环境变量
  const { request, env } = context;
  
  // 构建配置对象，仅包含需要前端知道的变量
  const config = {
    backendUrl: env.BACKEND_URL || 'http://localhost:5000',
    webdavEnabled: env.WEBDAV_ENABLED === 'true',
    version: '1.0.0',
    environment: env.ENVIRONMENT || 'production',
    timestamp: new Date().toISOString()
  };
  
  return new Response(JSON.stringify(config), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, max-age=0'
    }
  });
} 