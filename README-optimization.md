# 摄影作品展示网站性能优化指南

## 问题分析

分析发现网站性能问题的主要原因有：

1. **Notion API 频繁调用**：每次请求都要从 Notion 获取数据，速度慢且不稳定
2. **图片过大未优化**：原始图片可能很大，没有进行压缩和尺寸优化
3. **图片加载策略不当**：没有使用懒加载、预加载等技术
4. **CDN 依赖**：使用 CDN 加载 Tailwind CSS，可能导致额外的网络请求

## 优化方案

我们实现了两个主要工具来解决这些问题：

1. **图片处理程序 (imageProcessor.js)**：
   - 从 Notion 下载所有图片
   - 将图片压缩到 2MB 以内
   - 上传到阿里云 OSS 对象存储
   - 生成包含所有处理后数据的JSON文件

2. **网站更新程序 (update-website.js)**：
   - 基于处理后的数据创建优化版服务器
   - 使用本地数据而非实时调用 Notion API
   - 备份原始服务器文件，保留两种启动方式

## 使用步骤

### 1. 安装依赖

首先确保所有依赖已安装：

```bash
npm install
```

### 2. 配置阿里云 OSS

在 `.env` 文件中添加阿里云 OSS 配置：

```
OSS_REGION=oss区域(如oss-cn-beijing)
OSS_ACCESS_KEY_ID=你的AccessKeyID
OSS_ACCESS_KEY_SECRET=你的AccessKeySecret
OSS_BUCKET=你的Bucket名称
OSS_CDN_DOMAIN=CDN域名(可选)
OSS_PREFIX=存储路径前缀(如photo-portfolio/)
```

配置阿里云 OSS 的步骤：
1. 登录阿里云控制台，创建 OSS Bucket
2. 在 RAM 控制台创建 AccessKey
3. 设置 Bucket 为公共读（如果不使用 CDN）
4. (可选) 配置 CDN 加速

### 3. 处理图片和数据

运行图片处理程序：

```bash
npm run process-images
```

这个过程可能需要一些时间，取决于图片数量和大小。程序会：
- 下载所有 Notion 中的图片
- 压缩图片（控制在2MB以内）
- 上传到阿里云 OSS
- 生成包含所有数据的 JSON 文件

### 4. 更新网站

运行网站更新程序：

```bash
npm run update-website
```

这将：
- 备份原始 server.js 文件
- 创建优化版 server.optimized.js 文件
- 更新 package.json 添加快速启动命令

### 5. 启动优化版网站

```bash
npm run start:fast
```

优化版网站使用本地数据和优化后的图片，不再依赖 Notion API，加载速度会显著提升。

## 两种运行模式

1. **标准模式** (从 Notion 获取数据)：
   ```bash
   npm start
   # 或
   npm run dev
   ```

2. **优化模式** (使用本地数据)：
   ```bash
   npm run start:fast
   ```

## 更新网站内容流程

当你在 Notion 中更新了内容后，按以下步骤更新网站：

1. 运行图片处理程序获取最新内容：
   ```bash
   npm run process-images
   ```

2. 启动优化版网站：
   ```bash
   npm run start:fast
   ```

## 优化效果

通过上述优化，我们可以期待以下改进：

1. **初次加载时间减少 70-90%**：不再依赖 Notion API，使用阿里云 OSS 和本地数据
2. **页面切换更快**：所有数据已预加载
3. **图片加载更快**：经过压缩的图片大幅减少加载时间，阿里云 OSS 提供快速稳定的访问
4. **更稳定的体验**：不受 Notion API 速度波动影响

## 阿里云 OSS 的优势

1. **高可靠性**: 提供 99.9999999% 的数据可靠性
2. **高速稳定**: 访问速度快，支持海量并发
3. **图片处理**: 内置图片处理功能，可以按需生成缩略图
4. **CDN 加速**: 支持与 CDN 配合使用，提供全球加速
5. **按量付费**: 费用合理，只需为实际使用的存储和流量付费

## 其他潜在优化方向

如果需要进一步优化，可以考虑：

1. **实现本地 Tailwind CSS**：替换 CDN 版本
2. **添加浏览器缓存策略**：添加适当的缓存头部
3. **使用服务工作器 (Service Worker)**：实现离线访问能力
4. **图片懒加载优化**：使用 Intersection Observer 替代滚动监听
5. **使用 WebP 格式**：阿里云 OSS 支持自动转换为 WebP 格式

## 文件说明

- **imageProcessor.js**: 图片处理程序，负责压缩图片并上传到阿里云 OSS
- **update-website.js**: 网站更新程序 
- **server.optimized.js**: 优化版服务器（由update-website.js生成）
- **server.js**: 原始服务器
- **server.js.backup**: 原始服务器备份（由update-website.js生成）
- **data/albums.json**: 处理后的数据文件（由imageProcessor.js生成）
- **downloads/**: 下载的原始图片
- **compressed/**: 压缩后的图片 