import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

export default function App() {
  const [petTypes, setPetTypes] = useState([]);
  const [breeds, setBreeds] = useState([]);
  const [selectedBreed, setSelectedBreed] = useState(null);

  const [petTypeId, setPetTypeId] = useState("");
  const [breedId, setBreedId] = useState("");

  const [categories, setCategories] = useState([]);
  const [guidesByCategoryId, setGuidesByCategoryId] = useState({});

  const [openCategoryIds, setOpenCategoryIds] = useState(new Set());

  // Upgrades
  const [breedSearch, setBreedSearch] = useState("");
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem("zoo_darkMode") === "1";
    } catch {
      return false;
    }
  });
  const [favorites, setFavorites] = useState(() => {
    try {
      const raw = localStorage.getItem("zoo_favorites");
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    loadPetTypes();
    loadCategories();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("zoo_darkMode", darkMode ? "1" : "0");
    } catch {}
  }, [darkMode]);

  useEffect(() => {
    try {
      localStorage.setItem("zoo_favorites", JSON.stringify(Array.from(favorites)));
    } catch {}
  }, [favorites]);

  useEffect(() => {
    if (!petTypeId) {
      setBreeds([]);
      setBreedId("");
      setSelectedBreed(null);
      setGuidesByCategoryId({});
      setBreedSearch("");
      return;
    }
    loadBreeds(petTypeId);
  }, [petTypeId]);

  useEffect(() => {
    if (!breedId) {
      setSelectedBreed(null);
      setGuidesByCategoryId({});
      return;
    }
    loadBreedDetails(breedId);
    loadGuidesForBreed(breedId);
  }, [breedId]);

  async function loadPetTypes() {
    const { data, error } = await supabase
      .from("pet_types")
      .select("id,name")
      .order("name");
    if (error) console.error(error);
    setPetTypes(data ?? []);
  }

  async function loadBreeds(typeId) {
    const { data, error } = await supabase
      .from("breeds")
      .select("id,name")
      .eq("pet_type_id", typeId)
      .order("name");
    if (error) console.error(error);
    setBreeds(data ?? []);
  }

  async function loadBreedDetails(id) {
    const { data, error } = await supabase.from("breeds").select("*").eq("id", id).single();
    if (error) console.error(error);
    setSelectedBreed(data ?? null);
  }

  async function loadCategories() {
    const { data, error } = await supabase
      .from("care_categories")
      .select("id,name,icon,sort_order")
      .order("sort_order", { ascending: true });
    if (error) console.error(error);
    setCategories(data ?? []);
  }

  async function loadGuidesForBreed(breedId) {
    const { data, error } = await supabase
      .from("care_guides")
      .select("category_id,content")
      .eq("breed_id", breedId);

    if (error) console.error(error);

    const map = {};
    for (const row of data ?? []) {
      map[row.category_id] = row.content;
    }
    setGuidesByCategoryId(map);
  }

  const cardTone = useMemo(() => {
    const tones = {
      "Height & Weight": { bg: "#FFF4E7", border: "#FFDBA1" },
      Lifespan: { bg: "#EAF3FF", border: "#B6D6FF" },
      Size: { bg: "#F3F3F3", border: "#D6D6D6" },
      "Care Instructions": { bg: "#E9FFF0", border: "#B8F0C6" },
      "Dietary Needs": { bg: "#FFF4E7", border: "#FFD0A1" },
      "Exercise Needs": { bg: "#F3EFFF", border: "#D6C7FF" },
      "Grooming Needs": { bg: "#FFEAF3", border: "#FFBFD9" },
      "Health Concerns": { bg: "#FFECEC", border: "#FFB7B7" },
    };
    return (name) => tones[name] ?? { bg: "#F5F5F5", border: "#DDDDDD" };
  }, []);

  const theme = useMemo(() => {
    if (!darkMode) {
      return {
        pageBg: "#ffffff",
        text: "#121212",
        subtext: "#444",
        panelBg: "#ffffff",
        panelBorder: "#E9E9E9",
        headerBg: "#1e1e1e",
        headerText: "#ffffff",
        inputBg: "#ffffff",
        inputBorder: "#D7D7D7",
        shadow: "0 20px 40px rgba(0,0,0,.10)",
      };
    }
    return {
      pageBg: "#0f0f12",
      text: "#F5F5F7",
      subtext: "#B9BBC3",
      panelBg: "#14141a",
      panelBorder: "#2a2a33",
      headerBg: "#14141a",
      headerText: "#ffffff",
      inputBg: "#121218",
      inputBorder: "#2a2a33",
      shadow: "0 20px 40px rgba(0,0,0,.45)",
    };
  }, [darkMode]);

  const filteredBreeds = useMemo(() => {
    const q = breedSearch.trim().toLowerCase();
    if (!q) return breeds;
    return breeds.filter((b) => (b.name ?? "").toLowerCase().includes(q));
  }, [breeds, breedSearch]);

  const favoriteBreedIds = useMemo(() => favorites, [favorites]);

  const sortedBreedsForDropdown = useMemo(() => {
    // favorites first, then alphabetic (but keep current filter)
    const arr = [...filteredBreeds];
    arr.sort((a, b) => {
      const af = favoriteBreedIds.has(a.id) ? 0 : 1;
      const bf = favoriteBreedIds.has(b.id) ? 0 : 1;
      if (af !== bf) return af - bf;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
    return arr;
  }, [filteredBreeds, favoriteBreedIds]);

  function toggleFavorite(id) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCategory(id) {
    setOpenCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openAllCategories() {
    setOpenCategoryIds(new Set(categories.map((c) => c.id)));
  }

  function closeAllCategories() {
    setOpenCategoryIds(new Set());
  }

  const isFavorite = selectedBreed ? favorites.has(selectedBreed.id) : false;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.pageBg,
        color: theme.text,
        padding: 40,
        fontFamily: "system-ui, Segoe UI, Arial",
        transition: "background .2s ease, color .2s ease",
      }}
    >
      <div style={{ maxWidth: 760 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h1 style={{ marginTop: 0, marginBottom: 10 }}>Zoo Database 🐾</h1>

          <button
            onClick={() => setDarkMode((d) => !d)}
            style={{
              border: `1px solid ${theme.panelBorder}`,
              background: theme.panelBg,
              color: theme.text,
              padding: "10px 12px",
              borderRadius: 12,
              cursor: "pointer",
              boxShadow: theme.shadow,
            }}
            title="Toggle dark mode"
          >
            {darkMode ? "🌙 Dark" : "☀️ Light"}
          </button>
        </div>

        {/* Dropdowns */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
          }}
        >
          <div
            style={{
              background: theme.panelBg,
              border: `1px solid ${theme.panelBorder}`,
              borderRadius: 16,
              padding: 14,
              boxShadow: theme.shadow,
            }}
          >
            <label style={{ fontWeight: 800, display: "block", marginBottom: 8 }}>
              Pet Type
            </label>
            <select
              value={petTypeId}
              onChange={(e) => setPetTypeId(e.target.value)}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 12,
                background: theme.inputBg,
                color: theme.text,
                border: `1px solid ${theme.inputBorder}`,
                outline: "none",
              }}
            >
              <option value="">Choose a pet type</option>
              {petTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.name}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              background: theme.panelBg,
              border: `1px solid ${theme.panelBorder}`,
              borderRadius: 16,
              padding: 14,
              boxShadow: theme.shadow,
            }}
          >
            <label style={{ fontWeight: 800, display: "block", marginBottom: 8 }}>
              Breed
            </label>

            <input
              value={breedSearch}
              onChange={(e) => setBreedSearch(e.target.value)}
              disabled={!petTypeId}
              placeholder={petTypeId ? "Search breeds..." : "Select type first"}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 12,
                background: theme.inputBg,
                color: theme.text,
                border: `1px solid ${theme.inputBorder}`,
                outline: "none",
                marginBottom: 10,
              }}
            />

            <select
              value={breedId}
              onChange={(e) => setBreedId(e.target.value)}
              disabled={!petTypeId}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 12,
                background: theme.inputBg,
                color: theme.text,
                border: `1px solid ${theme.inputBorder}`,
                outline: "none",
              }}
            >
              <option value="">
                {petTypeId ? "Choose a breed" : "Select type first"}
              </option>

              {sortedBreedsForDropdown.map((b) => (
                <option key={b.id} value={b.id}>
                  {favorites.has(b.id) ? "⭐ " : ""}
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Breed Header Card */}
        {selectedBreed && (
          <div
            style={{
              marginTop: 24,
              borderRadius: 22,
              overflow: "hidden",
              boxShadow: theme.shadow,
              background: theme.headerBg,
              color: theme.headerText,
              border: `1px solid ${theme.panelBorder}`,
            }}
          >
            {selectedBreed.image_url && (
              <img
                src={selectedBreed.image_url}
                alt={selectedBreed.name}
                style={{ width: "100%", height: 260, objectFit: "cover" }}
              />
            )}

            <div style={{ padding: 22 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <h2 style={{ marginTop: 0, marginBottom: 6 }}>{selectedBreed.name}</h2>

                <button
                  onClick={() => toggleFavorite(selectedBreed.id)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: theme.headerText,
                    cursor: "pointer",
                    fontSize: 20,
                    padding: 8,
                    borderRadius: 12,
                  }}
                  title={isFavorite ? "Unfavorite" : "Favorite"}
                >
                  {isFavorite ? "⭐" : "☆"}
                </button>
              </div>

              {selectedBreed.description && (
                <p style={{ opacity: 0.9, marginTop: 8 }}>{selectedBreed.description}</p>
              )}

              {/* Quick facts */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
                {selectedBreed.lifespan && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 10px",
                      borderRadius: 999,
                      background: darkMode ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.12)",
                      border: darkMode ? "1px solid rgba(255,255,255,.14)" : "1px solid rgba(255,255,255,.18)",
                      fontSize: 13,
                    }}
                  >
                    🕰️ <strong style={{ fontWeight: 800 }}>Lifespan:</strong> {selectedBreed.lifespan}
                  </span>
                )}

                {(selectedBreed.size || selectedBreed.height_weight) && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 10px",
                      borderRadius: 999,
                      background: darkMode ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.12)",
                      border: darkMode ? "1px solid rgba(255,255,255,.14)" : "1px solid rgba(255,255,255,.18)",
                      fontSize: 13,
                    }}
                  >
                    📏 <strong style={{ fontWeight: 800 }}>Size:</strong>{" "}
                    {selectedBreed.size ?? selectedBreed.height_weight}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Care Cards */}
        {selectedBreed && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <button
                onClick={openAllCategories}
                style={{
                  border: `1px solid ${theme.panelBorder}`,
                  background: theme.panelBg,
                  color: theme.text,
                  padding: "10px 12px",
                  borderRadius: 12,
                  cursor: "pointer",
                }}
              >
                Expand all
              </button>
              <button
                onClick={closeAllCategories}
                style={{
                  border: `1px solid ${theme.panelBorder}`,
                  background: theme.panelBg,
                  color: theme.text,
                  padding: "10px 12px",
                  borderRadius: 12,
                  cursor: "pointer",
                }}
              >
                Collapse all
              </button>
            </div>

            {categories.map((cat) => {
              const content = guidesByCategoryId[cat.id];
              const tone = cardTone(cat.name);
              const isOpen = openCategoryIds.has(cat.id);

              return (
                <div
                  key={cat.id}
                  style={{
                    marginTop: 11,
                    borderRadius: 16,
                    background: darkMode ? theme.panelBg : tone.bg,
                    border: `2px solid ${darkMode ? theme.panelBorder : tone.border}`,
                    padding: 0,
                    overflow: "hidden",
                    boxShadow: darkMode ? "0 10px 24px rgba(0,0,0,.25)" : "0 10px 20px rgba(0,0,0,.08)",
                  }}
                >
                  {/* clickable header */}
                  <button
                    onClick={() => toggleCategory(cat.id)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: 16,
                      cursor: "pointer",
                      background: "transparent",
                      border: "none",
                      color: theme.text,
                      textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontSize: 18 }}>{cat.icon ?? "📌"}</div>
                      <div style={{ fontWeight: 900 }}>{cat.name}</div>
                    </div>

                    <div style={{ opacity: 0.8, fontSize: 14 }}>
                      {isOpen ? "▲" : "▼"}
                    </div>
                  </button>

                  {/* animated body */}
                  <div
                    style={{
                      maxHeight: isOpen ? 600 : 0,
                      transition: "max-height .25s ease",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "0 16px 16px 16px",
                        lineHeight: 1.6,
                        whiteSpace: "pre-wrap",
                        color: theme.subtext,
                      }}
                    >
                      {content ? (
                        content
                      ) : (
                        <span style={{ opacity: 0.75 }}>No info added yet.</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}