---
layout: post
title: Nodejs源码阅读笔记
date: 2014-10-16 17:56
categories: tech
---
版本: 0.11.9

## 目的

* C++和JS如何交互
* 异步是如何实现的, event loop在其中充当什么角色

## 笔记
示例deps/v8/samples/process.cc和count-hosts.js展示了C++和JS是如何交互的.

### [JS use C++ function][JS use C++]
首先创建全局对象, 用于存放build-in函数`log`

```cpp
Handle<ObjectTemplate> global = ObjectTemplate::New();
global->Set(String::New("log"), FunctionTemplate::New(LogCallback));
```

在count-hosts.js中, 就可以使用log函数输出信息

```cpp
log("Processing " + request.host + request.path + " from " + request.referrer + "@" + request.userAgent);
```

### [C++ use JS function][C++ use JS]
在count-hosts.js中定义全局函数Process

```cpp
function Process(request) { ... }
```    

在process.cc中, 先取出该函数

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

### Nodejs初始化
src/node.js负责初始化node.js, 包括初始化全局变量和函数, 如setTimeout, nextTick等, 它被[node:Load][node:Load]加载,

初始化调用链是这样的, [main][main] -> [Start][node:Start] -> [CreateEnvironment][node:CreateEnvironment] -> [Load][node:Load],

其中, 在Start过程中启用了event loop

```cpp
V8::Initialize();
{
    Locker locker(node_isolate);
    Environment* env =
        CreateEnvironment(node_isolate, argc, argv, exec_argc, exec_argv);
    // This Context::Scope is here so EnableDebug() can look up the current
    // environment with Environment::GetCurrentChecked().
    // TODO(bnoordhuis) Reorder the debugger initialization logic so it can
    // be removed.
    Context::Scope context_scope(env->context());
    uv_run(env->event_loop(), UV_RUN_DEFAULT);
    EmitExit(env);
    RunAtExit(env);
    env->Dispose();
    env = NULL;
}
```

### Nodejs模块
Nodejs中, 模块是依靠`require`来加载的, 而其背后的实现在[src/node.js][NativeModule.require]中,

`require`最终通过`ContextifyScript`来执行代码.

```javascript
var script = new ContextifyScript(code, options);
return script.runInThisContext();
```

而`ContextifyScript`是通过`process.binding`获取的

```javascript
var ContextifyScript = process.binding('contextify').ContextifyScript;
```

最终追查源码, 可以在src/node_contextify.cc看到contextify最终的C++实现.
这里可以看到, process.binding作为一个桥梁, 使得Nodejs可以调用C++中实现的代码.
后面将提到`process.binding`的最终实现.

### process.binding
为了追查异步调用的实现, 我们先从一个常用的异步方法[fs.readFile][fs.readFile]开始,

`fs.readFile`使用[fs.read][fs.read]来读取数据, 而[fs.read][fs.read]最终调用了

```javascript
binding.read(fd, buffer, offset, length, position, wrapper);
```

其中`binding`是这样定义的

```javascript
var binding = process.binding('fs');
```

也就是说, 通过`process.binding('fs')`获取C++的文件操作实现, 继而在后续的Javascript环境中调用该实现.

我们先追查`fs.read`在[C++中的实现][Read], 事实上, 这个实现仅仅是对`read(2)`的一个包装而已.

所以, 这里真正的magic是`process.binding`的实现.

重新review之前提到的Nodejs初始化代码, 可以发现`process.binding`的实现. 

在[node:CreateEnvironment][node:CreateEnvironment]过程中, 会初始化`process`对象

```cpp
SetupProcessObject(env, argc, argv, exec_argc, exec_argv);
```

[node:SetupProcessObject][SetupProcessObject]会[设置`process.binding`][define process.binding]方法

[Binding][node:Binding]方法接受参数, 然后通过[调用`get_buildin_module`][invoke get_builtin_module]返回使用C++编写的模块

```cpp
node_module_struct* mod = get_builtin_module(*module_v);
```

[get_builtin_module][get_builtin_module]通过事先注册的模块列表`node_module_list`来加载模块, `node_module_list`是通过宏实现的

在src/node_extensions.h中定义宏[NODE_EXT_LIST][NODE_EXT_LIST], 其中包含了使用C++编写的模块

在src/node_extensions.cc中, [调用宏][invoke NODE_EXT_LIST],

展开过程中使用到得诸如`node_fs_module`变量则是在每个C++模块底部定义的

```cpp
NODE_MODULE_CONTEXT_AWARE(node_fs, node::InitFs)
```

这个宏展开后的结果是

```cpp
extern "C" {
    node::node_module_struct node_fs_module = {
        13 , __null , __FILE__ , __null , ( node::InitFs ), "node_fs"}
    ;
}
```

`get_builtin_module`中获取了C++模块后, 通过使用`register_context_func`模块自己制定的[注册函数][register C++ module]完成注册的步骤.

```cpp
mod->register_context_func(exports, unused, env->context());
```

### 异步

#### 追踪fs.readFile回调
仍然使用上面的例子[fs.readFile][fs.readFile]来介绍异步的实现. [fs.readFile][fs.readFile]调用[fs.read][fs.read],

```javascript
binding.read(fd, buffer, offset, length, position, wrapper);
```

上面已经描述过`binding`, `binding.read`转而使用C++编写的模块[Binding][node:Binding]

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

对`async`进行宏展开后,

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

`uv_file_read`的signature是这样的

```cpp
UV_EXTERN int uv_fs_read(uv_loop_t* loop, uv_fs_t* req, uv_file file,void* buf, size_t length, int64_t offset, uv_fs_cb cb);
```

它使用事件循环`loop`, 当文件读取操作完成后, 将会调用回调函数`cb`. 后面一节会描述libuv如何实现事件完成后调用回调函数.

#### 创建并运行event loop
event loop对象是通过`env->event_loop()`获取的, 让我们看看事件循环初始化过程中都做了什么.

```cpp
inline uv_loop_t* Environment::event_loop() const {
  return isolate_data()->event_loop();
}

inline uv_loop_t* Environment::IsolateData::event_loop() const {
  return event_loop_;
}
```

初始化event loop对象在Nodejs初始化过程中, 通过`uv_default_loop`创建事件循环,

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
    : event_loop_(uv_default_loop()),
      isolate_(isolate),
#define V(PropertyName, StringValue)                                          \
    PropertyName ## _(isolate, FIXED_ONE_BYTE_STRING(isolate, StringValue)),
    PER_ISOLATE_STRING_PROPERTIES(V)
#undef V
    ref_count_(0) {
}
```

在[node:Start][node:Start]中启用事件循环

```cpp
uv_run(env->event_loop(), UV_RUN_DEFAULT);
```

#### 深入libuv
理解libuv我们分两条线索, 任务的提交和任务的处理

任务提交

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
  INIT(READ);
  req->file = file;
  req->buf = buf;
  req->len = len;
  req->off = off;
  POST;
}
```

宏展开后

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
          uv__work_submit((loop), &(req)->work_req, uv__fs_work, uv__fs_done);
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

最后文件读取的工作被提交到事件循环中

```cpp
uv__work_submit((loop), &(req)->work_req, uv__fs_work, uv__fs_done);
```

deps/uv/src/unix/threadpool.c

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
```

```cpp
static void post(QUEUE* q) {
  uv_mutex_lock(&mutex);
  QUEUE_INSERT_TAIL(&wq, q);
  uv_cond_signal(&cond);
  uv_mutex_unlock(&mutex);
}
```

```cpp
#define QUEUE_INSERT_TAIL(h, q)                                               \
  do {                                                                        \
    QUEUE_NEXT(q) = (h);                                                      \
    QUEUE_PREV(q) = QUEUE_PREV(h);                                            \
    QUEUE_PREV_NEXT(q) = (q);                                                 \
    QUEUE_PREV(h) = (q);                                                      \
  }                                                                           \
  while (0)
```






在src/unix/loop.c中定义了创建event loop的方法

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
  unsigned int i;
  int err;

  uv__signal_global_once_init();

  memset(loop, 0, sizeof(*loop));
  RB_INIT(&loop->timer_handles);
  QUEUE_INIT(&loop->wq);
  QUEUE_INIT(&loop->active_reqs);
  QUEUE_INIT(&loop->idle_handles);
  QUEUE_INIT(&loop->async_handles);
  QUEUE_INIT(&loop->check_handles);
  QUEUE_INIT(&loop->prepare_handles);
  QUEUE_INIT(&loop->handle_queue);

  loop->nfds = 0;
  loop->watchers = NULL;
  loop->nwatchers = 0;
  QUEUE_INIT(&loop->pending_queue);
  QUEUE_INIT(&loop->watcher_queue);

  loop->closing_handles = NULL;
  uv__update_time(loop);
  uv__async_init(&loop->async_watcher);
  loop->signal_pipefd[0] = -1;
  loop->signal_pipefd[1] = -1;
  loop->backend_fd = -1;
  loop->emfile_fd = -1;

  loop->timer_counter = 0;
  loop->stop_flag = 0;

  err = uv__platform_loop_init(loop, default_loop);
  if (err)
    return err;

  uv_signal_init(loop, &loop->child_watcher);
  uv__handle_unref(&loop->child_watcher);
  loop->child_watcher.flags |= UV__HANDLE_INTERNAL;

  for (i = 0; i < ARRAY_SIZE(loop->process_handles); i++)
    QUEUE_INIT(loop->process_handles + i);

  if (uv_mutex_init(&loop->wq_mutex))
    abort();

  if (uv_async_init(loop, &loop->wq_async, uv__work_done))
    abort();

  uv__handle_unref(&loop->wq_async);
  loop->wq_async.flags |= UV__HANDLE_INTERNAL;

  return 0;
}
```

`uv_run`定义在deps/uv/src/unix/core.c

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
      /* UV_RUN_ONCE implies forward progess: at least one callback must have
       * been invoked when it returns. uv__io_poll() can return without doing
       * I/O (meaning: no callbacks) when its timeout expires - which means we
       * have pending timers that satisfy the forward progress constraint.
       *
       * UV_RUN_NOWAIT makes no guarantees about progress so it's omitted from
       * the check.
       */
      uv__update_time(loop);
      uv__run_timers(loop);
    }

    r = uv__loop_alive(loop);
    UV_TICK_STOP(loop, mode);

    if (mode & (UV_RUN_ONCE | UV_RUN_NOWAIT))
      break;
  }

  /* The if statement lets gcc compile it to a conditional store. Avoids
   * dirtying a cache line.
   */
  if (loop->stop_flag != 0)
    loop->stop_flag = 0;

  return r;
}
```

[invoke uv__epoll_ctl][invoke uv__epoll_ctl]

[invoke uv__epoll_wait][invoke uv__epoll_wait]

**Things to be explained**

* watcher
* thread model


## 结构参考

### node_module_struct
C++编写的模块结构, 其中`register_context_func`用于初始化模块上下文

```c
struct node_module_struct {
  int version;
  void *dso_handle;
  const char *filename;
  node::addon_register_func register_func;
  node::addon_context_register_func register_context_func;
  const char *modname;
};
```

## 相关参考

* [libuv](https://github.com/joyent/libuv)


[JS use C++]: https://github.com/joyent/node/blob/v0.11.9/deps/v8/samples/process.cc#L164
[C++ use JS]: https://github.com/joyent/node/blob/v0.11.9/deps/v8/samples/process.cc#L189
[node:Load]: https://github.com/joyent/node/blob/v0.11.9/src/node.cc#L2520
[node:CreateEnvironment]: https://github.com/joyent/node/blob/v0.11.9/src/node.cc#L3177
[node:Start]: https://github.com/joyent/node/blob/v0.11.9/src/node.cc#L3224
[main]: https://github.com/joyent/node/blob/v0.11.9/src/node_main.cc#L64
[invoke SetupProcessObject]: https://github.com/joyent/node/blob/v0.11.9/src/node.cc#L3217
[SetupProcessObject]: https://github.com/joyent/node/blob/v0.11.9/src/node.cc#L2264
[define process.binding]: https://github.com/joyent/node/blob/v0.11.9/src/node.cc#L2472
[NativeModule.require]: https://github.com/joyent/node/blob/v0.11.9/src/node.js#L968
[fs.readFile]: https://github.com/joyent/node/blob/v0.11.9/lib/fs.js#L172
[fs.read]: https://github.com/joyent/node/blob/v0.11.9/lib/fs.js#L413
[Read]: https://github.com/joyent/node/blob/v0.11.9/src/node_file.cc#L803
[node:Binding]: https://github.com/joyent/node/blob/v0.11.9/src/node.cc#L1900
[invoke get_builtin_module]: https://github.com/joyent/node/blob/v0.11.9/src/node.cc#L1924
[get_builtin_module]: https://github.com/joyent/node/blob/v0.11.9/src/node_extensions.cc#L52
[register C++ module]: https://github.com/joyent/node/blob/v0.11.9/src/node_file.cc#L1059
[node_module_struct]: https://github.com/joyent/node/blob/v0.11.9/src/node.h#L215
[NODE_EXT_LIST]: https://github.com/joyent/node/blob/v0.11.9/src/node_extensions.h#L33
[invoke NODE_EXT_LIST]: https://github.com/joyent/node/blob/v0.11.9/src/node_extensions.cc#L48
[invoke uv__epoll_ctl]: https://github.com/joyent/node/blob/v0.11.9/deps/uv/src/unix/linux-core.c#L168
[invoke uv__epoll_wait]: https://github.com/joyent/node/blob/v0.11.9/deps/uv/src/unix/linux-core.c#L187
