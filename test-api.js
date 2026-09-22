// test-api.js - สคริปต์ทดสอบการทำงานของ Live API บน Railway
const BASE_URL = 'https://valueflow-backend-production.up.railway.app';

async function testBackend() {
  console.log('🚀 เริ่มต้นการทดสอบระบบ Backend บน Railway...\n');

  // 1. ทดสอบ Root Health Check
  try {
    const res = await fetch(`${BASE_URL}/`);
    const data = await res.json();
    console.log('🟢 [PASS] Health Check Endpoint (/):');
    console.log(data);
  } catch (error) {
    console.error('🔴 [FAIL] Health Check Endpoint Error:', error.message);
  }

  console.log('\n----------------------------------------\n');

  // 2. ทดสอบ API Route (/api)
  try {
    const res = await fetch(`${BASE_URL}/api`);
    const data = await res.json();
    console.log('🟢 [PASS] API Base Endpoint (/api):');
    console.log(data);
  } catch (error) {
    console.error('🔴 [FAIL] API Base Endpoint Error:', error.message);
  }
}

testBackend();