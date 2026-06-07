-- HNSW index for approximate nearest-neighbor search on jdEmbedding.
-- Uses L2 distance (voyage-3-lite embeddings are not unit-normalized).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Resume_jdEmbedding_hnsw_idx"
  ON "Resume" USING hnsw ("jdEmbedding" vector_l2_ops);
