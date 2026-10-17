---
title: Python OA / 白板复健 Cheat Sheet
tags:
  - leetcode
draft: false
description: ""
link: python-oa-cheat-sheet
date: 2026-03-09T00:00:00+08:00
categories:
  - 算法
---

# 🧠 Python OA / 白板复健 Cheat Sheet

> C++ ICPC 竞赛党 → Python 白板手撕恢复  
> 目标：Amazon / Meta / 大厂 OA 无 AI 辅助

---

# 🔹 0. 竞赛基础模板

```python
import sys
from collections import *
import heapq
import bisect
from functools import cmp_to_key

sys.setrecursionlimit(10**7)
input = sys.stdin.readline
```

---

# 🔹 1. 数据结构映射（C++ → Python）

---

## 1️⃣ vector → list

```python
a = []
a = [0] * n
a = list(range(n))
```

二维数组（⚠️ 别写错）

```python
grid = [[0]*n for _ in range(m)]
```

❌ 错误写法：

```python
grid = [[0]*n]*m
```

常用操作：

```python
a.append(x)
a.pop()
a.pop(i)
a.insert(i, x)
a.extend(b)

a[i]
a[-1]
len(a)
```

切片：

```python
a[l:r]
a[::-1]
```

---

## 2️⃣ queue / deque

```python
from collections import deque

q = deque()
q.append(x)
q.appendleft(x)

q.pop()
q.popleft()
```

BFS 模板：

```python
q = deque([start])

while q:
    u = q.popleft()
    for v in g[u]:
        q.append(v)
```

---

## 3️⃣ priority_queue → heapq

默认小根堆：

```python
import heapq

h = []
heapq.heappush(h, x)
heapq.heappop(h)
```

大根堆：

```python
heapq.heappush(h, -x)
x = -heapq.heappop(h)
```

多关键字：

```python
heapq.heappush(h, (dist, node))
```

---

## 4️⃣ map / unordered_map

### dict

```python
mp = {}
mp[key] = value
mp.get(key, 0)

for k, v in mp.items():
    ...
```

---

### defaultdict

```python
from collections import defaultdict

cnt = defaultdict(int)
g = defaultdict(list)
s = defaultdict(set)
```

---

## 5️⃣ Counter（统计神器）

```python
from collections import Counter

cnt = Counter(nums)
cnt[x]
cnt.most_common(k)
```

Anagram：

```python
Counter(s) == Counter(t)
```

---

## 6️⃣ set

```python
s = set()
s.add(x)
s.remove(x)
s.discard(x)
x in s
```

集合运算：

```python
a | b
a & b
a - b
```

---

# 🔹 2. 排序 & 二分

---

## 1️⃣ sort

```python
a.sort()
a.sort(reverse=True)
b = sorted(a)
```

---

## 2️⃣ key 排序（最重要）

单关键字：

```python
a.sort(key=len)
a.sort(key=lambda x: x[1])
```

多关键字：

```python
a.sort(key=lambda x: (x[0], -x[1]))
```

---

## 3️⃣ cmp_to_key（少用）

```python
from functools import cmp_to_key

def cmp(a,b):
    return a-b

a.sort(key=cmp_to_key(cmp))
```

---

## 4️⃣ bisect（二分）

```python
import bisect

bisect.bisect_left(a, x)
bisect.bisect_right(a, x)
bisect.insort(a, x)
```

---

# 🔹 3. 字符串 & 切片

---

反转：

```python
s[::-1]
```

判断回文：

```python
s == s[::-1]
```

ASCII：

```python
ord('a')
chr(97)
ord(c) - ord('a')
```

split / join：

```python
s.split()
",".join(arr)
```

---

遍历技巧：

```python
for i, x in enumerate(a):
    ...

for x, y in zip(a, b):
    ...
```

---

# 🔹 4. 高频算法模板

---

## 滑窗

```python
l = 0
for r in range(n):
    while 条件不满足:
        l += 1
```

---

## 前缀和

```python
pre = [0]*(n+1)

for i in range(n):
    pre[i+1] = pre[i] + a[i]
```

区间和：

```python
pre[r] - pre[l]
```

---

## 双指针

```python
l, r = 0, n-1

while l < r:
    ...
```

---

## 单调栈

```python
stack = []

for x in nums:
    while stack and stack[-1] > x:
        stack.pop()
    stack.append(x)
```

---

## TopK

```python
import heapq
heapq.nlargest(k, nums)
heapq.nsmallest(k, nums)
```

---

# 🔹 5. Python 容易翻车的坑

---

### ❶ 二维数组浅拷贝

```python
grid = [[0]*n for _ in range(m)]
```

---

### ❷ 递归深度

```python
import sys
sys.setrecursionlimit(10**7)
```

---

### ❸ mutable 默认参数

❌

```python
def dfs(x, path=[]):
```

✅

```python
def dfs(x, path=None):
    if path is None:
        path = []
```

---

# 🔹 6. Amazon 高频工具

出现概率极高：

- `defaultdict`
- `Counter`
- `heapq`
- `deque`
- `sort(key=lambda)`
- `bisect`
- sliding window
- prefix sum

---

# 🔹 7. 自测清单（白板标准）

我是否可以在 5 秒内写出：

- `defaultdict(list)`
- `Counter(nums)`
- `heapq.heappush`
- `a.sort(key=lambda x:(x[0],-x[1]))`
- `bisect_left`
- `s[::-1]`
- `enumerate`
- `zip`
- `prefix sum`
- 滑窗模板

如果不能，重复抄 5 次。

---

# 🔥 最终目标

> 让 Python 成为你的第二 C++

当你达到：

- 不再思考语法
- 不再查 API
- 排序 key 能秒写
- heap / defaultdict 条件反射

你就回到 ICPC 状态了。

---

如果你愿意，我可以给你下一份：

# 《Amazon OA 20 个 Python 手撕母板（白板可背版）》

那份会是实战模板合集。
