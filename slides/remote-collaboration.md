name: inverse
layout: true
class: center, middle, inverse

---
# Remote Collaboration

.footnote[By [Chiyu Zhong](https://cattail.me)]

---
layout: false

## The challenge we are facing

* communication delay
* misunderstanding
* unfamiliar and lack of trust
* feel isolated

---

## The challenge we are facing

* communication delay
  * do not expect an instant response
  * message may lose in the middle of chaos
  * timezone difference
* misunderstanding
  * culture and language
  * habit
* unfamiliar and lack of trust
  * don't know if someone knows something
  * don't know if someone knows you know something
* feel isolated
  * online group meetings

---

## Sound Familiar?

Distributed System and Asynchronous Messaging

* multiple isolated parties
* do not share state
* asynchronous request is slower than synchronous call
* message transmission is unreliable

---

## Solution: Collaboration Patterns

* Remote First
* Asynchronous Communication
* Synchronous Communication: Anti-Entropy

---

## Remote First

* Async Communication is preferred
* Meeting scheduled to include all time zones, by default has a Zoom link, should be recorded
* Key decision should be discussed online, discussion should be recorded, either via shared slack channel or Google Docs

---

## Asynchronous Communication

Asynchronous Messaging

* Message Queue
* Protocol: [AMQP](https://en.wikipedia.org/wiki/Advanced_Message_Queuing_Protocol), [MQTT](https://en.wikipedia.org/wiki/MQTT) etc
  * time to live
  * durability
  * priority

---

## Remote Collaboration

* Message Queue: Track Everything
* Protocol: Build Conventions

---

## Track Everything

* keep track of everything
  * email
  * slack
  * calendar
  * project management software
* do not abusing communication channels
  * @here
  * cc engineering

---

## Track Everything

Benefits

* Remote collaboration have latency issue, but we can increase throughput with task queue.
* If someone else is interested, he can subscribe to your task queue.
* Bookkeeping for yourself.

---

## Prioritize

After we have that task queue, we can prioritize those tasks to be more efficient.

* flag
* pin, star
* order

---

## Prioritize

Remote collaboration with prioritize is more efficient.

Face to face communication is an interrupt signal, context switch is expensive.

---

## Build Conventions

* every message should self-contained
  * context: 5 Ws
    * Who
    * What
    * When
    * Where
    * Why
* every message need to take action
  * Email example
  * PR looks good but never approved
* same workflow
  * I know you know
  * Duplicate notification example
  * Changes merged to master should always deployed to production
* status
  * online status
  * PTO
  * let your coworkers know

---

## Be Responsible

There is no one there to motivate you do something

* Self-motivated
* TTL/Deadline
* Ownership
* Delivery Acknowledgement

---

## Synchronous Communication: Anti-Entropy

Asynchronous Communication is great, but sometimes Synchronous Communication is required

* Project Bootstrap
* Intensive Communication
* Back and Forth too many times

---
template: inverse

## Last but not least

---
template: inverse

## If possible, do not remote
