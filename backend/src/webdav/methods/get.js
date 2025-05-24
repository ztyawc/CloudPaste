/**
 * 处理WebDAV GET请求
 * 用于获取文件内容
 */
import { findMountPointByPath, normalizeS3SubPath, updateMountLastUsed } from "../utils/webdavUtils.js";
import { createS3Client } from "../../utils/s3Utils.js";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { handleWebDAVError, createWebDAVErrorResponse } from "../utils/errorUtils.js";
import { getMimeType } from "../../utils/fileUtils.js";

/**
 * 处理GET请求
 * @param {Object} c - Hono上下文
 * @param {string} path - 请求路径
 * @param {string} userId - 用户ID
 * @param {string} userType - 用户类型 (admin 或 apiKey)
 * @param {D1Database} db - D1数据库实例
 */
export async function handleGet(c, path, userId, userType, db) {
  const isHead = c.req.method === "HEAD";

  try {
    // 使用统一函数查找挂载点
    const mountResult = await findMountPointByPath(db, path, userId, userType);

    // 处理错误情况
    if (mountResult.error) {
      return createWebDAVErrorResponse(mountResult.error.message, mountResult.error.status);
    }

    const { mount, subPath } = mountResult;

    // 获取挂载点对应的S3配置
    const s3Config = await db.prepare("SELECT * FROM s3_configs WHERE id = ?").bind(mount.storage_config_id).first();

    if (!s3Config) {
      return createWebDAVErrorResponse("存储配置不存在", 404);
    }

    // 创建S3客户端
    const s3Client = await createS3Client(s3Config, c.env.ENCRYPTION_SECRET);

    // 规范化S3子路径 (文件不添加斜杠)
    const s3SubPath = normalizeS3SubPath(subPath, s3Config, false);

    // 更新最后使用时间
    await updateMountLastUsed(db, mount.id);

    // 检查对象是否存在
    try {
      const headParams = {
        Bucket: s3Config.bucket_name,
        Key: s3SubPath,
      };

      const headCommand = new HeadObjectCommand(headParams);
      const headResponse = await s3Client.send(headCommand);

      // 获取文件名以确定更准确的内容类型
      const fileName = path.split("/").pop();
      const contentType = headResponse.ContentType || getMimeType(fileName) || "application/octet-stream";

      // 获取ETag和Last-Modified用于条件请求
      const etag = headResponse.ETag || "";
      const lastModified = headResponse.LastModified ? headResponse.LastModified : new Date();
      const lastModifiedStr = lastModified.toUTCString();

      // 处理条件请求头
      const ifNoneMatch = c.req.header("If-None-Match");
      const ifModifiedSince = c.req.header("If-Modified-Since");

      // 检查ETag匹配（如果提供了If-None-Match头）
      if (ifNoneMatch && etag) {
        // 移除引号以进行比较
        const clientEtag = ifNoneMatch.replace(/^"(.*)"$/, "$1");
        const serverEtag = etag.replace(/^"(.*)"$/, "$1");

        if (clientEtag === serverEtag || clientEtag === "*") {
          console.log(`GET请求: ETag匹配 ${etag}，返回304 Not Modified`);
          return new Response(null, {
            status: 304, // Not Modified
            headers: {
              ETag: etag,
              "Last-Modified": lastModifiedStr,
              "Cache-Control": "max-age=3600",
            },
          });
        }
      }

      // 检查修改时间（如果提供了If-Modified-Since头且没有If-None-Match头或ETag不匹配）
      if (ifModifiedSince && !ifNoneMatch) {
        try {
          const modifiedSinceDate = new Date(ifModifiedSince);

          // 将时间戳向下取整到秒，因为HTTP日期不包含毫秒
          const modifiedSinceTime = Math.floor(modifiedSinceDate.getTime() / 1000) * 1000;
          const lastModifiedTime = Math.floor(lastModified.getTime() / 1000) * 1000;

          if (lastModifiedTime <= modifiedSinceTime) {
            console.log(`GET请求: 文件未修改，返回304 Not Modified`);
            return new Response(null, {
              status: 304, // Not Modified
              headers: {
                ETag: etag,
                "Last-Modified": lastModifiedStr,
                "Cache-Control": "max-age=3600",
              },
            });
          }
        } catch (dateError) {
          console.warn(`GET请求: If-Modified-Since头格式无效: ${ifModifiedSince}`);
          // 如果日期格式无效，忽略此头，继续处理请求
        }
      }

      // 处理If-Match头（确保资源匹配）
      const ifMatch = c.req.header("If-Match");
      if (ifMatch && etag) {
        const clientEtag = ifMatch.replace(/^"(.*)"$/, "$1");
        const serverEtag = etag.replace(/^"(.*)"$/, "$1");

        if (clientEtag !== "*" && clientEtag !== serverEtag) {
          console.log(`GET请求: If-Match条件不满足 ${ifMatch} != ${etag}`);
          return createWebDAVErrorResponse("资源已被修改", 412); // Precondition Failed
        }
      }

      // 处理If-Unmodified-Since头
      const ifUnmodifiedSince = c.req.header("If-Unmodified-Since");
      if (ifUnmodifiedSince) {
        try {
          const unmodifiedSinceDate = new Date(ifUnmodifiedSince);

          // 将时间戳向下取整到秒
          const unmodifiedSinceTime = Math.floor(unmodifiedSinceDate.getTime() / 1000) * 1000;
          const lastModifiedTime = Math.floor(lastModified.getTime() / 1000) * 1000;

          if (lastModifiedTime > unmodifiedSinceTime) {
            console.log(`GET请求: If-Unmodified-Since条件不满足`);
            return createWebDAVErrorResponse("资源已被修改", 412); // Precondition Failed
          }
        } catch (dateError) {
          console.warn(`GET请求: If-Unmodified-Since头格式无效: ${ifUnmodifiedSince}`);
          // 如果日期格式无效，忽略此头，继续处理请求
        }
      }

      // 如果是HEAD请求，返回头信息
      if (isHead) {
        return new Response(null, {
          status: 200,
          headers: {
            "Content-Length": String(headResponse.ContentLength || 0),
            "Content-Type": contentType,
            "Last-Modified": lastModifiedStr,
            ETag: etag,
            "Accept-Ranges": "bytes",
            "Cache-Control": "max-age=3600",
          },
        });
      }

      // 获取文件内容
      const getParams = {
        Bucket: s3Config.bucket_name,
        Key: s3SubPath,
      };

      // 处理Range请求
      const rangeHeader = c.req.header("Range");
      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : undefined;

          if (!isNaN(start)) {
            getParams.Range = `bytes=${start}-${end !== undefined ? end : ""}`;
          }
        }
      }

      const getCommand = new GetObjectCommand(getParams);
      const getResponse = await s3Client.send(getCommand);

      // 构建响应头
      const headers = {
        "Content-Type": contentType,
        "Content-Length": String(getResponse.ContentLength || 0),
        "Last-Modified": lastModifiedStr,
        ETag: etag,
        "Accept-Ranges": "bytes",
        "Cache-Control": "max-age=3600",
      };

      // 处理分片响应
      if (getResponse.ContentRange) {
        headers["Content-Range"] = getResponse.ContentRange;
        return new Response(getResponse.Body, {
          status: 206, // Partial Content
          headers,
        });
      }

      // 处理完整响应
      return new Response(getResponse.Body, {
        status: 200,
        headers,
      });
    } catch (error) {
      if (error.$metadata && error.$metadata.httpStatusCode === 404) {
        return createWebDAVErrorResponse("文件不存在", 404);
      }
      throw error;
    }
  } catch (error) {
    // 使用统一的错误处理
    return handleWebDAVError("GET", error);
  }
}
