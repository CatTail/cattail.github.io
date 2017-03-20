---
layout: post
title: 对进程关系的总结
description: 对进程，进程组，会话和任务管理的学习总结
date: 2017-03-02 07:35
categories: tech
---
在日常使用终端时，有些进程会放在后台执行（background process)，有些则在前台执行（foreground process），此时退出终端并通过进程管理器查看进程，会发现后台进程和前台进程都退出了，这个过程中发生了什么，为什么后台进程也退出了？那么怎么实现守护进程（daemon）并不在终端退出的时候退出呢？

## 孤儿进程和僵尸进程

当父进程退出后，子进程会被 init 进程接管，此时它就成了孤儿进程（orphan process）。

当子进程退出（exit(2)）时，在进程表中还有条目保存进程信息，直到父进程使用 wait 读取子进程退出状态才会清理进程表中的条目。如果父进程不读取，该进程就成了僵尸进程（zombie process）。

对程序

```c
/* zombie.c */
#include <sys/types.h>
#include <unistd.h>  
int main()
{
  pid_t pid; 
  pid = fork();
  if (pid == 0) { /* 如果是子进程 */ 
    exit(0);
  } else {  /* 如果是父进程 */ 
    sleep(60);  /* 休眠60秒 */ 
    wait(NULL); /* 收集僵尸进程 */
  }
}
```

编译并执行

```sh
$ cc zombie.c -o zombie
$ ./zombie
```

在父进程推出前，进程表中包含 Zombie 进程标志的条目，

```sh
$ ps ax | grep zombie | grep -v grep
89786 s001  S+     0:00.00 ./zombie
89787 s001  Z+     0:00.00 (zombie)
```

还需要提及的一点是，子进程退出时会通知父进程，父进程退出并不会导致子进程退出，子进程变成了孤儿进程。

## 进程组，会话和任务管理

类 UNIX 系统通过进程组（process group）和会话（session）来方便的管理进程。

进程组 ID （process group id）等于进程组中的进程组 leader（process group leader）进程 ID。
会话也有会话 leader（session leader）进程，会话 ID（session id）等于会话 leader 进程 ID。

通过 setpgid(2) 和 setsid(2) 可以修改和创建进程组和会话。

每个会话还可能包含一个控制终端（controlling terminal）。使用控制终端的进程组被称为前台进程组（foreground process group），而不是用控制终端的进程组成为后台进程组（background process group）。

前台进程组可以从控制终端读取输入并写入输出，控制终端的大多数控制信号（signal）也会被发送到前台进程组，例如 SIGINT（Ctrl-C）和 SIGTSTP（Control-Z）。但控制终端断开连接时发出的 SIGHUP 到会话 leader 而不是前台进程组。

![signal](/assets/process-relationship/signal.png)

> 来源 Advanced Programming in the UNIX® Environment 9.6

如果进程组中的所有进程的父进程都不在这个进程组所在的会话中并有进程停止（stopped）时，这个进程组成为孤儿进程组（orphan process group），内核（kernal）会发送 SIGHUP 信号给新出现的孤儿进程组。

进程组对应到 shell 的任务管理（job control）的概念是任务（job），也就是说 job 是有一个或多个进程构成的。一个任务（也就是进程组）通常通过管道（pipeline）关联。

通常，会话是这样被创建的。用户通过终端（硬件或软件模拟）登录后，操作系统会执行 login shell，这个程序就是会话 leader，这个进程在一个新会话中。而终端则被称为控制终端（controlling terminal）。当用户运行程序，通过任务管理将某些进程组放在后台，当控制终端发送 SIGINT 时，前台进程组中的所有进程会接受到 SIGINT 信号并退出。当控制终端断开连接时，会话 leader 会接收到 SIGHUP 并退出，此时，成为孤儿进程组的进程组会接收到内核发送的 SIGHUP 信号也退出。

## 当终端断开连接时发生了什么

现在来开头提出的回答第一个问题，为什么退出终端时，后台进程也退出了，因为后台进程接收到了内核的 SIGHUP 信号。

事实上，在实际日常 bash 使用中，后台进程接收到的 SIGHUP 信号是 bash 而不是内核发送的，

1. 内核检测到控制终端退出，发送 SIGHUP 给 bash
2. bash 接收到 SIGHUP，发送 SIGHUP 给所有任务并退出
3. 每个任务都接收到 SIGHUP 并退出

## 守护进程

回答另一个问题，怎样初始化守护进程，使得终端退出时，守护进程不会退出。通常，守护进程通过 double fork 创建。

double fork 的流程是这样的
1. 初始进程 a
2. a fork 新进程 b
3. 退出 a 进程
4. b 进程通过 setsid(2) 创建新会话
5. b fork 新进程 c
6. 退出 b 进程
7. 此时 c 进程就是守护进程

double fork 可以让进程失去控制终端（且不能在未来获取控制终端），并且在一个新的会话中，不会受原会话任务管理的影响。

为什么不在 a 进程直接执行 setsid 呢？因为如果 a 进程是进程组 leader，会导致 setsid 执行失败。

为什么 b 进程还需要 fork c 进程？因为 c 进程不是会话 leader，不能获取控制终端。

为什么要让进程失去控制终端呢？因为如果守护进程不小心打开终端，而此时用户向该终端输入 Ctrl-C 导致守护进程接收到 SIGINT，可能会导致守护进程退出。

## 相关参考

* [APUE](http://www.apuebook.com/) 第九章，进程关系
