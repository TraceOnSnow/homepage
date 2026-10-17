---
title: Codeforces Round (2021-07-22)
tags:
  - codeforces
draft: false
description: ""
link: codeforces-round-2021-07-22
date: 2021-07-22T00:00:00+08:00
categories:
  - 算法
---

### A

```cpp
#include<bits/stdc++.h>
using namespace std;

typedef long long ll;
const int maxn = 1e6 + 17;

int T, n, m, ans;
int a[maxn];
string str;

int main() {
	cin >> T;
	while(T--) {
		cin >> n;
		ans = n / 10;
		if(n % 10 == 9) ans++;
		cout << ans << endl;
	}
	return 0;
}
```

### B

```cpp
#include<bits/stdc++.h>
using namespace std;

typedef long long ll;
const int maxn = 1e6 + 17;

int T, n, m, ans;
int a[maxn];
string s, t;

int main() {
	cin >> T;
	while(T--) {
		cin >> s >> t;
		int flg = 0;
		int sl = s.length();
		int len = t.length();
		for(int i = 0; i < len; i++) {
			string l = t.substr(0, i + 1);
			string r = t.substr(i + 1, len - i - 1);
			reverse(r.begin(), r.end());
			int lenl = l.length(), lenr = r.length();
			for(int j = 0; j + i < sl; j++) {
				if(l == s.substr(j, i + 1) && j + i - lenr >= 0) {
					if(r == s.substr(j + i - lenr, lenr)) flg = 1;
				}
			}
		}
		cout << (flg ? "YES" : "NO") << endl;
	}
	return 0;
}
```

### C

```cpp
#include<bits/stdc++.h>
using namespace std;

typedef long long ll;
const int maxn = 1e6 + 17;

int T, n, m, ans;
int a[maxn], r[2], s[2];
string str;

int main() {
	cin >> T;
	while(T--) {
		ans = 10;
		cin >> str;
		for(int i = 1; i <= 10; i++) {
			if(str[i - 1] == '1') a[i] = 1;
			else if(str[i - 1] == '0') a[i] = 0;
			else a[i] = -1;
		}
		r[1] = 5, r[0] = 5, s[1] = 0, s[0] = 0;
		for(int i = 1; i <= 10; i++) {
			if(a[i] == 1) {
				s[i & 1]++, r[i & 1]--;

			}
			else if(a[i] == 0) {
				r[i & 1]--;
			}
			else{
				if(i & 1) {
					s[i & 1]++, r[i & 1]--;
				}
				else{
					r[i & 1]--;
				}
			}
			// cout << s[1] << r[1] << s[0] << r[0] << endl;
			if(s[1] - s[0] > r[0] || s[0] - s[1] > r[1]) {
				ans = min(ans, i);
				break;
			}
		}
		r[1] = 5, r[0] = 5, s[1] = 0, s[0] = 0;
		for(int i = 1; i <= 10; i++) {
			if(a[i] == 1) {
				s[i & 1]++, r[i & 1]--;

			}
			else if(a[i] == 0) {
				r[i & 1]--;
			}
			else{
				if(i & 1) {
					r[i & 1]--;
				}
				else{
					s[i & 1]++, r[i & 1]--;
				}
			}
			// cout << s[1] << r[1] << s[0] << r[0] << endl;
			if(s[1] - s[0] > r[0] || s[0] - s[1] > r[1]) {
				ans = min(ans, i);
				break;
			}
		}
		cout << ans << endl;
	}
	return 0;
}
```

### D

```cpp
#include<bits/stdc++.h>
using namespace std;

typedef long long ll;

int T, n, m, ans;
string s, t;

int main() {
	cin >> T;
	while(T--) {
		int flg = 0;
		cin >> s >> t;
		int ls = s.length(), lt = t.length();
		int ps = 0, pt = 0;
		while(ps < ls && s[ps] != t[0]) ps += 2;
		// cout << ps << endl;
		for(; ps < ls && pt < lt; ) {
			while(s[ps + 1] == t[pt + 1] && ps < ls && pt < lt) ps++, pt++;
			ps += 2;
		}
		// cout << pt << endl;
		if(pt == lt) flg = 1;
		ps = 1, pt = 0;
		while(ps < ls && s[ps] != t[0]) ps += 2;
		// cout << ps << endl;
		for(; ps < ls && pt < lt; ) {
			while(s[ps + 1] == t[pt + 1] && ps < ls && pt < lt) ps++, pt++;
			ps += 2;
		}
		// cout << pt << endl;
		if(pt == lt) flg = 1;
		cout << (flg ? "YES" : "NO") << endl;
	}
	return 0;
}
```

### E

```cpp
#include<bits/stdc++.h>
using namespace std;

typedef long long ll;

const int maxn = 3e5 + 17;
int T, n, m, ans;
vector<int> v;
int a[maxn], cnt[maxn], fa[maxn];

int getf(int x) {
	return fa[x] == x ? x : (fa[x] = getf(fa[x]));
}

void merge(int x, int y) {
	int fx = getf(x), fy = getf(y);
	if(fx == fy) return;
	fa[fy] = fx;
	return;
}

int main() {
	cin >> T;
	while(T--) {
		ans = 0;
		v.clear();
		cin >> n >> m;
		for(int i = 0; i <= n; i++) cnt[i] = 0;

		for(int i = 1; i <= n; i++) cin >> a[i];
		for(int i = 1; i <= n; i++) {
			cnt[(i - a[i] + n) % n]++;
		}
		for(int k = 0; k < n; k++) if(cnt[k] >= n - 2 * m) {
			int tmp = 0;
			for(int i = 1; i <= n; i++) fa[i] = i;
			for(int i = 1; i <= n; i++) {
				int to = ((i - k + n) % n);
				if(!to)  to = n;
				// if(to == a[i]) fa[to] = 0;
				merge(a[i], to);
			}
			// for(int i = 1; i <= n; i++) cout << getf(i) << " \n"[i == n];
			for(int i = 1; i <= n; i++) {
				if(getf(i) == i) tmp++;
			}
			if(n - tmp <= m) ans++, v.push_back(k);
		}
		cout << ans;
		int len = v.size();
		cout << (len ? " " : "\n");
		for(int i = 0; i < len; i++) cout << v[i] << " \n"[i == len - 1];
	}
	return 0;
}
```
