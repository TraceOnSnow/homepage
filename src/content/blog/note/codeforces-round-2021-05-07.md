---
title: Codeforces Round (2021-05-07)
tags:
  - codeforces
draft: false
description: ""
link: codeforces-round-2021-05-07
date: 2021-05-07T00:00:00+08:00
categories:
  - 算法
---

### A

```cpp
#include <cstdlib>
#include <cstdio>
#include <iostream>
#include <algorithm>
#include <cstring>
using namespace std;

int gcd(int a, int b) {
	return b ? gcd(b, a % b) : a;
}

int main() {
	int T;
	cin >> T;
	while(T--) {
		int A, B;
		cin >> A >> B;
		int g = gcd(A, B);
		int a = A / g, b = B / g;
		if(B != 1) cout << "YES" << endl << 1ll * (B - 1) * a * g << " " << 1ll * (B + 1) * a * g<< " " << 1ll * 2 * b * a * g * g << endl;
		else cout << "NO" << endl;
	}
	return 0;
}
```

### B

```cpp
#include <cstdlib>
#include <cstdio>
#include <iostream>
#include <algorithm>
#include <cstring>
using namespace std;

const int maxn = 1e5 + 17;
int n, a[maxn], mn, p;

int main() {
	int t; scanf("%d", &t);
	while(t--) {
		scanf("%d", &n);
		for(int i = 1; i <= n; i++) scanf("%d", &a[i]);
		mn = 0x3f3f3f3f;
		for(int i = 1; i <= n; i++) mn = min(mn, a[i]);
		for(int i = 1; i <= n; i++) if(a[i] == mn) p = i;
			printf("%d\n", n - 1);
		for(int i = 1; i <= n; i++) {
			if(i == p) continue;
			if((i & 1) == (p & 1)) printf("%d %d %d %d\n", i, p, mn, mn);
			else printf("%d %d %d %d\n", i, p, mn + 1, mn);
		}
	}
	return 0;
}
```

### tmp

```cpp
#include <cstdlib>
#include <cstdio>
#include <iostream>
#include <algorithm>
#include <cstring>
using namespace std;

int add(int x, int y) {
	return x + y;
}

int main() {
	int a = 0;
	a = add(++a, ++a);
	cout << a << endl;
	return 0;
}
```
