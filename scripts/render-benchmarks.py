"""Render the published benchmark JSON; never recompute benchmark measurements."""
from pathlib import Path
import json
import os
import tempfile
os.environ.setdefault('MPLCONFIGDIR', str(Path(tempfile.gettempdir()) / 'noderel-matplotlib'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.ticker import FixedLocator, FuncFormatter

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'benchmarks/neo4j-strengths/results.json'
OUT = ROOT / 'docs/assets'
OUT.mkdir(parents=True, exist_ok=True)
r = json.loads(SOURCE.read_text())
assert r['completed'] and r['dataset']['nodes'] == 50000 and r['dataset']['edges'] == 300000
recorded_date = r['generatedAt'][:10]
environment = r['environment']
hardware = f"{environment['cpu']} / {environment['memoryBytes'] / 2**30:g} GiB RAM"
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':11,'text.color':'#15263b',
 'axes.labelcolor':'#42546a','xtick.color':'#53667b','ytick.color':'#15263b',
 'axes.edgecolor':'#dce3eb','figure.facecolor':'white','axes.facecolor':'white',
 'svg.fonttype':'none','svg.hashsalt':'noderel-benchmarks-v1'})
colors = {'sqlite-cte':'#b05a17','sqlite-optimized':'#147d78','neo4j-bolt':'#4369cd'}
labels = {'sqlite-cte':'SQLite recursive SQL (adapted CTE)',
 'sqlite-optimized':'SQLite + custom BFS*','neo4j-bolt':'Neo4j over Bolt'}

def save(fig,name):
 fig.savefig(OUT / (name+'.svg'), metadata={'Date':None,'Creator':'NodeRel benchmark renderer'})
 fig.savefig(OUT / (name+'.png'), dpi=160, metadata={'Software':'NodeRel benchmark renderer'})
 plt.close(fig)

workloads = [('point','Single node lookup'),('shortest','Shortest distance'),
 ('filtered','Shortest distance\navoiding inactive nodes'),('reach3','Reachability, 3 hops'),('reach6','Reachability, 6 hops')]
values = {(x['workload'],x['implementation']):x['medianMs'] for x in r['single']}
fig,ax=plt.subplots(figsize=(12,7.1))
fig.subplots_adjust(left=.255,right=.90,bottom=.23,top=.72)
fig.text(.045,.94,'Query latency',fontsize=22,weight='bold')
fig.text(.045,.891,'50,000 nodes / 300,000 directed edges  •  Warm cache  •  Lower is better',fontsize=11.5,color='#53667b')
for i,(key,label) in enumerate(workloads):
 y=len(workloads)-1-i
 if i%2==0:ax.axhspan(y-.47,y+.47,color='#f4f7fb',zorder=0)
 for impl,offset,marker in [('sqlite-cte',.24,'s'),('sqlite-optimized',0,'o'),('neo4j-bolt',-.24,'D')]:
  if (key,impl) not in values:continue
  value=values[key,impl]
  ax.scatter(value,y+offset,c=colors[impl],marker=marker,s=54,zorder=3)
  text=f'{value:,.3f}'
  ax.annotate(text,(value,y+offset),xytext=(8,0),textcoords='offset points',va='center',fontsize=10,color=colors[impl])
ax.set_xscale('log');ax.set_xlim(.0025,7000);ax.set_ylim(-.6,4.6)
ax.set_yticks(range(5),[label for _,label in workloads][::-1]);ax.tick_params(axis='y',length=0,pad=15)
ax.xaxis.set_major_locator(FixedLocator([.01,.1,1,10,100,1000]))
ax.xaxis.set_major_formatter(FuncFormatter(lambda x,pos:f'{x:g}'))
ax.set_xlabel('Median milliseconds — logarithmic scale',labelpad=12)
ax.grid(axis='x',which='major',color='#dce3eb',lw=.8,zorder=0)
ax.tick_params(axis='x',which='minor',bottom=False)
for side in ['top','right','left']:ax.spines[side].set_visible(False)
handles=[Line2D([],[],color=colors[i],marker=m,linestyle='',markersize=7,label=labels[i])
 for i,m in [('sqlite-cte','s'),('sqlite-optimized','o'),('neo4j-bolt','D')]]
fig.legend(handles=handles,loc='upper left',bbox_to_anchor=(.039,.846),frameon=False,ncol=1,fontsize=10.5,labelspacing=.55)
fig.text(.045,.105,'* Historical custom BFS is benchmark-only; this run predates the optional NodeRel BFS API. Point lookup uses SQL.',fontsize=9.5,color='#53667b')
fig.text(.045,.070,f'{hardware}. SQLite in process; Neo4j includes local Bolt transport. Samples: 120 / 12 / 12 / 24 / 24.',fontsize=9.5,color='#53667b')
fig.text(.045,.036,f'Source: benchmarks/neo4j-strengths/results.json  •  Recorded {recorded_date}',fontsize=9,color='#697b8d')
save(fig,'query-latency')

fig,ax=plt.subplots(figsize=(12,6.25))
fig.subplots_adjust(left=.105,right=.86,bottom=.22,top=.75)
fig.text(.045,.94,'Concurrent graph traversal',fontsize=22,weight='bold')
fig.text(.045,.891,'6-hop reachability  •  Approximately 6 seconds per condition  •  Higher is better',fontsize=11.5,color='#53667b')
for impl in ['sqlite-optimized','neo4j-bolt']:
 points=sorted((x for x in r['concurrency'] if x['implementation']==impl),key=lambda x:x['concurrency'])
 ax.plot([p['concurrency'] for p in points],[p['requestsPerSecond'] for p in points],color=colors[impl],marker='o',lw=2.5,markersize=6,label=labels[impl])
 for p in points:
  ax.annotate(f"{p['requestsPerSecond']:.1f}",(p['concurrency'],p['requestsPerSecond']),xytext=(0,10 if impl=='neo4j-bolt' else -19),textcoords='offset points',ha='center',fontsize=10,color=colors[impl])
 repeated=next(x for x in r['concurrencyRepeat'] if x['implementation']==impl)
 ax.scatter(8,repeated['requestsPerSecond'],s=90,marker='D',facecolor='white',edgecolor=colors[impl],linewidth=2,zorder=5)
 ax.annotate(f"{repeated['requestsPerSecond']:.1f} repeat",(8,repeated['requestsPerSecond']),xytext=(12,0),textcoords='offset points',va='center',fontsize=10,color=colors[impl])
ax.set_xlim(.65,9.25);ax.set_ylim(0,370);ax.set_xticks([1,4,8]);ax.set_xlabel('Concurrent clients',labelpad=10);ax.set_ylabel('Completed requests / second',labelpad=12)
ax.grid(axis='y',color='#e4eaf0',lw=.8);ax.set_axisbelow(True)
for side in ['top','right']:ax.spines[side].set_visible(False)
handles,ls=ax.get_legend_handles_labels()
handles.append(Line2D([],[],marker='D',markerfacecolor='white',markeredgecolor='#53667b',color='#53667b',linestyle='',label='Repeat at 8 clients (reversed order)'))
fig.legend(handles=handles,loc='upper left',bbox_to_anchor=(.04,.842),ncol=3,frameon=False,fontsize=9.5)
fig.text(.045,.105,'SQLite: one worker and read connection per client. Neo4j: one Bolt session per client. Closed-loop requests.',fontsize=9.5,color='#53667b')
fig.text(.045,.070,'* Custom BFS is benchmark-only. These short local read-only runs do not establish sustained production capacity.',fontsize=9.5,color='#53667b')
fig.text(.045,.036,f'Source: benchmarks/neo4j-strengths/results.json  •  Recorded {recorded_date}',fontsize=9,color='#697b8d')
save(fig,'concurrent-throughput')
print('Rendered query-latency and concurrent-throughput as SVG + PNG from recorded results.')
