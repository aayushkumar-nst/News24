/**
 * News24 — Spaceflight News API integration
 * Filter / sort use array methods (no for/while on those steps).
 */

// --- DOM ---
const container = document.getElementById("articles_container");
const savedContainer = document.getElementById("saved_articles_container");
const searchInput = document.getElementById("search_input");
const searchBtn = document.getElementById("search");
const categorySelect = document.getElementById("category_filter");
const sortSelect = document.getElementById("sort_option");
const loader = document.getElementById("loader");
const errorBox = document.getElementById("error_message");
const resultCount = document.getElementById("result_count");
const themeBtn = document.getElementById("theme_toggle");

// --- Spaceflight News API ---

/** Shown when an article has no image or the image fails to load */
const FALLBACK_IMAGE =
  "https://placehold.co/640x400/e5e7eb/475569?text=News+24";

const SAVED_KEY = "news24_saved_articles";
const THEME_KEY = "news24_theme";

let allArticles = [];
let savedArticles = [];
let favs = new Set();
let currentView = "home";

try {
  const raw = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
  savedArticles = Array.isArray(raw) ? raw : [];
} catch {
  savedArticles = [];
}

const articleKey = (a) => (a && (a.url || a.title)) || "";

/**
 * Helper to get image URL with fallback logic
 */
const getArticleImageUrl = (article) => {
  const u = article.urlToImage || article.image || article.imageUrl || article.image_url;
  return u && String(u).trim() ? String(u).trim() : "";
};

const refreshFavsSet = () => {
  favs = new Set(savedArticles.map(articleKey));
};

refreshFavsSet();

const persistSaved = () => {
  localStorage.setItem(SAVED_KEY, JSON.stringify(savedArticles));
  refreshFavsSet();
};

const esc = (s) => {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

const setLoading = (on) => {
  loader.hidden = !on;
  searchBtn.disabled = on;
};

const showBanner = (msg, variant) => {
  errorBox.hidden = false;
  errorBox.textContent = msg;
  errorBox.className =
    "banner " + (variant === "error" ? "banner-error" : "banner-info");
};

const hideBanner = () => {
  errorBox.hidden = true;
  errorBox.textContent = "";
  errorBox.className = "banner";
};

// --- Page switching ---
const showView = (name) => {
  currentView = name;
  document.querySelectorAll(".page-view").forEach((section) => {
    const match = section.dataset.viewSection === name;
    section.classList.toggle("is-hidden", !match);
  });
  document.querySelectorAll(".nav-link[data-nav]").forEach((link) => {
    link.classList.toggle("active", link.dataset.nav === name);
  });
  if (name === "saved") {
    renderSavedView();
  }
};

// --- Saved articles (full snapshots in localStorage) ---
const toggleSave = (article) => {
  const key = articleKey(article);
  if (!key) return;

  const already = savedArticles.some((a) => articleKey(a) === key);
  if (already) {
    savedArticles = savedArticles.filter((a) => articleKey(a) !== key);
  } else {
    savedArticles.push({
      title: article.title,
      description: article.description,
      url: article.url,
      urlToImage: getArticleImageUrl(article),
      publishedAt: article.publishedAt,
      source: article.source,
    });
  }
  persistSaved();
};

const bindFavoriteButtons = (rootEl, articleList) => {
  rootEl.querySelectorAll(".btn-fav").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const article = articleList.find((a) => articleKey(a) === id);
      if (!article) return;
      toggleSave(article);
      updateList();
      if (currentView === "saved") {
        renderSavedView();
      }
    });
  });
};

const renderSavedView = () => {
  if (!savedContainer) return;

  if (savedArticles.length === 0) {
    savedContainer.innerHTML =
      `<div class="empty"><h2>No saved articles yet.</h2></div>`;
    return;
  }

  const sorted = savedArticles.slice().sort((a, b) => {
    const tA = new Date(a.publishedAt || 0).getTime();
    const tB = new Date(b.publishedAt || 0).getTime();
    return tB - tA;
  });

  savedContainer.innerHTML = sorted.map(buildCardHtml).join("");
  bindFavoriteButtons(savedContainer, sorted);
};

/**
 * Normalize Spaceflight News API article data so cards & saved list stay the same.
 */
const normalizeArticle = (raw) => {
  return {
    title: raw.title,
    description: raw.summary || "",
    url: raw.url || "#",
    urlToImage: (raw.image_url && String(raw.image_url).trim()) || "",
    publishedAt: raw.published_at || "",
    source: { name: raw.news_site || "Unknown" },
  };
};

/**
 * Fetch from stable public Spaceflight News API.
 */
const fetchTopHeadlines = async () => {
  const url = `https://api.spaceflightnewsapi.net/v4/articles/?limit=20`;
  console.log("Fetching from:", url);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    if (!data.results || !Array.isArray(data.results)) {
      throw new Error("Unexpected response format from Spaceflight API");
    }

    return data.results.map(normalizeArticle);
  } catch (error) {
    console.error("Fetch API Error:", error);
    throw error;
  }
};

const cleanArticles = (articles) =>
  articles.filter(
    (a) => a && a.title && a.title !== "[Removed]"
  );

const loadNews = async () => {
  setLoading(true);
  hideBanner();
  
  // Category filter not implemented for Spaceflight API yet, so we ignore it.
  
  try {
    const raw = await fetchTopHeadlines();
    allArticles = cleanArticles(raw);

    if (allArticles.length === 0) {
      showBanner(
        "No articles available right now. Please try again later.",
        "info"
      );
    }
  } catch (err) {
    allArticles = [];
    showBanner(`Could not load news: ${err.message}`, "error");
  }

  setLoading(false);
  updateList();
};

const debounce = (fn, ms) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

const getFilteredAndSorted = () => {
  const q = searchInput.value.trim().toLowerCase();

  const filtered = allArticles.filter((a) => {
    if (!q) return true;
    const inTitle = a.title && a.title.toLowerCase().includes(q);
    const inDesc = a.description && a.description.toLowerCase().includes(q);
    return Boolean(inTitle || inDesc);
  });

  const mode = sortSelect.value;
  return filtered.slice().sort((a, b) => {
    const dateA = new Date(a.publishedAt || 0).getTime();
    const dateB = new Date(b.publishedAt || 0).getTime();
    return mode === "date_asc" ? dateA - dateB : dateB - dateA;
  });
};

const formatPublished = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const buildCardHtml = (article) => {
  const id = articleKey(article);
  const isFav = favs.has(id);

  const imgRaw = getArticleImageUrl(article);
  const imgSrc = imgRaw ? esc(imgRaw) : FALLBACK_IMAGE;
  const thumb =
    `<div class="card-media"><img src="${imgSrc}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}'"></div>`;

  const src = esc(
    (article.source && article.source.name) || "Unknown"
  );
  const dateStr = formatPublished(article.publishedAt);
  const link =
    article.url && article.url.startsWith("http") ? esc(article.url) : "#";

  const detailsHtml =
    `<div class="card-details">` +
    `<p><span class="meta-label">Source:</span> ${src}</p>` +
    (dateStr
      ? `<p><span class="meta-label">Published on:</span> ${dateStr}</p>`
      : "") +
    `</div>`;

  return (
    `<article class="card">` +
    (thumb || "") +
    `<div class="card-body">` +
    detailsHtml +
    `<h2 class="card-title"><a href="${link}" target="_blank" rel="noopener noreferrer">${esc(article.title || "")}</a></h2>` +
    `<p class="card-desc">${esc(article.description || "No description.")}</p>` +
    `<div class="card-actions">` +
    `<button type="button" class="btn-fav ${isFav ? "is-fav" : ""}" data-id="${esc(id)}">` +
    `${isFav ? "Saved" : "Save Article"}` +
    `</button>` +
    `<a class="link-out" href="${link}" target="_blank" rel="noopener noreferrer">Read More →</a>` +
    `</div></div></article>`
  );
};

const updateList = () => {
  const list = getFilteredAndSorted();
  resultCount.textContent = String(list.length);

  if (list.length === 0) {
    const isEmptyFeed = allArticles.length === 0;
    if (isEmptyFeed) {
      container.innerHTML =
        `<div class="empty"><h2>No articles available right now. Please try again later.</h2></div>`;
    } else {
      container.innerHTML =
        `<div class="empty">` +
        `<h2>No articles match your search.</h2>` +
        `<p>Clear the search box or try different keywords.</p>` +
        `</div>`;
    }
    return;
  }

  container.innerHTML = list.map(buildCardHtml).join("");
  bindFavoriteButtons(container, list);
};

const debouncedUpdate = debounce(updateList, 320);

const applyThemeToUi = (isDark) => {
  themeBtn.querySelector(".theme-label").textContent = isDark
    ? "Light theme"
    : "Dark theme";
};

const setupTheme = () => {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = saved === "dark" || (!saved && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
  applyThemeToUi(dark);
};

themeBtn.addEventListener("click", () => {
  const next = !document.documentElement.classList.contains("dark");
  document.documentElement.classList.toggle("dark", next);
  localStorage.setItem(THEME_KEY, next ? "dark" : "light");
  applyThemeToUi(next);
});

document.querySelectorAll(".nav-link[data-nav]").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    showView(link.dataset.nav);
  });
});

document.querySelectorAll(".btn-category").forEach((btn) => {
  btn.addEventListener("click", () => {
    const cat = btn.getAttribute("data-category");
    if (cat) {
      categorySelect.value = cat;
    }
    showView("home");
    loadNews();
  });
});

searchBtn.addEventListener("click", loadNews);
categorySelect.addEventListener("change", loadNews);
sortSelect.addEventListener("change", updateList);
searchInput.addEventListener("input", debouncedUpdate);

setupTheme();
showView("home");
loadNews();
