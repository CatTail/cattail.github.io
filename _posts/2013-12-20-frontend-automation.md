---
layout: post
title: frontend automation
date: 2013-06-17 17:06:25
categories: tech
---
## Jake

When frontend project get larger, It's hard to do task by bare hand - execute task by yourself. I first came across [Jake](https://github.com/mde/jake). Like Make in c and Rake in ruby, Jake is used as build tool in javascript.

I use Jake to handle these tasks:

* temporary directory and file cleanup
* deps generator (I use closure library)
* less, soy compilation
* javascript compilation, minification and deps management

## Grunt

Jake is good at task dependence management (which another build tool grunt I'm going to mention lack of), while it's ecosystem is horrible.

When project get larger, I reconstruct main Jakefile into several files into [jakelib](http://jakejs.com/docs#breaking_things_up_into_multiple_files).

At this moment, project task is a little be different

* enhanced cleanup
* enhanced deps generator & compilation
* subtask require cleanup & deps & compilation

Because Jakefile invoke a lot of shell command and I have to write almost all these function by myself, there are string concatenation all over the place. It's hard to maintain Jakefile anymore.

I was trying to use Makefile to replace Jakefile, while there were other problems:

* Makefile is less expressive compared with Jakefile
* parallel task

I came across [Grunt](http://gruntjs.com/) to figure out a better solution.

It's really amazoning that I don't have to write any tool to implement a build task because every task I need always already have a [plugin](http://gruntjs.com/plugins) there. Grunt's ecosystem is greate and it was the first time I really how ecosystem is important to a single tool.

As a result, almost 500 line of string concatenation were replaced by 100 line of grunt configurations.

Through, when project became event larger, the config object is hard to maintain. I have to `<c-f>` several times to find the entry I want to modify, so I split Gruntfile into several configuration file by [load-grunt-config](https://github.com/firstandthird/load-grunt-config/) and use [load-grunt-tasks](https://github.com/sindresorhus/load-grunt-tasks) to load grunt plugin automatically.

## Yeoman

yeoman, unlike Jake and Grunt, is a scaffolding tool. When project growth and modulize, I abstract the pattern of writing module and tests, use yeoman generator to generate module and test automatically.

## Gulp

Gulp is another build tool popular these days in github. I'm going to figure out what it is and why it's better before I came back and write something.