---
title: Codeforces Round (2021-03-21)
tags:
  - codeforces
draft: false
description: ""
link: codeforces-round-2021-03-21
date: 2021-03-21T00:00:00+08:00
categories:
  - 算法
---

### A

```cpp
#include <cstdio>
#include <iostream>
using namespace std;
int a, b;

int main() {
	int t;
	cin >> t;
	while(t--) {
		cin >> a >> b;
		cout << a * b << endl;
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
int T, c, m, n, a[maxn];

int main() {
	cin >> T;
	while(T--) {
		cin >> n; for(int i = 1; i <= n; i++) cin >> a[i];
		if(a[1] == a[2]) {
			int flg = 1;
			for(int i = 2; i <= n; i++) if(a[i - 1] != a[i]) flg = 0;
			if(flg) cout << 0 << endl;
			else cout << -1 << endl;
			continue;
		}
		else if(a[1] < a[2]) {
			int flg = 1;
			c = a[2] - a[1];
			m = 0;
			for(int i = 1; i < n; i++) {
				if(a[i + 1] < a[i]) {
					m = a[i] + c - a[i + 1];
					break;
				}
			}
			if(m == 0) {
				for(int i = 1; i < n; i++) {
					if(a[i + 1] != (a[i] + c) ) flg = 0;
				}
				if(flg) cout << 0 << endl;
				else cout << -1 << endl;
				continue;
			}
			for(int i = 1; i < n; i++) {
				if(a[i] >= m || a[i + 1] >= m) flg = 0;
				if(a[i + 1] != (a[i] + c) % m) flg = 0;
			}
			if(flg) cout << m << " " << c << endl;
			else cout << -1 << endl;
			continue;
		}
		else {
			int flg = 1;
			c = 0;
			for(int i = 1; i < n; i++) {
				if(a[i + 1] > a[i]) c = a[i + 1] - a[i];
			}
			if(c == 0) {
				c = a[2] - a[1];
				for(int i = 1; i < n; i++) {
					if(a[i + 1] != (a[i] + c) ) flg = 0;
				}
				if(flg) cout << 0 << endl;
				else cout << -1 << endl;
				continue;
			}
			m = a[1] - a[2] + c;
			for(int i = 1; i < n; i++) {
				if(a[i] >= m || a[i + 1] >= m) flg = 0;
				if(a[i + 1] != (a[i] + c) % m) flg = 0;
			}
			if(flg) cout << m << " " << c << endl;
			else cout << -1 << endl;
			continue;
		}
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

const int maxn = 1e5 + 17;

struct day {
	int s, id;
	vector<int> v;
} d[maxn];
int T, n, m, c[maxn], p, ans[maxn];

bool cmp(day A, day B) {
	return A.s < B.s;
}

bool ccmp(int A, int B) {
	// cout << A << " " << B << endl;
	return c[A] > c[B];
}

int main() {
	cin >> T;
	while(T--) {
		cin >> n >> m;
		for(int i = 1; i <= m; i++) {
			cin >> d[i].s;
			d[i].id = i;
			for(int j = 0; j < d[i].s; j++) {
				int tmp; cin >> tmp;
				d[i].v.push_back(tmp);
				c[tmp]++;
			}
		}
		for(int i = 1; i <= n; i++) c[i] = min(c[i], (m + 1) / 2);
		sort(d + 1, d + 1 + m, cmp);
		int flg = 1;
		for(int i = 1; i <= m; i++) {
			p = i;
			if(d[i].v.empty()) {
				flg = 0;
				break;
			}
			// cout << d[i].id << endl;
			// cout << c[d[p].v[0]] << " " << c[d[p].v[1]] << endl;
			sort(d[i].v.begin(), d[i].v.end(), ccmp);
			// cout << "wan" << endl;
			if(c[d[p].v[0]] == 0) {
				flg = 0;
				break;
			}
			else {
				c[d[p].v[0]]--;
				ans[d[i].id] = d[p].v[0];
			}
		}
		puts(flg ? "YES" : "NO");
		if(flg) for(int i = 1; i <= m; i++) printf("%d%c", ans[i], " \n"[i == m]);

		for(int i = 1; i <= n; i++) c[i] = 0;
		for(int i = 1; i <= m; i++) {
			ans[i] = 0;
			d[i].v.clear();
		}
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

const int maxn = 1e5 + 17;
int T, n, a[maxn];
int pre[maxn], nxt[maxn];
int hd[maxn], ed[maxn];
int fa[maxn];
vector<int> ans;

int gcd(int x, int y) {
	return y ? gcd(y, x % y) : x;
}

int getf(int x) {
	return fa[x] == x ? x : fa[x] = getf(fa[x]);
}

int main() {
	cin >> T;
	while(T--) {
		ans.clear();
		cin >> n; for(int i = 1; i <= n; i++) cin >> a[i];
		if(n == 1 && a[1] != 1) {
			cout << 0 << endl;
			continue;
		}
		for(int i = 1; i <= n; i++) fa[i] = i;
		pre[1] = n; for(int i = 2; i <= n; i++) pre[i] = i - 1;
		for(int i = 1; i < n; i++) nxt[i] = i + 1;
		nxt[n] = 1;
		for(int j = 1; 1;) {
			int i = j;

			while(gcd(a[i], a[pre[i]]) > 1) {
				i = pre[i];
			}
			// cout << i << j << endl;
			for(int h = j; h != pre[i]; h = pre[h]) fa[getf(h)] = getf(j);
			hd[getf(i)] = i, ed[getf(j)] = j;
			j = pre[i];
			if(j == 1) break;
		}

		for(int p = 1, fst = 1; 1;) {
			if(fst) {
				fst = 0;
				p = nxt[p];
				continue;
			}
			if(pre[p] == ed[getf(pre[p])]) {
				nxt[pre[p]] = nxt[p];
				pre[nxt[p]] = pre[p];
				ans.push_back(p);
				fst = 1;
				if(gcd(a[pre[p]], a[nxt[p]]) > 1) {
					int fn = getf(nxt[p]), fp = getf(pre[p]);
					if(fn == fp) {
						break;
					}
					else{
						fa[fn] = fp;
						ed[fp] = ed[fn];
					}
				}
			}
			else p = ed[getf(p)];

			if(nxt[p] != p) p = nxt[p];
			else break;
		}
		int cnt = ans.size();
		cout << cnt << " ";
		for(int i = 0; i < cnt; i++) cout << ans[i] << " \n"[i == cnt - 1];
	}

	return 0;
}
```
