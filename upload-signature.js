require('dotenv').config();
const fs = require('fs');
const path = require('path');
const OSS = require('ali-oss');

// 阿里云OSS配置
const OSS_CONFIG = {
  region: process.env.OSS_REGION || '',
  accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
  bucket: process.env.OSS_BUCKET || '',
  // CDN 域名 (如果有)
  cdnDomain: process.env.OSS_CDN_DOMAIN || '',
  // 为签名图片创建专门的路径前缀
  prefix: 'signature/'
};

// 创建阿里云OSS客户端
function createOssClient() {
  if (!OSS_CONFIG.accessKeyId || !OSS_CONFIG.accessKeySecret || !OSS_CONFIG.bucket || !OSS_CONFIG.region) {
    console.log('阿里云OSS配置不完整，无法上传');
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

// 上传图片到OSS
async function uploadToOSS(imagePath, objectName) {
  const ossClient = createOssClient();
  if (!ossClient) {
    console.log('OSS客户端未初始化，跳过上传');
    return { success: false, url: '' };
  }
  
  try {
    console.log(`上传签名图片到阿里云OSS: ${imagePath}`);
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
        url = `http://${OSS_CONFIG.bucket}.${OSS_CONFIG.region}.aliyuncs.com/${fullObjectName}`;
      }
      
      console.log(`签名图片上传成功: ${url}`);
      return {
        success: true,
        url: url
      };
    } else {
      console.error('签名图片上传失败:', result);
      return { success: false, url: '' };
    }
  } catch (error) {
    console.error(`上传签名图片失败 ${imagePath}:`, error.message);
    return { success: false, url: '' };
  }
}

async function main() {
  try {
    // 定义签名图片路径
    const imagePath = path.join(__dirname, '水印 1～黑.PNG');
    
    // 检查文件是否存在
    if (!fs.existsSync(imagePath)) {
      console.error(`签名图片文件不存在: ${imagePath}`);
      return;
    }
    
    // 上传图片
    const objectName = 'signature.png'; // 在OSS中保存的文件名
    const result = await uploadToOSS(imagePath, objectName);
    
    if (result.success) {
      console.log('签名图片上传成功，URL:', result.url);
      console.log('请在 about.html 中使用下面的URL替换现有的签名图片:');
      console.log(result.url);
    } else {
      console.error('签名图片上传失败');
    }
  } catch (error) {
    console.error('上传过程中发生错误:', error);
  }
}

// 执行主函数
main().catch(console.error); 