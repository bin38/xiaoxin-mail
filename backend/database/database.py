import os
import logging
import threading
import hashlib
import secrets
import time
from datetime import datetime
from typing import List, Dict, Optional, Any
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import Session
from sqlalchemy import event, create_engine

from . import config
from .webdav_handler import WebDAVHandler

# 配置日志
logger = logging.getLogger('database')

# SQLAlchemy实例
db = SQLAlchemy()

# 用户表模型
class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(100), nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    salt = db.Column(db.String(100), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 定义关系
    emails = db.relationship('Email', backref='user', lazy=True, cascade="all, delete-orphan")
    
    def __repr__(self):
        return f'<User {self.username}>'

# 邮箱表模型
class Email(db.Model):
    __tablename__ = 'emails'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    email = db.Column(db.String(100), nullable=False)
    password = db.Column(db.String(100), nullable=False)
    mail_type = db.Column(db.String(20), default='outlook')
    server = db.Column(db.String(100))
    port = db.Column(db.Integer)
    use_ssl = db.Column(db.Boolean, default=True)
    client_id = db.Column(db.String(200))
    refresh_token = db.Column(db.Text)
    access_token = db.Column(db.Text)
    last_check_time = db.Column(db.DateTime)
    enable_realtime_check = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 定义关系
    mail_records = db.relationship('MailRecord', backref='email', lazy=True, cascade="all, delete-orphan")
    
    __table_args__ = (
        db.UniqueConstraint('user_id', 'email', name='uix_user_email'),
    )
    
    def __repr__(self):
        return f'<Email {self.email}>'

# 邮件记录表模型
class MailRecord(db.Model):
    __tablename__ = 'mail_records'
    
    id = db.Column(db.Integer, primary_key=True)
    email_id = db.Column(db.Integer, db.ForeignKey('emails.id'), nullable=False)
    subject = db.Column(db.String(255))
    sender = db.Column(db.String(255))
    received_time = db.Column(db.DateTime)
    content = db.Column(db.Text)
    folder = db.Column(db.String(50))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f'<MailRecord {self.subject}>'

# 系统配置表模型
class SystemConfig(db.Model):
    __tablename__ = 'system_config'
    
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(50), unique=True, nullable=False)
    value = db.Column(db.Text)
    description = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f'<SystemConfig {self.key}={self.value}>'

class Database:
    """数据库管理类，支持SQLite和MySQL"""
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(Database, cls).__new__(cls)
                cls._instance.db = db
                cls._instance.webdav = WebDAVHandler() if config.WEBDAV_ENABLED else None
                
                # 检查WebDAV同步
                if config.WEBDAV_ENABLED and cls._instance.webdav:
                    # 尝试从WebDAV同步数据库
                    if config.DB_TYPE == 'sqlite':
                        cls._instance.webdav.sync_from_remote()
                
                return cls._instance
            return cls._instance
    
    def init_app(self, app):
        """初始化Flask应用"""
        # 配置SQLAlchemy
        app.config['SQLALCHEMY_DATABASE_URI'] = config.SQLALCHEMY_DATABASE_URI
        app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = config.SQLALCHEMY_TRACK_MODIFICATIONS
        
        # 初始化SQLAlchemy
        self.db.init_app(app)
        
        with app.app_context():
            # 创建所有表
            self.db.create_all()
            
            # 检查是否需要初始化系统配置
            self._init_system_config()
        
        # 设置SQLite关闭连接后自动同步到WebDAV
        if config.DB_TYPE == 'sqlite' and config.WEBDAV_ENABLED and self.webdav:
            engine = self.db.get_engine(app)
            
            @event.listens_for(engine, "connect")
            def set_sqlite_pragma(dbapi_connection, connection_record):
                cursor = dbapi_connection.cursor()
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.execute("PRAGMA synchronous=NORMAL")
                cursor.close()
            
            @event.listens_for(engine, "engine_disposed")
            def sync_to_webdav(engine):
                if self.webdav:
                    self.webdav.sync_to_remote()
    
    def _init_system_config(self):
        """初始化系统配置"""
        # 检查是否存在注册配置，默认为开启
        config_item = SystemConfig.query.filter_by(key='allow_register').first()
        
        if not config_item:
            logger.info("初始化系统配置: 默认允许注册")
            config_item = SystemConfig(
                key='allow_register',
                value='true',
                description='是否允许新用户注册'
            )
            self.db.session.add(config_item)
            self.db.session.commit()
        else:
            # 确保注册功能默认开启，防止旧数据导致无法注册
            if config_item.value != 'true':
                logger.info("重置系统配置: 默认允许注册")
                config_item.value = 'true'
                self.db.session.commit()
    
    def _hash_password(self, password, salt):
        """密码哈希"""
        return hashlib.pbkdf2_hmac(
            'sha256', 
            password.encode('utf-8'), 
            salt.encode('utf-8'), 
            100000
        ).hex()
    
    def get_system_config(self, key):
        """获取系统配置"""
        try:
            config_item = SystemConfig.query.filter_by(key=key).first()
            return config_item.value if config_item else None
        except Exception as e:
            logger.error(f"获取系统配置失败: key={key}, 错误: {str(e)}")
            return None
    
    def set_system_config(self, key, value):
        """设置系统配置"""
        try:
            config_item = SystemConfig.query.filter_by(key=key).first()
            
            if config_item:
                config_item.value = value
                config_item.updated_at = datetime.utcnow()
            else:
                config_item = SystemConfig(key=key, value=value)
                self.db.session.add(config_item)
                
            self.db.session.commit()
            
            # 如果是SQLite，同步到WebDAV
            if config.DB_TYPE == 'sqlite' and config.WEBDAV_ENABLED and self.webdav:
                self.webdav.sync_to_remote()
                
            logger.info(f"系统配置已更新: {key} = {value}")
            return True
        except Exception as e:
            logger.error(f"更新系统配置失败: {key} = {value}, 错误: {str(e)}")
            return False
    
    def is_registration_allowed(self):
        """检查是否允许注册"""
        try:
            allow_register = self.get_system_config('allow_register')
            # 如果配置不存在，默认允许注册
            if allow_register is None:
                logger.info("注册配置不存在，设置为默认允许")
                success = self.set_system_config('allow_register', 'true')
                if not success:
                    logger.warning("设置默认注册配置失败，仍然默认允许注册")
                return True
            
            logger.info(f"读取到注册配置: {allow_register}")
            return allow_register.lower() == 'true'
        except Exception as e:
            # 出现异常时，确保默认允许注册
            logger.error(f"检查注册状态时出错: {str(e)}，默认允许注册")
            return True
    
    def toggle_registration(self, allow):
        """开启或关闭注册功能"""
        value = 'true' if allow else 'false'
        logger.info(f"正在{'开启' if allow else '关闭'}注册功能")
        result = self.set_system_config('allow_register', value)
        if result:
            logger.info(f"注册功能已成功切换为: {value}")
        else:
            logger.error(f"切换注册功能失败，目标状态: {value}")
        return result
    
    def authenticate_user(self, username, password):
        """验证用户凭据"""
        try:
            user = User.query.filter_by(username=username).first()
            
            if not user:
                logger.warning(f"用户不存在: {username}")
                return None
                
            # 计算哈希值并比较
            password_hash = self._hash_password(password, user.salt)
            
            if password_hash != user.password_hash:
                logger.warning(f"密码不正确: {username}")
                return None
                
            logger.info(f"用户认证成功: {username}")
            return user
        except Exception as e:
            logger.error(f"用户认证出错: {str(e)}")
            return None
    
    def get_user_by_id(self, user_id):
        """根据ID获取用户信息"""
        return User.query.get(user_id)
    
    def create_user(self, username, password, is_admin=False):
        """创建新用户"""
        try:
            # 检查是否需要将此用户设置为管理员（如果是第一个注册的用户）
            if not is_admin:
                if User.query.count() == 0:
                    is_admin = True
                    logger.info(f"第一个注册的用户 {username} 将被设置为管理员")
            
            salt = secrets.token_hex(16)
            password_hash = self._hash_password(password, salt)
            
            user = User(
                username=username,
                password=password,  # 保留明文密码以兼容旧代码
                password_hash=password_hash,
                salt=salt,
                is_admin=is_admin
            )
            
            self.db.session.add(user)
            self.db.session.commit()
            
            # 如果是SQLite，同步到WebDAV
            if config.DB_TYPE == 'sqlite' and config.WEBDAV_ENABLED and self.webdav:
                self.webdav.sync_to_remote()
                
            logger.info(f"创建用户成功: {username}, 管理员权限: {is_admin}")
            return True, is_admin
        except Exception as e:
            self.db.session.rollback()
            logger.error(f"创建用户失败: {str(e)}")
            return False, False
    
    def get_all_users(self):
        """获取所有用户"""
        try:
            return User.query.all()
        except Exception as e:
            logger.error(f"获取所有用户出错: {str(e)}")
            return []
    
    def delete_user(self, user_id):
        """删除用户"""
        try:
            user = User.query.get(user_id)
            if not user:
                logger.warning(f"删除用户失败: 用户ID {user_id} 不存在")
                return False
                
            self.db.session.delete(user)
            self.db.session.commit()
            
            # 如果是SQLite，同步到WebDAV
            if config.DB_TYPE == 'sqlite' and config.WEBDAV_ENABLED and self.webdav:
                self.webdav.sync_to_remote()
                
            logger.info(f"已删除用户: ID={user_id}, 用户名={user.username}")
            return True
        except Exception as e:
            self.db.session.rollback()
            logger.error(f"删除用户出错: {str(e)}")
            return False
    
    def reset_password(self, user_id, new_password):
        """重置用户密码"""
        try:
            user = User.query.get(user_id)
            if not user:
                logger.warning(f"重置密码失败: 用户ID {user_id} 不存在")
                return False
                
            salt = secrets.token_hex(16)
            password_hash = self._hash_password(new_password, salt)
            
            user.password = new_password  # 保留明文密码以兼容旧代码
            user.password_hash = password_hash
            user.salt = salt
            
            self.db.session.commit()
            
            # 如果是SQLite，同步到WebDAV
            if config.DB_TYPE == 'sqlite' and config.WEBDAV_ENABLED and self.webdav:
                self.webdav.sync_to_remote()
                
            logger.info(f"已重置用户密码: ID={user_id}, 用户名={user.username}")
            return True
        except Exception as e:
            self.db.session.rollback()
            logger.error(f"重置密码出错: {str(e)}")
            return False
    
    def backup_database(self):
        """备份数据库"""
        if config.DB_TYPE != 'sqlite':
            logger.warning("当前仅支持SQLite数据库的备份")
            return False
            
        try:
            # 创建备份目录
            os.makedirs(config.BACKUP_DIR, exist_ok=True)
            
            # 生成备份文件名
            timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
            backup_file = os.path.join(config.BACKUP_DIR, f"firemail_backup_{timestamp}.db")
            
            # 创建本地备份
            import shutil
            shutil.copy2(config.SQLITE_DB_PATH, backup_file)
            
            logger.info(f"数据库已备份到: {backup_file}")
            
            # 如果启用了WebDAV，也创建远程备份
            if config.WEBDAV_ENABLED and self.webdav:
                self.webdav.create_remote_backup()
                
            return True
        except Exception as e:
            logger.error(f"备份数据库失败: {str(e)}")
            return False
            
    def sync_to_webdav(self):
        """手动同步数据库到WebDAV"""
        if not config.WEBDAV_ENABLED or not self.webdav:
            logger.warning("WebDAV同步未启用")
            return False
            
        if config.DB_TYPE != 'sqlite':
            logger.warning("当前仅支持SQLite数据库的WebDAV同步")
            return False
            
        return self.webdav.sync_to_remote()
        
    def sync_from_webdav(self):
        """手动从WebDAV同步数据库"""
        if not config.WEBDAV_ENABLED or not self.webdav:
            logger.warning("WebDAV同步未启用")
            return False
            
        if config.DB_TYPE != 'sqlite':
            logger.warning("当前仅支持SQLite数据库的WebDAV同步")
            return False
            
        return self.webdav.sync_from_remote()
        
    # 邮箱相关方法
    def get_emails_by_user(self, user_id):
        """获取用户的所有邮箱"""
        try:
            return Email.query.filter_by(user_id=user_id).all()
        except Exception as e:
            logger.error(f"获取用户邮箱失败: {str(e)}")
            return []
            
    def get_all_emails(self):
        """获取所有邮箱"""
        try:
            return Email.query.all()
        except Exception as e:
            logger.error(f"获取所有邮箱失败: {str(e)}")
            return []
            
    def get_email_by_id(self, email_id):
        """根据ID获取邮箱"""
        return Email.query.get(email_id)
        
    def add_email(self, user_id, email_address, password, mail_type='outlook', server=None, port=None,
                  use_ssl=True, client_id=None, refresh_token=None):
        """添加新邮箱"""
        try:
            # 检查邮箱是否已存在
            existing = Email.query.filter_by(user_id=user_id, email=email_address).first()
            if existing:
                logger.warning(f"邮箱已存在: {email_address}")
                return False
                
            email = Email(
                user_id=user_id,
                email=email_address,
                password=password,
                mail_type=mail_type,
                server=server,
                port=port,
                use_ssl=use_ssl,
                client_id=client_id,
                refresh_token=refresh_token
            )
            
            self.db.session.add(email)
            self.db.session.commit()
            
            # 如果是SQLite，同步到WebDAV
            if config.DB_TYPE == 'sqlite' and config.WEBDAV_ENABLED and self.webdav:
                self.webdav.sync_to_remote()
                
            logger.info(f"邮箱添加成功: {email_address}, 用户ID: {user_id}")
            return True
        except Exception as e:
            self.db.session.rollback()
            logger.error(f"添加邮箱失败: {str(e)}")
            return False
            
    def delete_email(self, email_id):
        """删除邮箱"""
        try:
            email = Email.query.get(email_id)
            if not email:
                logger.warning(f"删除邮箱失败: 邮箱ID {email_id} 不存在")
                return False
                
            self.db.session.delete(email)
            self.db.session.commit()
            
            # 如果是SQLite，同步到WebDAV
            if config.DB_TYPE == 'sqlite' and config.WEBDAV_ENABLED and self.webdav:
                self.webdav.sync_to_remote()
                
            logger.info(f"邮箱删除成功: ID={email_id}, 地址={email.email}")
            return True
        except Exception as e:
            self.db.session.rollback()
            logger.error(f"删除邮箱失败: {str(e)}")
            return False
            
    def add_mail_record(self, email_id, subject, sender, received_time, content, folder=None):
        """添加邮件记录"""
        try:
            record = MailRecord(
                email_id=email_id,
                subject=subject,
                sender=sender,
                received_time=received_time,
                content=content,
                folder=folder
            )
            
            self.db.session.add(record)
            self.db.session.commit()
            
            # 同步频率控制：为避免频繁同步影响性能，每50条记录同步一次
            if config.DB_TYPE == 'sqlite' and config.WEBDAV_ENABLED and self.webdav:
                if MailRecord.query.count() % 50 == 0:
                    self.webdav.sync_to_remote()
                    
            return True
        except Exception as e:
            self.db.session.rollback()
            logger.error(f"添加邮件记录失败: {str(e)}")
            return False
            
    def get_mail_records(self, email_id):
        """获取邮箱的邮件记录"""
        try:
            return MailRecord.query.filter_by(email_id=email_id).order_by(MailRecord.received_time.desc()).all()
        except Exception as e:
            logger.error(f"获取邮件记录失败: {str(e)}")
            return [] 