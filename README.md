# GraphIndex

**SQLite 기반 파생 그래프 인덱스와 AI용 스키마 설명서.**

항목과 연결을 SQLite 파일에 저장하고, 연결 추적·이웃 조회·관계 누락 검사를 수행하는 Node.js 프로토타입입니다. 원본 데이터로부터 재구축할 수 있으며, 별도 DB 서버 없이 실행합니다.

AI가 데이터 구조를 읽고 조회 요청을 만들 수 있도록 실제 노드 종류, 관계 방향, 속성 정보와 사용 가능한 함수를 설명하는 스키마 추출기를 제공합니다. 자연어 자동 처리 서비스와 Cypher 실행기는 포함하지 않습니다.

## 빠른 시작

Node.js **24.13.1 이상**이 필요합니다. 핵심 기능은 내장 SQLite를 사용하므로 추가 패키지를 설치하지 않습니다.

```sh
git clone https://github.com/tykimos/graphindex.git
cd graphindex
npm test
npm run demo:build
npm run demo -- show 1
npm run schema
```

- `npm test`: 임시 DB로 예제 질의, 경계 조건, AI 스키마와 도구 호출 결과를 확인합니다.
- `demo:build`: 스냅샷으로 `examples/neo4j/graphindex.sqlite`를 생성합니다.
- `demo -- show 1`: 키아누 리브스의 출연 영화를 조회합니다.
- `schema`: AI용 설명서를 `examples/ai/schema.json`에 저장합니다.

Node 24.13.1은 `node:sqlite` 사용 시 실험 기능 경고를 표시할 수 있습니다.

## 기본 사용

```js
import { GraphIndex } from './src/graphindex.mjs';

const index = new GraphIndex('./examples/neo4j/graphindex.sqlite', {
  readOnly: true
});
try {
  console.log(index.trace({
    id: 'movies:Person:Keanu%20Reeves',
    scope: 'movies',
    direction: 'out',
    maxDepth: 1,
    types: ['ACTED_IN']
  }));
} finally {
  index.close();
}
```

| 기능 | API |
|---|---|
| 스냅샷으로 재구축 | `rebuild(snapshots)` |
| 연결된 항목과 최소 깊이 | `trace({ id, scope, direction, maxDepth, types })` |
| 직접 연결과 관계 속성 | `neighbors(id, scope)` |
| 특정 연결이 없는 항목 | `orphans({ scope, kind, type, side })` |
| 종류별 개수 | `stats(scope)` |
| 해당 범위의 전체 그래프 | `graph(scope)` |

`out`은 관계 방향, `in`은 역방향, `both`는 양방향입니다. `trace`는 시작 노드를 제외한 중복 없는 노드와 최소 깊이를 반환하며, 전체 경로 목록을 반환하지 않습니다. 깊이는 0~10입니다.

## AI용 설명서

```js
import { describeGraphIndex } from './src/describe.mjs';
const schema = describeGraphIndex('./examples/neo4j/graphindex.sqlite');
console.log(schema.scopes);
console.log(schema.existingOperations);
```

실제 노드 종류, 관계의 시작·도착 종류, JSON 관계 속성 자료형, 개수, 예시 ID와 현재 조회 함수가 담깁니다. `Person → ACTED_IN → Movie`를 읽은 AI가 출연 영화 조회 요청을 만들 수 있습니다.

업무 의미와 이름 필드의 설명은 공식 샘플에 맞춰 별도로 작성했습니다. 다른 도메인에는 해당 설명을 보완해야 합니다. 관찰된 데이터 모양은 강제되는 스키마 제약이나 접근 권한이 아닙니다.

[AI 스키마와 요청 예시](examples/ai/README.md) · [설계와 구현 범위](docs/design.md)

## 예제와 검증

| 데이터 | 노드 | 연결 |
|---|---:|---:|
| Neo4j Movies | 171 | 253 |
| Neo4j Northwind | 1,035 | 3,139 |

15개 예제 질의를 실제 Neo4j에 실행해 저장한 기준 결과와 비교합니다. 일반 테스트는 Neo4j 서버가 필요하지 않으며, 실시간 Neo4j 조회가 아닙니다. 순환, ID 부분 문자열, scope, 잘못된 깊이와 재구축 검증에 관한 경계 조건도 포함합니다.

[예제 사용법](examples/neo4j/README.md) · [검증 보고서](examples/neo4j/REPORT.md)

## Neo4j 비교 실험

[재현 코드와 절차](benchmarks/neo4j-strengths/README.md) · [상세 보고서](benchmarks/neo4j-strengths/REPORT.md) · [측정값](benchmarks/neo4j-strengths/results.json)

5만 노드·30만 연결, Apple M3, 캐시 예열 후 측정한 단일 요청 중앙값입니다. GraphIndex 전용 탐색은 벤치마크에서 별도로 구현한 BFS이며, 핵심 `trace()`의 재귀 SQL과 구분합니다.

| 작업 | GraphIndex 전용 탐색 | Neo4j Bolt |
|---|---:|---:|
| 노드 하나 조회 | 0.006 ms | 0.276 ms |
| 두 지점 최단 거리 | 1.530 ms | 1.919 ms |
| 3단계 연결 탐색 | 0.194 ms | 1.043 ms |
| 6단계 연결 탐색 | 25.846 ms | 13.592 ms |

8개 동시 요청의 넓은 탐색에서는 Neo4j 처리량이 약 3.1~3.3배 높았습니다. 보고서에서 재귀 SQL, 전용 BFS, Neo4j의 차이와 통신 비용을 구분합니다. 합성 데이터 실험으로 모든 그래프나 운영 서비스의 성능을 보장하지 않습니다.

## 저장 구조와 범위

- `items`: ID, 종류, scope, 표시 이름 등 기본 필드.
- `links`: 시작 ID, 도착 ID, 관계 종류와 JSON 관계 속성.
- `sync_meta`: 스냅샷 서명, 재구축 시각, 제외된 연결 정보.

원본의 모든 노드 속성이 인덱스에 들어가는 것은 아닙니다. 같은 `(시작, 도착, 종류)`의 병렬 관계와 여러 라벨을 가진 노드는 별도 모델 확장이 필요합니다. scope 필터는 인증·인가 전체를 제공하지 않습니다. 자동 동기화, HTTP 서버, MCP 서버, 자연어 변환 모델은 포함하지 않습니다.

```text
src/                         핵심 구현과 스키마 추출기
examples/neo4j/               스냅샷, 질의, 저장된 기준 결과
examples/ai/                  AI용 설명서와 요청 예시
benchmarks/neo4j-strengths/   비교 실험과 측정 결과
docs/                        설계 설명
scripts/                     서버 없이 실행하는 검증
```

예제 DB, 서버 데이터, 로그와 설치된 의존성은 Git에 포함하지 않습니다. [외부 데이터와 의존성 출처](THIRD_PARTY_NOTICES.md)를 기록했습니다. 자체 코드에는 별도의 오픈소스 라이선스를 지정하지 않았습니다.
