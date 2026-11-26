/** Minimal apartment fields required to build a chessboard matrix. */
export type ChessboardApartmentInput = {
  id: string;
  number?: string | null;
  floor: number;
  rooms: number;
  area: number;
  price: number;
  pricePerMeter?: number;
  finishing?: string;
  status: 'available' | 'reserved' | 'sold';
  section?: number;
  planImage?: string | null;
};

export type ChessboardApartmentCell = {
  id: string;
  number: string;
  floor: number;
  rooms: number;
  roomLabel: string;
  area: number;
  layoutFingerprint: string;
  price: number;
  pricePerMeter: number;
  finishing: string;
  status: 'available' | 'reserved' | 'sold';
  section: number;
  planImage: string | null;
};

export type ChessboardGridCell = {
  floor: number;
  shaftIndex: number;
  apartment: ChessboardApartmentCell | null;
};

export type ChessboardColumnDto = {
  shaftIndex: number;
  shaftId: string;
  shaftLabel: string;
  primaryFingerprint: string;
  mirroredPlanSignatures: string[];
  cells: Array<{ floor: number; apartment: ChessboardApartmentCell | null }>;
};

export type ArchitecturalShaftDto = {
  shaftId: string;
  shaftIndex: number;
  label: string;
  primaryFingerprint: string;
  primaryPlanSignature: string | null;
  mirroredPlanSignatures: string[];
  layoutGroupKey: string;
  floorsPresent: number[];
  apartmentIds: string[];
  /** Секция/подъезд столбца («Секция 3»), если дом в выгрузке разбит на секции. */
  group?: string | null;
  /** Номер окна на этаже по данным застройщика. */
  position?: number;
};

export type FloorTemplateSlotDto = {
  shaftId: string;
  shaftIndex: number;
  apartmentId: string | null;
  isPlaceholder: boolean;
};

export type FloorTemplateDto = {
  floor: number;
  slots: FloorTemplateSlotDto[];
};

export type BuildingTopologyDto = {
  sectionCount: number;
  shafts: ArchitecturalShaftDto[];
  floorTemplates: FloorTemplateDto[];
  apartmentToShaft: Record<string, string>;
};

export type ChessboardBuildingMatrix = {
  id: string;
  name: string;
  tabLabel: string;
  apartmentCount: number;
  statusCounts: { available: number; reserved: number; sold: number };
  floors: number[];
  shaftCount: number;
  columns: ChessboardColumnDto[];
  /** Row-major: grid[floorRowIndex][shaftIndex]. Source of truth for rendering. */
  grid: ChessboardGridCell[][];
  /** v4: architectural topology graph (shaft entities + floor templates). */
  topology: BuildingTopologyDto;
  shafts: ArchitecturalShaftDto[];
  floorTemplates: FloorTemplateDto[];
  /** Срок сдачи корпуса (ISO), если известен */
  deadline?: string | null;
};

export type ChessboardBlockResponse = {
  blockId: number;
  slug: string;
  name: string;
  buildings: ChessboardBuildingMatrix[];
};
