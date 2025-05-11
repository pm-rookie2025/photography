require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const { Client } = require('@notionhq/client');
const { mkdirp } = require('mkdirp');
const cliProgress = require('cli-progress');
const colors = require('ansi-colors');
const { filesize } = require('filesize');
const OSS = require('ali-oss');

// 初始化Notion客户端
const notion = new Client({ 
  auth: process.env.NOTION_API_KEY 
});

// 初始化阿里云OSS客户端
const ossClient = new OSS({
  region: process.env.OSS_REGION,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET,
});

// 配置项
const CONFIG = {
  notionDatabaseId: process.env.NOTION_DATABASE_ID,
  baseDir: path.join(__dirname, 'notion_images'), // 临时目录，用于处理图片
  skipExistingImages: process.env.FORCE_UPDATE === 'true' ? false : true, // 如果图片已经存在，是否跳过
  compressImages: true, // 是否压缩图片
  maxSizeInMB: 2, // 压缩后的最大大小
  compressionQuality: 80, // 压缩质量
  outputJsonPath: path.join(__dirname, 'data', 'organized_albums.json'),
  incrementalUpdate: process.env.FORCE_UPDATE === 'true' ? false : true, // 增量更新，只处理新增图片
  imageRecordPath: path.join(__dirname, 'data', 'processed_images.json'), // 记录已处理图片的文件
  useOSS: true, // 是否使用阿里云OSS
  ossPrefix: process.env.OSS_PREFIX || 'photo-portfolio/', // OSS前缀路径
  ossCDNDomain: process.env.OSS_CDN_DOMAIN || null // OSS CDN域名
};

// 创建文件夹
async function createDirectory(dirPath) {
  await mkdirp(dirPath);
  console.log(`创建目录: ${dirPath}`);
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
      // 使用系列名作为目录名，替换非法字符
      const seriesId = seriesName.replace(/[\/\\?%*:|"<>]/g, '-').trim();
      
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
      // 使用专辑标题作为目录名，替换非法字符
      const albumDirName = albumTitle.replace(/[\/\\?%*:|"<>]/g, '-').trim();
      const location = page.properties['地点']?.rich_text[0]?.text.content || '';
      const date = page.properties['拍摄日期']?.date?.start || '';
      
      // 获取封面图片URL
      let coverUrl = '';
      const coverProperty = page.properties['封面'];
      if (coverProperty && coverProperty.files && coverProperty.files.length > 0) {
        coverUrl = coverProperty.files[0].file?.url || coverProperty.files[0].external?.url || '';
      }
      
      // 将专辑添加到对应的系列中
      seriesMap.get(seriesId).albums.push({
        id: albumId,
        title: albumTitle,
        dirName: albumDirName,
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
            processed: false
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
              processed: false
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

// 上传图片到阿里云OSS
async function uploadToOSS(localFilePath, ossPath) {
  try {
    console.log(`上传图片到OSS: ${localFilePath} -> ${ossPath}`);
    
    // 设置上传进度条
    const stats = fs.statSync(localFilePath);
    const fileSize = stats.size;
    
    const progressBar = new cliProgress.SingleBar({
      format: '上传进度 |' + colors.yellow('{bar}') + '| {percentage}% | {value}/{total} KB',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });
    
    progressBar.start(Math.round(fileSize/1024), 0);
    
    // 上传到OSS，带进度监控
    const result = await ossClient.put(ossPath, localFilePath, {
      progress: (p, checkpoint) => {
        progressBar.update(Math.round((p * fileSize)/1024));
      }
    });
    
    progressBar.update(Math.round(fileSize/1024));
    progressBar.stop();
    
    // 生成访问URL
    let url;
    if (CONFIG.ossCDNDomain) {
      url = `https://${CONFIG.ossCDNDomain}/${ossPath}`;
    } else {
      url = result.url;
    }
    
    console.log(`上传成功: ${url}`);
    return { success: true, url: url };
  } catch (error) {
    console.error(`上传到OSS失败: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// 检查图片是否已存在于OSS
async function checkImageExistsInOSS(ossPath) {
  try {
    await ossClient.head(ossPath);
    return true;
  } catch (error) {
    if (error.code === 'NoSuchKey') {
      return false;
    }
    console.error(`检查OSS路径失败: ${error.message}`);
    throw error;
  }
}

// 处理图片的函数
async function processImage(imageUrl, outputPath, tempPath) {
  try {
    // 如果使用OSS，需要处理OSS路径
    let ossPath = null;
    let ossUrl = null;
    if (CONFIG.useOSS) {
      ossPath = outputPath.replace(CONFIG.baseDir + path.sep, CONFIG.ossPrefix).replace(/\\/g, '/');
      
      // 检查OSS上是否已存在该图片
      if (CONFIG.skipExistingImages) {
        try {
          const exists = await checkImageExistsInOSS(ossPath);
          if (exists) {
            console.log(`图片已存在于OSS，跳过: ${ossPath}`);
            
            // 生成OSS URL
            if (CONFIG.ossCDNDomain) {
              ossUrl = `https://${CONFIG.ossCDNDomain}/${ossPath}`;
            } else {
              ossUrl = `https://${process.env.OSS_BUCKET}.${process.env.OSS_REGION}.aliyuncs.com/${ossPath}`;
            }
            
            return { 
              success: true, 
              path: ossPath,
              url: ossUrl,
              isOSS: true
            };
          }
        } catch (error) {
          console.warn(`检查OSS路径失败，将继续处理: ${error.message}`);
        }
      }
    }
    
    // 检查本地目标文件是否已存在（仅在不使用OSS时有效）
    if (!CONFIG.useOSS && CONFIG.skipExistingImages && fs.existsSync(outputPath)) {
      console.log(`图片已存在，跳过下载: ${outputPath}`);
      return { success: true, path: outputPath };
    }
    
    // 创建一个写入流
    const writer = fs.createWriteStream(tempPath);
    
    // 下载图片
    console.log(`下载图片: ${imageUrl} -> ${tempPath}`);
    const response = await axios({
      url: imageUrl,
      method: 'GET',
      responseType: 'stream',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    // 获取原始文件大小
    const originalSize = parseInt(response.headers['content-length'] || '0');
    
    // 创建一个Promise来等待下载完成
    const downloadPromise = new Promise((resolve, reject) => {
      // 设置下载进度条
      const progressBar = new cliProgress.SingleBar({
        format: '下载进度 |' + colors.cyan('{bar}') + '| {percentage}% | {value}/{total} KB',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true
      });
      
      if (originalSize > 0) {
        progressBar.start(Math.round(originalSize/1024), 0);
        
        // 设置进度更新
        let downloadedBytes = 0;
        response.data.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          progressBar.update(Math.round(downloadedBytes/1024));
        });
      }
      
      writer.on('finish', () => {
        if (originalSize > 0) {
          progressBar.stop();
        }
        resolve();
      });
      
      writer.on('error', (err) => {
        if (originalSize > 0) {
          progressBar.stop();
        }
        reject(err);
      });
    });
    
    // 管道连接响应流到文件写入流
    response.data.pipe(writer);
    
    // 等待下载完成
    await downloadPromise;
    
    // 如果需要压缩图片
    if (CONFIG.compressImages) {
      console.log(`压缩图片: ${tempPath} -> ${ossPath || outputPath}`);
      
      try {
        // 获取原始文件大小
        const stats = fs.statSync(tempPath);
        const originalSizeInMB = stats.size / (1024 * 1024);
        
        // 如果文件大小已经小于最大限制
        if (originalSizeInMB <= CONFIG.maxSizeInMB) {
          // 如果使用OSS，直接上传到OSS
          if (CONFIG.useOSS) {
            const uploadResult = await uploadToOSS(tempPath, ossPath);
            
            // 删除临时文件
            await fs.promises.unlink(tempPath);
            
            if (uploadResult.success) {
              console.log(`图片无需压缩，已上传到OSS: ${uploadResult.url}`);
              return { 
                success: true, 
                path: ossPath, 
                url: uploadResult.url, 
                size: stats.size,
                isOSS: true
              };
            } else {
              throw new Error(`上传到OSS失败: ${uploadResult.error}`);
            }
          } else {
            // 不使用OSS，移动到输出路径
            await fs.promises.rename(tempPath, outputPath);
            console.log(`图片已保存，无需压缩 (${filesize(stats.size)}): ${outputPath}`);
            return { success: true, path: outputPath, size: stats.size };
          }
        }
        
        // 设置压缩进度条
        const compressionBar = new cliProgress.SingleBar({
          format: '压缩进度 |' + colors.green('{bar}') + '| 压缩中...',
          barCompleteChar: '\u2588',
          barIncompleteChar: '\u2591',
          hideCursor: true
        });
        
        compressionBar.start(100, 0);
        compressionBar.update(10); // 更新进度为10%
        
        // 获取图片信息
        const metadata = await sharp(tempPath).metadata();
        compressionBar.update(30); // 更新进度为30%
        
        // 根据文件类型进行不同的处理
        let processedImage;
        const ext = path.extname(outputPath).toLowerCase();
        
        if (ext === '.jpg' || ext === '.jpeg') {
          processedImage = await sharp(tempPath)
            .jpeg({ quality: CONFIG.compressionQuality })
            .toBuffer();
        } else if (ext === '.png') {
          processedImage = await sharp(tempPath)
            .png({ quality: CONFIG.compressionQuality })
            .toBuffer();
        } else if (ext === '.webp') {
          processedImage = await sharp(tempPath)
            .webp({ quality: CONFIG.compressionQuality })
            .toBuffer();
        } else {
          // 对于其他格式，保持原样
          processedImage = await sharp(tempPath).toBuffer();
        }
        
        compressionBar.update(70); // 更新进度为70%
        
        // 压缩图片的临时文件路径
        const compressedTempPath = tempPath + '.compressed';
        
        // 写入压缩后的图片到临时文件
        await fs.promises.writeFile(compressedTempPath, processedImage);
        
        // 获取压缩后的文件大小
        const compressedStats = fs.statSync(compressedTempPath);
        const compressedSizeInMB = compressedStats.size / (1024 * 1024);
        
        compressionBar.update(90); // 更新进度为90%
        
        // 输出压缩结果
        const compressionRatio = (1 - (compressedStats.size / stats.size)) * 100;
        console.log(`图片已压缩: ${filesize(stats.size)} -> ${filesize(compressedStats.size)} (节省了 ${compressionRatio.toFixed(2)}%)`);
        
        // 如果使用OSS，上传到OSS
        let result;
        if (CONFIG.useOSS) {
          const uploadResult = await uploadToOSS(compressedTempPath, ossPath);
          
          if (uploadResult.success) {
            result = { 
              success: true, 
              path: ossPath, 
              url: uploadResult.url, 
              originalSize: stats.size,
              compressedSize: compressedStats.size,
              compressionRatio: compressionRatio,
              isOSS: true
            };
          } else {
            throw new Error(`上传到OSS失败: ${uploadResult.error}`);
          }
        } else {
          // 不使用OSS，移动到输出路径
          await fs.promises.rename(compressedTempPath, outputPath);
          result = { 
            success: true, 
            path: outputPath,
            originalSize: stats.size,
            compressedSize: compressedStats.size,
            compressionRatio: compressionRatio
          };
        }
        
        compressionBar.update(100); // 完成
        compressionBar.stop();
        
        // 删除临时文件
        await fs.promises.unlink(tempPath);
        if (fs.existsSync(compressedTempPath)) {
          await fs.promises.unlink(compressedTempPath);
        }
        
        return result;
      } catch (error) {
        console.error(`压缩图片失败: ${error.message}`);
        
        // 如果压缩失败，但下载成功
        if (CONFIG.useOSS) {
          try {
            // 尝试直接上传原图
            const uploadResult = await uploadToOSS(tempPath, ossPath);
            
            // 删除临时文件
            await fs.promises.unlink(tempPath);
            
            if (uploadResult.success) {
              console.log(`压缩失败，但已上传原图到OSS: ${uploadResult.url}`);
              return { 
                success: true, 
                path: ossPath, 
                url: uploadResult.url,
                isOSS: true
              };
            } else {
              throw new Error(`上传到OSS失败: ${uploadResult.error}`);
            }
          } catch (uploadError) {
            console.error(`上传原图到OSS失败: ${uploadError.message}`);
            return { success: false, error: uploadError.message };
          }
        } else {
          // 不使用OSS，直接使用原始文件
          await fs.promises.rename(tempPath, outputPath);
          return { success: true, path: outputPath };
        }
      }
    } else {
      // 不压缩，直接上传或移动文件
      if (CONFIG.useOSS) {
        const uploadResult = await uploadToOSS(tempPath, ossPath);
        
        // 删除临时文件
        await fs.promises.unlink(tempPath);
        
        if (uploadResult.success) {
          return { 
            success: true, 
            path: ossPath, 
            url: uploadResult.url,
            isOSS: true
          };
        } else {
          return { success: false, error: uploadResult.error };
        }
      } else {
        // 直接移动文件
        await fs.promises.rename(tempPath, outputPath);
        return { success: true, path: outputPath };
      }
    }
  } catch (error) {
    console.error(`处理图片失败 ${imageUrl}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// 主函数
async function main() {
  try {
    console.log('=== 开始下载和组织Notion图片 ===');
    
    if (CONFIG.useOSS) {
      console.log(`使用阿里云OSS存储图片，Bucket: ${process.env.OSS_BUCKET}，前缀路径: ${CONFIG.ossPrefix}`);
    }
    
    // 创建基础目录
    await createDirectory(CONFIG.baseDir);
    await createDirectory(path.dirname(CONFIG.outputJsonPath));
    const tempDir = path.join(CONFIG.baseDir, '_temp');
    await createDirectory(tempDir);
    
    // 统计信息
    const stats = {
      totalProcessedAlbums: 0,
      totalSkippedAlbums: 0,
      totalProcessedImages: 0,
      totalSkippedImages: 0,
      totalOriginalSize: 0,
      totalCompressedSize: 0,
      startTime: Date.now()
    };
    
    // 读取已处理图片记录
    let processedImages = {};
    let existingData = null;
    
    if (CONFIG.incrementalUpdate) {
      // 尝试读取已处理图片记录
      try {
        if (fs.existsSync(CONFIG.imageRecordPath)) {
          processedImages = JSON.parse(fs.readFileSync(CONFIG.imageRecordPath, 'utf8'));
          console.log(`已加载处理记录，共 ${Object.keys(processedImages).length} 张图片`);
        } else {
          console.log('未找到已处理图片记录，将创建新记录');
        }
      } catch (error) {
        console.warn('读取已处理图片记录失败:', error);
        processedImages = {};
      }
      
      // 尝试读取现有的专辑数据
      try {
        if (fs.existsSync(CONFIG.outputJsonPath)) {
          existingData = JSON.parse(fs.readFileSync(CONFIG.outputJsonPath, 'utf8'));
          console.log(`已加载现有专辑数据，共 ${existingData.series.length} 个系列`);
        }
      } catch (error) {
        console.warn('读取现有专辑数据失败:', error);
        existingData = null;
      }
    }
    
    // 获取所有系列和专辑
    const allSeries = await getAllSeriesAndAlbums();
    console.log(`获取到 ${allSeries.length} 个系列，共 ${allSeries.reduce((acc, series) => acc + series.albums.length, 0)} 个专辑`);
    
    // 记录新处理的图片
    const newProcessedImages = {...processedImages};
    
    // 处理每个系列下的每个专辑
    const multibar = new cliProgress.MultiBar({
      clearOnComplete: false,
      hideCursor: true,
      format: '{name} [{bar}] {percentage}% | {value}/{total}'
    }, cliProgress.Presets.shades_classic);
    
    const seriesBar = multibar.create(allSeries.length, 0, { name: '系列进度' });
    
    for (let seriesIndex = 0; seriesIndex < allSeries.length; seriesIndex++) {
      const series = allSeries[seriesIndex];
      seriesBar.update(seriesIndex);
      console.log(`\n处理系列 (${seriesIndex+1}/${allSeries.length}): ${series.name}`);
      
      // 创建系列目录
      const seriesDir = path.join(CONFIG.baseDir, series.id);
      await createDirectory(seriesDir);
      
      const albumBar = multibar.create(series.albums.length, 0, { name: '专辑进度' });
      
      for (let albumIndex = 0; albumIndex < series.albums.length; albumIndex++) {
        const album = series.albums[albumIndex];
        albumBar.update(albumIndex);
        console.log(`\n处理专辑 (${albumIndex+1}/${series.albums.length}): ${album.title} (${album.id})`);
        
        // 创建专辑目录
        const albumDir = path.join(seriesDir, album.dirName);
        await createDirectory(albumDir);
        
        // 检查是否需要处理该专辑
        const shouldProcessAlbum = needToProcessAlbum(album, existingData);
        if (!shouldProcessAlbum && CONFIG.incrementalUpdate) {
          console.log(`专辑 "${album.title}" 无变化，使用现有数据`);
          
          // 复制现有数据
          const existingAlbum = findExistingAlbum(album.id, existingData);
          if (existingAlbum) {
            album.coverPath = existingAlbum.coverPath;
            album.images = existingAlbum.images;
            delete album.cover;
            stats.totalSkippedAlbums++;
            continue;
          }
        }
        
        stats.totalProcessedAlbums++;
        
        // 获取专辑图片
        const albumImages = await getAlbumImages(album.id);
        
        // 处理封面图片
        if (album.cover) {
          console.log('处理封面图片...');
          
          // 生成封面文件名和路径
          const coverFileName = `cover${path.extname(new URL(album.cover).pathname) || '.jpg'}`;
          const coverPath = path.join(albumDir, coverFileName);
          const tempCoverPath = path.join(tempDir, `temp_cover_${album.id}${path.extname(coverPath)}`);
          
          // 检查是否已处理过该封面
          const coverKey = `cover:${album.id}:${album.cover}`;
          if (processedImages[coverKey] && ((CONFIG.useOSS && await checkImageExistsInOSS(processedImages[coverKey].path)) || 
              (!CONFIG.useOSS && fs.existsSync(coverPath))) && CONFIG.incrementalUpdate) {
            console.log(`封面图片已处理，跳过: ${processedImages[coverKey].path}`);
            album.coverPath = processedImages[coverKey].path;
            if (CONFIG.useOSS && processedImages[coverKey].url) {
              album.coverUrl = processedImages[coverKey].url;
            }
            stats.totalSkippedImages++;
          } else {
            // 处理封面图片
            const coverResult = await processImage(album.cover, coverPath, tempCoverPath);
            
            if (coverResult.success) {
              album.coverPath = coverResult.path;
              if (CONFIG.useOSS && coverResult.url) {
                album.coverUrl = coverResult.url;
              }
              stats.totalProcessedImages++;
              
              // 更新压缩统计
              if (coverResult.originalSize && coverResult.compressedSize) {
                stats.totalOriginalSize += coverResult.originalSize;
                stats.totalCompressedSize += coverResult.compressedSize;
              }
              
              // 记录已处理的封面
              newProcessedImages[coverKey] = {
                processedAt: new Date().toISOString(),
                path: coverResult.path,
                url: coverResult.url
              };
            }
          }
        } else if (albumImages.length > 0) {
          // 如果没有封面，使用第一张图片作为封面
          console.log('未找到封面图片，将使用第一张图片作为封面');
        }
        
        // 处理所有图片
        const processedImagesList = [];
        const imageBar = multibar.create(albumImages.length, 0, { name: '图片进度' });
        
        for (let i = 0; i < albumImages.length; i++) {
          const image = albumImages[i];
          imageBar.update(i);
          console.log(`处理图片 ${i + 1}/${albumImages.length}: ${image.src}`);
          
          // 生成安全的文件名
          const urlObj = new URL(image.src);
          const originalFilename = path.basename(urlObj.pathname).split('?')[0];
          const fileExtension = path.extname(originalFilename) || '.jpg';
          const safeFilename = `image_${i+1}${fileExtension}`;
          
          // 设置保存路径
          const imagePath = path.join(albumDir, safeFilename);
          const tempImagePath = path.join(tempDir, `temp_${album.id}_${i}${fileExtension}`);
          
          // 检查是否已处理过该图片
          const imageKey = `image:${album.id}:${image.src}`;
          if (processedImages[imageKey] && ((CONFIG.useOSS && await checkImageExistsInOSS(processedImages[imageKey].path)) || 
              (!CONFIG.useOSS && fs.existsSync(imagePath))) && CONFIG.incrementalUpdate) {
            console.log(`图片已处理，跳过: ${processedImages[imageKey].path}`);
            const imageData = {
              original_src: image.src,
              alt: image.alt || `图片 ${i+1}`,
              path: processedImages[imageKey].path,
              index: i
            };
            
            if (CONFIG.useOSS && processedImages[imageKey].url) {
              imageData.url = processedImages[imageKey].url;
            }
            
            processedImagesList.push(imageData);
            stats.totalSkippedImages++;
          } else {
            // 处理图片
            const processResult = await processImage(image.src, imagePath, tempImagePath);
            
            if (processResult.success) {
              const imageData = {
                original_src: image.src,
                alt: image.alt || `图片 ${i+1}`,
                path: processResult.path,
                index: i
              };
              
              if (CONFIG.useOSS && processResult.url) {
                imageData.url = processResult.url;
              }
              
              processedImagesList.push(imageData);
              stats.totalProcessedImages++;
              
              // 更新压缩统计
              if (processResult.originalSize && processResult.compressedSize) {
                stats.totalOriginalSize += processResult.originalSize;
                stats.totalCompressedSize += processResult.compressedSize;
              }
              
              // 记录已处理的图片
              newProcessedImages[imageKey] = {
                processedAt: new Date().toISOString(),
                path: processResult.path,
                url: processResult.url
              };
            }
          }
          
          // 如果这是第一张图片且没有封面，设置为封面
          if (i === 0 && !album.coverPath && processedImagesList.length > 0) {
            album.coverPath = processedImagesList[0].path;
            if (CONFIG.useOSS && processedImagesList[0].url) {
              album.coverUrl = processedImagesList[0].url;
            }
          }
        }
        
        // 更新专辑的图片集
        album.images = processedImagesList;
        delete album.cover; // 移除原始封面URL
        
        // 完成当前专辑的处理
        imageBar.update(albumImages.length);
        imageBar.stop();
        
        // 更新专辑进度
        albumBar.update(albumIndex + 1);
      }
      
      albumBar.stop();
      seriesBar.update(seriesIndex + 1);
    }
    
    seriesBar.update(allSeries.length);
    multibar.stop();
    
    // 计算总体压缩比
    const totalCompressionRatio = stats.totalOriginalSize > 0 ? 
      (1 - (stats.totalCompressedSize / stats.totalOriginalSize)) * 100 : 0;
    
    // 计算总耗时
    const totalSeconds = Math.round((Date.now() - stats.startTime) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    // 输出总结
    console.log('\n=== 处理完成，执行统计 ===');
    console.log(`处理耗时: ${hours}小时 ${minutes}分钟 ${seconds}秒`);
    console.log(`处理的专辑: ${stats.totalProcessedAlbums}，跳过的专辑: ${stats.totalSkippedAlbums}`);
    console.log(`处理的图片: ${stats.totalProcessedImages}，跳过的图片: ${stats.totalSkippedImages}`);
    if (CONFIG.compressImages) {
      console.log(`总原始大小: ${filesize(stats.totalOriginalSize)}`);
      console.log(`总压缩后大小: ${filesize(stats.totalCompressedSize)}`);
      console.log(`总体压缩比: ${totalCompressionRatio.toFixed(2)}%`);
      console.log(`节省空间: ${filesize(stats.totalOriginalSize - stats.totalCompressedSize)}`);
    }
    
    // 保存处理后的数据到 JSON 文件
    const outputData = {
      lastUpdate: new Date().toISOString(),
      baseUrl: CONFIG.useOSS ? 
        (CONFIG.ossCDNDomain ? 
          `https://${CONFIG.ossCDNDomain}/${CONFIG.ossPrefix}` : 
          `https://${process.env.OSS_BUCKET}.${process.env.OSS_REGION}.aliyuncs.com/${CONFIG.ossPrefix}`) : 
        './notion_images/', // 相对于网站根目录的路径
      series: allSeries,
      useOSS: CONFIG.useOSS
    };
    
    await fs.promises.writeFile(
      CONFIG.outputJsonPath, 
      JSON.stringify(outputData, null, 2)
    );
    
    console.log(`数据已保存到 ${CONFIG.outputJsonPath}`);
    
    // 保存已处理图片记录
    if (CONFIG.incrementalUpdate) {
      await fs.promises.writeFile(
        CONFIG.imageRecordPath,
        JSON.stringify(newProcessedImages, null, 2)
      );
      console.log(`已处理图片记录已保存到 ${CONFIG.imageRecordPath}`);
    }
    
    // 尝试删除临时目录
    try {
      await fs.promises.rmdir(tempDir, { recursive: true });
      console.log(`已删除临时目录 ${tempDir}`);
    } catch (e) {
      console.warn(`未能删除临时目录: ${e.message}`);
    }
    
    console.log('=== 图片下载和组织完成 ===');
    console.log(`所有图片已按系列和专辑保存在 ${CONFIG.baseDir} 目录下`);
    
  } catch (error) {
    console.error('程序执行失败:', error);
  }
}

// 检查是否需要处理专辑
function needToProcessAlbum(album, existingData) {
  if (!existingData) return true;
  
  // 查找现有数据中的专辑
  const existingAlbum = findExistingAlbum(album.id, existingData);
  if (!existingAlbum) return true;
  
  // 检查封面是否变化
  if (album.cover !== existingAlbum.cover) return true;
  
  // 专辑基本信息是否变化
  if (album.title !== existingAlbum.title || 
      album.location !== existingAlbum.location || 
      album.date !== existingAlbum.date) {
    return true;
  }
  
  return false;
}

// 查找现有数据中的专辑
function findExistingAlbum(albumId, existingData) {
  if (!existingData || !existingData.series) return null;
  
  for (const series of existingData.series) {
    for (const album of series.albums) {
      if (album.id === albumId) {
        return album;
      }
    }
  }
  
  return null;
}

// 执行主函数
if (require.main === module) {
  main().catch(console.error);
}

// 导出模块
module.exports = {
  main,
  getAllSeriesAndAlbums,
  getAlbumImages,
  processImage
}; 