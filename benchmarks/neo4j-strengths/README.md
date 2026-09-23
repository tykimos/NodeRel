# Neo4j의 장점을 확인하는 재현 실험

`REPORT.md`에 결과와 해석, `results.json`에 개별 측정값 및 실행 계획을 담았습니다.

- Node.js 24.13.1, 내장 SQLite 3.51.2
- Neo4j Community 2025.06.2, Java 21
- neo4j-driver 5.28.3 (`package-lock.json` 고정)
- 50,000 노드 / 300,000 방향성 연결, 고정 난수 시드 20260923

## 재현

이 폴더에 의존성을 설치하고, 테스트 전용 설정을 만듭니다. Neo4j와 Node.js는 미리 설치되어 있어야 합니다.

```sh
npm ci
python3 prepare-config.py  # 설치된 Neo4j의 설정 파일을 자동 검색
NEO4J_CONF="$PWD/conf" neo4j console
```

별도 터미널에서 같은 폴더로 이동한 뒤 실행합니다.

```sh
node import.mjs
node benchmark.mjs
```

`import.mjs`는 `bench.sqlite`를 다시 만들고, 전용 Neo4j 서버에 데이터를 적재합니다. Neo4j에 `Bench` 노드가 이미 있으면 중복 적재하지 않고 중단합니다. 서버를 재사용해 측정만 반복하려면 `benchmark.mjs`만 실행합니다. 실행 후 Neo4j 콘솔에서 Ctrl+C로 종료합니다.

서버는 127.0.0.1의 17474/17687 포트로만 연결을 받습니다. 데이터와 로그는 이 폴더의 `server/` 아래에 만들어집니다. 다른 Neo4j 데이터베이스를 가리키도록 접속 정보를 바꾸지 마세요.

## 파일

- `common.mjs`: 결정적 데이터 생성, 독립적인 메모리 BFS 정답 계산, SQLite CTE / 직접 구현한 BFS, Cypher 쿼리.
- `schema.mjs`: NodeRel 테이블 및 인덱스.
- `import.mjs`: 같은 그래프를 양쪽 DB에 적재. SQLite에는 역방향 탐색을 위한 추가 인덱스도 생성.
- `benchmark.mjs`: 예열, 순서 교대 측정, 정답 대조, 실행 계획, 동시 조회 측정.
- `worker.mjs`: SQLite도 별도 작업 스레드와 읽기 연결을 사용해 병렬 조회.

측정은 캐시가 준비된 상태의 로컬 조회 성능입니다. 전체 그래프를 메모리에 미리 읽어 사용하는 정답 계산기는 측정 대상이 아닙니다. 실제 SQLite 조회는 매번 인덱스로 필요한 연결을 읽습니다. 결과를 저장해 반환하는 응답 캐시는 사용하지 않습니다.

동시 요청의 순서를 바꿔 재확인하려면 본 측정 후 `node repeat-concurrency.mjs`를 실행합니다. 결과 JSON에 `concurrencyRepeat`가 추가됩니다.

Neo4j 설치 경로를 찾지 못하면 `python3 prepare-config.py --neo4j-home /path/to/neo4j`로 지정합니다. 서버 로그 설정은 설치된 Neo4j에서 복사합니다.
