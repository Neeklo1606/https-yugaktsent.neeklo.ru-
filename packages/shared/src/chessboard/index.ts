export * from './types.js';
export {
  buildArchitecturalMatrix,
  buildArchitecturalMatrixWithTopology,
  buildShaftMatrix,
  buildBuildingTopology,
  matchScore,
  apartmentNumber,
  layoutFingerprint,
  architecturalSignature,
  planSignature,
  verticalMatchScore,
  topologyArchitecturalSignature,
  VERTICAL_LINK_MAX_SCORE,
  type ShaftMatrix,
  type ArchitecturalMatrixResult,
} from './matrix.js';
export type {
  ArchitecturalShaft,
  BuildingTopologyGraph,
  FloorTemplate,
  FloorTemplateSlot,
} from './topology.js';
export { minCostAssignment } from './matching.js';
export { layoutGroupKey, collectMirrorVariants } from './mirror.js';
export * from './build-grid.js';
export { buildDeterministicRisers, parsePlanPosition, type RiserLayout, type RiserColumn } from './risers.js';
