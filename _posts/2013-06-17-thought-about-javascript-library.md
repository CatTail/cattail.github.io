---
layout: post
title: Javascript library - today and future
date: 2013-06-17 17:06:25
categories: tech
---
This article focus on browser side javascript library, by roughly reading the document and source code of these libraries, including

* kissy
* tangme
* jx
* seajs
* underscore
* backbone
* async
* dojo
* moto
* ender
* google closure library

## Today
Classified by functionality, there are two kinds of library

* Full functional library: library contain all the function we need
* Single functional library: library focus on particular problem

Full functional library tends to solve all problems, such as jx, dojo, jquery provide a suit of solutions including module load, core object extend, browser compability, DOM operation and ajax etc. They provide a lot of  functions, but it's learning curve is not easy, and hard to maintain.

Single functional library tends to solve particular problem, such as seajs only solve module load, async focus on asynchrounous problem, underscore providing FP suger. By using several single functional library, we can do whatever full functional library can do. That's why there are ender which is no library library only used for organize libraries.

## Compare
I prefer to single functional library than full functional library such as extjs, because:

* Who is powerful: by organize single functional library, we have full functional library
* Who can do better: single functional library could do better by performance, bug fix because there contributor are easier to understand what they do.

Through, single functional library faced with some problem:

* how to maintian module dependencies
* namespace
* code style
* compilation and compression

and also there are solutions:

* seajs, requirejs
* google closure deps, module, compile tool suit
* ender

## Future
By ender
> In the browser - small, loosely coupled modules are the future and large, tightly-bound monolithic libraries are the past!
