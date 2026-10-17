---
title: Codeforces Round (2021-01-14)
tags:
  - codeforces
draft: false
description: ""
link: codeforces-round-2021-01-14
date: 2021-01-14T00:00:00+08:00
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

const int maxn = 1e3 + 17;
int T, n, a[maxn], d;

int main() {
	cin >> T;
	while(T--) {
		cin >> n >> d;
		int flg = 0;
		for(int i = 1; i <= n; i++) {
			cin >> a[i];
			if(a[i] > d) flg = 1;
		}
		if(flg) {
			sort(a + 1, a + 1 + n);
			if(a[1] + a[2] <= d) flg = 0;
		}
		puts(flg ? "NO" : "YES");
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

int T;

inline int gcd(int x, int y) {
	return y ? gcd(y, x % y) : x;
}

int main() {
	cin >> T;
	while(T--) {
		string s1, s2;
		cin >> s1; cin >> s2;
		int len1 = s1.length(), len2 = s2.length();
		int l1 = 0, l2 = 0;
		for(l1 = 1; l1 <= len1; l1++) {
			int flg = 1;
			for(int i = l1; i < len1;) {
				for(int j = 0; j < l1; j++, i++) {
					if(s1[i] != s1[j]) flg = 0;
				}
			}
			if(flg) break;
		}
		for(l2 = 1; l2 <= len2; l2++) {
			int flg = 1;
			for(int i = l2; i < len2;) {
				for(int j = 0; j < l2; j++, i++) {
					if(s2[i] != s2[j]) flg = 0;
				}
			}
			if(flg) break;
		}
		if(l1 == l2) {
			int flg = 1;
			for(int i = 0; i < l1; i++) {
				if(s1[i] != s2[i]) flg = 0;
			}
			if(flg) {
				int x = len1 / l1, y = len2 / l2;
				int rep = x * y / gcd(x, y);
				for(int i = 1; i <= rep; i++) {
					for(int j = 0; j < l1; j++) printf("%c", s1[j]);
				}
				printf("\n");
			}
			else {
				puts("-1");
			}

		}
		else puts("-1");
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

int T, n, k;

int main() {
	cin >> T;
	while(T--) {
		cin >> n >> k;
		for(int i = 1; i < 2 * k - n; i++) printf("%d%c", i, " \n"[i == k]);
		int j = k;
		for(int i = 2 * k - n; i <= k; i++, j--) printf("%d%c", j, " \n"[i == k]);
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

const int maxn = 2e5 + 17;;
int T, n, m, a[maxn], s[maxn], dmax[maxn][20], dmin[maxn][20];
void initMax(int n,int d[])
{
    for(int i=1;i<=n;i++)dmax[i][0]=d[i];
    for(int j=1;(1<<j)<=n;j++)
        for(int i=1;i+(1<<j)-1<=n;i++)
            dmax[i][j]=max(dmax[i][j-1],dmax[i+(1<<(j-1))][j-1]);
}
int getMax(int L,int R)
{
    int k=0;
    while((1<<(k+1))<=R-L+1)k++;
    return max( dmax[L][k],dmax[R-(1<<k)+1][k] );
}
void initMin(int n,int d[])
{
    for(int i=1;i<=n;i++)dmin[i][0]=d[i];
    for(int j=1;(1<<j)<=n;j++)
        for(int i=1;i+(1<<j)-1<=n;i++)
            dmin[i][j]=min( dmin[i][j-1],dmin[i+(1<<(j-1))][j-1] );
}
int getMin(int L,int R)
{
    int k=0;
    while((1<<(k+1))<=R-L+1)k++;
    return min( dmin[L][k],dmin[R-(1<<k)+1][k] );
}

int main() {
	scanf("%d", &T);
	while(T--) {
		scanf("%d%d", &n, &m);
		string str;
		cin >> str;
		for(int i = 1; i <= n; i++) a[i] = (str[i - 1] == '+' ? 1 : -1);
		for(int i = 1; i <= n; i++) s[i] = s[i - 1] + a[i];
		initMin(n, s);
		initMax(n, s);
		for(int i = 1; i <= m; i++) {
			int l, r;
			scanf("%d%d", &l, &r);
			int tmp = s[r] - s[l - 1];
			int mx = 0, mn = 0;
			if(l > 1) {
				mx = max(mx, getMax(1, l - 1));
				mn = min(mn, getMin(1, l - 1));
			}
			if(r < n) {
				mx = max(mx, getMax(r + 1, n) - tmp);
				mn = min(mn, getMin(r + 1, n) - tmp);
			}
			printf("%d\n", mx - mn + 1);
		}
	}
	return 0;
}
```
