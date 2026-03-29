package com.spf.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.milvus.client.MilvusServiceClient;
import io.milvus.grpc.SearchResults;
import io.milvus.param.R;
import io.milvus.param.RpcStatus;
import io.milvus.param.collection.LoadCollectionParam;
import io.milvus.param.dml.SearchParam;
import io.milvus.response.SearchResultsWrapper;
import lombok.Getter;
import lombok.Setter;
import com.spf.constant.MilvusConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 向量搜索服务
 * 负责从 Milvus 中搜索相似向量
 */
@Service
public class VectorSearchService {

    private static final Logger logger = LoggerFactory.getLogger(VectorSearchService.class);

    @Autowired
    private MilvusServiceClient milvusClient;

    @Autowired
    private VectorEmbeddingService embeddingService;

    @Value("${rag.search.nprobe:16}")
    private int nprobe;

    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 搜索相似文档
     * 
     * @param query 查询文本
     * @param topK 返回最相似的K个结果
     * @return 搜索结果列表
     */
    public List<SearchResult> searchSimilarDocuments(String query, int topK) {
        try {
            logger.info("开始搜索相似文档, 查询: {}, topK: {}", query, topK);

            // 0. 确保 collection 已加载到内存
            R<RpcStatus> loadResponse = milvusClient.loadCollection(
                LoadCollectionParam.newBuilder()
                    .withCollectionName(MilvusConstants.MILVUS_COLLECTION_NAME)
                    .build()
            );

            // 状态码 65535 表示集合已经加载，这不是错误
            if (loadResponse.getStatus() != 0 && loadResponse.getStatus() != 65535) {
                logger.warn("加载 collection 失败: {}", loadResponse.getMessage());
                throw new RuntimeException("加载 collection 失败: " + loadResponse.getMessage());
            }
            logger.debug("Collection 已加载到内存");

            // 1. 将查询文本向量化
            List<Float> queryVector = embeddingService.generateQueryVector(query);
            logger.debug("查询向量生成成功, 维度: {}", queryVector.size());

            // 2. 构建搜索参数
            SearchParam searchParam = SearchParam.newBuilder()
                    .withCollectionName(MilvusConstants.MILVUS_COLLECTION_NAME)
                    .withVectorFieldName("vector")
                    .withVectors(Collections.singletonList(queryVector))
                    .withTopK(topK)
                    .withMetricType(io.milvus.param.MetricType.L2)
                    .withOutFields(List.of("id", "content", "metadata"))
                    .withParams(String.format("{\"nprobe\":%d}", nprobe))
                    .build();

            // 3. 执行搜索
            R<SearchResults> searchResponse = milvusClient.search(searchParam);

            if (searchResponse.getStatus() != 0) {
                throw new RuntimeException("向量搜索失败: " + searchResponse.getMessage());
            }

            // 4. 解析搜索结果
            SearchResultsWrapper wrapper = new SearchResultsWrapper(searchResponse.getData().getResults());
            List<SearchResult> results = new ArrayList<>();

            for (int i = 0; i < wrapper.getRowRecords(0).size(); i++) {
                SearchResult result = new SearchResult();
                result.setId((String) wrapper.getIDScore(0).get(i).get("id"));
                result.setContent((String) wrapper.getFieldData("content", 0).get(i));
                float rawScore = wrapper.getIDScore(0).get(i).getScore();
                result.setRawScore(rawScore);
                result.setScore(normalizeL2Score(rawScore));
                
                // 解析 metadata
                Object metadataObj = wrapper.getFieldData("metadata", 0).get(i);
                if (metadataObj != null) {
                    String metadataJson = metadataObj.toString();
                    result.setMetadata(metadataJson);
                    Map<String, Object> metadataMap = parseMetadata(metadataJson);
                    result.setMetadataMap(metadataMap);
                    result.setSource(asString(metadataMap.get("_source")));
                    result.setFileName(asString(metadataMap.get("_file_name")));
                    result.setTitle(asString(metadataMap.get("title")));
                    result.setChunkIndex(asInteger(metadataMap.get("chunkIndex")));
                }
                
                results.add(result);
            }

            logger.info("搜索完成, 找到 {} 个相似文档", results.size());
            return results;

        } catch (Exception e) {
            logger.error("搜索相似文档失败", e);
            throw new RuntimeException("搜索失败: " + e.getMessage(), e);
        }
    }

    /**
     * 搜索结果类
     */
    @Setter
    @Getter
    public static class SearchResult {
        private String id;
        private String content;
        private float score;
        private float rawScore;
        private String metadata;
        private Map<String, Object> metadataMap = new LinkedHashMap<>();
        private String source;
        private String fileName;
        private String title;
        private Integer chunkIndex;

    }

    private float normalizeL2Score(float rawScore) {
        return 1.0F / (1.0F + Math.max(rawScore, 0.0F));
    }

    private Map<String, Object> parseMetadata(String metadataJson) {
        try {
            return objectMapper.readValue(metadataJson, new TypeReference<>() {});
        } catch (Exception e) {
            logger.warn("解析 metadata 失败: {}", metadataJson, e);
            return new LinkedHashMap<>();
        }
    }

    private String asString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private Integer asInteger(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
