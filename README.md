# 个人摄影作品展示网站

这是一个简约、优雅的个人摄影作品展示网站项目。它使用 Notion 作为数据源管理摄影系列和专辑，通过 Node.js 脚本处理图片（下载、压缩、旋转、上传至阿里云OSS），并最终在前端以极简风格展示作品。

## ✨ 功能特性

*   **Notion驱动**: 直接从 Notion 数据库同步摄影系列和专辑数据。
*   **自动化图片处理**: 脚本自动下载、压缩、根据EXIF信息旋转图片，并上传到阿里云OSS。
*   **响应式设计**: 网站界面适配不同屏幕尺寸（桌面、平板、手机）。
*   **按系列和专辑浏览**: 清晰的导航结构，方便用户按不同主题查找作品。
*   **封面焦点调整**: 支持在 Notion 中为专辑封面指定焦点位置，优化封面展示效果。
*   **增量与特定更新**: 支持同步所有专辑，或仅同步特定 Notion 页面ID 的专辑，提高效率。
*   **极简设计风格**: 借鉴 Amelia Allen 和 Mike Kelley 等摄影师网站，突出作品本身。

## 🛠️ 技术栈

*   **数据管理**: Notion
*   **后端与图片处理**: Node.js, JavaScript (ES6+), Axios, Sharp (图片处理), Ali-OSS (阿里云对象存储)
*   **前端**: HTML5, Tailwind CSS, JavaScript
*   **开发与构建**: `dotenv` (环境变量管理), `cli-progress`, `ansi-colors`, `filesize`

## ⚙️ 安装与配置

1.  **克隆项目**:
    ```bash
    git clone <your-repository-url>
    cd photography-main 
    ```

2.  **安装依赖**:
    ```bash
    npm install
    ```

3.  **配置环境变量**:
    在项目根目录下创建一个 `.env` 文件，并根据你的实际情况填写以下信息：
    ```env
    # Notion API 配置
    NOTION_API_KEY=your_notion_api_key_here 
    NOTION_DATABASE_ID=your_notion_database_id_here

    # 阿里云 OSS 配置
    OSS_REGION=your_oss_region_here 
    OSS_ACCESS_KEY_ID=your_oss_access_key_id_here
    OSS_ACCESS_KEY_SECRET=your_oss_access_key_secret_here
    OSS_BUCKET=your_oss_bucket_name_here
    OSS_PREFIX=photo-portfolio/  # OSS中存储图片的路径前缀 (可选, 默认为 photo-portfolio/)
    OSS_CDN_DOMAIN=your_oss_cdn_domain_here # (可选) 如果配置了CDN，填写CDN域名，例如：cdn.yourdomain.com

    # 图片处理脚本配置 (可选)
    # FORCE_UPDATE=true # 如果设置为 true，则强制重新处理所有图片，忽略已存在的记录
    ```
    *   `NOTION_API_KEY`: 你的 Notion Integration Token。
    *   `NOTION_DATABASE_ID`: 你在 Notion 中用来管理摄影作品的数据库 ID。
    *   阿里云相关配置请参考阿里云OSS文档。

## 🚀 如何运行

### 1. 同步 Notion 数据与处理图片

**同步所有专辑**:
此命令会获取 Notion 数据库中的所有专辑数据，下载图片，进行处理（压缩、旋转），然后上传到阿里云OSS，并更新本地的 `data/organized_albums.json` 文件。
```bash
npm run download-images
```

**仅同步特定专辑**:
如果你只想更新 Notion 中某一个特定专辑的数据（例如，你刚刚修改了它的"封面焦点"），可以使用以下命令。你需要提供该专辑在 Notion 中的页面 ID。
```bash
node organize-images.js --albumPageId=YOUR_ALBUM_PAGE_ID_HERE
```
例如:
```bash
node organize-images.js --albumPageId=1d764cadd82181a0b62ff3077450aac0
```

**强制更新**:
在上述任一命令前加上 `FORCE_UPDATE=true`，可以强制脚本重新处理所有相关的图片，即使它们之前已经被处理过。
```bash
FORCE_UPDATE=true npm run download-images
FORCE_UPDATE=true node organize-images.js --albumPageId=YOUR_ALBUM_PAGE_ID_HERE
```

### 2. 启动本地开发服务器

此命令会启动一个本地服务器（通常在 `http://localhost:3000`），让你可以在浏览器中查看网站。
```bash
npm start
```

## 📝 Notion 数据结构要求

为了使脚本能够正确同步数据，你的 Notion 数据库应包含以下属性 (属性名称可以自定义，但需对应修改 `organize-images.js` 脚本中的属性名查找逻辑):

*   **相册 (Title)**: 专辑的标题 (Notion 页面标题)。
*   **摄影集 (Select)**: 专辑所属的系列名称。
*   **封面 (Files & media)**: 专辑的封面图片 (只取第一个文件)。
*   **图片集 (Files & media)**: 专辑内包含的所有摄影作品图片。
*   **地点 (Text/Rich Text)**: 拍摄地点。
*   **拍摄日期 (Date)**: 拍摄日期。
*   **封面焦点 (Text/Rich Text)**: (新增) 用于手动调整封面图片显示焦点的属性。例如：`center`, `top`, `bottom left`, `20% 75%`。如果留空或属性不存在，则默认为 `center center`。

## 未来展望

*   前端直接从 `organized_albums.json` 加载数据并应用 `coverFocus` 实现封面焦点调整。
*   更完善的错误处理和用户反馈。
*   支持更多图片格式和处理选项。

---

请根据你的实际项目情况调整此 README 内容。

## 版本历史

### v1.6 (YYYY-MM-DD) <!-- 请替换为今天的日期 -->
- 界面更新
  - 将导航栏文字 Logo 替换为图片 Logo (logo2.jpg)
  - 将导航栏 SVG 图标替换为 Iconfont 字体图标
  - 调整 Logo 和图标的大小及对齐方式

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