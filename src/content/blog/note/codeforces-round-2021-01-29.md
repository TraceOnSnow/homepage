---
title: Codeforces Round (2021-01-29)
tags:
  - codeforces
draft: false
description: ""
link: codeforces-round-2021-01-29
date: 2021-01-29T00:00:00+08:00
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
#include <map>
using namespace std;

typedef long long ll;
int T;
ll n, k;

int main() {
	cin >> T;
	while(T--) {
		cin >> n >> k;
		ll tmp = n / k;
		if(tmp) {
			ll t = k;
			k *= tmp;
			if(n % k) k += t;
		}
		tmp = k / n;
		if(k % n) cout << tmp + 1 << endl;
		else cout << tmp << endl;
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
#include <map>
using namespace std;

typedef long long ll;
const int maxn = 117;
int T;
int n, k;
ll p[maxn], m[maxn], s[maxn], ans;

int main() {
	cin >> T;
	while(T--) {
		cin >> n >> k;
		ans = 0;
		for(int i = 1; i <= n; i++) cin >> p[i];
		for(int i = 1; i <= n; i++) s[i] = s[i - 1] + p[i];
		for(int i = 1; i <= n; i++) m[i] = (p[i + 1] * 100 / k + ((p[i + 1] * 100) % k ? 1 : 0)) - s[i];
		for(int i = 1; i < n; i++) if(m[i] < 0) m[i] = 0;
		for(int i = 1; i < n; i++) ans = max(ans, m[i]);
		cout << ans << endl;
	}
	return 0;
}
```

### C

```cpp
#include <cstdlib>
#include <cstdio>
#include <iostream>
#include <algorithm>
#include <cstring>
#include <map>
using namespace std;

typedef long long ll;
const int maxn = 1e5 + 17;
int T;
int n;
ll a[maxn], b[maxn], c[maxn], ans;

int main() {
	cin >> T;
	while(T--) {
		cin >> n;
		ans = 0;
		for(int i = 1; i <= n; i++) cin >> c[i];
		for(int i = 1; i <= n; i++) cin >> a[i];
		for(int i = 1; i <= n; i++) cin >> b[i];
		for(int i = 1; i <= n; i++) if(a[i] > b[i]) swap(a[i], b[i]);
		ll l = 0;
		for(int i = 1; i < n; i++, l+= 2) {
			if(b[i + 1] == a[i + 1]) {
				l += c[i] - 1;
				if(i != 1) ans = max(l, ans);
				l = 0;
				continue;
			}
			if(i > 1) ans = max(ans, l + c[i] - 1);
			l += c[i] - 1 - (b[i + 1] - a[i + 1]);
			if(b[i + 1] - a[i + 1] > l || i == 1) l = b[i + 1] - a[i + 1];
		}
		// cout << l << endl;
		l += c[n] - 1;
		ans = max(l, ans);
		cout << ans << endl;

	}
	return 0;
}
```

### D

```cpp
#include <cstdlib>
#include <cstdio>
#include <iostream>
#include <algorithm>
#include <cstring>
#include <map>
using namespace std;

typedef long long ll;
const int maxn = 1e6 + 17;
int T;
int n;
int fa[maxn], sz[maxn], p[maxn];

int getf(int x) {
	if(fa[x] == x) return x;
	return fa[x] = getf(fa[x]);
}

void merge(int x, int y) {
	int fx = getf(x), fy = getf(y);
	if(fx == fy) return;
	fa[fy] = fx, sz[fx] += sz[fy], sz[fy] = 0;
}

int main() {
	cin >> T;
	while(T--) {
		cin >> n;
		n++;
		string str;
		cin >> str;
		p[0] = -1, p[n] = -1;
		for(int i = 1; i < n; i++) p[i] = str[i - 1] =='L' ? 0 : 1;
		for(int i = 1; i <= n; i++) fa[i] = i, sz[i] = 1, fa[i + n] = i + n, sz[i + n] = 1;
		for(int i = 1; i <= n; i++) {
			if(p[i - 1] == 0) merge(i - 1 + n, i);
			if(p[i] == 1) merge(i + 1 + n, i);
		}
		for(int i = 1; i <= n; i++) {
			cout << sz[getf(i)] << " \n"[i == n];
		}
	}
	return 0;
}
```
