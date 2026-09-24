"""Render English documentation diagrams as editable SVG and high-resolution PNG."""
from pathlib import Path
import os
import tempfile

os.environ.setdefault('MPLCONFIGDIR', str(Path(tempfile.gettempdir()) / 'noderel-matplotlib'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
from matplotlib.path import Path as DrawingPath

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs/assets'
OUT.mkdir(parents=True, exist_ok=True)
C = {'ink': '#15263b', 'muted': '#53667b', 'line': '#cad5e1',
     'teal': '#147d78', 'teal_bg': '#eaf6f3', 'blue': '#4369cd',
     'blue_bg': '#eef2fc', 'orange': '#a55419', 'orange_bg': '#fff3e8',
     'gray_bg': '#f5f7fa', 'white': '#ffffff'}
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 12,
                     'text.color': C['ink'], 'figure.facecolor': 'white',
                     'svg.fonttype': 'none', 'svg.hashsalt': 'noderel-diagrams-v1'})


def canvas(height, title, subtitle):
    fig = plt.figure(figsize=(12, height))
    ax = fig.add_axes([0, 0, 1, 1], xlim=(0, 12), ylim=(0, height))
    ax.set_axis_off()
    text(ax, .5, height-.55, title, size=23, weight='bold')
    text(ax, .5, height-1.02, subtitle, size=11.5, color=C['muted'])
    return fig, ax


def text(ax, x, y, value, size=12, color=None, weight='normal', ha='left', **kwargs):
    return ax.text(x, y, value, fontsize=size, color=color or C['ink'], weight=weight,
                   ha=ha, va='center', linespacing=1.5, zorder=4, **kwargs)


def panel(ax, x, y, w, h, fill='gray_bg', edge='line', dashed=False):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0.015,rounding_size=0.12',
                              facecolor=C[fill], edgecolor=C[edge], linewidth=1.2,
                              linestyle=(0, (5, 4)) if dashed else '-', zorder=1))


def card(ax, x, y, w, h, title, detail='', tone='teal', dashed=False, title_size=14):
    panel(ax, x, y, w, h, fill=tone+'_bg', edge=tone if tone != 'gray' else 'line', dashed=dashed)
    text(ax, x+w/2, y+h*(.64 if detail else .5), title, size=title_size,
         weight='bold', ha='center', color=C.get(tone, C['ink']))
    if detail:
        text(ax, x+w/2, y+h*.28, detail, size=10.8, ha='center', color=C['muted'])


def arrow(ax, points, color='muted', dashed=False, both=False):
    path = DrawingPath(points, [DrawingPath.MOVETO]+[DrawingPath.LINETO]*(len(points)-1))
    ax.add_patch(FancyArrowPatch(path=path, arrowstyle='<->' if both else '-|>',
                                mutation_scale=13, lw=1.6, color=C[color],
                                linestyle=(0, (5, 3)) if dashed else '-', zorder=2))


def label(ax, x, y, value, color='muted', size=10.5, ha='center'):
    text(ax, x, y, value, size=size, color=C[color], ha=ha,
         bbox={'boxstyle': 'round,pad=.23', 'facecolor': 'white', 'edgecolor': 'none'})


def save(fig, name):
    # Catch clipped text before exporting. Visual inspection still checks connections and spacing.
    fig.canvas.draw()
    renderer = fig.canvas.get_renderer()
    frame = fig.bbox
    for ax in fig.axes:
        for item in ax.texts:
            box = item.get_window_extent(renderer)
            if box.x0 < frame.x0 or box.x1 > frame.x1 or box.y0 < frame.y0 or box.y1 > frame.y1:
                raise ValueError(f'Text outside {name}: {item.get_text()}')
    fig.savefig(OUT / f'{name}.svg', metadata={'Date': None, 'Creator': 'NodeRel diagram renderer'})
    fig.savefig(OUT / f'{name}.png', dpi=180, metadata={'Software': 'NodeRel diagram renderer'})
    plt.close(fig)
    print(f'Rendered {name}.svg and {name}.png')


def basics():
    fig, ax = canvas(6.1, 'A graph connects things with meaning',
                     'Read this as a sentence: Keanu Reeves acted in The Matrix.')
    card(ax, .7, 3.1, 2.9, 1.2, 'Keanu Reeves', 'Person', title_size=15)
    card(ax, 8.4, 3.1, 2.9, 1.2, 'The Matrix', 'Movie', tone='blue', title_size=15)
    arrow(ax, [(3.66, 3.7), (8.34, 3.7)], color='teal')
    label(ax, 6.0, 4.12, 'ACTED_IN', color='teal', size=14)
    label(ax, 6.0, 3.27, 'roles: ["Neo"]', color='orange', size=12)
    card(ax, .55, 1.12, 3.45, 1.1, 'NODE', 'A thing: Keanu Reeves', title_size=12.5)
    card(ax, 4.275, 1.12, 3.45, 1.1, 'RELATIONSHIP', 'A connection: acted in', title_size=12.5)
    card(ax, 8.0, 1.12, 3.45, 1.1, 'PROPERTY', 'A detail: the role Neo', tone='orange', title_size=12.5)
    text(ax, .55, .47, 'You supply the facts. NodeRel stores the connections so your application can follow them.',
         size=10.8, color=C['muted'])
    save(fig, 'graph-basics')


def architecture():
    fig, ax = canvas(6.6, 'A rebuildable graph over your data',
                     'Keep the source authoritative. Derive the graph. Describe it for your application.')
    card(ax, .5, 4.0, 2.8, 1.15, 'Source systems', 'Files, records, exports', tone='gray', dashed=True)
    card(ax, 4.4, 4.0, 3.2, 1.15, 'JSON snapshots', 'nodes[] + edges[]')
    card(ax, 8.7, 4.0, 2.8, 1.15, 'SQLite index', 'items · links · sync_meta')
    arrow(ax, [(3.32, 4.55), (4.36, 4.55)])
    label(ax, 3.86, 4.83, 'Your adapter', size=9.4)
    arrow(ax, [(7.63, 4.55), (8.66, 4.55)], color='teal')
    label(ax, 8.15, 4.83, 'rebuild()', color='teal')
    card(ax, 8.7, 1.8, 2.8, 1.15, 'Query API', 'trace · neighbors · SQL')
    card(ax, 4.4, 1.8, 3.2, 1.15, 'Schema description', 'Kinds · directions · operations')
    card(ax, .5, 1.8, 2.8, 1.15, 'Your AI application', 'Model + entity resolution', tone='gray', dashed=True)
    arrow(ax, [(10.1, 3.96), (10.1, 3.0)], color='teal', both=True)
    label(ax, 10.1, 3.48, 'Query / rows', color='teal')
    arrow(ax, [(8.68, 4.12), (7.98, 3.4), (6.0, 3.4), (6.0, 3.0)], color='teal')
    label(ax, 6.5, 3.45, 'describeNodeRel()', color='teal')
    arrow(ax, [(4.36, 2.37), (3.35, 2.37)], dashed=True)
    label(ax, 3.86, 2.66, 'Context', size=10)
    arrow(ax, [(1.9, 1.76), (1.9, 1.05), (10.1, 1.05), (10.1, 1.76)], dashed=True)
    label(ax, 6.0, 1.06, 'Application validates a structured request, then calls the API')
    text(ax, .5, .4, 'Solid: NodeRel data and APIs. Dashed: application integration. Source synchronization is manual.',
         size=10.4, color=C['muted'])
    save(fig, 'architecture')


def traversal():
    fig, ax = canvas(5.4, 'Follow dependencies toward the affected work',
                     'An inbound trace walks against the stored arrows, starting from the requirement.')
    cards = [(.55, 'User login', 'Requirement · start', 'orange'),
             (4.65, 'Build login API', 'Task · depth 1', 'teal'),
             (8.75, 'Build login screen', 'Task · depth 2', 'blue')]
    for x, title, detail, tone in cards:
        card(ax, x, 2.9, 2.7, 1.05, title, detail, tone=tone, title_size=12.5)
    arrow(ax, [(4.6, 3.43), (3.3, 3.43)])
    label(ax, 3.95, 3.8, 'IMPLEMENTS', size=10)
    arrow(ax, [(8.7, 3.43), (7.4, 3.43)])
    label(ax, 8.05, 3.8, 'DEPENDS_ON', size=10)
    arrow(ax, [(1.9, 2.85), (1.9, 2.15), (6.0, 2.15), (6.0, 2.85)], color='teal', dashed=True)
    arrow(ax, [(6.0, 2.13), (10.1, 2.13), (10.1, 2.85)], color='teal', dashed=True)
    label(ax, 3.95, 2.15, 'inbound step 1', color='teal')
    label(ax, 8.05, 2.15, 'inbound step 2', color='teal')
    panel(ax, .55, .7, 10.9, .86, fill='gray_bg')
    text(ax, .85, 1.22, "Trace options: direction = in · maxDepth = 2 · types = IMPLEMENTS, DEPENDS_ON", size=11)
    text(ax, .85, .91, 'Returns the two tasks with minimum depths 1 and 2. The starting requirement is excluded.',
         size=10.8, color=C['muted'])
    text(ax, .55, .28, 'Solid arrows = stored relationships. Dashed arrows = traversal direction. Scope: app.', size=10.4, color=C['muted'])
    save(fig, 'inbound-traversal')


def domains():
    fig, ax = canvas(8.1, 'Two domains, the same node-and-relation model',
                     'Examples from the committed snapshots. Arrows preserve the source relationship direction.')
    panel(ax, .5, 4.15, 11, 2.6, fill='gray_bg')
    text(ax, .8, 6.43, 'MOVIES', size=11, weight='bold', color=C['muted'])
    text(ax, 11.18, 6.43, '171 nodes / 253 relationships', size=10.8, ha='right', color=C['muted'])
    card(ax, .85, 5.23, 2.8, .8, 'Keanu Reeves', 'Person', title_size=12.5)
    card(ax, .85, 4.32, 2.8, .8, 'Laurence Fishburne', 'Person', title_size=12.5)
    card(ax, 8.25, 4.86, 2.8, 1.02, 'The Matrix', 'Movie', tone='blue')
    arrow(ax, [(3.7, 5.65), (8.2, 5.58)], color='teal')
    label(ax, 5.95, 5.95, 'ACTED_IN · roles: ["Neo"]', color='teal')
    arrow(ax, [(3.7, 4.74), (8.2, 5.13)], color='teal')
    label(ax, 5.95, 4.59, 'ACTED_IN · roles: ["Morpheus"]', color='teal')
    panel(ax, .5, .7, 11, 3.16, fill='gray_bg')
    text(ax, .8, 3.52, 'NORTHWIND', size=11, weight='bold', color=C['muted'])
    text(ax, 11.18, 3.52, '1,035 nodes / 3,139 relationships', size=10.8, ha='right', color=C['muted'])
    for x, title, detail in [(.8, 'Customer', 'ALFKI'), (3.65, 'Order', 'Purchase record'),
                             (6.5, 'Product', 'Ordered item'), (9.35, 'Category', 'Product group')]:
        card(ax, x, 2.27, 1.9, .83, title, detail, tone='blue', title_size=12)
    for left, typ in [(2.75, 'PURCHASED'), (5.6, 'ORDERS'), (8.45, 'PART_OF')]:
        arrow(ax, [(left, 2.68), (left+.85, 2.68)], color='blue')
        label(ax, left+.42, 2.99, typ, color='blue', size=8.9)
    card(ax, 6.5, .92, 1.9, .77, 'Supplier', 'Product source', tone='teal', title_size=12)
    arrow(ax, [(7.45, 1.72), (7.45, 2.22)], color='teal')
    label(ax, 8.12, 1.93, 'SUPPLIES', color='teal', size=9.5, ha='left')
    text(ax, 1.0, 1.33, 'Order relationships carry quantity.\nNodeRel stores edge properties as JSON.', size=10.6, color=C['muted'])
    text(ax, .5, .3, 'Movies: selected instances. Northwind: a type-level pattern; one customer may have many orders.', size=10.4, color=C['muted'])
    save(fig, 'example-graphs')


def ai_sequence():
    fig, ax = canvas(10.75, 'From a question to a validated graph query',
                     'Proposed application sequence using the implemented schema exporter and query API.')
    xs = [1.4, 4.35, 7.45, 10.45]
    headings = [('User', 'Question'), ('Application', 'Resolve + validate'), ('AI model', 'Propose + explain'), ('NodeRel', 'Describe + query')]
    for x, (title, detail) in zip(xs, headings):
        core = title == 'NodeRel'
        card(ax, x-1.13, 8.55, 2.26, .76, title, detail, tone='teal' if core else 'gray', dashed=not core, title_size=12.5)
        ax.plot([x, x], [1.55, 8.47], color=C['line'], lw=1.1, linestyle=(0, (3, 4)), zorder=0)
    def message(y, source, target, words, returned=False):
        arrow(ax, [(xs[source], y), (xs[target], y)], color='teal' if 3 in (source, target) else 'muted', dashed=returned)
        label(ax, (xs[source]+xs[target])/2, y+.17, words, size=10)
    message(8.05, 0, 1, '1  Ask a question')
    message(7.42, 1, 3, '2  describeNodeRel(file)')
    message(6.79, 3, 1, '3  Schema + operation descriptions', True)
    message(6.16, 1, 2, '4  Question + schema + resolved IDs')
    message(5.53, 2, 1, '5  Structured operation request', True)
    panel(ax, 2.55, 4.57, 3.6, .48, fill='orange_bg', edge='orange')
    text(ax, 4.35, 4.81, '6  Validate access, input, and limits', size=10, ha='center', color=C['orange'])
    message(4.17, 1, 3, '7  Execute an allowed query')
    message(3.54, 3, 1, '8  Return rows', True)
    message(2.91, 1, 2, '9  Supply results for an answer')
    message(2.28, 2, 1, '10  Answer grounded in results', True)
    message(1.65, 1, 0, '11  Present the answer', True)
    text(ax, .5, .97, 'Provided: graph queries (SQL/BFS), bounded shortest distance, and an AI-readable schema.', size=11, color=C['teal'])
    text(ax, .5, .55, 'Application work: model integration, entity resolution, access policy, request validation, and execution budgets.', size=10.4, color=C['muted'])
    save(fig, 'ai-query-sequence')


def deployment():
    fig, ax = canvas(6.7, 'Embedded queries and server queries',
                     'The measured architectures have different call boundaries and execution responsibilities.')
    panel(ax, .5, 1.05, 5.25, 4.35, fill='teal_bg', edge='teal')
    panel(ax, 6.25, 1.05, 5.25, 4.35, fill='blue_bg', edge='blue')
    text(ax, .85, 5.01, 'NODEREL / SQLITE', size=13, weight='bold', color=C['teal'])
    text(ax, 6.6, 5.01, 'NEO4J / BOLT', size=13, weight='bold', color=C['blue'])
    panel(ax, .85, 1.68, 4.55, 2.9, fill='white', edge='teal', dashed=True)
    text(ax, 1.08, 4.28, 'One Node.js process', size=11, color=C['muted'])
    card(ax, 1.35, 3.15, 3.55, .75, 'JavaScript application', 'NodeRel functions or SQL', title_size=12.5)
    card(ax, 1.35, 1.98, 3.55, .7, 'SQLite / prepared graph', 'Local file + optional CSR snapshot', title_size=12.5)
    arrow(ax, [(3.12, 3.11), (3.12, 2.72)], both=True, color='teal')
    label(ax, 4.2, 2.91, 'In-process calls', color='teal', size=9.5)
    card(ax, 6.95, 3.76, 3.85, .75, 'JavaScript application', 'Neo4j driver + Cypher', tone='blue', title_size=12.5)
    card(ax, 6.95, 1.86, 3.85, .96, 'Neo4j database server', 'Planner + graph execution', tone='blue', title_size=12.5)
    arrow(ax, [(8.88, 3.72), (8.88, 2.87)], both=True, color='blue')
    label(ax, 8.88, 3.3, 'Local Bolt transport', color='blue', size=10.5)
    text(ax, 8.88, 1.48, 'Separate server process', size=10.7, ha='center', color=C['muted'])
    text(ax, .5, .61, 'Timings include client-observed work. SQLite avoids a server round trip; Neo4j executes graph operators.', size=10.6, color=C['muted'])
    text(ax, .5, .27, 'NodeRel queries SQLite on demand or prepares an explicit in-memory CSR snapshot for repeated searches.', size=10.6, color=C['muted'])
    save(fig, 'execution-models')


def table(ax, x, y, w, h, title, rows, tone):
    panel(ax, x, y, w, h, fill='white', edge=tone)
    panel(ax, x, y+h-.66, w, .66, fill=tone+'_bg', edge=tone)
    text(ax, x+.22, y+h-.32, title, size=15, weight='bold', color=C[tone])
    for i, row in enumerate(rows):
        text(ax, x+.22, y+h-.99-i*.43, row, size=11.2)


def storage():
    fig, ax = canvas(7.7, 'Three tables behind the graph',
                     'A fixed node record, a typed directed relationship, and metadata for the latest rebuild.')
    table(ax, .55, 2.3, 3.55, 3.9, 'items', [
        'id   PRIMARY KEY', 'kind', 'scope', 'no', 'title', 'status', 'updated_at'], 'teal')
    table(ax, 7.55, 2.3, 3.9, 3.9, 'links', [
        'from_id', 'to_id', 'type', 'scope', 'attrs   JSON text'], 'blue')
    text(ax, 7.8, 2.82, 'PRIMARY KEY', size=10.2, color=C['blue'], weight='bold')
    text(ax, 7.8, 2.5, '(from_id, to_id, type)', size=10.6, color=C['blue'])
    arrow(ax, [(7.5, 5.23), (4.15, 5.23)], color='blue')
    label(ax, 5.85, 5.55, 'from_id references id', color='blue', size=10)
    arrow(ax, [(7.5, 4.8), (5.25, 4.8), (5.25, 5.05), (4.15, 5.05)], color='blue')
    label(ax, 5.85, 4.48, 'to_id references id', color='blue', size=10)
    text(ax, 5.85, 3.52, 'One node can have\nmany incoming and\noutgoing relationships.', size=10.7, ha='center', color=C['muted'])
    panel(ax, .55, .91, 10.9, 1.02, fill='orange_bg', edge='orange')
    text(ax, .84, 1.52, 'sync_meta', size=14, weight='bold', color=C['orange'])
    text(ax, 3.13, 1.52, 'key PRIMARY KEY · value', size=11)
    text(ax, 3.13, 1.16, 'Snapshot signature · rebuild timestamp · rejected edges', size=11, color=C['muted'])
    text(ax, .55, .42, 'Arrows show logical references checked by rebuild(). SQL foreign keys and triggers are not defined.', size=10.5, color=C['muted'])
    save(fig, 'storage-model')


if __name__ == '__main__':
    for render in [basics, architecture, traversal, domains, ai_sequence, deployment, storage]:
        render()
