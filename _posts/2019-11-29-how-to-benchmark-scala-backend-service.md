---
layout: post
title: Benchmark Scala Backend Service
date: 2019-11-29 13:44
categories: tech
---

Tubi streams thousand of free movies and TV shows to our users, personalize recommendation is one of the core user
 experience. Tubi have run offline recommendation in production for a long time, recently we launch our first real time
 model that calculate user recommendations in runtime instead of offline batch jobs.

To support RealTimeModelServing, we need to build a machine learning pipeline export model file and publish feature
 data, and build a backend service serving user request, compute recommendation with exported model and feature data.
 
One of the challenge to build the backend service is, compute recommendation is much slower compare to precomputed
 recommendation, and it consume quite a lot memory and CPU resources. Scala is our choice when build data related
 infrastructure, This blog post explain how we benchmark the backend service to make sure it match our latency, 
 throughput and error rate requirement. 

## Microbenchmark

Microbenchmark is A benchmark designed to measure the performance of a very small and specific piece of code.
 As mentioned above, compute recommendation is much slower compare to precomputed recommendation, we want to have sense
 how slow it will be before start implementing backend service, if compute recommendation for a single request takes
 around 200 milliseconds, that means each personalized request are expecting 200ms latency increase, this is something
 unacceptable.
 
We use ScalaMeter to microbenchmark model execution performance,

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
    (mean = 74.69 ms, ci = <50.43 ms, 98.95 ms>, significance = 1.0E-10)
  - at size -> 4000: passed
    (mean = 97.26 ms, ci = <82.89 ms, 111.62 ms>, significance = 1.0E-10)
  - at size -> 5000: passed
    (mean = 111.29 ms, ci = <99.73 ms, 122.85 ms>, significance = 1.0E-10)
  - at size -> 6000: passed
    (mean = 134.31 ms, ci = <122.10 ms, 146.51 ms>, significance = 1.0E-10)
  - at size -> 7000: passed
    (mean = 154.03 ms, ci = <144.05 ms, 164.01 ms>, significance = 1.0E-10)
  - at size -> 8000: passed
    (mean = 172.68 ms, ci = <162.68 ms, 182.69 ms>, significance = 1.0E-10)
  - at size -> 9000: passed
    (mean = 195.98 ms, ci = <185.69 ms, 206.27 ms>, significance = 1.0E-10)
  - at size -> 10000: passed
    (mean = 222.22 ms, ci = <197.03 ms, 247.41 ms>, significance = 1.0E-10)
```

The benchmark result shows that with a input have 1,000 rows, it takes 23.57ms in mean time to execute the model, 
 the result looks ok, we can start implement the backend service.

## HTTP Benchmark



* Resource usage: CPU, Memory, Network, Disk
* Latency
* Throughput
* Error Rate
