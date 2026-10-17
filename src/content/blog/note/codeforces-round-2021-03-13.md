---
title: Codeforces Round (2021-03-13)
tags:
  - codeforces
draft: false
description: ""
link: codeforces-round-2021-03-13
date: 2021-03-13T00:00:00+08:00
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

const int maxn = 1e6 + 17;
int T, n, a[maxn], b[maxn], tm[maxn];

int main() {
	cin >> T;
	while(T--) {
		cin >> n;
		for(int i = 1; i <= n; i++) cin >> a[i] >> b[i];
		for(int i = 1; i <= n; i++) cin >> tm[i];
		int t = 0;
		for(int i = 1; i <= n; i++) {
			t += a[i] - b[i - 1] + tm[i];
			if(i == n) break;
			t += (b[i] - a[i] + 1) / 2;
			if(t < b[i]) t = b[i];
		}
		cout << t <<endl;
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
#include <vector>
#include <iostream>
using namespace std;

#define mp make_pair
typedef pair<int, int> pii;
vector<pii> v;
const int maxn = 1e6 + 17;

int T, n, a[maxn];

bool cmp(pii A, pii B) {
	return A.first < B.first;
}

int main () {
	cin >> T;
	while(T--) {
		cin >> n;
		for(int i = 1; i <= n; i++) a[i] = 0;
		int cl = 0, cr = 0;

		for(int i = 1; i <= n; i++) {
			int len;
			cin >> len;
			if(len) v.push_back(mp(max(1, i - len + 1), i));
		}
		sort(v.begin(), v.end(), cmp);
		int m = v.size();
		for(int i = 0; i < m; i++) {
			int l = v[i].first, r = v[i].second;
			if(r > cr) {
				for(int i = max(cr + 1, l); i <= r; i++) a[i] = 1;
				if(l > cr) {
					cl = l;
				}
				cr = r;
			}
		}
		for(int i = 1; i <= n; i++) cout << a[i] << " \n"[i == n];
		v.clear();
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
#include <vector>
#include <iostream>
using namespace std;

const int maxn = 3e6 + 17;
const int mx = 2500000;
int n, c[maxn], a[maxn];
typedef pair<int, int> pii;
vector<pii> s[maxn * 2];

int main() {
	cin >> n;
	for(int i = 1; i <= n; i++) cin >> a[i];
	for(int i = 1; i <= n; i++) {
		for(int j = i + 1; j <= n; j++) {
			s[a[i] + a[j]].push_back(make_pair(i, j));
			if(s[a[i] + a[j]].size() >= 4) {

			}
		}
	}

	return 0;

}
```

### tmp

```cpp
#include <cstdio>
#include <iostream>
#include <algorithm>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << a * 2 + b << endl;
    return 0;
}
```
