# NodeRel 예제 적재 및 검증 결과

검증 시각(UTC): 2026-09-23T04:06:59.063Z

Movies와 Northwind를 실제 Neo4j에 불러온 뒤, SQLite 기반 NodeRel에 변환·적재했습니다. 15개 질의를 양쪽에서 실행했으며, 반환 결과가 모두 일치했습니다. NodeRel 독립 데모를 검증한 결과입니다.

프로젝트 명칭 변경에 맞춰 비교 예제의 보조 Neo4j 라벨·속성 표기를 `NodeRelItem`, `noderel_id`, `noderel_scope`로 정리했습니다. 아래 시간과 반환값은 최초 측정 기록을 유지한 것입니다.

## 데이터 적재

| 예제 | 항목 | 연결 | 데이터 확인 |
|---|---:|---:|---|
| movies | 171 | 253 | 색인 필드·관계 속성 일치 |
| northwind | 1,035 | 3,139 | 색인 필드·관계 속성 일치 |

전체 1,206개 항목과 3,392개 연결을 적재했고, 버린 연결은 없습니다.

## 조회 결과와 응답 시간

단위는 밀리초(ms)이며 3회 예열 후 11회 실행 중앙값입니다. SQLite는 프로그램 내부 호출, Neo4j는 로컬 HTTP와 JSON 왕복을 포함합니다. 표의 값은 순수 엔진 속도나 운영 서비스 처리량을 의미하지 않습니다.

| 예제 질의 | 결과 수 | NodeRel | Neo4j | 일치 |
|---|---:|---:|---:|---|
| 키아누 리브스의 출연 영화 | 7 | 0.006 | 6.166 | 통과 |
| 매트릭스 출연진과 배역 | 5 | 0.011 | 3.101 | 통과 |
| 톰 행크스의 공동 출연자 | 34 | 0.026 | 2.967 | 통과 |
| 같은 영화를 감독하고 출연한 사람 | 3 | 0.125 | 4.525 | 통과 |
| 키아누 리브스에서 양방향 4단계 추적 | 57 | 0.829 | 4.302 | 통과 |
| 키아누 리브스와 톰 행크스의 최소 연결 거리 | 1 | 1.894 | 3.312 | 통과 |
| 출연 연결이 없는 인물 | 31 | 0.068 | 3.068 | 통과 |
| 유제품 분류의 상품 | 10 | 0.007 | 2.206 | 통과 |
| 공급사 1의 상품과 분류 | 3 | 0.005 | 3.250 | 통과 |
| ALFKI 고객의 구매 상품과 주문 수 | 11 | 0.015 | 1.938 | 통과 |
| ALFKI 고객이 구매한 상품 분류 | 5 | 0.010 | 1.850 | 통과 |
| 공급사 1의 상품을 구매한 고객 | 49 | 0.124 | 2.422 | 통과 |
| 주문이 없는 고객 | 2 | 0.047 | 1.809 | 통과 |
| ALFKI 고객에서 하류 3단계 추적 | 22 | 0.185 | 2.394 | 통과 |
| 주문 10248의 상품별 수량 | 3 | 0.005 | 2.220 | 통과 |

실험 환경: Apple M3, Node 24.13.1 / SQLite 3.51.2, Neo4j Community 2025.06.2, Neo4j heap 512 MiB / page cache 256 MiB. 단일 클라이언트의 작은 예제 데이터입니다.

## 실제 반환 사례

### 키아누 리브스의 출연 영화

```json
[
  {
    "title": "Johnny Mnemonic"
  },
  {
    "title": "Something's Gotta Give"
  },
  {
    "title": "The Devil's Advocate"
  },
  {
    "title": "The Matrix"
  },
  {
    "title": "The Matrix Reloaded"
  },
  {
    "title": "The Matrix Revolutions"
  },
  {
    "title": "The Replacements"
  }
]
```

### 매트릭스 출연진과 배역

```json
[
  {
    "name": "Carrie-Anne Moss",
    "roles": [
      "Trinity"
    ]
  },
  {
    "name": "Emil Eifrem",
    "roles": [
      "Emil"
    ]
  },
  {
    "name": "Hugo Weaving",
    "roles": [
      "Agent Smith"
    ]
  },
  {
    "name": "Keanu Reeves",
    "roles": [
      "Neo"
    ]
  },
  {
    "name": "Laurence Fishburne",
    "roles": [
      "Morpheus"
    ]
  }
]
```

### 키아누 리브스와 톰 행크스의 최소 연결 거리

```json
[
  {
    "depth": 4
  }
]
```

### ALFKI 고객의 구매 상품과 주문 수

```json
[
  {
    "product": "Aniseed Syrup",
    "orders": 1
  },
  {
    "product": "Chartreuse verte",
    "orders": 1
  },
  {
    "product": "Escargots de Bourgogne",
    "orders": 1
  },
  {
    "product": "Flotemysost",
    "orders": 1
  },
  {
    "product": "Grandma's Boysenberry Spread",
    "orders": 1
  },
  {
    "product": "Lakkalikööri",
    "orders": 1
  },
  {
    "product": "Original Frankfurter grüne Soße",
    "orders": 1
  },
  {
    "product": "Raclette Courdavault",
    "orders": 1
  },
  {
    "product": "Rössle Sauerkraut",
    "orders": 2
  },
  {
    "product": "Spegesild",
    "orders": 1
  },
  {
    "product": "Vegie-spread",
    "orders": 1
  }
]
```

### 주문이 없는 고객

```json
[
  {
    "id": "northwind:Customer:FISSA",
    "title": "FISSA Fabrica Inter. Salchichas S.A."
  },
  {
    "id": "northwind:Customer:PARIS",
    "title": "Paris spécialités"
  }
]
```

### 주문 10248의 상품별 수량

```json
[
  {
    "product": "Mozzarella di Giovanni",
    "quantity": 5
  },
  {
    "product": "Queso Cabrales",
    "quantity": 12
  },
  {
    "product": "Singaporean Hokkien Fried Mee",
    "quantity": 10
  }
]
```

## 경계 조건 검증

- 통과: 부분 문자열 ID와 순환을 포함해도 정확한 최소 깊이 반환
- 통과: 다른 scope의 시작 항목 접근 차단
- 통과: 깊이 상한 검증
- 통과: 잘못된 재구축 입력에서 기존 인덱스 보존

## 적용 범위

- 관계를 따라가기, 공동 출연자, 여러 관계를 조합한 고객·상품 조회, 최단 연결 거리, 연결이 없는 항목 찾기를 NodeRel로 수행할 수 있었습니다.
- Neo4j의 원본 화살표 방향을 유지했습니다. 모든 관계를 원인→영향으로 해석하지 않습니다.
- 노드의 전체 속성은 원본 스냅샷에 남아 있습니다. 연도·가격으로 필터링하려면 원본을 참조하거나 인덱스를 확장해야 합니다.
- 같은 종류의 병렬 관계, 다중 라벨, 고급 그래프 알고리즘, 대규모 동시 접속은 이번 검증 범위에 포함하지 않았습니다.
- 테스트용 Neo4j 서버는 종료했습니다. NodeRel와 저장된 기준 결과는 그대로 재실행할 수 있습니다.

## 다시 실행

```sh
node demo.mjs test
node demo.mjs list
node demo.mjs show 1
node demo.mjs rebuild
```

`test`는 실제 SQLite 질의를 실행하고 이번에 Neo4j와 대조한 저장 결과에 비교합니다. 실시간 Neo4j 비교는 아닙니다.

## 출처

- [Neo4j 공식 예제 목록](https://neo4j.com/docs/getting-started/appendix/example-data/)
- [Movies](https://github.com/neo4j-graph-examples/movies)
- [Northwind](https://github.com/neo4j-graph-examples/northwind)
