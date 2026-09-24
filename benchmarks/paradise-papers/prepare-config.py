"""Create a separate local Neo4j benchmark configuration."""
from pathlib import Path
import argparse
import os
import shutil
import socket
p=argparse.ArgumentParser()
p.add_argument('--heap',default='1g')
p.add_argument('--page-cache',default='1g')
p.add_argument('--neo4j-home',type=Path,default=os.environ.get('NEO4J_HOME'))
a=p.parse_args()
base=Path(__file__).resolve().parent
candidates=[]
if a.neo4j_home:
    candidates.append(a.neo4j_home)
else:
    executable=shutil.which('neo4j')
    if executable:
        install=Path(executable).resolve().parent.parent
        candidates.extend([install,install/'libexec'])
source=next((x/'conf' for x in candidates if all((x/'conf'/f).is_file() for f in ['server-logs.xml','user-logs.xml'])),None)
if source is None:
    raise SystemExit('Use --neo4j-home /path/to/neo4j to locate the installed conf/ directory.')
for port in [17474,17687]:
    with socket.socket() as sock:
        if sock.connect_ex(('127.0.0.1',port))==0:
            raise SystemExit(f'Port {port} is in use. Stop the existing test server first.')
conf=base/'conf'
conf.mkdir(exist_ok=True)
lines=[]
for d in ['data','logs','run','import','plugins','licenses']:
    folder=base/'server'/d
    folder.mkdir(parents=True,exist_ok=True)
    lines.append(f'server.directories.{d}={folder}')
lines += ['dbms.security.auth_enabled=false','dbms.usage_report.enabled=false',
    'server.default_listen_address=127.0.0.1','server.http.enabled=true',
    'server.http.listen_address=127.0.0.1:17474','server.http.advertised_address=localhost:17474',
    'server.bolt.enabled=true','server.bolt.listen_address=127.0.0.1:17687',
    'server.bolt.advertised_address=localhost:17687','server.https.enabled=false',
    f'server.memory.heap.initial_size={a.heap}',f'server.memory.heap.max_size={a.heap}',
    f'server.memory.pagecache.size={a.page_cache}','db.transaction.timeout=60s']
(conf/'neo4j.conf').write_text('\n'.join(lines)+'\n')
for f in ['server-logs.xml','user-logs.xml']: shutil.copy(source/f,conf/f)
print('Created isolated configuration:',conf)
print('Run from this folder: NEO4J_CONF="$PWD/conf" neo4j console')
