/**
 * Vercel构建脚本
 * 用于在构建时动态生成配置文件
 */
const fs = require("fs");
const path = require("path");

// 创建dist目录（如果不存在）
const distPath = path.join(__dirname, "dist");
if (!fs.existsSync(distPath)) {
  fs.mkdirSync(distPath, { recursive: true });
}

// 获取环境变量，后端API URL
const backendUrl = process.env.VITE_BACKEND_URL || "https://cloudpaste-backend.your-domain.com";

// 生成配置文件
console.log("Generating config.js with backendUrl:", backendUrl);
const configContent = `// 运行时配置
window.appConfig = {
  backendUrl: '${backendUrl}'
};`;

// 写入配置文件到dist目录
fs.writeFileSync(path.join(distPath, "config.js"), configContent);

// 确保_redirects文件复制到构建输出目录
const redirectsSourcePath = path.join(__dirname, "public", "_redirects");
const redirectsDestPath = path.join(distPath, "_redirects");

if (fs.existsSync(redirectsSourcePath)) {
  console.log("Copying _redirects file to dist directory");
  fs.copyFileSync(redirectsSourcePath, redirectsDestPath);
}

// 运行正常的构建脚本
console.log("Running build command...");
const { execSync } = require("child_process");
try {
  execSync("npm run build", { stdio: "inherit" });
} catch (error) {
  console.error("Build failed:", error);
  process.exit(1);
}
