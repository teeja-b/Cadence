import { Router } from "express";
import { HttpError, bad } from "./http.js";

const CATEGORIES = ["study", "work", "personal", "fitness", "travel", "project", "assignment", "meeting", "goal", "notes"];
const STATUSES = ["not_started", "in_progress", "completed", "on_hold", "cancelled"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const SORTABLE = ["created_date", "updated_date", "sort_order", "title", "start_date"];

const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);
const oneOf = (name, list) => (v) => (list.includes(v) ? v : bad(`${name} must be one of: ${list.join(", ")}`));
const optional = (fn) => (v) => (v === null || v === undefined || v === "" ? null : fn(v));

// Validators for every editable column. The keys are also the column-name whitelist used to build SQL.
const FIELDS = {
  title: (v) => {
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) bad("Title is required");
    if (s.length > 500) bad("Title is too long");
    return s;
  },
  description: (v) => {
    if (v === null || v === undefined) return "";
    if (typeof v !== "string") bad("Notes must be text");
    if (v.length > 50_000) bad("Notes are too long");
    return v;
  },
  category: oneOf("category", CATEGORIES),
  status: oneOf("status", STATUSES),
  progress: (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) bad("Progress must be a number");
    return Math.min(100, Math.max(0, n));
  },
  start_date: optional((v) => {
    let ok = false;
    try {
      ok = DATE_RE.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
    } catch { /* invalid date */ }
    return ok ? v : bad("Date must be a real date in YYYY-MM-DD format");
  }),
  start_time: optional((v) => (TIME_RE.test(v) ? v : bad("Time must be HH:MM"))),
  end_time: optional((v) => (TIME_RE.test(v) ? v : bad("Time must be HH:MM"))),
  sort_order: (v) => (Number.isFinite(Number(v)) ? Number(v) : bad("Sort order must be a number")),
};

// Validate whichever editable fields are present in `body`.
function parseFields(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) bad("Expected a JSON object");
  const out = {};
  for (const [col, validate] of Object.entries(FIELDS)) {
    if (body[col] !== undefined) out[col] = validate(body[col]);
  }
  return out;
}

const toTask = (row, email) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  category: row.category,
  status: row.status,
  progress: row.progress,
  start_date: row.start_date,
  start_time: row.start_time,
  end_time: row.end_time,
  parent_id: row.parent_id,
  sort_order: row.sort_order,
  created_date: row.created_date,
  updated_date: row.updated_date,
  created_by: email,
});

async function updateTask(db, userId, id, fields) {
  if (!isUuid(id)) throw new HttpError(404, "Task not found");
  const cols = Object.keys(fields);
  const sets = cols.map((c, i) => `${c} = $${i + 3}`);
  sets.push("updated_date = now()");
  const { rows } = await db.query(
    `UPDATE tasks SET ${sets.join(", ")} WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId, ...cols.map((c) => fields[c])]
  );
  if (!rows[0]) throw new HttpError(404, "Task not found");
  return rows[0];
}

export function createTasks({ pool, requireAuth }) {
  const router = Router();
  router.use(requireAuth);

  // GET /api/tasks?sort=-created_date&limit=500  -> every task (and subtask) the user owns, flat.
  // The frontend builds the tree from parent_id, so Timeline / Calendar / Details all share one list.
  router.get("/", async (req, res) => {
    const m = /^(-?)([a-z_]+)$/.exec(String(req.query.sort || "-created_date"));
    if (!m || !SORTABLE.includes(m[2])) bad(`sort must be one of: ${SORTABLE.join(", ")} (prefix with - for descending)`);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 5000);
    const { rows } = await pool.query(
      `SELECT * FROM tasks WHERE user_id = $1 ORDER BY ${m[2]} ${m[1] ? "DESC" : "ASC"}, id LIMIT $2`,
      [req.user.id, limit]
    );
    res.json(rows.map((r) => toTask(r, req.user.email)));
  });

  router.post("/", async (req, res) => {
    const fields = parseFields(req.body);
    if (fields.title === undefined) bad("Title is required");

    const parentId = req.body.parent_id ?? null;
    if (parentId !== null) {
      if (!isUuid(parentId)) bad("parent_id must be a task id");
      const parent = await pool.query("SELECT 1 FROM tasks WHERE id = $1 AND user_id = $2", [parentId, req.user.id]);
      if (!parent.rowCount) bad("Parent task not found");
    }
    if (fields.sort_order === undefined) {
      // Append after existing siblings so new subtasks show up at the end of their list.
      const { rows } = await pool.query(
        "SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM tasks WHERE user_id = $1 AND parent_id IS NOT DISTINCT FROM $2::uuid",
        [req.user.id, parentId]
      );
      fields.sort_order = rows[0].next;
    }

    const cols = ["user_id", "parent_id", ...Object.keys(fields)];
    const vals = [req.user.id, parentId, ...Object.values(fields)];
    const { rows } = await pool.query(
      `INSERT INTO tasks (${cols.join(", ")}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`,
      vals
    );
    res.status(201).json(toTask(rows[0], req.user.email));
  });

  // PUT /api/tasks/bulk  [{ id, sort_order }, ...]  (used when reordering subtasks). All-or-nothing.
  router.put("/bulk", async (req, res) => {
    const items = req.body;
    if (!Array.isArray(items) || items.length > 1000) bad("Expected an array of up to 1000 updates");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const out = [];
      for (const item of items) {
        if (!item || typeof item !== "object") bad("Each update must be an object with an id");
        out.push(toTask(await updateTask(client, req.user.id, item.id, parseFields(item)), req.user.email));
      }
      await client.query("COMMIT");
      res.json(out);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });

  // POST /api/tasks/delete-many { ids: [...] }. Deleting a task also deletes all of its
  // descendants (ON DELETE CASCADE), however deeply nested.
  router.post("/delete-many", async (req, res) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length > 5000 || !ids.every(isUuid)) bad("ids must be a list of task ids");
    const { rowCount } = await pool.query("DELETE FROM tasks WHERE user_id = $1 AND id = ANY($2::uuid[])", [req.user.id, ids]);
    res.json({ success: true, deleted: rowCount });
  });

  router.get("/:id", async (req, res) => {
    const { rows } = isUuid(req.params.id)
      ? await pool.query("SELECT * FROM tasks WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id])
      : { rows: [] };
    if (!rows[0]) throw new HttpError(404, "Task not found");
    res.json(toTask(rows[0], req.user.email));
  });

  // Partial update: only the fields you send change. (parent_id can't be changed here.)
  router.put("/:id", async (req, res) => {
    const fields = parseFields(req.body);
    if (!Object.keys(fields).length) {
      const { rows } = isUuid(req.params.id)
        ? await pool.query("SELECT * FROM tasks WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id])
        : { rows: [] };
      if (!rows[0]) throw new HttpError(404, "Task not found");
      return res.json(toTask(rows[0], req.user.email));
    }
    res.json(toTask(await updateTask(pool, req.user.id, req.params.id, fields), req.user.email));
  });

  router.delete("/:id", async (req, res) => {
    const { rowCount } = isUuid(req.params.id)
      ? await pool.query("DELETE FROM tasks WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id])
      : { rowCount: 0 };
    if (!rowCount) throw new HttpError(404, "Task not found");
    res.json({ success: true });
  });

  return router;
}
