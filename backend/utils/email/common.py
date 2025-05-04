"""
通用邮件处理工具函数
"""

from bs4 import BeautifulSoup
from email.header import decode_header
from email.message import Message
import chardet
from datetime import datetime
import email.utils
import time
import traceback
from typing import Union, Dict
import os

# 导入日志
from .logger import logger, timing_decorator

def decode_mime_words(s):
    """解码邮件标题"""
    if not s:
        return ""
    try:
        decoded_fragments = decode_header(s)
        result = []
        for text, charset in decoded_fragments:
            if isinstance(text, bytes):
                if charset and charset.lower() == 'unknown-8bit':
                    # 对于unknown-8bit编码，尝试使用utf-8解码
                    try:
                        result.append(text.decode('utf-8', errors='ignore'))
                    except:
                        # 如果utf-8失败，尝试其他常见编码
                        for enc in ['gbk', 'gb18030', 'latin1', 'windows-1252']:
                            try:
                                result.append(text.decode(enc, errors='ignore'))
                                break
                            except:
                                continue
                else:
                    result.append(text.decode(charset or 'utf-8', errors='ignore'))
            else:
                result.append(str(text))
        return ''.join(result)
    except Exception as e:
        logger.error(f"解码MIME字符串失败: {str(e)}")
        return s if isinstance(s, str) else str(s)

def strip_html(content):
    """去除 HTML 标签"""
    try:
        # 避免content为文件路径引起BeautifulSoup警告
        if not content or not isinstance(content, str):
            return content if content else ""
            
        # 检查content是否看起来像文件路径
        if (content.startswith('/') or content.startswith('./') or 
            content.startswith('../') or 
            (len(content) > 3 and content[1:3] == ':\\') or
            len(content.splitlines()) <= 1 and os.path.exists(content)):
            logger.warning(f"content可能是文件路径，而非HTML内容: {content[:50]}")
            return f"错误的内容格式: {content}"
            
        soup = BeautifulSoup(content, "html.parser")
        return soup.get_text()
    except Exception as e:
        logger.error(f"去除HTML标签失败: {str(e)}")
        return content

def safe_decode(byte_content):
    """自动检测并解码字节数据"""
    if not byte_content:
        return ""
    try:
        result = chardet.detect(byte_content)
        encoding = result['encoding']
        if encoding is not None:
            try:
                return byte_content.decode(encoding)
            except UnicodeDecodeError:
                # 如果使用检测到的编码失败，尝试其他常见编码
                for enc in ['utf-8', 'gbk', 'gb18030', 'latin1', 'windows-1252']:
                    try:
                        return byte_content.decode(enc)
                    except:
                        continue
        # 如果所有尝试都失败，返回原始内容的字符串表示
        return str(byte_content)
    except Exception as e:
        logger.error(f"解码字节数据失败: {str(e)}")
        return str(byte_content)

def remove_extra_blank_lines(text):
    """移除多余的空白行"""
    if not text:
        return ""
    lines = text.splitlines()
    return '\n'.join(line for line in lines if line.strip())

def parse_email_date(date_str):
    """解析邮件日期"""
    if not date_str:
        return datetime.now()
    try:
        return email.utils.parsedate_to_datetime(date_str)
    except Exception as e:
        logger.error(f"解析邮件日期失败: {str(e)}")
        return datetime.now()

def decode_email_content(byte_content):
    """解码邮件内容"""
    if not byte_content:
        return ""
    try:
        result = chardet.detect(byte_content)
        encoding = result['encoding']
        if encoding is not None:
            try:
                return byte_content.decode(encoding)
            except UnicodeDecodeError:
                # 如果使用检测到的编码失败，尝试其他常见编码
                for enc in ['utf-8', 'gbk', 'gb18030', 'latin1', 'windows-1252']:
                    try:
                        return byte_content.decode(enc)
                    except:
                        continue
        # 如果所有尝试都失败，返回原始内容的字符串表示
        return str(byte_content)
    except Exception as e:
        logger.error(f"解码邮件内容失败: {str(e)}")
        return str(byte_content)

@timing_decorator
def parse_email_message(msg: Message, folder: str = "INBOX") -> dict:
    """解析邮件消息对象为结构化数据"""
    try:
        # 安全地获取邮件信息
        subject = msg.get("subject", "")
        sender = msg.get("from", "")
        date_str = msg.get("date", "")
        message_id = msg.get("message-id", "")
        
        # 记录开始解析
        logger.debug(f"开始解析邮件: ID[{message_id}]")
        
        # 解码主题和发件人
        try:
            subject = decode_mime_words(subject) if subject else "(无主题)"
            sender = decode_mime_words(sender) if sender else "(未知发件人)"
            logger.debug(f"解码主题: {subject[:50]}...")
            logger.debug(f"解码发件人: {sender[:50]}...")
        except Exception as e:
            logger.warning(f"解码邮件信息失败: {str(e)}")
            subject = str(subject) or "(无主题)"
            sender = str(sender) or "(未知发件人)"
        
        # 解析日期
        try:
            received_time = parse_email_date(date_str) if date_str else datetime.now()
            logger.debug(f"解析日期: {date_str} -> {received_time}")
        except Exception as e:
            logger.warning(f"解析日期失败: {str(e)}, 使用当前时间")
            received_time = datetime.now()
        
        # 获取邮件内容
        start_time = time.time()
        content = extract_email_content(msg)
        end_time = time.time()
        logger.debug(f"提取邮件内容耗时: {end_time - start_time:.2f}秒, 内容长度: {len(content)} 字符")
        
        # 构建邮件记录
        mail_record = {
            "subject": subject,
            "sender": sender,
            "received_time": received_time,
            "content": content,
            "folder": folder
        }
        
        logger.debug(f"完成邮件解析: {subject[:30]}...")
        return mail_record
        
    except Exception as e:
        logger.error(f"解析邮件失败: {str(e)}")
        traceback.print_exc()
        return None

def extract_email_content(msg: Union[Message, Dict]) -> str:
    """提取邮件内容，处理纯文本和HTML格式"""
    try:
        # 如果msg是字典类型，直接返回content字段
        if isinstance(msg, dict):
            return msg.get('content', '(无内容)')
            
        content = ""
        plain_text_found = False
        html_content_found = False
        
        if msg.is_multipart():
            logger.debug("处理多部分邮件")
            parts = []
            
            # 先收集所有部分
            for part in msg.walk():
                content_type = part.get_content_type()
                content_disposition = str(part.get("content-disposition") or "")
                
                # 跳过附件
                if "attachment" in content_disposition:
                    logger.debug(f"跳过附件: {part.get_filename() or '未命名'}")
                    continue
                
                if content_type == "text/plain":
                    plain_text_found = True
                    parts.append(("text/plain", part))
                elif content_type == "text/html":
                    html_content_found = True
                    parts.append(("text/html", part))
            
            # 优先使用纯文本内容
            if plain_text_found:
                logger.debug("优先使用纯文本内容")
                for content_type, part in parts:
                    if content_type == "text/plain":
                        try:
                            payload = part.get_payload(decode=True)
                            if payload:
                                plain_content = safe_decode(payload)
                                content += plain_content + "\n\n"
                        except Exception as e:
                            logger.warning(f"解码纯文本内容失败: {str(e)}")
            
            # 如果没有可用的纯文本或内容为空，尝试HTML内容
            if not content and html_content_found:
                logger.debug("使用HTML内容")
                for content_type, part in parts:
                    if content_type == "text/html":
                        try:
                            payload = part.get_payload(decode=True)
                            if payload:
                                html_content = safe_decode(payload)
                                text_content = strip_html(html_content)
                                content += text_content + "\n\n"
                        except Exception as e:
                            logger.warning(f"解码HTML内容失败: {str(e)}")
        else:
            logger.debug("处理单部分邮件")
            content_type = msg.get_content_type()
            
            if content_type == "text/plain":
                logger.debug("处理纯文本内容")
                try:
                    payload = msg.get_payload(decode=True)
                    if payload:
                        content = safe_decode(payload)
                except Exception as e:
                    logger.warning(f"解码纯文本内容失败: {str(e)}")
            elif content_type == "text/html":
                logger.debug("处理HTML内容")
                try:
                    payload = msg.get_payload(decode=True)
                    if payload:
                        html_content = safe_decode(payload)
                        content = strip_html(html_content)
                except Exception as e:
                    logger.warning(f"解码HTML内容失败: {str(e)}")
            else:
                logger.warning(f"未处理的内容类型: {content_type}")
        
        # 清理内容
        cleaned_content = remove_extra_blank_lines(content)
        
        # 如果内容为空，添加一个提示
        if not cleaned_content:
            logger.warning("邮件内容为空")
            cleaned_content = "(邮件内容为空)"
        
        return cleaned_content
        
    except Exception as e:
        logger.error(f"提取邮件内容失败: {str(e)}")
        traceback.print_exc()
        return "(无法提取邮件内容)"

def normalize_check_time(last_check_time):
    """
    标准化处理上次检查时间参数
    将字符串转换为datetime对象，或者处理格式不正确的情况
    
    Args:
        last_check_time: 上次检查时间，可以是字符串或datetime对象
        
    Returns:
        datetime对象或None
    """
    if not last_check_time:
        return None
        
    # 如果已经是datetime对象，直接返回
    if isinstance(last_check_time, datetime):
        return last_check_time
        
    # 处理字符串格式
    if isinstance(last_check_time, str):
        try:
            # 尝试ISO格式解析
            return datetime.fromisoformat(last_check_time.replace('Z', '+00:00'))
        except ValueError:
            try:
                # 尝试其他常见格式
                return datetime.strptime(last_check_time, "%Y-%m-%d %H:%M:%S")
            except ValueError:
                try:
                    # 再尝试其他格式
                    return datetime.strptime(last_check_time, "%Y-%m-%d")
                except ValueError:
                    logger.error(f"无法解析日期字符串: {last_check_time}")
                    return None
    
    logger.error(f"不支持的last_check_time类型: {type(last_check_time)}")
    return None

def format_date_for_imap_search(dt):
    """
    将datetime对象格式化为IMAP搜索所需的日期格式(DD-MMM-YYYY)
    
    Args:
        dt: datetime对象
        
    Returns:
        str: IMAP搜索日期格式的字符串
    """
    if not dt:
        return None
        
    try:
        return dt.strftime("%d-%b-%Y")
    except Exception as e:
        logger.error(f"格式化日期失败: {str(e)}")
        return None 