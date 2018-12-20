name: inverse
layout: true
class: center, middle, inverse

---
# Introduce to Consul

.footnote[By [CatTail](https://cattail.me)]

---
## What is Consul

---
layout: false

## Hashicorp

Consul is developed by [Hashicorp](https://www.hashicorp.com/).

We are really buying their stack

* [Terraform](https://www.terraform.io/): Provision infrastructure
* [Consul](https://www.consul.io/): Connect service
* [Vault](https://vaultproject.io/): Secure secret

Hashicorp also develop

* [Nomad](https://nomadproject.io/): Run application
* [Vagrant](https://www.vagrantup.com/): Develop environment
* [Packer](https://packer.io/): Build image

---
## What is Consul

Consul is a service mesh solution providing a full featured control plane with **service discovery**, **configuration**, and **segmentation** functionality.

---
## Why do I care

Frontend team use Consul to discover backend services, and use health checks to register themselves.

Data team use Consul to discover backend services to read and write data.
 
Backend team use Consul for service discovery, health checks and key value store.

Client developers don't use Consul directly, but your request is handled by [NGINX resolved by Consul](https://www.nginx.com/blog/service-discovery-nginx-plus-srv-records-consul-dns/).

---
## Why do I care

Why I can't resolve service DNS?

[Why I experience traffic spike using Consul](https://cattail.me/tech/2018/11/22/consul-dns-cache.html)?

How to minimize production impact on certain node fails?

How to direct traffic to certain nodes on the fly for testing and debugging?

---
## How it lives in our stack

Client -> Route 53 -> NGINX -> Consul -> Frontend services -> Consul/Envoy -> Backend services

<img src="/assets/introduce-to-consul/stack.png" width="800"></img>

---
template: inverse

# How it works

---

## Architecture

<img src="/assets/introduce-to-consul/consul-arch.png" width="500" style="display: block; margin-left: auto; margin-right: auto;"></img>

---
## Architecture

Agent: either client or server mode; DNS or HTTP interface;
 
Client: stateless; LAN Gossip Protocol;

Server: cluster state; LAN and WAN Gossip Protocol; Consensus Protocol;

---
## Catalog

Consul's service discovery is backed by a service catalog.

The catalog maintains the high-level view of the cluster, including which services are available, which nodes run those services, health information, and more. 

The catalog is maintained only by server nodes.

Agent maintain service and check registrations as well as health information, is responsible for executing health checks and updating their local state.

This catalog is formed by aggregating information submitted by the agents.

---
## Consensus Protocol

Consul uses a consensus protocol to provide [Consistency (as defined by CAP)](https://en.wikipedia.org/wiki/CAP_theorem)

> In particular, the CAP theorem implies that in the presence of a network partition, one has to choose between consistency and availability.

<img src="/assets/introduce-to-consul/cap.png" width="400"></img>

The catalog is replicated via the Raft log to provide a consolidated and consistent view of the cluster.

The consensus protocol is based on ["Raft: In search of an Understandable Consensus Algorithm"](https://ramcloud.stanford.edu/wiki/download/attachments/11370504/raft.pdf).

---
## Raft

Raft is a consensus algorithm that is based on [Paxos](https://en.wikipedia.org/wiki/Paxos_%28computer_science%29). 
Compared to Paxos, Raft is designed to have fewer states and a simpler, more understandable algorithm.

[Raft: Understandable Distributed Consensus](http://thesecretlivesofdata.com/raft/)

---
## Gossip Protocol

there is no need to configure clients with the addresses of servers; discovery is done automatically. 

Second, the work of detecting node failures is not placed on the servers but is distributed. This makes failure detection much more scalable than naive heartbeating schemes.
 
Thirdly, it is used as a messaging layer to notify when important events such as leader election take place.

---
## SWIM

[Scalable Weakly-consistent Infection-style Process Group Membership Protocol](http://www.cs.cornell.edu/info/projects/spinglass/public_pdfs/swim.pdf)

* Failure Detector Component, that detects failures of members.
* Dissemination Component, that disseminates information about members that have recently either joined or left the group, or failed.

---
## Failure Detector Component

<img src="/assets/introduce-to-consul/swim-ping.png" width="500"></img>

---
## Dissemination Component

Multicast and Infection-Style Dissemination Component

The SWIM protocol layer at each group member maintains a buffer of recent membership updates, along with a local count for each buffer element. 
The local count speciﬁes the number of times the element has been piggybacked so far by , and is used to choose which elements to piggyback next.

---
## Wrap up

Consul provide service discovery and KV storage.

Service discovery is implemented as catalog backed by Consensus Protocol.

**Catalog is mainly built on agent update their local state to Consul server, Gossip Protocol only involed in bootstrap and fire events.**

Referrences

* [Consul Docs](https://www.consul.io/docs/index.html)
* [Raft](https://raft.github.io)
* [SWIM](http://www.cs.cornell.edu/info/projects/spinglass/public_pdfs/swim.pdf)

---
template: inverse

## Q && A
