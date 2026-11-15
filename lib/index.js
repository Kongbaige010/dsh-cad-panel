/**
 * dsh-cad-panel — 宿主半边。
 *
 * 它只做一件事：**给编辑器开一扇门**。
 *
 * 背景（一句话）：text-to-cad 引擎只监听 127.0.0.1，页面里的 /assets/*.js 和 /api/*
 * 需要凭证才放行；而 DSH 界面跑在自定义协议 dsh-app://app 上，浏览器把它当"跨站"，
 * 既不送 SameSite Cookie，Sec-Fetch-Site 也是 cross-site —— iframe 里必然白板。
 *
 * 引擎侧已打"授权记忆"补丁：任一请求带对 token 后，12 小时内同机请求直接放行。
 * 这里就在 DSH 启动时、以及之后每 5 分钟，拿持久 token 去敲一次门，让那扇门一直开着。
 * 于是客户端 iframe 永远不需要 token，也不需要 Cookie，更不需要额外的反向代理进程。
 *
 * 安全边界：token 从本机文件读、只发往 127.0.0.1；宿主半边不注册工具、不开路由。
 * 健壮性：全程 try/catch —— 引擎没装、没起、文件不在，都只是安静跳过，绝不影响 DSH 启动。
 */
"use strict";

exports.inject = [];

const TOKEN_PATH = require("node:path").join(
  require("node:os").homedir(),
  ".local",
  "state",
  "cad",
  "engines",
  "token",
);

const ENGINE_HOST = "127.0.0.1";
const ENGINE_PORT = 3245;
const REFRESH_MS = 5 * 60 * 1000; /* 引擎侧放行窗口是 12 小时，5 分钟刷一次足够 */

let timer = null;

/** 读持久 token；没有就返回 null（引擎没装/没跑过）。 */
function readToken() {
  try {
    const token = require("node:fs").readFileSync(TOKEN_PATH, "utf8").trim();
    return token || null;
  } catch (error) {
    return null;
  }
}

/** 拿 token 敲一次门，打开引擎的放行窗口。失败一律静默。 */
function prime(callback) {
  const token = readToken();
  if (!token) {
    if (callback) callback(new Error("no token file"));
    return;
  }
  let settled = false;
  const done = (error) => {
    if (settled) return;
    settled = true;
    if (callback) callback(error);
  };

  try {
    const request = require("node:http").request(
      {
        host: ENGINE_HOST,
        port: ENGINE_PORT,
        path: "/?token=" + encodeURIComponent(token),
        method: "GET",
        headers: { accept: "text/html", "sec-fetch-dest": "document" },
        timeout: 5000,
      },
      (response) => {
        response.resume(); /* 丢掉页面内容，只要这个请求生效 */
        done(response.statusCode === 200 ? null : new Error("status " + response.statusCode));
      },
    );
    request.on("timeout", () => {
      request.destroy();
      done(new Error("timeout"));
    });
    request.on("error", (error) => done(error));
    request.end();
  } catch (error) {
    done(error);
  }
}

exports.apply = function apply() {
  try {
    /* DSH 启动时立刻开一次门。引擎通常还没起（它是按需启动），失败很正常。 */
    prime();

    /* 之后定期续期：覆盖"DSH 比引擎活得久"和"引擎被重启"两种情况。 */
    timer = setInterval(() => prime(), REFRESH_MS);
    if (timer && typeof timer.unref === "function") timer.unref(); /* 别拦着 DSH 退出 */
  } catch (error) {
    /* 宿主半边绝不因为门外的事把 DSH 拖下水 */
  }
};

exports.dispose = function dispose() {
  try {
    if (timer) clearInterval(timer);
  } catch (error) {
    /* 忽略 */
  }
  timer = null;
};
