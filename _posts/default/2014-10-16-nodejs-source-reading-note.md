---
layout: post
title: Node.js源码阅读笔记
date: 2014-10-16 17:56
categories: tech
---
本文通过阅读Node.js([版本0.11.9][node])的代码, 试图理解两个问题

* C++和JS是如何交互的
* 异步是如何实现的, event loop在其中充当什么角色

目录

* [两个问题](#两个问题)
* [C++和Javascript交互](#c++和javascript交互)
* [Node.js初始化](#node.js初始化)
    * [Node.js模块](#node.js模块)
    * [process.binding](#process.binding)
    * [模块小结](#模块小结)
* [异步实现](#异步实现)
    * [追踪fs.readFile回调](#追踪fs.readfile回调)
    * [创建运行event loop](#创建运行event-loop)
    * [深入libuv](#深入libuv)
    * [异步小结](#异步小结)
* [总结](#总结)
* [相关参考](#相关参考)

## 两个问题

### 最大调用栈
如果直接调用一下代码, 会造成调用栈过深

```javascript
function foo() {
    foo();
}
foo();
// Maximum call stack size exceeded
```

然而, 将递归调用放到异步回调中, 就避免了调用栈过深

```javascript
function foo() {
    setTimeout(foo, 0);
}
foo();
// all right. browser never block, code execute normally.
```

### 队列优先级
下面是一个文件读取操作, 多次试验, 输出的文件平均读取耗时为40mm

```javascript
var start = Date.now();

fs.readFile("data.txt", function() {
    console.log(Date.now() - start);
});
// 35, 38, 40, 37, 42
```

我们设定两个计时器, 一个比文件读取时间短(0), 另一个要长(100), 最后输出结果在注释中

```javascript
var fs = require('fs');

var start = Date.now();

setTimeout(function() {
    console.log('First timer');
}, 0);

fs.readFile("data.txt", function() {
    console.log('Async Operation', Date.now() - start);
});

setTimeout(function() {
    console.log('Second timer');
}, 100);

// First timer 12
// Async Operation 36
// Second timer 108
```

这样的结果我们是能够理解的, 第一个计时器最快完成(0mm), 然后文件读取完成(37mm), 最后一个计时器最后完成.

但是, 如果像下面代码, 我们使用循环阻塞整个进程, 直到所有任务都完成后, 在执行回调, 结果是怎样呢?

```javascript
var fs = require('fs');

var start = Date.now();

setTimeout(function() {
    console.log('First timer', Date.now() - start);
}, 0);

fs.readFile("data.txt", function() {
    console.log('Async Operation', Date.now() - start);
});

setTimeout(function() {
    console.log('Second timer', Date.now() - start);
}, 100);

while(1) {
    if ((Date.now() - start) > 200) {
        break;
    }
}

// First timer 212
// Second timer 213
// Async Operation 238
```

结果先执行两个计时器, 最后执行IO操作. 下面是一个类似的浏览器上的例子

<iframe width="100%" height="300" src="http://jsfiddle.net/cattail/bkghxdfr/8/embedded/" allowfullscreen="allowfullscreen" frameborder="0"></iframe>

为了理解这两个问题, 我们需要理解event loop背后的原理, 回答一些问题 --- 1) 多线程? 2) 多堆栈? 3) 多队列?

## C++和Javascript交互
通过v8源码的示例[process.cc][process.cc]和[count-hosts.js][count-hosts.js], 我们可以了解C++和Javascript代码是如何进行交互的.

通过在C++代码中使用v8引擎提供的接口, 可以在Javascript运行上下文中插入使用C++定义的变量(或函数); 同时, 也可以取出Javascript在此上下文中定义的变量(或函数等), 在C++代码中执行.

**在Javascript代码中使用通过C++定义的函数**

首先创建全局对象, 用于存放build-in函数`log` [source][define log]

```cpp
Handle<ObjectTemplate> global = ObjectTemplate::New();
global->Set(String::New("log"), FunctionTemplate::New(LogCallback));
```

在Javascript中, 就可以使用log函数输出日志 [source][invoke log]

```cpp
log("Processing " + request.host + request.path + " from " + request.referrer + "@" + request.userAgent);
```

**在C++中获得使用Javascript定义的函数**

在count-hosts.js中定义全局函数Process

```cpp
function Process(request) { ... }
```

在process.cc中, 先取出该函数 [source][C++ use JS]

```cpp
Handle<String> process_name = String::New("Process");
Handle<Value> process_val = context->Global()->Get(process_name);
Handle<Function> process_fun = Handle<Function>::Cast(process_val);
```

之后再调用它

```cpp
const int argc = 1;
Handle<Value> argv[argc] = { request_obj };
v8::Local<v8::Function> process = v8::Local<v8::Function>::New(GetIsolate(), process_);
Handle<Value> result = process->Call(context->Global(), argc, argv);
```

## Node.js初始化

为了理解event loop的实现, 首先要对Node.js初始化和模块有所了解.

Node.js的初始化调用链是这样的, [main][main] -> [Start][node:Start] -> [CreateEnvironment][node:CreateEnvironment] -> [Load][node:Load], [Start][node:Start]过程中启用了event loop

```cpp
int Start(int argc, char** argv) {
    ...
    Environment* env =
        CreateEnvironment(node_isolate, argc, argv, exec_argc, exec_argv);
    ...
*    uv_run(env->event_loop(), UV_RUN_DEFAULT);
    ...
}
```

[node:Load][node:Load]加载了[node.js][node.js], [node.js][node.js]是第一个被加载的Javascript文件, 它负责初始化Node.js的全局变量和函数, 如setTimeout, nextTick等.

### Node.js模块
Node.js中, 模块是通过`require`来加载的, 其背后实现代码在[NativeModule.require][NativeModule.require]中.

`NativeModule.require`首先检测模块是否在缓存中,

```javascript
NativeModule.require = function(id) {
    ...
    var cached = NativeModule.getCached(id);
    if (cached) {
        return cached.exports;
    }
    ...
};
```

如果没有则读取该模块文件内容, 并调用`runInThisContext`执行Javascript模块代码

```javascript
NativeModule.require = function(id) {
    ...
    var nativeModule = new NativeModule(id);

    nativeModule.cache();
    nativeModule.compile();

    return nativeModule.exports;
};

NativeModule.prototype.compile = function() {
    var source = NativeModule.getSource(this.id);
    source = NativeModule.wrap(source);

    var fn = runInThisContext(source, { filename: this.filename });
    fn(this.exports, NativeModule.require, this, this.filename);

    this.loaded = true;
};
```

那么`runInThisContext`是怎样实现的呢?

```javascript
var ContextifyScript = process.binding('contextify').ContextifyScript;
function runInThisContext(code, options) {
    var script = new ContextifyScript(code, options);
    return script.runInThisContext();
}
```

稍后将介绍`process.binding`的实现. 通过grep代码, 在[node_contextify.cc][node_contextify]找到了`contextify`的C++实现.

可以预见, `process.binding`作为一个桥梁, 使用我们上面介绍C++和Javascript交互的技术, 使得Node.js可以调用C++中实现的代码.

### process.binding
我们可以在之前提到的Node.js初始化代码中，找到`process.binding`的实现.

在[node:CreateEnvironment][node:CreateEnvironment]过程中, 会初始化`process`对象, [设置`process.binding`][define process.binding]方法

```cpp
Environment* CreateEnvironment() {
  ...
  SetupProcessObject(env, argc, argv, exec_argc, exec_argv);
  ...
}

void SetupProcessObject() {
  ...
  NODE_SET_METHOD(process, "binding", Binding);
  ...
}
```

[Binding][node:Binding]方法接受参数, 然后通过[调用`get_buildin_module`][invoke get_builtin_module]返回使用C++编写的模块

```cpp
static void Binding(const FunctionCallbackInfo<Value>& args) {
  ...
  node_module_struct* mod = get_builtin_module(*module_v);
  if (mod != NULL) {
    exports = Object::New();
    // Internal bindings don't have a "module" object, only exports.
    assert(mod->register_func == NULL);
    assert(mod->register_context_func != NULL);
    Local<Value> unused = Undefined(env->isolate());
    mod->register_context_func(exports, unused, env->context());
    cache->Set(module, exports);
  } else if (!strcmp(*module_v, "constants")) {
    exports = Object::New();
    DefineConstants(exports);
    cache->Set(module, exports);
  } else if (!strcmp(*module_v, "natives")) {
    exports = Object::New();
    DefineJavaScript(exports);
    cache->Set(module, exports);
  } else {
    return ThrowError("No such module");
  }

  args.GetReturnValue().Set(exports);
}
```

[get_builtin_module][get_builtin_module]通过事先注册的模块列表`node_module_list`来加载模块, `node_module_list`是通过宏实现的.

在src/node_extensions.h中定义宏[NODE_EXT_LIST][NODE_EXT_LIST], 其中包含了使用C++编写的模块

在src/node_extensions.cc中, [调用宏][invoke NODE_EXT_LIST], 展开过程中使用到得诸如`node_fs_module`变量则是在每个C++模块底部定义的

```cpp
NODE_MODULE_CONTEXT_AWARE(node_contextify, node::InitContextify);
```

这个宏展开后的结果是

```cpp
extern "C" {
    node::node_module_struct node_contextify_module = {
        13 , __null , __FILE__ , __null , ( node::InitContextify ), "node_contextify"}
    ;
};
```

`get_builtin_module`中获取了C++模块后, 通过使用`register_context_func`模块自己制定的[注册函数][register C++ module]完成注册的步骤.

```cpp
mod->register_context_func(exports, unused, env->context());
```

### 模块小结
Node.js使用C++来实现系统调用, 在每个C++模块底部都将该模块注册到一个全局队列中. 当这些模块被`require`时, 将检索全局队列, 初始化, 导出该模块.

如果你编写过Node.js [C++ Addon][addon], 就会发现Addon也需要通过宏来注册自己.

## 异步实现

### 追踪fs.readFile回调
为了追查异步调用的实现, 我们先从一个常用的异步方法[fs.readFile][fs.readFile]开始,

`fs.readFile`使用[fs.read][fs.read]来读取数据, 并最终调用`binding.read`

```javascript
fs.read = function(fd, buffer, offset, length, position, callback) {
  ...
  binding.read(fd, buffer, offset, length, position, wrapper);
};
```

其中`binding`是这样定义的

```javascript
var binding = process.binding('fs');
```

根据我们上节讲到得`process.binding`魔法, [node_file.cc][node_file]为文件操作提供了最终实现.

`fs.read`在[node_file.cc][node_file]中实现为[Read][Read], 这个实现是对`read(2)`的一个包装.

在`Read`中, 获取了异步调用的回调函数, 并将其传入`ASYNC_CALL`

```cpp
static void Read(const FunctionCallbackInfo<Value>& args) {
    ...
    cb = args[5];

    if (cb->IsFunction()) {
        ASYNC_CALL(read, cb, fd, buf, len, pos);
    } else {
        SYNC_CALL(read, 0, fd, buf, len, pos)
        args.GetReturnValue().Set(SYNC_RESULT);
    }
    ...
}
```

宏展开`async`

```cpp
Environment* env = Environment::GetCurrent(args.GetIsolate());
FSReqWrap* req_wrap = new FSReqWrap(env, "read" );
int err = uv_fs_read (env->event_loop(), &req_wrap->req_, fd , buf , len , pos , After);
req_wrap->object()->Set(env->oncomplete_string(), cb );
req_wrap->Dispatched();
if (err < 0) {
    uv_fs_t* req = &req_wrap->req_;
    req->result = err;
    req->path = __null ;
    After(req);
}
args.GetReturnValue().Set(req_wrap->persistent());
```

在libuv中, `uv_fs_read`的定义是这样的,

```cpp
UV_EXTERN int uv_fs_read(uv_loop_t* loop, uv_fs_t* req, uv_file file,void* buf, size_t length, int64_t offset, uv_fs_cb cb);
```

它使用event loop的核心数据结构`loop`, 当文件读取操作完成后, 将会调用回调函数`cb`. 接下来我们来看看 libuv是如何实现完成事件调用函数的功能的.

### 创建运行event loop

Node.js初始化过程中, [CreateEnvironment][node:CreateEnvironment]使用`uv_default_loop`创建了event loop中使用的核心数据结构`loop`, 在[node:Start][node:Start]中通过`uv_run`启用event loop(见[Node.js初始化](#node.js初始化))

### 深入libuv
理解libuv分两条线索, 任务的提交和任务的处理.

**任务提交**

仍以文件读取为例, 上面已经讲到`uv_fs_read`会在文件可用时调用回调.

```cpp
uv_fs_read (env->event_loop(), &req_wrap->req_, fd , buf , len , pos , After);
```
    
`uv_fs_read`是这样定义的(deps/uv/src/unix/fs.c)

```cpp
int uv_fs_read() {
  ...
  do {
      if ((cb) != ((void*)0) ) {
*          uv__work_submit((loop), &(req)->work_req, uv__fs_work, uv__fs_done);
          return 0;
      }
      else {
          uv__fs_work(&(req)->work_req);
          uv__fs_done(&(req)->work_req, 0);
          return (req)->result;
      }
  }
  ...
}
```

最后文件读取任务被插入任务队列, 等待线程池中线程空闲后执行,

[source][uv__work_submit]

```cpp
void uv__work_submit() {
  uv_once(&once, init_once);
  w->loop = loop;
  w->work = work;
  w->done = done;
  post(&w->wq);
}

static void post(QUEUE* q) {
  uv_mutex_lock(&mutex);
  QUEUE_INSERT_TAIL(&wq, q);
  uv_cond_signal(&cond);
  uv_mutex_unlock(&mutex);
}

#define QUEUE_INSERT_TAIL(h, q)                                               \
  do {                                                                        \
    QUEUE_NEXT(q) = (h);                                                      \
    QUEUE_PREV(q) = QUEUE_PREV(h);                                            \
    QUEUE_PREV_NEXT(q) = (q);                                                 \
    QUEUE_PREV(h) = (q);                                                      \
  }                                                                           \
  while (0)
```

**任务处理**

`uv_default_loop`创建并初始化了loop对象,

```c
uv_loop_t* uv_default_loop(void) {
  if (default_loop_ptr != NULL)
    return default_loop_ptr;

  if (uv__loop_init(&default_loop_struct, /* default_loop? */ 1))
    return NULL;

  default_loop_ptr = &default_loop_struct;
  return default_loop_ptr;
}

static int uv__loop_init(uv_loop_t* loop, int default_loop) {
  ...
  memset(loop, 0, sizeof(*loop));
  RB_INIT(&loop->timer_handles);
  QUEUE_INIT(&loop->wq);
  QUEUE_INIT(&loop->active_reqs);
  QUEUE_INIT(&loop->idle_handles);
  QUEUE_INIT(&loop->async_handles);
  QUEUE_INIT(&loop->check_handles);
  QUEUE_INIT(&loop->prepare_handles);
  QUEUE_INIT(&loop->handle_queue);
  ...
}
```

`uv_run`不断循环检测是否还有待处理任务, 如果有则执行该任务关联的回调; 如果没有待处理的任务, 程序就结束了.

在这里还可以看到, 对于`timer`和`io`任务队列的处理优先级是不同的.

```c
int uv_run(uv_loop_t* loop, uv_run_mode mode) {
  ...
  r = uv__loop_alive(loop);
  while (r != 0 && loop->stop_flag == 0) {
    UV_TICK_START(loop, mode);

    uv__update_time(loop);
    uv__run_timers(loop);
    uv__run_idle(loop);
    uv__run_prepare(loop);
    uv__run_pending(loop);

    timeout = 0;
    if ((mode & UV_RUN_NOWAIT) == 0)
      timeout = uv_backend_timeout(loop);

    uv__io_poll(loop, timeout);
    uv__run_check(loop);
    uv__run_closing_handles(loop);

    if (mode == UV_RUN_ONCE) {
      uv__update_time(loop);
      uv__run_timers(loop);
    }

    r = uv__loop_alive(loop);
    UV_TICK_STOP(loop, mode);

    if (mode & (UV_RUN_ONCE | UV_RUN_NOWAIT))
      break;
  }
  ...
}
```

event loop的伪代码是这样的

```
while there are still events to process:
    e = get the next event
    if there is a callback associated with e:
        call the callback
```

### 异步小结
Javascript的异步IO最终使用libuv, 将任务提交到线程池中进行处理. Javascript代码仍然在一条主线程中, 不需要考虑变量共享和锁的问题.

但是背后有多个工作线程处理异步IO操作, 使得Node.js能高校处理IO操作.

## 总结

* C++能够通过v8提供的API获取并修改Javascript执行上下文
* 暴露在Node.js环境中的系统调用最终是使用C++编写的
* 在Node.js中调用IO接口后, 会将任务提交到线程池中执行. Node.js程序员看到的是单线程的Javascript代码, 但是最终任务是多线程处理的.
![thread model](/assets/node-thread-model.png)

最后解答文章开头两个问题

### 最大调用栈
使用一部调用进行递归可以避免调用栈过深的原因是, 每次回调函数执行时候, 栈已经被清空; 只有栈清空时, event loop才有机会检测事件队列, 执行回调函数.

### 队列优先级
在上面已经提到, 不同的异步操作队列是有优先级的, 通常timer会高于IO操作. 当然, 前提当event loop在检测时他们都处于完成状态.

执行Javascript代码的v8引擎和event loop在同一个主线程上, 这导致我们使用`while`循环执行Javascript代码时, 无法检测操作状态, 直到退出`while`循环, event loop看到都已经处于完成状态的操作, 按照队列优先级执行这些操作的回调.

## 相关参考

* [node][node]
* [libuv][libuv]
* [An Introduction to libuv](http://nikhilm.github.io/uvbook/)
* [libevent](http://libevent.org/)


[node]: https://github.com/joyent/node/tree/v0.11.9
[libuv]: https://github.com/joyent/libuv
[process.cc]: https://github.com/joyent/node/blob/v0.11.9/deps/v8/samples/process.cc
[count-hosts.js]: https://github.com/joyent/node/blob/v0.11.9/deps/v8/samples/count-hosts.js
[define log]: https://github.com/joyent/node/blob/v0.11.9/deps/v8/samples/process.cc#L164
[invoke log]: https://github.com/joyent/node/blob/v0.11.9/deps/v8/samples/count-hosts.js#L32
[C++ use JS]: https://github.com/joyent/node/blob/v0.11.9/deps/v8/samples/process.cc#L189
[node:Load]: https://github.com/joyent/node/blob/v0.11.9/src/node.cc#L2520
[node:CreateEnvironment]: https://github.com/joyent/node/blob/v0.11.9/src/node.cc#L3177
[node:Start]: https://github.com/joyent/node/blob/v0.11.9/src/node.cc#L3224
[main]: https://github.com/joyent/node/blob/v0.11.9/src/node_main.cc#L64
[node.js]: https://github.com/joyent/node/blob/v0.11.9/src/node.js
[node_contextify]: https://github.com/joyent/node/blob/v0.11.9/src/node_contextify.cc
[invoke SetupProcessObject]: https://github.com/joyent/node/blob/v0.11.9/src/node.cc#L3217
[SetupProcessObject]: https://github.com/joyent/node/blob/v0.11.9/src/node.cc#L2264
[define process.binding]: https://github.com/joyent/node/blob/v0.11.9/src/node.cc#L2472
[NativeModule.require]: https://github.com/joyent/node/blob/v0.11.9/src/node.js#L968
[fs.readFile]: https://github.com/joyent/node/blob/v0.11.9/lib/fs.js#L172
[fs.read]: https://github.com/joyent/node/blob/v0.11.9/lib/fs.js#L413
[node_file]: https://github.com/joyent/node/blob/v0.11.9/src/node_file.cc
[Read]: https://github.com/joyent/node/blob/v0.11.9/src/node_file.cc#L803
[node:Binding]: https://github.com/joyent/node/blob/v0.11.9/src/node.cc#L1900
[invoke get_builtin_module]: https://github.com/joyent/node/blob/v0.11.9/src/node.cc#L1924
[get_builtin_module]: https://github.com/joyent/node/blob/v0.11.9/src/node_extensions.cc#L52
[register C++ module]: https://github.com/joyent/node/blob/v0.11.9/src/node_file.cc#L1059
[node_module_struct]: https://github.com/joyent/node/blob/v0.11.9/src/node.h#L215
[NODE_EXT_LIST]: https://github.com/joyent/node/blob/v0.11.9/src/node_extensions.h#L33
[invoke NODE_EXT_LIST]: https://github.com/joyent/node/blob/v0.11.9/src/node_extensions.cc#L48
[define watcher]: https://github.com/joyent/node/blob/v0.11.9/deps/uv/src/unix/loop-watcher.c#L61
[uv__work_submit]: https://github.com/joyent/node/blob/v0.11.9/deps/uv/src/unix/threadpool.c#L156
[addon]: http://nodejs.org/api/addons.html
