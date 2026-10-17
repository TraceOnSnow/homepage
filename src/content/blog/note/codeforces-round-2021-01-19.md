---
title: Codeforces Round (2021-01-19)
tags:
  - codeforces
draft: false
description: ""
link: codeforces-round-2021-01-19
date: 2021-01-19T00:00:00+08:00
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

const int maxn = 1e5 + 17;
int T, n, b[maxn], a[maxn];
string str;

int main() {
	cin >> T;
	while(T--) {
		cin >> n;
		cin >> str;
		for(int i = 1; i <= n; i++) b[i] = str[i - 1] - '0';
		for(int i = 1; i <= n; i++) {
			if(b[i]) {
				if(b[i - 1]) {
					a[i] = 1 - a[i - 1];
				}
				else {
					a[i] = 1;
				}
			}
			else {
				if(b[i - 1]) {
					a[i] = a[i - 1];
				}
				else {
					a[i] = 1 - a[i - 1];
				}
			}
		}
		for(int i = 1; i <= n; i++) printf("%d", a[i]);
		puts("");
	}
	return 0;
}
```

### B

```cpp
#include <cstdio>
#include <iostream>
#include <algorithm>
#include <cstring>
using namespace std;

const int maxn = 1e6 + 17;
int T, d, n = 1000000;
int p[maxn], vis[maxn], cnt;

int main() {
	vis[0] = vis[1] = 1;
	for(int i = 2; i <= n; i++) {
		if(!vis[i]) p[++cnt] = i;
		for(int j = 1; j <= cnt && 1ll * p[j] *i <= n; j++) {
			vis[i * p[j]] = p[j];
			if(!(i % p[j])) break;
		}
	}
	// for(int i = 1; i <= 20; i++) cout << p[i] << endl;
	cin >> T;
	while(T--) {
		cin >> d;
		int p1, p2;
		for(p1 = 1; p[p1] - 1 < d; p1++);
		for(p2 = p1; p[p2] - p[p1] < d; p2++);
		cout << 1ll * p[p1] * p[p2] << endl;
	}
	return 0;
}
```

### C

```cpp
#include <cstdio>
#include <iostream>
#include <algorithm>
#include <cstring>
#include <vector>
#define mp make_pair
#define pb push_back
using namespace std;

typedef pair<int, int> pii;
const int maxn = 2e6 + 17;
int T, n, a[maxn], c[maxn];
int ans[maxn][2], f;

bool cmp(int x, int y) {
	return x > y;
}

void dfs(int u, int p) {
	while(c[a[p]] > 0 && p <= n * 2) p++;
	if(p > n * 2) {
		f = 1;
		return;
	}
	int tmp = ans[u - 1][1] - a[p];
	if(c[tmp] > 0) {
		c[a[p]]--, c[tmp]--;
		ans[u][0] = tmp, ans[u][1] = a[p];
		dfs(u + 1, p + 1);
		c[a[p]]++, c[tmp]++;
	}
}

int main() {
	scanf("%d", &T);
	while(T--) {
		int flg = 0;
		scanf("%d", &n);
		for(int i = 1; i <= 2 * n; i++) scanf("%d", &a[i]), c[a[i]]++;
		sort(a + 1, a + 1 + 2 * n, cmp);
		for(int i = 2; i <= n * 2; i++) {
			f = 0;
			ans[0][1] = a[1] + a[i];
			dfs(1, 1);
			if(f) {
				puts("YES");
				flg = 1;
				printf("%d\n", ans[1][0] + ans[1][1]);
				for(int j = 1; j <= n; j++) printf("%d %d\n", ans[j][0], ans[j][1]);
				break;
			}
		}
		if(!flg) puts("NO");
		for(int i = 1; i <= 2 * n; i++) c[a[i]]--;
	}
	return 0;
}
```
