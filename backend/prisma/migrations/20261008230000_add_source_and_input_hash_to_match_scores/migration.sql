-- AlterTable
ALTER TABLE "match_scores" ADD COLUMN     "inputHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'AI';