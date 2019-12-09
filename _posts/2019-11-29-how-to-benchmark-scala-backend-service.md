---
layout: post
title: Introduction to Backend Service Benchmark
date: 2019-11-29 13:44
categories: tech
---

Tubi streams thousand of free movies and TV shows to our users, personalize recommendation is one of the core user
 experience. Tubi have run offline recommendation in production for a long time, recently we launch our first real time
 model that calculate user recommendations in real time instead of offline batch jobs.

To support real time model serving, we need to build a machine learning pipeline export models and publish feature data,
 and build a backend service serving user request, compute recommendation with exported model and feature data in real 
 time.
 
One of the challenge to build the real time serving backend service is, compute recommendation is much slower compare 
 to precomputed recommendation, it also consume quite a lot memory and CPU resources. Scala is our choice when build 
 data related infrastructure, this blog post explain how we benchmark the backend service to make sure it match our 
 business requirement.

## Microbenchmark

Microbenchmark is a benchmark designed to measure the performance of a very small and specific piece of code.
 As mentioned above, compute recommendation is much slower compare to precomputed recommendation, we want to have sense
 how slow it will be before start implementing backend service, if a single recommendation calculation takes around 
 200 milliseconds, that means each personalized request are expecting at least 200ms latency increase, this is something
 unacceptable.
 
We use [ScalaMeter](http://scalameter.github.io/) to microbenchmark model execution performance,

```scala
val sizes = Gen.range("size")(1000, 10000, 1000)
val input = for { size <- sizes } yield genRows(size)

performance of "RealTimeModelServing" in {
  measure method "predict" in {
    using(input) in { rows =>
      rows.map(predictor.predict)
    }
  }
}
```

The benchmark code is pretty simple, we generate random input rows with size from 1,000 to 10,000, then execute model.
This is the benchmark output

```
Sampling 4 measurements in separate JVM invocation 8 - RealTimeModelServing.predict, Test-0.
Finished test set for RealTimeModelServing.predict, curve Test-0
:::Summary of regression test results - Accepter():::
Test group: RealTimeModelServing.predict
- RealTimeModelServing.predict.Test-0 measurements:
  - at size -> 1000: passed
    (mean = 23.57 ms, ci = <20.66 ms, 26.47 ms>, significance = 1.0E-10)
  - at size -> 2000: passed
    (mean = 44.48 ms, ci = <40.30 ms, 48.66 ms>, significance = 1.0E-10)
  - at size -> 3000: passed
...
  - at size -> 9000: passed
    (mean = 195.98 ms, ci = <185.69 ms, 206.27 ms>, significance = 1.0E-10)
  - at size -> 10000: passed
    (mean = 222.22 ms, ci = <197.03 ms, 247.41 ms>, significance = 1.0E-10)
```

The benchmark result shows that 1,000 rows input takes 23.57ms in mean time to execute the model, 
 the result looks ok, we can start implementing an PoC backend service.

## Load Testing

Load testing simulate multiple user accessing the service, to see how fast service can respond under stress.

### Basics

Three load testing metrics can be used to describe the performance and correctness of the service

* **Latency** is how fast a service respond to client, typically measured in milliseconds, instead of using average, latency usually
 measured in **percentiles**, 99 percentiles is 100ms means 99% of the request returned within 100ms, it also described as P99
* **Throughput** is how many request a service can process in certain amount of time, usually measured as **requests per second** 
* **Error Rate** is how many request failed in certain amount of time, it describe the correctness of a service under load

These metrics can affect each other, higher throughput typically means higher latency and higher error rate.

![throughput-latency-graph](/assets/benchmark-backend-service/throughput-latency-graph.png)

Beside from latency, throughput and error rate, we should also monitor server resource(CPU, memory etc) during load testing, ideally
 we want to build a service satisfy throughput, latency requirement using the least money.

### Plan

With the above metrics in mind, a general load testing include following steps

1. define service throughput, latency and error rate requirement
1. send ramp-up traffic to warmup target service
1. send load testing traffic to target service, record throughput, latency,
 error rate and server resource metrics
1. gradually increasing load
1. based on recorded metrics, decide if the service match our requirement, what's the 
 maximum service capacity and which instance type is suitable for the service

### Benchmark

There are many open source software available for load testing, take a look at [awesome-http-benchmark](https://github.com/denji/awesome-http-benchmark)
 repo to see which one fit your requirement.

We use [wrk2](https://github.com/giltene/wrk2) to load testing the service, wrk2 is a modify version of [wrk](https://github.com/wg/wrk),
 it add `--rate` option to specify throughput argument.

The real time model serving service should able process 400 request per second, with P99 less than 200ms and error rate less than 0.1%.

We deploy the PoC service to one AWS EC2 instance with type c5.2xlarge, and starting with rate 100 request per second,

```
$ wrk --latency -c 8 -t 4 -d 1m -R 100 -s wrk.lua http://localhost:8080/predictor/v1/get-ranking
...
  Latency Distribution (HdrHistogram - Recorded Latency)
 50.000%   32.99ms
 75.000%   36.93ms
 90.000%   39.94ms
 99.000%   46.56ms
 99.900%   53.34ms
 99.990%   58.08ms
 99.999%   63.23ms
100.000%   63.23ms
...
  6004 requests in 1.00m, 39.61MB read
  Non-2xx or 3xx responses: 835
Requests/sec:    100.05
Transfer/sec:    675.88KB
```

```
$ wrk --latency -c 8 -t 4 -d 1m -R 200 -s wrk.lua http://localhost:8080/predictor/v1/get-ranking
...
 50.000%   33.44ms
 75.000%   37.38ms
 90.000%   41.09ms
 99.000%   49.85ms
 99.900%   56.42ms
 99.990%   60.38ms
 99.999%   71.23ms
100.000%   71.23ms
...
  12000 requests in 1.00m, 78.67MB read
  Non-2xx or 3xx responses: 1743
Requests/sec:    199.96
Transfer/sec:      1.31MB
```

```
$ wrk --latency -c 8 -t 4 -d 1m -R 300 -s wrk.lua http://localhost:8080/predictor/v1/get-ranking
...
  Latency Distribution (HdrHistogram - Recorded Latency)
 50.000%    6.54s
 75.000%    8.88s
 90.000%   10.30s
 99.000%   11.33s
 99.900%   11.71s
 99.990%   11.76s
 99.999%   11.77s
100.000%   11.77s
...
  14651 requests in 1.00m, 95.87MB read
  Non-2xx or 3xx responses: 2167
Requests/sec:    244.15
Transfer/sec:      1.60MB
```

When using 300 request per second to hit the service, P99 increase a lot. 

TODO(Chiyu): add a linear graph here

Real time serving service is a CPU intensive application, we use [USE method](http://www.brendangregg.com/usemethod.html) 
 and `vmstat 1` to verify that CPU usage is saturation and can not handle this load, we need to scale out the service 
 to match our requirement.

### Multi host benchmark

After scala out the service to 4 nodes, we also need to modify wrk2 benchmark script to distribute the traffic to 
 multiple hosts.

```lua
-- multi-host benchmark based on https://github.com/wg/wrk/blob/0896020a2a28b84b1150e9b60933b746fe1dc761/scripts/addr.lua
-- usage `wrk --latency -c 8 -t 4 -d 1m -R 300 -s wrk.lua http://predictor-http.service.tubi:8080/predictor/v1/get-ranking`
-- note the number of thread should equal to or larger than the number of host
local addrs = wrk.lookup(wrk.host, wrk.port or "http")
for i = #addrs, 1, -1 do
    if not wrk.connect(addrs[i]) then
        table.remove(addrs, i)
    end
end
local index = 0

function setup(thread)
    index = index + 1
    thread.addr = addrs[index]
end

function init(args)
   local msg = "thread addr: %s"
   print(msg:format(wrk.thread.addr))
end
```

The benchmark result shows that after scale out, the service can handle traffic with 300 request per second.

```
$ wrk --latency -c 8 -t 4 -d 1m -R 300 -s wrk.lua http://predictor-http.service.tubi:8080/predictor/v1/get-ranking
thread addr: 172.30.26.254:8080
thread addr: 172.30.21.44:8080
thread addr: 172.30.45.157:8080
thread addr: 172.30.45.42:8080
...
  Latency Distribution (HdrHistogram - Recorded Latency)
 50.000%   25.55ms
 75.000%   27.45ms
 90.000%   31.79ms
 99.000%   49.76ms
 99.900%   73.21ms
 99.990%   89.86ms
 99.999%   93.89ms
100.000%   93.89ms
...
  17996 requests in 1.00m, 117.21MB read
  Non-2xx or 3xx responses: 2710
Requests/sec:    300.03
Transfer/sec:      1.95MB
```

### Autobench2

To simplify the above benchmark process, we write a single perl script based on [Autobench](http://www.xenoclast.org/autobench/).
 The script take care of things like warmup, gradually increase load, generate result that can draw throughput latency graph on web pages.  

```
$ autobench --single_host --host1 www.test.com --uri1 /10K --quiet     \
            --low_rate 20 --high_rate 200 --rate_step 20 --num_call 10 \
            --num_conn 5000 --timeout 5 --file results.tsv 
```

### A little story about wrk and wrk2

[wrk2](https://github.com/giltene/wrk2) is a modified version of [wrk](https://github.com/wg/wrk), the main difference between the two is described by
 [Will Glozer](https://github.com/wg) in https://github.com/wg/wrk/issues/323,

> the naming of "wrk2" is unfortunate, it's evolved into a very different tool based on generating load at a constant rate 
> and can only record latencies at millisecond granularity. Whereas wrk generates load as fast as possible and tracks latency 
> at the microsecond level.

## Useful links

* [An Introduction to Load Testing](https://www.digitalocean.com/community/tutorials/an-introduction-to-load-testing)
* [HTTP Benchmark Rules](https://www.mnot.net/blog/2011/05/18/http_benchmark_rules)
* [Linux Performance Tools](https://cdn.oreillystatic.com/en/assets/1/event/122/Linux%20perf%20tools%20Presentation.pdf)