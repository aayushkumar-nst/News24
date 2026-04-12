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

// --- GNews API (works in the browser — no CORS proxy needed) ---
const API_KEY = "1a2dc120e38a4e64b0de4a8bcd8f2523";

/** Shown when an article has no image or the image fails to load */
const FALLBACK_IMAGE =
  "https://placehold.co/640x400/e5e7eb/475569?text=News+24";

/** Dropdown values → GNews `topic` (API has no exact “category” like NewsAPI) */
const CATEGORY_TO_TOPIC = {
  general: "general",
  sports: "sports",
  technology: "technology",
  business: "business",
};

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
 * GNews uses `image`; saved items use `urlToImage`. One helper for both.
 */
const getArticleImageUrl = (article) => {
  const u = article.urlToImage || article.image;
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
 * GNews uses `image`; we normalize to `urlToImage` so cards & saved list stay the same.
 */
const normalizeGNewsArticle = (raw) => {
  const src = raw.source;
  let sourceName = "Unknown";
  if (typeof src === "string") {
    sourceName = src;
  } else if (src && src.name) {
    sourceName = src.name;
  }
  return {
    title: raw.title,
    description: raw.description || "",
    url: raw.url,
    urlToImage: (raw.image && String(raw.image).trim()) || "",
    publishedAt: raw.publishedAt,
    source: { name: sourceName },
  };
};

/**
 * Direct fetch to GNews (CORS allowed for browser apps on their plan).
 */
const fetchTopHeadlines = async (category) => {
  const key = String(API_KEY).trim();
  if (!key) {
    throw new Error("nokey");
  }

  const topic = CATEGORY_TO_TOPIC[category] || "general";
  const url = `https://gnews.io/api/v4/top-headlines?lang=en&country=in&max=10&apikey=${key}&topic=${encodeURIComponent(
    topic
  )}`;
  console.log(url);

  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));

  if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
    throw new Error(String(data.errors[0]));
  }

  if (!response.ok) {
    throw new Error(data.message || response.statusText || "Request failed");
  }

  if (!Array.isArray(data.articles)) {
    throw new Error("Unexpected response from GNews");
  }

  return data.articles.map(normalizeGNewsArticle);
};

const cleanArticles = (articles) =>
  articles.filter(
    (a) => a && a.title && a.title !== "[Removed]"
  );

const loadNews = async () => {
  setLoading(true);
  hideBanner();
  const category = categorySelect.value;

  try {
    const raw = await fetchTopHeadlines(category);
    allArticles = cleanArticles(raw);

    if (allArticles.length === 0) {
      showBanner(
        "No articles available right now. Please try again later.",
        "info"
      );
    }
  } catch (err) {
    allArticles = [];
    if (err.message === "nokey") {
      showBanner("API key is empty. Set const API_KEY in script.js.", "error");
    } else {
      showBanner(`Could not load news: ${err.message}`, "error");
    }
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
