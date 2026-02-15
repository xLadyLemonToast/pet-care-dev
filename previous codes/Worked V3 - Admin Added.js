import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

export default function App() {

  const [user, setUser] = useState(null);

  const [petTypes, setPetTypes] = useState([]);
  const [breeds, setBreeds] = useState([]);
  const [selectedBreed, setSelectedBreed] = useState(null);

  const [petTypeId, setPetTypeId] = useState("");
  const [breedId, setBreedId] = useState("");

  const [categories, setCategories] = useState([]);
  const [guidesByCategoryId, setGuidesByCategoryId] = useState({});
  const [drafts, setDrafts] = useState({});

  const [openCategoryIds, setOpenCategoryIds] = useState(new Set());

  const [saving, setSaving] = useState(false);

  const editMode = !!user; // 🔥 admin auto-detected

  // AUTH LISTENER
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });

    const { data: listener } =
      supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
      });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function login() {
    const email = prompt("Enter your admin email:");

    if (!email) return;

    await supabase.auth.signInWithOtp({ email });
    alert("Check your email for the magic link ✨");
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  useEffect(() => {
    loadPetTypes();
    loadCategories();
  }, []);

  useEffect(() => {
    if (!petTypeId) return;
    loadBreeds(petTypeId);
  }, [petTypeId]);

  useEffect(() => {
    if (!breedId) return;
    loadBreedDetails(breedId);
    loadGuidesForBreed(breedId);
  }, [breedId]);

  async function loadPetTypes() {
    const { data } = await supabase
      .from("pet_types")
      .select("id,name")
      .order("name");

    setPetTypes(data ?? []);
  }

  async function loadBreeds(typeId) {
    const { data } = await supabase
      .from("breeds")
      .select("id,name")
      .eq("pet_type_id", typeId)
      .order("name");

    setBreeds(data ?? []);
  }

  async function loadBreedDetails(id) {
    const { data } = await supabase
      .from("breeds")
      .select("*")
      .eq("id", id)
      .single();

    setSelectedBreed(data);
  }

  async function loadCategories() {
    const { data } = await supabase
      .from("care_categories")
      .select("*")
      .order("sort_order");

    setCategories(data ?? []);
  }

  async function loadGuidesForBreed(breedId) {
    const { data } = await supabase
      .from("care_guides")
      .select("category_id,content")
      .eq("breed_id", breedId);

    const map = {};
    data?.forEach(row => map[row.category_id] = row.content);

    setGuidesByCategoryId(map);
    setDrafts(map);
  }

  async function saveGuide(categoryId) {

    setSaving(true);

    const content = drafts[categoryId];

    const { error } = await supabase
      .from("care_guides")
      .upsert(
        {
          breed_id: breedId,
          category_id: categoryId,
          content
        },
        {
          onConflict: "breed_id,category_id"
        }
      );

    if (error) {
      alert(error.message);
      console.error(error);
    } else {
      setGuidesByCategoryId(prev => ({
        ...prev,
        [categoryId]: content
      }));
    }

    setSaving(false);
  }

  function toggleCategory(id) {
    setOpenCategoryIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div style={{padding:40, maxWidth:760, margin:"auto"}}>

      <h1>Zoo Database 🐾</h1>

      {/* AUTH BUTTON */}
      {user ? (
        <button onClick={logout}>Logout</button>
      ) : (
        <button onClick={login}>Admin Login</button>
      )}

      <br/><br/>

      {/* Dropdowns */}
      <select value={petTypeId} onChange={e=>setPetTypeId(e.target.value)}>
        <option>Select Pet</option>
        {petTypes.map(pt=>(
          <option key={pt.id} value={pt.id}>{pt.name}</option>
        ))}
      </select>

      <select value={breedId} onChange={e=>setBreedId(e.target.value)}>
        <option>Select Breed</option>
        {breeds.map(b=>(
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>

      {/* CARE CARDS */}
      {selectedBreed && categories.map(cat=>{

        const isOpen = openCategoryIds.has(cat.id);

        return(
          <div key={cat.id}
            style={{
              marginTop:12,
              border:"1px solid #ddd",
              borderRadius:12,
              padding:12
            }}
          >

            <div
              onClick={()=>toggleCategory(cat.id)}
              style={{cursor:"pointer", fontWeight:800}}
            >
              {cat.icon} {cat.name}
            </div>

            {isOpen && (

              editMode ? (

                <>
                  <textarea
                    value={drafts[cat.id] ?? ""}
                    onChange={e=>setDrafts(prev=>({
                      ...prev,
                      [cat.id]:e.target.value
                    }))}
                    style={{
                      width:"100%",
                      minHeight:100,
                      marginTop:10
                    }}
                  />

                  <button
                    disabled={saving}
                    onClick={()=>saveGuide(cat.id)}
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </>

              ) : (

                <p style={{opacity:.8}}>
                  {guidesByCategoryId[cat.id] ?? "No info yet."}
                </p>

              )

            )}

          </div>
        );
      })}
    </div>
  );
}