const axios = require('axios');

const BASE_URL = 'https://valueflow-backend-production.up.railway.app/api';

async function testTransactionsAPI() {
  console.log('🚀 เริ่มต้นทดสอบ Transactions API...\n');

  const timestamp = Date.now();
  const testUser = {
    name: `Tx User ${timestamp}`,
    email: `tx_user_${timestamp}@example.com`,
    password: 'Password123!'
  };

  try {
    // 1. สมัครและล็อกอิน
    await axios.post(`${BASE_URL}/auth/register`, testUser);
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: testUser.email,
      password: testUser.password
    });
    const token = loginRes.data.token;
    console.log('1️⃣ สมัครและเข้าสู่ระบบสำเร็จ');

    const authHeader = { headers: { Authorization: `Bearer ${token}` } };

    // 2. ทดสอบเพิ่มรายการรายรับ (Income)
    const incomeRes = await axios.post(`${BASE_URL}/transactions`, {
      type: 'income',
      amount: 50000,
      category: 'Salary',
      description: 'เงินเดือนประจำเดือน'
    }, authHeader);
    console.log('2️⃣ สร้างรายการรายรับสำเร็จ:', incomeRes.data.data);

    // 3. ทดสอบเพิ่มรายการรายจ่าย (Expense)
    const expenseRes = await axios.post(`${BASE_URL}/transactions`, {
      type: 'expense',
      amount: 1200,
      category: 'Food',
      description: 'ค่าอาหารกลางวัน'
    }, authHeader);
    console.log('3️⃣ สร้างรายการรายจ่ายสำเร็จ:', expenseRes.data.data);

    // 4. ดึงรายการทั้งหมดของผู้ใช้คนนี้
    const listRes = await axios.get(`${BASE_URL}/transactions`, authHeader);
    console.log(`4️⃣ ดึงรายการทั้งหมดสำเร็จ (รวม ${listRes.data.count} รายการ):`);
    console.log(JSON.stringify(listRes.data.data, null, 2));
    console.log('\n🟢 [PASS] การทดสอบ Transactions API สมบูรณ์');

  } catch (err) {
    console.error('❌ เกิดข้อผิดพลาด:', err.response?.data || err.message);
  }
}

testTransactionsAPI();