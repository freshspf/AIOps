package com.spf.dto;

import lombok.Getter;
import lombok.Setter;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 两阶段检索链路中的统一候选块表示。
 */
@Getter
@Setter
public class RetrievedChunk {

    private String id;
    private String content;
    private float vectorScore;
    private float rawVectorScore;
    private float rerankScore;
    private float finalScore;
    private Map<String, Object> metadata = new LinkedHashMap<>();
    private String source;
    private String fileName;
    private String title;
    private Integer chunkIndex;

    public String getSourceKey() {
        if (source != null && !source.isBlank()) {
            return source;
        }
        if (fileName != null && !fileName.isBlank()) {
            return fileName;
        }
        return "unknown";
    }
}
