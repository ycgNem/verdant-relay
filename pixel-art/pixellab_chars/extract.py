"""extract.py <zip> <outdir> : safely extract only .png/.json entries (no absolute paths / '..')."""
import sys, zipfile, os
z = zipfile.ZipFile(sys.argv[1]); out = os.path.abspath(sys.argv[2])
for n in z.namelist():
    if n.endswith("/") or not n.lower().endswith((".png", ".json")): continue
    p = os.path.abspath(os.path.join(out, n))
    if not p.startswith(out + os.sep) or ".." in n.split("/"): print("skip", n); continue
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as f: f.write(z.read(n))
print("ok", out)
