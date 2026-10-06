// Minimal monday.com GraphQL client (replaces the Vibe BoardSDK).
const API_URL = 'https://api.monday.com/v2';
const TOKEN_KEY = 'ewise.mondayToken';
const cfg = window.APP_CONFIG;

export function getToken() {
  if (cfg.MONDAY_TOKEN) return cfg.MONDAY_TOKEN;
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

export function setToken(token) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
}

export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

export class AuthError extends Error {}

async function gql(query, variables = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: getToken() },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 401 || res.status === 403) throw new AuthError('Unauthorized');
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors || json.error_message) {
    const msg = json.errors?.map((e) => e.message).join('; ') || json.error_message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json.data;
}

// ---------- Column discovery ----------

const columnCache = new Map();

async function getColumns(boardId) {
  if (!columnCache.has(boardId)) {
    const p = gql(
      `query ($ids: [ID!]) { boards(ids: $ids) { id columns { id title type } } }`,
      { ids: [boardId] },
    ).then((d) => {
      const board = d.boards?.[0];
      if (!board) throw new Error(`Board ${boardId} not found`);
      return board.columns;
    });
    columnCache.set(boardId, p);
    p.catch(() => columnCache.delete(boardId));
  }
  return columnCache.get(boardId);
}

// Pick a column of one of the given types, preferring one whose title matches `hint`.
function pick(columns, types, hint) {
  const ofType = columns.filter((c) => types.includes(c.type));
  return ofType.find((c) => hint.test(c.title)) || ofType[0] || null;
}

let timeColumnsPromise;
function getTimeColumns() {
  timeColumnsPromise ??= getColumns(cfg.TIME_TRACKING_BOARD_ID).then((cols) => {
    const byId = (id) => cols.find((c) => c.id === id) || null;
    const o = cfg.COLUMNS || {};
    return {
      date: o.date ? byId(o.date) : pick(cols, ['date'], /date|תאריך/i),
      hours: o.hours ? byId(o.hours) : pick(cols, ['numbers'], /hour|שעות|time|זמן/i),
      notes: o.notes ? byId(o.notes) : pick(cols, ['long_text', 'text'], /note|הערה|הערות/i),
      projects: o.projects ? byId(o.projects) : pick(cols, ['board_relation'], /project|פרויקט/i),
      person: o.person ? byId(o.person) : pick(cols, ['people'], /person|owner|אחראי|עובד|people/i),
      status: o.status ? byId(o.status) : pick(cols, ['status'], /status|סטטוס/i),
      // No type-only fallback for these: it could pick the notes / projects column.
      reporter: o.reporter ? byId(o.reporter)
        : cols.find((c) => c.type === 'text' && /reporter|reported by|מדווח/i.test(c.title)) || null,
      task: o.task ? byId(o.task)
        : cols.find((c) => c.type === 'text' && /task|משימה/i.test(c.title)) || null,
      product: o.product ? byId(o.product)
        : cols.find((c) => c.type === 'board_relation' && /product|מוצר/i.test(c.title)) || null,
    };
  });
  timeColumnsPromise.catch(() => { timeColumnsPromise = undefined; });
  return timeColumnsPromise;
}

let projectStatusIdPromise;
function getProjectStatusColumnId() {
  if (cfg.PROJECTS_STATUS_COLUMN) return Promise.resolve(cfg.PROJECTS_STATUS_COLUMN);
  projectStatusIdPromise ??= getColumns(cfg.PROJECTS_BOARD_ID)
    .then((cols) => pick(cols, ['status'], /status|סטטוס/i)?.id || null);
  projectStatusIdPromise.catch(() => { projectStatusIdPromise = undefined; });
  return projectStatusIdPromise;
}

// ---------- Projects ----------

const ITEM_FIELDS = `id name column_values(ids: $statusIds) { id text }`;

function mapItems(page, statusId) {
  return {
    items: (page?.items ?? []).map((it) => ({
      id: it.id,
      name: it.name,
      status: it.column_values?.find((c) => c.id === statusId)?.text || '',
    })),
    cursor: page?.cursor ?? null,
  };
}

/** First page of projects, optionally filtered by name, sorted by name. */
export async function searchProjects(term, limit = cfg.PAGE_SIZE) {
  const statusId = await getProjectStatusColumnId();
  const queryParams = { order_by: [{ column_id: 'name', direction: 'asc' }] };
  if (term) {
    queryParams.rules = [{ column_id: 'name', compare_value: [term], operator: 'contains_text' }];
  }
  const d = await gql(
    `query ($ids: [ID!], $limit: Int!, $qp: ItemsQuery, $statusIds: [String!]) {
      boards(ids: $ids) { items_page(limit: $limit, query_params: $qp) { cursor items { ${ITEM_FIELDS} } } }
    }`,
    { ids: [cfg.PROJECTS_BOARD_ID], limit, qp: queryParams, statusIds: statusId ? [statusId] : [] },
  );
  return mapItems(d.boards?.[0]?.items_page, statusId);
}

/** Next page of projects for a cursor returned by searchProjects / nextProjects. */
export async function nextProjects(cursor, limit = cfg.PAGE_SIZE) {
  const statusId = await getProjectStatusColumnId();
  const d = await gql(
    `query ($cursor: String!, $limit: Int!, $statusIds: [String!]) {
      next_items_page(cursor: $cursor, limit: $limit) { cursor items { ${ITEM_FIELDS} } }
    }`,
    { cursor, limit, statusIds: statusId ? [statusId] : [] },
  );
  return mapItems(d.next_items_page, statusId);
}

/** Products linked to a project (via cfg.PROJECTS_PRODUCTS_COLUMN), sorted by name. */
export async function getProjectProducts(projectId) {
  const d = await gql(
    `query ($ids: [ID!], $cols: [String!]) {
      items(ids: $ids) { column_values(ids: $cols) { ... on BoardRelationValue { linked_items { id name } } } }
    }`,
    { ids: [projectId], cols: [cfg.PROJECTS_PRODUCTS_COLUMN] },
  );
  return (d.items?.[0]?.column_values?.[0]?.linked_items ?? [])
    .map((it) => ({ id: it.id, name: it.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

// ---------- Users ----------

export async function getMe() {
  const d = await gql(`query { me { id name } }`);
  return d.me;
}

export async function listUsers() {
  const d = await gql(`query { users(kind: non_guests, limit: 1000) { id name enabled } }`);
  return (d.users ?? [])
    .filter((u) => u.enabled !== false)
    .map((u) => ({ id: u.id, name: u.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

// ---------- Time entries ----------

/**
 * Create a time-tracking item.
 * @param {{name:string, date:string (YYYY-MM-DD), hours:number, notes:string|null,
 *          projectId:string, productId?:string, task?:string, personId?:string|number,
 *          personName?:string, status?:string}} entry
 */
export async function createTimeEntry(entry) {
  const c = await getTimeColumns();
  const values = {};

  // Values without a column of their own are kept in the notes so they aren't lost.
  // (A non-monday reporter can't go in the People column.)
  const extraNotes = [];
  if (c.reporter && entry.personName) values[c.reporter.id] = entry.personName;
  else if (!entry.personId && entry.personName) extraNotes.push(`מדווח: ${entry.personName}`);
  if (c.task && entry.task) values[c.task.id] = entry.task;
  else if (entry.task) extraNotes.push(`משימה: ${entry.task}`);
  const notes = [...extraNotes, entry.notes].filter(Boolean).join('\n');

  if (c.product && entry.productId) values[c.product.id] = { item_ids: [Number(entry.productId)] };

  if (c.date) values[c.date.id] = { date: entry.date };
  if (c.hours) values[c.hours.id] = String(entry.hours);
  if (c.notes && notes) {
    values[c.notes.id] = c.notes.type === 'long_text' ? { text: notes } : notes;
  }
  if (c.projects) values[c.projects.id] = { item_ids: [Number(entry.projectId)] };
  if (c.person && entry.personId) {
    values[c.person.id] = { personsAndTeams: [{ id: Number(entry.personId), kind: 'person' }] };
  }
  if (c.status && entry.status) values[c.status.id] = { label: entry.status };

  const d = await gql(
    `mutation ($board: ID!, $name: String!, $values: JSON!) {
      create_item(board_id: $board, item_name: $name, column_values: $values) { id }
    }`,
    { board: cfg.TIME_TRACKING_BOARD_ID, name: entry.name, values: JSON.stringify(values) },
  );
  return d.create_item;
}
