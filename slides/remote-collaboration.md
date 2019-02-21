name: inverse
layout: true
class: center, middle, inverse

---
# Remote Collaboration

.footnote[By [CatTail](https://cattail.me)]

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
  * message may lost in the middle of chaos
  * timezone difference
* misunderstanding
  * culture and language
  * habit
* unfamiliar and lack of trust
  * don't know if someone know something
  * don't know if someone is working on something else
* feel isolated
  * online group meetings

---

## Sound familiar?

Distributed system and Asynchronous messaging

* multiple isolated parties
* do not share state
* remote procedure call is slower than local procedure calls
* message transmission is unlireable

But there is always an need for distributed in the end

---

## Asynchronous messaging

* Message queue
* Protocol: [AMQP](https://en.wikipedia.org/wiki/Advanced_Message_Queuing_Protocol), [MQTT](https://en.wikipedia.org/wiki/MQTT) etc
* Message format: header metadata include live, durability, priority

---

## Remote collaboration

* Build convensions (Protocol)
* Track anything related (Queue)
* Prioritize what you are going to do (Priority)
* Be responsible (TTL, Durability, Delivery acknowledgement)

---

## Track anything related

* keep track of everything
  * email
  * slack
  * calendar
  * project management software
* do not abusing communication channels
  * @here
  * cc engineering

---

## Track anything related

Benefits

* Remote collaboration have latency issue, but we can increase throughput with task queue.
* If someone else is interested, he can subscribe to your task queue.
* Bookkeeping for yourself.

---

## Prioritize what you are going to do

After we have that task queue, we can prioritize those tasks to be more efficient.

* flag
* pin, star
* order

---

## Prioritize what you are going to do

Remote collaboration with prioritize is more efficient.

Face to face communication is an interupt signal, there is no time to buffer the signal.

---

## Be responsible

There is no one there to motivate you do something

* Self motivated
* Deadline
* Ownership

---

## Build convensions

* every message need to take action
  * Email example
  * PR looks good but never approved
* same workflow
  * I know you know
  * Duplicate notification example

etc

---
template: inverse

## Last but not least

---
template: inverse

## If possible, do not remote
