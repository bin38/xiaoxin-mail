import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 数据库类型：sqlite, mysql
DB_TYPE = os.environ.get('DB_TYPE', 'sqlite')

# SQLite 配置
SQLITE_DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'data',
    'huohuo_email.db'
)

# MySQL 配置
MYSQL_HOST = os.environ.get('MYSQL_HOST', 'localhost')
MYSQL_PORT = int(os.environ.get('MYSQL_PORT', 3306))
MYSQL_USER = os.environ.get('MYSQL_USER', 'root')
MYSQL_PASSWORD = os.environ.get('MYSQL_PASSWORD', '')
MYSQL_DATABASE = os.environ.get('MYSQL_DATABASE', 'firemail')
MYSQL_CHARSET = os.environ.get('MYSQL_CHARSET', 'utf8mb4')

# WebDAV 配置
WEBDAV_ENABLED = os.environ.get('WEBDAV_ENABLED', 'false').lower() == 'true'
WEBDAV_URL = os.environ.get('WEBDAV_URL', '')
WEBDAV_USERNAME = os.environ.get('WEBDAV_USERNAME', '')
WEBDAV_PASSWORD = os.environ.get('WEBDAV_PASSWORD', '')
WEBDAV_ROOT_PATH = os.environ.get('WEBDAV_ROOT_PATH', '/firemail/')
WEBDAV_DB_NAME = os.environ.get('WEBDAV_DB_NAME', 'firemail.db')

# 数据库URI
def get_database_uri():
    """根据配置返回数据库连接URI"""
    if DB_TYPE == 'mysql':
        return f"mysql://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}"
    # 默认使用SQLite
    return f"sqlite:///{SQLITE_DB_PATH}"

# SQLAlchemy配置
SQLALCHEMY_TRACK_MODIFICATIONS = False
SQLALCHEMY_DATABASE_URI = get_database_uri()

# 数据备份路径
BACKUP_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'data',
    'backups'
) 