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
  prefix: (process.env.OSS_PREFIX || 'photo-portfolio/').replace(/[/]?$/, '/')
};

// 配置项
const CONFIG = {
  notionDatabaseId: process.env.NOTION_DATABASE_ID,
  tempDir: path.join(__dirname, 'temp'),
  outputJsonPath: path.join(__dirname, 'data', 'albums.json'),
  processedImagesRecordPath: path.join(__dirname, 'data', 'processed_images.json'),
  maxSizeInMB: 2,
  compressionQuality: 80, // 0-100, 越低压缩率越高
  skipExistingImages: true, // 如果图片已经处理过 (记录在案)，是否跳过
  useOSS: true, // 默认使用OSS，如果配置不完整则自动降级
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
    CONFIG.tempDir,
    path.dirname(CONFIG.outputJsonPath),
    path.dirname(CONFIG.processedImagesRecordPath)
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
  if (!CONFIG.useOSS || !ossClient) {
    console.log('OSS未启用或配置不完整，跳过上传，将使用本地路径（如果支持）。');
    return { success: false, url: '', thumbnailUrl: '', display_url: '' };
  }

  try {
    console.log(`  上传图片到阿里云OSS: ${path.basename(imagePath)} -> ${objectName}`);
    const fullObjectName = `${OSS_CONFIG.prefix}${objectName}`.replace(/^\/+/, '');

    const result = await ossClient.put(fullObjectName, imagePath);

    if (result.res.status === 200) {
      let url;
      if (OSS_CONFIG.cdnDomain) {
        url = `https://${OSS_CONFIG.cdnDomain}/${fullObjectName}`;
      } else {
        url = `https://${OSS_CONFIG.bucket}.${OSS_CONFIG.region}.aliyuncs.com/${fullObjectName}`;
      }

      const thumbnailUrl = `${url}?x-oss-process=image/resize,w_300/quality,q_80`;
      const displayUrl = `${url}?x-oss-process=image/resize,w_1200/quality,q_85`;

      console.log(`  图片上传成功: ${url}`);
      return {
        success: true,
        url: url,
        display_url: displayUrl,
        thumbnail: thumbnailUrl
      };
    } else {
      console.error('  图片上传失败:'), result.res.statusMessage;
      return { success: false, url: '', thumbnailUrl: '', display_url: '' };
    }
  } catch (error) {
    console.error(`  上传图片失败 ${path.basename(imagePath)}:`), error.message;
    return { success: false, url: '', thumbnailUrl: '', display_url: '' };
  }
}

// 新增参数: seriesName, albumName
async function processImage(imageUrl, seriesName, albumName, albumId, imageIndex, processedImages, chalk) {
  let tempSavePath = '';
  try {
    if (CONFIG.skipExistingImages && processedImages[imageUrl]) {
        console.log(chalk.cyan(`  图片已处理过 (根据记录): ${imageUrl} -> ${processedImages[imageUrl].url}`));
        return processedImages[imageUrl];
    }

    console.log(chalk.blue(`处理图片 ${imageIndex}: ${imageUrl}`));

    const urlObj = new URL(imageUrl);
    const originalFilename = path.basename(urlObj.pathname).split('?')[0];
    const fileExtension = path.extname(originalFilename) || '.jpg';
    const safeFilenameBase = `${seriesName}_${albumName}_${imageIndex}`.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const safeFilename = `${safeFilenameBase}${fileExtension}`;

    const tempDownloadDir = path.join(CONFIG.tempDir, 'downloads');
    await mkdirp(tempDownloadDir);
    tempSavePath = path.join(tempDownloadDir, safeFilename);

    const downloaded = await downloadImage(imageUrl, tempSavePath);
    if (!downloaded) {
      console.error(chalk.red(`  下载图片失败: ${imageUrl}`));
      return null;
    }

    const tempCompressDir = path.join(CONFIG.tempDir, 'compressed');
    await mkdirp(tempCompressDir);
    const compressedPath = path.join(tempCompressDir, safeFilename);
    const compressed = await compressImage(tempSavePath, compressedPath);

    const sourcePathForUpload = compressed ? compressedPath : tempSavePath;

    const ossObjectName = path.join(seriesName, albumName, safeFilename).replace(/\\/g, '/');

    const uploadResult = await uploadToOSS(sourcePathForUpload, ossObjectName);

    try {
        await fs.promises.unlink(tempSavePath);
        if (compressed) await fs.promises.unlink(compressedPath);
        console.log(chalk.gray(`  已删除临时文件: ${path.basename(tempSavePath)}${compressed ? ', ' + path.basename(compressedPath) : ''}`));
    } catch (cleanupError) {
        console.warn(chalk.yellow(`  清理临时文件失败: ${cleanupError.message}`));
    }

    if (!uploadResult || !uploadResult.success) {
      console.error(chalk.red(`  处理图片失败 (上传步骤): ${safeFilename}`));
      return null;
    }

    console.log(chalk.green(`  成功处理图片: ${path.basename(safeFilename)}`));
    return {
        original_url: imageUrl,
        url: uploadResult.url,
        display_url: uploadResult.display_url,
        thumbnail: uploadResult.thumbnail,
        alt: path.basename(safeFilename, fileExtension).replace(/_/g, ' ')
    };

  } catch (error) {
    console.error(chalk.red(`处理图片 ${imageUrl} 时发生严重错误:`), error);
    if (tempSavePath && fs.existsSync(tempSavePath)) {
        try { await fs.promises.unlink(tempSavePath); } catch (e) {}
    }
    return null;
  }
}

async function main() {
  const chalk = (await import('chalk')).default;
  console.log(chalk.bold.yellow('=== 开始图片处理流程 ==='));
  const startTime = Date.now();

  let processedImages = {};
  try {
    if (fs.existsSync(CONFIG.processedImagesRecordPath)) {
      const data = await fs.promises.readFile(CONFIG.processedImagesRecordPath, 'utf-8');
      processedImages = JSON.parse(data);
      console.log(chalk.gray(`已加载 ${Object.keys(processedImages).length} 条已处理图片记录`));
    }
  } catch (err) {
    console.warn(chalk.yellow('加载已处理图片记录失败，将重新处理所有图片:', err.message));
    processedImages = {};
  }

  try {
    await createDirectories();
    await rimraf(CONFIG.tempDir);
    await mkdirp(CONFIG.tempDir);
    console.log(chalk.gray('已清理并创建临时目录'));

    const seriesData = await getAllSeriesAndAlbums();
    if (!seriesData || seriesData.length === 0) {
      console.log(chalk.yellow('未能获取到任何系列和专辑信息。'));
      return;
    }
    console.log(chalk.cyan(`获取到 ${seriesData.length} 个系列`));

    let totalImagesProcessed = 0;
    let totalImagesSkipped = 0;

    for (const series of seriesData) {
      console.log(chalk.magenta(`\n处理系列: ${series.name}`));
      const seriesNameForPath = series.name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');

      if (!series.albums || series.albums.length === 0) {
          console.log(chalk.yellow('  此系列下没有专辑。'));
          continue;
      }

      for (const album of series.albums) {
        console.log(chalk.blue(`  处理专辑: ${album.title}`));
        const albumNameForPath = album.title.replace(/[^a-zA-Z0-9_\-\.]/g, '_');

        const imagesToProcess = await getAlbumImages(album.id);
        album.images = [];

        if (!imagesToProcess || imagesToProcess.length === 0) {
            console.log(chalk.yellow('    此专辑下没有图片。'));
            continue;
        }
         console.log(chalk.gray(`    找到 ${imagesToProcess.length} 张图片待处理...`));

        let imageIndex = 1;
        for (const image of imagesToProcess) {
          const result = await processImage(
            image.src,
            seriesNameForPath,
            albumNameForPath,
            album.id,
            imageIndex,
            processedImages,
            chalk
          );

          if (result) {
            if (processedImages[image.src] && CONFIG.skipExistingImages) {
                 album.images.push(processedImages[image.src]);
                 totalImagesSkipped++;
            } else if (result.url) {
                 album.images.push(result);
                 processedImages[image.src] = result;
                 totalImagesProcessed++;
            } else {
                 console.warn(chalk.yellow(`    处理图片 ${imageIndex} (${image.src}) 失败，已跳过。`));
            }
          } else {
               console.warn(chalk.yellow(`    处理图片 ${imageIndex} (${image.src}) 失败，已跳过。`));
          }
          imageIndex++;
        }

        if (!album.cover && album.images.length > 0) {
            album.cover = album.images[0].url;
            album.cover_thumbnail = album.images[0].thumbnail;
            console.log(chalk.gray(`    已设置专辑封面为第一张图片: ${album.cover}`));
        } else if (album.cover) {
            console.log(chalk.blue('    处理专辑封面图片...'));
            const coverResult = await processImage(
                album.cover,
                seriesNameForPath,
                albumNameForPath,
                album.id,
                'cover',
                processedImages,
                chalk
            );
             if (coverResult && coverResult.url) {
                 album.cover = coverResult.url;
                 album.cover_thumbnail = coverResult.thumbnail;
                 processedImages[album.cover] = coverResult;
                 totalImagesProcessed++;
                 console.log(chalk.green(`    专辑封面处理成功: ${album.cover}`));
             } else if (processedImages[album.cover] && CONFIG.skipExistingImages) {
                 album.cover = processedImages[album.cover].url;
                 album.cover_thumbnail = processedImages[album.cover].thumbnail;
                 totalImagesSkipped++;
                 console.log(chalk.cyan(`    专辑封面已处理过 (根据记录): ${album.cover}`));
             } else {
                 console.warn(chalk.yellow('    处理专辑封面图片失败，保留原始URL或为空。'));
                 album.cover_thumbnail = '';
             }
        }
      }
    }

    try {
        await fs.promises.writeFile(CONFIG.outputJsonPath, JSON.stringify(seriesData, null, 2));
        console.log(chalk.bold.green(`\n✅ 专辑数据已成功保存到: ${CONFIG.outputJsonPath}`));
    } catch (writeError) {
        console.error(chalk.red(`保存专辑数据到 JSON 文件失败: ${writeError.message}`));
    }

    try {
        await fs.promises.writeFile(CONFIG.processedImagesRecordPath, JSON.stringify(processedImages, null, 2));
        console.log(chalk.gray(`已处理图片记录已保存到: ${CONFIG.processedImagesRecordPath}`));
    } catch (writeError) {
        console.error(chalk.red(`保存已处理图片记录失败: ${writeError.message}`));
    }

    await rimraf(CONFIG.tempDir);
    console.log(chalk.gray('已清理临时目录'));

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    console.log(chalk.bold.yellow(`\n=== 图片处理流程结束 ===`));
    console.log(chalk.cyan(`总耗时: ${duration} 秒`));
    console.log(chalk.green(`成功处理图片: ${totalImagesProcessed} 张`));
    console.log(chalk.cyan(`跳过已处理图片: ${totalImagesSkipped} 张`));

  } catch (error) {
    console.error(chalk.bold.red('\n处理流程发生严重错误:'), error);
    try { await rimraf(CONFIG.tempDir); } catch (e) {}
  }
}

main();