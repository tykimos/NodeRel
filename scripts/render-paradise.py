"""Render figures and a report from the recorded Paradise Papers experiment."""
from pathlib import Path
import json
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
r = json.loads((BASE / 'results.json').read_text())
assert r['completed'] and r['balancedConcurrencyMethodology']['completed']
assert len(r['single']) == 12 and len(r['balancedConcurrency']) == 12
assert r['verification']['topology']['allEqual']
impls = ['noderel-sql', 'noderel-bfs', 'neo4j-bolt']
labels = {'noderel-sql': 'NodeRel / recursive SQL', 'noderel-bfs': 'NodeRel / BFS algorithms', 'neo4j-bolt': 'Neo4j / Cypher over Bolt'}
colors = {'noderel-sql': '#b05a17', 'noderel-bfs': '#147d78', 'neo4j-bolt': '#4369cd'}
workloads = [('reach4', 'Reachability / 4 hops'), ('reach6', 'Reachability / 6 hops'), ('reach8', 'Reachability / 8 hops'), ('shortest', 'Shortest distance / up to 10 hops')]
rows = {(x['workload'], x['implementation']): x for x in r['single']}
def distance_group(index):
    d = r['sampling']['cases'][index]['expected']['shortest']['distance']
    return 'unreachable' if d is None else 'near' if d <= 2 else 'far'

def group_times(impl, group):
    return sorted(x['ms'] for x in rows['shortest', impl]['raw'] if distance_group(x['caseIndex']) == group)

def group_median(impl, group):
    xs = group_times(impl, group)
    return xs[len(xs) // 2]

plot_workloads = workloads[:3] + [('shortest-near', 'Shortest distance / 1–2 hops'), ('shortest-far', 'Shortest distance / 5–8 hops')]
def plot_value(workload, impl):
    return group_median(impl, workload.split('-')[1]) if workload.startswith('shortest-') else rows[workload, impl]['medianMs']
date = r['startedAt'][:10]
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 11, 'text.color': '#15263b',
    'axes.labelcolor': '#42546a', 'xtick.color': '#53667b', 'ytick.color': '#15263b',
    'figure.facecolor': 'white', 'axes.facecolor': 'white', 'svg.fonttype': 'none', 'svg.hashsalt': 'noderel-paradise-v1'})

def save(fig, name):
    fig.canvas.draw()
    bounds = fig.bbox
    for text in fig.texts:
        box = text.get_window_extent(fig.canvas.get_renderer())
        assert bounds.contains(box.x0, box.y0) and bounds.contains(box.x1, box.y1), text.get_text()
    fig.savefig(OUT / (name + '.png'), dpi=160)
    fig.savefig(OUT / (name + '.svg'), metadata={'Date': None, 'Creator': 'NodeRel Paradise Papers renderer'})
    svg = OUT / (name + '.svg')
    svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines()) + '\n')
    plt.close(fig)

fig, ax = plt.subplots(figsize=(12.8, 7.6))
fig.subplots_adjust(left=.30, right=.91, top=.72, bottom=.24)
fig.text(.04, .94, 'Paradise Papers: query latency', fontsize=22, weight='bold')
fig.text(.04, .891, '163,414 nodes / 311,925 normalized relationships  •  Warm cache  •  Lower is better', fontsize=11.5, color='#53667b')
for i, (workload, label) in enumerate(plot_workloads):
    y = len(plot_workloads) - i - 1
    if i % 2 == 0: ax.axhspan(y - .47, y + .47, color='#f4f7fb', zorder=0)
    for impl, offset, marker in zip(impls, [.25, 0, -.25], ['s', 'o', 'D']):
        value = plot_value(workload, impl)
        ax.scatter(value, y + offset, color=colors[impl], marker=marker, s=55, zorder=3)
        ax.annotate(f'{value:,.3f}', (value, y + offset), xytext=(8, 0), textcoords='offset points', va='center', fontsize=10, color=colors[impl])
ax.set_xscale('log')
values = [plot_value(w, impl) for w, _ in plot_workloads for impl in impls]
ax.set_xlim(min(values) / 2, max(values) * 4)
ax.set_ylim(-.55, 4.55)
ax.set_yticks(range(5), [label for _, label in plot_workloads][::-1])
ax.tick_params(axis='y', length=0, pad=14)
ax.set_xlabel('Median milliseconds — logarithmic scale', labelpad=12)
ax.grid(axis='x', color='#dce3eb', linewidth=.8)
for side in ['top', 'right', 'left']: ax.spines[side].set_visible(False)
fig.legend(handles=[Line2D([], [], color=colors[i], marker=m, linestyle='', label=labels[i]) for i, m in zip(impls, ['s','o','D'])], loc='upper left', bbox_to_anchor=(.035, .845), frameon=False, fontsize=10.5)
fig.text(.04, .145, 'Actual NodeRel APIs: SQL baseline vs batched BFS / bidirectional BFS. No full-graph preload or answer cache.', fontsize=9.5, color='#53667b')
fig.text(.04, .108, 'Samples: 36 per reachability workload; 12 nearby / 22 farther shortest-distance observations. Unreachable pair in report.', fontsize=9.5, color='#53667b')
fig.text(.04, .071, 'Three relationship types, traversed in both directions. Identical normalized topology; see report for full-row timings.', fontsize=9.5, color='#53667b')
fig.text(.04, .034, f'Apple M3 / 24 GiB RAM  •  Neo4j Community 2025.06.2  •  Recorded {date}', fontsize=9, color='#697b8d')
save(fig, 'paradise-latency')

def concurrent(impl, clients):
    runs = [x for x in r['balancedConcurrency'] if x['implementation'] == impl and x['clients'] == clients]
    return sum(x['n'] for x in runs) * 1000 / sum(x['elapsedMs'] for x in runs), runs

fig, ax = plt.subplots(figsize=(12.8, 6.8))
fig.subplots_adjust(left=.10, right=.90, top=.72, bottom=.26)
fig.text(.04, .94, 'Paradise Papers: concurrent traversal', fontsize=22, weight='bold')
fig.text(.04, .888, '6-hop reachability  •  Same 36 requests per condition  •  Higher is better', fontsize=11.5, color='#53667b')
for impl in ['noderel-bfs', 'neo4j-bolt']:
    xs, ys, lo, hi = [], [], [], []
    for clients in [1, 8, 16]:
        value, runs = concurrent(impl, clients)
        xs.append(clients); ys.append(value)
        lo.append(value - min(x['requestsPerSecond'] for x in runs))
        hi.append(max(x['requestsPerSecond'] for x in runs) - value)
        ax.annotate(f'{value:.2f}', (clients, value), xytext=(0, 13 if impl == 'neo4j-bolt' else -20), textcoords='offset points', ha='center', fontsize=11, color=colors[impl])
    ax.errorbar(xs, ys, yerr=[lo, hi], color=colors[impl], marker='o', linewidth=2.2, capsize=5, label=labels[impl])
ax.set_yscale('log'); ax.set_xlim(-.2, 17.2); ax.set_xticks([1, 8, 16])
ax.yaxis.set_major_formatter(FuncFormatter(lambda x, pos: f'{x:g}'))
ax.set_xlabel('Concurrent clients', labelpad=12); ax.set_ylabel('Completed requests / second — log scale', labelpad=12)
ax.margins(y=.24); ax.grid(axis='y', which='major', color='#dce3eb')
for side in ['top','right']: ax.spines[side].set_visible(False)
fig.legend(loc='upper left', bbox_to_anchor=(.035, .83), frameon=False, ncol=2)
fig.text(.04, .145, 'Points pool two runs; whiskers show their range, not a confidence interval. Engine order is reversed in run 2.', fontsize=9.5, color='#53667b')
fig.text(.04, .108, 'Each run contains exactly 12 low-, 12 medium-, and 12 high-degree-source requests. Includes final drain.', fontsize=9.5, color='#53667b')
fig.text(.04, .071, 'NodeRel: one reader per worker. Neo4j: one Bolt session per client. Finite batches do not establish sustained capacity.', fontsize=9.5, color='#53667b')
fig.text(.04, .034, f'Source: benchmarks/paradise-papers/results.json  •  Recorded {date}', fontsize=9, color='#697b8d')
save(fig, 'paradise-concurrency')

def med(w, impl): return rows[w, impl]['medianMs']
lines = [
    '# Paradise Papers: NodeRel algorithms and Neo4j', '',
    f"Recorded {date}. Apple M3, 24 GiB RAM, both engines on the same computer. [Reproduction](README.md) · [Raw measurements](results.json) · [Cases](cases.json) · [Source provenance](sources.json).", '',
    '## Findings', '',
    f"Neo4j was **{med('reach4','noderel-bfs')/med('reach4','neo4j-bolt'):.1f}× / {med('reach6','noderel-bfs')/med('reach6','neo4j-bolt'):.1f}× / {med('reach8','noderel-bfs')/med('reach8','neo4j-bolt'):.1f}× faster** in median client latency for 4/6/8-hop scalar reachability than the optimized NodeRel BFS API. This dataset exposes broad, hub-connected neighborhoods. This is a workload-specific result, not a universal database ranking.", '',
    f"Shortest distance depends on the endpoints: for the six nearby pairs (1–2 hops), NodeRel bidirectional BFS measured **{group_median('noderel-bfs','near'):.3f} ms** versus **{group_median('neo4j-bolt','near'):.3f} ms** for Neo4j. For the eleven farther pairs (5–8 hops), the respective medians were **{group_median('noderel-bfs','far'):.3f} ms** and **{group_median('neo4j-bolt','far'):.3f} ms**, favoring Neo4j. One pair had no connection within ten hops. The large SQL/BFS gap is primarily an algorithm comparison.", '',
    'The optimized algorithms are now optional public NodeRel APIs, not a benchmark-only replacement. They read SQLite adjacency on demand, maintain request-local visited maps, and do not preload the graph or cache answers. The previous synthetic experiment remains separately published.', '',
    '## Data and equal work', '',
    'The pinned official Neo4j example contains **163,414 nodes and 364,456 relationships**. Both measured stores use the same normalized projection: **163,414 nodes and 311,925 relationships**, after collapsing **52,531 duplicate `(from, to, type)` tuples**. No self-loops were found. This preserves reached-node sets and minimum hop counts for distinct endpoints; it does not preserve multigraph multiplicity or every property variant.', '',
    'The queries use the official guide\'s `OFFICER_OF`, `INTERMEDIARY_OF`, and `REGISTERED_ADDRESS` types in both directions: **300,963** normalized relationships. Original kinds and display values are equal in both databases. Neo4j has a common `Paradise` label and a unique ID constraint; neither engine receives a precomputed reachability index. Additional source properties are not part of these queries.', '',
    'There are 59,102 degree-one nodes, 77,042 nodes of degree 2–4, and 24,859 nodes of degree at least 5; 2,411 isolated nodes are excluded from source sampling. Degree counts distinct neighbors over the selected types. Six sources per group are selected using a fixed seed before measuring. This gives each group equal representation, not the weight it has in the full population. Near, far, and random targets are predefined in `cases.json`.', '',
    'ICIJ records do not imply wrongdoing. No identity resolution or allegations about individuals are made by this benchmark.', '',
    '## Single-request latency', '',
    '![Median latency for NodeRel SQL, optimized NodeRel BFS, and Neo4j on Paradise Papers.](../../docs/assets/paradise-latency.png)', '',
    '[View SVG](../../docs/assets/paradise-latency.svg)', '',
    'Median milliseconds; lower is better. Each cell contains 36 observations: two rounds across the same 18 cases. The recorder uses the upper middle observation for even-sized samples; all tables and figures use that same convention.', '',
    '| Workload | NodeRel SQL | NodeRel BFS algorithms | Neo4j Bolt |', '|---|---:|---:|---:|',
]
for w, label in workloads: lines.append('| ' + label + ' | ' + ' | '.join(f'{med(w,i):,.3f}' for i in impls) + ' |')
lines += ['', 'Reachability returns **only the number of distinct reached nodes and the sum of their minimum depths**, excluding the source. It does not send all nodes over Bolt or enumerate paths. Shortest distance returns one bounded distance or null. The SQL and BFS measurements call `traceStats()` and `shortestDistance()` directly.', '',
    '### Shortest distance by actual connection length', '',
    'The mixed-target median above depends on the case mixture and hides an important difference. These groups are based on independently verified distance, not measured speed. All pairs remain in the raw data and overall table.', '',
    '| Pair group | Observations | NodeRel SQL ms | NodeRel BFS ms | Neo4j ms |', '|---|---:|---:|---:|---:|']
for group, label in [('near','1–2 hops'),('far','5–8 hops'),('unreachable','No connection within 10 hops')]:
    lines.append(f"| {label} | {len(group_times('noderel-bfs',group))} | "+' | '.join(f'{group_median(impl,group):,.3f}' for impl in impls)+' |')
lines += ['', 'The unreachable group contains only one pair repeated twice and cannot establish general no-path performance. The chart emphasizes the two connected groups rather than combining their different workloads.', '',
    '### Source-degree groups', '', '| Workload | Source group | NodeRel SQL ms | NodeRel BFS ms | Neo4j ms |', '|---|---|---:|---:|---:|']
for w, label in workloads:
    for group in ['low','medium','high']:
        lines.append('| '+label+' | '+group+' | '+' | '.join(f"{rows[w,i]['byStratum'][group]['medianMs']:,.3f}" for i in impls)+' |')
lines += ['', 'Each degree-group cell contains 12 observations. A low-degree start can reach a large hub a few steps later; starting degree alone is not the amount of traversal work.', '',
    '### Full node records and result transfer', '',
    'The following separate measurements return identical sorted `id`, `title`, `kind`, and `depth` records for six-hop traversal. They include materializing those records and, for Neo4j, transferring them over Bolt. Each cell is the arithmetic mean of two observations; these are supplementary timings, not stable tail estimates.', '',
    '| Case / source degree | Returned rows | NodeRel SQL ms | NodeRel BFS ms | Neo4j ms |', '|---|---:|---:|---:|---:|']
for index in [0,6,12]:
    subset=[x for x in r['fullRows'] if x['caseIndex']==index]
    case=r['sampling']['cases'][index]
    lines.append(f"| {index} / {case['degree']} | {subset[0]['rows']:,} | "+' | '.join(f"{statistics.mean(x['ms'] for x in subset if x['implementation']==impl):,.3f}" for impl in impls)+' |')
lines += ['', '## Concurrent six-hop traversal', '',
    '![Throughput for the same finite request batches at one, eight and sixteen concurrent clients.](../../docs/assets/paradise-concurrency.png)', '', '[View SVG](../../docs/assets/paradise-concurrency.svg)', '',
    'Each engine processes the **same 36 requests per condition**, including exactly two copies of every case. Two rounds reverse engine order. The table pools completed work and elapsed time across both rounds; ranges show the two observed throughputs, not confidence intervals.', '',
    '| Clients | NodeRel BFS requests/s (range) | Neo4j requests/s (range) | Neo4j / NodeRel |', '|---:|---:|---:|---:|']
for clients in [1,8,16]:
    a, aa=concurrent('noderel-bfs',clients);b, bb=concurrent('neo4j-bolt',clients)
    text=lambda value, runs:f"{value:.2f} ({min(x['requestsPerSecond'] for x in runs):.2f}–{max(x['requestsPerSecond'] for x in runs):.2f})"
    lines.append(f'| {clients} | {text(a,aa)} | {text(b,bb)} | {b/a:.1f}× |')
lines += ['', 'This is finite-batch throughput. Short Neo4j batches, worker contention, desktop load, and run order affect results; this does not establish sustained service capacity. NodeRel uses independent workers and read connections, so it is not artificially restricted to one synchronous client.', '',
    'An earlier ten-second-window experiment is retained under `concurrency` in the raw JSON. A faster engine completes more of the cyclic case sequence, potentially changing the proportion of low/medium/high cases. The chart and headline table therefore use the subsequent `balancedConcurrency` runs with equal case counts.', '',
    '## Why the workloads differ', '',
    'NodeRel SQL builds a recursive node/depth relation, can revisit a node at different depths, and aggregates to minimum depth. For undirected traversal its query also constructs a scope/type-filtered edge relation. NodeRel BFS visits each node once, fetches neighbors through SQLite indexes in batches of 256 frontier IDs, and reuses prepared statements. Its scope checks and repeated SQLite-to-JavaScript row conversions remain part of the measured implementation.', '',
    'NodeRel shortest-distance BFS expands the smaller frontier from the two endpoints, finishes a layer, and stops when the searches meet. It can avoid most of the graph for nearby targets. Neither BFS algorithm needs a full graph preload.', '',
    'Recorded Neo4j plans include `NodeUniqueIndexSeek`, `VarLengthExpand(Pruning,BFS,All)` for reachability, and `ShortestPath` for bounded shortest distance. Neo4j performs the graph traversal in its engine and returns a small aggregate for the primary workloads. This is an observed plan difference; the experiment does not isolate a causal speed contribution for each operator.', '',
    '### Cypher used for six-hop reachability', '', '```cypher',
    'MATCH p=(s:Paradise {id: $id})-[:OFFICER_OF|INTERMEDIARY_OF|REGISTERED_ADDRESS*1..6]-(n)',
    'WITH s, n, min(length(p)) AS depth', 'WHERE n <> s', 'RETURN count(n) AS count, coalesce(sum(depth), 0) AS depthSum', '```', '',
    '### Equivalent optimized NodeRel call', '', '```js',
    "graph.traceStats({", "  id, scope: 'paradise', direction: 'both', maxDepth: 6,",
    "  types: ['OFFICER_OF', 'INTERMEDIARY_OF', 'REGISTERED_ADDRESS'],", "  algorithm: 'bfs'", '});', '```', '',
    '## Correctness and practical limits', '',
    f"All **{r['verification']['topology']['nodes']:,} node records** and **{r['verification']['topology']['edges']:,} normalized edge identities** matched across the source projection, NodeRel, and Neo4j. All measured aggregates were checked against an independent in-memory BFS. There were **{r['verification']['aggregateChecks']:,} aggregate checks**, including warmups and concurrency. Full result sets were independently checked for three sources, and hashes were checked again for every full-row timing.", '',
    'Core tests additionally cover 4,500 shortest-distance combinations against SQL and an independent reference, both directions, typed edges, cycles, batching, scope isolation, Unicode ordering, caller-owned transactions, and rebuild freshness. These checks support the tested contracts, not arbitrary graph workloads.', '',
    f"Environment: Node {r['environment']['node']}, SQLite {r['environment']['sqlite']}, Neo4j Community {r['environment']['neo4j']['versions'][0]}, driver {r['environment']['driver']}, {r['environment']['cpu']}, {r['environment']['logicalCpus']} logical CPUs. Neo4j heap/page cache: 1 GiB each. SQLite page cache: up to 64 MiB per connection. SQLite file: {r['environment']['sqliteBytes']/2**20:.1f} MiB. Memory budgets are not equal, especially across multiple workers.", '',
    'Import, server startup, correctness-reference preparation, and profiling are excluded. Warmup counts and every measured observation are recorded. Single-request order rotates; concurrent engine order is reversed in the second round. The schema/default SQL algorithm remains available. No GDS plugin, concurrent writes, cold-cache test, long-running service load, weighted paths, or complete-path enumeration is included.', '',
    'p95 values in the JSON describe these small, heterogeneous samples, not production service-level guarantees. Performance on another graph, query projection, hardware configuration, or Neo4j version may differ.', '',
]
(BASE/'REPORT.md').write_text('\n'.join(lines))
print('Rendered Paradise Papers charts and report from recorded results.')
