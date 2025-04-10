# 图片处理程序使用说明

这个程序用于从 Notion 自动下载摄影作品、压缩图片并上传到阿里云OSS，帮助优化网站加载速度。

## 功能特点

- 从 Notion 数据库获取所有摄影系列、专辑及图片信息
- 下载 Notion 中的图片到本地
- 自动压缩图片到 2MB 以内，同时保持最佳质量
- 支持上传到阿里云 OSS 对象存储
- 生成优化后的完整数据 JSON 文件，包含所有图片的新 URL
- 支持增量处理，避免重复下载和处理图片

## 使用步骤

### 1. 安装依赖

确保已安装所有必要的依赖：

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 文件并重命名为 `.env`，然后填写以下信息：

```
# Notion API Key
NOTION_API_KEY=你的Notion_API_Key

# Notion Database ID
NOTION_DATABASE_ID=你的Notion数据库ID

# 阿里云OSS配置
OSS_REGION=oss区域(如oss-cn-beijing)
OSS_ACCESS_KEY_ID=你的AccessKeyID
OSS_ACCESS_KEY_SECRET=你的AccessKeySecret
OSS_BUCKET=你的Bucket名称
OSS_CDN_DOMAIN=CDN域名(可选)
OSS_PREFIX=存储路径前缀(如photo-portfolio/)
```

- **Notion API Key**: 从 [Notion Developers](https://developers.notion.com/) 获取
- **Notion Database ID**: 在 Notion 数据库页面 URL 中可以找到
- **阿里云OSS配置**: 
  - 登录阿里云控制台创建 OSS Bucket
  - 在 [AccessKey 管理页面](https://ram.console.aliyun.com/manage/ak) 创建 AccessKey
  - 区域代码可在 OSS Bucket 详情页查看

### 3. 运行程序

```bash
npm run process-images
```

### 4. 程序输出

程序运行完成后，会在以下位置生成文件：

- `downloads/` - 原始下载的图片
- `compressed/` - 压缩后的图片
- `data/albums.json` - 包含所有处理后图片 URL 的数据文件

## 自定义配置

在 `imageProcessor.js` 文件中，可以修改 `CONFIG` 对象来自定义程序行为：

```javascript
const CONFIG = {
  notionDatabaseId: process.env.NOTION_DATABASE_ID,
  localDownloadPath: path.join(__dirname, 'downloads'),      // 原始图片保存路径
  compressedImagesPath: path.join(__dirname, 'compressed'),  // 压缩图片保存路径
  maxSizeInMB: 2,                                            // 压缩目标大小 (MB)
  compressionQuality: 80,                                    // 初始压缩质量 (0-100)
  outputJsonPath: path.join(__dirname, 'data', 'albums.json'),  // 输出JSON路径
  skipExistingImages: true,                                  // 是否跳过已存在的图片
  useOSS: true,                                              // 是否使用阿里云OSS
};
```

## 压缩策略

程序使用多级压缩策略来确保图片大小控制在目标范围内：

1. **质量压缩**: 首先尝试通过降低图片质量来达到目标大小
2. **尺寸压缩**: 如果质量压缩不足以达到目标，则会降低图片分辨率
3. **格式优化**: 保持原始格式 (JPG/PNG)，使用渐进式加载

## 阿里云OSS图片处理

程序利用阿里云OSS的图片处理服务自动生成缩略图，添加以下参数：

- `?x-oss-process=image/resize,w_300` - 生成宽度为300px的缩略图

更多图片处理参数可参考[阿里云OSS图片处理文档](https://help.aliyun.com/document_detail/44686.html)。

## 后续使用

处理完成后，你可以：

1. 运行 `npm run update-website` 更新网站配置，使用本地数据
2. 运行 `npm run start:fast` 启动优化版网站
3. 定期运行此程序，更新网站内容

## 排错指南

- **图片下载失败**: 检查网络连接和 Notion API 令牌是否有效
- **压缩失败**: 确保 Sharp 库安装正确，可能需要额外的系统依赖
- **上传OSS失败**: 验证阿里云 AccessKey 和权限是否正确设置
- **OSS权限问题**: 检查 Bucket 权限设置，确保允许公共读取或配置正确的 CDN

如有任何问题，请检查控制台输出的错误信息。 