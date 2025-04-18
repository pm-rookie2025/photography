# 个人摄影作品展示网站

一个简约优雅的个人摄影作品展示网站，支持从 Notion 数据库同步图片到阿里云 OSS，并提供流畅的浏览体验。

## 功能特点

- 极简主义设计风格
- 支持系列和专辑两级分类
- 从 Notion 数据库自动同步图片
- 图片自动上传至阿里云 OSS
- 支持增量更新和强制更新
- 智能图片压缩和优化
- 自动生成多种尺寸的图片
- 响应式设计，适配各种设备

## 版本历史

### v1.5 (2024-05-25)
- 界面优化和性能提升
  - 优化图片加载性能，减少首屏加载时间
  - 改进响应式布局，提升移动端体验
  - 优化图片展示效果，支持更多交互方式
  - 改进导航体验，提升用户操作流畅度
- 功能增强
  - 添加图片预加载功能
  - 优化图片缓存策略
  - 改进错误处理和提示信息
  - 增强跨平台兼容性

### v1.4 (2024-05-24)
- 跨平台兼容性改进
  - 修复跨域访问(CORS)问题
  - 优化 API 基础 URL 配置，支持不同网络环境
  - 添加 Vercel 部署配置文件
  - 增强错误处理和日志记录
- 部署优化
  - 改进前端与后端通信
  - 优化环境变量配置
  - 提高不同网络环境下的访问稳定性
- 错误处理增强
  - 改进 API 错误提示信息
  - 添加故障恢复机制
  - 增加详细的请求失败反馈

### v1.3 (2024-05-17)
- 界面优化和功能增强
  - 优化"关于"页面布局和内容
  - 增加摄影师签名展示
  - 改进专辑页面布局和响应式设计
  - 增加图片轮播和全屏查看功能
  - 优化加载动画效果
- 内容管理
  - 支持从Notion同步最新专辑
  - 改进图片加载机制
  - 优化图片在不同设备上的显示效果
- 用户体验提升
  - 优化导航结构
  - 提高页面加载速度
  - 增强图片浏览交互体验

### v1.2 (2024-03-21)
- 开源发布
  - 项目代码开源
  - 完善文档说明
  - 添加示例配置文件
- 安全性增强
  - 移除所有敏感信息
  - 添加安全建议文档
  - 优化配置管理
- 部署优化
  - 简化安装步骤
  - 完善部署文档
  - 优化环境配置

### v1.1 (2024-03-21)
- 优化图片加载性能
  - 添加预加载队列系统
  - 实现渐进式图片加载
  - 优化缩略图懒加载
- 改进用户界面
  - 优化图片切换动画
  - 改进导航体验
  - 优化移动端适配
- 使用阿里云 OSS 存储图片
  - 支持多种图片尺寸
  - 自动图片压缩和优化
  - CDN 加速支持
- 安全性改进
  - 移除敏感配置信息
  - 优化错误处理
  - 加强参数验证

### v1.0 (2024-03-14)
- 首次发布
- 基本功能实现
  - 系列和专辑展示
  - Notion 数据同步
  - 图片上传和管理

## 环境要求

- Node.js >= 14.0.0
- npm >= 6.0.0

## 配置说明

### 环境变量
创建 `.env` 文件并配置以下环境变量：

```bash
# Notion API 配置
NOTION_API_KEY=your_notion_api_key
NOTION_DATABASE_ID=your_notion_database_id

# 阿里云 OSS 配置
OSS_REGION=your_oss_region
OSS_ACCESS_KEY_ID=your_access_key_id
OSS_ACCESS_KEY_SECRET=your_access_key_secret
OSS_BUCKET=your_bucket_name
```

> 注意：请勿将包含实际密钥的 `.env` 文件提交到代码仓库。

### Notion 数据库结构

数据库需要包含以下属性：
- 摄影集（Select）：系列名称
- 相册（Title）：专辑标题
- 地点（Text）：拍摄地点
- 拍摄日期（Date）：拍摄时间
- 图片集（Files）：专辑图片

## 安装和使用

1. 克隆仓库：
```bash
git clone https://github.com/your-username/photography.git
cd photography
```

2. 安装依赖：
```bash
npm install
```

3. 配置环境变量：
```bash
cp .env.example .env
# 编辑 .env 文件，填入你的配置信息
```

4. 同步图片：
```bash
# 增量更新（仅同步新图片）
npm run sync-images

# 强制更新（重新处理所有图片）
FORCE_UPDATE=true npm run sync-images
```

5. 启动服务器：
```bash
npm start
```

6. 访问网站：
打开浏览器访问 `http://localhost:3000`

## 自动化部署

支持通过 cron 任务自动同步图片：

```bash
# 设置每天凌晨 3 点自动同步
node cron-sync.js
```

## 性能优化

1. 图片优化
   - 自动压缩大图片
   - 生成多种尺寸的缩略图
   - 使用渐进式加载

2. 缓存策略
   - 浏览器缓存
   - CDN 缓存
   - 预加载关键资源

## 安全建议

1. 环境变量
   - 使用 `.env` 文件存储敏感配置
   - 不要将 `.env` 文件提交到代码仓库
   - 定期更新 API 密钥

2. 图片上传
   - 限制上传文件大小
   - 验证文件类型
   - 使用安全的文件名

3. 访问控制
   - 配置适当的 CORS 策略
   - 使用 HTTPS
   - 限制 API 访问频率

## 常见问题

1. 图片上传失败
   - 检查网络连接
   - 验证 OSS 配置
   - 确认图片格式支持

2. 同步超时
   - 增加超时时间
   - 使用增量更新
   - 检查网络状态

## 许可证

MIT License 