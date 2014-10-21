---
layout: post
title: libevent源码阅读笔记
date: 2014-10-15 15:09
categories: tech
---
libevent版本(release-2.0.21-stable)

## 目的
理解event loop是如何工作的

## 笔记
libevent根据不同平台(linux, windows etc)来选择使用不同实际后端方法(backend method), 如`select`, `poll`, `epoll`等，实现事件驱动(event-drivin)方法调用.

下面以`epoll`作为backend method来研究源码

在做其他操作之前，需要创建`event_base`对象,

    struct event_base *base = event_base_new();

在创建`event_base`对象过程中, 会选择合适的backend method(上面已经假设选择`epoll`作为backend method), 调用`epoll_create`方法创建`epoll` fd, 创建并初始化`epollop`结构, 存储在`base->evbase`中. `evbase`存储了backend method相关的数据结构. 如epoll作为backend时, `evbase`存储结构`epollop`(见下面结构参考). 
<sup>[1][2]</sup>

之后用户根据对fd中感兴趣的变化创建事件, `event_new`创建并初始化事件,

    struct event *ev1, *ev2;
    struct timeval five_seconds = {5,0};

    ev1 = event_new(base, fd1, EV_TIMEOUT|EV_READ|EV_PERSIST, cb_func,(char*)"Reading event");
    ev2 = event_new(base, fd2, EV_WRITE|EV_PERSIST, cb_func, (char*)"Writing event");

`event_base`内部通过一个哈希表(`base->io`)存储fd和它绑定的事件列表. 其中fd作为哈希表的key, 一个包含绑定事件列表的结构作为哈希表的值.
<sup>[3][4][5]</sup>

使用`event_add`将事件增加到`event_base`的哈希表中.

    event_add(ev1, &five_seconds);
    event_add(ev2, NULL);

在将事件增加到哈希表的过程中, 通过调用`epoll_ctl`将事件注册到内核中(kernel).
<sup>[6][7][8][9]</sup>

当一切设置完毕后, 就可以开始事件循环

    event_base_loop(base);

`event_base_loop`使用backend dispatch方法, 监听变更事件列表, 修改事件状态(一般pending->active), 并调用绑定的回调列表.

## 总结
什么是event loop, libevent是如何工作的?

当用户将事件绑定到`event_base`, 调用`event_base_loop`启用event loop. 

在事件循环中, libevent不断通过底层API获取文件描述符的事件更改. 通过遍历变更文件描述符列表, 执行对应文件描述符注册的时间回调列表.

直到特定条件发生(如`event_base`中没有注册的事件), 事件循环将终止.

## 重点代码

1. [event_base_new](https://github.com/libevent/libevent/blob/release-2.0.21-stable/epoll.c#L107)
2. [epoll_init](https://github.com/libevent/libevent/blob/release-2.0.21-stable/epoll.c#L107)
3. [event_add](https://github.com/libevent/libevent/blob/release-2.0.21-stable/event.c#L1966)
4. [invoke evmap_io_add](https://github.com/libevent/libevent/blob/release-2.0.21-stable/event.c#L2073)
5. [evmap_io_add](https://github.com/libevent/libevent/blob/release-2.0.21-stable/evmap.c#L283)
6. [invoke backend method to add event](https://github.com/libevent/libevent/blob/release-2.0.21-stable/evmap.c#L320)
7. [epoll_nochangelist_add](https://github.com/libevent/libevent/blob/release-2.0.21-stable/epoll.c#L351)
8. [epoll_apply_one_change](https://github.com/libevent/libevent/blob/release-2.0.21-stable/epoll.c#L173)
9. [invoke epoll_ctl](https://github.com/libevent/libevent/blob/release-2.0.21-stable/epoll.c#L265)
10. [invoke backend dispatch](https://github.com/libevent/libevent/blob/release-2.0.21-stable/event.c#L1607)
11. [epoll_wait](https://github.com/libevent/libevent/blob/release-2.0.21-stable/epoll.c#L407)
12. [mark event](https://github.com/libevent/libevent/blob/release-2.0.21-stable/epoll.c#L439)
13. [execute callbacks](https://github.com/libevent/libevent/blob/release-2.0.21-stable/event.c#L1621)

## 结构参考 (仅展现结构中本文描述的部分)

### event_base
```
struct event_base {
     /** Function pointers and other data to describe this event_base's
      * backend. */
     const struct eventop *evsel;
     /** Pointer to backend-specific data. */
     void *evbase;

     /** Number of virtual events */
     int virtual_event_count;
     /** Maximum number of virtual events active */
     int virtual_event_count_max;
     /** Number of total events added to this event_base */
     int event_count;
     /** Maximum number of total events added to this event_base */
     int event_count_max;
     /** Number of total events active in this event_base */
     int event_count_active;
     /** Maximum number of total events active in this event_base */
     int event_count_active_max;

     /** Set if we should terminate the loop once we're done processing
      * events. */
     int event_gotterm;
     /** Set if we should terminate the loop immediately */
     int event_break;
     /** Set if we should start a new instance of the loop immediately. */
     int event_continue;

     /** The currently running priority of events */
     int event_running_priority;

     /** Set if we're running the event_base_loop function, to prevent
      * reentrant invocation. */
     int running_loop;

     /** Set to the number of deferred_cbs we've made 'active' in the
      * loop.  This is a hack to prevent starvation; it would be smarter
      * to just use event_config_set_max_dispatch_interval's max_callbacks
      * feature */
     int n_deferreds_queued;

     /* Active event management. */
     /** An array of nactivequeues queues for active event_callbacks (ones
      * that have triggered, and whose callbacks need to be called).  Low
      * priority numbers are more important, and stall higher ones.
      */
     struct evcallback_list *activequeues;
     /** The length of the activequeues array */
     int nactivequeues;
     /** A list of event_callbacks that should become active the next time
      * we process events, but not this time. */
     struct evcallback_list active_later_queue;

     /** Mapping from file descriptors to enabled (added) events */
     struct event_io_map io;

     /** Mapping from signal numbers to enabled (added) events. */
     struct event_signal_map sigmap;

     /** The event whose callback is executing right now */
     struct event_callback *current_event;
};
```

### eventop
```
struct eventop {
     /** The name of this backend. */
     const char *name;
     /** Function to set up an event_base to use this backend.  It should
      * create a new structure holding whatever information is needed to
      * run the backend, and return it.  The returned pointer will get
      * stored by event_init into the event_base.evbase field.  On failure,
      * this function should return NULL. */
     void *(*init)(struct event_base *);
     /** Enable reading/writing on a given fd or signal.  'events' will be
      * the events that we're trying to enable: one or more of EV_READ,
      * EV_WRITE, EV_SIGNAL, and EV_ET.  'old' will be those events that
      * were enabled on this fd previously.  'fdinfo' will be a structure
      * associated with the fd by the evmap; its size is defined by the
      * fdinfo field below.  It will be set to 0 the first time the fd is
      * added.  The function should return 0 on success and -1 on error.
      */
     int (*add)(struct event_base *, evutil_socket_t fd, short old, short events, void *fdinfo);
     /** As "add", except 'events' contains the events we mean to disable. */
     int (*del)(struct event_base *, evutil_socket_t fd, short old, short events, void *fdinfo);
     /** Function to implement the core of an event loop.  It must see which
         added events are ready, and cause event_active to be called for each
         active event (usually via event_io_active or such).  It should
         return 0 on success and -1 on error.
      */
     int (*dispatch)(struct event_base *, struct timeval *);
     /** Function to clean up and free our data from the event_base. */
     void (*dealloc)(struct event_base *);
     /** Flag: set if we need to reinitialize the event base after we fork.
      */
     int need_reinit;
     /** Bit-array of supported event_method_features that this backend can
      * provide. */
     enum event_method_feature features;
     /** Length of the extra information we should record for each fd that
         has one or more active events.  This information is recorded
         as part of the evmap entry for each fd, and passed as an argument
         to the add and del functions above.
      */
     size_t fdinfo_len;
};
```

### event_io_map
```
struct event_io_map {
     /* An array of evmap_io * or of evmap_signal *; empty entries are
      * set to NULL. */
     void **entries;
     /* The number of entries available in entries */
     int nentries;
};
```

### evmap_io
```
/** An entry for an evmap_io list: notes all the events that want to read or
     write on a given fd, and the number of each.
  */
struct evmap_io {
     struct event_dlist events;
     ev_uint16_t nread;
     ev_uint16_t nwrite;
     ev_uint16_t nclose;
};
```

### epollop
```
struct epollop {
     struct epoll_event *events;
     int nevents;
     int epfd;
#ifdef USING_TIMERFD
     int timerfd;
#endif
};
```

### epoll_event
```
typedef union epoll_data {
    void        *ptr;
    int          fd;
    uint32_t     u32;
    uint64_t     u64;
} epoll_data_t;

struct epoll_event {
    uint32_t     events;      /* Epoll events */
    epoll_data_t data;        /* User data variable */
};
```

## 相关参考
* [libevent](http://libevent.org/)
* [libevent reference](http://www.wangafu.net/~nickm/libevent-2.0/doxygen/html/)
* [Programming with Libevent](http://www.wangafu.net/~nickm/libevent-book/)
* [source code](https://github.com/libevent/libevent)
* [epoll](http://man7.org/linux/man-pages/man7/epoll.7.html)
