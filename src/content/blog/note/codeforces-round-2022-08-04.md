---
title: Codeforces Round (2022-08-04)
tags:
  - codeforces
draft: false
description: ""
link: codeforces-round-2022-08-04
date: 2022-08-04T00:00:00+08:00
categories:
  - 算法
---

### A

```cpp
#include <bits/stdc++.h>
using namespace std;

#define mp make_pair
#define pb push_back
#define fi first
#define se second

typedef long long ll;
typedef pair<int, int> pii;

const int maxn = 1e5 + 17;
const int N = 1e5;
const int mo = 1e9 + 7;



void debug(int x) {
    printf("??? %d\n", x);
}

void debug(int *X, int x) {
    printf("??? ");
    for(int i = 1; i <= x; i++) printf("%d%c", X[i], " \n"[i == x]);
}

void solve() {
    int n, ans;
    scanf("%d", &n);
    if(n % 3 == 0) ans = n / 3;
    else if(n % 3 == 2) ans = n / 3 + 1;
    else if(n >= 4) ans = n / 3 + 1;
    else ans = 2;
    printf("%d\n", ans);
}

int main() {
    int T;
    // T = 1;
    scanf("%d", &T);
    // cin >> T;
    while(T--) {
        solve();
    }
    return 0;
}
```

### B

```cpp
#include <bits/stdc++.h>
using namespace std;

#define mp make_pair
#define pb push_back
#define fi first
#define se second

typedef long long ll;
typedef pair<int, int> pii;

const int maxn = 1e5 + 17;
const int N = 1e5;
const int mo = 1e9 + 7;



void debug(int x) {
    printf("??? %d\n", x);
}

void debug(int *X, int x) {
    // printf("??? ");
    for(int i = 1; i <= x; i++) printf("%d%c", X[i], " \n"[i == x]);
}

int a[maxn];

void solve() {
    int n, ans;
    scanf("%d", &n);
    for(int i = 1; i <= n; i++) a[i] = i;
    printf("%d\n", n);
    for(int i = 1; i <= n; i++) {
        debug(a, n);
        swap(a[i + 1], a[1]);
    }

    // printf("%d\n", ans);
}

int main() {
    int T;
    // T = 1;
    scanf("%d", &T);
    // cin >> T;
    while(T--) {
        solve();
    }
    return 0;
}
```

### C

```cpp
#include <bits/stdc++.h>
using namespace std;

#define mp make_pair
#define pb push_back
#define fi first
#define se second

typedef long long ll;
typedef pair<int, int> pii;

const int maxn = 4e5 + 17;
const ll oo = 1e18;

void debug(int x) {
    printf("??? %d\n", x);
}

void debug(int *X, int x) {
    printf("??? ");
    for(int i = 1; i <= x; i++) printf("%d%c", X[i], " \n"[i == x]);
}

int m, n, a[maxn], b[maxn];

struct SegmentTree {
    struct node {
        ll w, lz;
    } t[maxn * 4];
    #define ls (x << 1)
    #define rs (x << 1 | 1)
    #define mid ((l + r) >> 1)
    void push_down(int x) {
        t[ls].w += t[x].lz;
        t[ls].lz += t[x].lz;
        t[rs].w += t[x].lz;
        t[rs].lz += t[x].lz;
        t[x].lz = 0;
    }
    void push_up(node& nx, node& nl, node& nr) {
        nx.w = max(nl.w, nr.w);
    }
    void build(int x = 1, int l = 1, int r = n) {
        t[x].lz = 0;
        if(l == r) {
            t[x].lz = 0;
            t[x].w = a[l] + 1 - (l - 1);
            if(l == 1) t[x].w = 0;
            // cout << "!!!" << t[x].w << endl;
            return;
        }
        build(ls, l, mid);
        build(rs, mid + 1, r);
        push_up(t[x], t[ls], t[rs]);
        // printf("%d %d %d %lld %lld %lld %lld\n", x, l, r, t[x].mx, t[x].mn, t[x].p, t[x].pp);
    }
    void modify(int ml, int mr, ll k, int x = 1, int l = 1, int r = n) {
        if(ml <= l && r <= mr) {
            t[x].w += k;
            t[x].lz += k;
            return;
        }
        push_down(x);
        if(ml <= mid) modify(ml, mr, k, ls, l, mid);
        if(mr > mid) modify(ml, mr, k, rs, mid + 1, r);
        push_up(t[x], t[ls], t[rs]);
    }
    node query(int ql, int qr, int x = 1, int l = 1, int r = n) {
        if(ql <= l && r <= qr) return t[x];
        push_down(x);
        node res, rl, rr;
        if(ql <= mid) rl = query(ql, qr, ls, l, mid);
        if(qr > mid) rr = query(ql, qr, rs, mid + 1, r);
        if(qr <= mid) return rl;
        if(ql > mid) return rr;
        push_up(res, rl, rr);
        return res;
    }
} sgt;


void solve() {
    scanf("%d", &m);
    ll ans1 = oo, ans = oo;
    n = m * 2;
    for(int i = 1; i <= m; i++) scanf("%d", &a[i]);
    for(int i = 1; i <= m; i++) scanf("%d", &a[m - i + 1 + m]);
    // debug(a, n);
    sgt.build();
    for(int i = 1; i <= m + 1; i += 2) {
        ll tmp = sgt.query(1, n).w;
        // printf("??? %lld\n", tmp);
        // printf("??? ");
        // for(int i = 1; i <= n; i++) printf("%d%c", sgt.query(i, i).w, " \n"[i == n]);
        ans1 = min(ans1, max(0ll, tmp));
        if(i == m + 1) break;
        sgt.modify(i + 1, 2 * m - i - 1, -2);
        sgt.modify(2 * m - i, 2 * m - i, (2 * (m - i - 1)));
        sgt.modify(2 * m - i + 1, 2 * m - i + 1, (2 * (m - i)));
    }
    ans = min(ans1 + n - 1, ans);
    // printf("%lld\n", ans);
    for(int i = 1; i <= n; i++) b[i] = a[i];
    m--;
    int inv = max(b[n] + 2, b[n - 1] + 1);
    for(int i = 1; i <= m; i++) a[i] = b[n - i] - inv;
    for(int i = 1; i <= m; i++) a[i + m] = b[n / 2 - i + 1] - inv;
    // a[1]++;
    n -= 2;
    // a[1] = 0;
    ans1 = oo;
    sgt.build();
    for(int i = 1; i <= m + 1; i += 2) {
        ll tmp = sgt.query(1, n).w;
        // printf("??? %lld\n", tmp);
        // printf("??? ");
        // for(int i = 1; i <= n; i++) printf("%d%c", sgt.query(i, i).w, " \n"[i == n]);
        ans1 = min(ans1, max(0ll, tmp));
        if(i == m + 1) break;
        sgt.modify(i + 1, 2 * m - i - 1, -2);
        sgt.modify(2 * m - i, 2 * m - i, (2 * (m - i - 1)));
        sgt.modify(2 * m - i + 1, 2 * m - i + 1, (2 * (m - i)));
    }
    ans1 += n - 1;
    // cout << ans1 << endl;
    n += 2;
    ans = min(ans1 + inv, ans);

    printf("%lld\n", ans);
}

int main() {
    int T;
    // T = 1;
    scanf("%d", &T);
    // cin >> T;
    while(T--) {
        solve();
    }
    return 0;
}
```

### D

```cpp
#include <bits/stdc++.h>
using namespace std;

#define mp make_pair
#define pb push_back
#define fi first
#define se second

typedef long long ll;
typedef pair<int, int> pii;

const int maxn = 2e5 + 17;
const int N = 1e5;
const int mo = 998244353;

int add(int x, int y) {
    return (x + y) % mo;
}

void debug(int x) {
    printf("??? %d\n", x);
}

void debug(int *X, int x) {
    // printf("??? ");
    for(int i = 1; i <= x; i++) printf("%d%c", X[i], " \n"[i == x]);
}

int n, k, f[2][maxn], ans[maxn];

void solve() {
    scanf("%d%d", &n, &k);
    f[0][0] = 1;

    for(int i = 1, c = 1, lst = 0; i <= n; i++, c ^= 1) {
        int st = k * i + i * (i - 1) / 2;
        if(st > n) break;
        // debug(st);
        // debug(lst);
        for(int j = st; j <= n; j++) {
            int tmp = j - (k + i - 1);
            // f[c][j] = add(f[c ^ 1][tmp], f[c][tmp]);
            // cout << tmp << endl;
            f[c][j] = add(tmp >= lst ? f[c ^ 1][tmp] : 0, tmp >= st ? f[c][tmp] : 0);
            ans[j] = add(ans[j], f[c][j]);
        }
        lst = st;
        // debug(f[c], n);
    }
    // debug(f[c ^ 1], n);
    debug(ans, n);
    // printf("%d\n", n);


}

int main() {
    int T;
    T = 1;
    // scanf("%d", &T);
    // cin >> T;
    while(T--) {
        solve();
    }
    return 0;
}
```
