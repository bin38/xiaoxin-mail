/**
 * WebSocket处理函数 - Cloudflare Pages Functions
 * 用于代理WebSocket连接到后端服务
 */

export async function onRequest(context) {
  // 获取请求对象和环境变量
  const { request, env } = context;
  
  // 获取后端URL，优先使用环境变量中的配置
  const backendUrl = env.BACKEND_URL || 'http://localhost:5000';
  
  try {
    // 检查是否为WebSocket请求
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }
    
    // 解析WebSocket后端URL - 通常需要将http或https替换为ws或wss
    const wsBackendUrl = backendUrl.replace(/^http/, 'ws');
    const url = new URL(request.url);
    const path = url.pathname.replace('/ws', ''); // 去掉前缀
    const wsUrl = `${wsBackendUrl}/ws${path}${url.search}`;
    
    console.log('代理WebSocket连接到:', wsUrl);
    
    // 创建WebSocket对象并连接到后端
    try {
      // 尝试使用Cloudflare提供的WebSocket API
      // 注意：Cloudflare Pages Functions可能需要不同的实现
      // 这部分可能需要根据实际部署环境调整
      
      // 当前版本的Pages Functions不完全支持WebSocket
      // 返回错误信息
      return new Response(JSON.stringify({
        error: 'WebSocket功能在当前环境下不可用',
        message: 'Cloudflare Pages Functions不完全支持WebSocket，请考虑使用Cloudflare Workers或其他方案'
      }), {
        status: 501, // Not Implemented
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch (err) {
      console.error('WebSocket连接失败:', err);
      
      return new Response(JSON.stringify({
        error: 'WebSocket连接失败',
        message: err.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  } catch (error) {
    // 错误处理
    console.error('处理WebSocket请求出错:', error);
    return new Response(JSON.stringify({
      error: '处理WebSocket请求出错',
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