# Weather PWA Starter

Ứng dụng PWA xem thời tiết hiện tại và dự báo theo giờ, hoạt động tốt cả khi offline. Dự án dùng OpenWeatherMap, Service Worker để cache tĩnh và runtime, cùng UI đơn giản, thân thiện.

## Tính năng chính

- Hiển thị thời tiết hiện tại (nhiệt độ, mô tả, độ ẩm, gió, thời điểm cập nhật, icon thời tiết)
- Dự báo theo giờ (12 mốc kế tiếp), kèm xác suất mưa và mô tả ngắn
- Xem chi tiết khi:
  - Bấm vào thẻ “Hiện tại” → mở dialog chi tiết
  - Bấm một card dự báo → mở dialog chi tiết mốc đó
- Lấy vị trí hiện tại nhanh và tinh chỉnh chính xác (quick fix → high-accuracy)
- Tự động chuẩn hóa địa danh để hiển thị cấp thành phố/tỉnh (ví dụ: “Thành phố Đà Nẵng, VN”)
- Hoạt động offline nhờ Service Worker: cache asset tĩnh và cache runtime cho API khi có mạng
- PWA: có manifest, icon, hỗ trợ cài đặt ứng dụng

## Cấu trúc thư mục

```
.
├─ index.html
├─ css/
│  └─ styles.css
├─ js/
│  └─ app.js
├─ sw.js                  # Service Worker (cache tĩnh + runtime)
├─ manifest.webmanifest   # PWA manifest
└─ icons/
   ├─ icon-192.png
   └─ icon-512.png
```

## Yêu cầu

- Trình duyệt hiện đại (Chrome/Edge/Firefox/Safari)
- Chạy qua HTTP(S) server cục bộ hoặc deploy (geolocation KHÔNG hoạt động khi mở file trực tiếp `file://`)
- Mặc định đã cấu hình API key demo của OpenWeatherMap trong `index.html`/`app.js`. Bạn có thể thay bằng key của riêng bạn.

## Chạy dự án cục bộ

Tại thư mục gốc dự án, mở terminal/PowerShell và chọn một trong các cách:

Python 3 (cổng 5173):

```bash
py -m http.server 5173
```

Node (không cần cài global):

```bash
npx http-server . -p 5173 -c-1
```

Mở trình duyệt tới `http://localhost:5173`.

Lưu ý:

- Khi trình duyệt hỏi quyền “Location”, hãy chọn Cho phép để dùng chức năng “Dùng vị trí hiện tại”.
- Nếu chạy qua HTTPS (khuyến nghị khi deploy), geolocation sẽ luôn hoạt động.

## Cách sử dụng

1. Nhập tên thành phố (VD: "Thành phố Đà Nẵng") hoặc bấm “Dùng vị trí hiện tại”.
2. Bấm “Lấy dữ liệu” để cập nhật (nếu dùng nhập thành phố).
3. Xem phần “Hiện tại” và danh sách “Dự báo”.
4. Bấm vào thẻ “Hiện tại” để xem chi tiết; bấm vào từng card dự báo để xem chi tiết mốc giờ.
5. Có thể cài ứng dụng (PWA) bằng nút “Cài đặt” khi trình duyệt cho phép.

## Ghi chú về vị trí và múi giờ

- Ứng dụng dùng 2 bước khi lấy vị trí: đọc nhanh (có thể từ cache) để hiển thị tức thì, sau đó tinh chỉnh bằng phép đo chính xác cao; nếu kết quả mới “tốt hơn đáng kể” sẽ tự cập nhật lại.
- Thời gian hiển thị theo giờ địa phương của địa điểm dựa trên `timezone` từ API (không dùng múi giờ cố định).

## Cache & Offline

- `sw.js` precache các asset tĩnh (`index.html`, CSS, JS, manifest, icons`).
- Với yêu cầu OpenWeather API: áp dụng chiến lược “network-first” (ưu tiên mạng, fallback cache).
- Khi offline, ứng dụng sẽ hiển thị dữ liệu đã lưu gần nhất (nếu có).

## Tuỳ biến API Key

- Key mặc định: được đặt trong input ẩn `#apiKey` và sử dụng trong `js/app.js`.
- Để thay key: sửa giá trị input ẩn trong `index.html` hoặc nhập trực tiếp (đã lưu tự động vào localStorage).

## Build/Deploy

- Đây là app tĩnh, chỉ cần deploy thư mục gốc lên static hosting:
  - Netlify, Vercel, GitHub Pages, Cloudflare Pages…
- Bật HTTPS để geolocation hoạt động ổn định.

## Khắc phục sự cố

- “Only secure origins are allowed” khi bấm “Dùng vị trí hiện tại”: bạn đang mở qua `file://`. Hãy chạy qua `http://localhost` hoặc deploy HTTPS.
- Vị trí hiển thị sai cấp xã/ấp: ứng dụng đã ưu tiên `forecast.city.name` và reverse geocoding theo cấp thành phố/tỉnh; nếu vẫn sai, thử bấm lại “Dùng vị trí hiện tại”.
- Không thấy cập nhật giờ kế tiếp: đảm bảo hệ thống đã cấp quyền Location và có mạng; app sẽ tính “giờ kế tiếp” theo múi giờ địa điểm.
## Link demo: 

https://weather-pwa-ten.vercel.app/
