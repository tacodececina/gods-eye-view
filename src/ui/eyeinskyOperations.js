import { createOperationStore, publicView } from './operations.js';

/** Local operation actions are independent of the director's shareable scene project. */
export function mountOperationPanel({
  lifetime,
  readView,
  restoreView,
  notice,
  dialog,
  openView,
}) {
  const $ = (id) => document.getElementById(id);
  let current = null,
    notes = [];
  let storage;
  try {
    storage = window.localStorage;
  } catch {
    storage = {
      getItem() {
        throw new Error('denied');
      },
    };
  }
  const store = createOperationStore(storage);
  const status = (message) => {
    $('eye-operation-status').textContent = message;
  };
  const paintNotes = () => {
    $('eye-note-history').replaceChildren();
    for (const note of notes) {
      const p = document.createElement('p');
      p.className = 'eye-note';
      p.textContent = note.text;
      const time = document.createElement('time');
      time.dateTime = new Date(note.createdAt).toISOString();
      time.textContent = new Date(note.createdAt).toLocaleString('es-MX');
      p.append(time);
      $('eye-note-history').append(p);
    }
  };
  function list() {
    const host = $('eye-operation-list');
    host.replaceChildren();
    try {
      const rows = store.list();
      $('eye-operation-recover').hidden = true;
      if (!rows.length) {
        const p = document.createElement('p');
        p.textContent = 'Todavía no hay operaciones guardadas.';
        host.append(p);
      }
      for (const row of rows) {
        const article = document.createElement('article');
        article.className = 'eye-operation-row';
        article.dataset.operationId = row.id;
        const title = document.createElement('strong');
        title.textContent = row.name;
        const meta = document.createElement('small');
        meta.textContent = `${row.notes.length} notas · ${new Date(row.updatedAt).toLocaleString('es-MX')}`;
        const actions = document.createElement('div');
        actions.className = 'eye-operation-actions';
        for (const [action, label] of [
          ['open', 'Abrir'],
          ['rename', 'Renombrar'],
          ['delete', 'Eliminar'],
        ]) {
          const button = document.createElement('button');
          button.textContent = label;
          button.dataset.operationAction = action;
          button.dataset.operationId = row.id;
          button.setAttribute('aria-label', `${label} ${row.name}`);
          actions.append(button);
        }
        article.append(title, meta, actions);
        host.append(article);
      }
    } catch (e) {
      status(e.message);
      $('eye-operation-recover').hidden = false;
    }
  }
  function fresh() {
    current = null;
    notes = [];
    $('eye-operation-name').value = '';
    $('eye-operation-note').value = '';
    $('eye-operation-save').textContent = 'Guardar operación';
    paintNotes();
    status(
      'Nueva operación. Guarda la cámara, las capas y los filtros actuales.',
    );
  }
  lifetime.listen($('eye-operation-new'), 'click', fresh);
  lifetime.listen($('eye-operation-recover'), 'click', async () => {
    const result = await dialog('Restablecer operaciones locales', {
      text: 'Se borrará únicamente el archivo de operaciones de EYEINSKY en este dispositivo, incluidas sus notas. Los datos dañados no se pueden recuperar desde la aplicación. Esta acción no se puede deshacer.',
      confirm: 'Borrar y restablecer',
    });
    if (!result.confirmed || lifetime.destroyed) return;
    try {
      store.reset();
      fresh();
      list();
      status('Archivo local restablecido.');
    } catch (e) {
      status(e.message);
    }
  });
  lifetime.listen($('eye-operation-form'), 'submit', (event) => {
    event.preventDefault();
    try {
      const text = $('eye-operation-note').value.trim();
      const nextNotes = text
        ? [...notes, { text, createdAt: Date.now() }]
        : notes;
      const saved = store.save({
        ...readView(),
        id: current?.id,
        name: $('eye-operation-name').value,
        notes: nextNotes,
        createdAt: current?.createdAt,
      });
      current = saved;
      notes = saved.notes;
      $('eye-operation-note').value = '';
      $('eye-operation-save').textContent = 'Actualizar operación';
      status('Guardado en este dispositivo.');
      paintNotes();
      list();
      notice('Operación guardada en este dispositivo.');
    } catch (e) {
      status(e.message);
    }
  });
  lifetime.listen($('eye-operation-list'), 'click', async (event) => {
    const button = event.target.closest('[data-operation-action]');
    if (!button) return;
    try {
      const row = store.list().find((r) => r.id === button.dataset.operationId);
      if (!row) return;
      if (button.dataset.operationAction === 'open') {
        status('Restaurando cámara y consultando las fuentes…');
        const outcome = await restoreView(publicView(row));
        if (lifetime.destroyed || outcome?.superseded) return;
        current = row;
        notes = row.notes;
        $('eye-operation-name').value = row.name;
        $('eye-operation-note').value = '';
        $('eye-operation-save').textContent = 'Actualizar operación';
        paintNotes();
        status(`Operación abierta. ${outcome.message}`);
      } else if (button.dataset.operationAction === 'rename') {
        const result = await dialog('Renombrar operación', {
          input: row.name,
          label: 'Nombre',
          confirm: 'Guardar nombre',
        });
        if (result.confirmed) {
          store.rename(row.id, result.value);
          if (current?.id === row.id) {
            current = store.list().find((r) => r.id === row.id);
            $('eye-operation-name').value = current.name;
          }
          list();
          $('eye-operation-name').focus();
        }
      } else {
        const result = await dialog('Eliminar operación', {
          text: `Se eliminará «${row.name}» y sus notas de este dispositivo. Esta acción no se puede deshacer.`,
          confirm: 'Eliminar operación',
        });
        if (result.confirmed) {
          store.remove(row.id);
          if (current?.id === row.id) fresh();
          list();
          status('Operación eliminada.');
          $('eye-operation-new').focus();
        }
      }
    } catch (e) {
      status(e.message);
    }
  });
  lifetime.listen($('eye-director-open'), 'click', () => openView('director'));
  list();
  return { refresh: list, getCurrent: () => current };
}
