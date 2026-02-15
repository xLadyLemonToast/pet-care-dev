import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";

/**
 * What’s new in this version:
 * - Auto crop+resize on upload (center-crop to 16:9, outputs JPG)
 * - "Brochure PDF" export: opens a clean print page with nice layout
 * - Admin Care Categories editor (CRUD: name, icon, sort_order)
 * - Image URL scheme supports:
 *    - public URL (https://...): used directly
 *    - storage ref (sb://breed-images/<path>): can generate signed URL (admin) or public URL fallback
 */

export default function App() {
  // ----------------------------
  // AUTH
  // ----------------------------
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function login() {
    const email = prompt("Admin email for magic link login:");
    if (!email) return;
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) alert(error.message);
    else alert("Check your email for the magic link ✨");
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  const isAdmin = !!user;

  // ----------------------------
  // APP STATE
  // ----------------------------
  const [petTypes, setPetTypes] = useState([]);
  const [breeds, setBreeds] = useState([]);
  const [selectedBreed, setSelectedBreed] = useState(null);

  const [petTypeId, setPetTypeId] = useState("");
  const [breedId, setBreedId] = useState("");

  const [categories, setCategories] = useState([]);
  const [guidesByCategoryId, setGuidesByCategoryId] = useState({});

  const [openCategoryIds, setOpenCategoryIds] = useState(new Set());

  // UX upgrades
  const [breedSearch, setBreedSearch] = useState("");
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem("zoo_viewMode") || "detail"; // "detail" | "grid" | "admin"
    } catch {
      return "detail";
    }
  });

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

  // Admin editing (guides)
  const [editMode, setEditMode] = useState(() => {
    try {
      return localStorage.getItem("zoo_editMode") === "1";
    } catch {
      return false;
    }
  });
  const [autoSave, setAutoSave] = useState(false);

  const [draftsByCategoryId, setDraftsByCategoryId] = useState({});
  const [savingByCategoryId, setSavingByCategoryId] = useState({});
  const [statusByCategoryId, setStatusByCategoryId] = useState({});
  const lastFocusedCatIdRef = useRef(null);
  const autosaveTimersRef = useRef({});

  // Admin panel: breed editor
  const [breedForm, setBreedForm] = useState({
    id: "",
    pet_type_id: "",
    name: "",
    description: "",
    image_url: "",
    lifespan: "",
    size: "",
    height_weight: "",
    group: "",
    origin: "",
  });
  const [breedSaving, setBreedSaving] = useState(false);
  const [breedSaveMsg, setBreedSaveMsg] = useState("");

  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  // Admin panel: category editor
  const [catForm, setCatForm] = useState({ id: "", name: "", icon: "📌", sort_order: 0 });
  const [catSaving, setCatSaving] = useState(false);
  const [catMsg, setCatMsg] = useState("");

  // Image URL cache (signed URLs can expire; cache per breed render)
  const [imageSrcCache, setImageSrcCache] = useState({}); // { rawUrl: resolvedUrl }

  // Persist settings
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
    try {
      localStorage.setItem("zoo_editMode", editMode ? "1" : "0");
    } catch {}
  }, [editMode]);

  useEffect(() => {
    try {
      localStorage.setItem("zoo_viewMode", viewMode);
    } catch {}
  }, [viewMode]);

  useEffect(() => {
    if (!isAdmin) setEditMode(false);
    if (!isAdmin && viewMode === "admin") setViewMode("detail");
  }, [isAdmin]);

  // ----------------------------
  // URL SHARE LINKS: ?petType=...&breed=...
  // ----------------------------
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlPetType = params.get("petType") || "";
    const urlBreed = params.get("breed") || "";

    if (urlPetType) setPetTypeId(urlPetType);
    if (urlBreed) setBreedId(urlBreed);
  }, []);

  function updateShareUrl(nextPetTypeId, nextBreedId) {
    const params = new URLSearchParams(window.location.search);

    if (nextPetTypeId) params.set("petType", nextPetTypeId);
    else params.delete("petType");

    if (nextBreedId) params.set("breed", nextBreedId);
    else params.delete("breed");

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
  }

  useEffect(() => {
    updateShareUrl(petTypeId, breedId);
  }, [petTypeId, breedId]);

  async function copyShareLink() {
    const link = window.location.href;
    try {
      await navigator.clipboard.writeText(link);
      alert("Share link copied ✅");
    } catch {
      prompt("Copy this link:", link);
    }
  }

  // ----------------------------
  // DATA LOADERS
  // ----------------------------
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
      setDraftsByCategoryId({});
      setBreedSearch("");
      setOpenCategoryIds(new Set());
      setImageSrcCache({});
      return;
    }
    loadBreeds(petTypeId);
  }, [petTypeId]);

  useEffect(() => {
    if (!breedId) {
      setSelectedBreed(null);
      setGuidesByCategoryId({});
      setDraftsByCategoryId({});
      setOpenCategoryIds(new Set());
      return;
    }
    loadBreedDetails(breedId);
    loadGuidesForBreed(breedId);
  }, [breedId]);

  async function loadPetTypes() {
    const { data, error } = await supabase.from("pet_types").select("id,name").order("name");
    if (error) console.error(error);
    setPetTypes(data ?? []);
  }

  async function loadBreeds(typeId) {
    const { data, error } = await supabase
      .from("breeds")
      .select("id,name,image_url,pet_type_id")
      .eq("pet_type_id", typeId)
      .order("name");

    if (error) console.error(error);
    setBreeds(data ?? []);
    setImageSrcCache({});
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

  async function loadGuidesForBreed(bid) {
    const { data, error } = await supabase
      .from("care_guides")
      .select("category_id,content")
      .eq("breed_id", bid);

    if (error) console.error(error);

    const map = {};
    for (const row of data ?? []) map[row.category_id] = row.content ?? "";

    setGuidesByCategoryId(map);
    setDraftsByCategoryId(map);
    setSavingByCategoryId({});
    setStatusByCategoryId({});
  }

  async function refreshCurrentBreed() {
    if (!breedId) return;
    await loadBreedDetails(breedId);
    await loadGuidesForBreed(breedId);
  }

  // ----------------------------
  // IMAGE RESOLUTION (public url or sb:// ref)
  // ----------------------------
  function parseSbUrl(url) {
    // format: sb://bucket/path/to/file.jpg
    if (!url?.startsWith("sb://")) return null;
    const rest = url.slice("sb://".length);
    const firstSlash = rest.indexOf("/");
    if (firstSlash < 0) return null;
    return { bucket: rest.slice(0, firstSlash), path: rest.slice(firstSlash + 1) };
  }

  async function resolveImageSrc(rawUrl) {
    if (!rawUrl) return "";
    if (imageSrcCache[rawUrl]) return imageSrcCache[rawUrl];

    // Normal http(s) URLs
    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
      setImageSrcCache((p) => ({ ...p, [rawUrl]: rawUrl }));
      return rawUrl;
    }

    // Storage ref
    const sb = parseSbUrl(rawUrl);
    if (!sb) return "";

    // If bucket is public, public URL works for everyone:
    const { data: pub } = supabase.storage.from(sb.bucket).getPublicUrl(sb.path);
    const publicUrl = pub?.publicUrl;

    // If admin logged in, prefer signed URL (useful even for private buckets later)
    if (isAdmin) {
      const { data, error } = await supabase.storage.from(sb.bucket).createSignedUrl(sb.path, 60 * 60);
      if (!error && data?.signedUrl) {
        setImageSrcCache((p) => ({ ...p, [rawUrl]: data.signedUrl }));
        return data.signedUrl;
      }
    }

    // Fallback to public URL (works if bucket public)
    if (publicUrl) {
      setImageSrcCache((p) => ({ ...p, [rawUrl]: publicUrl }));
      return publicUrl;
    }

    return "";
  }

  // whenever selectedBreed changes, resolve its image if needed
  useEffect(() => {
    if (!selectedBreed?.image_url) return;
    resolveImageSrc(selectedBreed.image_url);
  }, [selectedBreed?.image_url, isAdmin]);

  // ----------------------------
  // THEMING
  // ----------------------------
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
        subtext: "#3b3b3b",
        panelBg: "#ffffff",
        panelBorder: "#E9E9E9",
        headerBg: "#1e1e1e",
        headerText: "#ffffff",
        inputBg: "#ffffff",
        inputBorder: "#D7D7D7",
        shadow: "0 20px 40px rgba(0,0,0,.10)",
        softShadow: "0 10px 20px rgba(0,0,0,.08)",
        btnBg: "#ffffff",
      };
    }
    return {
      pageBg: "#0f0f12",
      text: "#F5F5F7",
      subtext: "#C7C9D2",
      panelBg: "#14141a",
      panelBorder: "#2a2a33",
      headerBg: "#14141a",
      headerText: "#ffffff",
      inputBg: "#121218",
      inputBorder: "#2a2a33",
      shadow: "0 20px 40px rgba(0,0,0,.45)",
      softShadow: "0 10px 24px rgba(0,0,0,.25)",
      btnBg: "#14141a",
    };
  }, [darkMode]);

  // ----------------------------
  // BREED SEARCH + FAVORITES + GRID
  // ----------------------------
  const filteredBreeds = useMemo(() => {
    const q = breedSearch.trim().toLowerCase();
    if (!q) return breeds;
    return breeds.filter((b) => (b.name ?? "").toLowerCase().includes(q));
  }, [breeds, breedSearch]);

  const sortedBreeds = useMemo(() => {
    const arr = [...filteredBreeds];
    arr.sort((a, b) => {
      const af = favorites.has(a.id) ? 0 : 1;
      const bf = favorites.has(b.id) ? 0 : 1;
      if (af !== bf) return af - bf;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
    return arr;
  }, [filteredBreeds, favorites]);

  function toggleFavorite(id) {
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const isFavorite = selectedBreed ? favorites.has(selectedBreed.id) : false;

  // ----------------------------
  // COLLAPSE
  // ----------------------------
  function toggleCategory(id) {
    setOpenCategoryIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function openAllCategories() {
    setOpenCategoryIds(new Set(categories.map((c) => c.id)));
  }

  function closeAllCategories() {
    setOpenCategoryIds(new Set());
  }

  // ----------------------------
  // SAVE GUIDES
  // ----------------------------
  async function saveGuide(categoryId) {
    if (!breedId) return;
    const content = (draftsByCategoryId[categoryId] ?? "").trim();

    setSavingByCategoryId((p) => ({ ...p, [categoryId]: true }));
    setStatusByCategoryId((p) => ({ ...p, [categoryId]: { type: "idle" } }));

    const { error } = await supabase
      .from("care_guides")
      .upsert({ breed_id: breedId, category_id: categoryId, content }, { onConflict: "breed_id,category_id" });

    if (error) {
      console.error(error);
      setStatusByCategoryId((p) => ({
        ...p,
        [categoryId]: { type: "error", message: error.message },
      }));
      setSavingByCategoryId((p) => ({ ...p, [categoryId]: false }));
      return;
    }

    setGuidesByCategoryId((p) => ({ ...p, [categoryId]: content }));
    setStatusByCategoryId((p) => ({ ...p, [categoryId]: { type: "saved", message: "Saved ✅" } }));
    setSavingByCategoryId((p) => ({ ...p, [categoryId]: false }));

    setTimeout(() => {
      setStatusByCategoryId((p) => {
        const next = { ...p };
        if (next[categoryId]?.type === "saved") next[categoryId] = { type: "idle" };
        return next;
      });
    }, 1200);
  }

  function onDraftChange(catId, value) {
    setDraftsByCategoryId((p) => ({ ...p, [catId]: value }));
    lastFocusedCatIdRef.current = catId;

    if (!autoSave || !isAdmin || !editMode) return;

    if (autosaveTimersRef.current[catId]) clearTimeout(autosaveTimersRef.current[catId]);
    autosaveTimersRef.current[catId] = setTimeout(() => saveGuide(catId), 700);
  }

  // Ctrl/Cmd+S saves last focused card
  useEffect(() => {
    function onKeyDown(e) {
      const isSave = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s";
      if (!isSave) return;
      if (!isAdmin || !editMode) return;
      e.preventDefault();
      const catId = lastFocusedCatIdRef.current;
      if (catId) saveGuide(catId);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAdmin, editMode, breedId, draftsByCategoryId]);

  // ----------------------------
  // BROCHURE PDF EXPORT (new window HTML -> print)
  // ----------------------------
  async function brochurePdf() {
    if (!selectedBreed) return;

    // Ensure image is resolved
    const hero = selectedBreed.image_url ? await resolveImageSrc(selectedBreed.image_url) : "";

    const sections = categories.map((cat) => {
      const body = guidesByCategoryId[cat.id] ?? "";
      return { title: cat.name, icon: cat.icon ?? "📌", body: body || "No info added yet." };
    });

    const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(selectedBreed.name)} Care Sheet</title>
  <style>
    *{ box-sizing:border-box; }
    body{ font-family: system-ui, Segoe UI, Arial; margin:0; background:#fff; color:#111; }
    .wrap{ max-width: 880px; margin: 0 auto; padding: 28px; }
    .hero{ border-radius: 22px; overflow:hidden; border:1px solid #e6e6e6; }
    .heroImg{ width:100%; height: 320px; object-fit:cover; display:block; }
    .heroInner{ padding: 20px 22px; }
    h1{ margin:0; font-size: 34px; letter-spacing:-0.3px; }
    .desc{ margin-top:10px; line-height:1.45; color:#333; }
    .chips{ display:flex; flex-wrap:wrap; gap: 10px; margin-top: 14px; }
    .chip{ border: 1px solid #ddd; border-radius: 999px; padding: 8px 10px; font-size: 13px; background:#fafafa; }
    .grid{ margin-top: 16px; display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .card{ border:1px solid #e6e6e6; border-radius: 18px; padding: 14px; }
    .cardTitle{ font-weight: 900; display:flex; align-items:center; gap: 8px; }
    .cardBody{ margin-top: 10px; white-space: pre-wrap; line-height:1.45; color:#222; font-size: 13px; }
    .footer{ margin-top: 18px; color:#666; font-size: 12px; }
    @media print {
      .wrap{ padding: 0; }
      .grid{ grid-template-columns: 1fr 1fr; }
      .heroImg{ height: 300px; }
      @page { margin: 12mm; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      ${hero ? `<img class="heroImg" src="${hero}" />` : ``}
      <div class="heroInner">
        <h1>${escapeHtml(selectedBreed.name)} Care Sheet</h1>
        ${selectedBreed.description ? `<div class="desc">${escapeHtml(selectedBreed.description)}</div>` : ``}
        <div class="chips">
          ${selectedBreed.lifespan ? `<div class="chip">🕰️ <b>Lifespan:</b> ${escapeHtml(selectedBreed.lifespan)}</div>` : ``}
          ${(selectedBreed.size || selectedBreed.height_weight) ? `<div class="chip">📏 <b>Size:</b> ${escapeHtml(selectedBreed.size ?? selectedBreed.height_weight)}</div>` : ``}
          ${selectedBreed.group ? `<div class="chip">🏷️ <b>Group:</b> ${escapeHtml(selectedBreed.group)}</div>` : ``}
          ${selectedBreed.origin ? `<div class="chip">🌍 <b>Origin:</b> ${escapeHtml(selectedBreed.origin)}</div>` : ``}
        </div>
      </div>
    </div>

    <div class="grid">
      ${sections
        .map(
          (s) => `
        <div class="card">
          <div class="cardTitle">${escapeHtml(s.icon)} ${escapeHtml(s.title)}</div>
          <div class="cardBody">${escapeHtml(s.body)}</div>
        </div>
      `
        )
        .join("")}
    </div>

    <div class="footer">Generated from Zoo Database (Supabase + React)</div>
  </div>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`;

    const w = window.open("", "_blank");
    if (!w) return alert("Popup blocked. Allow popups for brochure PDF.");
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  // ----------------------------
  // ADMIN: BREED EDITOR + IMAGE UPLOAD (auto crop)
  // ----------------------------
  function resetBreedForm() {
    setBreedForm({
      id: "",
      pet_type_id: petTypeId || "",
      name: "",
      description: "",
      image_url: "",
      lifespan: "",
      size: "",
      height_weight: "",
      group: "",
      origin: "",
    });
    setBreedSaveMsg("");
  }

  function loadBreedIntoForm(b) {
    setBreedForm({
      id: b.id ?? "",
      pet_type_id: b.pet_type_id ?? "",
      name: b.name ?? "",
      description: b.description ?? "",
      image_url: b.image_url ?? "",
      lifespan: b.lifespan ?? "",
      size: b.size ?? "",
      height_weight: b.height_weight ?? "",
      group: b.group ?? "",
      origin: b.origin ?? "",
    });
    setBreedSaveMsg("");
  }

  async function saveBreed() {
    if (!isAdmin) return alert("Log in as admin first.");
    if (!breedForm.pet_type_id) return alert("Pick a Pet Type for this breed.");
    if (!breedForm.name.trim()) return alert("Breed name is required.");

    setBreedSaving(true);
    setBreedSaveMsg("");

    const payload = {
      id: breedForm.id || undefined,
      pet_type_id: breedForm.pet_type_id,
      name: breedForm.name.trim(),
      description: breedForm.description?.trim() || null,
      image_url: breedForm.image_url?.trim() || null,
      lifespan: breedForm.lifespan?.trim() || null,
      group: breedForm.group?.trim() || null,
      origin: breedForm.origin?.trim() || null,
      size: breedForm.size?.trim() || null,
      height_weight: breedForm.height_weight?.trim() || null,
    };

    const { data, error } = await supabase.from("breeds").upsert(payload).select("*").single();

    setBreedSaving(false);

    if (error) {
      console.error(error);
      setBreedSaveMsg(error.message);
      return;
    }

    setBreedSaveMsg("Saved ✅");

    await loadBreeds(payload.pet_type_id);
    if (data?.id) {
      setPetTypeId(payload.pet_type_id);
      setBreedId(data.id);
      setViewMode("detail");
    }
  }

  async function deleteBreed(b) {
    if (!isAdmin) return;
    if (!confirm(`Delete breed "${b.name}"? This cannot be undone.`)) return;

    const { error } = await supabase.from("breeds").delete().eq("id", b.id);
    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    if (breedId === b.id) {
      setBreedId("");
      setSelectedBreed(null);
    }

    await loadBreeds(petTypeId);
    alert("Deleted ✅");
  }

  // Auto center-crop to 16:9 + resize -> JPG blob
  async function cropResizeToBlob(file, targetW = 1600, targetH = 900, quality = 0.88) {
    const img = await readFileAsImage(file);

    const sw = img.width;
    const sh = img.height;
    const targetRatio = targetW / targetH;
    const srcRatio = sw / sh;

    let cropW, cropH;
    if (srcRatio > targetRatio) {
      cropH = sh;
      cropW = Math.round(sh * targetRatio);
    } else {
      cropW = sw;
      cropH = Math.round(sw / targetRatio);
    }

    const sx = Math.floor((sw - cropW) / 2);
    const sy = Math.floor((sh - cropH) / 2);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");

    ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, targetW, targetH);

    return await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
    });
  }

  async function uploadBreedImage(file) {
    if (!file) return;
    if (!isAdmin) return alert("Log in to upload images.");

    const bucket = "breed-images";
    const blob = await cropResizeToBlob(file, 1600, 900, 0.88);

    if (!blob) return alert("Could not process image.");

    const safeName = `${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`;
    const path = safeName;

    const { error: upErr } = await supabase.storage.from(bucket).upload(path, blob, {
      upsert: false,
      contentType: "image/jpeg",
    });

    if (upErr) {
      console.error(upErr);
      alert(
        "Upload failed. Make sure Storage bucket 'breed-images' exists.\n\n" + upErr.message
      );
      return;
    }

    // Store as sb:// ref (so we can swap between public/signed later)
    const sbRef = `sb://${bucket}/${path}`;
    setBreedForm((p) => ({ ...p, image_url: sbRef }));
    setImageSrcCache((p) => ({ ...p, [sbRef]: "" })); // force re-resolve
  }

  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;

    function onDragOver(e) {
      e.preventDefault();
    }
    function onDrop(e) {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) uploadBreedImage(file);
    }

    el.addEventListener("dragover", onDragOver);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("drop", onDrop);
    };
  }, [dropRef.current, isAdmin]);

  // ----------------------------
  // ADMIN: CARE CATEGORIES CRUD
  // ----------------------------
  function resetCatForm() {
    setCatForm({ id: "", name: "", icon: "📌", sort_order: categories.length ? categories.length : 0 });
    setCatMsg("");
  }

  function loadCatIntoForm(c) {
    setCatForm({ id: c.id, name: c.name ?? "", icon: c.icon ?? "📌", sort_order: c.sort_order ?? 0 });
    setCatMsg("");
  }

  async function saveCategory() {
    if (!isAdmin) return alert("Log in as admin first.");
    if (!catForm.name.trim()) return alert("Category name is required.");

    setCatSaving(true);
    setCatMsg("");

    const payload = {
      id: catForm.id || undefined,
      name: catForm.name.trim(),
      icon: catForm.icon?.trim() || "📌",
      sort_order: Number(catForm.sort_order) || 0,
    };

    const { error } = await supabase.from("care_categories").upsert(payload);

    setCatSaving(false);

    if (error) {
      console.error(error);
      setCatMsg(error.message);
      return;
    }

    setCatMsg("Saved ✅");
    await loadCategories();
    resetCatForm();
  }

  async function deleteCategory(c) {
    if (!isAdmin) return;
    if (!confirm(`Delete category "${c.name}"?`)) return;

    const { error } = await supabase.from("care_categories").delete().eq("id", c.id);
    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    await loadCategories();
    alert("Deleted ✅");
  }

  // ----------------------------
  // PRINT CSS (keeps existing print, brochure uses its own window)
  // ----------------------------
  const printCss = `
    @media print {
      body { background: #fff !important; }
      .no-print { display: none !important; }
      .print-only { display: block !important; }
      .print-sheet {
        max-width: 760px !important;
        margin: 0 auto !important;
        color: #111 !important;
      }
      .print-sheet h1, .print-sheet h2, .print-sheet h3, .print-sheet p, .print-sheet div, .print-sheet span {
        color: #111 !important;
      }
      .print-card {
        border: 1px solid #ddd !important;
        border-radius: 12px !important;
        padding: 14px !important;
        margin-top: 10px !important;
        background: #fff !important;
        box-shadow: none !important;
      }
      @page { margin: 12mm; }
    }
  `;

  // ----------------------------
  // UI Helpers
  // ----------------------------
  const labelStyle = { fontWeight: 900, display: "block", marginBottom: 8 };

  function inputStyle(extra = {}) {
    return {
      width: "100%",
      padding: 12,
      borderRadius: 12,
      background: theme.inputBg,
      color: theme.text,
      border: `1px solid ${theme.inputBorder}`,
      outline: "none",
      ...extra,
    };
  }

  function btnStyle(overrides = {}) {
    return {
      border: `1px solid ${theme.panelBorder}`,
      background: theme.btnBg,
      color: theme.text,
      padding: "10px 12px",
      borderRadius: 12,
      cursor: "pointer",
      ...overrides,
    };
  }

  function Panel({ children }) {
    return (
      <div
        style={{
          background: theme.panelBg,
          border: `1px solid ${theme.panelBorder}`,
          borderRadius: 16,
          padding: 14,
          boxShadow: theme.shadow,
        }}
      >
        {children}
      </div>
    );
  }

  function Chip({ children }) {
    return (
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
        {children}
      </span>
    );
  }

  // ----------------------------
  // RENDER
  // ----------------------------
  const selectedImageSrc = selectedBreed?.image_url ? imageSrcCache[selectedBreed.image_url] : "";
  // grid cards will resolve on demand when clicked; keeps it simple & fast

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
      <style>{printCss}</style>

      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        {/* HEADER */}
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 42, letterSpacing: -0.5 }}>Zoo Database 🐾</h1>
            <div style={{ marginTop: 6, color: theme.subtext, fontSize: 14 }}>
              {isAdmin ? "Admin session active. Database is locked to you." : "Browse mode. Log in to edit/add content."}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button onClick={() => setDarkMode((d) => !d)} style={btnStyle()}>
              {darkMode ? "🌙 Dark" : "☀️ Light"}
            </button>

            <button onClick={() => setViewMode("detail")} style={btnStyle({ fontWeight: viewMode === "detail" ? 900 : 700 })}>
              🧾 Detail
            </button>

            <button
              onClick={() => setViewMode("grid")}
              style={btnStyle({ fontWeight: viewMode === "grid" ? 900 : 700 })}
              disabled={!petTypeId}
              title={!petTypeId ? "Pick a Pet Type first" : ""}
            >
              🧩 Grid
            </button>

            {isAdmin && (
              <button onClick={() => setViewMode("admin")} style={btnStyle({ fontWeight: viewMode === "admin" ? 900 : 700 })}>
                🛠️ Admin
              </button>
            )}

            {!isAdmin ? (
              <button onClick={login} style={btnStyle({ fontWeight: 900 })}>
                Admin Login
              </button>
            ) : (
              <>
                <button
                  onClick={() => setEditMode((v) => !v)}
                  style={btnStyle({ fontWeight: 900, borderColor: editMode ? (darkMode ? "#3a3a48" : "#b8f0c6") : theme.panelBorder })}
                >
                  {editMode ? "✏️ Edit: ON" : "✏️ Edit: OFF"}
                </button>

                <button
                  onClick={() => setAutoSave((v) => !v)}
                  style={btnStyle({ fontWeight: 900, borderColor: autoSave ? (darkMode ? "#3a3a48" : "#b6d6ff") : theme.panelBorder })}
                  disabled={!editMode}
                  title="Autosave (debounced)"
                >
                  {autoSave ? "💾 Autosave: ON" : "💾 Autosave: OFF"}
                </button>

                <button onClick={logout} style={btnStyle()}>
                  Logout
                </button>
              </>
            )}
          </div>
        </div>

        {/* TOP CONTROLS */}
        <div className="no-print" style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Panel>
            <label style={labelStyle}>Pet Type</label>
            <select
              value={petTypeId}
              onChange={(e) => {
                const v = e.target.value;
                setPetTypeId(v);
                setBreedId("");
                setSelectedBreed(null);
              }}
              style={inputStyle()}
            >
              <option value="">Choose a pet type</option>
              {petTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.name}
                </option>
              ))}
            </select>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={copyShareLink} style={btnStyle({ fontWeight: 900 })}>
                🔗 Share Link
              </button>

              {selectedBreed && (
                <>
                  <button onClick={() => window.print()} style={btnStyle({ fontWeight: 900 })}>
                    🖨️ Print/PDF
                  </button>
                  <button onClick={brochurePdf} style={btnStyle({ fontWeight: 900 })}>
                    📄 Brochure PDF
                  </button>
                </>
              )}
            </div>
          </Panel>

          <Panel>
            <label style={labelStyle}>Breed</label>

            <input
              value={breedSearch}
              onChange={(e) => setBreedSearch(e.target.value)}
              disabled={!petTypeId}
              placeholder={petTypeId ? "Search breeds..." : "Select type first"}
              style={inputStyle({ marginBottom: 10 })}
            />

            <select
              value={breedId}
              onChange={(e) => setBreedId(e.target.value)}
              disabled={!petTypeId}
              style={inputStyle()}
            >
              <option value="">{petTypeId ? "Choose a breed" : "Select type first"}</option>
              {sortedBreeds.map((b) => (
                <option key={b.id} value={b.id}>
                  {favorites.has(b.id) ? "⭐ " : ""}
                  {b.name}
                </option>
              ))}
            </select>
          </Panel>
        </div>

        {/* GRID VIEW */}
        {viewMode === "grid" && petTypeId && (
          <div className="no-print" style={{ marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ color: theme.subtext }}>
                Showing <b>{sortedBreeds.length}</b> breed(s)
              </div>
              <button onClick={() => setViewMode("detail")} style={btnStyle({ fontWeight: 900 })}>
                Go to Detail View
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
              {sortedBreeds.map((b) => (
                <div
                  key={b.id}
                  style={{
                    borderRadius: 18,
                    overflow: "hidden",
                    border: `1px solid ${theme.panelBorder}`,
                    background: theme.panelBg,
                    boxShadow: theme.softShadow,
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setBreedId(b.id);
                    setViewMode("detail");
                  }}
                  title="Open"
                >
                  <div style={{ height: 140, background: darkMode ? "#0c0c10" : "#f3f3f3" }}>
                    {b.image_url ? (
                      <img
                        src={imageSrcCache[b.image_url] || ""}
                        onLoad={async () => {
                          // lazy resolve image only when needed
                          if (!imageSrcCache[b.image_url]) {
                            const resolved = await resolveImageSrc(b.image_url);
                            if (resolved) setImageSrcCache((p) => ({ ...p, [b.image_url]: resolved }));
                          }
                        }}
                        alt={b.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <div style={{ padding: 14, color: theme.subtext }}>No image</div>
                    )}
                  </div>

                  <div style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div style={{ fontWeight: 900 }}>{b.name}</div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(b.id);
                      }}
                      style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, color: theme.text }}
                      title={favorites.has(b.id) ? "Unfavorite" : "Favorite"}
                    >
                      {favorites.has(b.id) ? "⭐" : "☆"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ADMIN VIEW */}
        {viewMode === "admin" && isAdmin && (
          <div className="no-print" style={{ marginTop: 18 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
              {/* Breed editor */}
              <Panel>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>Breed Editor</div>
                  <button onClick={resetBreedForm} style={btnStyle({ fontWeight: 900 })}>
                    + New Breed
                  </button>
                </div>

                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ gridColumn: "span 2" }}>
                    <label style={labelStyle}>Pet Type</label>
                    <select
                      value={breedForm.pet_type_id}
                      onChange={(e) => setBreedForm((p) => ({ ...p, pet_type_id: e.target.value }))}
                      style={inputStyle()}
                    >
                      <option value="">Choose a pet type</option>
                      {petTypes.map((pt) => (
                        <option key={pt.id} value={pt.id}>
                          {pt.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ gridColumn: "span 2" }}>
                    <label style={labelStyle}>Breed Name</label>
                    <input
                      value={breedForm.name}
                      onChange={(e) => setBreedForm((p) => ({ ...p, name: e.target.value }))}
                      style={inputStyle()}
                      placeholder="French Bulldog"
                    />
                  </div>

                  <div style={{ gridColumn: "span 2" }}>
                    <label style={labelStyle}>Description</label>
                    <textarea
                      value={breedForm.description}
                      onChange={(e) => setBreedForm((p) => ({ ...p, description: e.target.value }))}
                      style={inputStyle({ minHeight: 100, resize: "vertical" })}
                      placeholder="Short, friendly description..."
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Lifespan</label>
                    <input value={breedForm.lifespan} onChange={(e) => setBreedForm((p) => ({ ...p, lifespan: e.target.value }))} style={inputStyle()} />
                  </div>

                  <div>
                    <label style={labelStyle}>Group</label>
                    <input value={breedForm.group} onChange={(e) => setBreedForm((p) => ({ ...p, group: e.target.value }))} style={inputStyle()} />
                  </div>

                  <div>
                    <label style={labelStyle}>Origin</label>
                    <input value={breedForm.origin} onChange={(e) => setBreedForm((p) => ({ ...p, origin: e.target.value }))} style={inputStyle()} />
                  </div>

                  <div>
                    <label style={labelStyle}>Size</label>
                    <input value={breedForm.size} onChange={(e) => setBreedForm((p) => ({ ...p, size: e.target.value }))} style={inputStyle()} />
                  </div>

                  <div style={{ gridColumn: "span 2" }}>
                    <label style={labelStyle}>Height/Weight (optional alt field)</label>
                    <input
                      value={breedForm.height_weight}
                      onChange={(e) => setBreedForm((p) => ({ ...p, height_weight: e.target.value }))}
                      style={inputStyle()}
                      placeholder="11–13 inches, 20 lbs"
                    />
                  </div>

                  <div style={{ gridColumn: "span 2" }}>
                    <label style={labelStyle}>Image URL (or uploaded storage ref)</label>
                    <input
                      value={breedForm.image_url}
                      onChange={(e) => setBreedForm((p) => ({ ...p, image_url: e.target.value }))}
                      style={inputStyle()}
                      placeholder="https://... or sb://breed-images/..."
                    />

                    <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button onClick={() => fileInputRef.current?.click()} style={btnStyle({ fontWeight: 900 })}>
                        ⬆️ Upload (auto-crop)
                      </button>

                      <div
                        ref={dropRef}
                        style={{
                          border: `1px dashed ${theme.panelBorder}`,
                          borderRadius: 12,
                          padding: "10px 12px",
                          color: theme.subtext,
                          flex: 1,
                          minWidth: 240,
                        }}
                        title="Drag and drop an image here"
                      >
                        Drag & drop image here (auto-crops to 16:9)
                      </div>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => uploadBreedImage(e.target.files?.[0])}
                      />
                    </div>

                    {breedForm.image_url && (
                      <BreedImagePreview rawUrl={breedForm.image_url} resolveImageSrc={resolveImageSrc} theme={theme} />
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={saveBreed} disabled={breedSaving} style={btnStyle({ fontWeight: 900, opacity: breedSaving ? 0.7 : 1 })}>
                    {breedSaving ? "Saving..." : "Save Breed"}
                  </button>

                  <div style={{ color: breedSaveMsg.includes("Saved") ? (darkMode ? "#8BFFB0" : "#0a7a2a") : (darkMode ? "#FF9B9B" : "#b00020"), fontWeight: 900 }}>
                    {breedSaveMsg}
                  </div>
                </div>
              </Panel>

              {/* Categories editor */}
              <Panel>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>Care Categories</div>
                  <button onClick={resetCatForm} style={btnStyle({ fontWeight: 900 })}>
                    + New Category
                  </button>
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Name</label>
                    <input value={catForm.name} onChange={(e) => setCatForm((p) => ({ ...p, name: e.target.value }))} style={inputStyle()} />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Icon</label>
                      <input value={catForm.icon} onChange={(e) => setCatForm((p) => ({ ...p, icon: e.target.value }))} style={inputStyle()} />
                    </div>
                    <div>
                      <label style={labelStyle}>Sort Order</label>
                      <input
                        type="number"
                        value={catForm.sort_order}
                        onChange={(e) => setCatForm((p) => ({ ...p, sort_order: e.target.value }))}
                        style={inputStyle()}
                      />
                    </div>
                  </div>

                  <button onClick={saveCategory} disabled={catSaving} style={btnStyle({ fontWeight: 900, opacity: catSaving ? 0.7 : 1 })}>
                    {catSaving ? "Saving..." : "Save Category"}
                  </button>

                  {catMsg && (
                    <div style={{ color: catMsg.includes("Saved") ? (darkMode ? "#8BFFB0" : "#0a7a2a") : (darkMode ? "#FF9B9B" : "#b00020"), fontWeight: 900 }}>
                      {catMsg}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 14, maxHeight: 320, overflowY: "auto", paddingRight: 6 }}>
                  {categories.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        border: `1px solid ${theme.panelBorder}`,
                        borderRadius: 14,
                        padding: 12,
                        marginBottom: 10,
                        background: theme.btnBg,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                        <div style={{ fontWeight: 900 }}>
                          {c.icon ?? "📌"} {c.name} <span style={{ color: theme.subtext, fontWeight: 700 }}> (#{c.sort_order})</span>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => loadCatIntoForm(c)} style={btnStyle({ padding: "8px 10px" })} title="Edit">
                            ✏️
                          </button>
                          <button onClick={() => deleteCategory(c)} style={btnStyle({ padding: "8px 10px" })} title="Delete">
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        )}

        {/* DETAIL VIEW */}
        {viewMode === "detail" && selectedBreed && (
          <>
            <div className="print-only print-sheet" style={{ display: "none" }}>
              <h1 style={{ marginTop: 0 }}>{selectedBreed.name} Care Sheet</h1>
              {selectedBreed.description && <p>{selectedBreed.description}</p>}
            </div>

            <div
              className="print-sheet"
              style={{
                marginTop: 22,
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
                  src={selectedImageSrc || ""}
                  alt={selectedBreed.name}
                  style={{ width: "100%", height: 280, objectFit: "cover" }}
                />
              )}

              <div style={{ padding: 22 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 28 }}>{selectedBreed.name}</h2>
                    {selectedBreed.description && <div style={{ marginTop: 8, opacity: 0.92 }}>{selectedBreed.description}</div>}
                  </div>

                  <div className="no-print" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <button
                      onClick={() => toggleFavorite(selectedBreed.id)}
                      style={{ border: "none", background: "transparent", color: theme.headerText, cursor: "pointer", fontSize: 22, padding: 10, borderRadius: 12 }}
                      title={isFavorite ? "Unfavorite" : "Favorite"}
                    >
                      {isFavorite ? "⭐" : "☆"}
                    </button>

                    <button onClick={refreshCurrentBreed} style={btnStyle({ fontWeight: 900 })}>
                      🔄 Refresh
                    </button>

                    <button onClick={copyShareLink} style={btnStyle({ fontWeight: 900 })}>
                      🔗 Share
                    </button>

                    <button onClick={() => window.print()} style={btnStyle({ fontWeight: 900 })}>
                      🖨️ Print/PDF
                    </button>

                    <button onClick={brochurePdf} style={btnStyle({ fontWeight: 900 })}>
                      📄 Brochure PDF
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
                  {selectedBreed.lifespan && <Chip>🕰️ <b>Lifespan:</b> {selectedBreed.lifespan}</Chip>}
                  {(selectedBreed.size || selectedBreed.height_weight) && <Chip>📏 <b>Size:</b> {selectedBreed.size ?? selectedBreed.height_weight}</Chip>}
                  {selectedBreed.group && <Chip>🏷️ <b>Group:</b> {selectedBreed.group}</Chip>}
                  {selectedBreed.origin && <Chip>🌍 <b>Origin:</b> {selectedBreed.origin}</Chip>}
                </div>

                <div className="no-print" style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={openAllCategories} style={btnStyle()}>
                    Expand all
                  </button>
                  <button onClick={closeAllCategories} style={btnStyle()}>
                    Collapse all
                  </button>

                  {isAdmin && (
                    <>
                      <button onClick={() => setEditMode((v) => !v)} style={btnStyle({ fontWeight: 900 })}>
                        {editMode ? "✏️ Edit ON" : "✏️ Edit OFF"}
                      </button>

                      <button onClick={() => setAutoSave((v) => !v)} style={btnStyle({ fontWeight: 900 })} disabled={!editMode}>
                        {autoSave ? "💾 Autosave ON" : "💾 Autosave OFF"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Care Cards */}
            <div className="print-sheet" style={{ marginTop: 16 }}>
              {categories.map((cat) => {
                const tone = cardTone(cat.name);
                const isOpen = openCategoryIds.has(cat.id);
                const content = guidesByCategoryId[cat.id] ?? "";
                const draft = draftsByCategoryId[cat.id] ?? content;
                const isSaving = !!savingByCategoryId[cat.id];

                const status = statusByCategoryId[cat.id]?.type ?? "idle";
                const statusMsg = statusByCategoryId[cat.id]?.message ?? "";

                return (
                  <div
                    key={cat.id}
                    className="print-card"
                    style={{
                      marginTop: 12,
                      borderRadius: 16,
                      background: darkMode ? theme.panelBg : tone.bg,
                      border: `2px solid ${darkMode ? theme.panelBorder : tone.border}`,
                      overflow: "hidden",
                      boxShadow: theme.softShadow,
                    }}
                  >
                    <button
                      className="no-print"
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
                        <div style={{ fontWeight: 900, fontSize: 16 }}>{cat.name}</div>
                      </div>
                      <div style={{ opacity: 0.8, fontSize: 14 }}>{isOpen ? "▲" : "▼"}</div>
                    </button>

                    <div className="print-only" style={{ display: "none", padding: "0 16px 16px 16px" }}>
                      <div style={{ fontWeight: 900 }}>{cat.name}</div>
                      <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{content ? content : "No info added yet."}</div>
                    </div>

                    <div className="no-print" style={{ maxHeight: isOpen ? 1600 : 0, transition: "max-height .25s ease", overflow: "hidden" }}>
                      <div style={{ padding: "0 16px 16px 16px" }}>
                        {!editMode && (
                          <div style={{ lineHeight: 1.6, whiteSpace: "pre-wrap", color: theme.subtext }}>
                            {content ? content : <span style={{ opacity: 0.7 }}>No info added yet.</span>}
                          </div>
                        )}

                        {editMode && (
                          <>
                            <textarea
                              value={draft}
                              onChange={(e) => onDraftChange(cat.id, e.target.value)}
                              onFocus={() => (lastFocusedCatIdRef.current = cat.id)}
                              placeholder="Type guide text here..."
                              style={{
                                width: "100%",
                                minHeight: 140,
                                resize: "vertical",
                                padding: 12,
                                borderRadius: 12,
                                background: theme.inputBg,
                                color: theme.text,
                                border: `1px solid ${theme.inputBorder}`,
                                outline: "none",
                                lineHeight: 1.5,
                              }}
                            />

                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                <button
                                  onClick={() => saveGuide(cat.id)}
                                  disabled={isSaving}
                                  style={btnStyle({ fontWeight: 900, opacity: isSaving ? 0.75 : 1, cursor: isSaving ? "not-allowed" : "pointer" })}
                                >
                                  {isSaving ? "Saving..." : "Save"}
                                </button>

                                <button
                                  onClick={() => setDraftsByCategoryId((p) => ({ ...p, [cat.id]: content }))}
                                  disabled={isSaving}
                                  style={btnStyle({ opacity: isSaving ? 0.75 : 1 })}
                                  title="Revert to saved text"
                                >
                                  Revert
                                </button>
                              </div>

                              <div style={{ fontSize: 13 }}>
                                {status === "saved" && <span style={{ color: darkMode ? "#8BFFB0" : "#0a7a2a", fontWeight: 900 }}>{statusMsg}</span>}
                                {status === "error" && <span style={{ color: darkMode ? "#FF9B9B" : "#b00020", fontWeight: 900 }}>{statusMsg}</span>}
                              </div>
                            </div>

                            <div style={{ marginTop: 8, fontSize: 12, color: theme.subtext, opacity: 0.9 }}>
                              {autoSave ? "Autosave is ON (debounced)." : "Autosave is OFF. Use Save or Ctrl/Cmd+S."}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {viewMode === "detail" && !selectedBreed && (
          <div className="no-print" style={{ marginTop: 22, color: theme.subtext }}>
            Pick a Pet Type and a Breed to view its care sheet.
          </div>
        )}
      </div>
    </div>
  );
}

function BreedImagePreview({ rawUrl, resolveImageSrc, theme }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const resolved = await resolveImageSrc(rawUrl);
      if (mounted) setSrc(resolved || "");
    })();
    return () => {
      mounted = false;
    };
  }, [rawUrl]);

  if (!rawUrl) return null;

  return (
    <div style={{ marginTop: 10, borderRadius: 16, overflow: "hidden", border: `1px solid ${theme.panelBorder}` }}>
      {src ? (
        <img src={src} alt="Preview" style={{ width: "100%", height: 220, objectFit: "cover" }} />
      ) : (
        <div style={{ padding: 12, opacity: 0.8 }}>Preview loading…</div>
      )}
    </div>
  );
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readFileAsImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}