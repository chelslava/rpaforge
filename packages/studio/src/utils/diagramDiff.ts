import { toDisplayString } from './toDisplayString';
/*
 * Semantic diagram diff and graph-level 3-way merge (issue #850).
 *
 * Operates on already-parsed diagram documents (ProcessFile-shaped). The
 * utility is deliberately tolerant of unknown data shapes: node payloads are
 * flattened into field paths ('label', 'params.speed', 'condition', …) and
 * compared per path, so any block type diffs correctly without this module
 * knowing block schemas.
 */

export interface DiagramDocLike {
  version?: string;
  exportedAt?: string;
  viewport?: { x: number; y: number; zoom: number };
  metadata?: Record<string, unknown> | null;
  nodes: Array<{
    id: string;
    data?: Record<string, unknown>;
    position?: { x: number; y: number } | null;
    [key: string]: unknown;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    handle?: string | null;
    [key: string]: unknown;
  }>;
  variables?: unknown;
}

export type DiffField = { field: string; base: unknown; target: unknown };

export type NodeChangeKind = 'added' | 'removed' | 'modified' | 'moved';

export interface NodeChange {
  nodeId: string;
  kind: NodeChangeKind;
  /** Flattened data field diffs (empty for added/removed/moved). */
  changes: DiffField[];
  /** Present for 'moved': previous position. */
  from?: { x: number; y: number };
  /** Present for 'moved'/'modified' with a position delta. */
  to?: { x: number; y: number };
}

export interface EdgeChange {
  kind: 'added' | 'removed' | 'retargeted';
  source: string;
  target: string;
  prevSource?: string;
  prevTarget?: string;
}

export interface SubDiagramRefChange {
  nodeId: string;
  field: 'diagramId' | 'diagramName';
  base: unknown;
  target: unknown;
}

export interface StructuralHint {
  kind: 'inserted-between' | 'removed-rejoin';
  nodeId: string;
  neighbors: [string, string];
}

export interface DiagramDiff {
  nodeChanges: NodeChange[];
  edgeChanges: EdgeChange[];
  subDiagramChanges: SubDiagramRefChange[];
  structuralHints: StructuralHint[];
  metadataChanges: DiffField[];
  variableChanges: DiffField[];
}

export type MergeConflictKind =
  | 'node-field'
  | 'node-add'
  | 'node-delete'
  | 'edge'
  | 'metadata'
  | 'variable';

export interface MergeConflict {
  kind: MergeConflictKind;
  /** Stable resolution key used in the resolutions map. */
  key: string;
  nodeId?: string;
  field?: string;
  source?: string;
  target?: string;
  base: unknown;
  ours: unknown;
  theirs: unknown;
}

export type Resolution = 'ours' | 'theirs';

/** Flattens a record into path → value; nested plain objects recurse. */
function flatten(value: Record<string, unknown>, prefix = ''): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [key, val] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (
      val !== null &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      Object.getPrototypeOf(val) === Object.prototype
    ) {
      for (const [p, v] of flatten(val as Record<string, unknown>, path)) out.set(p, v);
    } else {
      out.set(path, val);
    }
  }
  return out;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function edgeKey(edge: { source: string; target: string }): string {
  return `${edge.source}->${edge.target}`;
}

function diffFlatFields(
  base: Map<string, unknown>,
  target: Map<string, unknown>
): DiffField[] {
  const changes: DiffField[] = [];
  const keys = new Set([...base.keys(), ...target.keys()]);
  for (const key of keys) {
    const b = base.get(key);
    const t = target.get(key);
    if (!jsonEqual(b, t)) changes.push({ field: key, base: b, target: t });
  }
  return changes;
}

const SUB_DIAGRAM_REF_FIELDS = ['diagramId', 'diagramName'] as const;

function collectSubDiagramChanges(
  baseNodes: Map<string, DiagramDocLike['nodes'][number]>,
  targetNodes: Map<string, DiagramDocLike['nodes'][number]>,
  out: SubDiagramRefChange[]
): void {
  for (const [id, targetNode] of targetNodes) {
    const baseNode = baseNodes.get(id);
    if (!baseNode) continue;
    const baseData = (baseNode.data ?? {}) as Record<string, unknown>;
    const targetData = (targetNode.data ?? {}) as Record<string, unknown>;
    if (baseData.type !== 'sub-diagram-call') continue;
    for (const field of SUB_DIAGRAM_REF_FIELDS) {
      if (!jsonEqual(baseData[field], targetData[field])) {
        out.push({ nodeId: id, field, base: baseData[field], target: targetData[field] });
      }
    }
  }
}

function diffEdges(
  baseEdges: DiagramDocLike['edges'],
  targetEdges: DiagramDocLike['edges']
): EdgeChange[] {
  const baseByKey = new Map(baseEdges.map((e) => [edgeKey(e), e]));
  const targetByKey = new Map(targetEdges.map((e) => [edgeKey(e), e]));
  const changes: EdgeChange[] = [];
  for (const [key, edge] of targetByKey) {
    if (!baseByKey.has(key)) changes.push({ kind: 'added', source: edge.source, target: edge.target });
  }
  for (const [key, edge] of baseByKey) {
    if (!targetByKey.has(key)) changes.push({ kind: 'removed', source: edge.source, target: edge.target });
  }
  // Retargeted: same edge id survived but endpoints moved.
  const baseById = new Map(baseEdges.map((e) => [e.id, e]));
  for (const edge of targetEdges) {
    const prev = baseById.get(edge.id);
    if (prev && edgeKey(prev) !== edgeKey(edge)) {
      changes.push({
        kind: 'retargeted',
        source: edge.source,
        target: edge.target,
        prevSource: prev.source,
        prevTarget: prev.target,
      });
    }
  }
  return changes;
}

function detectStructuralHints(
  baseEdges: DiagramDocLike['edges'],
  targetEdges: DiagramDocLike['edges'],
  addedIds: Set<string>,
  removedIds: Set<string>
): StructuralHint[] {
  const baseKeys = new Set(baseEdges.map(edgeKey));
  const targetKeys = new Set(targetEdges.map(edgeKey));
  const hints: StructuralHint[] = [];

  const incident = (edges: DiagramDocLike['edges'], id: string) => {
    const incoming = edges.find((e) => e.target === id);
    const outgoing = edges.find((e) => e.source === id);
    return { incoming, outgoing };
  };

  for (const id of addedIds) {
    const { incoming, outgoing } = incident(targetEdges, id);
    if (!incoming || !outgoing) continue;
    const direct = `${incoming.source}->${outgoing.target}`;
    if (direct !== edgeKey({ source: id, target: id }) && baseKeys.has(direct) && !targetKeys.has(direct)) {
      hints.push({ kind: 'inserted-between', nodeId: id, neighbors: [incoming.source, outgoing.target] });
    }
  }
  for (const id of removedIds) {
    const { incoming, outgoing } = incident(baseEdges, id);
    if (!incoming || !outgoing) continue;
    const rejoin = `${incoming.source}->${outgoing.target}`;
    if (rejoin !== edgeKey({ source: id, target: id }) && targetKeys.has(rejoin) && !baseKeys.has(rejoin)) {
      hints.push({ kind: 'removed-rejoin', nodeId: id, neighbors: [incoming.source, outgoing.target] });
    }
  }
  return hints;
}

function diffNamedRecords(
  base: Record<string, unknown> | undefined,
  target: Record<string, unknown> | undefined
): DiffField[] {
  const b = base ?? {};
  const t = target ?? {};
  const changes: DiffField[] = [];
  const keys = new Set([...Object.keys(b), ...Object.keys(t)]);
  for (const key of keys) {
    if (!jsonEqual(b[key], t[key])) changes.push({ field: key, base: b[key], target: t[key] });
  }
  return changes;
}

function asNamedRecord(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

/**
 * Normalizes the `variables` section: on disk it is an array of objects
 * keyed by their `name` (fallback `id`); legacy/programmatic callers may
 * pass a plain record. Returns both views so output can mirror input shape.
 */
function keyedVariables(value: unknown): {
  byName: Record<string, unknown>;
  wasArray: boolean;
} {
  const byName: Record<string, unknown> = {};
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (entry !== null && typeof entry === 'object') {
        const record = entry as Record<string, unknown>;
        const key = toDisplayString(record.name ?? record.id ?? '');
        if (key) byName[key] = record;
      }
    }
    return { byName, wasArray: true };
  }
  const record = asNamedRecord(value);
  if (record) return { byName: { ...record }, wasArray: false };
  return { byName: {}, wasArray: false };
}

function diffKeyedVariables(baseValue: unknown, targetValue: unknown): DiffField[] {
  const { byName: base } = keyedVariables(baseValue);
  const { byName: target } = keyedVariables(targetValue);
  const changes: DiffField[] = [];
  const names = new Set([...Object.keys(base), ...Object.keys(target)]);
  for (const name of names) {
    if (!jsonEqual(base[name], target[name])) {
      changes.push({ field: name, base: base[name], target: target[name] });
    }
  }
  return changes;
}

export function diffDiagrams(base: DiagramDocLike, target: DiagramDocLike): DiagramDiff {
  const baseNodes = new Map(base.nodes.map((n) => [n.id, n]));
  const targetNodes = new Map(target.nodes.map((n) => [n.id, n]));
  const addedIds = new Set([...targetNodes.keys()].filter((id) => !baseNodes.has(id)));
  const removedIds = new Set([...baseNodes.keys()].filter((id) => !targetNodes.has(id)));

  const nodeChanges: NodeChange[] = [];
  for (const id of addedIds) {
    nodeChanges.push({ nodeId: id, kind: 'added', changes: [] });
  }
  for (const id of removedIds) {
    nodeChanges.push({ nodeId: id, kind: 'removed', changes: [] });
  }
  for (const [id, targetNode] of targetNodes) {
    const baseNode = baseNodes.get(id);
    if (!baseNode) continue;
    const changes = diffFlatFields(
      flatten((baseNode.data ?? {}) as Record<string, unknown>),
      flatten((targetNode.data ?? {}) as Record<string, unknown>)
    );
    const basePos = baseNode.position ?? null;
    const targetPos = targetNode.position ?? null;
    const positionChanged = !jsonEqual(basePos, targetPos);
    if (changes.length === 0 && positionChanged) {
      nodeChanges.push({ nodeId: id, kind: 'moved', changes: [], from: basePos ?? undefined, to: targetPos ?? undefined });
    } else if (changes.length > 0) {
      nodeChanges.push({
        nodeId: id,
        kind: 'modified',
        changes,
        ...(positionChanged ? { from: basePos ?? undefined, to: targetPos ?? undefined } : {}),
      });
    }
  }

  const subDiagramChanges: SubDiagramRefChange[] = [];
  collectSubDiagramChanges(baseNodes, targetNodes, subDiagramChanges);

  return {
    nodeChanges,
    edgeChanges: diffEdges(base.edges, target.edges),
    subDiagramChanges,
    structuralHints: detectStructuralHints(base.edges, target.edges, addedIds, removedIds),
    metadataChanges: diffNamedRecords(asNamedRecord(base.metadata), asNamedRecord(target.metadata)),
    variableChanges: diffKeyedVariables(base.variables, target.variables),
  };
}

/** True when nothing differs at any level. */
export function isDiffEmpty(diff: DiagramDiff): boolean {
  return (
    diff.nodeChanges.length === 0 &&
    diff.edgeChanges.length === 0 &&
    diff.subDiagramChanges.length === 0 &&
    diff.metadataChanges.length === 0 &&
    diff.variableChanges.length === 0
  );
}

/** Node-status lookup for canvas colorization. */
export function nodeStatusMap(diff: DiagramDiff): Map<string, NodeChangeKind> {
  const map = new Map<string, NodeChangeKind>();
  for (const change of diff.nodeChanges) map.set(change.nodeId, change.kind);
  return map;
}

export function edgeStatusMap(diff: DiagramDiff): Map<string, 'added' | 'removed'> {
  const map = new Map<string, 'added' | 'removed'>();
  for (const change of diff.edgeChanges) {
    if (change.kind === 'added') map.set(`${change.source}->${change.target}`, 'added');
    if (change.kind === 'removed') map.set(`${change.source}->${change.target}`, 'removed');
  }
  return map;
}

// ---------------------------------------------------------------------------
// Graph-level 3-way merge
// ---------------------------------------------------------------------------

interface NodeMergeState {
  id: string;
  /** Flattened fields after merge; conflicts recorded separately. */
  fields: Map<string, unknown>;
  position: { x: number; y: number } | null;
  /** Whole-node payload used when a side contributes a brand-new node. */
  sourceNode: DiagramDocLike['nodes'][number];
  deleted: { ours: boolean; theirs: boolean };
  modifiedOffBase: { ours: boolean; theirs: boolean };
  inBase: boolean;
}

interface MergeState {
  nodes: Map<string, NodeMergeState>;
  edges: Map<string, { edge: DiagramDocLike['edges'][number]; oursOnly: boolean; theirsOnly: boolean; both: boolean }>;
  metadata: Record<string, unknown>;
  variables: Record<string, unknown>;
  variablesWasArray: boolean;
  variablesOffBase: { ours: Set<string>; theirs: Set<string> };
  metadataOffBase: { ours: Set<string>; theirs: Set<string> };
}

function offBase(baseValue: unknown, sideValue: unknown): boolean {
  return !jsonEqual(baseValue, sideValue);
}

function buildMergeState(
  base: DiagramDocLike,
  ours: DiagramDocLike,
  theirs: DiagramDocLike
): MergeState {
  const asMap = (doc: DiagramDocLike) => new Map(doc.nodes.map((n) => [n.id, n]));
  const baseNodes = asMap(base);
  const ourNodes = asMap(ours);
  const theirNodes = asMap(theirs);
  const ids = new Set([...baseNodes.keys(), ...ourNodes.keys(), ...theirNodes.keys()]);

  const nodes = new Map<string, NodeMergeState>();
  for (const id of ids) {
    const baseNode = baseNodes.get(id);
    const ourNode = ourNodes.get(id);
    const theirNode = theirNodes.get(id);
    const baseFields = flatten(((baseNode?.data ?? {}) as Record<string, unknown>));
    const ourFields = flatten(((ourNode?.data ?? {}) as Record<string, unknown>));
    const theirFields = flatten(((theirNode?.data ?? {}) as Record<string, unknown>));
    const fields = new Map<string, unknown>();
    const fieldKeys = new Set([...baseFields.keys(), ...ourFields.keys(), ...theirFields.keys()]);
    for (const key of fieldKeys) {
      const b = baseFields.get(key);
      const o = ourFields.get(key);
      const t = theirFields.get(key);
      if (!jsonEqual(o, b) && jsonEqual(t, b)) fields.set(key, o);
      else if (!jsonEqual(t, b) && jsonEqual(o, b)) fields.set(key, t);
      else fields.set(key, o ?? t ?? b);
    }
    const basePos = baseNode?.position ?? null;
    const ourPos = ourNode?.position ?? basePos;
    const theirPos = theirNode?.position ?? basePos;
    const position = !jsonEqual(ourPos, basePos) ? ourPos : theirPos;
    const sideFields = (f: Map<string, unknown>) => {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of f) obj[k] = v;
      return jsonEqual(obj, baseNode?.data ?? {});
    };
    nodes.set(id, {
      id,
      fields,
      position,
      sourceNode: (ourNode ?? theirNode ?? baseNode)!,
      deleted: { ours: ourNode === undefined, theirs: theirNode === undefined },
      modifiedOffBase: { ours: !sideFields(ourFields), theirs: !sideFields(theirFields) },
      inBase: baseNodes.has(id),
    });
  }

  const edgeSide = (doc: DiagramDocLike) => {
    const m = new Map<string, DiagramDocLike['edges'][number]>();
    for (const e of doc.edges) m.set(edgeKey(e), e);
    return m;
  };
  const baseEdges = edgeSide(base);
  const ourEdges = edgeSide(ours);
  const theirEdges = edgeSide(theirs);
  const edges = new Map<string, { edge: DiagramDocLike['edges'][number]; oursOnly: boolean; theirsOnly: boolean; both: boolean }>();
  const edgeIds = new Set([...baseEdges.keys(), ...ourEdges.keys(), ...theirEdges.keys()]);
  for (const key of edgeIds) {
    const b = baseEdges.get(key);
    const o = ourEdges.get(key);
    const t = theirEdges.get(key);
    const winner = !jsonEqual(o, b) && jsonEqual(t, b) ? o : !jsonEqual(t, b) ? t : (o ?? b);
    if (winner) {
      edges.set(key, {
        edge: winner,
        oursOnly: o !== undefined && b === undefined && t === undefined,
        theirsOnly: t !== undefined && b === undefined && o === undefined,
        both: o !== undefined && t !== undefined && b === undefined,
      });
    }
  }

  const metadata = {
    ...((asNamedRecord(theirs.metadata) ?? {}) as Record<string, unknown>),
    ...Object.fromEntries(
      Object.entries({ ...(asNamedRecord(ours.metadata) ?? {}) }).filter(
        ([k, v]) => offBase((asNamedRecord(base.metadata) ?? {})[k], v)
      )
    ),
  };
  const metadataOffBase = {
    ours: new Set(
      Object.entries(asNamedRecord(ours.metadata) ?? {})
        .filter(([k, v]) => offBase((asNamedRecord(base.metadata) ?? {})[k], v))
        .map(([k]) => k)
    ),
    theirs: new Set(
      Object.entries(asNamedRecord(theirs.metadata) ?? {})
        .filter(([k, v]) => offBase((asNamedRecord(base.metadata) ?? {})[k], v))
        .map(([k]) => k)
    ),
  };

  const baseVars = keyedVariables(base.variables);
  const ourVars = keyedVariables(ours.variables);
  const theirVars = keyedVariables(theirs.variables);
  const variables: Record<string, unknown> = { ...theirVars.byName };
  const variablesOffBase = {
    ours: new Set(
      Object.entries(ourVars.byName)
        .filter(([k, v]) => offBase(baseVars.byName[k], v))
        .map(([k]) => k)
    ),
    theirs: new Set(
      Object.entries(theirVars.byName)
        .filter(([k, v]) => offBase(baseVars.byName[k], v))
        .map(([k]) => k)
    ),
  };
  for (const [k, v] of Object.entries(ourVars.byName)) {
    if (offBase(baseVars.byName[k], v)) variables[k] = v;
  }

  return {
    nodes,
    edges,
    metadata,
    variables,
    variablesWasArray: ourVars.wasArray || theirVars.wasArray,
    variablesOffBase,
    metadataOffBase,
  };
}

function conflictKey(kind: MergeConflictKind, parts: Array<string | undefined>): string {
  return [kind, ...parts.map((p) => p ?? '')].join('|');
}

/**
 * Graph-level 3-way merge. Non-conflicting changes from both sides merge
 * automatically; diverging changes produce {@link MergeConflict}s resolved
 * via `resolutions` (missing keys default to ours). The returned document is
 * always structurally complete, so it can be rendered/serialized even while
 * conflicts are unresolved.
 */
export function mergeDiagrams(
  base: DiagramDocLike,
  ours: DiagramDocLike,
  theirs: DiagramDocLike,
  resolutions: Record<string, Resolution> = {}
): { merged: DiagramDocLike; conflicts: MergeConflict[] } {
  const state = buildMergeState(base, ours, theirs);
  const conflicts: MergeConflict[] = [];
  const pick = (key: string): Resolution => resolutions[key] ?? 'ours';

  const resultNodes: Array<DiagramDocLike['nodes'][number]> = [];
  for (const node of state.nodes.values()) {
    const { id, deleted, modifiedOffBase } = node;
    if (deleted.ours && deleted.theirs) continue;
    if (deleted.ours !== deleted.theirs) {
      if (!node.inBase) {
        // Added on one side only — take the side that has it.
        const doc = deleted.ours ? theirs : ours;
        resultNodes.push(doc.nodes.find((n) => n.id === id) ?? node.sourceNode);
        continue;
      }
      const otherSideModified = deleted.ours ? modifiedOffBase.theirs : modifiedOffBase.ours;
      if (otherSideModified) {
        // Delete-vs-modify: conflict, resolution decides whether the node
        // survives (and which side's payload wins).
        const key = conflictKey('node-delete', [id]);
        conflicts.push({
          kind: 'node-delete',
          key,
          nodeId: id,
          base: true,
          ours: !deleted.ours,
          theirs: !deleted.theirs,
        });
        const resolution = pick(key);
        const survives = resolution === 'ours' ? !deleted.ours : !deleted.theirs;
        if (survives) {
          const doc = resolution === 'ours' ? ours : theirs;
          resultNodes.push(doc.nodes.find((n) => n.id === id) ?? node.sourceNode);
        }
      }
      // Unopposed deletion (other side untouched): deletion wins silently.
      continue;
    }
    if (!deleted.ours) {
      // Added on one/both sides or present in all three.
      const addedBoth = !base.nodes.some((n) => n.id === id) && node.modifiedOffBase.ours && node.modifiedOffBase.theirs;
      if (addedBoth) {
        const ourNode = ours.nodes.find((n) => n.id === id)!;
        const theirNode = theirs.nodes.find((n) => n.id === id)!;
        if (!jsonEqual(ourNode.data ?? {}, theirNode.data ?? {})) {
          const key = conflictKey('node-add', [id]);
          conflicts.push({
            kind: 'node-add',
            key,
            nodeId: id,
            base: null,
            ours: ourNode.data ?? {},
            theirs: theirNode.data ?? {},
          });
          resultNodes.push(pick(key) === 'ours' ? ourNode : theirNode);
          continue;
        }
      }
    }
    const data: Record<string, unknown> = {};
    const baseData = (base.nodes.find((n) => n.id === id)?.data ?? {}) as Record<string, unknown>;
    const ourDataMap = flatten(ours.nodes.find((n) => n.id === id)?.data ?? {});
    const theirDataMap = flatten(theirs.nodes.find((n) => n.id === id)?.data ?? {});
    const keys = new Set([...node.fields.keys()]);
    for (const key of keys) {
      const b = flatten(baseData).get(key);
      const o = ourDataMap.get(key);
      const t = theirDataMap.get(key);
      const oursChanged = !jsonEqual(o, b);
      const theirsChanged = !jsonEqual(t, b);
      if (oursChanged && theirsChanged && !jsonEqual(o, t)) {
        const keyId = conflictKey('node-field', [id, key]);
        conflicts.push({ kind: 'node-field', key: keyId, nodeId: id, field: key, base: b, ours: o, theirs: t });
        data[key] = pick(keyId) === 'ours' ? o : t;
      } else {
        data[key] = node.fields.get(key);
      }
    }
    // Rebuild nested objects from flattened paths (params.*, etc.).
    const rebuilt = unflatten(data);
    const template = (ours.nodes.find((n) => n.id === id) ?? theirs.nodes.find((n) => n.id === id))!;
    const mergedNode: DiagramDocLike['nodes'][number] = {
      ...(template as unknown as Record<string, unknown>),
      id,
      data: { ...(template.data ?? {}), ...rebuilt },
      position: node.position ?? template.position,
    } as DiagramDocLike['nodes'][number];
    resultNodes.push(mergedNode);
  }

  const resultEdges: Array<DiagramDocLike['edges'][number]> = [];
  for (const [key, entry] of state.edges) {
    const baseEdge = base.edges.find((e) => edgeKey(e) === key);
    const ourEdge = ours.edges.find((e) => edgeKey(e) === key);
    const theirEdge = theirs.edges.find((e) => edgeKey(e) === key);
    const oursChanged = !jsonEqual(ourEdge, baseEdge);
    const theirsChanged = !jsonEqual(theirEdge, baseEdge);
    if (oursChanged && theirsChanged && !jsonEqual(ourEdge, theirEdge)) {
      const conflictKeyStr = conflictKey('edge', [key]);
      conflicts.push({
        kind: 'edge',
        key: conflictKeyStr,
        source: entry.edge.source,
        target: entry.edge.target,
        base: baseEdge ?? null,
        ours: ourEdge ?? null,
        theirs: theirEdge ?? null,
      });
      if (pick(conflictKeyStr) === 'theirs' && theirEdge) resultEdges.push(theirEdge);
      else if (ourEdge) resultEdges.push(ourEdge);
      continue;
    }
    const winner = oursChanged ? ourEdge : theirsChanged ? theirEdge : (baseEdge ?? ourEdge ?? theirEdge);
    if (winner) resultEdges.push(winner);
  }

  const metadata: Record<string, unknown> = { ...state.metadata };
  for (const key of new Set([...state.metadataOffBase.ours, ...state.metadataOffBase.theirs])) {
    const b = (asNamedRecord(base.metadata) ?? {})[key];
    const o = (asNamedRecord(ours.metadata) ?? {})[key];
    const t = (asNamedRecord(theirs.metadata) ?? {})[key];
    if (!jsonEqual(o, b) && !jsonEqual(t, b) && !jsonEqual(o, t)) {
      const keyId = conflictKey('metadata', [key]);
      conflicts.push({ kind: 'metadata', key: keyId, field: key, base: b, ours: o, theirs: t });
      metadata[key] = pick(keyId) === 'ours' ? o : t;
    }
  }

  const variables: Record<string, unknown> = { ...state.variables };
  for (const key of new Set([...state.variablesOffBase.ours, ...state.variablesOffBase.theirs])) {
    const b = keyedVariables(base.variables).byName[key];
    const o = keyedVariables(ours.variables).byName[key];
    const t = keyedVariables(theirs.variables).byName[key];
    if (!jsonEqual(o, b) && !jsonEqual(t, b) && !jsonEqual(o, t)) {
      const keyId = conflictKey('variable', [key]);
      conflicts.push({ kind: 'variable', key: keyId, field: key, base: b, ours: o, theirs: t });
      variables[key] = pick(keyId) === 'ours' ? o : t;
    }
  }
  const mergedVariables = state.variablesWasArray
    ? // Preserve ours' order, then append names introduced only on theirs.
      [
        ...Object.entries(keyedVariables(ours.variables).byName)
          .filter(([k]) => k in variables)
          .map(([k]) => variables[k]),
        ...Object.entries(keyedVariables(theirs.variables).byName)
          .filter(([k]) => k in variables && !(k in keyedVariables(ours.variables).byName))
          .map(([k]) => variables[k]),
      ]
    : variables;

  const oursExtra = {
    version: ours.version,
    exportedAt: ours.exportedAt,
    viewport: ours.viewport,
  } as Partial<DiagramDocLike>;

  const merged: DiagramDocLike = {
    ...(oursExtra as Record<string, unknown>),
    metadata,
    nodes: resultNodes,
    edges: resultEdges,
    variables: mergedVariables,
  } as unknown as DiagramDocLike;
  return { merged, conflicts };
}

/** Inverse of {@link flatten}: dotted paths back into nested plain objects. */
function unflatten(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(fields)) {
    const parts = path.split('.');
    let cursor = out;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      if (cursor[part] === null || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) {
        cursor[part] = {};
      }
      cursor = cursor[part] as Record<string, unknown>;
    }
    cursor[parts[parts.length - 1]] = value;
  }
  return out;
}
