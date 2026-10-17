---
title: Codeforces Round (2021-01-04)
tags:
  - codeforces
draft: false
description: ""
link: codeforces-round-2021-01-04
date: 2021-01-04T00:00:00+08:00
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

int t, w, h, n;
int c1, c2;

int main() {
	cin >> t;
	while(t--) {
		cin >> w >> h >> n;
		c1 = 0, c2 = 0;
		while(!(w & 1)) w >>= 1, c1++;
		while(!(h & 1)) h >>= 1, c2++;
		// cout << c1 << " " << c1 << endl;
		if((1 << c1) * (1 << c2) >= n) cout << "YES" << endl;
		else cout << "NO" << endl;
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

int t, a[107], n;

int main() {
	cin >> t;
	while(t--) {
		cin >> n;
		int s1 = 0, s2 = 0;
		for(int i = 1; i <= n; i++) cin >> a[i];
		for(int i = 1; i <= n; i++) s1 += (a[i] == 1), s2 += (a[i] == 2);
		if((!(s1 & 1) && !(s2 & 1)) || (!(s1 & 1) && (s2 & 1) && s1 >= 2)) {
			cout << "YES" << endl;
		}
		else cout << "NO" << endl;
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

const int maxn = 2e5 + 17;

int n, t, a[maxn], s[maxn], ans;

int sv(int p) {
	if(p > n) return 0;
	if(!s[p]) s[p] = a[p] + sv(p + a[p]);
	return s[p];
}

int main() {
	cin >> t;
	while(t--) {
		cin >> n;
		for(int i = 1; i <= n; i++) cin >> a[i];
		for(int i = 1; i <= n; i++) s[i] = 0;
		ans = 0;
		for(int i = 1; i <= n; i++) if(!s[i]) {
			ans = max(ans, sv(i));
		}
		cout << ans << endl;
	}
	return 0;
}
```

### D

```cpp
#include <cstdio>
#include <iostream>
#include <algorithm>
#include <cmath>
#include <cstring>
using namespace std;

typedef long long ll;
const int maxn = 2e5 + 17;

bool cmp(int x, int y) {
	return x > y;
}

int n, a[maxn], t;
ll s[2];

int main() {
	cin >> t;
	while(t--) {
		cin >> n;
		for(int i = 1; i <= n; i++) cin >> a[i];
		sort(a + 1, a + 1 + n, cmp);
		s[1] = 0, s[0] = 0;
		int c = 0;
		for(int i = 1; i <= n; i++) {
			if((a[i] & 1) == c) s[c] += 1ll * a[i];
			c = 1 - c;
		}
		if(s[0] > s[1]) puts("Alice");
		if(s[0] == s[1]) puts("Tie");
		if(s[0] < s[1]) puts("Bob");
	}
	return 0;
}
```

### E

```cpp
#include <cstdio>
#include <iostream>
#include <algorithm>
#include <cmath>
#include <cstring>
using namespace std;

const int maxn = 2e5 + 17;

int t, n;
struct frd {
	int h, w, id, ans;
} f[maxn];

bool cmp1(frd x, frd y) {
	return x.h < y.h;
}

bool cmp2(frd x, frd y) {
	return x.w < y.w;
}

bool cmp3(frd x, frd y) {
	return x.id < y.id;
}

int main(int argc, char const *argv[])
{
	cin >> t;
	while(t--) {
		cin >> n;
		for(int i = 1; i <= n; i++) f[i].id = i, f[i].ans = -1;
		for(int i = 1; i <= n; i++) cin >> f[i].h >> f[i].w;
		int mw = 1, mh = 1;
		sort(f + 1, f + 1 + n, cmp1);
		for(int i = 1, j; i <= n; i = j + 1) {
			for(j = i; f[j + 1].h == f[j].h; j++);
			if(i != 1) {
				for(int k = i; k <= j; k++) if(f[mw].w < max(f[k].w, f[k].h)) f[k].ans = f[mw].id;
			}
			for(int k = i; k <= j; k++) if(f[mw].w > f[k].w) mw = k;
		}
		// sort(f + 1, f + 1 + n, cmp3);
		// for(int i = 1; i <= n; i++) printf("%d%c", f[i].ans, " \n"[i == n]);
		sort(f + 1, f + 1 + n, cmp2);
		for(int i = 1, j; i <= n; i = j + 1) {
			for(j = i; f[j + 1].w == f[j].w; j++);
			if(i != 1) {
				for(int k = i; k <= j; k++) if(f[mh].h < fmax(f[k].w, f[k].h)) f[k].ans = f[mh].id;
			}
			for(int k = i; k <= j; k++) if(f[mh].h > f[k].h) mh = k;
		}
		sort(f + 1, f + 1 + n, cmp3);
		for(int i = 1; i <= n; i++) printf("%d%c", f[i].ans, " \n"[i == n]);
	}
	return 0;
}
```
