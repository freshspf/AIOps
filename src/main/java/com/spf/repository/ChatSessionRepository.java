package com.spf.repository;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import com.spf.dto.ChatMessage;
import com.spf.dto.ChatSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * 聊天会话 Redis 数据访问层
 */
@Slf4j
@Repository
public class ChatSessionRepository {

    private static final String SESSION_KEY_PREFIX = "chat:session:";
    private static final String MESSAGES_KEY_PREFIX = "chat:messages:";
    private static final String TIMELINE_KEY = "chat:sessions:timeline";

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    // ==================== 会话元数据操作 ====================

    /**
     * 保存会话元数据
     */
    public void saveSession(ChatSession session) {
        String key = SESSION_KEY_PREFIX + session.getSessionId();
        redisTemplate.opsForHash().put(key, "sessionId", session.getSessionId());
        redisTemplate.opsForHash().put(key, "createTime", session.getCreateTime().toString());
        redisTemplate.opsForHash().put(key, "updateTime", session.getUpdateTime().toString());
        redisTemplate.opsForHash().put(key, "messageCount", session.getMessageCount().toString());

        // 添加到时间线
        redisTemplate.opsForZSet().add(TIMELINE_KEY, session.getSessionId(), session.getCreateTime());

        log.debug("保存会话元数据: {}", session.getSessionId());
    }

    /**
     * 获取会话元数据
     */
    public ChatSession getSession(String sessionId) {
        String key = SESSION_KEY_PREFIX + sessionId;
        Object obj = redisTemplate.opsForHash().get(key, "sessionId");
        if (obj == null) {
            return null;
        }

        ChatSession session = new ChatSession();
        session.setSessionId(String.valueOf(obj));
        session.setCreateTime(Long.parseLong(String.valueOf(redisTemplate.opsForHash().get(key, "createTime"))));
        session.setUpdateTime(Long.parseLong(String.valueOf(redisTemplate.opsForHash().get(key, "updateTime"))));
        session.setMessageCount(Integer.parseInt(String.valueOf(redisTemplate.opsForHash().get(key, "messageCount"))));

        return session;
    }

    /**
     * 更新会话元数据
     */
    public void updateSession(ChatSession session) {
        saveSession(session);
    }

    /**
     * 删除会话元数据
     */
    public void deleteSession(String sessionId) {
        // 删除会话元数据
        String key = SESSION_KEY_PREFIX + sessionId;
        redisTemplate.delete(key);

        // 从时间线移除
        redisTemplate.opsForZSet().remove(TIMELINE_KEY, sessionId);

        log.debug("删除会话元数据: {}", sessionId);
    }

    // ==================== 消息操作 ====================

    /**
     * 添加消息到会话
     */
    public void addMessage(String sessionId, ChatMessage message) {
        String key = MESSAGES_KEY_PREFIX + sessionId;

        try {
            String json = objectMapper.writeValueAsString(message);
            redisTemplate.opsForList().rightPush(key, json);
            log.debug("添加消息到会话 {}: role={}", sessionId, message.getRole());
        } catch (Exception e) {
            log.error("序列化消息失败", e);
            throw new RuntimeException("添加消息失败", e);
        }
    }

    /**
     * 获取会话的所有消息
     */
    public List<ChatMessage> getMessages(String sessionId) {
        return getMessages(sessionId, -1);
    }

    /**
     * 获取会话的最近 N 条消息
     * @param limit 消息数量，-1 表示全部
     */
    public List<ChatMessage> getMessages(String sessionId, int limit) {
        String key = MESSAGES_KEY_PREFIX + sessionId;
        Long size = redisTemplate.opsForList().size(key);

        if (size == null || size == 0) {
            return new ArrayList<>();
        }

        // 计算范围
        long start = (limit > 0 && size > limit) ? (size - limit) : 0;
        long end = -1;

        List<Object> jsonList = redisTemplate.opsForList().range(key, start, end);
        List<ChatMessage> messages = new ArrayList<>();

        if (jsonList != null) {
            for (Object obj : jsonList) {
                try {
                    String json = String.valueOf(obj);
                    ChatMessage message = objectMapper.readValue(json, ChatMessage.class);
                    messages.add(message);
                } catch (Exception e) {
                    log.error("反序列化消息失败: {}", obj, e);
                }
            }
        }

        log.debug("获取会话 {} 的消息，数量: {}", sessionId, messages.size());
        return messages;
    }

    /**
     * 清空会话消息
     */
    public void clearMessages(String sessionId) {
        String key = MESSAGES_KEY_PREFIX + sessionId;
        redisTemplate.delete(key);
        log.debug("清空会话 {} 的消息", sessionId);
    }

    /**
     * 获取消息数量
     */
    public long getMessageCount(String sessionId) {
        String key = MESSAGES_KEY_PREFIX + sessionId;
        Long count = redisTemplate.opsForList().size(key);
        return count != null ? count : 0;
    }

    // ==================== 时间线操作 ====================

    /**
     * 获取所有会话ID（按创建时间倒序）
     */
    public List<String> getAllSessionIds() {
        Set<Object> members = redisTemplate.opsForZSet().reverseRange(TIMELINE_KEY, 0, -1);
        List<String> sessionIds = new ArrayList<>();

        if (members != null) {
            for (Object obj : members) {
                sessionIds.add(String.valueOf(obj));
            }
        }

        return sessionIds;
    }

    /**
     * 获取分页会话ID列表（按创建时间倒序）
     */
    public List<String> getSessionIds(int page, int pageSize) {
        long start = (long) (page - 1) * pageSize;
        long end = start + pageSize - 1;

        Set<Object> members = redisTemplate.opsForZSet().reverseRange(TIMELINE_KEY, start, end);
        List<String> sessionIds = new ArrayList<>();

        if (members != null) {
            for (Object obj : members) {
                sessionIds.add(String.valueOf(obj));
            }
        }

        return sessionIds;
    }

    /**
     * 获取总会话数
     */
    public long getTotalSessionCount() {
        Long count = redisTemplate.opsForZSet().size(TIMELINE_KEY);
        return count != null ? count : 0;
    }
}
