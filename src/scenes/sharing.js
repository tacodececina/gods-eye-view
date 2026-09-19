import { withShareSignal } from '../director/sharing/lifetime.js';
import {
  readSceneShare,
  createSceneBundle,
  BUNDLE_SOURCE,
} from '../director/sharing/bundle.js';
import { describeSceneShare } from '../director/sharing/preview.js';
import { stringifySceneDocument } from '../director/document.js';
import {
  editSceneDetails,
  selectSceneDocument,
} from '../director/authoring.js';
import { createSceneDialog, mountSceneSharing } from '../ui/sceneSharing.js';
import { PACK_LIMITS } from '../director/packs/manifest.js';

function download(text, name) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
const subset = (value, keys) =>
  Object.fromEntries(
    keys
      .filter((key) => Object.hasOwn(value, key))
      .map((key) => [key, value[key]]),
  );
const sceneKeys = ['anchors', 'dataPacks'];
const shotKeys = [
  'camera',
  'move',
  'durationSec',
  'holdSec',
  'dataPackIds',
  'interactions',
];
const json = (value) => JSON.stringify(value, null, 2);
const mimeFor = (file) =>
  file.type ||
  {
    json: 'application/json',
    geojson: 'application/geo+json',
    png: 'image/png',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
  }[file.name.split('.').at(-1)];

/** Own staged imports, author drafts and share bytes separately from playback and project state. */
export function createSceneSharing(director) {
  let dialog,
    controller,
    disposed = false,
    staged = null,
    busy = false;
  const alive = (owner) =>
    !disposed && controller === owner && !owner.signal.aborted;
  function close() {
    controller?.abort();
    controller = null;
    dialog?.dispose();
    dialog = null;
    staged = null;
    busy = false;
  }
  function open(title) {
    close();
    if (disposed) return null;
    controller = new AbortController();
    dialog = createSceneDialog(title, close);
    return controller;
  }
  async function run(owner, job) {
    if (!alive(owner) || busy) return;
    busy = true;
    try {
      await job();
    } catch (error) {
      if (alive(owner))
        dialog.status.textContent =
          error?.name === 'SceneDocumentError'
            ? error.message
            : 'No se completó la acción. Revisa el archivo, las referencias y los recursos seleccionados.';
    } finally {
      if (alive(owner)) busy = false;
    }
  }
  const currentProject = () => json(director._project);
  function inventory(input) {
    const report = describeSceneShare(input, {
      sourceIds: director._dataPacks.sourceIds(),
      layerIds: director.dataManager.getAll().map((l) => l.id),
    });
    dialog.text(
      `${report.scenes} escenas · ${report.shots} tomas · ${report.packs.length} paquetes de datos`,
    );
    for (const pack of report.packs)
      dialog.text(
        `${pack.scene} / ${pack.id}: ${pack.status}. Archivo: ${pack.path}. ${pack.attribution.text} · ${pack.attribution.license}`,
      );
    if (report.missingLayers.length)
      dialog.text(`Capas no disponibles: ${report.missingLayers.join(', ')}`);
    if (report.externalContent)
      dialog.text(
        'Esta escena usa contenido registrado o medios enlazados. Esos archivos externos no se incluyen en el paquete y conservan sus avisos originales.',
      );
    if (report.bundledBytes)
      dialog.text(
        `${report.bundledBytes} bytes del paquete verificados. Los archivos duran esta sesión. Reimporta el paquete tras recargar.`,
      );
    return report;
  }
  async function preview(file) {
    const owner = open('Revisar importación de escena');
    if (!owner) return;
    const expected = currentProject();
    dialog.text('No se cambiará el proyecto hasta que apliques este archivo.');
    await run(owner, async () => {
      const input = await readSceneShare(file, { signal: owner.signal });
      if (!alive(owner)) return;
      staged = input;
      inventory(input);
      dialog.status.textContent = 'Listo para importar';
      dialog.text(
        'Aplicar reemplaza el proyecto actual. Expórtalo primero si necesitas conservar ambos.',
      );
      const apply = dialog.button('Aplicar importación', () =>
        run(owner, async () => {
          if (expected !== currentProject())
            throw new Error('El proyecto cambió');
          apply.disabled = true;
          const ok = await director.importProjectFile(file, {
            prepared: input,
            expectedProject: expected,
            signal: owner.signal,
          });
          if (alive(owner)) {
            if (ok) close();
            else {
              apply.disabled = false;
              dialog.status.textContent =
                'No se aplicó la importación. El proyecto actual puede haber cambiado.';
            }
          }
        }),
      );
      apply.dataset.directorApplyImport = '';
    });
  }
  function edit() {
    const scene = director._getSelectedScene(),
      shot = scene?.shots.find((s) => s.id === director._selectedShotId);
    if (!scene || !shot) {
      director._updateStatus('Selecciona primero una escena y una toma');
      return;
    }
    const owner = open('Editar detalles de escena');
    if (!owner) return;
    const original = structuredClone(director._project),
      expected = currentProject();
    dialog.text(
      'La cámara usa grados y metros sobre el elipsoide. El borrador se valida antes de reemplazar la escena guardada.',
    );
    const sceneText = dialog.input(
      'Anclas y paquetes de datos',
      json(subset(scene, sceneKeys)),
      { multiline: true },
    );
    const shotText = dialog.input(
      'Cámara, tiempos, paquetes y acciones de la toma',
      json(subset(shot, shotKeys)),
      { multiline: true },
    );
    const anchorName = dialog.input('ID de la nueva ancla', 'anchor-1');
    dialog.button(
      'Capturar cámara como ancla',
      () =>
        run(owner, async () => {
          const details = JSON.parse(sceneText.value),
            camera = director.styleManager.getCameraState();
          if (!camera) throw new Error('Cámara no disponible');
          const anchors = details.anchors || [];
          if (anchors.some((a) => a.id === anchorName.value))
            throw new Error('Ancla duplicada');
          details.anchors = [
            ...anchors,
            {
              id: anchorName.value,
              lat: camera.lat,
              lon: camera.lon,
              alt: camera.alt,
              altitudeReference: 'ellipsoid',
            },
          ];
          editSceneDetails(
            original,
            scene.id,
            shot.id,
            details,
            JSON.parse(shotText.value),
          );
          sceneText.value = json(details);
          dialog.status.textContent = 'Ancla añadida al borrador';
        }),
      dialog.body,
    );
    dialog.button(
      'Iniciar movimiento desde la cámara actual',
      () =>
        run(owner, async () => {
          const details = JSON.parse(shotText.value),
            camera = director.styleManager.getCameraState();
          if (!camera) throw new Error('Cámara no disponible');
          details.move = {
            from: {
              ...subset(camera, [
                'lat',
                'lon',
                'alt',
                'heading',
                'pitch',
                'roll',
              ]),
              altitudeReference: 'ellipsoid',
            },
            easing: 'cubic-in-out',
          };
          if (!details.camera.anchorId)
            details.camera.altitudeReference = 'ellipsoid';
          details.durationSec = Math.max(0.2, details.durationSec || 3);
          editSceneDetails(
            original,
            scene.id,
            shot.id,
            JSON.parse(sceneText.value),
            details,
          );
          shotText.value = json(details);
          dialog.status.textContent =
            'Movimiento añadido; el destino conserva la cámara de la toma';
        }),
      dialog.body,
    );
    dialog.button(
      'Usar vuelo normal',
      () => {
        if (!alive(owner)) return;
        try {
          const details = JSON.parse(shotText.value);
          delete details.move;
          shotText.value = json(details);
        } catch {
          dialog.status.textContent = 'JSON de toma inválido';
        }
      },
      dialog.body,
    );
    const apply = dialog.button('Aplicar detalles', () =>
      run(owner, async () => {
        if (expected !== currentProject())
          throw new Error('El proyecto cambió');
        const project = editSceneDetails(
          original,
          scene.id,
          shot.id,
          JSON.parse(sceneText.value),
          JSON.parse(shotText.value),
        );
        const ok = await director.importProjectFile(
          {
            name: 'scene details',
            text: async () => stringifySceneDocument(project),
          },
          {
            prepared: { project, assets: director._bundleAssets.snapshot() },
            expectedProject: expected,
            signal: owner.signal,
            selection: { sceneId: scene.id, shotId: shot.id },
          },
        );
        if (alive(owner) && ok) close();
      }),
    );
    apply.dataset.directorApplyDetails = '';
  }
  function share() {
    let project;
    try {
      project = selectSceneDocument(
        director._project,
        director._selectedSceneId,
      );
    } catch {
      director._updateStatus('Selecciona primero una escena');
      return;
    }
    const owner = open('Compartir escena seleccionada');
    if (!owner) return;
    const paths = new Set(
      project.scenes.flatMap((s) =>
        (s.dataPacks || [])
          .filter((p) => p.source.adapter === BUNDLE_SOURCE)
          .map((p) => p.source.path),
      ),
    );
    const existing = new Map(
      [...director._bundleAssets.snapshot()].filter(([path]) =>
        paths.has(path),
      ),
    );
    staged = { project, assets: existing };
    inventory(staged);
    dialog.text(
      'El JSON conserva la configuración de la escena y sus atribuciones. No incluye archivos. Un paquete incorpora sólo los recursos seleccionados aquí o importados previamente.',
    );
    dialog.button('Descargar escena JSON', () => {
      if (alive(owner)) download(stringifySceneDocument(project), 'scene.json');
    });
    const files = dialog.input('Seleccionar archivos de datos', '', {
      type: 'file',
    });
    files.multiple = true;
    const folder = dialog.input('O seleccionar una carpeta de datos', '', {
      type: 'file',
    });
    folder.multiple = true;
    folder.setAttribute('webkitdirectory', '');
    dialog.button('Descargar paquete con recursos', () =>
      run(owner, async () => {
        const selected = [...files.files, ...folder.files];
        const packs = project.scenes.flatMap((s) => s.dataPacks || []);
        const text = await createSceneBundle(
          project,
          async (pack, { signal }) => {
            if (
              pack.source.adapter === BUNDLE_SOURCE &&
              existing.has(pack.source.path)
            )
              return existing.get(pack.source.path);
            const exact = selected.filter(
              (f) =>
                f.webkitRelativePath === pack.source.path ||
                f.webkitRelativePath?.split('/').slice(1).join('/') ===
                  pack.source.path,
            );
            const name = pack.source.path.split('/').at(-1),
              matches = exact.length
                ? exact
                : selected.filter((f) => f.name === name);
            const keys = new Set(
              packs
                .filter((p) => p.source.path.split('/').at(-1) === name)
                .map((p) => JSON.stringify(p.source)),
            );
            if (matches.length !== 1 || (!exact.length && keys.size > 1))
              throw new Error('Archivo ausente o ambiguo');
            const file = matches[0];
            if (!file.size || file.size > PACK_LIMITS.bytes)
              throw new Error('El recurso excede el límite de tamaño');
            const bytes = new Uint8Array(
              await withShareSignal(file.arrayBuffer(), signal),
            );
            signal.throwIfAborted();
            return { bytes, mimeType: mimeFor(file) };
          },
          { signal: owner.signal },
        );
        if (alive(owner)) {
          download(text, 'scene.gevbundle.json');
          dialog.status.textContent = 'Paquete descargado';
        }
      }),
    );
  }
  const unmount = () => {};
  let removeToolbar = unmount;
  return {
    preview,
    edit,
    share,
    close,
    mount() {
      removeToolbar();
      removeToolbar = mountSceneSharing({ edit, share });
    },
    getState: () => ({
      open: !!dialog,
      busy,
      stagedAssets: staged?.assets.size || 0,
    }),
    destroy() {
      disposed = true;
      close();
      removeToolbar();
    },
  };
}
