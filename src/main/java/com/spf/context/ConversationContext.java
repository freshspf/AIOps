package com.spf.context;

import java.util.List;
import java.util.Map;

/**
 * 基于 ThreadLocal 的对话上下文持有器。
 * 在 ChatController 中设置，在 RetrievalPipelineService 中读取，
 * 用于 query 改写时获取当前会话的历史消息和摘要。
 */
public class ConversationContext {

    private static final ThreadLocal<List<Map<String, String>>> HISTORY = new ThreadLocal<>();
    private static final ThreadLocal<String> SUMMARY = new ThreadLocal<>();

    public static void set(List<Map<String, String>> history, String summary) {
        HISTORY.set(history);
        SUMMARY.set(summary);
    }

    public static List<Map<String, String>> getHistory() {
        return HISTORY.get();
    }

    public static String getSummary() {
        return SUMMARY.get();
    }

    public static void clear() {
        HISTORY.remove();
        SUMMARY.remove();
    }
}
