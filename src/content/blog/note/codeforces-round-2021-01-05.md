---
title: Codeforces Round (2021-01-05)
tags:
  - codeforces
draft: false
description: ""
link: codeforces-round-2021-01-05
date: 2021-01-05T00:00:00+08:00
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

typedef long long ll;
const int maxn = 1e5 + 17;

ll t, x, n, a[maxn];
ll ans1, ans2;

int main() {
	cin >> t;
	while(t--) {
		cin >> n >> x;
		ans1 = 0, ans2 = 0;
		for(int i = 1; i <= n; i++) cin >> a[i];
		for(int i = 1; i <= n; i++) ans1 += a[i], ans2 += (a[i] / x + ((a[i] % x) ? 1 : 0));
		ans1 = (ans1 / x + ((ans1 % x) ? 1 : 0));
		cout << ans1 << " " << ans2 << endl;
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

typedef long long ll;
const int maxn = 1e5 + 17;
const int oo = 0x3f3f3f3f;

int n, t, x, a[maxn], b[maxn], mb, p;
ll s[maxn];

int main() {
	cin >> t;
	while(t--) {
		cin >> n >> x;
		for(int i = 1; i <= n; i++) cin >> a[i];
		mb = oo, p = 0;
		for(int i = 1; i <= n; i++) {
			b[i] = 0;
			for(int t = a[i]; t % x == 0; t /= x) b[i]++;
			mb = min(mb, b[i]);
			s[i] = s[i - 1] + 1ll * a[i];
		}
		for(int i = 1; i <= n; i++) {
			if(b[i] == mb) {
				p = i - 1;
				break;
			}
		}

		cout << 1ll * (mb + 1) * s[n] + s[p] << endl;

	}
	return 0;
}
```

### C

```cpp
#include <cstdio>
#include <iostream>
#include <algorithm>
#include <cmath>
#include <cstring>
using namespace std;

const int maxn = 3e5 + 17;

int n, t, m, k[maxn], c[maxn];
long long ans;

bool cmp(int x, int y) {
	return x > y;
}

int main() {
	scanf("%d", &t);
	while(t--) {
		scanf("%d%d", &n, &m);
		for(int i = 1; i <= n; i++) scanf("%d", &k[i]);
		for(int i = 1; i <= m; i++) scanf("%d", &c[i]);
		sort(k + 1, k + 1 + n, cmp);
		for(int i = 1; i <= m; i++) {
			if(k[i] > i) k[i] = i;
			else break;
		}
		for(int i = 1; i <= n; i++) ans += 1ll * c[k[i]];
		printf("%lld\n", ans);

		ans = 0;
		for(int i = 1; i <= n; i++) k[i] = 0;
		for(int i = 1; i <= m; i++) c[i] = 0;
	}
	return 0;
}
```
