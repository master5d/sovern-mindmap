import { NodeProps } from '@xyflow/react';

/** Фон swimlane в diagram view. Размер приходит через node.style на обёртку. */
export const LaneNode = ({ data }: NodeProps<any>) => (
  <div
    className="w-full h-full rounded-2xl border border-edge/60 relative pointer-events-none"
    style={{ backgroundColor: 'var(--lane-bg)' }}
  >
    <span
      className="absolute top-3 left-4 text-[10px] font-black uppercase tracking-[0.25em]"
      style={{ color: `var(--layer-${data.label}, var(--text-muted))` }}
    >
      {data.label}
    </span>
  </div>
);
