---
title: Codeforces Round (2021-01-08)
tags:
  - codeforces
draft: false
description: ""
link: codeforces-round-2021-01-08
date: 2021-01-08T00:00:00+08:00
categories:
  - 算法
---

### A

```cpp
#include <cstdio>
#include <iostream>
#include <algorithm>
#include <cmath>
#include <cstring>
using namespace std;

int t, n;
int main() {
	cin >> t;
	while(t--) {
		cin >> n;
		if(n == 1) printf("9\n");
		else if(n == 2) printf("98\n");
		else {
			printf("98");
			for(int i = 3, j = 9; i <= n; i++) {
				printf("%d", j);
				j++;
				if(j == 10) j = 0;
			}
			puts("");
		}
	}
	return 0;
}
```

### B

```cpp
#include <cstdio>
#include <iostream>
#include <algorithm>
#include <cmath>
#include <cstring>
using namespace std;

const int maxn = 3e5 + 17;
int t, n, a[maxn], ans, v[maxn], s[maxn];

inline int pos(int x) {
	if(a[x] > a[x - 1] && a[x] > a[x + 1]) return 1;
	else if(a[x] == a[x - 1] || a[x] == a[x + 1]) return 2;
	else if(a[x] < a[x - 1] && a[x] < a[x + 1]) return -1;
	return 0;
}

inline int val(int x) {
	if(x == 1 || x == n) return 0;
	return (abs(pos(x)) == 1) ? 1 : 0;
}

inline int ck(int x) {
	return val(x - 1) + val(x) + val(x + 1);
}

int main() {
	scanf("%d", &t);
	while(t--) {
		scanf("%d", &n);

		ans = 0;
		for(int i = 0; i <= n + 2; i++) a[i] = 0, v[i] = 0, s[i] = 0;

		for(int i = 1; i <= n; i++) scanf("%d", &a[i]);
		if(n <= 4) {
			printf("0\n");
			continue;
		}

		for(int i = 1; i <= n; i++) v[i] = val(i);
		for(int i = 1; i <= n; i++) s[i] = v[i - 1] + v[i] + v[i + 1];

		// for(int i = 1; i <= n; i++) printf("%d%c", v[i], " \n"[i == n]);

		if(v[2] || v[n - 1]) ans = max(ans, 1);
		for(int i = 2; i < n; i++) {
			int st = a[i];
			for(a[i] = a[i - 1] - 1; a[i] <= a[i - 1] + 1; a[i]++) {
				int tmp = ck(i);
				// for(int i = 1; i <= n; i++) printf("%d%c", a[i], " \n"[i == n]);
					// if(a[i] == 6) printf("%d %d\n", tmp, s[i]);
				if(tmp < s[i]) ans = max(ans, s[i] - tmp);
			}
			for(a[i] = a[i + 1] - 1; a[i] <= a[i + 1] + 1; a[i]++) {
				int tmp = ck(i);
				if(tmp < s[i]) ans = max(ans, s[i] - tmp);
			}
			a[i] = st;
		}

		ans *= -1;
		for(int i = 1; i <= n; i++) ans += v[i];
		printf("%d\n", ans);
	}
	return 0;
}
```
