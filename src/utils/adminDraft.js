const key = (id) => `coffee-map:admin-cafe-draft:${id}`;
export const readAdminDraft = (id) => {
  try { return JSON.parse(sessionStorage.getItem(key(id)) || 'null'); } catch { return null; }
};
export const writeAdminDraft = (id, value) => {
  try { if (value) sessionStorage.setItem(key(id), JSON.stringify(value)); else sessionStorage.removeItem(key(id)); } catch { /* Saving to the server still works without session storage. */ }
};
