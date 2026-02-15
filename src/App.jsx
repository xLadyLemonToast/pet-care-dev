import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";

/**
 * ELITE UI (sleek glass + calmly colorful) ✅
 * Keeps your features:
 * - Supabase auth (magic link), admin-only edit/admin modes
 * - PetType/Breed browsing + share link params
 * - Favorites, grid + detail view
 * - Collapsible care cards + edit + autosave + Ctrl/Cmd+S save
 * - Breed editor CRUD + image upload (auto center-crop 16:9 + resize)
 * - Category editor CRUD
 * - Print/PDF + Brochure PDF export window
 *
 * Big visual upgrades:
 * - True glassmorphism UI with calm gradients + soft noise
 * - Custom combobox dropdowns (no ugly native <select>)
 * - Proper modal login (no browser prompt)
 * - Buttons/inputs: consistent, modern, tactile
 */

export default function App() {
  // ----------------------------
  // AUTH
  // =====================================================
  const [user, setUser] = useState(null);

  useEffect(() => {
  let mounted = true;

  async function loadSession() {
    const { data } = await supabase.auth.getSession();

    if (!mounted) return;

    setUser(data.session?.user ?? null);
  }

  loadSession();

  const { data: listener } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      setUser(session?.user ?? null);
    }
  );

  return () => {
    mounted = false;
    listener.subscription.unsubscribe();
  };
}, []);

  // Login modal
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginMsg, setLoginMsg] = useState("");

  async function loginWithMagicLink() {
    const email = loginEmail.trim();
    if (!email) return setLoginMsg("Enter your admin email.");
    setLoginBusy(true);
    setLoginMsg("");
    const { error } = await supabase.auth.signInWithOtp({ email });
    setLoginBusy(false);
    if (error) setLoginMsg(error.message);
    else setLoginMsg("Magic link sent. Check your email ✨");
  }

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

  // UX
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
      const v = localStorage.getItem("zoo_darkMode");
      return v ? v === "1" : true;
    } catch {
      return true;
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

  // Tiny toast
  const [toastText, setToastText] = useState("");
  const toastTimerRef = useRef(null);
  function toast(msg) {
    setToastText(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastText(""), 1600);
  }

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
  }, [isAdmin]); // eslint-disable-line

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
    const qs = params.toString();
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
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
    const { data, error } = await supabase.from("care_guides").select("category_id,content").eq("breed_id", bid);
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
    toast("Refreshed 🔄");
  }

  // ----------------------------
  // IMAGE RESOLUTION (public url or sb:// ref)
  // ----------------------------
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
  }, [selectedBreed?.image_url, isAdmin]); // eslint-disable-line

  // ----------------------------
  // THEME (glass + calm color)
  // ----------------------------
  const theme = useMemo(() => {
    if (!darkMode) {
      return {
        mode: "light",
        bg0: "#f6f7fb",
        bg1: "#ffffff",
        text: "#0b1220",
        subtext: "rgba(11,18,32,.70)",
        border: "rgba(11,18,32,.12)",
        glass: "rgba(255,255,255,.65)",
        glass2: "rgba(255,255,255,.45)",
        shadow: "0 18px 60px rgba(12,18,38,.10)",
        shadow2: "0 10px 30px rgba(12,18,38,.10)",
        ring: "rgba(122,162,255,.50)",
        chip: "rgba(255,255,255,.65)",
      };
    }
    return {
      mode: "dark",
      bg0: "#070A12",
      bg1: "#0B1020",
      text: "rgba(255,255,255,.92)",
      subtext: "rgba(255,255,255,.68)",
      border: "rgba(255,255,255,.12)",
      glass: "rgba(16,22,44,.55)",
      glass2: "rgba(16,22,44,.35)",
      shadow: "0 22px 70px rgba(0,0,0,.45)",
      shadow2: "0 12px 34px rgba(0,0,0,.35)",
      ring: "rgba(130,170,255,.45)",
      chip: "rgba(255,255,255,.08)",
    };
  }, [darkMode]);

  const calmGradients = useMemo(() => {
    // calm, low-saturation accents
    return darkMode
      ? {
          a: "radial-gradient(700px 340px at 18% 12%, rgba(102,179,255,.18), transparent 70%)",
          b: "radial-gradient(720px 360px at 86% 18%, rgba(180,120,255,.14), transparent 72%)",
          c: "radial-gradient(740px 420px at 60% 92%, rgba(120,255,196,.10), transparent 70%)",
        }
      : {
          a: "radial-gradient(700px 360px at 16% 14%, rgba(102,179,255,.22), transparent 70%)",
          b: "radial-gradient(720px 380px at 86% 16%, rgba(180,120,255,.16), transparent 72%)",
          c: "radial-gradient(760px 420px at 56% 92%, rgba(120,255,196,.14), transparent 70%)",
        };
  }, [darkMode]);

  // Per-category tone (used mainly in light mode, but subtle)
  const cardTone = useMemo(() => {
    const tones = {
      "Height & Weight": { tint: "rgba(102,179,255,.14)", border: "rgba(102,179,255,.28)" },
      Lifespan: { tint: "rgba(122,162,255,.12)", border: "rgba(122,162,255,.26)" },
      Size: { tint: "rgba(180,180,200,.12)", border: "rgba(180,180,200,.24)" },
      "Care Instructions": { tint: "rgba(120,255,196,.12)", border: "rgba(120,255,196,.26)" },
      "Dietary Needs": { tint: "rgba(255,191,102,.14)", border: "rgba(255,191,102,.28)" },
      "Exercise Needs": { tint: "rgba(180,120,255,.12)", border: "rgba(180,120,255,.26)" },
      "Grooming Needs": { tint: "rgba(255,120,180,.12)", border: "rgba(255,120,180,.26)" },
      "Health Concerns": { tint: "rgba(255,120,120,.12)", border: "rgba(255,120,120,.26)" },
    };
    return (name) => tones[name] ?? { tint: "rgba(255,255,255,.06)", border: "rgba(255,255,255,.14)" };
  }, []);

  // ----------------------------
  // SEARCH + FAVORITES + GRID
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
      setStatusByCategoryId((p) => ({ ...p, [categoryId]: { type: "error", message: error.message } }));
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
  }, [isAdmin, editMode, breedId, draftsByCategoryId]); // eslint-disable-line

  // ----------------------------
  // BROCHURE PDF EXPORT (new window HTML -> print)
  // ----------------------------
  async function brochurePdf() {
    if (!selectedBreed) return;

    const hero = selectedBreed.image_url ? await resolveImageSrc(selectedBreed.image_url) : "";

    const sections = categories.map((cat) => {
      const body = guidesByCategoryId[cat.id] ?? "";
      return { title: cat.name, icon: cat.icon ?? "📌", body: body || "No info added yet." };
    });

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(selectedBreed.name)} Care Sheet</title>
  <style>
    *{ box-sizing:border-box; }
    body{ font-family: system-ui, Segoe UI, Arial; margin:0; background:#fff; color:#111; }
    .wrap{ max-width: 920px; margin: 0 auto; padding: 28px; }
    .hero{ border-radius: 22px; overflow:hidden; border:1px solid #e6e6e6; }
    .heroImg{ width:100%; height: 320px; object-fit:cover; display:block; }
    .heroInner{ padding: 20px 22px; }
    h1{ margin:0; font-size: 34px; letter-spacing:-0.4px; }
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
  }, [dropRef.current, isAdmin]); // eslint-disable-line

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

  // ----------------------------
  // PRINT CSS
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
  // UI helpers (elite)
  // ----------------------------
  const ui = useMemo(() => createUi(theme), [theme]);

  // Custom combobox items
  const petTypeItems = useMemo(
    () => petTypes.map((pt) => ({ value: pt.id, label: pt.name })),
    [petTypes]
  );

  const breedItems = useMemo(
    () =>
      sortedBreeds.map((b) => ({
        value: b.id,
        label: `${favorites.has(b.id) ? "⭐ " : ""}${b.name}`,
        meta: b,
      })),
    [sortedBreeds, favorites]
  );

  const selectedImageSrc = selectedBreed?.image_url ? imageSrcCache[selectedBreed.image_url] : "";

  // ----------------------------
  // RENDER
  // ----------------------------
  return (
    <div
      style={{
        minHeight: "100vh",
        color: theme.text,
        fontFamily: "system-ui, Segoe UI, Arial",
        position: "relative",
        background: theme.bg0,
        overflowX: "hidden",
      }}
    >
      <style>{printCss}</style>

      {/* Calm gradient fields */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background: `${calmGradients.a}, ${calmGradients.b}, ${calmGradients.c}, linear-gradient(180deg, ${theme.bg0}, ${theme.bg1})`,
        }}
      />
      {/* Soft noise */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          opacity: darkMode ? 0.16 : 0.12,
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E\")",
          mixBlendMode: darkMode ? "overlay" : "multiply",
        }}
      />

      {/* Toast */}
      <div
        className="no-print"
        style={{
          position: "fixed",
          left: "50%",
          top: 18,
          transform: "translateX(-50%)",
          zIndex: 50,
          transition: "opacity .18s ease, transform .18s ease",
          opacity: toastText ? 1 : 0,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 999,
            background: theme.glass,
            border: `1px solid ${theme.border}`,
            backdropFilter: "blur(14px)",
            boxShadow: theme.shadow2,
            color: theme.text,
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          {toastText}
        </div>
      </div>

      {/* Page */}
      <div style={{ position: "relative", zIndex: 1, padding: 34 }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          {/* HEADER */}
          <div className="no-print" style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <div>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <h1 style={{ margin: 0, fontSize: 48, letterSpacing: -0.9, lineHeight: 1.02 }}>Zoo Database</h1>
                <div style={{ fontSize: 18, opacity: 0.9 }}>🐾</div>
              </div>
              <div style={{ marginTop: 8, color: theme.subtext, fontSize: 14 }}>
                {isAdmin ? "Admin session active. Database is locked to you." : "Browse mode. Log in to edit/add content."}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button onClick={() => setDarkMode((d) => !d)} style={ui.btn()}>
                {darkMode ? "🌙 Dark" : "☀️ Light"}
              </button>

              <Segment
                value={viewMode}
                onChange={(v) => setViewMode(v)}
                options={[
                  { value: "detail", label: "🧾 Detail" },
                  { value: "grid", label: "🧩 Grid", disabled: !petTypeId, title: !petTypeId ? "Pick a Pet Type first" : "" },
                  ...(isAdmin ? [{ value: "admin", label: "🛠️ Admin" }] : []),
                ]}
                ui={ui}
              />

              {!isAdmin ? (
                <button
                  onClick={() => {
                    setLoginOpen(true);
                    setLoginMsg("");
                    setLoginEmail("");
                  }}
                  style={ui.btn({ weight: 900, glow: true })}
                >
                  Admin Login
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setEditMode((v) => !v)}
                    style={ui.btn({ weight: 900, tone: editMode ? "good" : "neutral" })}
                  >
                    {editMode ? "✏️ Edit: ON" : "✏️ Edit: OFF"}
                  </button>

                  <button
                    onClick={() => setAutoSave((v) => !v)}
                    style={ui.btn({ weight: 900, tone: autoSave ? "info" : "neutral" })}
                    disabled={!editMode}
                    title="Autosave (debounced)"
                  >
                    {autoSave ? "💾 Autosave: ON" : "💾 Autosave: OFF"}
                  </button>

                  <button onClick={logout} style={ui.btn()}>
                    Logout
                  </button>
                </>
              )}
            </div>
          </div>

          {/* TOP CONTROLS */}
          <div className="no-print" style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <GlassCard ui={ui}>
              <div style={ui.hLabel()}>Pet Type</div>
              <ComboBox
                ui={ui}
                value={petTypeId}
                placeholder="Choose a pet type"
                items={petTypeItems}
                onChange={(v) => {
                  setPetTypeId(v);
                  setBreedId("");
                  setSelectedBreed(null);
                }}
              />

              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button onClick={copyShareLink} style={ui.btn({ weight: 900 })}>
                  🔗 Share Link
                </button>

                {selectedBreed && (
                  <>
                    <button onClick={() => window.print()} style={ui.btn({ weight: 900 })}>
                      🖨️ Print/PDF
                    </button>
                    <button onClick={brochurePdf} style={ui.btn({ weight: 900 })}>
                      📄 Brochure PDF
                    </button>
                  </>
                )}
              </div>
            </GlassCard>

            <GlassCard ui={ui}>
              <div style={ui.hLabel()}>Breed</div>

              <input
                value={breedSearch}
                onChange={(e) => setBreedSearch(e.target.value)}
                disabled={!petTypeId}
                placeholder={petTypeId ? "Search breeds..." : "Select type first"}
                style={ui.input({ marginBottom: 10 })}
              />

              <ComboBox
                ui={ui}
                value={breedId}
                placeholder={petTypeId ? "Choose a breed" : "Select type first"}
                items={breedItems}
                disabled={!petTypeId}
                onChange={(v) => setBreedId(v)}
              />
            </GlassCard>
          </div>

          {/* GRID VIEW */}
          {viewMode === "grid" && petTypeId && (
            <div className="no-print" style={{ marginTop: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ color: theme.subtext }}>
                  Showing <b>{sortedBreeds.length}</b> breed(s)
                </div>
                <button onClick={() => setViewMode("detail")} style={ui.btn({ weight: 900 })}>
                  Go to Detail View
                </button>
              </div>

              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14 }}>
                {sortedBreeds.map((b) => (
                  <GridCard
                    key={b.id}
                    ui={ui}
                    theme={theme}
                    darkMode={darkMode}
                    breed={b}
                    isFav={favorites.has(b.id)}
                    imgSrc={imageSrcCache[b.image_url] || ""}
                    onClick={async () => {
                      setBreedId(b.id);
                      setViewMode("detail");
                      if (b.image_url && !imageSrcCache[b.image_url]) {
                        const resolved = await resolveImageSrc(b.image_url);
                        if (resolved) setImageSrcCache((p) => ({ ...p, [b.image_url]: resolved }));
                      }
                    }}
                    onToggleFav={(e) => {
                      e.stopPropagation();
                      toggleFavorite(b.id);
                    }}
                    onNeedResolve={async () => {
                      if (b.image_url && !imageSrcCache[b.image_url]) {
                        const resolved = await resolveImageSrc(b.image_url);
                        if (resolved) setImageSrcCache((p) => ({ ...p, [b.image_url]: resolved }));
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ADMIN VIEW */}
          {viewMode === "admin" && isAdmin && (
            <div className="no-print" style={{ marginTop: 18 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
                {/* Breed editor */}
                <GlassCard ui={ui}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div style={{ fontWeight: 950, fontSize: 16 }}>Breed Editor</div>
                    <button onClick={resetBreedForm} style={ui.btn({ weight: 900 })}>
                      + New Breed
                    </button>
                  </div>

                  <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div style={{ gridColumn: "span 2" }}>
                      <div style={ui.label()}>Pet Type</div>
                      <ComboBox
                        ui={ui}
                        value={breedForm.pet_type_id}
                        placeholder="Choose a pet type"
                        items={petTypeItems}
                        onChange={(v) => setBreedForm((p) => ({ ...p, pet_type_id: v }))}
                      />
                    </div>

                    <div style={{ gridColumn: "span 2" }}>
                      <div style={ui.label()}>Breed Name</div>
                      <input
                        value={breedForm.name}
                        onChange={(e) => setBreedForm((p) => ({ ...p, name: e.target.value }))}
                        style={ui.input()}
                        placeholder="French Bulldog"
                      />
                    </div>

                    <div style={{ gridColumn: "span 2" }}>
                      <div style={ui.label()}>Description</div>
                      <textarea
                        value={breedForm.description}
                        onChange={(e) => setBreedForm((p) => ({ ...p, description: e.target.value }))}
                        style={ui.textarea({ minHeight: 110 })}
                        placeholder="Short, friendly description..."
                      />
                    </div>

                    <div>
                      <div style={ui.label()}>Lifespan</div>
                      <input value={breedForm.lifespan} onChange={(e) => setBreedForm((p) => ({ ...p, lifespan: e.target.value }))} style={ui.input()} />
                    </div>

                    <div>
                      <div style={ui.label()}>Group</div>
                      <input value={breedForm.group} onChange={(e) => setBreedForm((p) => ({ ...p, group: e.target.value }))} style={ui.input()} />
                    </div>

                    <div>
                      <div style={ui.label()}>Origin</div>
                      <input value={breedForm.origin} onChange={(e) => setBreedForm((p) => ({ ...p, origin: e.target.value }))} style={ui.input()} />
                    </div>

                    <div>
                      <div style={ui.label()}>Size</div>
                      <input value={breedForm.size} onChange={(e) => setBreedForm((p) => ({ ...p, size: e.target.value }))} style={ui.input()} />
                    </div>

                    <div style={{ gridColumn: "span 2" }}>
                      <div style={ui.label()}>Height/Weight (optional alt field)</div>
                      <input
                        value={breedForm.height_weight}
                        onChange={(e) => setBreedForm((p) => ({ ...p, height_weight: e.target.value }))}
                        style={ui.input()}
                        placeholder="11–13 inches, 20 lbs"
                      />
                    </div>

                    <div style={{ gridColumn: "span 2" }}>
                      <div style={ui.label()}>Image URL (or uploaded storage ref)</div>
                      <input
                        value={breedForm.image_url}
                        onChange={(e) => setBreedForm((p) => ({ ...p, image_url: e.target.value }))}
                        style={ui.input()}
                        placeholder="https://... or sb://breed-images/..."
                      />

                      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button onClick={() => fileInputRef.current?.click()} style={ui.btn({ weight: 900 })}>
                          ⬆️ Upload (auto-crop)
                        </button>

                        <div
                          ref={dropRef}
                          style={{
                            ...ui.dropzone(),
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
                        <BreedImagePreview rawUrl={breedForm.image_url} resolveImageSrc={resolveImageSrc} ui={ui} theme={theme} />
                      )}
                    </div>
                  </div>

                  <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <button onClick={saveBreed} disabled={breedSaving} style={ui.btn({ weight: 900, disabled: breedSaving, glow: true })}>
                      {breedSaving ? "Saving..." : "Save Breed"}
                    </button>

                    <div style={ui.msg(breedSaveMsg)}>{breedSaveMsg}</div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 900, marginBottom: 10 }}>Quick load</div>
                    <div style={{ display: "grid", gap: 8, maxHeight: 220, overflowY: "auto", paddingRight: 6 }}>
                      {sortedBreeds.slice(0, 30).map((b) => (
                        <div key={b.id} style={ui.row()}>
                          <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => loadBreedIntoForm(b)} style={ui.iconBtn()} title="Load into editor">
                              ✏️
                            </button>
                            <button onClick={() => deleteBreed(b)} style={ui.iconBtn()} title="Delete breed">
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
                      {!sortedBreeds.length && <div style={{ color: theme.subtext }}>Pick a pet type to load breeds.</div>}
                    </div>
                  </div>
                </GlassCard>

                {/* Categories editor */}
                <GlassCard ui={ui}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div style={{ fontWeight: 950, fontSize: 16 }}>Care Categories</div>
                    <button onClick={resetCatForm} style={ui.btn({ weight: 900 })}>
                      + New Category
                    </button>
                  </div>

                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    <div>
                      <div style={ui.label()}>Name</div>
                      <input value={catForm.name} onChange={(e) => setCatForm((p) => ({ ...p, name: e.target.value }))} style={ui.input()} />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <div style={ui.label()}>Icon</div>
                        <input value={catForm.icon} onChange={(e) => setCatForm((p) => ({ ...p, icon: e.target.value }))} style={ui.input()} />
                      </div>
                      <div>
                        <div style={ui.label()}>Sort Order</div>
                        <input
                          type="number"
                          value={catForm.sort_order}
                          onChange={(e) => setCatForm((p) => ({ ...p, sort_order: e.target.value }))}
                          style={ui.input()}
                        />
                      </div>
                    </div>

                    <button onClick={saveCategory} disabled={catSaving} style={ui.btn({ weight: 900, disabled: catSaving, glow: true })}>
                      {catSaving ? "Saving..." : "Save Category"}
                    </button>

                    {catMsg && <div style={ui.msg(catMsg)}>{catMsg}</div>}
                  </div>

                  <div style={{ marginTop: 14, maxHeight: 340, overflowY: "auto", paddingRight: 6 }}>
                    {categories.map((c) => (
                      <div key={c.id} style={{ ...ui.softCard(), marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                          <div style={{ fontWeight: 900 }}>
                            {c.icon ?? "📌"} {c.name}{" "}
                            <span style={{ color: theme.subtext, fontWeight: 700 }}> (#{c.sort_order})</span>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => loadCatIntoForm(c)} style={ui.iconBtn()} title="Edit">
                              ✏️
                            </button>
                            <button onClick={() => deleteCategory(c)} style={ui.iconBtn()} title="Delete">
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassCard>
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
                  borderRadius: 24,
                  overflow: "hidden",
                  boxShadow: theme.shadow,
                  border: `1px solid ${theme.border}`,
                  background: theme.glass,
                  backdropFilter: "blur(16px)",
                }}
              >
                {selectedBreed.image_url && (
                  <div style={{ position: "relative" }}>
                    <img
                      src={selectedImageSrc || ""}
                      alt={selectedBreed.name}
                      style={{ width: "100%", height: 300, objectFit: "cover", display: "block" }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background:
                          "linear-gradient(180deg, rgba(0,0,0,.10), rgba(0,0,0,.0) 40%, rgba(0,0,0,.35))",
                      }}
                    />
                  </div>
                )}

                <div style={{ padding: 22 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: 30, letterSpacing: -0.4 }}>{selectedBreed.name}</h2>
                      {selectedBreed.description && <div style={{ marginTop: 8, color: theme.subtext, lineHeight: 1.55 }}>{selectedBreed.description}</div>}
                    </div>

                    <div className="no-print" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <button
                        onClick={() => toggleFavorite(selectedBreed.id)}
                        style={ui.btn({ icon: true, glow: isFavorite })}
                        title={isFavorite ? "Unfavorite" : "Favorite"}
                      >
                        {isFavorite ? "⭐" : "☆"}
                      </button>

                      <button onClick={refreshCurrentBreed} style={ui.btn({ weight: 900 })}>
                        🔄 Refresh
                      </button>

                      <button onClick={copyShareLink} style={ui.btn({ weight: 900 })}>
                        🔗 Share
                      </button>

                      <button onClick={() => window.print()} style={ui.btn({ weight: 900 })}>
                        🖨️ Print/PDF
                      </button>

                      <button onClick={brochurePdf} style={ui.btn({ weight: 900 })}>
                        📄 Brochure PDF
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
                    {selectedBreed.lifespan && <Chip ui={ui}>🕰️ <b>Lifespan:</b> {selectedBreed.lifespan}</Chip>}
                    {(selectedBreed.size || selectedBreed.height_weight) && (
                      <Chip ui={ui}>📏 <b>Size:</b> {selectedBreed.size ?? selectedBreed.height_weight}</Chip>
                    )}
                    {selectedBreed.group && <Chip ui={ui}>🏷️ <b>Group:</b> {selectedBreed.group}</Chip>}
                    {selectedBreed.origin && <Chip ui={ui}>🌍 <b>Origin:</b> {selectedBreed.origin}</Chip>}
                  </div>

                  <div className="no-print" style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button onClick={openAllCategories} style={ui.btn()}>
                      Expand all
                    </button>
                    <button onClick={closeAllCategories} style={ui.btn()}>
                      Collapse all
                    </button>

                    {isAdmin && (
                      <>
                        <button onClick={() => setEditMode((v) => !v)} style={ui.btn({ weight: 900, tone: editMode ? "good" : "neutral" })}>
                          {editMode ? "✏️ Edit ON" : "✏️ Edit OFF"}
                        </button>

                        <button onClick={() => setAutoSave((v) => !v)} style={ui.btn({ weight: 900, tone: autoSave ? "info" : "neutral" })} disabled={!editMode}>
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
                        borderRadius: 18,
                        overflow: "hidden",
                        border: `1px solid ${theme.border}`,
                        background: darkMode
                          ? theme.glass
                          : `linear-gradient(180deg, ${theme.glass}, ${theme.glass2})`,
                        boxShadow: theme.shadow2,
                        backdropFilter: "blur(14px)",
                        position: "relative",
                      }}
                    >
                      {/* subtle tint */}
                      <div
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          inset: 0,
                          pointerEvents: "none",
                          background: tone.tint,
                          opacity: darkMode ? 0.22 : 0.60,
                        }}
                      />

                      <button
                        className="no-print"
                        onClick={() => toggleCategory(cat.id)}
                        style={{
                          position: "relative",
                          zIndex: 1,
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
                          <div style={{ fontWeight: 950, fontSize: 16 }}>{cat.name}</div>
                        </div>
                        <div style={{ opacity: 0.8, fontSize: 14 }}>{isOpen ? "▲" : "▼"}</div>
                      </button>

                      <div className="print-only" style={{ display: "none", padding: "0 16px 16px 16px", position: "relative", zIndex: 1 }}>
                        <div style={{ fontWeight: 900 }}>{cat.name}</div>
                        <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{content ? content : "No info added yet."}</div>
                      </div>

                      <div className="no-print" style={{ position: "relative", zIndex: 1, maxHeight: isOpen ? 1600 : 0, transition: "max-height .25s ease", overflow: "hidden" }}>
                        <div style={{ padding: "0 16px 16px 16px" }}>
                          {!editMode && (
                            <div style={{ lineHeight: 1.65, whiteSpace: "pre-wrap", color: theme.subtext }}>
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
                                style={ui.textarea({ minHeight: 150, lineHeight: 1.6 })}
                              />

                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                  <button
                                    onClick={() => saveGuide(cat.id)}
                                    disabled={isSaving}
                                    style={ui.btn({ weight: 900, disabled: isSaving, glow: true })}
                                  >
                                    {isSaving ? "Saving..." : "Save"}
                                  </button>

                                  <button
                                    onClick={() => setDraftsByCategoryId((p) => ({ ...p, [cat.id]: content }))}
                                    disabled={isSaving}
                                    style={ui.btn({ disabled: isSaving })}
                                    title="Revert to saved text"
                                  >
                                    Revert
                                  </button>
                                </div>

                                <div style={{ fontSize: 13 }}>
                                  {status === "saved" && <span style={ui.badge("good")}>{statusMsg}</span>}
                                  {status === "error" && <span style={ui.badge("bad")}>{statusMsg}</span>}
                                </div>
                              </div>

                              <div style={{ marginTop: 8, fontSize: 12, color: theme.subtext, opacity: 0.95 }}>
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

      {/* Login Modal */}
      {loginOpen && (
        <Modal
          title="Admin Login"
          subtitle="Magic link login (Supabase)"
          onClose={() => setLoginOpen(false)}
          ui={ui}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <input
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder="you@company.com"
              style={ui.input()}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") loginWithMagicLink();
              }}
            />
            <button onClick={loginWithMagicLink} disabled={loginBusy} style={ui.btn({ weight: 900, disabled: loginBusy, glow: true })}>
              {loginBusy ? "Sending..." : "Send Magic Link"}
            </button>
            {loginMsg && <div style={ui.msg(loginMsg)}>{loginMsg}</div>}
            <div style={{ color: theme.subtext, fontSize: 12, lineHeight: 1.4 }}>
              If the link opens but does not log you in, check the Supabase Auth redirect URL settings and your site URL.
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ----------------------------
   UI FACTORY
---------------------------- */
function createUi(theme) {
  const baseBtn = {
    borderRadius: 999,
    padding: "10px 14px",
    border: `1px solid ${theme.border}`,
    background: theme.glass,
    color: theme.text,
    cursor: "pointer",
    fontWeight: 800,
    letterSpacing: -0.1,
    boxShadow: theme.shadow2,
    backdropFilter: "blur(14px)",
    transition: "transform .12s ease, box-shadow .12s ease, border-color .12s ease, background .12s ease",
  };

  function toneBorder(tone) {
    if (tone === "good") return "rgba(120,255,196,.36)";
    if (tone === "bad") return "rgba(255,120,120,.36)";
    if (tone === "info") return "rgba(102,179,255,.38)";
    return theme.border;
  }

  return {
    btn: (opts = {}) => {
      const { weight = 800, glow = false, disabled = false, tone = "neutral", icon = false } = opts;
      return {
        ...baseBtn,
        fontWeight: weight,
        opacity: disabled ? 0.65 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        padding: icon ? "10px 12px" : baseBtn.padding,
        borderColor: glow ? "rgba(130,170,255,.45)" : toneBorder(tone),
        boxShadow: glow ? "0 16px 40px rgba(122,162,255,.18)" : theme.shadow2,
      };
    },
    iconBtn: () => ({
      ...baseBtn,
      padding: "9px 11px",
      fontSize: 13,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 38,
      boxShadow: "none",
      background: theme.glass2,
    }),
    input: (extra = {}) => ({
      width: "100%",
      padding: "12px 12px",
      borderRadius: 14,
      border: `1px solid ${theme.border}`,
      background: theme.glass2,
      color: theme.text,
      outline: "none",
      boxShadow: "none",
      backdropFilter: "blur(12px)",
      transition: "border-color .12s ease, box-shadow .12s ease",
      ...extra,
    }),
    textarea: (extra = {}) => ({
      width: "100%",
      padding: "12px 12px",
      borderRadius: 14,
      border: `1px solid ${theme.border}`,
      background: theme.glass2,
      color: theme.text,
      outline: "none",
      resize: "vertical",
      boxShadow: "none",
      backdropFilter: "blur(12px)",
      ...extra,
    }),
    label: () => ({ fontWeight: 900, marginBottom: 8, fontSize: 13, color: theme.subtext }),
    hLabel: () => ({ fontWeight: 950, fontSize: 14, marginBottom: 10, color: theme.text, letterSpacing: -0.2 }),
    softCard: () => ({
      border: `1px solid ${theme.border}`,
      background: theme.glass2,
      borderRadius: 16,
      padding: 12,
      backdropFilter: "blur(12px)",
    }),
    row: () => ({
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
      padding: "10px 12px",
      borderRadius: 14,
      border: `1px solid ${theme.border}`,
      background: theme.glass2,
      backdropFilter: "blur(12px)",
    }),
    dropzone: () => ({
      border: `1px dashed ${theme.border}`,
      borderRadius: 14,
      padding: "10px 12px",
      color: theme.subtext,
      background: theme.glass2,
      backdropFilter: "blur(12px)",
    }),
    msg: (text) => ({
      color: text?.includes("Saved") ? "rgba(120,255,196,.92)" : text ? "rgba(255,120,120,.92)" : "transparent",
      fontWeight: 900,
      minHeight: 20,
      alignSelf: "center",
    }),
    badge: (tone) => ({
      padding: "6px 10px",
      borderRadius: 999,
      border: `1px solid ${
        tone === "good" ? "rgba(120,255,196,.35)" : tone === "bad" ? "rgba(255,120,120,.35)" : theme.border
      }`,
      background: theme.glass2,
      fontWeight: 900,
      color: theme.text,
      backdropFilter: "blur(12px)",
    }),
  };
}

/* ----------------------------
   COMPONENTS
---------------------------- */
function GlassCard({ children, ui }) {
  return (
    <div
      style={{
        borderRadius: 20,
        padding: 16,
        border: `1px solid rgba(255,255,255,.10)`,
        background: "rgba(255,255,255,.04)",
        boxShadow: "0 18px 60px rgba(0,0,0,.18)",
        backdropFilter: "blur(16px)",
      }}
    >
      {/* inner for crisp border */}
      <div style={{ borderRadius: 16, border: `1px solid rgba(255,255,255,.10)`, background: "rgba(255,255,255,.02)", padding: 14 }}>
        {children}
      </div>
    </div>
  );
}

function Chip({ children, ui }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "9px 11px",
        borderRadius: 999,
        background: "rgba(255,255,255,.06)",
        border: "1px solid rgba(255,255,255,.12)",
        fontSize: 13,
        boxShadow: "0 10px 26px rgba(0,0,0,.10)",
        backdropFilter: "blur(12px)",
      }}
    >
      {children}
    </span>
  );
}

function Segment({ value, onChange, options, ui }) {
  return (
    <div
      style={{
        display: "inline-flex",
        padding: 6,
        borderRadius: 999,
        border: `1px solid rgba(255,255,255,.12)`,
        background: "rgba(255,255,255,.05)",
        backdropFilter: "blur(14px)",
        boxShadow: "0 12px 32px rgba(0,0,0,.16)",
        gap: 6,
      }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => !o.disabled && onChange(o.value)}
          disabled={o.disabled}
          title={o.title || ""}
          style={{
            ...ui.btn({
              weight: value === o.value ? 950 : 850,
              disabled: !!o.disabled,
              glow: value === o.value,
            }),
            padding: "9px 12px",
            boxShadow: "none",
            background: value === o.value ? "rgba(122,162,255,.14)" : "rgba(255,255,255,.05)",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function GridCard({ ui, theme, darkMode, breed, isFav, imgSrc, onClick, onToggleFav, onNeedResolve }) {
  return (
    <div
      onClick={onClick}
      title="Open"
      style={{
        borderRadius: 20,
        overflow: "hidden",
        border: `1px solid ${theme.border}`,
        background: "rgba(255,255,255,.04)",
        boxShadow: theme.shadow2,
        cursor: "pointer",
        backdropFilter: "blur(14px)",
        transition: "transform .12s ease, box-shadow .12s ease",
      }}
      onMouseEnter={onNeedResolve}
    >
      <div style={{ height: 150, background: darkMode ? "rgba(0,0,0,.22)" : "rgba(255,255,255,.35)" }}>
        {breed.image_url ? (
          <img
            src={imgSrc || ""}
            alt={breed.name}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{ padding: 14, color: theme.subtext }}>No image</div>
        )}
      </div>

      <div style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 950, letterSpacing: -0.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {breed.name}
        </div>
        <button
          onClick={onToggleFav}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontSize: 18,
            color: theme.text,
            padding: 8,
            borderRadius: 12,
          }}
          title={isFav ? "Unfavorite" : "Favorite"}
        >
          {isFav ? "⭐" : "☆"}
        </button>
      </div>
    </div>
  );
}

function Modal({ title, subtitle, children, onClose, ui }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(0,0,0,.55)",
        display: "grid",
        placeItems: "center",
        padding: 18,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 100%)",
          borderRadius: 22,
          border: "1px solid rgba(255,255,255,.14)",
          background: "rgba(18,22,44,.70)",
          boxShadow: "0 30px 90px rgba(0,0,0,.50)",
          backdropFilter: "blur(18px)",
          padding: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 950, fontSize: 18 }}>{title}</div>
            {subtitle && <div style={{ marginTop: 6, opacity: 0.85, fontSize: 13 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={ui.btn({ icon: true })} title="Close">
            ✕
          </button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

/**
 * ComboBox: custom dropdown so your selects are not ugly.
 * - Click to open
 * - Type to filter
 * - ESC closes
 */
function ComboBox({ ui, value, onChange, items, placeholder = "Select...", disabled = false }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef(null);

  const selectedLabel = useMemo(() => {
    const found = items.find((x) => x.value === value);
    return found?.label ?? "";
  }, [items, value]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((x) => (x.label ?? "").toLowerCase().includes(t));
  }, [items, q]);

  useEffect(() => {
    function onDoc(e) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(v) {
    onChange(v);
    setOpen(false);
    setQ("");
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        style={{
          ...ui.input(),
          textAlign: "left",
          cursor: disabled ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <span style={{ opacity: selectedLabel ? 1 : 0.72 }}>
          {selectedLabel || placeholder}
        </span>
        <span style={{ opacity: 0.75 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && !disabled && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "calc(100% + 8px)",
            zIndex: 30,
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,.14)",
            background: "rgba(16,22,44,.72)",
            boxShadow: "0 22px 60px rgba(0,0,0,.45)",
            backdropFilter: "blur(16px)",
            overflow: "hidden",
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <div style={{ padding: 10 }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Type to filter..."
              style={ui.input({ borderRadius: 12 })}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
            />
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {filtered.length ? (
              filtered.map((it) => (
                <button
                  key={it.value}
                  onClick={() => pick(it.value)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    border: "none",
                    background: it.value === value ? "rgba(122,162,255,.18)" : "transparent",
                    color: "rgba(255,255,255,.92)",
                    cursor: "pointer",
                    fontWeight: it.value === value ? 900 : 800,
                  }}
                >
                  {it.label}
                </button>
              ))
            ) : (
              <div style={{ padding: 12, opacity: 0.8 }}>No matches.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BreedImagePreview({ rawUrl, resolveImageSrc, ui, theme }) {
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
  }, [rawUrl]); // eslint-disable-line

  if (!rawUrl) return null;

  return (
    <div style={{ marginTop: 10, borderRadius: 16, overflow: "hidden", border: `1px solid ${theme.border}`, background: theme.glass2, backdropFilter: "blur(12px)" }}>
      {src ? (
        <img src={src} alt="Preview" style={{ width: "100%", height: 220, objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{ padding: 12, opacity: 0.85 }}>Preview loading…</div>
      )}
    </div>
  );
}

/* ----------------------------
   UTIL
---------------------------- */
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
