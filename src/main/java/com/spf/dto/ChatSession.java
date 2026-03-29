package com.spf.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 聊天会话实体
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChatSession {
    /**
     * 会话ID（UUID）
     */
    private String sessionId;

    /**
     * 创建时间（毫秒时间戳）
     */
    private Long createTime;

    /**
     * 最后更新时间（毫秒时间戳）
     */
    private Long updateTime;

    /**
     * 消息对数（一对 = 1个用户消息 + 1个助手消息）
     */
    private Integer messageCount;

    /**
     * 创建新会话
     */
    public static ChatSession create(String sessionId) {
        long now = System.currentTimeMillis();
        return new ChatSession(sessionId, now, now, 0);
    }

    /**
     * 更新会话时间
     */
    public void touch() {
        this.updateTime = System.currentTimeMillis();
    }

    /**
     * 增加消息计数
     */
    public void incrementMessageCount() {
        this.messageCount = (this.messageCount == null ? 0 : this.messageCount) + 1;
    }
}
