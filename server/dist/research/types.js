"use strict";
/**
 * Research engine types.
 *
 * Layering (matches DECISION_ARCHITECTURE.md Phase 3):
 *   ResearchSource        — provider abstraction (WHAT to query)
 *   ResearchService       — orchestration: run, dedup, persist Evidence/Claims
 *   ResearchTaskHandler   — thin task boundary used by TaskExecutor
 *   TaskExecutor/Scheduler — existing Phase 2 machinery
 */
Object.defineProperty(exports, "__esModule", { value: true });
