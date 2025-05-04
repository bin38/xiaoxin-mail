import { defineStore } from 'pinia';
import api from '@/services/api';
import websocket from '@/services/websocket';

export const useEmailsStore = defineStore('emails', {
  state: () => ({
    emails: [],
    loading: false,
    error: null,
    selectedEmails: [],
    processingEmails: {},
    currentMailRecords: [],
    currentEmailId: null,
    isConnected: false
  }),
  
  getters: {
    getEmailById: (state) => (id) => {
      return state.emails.find(email => email.id === id);
    },
    
    getProcessingStatus: (state) => (id) => {
      return state.processingEmails[id] || null;
    },
    
    hasSelectedEmails: (state) => {
      return Array.isArray(state.selectedEmails) && state.selectedEmails.length > 0;
    },
    
    selectedEmailsCount: (state) => {
      return Array.isArray(state.selectedEmails) ? state.selectedEmails.length : 0;
    },
    
    isAllSelected: (state) => {
      return state.emails.length > 0 && Array.isArray(state.selectedEmails) && 
        state.selectedEmails.length === state.emails.length;
    }
  },
  
  actions: {
    // 初始化WebSocket事件监听
    initWebSocketListeners() {
      // 连接状态
      websocket.onConnect(() => {
        this.isConnected = true;
        this.fetchEmails();
      });
      
      websocket.onDisconnect(() => {
        this.isConnected = false;
      });
      
      // 邮箱列表更新
      websocket.onMessage('emails_list', (data) => {
        console.log('接收到邮箱列表：', data);
        if (data && Array.isArray(data.data)) {
          this.emails = data.data || [];
        }
      });
      
      // 新增邮箱
      websocket.onMessage('email_added', (data) => {
        console.log('邮箱添加成功：', data);
        this.fetchEmails();
      });
      
      // 删除邮箱
      websocket.onMessage('emails_deleted', (data) => {
        if (data.email_ids) {
          this.emails = this.emails.filter(email => !data.email_ids.includes(email.id));
          // 更新已选邮箱
          this.selectedEmails = this.selectedEmails.filter(id => !data.email_ids.includes(id));
        }
      });
      
      // 邮箱导入
      websocket.onMessage('emails_imported', () => {
        this.fetchEmails();
      });
      
      // 处理进度更新
      websocket.onMessage('check_progress', (data) => {
        const { email_id, progress, message } = data;
        this.processingEmails[email_id] = { progress, message };
        
        // 进度完成后刷新邮箱列表
        if (progress === 100) {
          // 延迟刷新，确保服务器已完成处理
          setTimeout(() => {
            this.fetchEmails();
            // 如果正在查看此邮箱的邮件，也刷新邮件列表
            if (this.currentEmailId === email_id) {
              this.fetchMailRecords(email_id);
            }
          }, 1000);
        }
      });
      
      // 邮件记录
      websocket.onMessage('mail_records', (data) => {
        if (data.email_id === this.currentEmailId) {
          // 添加数据验证和清理
          if (Array.isArray(data.data)) {
            // 确保每条记录都有必要的字段
            this.currentMailRecords = data.data.map(record => ({
              id: record.id || Date.now() + Math.random().toString(36).substring(2, 10),
              subject: record.subject || '(无主题)',
              sender: record.sender || '(未知发件人)',
              received_time: record.received_time || new Date().toISOString(),
              content: record.content || '(无内容)',
              folder: record.folder || 'INBOX'
            }));
          } else {
            this.currentMailRecords = [];
            console.error('收到的邮件记录数据不是数组格式:', data);
          }
        }
      });
      
      // 错误处理
      websocket.onMessage('error', (data) => {
        this.error = data.message;
        console.error('WebSocket 错误：', data.message);
      });
    },
    
    // 添加邮箱
    async addEmail(emailData) {
      this.loading = true;
      this.error = null;
      
      try {
        console.log('添加邮箱：', {...emailData, password: '******'});
        if (!websocket.isConnected) {
          await api.emails.add(emailData);
        } else {
          // 确保mail_type参数正确传递
          const wsData = {
            ...emailData,
            mail_type: emailData.mail_type || 'imap' // 默认使用imap类型
          };
          websocket.send('add_email', wsData);
        }
      } catch (error) {
        this.error = '添加邮箱失败';
        throw error;
      } finally {
        this.loading = false;
      }
    },
    
    // 导入邮箱
    async importEmails(importData) {
      this.loading = true;
      this.error = null;
      
      try {
        console.log('导入邮箱：', importData);
        if (!websocket.isConnected) {
          await api.emails.import(importData);
        } else {
          websocket.send('import_emails', importData);
        }
      } catch (error) {
        this.error = '导入邮箱失败';
        throw error;
      } finally {
        this.loading = false;
      }
    },
    
    // 获取所有邮箱
    async fetchEmails() {
      this.loading = true;
      this.error = null;
      
      try {
        console.log('获取邮箱列表，WebSocket状态：', websocket.isConnected);
        if (!websocket.isConnected) {
          const response = await api.emails.getAll();
          this.emails = response;
        } else {
          websocket.send('get_all_emails');
        }
      } catch (error) {
        this.error = '获取邮箱列表失败';
        console.error(error);
      } finally {
        this.loading = false;
      }
    },
    
    // 删除单个邮箱
    async deleteEmail(emailId) {
      this.loading = true;
      this.error = null;
      
      try {
        if (!websocket.isConnected) {
          await api.emails.delete([emailId]);
        } else {
          websocket.send('delete_emails', { email_ids: [emailId] });
        }
        
        // 更新本地状态
        this.emails = this.emails.filter(email => email.id !== emailId);
        if (Array.isArray(this.selectedEmails)) {
          this.selectedEmails = this.selectedEmails.filter(id => id !== emailId);
        }
      } catch (error) {
        this.error = '删除邮箱失败';
        throw error;
      } finally {
        this.loading = false;
      }
    },
    
    // 批量删除邮箱
    async deleteEmails(emailIds) {
      if (!Array.isArray(emailIds) || emailIds.length === 0) {
        return;
      }
      
      this.loading = true;
      this.error = null;
      
      try {
        if (!websocket.isConnected) {
          await api.emails.delete(emailIds);
        } else {
          websocket.send('delete_emails', { email_ids: emailIds });
        }
        
        // 更新本地状态
        this.emails = this.emails.filter(email => !emailIds.includes(email.id));
        if (Array.isArray(this.selectedEmails)) {
          this.selectedEmails = this.selectedEmails.filter(id => !emailIds.includes(id));
        }
      } catch (error) {
        this.error = '删除邮箱失败';
        throw error;
      } finally {
        this.loading = false;
      }
    },
    
    // 检查单个邮箱
    async checkEmail(emailId) {
      try {
        const response = await fetch(`/api/emails/${emailId}/check`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (response.status === 409) {
          // 邮箱正在处理中，这是正常状态，不抛出错误
          const data = await response.json();
          console.log('邮箱正在处理中:', data);
          return { success: false, message: data.message, status: 'processing' };
        }
        
        if (!response.ok) {
          throw new Error(`请求失败: ${response.status}`);
        }
        
        return true;
      } catch (error) {
        console.error('检查邮箱失败:', error);
        throw error;
      }
    },
    
    // 批量检查邮箱
    async checkEmails(emailIds) {
      if (!Array.isArray(emailIds) || emailIds.length === 0) {
        return;
      }
      
      this.loading = true;
      this.error = null;
      
      try {
        if (!websocket.isConnected) {
          await api.emails.check(emailIds);
        } else {
          websocket.send('check_emails', { email_ids: emailIds });
        }
      } catch (error) {
        this.error = '检查邮箱失败';
        throw error;
      } finally {
        this.loading = false;
      }
    },
    
    // 获取邮件记录
    async fetchMailRecords(emailId) {
      this.loading = true;
      this.error = null;
      
      try {
        if (!websocket.isConnected) {
          const response = await api.emails.getRecords(emailId);
          
          // 确保返回数据是数组且每条记录格式正确
          if (Array.isArray(response)) {
            this.currentMailRecords = response.map(record => ({
              id: record.id || Date.now() + Math.random().toString(36).substring(2, 10),
              subject: record.subject || '(无主题)',
              sender: record.sender || '(未知发件人)',
              received_time: record.received_time || new Date().toISOString(),
              content: record.content || '(无内容)',
              folder: record.folder || 'INBOX'
            }));
          } else {
            this.currentMailRecords = [];
            console.error('API返回的邮件记录数据不是数组格式:', response);
          }
          
          this.currentEmailId = emailId;
        } else {
          this.currentEmailId = emailId;
          websocket.send('get_mail_records', { email_id: emailId });
        }
      } catch (error) {
        this.error = '获取邮件记录失败';
        console.error(error);
      } finally {
        this.loading = false;
      }
    },
    
    // 获取邮箱密码
    async getEmailPassword(emailId) {
      try {
        return await api.emails.getPassword(emailId);
      } catch (error) {
        this.error = '获取邮箱密码失败';
        throw error;
      }
    },
    
    // 选择/取消选择邮箱
    toggleSelectEmail(emailId) {
      if (!Array.isArray(this.selectedEmails)) {
        this.selectedEmails = [];
      }
      
      const index = this.selectedEmails.indexOf(emailId);
      if (index === -1) {
        this.selectedEmails.push(emailId);
      } else {
        this.selectedEmails.splice(index, 1);
      }
    },
    
    // 选择所有邮箱
    selectAllEmails() {
      if (!Array.isArray(this.emails)) {
        this.selectedEmails = [];
        return;
      }
      this.selectedEmails = this.emails.map(email => email.id);
    },
    
    // 重置状态
    resetState() {
      this.emails = [];
      this.loading = false;
      this.error = null;
      this.selectedEmails = [];
      this.processingEmails = {};
      this.currentMailRecords = [];
      this.currentEmailId = null;
      this.isConnected = false;
    },
    
    // 更新邮箱
    async updateEmail(email) {
      try {
        // 确保IMAP类型邮箱的use_ssl是布尔值
        const emailData = { ...email }
        if (emailData.mail_type === 'imap' && 'use_ssl' in emailData) {
          emailData.use_ssl = Boolean(emailData.use_ssl)
        }
        
        const response = await fetch(`/api/emails/${emailData.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify(emailData)
        });
        
        if (!response.ok) {
          throw new Error(`更新邮箱失败: ${response.status}`);
        }
        
        // 更新本地邮箱数据
        const index = this.emails.findIndex(e => e.id === emailData.id);
        if (index !== -1) {
          this.emails[index] = { ...this.emails[index], ...emailData };
        }
        
        return true;
      } catch (error) {
        console.error('更新邮箱失败:', error);
        throw error;
      }
    }
  }
}); 