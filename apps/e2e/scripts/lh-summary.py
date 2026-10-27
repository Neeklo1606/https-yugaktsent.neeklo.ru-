# Сводка отчётов Lighthouse: python3 apps/e2e/scripts/lh-summary.py <папка с mobile-*.json>
import json,sys,glob,os
d=sys.argv[1]
print(f"{'page':10} {'perf':>4} {'a11y':>4} {'FCP':>6} {'LCP':>6} {'TBT':>6} {'CLS':>6} {'SI':>6} {'JS KB':>6} {'IMG KB':>7} {'req':>4}")
for f in sorted(glob.glob(os.path.join(d,'mobile-*.json'))):
  r=json.load(open(f)); a=r['audits']; c=r['categories']
  items=a.get('resource-summary',{}).get('details',{}).get('items',[])
  rs={i['resourceType']:i for i in items}
  g=lambda k: a[k]['numericValue']
  print(f"{os.path.basename(f)[7:-5]:10} {round(c['performance']['score']*100):>4} {round(c['accessibility']['score']*100):>4} {g('first-contentful-paint')/1000:>5.1f}s {g('largest-contentful-paint')/1000:>5.1f}s {g('total-blocking-time'):>5.0f}ms {g('cumulative-layout-shift'):>6.3f} {g('speed-index')/1000:>5.1f}s {rs.get('script',{}).get('transferSize',0)//1024:>6} {rs.get('image',{}).get('transferSize',0)//1024:>7} {rs.get('total',{}).get('requestCount',0):>4}")
