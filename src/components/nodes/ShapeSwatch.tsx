import { SHAPE_GEOMETRY, ShapeKind } from './shapeGeometry';

/**
 * ~28px label-less preview of one shape, driven by SHAPE_GEOMETRY so it stays
 * truthful to ShapeNode's three render modes (css border-radius / svg silhouette /
 * lucide icon). Pure presentational — no store access.
 */
export function ShapeSwatch({ kind, selected = false }: { kind: ShapeKind; selected?: boolean }) {
  const geom = SHAPE_GEOMETRY[kind];
  const ring = selected ? 'ring-2 ring-accent/50 border-accent' : 'border-edge';

  if (geom.mode === 'icon') {
    const Icon = geom.Icon!;
    return (
      <div className={`flex h-7 w-7 items-center justify-center border bg-surface-2 ${geom.className ?? ''} ${ring}`}>
        <Icon size={16} className="text-secondary" />
      </div>
    );
  }

  if (geom.mode === 'svg') {
    return (
      <div className={`relative h-7 w-7 rounded ${selected ? 'ring-2 ring-accent/50' : ''}`}>
        {geom.svg!(selected)}
      </div>
    );
  }

  // css mode: a small filled box carrying the geometry's border-radius className
  return <div className={`h-7 w-7 border bg-surface-2 ${geom.className ?? ''} ${ring}`} />;
}
