export function clampPanelPosition(position, panel, viewport) {
  const margin = 8;
  return {
    x: Math.max(margin, Math.min(position.x, Math.max(margin, viewport.width - panel.width - margin))),
    y: Math.max(margin, Math.min(position.y, Math.max(margin, viewport.height - panel.height - margin))),
  };
}
