---
title: Codeforces Round (2021-04-29)
tags:
  - codeforces
draft: false
description: ""
link: codeforces-round-2021-04-29
date: 2021-04-29T00:00:00+08:00
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

int main() {
	int t;
	cin >> t;
	while(t--) {
		int r, b, d;
		cin >> r >> b >> d;
		if(r > b) swap(r, b);
		if(r <= b &&  1ll * b <= 1ll * (1 + d) * r) cout << "YES" << endl;
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

int main() {
	int t;
	cin >> t;
	while(t--) {
		int n, m, k;
		cin >> n >> m >> k;
		if(k == n * m - 1) cout << "YES" << endl;
		else cout << "NO" << endl;
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
#include <vector>
using namespace std;

typedef long long ll;
const int maxn = 2e5 + 17;
int n, u[maxn];
vector<ll> v[maxn];
ll s[maxn];
int sz[maxn];

bool cmp(ll a, ll b) {
	return a > b;
}

int main() {
	int T;
	scanf("%d", &T);
	while(T--) {
		scanf("%d", &n);
		for(int i = 1; i <= n; i++) {
			s[i] = 0;
			v[i].clear();
			sz[i] = 0;
		}
		for(int i = 1; i <= n; i++) scanf("%d", &u[i]);
		for(int i = 1; i <= n; i++) {
			int tmp; scanf("%d", &tmp);
			v[u[i]].push_back(1ll * tmp);
			sz[u[i]]++;
		}
		for(int i = 1; i <= n; i++) {
			int t = sz[i];
			sort(v[i].begin(), v[i].end(), cmp);
			// for(int j = 0; j < t; j++) printf("%d%c", v[i][j], " \n"[j == t - 1]);
			for(int j = 1; j < t; j++) v[i][j] = v[i][j] + v[i][j - 1];
			for(int j = 1; j <= t; j++) {
				s[j] += v[i][t / j * j - 1];
			}
		}
		for(int i = 1; i <= n; i++) printf("%lld%c", s[i], " \n"[i == n]);
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
#include <vector>
using namespace std;

typedef long long ll;
const int maxn = 5e3 + 17;
int n;
ll a[maxn], b[maxn], f[maxn][maxn], ans;

bool cmp(ll a, ll b) {
	return a > b;
}

int main() {
	cin >> n;
	for(int i = 1; i <= n; i++) cin >> a[i];
	for(int i = 1; i <= n; i++) cin >> b[i];
	for(int i = 1; i <= n; i++) f[1][1] += a[i] * b[i];
	for(int i = 2; i <= n; i++) f[i][i] = f[1][1];
	ans = f[1][1];
	// cout << ans << endl;
	for(int l = 1; l < n; l++) {
		int r = l + 1;
		f[l][r] = f[1][1] - a[l] * b[l] - a[r] * b[r] + a[l] * b[r] + a[r] * b[l];
		ans = max(ans, f[l][r]);
	}
	for(int i = 3; i <= n; i++) {
		for(int l = 1; l + i - 1 <= n; l++) {
			int r = l + i - 1;
			f[l][r] = f[l + 1][r - 1] - a[l] * b[l] - a[r] * b[r] + a[l] * b[r] + a[r] * b[l];
			ans = max(ans, f[l][r]);
		}
	}
	// cout << f[3][5] << endl;
	cout << ans << endl;
	return 0;
}
```
