import os
import json
import asyncio
import logging
import websockets
import jwt
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Dict, Any, List, Optional
import traceback

# 配置日志
logger = logging.getLogger('websocket')

class WebSocketHandler:
    def __init__(self):
        self.db = None
        self.email_processor = None
        self.port = 8765
        self.clients = set()
        self.user_sockets = {}  # 用户的连接 {user_id: set(websockets)}
        self.client_tokens = {}  # 存储客户端的认证信息
        self.client_handlers = {}  # 存储每个客户端的处理函数
        self.active_users = {}  # 用户ID -> websocket连接
        self.user_counters = {}  # 用户ID -> 连接数
        
        # JWT密钥，与app.py保持一致
        self.jwt_secret = os.environ.get('JWT_SECRET_KEY', 'huohuo_email_secret_key')
    
    def set_dependencies(self, db, email_processor):
        """设置依赖"""
        self.db = db
        self.email_processor = email_processor
        
        # 注册消息处理函数
        self.client_handlers = {
            'get_all_emails': self.handle_get_all_emails_message,
            'check_emails': self.handle_check_emails_message,
            'get_mail_records': self.handle_get_mail_records_message,
            'add_email': self.handle_add_email_message,
            'delete_emails': self.handle_delete_emails_message,
            'import_emails': self.handle_import_emails_message,
        }
    
    async def register(self, websocket):
        """注册新的WebSocket连接"""
        self.clients.add(websocket)
        logger.info(f"新的WebSocket连接已注册，当前连接数: {len(self.clients)}")
    
    async def unregister(self, websocket):
        """注销WebSocket连接"""
        self.clients.remove(websocket)
        logger.info(f"WebSocket连接已关闭，当前连接数: {len(self.clients)}")
    
    async def broadcast(self, message):
        """向所有已连接的客户端广播消息"""
        if not self.clients:
            return
        
        for client in self.clients.copy():
            try:
                await client.send(json.dumps(message))
            except websockets.exceptions.ConnectionClosed:
                # 客户端可能已断开连接
                await self.unregister(client)
    
    async def handle_message(self, websocket, message_text):
        """处理收到的WebSocket消息"""
        try:
            message = json.loads(message_text)
            action = message.get('action')
            
            logger.info(f"收到WebSocket消息: {action}")
            
            if action == 'get_all_emails':
                # 获取所有邮箱
                emails = self.db.get_all_emails()
                
                # 转换为字典列表
                email_list = []
                for email in emails:
                    email_list.append({
                        'id': email.id,
                        'email': email.email,
                        'user_id': email.user_id,
                        'mail_type': email.mail_type,
                        'last_check_time': email.last_check_time.isoformat() if email.last_check_time else None,
                        'created_at': email.created_at.isoformat(),
                        'enable_realtime_check': email.enable_realtime_check
                    })
                
                await websocket.send(json.dumps({
                    'type': 'emails_list',
                    'data': email_list
                }))
            
            elif action == 'add_email':
                # 添加邮箱
                email_data = message.get('data', {})
                
                user_id = email_data.get('user_id')
                email = email_data.get('email')
                password = email_data.get('password')
                mail_type = email_data.get('mail_type', 'outlook')
                
                # 其他可选参数
                client_id = email_data.get('client_id')
                refresh_token = email_data.get('refresh_token')
                
                success = self.db.add_email(
                    user_id=user_id,
                    email_address=email,
                    password=password,
                    mail_type=mail_type,
                    client_id=client_id,
                    refresh_token=refresh_token
                )
                
                if success:
                    await websocket.send(json.dumps({
                        'type': 'success',
                        'message': f"邮箱 {email} 添加成功"
                    }))
                else:
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'message': f"邮箱 {email} 添加失败，可能已存在"
                    }))
            
            elif action == 'delete_emails':
                # 删除邮箱
                email_ids = message.get('email_ids', [])
                
                deleted_count = 0
            for email_id in email_ids:
                    if self.db.delete_email(email_id):
                        deleted_count += 1
                
                await websocket.send(json.dumps({
                    'type': 'success',
                    'message': f"已删除 {deleted_count} 个邮箱"
                }))
            
            elif action == 'check_emails':
                # 检查邮箱
                email_ids = message.get('email_ids', [])
                
                # 设置进度回调
                async def progress_callback(email_id, progress, message):
                    await self.broadcast({
                        'type': 'check_progress',
                        'email_id': email_id,
                        'progress': progress,
                        'message': message
                    })
                
                # 启动批量检查
                self.email_processor.batch_check_emails(email_ids, progress_callback)
                
                await websocket.send(json.dumps({
                    'type': 'info',
                    'message': f"开始检查 {len(email_ids)} 个邮箱"
                }))
            
            elif action == 'get_mail_records':
                # 获取邮件记录
                email_id = message.get('email_id')
                
                if email_id:
                    records = self.db.get_mail_records(email_id)
                    
                    # 转换为字典列表
                    record_list = []
                    for record in records:
                        record_list.append({
                            'id': record.id,
                            'email_id': record.email_id,
                            'subject': record.subject,
                            'sender': record.sender,
                            'received_time': record.received_time.isoformat() if record.received_time else None,
                            'content': record.content,
                            'folder': record.folder,
                            'created_at': record.created_at.isoformat()
                        })
                    
            await websocket.send(json.dumps({
                'type': 'mail_records',
                'email_id': email_id,
                        'records': record_list
                    }))
                else:
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'message': "必须提供email_id参数"
                    }))
            
            elif action == 'import_emails':
                # 批量导入邮箱
                import_data = message.get('data', {})
                
                data = import_data.get('data', '')
                mail_type = import_data.get('mailType', 'outlook')
                user_id = import_data.get('user_id')
                
                # 处理导入逻辑
                lines = data.strip().split('\n')
                total = len(lines)
        success_count = 0
                failed_details = []
                
                for line in lines:
                    parts = line.strip().split('----')
                    
                    if len(parts) >= 2:
                        email = parts[0].strip()
                        password = parts[1].strip()
                        
                        # 可选的客户端ID和刷新令牌
                        client_id = parts[2].strip() if len(parts) > 2 else None
                        refresh_token = parts[3].strip() if len(parts) > 3 else None
                        
                        if self.db.add_email(
                            user_id=user_id,
                            email_address=email,
                            password=password,
                            mail_type=mail_type,
                            client_id=client_id,
                            refresh_token=refresh_token
                        ):
                success_count += 1
                        else:
                            failed_details.append({
                                'email': email,
                                'reason': '添加失败，可能已存在'
                            })
                    else:
                        failed_details.append({
                            'line': line,
                            'reason': '格式不正确'
                        })
                
                await websocket.send(json.dumps({
                    'type': 'import_result',
                    'total': total,
                    'success': success_count,
                    'failed': total - success_count,
                    'failed_details': failed_details
                }))
            
            # WebDAV同步操作
            elif action == 'sync_to_webdav':
                if hasattr(self.db, 'sync_to_webdav'):
                    success = self.db.sync_to_webdav()
                    if success:
                await websocket.send(json.dumps({
                            'type': 'success',
                            'message': "数据库已成功同步到WebDAV"
                        }))
                    else:
                        await websocket.send(json.dumps({
                            'type': 'error',
                            'message': "同步数据库到WebDAV失败"
                        }))
                else:
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'message': "WebDAV同步未启用"
                    }))
            
            elif action == 'sync_from_webdav':
                if hasattr(self.db, 'sync_from_webdav'):
                    success = self.db.sync_from_webdav()
                    if success:
                await websocket.send(json.dumps({
                    'type': 'success',
                            'message': "数据库已成功从WebDAV同步"
                }))
                    else:
                await websocket.send(json.dumps({
                            'type': 'error',
                            'message': "从WebDAV同步数据库失败"
                }))
            else:
                await websocket.send(json.dumps({
                        'type': 'error',
                        'message': "WebDAV同步未启用"
                    }))
            
            else:
                await websocket.send(json.dumps({
                    'type': 'error',
                    'message': f"不支持的操作: {action}"
                }))
            
        except json.JSONDecodeError:
            logger.error(f"无效的JSON格式: {message_text}")
            await websocket.send(json.dumps({
                'type': 'error',
                'message': "无效的消息格式，需要JSON格式"
            }))
        except Exception as e:
            logger.error(f"处理WebSocket消息出错: {str(e)}")
            logger.error(traceback.format_exc())
            await websocket.send(json.dumps({
                'type': 'error',
                'message': f"处理消息出错: {str(e)}"
            }))
    
    async def ws_handler(self, websocket, path):
        """WebSocket连接处理器"""
        await self.register(websocket)
        try:
            async for message in websocket:
                await self.handle_message(websocket, message)
        except websockets.exceptions.ConnectionClosed:
            logger.info("WebSocket连接已关闭")
        finally:
            await self.unregister(websocket)
    
    def start_server(self, host, port):
        """启动WebSocket服务器"""
        logger.info(f"启动WebSocket服务器于 ws://{host}:{port}")
        
        try:
        # 创建事件循环
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # 启动WebSocket服务器
            start_server = websockets.serve(self.ws_handler, host, port)
        loop.run_until_complete(start_server)
        loop.run_forever()
        except Exception as e:
            logger.error(f"启动WebSocket服务器失败: {str(e)}")
            logger.error(traceback.format_exc())

    async def handle_get_all_emails_message(self, websocket, message):
        """处理获取所有邮箱的WebSocket消息"""
        user_id = self.clients.get(websocket)
        if not user_id:
            await self.send_error(websocket, "未找到用户信息")
            return
        await self.handle_get_all_emails(websocket, user_id)
    
    async def handle_check_emails_message(self, websocket, message):
        """处理检查邮箱的WebSocket消息"""
        user_id = self.clients.get(websocket)
        if not user_id:
            await self.send_error(websocket, "未找到用户信息")
            return
        await self.handle_check_emails(websocket, user_id, message)
    
    async def handle_get_mail_records_message(self, websocket, message):
        """处理获取邮件记录的WebSocket消息"""
        user_id = self.clients.get(websocket)
        if not user_id:
            await self.send_error(websocket, "未找到用户信息")
            return
        await self.handle_get_mail_records(websocket, user_id, message)
    
    async def handle_add_email_message(self, websocket, message):
        """处理添加邮箱的WebSocket消息"""
        user_id = self.clients.get(websocket)
        if not user_id:
            await self.send_error(websocket, "未找到用户信息")
            return
        await self.handle_add_email(websocket, user_id, message)
    
    async def handle_delete_emails_message(self, websocket, message):
        """处理删除邮箱的WebSocket消息"""
        user_id = self.clients.get(websocket)
        if not user_id:
            await self.send_error(websocket, "未找到用户信息")
            return
        await self.handle_delete_emails(websocket, user_id, message)
    
    async def handle_import_emails_message(self, websocket, message):
        """处理导入邮箱的WebSocket消息"""
        user_id = self.clients.get(websocket)
        if not user_id:
            await self.send_error(websocket, "未找到用户信息")
            return
        await self.handle_import_emails(websocket, user_id, message) 
    
    async def send_error(self, websocket, message):
        """发送错误消息"""
        try:
            await websocket.send(json.dumps({
                'type': 'error',
                'message': message
            }))
        except:
            pass
    
    async def send_message(self, websocket, message):
        """发送消息"""
        try:
            await websocket.send(json.dumps(message))
        except Exception as e:
            logger.error(f"发送消息失败: {str(e)}")
    
    def run(self):
        """启动WebSocket服务器"""
        # 创建事件循环
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # 启动WebSocket服务器
        start_server = websockets.serve(
            self.ws_handler,
            "0.0.0.0",
            self.port
        )
        
        logger.info(f"WebSocket服务器启动于端口 {self.port}")
        
        # 运行事件循环
        loop.run_until_complete(start_server)
        loop.run_forever() 