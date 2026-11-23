-- AlterTable
ALTER TABLE "PGProperty" ADD COLUMN     "searchEmbedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
ADD COLUMN     "searchEmbeddingModel" TEXT,
ADD COLUMN     "searchIndexedAt" TIMESTAMP(3),
ADD COLUMN     "searchTextHash" TEXT;
