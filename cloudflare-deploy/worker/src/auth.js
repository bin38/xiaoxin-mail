/**
 * 花火邮箱助手 - 认证模块
 * 处理用户认证、会话管理和权限验证
 */

import { nanoid } from 'nanoid';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * 处理认证相关请求
 * @param {Request} request 客户端请求
 * @param {Object} env 环境变量和绑定
 * @param {Object} ctx 执行上下文
 */
export async function handleAuthRequests(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // 登录API
  if (path === '/api/auth/login' && request.method === 'POST') {
    return await handleLogin(request, env);
  }
  
  // 注册API
  if (path === '/api/auth/register' && request.method === 'POST') {
    return await handleRegister(request, env);
  }
  
  // 注销API
  if (path === '/api/auth/logout' && request.method === 'POST') {
    return await handleLogout(request, env);
  }
  
  // 验证会话API
  if (path === '/api/auth/validate' && request.method === 'GET') {
    return await validateSession(request, env);
  }
  
  // 刷新令牌API
  if (path === '/api/auth/refresh' && request.method === 'POST') {
    return await refreshToken(request, env);
  }
  
  // 不支持的路径
  return new Response('认证API路径不存在', { 
    status: 404,
    headers: corsHeaders()
  });
}

/**
 * 处理用户登录
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 */
async function handleLogin(request, env) {
  try {
    // 解析登录请求
    const { username, password } = await request.json();
    
    if (!username || !password) {
      return new Response(JSON.stringify({ error: '用户名和密码不能为空' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 在D1数据库中查询用户
    const stmt = env.FIREMAIL_DB.prepare(`
      SELECT id, username, password_hash, email, display_name, avatar, status
      FROM users
      WHERE username = ?
    `).bind(username);
    
    const user = await stmt.first();
    
    if (!user) {
      return new Response(JSON.stringify({ error: '用户名或密码不正确' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 验证密码
    if (!await verifyPassword(password, user.password_hash)) {
      return new Response(JSON.stringify({ error: '用户名或密码不正确' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 检查用户状态
    if (user.status !== 1) {
      return new Response(JSON.stringify({ error: '账户已被禁用' }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 创建会话
    const session = await createSession(env, user);
    
    // 更新上次登录时间
    await env.FIREMAIL_DB.prepare(`
      UPDATE users
      SET last_login = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), user.id).run();
    
    // 返回用户信息和令牌
    return new Response(JSON.stringify({
      token: session.token,
      refreshToken: session.refreshToken,
      expiresIn: 3600, // 1小时
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        avatar: user.avatar
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    return new Response(JSON.stringify({ error: '登录失败，请稍后再试' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
}

/**
 * 处理用户注册
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 */
async function handleRegister(request, env) {
  try {
    // 解析注册请求
    const { username, password, email, displayName } = await request.json();
    
    if (!username || !password) {
      return new Response(JSON.stringify({ error: '用户名和密码不能为空' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 检查用户名是否已存在
    const existingUser = await env.FIREMAIL_DB.prepare(`
      SELECT id FROM users WHERE username = ?
    `).bind(username).first();
    
    if (existingUser) {
      return new Response(JSON.stringify({ error: '用户名已存在' }), {
        status: 409,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 检查邮箱是否已存在
    if (email) {
      const existingEmail = await env.FIREMAIL_DB.prepare(`
        SELECT id FROM users WHERE email = ?
      `).bind(email).first();
      
      if (existingEmail) {
        return new Response(JSON.stringify({ error: '邮箱已被使用' }), {
          status: 409,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders()
          }
        });
      }
    }
    
    // 创建用户
    const passwordHash = await hashPassword(password);
    const timestamp = new Date().toISOString();
    
    const result = await env.FIREMAIL_DB.prepare(`
      INSERT INTO users (username, password_hash, email, display_name, created_at, status)
      VALUES (?, ?, ?, ?, ?, 1)
    `).bind(username, passwordHash, email || null, displayName || username, timestamp).run();
    
    // 获取新创建用户的ID
    const userId = result.meta.last_row_id;
    
    // 返回创建成功消息
    return new Response(JSON.stringify({
      success: true,
      message: '注册成功',
      userId: userId
    }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  } catch (error) {
    console.error('注册错误:', error);
    return new Response(JSON.stringify({ error: '注册失败，请稍后再试' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
}

/**
 * 处理用户注销
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 */
async function handleLogout(request, env) {
  try {
    // 获取认证令牌
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // 删除会话
    await env.FIREMAIL_KV.delete(`sessions:${token}`);
    
    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  } catch (error) {
    console.error('注销错误:', error);
    return new Response(JSON.stringify({ error: '注销失败，请稍后再试' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
}

/**
 * 验证会话
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 */
async function validateSession(request, env) {
  try {
    // 获取认证令牌
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ valid: false }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // 验证会话
    const sessionKey = `sessions:${token}`;
    const sessionData = await env.FIREMAIL_KV.get(sessionKey, { type: 'json' });
    
    if (!sessionData) {
      return new Response(JSON.stringify({ valid: false }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 检查会话是否过期
    if (sessionData.expiresAt && new Date(sessionData.expiresAt) < new Date()) {
      await env.FIREMAIL_KV.delete(sessionKey);
      return new Response(JSON.stringify({ valid: false, error: '会话已过期' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 会话有效
    return new Response(JSON.stringify({ 
      valid: true,
      user: {
        id: sessionData.user.id,
        username: sessionData.user.username,
        email: sessionData.user.email,
        displayName: sessionData.user.display_name,
        avatar: sessionData.user.avatar
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  } catch (error) {
    console.error('会话验证错误:', error);
    return new Response(JSON.stringify({ error: '会话验证失败，请稍后再试' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
}

/**
 * 刷新认证令牌
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 */
async function refreshToken(request, env) {
  try {
    // 解析刷新令牌请求
    const { refreshToken } = await request.json();
    
    if (!refreshToken) {
      return new Response(JSON.stringify({ error: '刷新令牌不能为空' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 验证刷新令牌
    const refreshKey = `refresh:${refreshToken}`;
    const sessionId = await env.FIREMAIL_KV.get(refreshKey);
    
    if (!sessionId) {
      return new Response(JSON.stringify({ error: '无效的刷新令牌' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 获取原始会话
    const sessionData = await env.FIREMAIL_KV.get(`sessions:${sessionId}`, { type: 'json' });
    
    if (!sessionData) {
      // 清理无效的刷新令牌
      await env.FIREMAIL_KV.delete(refreshKey);
      return new Response(JSON.stringify({ error: '会话已失效' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 创建新会话
    const user = sessionData.user;
    const newSession = await createSession(env, user);
    
    // 删除旧会话和刷新令牌
    await env.FIREMAIL_KV.delete(`sessions:${sessionId}`);
    await env.FIREMAIL_KV.delete(refreshKey);
    
    // 返回新令牌
    return new Response(JSON.stringify({
      token: newSession.token,
      refreshToken: newSession.refreshToken,
      expiresIn: 3600, // 1小时
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        avatar: user.avatar
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  } catch (error) {
    console.error('令牌刷新错误:', error);
    return new Response(JSON.stringify({ error: '令牌刷新失败，请稍后再试' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
}

/**
 * 为用户创建会话
 * @param {Object} env 环境变量
 * @param {Object} user 用户对象
 */
async function createSession(env, user) {
  // 生成令牌
  const token = nanoid(32);
  const refreshToken = nanoid(48);
  
  // 计算过期时间
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1); // 1小时后过期
  
  const refreshExpiresAt = new Date();
  refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 30); // 30天后过期
  
  // 存储会话数据
  const sessionData = {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      display_name: user.display_name,
      avatar: user.avatar
    },
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString()
  };
  
  // 存储到KV
  await env.FIREMAIL_KV.put(`sessions:${token}`, JSON.stringify(sessionData), {
    expirationTtl: 3600 // 1小时
  });
  
  // 存储刷新令牌映射
  await env.FIREMAIL_KV.put(`refresh:${refreshToken}`, token, {
    expirationTtl: 30 * 24 * 60 * 60 // 30天
  });
  
  return { token, refreshToken };
}

/**
 * 哈希密码
 * @param {string} password 明文密码
 */
async function hashPassword(password) {
  // 在生产环境中，你应该使用更安全的哈希算法和盐值
  // 但由于Worker环境限制，这里使用简化版
  const salt = nanoid(16);
  const hash = createHash('sha256').update(salt + password).digest('hex');
  return `${salt}:${hash}`;
}

/**
 * 验证密码
 * @param {string} password 明文密码
 * @param {string} hash 哈希密码
 */
async function verifyPassword(password, hash) {
  const [salt, storedHash] = hash.split(':');
  const calculatedHash = createHash('sha256').update(salt + password).digest('hex');
  return calculatedHash === storedHash;
}

/**
 * 返回CORS头
 */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
} 