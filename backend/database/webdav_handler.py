import os
import logging
import time
from datetime import datetime
from webdav3.client import Client
from . import config

# 配置日志
logger = logging.getLogger('webdav')

class WebDAVHandler:
    """WebDAV文件同步处理器"""
    
    def __init__(self):
        """初始化WebDAV处理器"""
        self.enabled = config.WEBDAV_ENABLED
        
        if not self.enabled:
            logger.info("WebDAV 同步未启用")
            return
            
        # 检查WebDAV配置
        if not config.WEBDAV_URL or not config.WEBDAV_USERNAME or not config.WEBDAV_PASSWORD:
            logger.error("WebDAV 配置不完整，无法启用同步")
            self.enabled = False
            return
            
        try:
            # WebDAV客户端配置
            self.webdav_options = {
                'webdav_hostname': config.WEBDAV_URL,
                'webdav_login': config.WEBDAV_USERNAME,
                'webdav_password': config.WEBDAV_PASSWORD,
                'webdav_timeout': 30
            }
            
            self.client = Client(self.webdav_options)
            self.root_path = config.WEBDAV_ROOT_PATH
            self.db_name = config.WEBDAV_DB_NAME
            self.remote_db_path = os.path.join(self.root_path, self.db_name)
            self.local_db_path = config.SQLITE_DB_PATH
            
            # 确保远程目录存在
            self._ensure_remote_directory()
            
            logger.info(f"WebDAV 同步已启用: {config.WEBDAV_URL}")
        except Exception as e:
            logger.error(f"初始化WebDAV客户端失败: {str(e)}")
            self.enabled = False
    
    def _ensure_remote_directory(self):
        """确保远程目录存在"""
        if not self.enabled:
            return
            
        try:
            if not self.client.check(self.root_path):
                logger.info(f"创建远程目录: {self.root_path}")
                self.client.mkdir(self.root_path)
        except Exception as e:
            logger.error(f"创建远程目录失败: {str(e)}")
            
    def sync_to_remote(self):
        """将本地数据库同步到WebDAV服务器"""
        if not self.enabled:
            logger.debug("WebDAV同步未启用，跳过同步到远程")
            return False
            
        try:
            logger.info(f"开始同步本地数据库到WebDAV: {self.remote_db_path}")
            # 检查本地文件是否存在
            if not os.path.exists(self.local_db_path):
                logger.error(f"本地数据库文件不存在: {self.local_db_path}")
                return False
                
            # 上传到WebDAV
            self.client.upload_sync(
                remote_path=self.remote_db_path,
                local_path=self.local_db_path
            )
            
            logger.info(f"数据库成功同步到WebDAV: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            return True
        except Exception as e:
            logger.error(f"同步数据库到WebDAV失败: {str(e)}")
            return False
            
    def sync_from_remote(self):
        """从WebDAV服务器同步数据库到本地"""
        if not self.enabled:
            logger.debug("WebDAV同步未启用，跳过从远程同步")
            return False
            
        try:
            # 检查远程文件是否存在
            if not self.client.check(self.remote_db_path):
                logger.warning(f"远程数据库文件不存在: {self.remote_db_path}")
                return False
                
            logger.info(f"开始从WebDAV同步数据库到本地: {self.local_db_path}")
            
            # 备份本地数据库(如果存在)
            if os.path.exists(self.local_db_path):
                backup_path = f"{self.local_db_path}.bak.{int(time.time())}"
                os.rename(self.local_db_path, backup_path)
                logger.info(f"已备份本地数据库: {backup_path}")
                
            # 确保目标目录存在
            os.makedirs(os.path.dirname(self.local_db_path), exist_ok=True)
                
            # 下载到本地
            self.client.download_sync(
                remote_path=self.remote_db_path,
                local_path=self.local_db_path
            )
            
            logger.info(f"数据库成功从WebDAV同步到本地: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            return True
        except Exception as e:
            logger.error(f"从WebDAV同步数据库失败: {str(e)}")
            return False
            
    def list_remote_backups(self):
        """列出WebDAV上的所有数据库备份"""
        if not self.enabled:
            return []
            
        try:
            files = self.client.list(self.root_path)
            backups = [f for f in files if f.endswith('.db') or f.endswith('.sqlite')]
            logger.info(f"找到 {len(backups)} 个远程数据库备份")
            return backups
        except Exception as e:
            logger.error(f"列出WebDAV备份失败: {str(e)}")
            return []
            
    def create_remote_backup(self):
        """在WebDAV上创建数据库备份"""
        if not self.enabled:
            return False
            
        try:
            # 生成带时间戳的备份文件名
            timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
            backup_name = f"firemail_backup_{timestamp}.db"
            backup_path = os.path.join(self.root_path, backup_name)
            
            # 先同步最新数据
            if self.sync_to_remote():
                # 在远程创建备份
                self.client.copy(self.remote_db_path, backup_path)
                logger.info(f"已创建远程数据库备份: {backup_name}")
                return True
            else:
                logger.error("无法创建远程备份，同步失败")
                return False
        except Exception as e:
            logger.error(f"创建远程备份失败: {str(e)}")
            return False 