---
layout: post
title: 浅谈基准测试
keywords: nodejs,benchmark
description: 以一个实际需求出发，描述如何通过基准测试判断程序是否会对应用性能产生影响
date: 2016-01-12 14:00
category: tech
---
在一个应用中，应前端要求需要过滤后端接口响应JSON数据中的`null`字段，过滤操作会有性能影响，那么如何决定是否增加这个功能呢？

**首先需要确定衡量指标**。通常时间（time）和空间（memory）是两个衡量程序性能状况额指标，在这个例子中空间并不是制约因素，因而只考虑时间指标。

## 实现

**接着我们需要一个程序实现**。这个实现简单的递归过滤`Object`中值为`null`的字段，

```js
/**
 * 不过滤数组元素为null的情况，如
 * `[null, 'foo', null]`过滤后仍然为`[null, 'foo', null]`
 */
function prune(data) {
    if (_.isArray(data)) {
        _.each(data, prune)
    } else if (_.isObject(data)) {
        _.each(data, function(value, key) {
            if (_.isObject(value)) {
                prune(value)
            } else if (value === null) {
                delete data[key]
            }
        })
    }
    return data
}
```

单元测试见附录。

## 影响因素

**然后根据程序实现判断性能的影响因素**

什么因素会影响时间指标呢？JSON数据的大小（size）？JSON数据的字段数？JSON数据的层次结构？

时间指标受JSON数据的字段（包括递归字段）影响，因为在`prune`的实现中，遍历`Object`和`Array`的时间决定了程序执行时间。

## benchmark

**最后根据影响因素选择测试数据，进行基准测试并得出结论**

借助[benchmark.js](https://github.com/bestiejs/benchmark.js)，以`noop`为参照组进行基准测试

有两组测试数据，真实线上接口获取的`realSamples`和随机生成的模拟数据`fakeSamples`。

```js
var fs = require('fs')
var Benchmark = require('benchmark')
var suite = new Benchmark.Suite()
var getSample = require('./sample').getSample
var getSampleSize = require('./sample').getSampleSize
var prune = require('../src/utility').prune
var noop = function(){}

var filenames = fs.readdirSync(__dirname + '/samples')
var realSamples = filenames
    .map(function(filename) {
        return JSON.parse(
            fs.readFileSync(__dirname + `/samples/${filename}`, 'utf8')
        )
    })
var realSizes = realSamples.map(getSampleSize)

var fakeSizes = [10, 100, 1000, 10000]
var fakeSamples = fakeSizes.map(function(size) {
    return getSample(size)
})

// add tests
realSamples.forEach(function(sample, index) {
    var filename = filenames[index]
    suite
        .add(`prune#real:${filename}:${getSampleSize(sample)}`, function() {
            prune(sample)
        })
})

fakeSamples.forEach(function(sample, index) {
    var size = fakeSizes[index]
    suite
        .add(`prune#fake:${size}:${getSampleSize(sample)}`, function() {
            prune(sample)
        })
})
suite
    .add('noop', function() {
        noop(realSamples[0])
    })
// add listeners
suite
    .on('cycle', function(event) {
        console.log(String(event.target))
    })
    .on('complete', function() {
        var totalSize = realSizes.reduce(function(sum, size) {
            return sum + size
        }, 0)
        var averageSize = Math.floor(totalSize / realSizes.length)
        console.log(`real samples total size ${totalSize}, average size ${averageSize}`)
        console.log('Fastest is ' + this.filter('fastest').map('name'))
    })
// run
.run()
```

这里还实现了`getSampleSize`方法（见附录），用于统计JSON数据的字段总量。以此来粗略估计线上真实接口返回数据的平均字段数量。

运行结果<sup>[1]</sup>

```
prune#real:adverts.json:47 x 179,918 ops/sec ±2.10% (79 runs sampled)
prune#real:areas.json:5126 x 1,333 ops/sec ±2.47% (74 runs sampled)
prune#real:citys.json:6417 x 1,363 ops/sec ±1.07% (90 runs sampled)
prune#real:count.json:1037 x 6,043 ops/sec ±1.75% (89 runs sampled)
prune#real:menus.json:55 x 47,010 ops/sec ±1.34% (86 runs sampled)
prune#real:pois.json:3136 x 2,316 ops/sec ±3.16% (84 runs sampled)
prune#real:subway.json:1999 x 3,043 ops/sec ±1.85% (89 runs sampled)
prune#fake:10:10 x 286,702 ops/sec ±1.64% (88 runs sampled)
prune#fake:100:100 x 63,893 ops/sec ±1.56% (89 runs sampled)
prune#fake:1000:985 x 8,173 ops/sec ±1.63% (86 runs sampled)
prune#fake:10000:9995 x 997 ops/sec ±1.80% (87 runs sampled)
noop x 80,713,438 ops/sec ±1.85% (87 runs sampled)
real samples total size 17817, average size 2545
Fastest is noop
```

**结论**：平均字段总量为`2545`，向上取证以`10000`量级计算，使用`prune`处理数据大约需要1ms，并不影响整个应用的性能。

## 附录

1. 看起来`getSampleSize`或`getSample`函数计算有偏差，不过在这里可以忽略这个问题。

### sample生成器

```js
var Chance = require('chance')
var _ = require('lodash')

var DATA_TYPES = [
    'bool',
    'character',
    'floating',
    'integer',
    'natural',
    'string',

    'Array',
    'Object',
]

function getSample(size, sample, chance) {
    chance = chance || new Chance()
    sample = sample || {}
    var index, cursor, pick, type, key, value
    for (index=0, cursor=0; index<size; index++, cursor++) {
        pick = chance.integer({min: index, max: size-1})
        switch(type = chance.pick(DATA_TYPES)) {
            case 'Array':
                value = getSample(pick - index, [], chance)
                index = pick
                break
            case 'Object':
                value = getSample(pick - index, {}, chance)
                index = pick
                break
            default:
                value = chance[type]()
        }
        key = sample.constructor.name === 'Array' ? cursor : chance.word()
        sample[key] = value
    }
    return sample
}

function getSampleSize(sample) {
    return _.reduce(sample, function(sum, value, key) {
        if (_.isArray(value)) {
            sum += getSampleSize(value)
        } else if (_.isObject(value)) {
            sum += getSampleSize(value)
        }
        return sum + 1
    }, 0)
}

module.exports = {
    getSample: getSample,
    getSampleSize: getSampleSize,
}
```

### 单元测试

```js
describe('utility', () => {
    describe('prune', () => {
        it('do not touch primitive type', () => {
            expect(prune(123)).to.deep.equal(123)
            expect(prune('123')).to.deep.equal('123')
            expect(prune(null)).to.deep.equal(null)
            expect(prune([1, 2, '3'])).to.deep.equal([1, 2, '3'])
            expect(prune({foo: 'bar'})).to.deep.equal({foo: 'bar'})
        })

        it('prune null value in object', () => {
            expect(prune({foo: 'bar', baz: null})).to.deep.equal({foo: 'bar'})
        })

        it('do not prune null in array', () => {
            expect(
                prune([null, 'foo', null, 'bar', null])
            ).to.deep.equal([null, 'foo', null, 'bar', null])
        })

        it('complex json prune', () => {
            expect(
                prune([
                    null,
                    {
                        'foo1': 'bar1',
                        'foo2': {
                            'foo3': ['bar3', null],
                            'foo': null,
                        },
                        'foo': null
                    },
                    null
                ])
            ).to.deep.equal([
                null,
                {
                    'foo1': 'bar1',
                    'foo2': {
                        'foo3': ['bar3', null],
                    },
                },
                null
            ])
        })
    })
})
```
