"""Render the prepared-projection report and charts from recorded observations."""
from pathlib import Path
import json
import math
import os
import statistics
import tempfile

os.environ.setdefault('MPLCONFIGDIR', str(Path(tempfile.gettempdir()) / 'noderel-matplotlib'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.ticker import FuncFormatter

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / 'benchmarks/paradise-papers'
OUT = ROOT / 'docs/assets'
r = json.loads((BASE / 'optimization-results.json').read_text())
previous = json.loads((BASE / 'results.json').read_text())
assert r['completed'] and len(r['single']) == 15 and len(r['concurrency']) == 12
rows = {(x['workload'], x['implementation']): x for x in r['single']}
impls = ['noderel-bfs', 'csr-adaptive', 'neo4j-bolt']
labels = ['NodeRel / on-demand BFS', 'NodeRel / prepared CSR', 'Neo4j / Cypher over Bolt']
colors = ['#b05a17', '#147d78', '#4369cd']
workloads = [('reach4', 'Reachability / 4 hops'), ('reach6', 'Reachability / 6 hops'), ('reach8', 'Reachability / 8 hops'), ('near', 'Shortest distance / 1–2 hops'), ('far', 'Shortest distance / 5–8 hops')]
def group(index):
    distance = previous['sampling']['cases'][index]['expected']['shortest']['distance']
    return 'unreachable' if distance is None else 'near' if distance <= 2 else 'far'
def times(w, impl):
    return [x['ms'] for x in rows['shortest' if w in ['near', 'far', 'unreachable'] else w, impl]['raw'] if w not in ['near', 'far', 'unreachable'] or group(x['caseIndex']) == w]
def median(xs):
    xs = sorted(xs)
    return xs[len(xs) // 2]
def med(w, impl): return median(times(w, impl))
build = median([x['buildMs'] for x in r['builds']])
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 11, 'text.color': '#15263b', 'axes.labelcolor': '#42546a', 'xtick.color': '#53667b', 'ytick.color': '#15263b', 'figure.facecolor': 'white', 'axes.facecolor': 'white', 'svg.fonttype': 'none', 'svg.hashsalt': 'noderel-csr-v1'})
def save(fig, name):
    fig.canvas.draw()
    for text in fig.texts:
        box = text.get_window_extent(fig.canvas.get_renderer())
        assert fig.bbox.contains(box.x0, box.y0) and fig.bbox.contains(box.x1, box.y1), text.get_text()
    fig.savefig(OUT / (name + '.png'), dpi=160)
    path = OUT / (name + '.svg')
    fig.savefig(path, metadata={'Date': None, 'Creator': 'NodeRel CSR renderer'})
    path.write_text('\n'.join(line.rstrip() for line in path.read_text().splitlines()) + '\n')
    plt.close(fig)

fig, ax = plt.subplots(figsize=(12.8, 7.6))
fig.subplots_adjust(left=.30, right=.91, top=.72, bottom=.24)
fig.text(.04, .94, 'Prepared NodeRel: query latency', fontsize=22, weight='bold')
fig.text(.04, .891, 'Same Paradise Papers cases  •  Prepared CSR vs live database queries  •  Lower is better', fontsize=11.5, color='#53667b')
for i, (w, label) in enumerate(workloads):
    y = 4 - i
    if i % 2 == 0: ax.axhspan(y - .47, y + .47, color='#f4f7fb', zorder=0)
    for impl, color, offset, marker in zip(impls, colors, [.25, 0, -.25], ['s', 'o', 'D']):
        value = med(w, impl)
        ax.scatter(value, y + offset, color=color, marker=marker, s=55, zorder=3)
        ax.annotate(f'{value:,.3f}', (value, y + offset), xytext=(8, 0), textcoords='offset points', va='center', fontsize=10, color=color)
ax.set_xscale('log'); ax.set_xlim(min(med(w,i) for w,_ in workloads for i in impls)/2, max(med(w,i) for w,_ in workloads for i in impls)*4)
ax.set_ylim(-.55,4.55); ax.set_yticks(range(5), [label for _,label in workloads][::-1]); ax.tick_params(axis='y', length=0, pad=14)
ax.set_xlabel('Median milliseconds — logarithmic scale', labelpad=12); ax.grid(axis='x', color='#dce3eb')
for side in ['top','right','left']: ax.spines[side].set_visible(False)
fig.legend(handles=[Line2D([],[],color=c,marker=m,linestyle='',label=l) for c,m,l in zip(colors,['s','o','D'],labels)], loc='upper left',bbox_to_anchor=(.035,.845),frameon=False,fontsize=10.5)
fig.text(.04,.145,f'CSR query times exclude its {build:.1f} ms median build. Fixed in-memory snapshot; no answer cache; refresh is explicit.',fontsize=9.5,color='#53667b')
fig.text(.04,.108,'36 observations per reachability workload; 12 nearby / 22 farther distance observations. Same normalized graph.',fontsize=9.5,color='#53667b')
fig.text(.04,.071,'Memory and preparation costs are reported separately. Neo4j uses Cypher over local Bolt; GDS is not measured.',fontsize=9.5,color='#53667b')
fig.text(.04,.034,f'Apple M3 / 24 GiB RAM  •  Node {r["environment"]["node"]}  •  Neo4j Community 2025.06.2  •  {r["startedAt"][:10]}',fontsize=9,color='#697b8d')
save(fig,'projection-latency')

def concurrent(impl, clients):
    runs = [x for x in r['concurrency'] if x['implementation']==impl and x['clients']==clients]
    return sum(x['n'] for x in runs)*1000/sum(x['elapsedMs'] for x in runs),runs
fig,ax=plt.subplots(figsize=(12.8,6.8))
fig.subplots_adjust(left=.11,right=.91,top=.72,bottom=.26)
fig.text(.04,.94,'Prepared NodeRel: concurrent traversal',fontsize=22,weight='bold')
fig.text(.04,.888,'6-hop reachability  •  Same 360 requests per condition  •  Higher is better',fontsize=11.5,color='#53667b')
for impl,color,label in zip(impls[1:],colors[1:],labels[1:]):
    values=[];low=[];high=[]
    for clients in [1,8,16]:
        value,runs=concurrent(impl,clients); values.append(value)
        low.append(value-min(x['requestsPerSecond'] for x in runs)); high.append(max(x['requestsPerSecond'] for x in runs)-value)
        ax.annotate(f'{value:,.1f}',(clients,value),xytext=(0,14 if impl=='csr-adaptive' else -22),textcoords='offset points',ha='center',color=color)
    ax.errorbar([1,8,16],values,yerr=[low,high],color=color,marker='o',linewidth=2.2,capsize=5,label=label)
ax.set_yscale('log'); ax.set_xlim(-.2,17.2); ax.set_xticks([1,8,16]); ax.yaxis.set_major_formatter(FuncFormatter(lambda x,pos:f'{x:g}'))
ax.set_xlabel('Concurrent clients',labelpad=12); ax.set_ylabel('Completed requests / second — log scale',labelpad=12)
ax.margins(y=.28); ax.grid(axis='y',color='#dce3eb')
for side in ['top','right']:ax.spines[side].set_visible(False)
fig.legend(loc='upper left',bbox_to_anchor=(.035,.83),frameon=False,ncol=2)
fig.text(.04,.145,'Two runs in reversed engine order; points pool work/time, whiskers show observed range. Includes final drain.',fontsize=9.5,color='#53667b')
fig.text(.04,.108,'CSR: one private prepared projection per worker. Projection construction and warmup are excluded from throughput.',fontsize=9.5,color='#53667b')
fig.text(.04,.071,'Both engines process each of the 18 cases exactly 20 times per run. Finite batches do not establish sustained capacity.',fontsize=9.5,color='#53667b')
fig.text(.04,.034,'Source: benchmarks/paradise-papers/optimization-results.json  •  Cypher/Bolt comparison, not a Neo4j GDS benchmark.',fontsize=9,color='#697b8d')
save(fig,'projection-concurrency')

lines=[
 '# Prepared CSR optimization on Paradise Papers','',
 f'Recorded {r["startedAt"][:10]}. [Raw results](optimization-results.json) · [Reproduction](README.md#run-the-prepared-projection-follow-up) · [Earlier on-demand experiment](REPORT.md).','',
 '## Result and boundary','',
 f"On the same 18 Paradise Papers cases, prepared NodeRel CSR reduced 4/6/8-hop median query latency by **{med('reach4','noderel-bfs')/med('reach4','csr-adaptive'):.0f}× / {med('reach6','noderel-bfs')/med('reach6','csr-adaptive'):.0f}× / {med('reach8','noderel-bfs')/med('reach8','csr-adaptive'):.0f}×** against freshly measured on-demand NodeRel BFS. These gains include a change of representation and execution boundary: adjacency is compiled into memory before querying.",'',
 f'Projection construction took **{min(x["buildMs"] for x in r["builds"]):.1f}–{max(x["buildMs"] for x in r["builds"]):.1f} ms** in three fresh processes (median **{build:.1f} ms**, warm OS caches). The latency chart excludes that cost. This is a reusable fixed snapshot, not a faster live SQLite query or a cached answer. Writes require creating a replacement projection.','',
 'Neo4j was remeasured with the same Cypher/Bolt queries and graph as the first experiment. This is not an equal-memory, engine-only comparison and does not measure Neo4j GDS. Neo4j also offers [in-memory graph projections through GDS](https://neo4j.com/docs/graph-data-science/current/management-ops/graph-creation/graph-project/); its projected algorithms could change the comparison.','',
 '## Query latency','',
 '![Prepared CSR, on-demand BFS, and Neo4j query latency. Build costs are excluded and reported separately.](../../docs/assets/projection-latency.png)','',
 '[View SVG](../../docs/assets/projection-latency.svg)','',
 'Median milliseconds, lower is better. Medians use the upper middle observation for even sample counts, matching the recorder. Each reachability cell has 36 observations; nearby/farther shortest-distance groups have 12/22.','',
 '| Workload | On-demand NodeRel BFS | Prepared CSR | Neo4j Bolt | BFS / CSR |','|---|---:|---:|---:|---:|',
]
for w,label in workloads:lines.append(f'| {label} | {med(w,impls[0]):,.3f} | {med(w,impls[1]):,.3f} | {med(w,impls[2]):,.3f} | {med(w,impls[0])/med(w,impls[1]):.1f}× |')
lines+=['','One pair has no connection within ten hops; its two observations remain in the raw data. Nearby and farther groups are defined by independently verified distance, not timing. Reachability returns distinct reached-node count and sum of minimum depths, excluding the source; shortest distance returns a hop count or null.','',
 '### What contributes to the gain?','',
 'CSR replaces repeated SQLite adjacency reads, string hashing, node-scope joins, and row conversion during traversal with dense integer indices and contiguous typed arrays. Epoch stamps and reusable queues reduce per-query initialization/allocation. Bidirectional shortest distance expands the side with fewer incident edges instead of fewer nodes. These changes are measured as a package; their individual causal contributions are not isolated.','',
 'The ablation below keeps the CSR representation and workspace identical, then compares ordinary top-down BFS with the adaptive traversal. Most of the gain comes before the adaptive step. The latter can switch to checking unvisited nodes for a predecessor in the current frontier, using a conservative work estimate; it is not guaranteed to win on every graph.','',
 '| Reachability | CSR top-down BFS ms | CSR adaptive ms | Top-down / adaptive |','|---|---:|---:|---:|']
for w,label in workloads[:3]:lines.append(f'| {label} | {med(w,"csr-bfs"):.3f} | {med(w,"csr-adaptive"):.3f} | {med(w,"csr-bfs")/med(w,"csr-adaptive"):.2f}× |')
lines+=['','See [algorithm design](../../docs/design.md#prepared-csr-projection) and [the direction-optimizing BFS paper](https://people.eecs.berkeley.edu/~krste/papers/beamer-sc2012.pdf). This synchronous implementation uses its own switching estimate, not the paper\'s parallel code or speedup claims.','',
 '## Preparation, memory, and amortization','',
 'The original normalized store has 163,414 nodes and 311,925 relationships. The projection retains all nodes in the scope and the **300,963 relationships** of the three queried types. Neo4j/on-demand BFS filter those same types during querying. Both directions are supported. Source topology and current store hashes match the first experiment.','',
 '| Fresh process | Build ms | First six-hop query ms | Retained JS heap growth MiB | Retained array-buffer growth MiB | Process RSS after GC MiB |','|---:|---:|---:|---:|---:|---:|']
for i,b in enumerate(r['builds'],1):lines.append(f'| {i} | {b["buildMs"]:.3f} | {b["firstQueryMs"]:.3f} | {(b["retained"]["heapUsed"]-b["before"]["heapUsed"])/2**20:.2f} | {(b["retained"]["arrayBuffers"]-b["before"]["arrayBuffers"])/2**20:.2f} | {b["retained"]["rss"]/2**20:.2f} |')
info=r['builds'][0]['info']
lines+=['',f'Exact retained typed-array capacity is **{info["adjacencyBytes"]/2**20:.2f} MiB adjacency + {info["workspaceBytes"]/2**20:.2f} MiB workspace**. This is not total projection memory: node records, strings, and the ID map live on the JS heap. RSS additionally includes SQLite page caches, runtime pages, and allocator overhead; it is a whole-process observation, not bytes owned only by the projection. Peak RSS and pre/post-build snapshots are preserved in raw results.','',
 'Fresh process does not mean cold storage: no OS cache flush was performed. The first query is measured before traversal warmup and returns case 0; later ready-query timings use all cases. The source signature is metadata from the last SQLite rebuild, not an automatic invalidation mechanism for raw writes.','',
 'The following rough amortization estimates divide median build time by the **mean per-query saving** over the measured case mixture. They assume repeated queries on the same projection and round up to whole queries. They are not latency guarantees for a particular starting node.','',
 '| Workload | Queries to amortize build versus on-demand BFS |','|---|---:|']
for w,label in workloads:
    saving=statistics.mean(times(w,'noderel-bfs'))-statistics.mean(times(w,'csr-adaptive'))
    lines.append(f'| {label} | {math.ceil(build/saving) if saving>0 else "No saving"} |')
lines+=['','## Full records and result transfer','',
 'Separate six-hop runs return the same sorted `id`, `title`, `kind`, and `depth` records. Values below are arithmetic means of two observations, including row materialization and Neo4j Bolt result transfer. They do not establish tail latency.','',
 '| Case | Returned rows | On-demand BFS ms | Prepared CSR ms | Neo4j ms |','|---:|---:|---:|---:|---:|']
for i in [0,6,12]:
    subset=[x for x in r['fullRows'] if x['caseIndex']==i]
    lines.append(f'| {i} | {subset[0]["rows"]:,} | '+' | '.join(f'{statistics.mean(x["ms"] for x in subset if x["implementation"]==impl):,.3f}' for impl in impls)+' |')
lines+=['','## Concurrent six-hop traversal','',
 '![Prepared CSR and Neo4j throughput at one, eight and sixteen clients.](../../docs/assets/projection-concurrency.png)','',
 '[View SVG](../../docs/assets/projection-concurrency.svg)','',
 'Exactly 360 requests per condition, 20 per case, in two runs reversing engine order. Throughput pools completed work over elapsed time; ranges show the two runs, not confidence intervals. Each CSR worker owns a private projection and closes its SQLite connection after building it.','',
 '| Clients | CSR requests/s (range) | Neo4j requests/s (range) | CSR / Neo4j |','|---:|---:|---:|---:|']
for clients in [1,8,16]:
    a,aa=concurrent('csr-adaptive',clients);b,bb=concurrent('neo4j-bolt',clients)
    fmt=lambda v,x:f'{v:,.1f} ({min(y["requestsPerSecond"] for y in x):,.1f}–{max(y["requestsPerSecond"] for y in x):,.1f})'
    lines.append(f'| {clients} | {fmt(a,aa)} | {fmt(b,bb)} | {a/b:.1f}× |')
lines+=['','Worker creation, projection construction, and warmup are excluded from throughput; per-condition setup time and each worker\'s build time are retained in the raw file. Private projections multiply memory use with client count. Worker message overhead and draining the last requests are included. This finite-batch test does not establish sustained production capacity, and these 360-request rates should not be directly combined with the earlier 36-request experiment.','',
 '## Usage','', '```js',
 "const projected = graph.project({", "  scope: 'paradise',", "  types: ['OFFICER_OF', 'INTERMEDIARY_OF', 'REGISTERED_ADDRESS']", '});', 'try {', "  const summary = projected.traceStats({ id: sourceId, direction: 'both', maxDepth: 6 });", "  const distance = projected.shortestDistance({ id: sourceId, targetId, direction: 'both', maxDepth: 10 });", '  console.log(summary, distance, projected.info);', '} finally {', '  projected.close();', '}', '```','',
 'Scope/types belong to projection creation. Query methods reject those options rather than silently applying a different scope. A projection is immutable data plus reusable private query workspace. It remains valid as its original snapshot after SQLite changes or closes; explicitly create a replacement when fresh data is required.','',
 '## Verification and limits','',
 f'All original node records and normalized edge identities matched between the two current stores and the independently verified earlier hashes. There were **{r["verification"]["aggregateChecks"]:,} aggregate checks**, including warmups/concurrency. Full-row outputs for three cases matched independent result hashes for every implementation and again during timed full-row calls. Core tests add 3,750 projection/BFS comparisons on a different seeded directed graph, plus Unicode ordering, malformed endpoints, missing scopes, rebuilds, multiple connections, ownership and closed-projection behavior. Existing SQL/BFS/reference tests remain in place.','',
 f'Environment: {r["environment"]["cpu"]}, {r["environment"]["logicalCpus"]} logical CPUs, 24 GiB RAM, Node {r["environment"]["node"]}, SQLite {r["environment"]["sqlite"]}, Neo4j Community {r["environment"]["neo4j"]["versions"][0]}. Neo4j heap/page cache are 1 GiB each; SQLite allows 64 MiB per open connection. Memory budgets are not equalized.','',
 'The same fixed 18 performance cases were used during development; there is no held-out performance claim. Timings are warm-cache desktop samples. There are no concurrent writes, cold-cache measurements, weighted paths, complete path enumeration, GDS comparison, or production latency guarantees. The main gain is applicable to repeated queries on a graph that fits in memory and can be queried as an explicit snapshot.','',
]
(BASE/'OPTIMIZATION.md').write_text('\n'.join(lines))
print('Rendered prepared-projection charts and report.')
