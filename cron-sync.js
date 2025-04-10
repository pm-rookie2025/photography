#!/usr/bin/env node

/**
 * 摄影作品定时同步服务
 * 
 * 此脚本设置一个定时任务，按计划自动从Notion同步图片到阿里云OSS。
 * 默认每天凌晨3点执行一次同步。
 * 
 * 使用方法:
 *    node cron-sync.js [--daemon]
 *    
 * 选项:
 *    --daemon: 作为守护进程在后台运行
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const schedule = require('node-schedule');

// 同步脚本路径
const syncScript = path.join(__dirname, 'sync-images.js');

// 日志目录
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// 日志文件路径
const logFile = path.join(logsDir, 'sync.log');

// 获取当前时间格式化字符串
function getTimeString() {
  return new Date().toISOString();
}

// 写入日志
function writeLog(message) {
  const logMessage = `[${getTimeString()}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(logFile, logMessage);
}

// 执行同步命令
function runSync() {
  writeLog('开始执行定时同步...');
  
  exec(`node ${syncScript}`, (error, stdout, stderr) => {
    if (error) {
      writeLog(`同步执行错误: ${error.message}`);
      return;
    }
    
    if (stderr) {
      writeLog(`同步过程中出现警告: ${stderr}`);
    }
    
    // 记录同步输出
    writeLog(`同步执行输出:\n${stdout}`);
    writeLog('同步执行完成');
  });
}

// 设置定时任务
function setupSchedule() {
  // 默认每天凌晨3点执行同步
  // 使用cron表达式: 秒 分 时 日 月 周
  const job = schedule.scheduleJob('0 0 3 * * *', function() {
    runSync();
  });
  
  writeLog(`定时同步服务已启动，将在每天凌晨3点执行同步 (cron: 0 0 3 * * *)`);
  writeLog(`日志将保存到: ${logFile}`);
  
  // 立即运行一次测试
  writeLog('执行首次同步测试...');
  runSync();
  
  return job;
}

// 处理命令行参数
const args = process.argv.slice(2);

// 显示帮助信息函数
function showHelp() {
  console.log(`
摄影作品定时同步服务

使用方法:
  node cron-sync.js [选项]
  
选项:
  --daemon    作为守护进程在后台运行
  --help      显示此帮助信息
  `);
}

// 如果请求帮助，显示帮助信息并退出
if (args.includes('--help')) {
  showHelp();
  process.exit(0);
}

// 启动同步服务
const job = setupSchedule();

// 处理进程退出
process.on('SIGTERM', function() {
  writeLog('收到终止信号，停止定时同步服务');
  job.cancel();
  process.exit(0);
});

process.on('SIGINT', function() {
  writeLog('收到中断信号，停止定时同步服务');
  job.cancel();
  process.exit(0);
});

// 如果不是守护进程模式，保持控制台输出
if (!args.includes('--daemon')) {
  writeLog('同步服务已启动（前台模式）。按Ctrl+C终止。');
} else {
  // 守护进程模式
  writeLog('同步服务已启动（守护进程模式）。');
  
  // 将输出重定向到日志文件
  process.stdout.write = function(data) {
    fs.appendFileSync(logFile, data);
    return true;
  };
  
  process.stderr.write = function(data) {
    fs.appendFileSync(logFile, data);
    return true;
  };
  
  // 分离进程
  process.stdin.pause();
} 