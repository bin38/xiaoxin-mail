// 花火邮箱助手 - 前端环境配置
// 这个文件会在部署时被修改为正确的配置

// API基础路径
window.API_URL = '/api';  

// WebSocket路径（使用长轮询替代）
window.WS_URL = '/api/realtime';  

// 存储服务配置
window.STORAGE_CONFIG = {
  // 是否启用R2对象存储
  useR2: true,
  // 附件最大大小限制 (10MB)
  maxAttachmentSize: 10 * 1024 * 1024
};

// 版本信息
window.APP_VERSION = '1.0.0';

// 运行环境
window.ENVIRONMENT = 'production';

console.log('环境配置已加载:');
console.log('- API路径:', window.API_URL);
console.log('- 实时更新:', window.WS_URL);
console.log('- 版本:', window.APP_VERSION);
console.log('- 环境:', window.ENVIRONMENT); 