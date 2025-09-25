# -*- coding: utf-8 -*-
from pathlib import Path

path = Path('js/app.js')
text = path.read_text(encoding='utf-8')
if 'async function resolvePlaceName' not in text:
    marker = "function persistLast({ current, forecast, place }) {\n  const payload = {\n    current,\n    forecast,\n    place,\n    ts: Date.now(),\n  };\n  localStorage.setItem(KEY_LAST, JSON.stringify(payload));\n}\n"
    if marker not in text:
        raise SystemExit('persistLast marker not found')
    insert = "\nasync function resolvePlaceName(lat, lon, apiKey) {\n  try {\n    const url = 'https://api.openweathermap.org/geo/1.0/reverse?lat=' + lat + '&lon=' + lon + '&limit=1&appid=' + apiKey;\n    const results = await fetchJSON(url);\n    if (Array.isArray(results) && results.length) {\n      return formatPlace({ name: results[0].name, country: results[0].country });\n    }\n  } catch (error) {\n    console.warn('Không thể xác định tên địa điểm', error);\n  }\n  return '';\n}\n"
    text = text.replace(marker, marker + insert)
    path.write_text(text, encoding='utf-8')
