/**
 * 花火邮箱助手 - 存储模块
 * 处理存储统计、备份恢复和R2对象管理
 */

/**
 * 处理存储相关请求
 * @param {Request} request 客户端请求
 * @param {Object} env 环境变量和绑定
 * @param {Object} ctx 执行上下文
 */
export async function handleStorageRequests(request, env, ctx) {
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

  // 需要管理员权限的端点
  const adminEndpoints = [
    '/api/storage/stats/all',
    '/api/storage/backup/system',
    '/api/storage/restore'
  ];

  // 检查是否为管理员路径，如果是则验证管理员权限
  const url = new URL(request.url);
  const path = url.pathname;

  if (adminEndpoints.includes(path) && !await isAdmin(user, env)) {
    return new Response(JSON.stringify({ error: '需要管理员权限' }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }

  // 存储使用统计
  if (path === '/api/storage/stats' && request.method === 'GET') {
    return await getUserStorageStats(request, env, user);
  }

  // 所有用户的存储统计（管理员）
  if (path === '/api/storage/stats/all' && request.method === 'GET') {
    return await getAllUsersStorageStats(request, env, user);
  }

  // 创建用户备份
  if (path === '/api/storage/backup' && request.method === 'POST') {
    return await createUserBackup(request, env, user);
  }

  // 获取用户备份列表
  if (path === '/api/storage/backups' && request.method === 'GET') {
    return await getUserBackups(request, env, user);
  }

  // 创建系统备份（管理员）
  if (path === '/api/storage/backup/system' && request.method === 'POST') {
    return await createSystemBackup(request, env, user);
  }

  // 恢复备份（管理员）
  if (path === '/api/storage/restore' && request.method === 'POST') {
    return await restoreBackup(request, env, user);
  }

  // 下载附件
  if (path.match(/^\/api\/storage\/attachments\/[^\/]+$/) && request.method === 'GET') {
    const attachmentId = path.split('/').pop();
    return await downloadAttachment(request, env, user, attachmentId);
  }

  // 不支持的路径
  return new Response('存储API路径不存在', {
    status: 404,
    headers: corsHeaders()
  });
}

/**
 * 获取用户存储使用统计
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @param {Object} user 用户对象
 */
async function getUserStorageStats(request, env, user) {
  try {
    // 获取邮件数量
    const emailsCountStmt = env.FIREMAIL_DB.prepare(`
      SELECT COUNT(*) as count
      FROM mail_records
      WHERE user_id = ?
    `);
    
    const { count: emailsCount } = await emailsCountStmt.bind(user.id).first();

    // 获取附件数量和总大小
    const attachmentsStmt = env.FIREMAIL_DB.prepare(`
      SELECT COUNT(*) as count, SUM(size) as total_size
      FROM mail_attachments ma
      JOIN mail_records mr ON ma.mail_id = mr.id
      WHERE mr.user_id = ?
    `);
    
    const attachmentStats = await attachmentsStmt.bind(user.id).first();
    const attachmentsCount = attachmentStats.count || 0;
    const attachmentsSize = attachmentStats.total_size || 0;

    // 获取标签数量
    const labelsCountStmt = env.FIREMAIL_DB.prepare(`
      SELECT COUNT(DISTINCT label) as count
      FROM mail_labels ml
      JOIN mail_records mr ON ml.mail_id = mr.id
      WHERE mr.user_id = ?
    `);
    
    const { count: labelsCount } = await labelsCountStmt.bind(user.id).first();

    // 预估R2总使用量（粗略估计）
    // 实际业务中可能需要更准确的计算
    const r2Usage = attachmentsSize + (emailsCount * 5000); // 假设每封邮件内容约5KB
    
    const stats = {
      emails: {
        count: emailsCount
      },
      attachments: {
        count: attachmentsCount,
        size: attachmentsSize
      },
      labels: {
        count: labelsCount
      },
      storage: {
        used: r2Usage,
        limit: 10 * 1024 * 1024 * 1024, // 假设限制为10GB
        usedFormatted: formatBytes(r2Usage),
        limitFormatted: "10 GB"
      },
      updated: new Date().toISOString()
    };

    return new Response(JSON.stringify(stats), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  } catch (error) {
    console.error('获取用户存储统计错误:', error);
    return new Response(JSON.stringify({ error: '获取用户存储统计失败，请稍后再试' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
}

/**
 * 获取所有用户的存储使用统计
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @param {Object} user 管理员用户对象
 */
async function getAllUsersStorageStats(request, env, user) {
  try {
    // 获取所有用户
    const usersStmt = env.FIREMAIL_DB.prepare(`
      SELECT id, username, email, created_at, last_login
      FROM users
    `);
    
    const { results: users } = await usersStmt.all();

    // 获取每个用户的邮件数量
    const emailsCountStmt = env.FIREMAIL_DB.prepare(`
      SELECT user_id, COUNT(*) as count
      FROM mail_records
      GROUP BY user_id
    `);
    
    const { results: emailCounts } = await emailsCountStmt.all();
    const emailCountMap = emailCounts.reduce((map, item) => {
      map[item.user_id] = item.count;
      return map;
    }, {});

    // 获取每个用户的附件使用量
    const attachmentsStmt = env.FIREMAIL_DB.prepare(`
      SELECT mr.user_id, COUNT(ma.id) as count, SUM(ma.size) as total_size
      FROM mail_attachments ma
      JOIN mail_records mr ON ma.mail_id = mr.id
      GROUP BY mr.user_id
    `);
    
    const { results: attachmentStats } = await attachmentsStmt.all();
    const attachmentStatsMap = attachmentStats.reduce((map, item) => {
      map[item.user_id] = {
        count: item.count,
        size: item.total_size || 0
      };
      return map;
    }, {});

    // 组装用户存储统计
    const userStats = users.map(user => {
      const emailCount = emailCountMap[user.id] || 0;
      const attachments = attachmentStatsMap[user.id] || { count: 0, size: 0 };
      const storageUsed = attachments.size + (emailCount * 5000); // 假设每封邮件内容约5KB
      
      return {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at,
        last_login: user.last_login,
        stats: {
          emails: emailCount,
          attachments: attachments.count,
          storage_used: storageUsed,
          storage_used_formatted: formatBytes(storageUsed)
        }
      };
    });

    // 计算系统总统计
    const totalEmails = userStats.reduce((sum, user) => sum + user.stats.emails, 0);
    const totalAttachments = userStats.reduce((sum, user) => sum + user.stats.attachments, 0);
    const totalStorage = userStats.reduce((sum, user) => sum + user.stats.storage_used, 0);

    return new Response(JSON.stringify({
      users: userStats,
      system: {
        users_count: users.length,
        total_emails: totalEmails,
        total_attachments: totalAttachments,
        total_storage: totalStorage,
        total_storage_formatted: formatBytes(totalStorage),
        updated: new Date().toISOString()
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  } catch (error) {
    console.error('获取所有用户存储统计错误:', error);
    return new Response(JSON.stringify({ error: '获取所有用户存储统计失败，请稍后再试' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
}

/**
 * 创建用户数据备份
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @param {Object} user 用户对象
 */
async function createUserBackup(request, env, user) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '_');
    const backupId = `backup_${user.id}_${timestamp}`;
    
    // 获取用户邮件数据
    const { results: emails } = await env.FIREMAIL_DB.prepare(`
      SELECT id, email_id, subject, sender, recipient, received_time, content_ref, 
             folder, is_read, is_starred, has_attachment, created_at
      FROM mail_records
      WHERE user_id = ?
    `).bind(user.id).all();
    
    // 获取邮件标签
    const { results: labels } = await env.FIREMAIL_DB.prepare(`
      SELECT ml.mail_id, ml.label
      FROM mail_labels ml
      JOIN mail_records mr ON ml.mail_id = mr.id
      WHERE mr.user_id = ?
    `).bind(user.id).all();
    
    // 将标签整理成以邮件ID为键的映射
    const labelMap = {};
    for (const label of labels) {
      if (!labelMap[label.mail_id]) {
        labelMap[label.mail_id] = [];
      }
      labelMap[label.mail_id].push(label.label);
    }
    
    // 获取邮件附件元数据
    const { results: attachments } = await env.FIREMAIL_DB.prepare(`
      SELECT ma.mail_id, ma.filename, ma.content_type, ma.size, ma.storage_path
      FROM mail_attachments ma
      JOIN mail_records mr ON ma.mail_id = mr.id
      WHERE mr.user_id = ?
    `).bind(user.id).all();
    
    // 将附件整理成以邮件ID为键的映射
    const attachmentMap = {};
    for (const attachment of attachments) {
      if (!attachmentMap[attachment.mail_id]) {
        attachmentMap[attachment.mail_id] = [];
      }
      attachmentMap[attachment.mail_id].push({
        filename: attachment.filename,
        content_type: attachment.content_type,
        size: attachment.size,
        storage_path: attachment.storage_path
      });
    }
    
    // 构建备份数据
    const backupData = {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name
      },
      emails: emails.map(email => ({
        ...email,
        labels: labelMap[email.id] || [],
        attachments: attachmentMap[email.id] || []
      })),
      created_at: new Date().toISOString(),
      version: '1.0.0'
    };
    
    // 存储备份到R2
    const backupPath = `backups/users/${user.id}/${backupId}.json`;
    await env.FIREMAIL_BUCKET.put(backupPath, JSON.stringify(backupData), {
      contentType: 'application/json'
    });
    
    // 记录备份信息到KV
    const userBackupsKey = `backups:user:${user.id}`;
    let userBackups = await env.FIREMAIL_KV.get(userBackupsKey, { type: 'json' }) || { backups: [] };
    
    userBackups.backups.push({
      id: backupId,
      path: backupPath,
      created_at: backupData.created_at,
      emails_count: emails.length,
      size: JSON.stringify(backupData).length
    });
    
    // 仅保留最近10个备份
    if (userBackups.backups.length > 10) {
      const oldestBackup = userBackups.backups.shift();
      // 删除最旧的备份文件
      await env.FIREMAIL_BUCKET.delete(oldestBackup.path);
    }
    
    await env.FIREMAIL_KV.put(userBackupsKey, JSON.stringify(userBackups));
    
    return new Response(JSON.stringify({
      success: true,
      backup_id: backupId,
      created_at: backupData.created_at,
      emails_count: emails.length,
      size_formatted: formatBytes(JSON.stringify(backupData).length)
    }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  } catch (error) {
    console.error('创建用户备份错误:', error);
    return new Response(JSON.stringify({ error: '创建用户备份失败，请稍后再试' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
}

/**
 * 获取用户备份列表
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @param {Object} user 用户对象
 */
async function getUserBackups(request, env, user) {
  try {
    const userBackupsKey = `backups:user:${user.id}`;
    let userBackups = await env.FIREMAIL_KV.get(userBackupsKey, { type: 'json' }) || { backups: [] };
    
    // 按创建时间降序排序
    userBackups.backups.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    return new Response(JSON.stringify({
      backups: userBackups.backups.map(backup => ({
        ...backup,
        size_formatted: formatBytes(backup.size)
      }))
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  } catch (error) {
    console.error('获取用户备份列表错误:', error);
    return new Response(JSON.stringify({ error: '获取用户备份列表失败，请稍后再试' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
}

/**
 * 创建系统备份
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @param {Object} user 管理员用户对象
 */
async function createSystemBackup(request, env, user) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '_');
    const backupId = `system_backup_${timestamp}`;
    
    // 获取所有用户
    const { results: users } = await env.FIREMAIL_DB.prepare(`
      SELECT id, username, email, display_name, avatar, created_at, last_login, status
      FROM users
    `).all();
    
    // 获取系统配置
    const { results: systemConfigs } = await env.FIREMAIL_DB.prepare(`
      SELECT config_key, config_value, updated_at
      FROM system_configs
    `).all();
    
    // 构建系统备份数据
    const backupData = {
      users,
      system_configs: systemConfigs,
      created_at: new Date().toISOString(),
      version: '1.0.0'
    };
    
    // 存储备份到R2
    const backupPath = `backups/system/${backupId}.json`;
    await env.FIREMAIL_BUCKET.put(backupPath, JSON.stringify(backupData), {
      contentType: 'application/json'
    });
    
    // 记录备份信息到KV
    const systemBackupsKey = 'backups:system';
    let systemBackups = await env.FIREMAIL_KV.get(systemBackupsKey, { type: 'json' }) || { backups: [] };
    
    systemBackups.backups.push({
      id: backupId,
      path: backupPath,
      created_at: backupData.created_at,
      users_count: users.length,
      size: JSON.stringify(backupData).length
    });
    
    // 仅保留最近10个备份
    if (systemBackups.backups.length > 10) {
      const oldestBackup = systemBackups.backups.shift();
      // 删除最旧的备份文件
      await env.FIREMAIL_BUCKET.delete(oldestBackup.path);
    }
    
    await env.FIREMAIL_KV.put(systemBackupsKey, JSON.stringify(systemBackups));
    
    return new Response(JSON.stringify({
      success: true,
      backup_id: backupId,
      created_at: backupData.created_at,
      users_count: users.length,
      size_formatted: formatBytes(JSON.stringify(backupData).length)
    }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  } catch (error) {
    console.error('创建系统备份错误:', error);
    return new Response(JSON.stringify({ error: '创建系统备份失败，请稍后再试' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
}

/**
 * 恢复备份
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @param {Object} user 管理员用户对象
 */
async function restoreBackup(request, env, user) {
  try {
    const { backup_path, type } = await request.json();
    
    if (!backup_path) {
      return new Response(JSON.stringify({ error: '必须提供备份路径' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 获取备份文件
    const backupObject = await env.FIREMAIL_BUCKET.get(backup_path);
    
    if (!backupObject) {
      return new Response(JSON.stringify({ error: '备份不存在' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    const backupData = await backupObject.json();
    
    // 根据备份类型执行不同的恢复逻辑
    if (type === 'system') {
      // 恢复系统配置
      for (const config of backupData.system_configs) {
        await env.FIREMAIL_DB.prepare(`
          INSERT OR REPLACE INTO system_configs (config_key, config_value, updated_at)
          VALUES (?, ?, ?)
        `).bind(config.config_key, config.config_value, new Date().toISOString()).run();
      }
      
      return new Response(JSON.stringify({
        success: true,
        message: '系统配置已恢复',
        configs_count: backupData.system_configs.length
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    } else if (type === 'user') {
      // 用户数据恢复比较复杂，需要仔细处理
      const userId = backupData.user.id;
      
      // 检查用户是否存在
      const userExists = await env.FIREMAIL_DB.prepare(`
        SELECT id FROM users WHERE id = ?
      `).bind(userId).first();
      
      if (!userExists) {
        return new Response(JSON.stringify({ error: '用户不存在，无法恢复数据' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders()
          }
        });
      }
      
      // 删除现有的用户邮件数据
      await env.FIREMAIL_DB.prepare(`
        DELETE FROM mail_labels
        WHERE mail_id IN (
          SELECT id FROM mail_records WHERE user_id = ?
        )
      `).bind(userId).run();
      
      await env.FIREMAIL_DB.prepare(`
        DELETE FROM mail_attachments
        WHERE mail_id IN (
          SELECT id FROM mail_records WHERE user_id = ?
        )
      `).bind(userId).run();
      
      await env.FIREMAIL_DB.prepare(`
        DELETE FROM mail_records WHERE user_id = ?
      `).bind(userId).run();
      
      // 恢复邮件记录
      for (const email of backupData.emails) {
        // 插入邮件记录
        const result = await env.FIREMAIL_DB.prepare(`
          INSERT INTO mail_records (
            email_id, user_id, subject, sender, recipient, received_time,
            content_ref, has_attachment, folder, is_read, is_starred, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          email.email_id,
          userId,
          email.subject,
          email.sender,
          email.recipient,
          email.received_time,
          email.content_ref,
          email.has_attachment,
          email.folder,
          email.is_read,
          email.is_starred,
          email.created_at
        ).run();
        
        const mailId = result.meta.last_row_id;
        
        // 恢复标签
        for (const label of email.labels) {
          await env.FIREMAIL_DB.prepare(`
            INSERT INTO mail_labels (mail_id, label, created_at)
            VALUES (?, ?, ?)
          `).bind(mailId, label, new Date().toISOString()).run();
        }
        
        // 恢复附件记录
        for (const attachment of email.attachments) {
          await env.FIREMAIL_DB.prepare(`
            INSERT INTO mail_attachments (
              mail_id, filename, content_type, size, storage_path, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(
            mailId,
            attachment.filename,
            attachment.content_type,
            attachment.size,
            attachment.storage_path,
            new Date().toISOString()
          ).run();
        }
      }
      
      return new Response(JSON.stringify({
        success: true,
        message: '用户数据已恢复',
        emails_count: backupData.emails.length,
        user_id: userId
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    } else {
      return new Response(JSON.stringify({ error: '不支持的备份类型' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
  } catch (error) {
    console.error('恢复备份错误:', error);
    return new Response(JSON.stringify({ error: '恢复备份失败，请稍后再试' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
}

/**
 * 下载附件
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @param {Object} user 用户对象
 * @param {string} attachmentId 附件ID
 */
async function downloadAttachment(request, env, user, attachmentId) {
  try {
    // 获取附件信息
    const attachment = await env.FIREMAIL_DB.prepare(`
      SELECT ma.filename, ma.content_type, ma.size, ma.storage_path, mr.user_id
      FROM mail_attachments ma
      JOIN mail_records mr ON ma.mail_id = mr.id
      WHERE ma.id = ?
    `).bind(attachmentId).first();
    
    if (!attachment) {
      return new Response(JSON.stringify({ error: '附件不存在' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 验证用户权限
    if (attachment.user_id !== user.id && !await isAdmin(user, env)) {
      return new Response(JSON.stringify({ error: '无权访问此附件' }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 从R2获取附件内容
    const attachmentObject = await env.FIREMAIL_BUCKET.get(attachment.storage_path);
    
    if (!attachmentObject) {
      return new Response(JSON.stringify({ error: '附件存储对象不存在' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // 设置响应头
    const headers = {
      'Content-Type': attachment.content_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(attachment.filename)}"`,
      'Content-Length': attachment.size.toString()
    };
    
    // 返回附件内容
    return new Response(attachmentObject.body, {
      headers: {
        ...headers,
        ...corsHeaders()
      }
    });
  } catch (error) {
    console.error('下载附件错误:', error);
    return new Response(JSON.stringify({ error: '下载附件失败，请稍后再试' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
}

/**
 * 检查用户是否为管理员
 * @param {Object} user 用户对象
 * @param {Object} env 环境变量
 */
async function isAdmin(user, env) {
  try {
    // 从系统配置中获取管理员列表
    const adminConfig = await env.FIREMAIL_DB.prepare(`
      SELECT config_value
      FROM system_configs
      WHERE config_key = 'admin_users'
    `).first();
    
    if (adminConfig && adminConfig.config_value) {
      const adminUsers = JSON.parse(adminConfig.config_value);
      return adminUsers.includes(user.id) || adminUsers.includes(user.username);
    }
    
    // 默认情况下，ID为1的用户是管理员
    return user.id === 1;
  } catch (error) {
    console.error('检查管理员权限错误:', error);
    return false;
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
 * 格式化字节大小
 * @param {number} bytes 字节数
 * @param {number} decimals 小数位数
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
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