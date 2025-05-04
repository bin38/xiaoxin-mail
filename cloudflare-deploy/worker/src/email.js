/**
 * 花火邮箱助手 - 邮件模块
 * 处理邮件列表、详情、状态更新、文件夹和标签管理
 */

/**
 * 处理邮件相关请求
 * @param {Request} request 客户端请求
 * @param {Object} env 环境变量和绑定
 * @param {Object} ctx 执行上下文
 */
export async function handleEmailRequests(request, env, ctx) {
  // 获取用户身份
  const user = await authenticateUser(request, env);
  if (!user) {
    return new Response(JSON.stringify({ error: '需要认证' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }

  const url = new URL(request.url);
  const path = url.pathname;
  
  // 获取邮件列表
  if (path === '/api/emails' && request.method === 'GET') {
    return await getEmailList(request, env, user);
  }
  
  // 获取邮件详情
  if (path.match(/^\/api\/emails\/[^\/]+$/) && request.method === 'GET') {
    const emailId = path.split('/').pop();
    return await getEmailDetail(request, env, user, emailId);
  }
  
  // 创建/导入新邮件
  if (path === '/api/emails' && request.method === 'POST') {
    return await createEmail(request, env, user);
  }
  
  // 更新邮件状态
  if (path.match(/^\/api\/emails\/[^\/]+\/status$/) && request.method === 'PUT') {
    const emailId = path.split('/')[3];
    return await updateEmailStatus(request, env, user, emailId);
  }
  
  // 移动邮件到文件夹
  if (path.match(/^\/api\/emails\/[^\/]+\/move$/) && request.method === 'PUT') {
    const emailId = path.split('/')[3];
    return await moveEmail(request, env, user, emailId);
  }
  
  // 添加标签
  if (path.match(/^\/api\/emails\/[^\/]+\/labels$/) && request.method === 'POST') {
    const emailId = path.split('/')[3];
    return await addLabel(request, env, user, emailId);
  }
  
  // 移除标签
  if (path.match(/^\/api\/emails\/[^\/]+\/labels\/[^\/]+$/) && request.method === 'DELETE') {
    const parts = path.split('/');
    const emailId = parts[3];
    const label = decodeURIComponent(parts[5]);
    return await removeLabel(request, env, user, emailId, label);
  }
  
  // 删除邮件
  if (path.match(/^\/api\/emails\/[^\/]+$/) && request.method === 'DELETE') {
    const emailId = path.split('/').pop();
    return await deleteEmail(request, env, user, emailId);
  }
  
  // 获取标签列表
  if (path === '/api/emails/labels' && request.method === 'GET') {
    return await getLabels(request, env, user);
  }
  
  // 不支持的路径
  return new Response('邮件API路径不存在', { 
    status: 404,
    headers: corsHeaders()
  });
}

/**
 * 获取邮件列表
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @param {Object} user 用户对象
 */
async function getEmailList(request, env, user) {
  try {
    const url = new URL(request.url);
    
    // 获取查询参数
    const folder = url.searchParams.get('folder') || 'inbox';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const label = url.searchParams.get('label');
    const search = url.searchParams.get('search');
    
    // 计算分页偏移量
    const offset = (page - 1) * limit;
    
    // 构建基础SQL查询
    let sql = `
      SELECT mr.id, mr.email_id, mr.subject, mr.sender, mr.recipient, 
             mr.received_time, mr.folder, mr.is_read, mr.is_starred, mr.has_attachment,
             mr.created_at
      FROM mail_records mr
      WHERE mr.user_id = ?
    `;
    
    // 查询参数
    let params = [user.id];
    
    // 添加文件夹过滤
    if (folder) {
      sql += ` AND mr.folder = ?`;
      params.push(folder);
    }
    
    // 如果有标签过滤，则添加JOIN条件
    if (label) {
      sql = `
        SELECT mr.id, mr.email_id, mr.subject, mr.sender, mr.recipient, 
               mr.received_time, mr.folder, mr.is_read, mr.is_starred, mr.has_attachment,
               mr.created_at
        FROM mail_records mr
        JOIN mail_labels ml ON mr.id = ml.mail_id
        WHERE mr.user_id = ? AND ml.label = ?
      `;
      params = [user.id, label];
      
      // 如果同时还有文件夹过滤
      if (folder) {
        sql += ` AND mr.folder = ?`;
        params.push(folder);
      }
    }
    
    // 添加搜索条件
    if (search) {
      sql += ` AND (mr.subject LIKE ? OR mr.sender LIKE ? OR mr.recipient LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }
    
    // 添加排序和分页
    sql += ` ORDER BY mr.received_time DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    // 执行查询
    const stmt = env.FIREMAIL_DB.prepare(sql);
    const { results } = await stmt.bind(...params).all();
    
    // 获取总记录数
    let countSql = `
      SELECT COUNT(*) as total
      FROM mail_records mr
      WHERE mr.user_id = ?
    `;
    
    let countParams = [user.id];
    
    if (folder) {
      countSql += ` AND mr.folder = ?`;
      countParams.push(folder);
    }
    
    if (label) {
      countSql = `
        SELECT COUNT(*) as total
        FROM mail_records mr
        JOIN mail_labels ml ON mr.id = ml.mail_id
        WHERE mr.user_id = ? AND ml.label = ?
      `;
      countParams = [user.id, label];
      
      if (folder) {
        countSql += ` AND mr.folder = ?`;
        countParams.push(folder);
      }
    }
    
    if (search) {
      countSql += ` AND (mr.subject LIKE ? OR mr.sender LIKE ? OR mr.recipient LIKE ?)`;
      const searchPattern = `%${search}%`;
      countParams.push(searchPattern, searchPattern, searchPattern);
    }
    
    const countStmt = env.FIREMAIL_DB.prepare(countSql);
    const { total } = await countStmt.bind(...countParams).first();
    
    // 计算总页数
    const totalPages = Math.ceil(total / limit);
    
    // 返回邮件列表和分页信息
    return new Response(JSON.stringify({
      results,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  } catch (error) {
    console.error('获取邮件列表错误:', error);
    return new Response(JSON.stringify({ error: '获取邮件列表失败，请稍后再试' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
}

/**
 * 获取邮件详情
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @param {Object} user 用户对象
 * @param {string} emailId 邮件ID
 */
async function getEmailDetail(request, env, user, emailId) {
  try {
    // 获取邮件基本信息
    const stmt = env.FIREMAIL_DB.prepare(`
      SELECT mr.id, mr.email_id, mr.subject, mr.sender, mr.recipient, 
             mr.received_time, mr.folder, mr.is_read, mr.is_starred, 
             mr.content_ref, mr.has_attachment, mr.created_at
      FROM mail_records mr
      WHERE mr.user_id = ? AND (mr.id = ? OR mr.email_id = ?)
    `);
    
    const email = await stmt.bind(user.id, emailId, emailId).first();
    
    if (!email) {
      return new Response(JSON.stringify({ error: '邮件不存在或无权访问' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 从R2获取邮件内容
    const contentRef = email.content_ref;
    let content = {};
    
    if (contentRef) {
      const contentObject = await env.FIREMAIL_BUCKET.get(contentRef);
      if (contentObject) {
        content = await contentObject.json();
      }
    }
    
    // 获取邮件标签
    const labelsStmt = env.FIREMAIL_DB.prepare(`
      SELECT label
      FROM mail_labels
      WHERE mail_id = ?
    `);
    
    const { results: labels } = await labelsStmt.bind(email.id).all();
    
    // 获取邮件附件
    const attachmentsStmt = env.FIREMAIL_DB.prepare(`
      SELECT id, filename, content_type, size, storage_path, created_at
      FROM mail_attachments
      WHERE mail_id = ?
    `);
    
    const { results: attachments } = await attachmentsStmt.bind(email.id).all();
    
    // 如果邮件未读，则标记为已读
    if (!email.is_read) {
      await env.FIREMAIL_DB.prepare(`
        UPDATE mail_records
        SET is_read = 1
        WHERE id = ?
      `).bind(email.id).run();
      
      email.is_read = 1;
    }
    
    // 构建完整邮件详情
    const fullEmail = {
      ...email,
      content,
      labels: labels.map(l => l.label),
      attachments
    };
    
    return new Response(JSON.stringify(fullEmail), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  } catch (error) {
    console.error('获取邮件详情错误:', error);
    return new Response(JSON.stringify({ error: '获取邮件详情失败，请稍后再试' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
}

/**
 * 创建/导入新邮件
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @param {Object} user 用户对象
 */
async function createEmail(request, env, user) {
  try {
    const emailData = await request.json();
    
    // 验证必要字段
    if (!emailData.subject || !emailData.sender) {
      return new Response(JSON.stringify({ error: '缺少必要字段' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 生成唯一邮件ID
    const emailId = `email_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const timestamp = new Date().toISOString();
    
    // 构建邮件内容引用路径
    const contentRef = `emails/${user.id}/${emailId}.json`;
    
    // 保存邮件内容到R2
    const content = emailData.content || {};
    await env.FIREMAIL_BUCKET.put(contentRef, JSON.stringify(content), {
      contentType: 'application/json'
    });
    
    // 保存邮件记录到D1
    const result = await env.FIREMAIL_DB.prepare(`
      INSERT INTO mail_records (
        email_id, user_id, subject, sender, recipient, received_time, 
        content_ref, has_attachment, folder, is_read, is_starred, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      emailId,
      user.id,
      emailData.subject,
      emailData.sender,
      emailData.recipient || null,
      emailData.received_time || timestamp,
      contentRef,
      emailData.has_attachment ? 1 : 0,
      emailData.folder || 'inbox',
      emailData.is_read ? 1 : 0,
      emailData.is_starred ? 1 : 0,
      timestamp
    ).run();
    
    const mailId = result.meta.last_row_id;
    
    // 处理附件
    const attachments = emailData.attachments || [];
    for (const attachment of attachments) {
      if (!attachment.filename || !attachment.data) continue;
      
      // 存储附件到R2
      const attachmentPath = `attachments/${user.id}/${emailId}/${attachment.filename}`;
      
      // 解码Base64数据
      const binaryData = atob(attachment.data.split('base64,')[1]);
      const bytes = new Uint8Array(binaryData.length);
      for (let i = 0; i < binaryData.length; i++) {
        bytes[i] = binaryData.charCodeAt(i);
      }
      
      await env.FIREMAIL_BUCKET.put(attachmentPath, bytes, {
        contentType: attachment.content_type || 'application/octet-stream'
      });
      
      // 添加附件记录
      await env.FIREMAIL_DB.prepare(`
        INSERT INTO mail_attachments (
          mail_id, filename, content_type, size, storage_path, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        mailId,
        attachment.filename,
        attachment.content_type || 'application/octet-stream',
        bytes.length,
        attachmentPath,
        timestamp
      ).run();
    }
    
    // 处理标签
    const labels = emailData.labels || [];
    for (const label of labels) {
      await env.FIREMAIL_DB.prepare(`
        INSERT INTO mail_labels (mail_id, label, created_at)
        VALUES (?, ?, ?)
      `).bind(mailId, label, timestamp).run();
    }
    
    return new Response(JSON.stringify({
      success: true,
      id: mailId,
      email_id: emailId
    }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  } catch (error) {
    console.error('创建邮件错误:', error);
    return new Response(JSON.stringify({ error: '创建邮件失败，请稍后再试' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
}

/**
 * 更新邮件状态
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @param {Object} user 用户对象
 * @param {string} emailId 邮件ID
 */
async function updateEmailStatus(request, env, user, emailId) {
  try {
    // 验证邮件存在并且属于当前用户
    const email = await env.FIREMAIL_DB.prepare(`
      SELECT id FROM mail_records
      WHERE (id = ? OR email_id = ?) AND user_id = ?
    `).bind(emailId, emailId, user.id).first();
    
    if (!email) {
      return new Response(JSON.stringify({ error: '邮件不存在或无权访问' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 获取状态更新数据
    const statusData = await request.json();
    
    // 构建UPDATE语句
    let sql = 'UPDATE mail_records SET ';
    const updates = [];
    const params = [];
    
    // 添加各个可更新字段
    if (statusData.is_read !== undefined) {
      updates.push('is_read = ?');
      params.push(statusData.is_read ? 1 : 0);
    }
    
    if (statusData.is_starred !== undefined) {
      updates.push('is_starred = ?');
      params.push(statusData.is_starred ? 1 : 0);
    }
    
    // 如果没有任何更新，返回错误
    if (updates.length === 0) {
      return new Response(JSON.stringify({ error: '未提供任何要更新的状态' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 完成SQL语句
    sql += updates.join(', ');
    sql += ' WHERE id = ?';
    params.push(email.id);
    
    // 执行更新
    await env.FIREMAIL_DB.prepare(sql).bind(...params).run();
    
    return new Response(JSON.stringify({
      success: true,
      id: email.id,
      ...statusData
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  } catch (error) {
    console.error('更新邮件状态错误:', error);
    return new Response(JSON.stringify({ error: '更新邮件状态失败，请稍后再试' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
}

/**
 * 移动邮件到文件夹
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @param {Object} user 用户对象
 * @param {string} emailId 邮件ID
 */
async function moveEmail(request, env, user, emailId) {
  try {
    // 验证邮件存在并且属于当前用户
    const email = await env.FIREMAIL_DB.prepare(`
      SELECT id FROM mail_records
      WHERE (id = ? OR email_id = ?) AND user_id = ?
    `).bind(emailId, emailId, user.id).first();
    
    if (!email) {
      return new Response(JSON.stringify({ error: '邮件不存在或无权访问' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 获取目标文件夹
    const { folder } = await request.json();
    
    if (!folder) {
      return new Response(JSON.stringify({ error: '必须指定目标文件夹' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 执行移动
    await env.FIREMAIL_DB.prepare(`
      UPDATE mail_records
      SET folder = ?
      WHERE id = ?
    `).bind(folder, email.id).run();
    
    return new Response(JSON.stringify({
      success: true,
      id: email.id,
      folder
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  } catch (error) {
    console.error('移动邮件错误:', error);
    return new Response(JSON.stringify({ error: '移动邮件失败，请稍后再试' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
}

/**
 * 添加标签
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @param {Object} user 用户对象
 * @param {string} emailId 邮件ID
 */
async function addLabel(request, env, user, emailId) {
  try {
    // 验证邮件存在并且属于当前用户
    const email = await env.FIREMAIL_DB.prepare(`
      SELECT id FROM mail_records
      WHERE (id = ? OR email_id = ?) AND user_id = ?
    `).bind(emailId, emailId, user.id).first();
    
    if (!email) {
      return new Response(JSON.stringify({ error: '邮件不存在或无权访问' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 获取标签
    const { label } = await request.json();
    
    if (!label) {
      return new Response(JSON.stringify({ error: '必须指定标签' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 添加标签 (如果不存在)
    await env.FIREMAIL_DB.prepare(`
      INSERT OR IGNORE INTO mail_labels (mail_id, label, created_at)
      VALUES (?, ?, ?)
    `).bind(email.id, label, new Date().toISOString()).run();
    
    return new Response(JSON.stringify({
      success: true,
      id: email.id,
      label
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  } catch (error) {
    console.error('添加标签错误:', error);
    return new Response(JSON.stringify({ error: '添加标签失败，请稍后再试' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
}

/**
 * 移除标签
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @param {Object} user 用户对象
 * @param {string} emailId 邮件ID
 * @param {string} label 标签
 */
async function removeLabel(request, env, user, emailId, label) {
  try {
    // 验证邮件存在并且属于当前用户
    const email = await env.FIREMAIL_DB.prepare(`
      SELECT id FROM mail_records
      WHERE (id = ? OR email_id = ?) AND user_id = ?
    `).bind(emailId, emailId, user.id).first();
    
    if (!email) {
      return new Response(JSON.stringify({ error: '邮件不存在或无权访问' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 移除标签
    await env.FIREMAIL_DB.prepare(`
      DELETE FROM mail_labels
      WHERE mail_id = ? AND label = ?
    `).bind(email.id, label).run();
    
    return new Response(JSON.stringify({
      success: true,
      id: email.id,
      label
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  } catch (error) {
    console.error('移除标签错误:', error);
    return new Response(JSON.stringify({ error: '移除标签失败，请稍后再试' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
}

/**
 * 删除邮件
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @param {Object} user 用户对象
 * @param {string} emailId 邮件ID
 */
async function deleteEmail(request, env, user, emailId) {
  try {
    // 验证邮件存在并且属于当前用户
    const email = await env.FIREMAIL_DB.prepare(`
      SELECT id, content_ref FROM mail_records
      WHERE (id = ? OR email_id = ?) AND user_id = ?
    `).bind(emailId, emailId, user.id).first();
    
    if (!email) {
      return new Response(JSON.stringify({ error: '邮件不存在或无权访问' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 开始事务
    const mailId = email.id;
    
    // 获取附件列表
    const { results: attachments } = await env.FIREMAIL_DB.prepare(`
      SELECT storage_path FROM mail_attachments
      WHERE mail_id = ?
    `).bind(mailId).all();
    
    // 删除相关记录
    await env.FIREMAIL_DB.prepare(`DELETE FROM mail_labels WHERE mail_id = ?`).bind(mailId).run();
    await env.FIREMAIL_DB.prepare(`DELETE FROM mail_attachments WHERE mail_id = ?`).bind(mailId).run();
    await env.FIREMAIL_DB.prepare(`DELETE FROM mail_records WHERE id = ?`).bind(mailId).run();
    
    // 删除R2中的内容和附件
    const deletePromises = [];
    
    // 删除邮件内容
    if (email.content_ref) {
      deletePromises.push(env.FIREMAIL_BUCKET.delete(email.content_ref));
    }
    
    // 删除附件
    for (const attachment of attachments) {
      if (attachment.storage_path) {
        deletePromises.push(env.FIREMAIL_BUCKET.delete(attachment.storage_path));
      }
    }
    
    // 等待所有删除操作完成
    await Promise.allSettled(deletePromises);
    
    return new Response(JSON.stringify({
      success: true,
      id: mailId
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  } catch (error) {
    console.error('删除邮件错误:', error);
    return new Response(JSON.stringify({ error: '删除邮件失败，请稍后再试' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
}

/**
 * 获取用户所有标签
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @param {Object} user 用户对象
 */
async function getLabels(request, env, user) {
  try {
    // 查询该用户的所有标签
    const sql = `
      SELECT DISTINCT ml.label, COUNT(ml.mail_id) AS count
      FROM mail_labels ml
      JOIN mail_records mr ON ml.mail_id = mr.id
      WHERE mr.user_id = ?
      GROUP BY ml.label
      ORDER BY ml.label
    `;
    
    const { results } = await env.FIREMAIL_DB.prepare(sql).bind(user.id).all();
    
    return new Response(JSON.stringify(results), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  } catch (error) {
    console.error('获取标签列表错误:', error);
    return new Response(JSON.stringify({ error: '获取标签列表失败，请稍后再试' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
}

/**
 * 用户认证
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 */
async function authenticateUser(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  try {
    // 验证会话
    const sessionKey = `sessions:${token}`;
    const sessionData = await env.FIREMAIL_KV.get(sessionKey, { type: 'json' });
    
    if (!sessionData) {
      return null;
    }
    
    // 检查会话是否过期
    if (sessionData.expiresAt && new Date(sessionData.expiresAt) < new Date()) {
      await env.FIREMAIL_KV.delete(sessionKey);
      return null;
    }
    
    return sessionData.user;
  } catch (error) {
    console.error('认证错误:', error);
    return null;
  }
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