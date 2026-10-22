import React from "react";
import { GitBranch, History, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";

interface HistoricalOffsetControlProps {
  currentOffset: number;
  latestOffset: number;
  onOffsetChange: (offset: number) => void;
  onResetToLive: () => void;
}

export function HistoricalOffsetControl({
  currentOffset,
  latestOffset,
  onOffsetChange,
  onResetToLive,
}: HistoricalOffsetControlProps) {
  const isHistorical = currentOffset < latestOffset;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) onOffsetChange(val);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = parseInt(e.target.value, 10);
    if (isNaN(val)) return;
    if (val < 1) val = 1;
    if (val > latestOffset) val = latestOffset;
    onOffsetChange(val);
  };

  const stepBackward = () => {
    if (currentOffset > 1) onOffsetChange(currentOffset - 1);
  };

  const stepForward = () => {
    if (currentOffset < latestOffset) onOffsetChange(currentOffset + 1);
  };

  return (
    <div
      className={`historical-offset-bar ${
        isHistorical ? "historical-active" : ""
      }`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        padding: "0.6rem 1rem",
        borderRadius: "8px",
        background: isHistorical ? "rgba(234, 179, 8, 0.08)" : "var(--panel-subtle, rgba(255, 255, 255, 0.03))",
        border: `1px solid ${isHistorical ? "rgba(234, 179, 8, 0.35)" : "var(--border, rgba(255, 255, 255, 0.08))"}`,
        marginBottom: "1rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        {isHistorical ? (
          <History size={16} style={{ color: "#eab308" }} />
        ) : (
          <GitBranch size={16} style={{ color: "var(--primary, #38bdf8)" }} />
        )}
        <span style={{ fontSize: "0.82rem", fontWeight: 600, letterSpacing: "0.03em" }}>
          {isHistorical ? "HISTORICAL CONFLICT REPLAY" : "EVENT LOG BRANCH"}
        </span>
        <span
          style={{
            fontSize: "0.72rem",
            padding: "2px 8px",
            borderRadius: "12px",
            background: isHistorical ? "rgba(234, 179, 8, 0.18)" : "rgba(56, 189, 248, 0.15)",
            color: isHistorical ? "#facc15" : "#38bdf8",
            fontWeight: 600,
          }}
        >
          {isHistorical ? `Offset #${currentOffset}` : `Live (Offset #${latestOffset})`}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flex: "1", maxWidth: "420px" }}>
        <button
          type="button"
          className="icon-button"
          onClick={stepBackward}
          disabled={currentOffset <= 1}
          title="Previous offset"
          aria-label="Previous event offset"
          style={{ padding: "4px" }}
        >
          <ChevronLeft size={15} />
        </button>

        <input
          type="range"
          min={1}
          max={Math.max(1, latestOffset)}
          value={currentOffset}
          onChange={handleSliderChange}
          aria-label="Historical event offset slider"
          style={{ flex: 1, cursor: "pointer", accentColor: isHistorical ? "#eab308" : "#38bdf8" }}
        />

        <button
          type="button"
          className="icon-button"
          onClick={stepForward}
          disabled={currentOffset >= latestOffset}
          title="Next offset"
          aria-label="Next event offset"
          style={{ padding: "4px" }}
        >
          <ChevronRight size={15} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ fontSize: "0.78rem", color: "var(--muted-foreground, #94a3b8)" }}>#</span>
          <input
            type="number"
            min={1}
            max={Math.max(1, latestOffset)}
            value={currentOffset}
            onChange={handleNumberChange}
            aria-label="Specific event offset"
            style={{
              width: "50px",
              padding: "2px 6px",
              fontSize: "0.8rem",
              borderRadius: "4px",
              border: "1px solid var(--border, rgba(255,255,255,0.15))",
              background: "transparent",
              color: "inherit",
              textAlign: "center",
            }}
          />
          <span style={{ fontSize: "0.78rem", color: "var(--muted-foreground, #94a3b8)" }}>
            / {latestOffset}
          </span>
        </div>
      </div>

      {isHistorical && (
        <button
          type="button"
          onClick={onResetToLive}
          className="button button-quiet"
          style={{ fontSize: "0.78rem", padding: "4px 10px", display: "flex", alignItems: "center", gap: "4px" }}
        >
          <RotateCcw size={13} />
          <span>Return to Live</span>
        </button>
      )}
    </div>
  );
}
