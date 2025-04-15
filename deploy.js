const OSS = require('ali-oss');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// OSS 配置
const ossConfig = {
  region: process.env.OSS_REGION,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET,
  prefix: process.env.OSS_PREFIX || 'photo-portfolio/'
};

// 创建 OSS 客户端
const client = new OSS(ossConfig);

// 确保数据文件存在
const dataPath = path.join(__dirname, 'data', 'organized_albums.json');
if (!fs.existsSync(dataPath)) {
  console.error('错误: 未找到数据文件，请先运行 npm run sync-images');
  process.exit(1);
}

// 创建 dist 目录
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir);
}

// 复制静态文件到 dist 目录
const filesToCopy = [
  'index.html',
  'album.html',
  'about.html',
  'assets'
];

console.log('开始部署...');

// 复制文件
filesToCopy.forEach(file => {
  const source = path.join(__dirname, file);
  const target = path.join(distDir, file);
  
  if (fs.existsSync(source)) {
    if (fs.lstatSync(source).isDirectory()) {
      // 复制目录
      execSync(`cp -r "${source}" "${target}"`);
    } else {
      // 复制文件
      fs.copyFileSync(source, target);
    }
    console.log(`已复制: ${file}`);
  }
});

// 复制数据文件
const dataDistDir = path.join(distDir, 'data');
if (!fs.existsSync(dataDistDir)) {
  fs.mkdirSync(dataDistDir);
}
fs.copyFileSync(dataPath, path.join(dataDistDir, 'organized_albums.json'));
console.log('已复制数据文件');

// 上传到 OSS
async function uploadToOSS() {
  try {
    console.log('开始上传到 OSS...');
    
    // 遍历 dist 目录
    const uploadFiles = async (dir, prefix = '') => {
      const files = fs.readdirSync(dir);
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const ossPath = `${ossConfig.prefix}${prefix}${file}`;
        
        if (fs.lstatSync(filePath).isDirectory()) {
          // 递归上传子目录
          await uploadFiles(filePath, `${prefix}${file}/`);
        } else {
          // 上传文件
          console.log(`上传: ${ossPath}`);
          await client.put(ossPath, filePath);
        }
      }
    };
    
    await uploadFiles(distDir);
    console.log('上传完成！');
    
    // 获取 OSS 访问地址
    const endpoint = `https://${ossConfig.bucket}.${ossConfig.region}.aliyuncs.com`;
    console.log('\n部署完成！');
    console.log(`网站地址: ${endpoint}/${ossConfig.prefix}index.html`);
    console.log('\n建议:');
    console.log('1. 在阿里云 OSS 控制台开启静态网站托管功能');
    console.log('2. 配置 CDN 加速，提升访问速度');
    console.log('3. 绑定自定义域名（可选）');
    
  } catch (error) {
    console.error('上传失败:', error);
  }
}

uploadToOSS(); 