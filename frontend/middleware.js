/**
 * Vercel Edge Middleware
 * 用于在运行时动态替换配置文件中的环境变量
 */
export default function middleware(request) {
  const url = new URL(request.url);

  // 只处理对config.js的请求
  if (url.pathname === "/config.js") {
    return new Response(
      `// 运行时配置
window.appConfig = {
  backendUrl: '${process.env.VITE_BACKEND_URL || "http://localhost:8787"}'
};`,
      {
        headers: {
          "Content-Type": "application/javascript",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      }
    );
  }
}

export const config = {
  matcher: ["/config.js"],
};
