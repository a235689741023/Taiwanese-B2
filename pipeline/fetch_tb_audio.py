import os, urllib.request, concurrent.futures as cf, sys, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data-raw", "tb-audio")
os.makedirs(OUT, exist_ok=True)
urls = [u for u in open(os.path.join(ROOT, "data-raw", "tb_urls.txt")).read().split("\n") if u]

def get(u):
    fn = os.path.join(OUT, urllib.request.unquote(u.rsplit("/", 1)[-1]))
    if os.path.exists(fn) and os.path.getsize(fn) > 0:
        return None
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=60) as r:
                data = r.read()
            open(fn, "wb").write(data)
            return None
        except Exception as e:
            err = e; time.sleep(2)
    return f"{u} {err}"

with cf.ThreadPoolExecutor(6) as ex:
    fails = [f for f in ex.map(get, urls) if f]
print("done", len(urls), "fails", len(fails)); print("\n".join(fails[:20]))
