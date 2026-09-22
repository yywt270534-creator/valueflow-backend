const axios = require('axios');

// Domain URL บน Railway
const BASE_URL = 'https://valueflow-backend-production.up.railway.app/api/auth';

async function runProtectedTests() {
  console.log('🚀 เริ่มต้นการทดสอบระบบ Protected Routes และ Auth Middleware...\n');

  // สุ่มอีเมลใหม่ด้วย Timestamp เพื่อให้สามารถรันสคริปต์ทดสอบกี่ครั้งก็ได้โดยไม่ติด Duplicate Error
  const timestamp = Date.now();
  const testUser = {
    name: `Test User ${timestamp}`,
    email: `test_user_${timestamp}@example.com`,
    password: 'Password123!'
  };

  let validToken = '';

  // -------------------------------------------------------------
  // ขั้นตอนที่ 1: สมัครสมาชิกผู้ใช้ทดสอบใหม่ (Register)
  // -------------------------------------------------------------
  try {
    console.log(`1️⃣ สร้างบัญชีผู้ใช้สำหรับทดสอบ: ${testUser.email}`);
    const regRes = await axios.post(`${BASE_URL}/register`, testUser);
    console.log('   HTTP Status:', regRes.status);
    console.log('🟢 [PASS] สร้างผู้ใช้ลง Supabase Database สำเร็จ\n');
  } catch (err) {
    console.error('🔴 [FAIL] ไม่สามารถลงทะเบียนผู้ใช้ทดสอบได้:', err.response?.data || err.message);
    return;
  }

  // -------------------------------------------------------------
  // ขั้นตอนที่ 2: ล็อกอินด้วยผู้ใช้ที่เพิ่งสร้างขึ้นเพื่อขอรับ JWT Token
  // -------------------------------------------------------------
  try {
    console.log(`2️⃣ เข้าสู่ระบบด้วยผู้ใช้ทดสอบ...`);
    const loginRes = await axios.post(`${BASE_URL}/login`, {
      email: testUser.email,
      password: testUser.password
    });

    validToken = loginRes.data.token;
    console.log('   HTTP Status:', loginRes.status);
    console.log('🟢 [PASS] ได้รับ JWT Token เรียบร้อยแล้ว\n');
  } catch (err) {
    console.error('🔴 [FAIL] ไม่สามารถเข้าสู่ระบบได้:', err.response?.data || err.message);
    return;
  }

  // -------------------------------------------------------------
  // ขั้นตอนที่ 3: เรียกใช้ Protected Route (/me) พร้อมแนบ Token ที่ถูกต้อง
  // -------------------------------------------------------------
  try {
    console.log('3️⃣ ทดสอบยิง API /me พร้อมแนบ Authorization Header (Bearer Token):');
    const profileRes = await axios.get(`${BASE_URL}/me`, {
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    });

    console.log('   HTTP Status:', profileRes.status);
    console.log('   Response Body:', JSON.stringify(profileRes.data, null, 2));
    console.log('🟢 [PASS] ยืนยันสิทธิ์สำเร็จ: Middleware อนุญาตให้เข้าถึงข้อมูลโปรไฟล์\n');
  } catch (err) {
    console.error('🔴 [FAIL] เกิดข้อผิดพลาดในการเข้าถึง Protected Route:', err.response?.data || err.message);
  }

  // -------------------------------------------------------------
  // ขั้นตอนที่ 4: เรียกใช้ Protected Route (/me) โดยไม่แนบ Token
  // -------------------------------------------------------------
  try {
    console.log('4️⃣ ทดสอบยิง API /me โดยไม่ส่ง Token (คาดหวังปฏิเสธด้วย HTTP 401):');
    await axios.get(`${BASE_URL}/me`);
    console.error('🔴 [FAIL] ระบบรักษาความปลอดภัยล้มเหลว: ยอมให้ผ่านทั้งที่ไม่มี Token');
  } catch (err) {
    console.log('   HTTP Status:', err.response?.status);
    console.log('   Response Body:', err.response?.data);
    console.log('🟢 [PASS] ระบบรักษาความปลอดภัยทำงานถูกต้อง: บล็อก Request ที่ไม่มี Token สมบูรณ์');
  }
}

runProtectedTests();