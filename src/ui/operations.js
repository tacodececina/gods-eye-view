/** Local, versioned work records. This store never reads provider configuration. */
export const OPERATION_KEY = 'eyeinsky.operations.v1';
export const OPERATION_LIMITS = Object.freeze({
  records: 30,
  name: 80,
  notes: 100,
  note: 2000,
});
export function validateOperation(input) {
  const view = publicView(input);
  const text = (v, max) => {
    if (typeof v !== 'string' || !v.trim() || v.length > max)
      throw new Error('Texto inválido o demasiado largo');
    return v.trim();
  };
  if (
    !Array.isArray(input.notes) ||
    input.notes.length > OPERATION_LIMITS.notes
  )
    throw new Error('Notas inválidas');
  const validDate = (value) =>
    Number.isFinite(value) && value >= 0 && value <= 8640000000000000;
  const notes = input.notes.map((n) => {
    if (!validDate(n?.createdAt)) throw new Error('Fecha inválida');
    return {
      text: text(n.text, OPERATION_LIMITS.note),
      createdAt: n.createdAt,
    };
  });
  if (!validDate(input.createdAt) || !validDate(input.updatedAt))
    throw new Error('Fecha inválida');
  return {
    ...view,
    id: text(input.id, 100),
    name: text(input.name, OPERATION_LIMITS.name),
    notes,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}
export function publicView(input) {
  if (input?.version != null && input.version !== 1)
    throw new Error('Versión incompatible');
  const camera = {};
  for (const [key, min, max] of [
    ['lat', -90, 90],
    ['lon', -180, 180],
    ['alt', -1000, 100000000],
    ['heading', -360, 360],
    ['pitch', -90, 90],
    ['roll', -360, 360],
  ]) {
    const value = input?.camera?.[key];
    if (!Number.isFinite(value) || value < min || value > max)
      throw new Error('Cámara inválida');
    camera[key] = value;
  }
  const f = input.filters;
  if (
    !f ||
    ![2.5, 4, 5, 6].includes(f.magnitude) ||
    ![1, 6, 24].includes(f.hours) ||
    !['all', 'americas', 'europe', 'asia', 'oceania', 'africa'].includes(
      f.sector,
    )
  )
    throw new Error('Filtros inválidos');
  if (
    !Array.isArray(input.layers) ||
    input.layers.length > 40 ||
    input.layers.some(
      (id) => typeof id !== 'string' || !/^[a-z0-9-]{1,60}$/.test(id),
    )
  )
    throw new Error('Capas inválidas');
  const selection = input.selection ?? null;
  if (
    selection !== null &&
    (typeof selection !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(selection))
  )
    throw new Error('Selección inválida');
  return {
    version: 1,
    camera,
    layers: [...new Set(input.layers)],
    filters: { magnitude: f.magnitude, hours: f.hours, sector: f.sector },
    selection,
  };
}
export function createOperationStore(storage, now = Date.now) {
  const read = () => {
    let raw;
    try {
      raw = storage.getItem(OPERATION_KEY);
    } catch {
      throw new Error('El navegador denegó el almacenamiento local.');
    }
    if (!raw) return [];
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error('Archivo local dañado. No se sobrescribió.');
    }
    if (!data || typeof data !== 'object')
      throw new Error('Archivo local inválido. No se sobrescribió.');
    if (data.version !== 1)
      throw new Error('Versión local incompatible. No se sobrescribió.');
    if (
      !Array.isArray(data.records) ||
      data.records.length > OPERATION_LIMITS.records
    )
      throw new Error('Archivo local inválido.');
    return data.records.map(validateOperation);
  };
  const write = (records) => {
    if (records.length > OPERATION_LIMITS.records)
      throw new Error(
        'Límite de 30 operaciones. Elimina una antes de guardar.',
      );
    const payload = JSON.stringify({
      version: 1,
      records: records.map(validateOperation),
    });
    try {
      storage.setItem(OPERATION_KEY, payload);
    } catch {
      throw new Error('No se guardó: almacenamiento denegado o sin espacio.');
    }
  };
  return {
    list: read,
    reset() {
      try {
        storage.removeItem(OPERATION_KEY);
      } catch {
        throw new Error('El navegador denegó el restablecimiento local.');
      }
    },
    save(input) {
      const records = read();
      const record = validateOperation({
        ...input,
        id: input.id || crypto.randomUUID(),
        createdAt: input.createdAt || now(),
        updatedAt: now(),
      });
      const index = records.findIndex((r) => r.id === record.id);
      if (index < 0) records.push(record);
      else records[index] = record;
      write(records);
      return record;
    },
    rename(id, name) {
      const records = read();
      const record = records.find((r) => r.id === id);
      if (!record) throw new Error('Operación no encontrada');
      record.name = name;
      record.updatedAt = now();
      write(records);
      return record;
    },
    remove(id) {
      write(read().filter((r) => r.id !== id));
    },
  };
}
