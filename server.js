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
    const encoding = proxyRes.headers["content-encoding"];
    let buffer = Buffer.concat(body);

    const decompress = () => {
      if (encoding === "gzip") return zlib.gunzipSync(buffer);
      if (encoding === "deflate") return zlib.inflateSync(buffer);
      if (encoding === "br") return zlib.brotliDecompressSync(buffer);
      return buffer; // no compression
    };

    const compress = (newBuff) => {
      if (encoding === "gzip") return zlib.gzipSync(newBuff);
      if (encoding === "deflate") return zlib.deflateSync(newBuff);
      if (encoding === "br") return zlib.brotliCompressSync(newBuff);
      return newBuff;
    };

    let decoded = decompress().toString("utf8");

    if (decoded.includes(FIND)) {
      decoded = decoded.replaceAll(FIND, REPLACE);
    }

    const outBuff = compress(Buffer.from(decoded, "utf8"));

    Object.entries(proxyRes.headers).forEach(([k, v]) => {
      if (k.toLowerCase() === "content-length") return;
      res.setHeader(k, v);
    });

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

