require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const FormData = require('form-data');
const { Client } = require('@notionhq/client');
const { promisify } = require('util');
const { mkdirp } = require('mkdirp');
const { rimraf } = require('rimraf');
const OSS = require('ali-oss');

// 初始化Notion客户端
const notion = new Client({ 
  auth: process.env.NOTION_API_KEY 
});

// 阿里云OSS配置
const OSS_CONFIG = {
  region: process.env.OSS_REGION || '',
  accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
  bucket: process.env.OSS_BUCKET || '',
  // CDN 域名 (如果有)
  cdnDomain: process.env.OSS_CDN_DOMAIN || '',
  // 上传路径前缀 (可选)
  prefix: process.env.OSS_PREFIX || 'photo-portfolio/'
};

// 配置项
const CONFIG = {
  notionDatabaseId: process.env.NOTION_DATABASE_ID,
  localDownloadPath: path.join(__dirname, 'downloads'),
  compressedImagesPath: path.join(__dirname, 'compressed'),
  organizedImagesPath: path.join(__dirname, 'organized_images'),
  maxSizeInMB: 2,
  compressionQuality: 80, // 0-100, 越低压缩率越高
  tempDir: path.join(__dirname, 'temp'),
  outputJsonPath: path.join(__dirname, 'data', 'albums.json'),
  skipExistingImages: true, // 如果图片已经处理过，是否跳过
  useOSS: false, // 修改为false，优先保存本地图片
  saveOrganized: true, // 新增：是否按系列和专辑保存组织好的图片
};

// 创建阿里云OSS客户端
function createOssClient() {
  if (!OSS_CONFIG.accessKeyId || !OSS_CONFIG.accessKeySecret || !OSS_CONFIG.bucket || !OSS_CONFIG.region) {
    console.log('阿里云OSS配置不完整，将使用本地图片');
    return null;
  }
  
  try {
    return new OSS({
      region: OSS_CONFIG.region,
      accessKeyId: OSS_CONFIG.accessKeyId,
      accessKeySecret: OSS_CONFIG.accessKeySecret,
      bucket: OSS_CONFIG.bucket
    });
  } catch (error) {
    console.error('创建阿里云OSS客户端失败:', error);
    return null;
  }
}

// 创建必要的目录
async function createDirectories() {
  const dirs = [
    CONFIG.localDownloadPath,
    CONFIG.compressedImagesPath,
    CONFIG.tempDir,
    path.dirname(CONFIG.outputJsonPath)
  ];
  
  for (const dir of dirs) {
    await mkdirp(dir);
    console.log(`创建目录: ${dir}`);
  }
}

// 获取所有系列和专辑
async function getAllSeriesAndAlbums() {
  try {
    console.log('开始获取全部摄影系列和专辑...');
    
    const response = await notion.databases.query({
      database_id: CONFIG.notionDatabaseId,
    });
    
    // 提取所有摄影集并组织数据
    const seriesMap = new Map();
    
    for (const page of response.results) {
      const seriesProperty = page.properties.摄影集?.select;
      const seriesName = seriesProperty?.name || '未分类';
      const seriesId = seriesName.replace(/\s+/g, '-').toLowerCase();
      
      if (!seriesMap.has(seriesId)) {
        seriesMap.set(seriesId, {
          id: seriesId,
          name: seriesName,
          albums: []
        });
      }
      
      // 获取专辑信息
      const albumId = page.id;
      const albumTitle = page.properties['相册']?.title[0]?.text.content || '未命名相册';
      const location = page.properties['地点']?.rich_text[0]?.text.content || '';
      const date = page.properties['拍摄日期']?.date?.start || '';
      
      // 获取封面图片URL
      let coverUrl = '';
      const coverProperty = page.properties['封面'];
      if (coverProperty && coverProperty.files && coverProperty.files.length > 0) {
        coverUrl = coverProperty.files[0].file?.url || coverProperty.files[0].external?.url || '';
      }
      
      // 如果没有封面图片，我们之后会从图片集中获取第一张作为封面
      
      // 将专辑添加到对应的系列中
      seriesMap.get(seriesId).albums.push({
        id: albumId,
        title: albumTitle,
        location: location,
        date: date,
        cover: coverUrl,
        images: [] // 图片集会在后面获取
      });
    }
    
    // 转换为数组格式
    return Array.from(seriesMap.values());
  } catch (error) {
    console.error('获取系列和专辑失败:', error);
    throw error;
  }
}

// 获取专辑的所有图片
async function getAlbumImages(albumId) {
  try {
    console.log(`正在获取专辑 ${albumId} 的图片...`);
    
    // 获取专辑页面详情
    const page = await notion.pages.retrieve({
      page_id: albumId
    });
    
    const images = [];
    
    // 从属性中获取图片
    const imagesProperty = page.properties['图片集'];
    if (imagesProperty && imagesProperty.files) {
      for (const file of imagesProperty.files) {
        const url = file.file?.url || file.external?.url;
        if (url) {
          const fileName = url.split('/').pop().split('?')[0];
          const alt = decodeURIComponent(fileName) || 'image';
          images.push({ 
            src: url, 
            alt: alt,
            processed: false // 标记未处理
          });
        }
      }
    }
    
    // 从页面内容中获取图片
    let hasMore = true;
    let startCursor = undefined;
    
    while (hasMore) {
      const response = await notion.blocks.children.list({
        block_id: albumId,
        start_cursor: startCursor,
      });
      
      for (const block of response.results) {
        if (block.type === 'image') {
          const imageBlock = block.image;
          const url = imageBlock.file?.url || imageBlock.external?.url;
          if (url) {
            const caption = imageBlock.caption?.[0]?.plain_text || '';
            images.push({
              src: url,
              alt: caption || 'image',
              processed: false // 标记未处理
            });
          }
        }
      }
      
      hasMore = response.has_more;
      startCursor = response.next_cursor;
    }
    
    console.log(`专辑 ${albumId} 共找到 ${images.length} 张图片`);
    return images;
  } catch (error) {
    console.error(`获取专辑 ${albumId} 图片失败:`, error);
    return [];
  }
}

// 下载图片到本地
async function downloadImage(imageUrl, savePath) {
  try {
    // 检查文件是否已存在
    if (CONFIG.skipExistingImages && fs.existsSync(savePath)) {
      console.log(`图片已存在，跳过下载: ${savePath}`);
      return true;
    }
    
    console.log(`下载图片: ${imageUrl}`);
    const response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'stream'
    });
    
    const writer = fs.createWriteStream(savePath);
    
    return new Promise((resolve, reject) => {
      response.data.pipe(writer);
      writer.on('finish', () => resolve(true));
      writer.on('error', reject);
    });
  } catch (error) {
    console.error(`下载图片失败 ${imageUrl}:`, error.message);
    return false;
  }
}

// 压缩图片
async function compressImage(inputPath, outputPath) {
  try {
    console.log(`压缩图片: ${inputPath}`);
    
    // 获取原图信息
    const metadata = await sharp(inputPath).metadata();
    
    // 初始压缩质量
    let quality = CONFIG.compressionQuality;
    let compressedImage;
    let outputSize = Infinity;
    
    // 逐步降低质量，直到达到目标大小
    while (outputSize > CONFIG.maxSizeInMB * 1024 * 1024 && quality > 10) {
      // 基于原格式选择压缩方法
      if (metadata.format === 'jpeg' || metadata.format === 'jpg') {
        compressedImage = await sharp(inputPath)
          .jpeg({ quality, progressive: true })
          .toBuffer();
      } else if (metadata.format === 'png') {
        compressedImage = await sharp(inputPath)
          .png({ quality, progressive: true })
          .toBuffer();
      } else {
        // 其他格式都转为 JPEG
        compressedImage = await sharp(inputPath)
          .jpeg({ quality, progressive: true })
          .toBuffer();
      }
      
      outputSize = compressedImage.length;
      
      // 如果还是太大，降低质量继续尝试
      if (outputSize > CONFIG.maxSizeInMB * 1024 * 1024) {
        quality -= 10;
        console.log(`图片仍然过大 (${(outputSize / (1024 * 1024)).toFixed(2)} MB), 降低质量到 ${quality}%`);
      }
    }
    
    // 如果质量太低还是太大，尝试降低分辨率
    if (outputSize > CONFIG.maxSizeInMB * 1024 * 1024) {
      console.log(`质量压缩不足，开始降低分辨率...`);
      
      // 计算新的分辨率
      const aspectRatio = metadata.width / metadata.height;
      let newWidth = Math.sqrt((CONFIG.maxSizeInMB * 1024 * 1024 * 8) / aspectRatio);
      newWidth = Math.min(newWidth, metadata.width * 0.8); // 最多降低20%
      
      if (metadata.format === 'jpeg' || metadata.format === 'jpg') {
        compressedImage = await sharp(inputPath)
          .resize(Math.round(newWidth))
          .jpeg({ quality: 70, progressive: true })
          .toBuffer();
      } else if (metadata.format === 'png') {
        compressedImage = await sharp(inputPath)
          .resize(Math.round(newWidth))
          .png({ quality: 70, progressive: true })
          .toBuffer();
      } else {
        compressedImage = await sharp(inputPath)
          .resize(Math.round(newWidth))
          .jpeg({ quality: 70, progressive: true })
          .toBuffer();
      }
      
      outputSize = compressedImage.length;
    }
    
    // 写入压缩后的图片
    await fs.promises.writeFile(outputPath, compressedImage);
    
    const originalSize = (await fs.promises.stat(inputPath)).size;
    const compressedSize = (await fs.promises.stat(outputPath)).size;
    
    console.log(`压缩完成: ${(originalSize / (1024 * 1024)).toFixed(2)} MB -> ${(compressedSize / (1024 * 1024)).toFixed(2)} MB (${Math.round((1 - compressedSize / originalSize) * 100)}% 减少)`);
    
    return true;
  } catch (error) {
    console.error(`压缩图片失败 ${inputPath}:`, error);
    return false;
  }
}

// 上传图片到阿里云OSS
async function uploadToOSS(imagePath, objectName) {
  const ossClient = createOssClient();
  if (!ossClient) {
    console.log('OSS客户端未初始化，跳过上传');
    return { success: false, url: '' };
  }
  
  try {
    console.log(`上传图片到阿里云OSS: ${imagePath}`);
    // 构建完整的对象名，添加前缀
    const fullObjectName = `${OSS_CONFIG.prefix}${objectName}`;
    
    // 上传文件
    const result = await ossClient.put(fullObjectName, imagePath);
    
    if (result.res.status === 200) {
      // 构建URL
      let url;
      if (OSS_CONFIG.cdnDomain) {
        // 使用CDN域名
        url = `https://${OSS_CONFIG.cdnDomain}/${fullObjectName}`;
      } else {
        // 使用OSS默认域名
        url = result.url;
      }
      
      // 生成缩略图URL (使用OSS的图片处理服务)
      const thumbnailUrl = `${url}?x-oss-process=image/resize,w_300`;
      
      console.log(`图片上传成功: ${url}`);
      return {
        success: true,
        url: url,
        display_url: url,
        thumbnail: thumbnailUrl
      };
    } else {
      console.error('图片上传失败:', result);
      return { success: false, url: '' };
    }
  } catch (error) {
    console.error(`上传图片失败 ${imagePath}:`, error.message);
    return { success: false, url: '' };
  }
}

// 处理单个图片 - 下载、压缩、上传
async function processImage(imageUrl, albumId, imageIndex) {
  try {
    // 生成文件名
    const urlObj = new URL(imageUrl);
    const originalFilename = path.basename(urlObj.pathname).split('?')[0];
    const fileExtension = path.extname(originalFilename) || '.jpg';
    const safeFilename = `${albumId.substring(0, 8)}_image${imageIndex}${fileExtension}`