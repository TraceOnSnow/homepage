---
title: Codeforces Round (2021-03-17)
tags:
  - codeforces
draft: false
description: ""
link: codeforces-round-2021-03-17
date: 2021-03-17T00:00:00+08:00
categories:
  - 算法
---

### A

```cpp
#include <cstdio>
#include <algorithm>
#include <cstring>
#include <cmath>
#include <cctype>
#include <iostream>
using namespace std;

int T, n, a[111], c[111];

int main() {
	cin >> T;
	while(T--) {
		memset(c, 0, sizeof(c));
		cin >> n;
		for(int i = 1; i <= n; i++) cin >> a[i];
		for(int i = 1; i <= n; i++) c[a[i]]++;
		for(int i = 0; i <= 100; i++)  if(c[i]) printf("%d ", i), c[i]--;
		for(int i = 0; i <= 100; i++) {
			if(c[i]) {
				for(int j = 1; j <= c[i];j++) printf("%d ", i);
			}
		}
		printf("\n");
	}
	return 0;
}
```

### B

```cpp
#include <cstdio>
#include <algorithm>
#include <cstring>
#include <cmath>
#include <cctype>
#include <iostream>
using namespace std;

const int maxn = 1e5 + 17;
int n, m, c[maxn + 17], ans, T;

int main() {
	scanf("%d", &T);
	while(T--) {
		scanf("%d%d", &n, &m);
		for(int i = 1; i <= n; i++) {
			int tmp; scanf("%d", &tmp);
			c[tmp % m]++;
		}
		for(int i = 1; i * 2 <= m; i++) {
			int j = m - i;
			if(!c[i] && !c[j]) continue;
			if(abs(c[i] - c[j]) <= 1) ans++;
			else {
				ans += abs(c[i] - c[j]);
			}
		}
		if(c[0]) ans++;
		printf("%d\n", ans);


		ans = 0;
		for(int i = 0; i <= m; i++) c[i] = 0;
	}
	return 0;
}
```

### C

```cpp
#include <cstdio>
#include <algorithm>
#include <cstring>
#include <cmath>
#include <cctype>
#include <iostream>
using namespace std;

const int maxn = 1e5 + 17;
int n, k, T;

int main() {
	scanf("%d", &T);
	while(T--) {
		scanf("%d%d", &n, &k);
		k -= 3;
		for(int i = 1; i <= k; i++) printf("1 ");
		n -= k;
		int o = n % 4;
		if(o == 0) {
			printf("%d %d %d\n", n / 2, n / 4, n / 4);
		}
		else if(o == 2) {
			printf("%d %d %d\n", n / 2 - 1, n / 2 - 1, 2);
		}
		else {
			printf("%d %d %d\n", n / 2, n / 2, 1);
		}
	}
	return 0;
}
```

### C2

```cpp
#include <cstdio>
#include <algorithm>
#include <cstring>
#include <cmath>
#include <cctype>
#include <iostream>
#include <queue>
using namespace std;

const int maxn = 1e5 + 17;
int n, k, T;
priority_queue<int> pq;

void work(int x) {
		int o = x % 4;
		if(o == 0) {
			pq.push(x / 2); pq.push(x / 4); pq.push(x / 4);
		}
		else if(o == 2) {
			pq.push(x / 2 - 1); pq.push(x / 2 - 1); pq.push(2);
		}
		else {
			pq.push(x / 2); pq.push(x / 2); pq.push(1);
		}

}

int main() {
	scanf("%d", &T);
	while(T--) {
		scanf("%d%d", &n, &k);
		k -= 3;
		work(n);
		while(k) {
			if(k == 1) break;
			if(k >= 2) {
				int t = pq.top(); pq.pop();
				work(t);
				k -= 2;
			}
		}
		while(!pq.empty()) {
			int t = pq.top(); pq.pop();
			if(t & 1 == 0 && )
		}
	}
	return 0;
}
```

### D

```cpp
#include <cstdio>
#include <algorithm>
#include <cstring>
#include <cmath>
#include <cctype>
#include <map>
#include <set>
#include <vector>
#include <iostream>
using namespace std;

const int maxn = 2e5 + 17;
const int mx = 1e7;
int n, k, T, ans;
set<vector<int>> s;
int vis[mx + 17], p[mx + 17], cnt, is[mx + 17];


int main() {
	for(int i = 2;i <= mx; i++){
		if(!vis[i]) p[++cnt] = i;
		for(int j = 1; j <= cnt && i * p[j] <= mx; j++){
			vis[i * p[j]] = 1;
			if(i % p[j] == 0) break;
		}
	}
	for(int i = 1; i <= cnt; i++) is[p[i]] = 1;
	scanf("%d", &T);
	while(T--) {
		s.clear(); ans = 0;
		scanf("%d%d", &n, &k);
		for(int i = 1; i <= n; i++) {
			int x; scanf("%d", &x);
			vector<int> v;
			for(int j = 1; j <= cnt; j++) {
				if(is[x]) {
					v.push_back(x);
					break;
				}
				if(p[j] > x) break;
				if(x % p[j] == 0) {
					while(x % p[j] == 0) x /= p[j];
					v.push_back(p[j]);
				}
			}
			if(!s.count(v)) s.insert(v);
			else{
				s.clear();
				s.insert(v);
				ans++;
			}
		}
		printf("%d\n", ans);

	}
	return 0;
}
```

### E

```cpp
#include <cstdio>
#include <algorithm>
#include <cstring>
#include <cmath>
#include <cctype>
#include <map>
#include <set>
#include <vector>
#include <iostream>
using namespace std;

const int maxn = 2e5 + 17;
const int mx = 1e7;
int n, k, T, ans;
set<vector<int>> s;
int vis[mx + 17], p[mx + 17], cnt, is[mx + 17];


int main() {
	for(int i = 2;i <= mx; i++){
		if(!vis[i]) p[++cnt] = i;
		for(int j = 1; j <= cnt && 1ll * i * p[j] <= 1ll * mx; j++){
			vis[i * p[j]] = 1;
			if(i % p[j] == 0) break;
		}
	}
	for(int i = 1; i <= cnt; i++) is[p[i]] = 1;
	// for(int i = 1; i <= cnt; i++) printf("%d%c", p[i], " \n"[i == cnt]);
	scanf("%d", &T);
	while(T--) {
		s.clear(); ans = 0;
		scanf("%d%d", &n, &k);
		for(int i = 1; i <= n; i++) {
			int x; scanf("%d", &x);
			vector<int> v;
			for(int j = 1; p[j] * p[j] <= x && j <= cnt; j++) {
				int flg = 0;
				while(x % p[j] == 0) {
					x /= p[j];
					flg++;
				}
				if(flg & 1) {
					v.push_back(p[j]);
				}
			}
			if(x > 1) v.push_back(x);
			if(v.empty()) v.push_back(1);
			// for(int h = 0; h < v.size(); h++) {
			// 		printf("%d ", v[h]);
			// 		printf("\n");
			// 	}
			if(!s.count(v)) s.insert(v);
			else{
				s.clear();
				s.insert(v);
				ans++;
			}
		}
		printf("%d\n", ans + 1);

	}
	return 0;
}
```
