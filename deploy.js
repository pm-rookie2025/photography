const OSS = require('ali-oss');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
require('dotenv').config();

// OSS 配置
const ossConfig = {
  region: process.env.OSS_REGION,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET,
  prefix: process.env.OSS_PREFIX || 'photo-portfolio/'
};

// 验证配置
if (!ossConfig.region || !ossConfig.accessKeyId || !ossConfig.accessKeySecret || !ossConfig.bucket) {
  console.error('错误: OSS 配置不完整，请检查 .env 文件');
  process.exit(1);
}

// 创建 OSS 客户端
const client = new OSS(ossConfig);

// 准备服务端文件
const serverFiles = [
  'server.js',
  'package.json',
  'package-lock.json',
  '.env',
  'data',
  'assets'
];

// 准备静态文件
const staticFiles = [
  'index.html',
  'album.html',
  'about.html'
];

// 创建部署目录
const deployDir = path.join(__dirname, 'deploy');
const staticDir = path.join(deployDir, 'static');
const serverDir = path.join(deployDir, 'server');

// 清理旧的部署目录
if (fs.existsSync(deployDir)) {
  execSync(`rm -rf "${deployDir}"`);
}

// 创建新的部署目录
fs.mkdirSync(deployDir);
fs.mkdirSync(staticDir);
fs.mkdirSync(serverDir);

console.log('开始准备部署文件...');

// 复制服务端文件
serverFiles.forEach(file => {
  const source = path.join(__dirname, file);
  const target = path.join(serverDir, file);
  
  if (fs.existsSync(source)) {
    if (fs.lstatSync(source).isDirectory()) {
      execSync(`cp -r "${source}" "${target}"`);
    } else {
      fs.copyFileSync(source, target);
    }
    console.log(`已复制服务端文件: ${file}`);
  }
});

// 复制静态文件
staticFiles.forEach(file => {
  const source = path.join(__dirname, file);
  const target = path.join(staticDir, file);
  
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, target);
    console.log(`已复制静态文件: ${file}`);
  }
});

// 创建服务端启动脚本
const startScript = `#!/bin/bash
cd "\${0%/*}"
npm install
npm run sync-images
pm2 delete photo-portfolio || true
pm2 start server.js --name photo-portfolio
`;

fs.writeFileSync(path.join(serverDir, 'start.sh'), startScript, { mode: 0o755 });
console.log('已创建启动脚本');

// 上传到 OSS
async function uploadToOSS() {
  try {
    console.log('\n开始上传静态文件到 OSS...');
    
    // 遍历静态文件目录
    const uploadFiles = async (dir, prefix = '') => {
      const files = fs.readdirSync(dir);
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const ossPath = `${ossConfig.prefix}${prefix}${file}`;
        
        if (fs.lstatSync(filePath).isDirectory()) {
          await uploadFiles(filePath, `${prefix}${file}/`);
        } else {
          console.log(`上传: ${ossPath}`);
          await client.put(ossPath, filePath);
        }
      }
    };
    
    await uploadFiles(staticDir);
    console.log('静态文件上传完成！');
    
    // 打包服务端文件
    console.log('\n打包服务端文件...');
    const serverZip = 'server.zip';
    execSync(`cd "${deployDir}" && zip -r "${serverZip}" server/`);
    console.log('服务端文件打包完成');
    
    console.log('\n部署完成！');
    console.log('\n后续步骤:');
    console.log('1. 将 deploy/server.zip 上传到云服务器');
    console.log('2. 在服务器上解压并运行 start.sh');
    console.log('3. 配置 Nginx 反向代理（如果需要）');
    console.log('4. 配置 SSL 证书（推荐）');
    console.log('\n定时任务建议:');
    console.log('每天凌晨同步数据：');
    console.log('0 2 * * * cd /path/to/server && npm run sync-images');
    
  } catch (error) {
    console.error('部署失败:', error);
  }
}

uploadToOSS(); 