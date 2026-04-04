package com.spf.service;

import com.spf.config.QueryRewriteConfig;
import com.spf.dto.RetrievedChunk;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 检索编排层：Milvus 粗排 -> rerank 精排 -> 去重/限流 -> 最终上下文。
 */
@Service
public class RetrievalPipelineService {

    private static final Logger logger = LoggerFactory.getLogger(RetrievalPipelineService.class);

    @Autowired
    private VectorSearchService vectorSearchService;

    @Autowired
    private RerankService rerankService;

    @Autowired
    private QueryRewriteService queryRewriteService;

    @Autowired
    private QueryRewriteConfig queryRewriteConfig;

    @Value("${rag.top-k:3}")
    private int legacyTopK;

    @Value("${rag.recall-top-k:0}")
    private int recallTopK;

    @Value("${rag.final-top-k:0}")
    private int finalTopK;

    @Value("${rag.per-doc-cap:2}")
    private int perDocCap;

    @Value("${rag.rerank.enabled:true}")
    private boolean rerankEnabled;

    public List<RetrievedChunk> retrieve(String query) {
        int effectiveFinalTopK = finalTopK > 0 ? finalTopK : Math.max(legacyTopK, 1);
        int effectiveRecallTopK = recallTopK > 0 ? recallTopK : Math.max(effectiveFinalTopK * 3, 12);

        // Query 改写：指代消解 + HyDE
        String rewrittenQuery = query;
        String hyDEText = null;

        if (queryRewriteConfig.isEnabled()) {
            rewrittenQuery = queryRewriteService.rewriteQuery(query);

            if (queryRewriteConfig.isHydeEnabled()) {
                hyDEText = queryRewriteService.generateHyDE(rewrittenQuery);
            }
        }

        // 向量粗排：优先用 HyDE embedding（doc-to-doc 相似度更高），失败则用改写后的 query
        String vectorQuery = (hyDEText != null) ? hyDEText : rewrittenQuery;
        List<VectorSearchService.SearchResult> coarseResults =
                vectorSearchService.searchSimilarDocuments(vectorQuery, effectiveRecallTopK);

        if (coarseResults.isEmpty()) {
            return List.of();
        }

        List<RetrievedChunk> candidates = mapToRetrievedChunks(coarseResults);
        logger.info("粗排候选, query='{}', rewrite='{}', hyDE={}: {}",
                query, rewrittenQuery != query ? "'" + rewrittenQuery + "'" : "skip",
                hyDEText != null ? "on(" + hyDEText.length() + "字)" : "off",
                summarizeChunks(candidates, 6));

        // Rerank 精排：使用改写后的 query（cross-encoder 本身擅长处理短 query）
        List<RetrievedChunk> ranked;
        if (rerankEnabled) {
            try {
                ranked = rerankService.rerank(rewrittenQuery, candidates, effectiveRecallTopK);
            } catch (Exception e) {
                logger.warn("rerank 失败，降级为粗排结果, query='{}': {}", rewrittenQuery, e.getMessage());
                ranked = sortByVectorScore(candidates, effectiveRecallTopK);
            }
        } else {
            ranked = sortByVectorScore(candidates, effectiveRecallTopK);
        }

        List<RetrievedChunk> finalChunks = applyPerDocCap(ranked, effectiveFinalTopK, perDocCap);
        logger.info("最终命中, query='{}': {}", rewrittenQuery, summarizeChunks(finalChunks, effectiveFinalTopK));
        logger.info("两阶段检索完成, query='{}' → rewrite='{}', hyDE={}, 粗排={}, 最终={}, perDocCap={}",
                query, rewrittenQuery != query ? "'" + rewrittenQuery + "'" : "same",
                hyDEText != null, coarseResults.size(), finalChunks.size(), perDocCap);
        return finalChunks;
    }

    private List<RetrievedChunk> mapToRetrievedChunks(List<VectorSearchService.SearchResult> coarseResults) {
        Map<String, RetrievedChunk> deduped = new LinkedHashMap<>();

        for (VectorSearchService.SearchResult result : coarseResults) {
            RetrievedChunk chunk = new RetrievedChunk();
            chunk.setId(result.getId());
            chunk.setContent(result.getContent());
            chunk.setVectorScore(result.getScore());
            chunk.setRawVectorScore(result.getRawScore());
            chunk.setMetadata(result.getMetadataMap());
            chunk.setSource(result.getSource());
            chunk.setFileName(result.getFileName());
            chunk.setTitle(result.getTitle());
            chunk.setChunkIndex(result.getChunkIndex());
            chunk.setFinalScore(result.getScore());

            deduped.putIfAbsent(chunk.getId(), chunk);
        }

        return new ArrayList<>(deduped.values());
    }

    private List<RetrievedChunk> sortByVectorScore(List<RetrievedChunk> candidates, int topN) {
        List<RetrievedChunk> ranked = new ArrayList<>(candidates);
        ranked.sort(Comparator.comparing(RetrievedChunk::getVectorScore).reversed());
        int limit = Math.min(Math.max(topN, 1), ranked.size());
        return new ArrayList<>(ranked.subList(0, limit));
    }

    private List<RetrievedChunk> applyPerDocCap(List<RetrievedChunk> ranked, int finalTopN, int docCap) {
        int safeDocCap = Math.max(docCap, 1);
        List<RetrievedChunk> selected = new ArrayList<>();
        Map<String, Integer> docCounter = new LinkedHashMap<>();
        List<RetrievedChunk> overflow = new ArrayList<>();

        for (RetrievedChunk chunk : ranked) {
            String sourceKey = chunk.getSourceKey();
            int count = docCounter.getOrDefault(sourceKey, 0);
            if (count < safeDocCap) {
                selected.add(chunk);
                docCounter.put(sourceKey, count + 1);
                if (selected.size() >= finalTopN) {
                    return selected;
                }
            } else {
                overflow.add(chunk);
            }
        }

        // 如果文档限流后结果不足，回填剩余候选，避免空出上下文。
        for (RetrievedChunk chunk : overflow) {
            selected.add(chunk);
            if (selected.size() >= finalTopN) {
                break;
            }
        }

        return selected;
    }

    private String summarizeChunks(List<RetrievedChunk> chunks, int limit) {
        if (chunks == null || chunks.isEmpty()) {
            return "[]";
        }

        List<String> summaries = new ArrayList<>();
        int boundedLimit = Math.min(Math.max(limit, 1), chunks.size());
        for (int i = 0; i < boundedLimit; i++) {
            RetrievedChunk chunk = chunks.get(i);
            String label = chunk.getTitle();
            if (label == null || label.isBlank()) {
                label = chunk.getFileName();
            }
            if (label == null || label.isBlank()) {
                label = chunk.getSourceKey();
            }

            summaries.add(String.format(
                    "#%d[%s|chunk=%s|vector=%.4f|rerank=%.4f|final=%.4f]",
                    i + 1,
                    sanitize(label),
                    chunk.getChunkIndex() == null ? "-" : chunk.getChunkIndex(),
                    chunk.getVectorScore(),
                    chunk.getRerankScore(),
                    chunk.getFinalScore()
            ));
        }

        if (chunks.size() > boundedLimit) {
            summaries.add("... +" + (chunks.size() - boundedLimit));
        }
        return summaries.toString();
    }

    private String sanitize(String value) {
        return value.replace('\n', ' ').replace('\r', ' ').trim();
    }
}
