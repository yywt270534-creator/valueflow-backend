const axios = require('axios');

// Domain URL ของ Railway
const BASE_URL = 'https://valueflow-backend-production.up.railway.app/api/auth';

async function runProtectedTests() {
  console.log('🚀 เริ่มต้นการทดสอบระบบ Protected Routes และ Auth Middleware...\n');

  let validToken = '';

  // -------------------------------------------------------------
  // เคสที่ 1: ล็อกอินเพื่อขอรับ JWT Token
  // -------------------------------------------------------------
  try {
    const loginRes = await axios.post(`${BASE_URL}/login`, {
      email: 'user_1790082808282@example.com',
      password: 'password123'
    });

    validToken = loginRes.data.token;
    console.log('1️⃣ เข้าสู่ระบบสำเร็จ ได้รับ Token');
  } catch (err) {
    console.error('❌ ไม่สามารถล็อกอินเพื่อเอา Token ได้:', err.response?.data || err.message);
    return;
  }

  // -------------------------------------------------------------
  // เคสที่ 2: เรียกใช้ /me โดยแนบ Token ที่ถูกต้อง (คาดหวัง HTTP 200)
  // -------------------------------------------------------------
  try {
    const profileRes = await axios.get(`${BASE_URL}/me`, {
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    });

    console.log('2️⃣ ทดสอบยิง API /me แบบใส่ Token ถูกต้อง:');
    console.log('   HTTP Status:', profileRes.status);
    console.log('   Response Body:', JSON.stringify(profileRes.data, null, 2));
    console.log('🟢 [PASS] เข้าถึงข้อมูลสำเร็จด้วย Valid Token\n');
  } catch (err) {
    console.error('🔴 [FAIL] เกิดข้อผิดพลาดในเคสยิง Token ถูกต้อง:', err.response?.data || err.message);
  }

  // -------------------------------------------------------------
  // เคสที่ 3: เรียกใช้ /me โดยไม่แนบ Token (คาดหวัง HTTP 401)
  // -------------------------------------------------------------
  try {
    await axios.get(`${BASE_URL}/me`);
    console.error('🔴 [FAIL] ระบบยอมให้ผ่าน ทั้งที่ไม่มี Token');
  } catch (err) {
    console.log('3️⃣ ทดสอบยิง API /me แบบไม่ใส่ Token:');
    console.log('   HTTP Status:', err.response?.status);
    console.log('   Response Body:', err.response?.data);
    console.log('🟢 [PASS] ระบบปฏิเสธ Request ที่ไม่มี Token สมบูรณ์');
  }
}

runProtectedTests();