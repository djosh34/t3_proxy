import https from "https";
import httpProxy from "http-proxy";
import zlib from "zlib";
import fs from "fs";

const BIND_ADDR = process.env.PROXY_BIND || "127.0.0.1";
const PROXY1_PORT = process.env.PROXY1_PORT || 9222;
const PROXY1_TARGET = process.env.PROXY1_TARGET || "https://t3.chat";
const PROXY2_PORT = process.env.PROXY2_PORT || 9223;
const PROXY2_TARGET = process.env.PROXY2_TARGET || "https://api.sync.t3.chat";
const CERT_KEY_PEM_PATH = process.env.CERT_KEY_PEM_PATH || "./certs/key.pem";
const CERT_PEM_PATH = process.env.CERT_PEM_PATH || "./certs/cert.pem";

const sslOptions = {
  key: fs.readFileSync(CERT_KEY_PEM_PATH),
  cert: fs.readFileSync(CERT_PEM_PATH),
};


const FIND = process.env.PROXY1_FIND || "api.sync.t3.chat";
const REPLACE = process.env.PROXY1_REPLACE || "127.0.0.1:9223";

const proxy1 = httpProxy.createProxyServer({
  target: PROXY1_TARGET,
  changeOrigin: true,
  selfHandleResponse: true,
});

const server1 = https.createServer(sslOptions, (req, res) => {
  proxy1.web(req, res);
});

proxy1.on("proxyRes", (proxyRes, req, res) => {
  let body = [];

  proxyRes.on("data", (chunk) => body.push(chunk));

  proxyRes.on("end", () => {
    const encoding = proxyRes.headers["content-encoding"]?.toLowerCase();
    const buffer = Buffer.concat(body);

    // --- Fast‑path: Unknown or unsupported encoding → just forward untouched
    const supportedEncodings = ["gzip", "deflate", "br", undefined];
    if (!supportedEncodings.includes(encoding)) {
      console.warn(`Unsupported encoding: ${encoding}, passing through untouched`);
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      res.end(buffer);
      return;
    }

    // --- Try to decompress if applicable
    let decodedText;
    try {
      let plainBuffer;
      if (encoding === "gzip") plainBuffer = zlib.gunzipSync(buffer);
      else if (encoding === "deflate") plainBuffer = zlib.inflateSync(buffer);
      else if (encoding === "br") plainBuffer = zlib.brotliDecompressSync(buffer);
      else plainBuffer = buffer; // already plain

      decodedText = plainBuffer.toString("utf8");
    } catch (err) {
      console.error(`Decompression failed (encoding=${encoding}):`, err);
      // Fallback: forward untouched
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      res.end(buffer);
      return;
    }

    // --- Perform FIND → REPLACE if possible
    if (decodedText.includes(FIND)) {
      decodedText = decodedText.replaceAll(FIND, REPLACE);
      console.log("Find and replace in: ", proxyRes)
    }

    const outBuff = Buffer.from(decodedText, "utf8");

    // --- Copy headers except length/encoding/transfer
    Object.entries(proxyRes.headers).forEach(([k, v]) => {
      const lower = k.toLowerCase();
      if (
        lower === "content-length" ||
        lower === "content-encoding" ||
        lower === "transfer-encoding"
      ) {
        return;
      }
      res.setHeader(k, v);
    });

    // --- Tell browser it's plain / uncompressed now
    res.removeHeader("content-encoding");
    res.setHeader("content-length", outBuff.length);

    res.writeHead(proxyRes.statusCode);
    res.end(outBuff);
  });



});

server1.listen(PROXY1_PORT, BIND_ADDR, () => {
  const addr = server1.address();
  console.log(
    `Proxy1 listening on https://${addr.address}:${addr.port} → ${PROXY1_TARGET}`
  );
});

const proxy2 = httpProxy.createProxyServer({
  target: PROXY2_TARGET,
  changeOrigin: true,
  ws: true,
});

const server2 = https.createServer(sslOptions, (req, res) => {
  proxy2.web(req, res);
});

server2.on("upgrade", (req, socket, head) => {
  proxy2.ws(req, socket, head);
});

server2.listen(PROXY2_PORT, BIND_ADDR, () => {
  const addr = server2.address();
  console.log(
    `Proxy2 (HTTPS+WS) listening on https://${addr.address}:${addr.port} → ${PROXY2_TARGET}`
  );
});

