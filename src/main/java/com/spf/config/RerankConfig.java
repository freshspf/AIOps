package com.spf.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Rerank 配置。
 */
@Getter
@Setter
@Configuration
@ConfigurationProperties(prefix = "rag.rerank")
public class RerankConfig {

    private boolean enabled = true;
    private String provider = "dashscope";
    private String model = "qwen3-rerank";
    private String baseUrl = "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank";
    private int timeoutMs = 10000;
    private int maxInputChars = 1200;
    private String instruct = "Given a user query, retrieval a list of passages that are relevant to the query";
}
