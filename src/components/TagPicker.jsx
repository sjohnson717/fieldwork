import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";

// Grouping for assessments: a client, a cohort, a support group, people you
// know. Flat and many-to-many on purpose — the alternative considered was a
// Client → Engagement hierarchy, and it broke immediately on the fact that not
// every group is a company. A cohort of individuals from different employers
// is a real case, and forcing it to be a fake client is how a data model
// starts lying.
//
// Tags are records rather than free text so that "Alert Media" and
// "AlertMedia" can't quietly become two groups — which is exactly what
// company_name, a typed-in string, has always been able to do.
export default function TagPicker({ value = [], onChange, orgId, disabled }) {
  const [allTags, setAllTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => { loadTags(); }, []);

  // Clicking away closes the menu. Without this the list stays open behind
  // whatever you clicked next, which reads as a stuck dropdown.
  useEffect(() => {
    const onDocClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const loadTags = async () => {
    setLoading(true);
    try {
      const tags = await base44.entities.Tag.list("name");
      setAllTags(tags);
    } catch (e) {
      console.error("Failed to load tags", e);
      setError("Couldn't load tags.");
    }
    setLoading(false);
  };

  const selected = value
    .map(id => allTags.find(t => t.id === id))
    // A tag deleted while still referenced leaves a dangling id. Drop it from
    // the display rather than rendering a blank chip; the id stays on the
    // record and is harmless.
    .filter(Boolean);

  const trimmed = query.trim();
  const available = allTags.filter(t =>
    !value.includes(t.id) &&
    (trimmed === "" || t.name.toLowerCase().includes(trimmed.toLowerCase()))
  );
  // Only offer to create when nothing already matches exactly, so the picker
  // never invites a duplicate of a tag that is right there in the list.
  const exactExists = allTags.some(t => t.name.toLowerCase() === trimmed.toLowerCase());
  const canCreate = trimmed !== "" && !exactExists;

  const add = (id) => {
    onChange([...value, id]);
    setQuery("");
    setOpen(false);
  };

  const remove = (id) => onChange(value.filter(v => v !== id));

  const create = async () => {
    if (!canCreate || busy) return;
    setBusy(true);
    setError("");
    try {
      const tag = await base44.entities.Tag.create({
        name: trimmed,
        org_id: orgId || undefined,
      });
      setAllTags(prev => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
      add(tag.id);
    } catch (e) {
      console.error("Failed to create tag", e);
      setError(e?.message || "Couldn't create that tag.");
    }
    setBusy(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {selected.length === 0 && !loading && (
          <span className="text-xs text-gray-400 italic">No tags yet.</span>
        )}
        {selected.map(tag => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200 rounded-full pl-2.5 pr-1.5 py-1"
          >
            {tag.name}
            {!disabled && (
              <button
                onClick={() => remove(tag.id)}
                aria-label={`Remove ${tag.name}`}
                className="text-gray-400 hover:text-red-500 transition-colors leading-none text-sm px-0.5"
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>

      {!disabled && (
        <>
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (available.length > 0) add(available[0].id);
                else if (canCreate) create();
              }
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder={loading ? "Loading tags…" : "Add a tag…"}
            disabled={loading}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />

          {open && (available.length > 0 || canCreate) && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
              {available.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => add(tag.id)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 transition-colors"
                >
                  {tag.name}
                </button>
              ))}
              {canCreate && (
                <button
                  onClick={create}
                  disabled={busy}
                  className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 border-t border-gray-100 disabled:opacity-50 transition-colors"
                >
                  {busy ? "Creating…" : `Create "${trimmed}"`}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
    </div>
  );
}
