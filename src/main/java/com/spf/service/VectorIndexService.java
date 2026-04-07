package com.spf.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.milvus.client.MilvusServiceClient;
import io.milvus.grpc.QueryResults;
import io.milvus.grpc.MutationResult;
import io.milvus.param.R;
import io.milvus.param.RpcStatus;
import io.milvus.param.collection.LoadCollectionParam;
import io.milvus.param.dml.DeleteParam;
import io.milvus.param.dml.InsertParam;
import io.milvus.param.dml.QueryParam;
import io.milvus.response.QueryResultsWrapper;
import lombok.Getter;
import lombok.Setter;
import com.spf.constant.MilvusConstants;
import com.spf.dto.DocumentChunk;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 向量索引服务
 * 负责读取文件、生成向量、存储到 Milvus
 */
@Service
public class VectorIndexService {

    private static final Logger logger = LoggerFactory.getLogger(VectorIndexService.class);
    private static final long QUERY_FILE_CHUNKS_LIMIT = 16384L;
    private static final String META_SOURCE = "_source";
    private static final String META_FILE_NAME = "_file_name";
    private static final String META_EXTENSION = "_extension";
    private static final String META_CHUNK_INDEX = "chunkIndex";
    private static final String META_TOTAL_CHUNKS = "totalChunks";
    private static final String META_TITLE = "title";
    private static final String META_BREADCRUMB = "breadcrumb";
    private static final String META_RETRIEVAL_HASH = "retrievalHash";
    private static final String META_OCCURRENCE = "occurrence";

    @Autowired
    private MilvusServiceClient milvusClient;

    @Autowired
    private VectorEmbeddingService embeddingService;

    @Autowired
    private DocumentChunkService chunkService;

    @Value("${file.upload.path}")
    private String uploadPath;

    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 索引指定目录下的所有文件
     * 
     * @param directoryPath 目录路径（可选，默认使用配置的上传目录）
     * @return 索引结果  这里可以优化：定时重建目录下所有文件的索引
     */
    public IndexingResult indexDirectory(String directoryPath) {
        IndexingResult result = new IndexingResult();
        result.setStartTime(LocalDateTime.now());

        try {
            // 使用指定目录或默认上传目录
            String targetPath = (directoryPath != null && !directoryPath.trim().isEmpty()) 
                    ? directoryPath : uploadPath;
                    
            Path dirPath = Paths.get(targetPath).normalize();
            File directory = dirPath.toFile();
            
            if (!directory.exists() || !directory.isDirectory()) {
                throw new IllegalArgumentException("目录不存在或不是有效目录: " + targetPath);
            }

            result.setDirectoryPath(directory.getAbsolutePath());

            // 获取所有支持的文件
            File[] files = directory.listFiles((dir, name) -> 
                name.endsWith(".txt") || name.endsWith(".md")
            );

            if (files == null || files.length == 0) {
                logger.warn("目录中没有找到支持的文件: {}", targetPath);
                result.setTotalFiles(0);
                result.setSuccess(true);
                result.setEndTime(LocalDateTime.now());
                return result;
            }

            result.setTotalFiles(files.length);
            logger.info("开始索引目录: {}, 找到 {} 个文件", targetPath, files.length);

            // 遍历并索引每个文件
            for (File file : files) {
                try {
                    indexSingleFile(file.getAbsolutePath());
                    result.incrementSuccessCount();
                    logger.info("✓ 文件索引成功: {}", file.getName());
                } catch (Exception e) {
                    result.incrementFailCount();
                    result.addFailedFile(file.getAbsolutePath(), e.getMessage());
                    logger.error("✗ 文件索引失败: {}", file.getName(), e);
                }
            }

            result.setSuccess(result.getFailCount() == 0);
            result.setEndTime(LocalDateTime.now());

            logger.info("目录索引完成: 总数={}, 成功={}, 失败={}", 
                result.getTotalFiles(), result.getSuccessCount(), result.getFailCount());

            return result;

        } catch (Exception e) {
            logger.error("索引目录失败", e);
            result.setSuccess(false);
            result.setErrorMessage(e.getMessage());
            result.setEndTime(LocalDateTime.now());
            return result;
        }
    }

    /**
     * 索引单个文件
     * 
     * @param filePath 文件路径
     * @throws Exception 索引失败时抛出异常
     */
    public void indexSingleFile(String filePath) throws Exception {
        Path path = Paths.get(filePath).normalize();
        File file = path.toFile();
        
        if (!file.exists() || !file.isFile()) {
            throw new IllegalArgumentException("文件不存在: " + filePath);
        }

        logger.info("开始索引文件: {}", path);

        // 1. 读取文件内容
        String content = Files.readString(path);
        String normalizedPath = normalizePath(path);
        logger.info("读取文件: {}, 内容长度: {} 字符", path, content.length());

        // 2. 删除该文件的旧数据（如果存在）
        deleteExistingData(normalizedPath);

        // 3. 文档分片
        List<DocumentChunk> chunks = chunkService.chunkDocument(content, normalizedPath);
        List<ChunkDescriptor> descriptors = buildChunkDescriptors(chunks, normalizedPath);
        logger.info("文档分片完成: {} -> {} 个分片", filePath, chunks.size());

        // 4. 为每个分片生成向量并插入 Milvus
        for (int i = 0; i < descriptors.size(); i++) {
            ChunkDescriptor descriptor = descriptors.get(i);
            DocumentChunk chunk = descriptor.getChunk();
            
            try {
                // 插入到 Milvus
                insertChunk(descriptor);
                
                logger.info("✓ 分片 {}/{} 索引成功", i + 1, descriptors.size());

            } catch (Exception e) {
                logger.error("✗ 分片 {}/{} 索引失败", i + 1, descriptors.size(), e);
                throw new RuntimeException("分片索引失败: " + e.getMessage(), e);
            }
        }

        logger.info("文件索引完成: {}, 共 {} 个分片", filePath, chunks.size());
    }

    /**
     * 增量索引单个文件。
     * 未变化的 chunk 不操作；旧格式数据首次命中时退化为该文件全量重建。
     */
    public IncrementalIndexResult incrementalIndex(String filePath) throws Exception {
        Path path = Paths.get(filePath).normalize();
        File file = path.toFile();

        if (!file.exists() || !file.isFile()) {
            throw new IllegalArgumentException("文件不存在: " + filePath);
        }

        String normalizedPath = normalizePath(path);
        logger.info("开始增量索引文件: {}", normalizedPath);

        String content = Files.readString(path);
        List<DocumentChunk> newChunks = chunkService.chunkDocument(content, normalizedPath); // 分割 md 文档内容
        // 先把最新文件切成“可比较”的描述对象，后面增量判断只围绕 retrievalHash + occurrence 做。
        List<ChunkDescriptor> newDescriptors = buildChunkDescriptors(newChunks, normalizedPath);
        Map<String, ChunkDescriptor> newDescriptorMap = new LinkedHashMap<>();
        for (ChunkDescriptor descriptor : newDescriptors) {
            newDescriptorMap.put(descriptor.getChunkKey(), descriptor);
        }

        List<ExistingChunkRecord> existingChunks = queryExistingChunks(normalizedPath);
        IncrementalIndexResult result = new IncrementalIndexResult();
        result.setFilePath(normalizedPath);
        result.setOldChunkCount(existingChunks.size());
        result.setNewChunkCount(newDescriptors.size());

        if (containsLegacyChunks(existingChunks)) {
            // 旧格式 chunk 没有 retrievalHash / occurrence，无法做可靠对比，直接退回该文件一次全量重建。
            logger.info("检测到旧格式 chunk，退化为单文件全量重建: {}", normalizedPath);
            indexSingleFile(normalizedPath);
            result.setFallbackToFullRebuild(true);
            result.setRebuiltCount(newDescriptors.size());
            return result;
        }

        Map<String, ExistingChunkRecord> existingByKey = existingChunks.stream()
                .collect(Collectors.toMap(ExistingChunkRecord::getChunkKey, chunk -> chunk, (left, right) -> left, LinkedHashMap::new));

        List<String> deleteIds = new ArrayList<>();
        List<ChunkDescriptor> insertDescriptors = new ArrayList<>();

        for (Map.Entry<String, ExistingChunkRecord> entry : existingByKey.entrySet()) {
            String chunkKey = entry.getKey();
            ExistingChunkRecord existing = entry.getValue();
            ChunkDescriptor fresh = newDescriptorMap.get(chunkKey);

            if (fresh == null) {
                // 旧有新无：说明这个 chunk 在新版本里消失了，需要删掉旧记录。
                deleteIds.add(existing.getId());
                result.incrementDeletedCount();
                continue;
            }

            // key 一致就视为同一个 chunk 实例；当前版本不让 chunkIndex / totalChunks 触发重建。
            result.incrementUnchangedCount();
        }

        for (Map.Entry<String, ChunkDescriptor> entry : newDescriptorMap.entrySet()) {
            if (!existingByKey.containsKey(entry.getKey())) {
                // 新有旧无：要么是首次新增，要么是正文/标题路径变化后形成了新的 retrievalHash。
                insertDescriptors.add(entry.getValue());
                result.incrementInsertedCount();
            }
        }

        if (!deleteIds.isEmpty()) {
            batchDeleteByIds(deleteIds);
        }

        for (ChunkDescriptor descriptor : insertDescriptors) {
            insertChunk(descriptor);
        }

        logger.info(
                "文件增量索引完成: {}, old={}, new={}, unchanged={}, deleted={}, inserted={}, rebuilt={}, fallback={}",
                normalizedPath,
                result.getOldChunkCount(),
                result.getNewChunkCount(),
                result.getUnchangedCount(),
                result.getDeletedCount(),
                result.getInsertedCount(),
                result.getRebuiltCount(),
                result.isFallbackToFullRebuild()
        );

        return result;
    }

    /**
     * 删除文件的旧数据（根据 metadata._source）
     */
    private void deleteExistingData(String filePath) {
        try {
            String normalizedPath = normalizePath(Paths.get(filePath).normalize());
            
            // 构建删除表达式：metadata["_source"] == "xxx"
            String expr = String.format("metadata[\"%s\"] == \"%s\"", META_SOURCE, normalizedPath);
            
            logger.info("准备删除旧数据，路径: {}, 表达式: {}", normalizedPath, expr);

            if (!ensureCollectionLoaded()) {
                return;
            }

            DeleteParam deleteParam = DeleteParam.newBuilder()
                    .withCollectionName(MilvusConstants.MILVUS_COLLECTION_NAME)
                    .withExpr(expr)
                    .build();

            R<MutationResult> response = milvusClient.delete(deleteParam);

            if (response.getStatus() != 0) {
                logger.warn("删除旧数据时出现警告: {}", response.getMessage());
            } else {
                long deletedCount = response.getData().getDeleteCnt();
                logger.info("✓ 已删除文件的旧数据: {}, 删除记录数: {}", normalizedPath, deletedCount);
            }

        } catch (Exception e) {
            logger.warn("删除旧数据失败（可能是首次索引）: {}", e.getMessage());
        }
    }

    /**
     * 构建元数据（包含文件信息）
     */
    private Map<String, Object> buildMetadata(String filePath, DocumentChunk chunk, int totalChunks,
                                              String retrievalHash, int occurrence) {
        Map<String, Object> metadata = new HashMap<>();
        
        Path path = Paths.get(filePath).normalize();
        String normalizedPath = normalizePath(path);
        
        // 文件信息
        Path fileName = path.getFileName();
        String fileNameStr = fileName != null ? fileName.toString() : "";
        String extension = "";
        int dotIndex = fileNameStr.lastIndexOf('.');
        if (dotIndex > 0) {
            extension = fileNameStr.substring(dotIndex);
        }
        
        metadata.put(META_SOURCE, normalizedPath);
        metadata.put(META_EXTENSION, extension);
        metadata.put(META_FILE_NAME, fileNameStr);
        
        // 分片信息
        metadata.put(META_CHUNK_INDEX, chunk.getChunkIndex());
        metadata.put(META_TOTAL_CHUNKS, totalChunks);
        
        // 标题信息
        if (chunk.getTitle() != null && !chunk.getTitle().isEmpty()) {
            metadata.put(META_TITLE, chunk.getTitle());
        }

        // 面包屑路径
        if (chunk.getBreadcrumb() != null && !chunk.getBreadcrumb().isEmpty()) {
            metadata.put(META_BREADCRUMB, chunk.getBreadcrumb());
        }

        metadata.put(META_RETRIEVAL_HASH, retrievalHash);
        metadata.put(META_OCCURRENCE, occurrence);
        
        return metadata;
    }

    /**
     * 插入向量到 Milvus
     */
    private void insertToMilvus(String id, String content, List<Float> vector,
                                Map<String, Object> metadata, int chunkIndex) throws Exception {
        try {
            if (!ensureCollectionLoaded()) {
                throw new RuntimeException("加载 collection 失败");
            }

            String source = (String) metadata.get(META_SOURCE);

            // 构建字段数据
            List<InsertParam.Field> fields = new ArrayList<>();
            
            // ID 字段
            fields.add(new InsertParam.Field("id", Collections.singletonList(id)));
            
            // content 字段
            fields.add(new InsertParam.Field("content", Collections.singletonList(content)));
            
            // vector 字段
            fields.add(new InsertParam.Field("vector", Collections.singletonList(vector)));
            
            // metadata 字段（JSON 对象）
            com.google.gson.Gson gson = new com.google.gson.Gson();
            com.google.gson.JsonObject metadataJson = gson.toJsonTree(metadata).getAsJsonObject();
            fields.add(new InsertParam.Field("metadata", Collections.singletonList(metadataJson)));

            // 构建插入参数
            InsertParam insertParam = InsertParam.newBuilder()
                    .withCollectionName(MilvusConstants.MILVUS_COLLECTION_NAME)
                    .withFields(fields)
                    .build();

            // 执行插入
            R<MutationResult> insertResponse = milvusClient.insert(insertParam);

            if (insertResponse.getStatus() != 0) {
                throw new RuntimeException("插入向量失败: " + insertResponse.getMessage());
            }

            logger.debug("向量插入成功: id={}, source={}, chunk={}", id, source, chunkIndex);

        } catch (Exception e) {
            logger.error("插入向量到 Milvus 失败", e);
            throw e;
        }
    }

    private void insertChunk(ChunkDescriptor descriptor) throws Exception {
        List<Float> vector = embeddingService.generateEmbedding(descriptor.getRetrievalText());
        insertToMilvus(
                descriptor.getChunkKey(),
                descriptor.getChunk().getContent(),
                vector,
                descriptor.getMetadata(),
                descriptor.getChunk().getChunkIndex()
        );
    }

    private List<ChunkDescriptor> buildChunkDescriptors(List<DocumentChunk> chunks, String normalizedPath) {
        List<ChunkDescriptor> descriptors = new ArrayList<>();
        Map<String, Integer> occurrenceCounters = new HashMap<>();

        for (DocumentChunk chunk : chunks) {
            String retrievalText = chunkService.buildEmbeddingText(chunk);
            String retrievalHash = md5Hex(retrievalText);
            // 同文件内相同 retrievalHash 可能出现多次，靠 occurrence 保证这些重复 chunk 彼此可区分。
            int occurrence = occurrenceCounters.getOrDefault(retrievalHash, 0);
            occurrenceCounters.put(retrievalHash, occurrence + 1);
            String chunkKey = buildChunkKey(normalizedPath, retrievalHash, occurrence);
            Map<String, Object> metadata = buildMetadata(
                    normalizedPath,
                    chunk,
                    chunks.size(),
                    retrievalHash,
                    occurrence
            );
            descriptors.add(new ChunkDescriptor(chunk, retrievalText, retrievalHash, occurrence, chunkKey, metadata));
        }

        return descriptors;
    }

    private List<ExistingChunkRecord> queryExistingChunks(String filePath) {
        String normalizedPath = normalizePath(Paths.get(filePath).normalize());
        String expr = String.format("metadata[\"%s\"] == \"%s\"", META_SOURCE, normalizedPath);

        try {
            if (!ensureCollectionLoaded()) {
                throw new RuntimeException("加载 collection 失败");
            }

            QueryParam queryParam = QueryParam.newBuilder()
                    .withCollectionName(MilvusConstants.MILVUS_COLLECTION_NAME)
                    .withExpr(expr)
                    .withOutFields(List.of("id", "metadata"))
                    .withOffset(0L)
                    .withLimit(QUERY_FILE_CHUNKS_LIMIT)
                    .build();

            R<QueryResults> response = milvusClient.query(queryParam);
            if (response.getStatus() != 0) {
                throw new RuntimeException("查询已有 chunk 失败: " + response.getMessage());
            }

            // 查询阶段只取 id + metadata，避免把旧正文全拉回来；增量判断靠 chunkKey 即可完成。
            QueryResultsWrapper wrapper = new QueryResultsWrapper(response.getData());
            List<ExistingChunkRecord> chunks = new ArrayList<>();
            for (QueryResultsWrapper.RowRecord row : wrapper.getRowRecords()) {
                String id = asString(row.get("id"));
                Map<String, Object> metadata = parseMetadataObject(row.get("metadata"));
                chunks.add(new ExistingChunkRecord(id, metadata));
            }
            return chunks;
        } catch (Exception e) {
            logger.error("查询已有 chunk 失败: {}", normalizedPath, e);
            throw new RuntimeException("查询已有 chunk 失败: " + e.getMessage(), e);
        }
    }

    private boolean containsLegacyChunks(List<ExistingChunkRecord> chunks) {
        return chunks.stream().anyMatch(chunk ->
                chunk.getRetrievalHash() == null
                        || chunk.getOccurrence() == null
        );
    }

    private void batchDeleteByIds(List<String> ids) {
        if (ids.isEmpty()) {
            return;
        }

        try {
            if (!ensureCollectionLoaded()) {
                throw new RuntimeException("加载 collection 失败");
            }

            // 这里按主键删，避免重新拼 _source 条件时误删同文件下仍然需要保留的 chunk。
            String expr = ids.stream()
                    .map(id -> "\"" + id.replace("\"", "\\\"") + "\"")
                    .collect(Collectors.joining(",", "id in [", "]"));

            DeleteParam deleteParam = DeleteParam.newBuilder()
                    .withCollectionName(MilvusConstants.MILVUS_COLLECTION_NAME)
                    .withExpr(expr)
                    .build();

            R<MutationResult> response = milvusClient.delete(deleteParam);
            if (response.getStatus() != 0) {
                throw new RuntimeException("批量删除 chunk 失败: " + response.getMessage());
            }

            logger.info("批量删除旧 chunk 成功: count={}", ids.size());
        } catch (Exception e) {
            logger.error("批量删除 chunk 失败", e);
            throw new RuntimeException("批量删除 chunk 失败: " + e.getMessage(), e);
        }
    }

    private boolean ensureCollectionLoaded() {
        R<RpcStatus> loadResponse = milvusClient.loadCollection(
                LoadCollectionParam.newBuilder()
                        .withCollectionName(MilvusConstants.MILVUS_COLLECTION_NAME)
                        .build()
        );

        if (loadResponse.getStatus() != 0 && loadResponse.getStatus() != 65535) {
            logger.warn("加载 collection 失败: {}", loadResponse.getMessage());
            return false;
        }
        return true;
    }

    private String buildChunkKey(String normalizedPath, String retrievalHash, int occurrence) {
        return normalizedPath + ":" + retrievalHash + ":" + occurrence;
    }

    private String normalizePath(Path path) {
        return path.toString().replace(File.separator, "/");
    }

    private String md5Hex(String text) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] digest = md.digest(text.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception e) {
            throw new RuntimeException("计算 MD5 失败", e);
        }
    }

    private Map<String, Object> parseMetadataObject(Object metadataObject) {
        try {
            if (metadataObject == null) {
                return new LinkedHashMap<>();
            }
            if (metadataObject instanceof Map<?, ?> metadataMap) {
                return objectMapper.convertValue(metadataMap, new TypeReference<>() {});
            }
            return objectMapper.readValue(String.valueOf(metadataObject), new TypeReference<>() {});
        } catch (Exception e) {
            logger.warn("解析 metadata 失败: {}", metadataObject, e);
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

    /**
     * 索引结果类
     */
    @Getter
    public static class IndexingResult {
        @Setter
        private boolean success;
        @Setter
        private String directoryPath;
        @Setter
        private int totalFiles;
        private int successCount;
        private int failCount;
        @Setter
        private LocalDateTime startTime;
        @Setter
        private LocalDateTime endTime;
        @Setter
        private String errorMessage;
        private Map<String, String> failedFiles = new HashMap<>();

        public void incrementSuccessCount() {
            this.successCount++;
        }

        public void incrementFailCount() {
            this.failCount++;
        }

        public long getDurationMs() {
            if (startTime != null && endTime != null) {
                return java.time.Duration.between(startTime, endTime).toMillis();
            }
            return 0;
        }

        public void addFailedFile(String filePath, String error) {
            this.failedFiles.put(filePath, error);
        }
    }

    @Getter
    public static class IncrementalIndexResult {
        @Setter
        private String filePath;
        @Setter
        private int oldChunkCount;
        @Setter
        private int newChunkCount;
        private int unchangedCount;
        private int deletedCount;
        private int insertedCount;
        @Setter
        private int rebuiltCount;
        @Setter
        private boolean fallbackToFullRebuild;

        public void incrementUnchangedCount() {
            this.unchangedCount++;
        }

        public void incrementDeletedCount() {
            this.deletedCount++;
        }

        public void incrementInsertedCount() {
            this.insertedCount++;
        }

        public void incrementRebuiltCount() {
            this.rebuiltCount++;
        }
    }

    @Getter
    private static class ChunkDescriptor {
        private final DocumentChunk chunk;
        private final String retrievalText;
        private final String retrievalHash;
        private final int occurrence;
        private final String chunkKey;
        private final Map<String, Object> metadata;

        private ChunkDescriptor(DocumentChunk chunk, String retrievalText, String retrievalHash, int occurrence,
                                String chunkKey, Map<String, Object> metadata) {
            this.chunk = chunk;
            this.retrievalText = retrievalText;
            this.retrievalHash = retrievalHash;
            this.occurrence = occurrence;
            this.chunkKey = chunkKey;
            this.metadata = metadata;
        }
    }

    @Getter
    private static class ExistingChunkRecord {
        private final String id;
        private final Map<String, Object> metadata;

        private ExistingChunkRecord(String id, Map<String, Object> metadata) {
            this.id = id;
            this.metadata = metadata;
        }

        private String getChunkKey() {
            String source = valueAsString(META_SOURCE);
            String retrievalHash = getRetrievalHash();
            Integer occurrence = getOccurrence();
            if (source == null || retrievalHash == null || occurrence == null) {
                return null;
            }
            return source + ":" + retrievalHash + ":" + occurrence;
        }

        private String getRetrievalHash() {
            return valueAsString(META_RETRIEVAL_HASH);
        }

        private Integer getOccurrence() {
            Object value = metadata.get(META_OCCURRENCE);
            if (value instanceof Number number) {
                return number.intValue();
            }
            if (value == null) {
                return null;
            }
            try {
                return Integer.parseInt(String.valueOf(value));
            } catch (NumberFormatException e) {
                return null;
            }
        }

        private String valueAsString(String key) {
            Object value = metadata.get(key);
            return value == null ? null : String.valueOf(value);
        }
    }
}
