# Music Mood Explorer

แอปเว็บที่แสดงเพลงตามอารมณ์ โดยใช้ Express เป็น proxy ไปยัง iTunes Search API และมีโครงสร้าง queue + stack ให้ใช้ได้ตามแบบฝึกหัด

## จุดที่แก้ไขแล้ว
- เปลี่ยนข้อมูลจาก Rick and Morty เป็นเพลง/อารมณ์จริง
- แก้ `server.js` ให้ใช้ iTunes Search API อย่างถูกต้องและมี fallback ข้อมูลสำรอง
- ปรับ `public/index.html` และ `public/dashboard.js` ให้ทำงานกับเพลงแทนตัวละคร
- เพิ่มฟีเจอร์เลือกอารมณ์, sort algorithm, queue, history/undo
- ปรับ URLs และ field names ให้ตรงกับ API จริง

## เริ่มต้น
```bash
npm install
node server.js
```
แล้วเปิด:
```text
http://localhost:3000
```

## API ที่ใช้
- `GET /songs?mood=chill&sort=selection`
- `GET /watchlist`
- `POST /watchlist`
- `DELETE /watchlist/process`
- `GET /history`
- `POST /undo`

## หมายเหตุ
หาก iTunes API ไม่ตอบหรือถูกจำกัดการใช้งาน ระบบจะ fallback ไปใช้ข้อมูลใน `fallbackSongs.json` แบบเพลงสำรองเพื่อให้แอปยังใช้งานต่อได้
