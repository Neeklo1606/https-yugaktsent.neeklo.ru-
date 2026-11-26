import { buildArchitecturalMatrixWithTopology } from './matrix.js';
import { buildDeterministicRisers, type RiserLayout } from './risers.js';
import type {
  ArchitecturalShaftDto,
  BuildingTopologyDto,
  ChessboardApartmentInput,
  ChessboardApartmentCell,
  ChessboardBuildingMatrix,
  ChessboardGridCell,
  FloorTemplateDto,
} from './types.js';

export function chessboardBuildingLabel(name: string, id: string): string {
  const n = (name || `Корпус ${id}`).trim();
  if (/^корп\.?\s/i.test(n)) return n;
  return `Корп. ${n}`;
}

function roomLabel(rooms: number): string {
  if (rooms === 0) return 'Студия';
  if (rooms > 0) return `${rooms}-к.кв`;
  return '';
}

function toCellApartment(apt: ChessboardApartmentInput): ChessboardApartmentCell {
  const area = apt.area;
  const price = apt.price;
  return {
    id: apt.id,
    number: apt.number != null ? String(apt.number) : '',
    floor: apt.floor,
    rooms: apt.rooms,
    roomLabel: roomLabel(apt.rooms),
    area,
    layoutFingerprint: `${apt.rooms}|${Math.round(area * 10) / 10}`,
    price,
    pricePerMeter: apt.pricePerMeter ?? (area > 0 ? Math.round(price / area) : 0),
    finishing: apt.finishing ?? '—',
    status: apt.status,
    section: apt.section ?? 1,
    planImage: apt.planImage ?? null,
  };
}

function toTopologyDto(topology: ReturnType<typeof buildArchitecturalMatrixWithTopology>['topology']): BuildingTopologyDto {
  return {
    sectionCount: topology.sectionCount,
    shafts: topology.shafts.map((s) => ({ ...s })),
    floorTemplates: topology.floorTemplates.map((t) => ({
      floor: t.floor,
      slots: t.slots.map((slot) => ({ ...slot })),
    })),
    apartmentToShaft: { ...topology.apartmentToShaft },
  };
}

const GROUP_PREFIX: Record<string, string> = { k: 'Корпус', s: 'Секция', p: 'Подъезд' };

/** «k1·s2» → «Корпус 1 · секция 2» */
export function riserGroupLabel(group: string | null | undefined): string | null {
  if (!group) return null;
  const parts = group.split('·').map((p, i) => {
    const word = GROUP_PREFIX[p[0]?.toLowerCase() ?? ''] ?? '';
    const label = `${word} ${p.slice(1)}`.trim();
    return i === 0 ? label : label.toLowerCase();
  });
  return parts.join(' · ');
}

function topologyFromRisers(r: RiserLayout): BuildingTopologyDto {
  const apartmentToShaft: Record<string, string> = {};
  const shafts: ArchitecturalShaftDto[] = r.columns.map((col, idx) => {
    const apts = r.cells[idx].filter((a): a is ChessboardApartmentInput => a != null);
    const first = apts[0];
    const shaftId = `shaft-${idx + 1}`;
    for (const a of apts) apartmentToShaft[a.id] = shaftId;
    const fp = first ? `${first.rooms}|${Math.round(first.area * 10) / 10}` : '—';
    return {
      shaftId,
      shaftIndex: idx + 1,
      label: first ? `${roomLabel(first.rooms)} ${Math.round(first.area * 10) / 10}м²` : '—',
      primaryFingerprint: fp,
      primaryPlanSignature: first?.planImage ?? null,
      mirroredPlanSignatures: [],
      layoutGroupKey: fp,
      floorsPresent: apts.map((a) => a.floor),
      apartmentIds: apts.map((a) => a.id),
      group: riserGroupLabel(col.group),
      position: col.position,
    };
  });
  const groups = new Set(r.columns.map((c) => c.group ?? ''));
  return {
    sectionCount: Math.max(1, groups.size),
    shafts,
    floorTemplates: r.floors.map((floor, row) => ({
      floor,
      slots: r.columns.map((_, c) => ({
        shaftId: `shaft-${c + 1}`,
        shaftIndex: c + 1,
        apartmentId: r.cells[c][row]?.id ?? null,
        isPlaceholder: !r.cells[c][row],
      })),
    })),
    apartmentToShaft,
  };
}

/**
 * Builds the full API contract: topology, shafts, floorTemplates, grid[][].
 *
 * Architectural Matrix Engine v4: topology graph → floor templates → matrix projection.
 */
export function buildChessboardBuildingMatrix(
  buildingId: string,
  buildingName: string,
  apartments: ChessboardApartmentInput[],
): ChessboardBuildingMatrix {
  const risers = buildDeterministicRisers(apartments);
  let floors: number[];
  let columns: Array<Array<ChessboardApartmentInput | null>>;
  let topology: BuildingTopologyDto;
  if (risers) {
    floors = risers.floors;
    columns = risers.cells;
    topology = topologyFromRisers(risers);
  } else {
    const { matrix, topology: topo } = buildArchitecturalMatrixWithTopology(apartments);
    floors = matrix.floors;
    columns = matrix.columns;
    topology = toTopologyDto(topo);
  }
  const shaftCount = columns.length;
  const shafts: ArchitecturalShaftDto[] = topology.shafts;
  const floorTemplates: FloorTemplateDto[] = topology.floorTemplates;

  const statusCounts = { available: 0, reserved: 0, sold: 0 };
  for (const a of apartments) {
    statusCounts[a.status] += 1;
  }

  const columnDtos = columns.map((col, idx) => {
    const shaft = shafts[idx];
    return {
      shaftIndex: idx + 1,
      shaftId: shaft?.shaftId ?? `shaft-${idx + 1}`,
      shaftLabel: shaft?.label ?? '—',
      primaryFingerprint: shaft?.primaryFingerprint ?? '—',
      mirroredPlanSignatures: shaft?.mirroredPlanSignatures ?? [],
      cells: floors.map((floor, rowIndex) => ({
        floor,
        apartment: col[rowIndex] ? toCellApartment(col[rowIndex]!) : null,
      })),
    };
  });

  const grid: ChessboardGridCell[][] = floors.map((floor, rowIndex) =>
    columns.map((col, colIndex) => ({
      floor,
      shaftIndex: colIndex + 1,
      apartment: col[rowIndex] ? toCellApartment(col[rowIndex]!) : null,
    })),
  );

  return {
    id: buildingId,
    name: buildingName,
    tabLabel: chessboardBuildingLabel(buildingName, buildingId),
    apartmentCount: apartments.length,
    statusCounts,
    floors,
    shaftCount,
    columns: columnDtos,
    grid,
    topology,
    shafts,
    floorTemplates,
  };
}
