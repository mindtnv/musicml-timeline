import type { FramePredictions, Timeline, KeyMoment } from "../../api/types";
import Panel from "../Panel";
import ChartFrame from "../ChartFrame";
import { useDashboard } from "../DashboardContext";
import EmotionCurves from "../../components/EmotionCurves";
import ArcBadge from "../../components/ArcBadge";

interface EmotionPanelProps {
  framePredictions?: FramePredictions;
  duration: number;
  emotionalArc?: Timeline["emotional_arc"];
  keyMoments?: KeyMoment[];
}

const CURVE_HEIGHT = 220;
const CURVE_PAD_LEFT = 36;

// Time-series view of the regression heads.  Trail in EmotionalProfilePanel
// shows arousal × valence in 2D (the song's emotional shape); this panel
// shows them as curves over time (where the dynamics live).  The two are
// complementary, not duplicates — keep both, drop the duplicate hero
// numbers (those live in EmotionalProfilePanel).
function EmotionPanel({ framePredictions, duration, emotionalArc, keyMoments }: EmotionPanelProps) {
  const aReg = framePredictions?.arousal_reg ?? [];
  const vReg = framePredictions?.valence_reg ?? [];
  const hop = framePredictions?.frame_hop_seconds ?? 1.0;
  const { seek } = useDashboard();

  if (aReg.length === 0 && vReg.length === 0) return null;

  return (
    <Panel
      title="Динамика эмоций"
      subtitle="Регрессионные выходы модели · arousal & valence во времени"
      span={4}
      actions={emotionalArc ? <ArcBadge arc={emotionalArc} /> : undefined}
    >
      <div className="emotion-curve-row">
        <ChartFrame
          height={CURVE_HEIGHT}
          paddingLeft={CURVE_PAD_LEFT}
          showCursorLabel
        >
          {({ timeScale, width, height }) => (
            <EmotionCurves
              arousalReg={aReg}
              valenceReg={vReg}
              hopSeconds={hop}
              duration={duration}
              timeScale={timeScale}
              width={width}
              height={height}
              keyMoments={keyMoments}
              onMomentClick={seek}
            />
          )}
        </ChartFrame>
        <div className="emotion-legend">
          <span className="emotion-legend-item">
            <span className="emotion-legend-dot emotion-legend-dot--arousal" />
            Энергия
          </span>
          <span className="emotion-legend-item">
            <span className="emotion-legend-dot emotion-legend-dot--valence" />
            Настроение
          </span>
        </div>
      </div>
    </Panel>
  );
}

export default EmotionPanel;
