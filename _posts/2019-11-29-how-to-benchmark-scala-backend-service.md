---
layout: post
title: Benchmark Backend Service
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
1. implement the (PoC) service
1. load testing the target service multiple times, gradually increasing load
1. record throughput, latency, error rate and server resource metrics under different load
1. based on recorded metrics, decide if the service match our requirement, what's the 
 maximum service capacity and which instance type is suitable for the service

### Result

There are many open source software available for load testing, take a look at [awesome-http-benchmark](https://github.com/denji/awesome-http-benchmark)
 repo to see which one fit your requirement.

We use [wrk2](https://github.com/giltene/wrk2) to load testing the service, wrk2 is a modify version of [wrk](https://github.com/wg/wrk),
 it support `--rate` option to specific throughput argument.

 

## A little story about wrk and wrk2

TOOD(Chiyu): introduce wrk, the problem with wrk and introduce wrk2

https://github.com/giltene/wrk2

https://github.com/wg/wrk/issues/323

> the naming of "wrk2" is unfortunate, it's evolved into a very different tool based on generating load at a constant rate 
> and can only record latencies at millisecond granularity. Whereas wrk generates load as fast as possible and tracks latency 
> at the microsecond level.