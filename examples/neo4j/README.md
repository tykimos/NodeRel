# NodeRel — Neo4j 대표 예제 실험

SQLite 위에 항목과 연결을 저장하는 NodeRel의 독립 실행 데모입니다.

Neo4j 공식 예제인 Movies와 Northwind를 별도 Neo4j 서버에 불러온 다음, 항목과 연결을 NodeRel로 옮겼습니다. 실제 Neo4j와 15개 질의의 결과를 대조했고, 모두 일치했습니다. 테스트용 Neo4j 서버는 측정 후 종료했습니다.

| 예제 | 항목 | 연결 |
|---|---:|---:|
| Movies | 171 | 253 |
| Northwind | 1,035 | 3,139 |
| 합계 | 1,206 | 3,392 |

## 실행

검증한 실행 환경은 Node.js 24.13.1입니다. 이 폴더에서 실행합니다. 별도 패키지 설치와 Neo4j 서버는 필요하지 않습니다.

```sh
node demo.mjs rebuild
node demo.mjs test
```

이 명령은 실제 SQLite 질의를 실행하고, 이번 실험에서 저장한 Neo4j 기준 결과와 비교합니다. 실시간으로 Neo4j에 연결하는 명령은 아닙니다.

```sh
node demo.mjs list
node demo.mjs show 1
node demo.mjs show 10
node demo.mjs stats
node demo.mjs trace movies "Keanu Reeves" both 4 ACTED_IN
```

원본 스냅샷에서 NodeRel를 다시 만들려면 다음을 실행합니다.

```sh
node demo.mjs rebuild
node demo.mjs test
```

## 파일

- `noderel.sqlite`: `rebuild`로 생성하는 SQLite 연결 인덱스. Git에는 포함하지 않습니다. 조회에 필요한 기본 속성과 연결을 저장합니다.
- `noderel.mjs`: `../../src/noderel.mjs`의 구현을 재사용하는 진입점.
- `snapshots/movies.json`, `snapshots/northwind.json`: 원본 노드 속성과 관계 속성을 보존한 수집기 입력. 이 파일들로 인덱스를 다시 만듭니다.
- `cases.mjs`: 15개 SQL/Cypher 대응 예제.
- `expected-results.json`: 실제 Neo4j와 대조한 기준 결과.
- `results.json`: 측정 환경, 각 실행 시간, 검증 결과와 실제 반환값.
- `REPORT.md`: 사람이 읽는 결과 보고서.
- `sources.json`: 원본 주소, 다운로드 크기, SHA-256.

## 변환 규칙

| Neo4j | NodeRel |
|---|---|
| Movie, Person 등 노드 라벨 | `items.kind` |
| 예제 데이터 이름 | `items.scope` |
| 영화 제목·사람 이름·상품 번호 등 원본 키 | scope와 kind 접두사를 붙인 `items.id` |
| 표시용 이름 | `items.title` |
| 관계 시작점·도착점·종류 | `links.from_id`, `to_id`, `type` |
| 배역·수량 등 관계 속성 | `links.attrs`의 JSON |
| 출시 연도·가격 등 나머지 노드 속성 | 원본 스냅샷의 `source.properties` |

원본의 화살표 방향을 그대로 유지했습니다. 여기서 `out`은 화살표를 따라가기, `in`은 거꾸로 가기, `both`는 양방향 탐색입니다. 영화의 ‘출연’이나 고객의 ‘구매’ 관계를 모두 원인·영향 관계로 해석하지 않습니다.

이번 두 예제에는 변환 중 버린 연결이 없습니다. 모든 색인 필드와 관계 속성을 원본 스냅샷과 대조했습니다.

## 원래 설계에서 보완한 부분

- 문자열 부분 일치로 순환을 검사하지 않습니다. `(항목 ID, 깊이)` 상태 중복을 제거해 탐색하고 최소 깊이를 반환합니다.
- 시작점과 탐색 대상의 scope를 확인합니다. 다중 테넌트 서비스의 인증·인가 전체를 구현한 것은 아닙니다.
- 원본 내용의 SHA-256을 기록하고, 재구축 실패 시 트랜잭션을 되돌립니다. 이 데모는 수동 재구축이며 자동 감시·HTTP 서버는 포함하지 않습니다.
- 동일 ID 충돌과 동일 시작·도착·종류의 병렬 관계를 감지하면 오류로 알립니다. 서로 다른 종류의 병렬 관계는 보존합니다.
- 배역 목록과 주문 수량은 관계 메타데이터를 읽는 예제로 포함했습니다. 메타데이터 조건 검색이나 별도 속성 인덱스는 추가하지 않았습니다.

## 해석 범위

이번 실험은 작은 공식 예제에서 조회의 정확성과 동작 가능성을 확인한 것입니다. 모든 Cypher 기능이나 그래프 알고리즘을 대체한다는 의미는 아닙니다.

연도·가격 같은 노드 속성 조건은 기본 색인에 저장하지 않았으므로, 해당 질의는 원본과 결합하거나 색인 필드를 확장해야 합니다. 여러 라벨의 노드와 같은 종류의 병렬 관계도 일반화하려면 별도 모델링이 필요합니다.

성능은 단일 클라이언트, 예열 3회 후 11회 실행 중앙값입니다. SQLite는 프로그램 내부 호출, Neo4j는 로컬 HTTP와 JSON 왕복을 포함합니다. 엔진 연산 자체, 동시 사용자 처리량, 운영 서비스 응답 시간으로 일반화할 수 없습니다.

## 출처

- [Neo4j 공식 예제 목록](https://neo4j.com/docs/getting-started/appendix/example-data/)
- [Movies 공식 저장소](https://github.com/neo4j-graph-examples/movies)
- [Northwind 공식 저장소](https://github.com/neo4j-graph-examples/northwind)

원본에 있는 이름·제목·설명은 예제 데이터의 일부입니다. 이 데모는 각 출처의 데이터에 새로운 라이선스를 부여하지 않습니다.
