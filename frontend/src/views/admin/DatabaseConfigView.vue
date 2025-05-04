<template>
  <div class="database-config-view">
    <h1>数据库配置</h1>
    
    <div class="loading-container" v-if="loading">
      <div class="loading-spinner"></div>
      <p>加载中...</p>
    </div>
    
    <div class="database-info" v-else>
      <div class="info-card">
        <h2>当前数据库信息</h2>
        <div class="info-row">
          <span class="label">数据库类型:</span>
          <span class="value">{{ dbInfo.type === 'sqlite' ? 'SQLite' : 'MySQL' }}</span>
        </div>
        <div class="info-row">
          <span class="label">WebDAV同步:</span>
          <span class="value" :class="dbInfo.webdav_enabled ? 'enabled' : 'disabled'">
            {{ dbInfo.webdav_enabled ? '已启用' : '未启用' }}
          </span>
        </div>
        <div class="info-row">
          <span class="label">用户数量:</span>
          <span class="value">{{ dbInfo.user_count || 0 }}</span>
        </div>
        <div class="info-row">
          <span class="label">邮箱数量:</span>
          <span class="value">{{ dbInfo.email_count || 0 }}</span>
        </div>
      </div>
      
      <div class="action-card" v-if="dbInfo.type === 'sqlite'">
        <h2>数据库操作</h2>
        <div class="btn-group">
          <button class="btn primary" @click="backupDatabase" :disabled="isActionPending">
            <i class="fas fa-save"></i> 备份数据库
          </button>
        </div>
      </div>
      
      <div class="webdav-config" v-if="dbInfo.type === 'sqlite'">
        <h2>WebDAV 配置</h2>
        <div class="toggle-container">
          <label class="toggle-switch">
            <input type="checkbox" v-model="webdavForm.enabled">
            <span class="toggle-slider"></span>
          </label>
          <span>{{ webdavForm.enabled ? '启用' : '禁用' }} WebDAV 同步</span>
        </div>
        
        <div v-if="webdavForm.enabled" class="form-container">
          <div class="form-group">
            <label for="webdav-url">WebDAV 服务器地址</label>
            <input 
              id="webdav-url" 
              type="text" 
              v-model="webdavForm.url" 
              placeholder="例如：https://your-webdav-server.com/remote.php/dav/files/username/"
            >
          </div>
          
          <div class="form-group">
            <label for="webdav-username">用户名</label>
            <input 
              id="webdav-username" 
              type="text" 
              v-model="webdavForm.username" 
              placeholder="WebDAV 用户名"
            >
          </div>
          
          <div class="form-group">
            <label for="webdav-password">密码</label>
            <input 
              id="webdav-password" 
              type="password" 
              v-model="webdavForm.password" 
              placeholder="WebDAV 密码"
            >
          </div>
          
          <div class="form-group">
            <label for="webdav-path">远程路径</label>
            <input 
              id="webdav-path" 
              type="text" 
              v-model="webdavForm.rootPath" 
              placeholder="/firemail/"
            >
            <small>远程存储的路径，以斜杠开始和结束</small>
          </div>
          
          <div class="form-group">
            <label for="webdav-db-name">数据库文件名</label>
            <input 
              id="webdav-db-name" 
              type="text" 
              v-model="webdavForm.dbName" 
              placeholder="firemail.db"
            >
          </div>
          
          <div class="form-actions">
            <button class="btn primary" @click="saveWebDAVConfig" :disabled="isActionPending">
              <i class="fas fa-save"></i> 保存配置
            </button>
          </div>
          
          <div class="sync-actions">
            <h3>同步操作</h3>
            <div class="btn-group">
              <button class="btn secondary" @click="syncToWebDAV" :disabled="!webdavForm.enabled || isActionPending">
                <i class="fas fa-upload"></i> 同步到 WebDAV
              </button>
              <button class="btn secondary" @click="syncFromWebDAV" :disabled="!webdavForm.enabled || isActionPending">
                <i class="fas fa-download"></i> 从 WebDAV 同步
              </button>
            </div>
            <p class="warning-text" v-if="webdavForm.enabled">
              <i class="fas fa-exclamation-triangle"></i> 
              从 WebDAV 同步将覆盖当前数据库，请确保您已备份重要数据。
            </p>
          </div>
        </div>
      </div>
      
      <div v-if="dbInfo.type === 'mysql'" class="mysql-info">
        <h2>MySQL 数据库</h2>
        <p>当前使用 MySQL 数据库，WebDAV 同步仅适用于 SQLite 数据库。</p>
        <p>要使用 WebDAV 同步，请在 .env 文件中将 DB_TYPE 设置为 sqlite。</p>
      </div>
    </div>
    
    <!-- 操作反馈提示 -->
    <div class="message-container" v-if="message">
      <div class="message" :class="{ 'error': isError }">
        <i :class="isError ? 'fas fa-times-circle' : 'fas fa-check-circle'"></i>
        <span>{{ message }}</span>
        <button class="close-btn" @click="clearMessage">&times;</button>
      </div>
    </div>
  </div>
</template>

<script>
import api from '@/services/api';

export default {
  name: 'DatabaseConfigView',
  data() {
    return {
      loading: true,
      isActionPending: false,
      message: '',
      isError: false,
      dbInfo: {
        type: 'sqlite',
        webdav_enabled: false,
        user_count: 0,
        email_count: 0
      },
      webdavForm: {
        enabled: false,
        url: '',
        username: '',
        password: '',
        rootPath: '/firemail/',
        dbName: 'firemail.db'
      }
    }
  },
  created() {
    this.fetchDatabaseInfo();
  },
  methods: {
    async fetchDatabaseInfo() {
      this.loading = true;
      try {
        const response = await api.getDatabaseInfo();
        this.dbInfo = response.data;
        
        // 设置表单初始值
        this.webdavForm.enabled = this.dbInfo.webdav_enabled;
        
        // 如果启用了 WebDAV，需要获取 WebDAV 配置
        if (this.dbInfo.webdav_enabled) {
          try {
            // 此处假设后端有一个获取 WebDAV 配置的接口
            // 实际使用中如果没有此接口，可能需要在 .env 文件中预设这些值
            const configResponse = await api.get('/admin/database/webdav/config');
            const config = configResponse.data;
            
            this.webdavForm.url = config.url || '';
            this.webdavForm.username = config.username || '';
            this.webdavForm.password = '';  // 出于安全考虑，通常不会返回密码
            this.webdavForm.rootPath = config.root_path || '/firemail/';
            this.webdavForm.dbName = config.db_name || 'firemail.db';
          } catch (err) {
            console.error('获取 WebDAV 配置失败', err);
            // 如果获取配置失败，使用默认值
          }
        }
      } catch (error) {
        this.showMessage('获取数据库信息失败: ' + (error.response?.data?.error || error.message), true);
      } finally {
        this.loading = false;
      }
    },
    
    async backupDatabase() {
      this.isActionPending = true;
      try {
        const response = await api.backupDatabase();
        this.showMessage(response.data.message || '数据库备份成功');
      } catch (error) {
        this.showMessage('备份数据库失败: ' + (error.response?.data?.error || error.message), true);
      } finally {
        this.isActionPending = false;
      }
    },
    
    async syncToWebDAV() {
      if (!this.webdavForm.enabled) {
        this.showMessage('WebDAV 同步未启用', true);
        return;
      }
      
      this.isActionPending = true;
      try {
        const response = await api.syncToWebDAV();
        this.showMessage(response.data.message || '数据库已成功同步到 WebDAV');
      } catch (error) {
        this.showMessage('同步到 WebDAV 失败: ' + (error.response?.data?.error || error.message), true);
      } finally {
        this.isActionPending = false;
      }
    },
    
    async syncFromWebDAV() {
      if (!this.webdavForm.enabled) {
        this.showMessage('WebDAV 同步未启用', true);
        return;
      }
      
      if (!confirm('从 WebDAV 同步将覆盖当前数据库，是否继续？')) {
        return;
      }
      
      this.isActionPending = true;
      try {
        const response = await api.syncFromWebDAV();
        this.showMessage(response.data.message || '数据库已成功从 WebDAV 同步');
        // 同步成功后重新获取数据库信息
        await this.fetchDatabaseInfo();
      } catch (error) {
        this.showMessage('从 WebDAV 同步失败: ' + (error.response?.data?.error || error.message), true);
      } finally {
        this.isActionPending = false;
      }
    },
    
    async saveWebDAVConfig() {
      // 验证表单
      if (this.webdavForm.enabled) {
        if (!this.webdavForm.url) {
          this.showMessage('请输入 WebDAV 服务器地址', true);
          return;
        }
        if (!this.webdavForm.username) {
          this.showMessage('请输入 WebDAV 用户名', true);
          return;
        }
        if (!this.webdavForm.rootPath) {
          this.showMessage('请输入远程路径', true);
          return;
        }
        if (!this.webdavForm.dbName) {
          this.showMessage('请输入数据库文件名', true);
          return;
        }
      }
      
      this.isActionPending = true;
      try {
        const response = await api.saveWebDAVConfig({
          enabled: this.webdavForm.enabled,
          url: this.webdavForm.url,
          username: this.webdavForm.username,
          password: this.webdavForm.password,
          root_path: this.webdavForm.rootPath,
          db_name: this.webdavForm.dbName
        });
        
        this.showMessage(response.data.message || 'WebDAV 配置已保存');
        
        // 配置修改后重新获取数据库信息
        await this.fetchDatabaseInfo();
      } catch (error) {
        this.showMessage('保存 WebDAV 配置失败: ' + (error.response?.data?.error || error.message), true);
      } finally {
        this.isActionPending = false;
      }
    },
    
    showMessage(text, isError = false) {
      this.message = text;
      this.isError = isError;
      
      // 5秒后自动清除消息
      setTimeout(() => {
        if (this.message === text) {
          this.clearMessage();
        }
      }, 5000);
    },
    
    clearMessage() {
      this.message = '';
      this.isError = false;
    }
  }
}
</script>

<style scoped>
.database-config-view {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}

h1 {
  margin-bottom: 30px;
  padding-bottom: 10px;
  border-bottom: 1px solid #eee;
  color: #333;
}

h2 {
  margin-top: 0;
  margin-bottom: 20px;
  color: #444;
}

h3 {
  margin-top: 30px;
  margin-bottom: 15px;
  color: #555;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
}

.loading-spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 2s linear infinite;
  margin-bottom: 15px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.info-card, .action-card, .webdav-config, .mysql-info {
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  padding: 20px;
  margin-bottom: 20px;
}

.info-row {
  display: flex;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f0f0;
}

.info-row:last-child {
  border-bottom: none;
}

.info-row .label {
  flex: 0 0 150px;
  font-weight: 500;
  color: #666;
}

.info-row .value {
  flex: 1;
}

.info-row .value.enabled {
  color: #4caf50;
  font-weight: bold;
}

.info-row .value.disabled {
  color: #f44336;
}

.btn-group {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  border-radius: 4px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
  border: none;
}

.btn i {
  margin-right: 8px;
}

.btn.primary {
  background-color: #4caf50;
  color: white;
}

.btn.primary:hover {
  background-color: #43a047;
}

.btn.secondary {
  background-color: #2196f3;
  color: white;
}

.btn.secondary:hover {
  background-color: #1e88e5;
}

.btn:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.toggle-container {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 50px;
  height: 24px;
  margin-right: 10px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: .4s;
  border-radius: 24px;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 4px;
  bottom: 4px;
  background-color: white;
  transition: .4s;
  border-radius: 50%;
}

input:checked + .toggle-slider {
  background-color: #4caf50;
}

input:checked + .toggle-slider:before {
  transform: translateX(26px);
}

.form-container {
  margin-top: 20px;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
  color: #555;
}

.form-group input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.form-group small {
  display: block;
  margin-top: 5px;
  color: #777;
  font-size: 12px;
}

.form-actions {
  margin-top: 20px;
}

.sync-actions {
  margin-top: 30px;
}

.warning-text {
  color: #f44336;
  margin-top: 10px;
  font-size: 14px;
}

.warning-text i {
  margin-right: 5px;
}

.message-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
}

.message {
  background-color: #4caf50;
  color: white;
  padding: 15px 20px;
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  max-width: 400px;
}

.message.error {
  background-color: #f44336;
}

.message i {
  margin-right: 10px;
  font-size: 20px;
}

.close-btn {
  margin-left: 15px;
  background: transparent;
  border: none;
  color: white;
  font-size: 20px;
  cursor: pointer;
}
</style> 