---
layout: post
title: Introduction to Algorithms Reading Notes
date: 2014-11-03 11:02
categories: tech
---

## Foundations

### The Role of Algorithms in Computing
`insertion sort` takes time `c1n2` to sort n items, `merge sort` takes about $c2nlgn$. When input is small, **insertion sort is faster**, while input size large enough merge sort is better.

### Getting Started

#### Exercises

2.1-2
> Rewrite the INSERTION-SORT procedure to sort into nonincreasing instead of non- decreasing order.

```pseudo
for j = A.length - 1 to 1
  key = A[j]
  // A[j + 1] - A[A.length]
  i = j + 1
  while i <= A.length and key > A[i]
    A[i - 1] = A[i]
    i = i + 1
  A[i - 1] = key
```

2.1-3
> Consider the searching problem:Input: A sequence of n numbers A D ha1;a2;:::;ani and a value 􏰏.Output: An index i such that 􏰏 D AŒi􏰎 or the special value NIL if 􏰏 does notWrite pseudocode for linear search, which scans through the sequence, looking for 􏰏. Using a loop invariant, prove that your algorithm is correct. Make sure that your loop invariant fulfills the three necessary properties.

```pseudo
SEARCH(A, v):
  for i = 1 to A.length
    if A[i] == v
      return i
  return NIL
```
Refer to [http://clrs.skanev.com/02/01/03.html](http://clrs.skanev.com/02/01/03.html)


2.1-4
> Consider the problem of adding two n-bit binary integers, stored in two n-element arrays A and B. The sum of the two integers should be stored in binary form in an .n C 1/-element array C . State the problem formally and write pseudocode for adding the two integers.

Input: Two n-bit binary integers A, B

Output: n+1-bit binary integer, which is the sum of A and B 

```pseudo
ADD(A, B):
  C = []
  flow = 0
  for i = n to 1
    C[i + 1] = (A[i] + B[i] + flow) % 2
    flow = (A[i] + B[i] + flow) / 2
  C[1] = flow
  return C
```

2.2-1
> Express the function n3=1000 􏰁 100n2 􏰁 100n C 3 in terms of ‚-notation.

$$
O(n^ 3)
$$

2.2-2
> Consider sorting n numbers stored in array A by first finding the smallest element of A and exchanging it with the element in AŒ1􏰎. Then find the second smallest element of A, and exchange it with AŒ2􏰎. Continue in this manner for the first n 􏰁 1 elements of A. Write pseudocode for this algorithm, which is known as selection sort. What loop invariant does this algorithm maintain? Why does it need to run for only the first n 􏰁 1 elements, rather than for all n elements? Give the best-case and worst-case running times of selection sort in ‚-notation.

```pseudo
SELECTION-SORT(A):
  for i = 1 to A.length - 1
    min = i
    for j = i + 1 to A.length
      if A[j] < A[min]
        min = j
    tmp = A[i]
    A[i] = A[min]
    A[min] = tmp
```
Best-case running time: $O(n^ 2)$
Worst-case running time: $O(n^ 2)$


2.2-3
> Consider linear search again (see Exercise 2.1-3). How many elements of the in- put sequence need to be checked on the average, assuming that the element being searched for is equally likely to be any element in the array? How about in the worst case? What are the average-case and worst-case running times of linear search in ‚-notation? Justify your answers.

average-case running time of linear search: $O(n)$
worst-case running time of linear search: $O(n)$

2.2-4
> How can we modify almost any algorithm to have a good best-case running time?

refer to http://clrs.skanev.com/02/02/04.html
> We can modify it to handle the best-case efficiently. For example, if we modify merge-sort to check if the array is sorted and just return it, the best-case running time will be Θ(n).

2.3-2

```pseudo
MERGE(A, p, q, r)
  n1 = q - p + 1
  n2 = r - q
  Let L[1 .. n1] and R[1 .. n2] be new arrays
  for i = 0 to n1
    L[i] = A[p + i]
  for j = 0 to n2
    R[j] = A[q + j]
  i = 1
  j = 1
  for k = p to r
    if i > n1
      A[k] = R[j]
      j = j + 1
    if j > n2
      A[k] = L[i]
      i = i + 1
    if L[i] <= R[j]
      A[k] = L[i]
      i = i + 1
    else
      A[k] = R[j]
      j = j + 1
```

2.3-4

```pseudo
INSERTION-SORT(A, n)
    if n == 1
        return A
    INSERTION-SORT(A[1 .. n-1], n-1)
    for i = n - 1 to 1
        if A[i] > A[n]
            tmp = A[n]
            A[n] = A[i]
            A[i] = tmp
    return A
```

Running time

$$
T(n) = A(n) + B(n) + C(n)
$$

2.3-5

```pseudo
BINARY-SEARCH(A, v)
    n = len(A)
    if A[n/2] == v
        return n/2
    else if A[n/2] < v
        BINARY-SEARCH(A[1 .. n/2], v)
    else
        BINARY-SEARCH(A[n/2 .. n], v)
```

```
O(n) = O(n/2) + c
O(n/2) = O(n/4) + c

O(n/lg2^n) = O(1) = O(1/2) + c

O(n) = clgn
```

2.3-7

```pseudo
SUM-SEARCH(S, x)
    n = len(S)
    for i = 0 to n
        y = x - S[i]
        S2 = S[1 .. i] + S[i+1 .. n]
        j = BINARY-SEARCH(S2, y)
```

$$
O(n) = lgn * n = nlgn
$$
