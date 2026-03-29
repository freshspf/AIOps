package com.spf.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 聊天消息实体
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChatMessage {
    /**
     * 消息角色：user 或 assistant
     */
    private String role;

    /**
     * 消息内容
     */
    private String content;

    /**
     * 消息时间戳（毫秒）
     */
    private Long timestamp;

    /**
     * 构造用户消息
     */
    public static ChatMessage userMessage(String content) {
        return new ChatMessage("user", content, System.currentTimeMillis());
    }

    /**
     * 构造助手消息
     */
    public static ChatMessage assistantMessage(String content) {
        return new ChatMessage("assistant", content, System.currentTimeMillis());
    }
}
