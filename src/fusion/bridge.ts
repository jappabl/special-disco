import type { AttentionSnapshot } from "@/types/attention";

// This will later be implemented by the fusion layer.
// For now just log to console so I can see snapshots.
export function pushAttention(snapshot: AttentionSnapshot) {
  console.log("Attention snapshot", snapshot);
}
