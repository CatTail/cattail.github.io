---
layout: post
title: 自签名证书和中间人攻击
description: 本文是 HTTPS 工作原理系列的第二篇，描述如何使用 OpenSSL 生成自签名的证书，并使用该证书进行中间人攻击
date: 2017-01-06 15:59
categories: tech
---

## 自签名证书

生成根私钥

    openssl genrsa -out ca.key.pem 4096

生成根证书

    openssl req -new -x509 -sha256 -days 7300 -subj /CN=MITM -key ca.key.pem -out ca.cert.pem

`req` 命令可用于生成和处理证书, `-new` 选项使命令生成证书签名请求（Certificate Signing Request），`-x509` 选项使命令生成自签名证书而不是自签名证书，可以通过这种方式生成根证书。

验证根证书

    openssl x509 -noout -text -in ca.cert.pem

生成私钥

    openssl genrsa -out server.key.pem 4096

生成 google.com 域名的证书签名请求

    openssl req -new -sha256 -subj /CN=google.com -key server.key.pem -out server.csr.pem

生成证书

    openssl x509 -req -sha256 -days 365 -in server.csr.pem -CAkey ca.key.pem -CA ca.cert.pem -CAcreateserial -out server.cert.pem

`x509` 命令可用于签名证书，`-req` 选项使命令接受证书签名请求作为输入。`x509` 使用根证书对证书签名请求进行签名，最终生成对应的证书。

验证证书

    openssl x509 -noout -text -in server.cert.pem

## 中间人攻击

我们最终的目标是使用 Node.js 实现一个中间人，当客户端请求设置 proxy 将流量发送到该中间人时，它可以截获并修改这些流量，包括 HTTP 和 HTTPS 流量。

### 00 - it's not gonna work

首先来实现一个简单的中间人，该中间人仅处理 `GET https://google.com` 的请求，并返回 `You've Been Hacked`。

将 ca.cert.pem 导入设置为全局信任，并创建一个 HTTPS Server，

```js
'use strict'
const fs = require('fs')
const https = require('https')

const options = {
  key: fs.readFileSync('data/server.key.pem'),
  cert: fs.readFileSync('data/server.cert.pem')
}
const httpsServer = https.createServer(options, (req, res) => {
  res.writeHead(200)
  res.end(`You've Been Hacked\n`)
}).listen(8080)
```

启动服务，为了测试证书是否正常工作，在 /etc/hosts 中增加条目 `127.0.0.1 google.com`，并对服务器发送请求

```
$ curl https://google.com:8080
You've Been Hacked
```

这表明根证书和证书被成功创建了，删除临时增加的 /etc/hosts 条目，然后

## 参考链接

* [OpenSSL Certificate Authority](https://jamielinux.com/docs/openssl-certificate-authority/index.html)
