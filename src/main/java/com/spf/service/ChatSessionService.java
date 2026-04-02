package com.spf.service;

import lombok.extern.slf4j.Slf4j;
import com.spf.dto.ChatMessage;
import com.spf.dto.ChatSession;
import com.spf.dto.SessionListResponse;
import com.spf.repository.ChatSessionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 聊天会话管理服务
 */
@Slf4j
@Service
public class ChatSessionService {

    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int MAX_HISTORY_LIMIT = 100;

    @Autowired
    private ChatSessionRepository repository;

    // ==================== 会话管理 ====================

    /**
     * 获取或创建会话
     */
    public ChatSession getOrCreateSession(String sessionId) {
        if (!StringUtils.hasText(sessionId)) {
            sessionId = UUID.randomUUID().toString();
        }

        ChatSession session = repository.getSession(sessionId);

        if (session == null) {
            session = ChatSession.create(sessionId);
            repository.saveSession(session);
            log.info("创建新会话: {}", sessionId);
        } else {
            log.debug("获取已存在会话: {}", sessionId);
        }

        return session;
    }

    /**
     * 删除会话
     */
    public void deleteSession(String sessionId) {
        repository.clearMessages(sessionId);
        repository.deleteSession(sessionId);
        log.info("删除会话: {}", sessionId);
    }

    // ==================== 消息管理 ====================

    /**
     * 添加一对消息（用户问题 + AI回复）
     */
    public void addMessage(String sessionId, String userQuestion, String aiAnswer) {
        ChatMessage userMsg = ChatMessage.userMessage(userQuestion);
        repository.addMessage(sessionId, userMsg);

        ChatMessage assistantMsg = ChatMessage.assistantMessage(aiAnswer);
        repository.addMessage(sessionId, assistantMsg);

        // 更新会话元数据
        ChatSession session = repository.getSession(sessionId);
        if (session != null) {
            session.touch();
            session.incrementMessageCount();
            repository.updateSession(session);
        }

        log.debug("添加消息对到会话 {}: 用户消息长度={}, AI回复长度={}",
            sessionId, userQuestion.length(), aiAnswer.length());
    }

    /**
     * 获取会话历史消息
     * @param sessionId 会话ID
     * @param limit 消息数量限制，null 或 0 表示全部
     */
    public List<ChatMessage> getSessionHistory(String sessionId, Integer limit) {
        int actualLimit = (limit != null && limit > 0) ?
            Math.min(limit, MAX_HISTORY_LIMIT) : MAX_HISTORY_LIMIT;

        List<ChatMessage> messages = repository.getMessages(sessionId, actualLimit);
        log.info("获取会话 {} 历史消息，数量: {}", sessionId, messages.size());

        return messages;
    }

    /**
     * 获取会话历史消息（全部，上限 MAX_HISTORY_LIMIT）
     */
    public List<ChatMessage> getSessionHistory(String sessionId) {
        return getSessionHistory(sessionId, null);
    }

    /**
     * 清空会话历史
     */
    public void clearSessionHistory(String sessionId) {
        repository.clearMessages(sessionId);

        ChatSession session = repository.getSession(sessionId);
        if (session != null) {
            session.setMessageCount(0);
            session.touch();
            repository.updateSession(session);
        }

        log.info("清空会话 {} 的历史消息", sessionId);
    }

    // ==================== 会话列表查询 ====================

    /**
     * 获取会话列表
     */
    public SessionListResponse listSessions(int page, int pageSize) {
        long total = repository.getTotalSessionCount();
        List<String> sessionIds = repository.getSessionIds(page, pageSize);

        List<SessionListResponse.SessionSummary> summaries = new ArrayList<>();

        for (String sessionId : sessionIds) {
            ChatSession session = repository.getSession(sessionId);
            if (session != null) {
                SessionListResponse.SessionSummary summary = new SessionListResponse.SessionSummary();
                summary.setSessionId(session.getSessionId());
                summary.setCreateTime(session.getCreateTime());
                summary.setUpdateTime(session.getUpdateTime());
                summary.setMessageCount(session.getMessageCount());

                // 获取第一条消息作为预览
                List<ChatMessage> messages = repository.getMessages(sessionId, 1);
                if (!messages.isEmpty()) {
                    String firstMsg = messages.get(0).getContent();
                    summary.setFirstMessage(truncate(firstMsg, 50));
                }

                summaries.add(summary);
            }
        }

        SessionListResponse response = new SessionListResponse();
        response.setSessions(summaries);
        response.setTotal((int) total);
        response.setPage(page);
        response.setPageSize(pageSize);

        return response;
    }

    /**
     * 获取会话列表（默认分页）
     */
    public SessionListResponse listSessions() {
        return listSessions(1, DEFAULT_PAGE_SIZE);
    }

    // ==================== 摘要管理 ====================

    /**
     * 保存会话摘要到 Redis
     */
    public void saveSummary(String sessionId, String summary) {
        repository.saveSummary(sessionId, summary);
    }

    /**
     * 从 Redis 获取会话摘要（不存在返回 null）
     */
    public String getSummary(String sessionId) {
        return repository.getSummary(sessionId);
    }

    // ==================== 会话恢复 ====================

    /**
     * 从 Redis 恢复会话，超出窗口的旧消息通过 LLM 摘要压缩
     *
     * @param sessionId  会话ID
     * @param recentPairs 保留的最近对话轮数
     * @return RecentMessages 包含摘要（可为null）和最近消息列表
     */
    public RecentMessages recoverSession(String sessionId, int recentPairs) {
        // 从 Redis 加载全部消息
        List<ChatMessage> allMessages = repository.getMessages(sessionId);

        if (allMessages.isEmpty()) {
            return new RecentMessages(null, new ArrayList<>());
        }

        int recentLimit = recentPairs * 2; // 每对 = 1条user + 1条assistant

        if (allMessages.size() <= recentLimit) {
            // 没有超出窗口，全部保留
            return new RecentMessages(null, allMessages);
        }

        // 超出窗口：拆分为旧消息和最近消息
        int splitIndex = allMessages.size() - recentLimit;
        List<ChatMessage> oldMessages = allMessages.subList(0, splitIndex);
        List<ChatMessage> recentMessages = allMessages.subList(splitIndex, allMessages.size());

        // 将旧消息转为文本，用于 LLM 摘要
        String conversationText = oldMessages.stream()
                .map(msg -> ("user".equals(msg.getRole()) ? "用户: " : "助手: ") + msg.getContent())
                .collect(Collectors.joining("\n"));

        log.info("会话 {} 超出窗口，旧消息 {} 条，将生成摘要压缩", sessionId, oldMessages.size());

        // 注意：摘要由 ChatController 调用 ChatService.summarizeConversation() 生成
        // 这里返回旧消息文本，由调用方处理 LLM 调用
        return new RecentMessages(conversationText, new ArrayList<>(recentMessages));
    }

    /**
     * 恢复结果
     */
    public static class RecentMessages {
        /**
         * 需要摘要压缩的旧对话文本（null 表示不需要压缩）
         */
        private final String oldConversationText;

        /**
         * 保留在窗口内的最近消息
         */
        private final List<ChatMessage> recentMessages;

        public RecentMessages(String oldConversationText, List<ChatMessage> recentMessages) {
            this.oldConversationText = oldConversationText;
            this.recentMessages = recentMessages;
        }

        public String getOldConversationText() {
            return oldConversationText;
        }

        public List<ChatMessage> getRecentMessages() {
            return recentMessages;
        }
    }

    // ==================== 辅助方法 ====================

    /**
     * 截断字符串
     */
    private String truncate(String str, int maxLength) {
        if (str == null) {
            return "";
        }
        if (str.length() <= maxLength) {
            return str;
        }
        return str.substring(0, maxLength) + "...";
    }
}
