import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";

/**
 * ELITE UI UPGRADE (drop-in App.js replacement)
 * Keeps ALL major features from your original:
 * - Supabase auth (magic link) admin session
 * - view modes: detail | grid | admin (admin only)
 * - favorites (localStorage)
 * - share links (?petType=...&breed=...)
 * - guides by category, collapse, edit mode, autosave, Ctrl/Cmd+S
 * - brochure PDF export (new window + print)
 * - admin Breed editor (CRUD) + image upload with auto crop/resize (16:9 -> JPG)
 * - admin Care Categories editor (CRUD)
 * - image URL scheme supports http(s) and sb://bucket/path signed/public resolution + cache
 * - print CSS
 */

export default function App() {
  // =====================================================
  // AUTH
  // =====================================================
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

  // =====================================================
  // APP STATE
  // =====================================================
  const [petTypes, setPetTypes] = useState([]);
  const [breeds, setBreeds] = useState([]);
  const [selectedBreed, setSelectedBreed] = useState(null);

  const [petTypeId, setPetTypeId] = useState("");
  const [breedId, setBreedId] = useState("");

  const [categories, setCategories] = useState([]);
  const [guidesByCategoryId, setGuidesByCategoryId] = useState({});
  const [openCategoryIds, setOpenCategoryIds] = useState(new Set());

  const [breedSearch, setBreedSearch] = useState("");

  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem("zoo_viewMode") || "detail"; // detail | grid | admin
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

  // Image URL cache (signed URLs can expire)
  const [imageSrcCache, setImageSrcCache] = useState({}); // { rawUrl: resolvedUrl }

  // =====================================================
  // PERSIST SETTINGS
  // =====================================================
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
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // =====================================================
  // URL SHARE LINKS: ?petType=...&breed=...
  // =====================================================
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

    const qs = params.toString();
    const newUrl = qs ? `${window.location.pathname}?${qs}` : `${window.location.pathname}`;
    window.history.replaceState({}, "", newUrl);
  }

  useEffect(() => {
    updateShareUrl(petTypeId, breedId);
  }, [petTypeId, breedId]);

  async function copyShareLink() {
    const link = window.location.href;
    try {
      await navigator.clipboard.writeText(link);
      toast("Share link copied ✅");
    } catch {
      prompt("Copy this link:", link);
    }
  }

  // =====================================================
  // DATA LOADERS
  // =====================================================
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
    toast("Refreshed ✅");
  }

  // =====================================================
  // IMAGE RESOLUTION (public url or sb:// ref)
  // =====================================================
  function parseSbUrl(url) {
    if (!url?.startsWith("sb://")) return null;
    const rest = url.slice("sb://".length);
    const firstSlash = rest.indexOf("/");
    if (firstSlash < 0) return null;
    return { bucket: rest.slice(0, firstSlash), path: rest.slice(firstSlash + 1) };
  }

  async function resolveImageSrc(rawUrl) {
    if (!rawUrl) return "";
    if (imageSrcCache[rawUrl]) return imageSrcCache[rawUrl];

    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
      setImageSrcCache((p) => ({ ...p, [rawUrl]: rawUrl }));
      return rawUrl;
    }

    const sb = parseSbUrl(rawUrl);
    if (!sb) return "";

    const { data: pub } = supabase.storage.from(sb.bucket).getPublicUrl(sb.path);
    const publicUrl = pub?.publicUrl;

    if (isAdmin) {
      const { data, error } = await supabase.storage.from(sb.bucket).createSignedUrl(sb.path, 60 * 60);
      if (!error && data?.signedUrl) {
        setImageSrcCache((p) => ({ ...p, [rawUrl]: data.signedUrl }));
        return data.signedUrl;
      }
    }

    if (publicUrl) {
      setImageSrcCache((p) => ({ ...p, [rawUrl]: publicUrl }));
      return publicUrl;
    }

    return "";
  }

  useEffect(() => {
    if (!selectedBreed?.image_url) return;
    resolveImageSrc(selectedBreed.image_url);
  }, [selectedBreed?.image_url, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // =====================================================
  // THEME
  // =====================================================
  const theme = useMemo(() => {
    if (!darkMode) {
      return {
        pageBg: "#F6F7FB",
        text: "#0F1222",
        subtext: "#4A4F67",
        panelBg: "#FFFFFF",
        panelBorder: "rgba(16, 24, 40, 0.10)",
        headerBg: "#0F1222",
        headerText: "#FFFFFF",
        inputBg: "#FFFFFF",
        inputBorder: "rgba(16, 24, 40, 0.14)",
        shadow: "0 18px 40px rgba(16, 24, 40, .12)",
        softShadow: "0 10px 24px rgba(16, 24, 40, .10)",
        accent: "#5B21B6",
        accent2: "#10B981",
        danger: "#b00020",
        ok: "#0a7a2a",
      };
    }
    return {
      pageBg: "#0B0C10",
      text: "#F5F6FB",
      subtext: "#B5B9D1",
      panelBg: "rgba(255,255,255,.06)",
      panelBorder: "rgba(255,255,255,.10)",
      headerBg: "rgba(255,255,255,.06)",
      headerText: "#FFFFFF",
      inputBg: "rgba(255,255,255,.05)",
      inputBorder: "rgba(255,255,255,.12)",
      shadow: "0 20px 60px rgba(0,0,0,.55)",
      softShadow: "0 10px 30px rgba(0,0,0,.35)",
      accent: "#8B5CF6",
      accent2: "#22C55E",
      danger: "#FF9B9B",
      ok: "#8BFFB0",
    };
  }, [darkMode]);

  // =====================================================
  // BREED SEARCH + FAVORITES
  // =====================================================
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

  // =====================================================
  // COLLAPSE
  // =====================================================
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

  // =====================================================
  // SAVE GUIDES
  // =====================================================
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
  }, [isAdmin, editMode, breedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // =====================================================
  // BROCHURE PDF EXPORT (new window HTML -> print)
  // =====================================================
  async function brochurePdf() {
    if (!selectedBreed) return;

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
    body{ font-family: ui-sans-serif, system-ui, Segoe UI, Arial; margin:0; background:#fff; color:#111; }
    .wrap{ max-width: 900px; margin: 0 auto; padding: 28px; }
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

  // =====================================================
  // ADMIN: BREED EDITOR + IMAGE UPLOAD (auto crop)
  // =====================================================
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
    toast("Breed saved ✅");

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
    toast("Deleted ✅");
  }

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
      alert("Upload failed. Make sure Storage bucket 'breed-images' exists.\n\n" + upErr.message);
      return;
    }

    const sbRef = `sb://${bucket}/${path}`;
    setBreedForm((p) => ({ ...p, image_url: sbRef }));
    setImageSrcCache((p) => ({ ...p, [sbRef]: "" })); // force re-resolve
    toast("Image uploaded ✅");
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
  }, [dropRef.current, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // =====================================================
  // ADMIN: CARE CATEGORIES CRUD
  // =====================================================
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
    toast("Category saved ✅");
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
    toast("Deleted ✅");
  }

  // =====================================================
  // PRINT CSS (brochure uses its own window)
  // =====================================================
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
      .print-sheet * { color: #111 !important; }
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

  // =====================================================
  // ELITE UI: GLOBAL STYLES
  // =====================================================
  const GlobalStyles = () => (
    <style>{`
      :root{
        --bg:${theme.pageBg};
        --text:${theme.text};
        --sub:${theme.subtext};
        --panel:${theme.panelBg};
        --border:${theme.panelBorder};
        --input:${theme.inputBg};
        --inputBorder:${theme.inputBorder};
        --shadow:${theme.shadow};
        --softShadow:${theme.softShadow};
        --a:${theme.accent};
        --a2:${theme.accent2};
        --ok:${theme.ok};
        --danger:${theme.danger};
        --r12:12px;
        --r16:16px;
        --r22:22px;
      }

      *{ box-sizing:border-box; }
      html, body{ height:100%; }
      html{ scroll-behavior:smooth; }
      body{
        margin:0;
        background: var(--bg);
        color: var(--text);
        font-family: ui-sans-serif, system-ui, Segoe UI, Arial;
      }

      .shell{
        max-width: 1160px;
        margin: 0 auto;
        padding: 28px;
      }
      @media (max-width: 920px){
        .shell{ padding: 16px; }
      }

      .topbar{
        position: sticky;
        top: 0;
        z-index: 30;
        backdrop-filter: blur(10px);
        background: ${darkMode ? "rgba(11,12,16,.72)" : "rgba(246,247,251,.78)"};
        border-bottom: 1px solid var(--border);
      }
      .topbarInner{
        max-width: 1160px;
        margin: 0 auto;
        padding: 14px 28px;
      }
      @media (max-width: 920px){
        .topbarInner{ padding: 12px 16px; }
      }

      .h1{
        font-size: 36px;
        letter-spacing: -0.6px;
        font-weight: 950;
        margin: 0;
        line-height: 1.06;
      }
      .h2{
        font-size: 18px;
        letter-spacing: -0.2px;
        font-weight: 900;
        margin: 0;
      }
      .sub{ color: var(--sub); font-size: 13px; }

      .grid2{
        display:grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }
      @media (max-width: 920px){
        .grid2{ grid-template-columns: 1fr; }
      }

      .detailGrid{
        display:grid;
        grid-template-columns: 1.65fr .95fr;
        gap: 14px;
        align-items: start;
      }
      @media (max-width: 1020px){
        .detailGrid{ grid-template-columns: 1fr; }
      }

      .panel{
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: var(--r16);
        box-shadow: var(--softShadow);
      }

      .card{
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: var(--r16);
        box-shadow: var(--softShadow);
        overflow: hidden;
      }

      .cardHeader{
        padding: 14px 16px;
        border-bottom: 1px solid ${darkMode ? "rgba(255,255,255,.10)" : "rgba(15,18,34,.06)"};
        background: ${darkMode ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.70)"};
        display:flex;
        align-items:center;
        justify-content: space-between;
        gap: 10px;
      }
      .cardBody{ padding: 14px 16px; }

      .btn{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap: 8px;
        border-radius: var(--r12);
        padding: 10px 12px;
        cursor:pointer;
        border: 1px solid var(--border);
        background: ${darkMode ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.75)"};
        color: var(--text);
        transition: transform .08s ease, background .12s ease, border-color .12s ease, box-shadow .12s ease;
        user-select:none;
        text-decoration:none;
        white-space: nowrap;
      }
      .btn:hover{
        transform: translateY(-1px);
        border-color: ${darkMode ? "rgba(255,255,255,.22)" : "rgba(15,18,34,.16)"};
        box-shadow: ${darkMode ? "0 10px 20px rgba(0,0,0,.28)" : "0 10px 20px rgba(15,18,34,.10)"};
      }
      .btn:active{ transform: translateY(0px) scale(.99); }
      .btn:disabled{ opacity:.55; cursor:not-allowed; transform:none; box-shadow:none; }

      .btnPrimary{
        background: linear-gradient(135deg, var(--a), var(--a2));
        border-color: transparent;
        color: white;
        font-weight: 900;
      }
      .btnGhost{
        background: transparent;
      }
      .btnDanger{
        background: transparent;
        border-color: ${darkMode ? "rgba(255,155,155,.35)" : "rgba(176,0,32,.25)"};
        color: var(--danger);
        font-weight: 900;
      }

      .fieldLabel{ font-weight: 900; display:block; margin-bottom: 8px; }
      .field{
        width: 100%;
        padding: 12px 12px;
        border-radius: var(--r12);
        border: 1px solid var(--inputBorder);
        background: var(--input);
        color: var(--text);
        outline: none;
      }
      .field:focus{
        border-color: var(--a);
        box-shadow: 0 0 0 4px ${darkMode ? "rgba(139,92,246,.18)" : "rgba(91,33,182,.12)"};
      }

      .chip{
        display:inline-flex;
        align-items:center;
        gap: 8px;
        border-radius: 999px;
        padding: 8px 10px;
        font-size: 13px;
        border: 1px solid ${darkMode ? "rgba(255,255,255,.12)" : "rgba(15,18,34,.10)"};
        background: ${darkMode ? "rgba(255,255,255,.05)" : "rgba(15,18,34,.03)"};
      }

      .muted{ color: var(--sub); }
      .ok{ color: var(--ok); font-weight: 900; }
      .danger{ color: var(--danger); font-weight: 900; }

      .pill{
        display:inline-flex; align-items:center; gap:8px;
        padding: 8px 10px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: ${darkMode ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.75)"};
        font-size: 12px;
        color: var(--sub);
      }

      .heroWrap{
        border-radius: var(--r22);
        border: 1px solid var(--border);
        overflow: hidden;
        box-shadow: var(--shadow);
        background: ${darkMode
          ? "radial-gradient(1200px 420px at 0% 0%, rgba(139,92,246,.22), transparent 55%), radial-gradient(900px 360px at 100% 0%, rgba(34,197,94,.16), transparent 55%), rgba(255,255,255,.05)"
          : "radial-gradient(1200px 420px at 0% 0%, rgba(91,33,182,.10), transparent 55%), radial-gradient(900px 360px at 100% 0%, rgba(16,185,129,.10), transparent 55%), #0F1222"};
      }

      .heroImg{
        width:100%;
        height: 280px;
        object-fit: cover;
        display:block;
        background: ${darkMode
          ? "linear-gradient(135deg, rgba(139,92,246,.18), rgba(34,197,94,.10))"
          : "linear-gradient(135deg, rgba(91,33,182,.10), rgba(16,185,129,.10))"};
      }

      .toast{
        position: fixed;
        bottom: 18px;
        left: 50%;
        transform: translateX(-50%);
        padding: 10px 12px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: ${darkMode ? "rgba(20,20,26,.85)" : "rgba(255,255,255,.92)"};
        color: var(--text);
        box-shadow: var(--softShadow);
        font-weight: 800;
        font-size: 12px;
        z-index: 80;
      }

      .sectionTitle{
        font-weight: 950;
        letter-spacing: -0.2px;
        font-size: 12px;
        color: var(--sub);
        text-transform: uppercase;
      }

      .divider{
        height:1px;
        background: ${darkMode ? "rgba(255,255,255,.10)" : "rgba(15,18,34,.08)"};
        margin: 12px 0;
      }
    `}</style>
  );

  // =====================================================
  // ELITE UI: COMPONENTS
  // =====================================================
  function Button({ variant = "default", className = "", style = {}, ...props }) {
    const cls =
      variant === "primary"
        ? `btn btnPrimary ${className}`
        : variant === "ghost"
        ? `btn btnGhost ${className}`
        : variant === "danger"
        ? `btn btnDanger ${className}`
        : `btn ${className}`;
    return <button className={cls} style={style} {...props} />;
  }

  function Panel({ children, style = {}, className = "" }) {
    return (
      <div className={`panel ${className}`} style={{ padding: 14, ...style }}>
        {children}
      </div>
    );
  }

  function Card({ title, right, children, style = {}, id, accent }) {
    return (
      <div
        id={id}
        className="card"
        style={{
          borderLeft: accent ? `6px solid ${accent}` : undefined,
          ...style,
        }}
      >
        {(title || right) && (
          <div className="cardHeader">
            <div className="h2">{title}</div>
            <div>{right}</div>
          </div>
        )}
        <div className="cardBody">{children}</div>
      </div>
    );
  }

  function FieldLabel({ children }) {
    return <label className="fieldLabel">{children}</label>;
  }

  function TextInput(props) {
    return <input className="field" {...props} />;
  }
  function SelectInput(props) {
    return <select className="field" {...props} />;
  }
  function TextArea(props) {
    return <textarea className="field" {...props} />;
  }

  function Chip({ children }) {
    return <span className="chip">{children}</span>;
  }

  // toast
  const [toastMsg, setToastMsg] = useState("");
  function toast(msg) {
    setToastMsg(msg);
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => setToastMsg(""), 1300);
  }

  // =====================================================
  // VIEW HELPERS
  // =====================================================
  const selectedImageSrc = selectedBreed?.image_url ? imageSrcCache[selectedBreed.image_url] : "";

  function jumpTo(catId) {
    setOpenCategoryIds((p) => new Set(p).add(catId));
    document.getElementById(`cat-${catId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // =====================================================
  // RENDER
  // =====================================================
  return (
    <div style={{ minHeight: "100vh", background: theme.pageBg, color: theme.text }}>
      <GlobalStyles />
      <style>{printCss}</style>

      {/* TOPBAR */}
      <div className="topbar no-print">
        <div className="topbarInner" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 260 }}>
            <div className="h1">Zoo Database 🐾</div>
            <div className="sub" style={{ marginTop: 6 }}>
              {isAdmin ? "Admin session active. You can edit breeds and care guides." : "Browse mode. Log in to edit/add content."}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span className="pill">{darkMode ? "🌙 Dark" : "☀️ Light"} mode</span>

            <Button onClick={() => setDarkMode((d) => !d)} variant="ghost">
              Toggle
            </Button>

            <Button onClick={() => setViewMode("detail")} style={{ fontWeight: viewMode === "detail" ? 950 : 800 }}>
              🧾 Detail
            </Button>

            <Button
              onClick={() => setViewMode("grid")}
              disabled={!petTypeId}
              title={!petTypeId ? "Pick a Pet Type first" : ""}
              style={{ fontWeight: viewMode === "grid" ? 950 : 800 }}
            >
              🧩 Grid
            </Button>

            {isAdmin && (
              <Button onClick={() => setViewMode("admin")} style={{ fontWeight: viewMode === "admin" ? 950 : 800 }}>
                🛠️ Admin
              </Button>
            )}

            {!isAdmin ? (
              <Button onClick={login} variant="primary">
                Admin Login
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => setEditMode((v) => !v)}
                  style={{
                    fontWeight: 950,
                    borderColor: editMode ? (darkMode ? "rgba(255,255,255,.20)" : "rgba(91,33,182,.22)") : theme.panelBorder,
                  }}
                  title="Toggle edit mode"
                >
                  {editMode ? "✏️ Edit ON" : "✏️ Edit OFF"}
                </Button>

                <Button
                  onClick={() => setAutoSave((v) => !v)}
                  disabled={!editMode}
                  style={{
                    fontWeight: 950,
                    borderColor: autoSave ? (darkMode ? "rgba(255,255,255,.20)" : "rgba(16,185,129,.25)") : theme.panelBorder,
                  }}
                  title="Autosave (debounced)"
                >
                  {autoSave ? "💾 Autosave ON" : "💾 Autosave OFF"}
                </Button>

                <Button onClick={logout} variant="ghost">
                  Logout
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="shell">
        {/* TOP CONTROLS */}
        <div className="no-print grid2">
          <Panel>
            <div className="sectionTitle">Selection</div>
            <div className="divider" />

            <FieldLabel>Pet Type</FieldLabel>
            <SelectInput
              value={petTypeId}
              onChange={(e) => {
                const v = e.target.value;
                setPetTypeId(v);
                setBreedId("");
                setSelectedBreed(null);
              }}
            >
              <option value="">Choose a pet type</option>
              {petTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.name}
                </option>
              ))}
            </SelectInput>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button onClick={copyShareLink} variant="ghost">
                🔗 Share Link
              </Button>

              {selectedBreed && (
                <>
                  <Button onClick={() => window.print()} variant="ghost">
                    🖨️ Print/PDF
                  </Button>
                  <Button onClick={brochurePdf} variant="primary">
                    📄 Brochure PDF
                  </Button>
                </>
              )}
            </div>
          </Panel>

          <Panel>
            <div className="sectionTitle">Browse</div>
            <div className="divider" />

            <FieldLabel>Breed</FieldLabel>

            <TextInput
              value={breedSearch}
              onChange={(e) => setBreedSearch(e.target.value)}
              disabled={!petTypeId}
              placeholder={petTypeId ? "Search breeds..." : "Select type first"}
              style={{ marginBottom: 10 }}
            />

            <SelectInput
              value={breedId}
              onChange={(e) => setBreedId(e.target.value)}
              disabled={!petTypeId}
            >
              <option value="">{petTypeId ? "Choose a breed" : "Select type first"}</option>
              {sortedBreeds.map((b) => (
                <option key={b.id} value={b.id}>
                  {favorites.has(b.id) ? "⭐ " : ""}
                  {b.name}
                </option>
              ))}
            </SelectInput>

            <div style={{ marginTop: 12 }} className="sub">
              {petTypeId ? (
                <>
                  Showing <b>{sortedBreeds.length}</b> breed(s)
                </>
              ) : (
                "Pick a pet type to load breeds."
              )}
            </div>
          </Panel>
        </div>

        {/* GRID VIEW */}
        {viewMode === "grid" && petTypeId && (
          <div className="no-print" style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div className="sub">
                Favorites float to the top. Click a card to open detail view.
              </div>
              <Button onClick={() => setViewMode("detail")} variant="ghost" style={{ fontWeight: 950 }}>
                Go to Detail View
              </Button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
              {sortedBreeds.map((b) => (
                <div
                  key={b.id}
                  className="card"
                  style={{
                    cursor: "pointer",
                    overflow: "hidden",
                    borderRadius: 18,
                    position: "relative",
                    background: theme.panelBg,
                  }}
                  onClick={() => {
                    setBreedId(b.id);
                    setViewMode("detail");
                  }}
                  title="Open"
                >
                  <div
                    style={{
                      height: 150,
                      background: darkMode
                        ? "linear-gradient(135deg, rgba(139,92,246,.22), rgba(34,197,94,.12))"
                        : "linear-gradient(135deg, rgba(91,33,182,.12), rgba(16,185,129,.10))",
                    }}
                  >
                    {b.image_url ? (
                      <img
                        src={imageSrcCache[b.image_url] || ""}
                        onLoad={async () => {
                          if (!imageSrcCache[b.image_url]) {
                            const resolved = await resolveImageSrc(b.image_url);
                            if (resolved) setImageSrcCache((p) => ({ ...p, [b.image_url]: resolved }));
                          }
                        }}
                        alt={b.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    ) : null}
                  </div>

                  <div style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div style={{ fontWeight: 950, letterSpacing: -0.2 }}>{b.name}</div>
                    <Button
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(b.id);
                      }}
                      style={{ padding: "8px 10px" }}
                      title={favorites.has(b.id) ? "Unfavorite" : "Favorite"}
                    >
                      {favorites.has(b.id) ? "⭐" : "☆"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ADMIN VIEW */}
        {viewMode === "admin" && isAdmin && (
          <div className="no-print" style={{ marginTop: 16 }}>
            <div className="detailGrid">
              {/* Breed editor */}
              <Panel>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div className="h2">Breed Editor</div>
                    <div className="sub">Create, edit, or delete breeds. Upload auto-crops to 16:9.</div>
                  </div>
                  <Button onClick={resetBreedForm} variant="primary">
                    + New Breed
                  </Button>
                </div>

                <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ gridColumn: "span 2" }}>
                    <FieldLabel>Pet Type</FieldLabel>
                    <SelectInput
                      value={breedForm.pet_type_id}
                      onChange={(e) => setBreedForm((p) => ({ ...p, pet_type_id: e.target.value }))}
                    >
                      <option value="">Choose a pet type</option>
                      {petTypes.map((pt) => (
                        <option key={pt.id} value={pt.id}>
                          {pt.name}
                        </option>
                      ))}
                    </SelectInput>
                  </div>

                  <div style={{ gridColumn: "span 2" }}>
                    <FieldLabel>Breed Name</FieldLabel>
                    <TextInput
                      value={breedForm.name}
                      onChange={(e) => setBreedForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="French Bulldog"
                    />
                  </div>

                  <div style={{ gridColumn: "span 2" }}>
                    <FieldLabel>Description</FieldLabel>
                    <TextArea
                      value={breedForm.description}
                      onChange={(e) => setBreedForm((p) => ({ ...p, description: e.target.value }))}
                      style={{ minHeight: 100, resize: "vertical", lineHeight: 1.55 }}
                      placeholder="Short, friendly description..."
                    />
                  </div>

                  <div>
                    <FieldLabel>Lifespan</FieldLabel>
                    <TextInput value={breedForm.lifespan} onChange={(e) => setBreedForm((p) => ({ ...p, lifespan: e.target.value }))} />
                  </div>

                  <div>
                    <FieldLabel>Group</FieldLabel>
                    <TextInput value={breedForm.group} onChange={(e) => setBreedForm((p) => ({ ...p, group: e.target.value }))} />
                  </div>

                  <div>
                    <FieldLabel>Origin</FieldLabel>
                    <TextInput value={breedForm.origin} onChange={(e) => setBreedForm((p) => ({ ...p, origin: e.target.value }))} />
                  </div>

                  <div>
                    <FieldLabel>Size</FieldLabel>
                    <TextInput value={breedForm.size} onChange={(e) => setBreedForm((p) => ({ ...p, size: e.target.value }))} />
                  </div>

                  <div style={{ gridColumn: "span 2" }}>
                    <FieldLabel>Height/Weight (optional alt field)</FieldLabel>
                    <TextInput
                      value={breedForm.height_weight}
                      onChange={(e) => setBreedForm((p) => ({ ...p, height_weight: e.target.value }))}
                      placeholder="11–13 inches, 20 lbs"
                    />
                  </div>

                  <div style={{ gridColumn: "span 2" }}>
                    <FieldLabel>Image URL (or uploaded storage ref)</FieldLabel>
                    <TextInput
                      value={breedForm.image_url}
                      onChange={(e) => setBreedForm((p) => ({ ...p, image_url: e.target.value }))}
                      placeholder="https://... or sb://breed-images/..."
                    />

                    <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <Button onClick={() => fileInputRef.current?.click()} variant="primary">
                        ⬆️ Upload (auto-crop)
                      </Button>

                      <div
                        ref={dropRef}
                        style={{
                          border: `1px dashed ${theme.panelBorder}`,
                          borderRadius: 12,
                          padding: "10px 12px",
                          color: theme.subtext,
                          flex: 1,
                          minWidth: 240,
                          background: darkMode ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.70)",
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
                  <Button onClick={saveBreed} disabled={breedSaving} variant="primary">
                    {breedSaving ? "Saving..." : "Save Breed"}
                  </Button>

                  <div className={breedSaveMsg.includes("Saved") ? "ok" : breedSaveMsg ? "danger" : "muted"}>
                    {breedSaveMsg}
                  </div>
                </div>

                <div className="divider" />
                <div className="sectionTitle">Tip</div>
                <div className="sub" style={{ marginTop: 8 }}>
                  Want to edit an existing breed? Go to Grid or Detail, pick one, then click “🛠️ Admin” and use “Load from selected” below.
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Button
                    variant="ghost"
                    disabled={!selectedBreed}
                    onClick={() => {
                      if (selectedBreed) loadBreedIntoForm(selectedBreed);
                      toast("Loaded selected breed ✅");
                    }}
                  >
                    ↩️ Load from selected
                  </Button>

                  <Button
                    variant="danger"
                    disabled={!selectedBreed}
                    onClick={() => selectedBreed && deleteBreed(selectedBreed)}
                    title="Deletes the currently selected breed"
                  >
                    🗑️ Delete selected
                  </Button>
                </div>
              </Panel>

              {/* Categories editor */}
              <Panel>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div className="h2">Care Categories</div>
                    <div className="sub">Icons + sort order control the care sheet layout.</div>
                  </div>
                  <Button onClick={resetCatForm} variant="primary">
                    + New Category
                  </Button>
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                  <div>
                    <FieldLabel>Name</FieldLabel>
                    <TextInput value={catForm.name} onChange={(e) => setCatForm((p) => ({ ...p, name: e.target.value }))} />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <FieldLabel>Icon</FieldLabel>
                      <TextInput value={catForm.icon} onChange={(e) => setCatForm((p) => ({ ...p, icon: e.target.value }))} />
                    </div>
                    <div>
                      <FieldLabel>Sort Order</FieldLabel>
                      <TextInput
                        type="number"
                        value={catForm.sort_order}
                        onChange={(e) => setCatForm((p) => ({ ...p, sort_order: e.target.value }))}
                      />
                    </div>
                  </div>

                  <Button onClick={saveCategory} disabled={catSaving} variant="primary">
                    {catSaving ? "Saving..." : "Save Category"}
                  </Button>

                  {catMsg && <div className={catMsg.includes("Saved") ? "ok" : "danger"}>{catMsg}</div>}
                </div>

                <div className="divider" />

                <div style={{ maxHeight: 360, overflowY: "auto", paddingRight: 6 }}>
                  {categories.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        border: `1px solid ${theme.panelBorder}`,
                        borderRadius: 14,
                        padding: 12,
                        marginBottom: 10,
                        background: darkMode ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.75)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                        <div style={{ fontWeight: 950 }}>
                          {c.icon ?? "📌"} {c.name}{" "}
                          <span className="muted" style={{ fontWeight: 800 }}>
                            (#{c.sort_order})
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <Button onClick={() => loadCatIntoForm(c)} variant="ghost" style={{ padding: "8px 10px" }} title="Edit">
                            ✏️
                          </Button>
                          <Button onClick={() => deleteCategory(c)} variant="danger" style={{ padding: "8px 10px" }} title="Delete">
                            🗑️
                          </Button>
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

            <div className="detailGrid" style={{ marginTop: 16 }}>
              {/* MAIN */}
              <div>
                <div className="heroWrap print-sheet">
                  {selectedBreed.image_url ? (
                    <img src={selectedImageSrc || ""} alt={selectedBreed.name} className="heroImg" />
                  ) : (
                    <div className="heroImg" />
                  )}

                  <div style={{ padding: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                      <div style={{ minWidth: 260 }}>
                        <div style={{ fontSize: 28, fontWeight: 950, letterSpacing: -0.4, color: theme.headerText }}>
                          {selectedBreed.name}
                        </div>
                        {selectedBreed.description && (
                          <div style={{ marginTop: 8, color: darkMode ? "rgba(255,255,255,.86)" : "rgba(255,255,255,.86)", lineHeight: 1.55 }}>
                            {selectedBreed.description}
                          </div>
                        )}
                      </div>

                      <div className="no-print" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <Button
                          onClick={() => toggleFavorite(selectedBreed.id)}
                          variant="ghost"
                          title={isFavorite ? "Unfavorite" : "Favorite"}
                        >
                          {isFavorite ? "⭐" : "☆"} Favorite
                        </Button>

                        <Button onClick={refreshCurrentBreed} variant="ghost">
                          🔄 Refresh
                        </Button>

                        <Button onClick={copyShareLink} variant="ghost">
                          🔗 Share
                        </Button>

                        <Button onClick={() => window.print()} variant="ghost">
                          🖨️ Print/PDF
                        </Button>

                        <Button onClick={brochurePdf} variant="primary">
                          📄 Brochure PDF
                        </Button>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
                      {selectedBreed.lifespan && (
                        <Chip>
                          🕰️ <b>Lifespan:</b> {selectedBreed.lifespan}
                        </Chip>
                      )}
                      {(selectedBreed.size || selectedBreed.height_weight) && (
                        <Chip>
                          📏 <b>Size:</b> {selectedBreed.size ?? selectedBreed.height_weight}
                        </Chip>
                      )}
                      {selectedBreed.group && (
                        <Chip>
                          🏷️ <b>Group:</b> {selectedBreed.group}
                        </Chip>
                      )}
                      {selectedBreed.origin && (
                        <Chip>
                          🌍 <b>Origin:</b> {selectedBreed.origin}
                        </Chip>
                      )}
                    </div>

                    <div className="no-print" style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <Button onClick={openAllCategories} variant="ghost">
                        Expand all
                      </Button>
                      <Button onClick={closeAllCategories} variant="ghost">
                        Collapse all
                      </Button>

                      {isAdmin && (
                        <>
                          <Button onClick={() => setEditMode((v) => !v)} variant="ghost" style={{ fontWeight: 950 }}>
                            {editMode ? "✏️ Edit ON" : "✏️ Edit OFF"}
                          </Button>

                          <Button onClick={() => setAutoSave((v) => !v)} variant="ghost" disabled={!editMode} style={{ fontWeight: 950 }}>
                            {autoSave ? "💾 Autosave ON" : "💾 Autosave OFF"}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* CARE CARDS */}
                <div className="print-sheet" style={{ marginTop: 14 }}>
                  {categories.map((cat) => {
                    const isOpen = openCategoryIds.has(cat.id);
                    const content = guidesByCategoryId[cat.id] ?? "";
                    const draft = draftsByCategoryId[cat.id] ?? content;
                    const isSaving = !!savingByCategoryId[cat.id];

                    const status = statusByCategoryId[cat.id]?.type ?? "idle";
                    const statusMsg = statusByCategoryId[cat.id]?.message ?? "";

                    const accent = darkMode ? "rgba(255,255,255,.12)" : "rgba(91,33,182,.18)";

                    return (
                      <Card
                        key={cat.id}
                        id={`cat-${cat.id}`}
                        accent={accent}
                        title={`${cat.icon ?? "📌"} ${cat.name}`}
                        right={
                          <div className="no-print" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span className="muted" style={{ fontSize: 12 }}>
                              {isOpen ? "Open" : "Closed"}
                            </span>
                            <Button
                              variant="ghost"
                              onClick={() => toggleCategory(cat.id)}
                              style={{ padding: "8px 10px", fontWeight: 950 }}
                              title={isOpen ? "Collapse" : "Expand"}
                            >
                              {isOpen ? "▲" : "▼"}
                            </Button>
                          </div>
                        }
                        style={{ marginTop: 12 }}
                      >
                        {/* print always shows */}
                        <div className="print-only" style={{ display: "none" }}>
                          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                            {content ? content : "No info added yet."}
                          </div>
                        </div>

                        {/* animated open/close */}
                        <div
                          className="no-print"
                          style={{
                            overflow: "hidden",
                            transition: "opacity .18s ease, transform .18s ease, max-height .22s ease",
                            opacity: isOpen ? 1 : 0,
                            transform: isOpen ? "translateY(0)" : "translateY(-6px)",
                            maxHeight: isOpen ? 1400 : 0,
                            pointerEvents: isOpen ? "auto" : "none",
                          }}
                        >
                          {!editMode && (
                            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }} className="muted">
                              {content ? content : <span style={{ opacity: 0.7 }}>No info added yet.</span>}
                            </div>
                          )}

                          {editMode && (
                            <>
                              <TextArea
                                value={draft}
                                onChange={(e) => onDraftChange(cat.id, e.target.value)}
                                onFocus={() => (lastFocusedCatIdRef.current = cat.id)}
                                placeholder="Type guide text here..."
                                style={{
                                  minHeight: 150,
                                  resize: "vertical",
                                  lineHeight: 1.6,
                                  marginTop: 8,
                                }}
                              />

                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                  <Button
                                    onClick={() => saveGuide(cat.id)}
                                    disabled={isSaving}
                                    variant="primary"
                                    style={{ padding: "10px 14px" }}
                                  >
                                    {isSaving ? "Saving..." : "Save"}
                                  </Button>

                                  <Button
                                    onClick={() => setDraftsByCategoryId((p) => ({ ...p, [cat.id]: content }))}
                                    disabled={isSaving}
                                    variant="ghost"
                                  >
                                    Revert
                                  </Button>
                                </div>

                                <div style={{ fontSize: 13 }}>
                                  {status === "saved" && <span className="ok">{statusMsg}</span>}
                                  {status === "error" && <span className="danger">{statusMsg}</span>}
                                </div>
                              </div>

                              <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                                {autoSave ? "Autosave is ON (debounced)." : "Autosave is OFF. Use Save or Ctrl/Cmd+S."}
                              </div>
                            </>
                          )}
                        </div>

                        {!isOpen && (
                          <div className="no-print muted" style={{ fontSize: 12, marginTop: 2 }}>
                            Click the arrow to expand.
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>

              {/* SIDEBAR */}
              <div className="no-print" style={{ position: "sticky", top: 84 }}>
                <Panel>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div>
                      <div className="h2">Quick Panel</div>
                      <div className="sub">Jump, expand, and manage faster.</div>
                    </div>
                    <span className="pill">{categories.length} sections</span>
                  </div>

                  <div className="divider" />

                  <div style={{ display: "grid", gap: 10 }}>
                    <Button onClick={openAllCategories} variant="ghost">
                      Expand all
                    </Button>
                    <Button onClick={closeAllCategories} variant="ghost">
                      Collapse all
                    </Button>
                    <Button onClick={copyShareLink} variant="ghost">
                      🔗 Copy share link
                    </Button>
                    <Button onClick={brochurePdf} variant="primary">
                      📄 Brochure PDF
                    </Button>
                  </div>

                  <div className="divider" />

                  <div className="sectionTitle">Jump to section</div>
                  <div style={{ marginTop: 10, display: "grid", gap: 8, maxHeight: 380, overflowY: "auto", paddingRight: 6 }}>
                    {categories.map((c) => (
                      <Button
                        key={c.id}
                        variant="ghost"
                        onClick={() => jumpTo(c.id)}
                        style={{ justifyContent: "flex-start" }}
                        title="Scroll to section"
                      >
                        {c.icon ?? "📌"} {c.name}
                      </Button>
                    ))}
                  </div>
                </Panel>
              </div>
            </div>
          </>
        )}

        {viewMode === "detail" && !selectedBreed && (
          <div className="no-print" style={{ marginTop: 16 }}>
            <Panel>
              <div className="h2">Pick a pet type and a breed</div>
              <div className="sub" style={{ marginTop: 8 }}>
                Your care sheet will appear here. Use Grid view if you want quicker browsing.
              </div>
            </Panel>
          </div>
        )}
      </div>

      {toastMsg ? <div className="toast">{toastMsg}</div> : null}
    </div>
  );
}

// =====================================================
// SMALL COMPONENTS + UTILS
// =====================================================
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
  }, [rawUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rawUrl) return null;

  return (
    <div style={{ marginTop: 10, borderRadius: 16, overflow: "hidden", border: `1px solid ${theme.panelBorder}` }}>
      {src ? (
        <img src={src} alt="Preview" style={{ width: "100%", height: 220, objectFit: "cover", display: "block" }} />
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