/**
 * API请求处理函数 - Cloudflare Pages Functions
 * 用于代理API请求到后端服务，并注入环境变量配置
 */

export async function onRequest(context) {
  // 获取请求对象和环境变量
  const { request, env } = context;
  
  // 获取后端URL，优先使用环境变量中的配置
  const backendUrl = env.BACKEND_URL || 'http://localhost:5000';
  
  try {
    // 处理CORS预检请求
    if (request.method === 'OPTIONS') {
      return handleCORS(request);
    }
    
    // 获取请求路径和参数
    const url = new URL(request.url);
    const path = url.pathname.replace('/api', ''); // 去掉前缀
    
    // 构建后端API URL
    const backendAPIUrl = `${backendUrl}/api${path}${url.search}`;
    
    // 克隆请求
    const requestInit = {
      method: request.method,
      headers: new Headers(request.headers),
      redirect: 'follow'
    };
    
    // 如果有请求体，则添加
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      const contentType = request.headers.get('Content-Type');
      
      // 如果是WebDAV配置请求，注入环境变量
      if (path === '/admin/database/webdav/config' && contentType?.includes('application/json')) {
        const body = await request.json();
        
        // 如果环境变量中有WebDAV配置，则覆盖请求中的值
        if (env.WEBDAV_URL) body.url = env.WEBDAV_URL;
        if (env.WEBDAV_USERNAME) body.username = env.WEBDAV_USERNAME;
        if (env.WEBDAV_PASSWORD) body.password = env.WEBDAV_PASSWORD;
        if (env.WEBDAV_ROOT_PATH) body.root_path = env.WEBDAV_ROOT_PATH;
        if (env.WEBDAV_DB_NAME) body.db_name = env.WEBDAV_DB_NAME;
        if (env.WEBDAV_ENABLED !== undefined) body.enabled = env.WEBDAV_ENABLED === 'true';
        
        requestInit.body = JSON.stringify(body);
        requestInit.headers.set('Content-Type', 'application/json');
      } else {
        // 其他请求直接传递原始body
        requestInit.body = await request.arrayBuffer();
      }
    }
    
    // 发送请求到后端API
    const response = await fetch(backendAPIUrl, requestInit);
    
    // 构建响应
    const responseInit = {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers)
    };
    
    // 添加CORS头
    responseInit.headers.set('Access-Control-Allow-Origin', '*');
    responseInit.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    responseInit.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    return new Response(response.body, responseInit);
  } catch (error) {
    // 错误处理
    console.error('处理API请求出错:', error);
    return new Response(JSON.stringify({
      error: '处理API请求出错',
      message: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

/**
 * 处理CORS预检请求
 * @param {Request} request 原始请求
 */
function handleCORS(request) {
  // 获取请求的域和方法
  const origin = request.headers.get('Origin') || '*';
  const method = request.headers.get('Access-Control-Request-Method');
  const headers = request.headers.get('Access-Control-Request-Headers');
  
  // 返回CORS头
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': method || 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': headers || 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      'Access-Control-Allow-Credentials': 'true'
    }
  });
} 