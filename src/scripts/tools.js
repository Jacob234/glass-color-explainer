// The tools map (src/data/tools.json): open glass software, models and data placed by the job each
// does and by how it can be used on a web page. Pure helpers shared by /tools/ and its test.

// Problems with the file, as readable strings; empty when it is well formed.
export function validateTools(d) {
  const errors = [];
  const jobs = new Set(d.jobs.map((j) => j.id));
  const routes = new Set(d.routes.map((r) => r.id));
  const status = new Set(Object.keys(d.status));
  const ids = new Set();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.checked ?? '')) errors.push('checked must be a YYYY-MM-DD date');
  for (const t of d.tools) {
    const at = t.id ?? t.name;
    if (!t.id || ids.has(t.id)) errors.push(`${at}: missing or repeated id`);
    ids.add(t.id);
    for (const k of ['name', 'by', 'licence', 'url', 'what', 'here']) if (!t[k]) errors.push(`${at}: missing ${k}`);
    if (!jobs.has(t.job)) errors.push(`${at}: unknown job ${t.job}`);
    if (!routes.has(t.route)) errors.push(`${at}: unknown route ${t.route}`);
    if (!status.has(t.status)) errors.push(`${at}: unknown status ${t.status}`);
    if (t.url && !/^https:\/\//.test(t.url)) errors.push(`${at}: url must be https`);
  }
  for (const g of d.gaps) {
    if (!jobs.has(g.job) || !routes.has(g.route)) errors.push(`gap ${g.title}: unknown job or route`);
  }
  return errors;
}

// Tools in one cell of the map, in file order.
export const inCell = (d, job, route) => d.tools.filter((t) => t.job === job && t.route === route);

// Tools doing one job, ordered by route as the map lists the routes.
export function byJob(d, job) {
  const order = d.routes.map((r) => r.id);
  return d.tools.filter((t) => t.job === job).sort((a, b) => order.indexOf(a.route) - order.indexOf(b.route));
}
