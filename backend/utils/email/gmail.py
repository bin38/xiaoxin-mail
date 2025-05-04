"""
Gmail邮箱处理模块
基于IMAP协议，使用Gmail特定的服务器配置
"""

from .imap import IMAPMailHandler
import imaplib
import email
from email.header import decode_header
from email.utils import parsedate_to_datetime
import os
import logging
from datetime import datetime
from typing import List, Dict, Optional, Callable
from .logger import log_email_start, log_email_complete, log_email_error

logger = logging.getLogger(__name__)

class GmailHandler(IMAPMailHandler):
    """Gmail邮箱处理类"""
    
    # Gmail IMAP服务器配置
    SERVER = 'imap.gmail.com'
    PORT = 993
    USE_SSL = True
    
    @classmethod
    def fetch_emails(cls, email_address, password, folder="INBOX", callback=None, last_check_time=None):
        """获取Gmail邮箱中的邮件"""
        return super().fetch_emails(
            email_address=email_address,
            password=password,
            server=cls.SERVER,
            port=cls.PORT,
            use_ssl=cls.USE_SSL,
            folder=folder,
            callback=callback,
            last_check_time=last_check_time
        )
    
    @classmethod
    def check_mail(cls, email_info, db, progress_callback=None):
        """检查Gmail邮箱的邮件"""
        # 更新邮箱信息为Gmail特定配置
        email_info['server'] = cls.SERVER
        email_info['port'] = cls.PORT
        email_info['use_ssl'] = cls.USE_SSL
        
        try:
            # 通知客户端开始处理
            if progress_callback:
                progress_callback(0, "开始获取Gmail邮件")
            
            # 获取上次检查时间
            last_check_time = email_info.get('last_check_time')
            
            # 获取邮件
            mail_records = cls.fetch_emails(
                email_address=email_info['email'],
                password=email_info['password'],
                callback=progress_callback,
                last_check_time=last_check_time
            )
            
            if not mail_records:
                if progress_callback:
                    progress_callback(0, "没有找到新邮件")
                return {'success': False, 'message': '没有找到新邮件'}
            
            # 通知客户端开始保存邮件
            if progress_callback:
                progress_callback(50, f"开始保存 {len(mail_records)} 封邮件")
            
            # 保存邮件记录
            saved_count = db.save_mail_records(email_info['id'], mail_records, progress_callback)
            
            # 记录完成
            log_email_complete(email_info['email'], email_info['id'], len(mail_records), len(mail_records), saved_count)
            
            # 通知客户端处理完成
            if progress_callback:
                progress_callback(100, f"邮件处理完成: 总计 {len(mail_records)} 封, 新增 {saved_count} 封")
            
            return {
                'success': True,
                'message': f'成功获取 {len(mail_records)} 封邮件，新增 {saved_count} 封'
            }
            
        except Exception as e:
            logger.error(f"检查邮件失败: {str(e)}")
            log_email_error(email_info['email'], email_info['id'], str(e))
            
            # 通知客户端处理失败
            if progress_callback:
                progress_callback(0, f"邮件处理失败: {str(e)}")
                
            return {'success': False, 'message': str(e)} 