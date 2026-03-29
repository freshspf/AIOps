package org.example.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 会话列表响应
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SessionListResponse {
    /**
     * 会话列表
     */
    private List<SessionSummary> sessions;

    /**
     * 总数
     */
    private Integer total;

    /**
     * 当前页码
     */
    private Integer page;

    /**
     * 每页大小
     */
    private Integer pageSize;

    /**
     * 会话摘要
     */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SessionSummary {
        /**
         * 会话ID
         */
        private String sessionId;

        /**
         * 创建时间
         */
        private Long createTime;

        /**
         * 最后更新时间
         */
        private Long updateTime;

        /**
         * 消息对数
         */
        private Integer messageCount;

        /**
         * 第一条消息预览（作为标题）
         */
        private String firstMessage;
    }
}
