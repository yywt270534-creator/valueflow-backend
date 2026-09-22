import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 1,
  iterations: 1,
};

export function setup() {
  // 1. สร้างอีเมลไม่ซ้ำกันในทุกรอบที่รัน เพื่อใช้เป็นผู้ใช้แปลกหน้า (Attacker / Unrelated User)
  const attackerEmail = `idor_attacker_${Date.now()}@example.com`;
  const password = 'Password123!';

  // 2. สั่งสมัครสมาชิก (Register) บัญชีนี้เข้าระบบทันที
  const registerPayload = JSON.stringify({
    email: attackerEmail,
    password: password,
    name: 'IDOR Attacker',
    role: 'buyer'
  });

  const regRes = http.post('http://localhost:5000/api/auth/register', registerPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (regRes.status !== 201 && regRes.status !== 200) {
    console.error(`[SETUP ERROR] Register failed: ${regRes.body}`);
    return { token: '' };
  }

  // 3. ล็อกอินด้วยบัญชีที่เพิ่งสร้าง เพื่อดึง Token ออกมาใช้งาน
  const loginPayload = JSON.stringify({
    email: attackerEmail,
    password: password,
  });

  const loginRes = http.post('http://localhost:5000/api/auth/login', loginPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (loginRes.status !== 200) {
    console.error(`[SETUP ERROR] Login failed: ${loginRes.body}`);
    return { token: '' };
  }

  const token = JSON.parse(loginRes.body).token;
  return { token };
}

export default function (data) {
  const token = data.token;
  if (!token) {
    console.error('[TEST ABORTED] Missing token from setup');
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // 4. เอา Token ของผู้ใช้แปลกหน้านี้ ไปลองดีดแก้สถานะดีล ID 1 (ซึ่งเขาไม่ใช่เจ้าของ)
  const res = http.put('http://localhost:5000/api/deals/1/status', JSON.stringify({
    nextStatus: 'paid'
  }), { headers });

  console.log(`[IDOR TEST] Status: ${res.status} | Response: ${res.body}`);

  // 5. ตรวจสอบว่าระบบต้องกันได้ (ต้องได้ Status 403 เท่านั้น)
  check(res, {
    'is IDOR blocked with 403': (r) => r.status === 403,
  });
}