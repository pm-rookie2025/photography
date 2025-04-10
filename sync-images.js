#!/usr/bin/env node

/**
 * 摄影作品同步工具 - 从Notion同步图片到阿里云OSS
 * 
 * 此脚本用于定期同步Notion中的图片到阿里云OSS，并生成用于网站展示的JSON数据。
 * 使用方法:
 *    node sync-images.js [--force]
 *    
 * 选项:
 *    --force: 强制重新下载和处理所有图片，而不是增量更新
 */

const { main } = require('./organize-images');

// 处理命令行参数
const args = process.argv.slice(2);
const forceUpdate = args.includes('--force');

// 显示帮助信息函数
function showHelp() {
  console.log(`
摄影作品同步工具 - 从Notion同步图片到阿里云OSS

使用方法:
  node sync-images.js [选项]
  
选项:
  --force     强制重新下载和处理所有图片，而不是增量更新
  --help      显示此帮助信息
  `);
}

// 如果请求帮助，显示帮助信息并退出
if (args.includes('--help')) {
  showHelp();
  process.exit(0);
}

// 开始同步过程
async function startSync() {
  console.log('=== 开始同步Notion图片到阿里云OSS ===');
  
  if (forceUpdate) {
    console.log('已启用强制更新模式，将重新处理所有图片');
    
    // 修改环境变量来禁用增量更新
    process.env.FORCE_UPDATE = 'true';
  }
  
  try {
    // 记录开始时间
    const startTime = new Date();
    
    // 执行同步
    await main();
    
    // 计算总耗时
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000; // 转换为秒
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = Math.floor(duration % 60);
    
    console.log(`=== 同步完成 ===`);
    console.log(`总耗时: ${hours}小时 ${minutes}分钟 ${seconds}秒`);
  } catch (error) {
    console.error('同步过程中发生错误:', error);
    process.exit(1);
  }
}

// 执行同步
startSync(); 