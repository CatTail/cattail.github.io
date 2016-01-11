---
layout: post
title: 如何为开源Nodejs库patch代码
keywords: nodejs,patch,open source
description: 如何解决由合并PR慢导致业务项目被block的问题
date: 2016-01-11 16:55
category: tech
---

以开源项目[graphql-js](https://github.com/graphql/graphql-js)举例，原项目不支持在语法树（AST）中获取父节点，

对其改动有两种做法

* fork并维护独立分支：优点是自由度大，初期项目需求可以迅速实现；缺点是后期维护成本高
* patch代码以满足当前需求：优点是后期维护成本低，可以由社区支持项目不断改善；缺点项目进度被上游merge代码的速度阻碍

本文提供方案来解决patch代码时因为被上游阻碍影响项目开发进度的问题。

### patch

修改代码并[提交PR](https://github.com/graphql/graphql-js/pull/273)


### 发布

**不应该修改内网npm镜像中的同名包，而应该在scope域下发patch包**

修改`package.json`，增加scope并发布

```json
{
  "name": "@scope/graphql",
  ...
}
```


### 热替换

业务项目中的依赖包本身可能就会依赖需要被patch的包，例如项目同时依赖了[`graphql-js`](https://github.com/graphql/graphql-js)和[`express-graphql`](https://github.com/graphql/express-graphql/)，而`express-graphql`又依赖了`graphql-js`。我们除了需要直接在项目中使用`@scope/graphql`，还需要为所有依赖包做相同的改动，通过热替换可以解决这个问题。

在业务项目中增加patch包依赖

```json
{
  ...
  "dependencies": {
    "@scope/graphql": "^0.4.14",
    ...
  }
  ...
}
```

在项目入口热替换需要patch的包

```js
// package alias
// patch https://github.com/graphql/graphql-js/pull/273
require('@scope/graphql') // prime cache
require.cache[require.resolve('graphql')] = require.cache[require.resolve('@scope/graphql')]
```
