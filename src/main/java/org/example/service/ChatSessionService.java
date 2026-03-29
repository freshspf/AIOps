package org.example.service;

import lombok.extern.slf4j.Slf4j;
import org.example.dto.ChatMessage;
import org.example.dto.ChatSession;
import org.example.dto.SessionListResponse;
import org.example.repository.ChatSessionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

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
