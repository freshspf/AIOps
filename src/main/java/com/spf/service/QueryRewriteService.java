package com.spf.service;

import com.alibaba.cloud.ai.dashscope.api.DashScopeApi;
import com.alibaba.cloud.ai.dashscope.chat.DashScopeChatModel;
import com.alibaba.cloud.ai.dashscope.chat.DashScopeChatOptions;
import com.spf.config.QueryRewriteConfig;
import com.spf.context.ConversationContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * Query 改写服务，提供两个能力：
 * 1. 多轮指代消解：将上下文相关的短 query 改写为自包含的完整 query
 * 2. HyDE：生成假设性回答文档，用于向量粗排（doc-to-doc 相似度高于 query-to-doc）
 */
@Service
public class QueryRewriteService {

    private static final Logger logger = LoggerFactory.getLogger(QueryRewriteService.class);

    @Autowired
    private QueryRewriteConfig config;

    @Value("${spring.ai.dashscope.api-key}")
    private String dashScopeApiKey;

    /**
     * 多轮指代消解：基于对话历史，将当前 query 改写为自包含的检索 query。
     * <p>
     * 示例：
     * - 历史："Redis 持久化有哪些方案？" → "RDB 和 AOF 两种方案..."
     * - 当前 query："它们各自的优势是什么？"
     * - 改写后："RDB 和 AOF 持久化方案各自的优势是什么？"
     *
     * @param originalQuery ReactAgent 传给工具的原始 query
     * @return 改写后的自包含 query；首轮对话或改写失败时返回原始 query
     */
    public String rewriteQuery(String originalQuery) {
        List<Map<String, String>> history = ConversationContext.getHistory();
        String summary = ConversationContext.getSummary();

        // 无历史上下文时跳过改写
        if ((history == null || history.isEmpty()) && (summary == null || summary.isEmpty())) {
            logger.debug("无对话历史，跳过 query 改写");
            return originalQuery;
        }

        try {
            DashScopeChatModel chatModel = createRewriteModel();

            StringBuilder promptBuilder = new StringBuilder();
            promptBuilder.append("你是一个查询改写助手。给定对话历史和用户的最新问题，");
            promptBuilder.append("将最新问题改写为一个独立、完整、自包含的搜索查询。\n");
            promptBuilder.append("要求：\n");
            promptBuilder.append("1. 消除指代词（它、它们、这个等），替换为具体实体\n");
            promptBuilder.append("2. 补全省略的上下文信息\n");
            promptBuilder.append("3. 只输出改写后的查询，不要解释\n");

            if (summary != null && !summary.isEmpty()) {
                promptBuilder.append("\n【早期对话摘要】\n").append(summary).append("\n");
            }

            if (history != null && !history.isEmpty()) {
                promptBuilder.append("\n【近期对话】\n");
                for (Map<String, String> msg : history) {
                    String role = msg.get("role");
                    String content = msg.get("content");
                    if ("user".equals(role)) {
                        promptBuilder.append("用户: ").append(content).append("\n");
                    } else if ("assistant".equals(role)) {
                        promptBuilder.append("助手: ").append(content).append("\n");
                    }
                }
            }

            promptBuilder.append("\n【最新问题】\n").append(originalQuery).append("\n");
            promptBuilder.append("\n【改写后的查询】\n");

            SystemMessage message = new SystemMessage(promptBuilder.toString());
            var response = chatModel.call(new Prompt(List.of(message)));
            String rewritten = response.getResult().getOutput().getText();

            if (rewritten != null && !rewritten.isBlank()) {
                rewritten = rewritten.trim();
                logger.info("Query 改写完成: '{}' → '{}'", originalQuery, rewritten);
                return rewritten;
            }

            return originalQuery;
        } catch (Exception e) {
            logger.warn("Query 改写失败，降级为原始 query: {}", e.getMessage());
            return originalQuery;
        }
    }

    /**
     * HyDE (Hypothetical Document Embedding)：生成一段假设性回答文档。
     * <p>
     * 用假设文档的 embedding 做向量检索，比用原始 query 检索效果更好，
     * 因为文档与文档之间的语义相似度高于短 query 与文档的相似度。
     *
     * @param query 改写后的自包含 query
     * @return 假设性回答文档文本；生成失败时返回 null
     */
    public String generateHyDE(String query) {
        try {
            DashScopeChatModel chatModel = createHyDEModel();

            String prompt = "请针对以下问题，直接生成一段简洁的回答文档（100-200字）。\n"
                    + "不要使用「根据文档」或「参考文档」等说法，直接给出专业、准确的回答内容。\n\n"
                    + "【问题】\n" + query;

            SystemMessage message = new SystemMessage(prompt);
            var response = chatModel.call(new Prompt(List.of(message)));
            String hydeText = response.getResult().getOutput().getText();

            if (hydeText != null && !hydeText.isBlank()) {
                hydeText = hydeText.trim();
                logger.info("HyDE 文档生成完成 ({}字), query='{}'", hydeText.length(), query);
                return hydeText;
            }

            return null;
        } catch (Exception e) {
            logger.warn("HyDE 生成失败，降级为原始 query: {}", e.getMessage());
            return null;
        }
    }

    private DashScopeChatModel createRewriteModel() {
        DashScopeApi api = DashScopeApi.builder().apiKey(dashScopeApiKey).build();
        return DashScopeChatModel.builder()
                .dashScopeApi(api)
                .defaultOptions(DashScopeChatOptions.builder()
                        .withModel(config.getModel())
                        .withTemperature(config.getTemperature())
                        .withMaxToken(config.getMaxTokens())
                        .build())
                .build();
    }

    private DashScopeChatModel createHyDEModel() {
        DashScopeApi api = DashScopeApi.builder().apiKey(dashScopeApiKey).build();
        return DashScopeChatModel.builder()
                .dashScopeApi(api)
                .defaultOptions(DashScopeChatOptions.builder()
                        .withModel(config.getModel())
                        .withTemperature(config.getHydeTemperature())
                        .withMaxToken(config.getHydeMaxTokens())
                        .build())
                .build();
    }
}
