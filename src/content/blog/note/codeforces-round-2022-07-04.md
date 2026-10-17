---
title: Codeforces Round (2022-07-04)
tags:
  - codeforces
draft: false
description: ""
link: codeforces-round-2022-07-04
date: 2022-07-04T00:00:00+08:00
categories:
  - 算法
---

### A

```cpp
#include <bits/stdc++.h>
using namespace std;

int n;

int main() {
    cin >> n;
    while(n--) {
        int x;
        cin >> x;
        if(x & 1) cout << "-1" << endl;
        else {
            cout << "0 0 " << (x >> 1) << endl;
        }
    }
    return 0;
}
```

### B

```cpp
#include <bits/stdc++.h>
using namespace std;

int T, n, m;
int a[100][100];

void w(int o, int i, int j) {
    a[i][j] = a[i + 1][j + 1] = o;
    a[i + 1][j] = a[i][j + 1] = (1 - o);
}

int main() {
    scanf("%d", &T);
    while(T--) {
        scanf("%d%d", &n, &m);
        for(int i = 1; i <= n; i += 2) {
            for(int j = 1; j <= m; j += 2) {
                if(j == 1) w(a[i - 1][j], i, j);
                else w(a[i][j - 1], i, j);
            }
        }
        for(int i = 1; i <= n; i++) {
            for(int j = 1; j <= m; j++) printf("%d%c", a[i][j], " \n"[j == m]);
        }
    }
    return 0;
}
```

### C

```cpp
#include <bits/stdc++.h>
using namespace std;

const int maxn = 1e5 + 17;
int T, n, ans, l, r;
int a[maxn], p[maxn], t[maxn];
const int mod = 1e9 + 7;

void add(int x) {
    for(; x <= n; x += (x & -x)) t[x]++;
}

int cal(int x) {
    int res = 0;
    for(; x; x -= (x & -x)) res += t[x];
    return res;
}

int main() {
    scanf("%d", &T);
    while(T--) {
        scanf("%d", &n);
        for(int i = 1; i <= n; i++) {
            scanf("%d", &a[i]);
            p[a[i]] = i;
        }
        ans = 1, l = n + 1, r = 0;
        for(int i = 0; i < n; i++) {
            if(p[i] > l && p[i] < r) {
                ans = 1ll * ans * (r - l - (cal(r) - cal(l))) % mod;
                // cout <<r << " " << l << " " <<  i<< " " << ans << endl;
            }
            add(p[i]);
            l = min(l, p[i]);
            r = max(r, p[i]);
        }
        printf("%d\n", ans);
        for(int i = 0; i <= n; i++) t[i] = 0;
    }
    return 0;
}
```

### D

```cpp
#include <bits/stdc++.h>
using namespace std;

const int maxn = 1e4 + 17;
int T, n, ans;
int a[maxn], cnt[maxn];

int main() {
    scanf("%d", &T);
    while(T--) {
        ans = 0;
        scanf("%d", &n);
        for(int i = 1; i <= n; i++) {
            scanf("%d", &a[i]);
        }
        for(int j = 1; j <= n; j++) {

            int cur = 0;
            stack<int> s;
            for(int i = 1, tmp = 0; i <= n; i++) {
                if(a[i] == j) {
                    if(a[i - 1] != j) {
                            tmp = 1;
                            int tm = 0;
                            int sz = s.size();
                            while(!s.empty()) {
                                int st = s.top(); s.pop();
                                tm = max(tm, cnt[st]);
                                cnt[st] = 0;
                            }
                            cur -= max(tm - (sz - tm), sz & 1);

                    }
                    else tmp++;
                }
                else {
                    if(a[i - 1] == j) {
                        cur += tmp;
                        s.push(a[i]);
                        cnt[a[i]]++;
                    }
                    else {
                        s.push(a[i]);
                        cnt[a[i]]++;
                    }
                }
                if(i == n) {
                    if(a[i] == j) cur += tmp;
                    else {
                        int tm = 0;
                        int sz = s.size();
                        while(!s.empty()) {
                            int st = s.top(); s.pop();
                            tm = max(tm, cnt[st]);
                            cnt[st] = 0;
                        }
                        cur -= max(tm - (sz - tm), sz & 1);

                    }
                }
            }
            ans = max(ans, cur);
        }
        printf("%d\n", ans);
    }
    return 0;
}
```
