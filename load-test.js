import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '5s', target: 10 },  // ไต่ระดับจาก 0 เป็น 10 VUs ใน 5 วินาที
    { duration: '10s', target: 20 }, // อัดโหลดเพิ่มเป็น 20 VUs ต่อเนื่อง
    { duration: '5s', target: 0 },   // ลดระดับลงสู่ 0 (Graceful Ramp Down)
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],   // อัตรา Error ต้องน้อยกว่า 1%
    http_req_duration: ['p(95)<500'], // 95% ของ Request ต้องตอบกลับภายใน 500ms
  },
};

// ฟังก์ชัน Setup ขอ Token สดใหม่ก่อนเริ่มรุมยิงโหลด
export function setup() {
  const loginPayload = JSON.stringify({
    email: 'test5@example.com',
    password: '123456password',
  });

  const res = http.post('http://localhost:5000/api/auth/login', loginPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (res.status !== 200) {
    console.error(`[SETUP ERROR] Login failed: ${res.body}`);
    return { token: '' };
  }

  return { token: JSON.parse(res.body).token };
}

export default function (data) {
  const token = data.token;
  if (!token) return;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // 1. จำลองการสร้างดีลใหม่แบบคู่ขนาน
  const createPayload = JSON.stringify({
    title: `Stress Test Deal ${__VU}-${__ITER}`,
    amount: 1000,
    seller_id: 2,
  });

  const createRes = http.post('http://localhost:5000/api/deals', createPayload, { headers });

  if (createRes.status !== 201 && createRes.status !== 200) {
    return; // ข้ามรอบนี้หากสร้างไม่ทัน (ป้องกันลูปขัดข้อง)
  }

  const dealId = JSON.parse(createRes.body).id || JSON.parse(createRes.body).deal?.id;
  if (!dealId) return;

  // 2. จำลองการยิงเปลี่ยนสถานะเป็น paid พร้อมกันภายใต้โหลดสูง
  const updateUrl = `http://localhost:5000/api/deals/${dealId}/status`;
  const updatePayload = JSON.stringify({
    nextStatus: 'paid',
  });

  const res = http.put(updateUrl, updatePayload, { headers });

  check(res, {
    'is status 200': (r) => r.status === 200,
  });

  sleep(0.2); // ลดเวลา Sleep ลงเพื่อให้เกิดการแย่งทรัพยากร (Concurrency) ที่สมจริงขึ้น
}