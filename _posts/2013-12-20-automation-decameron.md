---
layout: post
title: X 项目自动化工具十日谈
date: 2013-06-17 17:06:25
categories: tech
---
Jake -> Grunt -> Gulp(?)


### Day1 - Jake easy!

大约在 X 项目开始之后2个月后, 因为本地一些自动化需求增加, 手工执行某些命令已经太过于麻烦, 从而引入了 [Jake](https://github.com/mde/jake) 作为 X 项目的自动化工具.

实际上, 从 X 项目开始就已经有了 Jake 的概念, 因为 X 的初始目录结构是从 [shoreline](https://github.com/metamolecular/shoreline), 而 shoreline 内置使用 Jake 作为自动化工具, 这是 X 使用 Jake 的实际原因.

一开始引入 Jake 主要做了这些工作:
  - 临时目录和文件清理
  - 依赖生成
  - less, soy 编译
  - Javascript 代码编译和依赖复制

(详细代码请看 [Day1 Jakefile](assets/d1.js))


### Day2 - Jake hard!!

Jake 在依赖定义和处理方面让我刮目相看, 但是随着自动化需求的增加, 大约在 X 项目开始半年后, 使用 Jake 简直是一个灾难.

在自动化需求增加过程中, 进行了几次大小不一的重构, 最后将 Jakefile 中的任务拆分到不同文件中, 这些文件位于 [jakelib](https://github.com/mde/jake#breaking-things-up-into-multiple-files)

此时 X 的自动化需求不仅有增强版的 清理, 依赖以及编译 工作, 还增加了一些子项目, 而这些子项目同时也有 清理, 依赖和编译 的需求.

除了自动化需求的增长, 由于编译等工具调用 shell 命令, Jakefile 中充斥了字符串的拼接, 难以维护.

(详细代码请看 [Day2 Jakefile](assets/d2.js) 和 [Day2 jakelib](assets/jakefile.zip))

此时, 由于自动化依赖 shell 脚本调用, 我考虑了直接使用 Makefile, 然而, Makefile 在这里有两点不足:
  - 比不上代码 (Javascript) 自动工具的表达能力
  - 异步调用

以上两个原因导致最终没有使用 Makefile, 转而投向了 [Grunt](http://gruntjs.com/).


### Day3 - Grunt ecosystem!!!

使用 Grunt 的一个非常显著的特点就是再也不需要自己编写特定的工具了, 社区驱动的生态系统几乎有所有你需要处理工作的相应插件, 你只需要配置这些插件就可以了. 因此, Jakefile 中充斥的自己编写的脚本以及字符串拼接转变为一个优雅的配置对象. 而代码量也从 500 行缩减为 100.

(详细代码请看 [Day3 Gruntfile](assets/d3.coffee))


### Day4 - Grunt too big config!!!!

这大约是 X 项目开始一年后, 即使使用 Grunt, 配置对象也显得略有点大了. 使用 Coffee 编写的配置对象大约占用了 200 行的空间, 我得 `<c-f>` 10秒钟才能找到我需要修改的配置条目, 因而引入了 [load-grunt-tasks](https://github.com/sindresorhus/load-grunt-tasks) 和 [load-grunt-config](https://github.com/firstandthird/load-grunt-config/) 将配置文件分隔到子文件中.


(详细代码请看 [Day4 Gruntfile](assets/d4.coffee) 和 [Day4 grunt](assets/grunt.zip))


### Day5 - Yeoman!!!!!

用程序来写程序, 这是我曾经为之激动而又害怕的东西, 如今却一步步从神台走下来.

当代码数量增长到一定程度, 模块化逐渐完善后, 可以逐步从中抽象可重用的代码模板, 从而简化模块编写的复杂度, 当然这只是最低级的程序来编写程序的场景.

Yeoman 并不是专门用于此的工具, 但是它具有模板等一系列工具完全可以满足 X 的需求.

今后随着模块化的进行, 代码自动生成工具必将更有用途.


### ? - Day10 - Where is the missing [Decameron](http://en.wikipedia.org/wiki/Decameron)

近期看到 Github 上 [Gulp](https://github.com/wearefractal/gulp) 流式自动工具汹涌而来, 还未尝鲜, 不如试试?


### 相关参考
 - [Grunt vs Jake](http://cattail.me/Tech/2013/06/30/javascript-lecture/index.html#41)
