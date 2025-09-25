// Weather PWA powered by OpenWeatherMap
const $ = (selector) => document.querySelector(selector);
const statusEl = $("#status");
const cityEl = $("#city");
const apiKeyEl = $("#apiKey");
const iconEl = $("#icon");
const tempEl = $("#temp");
const descEl = $("#desc");
const humidityEl = $("#humidity");
const windEl = $("#wind");
const updatedEl = $("#updated");
const forecastEl = $("#forecast");
const forecastModesEl = document.getElementById("forecastModes");
const forecastSummaryEl = document.getElementById("forecastSummary");
const refreshBtn = document.getElementById("refresh");
const useLocationBtn = document.getElementById("useLocation");
const installBtn = document.getElementById("installBtn");
const currentCard = document.getElementById("current");
const detailDialog = document.getElementById("detailDialog");
const detailTitleEl = document.getElementById("detailTitle");
const detailBodyEl = document.getElementById("detailBody");
const detailCloseBtn = detailDialog
  ? detailDialog.querySelector(".detail-close")
  : null;
const refreshLabel = refreshBtn ? refreshBtn.textContent : "Lấy dữ liệu";
const locationLabel = useLocationBtn
  ? useLocationBtn.textContent
  : "Dùng vị trí hiện tại";

const KEY_SETTINGS = "weatherSettings";
const KEY_LAST = "weatherLast";
const DEFAULT_API_KEY = "dd65b83e119e689a2311bdfdb435371f";
const HOURLY_TILE_COUNT = 12;
const FORECAST_MODE_KEYS = {
  hourly: "hourly",
};
const FORECAST_MODE_ORDER = ["hourly"];
const VIETNAM_UTC_OFFSET = 7 * 3600;

const LS = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(KEY_SETTINGS) || "{}");
    } catch (error) {
      console.warn("Cannot parse settings", error);
      return {};
    }
  },
  set(value) {
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(value));
  },
};

const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour12: false,
  timeZone: "UTC",
});

const decimalFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

const integerFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 0,
});

let deferredPrompt;
const saved = LS.get();
if (!saved.apiKey) {
  saved.apiKey = DEFAULT_API_KEY;
  LS.set(saved);
}
if (saved.city) {
  cityEl.value = saved.city;
}
if (apiKeyEl) {
  apiKeyEl.value = saved.apiKey || DEFAULT_API_KEY;
}

const initialCoords = normalizeCoords(saved.coords);
if (initialCoords) {
  saved.coords = initialCoords;
} else {
  delete saved.coords;
}
if (saved.lastSource !== "coords" && saved.lastSource !== "city") {
  delete saved.lastSource;
}

let latestCurrent = null;
let latestForecast = [];
let latestForecastPayload = null;
let latestForecastMode = "hourly";
let currentPlace = saved.city || "";
let currentTimezoneOffset = VIETNAM_UTC_OFFSET;
let latestForecastMeta = {
  place: currentPlace,
  timezone: VIETNAM_UTC_OFFSET,
  source: "forecast",
  availableModes: { hourly: false },
};
let lastFocusedElement = null;
if (detailDialog) {
  detailDialog.setAttribute("aria-hidden", "true");
  detailDialog.classList.add("hidden");
}

if (detailCloseBtn && detailDialog) {
  detailCloseBtn.addEventListener("click", closeDetailDialog);
  detailDialog.addEventListener("click", (event) => {
    if (event.target === detailDialog) {
      closeDetailDialog();
    }
  });
}

if (currentCard) {
  currentCard.addEventListener("click", () => {
    if (latestCurrent) {
      openCurrentDetail();
    }
  });
  currentCard.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && latestCurrent) {
      event.preventDefault();
      openCurrentDetail();
    }
  });
}

if (forecastEl) {
  forecastEl.addEventListener("click", (event) => {
    const tile = event.target.closest(".tile");
    if (!tile) {
      return;
    }
    const index = Number(tile.dataset.index);
    if (!Number.isNaN(index)) {
      openForecastDetail(index);
    }
  });
}

if (forecastModesEl) {
  forecastModesEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-forecast-mode]");
    if (!button) {
      return;
    }
    const mode = button.dataset.forecastMode;
    if (!mode || button.disabled) {
      return;
    }
    renderForecast(null, { mode });
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  if (installBtn) {
    installBtn.hidden = false;
  }
});

if (installBtn) {
  installBtn.addEventListener("click", async () => {
    installBtn.hidden = true;
    if (!deferredPrompt) {
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  });
}

function openDetailDialog(title, bodyHtml) {
  if (!detailDialog || !detailTitleEl || !detailBodyEl) {
    return;
  }
  lastFocusedElement = document.activeElement;
  detailTitleEl.textContent = title || "";
  detailBodyEl.innerHTML = bodyHtml || "";
  detailDialog.classList.remove("hidden");
  detailDialog.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  document.addEventListener("keydown", onDetailKeydown);
  const closeButton =
    detailCloseBtn || detailDialog.querySelector(".detail-close");
  if (closeButton) {
    closeButton.focus({ preventScroll: true });
  } else {
    detailDialog.focus({ preventScroll: true });
  }
}

function getApiKey() {
  const value = typeof saved.apiKey === "string" ? saved.apiKey.trim() : "";
  return value || DEFAULT_API_KEY;
}

function normalizeCoords(input) {
  if (!input || typeof input !== "object") {
    return null;
  }
  const lat = Number(input.lat ?? input.latitude);
  const lon = Number(input.lon ?? input.lng ?? input.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return { lat, lon };
}

function getSavedCoords() {
  const coords = normalizeCoords(saved.coords);
  if (!coords) {
    return null;
  }
  return { ...coords };
}

function updateSettings(patch) {
  const next = { ...patch };
  if (typeof next.apiKey === "string") {
    next.apiKey = next.apiKey.trim() || DEFAULT_API_KEY;
  }
  if ("coords" in next) {
    const coords = normalizeCoords(next.coords);
    if (coords) {
      next.coords = coords;
    } else {
      delete next.coords;
      delete saved.coords;
    }
  }
  if ("lastSource" in next) {
    if (next.lastSource !== "coords" && next.lastSource !== "city") {
      delete next.lastSource;
    }
  }
  Object.assign(saved, next);
  if (!saved.apiKey) {
    saved.apiKey = DEFAULT_API_KEY;
  }
  LS.set(saved);
  if (apiKeyEl && typeof next.apiKey === "string") {
    apiKeyEl.value = saved.apiKey;
  }
}

if (apiKeyEl) {
  apiKeyEl.addEventListener("input", () => {
    updateSettings({ apiKey: apiKeyEl.value });
  });
}

cityEl.addEventListener("input", () => {
  updateSettings({ city: cityEl.value.trim() });
});

const cached = getCachedWeather();
if (cached) {
  renderCurrent(cached.current, cached.place);
  renderForecast(cached.forecast);
  setStatus("Đang hiển thị dữ liệu gần nhất, sẽ cập nhật khi có mạng.");
}

if (refreshBtn) {
  refreshBtn.addEventListener("click", async () => {
    const city = cityEl.value.trim();
    const apiKey = getApiKey();
    updateSettings({ city, apiKey });
    const coords = getSavedCoords();
    const placeHint = saved.city || city;

    if (saved.lastSource === "coords" && coords) {
      await loadByCoords(coords.lat, coords.lon, placeHint, {
        source: "coords",
      });
      return;
    }

    if (city) {
      await loadByCity(city);
      return;
    }

    if (coords) {
      await loadByCoords(coords.lat, coords.lon, placeHint, {
        source: "coords",
      });
    } else {
      setStatus("Nhập tên thành phố hoặc dùng vị trí hiện tại.");
    }
  });
}

if (useLocationBtn) {
  useLocationBtn.addEventListener("click", async () => {
    if (!navigator.geolocation) {
      setStatus("Trình duyệt không hỗ trợ xác định vị trí.");
      return;
    }
    const apiKey = getApiKey();
    const city = cityEl.value.trim();
    updateSettings({ city, apiKey });
    setStatus("Đang lấy vị trí hiện tại...");
    toggleLoading(true);
    let quickFix = null;
    try {
      // Try a fast, possibly cached reading first for instant load
      quickFix = await getQuickCoords({
        enableHighAccuracy: false,
        maximumAge: 120000, // accept up to 2 minutes old for speed
        timeout: 5000,
      });
      toggleLoading(false);
      const qCoords = { lat: quickFix.latitude, lon: quickFix.longitude };
      updateSettings({ coords: qCoords, lastSource: "coords" });
      await loadByCoords(quickFix.latitude, quickFix.longitude, undefined, {
        source: "coords",
      });
      setStatus("Đang tinh chỉnh vị trí để chính xác hơn...");
    } catch (e) {
      // ignore and fallback to fresh high-accuracy flow
    }

    try {
      const fresh = await getFreshCoords({
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
        desiredAccuracy: 50,
        maxWaitMs: 8000,
      });
      // If fresh fix is meaningfully better, reload
      if (!quickFix || isBetterFix(fresh, quickFix)) {
        const coordsPayload = { lat: fresh.latitude, lon: fresh.longitude };
        updateSettings({ coords: coordsPayload, lastSource: "coords" });
        await loadByCoords(fresh.latitude, fresh.longitude, undefined, {
          source: "coords",
        });
      }
      setStatus("Đã cập nhật vị trí chính xác.");
    } catch (error) {
      if (!quickFix) {
        toggleLoading(false);
        setStatus("Không lấy được vị trí: " + (error.message || error));
      } else {
        setStatus("Đã dùng vị trí gần nhất (tạm thời).");
      }
    }
  });
}

// Try to get a fresher and more accurate position using a short-lived watch
function getFreshCoords(options = {}) {
  return new Promise((resolve, reject) => {
    const geoloc = navigator.geolocation;
    if (!geoloc) {
      reject(new Error("Geolocation không khả dụng"));
      return;
    }
    const enableHighAccuracy = options.enableHighAccuracy !== false;
    const maximumAge =
      typeof options.maximumAge === "number" ? options.maximumAge : 0;
    const timeout =
      typeof options.timeout === "number" ? options.timeout : 20000;
    const desiredAccuracy =
      typeof options.desiredAccuracy === "number"
        ? options.desiredAccuracy
        : 50; // meters
    const maxWaitMs =
      typeof options.maxWaitMs === "number" ? options.maxWaitMs : 10000;

    let settled = false;
    let watchId = null;
    const clearAll = () => {
      if (watchId != null) {
        geoloc.clearWatch(watchId);
        watchId = null;
      }
      if (timer) {
        clearTimeout(timer);
      }
    };

    const onSuccess = (pos) => {
      if (settled) return;
      const { latitude, longitude, accuracy } = pos.coords || {};
      if (typeof latitude !== "number" || typeof longitude !== "number") {
        return; // wait for a valid reading
      }
      // Resolve immediately if we meet desired accuracy, otherwise keep first reading after maxWaitMs
      if (typeof accuracy === "number" && accuracy <= desiredAccuracy) {
        settled = true;
        clearAll();
        resolve({ latitude, longitude, accuracy });
      } else if (!firstFix) {
        firstFix = { latitude, longitude, accuracy };
      }
    };

    const onError = (err) => {
      if (settled) return;
      settled = true;
      clearAll();
      reject(err);
    };

    let firstFix = null;
    const timer = setTimeout(() => {
      if (settled) return;
      if (firstFix) {
        settled = true;
        clearAll();
        resolve(firstFix);
      }
    }, maxWaitMs);

    // Safety timeout mirroring the geolocation timeout
    setTimeout(() => {
      if (settled) return;
      settled = true;
      clearAll();
      reject(new Error("Hết thời gian chờ vị trí"));
    }, timeout + 2000);

    try {
      watchId = geoloc.watchPosition(onSuccess, onError, {
        enableHighAccuracy,
        maximumAge,
        timeout,
      });
    } catch (err) {
      // Fallback to single reading
      geoloc.getCurrentPosition(
        (pos) => onSuccess(pos),
        (err2) => onError(err2),
        { enableHighAccuracy, maximumAge, timeout }
      );
    }
  });
}

// Fast, maybe cached geolocation for initial render
function getQuickCoords(options = {}) {
  return new Promise((resolve, reject) => {
    const geoloc = navigator.geolocation;
    if (!geoloc) {
      reject(new Error("Geolocation không khả dụng"));
      return;
    }
    const enableHighAccuracy = !!options.enableHighAccuracy;
    const maximumAge =
      typeof options.maximumAge === "number" ? options.maximumAge : 120000;
    const timeout =
      typeof options.timeout === "number" ? options.timeout : 5000;
    geoloc.getCurrentPosition(
      ({ coords }) =>
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
        }),
      (err) => reject(err),
      { enableHighAccuracy, maximumAge, timeout }
    );
  });
}

function isBetterFix(newFix, oldFix) {
  if (!newFix) return false;
  if (!oldFix) return true;
  const newAcc =
    typeof newFix.accuracy === "number" ? newFix.accuracy : Infinity;
  const oldAcc =
    typeof oldFix.accuracy === "number" ? oldFix.accuracy : Infinity;
  const improvedAccuracy = newAcc < oldAcc * 0.6; // at least 40% better
  const distance = computeDistanceMeters(
    oldFix.latitude,
    oldFix.longitude,
    newFix.latitude,
    newFix.longitude
  );
  const movedFar = distance > 800; // user moved significantly
  return improvedAccuracy || movedFar;
}

function computeDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000; // meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

window.addEventListener("online", () => {
  setStatus("Đã trực tuyến, hãy cập nhật dữ liệu mới.");
});

window.addEventListener("offline", () => {
  setStatus("Đang offline, hiển thị dữ liệu đã lưu nếu có.");
});

(async function bootstrap() {
  if (saved.city) {
    await loadByCity(saved.city);
  } else if (!cached) {
    setStatus("Nhập tên thành phố hoặc dùng vị trí để bắt đầu.");
  }
})();

function getCachedWeather() {
  try {
    const raw = localStorage.getItem(KEY_LAST);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("Cannot parse cached weather", error);
    return null;
  }
}

async function loadByCity(city) {
  try {
    toggleLoading(true);
    setStatus("Đang tìm tọa độ thành phố...");
    const apiKey = getApiKey();
    const geoUrl =
      "https://api.openweathermap.org/geo/1.0/direct?q=" +
      encodeURIComponent(city) +
      "&limit=1&appid=" +
      apiKey +
      "&lang=vi";
    const geo = await fetchJSON(geoUrl);
    if (!Array.isArray(geo) || !geo.length) {
      throw new Error("Không tìm thấy thành phố phù hợp.");
    }
    const { lat, lon, name, country } = geo[0];
    const place = formatPlace({ name, country });
    await loadByCoords(lat, lon, place, { source: "city" });
  } catch (error) {
    toggleLoading(false);
    errorOut(error);
  }
}

async function loadByCoords(lat, lon, placeLabel, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    toggleLoading(false);
    setStatus("Không có API key hợp lệ.");
    return;
  }
  const coordsForRequest = normalizeCoords({ lat, lon });
  if (!coordsForRequest) {
    toggleLoading(false);
    setStatus("Tọa độ không hợp lệ.");
    return;
  }

  const { lat: latValue, lon: lonValue } = coordsForRequest;
  let resolvedPlace = typeof placeLabel === "string" ? placeLabel.trim() : "";

  try {
    toggleLoading(true);
    setStatus("Đang tải dữ liệu thời tiết...");
    const baseParams =
      "lat=" +
      latValue +
      "&lon=" +
      lonValue +
      "&appid=" +
      apiKey +
      "&units=metric&lang=vi";

    const [current, forecast] = await Promise.all([
      fetchJSON(
        "https://api.openweathermap.org/data/2.5/weather?" + baseParams
      ),
      fetchJSON(
        "https://api.openweathermap.org/data/2.5/forecast?lat=" +
          latValue +
          "&lon=" +
          lonValue +
          "&appid=" +
          apiKey +
          "&units=metric&lang=vi"
      ).catch((error) => {
        console.warn("Dữ liệu dự báo 5 ngày/3 giờ không khả dụng", error);
        return null;
      }),
    ]);

    if (!current || (current.cod && Number(current.cod) !== 200)) {
      throw new Error("Không lấy được dữ liệu thời tiết hiện tại.");
    }

    if (!forecast || !Array.isArray(forecast.list) || !forecast.list.length) {
      throw new Error("Không lấy được dữ liệu dự báo.");
    }

    let place = resolvedPlace || pickBestPlace(current, forecast);
    if (!place) {
      place = await resolvePlaceName(latValue, lonValue, apiKey);
    }
    resolvedPlace = place || resolvedPlace || "";

    const settingsPatch = {};
    if (resolvedPlace) {
      settingsPatch.city = resolvedPlace;
    }
    if (options.rememberCoords !== false && coordsForRequest) {
      settingsPatch.coords = coordsForRequest;
    }
    if (options.source === "coords" || options.source === "city") {
      settingsPatch.lastSource = options.source;
    }
    if (Object.keys(settingsPatch).length) {
      updateSettings(settingsPatch);
    }
    if (resolvedPlace && cityEl && cityEl.value.trim() !== resolvedPlace) {
      cityEl.value = resolvedPlace;
    }

    const timezone =
      typeof forecast.city?.timezone === "number"
        ? forecast.city.timezone
        : typeof current.timezone === "number"
        ? current.timezone
        : VIETNAM_UTC_OFFSET;
    // Keep global timezone in sync so local formatting reflects the fetched location
    currentTimezoneOffset = timezone;

    const hourlyItems = buildHourlyTimeline(
      forecast.list,
      HOURLY_TILE_COUNT,
      current
    );

    const forecastPayload = normalizeForecastPayload({
      mode: "hourly",
      place: resolvedPlace,
      timezone,
      source: "forecast",
      hourly: hourlyItems,
    });

    renderCurrent(current, resolvedPlace);
    renderForecast(forecastPayload);
    persistLast({ current, forecast: forecastPayload, place: resolvedPlace });
    setStatus("Đã cập nhật thời tiết mới nhất.");
  } catch (error) {
    handleOfflineFallback(error, resolvedPlace || placeLabel);
  } finally {
    toggleLoading(false);
  }
}

function persistLast({ current, forecast, place }) {
  const payload = {
    current,
    forecast,
    place,
    ts: Date.now(),
  };
  localStorage.setItem(KEY_LAST, JSON.stringify(payload));
}

async function resolvePlaceName(lat, lon, apiKey) {
  try {
    const url =
      "https://api.openweathermap.org/geo/1.0/reverse?lat=" +
      lat +
      "&lon=" +
      lon +
      "&limit=10&appid=" +
      apiKey +
      "&lang=vi";
    const results = await fetchJSON(url);
    if (Array.isArray(results) && results.length) {
      // Prefer city/province-level names, avoid hamlets
      const mapped = results.map((r) => ({
        score: scoreLocationRank(r),
        name: r?.name,
        state: r?.state,
        country: r?.country,
        localNames: r?.local_names,
        raw: r,
      }));
      mapped.sort((a, b) => b.score - a.score);
      const top = mapped[0];
      const name =
        top?.localNames?.vi || top?.name || top?.state || top?.raw?.city;
      const country = top?.country;
      return formatPlace({ name, country });
    }
  } catch (error) {
    console.warn("Không thể xác định tên địa điểm", error);
  }
  return "";
}

function scoreLocationRank(entry) {
  const name = entry?.name || "";
  const state = entry?.state || "";
  const feature = (entry?.feature_type || "").toLowerCase();
  const lcName = stripDiacritics(name).toLowerCase();
  // High score for well-known cities and municipalities
  if (feature.includes("city") || feature.includes("municipality")) return 100;
  // Prefer when state matches name (e.g., Da Nang city)
  if (state && !isSmallLocalityName(name)) return 90;
  // Downrank small localities
  if (isSmallLocalityName(name)) return 10;
  return 50;
}

function handleOfflineFallback(error, placeLabel) {
  const cachedData = getCachedWeather();
  if (cachedData) {
    renderCurrent(cachedData.current, placeLabel || cachedData.place);
    renderForecast(cachedData.forecast);
    setStatus("Không thể cập nhật, đang dùng dữ liệu đã lưu.");
  } else {
    errorOut(error);
  }
}

function renderCurrent(data, placeLabel) {
  if (!data || !tempEl) {
    return;
  }
  const cityName = placeLabel || formatPlace(data);
  document.title = "Weather PWA – " + cityName;
  const tempValue =
    data.main && typeof data.main.temp === "number"
      ? Math.round(data.main.temp)
      : "--";
  tempEl.textContent = tempValue;
  const description =
    Array.isArray(data.weather) && data.weather.length
      ? data.weather[0].description
      : "";
  descEl.textContent = cityName ? cityName + ": " + description : description;
  humidityEl.textContent =
    data.main && typeof data.main.humidity === "number"
      ? data.main.humidity
      : "--";
  windEl.textContent =
    data.wind && typeof data.wind.speed === "number" ? data.wind.speed : "--";
  const timezone =
    typeof data.timezone === "number" ? data.timezone : currentTimezoneOffset;
  updatedEl.textContent = data.dt ? formatDateTimeLocal(data.dt) : "--";
  const icon =
    Array.isArray(data.weather) && data.weather.length
      ? data.weather[0].icon
      : "";
  if (icon) {
    iconEl.src = "https://openweathermap.org/img/wn/" + icon + "@2x.png";
    iconEl.alt = description;
    iconEl.hidden = false;
  } else {
    iconEl.removeAttribute("src");
    iconEl.alt = "";
    iconEl.hidden = true;
  }
  latestCurrent = data;
  currentPlace = cityName;
  currentTimezoneOffset = timezone;
}

function renderForecast(data, options = {}) {
  if (!forecastEl) {
    return;
  }

  if (data) {
    latestForecastPayload = data.__normalized
      ? { ...data }
      : normalizeForecastPayload(data);
  } else if (!latestForecastPayload) {
    forecastEl.innerHTML =
      '<p class="hint">Không có dữ liệu dự báo khả dụng.</p>';
    if (forecastSummaryEl) {
      forecastSummaryEl.textContent = "";
    }
    updateForecastModes({ hourly: false }, "hourly");
    latestForecast = [];
    latestForecastMeta = {
      place: currentPlace,
      timezone: VIETNAM_UTC_OFFSET,
      source: "forecast",
      availableModes: { hourly: false },
    };
    return;
  }

  const payload = latestForecastPayload;
  const availability = {
    hourly: Array.isArray(payload.hourly) && payload.hourly.length > 0,
  };

  const requestedMode =
    options.mode || payload.mode || latestForecastMode || "hourly";
  const mode =
    availability.hourly && requestedMode === "hourly"
      ? "hourly"
      : availability.hourly
      ? "hourly"
      : null;

  if (!mode) {
    forecastEl.innerHTML =
      '<p class="hint">Không có dữ liệu dự báo khả dụng.</p>';
    if (forecastSummaryEl) {
      forecastSummaryEl.textContent = "";
    }
    updateForecastModes(availability, "hourly");
    latestForecast = [];
    latestForecastMeta = {
      place: payload.place || currentPlace || "",
      timezone: payload.timezone ?? VIETNAM_UTC_OFFSET,
      source: payload.source || "unknown",
      availableModes: availability,
    };
    return;
  }

  latestForecastMode = "hourly";
  const items = Array.isArray(payload.hourly) ? payload.hourly : [];
  latestForecast = items;
  currentPlace = payload.place || currentPlace || "";
  latestForecastMeta = {
    place: currentPlace,
    timezone: payload.timezone ?? VIETNAM_UTC_OFFSET,
    source: payload.source || "unknown",
    availableModes: availability,
  };
  latestForecastPayload.mode = "hourly";

  updateForecastModes(availability, "hourly");
  updateForecastSummary("hourly", payload);

  const html = items
    .map((item, index) => {
      const day = formatDayMonth(item.dt);
      const time = formatHourMinute(item.dt);
      const description = capitalize(item.weather?.[0]?.description || "");
      const icon = item.weather?.[0]?.icon;
      const iconHtml = icon
        ? '<img alt="' +
          escapeHTML(description) +
          '" src="https://openweathermap.org/img/wn/' +
          icon +
          '.png" loading="lazy" width="60" height="60" />'
        : "";
      const rainChance = formatRainChance(item.pop);
      const label = escapeHTML(
        (day || "") +
          " " +
          (time || "") +
          " · " +
          (description || "Dự báo theo giờ")
      );
      return (
        '<button type="button" class="tile tile-hourly" data-index="' +
        index +
        '" aria-label="' +
        label +
        '">' +
        '<div class="tile-datetime">' +
        '<span class="tile-time">' +
        time +
        "</span>" +
        '<span class="tile-date">' +
        day +
        "</span>" +
        "</div>" +
        iconHtml +
        '<div class="tile-temp">' +
        formatTemp(item.temp) +
        "</div>" +
        '<div class="tile-extra">Mưa: ' +
        rainChance +
        "</div>" +
        '<div class="tile-desc">' +
        escapeHTML(description) +
        "</div>" +
        "</button>"
      );
    })
    .join("");

  forecastEl.innerHTML =
    html || '<p class="hint">Không có dữ liệu dự báo khả dụng.</p>';
}

function normalizeForecastPayload(data = {}) {
  if (data && data.__normalized) {
    return { ...data };
  }

  const payload = {
    mode: typeof data.mode === "string" ? data.mode : undefined,
    place: data.place || currentPlace || "",
    timezone:
      typeof data.timezone === "number" ? data.timezone : VIETNAM_UTC_OFFSET,
    source: data.source || "unknown",
    hourly: [],
    __normalized: true,
  };

  if (payload.mode !== "hourly") {
    payload.mode = undefined;
  }

  if (Array.isArray(data.hourly)) {
    payload.hourly = data.hourly
      .slice(0, HOURLY_TILE_COUNT)
      .map(normalizeHourlyForecast);
  } else if (Array.isArray(data.list)) {
    payload.hourly = buildHourlyTimeline(data.list, HOURLY_TILE_COUNT);
  }

  return payload;
}

function updateForecastModes(availability, activeMode) {
  if (!forecastModesEl) {
    return;
  }
  const normalized = { hourly: false, ...(availability || {}) };
  const buttons = forecastModesEl.querySelectorAll("[data-forecast-mode]");
  buttons.forEach((button) => {
    const mode = button.dataset.forecastMode;
    const isAvailable = Boolean(normalized[mode]);
    button.disabled = !isAvailable;
    button.classList.toggle("active", isAvailable && mode === activeMode);
    button.setAttribute(
      "aria-pressed",
      isAvailable && mode === activeMode ? "true" : "false"
    );
    button.classList.toggle("mode-disabled", !isAvailable);
  });
}

function updateForecastSummary(mode, payload) {
  if (!forecastSummaryEl) {
    return;
  }
  forecastSummaryEl.textContent = "";
  forecastSummaryEl.hidden = true;
}

function formatRainChance(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  if (value > 1) {
    return formatPercent(value);
  }
  return formatPercent(value, { fromFraction: true });
}

function normalizeHourlyForecast(entry = {}) {
  const weather = Array.isArray(entry.weather) ? entry.weather : [];
  const rainValue =
    typeof entry.rain === "number"
      ? entry.rain
      : typeof entry.rain?.["1h"] === "number"
      ? entry.rain["1h"]
      : typeof entry.rain?.["3h"] === "number"
      ? entry.rain["3h"]
      : undefined;
  const snowValue =
    typeof entry.snow === "number"
      ? entry.snow
      : typeof entry.snow?.["1h"] === "number"
      ? entry.snow["1h"]
      : typeof entry.snow?.["3h"] === "number"
      ? entry.snow["3h"]
      : undefined;
  const cloudsValue =
    typeof entry.clouds === "number" ? entry.clouds : entry.clouds?.all;
  return {
    dt: entry.dt,
    temp: entry.temp ?? entry.main?.temp,
    feels_like: entry.feels_like ?? entry.main?.feels_like ?? entry.temp,
    humidity: entry.humidity ?? entry.main?.humidity,
    pressure: entry.pressure ?? entry.main?.pressure,
    clouds: typeof cloudsValue === "number" ? cloudsValue : undefined,
    pop: typeof entry.pop === "number" ? entry.pop : undefined,
    rain: typeof rainValue === "number" ? rainValue : undefined,
    snow: typeof snowValue === "number" ? snowValue : undefined,
    wind_speed: entry.wind_speed ?? entry.wind?.speed,
    wind_gust: entry.wind_gust ?? entry.wind?.gust,
    wind_deg: entry.wind_deg ?? entry.wind?.deg,
    visibility: entry.visibility,
    weather,
    precipLabel: "Mưa (1h)",
    snowLabel: "Tuyết (1h)",
  };
}
function normalizeForecastItem(entry = {}) {
  const weather = Array.isArray(entry.weather) ? entry.weather : [];
  const main = entry.main || {};
  const temp = entry.temp ?? main.temp;
  const tempMax = entry.temp_max ?? main.temp_max ?? temp;
  const tempMin = entry.temp_min ?? main.temp_min ?? temp;
  const humidity = entry.humidity ?? main.humidity;
  const pressure = entry.pressure ?? main.pressure;
  const cloudsValue = entry.clouds?.all ?? entry.clouds;
  const rainValue =
    typeof entry.rain === "number" ? entry.rain : entry.rain?.["3h"];
  const snowValue =
    typeof entry.snow === "number" ? entry.snow : entry.snow?.["3h"];
  return {
    dt: entry.dt,
    temp,
    feels_like: entry.feels_like ?? main.feels_like ?? temp,
    temp_max: tempMax,
    temp_min: tempMin,
    humidity,
    pressure,
    clouds: typeof cloudsValue === "number" ? cloudsValue : undefined,
    pop: typeof entry.pop === "number" ? entry.pop : undefined,
    rain: typeof rainValue === "number" ? rainValue : undefined,
    snow: typeof snowValue === "number" ? snowValue : undefined,
    wind_speed: entry.wind_speed ?? entry.wind?.speed,
    wind_gust: entry.wind_gust ?? entry.wind?.gust,
    wind_deg: entry.wind_deg ?? entry.wind?.deg,
    visibility: entry.visibility,
    weather,
    precipLabel: "Mưa (3h)",
    snowLabel: "Tuyết (3h)",
  };
}

function openCurrentDetail() {
  if (!latestCurrent) {
    return;
  }
  const data = latestCurrent;
  const title = "Chi tiết thời tiết hiện tại · " + (currentPlace || "—");
  const description =
    Array.isArray(data.weather) && data.weather.length
      ? capitalize(data.weather[0].description)
      : "";
  const entries = [
    ["Trạng thái", description],
    ["Nhiệt độ", formatTemp(data.main?.temp)],
    ["Cảm nhận", formatTemp(data.main?.feels_like)],
    ["Cao / Thấp", formatTempRange(data.main?.temp_max, data.main?.temp_min)],
    ["Độ ẩm", formatPercent(data.main?.humidity)],
    ["Áp suất", formatPressure(data.main?.pressure)],
    ["Áp suất mực biển", formatPressure(data.main?.sea_level)],
    ["Áp suất mặt đất", formatPressure(data.main?.grnd_level)],
    ["Tầm nhìn", formatVisibility(data.visibility)],
    ["Mây", formatPercent(data.clouds?.all)],
    ["Gió", formatWindSpeed(data.wind?.speed)],
    ["Gió giật", formatWindSpeed(data.wind?.gust)],
    ["Hướng gió", formatWindDirection(data.wind?.deg)],
    ["Bình minh", formatHourMinute(data.sys?.sunrise)],
    ["Hoàng hôn", formatHourMinute(data.sys?.sunset)],
    ["Cập nhật", formatDateTimeLocal(data.dt)],
  ];
  const body = renderDetailList(entries);
  openDetailDialog(
    title,
    body +
      '<p class="detail-note">Dữ liệu hiện tại do OpenWeatherMap cung cấp.</p>'
  );
}

function openForecastDetail(index) {
  const list = latestForecast;
  const item = list?.[index];
  if (!item) {
    return;
  }
  const place = latestForecastMeta.place || currentPlace || "—";
  const description = capitalize(item.weather?.[0]?.description || "");
  const entries = [];

  entries.push(["Thời gian", formatDateTimeLocal(item.dt)]);
  entries.push(["Trạng thái", description]);
  entries.push(["Nhiệt độ", formatTemp(item.temp)]);
  entries.push(["Cảm nhận", formatTemp(item.feels_like)]);
  entries.push(["Độ ẩm", formatPercent(item.humidity)]);
  entries.push(["Áp suất", formatPressure(item.pressure)]);
  entries.push(["Mây", formatPercent(item.clouds)]);
  entries.push(["Khả năng mưa", formatRainChance(item.pop)]);
  entries.push([
    item.precipLabel || "Mưa (1h)",
    formatPrecipitation(item.rain),
  ]);
  entries.push([
    item.snowLabel || "Tuyết (1h)",
    formatPrecipitation(item.snow),
  ]);
  entries.push(["Gió", formatWindSpeed(item.wind_speed)]);
  entries.push(["Gió giật", formatWindSpeed(item.wind_gust)]);
  entries.push(["Hướng gió", formatWindDirection(item.wind_deg)]);
  entries.push(["Tầm nhìn", formatVisibility(item.visibility)]);

  const body = renderDetailList(entries);
  openDetailDialog(
    "Chi tiết dự báo · " + place,
    body + '<p class="detail-note">Mỗi mốc cách nhau 1 giờ.</p>'
  );
}

function closeDetailDialog() {
  if (!detailDialog || detailDialog.classList.contains("hidden")) {
    return;
  }
  detailDialog.classList.add("hidden");
  detailDialog.setAttribute("aria-hidden", "true");
  detailBodyEl.innerHTML = "";
  document.body.classList.remove("modal-open");
  document.removeEventListener("keydown", onDetailKeydown);
  if (lastFocusedElement && document.contains(lastFocusedElement)) {
    lastFocusedElement.focus({ preventScroll: true });
  }
  lastFocusedElement = null;
}

function onDetailKeydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeDetailDialog();
  }
}

function renderDetailList(entries) {
  const rows = entries.filter(
    ([, value]) => value && value !== "--" && value !== "-- / --"
  );
  if (!rows.length) {
    return '<p class="detail-note">Không có dữ liệu chi tiết để hiển thị.</p>';
  }
  return (
    '<dl class="detail-grid">' +
    rows
      .map(
        ([label, value]) =>
          "<dt>" +
          escapeHTML(label) +
          "</dt><dd>" +
          escapeHTML(String(value)) +
          "</dd>"
      )
      .join("") +
    "</dl>"
  );
}

function fetchJSON(url) {
  return fetch(url, { cache: "no-store" }).then((response) => {
    if (!response.ok) {
      throw new Error("API lỗi: " + response.status);
    }
    return response.json();
  });
}

function formatPlace(data) {
  const name = data?.name || "";
  const country = data?.sys?.country || data?.country || "";
  const merged = [name, country].filter(Boolean).join(", ");
  return merged || name || country || "";
}

// Prefer broader, well-known city names from forecast.city over granular hamlet names from current.name
function pickBestPlace(current, forecast) {
  try {
    const forecastCity = forecast?.city;
    const forecastName = forecastCity?.name;
    const forecastCountry = forecastCity?.country;
    if (forecastName && !isSmallLocalityName(forecastName)) {
      return formatPlace({ name: forecastName, country: forecastCountry });
    }
    if (current && current.name && !isSmallLocalityName(current.name)) {
      return formatPlace(current);
    }
  } catch (e) {
    // ignore
  }
  return ""; // force reverse geocoding fallback
}

function isSmallLocalityName(name) {
  if (!name) return true;
  const raw = String(name);
  const ascii = stripDiacritics(raw).toLowerCase();
  if (raw.length <= 6) return true; // very short like "Ấp Bàc", "Thôn A"
  const smallKeywords = [
    "ap ",
    "ap ",
    "thôn",
    "thon",
    "xom",
    "ấp",
    "ban ",
    "phum ",
    "buon ",
    "thon ",
  ];
  return smallKeywords.some((kw) => ascii.includes(kw));
}

function stripDiacritics(text) {
  try {
    return String(text)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  } catch (_) {
    return String(text);
  }
}

function toggleLoading(isLoading) {
  if (refreshBtn) {
    refreshBtn.disabled = isLoading;
    refreshBtn.textContent = isLoading ? "Đang tải..." : refreshLabel;
  }
  if (useLocationBtn) {
    useLocationBtn.disabled = isLoading;
    useLocationBtn.textContent = isLoading ? "Đang xử lý..." : locationLabel;
  }
}

function setStatus(message) {
  statusEl.textContent = message || "";
}

function errorOut(error) {
  console.error(error);
  setStatus("Lỗi: " + (error.message || error));
}

function formatTemp(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  return Math.round(value) + "°C";
}

function formatTempRange(max, min) {
  const hasMax = typeof max === "number" && !Number.isNaN(max);
  const hasMin = typeof min === "number" && !Number.isNaN(min);
  if (!hasMax && !hasMin) {
    return "--";
  }
  const top = hasMax ? Math.round(max) + "°C" : "--";
  const bottom = hasMin ? Math.round(min) + "°C" : "--";
  return top + " / " + bottom;
}

function formatPressure(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  return integerFormatter.format(value) + " hPa";
}

function formatVisibility(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  if (value >= 1000) {
    return decimalFormatter.format(value / 1000) + " km";
  }
  return integerFormatter.format(value) + " m";
}

function formatWindSpeed(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  return decimalFormatter.format(value) + " m/s";
}

function formatWindDirection(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  const directions = [
    "Bắc",
    "Đông Bắc",
    "Đông",
    "Đông Nam",
    "Nam",
    "Tây Nam",
    "Tây",
    "Tây Bắc",
  ];
  const index = Math.round(value / 45) % directions.length;
  return directions[index] + " (" + Math.round(value) + "°)";
}

function formatPercent(value, options = {}) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  const percent = options.fromFraction ? value * 100 : value;
  return Math.round(percent) + "%";
}

function formatPrecipitation(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  return decimalFormatter.format(value) + " mm";
}

function formatHourMinute(timestamp) {
  if (typeof timestamp !== "number" || Number.isNaN(timestamp)) {
    return "--";
  }
  const offset =
    typeof currentTimezoneOffset === "number"
      ? currentTimezoneOffset
      : VIETNAM_UTC_OFFSET;
  const date = new Date((timestamp + offset) * 1000);
  return timeFormatter.format(date);
}

function formatDateTimeLocal(timestamp) {
  if (typeof timestamp !== "number" || Number.isNaN(timestamp)) {
    return "--";
  }
  const offset =
    typeof currentTimezoneOffset === "number"
      ? currentTimezoneOffset
      : VIETNAM_UTC_OFFSET;
  const date = new Date((timestamp + offset) * 1000);
  return dateTimeFormatter.format(date);
}

function formatDayMonth(timestamp) {
  if (typeof timestamp !== "number" || Number.isNaN(timestamp)) {
    return "";
  }
  const offset =
    typeof currentTimezoneOffset === "number"
      ? currentTimezoneOffset
      : VIETNAM_UTC_OFFSET;
  const date = new Date((timestamp + offset) * 1000);
  return dateFormatter.format(date);
}

function capitalize(text) {
  if (!text) {
    return "";
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function escapeHTML(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHourlyTimeline(
  list = [],
  limit = HOURLY_TILE_COUNT,
  current = null
) {
  const result = [];
  // Compute next hour in the target timezone to match display
  const tz =
    typeof current?.timezone === "number"
      ? current.timezone
      : currentTimezoneOffset;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const localSeconds = nowSeconds + tz;
  const nextHourUtc = Math.floor(localSeconds / 3600) * 3600 + 3600 - tz;
  for (const entry of list) {
    if (!entry || typeof entry.dt !== "number") {
      continue;
    }
    const normalized = normalizeForecastItem(entry);
    for (let offset = 0; offset < 3 && result.length < limit; offset += 1) {
      const hourTs = normalized.dt + offset * 3600;
      if (hourTs < nextHourUtc) {
        continue; // skip past hours and the current hour
      }
      result.push({
        ...normalized,
        dt: hourTs,
        precipLabel: "Mưa (1h)",
        snowLabel: "Tuyết (1h)",
      });
    }
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}
