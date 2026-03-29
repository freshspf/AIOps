package com.spf.controller;

import com.spf.dto.RetrievedChunk;
import com.spf.service.RetrievalPipelineService;
import com.spf.service.VectorSearchService;
import lombok.Getter;
import lombok.Setter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

/**
 * RAG 评估控制器
 * 提供用于评估 RAG（检索增强生成）系统检索质量的 API 接口
 * 支持两种检索模式：
 * 1. 基础检索：直接使用 Milvus 向量检索结果
 * 2. 流水线检索：支持粗排 + 重排序的两阶段检索
 * 
 * @author SuperBizAgent Team
 */
@RestController
@RequestMapping("/api/eval")
public class EvalController {

    private static final Logger logger = LoggerFactory.getLogger(EvalController.class);

    @Autowired
    private VectorSearchService vectorSearchService;

    @Autowired
    private RetrievalPipelineService retrievalPipelineService;

    @Value("${rag.rerank.enabled:true}")
    private boolean rerankEnabledDefault;

    /**
     * 基础检索接口
     * 直接调用 Milvus 向量检索，返回 topK 个最相似的文档 chunk
     * 
     * 工作流程:
     * 1. 接收查询请求和参数配置
     * 2. 调用 VectorSearchService 进行向量相似度检索
     * 3. 截取前 topK 个结果并转换为响应格式
     * 4. 返回检索结果和性能指标
     * 
     * @param request 检索请求参数
     * @return 包含检索结果的统一响应对象
     */
    @PostMapping("/retrieve")
    public ResponseEntity<ApiResponse<EvalRetrieveResponse>> retrieve(
            @RequestBody EvalRetrieveRequest request) {
        try {
            // 提取请求参数，设置默认值
            String query = request.getQuery();
            int topK = request.getTopK() != null ? request.getTopK() : 3;
            int recallTopK = request.getRecallTopK() != null ? request.getRecallTopK() : 12;
            boolean enableRerank = request.getEnableRerank() != null ? request.getEnableRerank() : rerankEnabledDefault;
            int perDocCap = request.getPerDocCap() != null ? request.getPerDocCap() : 2;

            // 记录请求日志
            logger.info("Eval retrieve - query: '{}', topK: {}, recallTopK: {}, rerank: {}, perDocCap: {}",
                    query, topK, recallTopK, enableRerank, perDocCap);

            // 执行向量检索并统计耗时
            long startTime = System.currentTimeMillis();
            List<VectorSearchService.SearchResult> coarseResults =
                    vectorSearchService.searchSimilarDocuments(query, recallTopK);
            long vectorSearchTime = System.currentTimeMillis() - startTime;

            // 将检索结果转换为响应格式，限制返回 topK 条
            List<EvalResultItem> items = coarseResults.stream()
                    .limit(topK)
                    .map(r -> {
                        EvalResultItem item = new EvalResultItem();
                        item.setId(r.getId());
                        item.setContent(r.getContent());
                        item.setScore(r.getScore());
                        item.setFileName(r.getFileName());
                        item.setTitle(r.getTitle());
                        item.setChunkIndex(r.getChunkIndex());
                        return item;
                    })
                    .collect(Collectors.toList());

            // 构建响应对象
            EvalRetrieveResponse response = new EvalRetrieveResponse();
            response.setQuery(query);
            response.setItems(items);
            response.setTotalFound(coarseResults.size());
            response.setVectorSearchTimeMs(vectorSearchTime);

            return ResponseEntity.ok(ApiResponse.success(response));

        } catch (Exception e) {
            logger.error("Eval retrieve failed", e);
            return ResponseEntity.ok(ApiResponse.error(e.getMessage()));
        }
    }
    /**
     * 流水线检索接口（两阶段检索）
     * 支持粗排 + 重排序的完整检索流程
     * 
     * 工作流程:
     * 1. 第一阶段 - 粗排：使用 Milvus 向量检索召回 recallTopK 个候选结果
     * 2. 第二阶段 - 精排：启用重排序模型对候选结果进行重新排序
     * 3. 返回粗排和精排两个阶段的结果及性能指标
     * 
     * @param request 流水线检索请求参数
     * @return 包含两阶段检索结果的统一响应对象
     */
    @PostMapping("/retrieve_pipeline")
    public ResponseEntity<ApiResponse<EvalPipelineResponse>> retrievePipeline(
            @RequestBody EvalPipelineRequest request) {
        try {
            // 提取请求参数，设置默认值
            String query = request.getQuery();
            int finalTopK = request.getFinalTopK() != null ? request.getFinalTopK() : 3;
            int recallTopK = request.getRecallTopK() != null ? request.getRecallTopK() : 12;
            int perDocCap = request.getPerDocCap() != null ? request.getPerDocCap() : 2;
            boolean enableRerank = request.getEnableRerank() != null ? request.getEnableRerank() : rerankEnabledDefault;

            // 记录请求日志
            logger.info("Eval pipeline - query: '{}', finalTopK: {}, recallTopK: {}, rerank: {}, perDocCap: {}",
                    query, finalTopK, recallTopK, enableRerank, perDocCap);

            // 记录开始时间，用于统计总耗时
            long startTime = System.currentTimeMillis();

            // 第一阶段：向量检索召回
            List<VectorSearchService.SearchResult> coarseResults =
                    vectorSearchService.searchSimilarDocuments(query, recallTopK);
            long vectorSearchTime = System.currentTimeMillis() - startTime;

            // 将粗排结果转换为响应格式（仅取前 10 个用于展示）
            List<EvalResultItem> coarseItems = coarseResults.stream()
                    .limit(10)
                    .map(r -> {
                        EvalResultItem item = new EvalResultItem();
                        item.setId(r.getId());
                        item.setContent(r.getContent());
                        item.setScore(r.getScore());
                        item.setFileName(r.getFileName());
                        item.setTitle(r.getTitle());
                        item.setChunkIndex(r.getChunkIndex());
                        return item;
                    })
                    .collect(Collectors.toList());

            // 初始化最终结果为粗排结果
            List<EvalResultItem> finalItems = coarseItems;
            int finalCount = 0;

            // 如果启用重排序，则执行第二阶段精排
            if (enableRerank) {
                // 调用检索流水线服务进行重排序
                List<RetrievedChunk> rankedChunks = retrievalPipelineService.retrieve(query);
                // 取前 finalTopK 个作为最终结果
                finalItems = rankedChunks.stream()
                        .limit(finalTopK)
                        .map(r -> {
                            EvalResultItem item = new EvalResultItem();
                            item.setId(r.getId());
                            item.setContent(r.getContent());
                            item.setScore(r.getFinalScore());
                            item.setFileName(r.getFileName());
                            item.setTitle(r.getTitle());
                            item.setChunkIndex(r.getChunkIndex());
                            return item;
                        })
                        .collect(Collectors.toList());
                finalCount = rankedChunks.size();
            }

            // 计算总耗时
            long totalTime = System.currentTimeMillis() - startTime;

            // 构建响应对象
            EvalPipelineResponse response = new EvalPipelineResponse();
            response.setQuery(query);
            response.setCoarseResults(coarseItems);
            response.setFinalResults(finalItems);
            response.setCoarseCount(coarseResults.size());
            response.setFinalCount(finalCount);
            response.setVectorSearchTimeMs(vectorSearchTime);
            response.setTotalTimeMs(totalTime);
            response.setRerankEnabled(enableRerank);

            return ResponseEntity.ok(ApiResponse.success(response));

        } catch (Exception e) {
            logger.error("Eval pipeline failed", e);
            return ResponseEntity.ok(ApiResponse.error(e.getMessage()));
        }
    }

    /**
     * 基础检索请求参数
     * 用于接收客户端发送的检索请求配置
     */
    @Getter
    @Setter
    public static class EvalRetrieveRequest {
        /** 查询文本 */
        private String query;
        /** 返回的结果数量，默认值由控制器逻辑处理 */
        private Integer topK;
        /** 召回阶段的候选集大小，默认值由控制器逻辑处理 */
        private Integer recallTopK;
        /** 是否启用重排序，null 时使用配置文件默认值 */
        private Boolean enableRerank;
        /** 每个文档的最大保留 chunk 数量，用于结果去重 */
        private Integer perDocCap;
    }

    /**
     * 基础检索响应参数
     * 包含检索结果和性能指标
     */
    @Getter
    @Setter
    public static class EvalRetrieveResponse {
        /** 原始查询文本 */
        private String query;
        /** 检索结果列表 */
        private List<EvalResultItem> items;
        /** 召回的总结果数量 */
        private int totalFound;
        /** 向量检索耗时（毫秒） */
        private long vectorSearchTimeMs;
    }

    /**
     * 流水线检索请求参数
     * 支持两阶段检索的配置参数
     */
    @Getter
    @Setter
    public static class EvalPipelineRequest {
        /** 查询文本 */
        private String query;
        /** 最终返回的结果数量 */
        private Integer finalTopK;
        /** 召回阶段的候选集大小，通常大于 finalTopK */
        private Integer recallTopK;
        /** 每个文档的最大保留 chunk 数量 */
        private Integer perDocCap;
        /** 是否启用重排序流程 */
        private Boolean enableRerank;
    }

    /**
     * 流水线检索响应参数
     * 包含粗排和精排两个阶段的结果及性能指标
     */
    @Getter
    @Setter
    public static class EvalPipelineResponse {
        /** 原始查询文本 */
        private String query;
        /** 粗排阶段的结果（未经重排序） */
        private List<EvalResultItem> coarseResults;
        /** 最终结果（经过重排序） */
        private List<EvalResultItem> finalResults;
        /** 粗排阶段召回的总数量 */
        private int coarseCount;
        /** 最终结果的数量 */
        private int finalCount;
        /** 向量检索耗时（毫秒） */
        private long vectorSearchTimeMs;
        /** 总耗时（包括重排序）（毫秒） */
        private long totalTimeMs;
        /** 重排序功能是否启用 */
        private boolean rerankEnabled;
    }

    /**
     * 检索结果项
     * 表示单个检索到的文档 chunk
     */
    @Getter
    @Setter
    public static class EvalResultItem {
        /** Chunk 的唯一标识符 */
        private String id;
        /** Chunk 的文本内容 */
        private String content;
        /** 相似度得分或重排序得分 */
        private float score;
        /** 所属文档的文件名 */
        private String fileName;
        /** 文档标题 */
        private String title;
        /** Chunk 在文档中的索引位置 */
        private Integer chunkIndex;
    }

    /**
     * 统一 API 响应包装类
     * 所有接口返回的标准格式封装
     * 
     * @param <T> 响应数据的类型
     */
    @Getter
    @Setter
    public static class ApiResponse<T> {
        /** 响应状态码：200 表示成功，500 表示错误 */
        private int code;
        /** 响应消息 */
        private String message;
        /** 响应数据负载 */
        private T data;

        /**
         * 创建成功的响应
         *
         * @param data 要返回的数据
         * @param <T> 数据类型
         * @return 包装后的成功响应
         */
        public static <T> ApiResponse<T> success(T data) {
            ApiResponse<T> response = new ApiResponse<>();
            response.setCode(200);
            response.setMessage("success");
            response.setData(data);
            return response;
        }

        /**
         * 创建错误的响应
         *
         * @param message 错误消息
         * @param <T> 数据类型（通常为 null）
         * @return 包装后的错误响应
         */
        public static <T> ApiResponse<T> error(String message) {
            ApiResponse<T> response = new ApiResponse<>();
            response.setCode(500);
            response.setMessage(message);
            return response;
        }
    }
}
