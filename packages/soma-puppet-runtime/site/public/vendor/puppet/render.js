const tokenPattern = /\{([^}]+)\}/g;

export function interpolate(template, { data = {}, me = {}, form = {} } = {}) {
  return String(template ?? '').replace(tokenPattern, (token, name) => {
    if (name === 'me.name') return String(me.name ?? '');
    if (name.startsWith('form.')) return String(form[name.slice(5)] ?? '');
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

function rowText(row) {
  return Object.entries(row)
    .filter(([key]) => key !== 'id')
    .map(([, value]) => value)
    .join(' · ');
}

/**
 * Render a parsed Puppet sketch into a DOM root.
 *
 * @param {object} sketch parsed Puppet Script
 * @param {object} options
 * @param {HTMLElement} options.root
 * @param {Record<string, object[]>} [options.data]
 * @param {{id?: string, name?: string}} [options.me]
 * @param {(action: object) => unknown | Promise<unknown>} [options.onAction]
 */
export function render(sketch, { root, data = {}, me = {}, onAction = () => {} }) {
  if (!root?.ownerDocument) throw new TypeError('render requires a DOM root');

  const screens = sketch?.screens ?? [];
  let current =
    screens.find(({ name }) => name === root.dataset.puppetScreen) ?? screens[0] ?? null;
  let toastTimer;

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

  const runActions = async (actions, row) => {
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
      } else if (action.type === 'open' && action.targetType === 'screen') {
        const target = screens.find(({ name }) => name === action.name);
        if (target) {
          current = target;
          root.dataset.puppetScreen = current.name;
          draw();
        }
      } else if (action.type === 'toast') {
        showToast(action.message);
      }
    }
  };

  const wireActions = (node, actions, row) => {
    if (!actions?.length) return;
    node.addEventListener('click', async () => {
      try {
        await runActions(actions, row);
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Action failed');
      }
    });
  };

  const drawRows = (parent, element) => {
    const rows = collectionRows(sketch, data, element.from);
    const removeAction = element.hook?.find(({ type }) => type === 'remove');
    if (!rows.length) {
      append(parent, 'p', {
        className: 'puppet-runtime-empty',
        text: element.props?.empty ?? 'Nothing here yet.',
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
      if (removeAction) append(head, 'th', { text: 'Actions' });
      const body = append(table, 'tbody');
      for (const row of rows) {
        const tr = append(body, 'tr');
        fields.forEach((field) => append(tr, 'td', { text: row[field] ?? '' }));
        if (removeAction) {
          const cell = append(tr, 'td');
          const button = append(cell, 'button', {
            className: 'puppet-runtime-button puppet-runtime-danger',
            text: 'Remove',
            attrs: { type: 'button' },
          });
          wireActions(button, [removeAction], row);
        } else {
          wireActions(tr, element.hook, row);
        }
      }
      return;
    }

    const list = append(parent, 'div', { className: 'puppet-runtime-list-rows' });
    for (const row of rows) {
      const item = append(list, 'div', { className: 'puppet-runtime-list-row' });
      append(item, 'span', { text: rowText(row) });
      if (removeAction) {
        const button = append(item, 'button', {
          className: 'puppet-runtime-button puppet-runtime-danger',
          text: 'Remove',
          attrs: { type: 'button' },
        });
        wireActions(button, [removeAction], row);
      } else {
        wireActions(item, element.hook, row);
      }
    }
  };

  const drawElement = (parent, element) => {
    const text = (value) => interpolate(value, { data, me, form: values() });
    const roles = element.roles ?? [];

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
      const tag = roles.includes('@multiline') ? 'textarea' : 'input';
      const input = append(label, tag, {
        attrs: {
          'data-puppet-field': element.label ?? '',
          ...(roles.includes('@required') ? { required: '' } : {}),
        },
      });
      if (tag === 'input') input.type = 'text';
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
      wireActions(button, element.hook);
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
        className: `puppet-runtime-${element.kind}`,
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

  function draw() {
    clearTimeout(toastTimer);
    root.replaceChildren();
    if (!current) {
      append(root, 'p', { className: 'puppet-runtime-empty', text: 'No screens declared.' });
      return;
    }

    const shell = append(root, 'div', { className: 'puppet-runtime-shell' });
    const nav = append(shell, 'nav', {
      className: 'puppet-runtime-tabs',
      attrs: { 'aria-label': 'App screens' },
    });
    for (const screen of screens) {
      const tab = append(nav, 'button', {
        className: screen === current ? 'active' : '',
        text: screen.name,
        attrs: { type: 'button', 'aria-current': screen === current ? 'page' : 'false' },
      });
      tab.addEventListener('click', () => {
        current = screen;
        root.dataset.puppetScreen = current.name;
        draw();
      });
    }
    const content = append(shell, 'main', { className: 'puppet-runtime-screen' });
    current.children?.forEach((element) => drawElement(content, element));
  }

  draw();
  return {
    selectScreen(name) {
      const screen = screens.find((candidate) => candidate.name === name);
      if (screen) {
        current = screen;
        root.dataset.puppetScreen = current.name;
        draw();
      }
    },
    destroy() {
      clearTimeout(toastTimer);
      root.replaceChildren();
    },
  };
}
