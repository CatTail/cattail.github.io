---
layout: post
title: 基于userID和requestID的日志实践
description: 介绍通过userID和requestID关联独立日志,以及在Nodejs应用中的日志实践
date: 2015-09-15 18:21
categories: tech
---
本文介绍基于浏览器-服务器架构的日志处理.

### userID

当用户第一次访问网站时, 将被赋予一个`userID`. 这个`userID`设置在cookie中, 该用户之后的所有访问都会带上该`userID`.

```
Set-Cookie: userid=ca4bac6fe62a45169723; path=/; expires=Fri, 08 Sep 2045 07:06:07 GMT; domain=.example.com; httponly
```

在记录[accesslog](https://en.wikipedia.org/wiki/Common_Log_Format)时, 会加入userID

```
::ffff:127.0.0.1 - ca4bac6fe62a45169723 [16/Sep/2015:15:05:13 +0800] "GET / HTTP/1.X" 200 72732
```

通过`userID`, 可以查询到特定用户的所有访问记录`accesslog`.

### requestID

除了记录访问记录外, 在处理每个用户请求过程中, 涉及业务逻辑处理和后端服务调用等, 对某些操作也需要记录相应日志和错误.

对每个请求, 都生成一个唯一的`requestID`. 在这个请求的生命周期中, 所有打印的日志都会带上`requestID`信息.

```
requestID=bb56f2b0-5c43-11e5-8068-adc7f452615d message=::ffff:127.0.0.1 - ca4bac6fe62a45169723 [16/Sep/2015:15:05:13 +0800] "GET / HTTP/1.X" 200 72732
```

借助`requestID`, 可以查询到特定请求的所有业务日志.

### 其他字段

那么, 怎样知道一条日志是访问日志还是业务日志呢? 如果是业务日志, 又是不是我们感兴趣的业务日志?

在一条完整的日志中, 还需要包含其他信息, 上面提到的就是`type`, 一条完整的日志应该包括以下内容:

* version: 日志版本, 为后续日志格式修改升级留下空间
* app: 用于在集中式日志管理系统中区分当前日志所属的应用
* host: 主机名
* level: INFO, WARN, ERROR等
* timestamp: 时间戳
* type: 日志类型, 可选, 默认为系统日志(`system`), 还可以自己需要设置访问日志(`accesslog`)和其他自定义的类型
* requestID: 请求ID, 可选
* message: 具体日志内容, 格式由应用自己定义, 处理和解析

```
version=2 app=app-name host=zhongchiyus-MacBook-Pro.local level=INFO timestamp=1442388168 type=accesslog requestID=bb56f2b0-5c43-11e5-8068-adc7f452615d message=::ffff:127.0.0.1 - ca4bac6fe62a45169723 [16/Sep/2015:15:22:48 +0800] "POST /account/unitivelogin HTTP/1.X" 200 164
```

### Node.js中的实践

在Node.js中, 推荐使用[winston](https://github.com/winstonjs/winston)打印日志, 除了丰富的功能外, 强大的[transport](https://github.com/winstonjs/winston/blob/master/docs/transports.md)构建了一个完善的生态.

在Node.js应用的开发环境

* 实时日志打印到终端

在生产环境

* 错误日志(WARN, ERROR级别)发送到[sentry](https://getsentry.com/)
* 实时日志以文件形式存储在机器上, 临时存储一天
* 延时日志发送到[flume](https://flume.apache.org/), 持久存储


## 参考

* [GitHub代码示例](https://github.com/CatTail/log-starter-kit)
* [bits technology 最佳日志实践](http://www.bitstech.net/2014/01/07/log-best-practice/)
