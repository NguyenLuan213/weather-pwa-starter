from pathlib import Path

old = """async function loadByCoords(lat, lon, placeLabel) {
  const apiKey = getApiKey();
  if (!apiKey) {
    toggleLoading(false);
    setStatus('Không có API key hợp lệ.');
    return;
  }
  try {
    toggleLoading(true);
    setStatus('Đang tải dữ liệu thời tiết...');
    const baseParams = lat=&lon=&appid=&units=metric&lang=vi;
    const [current, hourly] = await Promise.all([
      fetchJSON(https://api.openweathermap.org/data/2.5/weather?),
      fetchJSON(https://api.openweathermap.org/data/2.5/onecall?&exclude=current,minutely,daily,alerts).catch((error) => {
        console.warn('Hourly forecast unavailable', error);
        return null;
      }),
    ]);
    const place = placeLabel || formatPlace(current);
    let forecastPayload = null;

    if (hourly?.hourly?.length) {
      forecastPayload = {
        mode: 'hourly',
        place,
        timezone: typeof hourly.timezone_offset === 'number' ? hourly.timezone_offset : current.timezone ?? 0,
        hourly: hourly.hourly.slice(0, 24),
      };
    } else {
      const fallback = await fetchJSON(https://api.openweathermap.org/data/2.5/forecast?).catch((error) => {
        console.warn('3-hour forecast unavailable', error);
        return null;
      });
      if (fallback?.list?.length) {
        forecastPayload = {
          mode: 'three-hour',
          place: fallback.city ? formatPlace({ name: fallback.city.name, country: fallback.city.country }) : place,
          timezone: typeof fallback.city?.timezone === 'number' ? fallback.city.timezone : current.timezone ?? 0,
          list: fallback.list.slice(0, 8),
        };
      }
    }

    renderCurrent(current, place);
    renderForecast(forecastPayload);
    persistLast({ current, forecast: forecastPayload, place });
    setStatus('Đã cập nhật thời tiết mới nhất.');
  } catch (error) {
    handleOfflineFallback(error, placeLabel);
  } finally {
    toggleLoading(false);
  }
}
"""

new = """async function loadByCoords(lat, lon, placeLabel) {
  const apiKey = getApiKey();
  if (!apiKey) {
    toggleLoading(false);
    setStatus('Không có API key hợp lệ.');
    return;
  }
  try {
    toggleLoading(true);
    setStatus('Đang tải dữ liệu thời tiết...');
    const baseParams = lat=&lon=&appid=&units=metric&lang=vi;
    const [current, hourly] = await Promise.all([
      fetchJSON(https://api.openweathermap.org/data/2.5/weather?),
      fetchJSON(https://api.openweathermap.org/data/2.5/onecall?&exclude=current,minutely,daily,alerts).catch((error) => {
        console.warn('Hourly forecast unavailable', error);
        return null;
      }),
    ]);
    let place = placeLabel || formatPlace(current);
    if (!place) {
      place = await resolvePlaceName(lat, lon, apiKey);
    }

    let forecastPayload = null;
    if (hourly?.hourly?.length) {
      forecastPayload = {
        mode: 'hourly',
        place,
        timezone: typeof hourly.timezone_offset === 'number' ? hourly.timezone_offset : current.timezone ?? 0,
        hourly: hourly.hourly,
      };
    } else {
      const fallback = await fetchJSON(https://api.openweathermap.org/data/2.5/forecast?).catch((error) => {
        console.warn('3-hour forecast unavailable', error);
        return null;
      });
      if (fallback?.list?.length) {
        forecastPayload = {
          mode: 'three-hour',
          place: fallback.city ? formatPlace({ name: fallback.city.name, country: fallback.city.country }) : place,
          timezone: typeof fallback.city?.timezone === 'number' ? fallback.city.timezone : current.timezone ?? 0,
          list: fallback.list,
        };
      }
    }

    renderCurrent(current, place);
    renderForecast(forecastPayload);
    persistLast({ current, forecast: forecastPayload, place });
    setStatus('Đã cập nhật thời tiết mới nhất.');
  } catch (error) {
    handleOfflineFallback(error, placeLabel);
  } finally {
    toggleLoading(false);
  }
}
"""

path = Path('js/app.js')
text = path.read_text(encoding='utf-8')
if old not in text:
    raise SystemExit('original loadByCoords block not found')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
