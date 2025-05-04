<template>
  <div class="email-detail-container">
    <div class="header-section">
      <el-page-header @back="goBack" :title="'返回邮箱列表'">
        <template #content>
          <span class="email-title">{{ email ? email.email : '加载中...' }}</span>
        </template>
      </el-page-header>
      
      <div class="actions" v-if="email">
        <el-button type="primary" @click="checkEmail" :disabled="isProcessing" :loading="loading">
          <el-icon><Download /></el-icon> 收取邮件
        </el-button>
        <el-button type="danger" @click="confirmDelete" :disabled="isProcessing">
          <el-icon><Delete /></el-icon> 删除邮箱
        </el-button>
      </div>
    </div>
    
    <div class="email-info" v-if="email">
      <el-descriptions title="邮箱信息" :column="1" border>
        <el-descriptions-item label="邮箱地址">{{ email.email }}</el-descriptions-item>
        <el-descriptions-item label="最后检查时间">{{ formatDate(email.last_check_time) }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDate(email.created_at) }}</el-descriptions-item>
      </el-descriptions>
    </div>
    
    <div class="mail-records" v-loading="loading">
      <el-card class="mail-card">
        <template #header>
          <div class="mail-header">
            <span>邮件列表</span>
            <el-input
              v-model="searchQuery"
              placeholder="搜索邮件主题或内容"
              clearable
              class="search-input"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
          </div>
        </template>
        
        <div v-if="filteredMailRecords.length === 0" class="no-mails">
          <el-empty description="暂无邮件记录" />
        </div>
        
        <div v-else>
          <el-collapse accordion>
            <el-collapse-item v-for="mail in filteredMailRecords" :key="mail.id" :name="mail.id">
              <template #title>
                <div class="mail-title">
                  <span class="subject">{{ mail.subject || '(无主题)' }}</span>
                  <span class="date">{{ formatDate(mail.received_time) }}</span>
                </div>
              </template>
              
              <div class="mail-content">
                <div class="mail-info">
                  <p><strong>发件人:</strong> {{ mail.sender }}</p>
                  <p><strong>时间:</strong> {{ formatDate(mail.received_time) }}</p>
                </div>
                <div class="mail-body">
                  <p>{{ mail.content }}</p>
                </div>
              </div>
            </el-collapse-item>
          </el-collapse>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import { Download, Delete, Search } from '@element-plus/icons-vue'
import { useEmailsStore } from '@/store/emails'
import dayjs from 'dayjs'

const route = useRoute()
const router = useRouter()
const emailsStore = useEmailsStore()
const searchQuery = ref('')

// 邮箱ID
const emailId = computed(() => parseInt(route.params.id))

// 邮箱信息
const email = computed(() => emailsStore.getEmailById(emailId.value))

// 处理状态
const loading = computed(() => emailsStore.loading)
const isProcessing = computed(() => {
  const status = getProcessingStatus(emailId.value)
  return status && status.progress > 0 && status.progress < 100
})

// 邮件记录
const mailRecords = computed(() => emailsStore.currentMailRecords)

// 过滤的邮件记录
const filteredMailRecords = computed(() => {
  if (!searchQuery.value) return mailRecords.value
  
  const query = searchQuery.value.toLowerCase()
  return mailRecords.value.filter(mail => {
    return (mail.subject && mail.subject.toLowerCase().includes(query)) || 
           (mail.content && mail.content.toLowerCase().includes(query))
  })
})

// 获取处理状态
const getProcessingStatus = (id) => {
  return emailsStore.getProcessingStatus(id)
}

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return '无'
  return dayjs(dateString).format('YYYY-MM-DD HH:mm:ss')
}

// 返回
const goBack = () => {
  router.push('/emails')
}

// 收取邮件
const checkEmail = () => {
  emailsStore.checkEmail(emailId.value)
  ElMessage.success('开始收取邮件')
}

// 确认删除邮箱
const confirmDelete = () => {
  if (!email.value) return
  
  ElMessageBox.confirm(
    `确定要删除邮箱 ${email.value.email} 吗？所有相关的邮件记录也将被删除。`,
    '删除确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    emailsStore.deleteEmail(emailId.value)
    ElMessage.success('删除成功')
    router.push('/emails')
  }).catch(() => {
    // 取消删除
  })
}

// 监听邮箱ID变化，获取邮件记录
watch(emailId, (newId) => {
  if (newId) {
    emailsStore.fetchMailRecords(newId)
  }
})

// 组件挂载时获取邮件记录
onMounted(() => {
  if (emailId.value) {
    emailsStore.fetchMailRecords(emailId.value)
  }
})
</script>

<style scoped>
.email-detail-container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 20px;
}

.header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.email-title {
  font-size: 18px;
  font-weight: bold;
  color: #409eff;
}

.status-section {
  margin-bottom: 20px;
}

.progress-bar {
  margin-top: 10px;
}

.email-info {
  margin-bottom: 20px;
}

.mail-card {
  margin-bottom: 20px;
}

.mail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.search-input {
  max-width: 300px;
}

.no-mails {
  padding: 40px 0;
}

.mail-title {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding-right: 20px;
}

.subject {
  font-weight: bold;
  margin-right: 10px;
}

.date {
  color: #909399;
  font-size: 0.9em;
}

.mail-content {
  padding: 10px;
  background-color: #f8f9fa;
  border-radius: 4px;
}

.mail-info {
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid #ebeef5;
}

.mail-body {
  white-space: pre-line;
  word-break: break-word;
}

@media (max-width: 768px) {
  .header-section {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .actions {
    width: 100%;
    display: flex;
    justify-content: space-between;
  }
  
  .mail-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .search-input {
    max-width: 100%;
    width: 100%;
  }
  
  .mail-title {
    flex-direction: column;
    gap: 5px;
  }
}
</style> 