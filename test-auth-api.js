// test-auth-api.js - สคริปต์ทดสอบระบบ Authentication และ Database Connection บน Railway
const BASE_URL = 'https://valueflow-backend-production.up.railway.app';

async function testAuthFlow() {
  console.log('🚀 เริ่มต้นการทดสอบระบบ Authentication และ Database บน Railway...\n');

  // สร้างข้อมูลผู้ใช้จำลองแบบสุ่มอีเมล
  const uniqueId = Date.now();
  const testUser = {
    email: `user_${uniqueId}@example.com`,
    password: 'Password123!',
    name: `Test User ${uniqueId}`
  };

  // 1. ทดสอบสมัครสมาชิก (Register)
  try {
    console.log(`1️⃣ ส่งข้อมูลสมัครสมาชิก: ${testUser.email}`);
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    });

    const regData = await regRes.json();
    console.log(`HTTP Status: ${regRes.status}`);
    console.log('Response Body:', regData);

    if (regRes.ok || regRes.status === 201) {
      console.log('🟢 [PASS] สมัครสมาชิกและบันทึกลง Supabase Database สำเร็จ');
    } else {
      console.log('⚠️ [NOTICE] เซิร์ฟเวอร์ตอบกลับแต่สมัครไม่สำเร็จ (ตรวจสอบ Validation หรือ Route Path)');
    }
  } catch (error) {
    console.error('🔴 [FAIL] Register Request Error:', error.message);
  }

  console.log('\n----------------------------------------\n');

  // 2. ทดสอบเข้าสู่ระบบ (Login)
  try {
    console.log(`2️⃣ ส่งข้อมูลเข้าสู่ระบบด้วย: ${testUser.email}`);
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password
      })
    });

    const loginData = await loginRes.json();
    console.log(`HTTP Status: ${loginRes.status}`);
    console.log('Response Body:', loginData);

    if (loginRes.ok && (loginData.token || loginData.accessToken || loginData.data?.token)) {
      console.log('🟢 [PASS] เข้าสู่ระบบสำเร็จและได้รับ JWT Token จากเซิร์ฟเวอร์');
    } else {
      console.log('⚠️ [NOTICE] การเข้าสู่ระบบไม่สมบูรณ์ (ตรวจสอบ Key ที่เซิร์ฟเวอร์ส่งกลับมา)');
    }
  } catch (error) {
    console.error('🔴 [FAIL] Login Request Error:', error.message);
  }
}

testAuthFlow();