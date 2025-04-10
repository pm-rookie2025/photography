require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

// 创建一个备份原始服务器文件的函数
async function backupOriginalServer() {
  const serverPath = path.join(__dirname, 'server.js');
  const backupPath = path.join(__dirname, 'server.js.backup');
  
  // 如果已经有备份，就不再备份
  if (!fs.existsSync(backupPath)) {
    console.log('备份原始服务器文件...');
    fs.copyFileSync(serverPath, backupPath);
    console.log('备份完成');
  } else {
    console.log('已存在备份文件，跳过备份');
  }
}

// 创建修改后的服务器文件
async function createModifiedServer() {
  console.log('创建优化版服务器文件...');
  
  // 确保albums.json文件存在
  const dataPath = path.join(__dirname, 'data', 'albums.json');
  if (!fs.existsSync(dataPath)) {
    console.error('错误: data/albums.json 文件不存在，请先运行图片处理程序');
    process.exit(1);
  }
  
  // 读取专辑数据
  const albumsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  
  // 创建新的服务器文件内容
  const serverContent = `require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 配置CORS和JSON解析
app.use(cors());
app.use(express.json());

// 提供静态文件
app.use(express.static(path.join(__dirname, '.')));

// 提供压缩后的图片
app.use('/compressed', express.static(path.join(__dirname, 'compressed')));

// 预加载数据 - 使用本地JSON文件而不是每次调用Notion API
console.log('加载本地数据...');
const albumsData = ${JSON.stringify(albumsData, null, 2)};

// 获取所有系列 (摄影集)
app.get('/api/series', async (req, res) => {
  try {
    console.log('请求系列数据...');
    const series = albumsData.series.map(series => ({
      id: series.id,
      name: series.name
    }));
    res.json(series);
  } catch (error) {
    console.error('获取系列数据时出错:', error);
    res.status(500).json({ error: 'Failed to fetch series data' });
  }
});

// 获取特定系列的所有专辑 (相册)
app.get('/api/series/:seriesId/albums', async (req, res) => {
  try {
    const { seriesId } = req.params;
    console.log('请求系列的专辑:', seriesId);
    
    // 查找对应系列
    const series = albumsData.series.find(s => s.id === seriesId);
    
    if (!series) {
      return res.status(404).json({ error: 'Series not found' });
    }
    
    // 提取专辑信息
    const albums = series.albums.map(album => ({
      id: album.id,
      title: album.title,
      cover: album.cover,
      thumbnail: album.cover_thumbnail,
      location: album.location,
      date: album.date
    }));
    
    res.json(albums);
  } catch (error) {
    console.error('获取专辑数据时出错:', error);
    res.status(500).json({ error: 'Failed to fetch albums data' });
  }
});

// 获取特定专辑的详细信息和图片
app.get('/api/albums/:albumId', async (req, res) => {
  try {
    const { albumId } = req.params;
    console.log('请求专辑详情:', albumId);
    
    // 查找对应专辑
    let albumData = null;
    let seriesName = '';
    
    // 遍历所有系列查找专辑
    for (const series of albumsData.series) {
      const album = series.albums.find(a => a.id === albumId);
      if (album) {
        albumData = album;
        seriesName = series.name;
        break;
      }
    }
    
    if (!albumData) {
      return res.status(404).json({ error: 'Album not found' });
    }
    
    // 返回专辑详情
    res.json({
      id: albumData.id,
      title: albumData.title,
      series: seriesName,
      location: albumData.location,
      date: albumData.date,
      images: albumData.images
    });
  } catch (error) {
    console.error('获取专辑详情时出错:', error);
    res.status(500).json({ error: 'Failed to fetch album details' });
  }
});

// 处理前端路由
app.get('*', (req, res) => {
  // 对于任何不匹配的路由，返回index.html
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 启动服务器
app.listen(PORT, () => {
  console.log(\`优化版服务器运行在端口 \${PORT}\`);
  console.log(\`访问 http://localhost:\${PORT} 查看网站\`);
  console.log('现在使用的是本地缓存数据，加载速度更快！');
});`;

  // 写入到新文件
  const optimizedServerPath = path.join(__dirname, 'server.optimized.js');
  fs.writeFileSync(optimizedServerPath, serverContent);
  console.log(`优化版服务器文件已创建: ${optimizedServerPath}`);
  
  return optimizedServerPath;
}

// 修改package.json，添加新的启动命令
async function updatePackageJson() {
  console.log('更新package.json...');
  
  const packageJsonPath = path.join(__dirname, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  // 添加快速启动命令
  packageJson.scripts['start:fast'] = 'node server.optimized.js';
  
  // 写回文件
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log('package.json 已更新，添加了 `npm run start:fast` 命令');
}

// 主函数
async function main() {
  try {
    console.log('=== 开始更新网站 ===');
    
    // 备份原始服务器文件
    await backupOriginalServer();
    
    // 创建修改后的服务器文件
    const optimizedServerPath = await createModifiedServer();
    
    // 更新package.json
    await updatePackageJson();
    
    console.log('\n=== 网站更新完成 ===');
    console.log('\n使用说明:');
    console.log('1. 要使用优化版网站(本地数据)，运行: npm run start:fast');
    console.log('2. 要使用原始版网站(从Notion获取数据)，运行: npm start 或 npm run dev');
    console.log('\n优化版网站会使用本地缓存的图片和数据，大幅提升加载速度');
    console.log('当你需要更新网站内容时:');
    console.log('1. 先运行: npm run process-images');
    console.log('2. 然后运行: npm run start:fast');
    
  } catch (error) {
    console.error('更新网站失败:', error);
  }
}

// 执行主函数
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  backupOriginalServer,
  createModifiedServer,
  updatePackageJson
}; 