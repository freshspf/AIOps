package com.spf.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spf.config.RerankConfig;
import com.spf.dto.RetrievedChunk;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 基于 DashScope 官方 API 的真实 rerank 实现。
 */
@Service
public class DashScopeRerankService implements RerankService {

    private static final Logger logger = LoggerFactory.getLogger(DashScopeRerankService.class);

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final RerankConfig rerankConfig;
    private final HttpClient httpClient;

    @Value("${dashscope.api.key}")
    private String apiKey;

    public DashScopeRerankService(RerankConfig rerankConfig) {
        this.rerankConfig = rerankConfig;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(rerankConfig.getTimeoutMs()))
                .build();
    }

    @PostConstruct
    public void init() {
        logger.info("DashScope rerank 初始化完成, provider={}, model={}, enabled={}",
                rerankConfig.getProvider(), rerankConfig.getModel(), rerankConfig.isEnabled());
    }

    @Override
    public List<RetrievedChunk> rerank(String query, List<RetrievedChunk> candidates, int topN) {
        if (candidates == null || candidates.isEmpty()) {
            return List.of();
        }
        if (!rerankConfig.isEnabled()) {
            return sortByVectorScore(candidates, topN);
        }
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("DashScope rerank 启用时必须配置 DASHSCOPE_API_KEY");
        }

        try {
            List<String> documents = new ArrayList<>(candidates.size());
            for (RetrievedChunk candidate : candidates) {
                documents.add(buildDocumentInput(candidate));
            }

            Map<String, Object> body = buildRequestBody(query, documents, topN);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(rerankConfig.getBaseUrl()))
                    .timeout(Duration.ofMillis(rerankConfig.getTimeoutMs()))
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("DashScope rerank 调用失败, status=" + response.statusCode()
                        + ", body=" + response.body());
            }

            return mapResponse(candidates, response.body(), topN);
        } catch (Exception e) {
            throw new RuntimeException("DashScope rerank 失败: " + e.getMessage(), e);
        }
    }

    private Map<String, Object> buildRequestBody(String query, List<String> documents, int topN) {
        int boundedTopN = Math.min(Math.max(topN, 1), documents.size());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", rerankConfig.getModel());

        if (useCompatibleApi()) {
            body.put("query", query);
            body.put("documents", documents);
            body.put("top_n", boundedTopN);
            if (rerankConfig.getInstruct() != null && !rerankConfig.getInstruct().isBlank()) {
                body.put("instruct", rerankConfig.getInstruct());
            }
            return body;
        }

        Map<String, Object> input = new LinkedHashMap<>();
        input.put("query", query);
        input.put("documents", documents);
        body.put("input", input);

        Map<String, Object> parameters = new LinkedHashMap<>();
        parameters.put("top_n", boundedTopN);
        if (rerankConfig.getInstruct() != null && !rerankConfig.getInstruct().isBlank()) {
            parameters.put("instruct", rerankConfig.getInstruct());
        }
        body.put("parameters", parameters);

        return body;
    }

    private boolean useCompatibleApi() {
        String baseUrl = rerankConfig.getBaseUrl();
        return baseUrl != null && baseUrl.contains("/compatible-api/");
    }

    private List<RetrievedChunk> mapResponse(List<RetrievedChunk> candidates, String responseBody, int topN) throws Exception {
        JsonNode root = objectMapper.readTree(responseBody);
        JsonNode resultsNode = root.path("output").path("results");
        if (!resultsNode.isArray()) {
            resultsNode = root.path("results");
        }
        if (!resultsNode.isArray()) {
            throw new IllegalStateException("DashScope rerank 响应格式异常: " + responseBody);
        }

        List<RetrievedChunk> reranked = new ArrayList<>();
        for (JsonNode resultNode : resultsNode) {
            int index = resultNode.path("index").asInt(-1);
            if (index < 0 || index >= candidates.size()) {
                continue;
            }

            float score = (float) resultNode.path("relevance_score").asDouble(
                    resultNode.path("score").asDouble(0.0)
            );

            RetrievedChunk candidate = candidates.get(index);
            candidate.setRerankScore(score);
            candidate.setFinalScore(score);
            reranked.add(candidate);
        }

        reranked.sort(Comparator
                .comparing(RetrievedChunk::getFinalScore)
                .thenComparing(RetrievedChunk::getVectorScore)
                .reversed());

        int limit = Math.min(Math.max(topN, 1), reranked.size());
        logger.info("DashScope rerank 完成, 输入候选={}, 输出候选={}, 命中明细={}",
                candidates.size(), limit, summarizeChunks(reranked, Math.min(limit, 6)));
        return new ArrayList<>(reranked.subList(0, limit));
    }

    private String buildDocumentInput(RetrievedChunk candidate) {
        StringBuilder builder = new StringBuilder();
        if (candidate.getTitle() != null && !candidate.getTitle().isBlank()) {
            builder.append("标题: ").append(candidate.getTitle()).append('\n');
        }
        if (candidate.getFileName() != null && !candidate.getFileName().isBlank()) {
            builder.append("来源文件: ").append(candidate.getFileName()).append('\n');
        }
        if (candidate.getContent() != null) {
            builder.append("内容: ").append(candidate.getContent());
        }

        String input = builder.toString().trim();
        int maxChars = Math.max(rerankConfig.getMaxInputChars(), 200);
        if (input.length() <= maxChars) {
            return input;
        }
        return input.substring(0, maxChars);
    }

    private List<RetrievedChunk> sortByVectorScore(List<RetrievedChunk> candidates, int topN) {
        List<RetrievedChunk> ranked = new ArrayList<>(candidates);
        ranked.sort(Comparator.comparing(RetrievedChunk::getVectorScore).reversed());
        int limit = Math.min(Math.max(topN, 1), ranked.size());
        return new ArrayList<>(ranked.subList(0, limit));
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
                    "#%d[%s|chunk=%s|rerank=%.4f|vector=%.4f]",
                    i + 1,
                    sanitize(label),
                    chunk.getChunkIndex() == null ? "-" : chunk.getChunkIndex(),
                    chunk.getRerankScore(),
                    chunk.getVectorScore()
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
