require('dotenv').config();
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

// 图片数据路径
const DATA_PATH = path.join(__dirname, 'data', 'organized_albums.json');

// 载入数据
let albumsData = null;
try {
  if (fs.existsSync(DATA_PATH)) {
    albumsData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    console.log('已加载本地图片数据');
  } else {
    console.warn('未找到本地图片数据文件，请先运行 npm run download-images');
  }
} catch (error) {
  console.error('读取本地图片数据失败:', error);
}

// 获取所有系列
app.get('/api/series', async (req, res) => {
  try {
    if (!albumsData) {
      return res.status(404).json({ error: '未找到图片数据，请先运行 npm run download-images' });
    }
    
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

// 获取特定系列的所有专辑
app.get('/api/series/:seriesId/albums', async (req, res) => {
  try {
    if (!albumsData) {
      return res.status(404).json({ error: '未找到图片数据，请先运行 npm run download-images' });
    }
    
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
      cover: `${albumsData.baseUrl}${album.coverPath}`,
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
    if (!albumsData) {
      return res.status(404).json({ error: '未找到图片数据，请先运行 npm run download-images' });
    }
    
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
    
    // 转换图片路径为完整URL
    const images = albumData.images.map(image => ({
      src: `${albumsData.baseUrl}${image.path}`,
      alt: image.alt
    }));
    
    // 返回专辑详情
    res.json({
      id: albumData.id,
      title: albumData.title,
      series: seriesName,
      location: albumData.location,
      date: albumData.date,
      images: images
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
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`访问 http://localhost:${PORT} 查看网站`);
  if (albumsData) {
    console.log(`已加载 ${albumsData.series.length} 个系列，共 ${albumsData.series.reduce((acc, s) => acc + s.albums.length, 0)} 个专辑`);
  } else {
    console.log('警告: 未加载本地图片数据，请先运行 npm run download-images');
  }
}); 