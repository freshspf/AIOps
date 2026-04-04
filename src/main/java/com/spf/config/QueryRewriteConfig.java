package com.spf.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Query 改写配置（多轮指代消解 + HyDE）
 */
@Getter
@Setter
@Configuration
@ConfigurationProperties(prefix = "rag.query-rewrite")
public class QueryRewriteConfig {

    /** 是否启用 query 改写（指代消解） */
    private boolean enabled = true;

    /** 改写使用的轻量模型 */
    private String model = "qwen-turbo";

    /** 改写最大输出 token */
    private int maxTokens = 200;

    /** 改写温度 */
    private double temperature = 0.3;

    /** 是否启用 HyDE（假设文档嵌入） */
    private boolean hydeEnabled = true;

    /** HyDE 假设文档最大 token */
    private int hydeMaxTokens = 300;

    /** HyDE 生成温度（略高以生成更自然的文本） */
    private double hydeTemperature = 0.5;
}
