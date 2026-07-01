# ADR-042: Hybrid RAG con HNSW auto-select (v2.6.13)

## Status
Aceptado — AzurDesk AI v2.6.13 (2026-06-30).

## Context
`/api/ai/rag` ejecuta 3 búsquedas paralelas (graphRAG, similarity, memory) y las fusiona.
v2.6.12 añadió `embeddingService` (256-dim BMF + HNSW + hybrid) — pero el RAG no lo usaba.

## Decision
**Integrar `embeddingService` como 4ª fuente de RAG con auto-select algoritmo:**

```js
const stats = embeddingService.stats(tenant_id);
const useHnsw = stats.total > 50;  // HNSW gana con N>50
const hnswRes = useHnsw
  ? embeddingService.hnswSearch(tenant_id, { query, k, ef: 50 })
  : embeddingService.search(tenant_id, { query, k });
```

**Why threshold 50**: Para N<50 el brute-force exact kNN es O(N) y muy rápido.
HNSW añade overhead de grafo + cross-distance refinement que solo se amortiza con N grande.
Punto de equilibrio empírico: ~50 vectores (ANN-benchmarks 2024).

## Why
- **Tenant pequeño** (≤50 docs): kNN exacto, sin overhead.
- **Tenant grande** (>50 docs): HNSW aproximado, 10-50x speedup.
- Sin fricción: el cliente no elige, el server decide.

## Response shape
```json
{
  "hnswResults": [...],          // 4ª fuente añadida
  "hnswAlgo": "hnsw" | "exact",  // algoritmo elegido
  "embeddingStats": { "total": N, "algo": "hnsw" | "exact" }
}
```

## Verification
- 5 nuevos tests (tests/hybrid-rag-hnsw.mjs)
- Smoke verifica `/api/ai/rag` con embeddings preexistentes
- Real cases incluye hybrid RAG como 64º caso
