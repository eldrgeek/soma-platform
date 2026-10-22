const tokenPattern = /\{([^}]+)\}/g;

// One pass: words that come from a row or a form are inserted as they are, and a
// {...} inside them is never filled.
export function interpolate(template, { data = {}, me = {}, form = {}, row } = {}) {
  return String(template ?? '').replace(tokenPattern, (token, name) => {
    if (name === 'me.name') return String(me.name ?? '');
    if (name.startsWith('form.')) return String(form[name.slice(5)] ?? '');
    if (row && name.startsWith('row.')) return String(row[name.slice(4)] ?? '');
    const count = name.match(/^([\w-]+)\.count$/);
    if (count && Array.isArray(data[count[1]])) return String(data[count[1]].length);
    return token;
  });
}

export function mapFormToRow(template, form = {}, me = {}) {
  return Object.fromEntries(
    Object.entries(template ?? {}).map(([field, value]) => [
      field,
      interpolate(value, { form, me }),
    ]),
  );
}

function append(parent, tag, { className, text, attrs } = {}) {
  const node = parent.ownerDocument.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attrs ?? {})) {
    node.setAttribute(name, value);
  }
  parent.append(node);
  return node;
}

function collectionRows(sketch, data, name) {
  if (Array.isArray(data[name])) return data[name];
  return sketch.stubs[name]?.children ?? [];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES = {
  Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday',
  Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday',
};

function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

// A stored ISO date is shown with its weekday, in the reader's language. It is
// read in UTC, so the weekday never shifts with the reader's time zone.
export function formatValue(value) {
  const date = isoDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(date);
}

// A list or table that opens a row screen shows a long value cut to its first
// line, at most 80 characters: the row screen shows it whole.
export function shorten(value) {
  const text = String(value ?? '');
  const first = text.split('\n').find((line) => line.trim()) ?? '';
  const cut = first.length > 80 ? `${first.slice(0, 80).trimEnd()}…` : first;
  return cut === text ? text : cut.endsWith('…') ? cut : `${cut} …`;
}

function rowText(row, brief) {
  return Object.entries(row)
    .filter(([key]) => key !== 'id' && key !== 'status')
    .map(([, value]) => (brief ? shorten(formatValue(value)) : formatValue(value)))
    .filter(Boolean)
    .join(' · ');
}

// Checks the fields a person filled before their row is sent: a @required
// field may not be empty, and a @date field takes a date on one of its days.
// The server makes the same checks.
function checkFields(root) {
  for (const input of root.querySelectorAll('[data-puppet-field]')) {
    const label = input.dataset.puppetField;
    if (input.required && !input.value.trim()) throw new Error(`Please fill in "${label}" first.`);
    const days = input.dataset.puppetDays?.split(' ').filter(Boolean);
    if (days?.length && input.value) {
      const date = isoDate(input.value);
      if (!date || !days.includes(WEEKDAYS[date.getUTCDay()])) {
        throw new Error(`"${label}" must be a ${days.map((day) => DAY_NAMES[day]).join(' or ')}.`);
      }
    }
  }
}

/**
 * Render a parsed Puppet sketch into a DOM root.
 *
 * @param {object} sketch parsed Puppet Script
 * @param {object} options
 * @param {HTMLElement} options.root
 * @param {Record<string, object[]>} [options.data]
 * @param {{id?: string, name?: string}} [options.me]
 * @param {boolean} [options.host] whether the reader is the app's host
 * @param {(action: object) => unknown | Promise<unknown>} [options.onAction]
 * @param {{'play-view'?: Function, 'stage-read'?: Function, 'video-view'?: Function, 'video-read'?: Function}} [options.components]
 *   library components (packages/soma-play): play-view(node, text) returns
 *   { highlight(blockIndex) }; stage-read(node, { text, data, rowId, field, onActive });
 *   (packages/soma-video, v0.5): video-view(node, text) returns { highlight(blockIndex), update(text) };
 *   video-read takes what stage-read takes. script-editor needs no component: it sends
 *   onAction({ type: 'edit', target, rowId, field, value }).
 */
const DRAFTS = new WeakMap();

export function render(sketch, { root, data = {}, me = {}, host = false, onAction = () => {}, components = {} }) {
  if (!root?.ownerDocument) throw new TypeError('render requires a DOM root');

  // The server never sends host-only screens to anyone else; this is the
  // same rule in the page, for a host-only screen drawn from a full source.
  const screens = (sketch?.screens ?? []).filter((screen) => !screen.hostOnly || host);
  const dialogs = (sketch?.dialogs ?? []).filter((dialog) => !dialog.hostOnly || host);
  // A screen from data shows one row and has no tab. The page keeps which row
  // (and where Back goes) on the root, so a redraw with new data keeps them.
  const tabbed = screens.filter((screen) => !screen.from);
  const rowsOf = (screen) => collectionRows(sketch, data, screen.from);
  let current =
    screens.find(({ name }) => name === root.dataset.puppetScreen) ?? tabbed[0] ?? null;
  let currentRow = null;
  if (current?.from) {
    currentRow = rowsOf(current).find((row) => row.id === root.dataset.puppetRow) ?? null;
    if (!currentRow) current = screens.find(({ name }) => name === root.dataset.puppetBack && !current.from) ?? tabbed[0] ?? null;
  }
  let dialog = dialogs.find(({ name }) => name === root.dataset.puppetDialog) ?? null;
  let toastTimer;
  let mounted = [];
  // The script editor's unsaved text, by row and field, kept per page root across redraws.
  const drafts = DRAFTS.get(root) ?? new Map();
  DRAFTS.set(root, drafts);
  const draftKey = (label) => `${current?.from}/${currentRow?.id}/${label}`;
  const draftOf = (label) => (currentRow?.id ? drafts.get(draftKey(label)) : undefined);

  const values = () =>
    Object.fromEntries(
      [...root.querySelectorAll('[data-puppet-field]')].map((field) => [
        field.dataset.puppetField,
        field.value,
      ]),
    );

  const showToast = (message) => {
    root.querySelector('.puppet-runtime-toast')?.remove();
    const toast = append(root, 'div', {
      className: 'puppet-runtime-toast',
      text: interpolate(message, { data, me, form: values() }),
      attrs: { role: 'status' },
    });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.remove(), 3000);
  };

  const runActions = async (actions, row, element) => {
    if (actions?.some(({ type }) => type === 'add')) checkFields(root);
    for (const action of actions ?? []) {
      if (action.type === 'add') {
        await onAction({
          type: 'add',
          target: action.target,
          row: mapFormToRow(action.row, values(), me),
        });
      } else if (action.type === 'remove') {
        if (!row?.id) throw new Error('A remove action requires a persisted row id');
        await onAction({ type: 'remove', target: action.target, rowId: row.id });
      } else if (action.type === 'set-status') {
        if (!row?.id) throw new Error('A status action requires a persisted row id');
        await onAction({
          type: 'set-status',
          target: element?.rowOf,
          rowId: row.id,
          status: action.status,
        });
      } else if (action.type === 'open' && action.targetType === 'screen') {
        const target = screens.find(({ name }) => name === action.name);
        if (target?.from) {
          const opened = row ?? (current?.from === target.from ? currentRow : null);
          if (!opened?.id) throw new Error(`Screen "${target.name}" opens from a row`);
          if (!current.from) root.dataset.puppetBack = current.name;
          root.dataset.puppetRow = opened.id;
          show(target, opened);
        } else if (target) {
          show(target, null);
        }
      } else if (action.type === 'open' && action.targetType === 'dialog') {
        dialog = dialogs.find(({ name }) => name === action.name) ?? null;
        root.dataset.puppetDialog = dialog?.name ?? '';
        draw();
      } else if (action.type === 'close-self' || action.type === 'close-dialog' || action.type === 'back') {
        if (dialog) {
          dialog = null;
          root.dataset.puppetDialog = '';
          draw();
        } else if (action.type === 'back' && current?.from) {
          goBack();
        }
      } else if (action.type === 'toast') {
        showToast(action.message);
      }
    }
  };

  function show(screen, row) {
    current = screen;
    currentRow = row;
    dialog = null;
    root.dataset.puppetScreen = screen.name;
    root.dataset.puppetDialog = '';
    draw();
  }

  function goBack() {
    show(tabbed.find(({ name }) => name === root.dataset.puppetBack) ?? tabbed[0], null);
  }

  const wireActions = (node, actions, row, element) => {
    if (!actions?.length) return;
    node.addEventListener('click', async () => {
      try {
        await runActions(actions, row, element);
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Action failed');
      }
    });
  };

  // A button inside a list or table block is drawn on every row and acts on it.
  const rowButtons = (element) =>
    (element.children ?? []).filter((child) => child.kind === 'button');

  const drawRowButtons = (parent, buttons, row) => {
    for (const child of buttons) {
      const button = append(parent, 'button', {
        className: [
          'puppet-runtime-button',
          child.roles?.includes('@primary') ? 'puppet-runtime-primary' : '',
          child.roles?.includes('@danger') ? 'puppet-runtime-danger' : '',
        ].filter(Boolean).join(' '),
        text: child.label ?? 'Button',
        attrs: { type: 'button' },
      });
      wireActions(button, child.hook, row, child);
    }
  };

  const statusBadge = (parent, status) =>
    append(parent, 'span', {
      className: `puppet-runtime-status puppet-runtime-status-${status}`,
      text: status,
    });

  const drawRows = (parent, element) => {
    const rows = collectionRows(sketch, data, element.from);
    const removeAction = element.hook?.find(({ type }) => type === 'remove');
    const buttons = rowButtons(element);
    const opensRow = (actions) => actions?.some((action) => action.type === 'open' && screens.find(({ name }) => name === action.name)?.from);
    const brief = opensRow(element.hook) || buttons.some((child) => opensRow(child.hook));
    if (!rows.length) {
      append(parent, 'p', {
        className: 'puppet-runtime-empty',
        text: interpolate(element.props?.empty ?? 'Nothing here yet.', { data, me }),
      });
      return;
    }

    if (element.kind === 'table') {
      const table = append(parent, 'table', { className: 'puppet-runtime-table' });
      const fields = [
        ...new Set(rows.flatMap((row) => Object.keys(row).filter((key) => key !== 'id'))),
      ];
      const head = append(append(table, 'thead'), 'tr');
      fields.forEach((field) => append(head, 'th', { text: field }));
      if (removeAction || buttons.length) append(head, 'th', { text: 'Actions' });
      const body = append(table, 'tbody');
      for (const row of rows) {
        const tr = append(body, 'tr');
        fields.forEach((field) => {
          const cell = append(tr, 'td');
          if (field === 'status' && row.status) statusBadge(cell, row.status);
          else cell.textContent = brief ? shorten(formatValue(row[field] ?? '')) : formatValue(row[field] ?? '');
        });
        if (removeAction || buttons.length) {
          const cell = append(tr, 'td');
          if (removeAction) {
            const button = append(cell, 'button', {
              className: 'puppet-runtime-button puppet-runtime-danger',
              text: 'Remove',
              attrs: { type: 'button' },
            });
            wireActions(button, [removeAction], row);
          }
          drawRowButtons(cell, buttons, row);
        } else {
          wireActions(tr, element.hook, row);
        }
      }
      return;
    }

    const list = append(parent, 'div', { className: 'puppet-runtime-list-rows' });
    for (const row of rows) {
      const item = append(list, 'div', { className: 'puppet-runtime-list-row' });
      append(item, 'span', { text: rowText(row, brief) });
      if (row.status) statusBadge(item, row.status);
      if (removeAction) {
        const button = append(item, 'button', {
          className: 'puppet-runtime-button puppet-runtime-danger',
          text: 'Remove',
          attrs: { type: 'button' },
        });
        wireActions(button, [removeAction], row);
      } else if (!buttons.length) {
        wireActions(item, element.hook, row);
      }
      drawRowButtons(item, buttons, row);
    }
  };

  // Buttons on a screen from data act on its row (removes from, sets status).
  const screenRow = (element) =>
    element.rowOf && current?.from === element.rowOf ? currentRow ?? undefined : undefined;

  const drawElement = (parent, element) => {
    const text = (value) =>
      interpolate(value, { data, me, form: values(), row: current?.from ? currentRow ?? {} : undefined });
    const roles = element.roles ?? [];

    if (element.kind === 'play-view') {
      const node = append(parent, 'section', { className: 'puppet-runtime-play-view' });
      const source = text(element.label);
      if (components['play-view']) {
        const view = components['play-view'](node, source);
        mounted.push({ view, label: element.label });
      } else {
        append(node, 'pre', { className: 'puppet-runtime-script', text: source });
      }
      return;
    }

    if (element.kind === 'stage-read') {
      const node = append(parent, 'section', { className: 'puppet-runtime-stage-read' });
      if (!components['stage-read'] || !currentRow?.id) {
        append(node, 'p', { className: 'puppet-runtime-empty', text: 'Stage Read is not available here.' });
        return;
      }
      const player = components['stage-read'](node, {
        text: text(element.label),
        data: current.from,
        rowId: currentRow.id,
        field: element.field,
        // The line being read is highlighted in a play-view of the same field.
        onActive: (blockIndex) => {
          for (const entry of mounted) if (entry.label === element.label) entry.view?.highlight?.(blockIndex);
        },
      });
      mounted.push({ view: player, label: null });
      return;
    }

    // Puppet v0.5 (VideoMaker, packages/soma-video): a video script drawn as an AV script, its
    // narration read aloud, and the editor that changes the row's text. Typing in the editor redraws
    // every view of the same field at once, and its unsaved text survives a redraw of the page.
    if (element.kind === 'video-view') {
      const node = append(parent, 'section', { className: 'puppet-runtime-video-view' });
      const source = draftOf(element.label) ?? text(element.label);
      if (components['video-view']) {
        mounted.push({ view: components['video-view'](node, source), label: element.label });
      } else {
        append(node, 'pre', { className: 'puppet-runtime-script', text: source });
      }
      return;
    }

    if (element.kind === 'video-read') {
      const node = append(parent, 'section', { className: 'puppet-runtime-stage-read' });
      if (!components['video-read'] || !currentRow?.id) {
        append(node, 'p', { className: 'puppet-runtime-empty', text: 'The narration read is not available here.' });
        return;
      }
      // It reads the saved script, the text the server has.
      const player = components['video-read'](node, {
        text: text(element.label),
        data: current.from,
        rowId: currentRow.id,
        field: element.field,
        onActive: (blockIndex) => {
          for (const entry of mounted) if (entry.label === element.label) entry.view?.highlight?.(blockIndex);
        },
      });
      mounted.push({ view: player, label: null });
      return;
    }

    if (element.kind === 'script-editor') {
      const node = append(parent, 'section', { className: 'puppet-runtime-script-editor' });
      if (!currentRow?.id) {
        append(node, 'p', { className: 'puppet-runtime-empty', text: 'The editor is not available here.' });
        return;
      }
      const key = draftKey(element.label);
      const area = append(node, 'textarea', {
        className: 'puppet-runtime-script-text',
        attrs: { 'aria-label': 'Script text', spellcheck: 'false' },
      });
      area.value = drafts.get(key) ?? text(element.label);
      const bar = append(node, 'div', { className: 'puppet-runtime-script-bar' });
      const save = append(bar, 'button', {
        className: 'puppet-runtime-button puppet-runtime-primary',
        text: 'Save',
        attrs: { type: 'button' },
      });
      const note = append(bar, 'span', {
        className: 'puppet-runtime-script-note',
        text: drafts.has(key) ? 'Not saved yet.' : 'Saved.',
        attrs: { role: 'status' },
      });
      const row = currentRow;
      const target = current.from;
      area.addEventListener('input', () => {
        drafts.set(key, area.value);
        note.textContent = 'Not saved yet.';
        for (const entry of mounted) if (entry.label === element.label) entry.view?.update?.(area.value);
      });
      save.addEventListener('click', async () => {
        const value = area.value;
        note.textContent = 'Saving…';
        drafts.delete(key);
        try {
          await onAction({ type: 'edit', target, rowId: row.id, field: element.field, value });
          note.textContent = 'Saved.';
        } catch (error) {
          drafts.set(key, value);
          note.textContent = error instanceof Error ? error.message : 'Saving failed';
        }
      });
      return;
    }

    if (element.kind === 'hero') {
      const hero = append(parent, 'section', { className: 'puppet-runtime-hero' });
      append(hero, 'h1', { text: text(element.props?.title ?? element.label ?? '') });
      if (element.props?.subtitle) append(hero, 'p', { text: text(element.props.subtitle) });
      return;
    }

    if (element.kind === 'text' || element.kind === 'label') {
      append(parent, 'p', {
        className: `puppet-runtime-${element.kind}`,
        text: text(element.label),
      });
      return;
    }

    if (element.kind === 'field') {
      const label = append(parent, 'label', { className: 'puppet-runtime-field' });
      append(label, 'span', { text: element.label ?? 'Field' });
      // A @select field with items: is a choice list. The server refuses a
      // value that is not one of the items.
      const items = element.props?.items === undefined ? [] : [].concat(element.props.items);
      if (roles.includes('@select') && items.length) {
        const select = append(label, 'select', {
          attrs: {
            'data-puppet-field': element.label ?? '',
            ...(roles.includes('@required') ? { required: '' } : {}),
          },
        });
        append(select, 'option', { text: 'Choose…', attrs: { value: '' } });
        items.forEach((item) => append(select, 'option', { text: String(item), attrs: { value: String(item) } }));
        return;
      }
      const tag = roles.includes('@multiline') ? 'textarea' : 'input';
      const days = [].concat(element.props?.days ?? []);
      const input = append(label, tag, {
        attrs: {
          'data-puppet-field': element.label ?? '',
          ...(roles.includes('@required') ? { required: '' } : {}),
          ...(roles.includes('@date') && days.length ? { 'data-puppet-days': days.join(' ') } : {}),
        },
      });
      if (tag === 'input') input.type = roles.includes('@date') ? 'date' : 'text';
      if (roles.includes('@date') && days.length) {
        append(label, 'small', {
          className: 'puppet-runtime-hint',
          text: `${days.map((day) => DAY_NAMES[day] ?? day).join(' or ')} only`,
        });
      }
      return;
    }

    if (element.kind === 'button' || element.kind === 'link') {
      const button = append(parent, 'button', {
        className: [
          'puppet-runtime-button',
          roles.includes('@primary') ? 'puppet-runtime-primary' : '',
          roles.includes('@danger') ? 'puppet-runtime-danger' : '',
        ]
          .filter(Boolean)
          .join(' '),
        text: text(element.label ?? element.kind),
        attrs: { type: 'button' },
      });
      wireActions(button, element.hook, screenRow(element), element);
      return;
    }

    if (element.kind === 'list' || element.kind === 'table') {
      const section = append(parent, 'section', {
        className: `puppet-runtime-${element.kind}`,
      });
      if (element.label) append(section, 'h2', { text: text(element.label) });
      drawRows(section, element);
      return;
    }

    if (element.kind === 'composer') {
      const form = append(parent, 'div', { className: 'puppet-runtime-composer' });
      const input = append(form, 'textarea', {
        attrs: {
          'data-puppet-field': element.props?.field ?? 'Message',
          'aria-label': element.props?.field ?? 'Message',
          placeholder: text(element.label ?? ''),
          rows: '2',
        },
      });
      const actions = append(form, 'div', { className: 'puppet-runtime-composer-actions' });
      append(actions, 'span', { className: 'puppet-runtime-mic-slot' });
      const send = append(actions, 'button', {
        className: 'puppet-runtime-button puppet-runtime-primary',
        text: 'Send',
        attrs: { type: 'button' },
      });
      wireActions(send, element.hook);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          send.click();
        }
      });
      return;
    }

    if (element.kind === 'badge') {
      append(parent, 'span', { className: 'puppet-runtime-badge', text: text(element.label) });
      return;
    }

    if (element.kind === 'card') {
      const card = append(parent, 'section', { className: 'puppet-runtime-card' });
      if (element.label) append(card, 'h2', { text: text(element.label) });
      element.children?.forEach((child) => drawElement(card, child));
      wireActions(card, element.hook);
      return;
    }

    if (element.kind === 'toast') {
      append(parent, 'div', {
        className: 'puppet-runtime-inline-toast',
        text: text(element.label),
        attrs: { role: 'status' },
      });
      return;
    }

    if (['region', 'row', 'stack'].includes(element.kind)) {
      const group = append(parent, 'div', {
        className: `puppet-runtime-${element.kind}${element.label ? ` puppet-runtime-region-${element.label}` : ''}`,
      });
      element.children?.forEach((child) => drawElement(group, child));
      return;
    }

    const fallback = append(parent, 'div', {
      className: `puppet-runtime-element puppet-runtime-${element.kind}`,
      text: text(element.label ?? element.props?.title ?? element.kind),
    });
    element.children?.forEach((child) => drawElement(fallback, child));
    wireActions(fallback, element.hook);
  };

  function unmount() {
    for (const entry of mounted) entry.view?.destroy?.();
    mounted = [];
  }

  function draw() {
    clearTimeout(toastTimer);
    unmount();
    root.replaceChildren();
    if (!current) {
      append(root, 'p', { className: 'puppet-runtime-empty', text: 'No screens declared.' });
      return;
    }

    const shell = append(root, 'div', { className: 'puppet-runtime-shell' });
    // The tab bar appears only when the reader has two or more screens with tabs.
    if (tabbed.length >= 2) {
      const nav = append(shell, 'nav', {
        className: 'puppet-runtime-tabs',
        attrs: { 'aria-label': 'App screens' },
      });
      const active = current.from ? tabbed.find(({ name }) => name === root.dataset.puppetBack) : current;
      for (const screen of tabbed) {
        const tab = append(nav, 'button', {
          className: screen === active ? 'active' : '',
          text: screen.name,
          attrs: { type: 'button', 'aria-current': screen === current ? 'page' : 'false' },
        });
        if (screen.hostOnly) {
          append(tab, 'span', { className: 'puppet-runtime-host-only', text: 'only you' });
        }
        tab.addEventListener('click', () => show(screen, null));
      }
    }
    const layout = current.props?.layout;
    const content = append(shell, 'main', {
      className: `puppet-runtime-screen${layout ? ` puppet-runtime-layout-${layout}` : ''}`,
    });
    if (current.from) {
      const back = append(content, 'button', {
        className: 'puppet-runtime-button puppet-runtime-back',
        text: '← Back',
        attrs: { type: 'button' },
      });
      back.addEventListener('click', goBack);
    }
    current.children?.forEach((element) => drawElement(content, element));

    // A dialog is a panel over the screen, with a close button.
    if (dialog) {
      const overlay = append(root, 'div', { className: 'puppet-runtime-dialog', attrs: { role: 'dialog', 'aria-label': dialog.name } });
      const panel = append(overlay, 'div', { className: 'puppet-runtime-dialog-panel' });
      const head = append(panel, 'div', { className: 'puppet-runtime-dialog-head' });
      append(head, 'h2', { text: dialog.name });
      const close = append(head, 'button', {
        className: 'puppet-runtime-button puppet-runtime-dialog-close',
        text: '✕',
        attrs: { type: 'button', 'aria-label': 'Close' },
      });
      close.addEventListener('click', () => runActions([{ type: 'close-self' }]));
      dialog.children?.forEach((element) => drawElement(panel, element));
    }
  }

  draw();
  return {
    selectScreen(name) {
      const screen = tabbed.find((candidate) => candidate.name === name);
      if (screen) show(screen, null);
    },
    destroy() {
      clearTimeout(toastTimer);
      unmount();
      root.replaceChildren();
    },
  };
}
