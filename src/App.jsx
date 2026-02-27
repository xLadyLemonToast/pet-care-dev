import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "./supabase";
import { createPortal } from "react-dom";
import "./App.css";


/**
 * CLEAN WORKING APP.JSX
 * - Fixes: duplicate state declarations, stray initAuth calls, await errors, undefined helpers
 * - Keeps: Supabase magic-link auth + admin-only mode, pet type/breed browsing, share links,
 *          favorites, grid/detail/admin views, care cards + edit/autosave, breed CRUD + image upload
 *
 * IMPORTANT:
 * 1) Put your real admin email(s) in ADMIN_EMAILS below.
 * 2) In Supabase Dashboard > Auth > URL Configuration:
 *    - Site URL: https://pet-care-dev.vercel.app
 *    - Redirect URLs: https://pet-care-dev.vercel.app/**  AND  http://localhost:5173/**
 */

function ComboBox({ ui, value, items, onChange, placeholder = "Select…" }) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      style={ui?.input ? ui.input() : undefined}
    >
      <option value="">{placeholder}</option>
      {(items || []).map((it) => (
        <option key={it.value} value={it.value}>
          {it.label}
        </option>
      ))}
    </select>
  );
}

export default function App() {
// ----------------------------
// AUTH (PASSWORD + MAGIC LINK + RESET)
// ----------------------------
const ADMIN_EMAILS = useMemo(
  () => new Set(["i-peters@outlook.com"].map((x) => x.toLowerCase().trim())),
  []
);

const [authMode, setAuthMode] = useState("login"); // "login" | "signup" | "magic" | "forgot"
const [loginOpen, setLoginOpen] = useState(false);
const [loginEmail, setLoginEmail] = useState("");
const [loginPassword, setLoginPassword] = useState(""); // ✅ ADD THIS
const [loginBusy, setLoginBusy] = useState(false);
const [loginMsg, setLoginMsg] = useState("");
const [user, setUser] = useState(null);
const isAdmin = user?.email
  ? ADMIN_EMAILS.has(user.email.toLowerCase().trim())
  : false;
const closeLogin = useCallback(() => {
  setLoginOpen(false);
  setLoginMsg("");
  setLoginPassword("");
  setAuthMode("login");
}, []);

useEffect(() => {
  let alive = true;

  async function bootAuth() {
    // If magic link / PKCE returned code, exchange it
    if (window.location.search.includes("code=")) {
      const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
      if (error) console.error("exchangeCodeForSession:", error.message);

      // Clean URL so refresh doesn't retry exchange
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) console.error("getSession:", error.message);
    if (!alive) return;
    setUser(data?.session?.user ?? null);
  }

  bootAuth();

  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!alive) return;
    setUser(session?.user ?? null);
  });

  return () => {
    alive = false;
    sub.subscription.unsubscribe();
  };
}, []);

// --- helpers ---
async function requireUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Not logged in");
  return user;
}

// --- auth actions ---
async function loginWithPassword() {
  const email = loginEmail.trim().toLowerCase();
  const password = loginPassword;

  if (!email) return setLoginMsg("Enter your email.");
  if (!password) return setLoginMsg("Enter your password.");

  setLoginBusy(true);
  setLoginMsg("");

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  setLoginBusy(false);

  if (error) return setLoginMsg(error.message);

  setLoginOpen(false);
  setLoginMsg("");
}

async function signUpWithPassword() {
  const email = loginEmail.trim().toLowerCase();
  const password = loginPassword;

  if (!email) return setLoginMsg("Enter your email.");
  if (!password || password.length < 8) return setLoginMsg("Password must be at least 8 characters.");

  setLoginBusy(true);
  setLoginMsg("");

  const { data, error } = await supabase.auth.signUp({ email, password });

  setLoginBusy(false);

  if (error) return setLoginMsg(error.message);

  // If confirm-email is ON, session may be null until they verify
  if (!data.session) {
    setLoginMsg("Check your email to confirm your account ✨");
  } else {
    setLoginMsg("");
    setLoginOpen(false);
  }
}

async function sendMagicLink() {
  const email = loginEmail.trim().toLowerCase();
  if (!email) return setLoginMsg("Enter your email.");

  setLoginBusy(true);
  setLoginMsg("");

  const redirectTo = window.location.origin;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });

  setLoginBusy(false);

  if (error) return setLoginMsg(error.message);

  setLoginMsg("Magic link sent. Check your email ✨");
}

async function sendPasswordReset() {
  const email = loginEmail.trim().toLowerCase();
  if (!email) return setLoginMsg("Enter your email.");

  setLoginBusy(true);
  setLoginMsg("");

  // You need a route/page for this in your app:
  const redirectTo = `${window.location.origin}/reset-password`;

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  setLoginBusy(false);

  if (error) return setLoginMsg(error.message);

  setLoginMsg("Password reset email sent 📩");
}

async function logout() {
  await supabase.auth.signOut();
  setLoginOpen(false);
  setLoginMsg("");
  setLoginEmail("");
  setLoginPassword("");
  setAuthMode("login");
}
  // ----------------------------
  // APP STATE
  // ----------------------------
  const [petTypes, setPetTypes] = useState([]);
  const [breeds, setBreeds] = useState([]);
  const [selectedBreed, setSelectedBreed] = useState(null);
  const [petTypeIdSearch, setPetTypeIdSearch] = useState("");
  const [petTypeId, setPetTypeId] = useState("");
  const [breedId, setBreedId] = useState("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [categories, setCategories] = useState([]);
  const [guidesByCategoryId, setGuidesByCategoryId] = useState({});
  const [openCategoryIds, setOpenCategoryIds] = useState(new Set());

  // ----------------------------
  // Add Planner State (NEW) with Reminders + Logs
  // ----------------------------
  const [plannerTab, setPlannerTab] = useState("reminders"); // "reminders" | "logs"
  const [reminders, setReminders] = useState([]);
  const [logs, setLogs] = useState([]);

  const [newReminderTitle, setNewReminderTitle] = useState("");
  const [newReminderRepeatDays, setNewReminderRepeatDays] = useState(""); // string for input
  const [newReminderDueOn, setNewReminderDueOn] = useState(""); // yyyy-mm-dd

  const [newLogKind, setNewLogKind] = useState("notes");
  const [newLogNote, setNewLogNote] = useState("");

  // UX
  const [menuOpen, setMenuOpen] = useState(false); // Start Menu 
  const [activeTags, setActiveTags] = useState([]);
  const [breedSearch, setBreedSearch] = useState("");
  const [petSearch, setPetSearch] = useState("");
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

useEffect(() => {
  document.body.classList.toggle("dark", darkMode);
  document.body.classList.toggle("light", !darkMode);

  try {
    localStorage.setItem("zoo_darkMode", darkMode ? "1" : "0");
  } catch {}
}, [darkMode]);

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
    breedTags: "",
    height_weight: "",
    group: "",
    origin: "",
    proper_name: ""
  });
  
  // NEW: tags for the selected breed
  
const [breedTags, setBreedTags] = useState([]); // array of strings, e.g. ["kid-friendly", "low-shedding"]
const [tagInput, setTagInput] = useState("");

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
// ----------------------------
// TAG HELPERS (NEW)
// ----------------------------
const normalizeTag = (tag) =>
  (tag ?? "").trim().toLowerCase().replace(/\s+/g, "-");

function addTag() {
  const cleaned = normalizeTag(tagInput);
  if (!cleaned) return;
  if (breedTags.includes(cleaned)) return;

  setBreedTags([...breedTags, cleaned]);
  setTagInput("");
}

function removeTag(tagToRemove) {
  setBreedTags(breedTags.filter((t) => t !== tagToRemove));
}

function handleTagKeyDown(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    addTag();
  }
  if (e.key === "Backspace" && !tagInput && breedTags.length > 0) {
    // optional: backspace removes last tag when input is empty
    removeTag(breedTags[breedTags.length - 1]);
  }
}
// --------------------------------
// SAVE TAGS WHEN BREED IS SAVED
// --------------------------------
async function saveBreedTags(breedId, tags) {
  const cleaned = Array.from(
    new Set((tags ?? []).map(normalizeTag).filter(Boolean))
  );

  const { error: delErr } = await supabase
    .from("breed_tags")
    .delete()
    .eq("breed_id", breedId);

  if (delErr) throw delErr;

  if (cleaned.length === 0) return;

  const rows = cleaned.map((tag) => ({ breed_id: breedId, tag }));
  const { error: insErr } = await supabase.from("breed_tags").insert(rows);
  if (insErr) throw insErr;
}
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const qs = params.toString();
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState({}, "", newUrl + window.location.hash);
  }

  useEffect(() => {
    updateShareUrl(petTypeId, breedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petTypeId, breedId]);

  async function copyShareLink() {
    const link = window.location.href;
    try {
      await navigator.clipboard.writeText(link);
      toast("Share link copied ✅");
    } catch {
      // fallback
      // eslint-disable-next-line no-alert
      prompt("Copy this link:", link);
    }
  }

  // ----------------------------
  // LOGGER: add/update/delete reminders + logs for selected breed
  // ----------------------------

async function addReminder() {
  if (!selectedBreed?.id) return;
  const title = newReminderTitle.trim();
  if (!title) return;

  const repeatDays = parseInt(newReminderRepeatDays, 10);

  try {
    const user = await requireUser();

    const { data, error } = await supabase
      .from("breed_reminders")
      .insert({
        breed_id: selectedBreed.id,
        title,
        due_on: newReminderDueOn || null,
        repeat_every_days: Number.isFinite(repeatDays) ? repeatDays : null,
        is_active: true,
        user_id: user.id,
      })
      .select()
      .single();

    if (error) return console.error("addReminder", error);

    setReminders((prev) => [data, ...prev]);
    setNewReminderTitle("");
    setNewReminderRepeatDays("");
    setNewReminderDueOn("");
  } catch (e) {
    console.error("addReminder", e);
  }
}

async function toggleReminder(id, isActive) {
  try {
    await requireUser(); // ensures logged in (RLS will enforce ownership)

    const { data, error } = await supabase
      .from("breed_reminders")
      .update({ is_active: !isActive })
      .eq("id", id)
      .select()
      .single();

    if (error) return console.error("toggleReminder", error);
    setReminders((prev) => prev.map((r) => (r.id === id ? data : r)));
  } catch (e) {
    console.error("toggleReminder", e);
  }
}

async function deleteReminder(id) {
  try {
    await requireUser();

    const { error } = await supabase
      .from("breed_reminders")
      .delete()
      .eq("id", id);

    if (error) return console.error("deleteReminder", error);
    setReminders((prev) => prev.filter((r) => r.id !== id));
  } catch (e) {
    console.error("deleteReminder", e);
  }
}

async function addLog() {
  if (!selectedBreed?.id) return;

  const note = newLogNote.trim();

  try {
    const user = await requireUser();

    const { data, error } = await supabase
      .from("breed_logs")
      .insert({
        breed_id: selectedBreed.id,
        kind: newLogKind,
        note: note || null,
        user_id: user.id,
        done_at: new Date().toISOString(), // optional but helps ordering
      })
      .select()
      .single();

    if (error) return console.error("addLog", error);

    setLogs((prev) => [data, ...prev]);
    setNewLogKind("notes");
    setNewLogNote("");
  } catch (e) {
    console.error("addLog", e);
  }
}

async function deleteLog(id) {
  try {
    await requireUser();

    const { error } = await supabase
      .from("breed_logs")
      .delete()
      .eq("id", id);

    if (error) return console.error("deleteLog", error);
    setLogs((prev) => prev.filter((l) => l.id !== id));
  } catch (e) {
    console.error("deleteLog", e);
  }
}
  // ----------------------------
  // PLANNER: load reminders + logs for selected breed
  // ----------------------------
useEffect(() => {
  if (!selectedBreed?.id) {
    setReminders([]);
    setLogs([]);
    return;
  }

  (async () => {
    const {
      data: { user },
      error: uErr,
    } = await supabase.auth.getUser();

    if (uErr) console.error("getUser error", uErr);

    // If not logged in, show nothing (or you can show a login prompt)
    if (!user) {
      setReminders([]);
      setLogs([]);
      return;
    }

    const { data: r, error: rErr } = await supabase
      .from("breed_reminders")
      .select("*")
      .eq("breed_id", selectedBreed.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (rErr) console.error("load reminders", rErr);
    setReminders(r ?? []);

    const { data: l, error: lErr } = await supabase
      .from("breed_logs")
      .select("*")
      .eq("breed_id", selectedBreed.id)
      .eq("user_id", user.id)
      .order("done_at", { ascending: false })
      .limit(50);

    if (lErr) console.error("load logs", lErr);
    setLogs(l ?? []);
  })();
}, [selectedBreed?.id]);

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
    loadBreedBundle(breedId);
  }, [breedId]);

  async function loadPetTypes() {
    const { data, error } = await supabase.from("pet_types").select("id,name").order("name");
    if (error) console.error(error);
    setPetTypes(data ?? []);
  }

  async function loadBreeds(typeId) {
    const { data, error } = await supabase
      .from("breeds")
      .select(`
        id,name,image_url,pet_type_id,
        breed_tags(tag)
      `)
      .eq("pet_type_id", typeId)
      .order("name");

    if (error) console.error(error);
    setBreeds(data ?? []);
    setImageSrcCache({});
  }

  async function loadBreedDetails(id) {
    const { data, error } = await supabase
      .from("breeds")
      .select(`
        *,
        breed_tags(tag)
      `)
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

  async function loadBreedBundle(id) {
    const { data, error } = await supabase
      .from("breeds")
      .select(
        `
        *,
        breed_tags(tag),
        care_guides(category_id,content)
      `
      )
      .eq("id", id)
      .single();

    if (error) {
      console.error(error);
      setSelectedBreed(null);
      setGuidesByCategoryId({});
      setDraftsByCategoryId({});
      setSavingByCategoryId({});
      setStatusByCategoryId({});
      return;
    }

    setSelectedBreed(data ?? null);

    const map = {};
    for (const row of data?.care_guides ?? []) {
      map[row.category_id] = row.content ?? "";
    }
    setGuidesByCategoryId(map);
    setDraftsByCategoryId(map);
    setSavingByCategoryId({});
    setStatusByCategoryId({});
  }

  async function refreshCurrentBreed() {
    if (!breedId) return;
    await loadBreedBundle(breedId);
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

    // Prefer signed url for admin (private buckets)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBreed?.image_url, isAdmin]);

  // ----------------------------
  // THEME (glass + calm color)
  // ----------------------------
  const theme = useMemo(() => {
    // Luxury: deep ink + warm gold accent
    if (!darkMode) {
      return {
        mode: "light",
        bg0: "transparent",
        bg1: "transparent",
        text: "#0b0c10",
        subtext: "rgba(11,12,16,.70)",
        border: "rgba(11,12,16,.12)",
        glass: "rgba(255,255,255,.72)",
        glass2: "rgba(255,255,255,.50)",
        shadow: "0 24px 70px rgba(15,18,30,.10)",
        shadow2: "0 10px 26px rgba(15,18,30,.10)",
        ring: "rgba(214,179,106,.45)",
        chip: "rgba(255,255,255,.70)",
        accent: "#d6b36a",
        accentSoft: "rgba(214,179,106,.20)",
      };
    }
    return {
      mode: "dark",
      bg0: "#0b0c10",
      bg1: "#0f1118",
      text: "rgba(255,255,255,.92)",
      subtext: "rgba(255,255,255,.62)",
      border: "rgba(255,255,255,.10)",
      glass: "rgba(18,20,28,.58)",
      glass2: "rgba(18,20,28,.38)",
      shadow: "0 28px 84px rgba(0,0,0,.55)",
      shadow2: "0 12px 34px rgba(0,0,0,.40)",
      ring: "rgba(214,179,106,.35)",
      chip: "rgba(255,255,255,.08)",
      accent: "#d6b36a",
      accentSoft: "rgba(214,179,106,.18)",
    };
  }, [darkMode]);

  const calmGradients = useMemo(() => {
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
  // Breeed & pet Search & FAVORITES + GRID
  // ----------------------------
  const searchFilteredBreeds = useMemo(() => {
    const q = breedSearch.trim().toLowerCase();
    if (!q) return breeds;

    return breeds.filter(b =>
      (b.name ?? "").toLowerCase().includes(q)
    );
  }, [breeds, breedSearch]);

  const filteredPetTypes = useMemo(() => {
  const q = petSearch.trim().toLowerCase();
  if (!q) return petTypes;

  return petTypes.filter((p) =>
    (p.name ?? "").toLowerCase().includes(q)
  );
}, [petTypes, petSearch]);

const tagFilteredBreeds = useMemo(() => {
  if (!activeTags.length) return searchFilteredBreeds;

  return searchFilteredBreeds.filter(b =>
    activeTags.every(tag =>
    (b.breed_tags ?? []).some((t) => t.tag === tag)    )
  );
}, [searchFilteredBreeds, activeTags]);

const sortedBreeds = useMemo(() => {
  const arr = [...tagFilteredBreeds];

  arr.sort((a, b) => {
    const af = favorites.has(a.id) ? 0 : 1;
    const bf = favorites.has(b.id) ? 0 : 1;
    if (af !== bf) return af - bf;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });

   return arr;
}, [tagFilteredBreeds, favorites]);

const visibleBreeds = showFavoritesOnly
  ? sortedBreeds.filter(b => favorites.has(b.id))
  : sortedBreeds;

useEffect(() => {
  if (viewMode !== "grid" && viewMode !== "detail") return;
  if (!petTypeId) return;

  const toPrime = visibleBreeds.slice(0, 24);

  toPrime.forEach((b) => {
    const raw = b?.image_url;
    if (!raw) return;
    if (imageSrcCache[raw]) return;

    resolveImageSrc(raw).then((resolved) => {
      if (resolved) setImageSrcCache((p) => ({ ...p, [raw]: resolved }));
    });
  });
}, [viewMode, petTypeId, sortedBreeds, imageSrcCache]);

  function toggleFavorite(id) {
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const isFavorite = selectedBreed ? favorites.has(selectedBreed.id) : false;

  function toggleTagFilter(tag) {
    setActiveTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  }
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
  // ----------------------------
  // Hide Cards (e.g. Size, Lifespan) from main view but keep in admin for editing
  // ----------------------------
const HIDE_CARE_CARDS = new Set(["Size", "Lifespan"]);

function openAllCategories() {
  setOpenCategoryIds(
    new Set(categories.filter((c) => !HIDE_CARE_CARDS.has(c.name)).map((c) => c.id))
  );
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

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, editMode, breedId, draftsByCategoryId]);

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
      proper_name: "",
    });
    setBreedTags([]);
    setTagInput("");
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
    proper_name: b.proper_name ?? "",
  });

  // ✅ Load tags into form (NEW)
  setBreedTags((b.breed_tags ?? []).map((t) => t.tag));
  setTagInput("");

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
      proper_name: breedForm.proper_name?.trim() || null,
    };

const { data, error } = await supabase
  .from("breeds")
  .upsert(payload)
  .select(`*, breed_tags(tag)`)
  .single();
    setBreedSaving(false);

    if (error) {
      console.error(error);
      setBreedSaveMsg(error.message);
      return;
    }
  // ✅ Save tags AFTER breed is confirmed saved
  try {
    if (data?.id) {
      await saveBreedTags(data.id, breedTags);
    }
  } catch (e) {
    console.error(e);
    toast("Breed saved but tags failed ⚠️");
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
    setImageSrcCache((p) => ({ ...p, [sbRef]: "" }));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

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
  // UI helpers (elite)
  // ----------------------------
  const ui = useMemo(() => createUi(theme), [theme]);

  // Luxury pointer glow (tracks cursor)
  useEffect(() => {
    function onMove(e) {
      const x = e.clientX;
      const y = e.clientY;
      document.documentElement.style.setProperty("--lux-x", `${x}px`);
      document.documentElement.style.setProperty("--lux-y", `${y}px`);
    }
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Custom combobox items
  const petTypeItems = useMemo(() => petTypes.map((pt) => ({ value: pt.id, label: pt.name })), [petTypes]);

  const breedItems = useMemo(
    () =>
      sortedBreeds.map((b) => ({
        value: b.id,
        label: `${favorites.has(b.id) ? "⭐ " : ""}${b.name}`,
        meta: b,
      })),
    [sortedBreeds, favorites]
  );

  function toggleTagFilter(tag) {
  setActiveTags(prev =>
    prev.includes(tag)
      ? prev.filter(t => t !== tag)
      : [...prev, tag]
  );
}

  const selectedImageSrc = selectedBreed?.image_url ? imageSrcCache[selectedBreed.image_url] : "";

  // ----------------------------
  // RENDER
  // ----------------------------
  return (
  <div
    className={`lux-app ${selectedBreed ? "mode-detail" : "mode-grid"}`}
      style={{
        minHeight: "100vh",
        color: theme.text,
        fontFamily: "system-ui, Segoe UI, Arial",
        position: "relative",
        overflowX: "hidden",
      }}
    >
      {/* Calm gradient fields */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background: "transparent",
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
          opacity: darkMode ? 0.16 : 0.00,
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E\")",
          mixBlendMode: darkMode ? "overlay" : "normal",
        }}
      />

      {/* Cursor glow */}
      <div aria-hidden="true" className="lux-glow" />

      {/* Pollen Layer*/}
      <div className="pollen-layer" aria-hidden="true" />
     
      {/* Toast */}
      <div
        style={{
          position: "fixed",
          left: "50%",
          top: 18,
          transform: "translateX(-50%)",
          zIndex: 50,
          transition: "opacity .18s ease",
          opacity: toastText ? 1 : 0,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            padding: "9px 12px",
            borderRadius: 12,
            background: theme.glass,
            border: `1px solid ${theme.border}`,
            backdropFilter: "blur(14px)",
            boxShadow: theme.shadow2,
            color: theme.text,
            fontWeight: 650,
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
       {/* HEADER */}
<header style={{ marginBottom: 18 }}>

  {/* TOP UTILITY BAR */}
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "18px 0",
      borderBottom: `1px solid ${theme.border}`,
      marginBottom:18,
    }}
  >
    <div style={{ 
      fontWeight: 900, 
      opacity: 0.60
       + (darkMode ? 0.35 : 0.25),
      fontSize: 20,
      display: "flex",
      alignItems: "center",
      gap: 8,
      letterSpacing: 0.18,
      color: theme.subtext,
      
    }}>
      🐾 Zoo Database
    </div>

    <div style={{ position: "relative", display: "flex", gap: 12, alignItems: "center" }}>
      <button
        onClick={() => setMenuOpen(v => !v)}
        style={ui.btn({ weight: 800 })}
      >
        ☰
      </button>
      {menuOpen && (
  <div className="floating-menu">
    
    <button onClick={() => { setPlannerTab("reminders"); setMenuOpen(false); }}
          style={{
          className:"menu-item",
          textalign: "center",
          fontWeight: 900,
        }}
      >
      Reminders
    </button>
    <button onClick={() => { closeAllCategories(); setMenuOpen(false); }}
          style={{
          className:"menu-item",
          textalign: "center",
          fontWeight: 900,
        }}
      >
      Logs
    </button>
  </div>
)}

      <button
        onClick={() => setDarkMode(d => !d)}
        style={ui.btn({ icon: true })}
        title="Toggle theme"
      >
        {darkMode ? "🌙" : "☀️"}
      </button>

{!user ? (
        <button
          onClick={() => setLoginOpen(true)}
          style={{
          className:"menu-item",
          textalign: "center",
          fontWeight: 900,
  }}
        >
          Login
        </button>
      ) : (
        <button
          onClick={logout}
          style={ui.btn({ weight: 900, tone: "bad" })}
        >
          Logout
        </button>
      )
    }  

    </div>
  </div>

  {/* HERO TITLE */}
  <div style={{ textAlign: "center", marginBottom: 36, background: "radial-gradient(circle, rgba(255,230,180,0.12), transparent 70%)",
 }}>
    <h1
      style={{
        margin: 0,
        fontSize: 48,
        fontWeight: 950,
        letterSpacing: -1.2,
        textShadow: "0 10px 30px rgba(122,162,255,.25)",
      }}
    >
      Zoo Database 🐾
    </h1>

    <div
      style={{
        marginTop: 12,
        fontSize: 14,
        color: theme.subtext,
      }}
    >
      {isAdmin
        ? "Admin session active."
        : "Browse mode. Log in to edit and manage content."}
    </div>
  </div>

  {/* VIEW NAVIGATION */}
  <div style={{ display: "flex", justifyContent: "center" }}>
    <Segment
      value={viewMode}
      onChange={setViewMode}
      options={[
        { value: "detail", label: "🧾 Detail" },
        { value: "grid", label: "🧩 Grid" },
      ]}
      ui={ui}
    />
  </div>

</header>
          {/* TOP CONTROLS */}
          <div style={{ 
            marginTop: 10, 
            display: "grid", 
            gridTemplateColumns: "1fr 1fr", 
            rowGap: 6, 
            columnGap: 16 }}>
            <GlassCard>
              <div style={ui.hLabel()}>Pet Type</div>
              
              <ComboBox
            ui={ui}
              value={petTypeId}
              placeholder="Choose a pet type"
              items={filteredPetTypes.map(p => ({
                value: p.id,
                label: p.name
              }))}
              onChange={(v) => {
                setPetTypeId(v);
                setBreedId("");
                setSelectedBreed(null);
              }}
            />
          <button
            onClick={() => {
              setShowFavoritesOnly((v) => !v);
              setViewMode("grid");
              window.scrollTo({ top: 0, behavior: "smooth" });

            }}
            style={ui.btn({ weight: 900, glow: showFavoritesOnly })}
            title="Show favorites only"
          >
            ⭐ {showFavoritesOnly ? "Favorites ON" : "Favorites"}
          </button>

            </GlassCard>

            <GlassCard>
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
            <div style={{ marginTop: 12}}>
              <div style={{ position: "relative", zIndex: 999999, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ color: theme.subtext }}>
                  Showing <b>{sortedBreeds.length}</b> breed(s)
                </div>
                <button onClick={() => setViewMode("detail")} style={ui.btn({ weight: 900 })}>
                  Go to Detail View
                </button>
              </div>

              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14 }}>
            {visibleBreeds.map((b) => (
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
            <div style={{ marginTop: 18 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
                {/* Breed editor */}
                <GlassCard>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div style={{ fontWeight: 950, fontSize: 16 }}>Breed Editor</div>
                    <button onClick={resetBreedForm} style={ui.btn({ weight: 900 })}>
                      + New Breed
                    </button>
                  </div>
{/* TAGS (NEW) */}
<div style={{ marginTop: 12 }}>
  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 6 }}>
    Tags
  </div>

  <div
    style={{
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
      padding: 10,
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.04)",
    }}
  >
    {breedTags.map((t) => (
      <span
        key={t}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(0,0,0,0.25)",
          fontSize: 12,
        }}
      >
        <span>{t}</span>
        <button
          type="button"
          onClick={() => removeTag(t)}
          style={{
            width: 18,
            height: 18,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "transparent",
            color: "rgba(255,255,255,0.8)",
            cursor: "pointer",
            lineHeight: "16px",
            padding: 0,
          }}
          aria-label={`Remove tag ${t}`}
          title="Remove"
        >
          ×
        </button>
      </span>
    ))}

    <input
      value={tagInput}
      onChange={(e) => setTagInput(e.target.value)}
      onKeyDown={handleTagKeyDown}
      placeholder="Type a tag and press Enter…"
      style={{
        flex: 1,
        minWidth: 220,
        border: "none",
        outline: "none",
        background: "transparent",
        color: "white",
        fontSize: 13,
        padding: "6px 8px",
      }}
    />

    <button
      type="button"
      onClick={addTag}
      style={{
        borderRadius: 10,
        padding: "8px 10px",
        border: "1px solid rgba(255,255,255,0.18)",
        background: "rgba(255,255,255,0.06)",
        color: "white",
        cursor: "pointer",
        fontSize: 12,
      }}
    >
      Add
    </button>

    {breedTags.length > 0 && (
      <button
        type="button"
        onClick={() => setBreedTags([])}
        style={{
          borderRadius: 10,
          padding: "8px 10px",
          border: "1px solid rgba(255,255,255,0.18)",
          background: "transparent",
          color: "rgba(255,255,255,0.75)",
          cursor: "pointer",
          fontSize: 12,
        }}
      >
        Clear
      </button>
    )}
  </div>

  <div style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
    Tip: use lowercase + hyphens (example: <code style={{ color: "rgba(255,255,255,0.8)" }}>kid-friendly</code>)
  </div>
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
                      <div style={ui.label()}>Group</div>
                      <input value={breedForm.group} onChange={(e) => setBreedForm((p) => ({ ...p, group: e.target.value }))} style={ui.input()} />
                    </div>

                    <div>
                      <div style={ui.label()}>Origin</div>
                      <input value={breedForm.origin} onChange={(e) => setBreedForm((p) => ({ ...p, origin: e.target.value }))} style={ui.input()} />
                    </div>

                    <div>
                      <div style={ui.label()}>Proper Name</div>
                      <input value={breedForm.proper_name} onChange={(e) => setBreedForm((p) => ({ ...p, proper_name: e.target.value }))} style={ui.input()} />
                    </div>

                    <div style={{ gridColumn: "span 2" }}>
                      <div style={ui.label()}>Height/Weight</div>
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
                        <BreedImagePreview rawUrl={breedForm.image_url} resolveImageSrc={resolveImageSrc} theme={theme} />
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
                <GlassCard>
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
              <div
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
                        background: "linear-gradient(180deg, rgba(0,0,0,.10), rgba(0,0,0,.0) 40%, rgba(0,0,0,.35))",
                      }}
                    />
                  </div>
                )}

                <div style={{ padding: 22 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: 30, letterSpacing: -0.4 }}>{selectedBreed.name}</h2>
                      {selectedBreed.description && (
                        <div style={{ marginTop: 8, color: theme.subtext, lineHeight: 1.55 }}>
                          {selectedBreed.description}
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      
                      <button
                        onClick={() => toggleFavorite(selectedBreed.id)}
                        style={ui.btn({ icon: true, glow: isFavorite })}
                        title={isFavorite ? "Unfavorite" : "Favorite"}
                      >
                        {isFavorite ? "⭐" : "☆"}
                      </button>

                      <button onClick={() => setSelectedBreed(null)} style={ui.btn({ weight: 900 })}>
                        ← Back to list
                      </button>

                      <button onClick={refreshCurrentBreed} style={ui.btn({ weight: 900 })}>
                        🔄 Refresh
                      </button>

                      <button onClick={copyShareLink} style={ui.btn({ weight: 900 })}>
                        🔗 Share
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
                    {selectedBreed.lifespan && (
                      <Chip>🕰️ <b>Lifespan:</b> {selectedBreed.lifespan}</Chip>
                    )}
                    {(selectedBreed.size || selectedBreed.height_weight) && (
                      <Chip>📏 <b>Size:</b> {selectedBreed.size ?? selectedBreed.height_weight}</Chip>
                    )}
                    {selectedBreed.group && (
                      <Chip>🏷️ <b>Group:</b> {selectedBreed.group}</Chip>
                    )}
                    {selectedBreed.origin && (
                      <Chip>🌍 <b>Origin:</b> {selectedBreed.origin}</Chip>
                    )}
                  </div>
                    {selectedBreed?.breed_tags?.length > 0 && (
                      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 10 }}>
                        {selectedBreed.breed_tags.map((t) => (
                          <Chip key={t.tag}>🏷️ {t.tag}</Chip>
                        ))}
                      </div>
                      
                    )}
                    
                  <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
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

                        <button
                          onClick={() => setAutoSave((v) => !v)}
                          style={ui.btn({ weight: 900, tone: autoSave ? "info" : "neutral" })}
                          disabled={!editMode}
                        >
                          {autoSave ? "💾 Autosave ON" : "💾 Autosave OFF"}
                        </button>
                      
                      </>
                    )}
                  </div>
                </div>
              </div>

{/* ✅ PLANNER */}
<div style={{ marginTop: 14 }}>
  <GlassCard className="planner-card">
    <div className="planner-head">
      <div className="planner-title">Planner</div>

      <div className="planner-tabs">
        <button
          className={plannerTab === "reminders" ? "active" : ""}
          onClick={() => setPlannerTab("reminders")}
        >
          Reminders
        </button>
        <button
          className={plannerTab === "logs" ? "active" : ""}
          onClick={() => setPlannerTab("logs")}
        >
          Logs
        </button>
      </div>
    </div>

    {plannerTab === "reminders" ? (
      <>
<div className="planner-add">
  <div className="planner-field">
    <label>Reminder </label>
    <input
      value={newReminderTitle}
      onChange={(e) => setNewReminderTitle(e.target.value)}
      placeholder="Water change"
    />
  </div>

  <div className="planner-field">
    <label>Repeat (days)</label>
    <input
      value={newReminderRepeatDays}
      onChange={(e) => setNewReminderRepeatDays(e.target.value)}
      placeholder="7"
      inputMode="numeric"
    />
  </div>

  <div className="planner-field">
    <label>Due </label>
    <input
      type="date"
      value={newReminderDueOn}
      onChange={(e) => setNewReminderDueOn(e.target.value)}
    />
  </div>

  <button onClick={addReminder}>Add</button>
</div>

        <div className="planner-list">
          {reminders.map((r) => (
            <div key={r.id} className={`planner-row ${r.is_active ? "" : "muted"}`}>
              <div className="planner-row-main">
                <div className="planner-row-title">{r.title}</div>
                <div className="planner-row-meta">
                  {r.repeat_every_days ? `Repeats every ${r.repeat_every_days}d` : ""}
                  {r.due_on ? ` • Due ${r.due_on}` : ""}
                </div>
              </div>

              <div className="planner-row-actions">
                <button onClick={() => toggleReminder(r.id, r.is_active)}>
                  {r.is_active ? "On" : "Off"}
                </button>
                <button onClick={() => deleteReminder(r.id)}>Delete</button>
              </div>
            </div>
          ))}
          {!reminders.length && <div className="planner-empty">No reminders yet.</div>}
        </div>
      </>
    ) : (
      <>
        <div className="planner-add">
          <select value={newLogKind} onChange={(e) => setNewLogKind(e.target.value)}>
            <option value="notes">Notes</option>
            <option value="fed">Fed</option>
            <option value="water_change">Water change</option>
            <option value="cleaned">Cleaned</option>
            <option value="meds">Meds</option>
          </select>

          <input
            value={newLogNote}
            onChange={(e) => setNewLogNote(e.target.value)}
            placeholder="Log note (optional)"
          />

          <button onClick={addLog}>Log</button>
        </div>

        <div className="planner-list">
          {logs.map((l) => (
            <div key={l.id} className="planner-row">
              <div className="planner-row-main">
                <div className="planner-row-title">{l.kind}</div>
                <div className="planner-row-meta">
                  {new Date(l.done_at).toLocaleString()}
                  {l.note ? ` • ${l.note}` : ""}
                </div>
              </div>

              <div className="planner-row-actions">
                <button onClick={() => deleteLog(l.id)}>Delete</button>
              </div>
            </div>
          ))}
          {!logs.length && <div className="planner-empty">No logs yet.
Start tracking feeding, health, or behavior notes.</div>}
        </div>
      </>
    )}
  </GlassCard>
</div>
              
              {/* Quick facts */}
              <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                <QuickFacts theme={theme} breed={selectedBreed} />
              </div>

              {/* Care Cards */}
                            <div style={{ marginTop: 16 }}>
              {categories
                .filter((cat) => !HIDE_CARE_CARDS.has(cat.name))
                .map((cat) => {
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
                      style={{
                        marginTop: 12,
                        borderRadius: 18,
                        overflow: "hidden",
                        border: `1px solid ${theme.border}`,
                        background: darkMode ? theme.glass : `linear-gradient(180deg, ${theme.glass}, ${theme.glass2})`,
                        boxShadow: theme.shadow2,
                        backdropFilter: "blur(14px)",
                        position: "relative",
                      }}
                    >
                      <div
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          inset: 0,
                          pointerEvents: "none",
                          background: tone.tint,
                          opacity: darkMode ? 0.22 : 0.6,
                        }}
                      />

                      <button
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

                      <div
                        style={{
                          position: "relative",
                          zIndex: 1,
                          maxHeight: isOpen ? 1600 : 0,
                          transition: "max-height .25s ease",
                          overflow: "hidden",
                        }}
                      >
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
  <div style={{ marginTop: 22 }}>
    <div style={{ fontWeight: 950, fontSize: 16, marginBottom: 10 }}>
      Animals ({sortedBreeds.length})
    </div>

    {sortedBreeds.length === 0 ? (
      <div style={{ color: theme.subtext }}>
        No animals loaded yet. Pick a Pet Type (or check your filters).
      </div>
    ) : (
      <div style={{ display: "grid", gap: 10 }}>
        {sortedBreeds.map((b) => (
<div
  key={b.id}
  onClick={() => setSelectedBreed(b)}
  title="Open care sheet"
  style={{
    ...ui.softCard(),
    padding: 12,
    cursor: "pointer",
    userSelect: "none",
    display: "flex",
    alignItems: "center",
    gap: 12,
    transition: "transform .12s ease, box-shadow .12s ease",
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.transform = "translateY(-2px)";
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.transform = "translateY(0px)";
  }}
>
  {/* Thumbnail */}
  <div
    style={{
      width: 58,
      height: 58,
      borderRadius: 14,
      overflow: "hidden",
      flexShrink: 0,
      border: `1px solid ${theme.border}`,
      background: "rgba(0,0,0,.06)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 12,
      opacity: 0.9,
    }}
  >
    {b.image_url && imageSrcCache[b.image_url] ? (
      <img
        src={imageSrcCache[b.image_url]}
        alt={b.name}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        loading="eager"
      />
    ) : (
      <span style={{ opacity: 0.6 }}>No img</span>
    )}
  </div>

  {/* Text */}
  <div style={{ minWidth: 0, flex: 1 }}>
    <div style={{ fontWeight: 950, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      {b.proper_name || b.name}
    </div>

    {b.scientific_name && (
      <div style={{ opacity: 0.7, fontStyle: "italic", fontSize: 12, marginTop: 2 }}>
        {b.scientific_name}
      </div>
    )}
  </div>

  {/* Chevron */}
  <div style={{ opacity: 0.5, fontSize: 18, paddingRight: 6 }}>›</div>
</div>
        ))}
      </div>
    )}
  </div>
)}
</div>

</div>
  

{/* Login Modal */}
{loginOpen && (
  <Modal
    title={
      authMode === "login" ? "Log in" :
      authMode === "signup" ? "Create account" :
      authMode === "forgot" ? "Reset password" :
      "Magic link"
    }
    subtitle={
      authMode === "login" ? "Email + password" :
      authMode === "signup" ? "Create an account" :
      authMode === "forgot" ? "We’ll email you a reset link" :
      "Email-only sign in"
    }
    onClose={() => {
      setLoginOpen(false);
      setLoginMsg("");
      setLoginPassword("");
      setAuthMode("login");
    }}
    ui={ui}
  >
    <div style={{ display: "grid", gap: 10 }}>
      {/* Email */}
      <input
        value={loginEmail}
        onChange={(e) => setLoginEmail(e.target.value)}
        placeholder="you@company.com"
        style={ui.input()}
        autoComplete="email"
      />

      {/* Password */}
      {(authMode === "login" || authMode === "signup") && (
        <input
          value={loginPassword}
          onChange={(e) => setLoginPassword(e.target.value)}
          placeholder="Password"
          type="password"
          style={ui.input()}
          autoComplete={authMode === "signup" ? "new-password" : "current-password"}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            if (authMode === "login") loginWithPassword();
            if (authMode === "signup") signUpWithPassword();
          }}
        />
      )}

      {/* Primary action */}
      {authMode === "login" && (
        <button
          type="button"
          onClick={loginWithPassword}
          disabled={loginBusy}
          style={ui.btn({ weight: 900, disabled: loginBusy, glow: true })}
        >
          {loginBusy ? "Logging in..." : "Log in"}
        </button>
      )}

      {authMode === "signup" && (
        <button
          type="button"
          onClick={signUpWithPassword}
          disabled={loginBusy}
          style={ui.btn({ weight: 900, disabled: loginBusy, glow: true })}
        >
          {loginBusy ? "Creating..." : "Create account"}
        </button>
      )}

      {authMode === "forgot" && (
        <button
          type="button"
          onClick={sendPasswordReset}
          disabled={loginBusy}
          style={ui.btn({ weight: 900, disabled: loginBusy, glow: true })}
        >
          {loginBusy ? "Sending..." : "Send reset email"}
        </button>
      )}

      {authMode === "magic" && (
        <button
          type="button"
          onClick={sendMagicLink}
          disabled={loginBusy}
          style={ui.btn({ weight: 900, disabled: loginBusy, glow: true })}
        >
          {loginBusy ? "Sending..." : "Send magic link"}
        </button>
      )}

      {/* Message */}
      {loginMsg ? <div style={ui.msg(loginMsg)}>{loginMsg}</div> : null}

      {/* Switchers */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
        {authMode !== "login" && (
          <button
            type="button"
            onClick={() => { setAuthMode("login"); setLoginMsg(""); }}
            disabled={loginBusy}
            style={{ border: "none", background: "transparent", padding: 0, color: theme.subtext, textDecoration: "underline", cursor: "pointer", fontSize: 12, fontWeight: 800 }}
          >
            Back to login
          </button>
        )}

        {authMode === "login" && (
          <>
            <button
              type="button"
              onClick={() => { setAuthMode("signup"); setLoginMsg(""); }}
              disabled={loginBusy}
              style={{ border: "none", background: "transparent", padding: 0, color: theme.subtext, textDecoration: "underline", cursor: "pointer", fontSize: 12, fontWeight: 800 }}
            >
              Create account
            </button>

            <button
              type="button"
              onClick={() => { setAuthMode("forgot"); setLoginMsg(""); setLoginPassword(""); }}
              disabled={loginBusy}
              style={{ border: "none", background: "transparent", padding: 0, color: theme.subtext, textDecoration: "underline", cursor: "pointer", fontSize: 12, fontWeight: 800 }}
            >
              Forgot password
            </button>

            <button
              type="button"
              onClick={() => { setAuthMode("magic"); setLoginMsg(""); setLoginPassword(""); }}
              disabled={loginBusy}
              style={{ border: "none", background: "transparent", padding: 0, color: theme.subtext, textDecoration: "underline", cursor: "pointer", fontSize: 12, fontWeight: 800 }}
            >
              Use magic link instead
            </button>
          </>
        )}
      </div>

      {/* Help */}
      <div style={{ color: theme.subtext, fontSize: 12, lineHeight: 1.4, marginTop: 6 }}>
        {authMode === "magic" && <>If the link opens but doesn’t log you in, check Supabase Auth: Site URL + Redirect URLs.</>}
        {authMode === "forgot" && <>You’ll be sent a reset link. You need a <code>/reset-password</code> page to set the new password.</>}
      </div>
    </div>
  </Modal>
)}
 {/* FOOTER — PUT IT HERE */}
<footer style={{
  marginTop: 80,
  padding: "32px 0",
  textAlign: "center",
  opacity: .5,
  fontSize: 13,
  letterSpacing: ".08em"
}}>
  © {new Date().getFullYear()} Made by Immaline Peters. All rights reserved.
</footer>
</div>
);
}

/* ----------------------------
   UI FACTORY
---------------------------- */
function createUi(theme) {
  const baseBtn = {
    borderRadius: 12,
    padding: "9px 12px",
    border: `1px solid ${theme.border}`,
    background: theme.glass,
    color: theme.text,
    cursor: "pointer",
    fontWeight: 650,
    letterSpacing: 0.2,
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
        borderColor: glow ? theme.accentSoft : toneBorder(tone),
        boxShadow: glow ? `0 16px 44px ${theme.accentSoft}` : theme.shadow2,
      };
    },
    iconBtn: () => ({
      ...baseBtn,
      padding: "8px 10px",
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
      padding: "10px 12px",
      borderRadius: 12,
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
      padding: "10px 12px",
      borderRadius: 12,
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
      borderRadius: 12,
      border: `1px solid ${theme.border}`,
      background: theme.glass2,
      backdropFilter: "blur(12px)",
    }),
    dropzone: () => ({
      border: `1px dashed ${theme.border}`,
      borderRadius: 12,
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
      borderRadius: 12,
      border: `1px solid ${tone === "good" ? "rgba(120,255,196,.35)" : tone === "bad" ? "rgba(255,120,120,.35)" : theme.border}`,
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
function GlassCard({ children,className = "" }) {
  return (
    <div className="lux-card">
      <div className="lux-card__inner">{children}</div>
    </div>
  );
}

function Chip({ children }) {
  return <span className="lux-chip">{children}</span>;
}

function Segment({ value, onChange, options, ui }) {
  return (
    <div className="lux-segment">
      {options.map((o) => {
        const active = value === o.value;

        return (
          <button
            key={o.value}
            onClick={() => !o.disabled && onChange(o.value)}
            disabled={o.disabled}
            title={o.title || ""}

            // ✅ lets CSS target the active state
            aria-pressed={active}
            className={active ? "active" : ""}
            type="button"
            style={{
              ...ui.btn({
                weight: active ? 950 : 850,
                disabled: !!o.disabled,
                glow: active,
              }),
              padding: "8px 10px",
              boxShadow: "none",

              // ✅ IMPORTANT: stop inline background from overriding your gold CSS
              background: "transparent",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}


function QuickFacts({ theme, breed }) {
  const facts = [
    ["Origin", breed?.origin || breed?.Origin || "—"],
    ["Lifespan", breed?.lifespan || "—"],
    ["Group", breed?.group || "—"],
    ["Size", breed?.size || breed?.height_weight || "—"],
    ["Proper Name", breed?.proper_name || "—"],
    ["Beginner friendly", breed?.beginner_friendly ? "Yes" : "No"],
  ];

  return (
    <div
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: 18,
        padding: 14,
        background: "rgba(255,255,255,.04)",
        boxShadow: theme.shadow2,
        backdropFilter: "blur(14px)",
      }}
    >
      <div style={{ fontWeight: 950, marginBottom: 10, letterSpacing: -0.2 }}>Quick Facts</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {facts.map(([k, v]) => (
          <div key={k} style={{ display: "flex", gap: 10 }}>
            <div style={{ width: 130, color: theme.subtext, fontWeight: 850 }}>{k}</div>
            <div style={{ color: theme.text, fontWeight: 750, overflowWrap: "anywhere" }}>{String(v)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GridCard({ theme, darkMode, breed, isFav, imgSrc, onClick, onToggleFav, onNeedResolve }) {
  const subtitle =
    (breed.temperament && String(breed.temperament)) ||
    (breed.origin && `Origin: ${breed.origin}`) ||
    ((breed.breed_tags ?? []).slice(0, 2).map((t) => t.tag).join(" • ")) ||
    "";

  const miniTags = (breed.breed_tags ?? []).slice(0, 2).map((t) => t.tag);

  return (
    <div
      className="lux-gridcard"
      onClick={onClick}
      title="Open"
      style={{
        borderRadius: 22,
        overflow: "hidden",
        border: `1px solid ${theme.border}`,
        background: "rgba(255,255,255,.04)",
        boxShadow: theme.shadow2,
        cursor: "pointer",
        backdropFilter: "blur(14px)",
        transition: "transform .12s ease, box-shadow .12s ease, border-color .12s ease",
      }}
      onMouseEnter={onNeedResolve}
    >
      <div style={{ height: 170, background: darkMode ? "rgba(0,0,0,.22)" : "rgba(255,255,255,.35)" }}>
        {breed.image_url ? (
          <img
            src={imgSrc || ""}
            alt={breed.name}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            loading="eager"
          />
        ) : (
          <div style={{ height: "100%", display: "grid", placeItems: "center", color: theme.subtext }}>
            <div style={{ opacity: 0.9, fontWeight: 900 }}>No image</div>
          </div>
        )}
      </div>

      <div style={{ padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 980, letterSpacing: -0.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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

        {subtitle ? (
          <div
            style={{
              marginTop: 6,
              color: theme.subtext,
              fontSize: 12,
              fontWeight: 750,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {subtitle}
          </div>
        ) : null}

        {miniTags.length ? (
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {miniTags.map((t) => (
              <span key={t} className="lux-chip" style={{ padding: "6px 9px" }}>
                🏷️ {t}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ✅ A reusable, generic modal component for logins
function Modal({ title, subtitle, children, onClose, ui }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="lux-modal-backdrop"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        // only close when clicking the backdrop, not inside the dialog
        if (e.target === e.currentTarget) onClose?.();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,.55)",
        display: "grid",
        placeItems: "center",
        padding: 18,
      }}
    >
      <div
        className="lux-modal"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 100%)",
          borderRadius: 22,
          border: "1px solid rgba(255,255,255,.14)",
          background: "rgba(18,22,44,.70)",
          boxShadow: "0 20px 80px rgba(0,0,0,.55)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: 16, borderBottom: "1px solid rgba(255,255,255,.10)" }}>
          <div style={{ fontWeight: 950, fontSize: 16, color: "white" }}>{title}</div>
          {!!subtitle && (
            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8, color: "white" }}>
              {subtitle}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: 16 }}>{children}</div>

        {/* Footer */}
        <div
          style={{
            padding: 12,
            borderTop: "1px solid rgba(255,255,255,.10)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={ui?.btn ? ui.btn({ weight: 900 }) : undefined}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------
   UTIL
---------------------------- */
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

