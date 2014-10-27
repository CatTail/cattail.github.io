---
layout: post
title: Node.js源码阅读笔记
date: 2014-10-16 17:56
categories: tech
---
本文通过阅读Node.js([版本0.11.9][node])的代码, 试图理解两个问题

* C++和JS是如何交互的
* 异步是如何实现的, event loop在其中充当什么角色

笔记

* [C++和Javascript交互](#C++和Javascript交互)
* [Node.js初始化](#node.js初始化)
    * [Node.js模块](#node.js模块)
    * [process.binding](#process.binding)
* [异步实现](#异步实现)
    * [追踪fs.readFile回调](#追踪fs.readFile回调)
    * [创建并运行event loop](#创建并运行event loop)
    * [深入libuv](#深入libuv)
* [总结](#总结)
* [相关参考](#相关参考)

### C++和Javascript交互
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

### Node.js初始化
Node.js的初始化调用链是这样的, [main][main] -> [Start][node:Start] -> [CreateEnvironment][node:CreateEnvironment] -> [Load][node:Load],

在Start过程中启用了event loop

```cpp
int Start(int argc, char** argv) {
    ...
    Locker locker(node_isolate);
    Environment* env =
        CreateEnvironment(node_isolate, argc, argv, exec_argc, exec_argv);
    // This Context::Scope is here so EnableDebug() can look up the current
    // environment with Environment::GetCurrentChecked().
    // TODO(bnoordhuis) Reorder the debugger initialization logic so it can
    // be removed.
    Context::Scope context_scope(env->context());
*    uv_run(env->event_loop(), UV_RUN_DEFAULT);
    EmitExit(env);
    RunAtExit(env);
    env->Dispose();
    env = NULL;
    ...
}
```

在[node:Load][node:Load]加载了[node.js][node.js], [node.js][node.js]负责初始化Node.js, 包括初始化全局变量和函数, 如setTimeout, nextTick等.

#### Node.js模块
Node.js中, 模块是通过`require`来加载的, 而其背后的实现在[src/node.js][NativeModule.require]中.

`NativeModule.require`首先检测模块是否在缓存中(已经被require的模块就会缓存), 如果没有则读取该模块文件内容, 并在当前上下文中执行.

读取模块文件内容使用`NativeModule._sources`,

```javascript
NativeModule.getSource = function(id) {
    return NativeModule._source[id];
}
```

而`NativeModule._sources`是通过`process.binding`获取的

```javascript
NativeModule._source = process.binding('natives');
```

和读取模块内容一样, 在当前上下文执行代码最终也是通过`process.binding`获取背后的黑盒来实现的.

```javascript
var fn = runInThisContext(source, { filename: this.filename });
```

```javascript
var ContextifyScript = process.binding('contextify').ContextifyScript;
function runInThisContext(code, options) {
    var script = new ContextifyScript(code, options);
    return script.runInThisContext();
}
```

追查源码, 可以在[node_contextify.cc][node_contextify]看到contextify最终的C++实现.

这里可以看到, `process.binding`作为一个桥梁, 使得Node.js可以调用C++中实现的代码.

#### process.binding
重新review之前提到的Node.js初始化代码, 可以发现`process.binding`的实现. 

在[node:CreateEnvironment][node:CreateEnvironment]过程中, 会初始化`process`对象

```cpp
SetupProcessObject(env, argc, argv, exec_argc, exec_argv);
```

[node:SetupProcessObject][SetupProcessObject]会[设置`process.binding`][define process.binding]方法

[Binding][node:Binding]方法接受参数, 然后通过[调用`get_buildin_module`][invoke get_builtin_module]返回使用C++编写的模块

```cpp
node_module_struct* mod = get_builtin_module(*module_v);
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

### 异步实现

#### 追踪fs.readFile回调
为了追查异步调用的实现, 我们先从一个常用的异步方法[fs.readFile][fs.readFile]开始,

`fs.readFile`使用[fs.read][fs.read]来读取数据, 而[fs.read][fs.read]最终调用了

```javascript
binding.read(fd, buffer, offset, length, position, wrapper);
```

其中`binding`是这样定义的

```javascript
var binding = process.binding('fs');
```

也就是说, [node_file.cc][node_file]为文件操作提供了最终实现.

`fs.read`在[node_file.cc][node_file]中实现为[Read][Read], 这个实现是对`read(2)`的一个包装.

在`Read`中, 获取了异步调用的回调函数, 并将其传入`ASYNC_CALL`

```cpp
cb = args[5];

if (cb->IsFunction()) {
    ASYNC_CALL(read, cb, fd, buf, len, pos);
} else {
    SYNC_CALL(read, 0, fd, buf, len, pos)
    args.GetReturnValue().Set(SYNC_RESULT);
}
```

对`async`进行宏展开,

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

在libuv中, `uv_file_read`的定义是这样的,

```cpp
UV_EXTERN int uv_fs_read(uv_loop_t* loop, uv_fs_t* req, uv_file file,void* buf, size_t length, int64_t offset, uv_fs_cb cb);
```

它使用事件循环`loop`, 当文件读取操作完成后, 将会调用回调函数`cb`. 后面一节会描述libuv是如何实现完成事件调用函数的功能的.

#### 创建运行event loop

event loop对象在Node.js初始化过程中使用`uv_default_loop`创建,

```cpp
Environment* env = Environment::New(context);
```

```cpp
inline Environment* Environment::New(v8::Local<v8::Context> context) {
  Environment* env = new Environment(context);
  context->SetAlignedPointerInEmbedderData(kContextEmbedderDataIndex, env);
  return env;
}
inline Environment::Environment(v8::Local<v8::Context> context)
    : isolate_(context->GetIsolate()),
      isolate_data_(IsolateData::GetOrCreate(context->GetIsolate())),
      using_smalloc_alloc_cb_(false),
      context_(context->GetIsolate(), context) {
  // We'll be creating new objects so make sure we've entered the context.
  v8::HandleScope handle_scope(isolate());
  v8::Context::Scope context_scope(context);
  set_binding_cache_object(v8::Object::New());
  set_module_load_list_array(v8::Array::New());
  RB_INIT(&cares_task_list_);
}

inline uv_loop_t* Environment::event_loop() const {
  return isolate_data()->event_loop();
}

inline Environment::IsolateData* Environment::IsolateData::GetOrCreate(
    v8::Isolate* isolate) {
  IsolateData* isolate_data = static_cast<IsolateData*>(isolate->GetData());
  if (isolate_data == NULL) {
    isolate_data = new IsolateData(isolate);
    isolate->SetData(isolate_data);
  }
  isolate_data->ref_count_ += 1;
  return isolate_data;
}

inline Environment::IsolateData::IsolateData(v8::Isolate* isolate)
*    : event_loop_(uv_default_loop()),
      isolate_(isolate),
#define V(PropertyName, StringValue)                                          \
    PropertyName ## _(isolate, FIXED_ONE_BYTE_STRING(isolate, StringValue)),
    PER_ISOLATE_STRING_PROPERTIES(V)
#undef V
    ref_count_(0) {
}

inline uv_loop_t* Environment::IsolateData::event_loop() const {
  return event_loop_;
}
```

在[node:Start][node:Start]中启用事件循环(见[Node.js初始化](#Node.js初始化))

#### 深入libuv
理解libuv分两条线索, 任务的提交和任务的处理.

**任务提交**

仍以文件读取为例, 上面已经讲到`uv_fs_read`会在文件可用时调用回调.

```cpp
uv_fs_read (env->event_loop(), &req_wrap->req_, fd , buf , len , pos , After);
```
    
`uv_fs_read`是这样定义的(deps/uv/src/unix/fs.c)

```cpp
int uv_fs_read(uv_loop_t* loop, uv_fs_t* req,
               uv_file file,
               void* buf,
               size_t len,
               int64_t off,
               uv_fs_cb cb) {
  do {
      uv__req_init(( ( loop ) ), (uv_req_t*)( ( req ) ), ( UV_FS )) ;
      (req)->fs_type = UV_FS_READ ;
      (req)->result = 0;
      (req)->ptr = ((void*)0) ;
      (req)->loop = loop;
      (req)->path = ((void*)0) ;
      (req)->new_path = ((void*)0) ;
      (req)->cb = (cb);
  }
  while (0);
  req->file = file;
  req->buf = buf;
  req->len = len;
  req->off = off;
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
  while (0);
}
```

最后文件读取任务被插入任务队列, 等待线程池中线程空闲后执行,

[source][uv__work_submit]

```cpp
void uv__work_submit(uv_loop_t* loop,
                     struct uv__work* w,
                     void (*work)(struct uv__work* w),
                     void (*done)(struct uv__work* w, int status)) {
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
  int timeout;
  int r;

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

  if (loop->stop_flag != 0)
    loop->stop_flag = 0;

  return r;
}
```

事件循环的伪代码是这样的

```
while there are still events to process:
    e = get the next event
    if there is a callback associated with e:
        call the callback
```

### 总结

* C++能够通过v8提供的API获取并修改Javascript执行上下文
* 暴露在Node.js环境中的很多模块最终实现都使用C++编写
* 在Node.js中调用IO接口后, 会将任务提交到线程池中执行. Node.js程序员看到的是单线程的Javascript代码, 但是最终任务是多线程处理的.
![thread model](/assets/node-thread-model.png)
* libuv实现基于事件的异步IO

### 相关参考

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
