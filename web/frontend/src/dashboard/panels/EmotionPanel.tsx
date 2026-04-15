import type { TimelineSegment, FramePredictions } from "../../api/types";
import { AROUSAL_COLORS, VALENCE_COLORS } from "../../utils/colors";
import Panel from "../Panel";
import ChartFrame from "../ChartFrame";
import TimelineStrip from "../../components/Timeline";
import EmotionCurves from "../../components/EmotionCurves";

interface EmotionPanelProps {
  arousalSegments?: TimelineSegment[];
  valenceSegments?: TimelineSegment[];
  framePredictions?: FramePredictions;
  duration: number;
}

const STRIP_HEIGHT = 30;
const CURVE_HEIGHT = 200;
const CURVE_PAD_LEFT = 36;

function EmotionPanel({
  arousalSegments,
  valenceSegments,
  framePredictions,
  duration,
}: EmotionPanelProps) {
  const hasAny =
    (arousalSegments && arousalSegments.length > 0) ||
    (valenceSegments && valenceSegments.length > 0) ||
    framePredictions?.arousal_reg?.length ||
    framePredictions?.valence_reg?.length;

  if (!hasAny) return null;

  return (
    <Panel
      title="Эмоциональный анализ"
      subtitle="Энергия (arousal) и настроение (valence) во времени"
      span={4}
    >
      {arousalSegments && arousalSegments.length > 0 && (
        <div className="emotion-strip-row">
          <span className="emotion-strip-label">Энергия</span>
          <ChartFrame height={STRIP_HEIGHT} className="emotion-strip">
            {({ timeScale, width, height }) => (
              <TimelineStrip
                segments={arousalSegments}
                duration={duration}
                timeScale={timeScale}
                width={width}
                height={height}
                colorMap={AROUSAL_COLORS}
                showLabels={false}
              />
            )}
          </ChartFrame>
        </div>
      )}

      {valenceSegments && valenceSegments.length > 0 && (
        <div className="emotion-strip-row">
          <span className="emotion-strip-label">Настроение</span>
          <ChartFrame height={STRIP_HEIGHT} className="emotion-strip">
            {({ timeScale, width, height }) => (
              <TimelineStrip
                segments={valenceSegments}
                duration={duration}
                timeScale={timeScale}
                width={width}
                height={height}
                colorMap={VALENCE_COLORS}
                showLabels={false}
              />
            )}
          </ChartFrame>
        </div>
      )}

      {framePredictions &&
        ((framePredictions.arousal_reg && framePredictions.arousal_reg.length > 0) ||
          (framePredictions.valence_reg && framePredictions.valence_reg.length > 0)) && (
          <div className="emotion-curve-row">
            <ChartFrame
              height={CURVE_HEIGHT}
              paddingLeft={CURVE_PAD_LEFT}
              showCursorLabel
            >
              {({ timeScale, width, height }) => (
                <EmotionCurves
                  arousalReg={framePredictions.arousal_reg ?? []}
                  valenceReg={framePredictions.valence_reg ?? []}
                  hopSeconds={framePredictions.frame_hop_seconds}
                  duration={duration}
                  timeScale={timeScale}
                  width={width}
                  height={height}
                />
              )}
            </ChartFrame>
            <div className="emotion-legend">
              <span className="emotion-legend-item">
                <span className="emotion-legend-dot emotion-legend-dot--arousal" />
                Энергия (arousal)
              </span>
              <span className="emotion-legend-item">
                <span className="emotion-legend-dot emotion-legend-dot--valence" />
                Настроение (valence)
              </span>
            </div>
          </div>
        )}
    </Panel>
  );
}

export default EmotionPanel;
