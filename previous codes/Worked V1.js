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

  useEffect(() => {
    loadPetTypes();
    loadCategories();
  }, []);

  useEffect(() => {
    if (!petTypeId) {
      setBreeds([]);
      setBreedId("");
      setSelectedBreed(null);
      setGuidesByCategoryId({});
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
    const { data, error } = await supabase
      .from("breeds")
      .select("*")
      .eq("id", id)
      .single();
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
      "Lifespan": { bg: "#EAF3FF", border: "#B6D6FF" },
      "Care Instructions": { bg: "#E9FFF0", border: "#B8F0C6" },
      "Dietary Needs": { bg: "#FFF4E7", border: "#FFD0A1" },
      "Exercise Needs": { bg: "#F3EFFF", border: "#D6C7FF" },
      "Grooming Needs": { bg: "#FFEAF3", border: "#FFBFD9" },
      "Health Concerns": { bg: "#FFECEC", border: "#FFB7B7" },
    };
    return (name) => tones[name] ?? { bg: "#F5F5F5", border: "#DDDDDD" };
  }, []);

  return (
    <div style={{ padding: 40, fontFamily: "system-ui, Segoe UI, Arial" }}>
      <h1 style={{ marginTop: 0 }}>Zoo Database 🐾</h1>

      {/* Dropdowns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          maxWidth: 760,
        }}
      >
        <div>
          <label style={{ fontWeight: 700, display: "block", marginBottom: 6 }}>
            Pet Type
          </label>
          <select
            value={petTypeId}
            onChange={(e) => setPetTypeId(e.target.value)}
            style={{ width: "100%", padding: 12, borderRadius: 10 }}
          >
            <option value="">Choose a pet type</option>
            {petTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontWeight: 700, display: "block", marginBottom: 6 }}>
            Breed
          </label>
          <select
            value={breedId}
            onChange={(e) => setBreedId(e.target.value)}
            disabled={!petTypeId}
            style={{ width: "100%", padding: 12, borderRadius: 10 }}
          >
            <option value="">
              {petTypeId ? "Choose a breed" : "Select type first"}
            </option>
            {breeds.map((b) => (
              <option key={b.id} value={b.id}>
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
            borderRadius: 20,
            overflow: "hidden",
            maxWidth: 760,
            boxShadow: "0 20px 40px rgba(0,0,0,.25)",
            background: "#1e1e1e",
            color: "white",
          }}
        >
          {selectedBreed.image_url && (
            <img
              src={selectedBreed.image_url}
              alt={selectedBreed.name}
              style={{ width: "100%", height: 260, objectFit: "cover" }}
            />
          )}

          <div style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>{selectedBreed.name}</h2>

            {selectedBreed.description && (
              <p style={{ opacity: 0.85 }}>{selectedBreed.description}</p>
            )}

            {selectedBreed.lifespan && (
              <p>
                <strong>Lifespan:</strong> {selectedBreed.lifespan}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Care Cards */}
      {selectedBreed && (
        <div style={{ marginTop: 18, maxWidth: 760 }}>
          {categories.map((cat) => {
            const content = guidesByCategoryId[cat.id];
            const tone = cardTone(cat.name);

            return (
              <div
                key={cat.id}
                style={{
                  marginTop: 11,
                  borderRadius: 14,
                  background: tone.bg,
                  border: `2px solid ${tone.border}`,
                  padding: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{fontSize: 18 }}>{cat.icon ?? "📌"}</div>
                  <div style={{color: "#222",fontWeight: 800 }}>{cat.name}</div>
                </div>

                <div
                  style={{
                    marginTop: 10,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    color: "#222"
                  }}
                >
                  {content ? content : (
                    <span style={{ opacity: 0.6 }}>No info added yet.</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}