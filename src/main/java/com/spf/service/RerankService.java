package com.spf.service;

import com.spf.dto.RetrievedChunk;

import java.util.List;

/**
 * 精排服务抽象，便于后续切换到专用 rerank 模型。
 */
public interface RerankService {

    List<RetrievedChunk> rerank(String query, List<RetrievedChunk> candidates, int topN);
}
