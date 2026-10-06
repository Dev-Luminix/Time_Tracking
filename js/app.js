import * as monday from './monday.js';

const cfg = window.APP_CONFIG;
const PERSON_KEY = 'ewise.person';
const OTHER_NAME_KEY = 'ewise.otherName';
// Pseudo-person for reporters who aren't monday users.
const OTHER = { id: 'other', name: 'אחר (לא משתמש/ת monday)' };
const $ = (id) => document.getElementById(id);

const ICONS = {
  chevron: '<path d="m6 9 6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-17.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24">${ICONS[name]}</svg>`;

// Local date as YYYY-MM-DD (toISOString would give yesterday's date after midnight in Israel).
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function el(tag, attrs = {}, html = '') {
  const node = document.createElement(tag);
  Object.assign(node, attrs);
  if (html) node.innerHTML = html;
  return node;
}

function toast(message, type = '') {
  const t = el('div', { className: `toast ${type}`, textContent: message });
  $('toaster').append(t);
  setTimeout(() => t.remove(), 4000);
}

// ---------------------------------------------------------------------------
// Picker: a button that opens a searchable, optionally paginated dropdown.
// ---------------------------------------------------------------------------
class Picker {
  /**
   * @param {HTMLElement} root
   * @param {{placeholder:string, searchPlaceholder:string, emptyText:string, errorText:string,
   *          fetch:(term:string)=>Promise<{items:any[], cursor?:string|null}>,
   *          fetchMore?:(cursor:string)=>Promise<{items:any[], cursor?:string|null}>,
   *          meta?:(item:any)=>string, extra?:{id:string, name:string},
   *          onChange:(item:any)=>void}} opts
   *   `extra` is an always-visible option pinned below the results (e.g. "Other").
   */
  constructor(root, opts) {
    this.opts = opts;
    this.value = null;
    this.items = [];
    this.cursor = null;
    this.term = '';
    this.loading = true;
    this.refetching = false;
    this.loadingMore = false;
    this.error = '';
    this.reqId = 0;

    this.trigger = el('button', { type: 'button', className: 'picker-trigger' });
    this.popover = el('div', { className: 'popover', hidden: true });
    this.search = el('input', { placeholder: opts.searchPlaceholder });
    this.spinner = el('span', { hidden: true }, icon('loader', 'spin'));
    const searchRow = el('div', { className: 'popover-search' }, icon('search'));
    searchRow.append(this.search, this.spinner);
    this.list = el('div', { className: 'popover-list' });
    this.popover.append(searchRow, this.list);
    root.append(this.trigger, this.popover);

    this.trigger.addEventListener('click', () => this.toggle());
    let debounce;
    this.search.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const term = this.search.value.trim();
        if (term !== this.term) { this.term = term; this.load(); }
      }, 300);
    });
    document.addEventListener('mousedown', (e) => { if (!root.contains(e.target)) this.close(); });
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { this.close(); this.trigger.focus(); } });

    this.renderTrigger();
    this.load();
  }

  toggle() { this.popover.hidden ? this.open() : this.close(); }
  open() { this.popover.hidden = false; this.search.focus(); }
  close() { this.popover.hidden = true; }

  setValue(item) {
    this.value = item;
    this.renderTrigger();
    this.renderList();
    this.opts.onChange(item);
  }

  reload() { this.load(); }

  /** Forget the value, search and results, then load from scratch. */
  reset() {
    this.term = '';
    this.search.value = '';
    this.items = [];
    this.cursor = null;
    this.loading = true;
    this.setValue(null);
    this.load();
  }

  async load() {
    const id = ++this.reqId;
    this.refetching = true;
    this.renderList();
    try {
      const res = await this.opts.fetch(this.term);
      if (id !== this.reqId) return;
      this.items = res.items ?? [];
      this.cursor = res.cursor ?? null;
      this.error = '';
    } catch (e) {
      console.error(e);
      if (id !== this.reqId) return;
      this.error = this.opts.errorText;
    }
    this.loading = false;
    this.refetching = false;
    this.renderList();
  }

  async loadMore() {
    if (!this.cursor || !this.opts.fetchMore) return;
    const id = this.reqId;
    this.loadingMore = true;
    this.renderList();
    try {
      const res = await this.opts.fetchMore(this.cursor);
      if (id !== this.reqId) return;
      this.items = [...this.items, ...(res.items ?? [])];
      this.cursor = res.cursor ?? null;
    } catch (e) {
      console.error(e);
      toast('טעינה נוספת נכשלה', 'error');
    }
    this.loadingMore = false;
    this.renderList();
  }

  renderTrigger() {
    this.trigger.innerHTML = '';
    const label = el('span', {
      className: `truncate${this.value ? '' : ' placeholder'}`,
      textContent: this.value?.name ?? this.opts.placeholder,
    });
    this.trigger.append(label);
    this.trigger.insertAdjacentHTML('beforeend', icon('chevron'));
  }

  renderList() {
    const busy = this.refetching && !this.loading;
    this.spinner.hidden = !busy;
    this.list.classList.toggle('dim', busy);
    this.list.innerHTML = '';

    if (this.loading) {
      for (let i = 0; i < 5; i++) this.list.append(el('div', { className: 'skeleton' }));
      return;
    }
    if (this.error) {
      this.list.append(el('p', { className: 'popover-msg error', textContent: this.error }));
      return;
    }
    if (this.items.length === 0) {
      this.list.append(el('p', { className: 'popover-msg', textContent: this.opts.emptyText }));
    }
    for (const item of this.items) this.list.append(this.optionButton(item));
    if (this.cursor && this.opts.fetchMore) {
      const more = el('button', { type: 'button', className: 'load-more', disabled: this.loadingMore },
        `${this.loadingMore ? icon('loader', 'spin') : ''} טען עוד`);
      more.addEventListener('click', () => this.loadMore());
      this.list.append(more);
    }
    if (this.opts.extra) this.list.append(this.optionButton(this.opts.extra, 'option-extra'));
  }

  optionButton(item, cls = '') {
    const btn = el('button', { type: 'button', className: `option ${cls}` });
    btn.append(el('span', { className: 'min-w-0 truncate', textContent: item.name }));
    const meta = el('span', { className: 'option-meta', textContent: this.opts.meta?.(item) ?? '' });
    if (this.value?.id === item.id) meta.insertAdjacentHTML('beforeend', icon('check'));
    btn.append(meta);
    btn.addEventListener('click', () => { this.setValue({ id: item.id, name: item.name }); this.close(); this.trigger.focus(); });
    return btn;
  }
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------
// products: the chosen project's products, or null while not (yet) loaded.
const state = { project: null, product: null, products: null, person: null, saving: false };

const form = $('form');
const dateInput = $('date');
const hoursInput = $('hours');
const taskInput = $('task');
const notesInput = $('notes');
const otherInput = $('person-other');
const submitBtn = $('submit');
const submitSpinner = submitBtn.querySelector('svg');

const isOther = () => state.person?.id === OTHER.id;

function isValid() {
  const h = parseFloat(hoursInput.value);
  // A product is required whenever the project has any.
  const productOk = state.products && (state.products.length === 0 || state.product);
  return Boolean(state.project && productOk && dateInput.value && dateInput.value <= today() && h > 0 && h <= 24 && taskInput.value.trim()
    && (!isOther() || otherInput.value.trim()));
}

function updateSubmit() {
  submitBtn.disabled = !isValid() || state.saving;
  submitSpinner.hidden = !state.saving;
}

function loadSavedPerson() {
  try { return JSON.parse(localStorage.getItem(PERSON_KEY)); } catch { return null; }
}

function initForm() {
  form.hidden = false;
  dateInput.value = today();
  dateInput.max = today();
  [dateInput, hoursInput, taskInput].forEach((i) => i.addEventListener('input', updateSubmit));

  try { otherInput.value = localStorage.getItem(OTHER_NAME_KEY) || ''; } catch { /* ignore */ }
  otherInput.addEventListener('input', () => {
    try { localStorage.setItem(OTHER_NAME_KEY, otherInput.value.trim()); } catch { /* ignore */ }
    updateSubmit();
  });

  // Products of the selected project, fetched once per project and filtered locally.
  let productsPromise;
  const productPicker = new Picker($('product-picker'), {
    placeholder: 'בחרו מוצר',
    searchPlaceholder: 'חיפוש מוצר…',
    emptyText: 'לא נמצאו מוצרים לפרויקט זה',
    errorText: 'לא ניתן לטעון מוצרים',
    fetch: async (term) => {
      if (!state.project) return { items: [] };
      const project = state.project;
      productsPromise ??= monday.getProjectProducts(project.id).catch((e) => { productsPromise = undefined; throw e; });
      const products = await productsPromise;
      if (state.project === project) { state.products = products; updateSubmit(); }
      const t = term.toLowerCase();
      return { items: t ? products.filter((p) => p.name.toLowerCase().includes(t)) : products };
    },
    onChange: (p) => { state.product = p; updateSubmit(); },
  });

  new Picker($('project-picker'), {
    placeholder: 'בחרו פרויקט',
    searchPlaceholder: 'חיפוש פרויקט…',
    emptyText: 'לא נמצאו פרויקטים',
    errorText: 'לא ניתן לטעון פרויקטים',
    fetch: (term) => monday.searchProjects(term),
    fetchMore: (cursor) => monday.nextProjects(cursor),
    meta: (p) => p.status,
    onChange: (p) => {
      if (state.project?.id === p?.id) return;
      state.project = p;
      state.products = null;
      productsPromise = undefined;
      productPicker.reset();
      $('product-field').hidden = !p;
      updateSubmit();
    },
  });

  // People list is fetched once and filtered locally.
  let usersPromise;
  const getUsers = () => (usersPromise ??= monday.listUsers().catch((e) => { usersPromise = undefined; throw e; }));
  const personPicker = new Picker($('person-picker'), {
    placeholder: 'בחרו את שמכם',
    searchPlaceholder: 'חיפוש לפי שם…',
    emptyText: 'לא נמצאו משתמשים',
    errorText: 'לא ניתן לטעון משתמשים',
    fetch: async (term) => {
      const users = await getUsers();
      const t = term.toLowerCase();
      return { items: t ? users.filter((u) => u.name.toLowerCase().includes(t)) : users };
    },
    extra: OTHER,
    onChange: (p) => {
      state.person = p;
      try { localStorage.setItem(PERSON_KEY, JSON.stringify(p)); } catch { /* ignore */ }
      otherInput.hidden = !isOther();
      if (isOther() && !otherInput.value) otherInput.focus();
      updateSubmit();
    },
  });

  // Default person: last choice in this browser; otherwise the token owner,
  // but only when the token is the user's own (not a shared, embedded one).
  const saved = loadSavedPerson();
  if (saved) personPicker.setValue(saved);
  else if (!cfg.MONDAY_TOKEN) monday.getMe().then((me) => me && personPicker.setValue({ id: me.id, name: me.name })).catch(console.error);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isValid() || state.saving) return;
    const hours = parseFloat(hoursInput.value);
    const date = dateInput.value;
    state.saving = true;
    updateSubmit();
    try {
      const name = state.product ? `${state.project.name} - ${state.product.name}` : state.project.name;
      await monday.createTimeEntry({
        name,
        task: taskInput.value.trim(),
        date,
        hours,
        notes: notesInput.value.trim() || null,
        projectId: state.project.id,
        productId: state.product?.id,
        personId: isOther() ? undefined : state.person?.id,
        personName: isOther() ? otherInput.value.trim() : state.person?.name,
        status: cfg.STATUS_LABEL,
      });
      const [y, m, d] = date.split('-').map(Number);
      showThanks([
        ['מדווח/ת', isOther() ? otherInput.value.trim() : state.person?.name],
        ['פרויקט', state.project.name],
        ['מוצר', state.product?.name],
        ['תאריך', new Date(y, m - 1, d).toLocaleDateString('he-IL')],
        ['שעות', String(hours)],
        ['משימה', taskInput.value.trim()],
      ]);
    } catch (err) {
      console.error(err);
      if (err instanceof monday.AuthError && !cfg.MONDAY_TOKEN) { monday.clearToken(); location.reload(); return; }
      toast('השמירה נכשלה, נסו שוב', 'error');
    } finally {
      state.saving = false;
      updateSubmit();
    }
  });

  // Thank-you page. "New report" clears the per-entry fields but keeps who / project / product / date;
  // "Same details" brings the form back as it was so it can be tweaked and sent again.
  const thanks = $('thanks');
  function showThanks(rows) {
    const summary = $('thanks-summary');
    summary.innerHTML = '';
    for (const [label, value] of rows) {
      if (!value) continue;
      const row = el('div');
      row.append(el('dt', { textContent: label }), el('dd', { textContent: value }));
      summary.append(row);
    }
    form.hidden = true;
    thanks.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    thanks.focus({ preventScroll: true });
  }
  function backToForm(clear) {
    if (clear) {
      taskInput.value = '';
      hoursInput.value = '';
      notesInput.value = '';
    }
    thanks.hidden = true;
    form.hidden = false;
    updateSubmit();
    (clear ? hoursInput : taskInput).focus();
  }
  $('again-new').addEventListener('click', () => backToForm(true));
  $('again-same').addEventListener('click', () => backToForm(false));
}

// ---------------------------------------------------------------------------
// Light / dark toggle (index.html applies the saved choice before first paint)
// ---------------------------------------------------------------------------
const THEME_KEY = 'ewise.theme';
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const isDark = () => (document.documentElement.dataset.theme ?? (darkQuery.matches ? 'dark' : 'light')) === 'dark';

function renderThemeToggle() {
  const btn = $('theme-toggle');
  const dark = isDark();
  btn.innerHTML = icon(dark ? 'sun' : 'moon');
  btn.title = dark ? 'מצב בהיר' : 'מצב כהה';
  btn.setAttribute('aria-label', btn.title);
}

$('theme-toggle').addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  renderThemeToggle();
});
darkQuery.addEventListener('change', renderThemeToggle);
renderThemeToggle();

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function initSetup() {
  const setup = $('setup');
  setup.hidden = false;
  setup.addEventListener('submit', (e) => {
    e.preventDefault();
    const token = $('token-input').value.trim();
    if (!token) return;
    monday.setToken(token);
    setup.hidden = true;
    initForm();
  });
}

if (!cfg.TIME_TRACKING_BOARD_ID || !cfg.PROJECTS_BOARD_ID) {
  toast('חסרים מזהי לוחות בקובץ js/config.js', 'error');
} else if (monday.getToken()) {
  initForm();
} else {
  initSetup();
}
