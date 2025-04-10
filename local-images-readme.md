# Notion 图片本地化使用指南

这个工具可以将 Notion 中的所有图片下载到本地，并按照系列和专辑组织，让网站可以直接使用本地图片，不再依赖 Notion API。

## 工具特点

- 自动从 Notion 下载所有摄影系列、专辑的图片
- 按照系列名称和专辑标题组织图片
- 压缩图片到指定大小（默认2MB）
- 自动识别和处理封面图片
- 生成可供网站使用的 JSON 数据
- 提供专用服务器脚本，使用本地图片运行网站

## 使用步骤

### 1. 下载所有图片

运行以下命令从 Notion 下载所有图片：

```bash
npm run download-images
```

程序会：
- 连接 Notion API 获取所有系列和专辑信息
- 创建 `notion_images` 目录和对应的系列、专辑子目录
- 下载并压缩所有图片
- 将图片保存到相应的目录中
- 生成 `data/organized_albums.json` 数据文件

### 2. 使用本地图片运行网站

下载完成后，运行以下命令启动使用本地图片的网站：

```bash
npm run start:local
```

此时网站将完全使用本地图片，不再从 Notion 获取数据。

## 目录结构

处理完成后，你将看到以下目录结构：

```
notion_images/
├── 系列1/
│   ├── 专辑1/
│   │   ├── cover.jpg      # 封面图片
│   │   ├── image_1.jpg    # 专辑中的图片
│   │   ├── image_2.jpg
│   │   └── ...
│   ├── 专辑2/
│   │   └── ...
│   └── ...
├── 系列2/
│   └── ...
└── ...
```

## 配置选项

你可以在 `organize-images.js` 文件中修改 `CONFIG` 对象来自定义处理行为：

```javascript
const CONFIG = {
  notionDatabaseId: process.env.NOTION_DATABASE_ID,
  baseDir: path.join(__dirname, 'notion_images'),     // 保存图片的基础目录
  skipExistingImages: true,                           // 跳过已存在的图片
  compressImages: true,                               // 是否压缩图片
  maxSizeInMB: 2,                                     // 压缩后的最大大小
  compressionQuality: 80,                             // 压缩质量
  outputJsonPath: path.join(__dirname, 'data', 'organized_albums.json')
};
```

## 更新图片

当你在 Notion 中更新了内容后，只需重新运行下载命令：

```bash
npm run download-images
```

程序会检查已有图片，只下载新增或修改的图片，然后更新 JSON 数据。

## 优势

使用本地图片的优势：

1. **更快的加载速度**：直接从本地服务器加载图片，不再依赖 Notion 的响应速度
2. **更稳定的体验**：不受 Notion API 限制和网络波动影响
3. **更好的图片优化**：自动处理的图片大小和质量更加适合网页加载
4. **离线可用**：即使 Notion 服务不可用，网站仍然可以正常工作
5. **减少带宽使用**：不需要反复从 Notion 获取大型图片

## 故障排除

- **下载失败**：检查网络连接和 Notion API 令牌
- **图片丢失**：确认 Notion 页面中的图片格式是否支持下载
- **网站加载问题**：检查 JSON 数据文件路径和图片路径是否正确

如果需要从头开始，可以删除 `notion_images` 目录和 `data/organized_albums.json` 文件，然后重新运行下载命令。 