# 摄影作品展示网站部署指南

本文档说明如何部署摄影作品展示网站。该网站采用前后端分离架构：
- 前端静态文件托管在阿里云 OSS
- 后端服务运行在云服务器上
- 图片存储在阿里云 OSS

## 系统要求

### 云服务器要求
- 操作系统：Ubuntu 20.04 或更高版本
- Node.js 16.x 或更高版本
- PM2 进程管理器
- Nginx（可选，用于反向代理）

### 阿里云服务
- OSS（对象存储）
- CDN（可选，但推荐）
- SSL 证书（可选，但推荐）

## 部署步骤

### 1. 准备工作

1. 安装依赖：
```bash
npm install
```

2. 确保 `.env` 文件配置正确：
```
NOTION_API_KEY=your_notion_api_key
NOTION_DATABASE_ID=your_database_id
OSS_REGION=oss-cn-hangzhou
OSS_ACCESS_KEY_ID=your_access_key_id
OSS_ACCESS_KEY_SECRET=your_access_key_secret
OSS_BUCKET=your_bucket_name
OSS_PREFIX=photo-portfolio/
```

### 2. 运行部署脚本

```bash
node deploy.js
```

脚本会：
1. 准备静态文件和服务端文件
2. 上传静态文件到 OSS
3. 打包服务端文件为 server.zip

### 3. 服务器配置

1. 安装必要软件：
```bash
# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 PM2
sudo npm install -g pm2

# 安装 Nginx（可选）
sudo apt-get install -y nginx
```

2. 上传并解压服务端文件：
```bash
# 在服务器上创建目录
mkdir -p /var/www/photo-portfolio

# 上传 server.zip（使用 scp 或其他方式）
scp deploy/server.zip user@your-server:/var/www/photo-portfolio/

# 解压文件
cd /var/www/photo-portfolio
unzip server.zip
```

3. 运行服务：
```bash
cd /var/www/photo-portfolio/server
chmod +x start.sh
./start.sh
```

### 4. Nginx 配置（可选）

1. 创建 Nginx 配置：
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

2. 启用配置：
```bash
sudo ln -s /etc/nginx/sites-available/photo-portfolio /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 5. SSL 配置（推荐）

1. 安装 Certbot：
```bash
sudo apt-get install -y certbot python3-certbot-nginx
```

2. 获取证书：
```bash
sudo certbot --nginx -d your-domain.com
```

### 6. 定时任务配置

添加定时任务以同步图片：

```bash
# 编辑 crontab
crontab -e

# 添加以下内容（每天凌晨 2 点同步）
0 2 * * * cd /var/www/photo-portfolio/server && npm run sync-images
```

## 维护说明

### 日常维护
1. 监控服务器状态：
```bash
pm2 status
pm2 logs photo-portfolio
```

2. 检查同步日志：
```bash
tail -f /var/www/photo-portfolio/server/logs/sync.log
```

### 更新部署
1. 运行部署脚本生成新的部署包
2. 上传并解压新的 server.zip
3. 重启服务：
```bash
cd /var/www/photo-portfolio/server
./start.sh
```

### 故障排除
1. 检查服务状态：`pm2 status`
2. 查看错误日志：`pm2 logs`
3. 检查 Nginx 日志：`sudo tail -f /var/log/nginx/error.log`

## 性能优化建议

1. **CDN 配置**
   - 在阿里云 CDN 控制台添加加速域名
   - 配置缓存规则：
     ```
     *.html   缓存时间：5分钟
     *.json   缓存时间：5分钟
     *.jpg    缓存时间：7天
     *.png    缓存时间：7天
     ```

2. **服务器优化**
   - 适当调整 Node.js 内存限制
   - 配置 Nginx 缓存
   - 启用 Gzip 压缩

3. **监控告警**
   - 配置服务器监控
   - 设置磁盘空间告警
   - 监控 CDN 流量和带宽 