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
    
    // 创建一个Map来存储系列和专辑数据
    const seriesMap = new Map();
    
    // 使用分页查询获取所有记录
    let hasMore = true;
    let startCursor = undefined;
    let totalPages = 0;
    let totalRecords = 0;
    
    while (hasMore) {
      totalPages++;
      console.log(`正在获取第 ${totalPages} 页数据...`);
      
      const response = await notion.databases.query({
        database_id: CONFIG.notionDatabaseId,
        start_cursor: startCursor,
        page_size: 100, // 每页获取最大数量的记录
      });
      
      totalRecords += response.results.length;
      console.log(`本页获取到 ${response.results.length} 条记录`);
      
      // 处理本页的所有记录
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
      
      // 检查是否有更多页面需要获取
      hasMore = response.has_more;
      startCursor = response.next_cursor;
    }
    
    console.log(`总共获取了 ${totalPages} 页数据，共 ${totalRecords} 条记录`);
    console.log(`找到 ${seriesMap.size} 个系列，共 ${totalRecords} 个专辑`);
    
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
            .rotate() // 自动根据EXIF信息旋转图片
            .jpeg({ quality: CONFIG.compressionQuality })
            .toBuffer();
        } else if (ext === '.png') {
          processedImage = await sharp(tempPath)
            .rotate() // 自动根据EXIF信息旋转图片
            .png({ quality: CONFIG.compressionQuality })
            .toBuffer();
        } else if (ext === '.webp') {
          processedImage = await sharp(tempPath)
            .rotate() // 自动根据EXIF信息旋转图片
            .webp({ quality: CONFIG.compressionQuality })
            .toBuffer();
        } else {
          // 对于其他格式，保持原样但仍旋转
          processedImage = await sharp(tempPath)
            .rotate() // 自动根据EXIF信息旋转图片
            .toBuffer();
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
  console.log(colors.cyan('📷 开始同步Notion相册图片...'));
  const startTime = Date.now();

  // 解析命令行参数
  const args = process.argv.slice(2);
  const albumPageIdArg = args.find(arg => arg.startsWith('--albumPageId='));
  const specificAlbumPageId = albumPageIdArg ? albumPageIdArg.split('=')[1] : null;

  try {
    await createDirectory(CONFIG.baseDir);
    await createDirectory(path.join(__dirname, 'data'));

    let allSeriesData;

    if (specificAlbumPageId) {
      console.log(colors.magenta(`🔄 正在处理特定专辑: ${specificAlbumPageId}`));
      allSeriesData = await getSingleAlbumDetails(specificAlbumPageId);
    } else {
      console.log(colors.blue('🔄 正在处理所有系列和专辑...'));
      allSeriesData = await getAllSeriesAndAlbums();
    }

    if (!allSeriesData || allSeriesData.length === 0) {
      console.log(colors.yellow('🤔 没有找到任何系列或专辑数据，脚本执行结束。'));
      return;
    }
    
    const overallProgressBar = new cliProgress.MultiBar({
      format: colors.green('{bar}') + ' | {task} | {percentage}% | {value}/{total} | {filename}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      clearOnComplete: false,
      stopOnComplete: true
    }, cliProgress.Presets.shades_classic);

    // 加载已有的 organized_albums.json 数据（如果存在）
    let existingOrganizedData = { series: [] };
    if (fs.existsSync(CONFIG.outputJsonPath)) {
      try {
        const rawData = fs.readFileSync(CONFIG.outputJsonPath, 'utf-8');
        existingOrganizedData = JSON.parse(rawData);
        if (!existingOrganizedData.series) existingOrganizedData.series = []; // 确保 series 数组存在
      } catch (e) {
        console.warn(colors.yellow('读取 organized_albums.json 文件失败，将创建一个新的: ' + e.message));
        existingOrganizedData = { series: [] };
      }
    }

    for (const series of allSeriesData) {
      const seriesDir = path.join(CONFIG.baseDir, series.id);
      if (!specificAlbumPageId) { // 只有在处理所有专辑时才创建系列总目录
          await createDirectory(seriesDir);
      }

      // 在现有的 organized_albums.json 数据中查找当前系列
      let existingSeries = existingOrganizedData.series.find(s => s.id === series.id);
      if (!existingSeries) {
        existingSeries = { id: series.id, name: series.name, albums: [] };
        existingOrganizedData.series.push(existingSeries);
      }

      for (const album of series.albums) {
        // 如果是处理单个专辑，只需要处理这个专辑
        if (specificAlbumPageId && album.id !== specificAlbumPageId) {
          continue;
        }

        const albumDir = path.join(seriesDir, album.dirName);
        await createDirectory(albumDir); // 为单个专辑也创建目录，用于临时存放

        const albumTask = overallProgressBar.create(album.images.length + 1, 0, { task: colors.cyan(`专辑: ${album.title}`), filename: '' });
        
        let processedCoverUrl = album.cover; // 默认为Notion原始URL
        if (album.cover) {
          albumTask.update({ filename: '处理封面...' });
          const coverFileName = `cover-${album.id}${path.extname(album.cover.split('?')[0])}`;
          const coverOutputPath = path.join(albumDir, coverFileName);
          const coverTempPath = path.join(albumDir, `temp-cover-${album.id}${path.extname(album.cover.split('?')[0])}`);
          
          const coverResult = await processImage(album.cover, coverOutputPath, coverTempPath);
          if (coverResult && coverResult.url) {
            processedCoverUrl = coverResult.url;
          }
          albumTask.increment({ filename: '封面处理完毕' });
        }
        
        album.coverUrl = processedCoverUrl; // 更新封面URL为处理后的URL
        album.coverFocus = album.coverFocus || 'center center'; // 确保有默认值

        const processedImages = [];
        for (let i = 0; i < album.images.length; i++) {
          const image = album.images[i];
          albumTask.update(i + 1, { filename: image.alt || `图片 ${i+1}` });
          
          const originalFileName = path.basename(image.src.split('?')[0]);
          const imageFileName = `${album.id}-image-${i}${path.extname(originalFileName)}`;
          const imageOutputPath = path.join(albumDir, imageFileName);
          const imageTempPath = path.join(albumDir, `temp-${album.id}-image-${i}${path.extname(originalFileName)}`);

          const imageResult = await processImage(image.src, imageOutputPath, imageTempPath);
          if (imageResult) {
            processedImages.push({ 
              src: imageResult.url, 
              alt: image.alt,
              title: image.alt, // 通常 alt 和 title 可以一样
              type: imageResult.type,
              size: imageResult.size,
              width: imageResult.width,
              height: imageResult.height
            });
          }
        }
        album.images = processedImages; // 更新为处理后的图片信息

        // 在 existingSeries.albums 中查找或添加当前专辑
        const existingAlbumIndex = existingSeries.albums.findIndex(a => a.id === album.id);
        if (existingAlbumIndex > -1) {
          // 更新现有专辑
          existingSeries.albums[existingAlbumIndex] = { ...existingSeries.albums[existingAlbumIndex], ...album };
        } else {
          // 添加新专辑
          existingSeries.albums.push(album);
        }
        overallProgressBar.update(albumTask.getTotal(), { task: colors.cyan(`专辑: ${album.title}`) + colors.green(' ✔') });
      }
    }

    overallProgressBar.stop();
    fs.writeFileSync(CONFIG.outputJsonPath, JSON.stringify(existingOrganizedData, null, 2));
    console.log(colors.green(`✅ 所有相册处理完成，数据已保存到: ${CONFIG.outputJsonPath}`));

    // 清理临时目录
    if (fs.existsSync(CONFIG.baseDir)) {
      // fs.rmSync(CONFIG.baseDir, { recursive: true, force: true });
      // console.log(colors.blue('🧹 已清理临时图片目录。'));
      console.log(colors.yellow('💡 临时图片目录保留在 ' + CONFIG.baseDir + '，如果不需要可以手动删除。'));
    }

  } catch (error) {
    console.error(colors.red('❌ 处理过程中发生错误:'), error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    console.log(colors.cyan(`⏱️ 脚本执行完毕，总耗时: ${duration.toFixed(2)} 秒.`));
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

// 获取特定专辑的详细信息（包括图片）
async function getSingleAlbumDetails(albumPageId) {
  try {
    console.log(`开始获取特定专辑的详细信息: ${albumPageId}`);
    const page = await notion.pages.retrieve({ page_id: albumPageId });

    if (!page) {
      throw new Error(`无法找到页面ID为 ${albumPageId} 的专辑。`);
    }

    // 从页面属性中提取系列信息
    // 注意：这里假设"摄影集"是 select 类型，并且我们期望它只有一个值
    const seriesProperty = page.properties.摄影集?.select;
    const seriesName = seriesProperty?.name || '未分类';
    const seriesId = seriesName.replace(/[\/\\?%*:|"<>]/g, '-').trim();

    // 提取专辑基本信息
    const albumTitle = page.properties['相册']?.title[0]?.text.content || '未命名相册';
    const albumDirName = albumTitle.replace(/[\/\\?%*:|"<>]/g, '-').trim();
    const location = page.properties['地点']?.rich_text[0]?.text.content || '';
    const date = page.properties['拍摄日期']?.date?.start || '';
    
    // 提取封面图片URL
    let coverUrl = '';
    const coverProperty = page.properties['封面'];
    if (coverProperty && coverProperty.files && coverProperty.files.length > 0) {
      coverUrl = coverProperty.files[0].file?.url || coverProperty.files[0].external?.url || '';
    }

    // 提取我们新增的"封面焦点"属性
    // 假设属性名叫 "封面焦点"，类型是 rich_text
    const coverFocusProperty = page.properties['封面焦点']?.rich_text[0]?.text.content;
    const coverFocus = coverFocusProperty || 'center center'; // 默认居中

    console.log(`专辑 "${albumTitle}" 的封面焦点设置为: ${coverFocus}`);

    // 获取专辑图片
    const images = await getAlbumImages(albumPageId); // 复用现有函数

    const albumData = {
      id: albumPageId,
      title: albumTitle,
      dirName: albumDirName,
      location: location,
      date: date,
      cover: coverUrl,
      coverFocus: coverFocus, // 添加封面焦点信息
      images: images
    };

    // 将单个专辑包装在系列结构中，以保持与 getAllSeriesAndAlbums 返回的数据结构一致性
    const singleSeriesResult = [{
      id: seriesId,
      name: seriesName,
      albums: [albumData]
    }];

    console.log(`成功获取特定专辑 "${albumTitle}" 的信息。`);
    return singleSeriesResult;

  } catch (error) {
    console.error(`获取特定专辑 ${albumPageId} 详细信息失败:`, error);
    throw error; // 重新抛出错误，以便 main 函数捕获
  }
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
  processImage,
  getSingleAlbumDetails
}; 