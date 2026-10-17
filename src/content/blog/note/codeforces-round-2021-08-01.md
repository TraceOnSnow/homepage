---
title: Codeforces Round (2021-08-01)
tags:
  - codeforces
draft: false
description: ""
link: codeforces-round-2021-08-01
date: 2021-08-01T00:00:00+08:00
categories:
  - 算法
---

### A

```cpp
#include <bits/stdc++.h>
using namespace std;

typedef long long ll;
const int mo = 998244353;

int T;

int main () {
    scanf("%d", &T);
    while(T--) {
        int p;
        scanf("%d", &p);
        printf("%d %d\n", 2, p - 1);
    }
    return 0;
}
```

### B

```cpp
#include <bits/stdc++.h>
using namespace std;

const int maxn = 2e5 + 17;
int n, ans, T;
int v[maxn];
char s[maxn], t[maxn];


void Init(){
    scanf("%d", &n);
    for(int i = 1; i <= n; i++) v[i] = 0;
    ans = 0;
    scanf("%s", s + 1);
    scanf("%s", t + 1);
    for(int i = 1; i <= n; i++) {
        if(t[i] == '1') {
            if(i > 1 && s[i - 1] == '1' && !v[i - 1]) {
                v[i - 1] = 1;
                ans++;
            }
            else if(s[i] == '0' && !v[i]) {
                v[i] = 1;
                ans++;
            }
            else if(i < n && s[i + 1] == '1' && !v[i + 1]) {
                v[i + 1] = 1;
                ans++;
            }
        }
    }
}


int main(){
    scanf("%d", &T);
    while(T--) {
        Init();
        printf("%d\n",ans);
    }
    return 0;
}
```

### C

```cpp
#include <bits/stdc++.h>
using namespace std;

const int maxn = 2e5 + 17;
int n, ans, T, m;
set<int> s[maxn];


int main(){
    scanf("%d%d", &n, &m);
    ans = n;
    for(int i = 1; i <= m; i++) {
        int u, v;
        scanf("%d%d", &u, &v);
        if(u > v) swap(u, v);
        s[u].insert(v);
    }
    for(int i = 1; i <= n; i++) if(s[i].size()) ans--;
    scanf("%d", &T);
    while(T--) {
        int t, u, v;
        scanf("%d", &t);
        if(t == 2) {
            scanf("%d%d", &u, &v);
            if(u > v) swap(u, v);
            s[u].erase(v);
            if(s[u].empty()) ans++;
        }
        else if(t == 1) {
            scanf("%d%d", &u, &v);
            if(u > v) swap(u, v);
            if(s[u].empty()) ans--;
            s[u].insert(v);
        }
        else {
            printf("%d\n",ans);
        }
    }
    return 0;
}
```

### D

```cpp
#include <bits/stdc++.h>
using namespace std;

typedef long long ll;
const int maxn = 2e5 + 17;
const int times = 7;
ll a[maxn], b[maxn];
int T, n, cur, ans;
set<ll> s[2];
map<ll, int> mp;

int A[] = { 2, 325, 9375, 28178, 450775, 9780504, 1795265022};

ll  Random(ll x) {
	return (double(rand()) / RAND_MAX * x + 0.5);
}

ll gcd(ll x, ll y) {
	if (x < 0) return gcd(-x, y);//加上这个能快些
	return y ? gcd(y, x%y) : x;
}

ll q_mul(ll x, ll y, ll mod) {
	ll xns = 0;
	while (y) {
		if (y & 1)	xns = (xns + x) % mod;
		x = (x << 1) % mod;
		y >>= 1;
	}
	return xns;
}

ll q_pow(ll x, ll y, ll mod) {
	ll xns = 1;
	while (y) {
		if (y & 1)	xns = q_mul(xns, x, mod);
		x = q_mul(x, x, mod);
		y >>= 1;
	}
	return xns;
}

ll pr(ll N, ll c) {//找到x的一个因子
	ll x, y, d, i = 1, k = 2;
	y = x = Random(N - 1) + 1;
	while (1) {
		i++;
		x = (q_mul(x, x, N) + c) % N;
		d = gcd(y - x, N);
		if (1<d&&d<N) return d;
		if (y == x) return N;//找到循环，选取失败，重新来
		if (i == k) {//似乎是一个优化，但是不是很清楚
			y = x;
			k <<= 1;
		}
	}
}

bool is_prime(ll x) {
    if(x < 2) return 0;
    if(x == 2) return 1;
    if(!(x & 1)) return 0;
    ll k, j = 0, X, tem = x - 1;
    while(!(tem & 1)) tem >>= 1, j++;
    for(int i = 0; i < times; i++) {
        if(A[i] >= x) return 1;
        X = q_pow(A[i], tem, x);
		if(X == 1) continue;
		for(k = 0; k < j; k++) {
			if(X == x - 1) break;
			X = q_mul(X, X, x);
		}
		if(k == j) return 0;
    }
	return 1;
}

void fct(ll x) {
    if(x == 1) return;
    if(is_prime(x)) {
		// cout << x << endl;
        s[cur].insert(x);
		return;
    }
    ll p = x;
	// cout << p << endl;
    while(p >= x) p = pr(p, Random(x) + 1);
    fct(p);
    fct(x / p);
    return;
}

int main() {
    freopen("data.in", "r", stdin);
    scanf("%d", &T);
    while(T--) {
		ans = 0;
		mp.clear();
		s[1].clear(), s[0].clear();
		cur = 0;
        scanf("%d", &n);
        for(int i = 1; i <= n; i++) scanf("%lld", &a[i]);
        for(int i = 1; i < n; i++) b[i] = abs(a[i + 1] - a[i]);
        for(int i = 1; i <= n; i++, cur ^= 1) {
			// s[cur].clear();
            if(i < n) fct(b[i]);
            // for(auto &it : s[cur ^ 1]) {
			// 	if(s[cur].count(it)) mp[it]++;
			// 	else {
			// 		ans = max(ans, mp[it]);
			// 		mp.erase(it);
			// 	}
            // }
        }
		printf("%d\n", ans + 2);
    }
    return 0;
}

/*
1
3
61 1 13

*/
```

### make

```cpp
#include <bits/stdc++.h>
using namespace std;

typedef long long ll;
ll oo = 1e18;
int N = 1e3;
ll  Random(ll n) {
	return (double(rand()) / RAND_MAX * n + 0.5);
}

int main() {
    freopen("data.in", "w", stdout);
    puts("1");
    printf("%d\n", N);
    for(int i = 1; i <= N; i++) printf("%lld%c", Random(oo), " \n"[i == N]);
    return 0;
}
```
