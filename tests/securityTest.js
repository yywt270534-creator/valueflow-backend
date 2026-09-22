const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

async function runSecurityTest() {
    console.log('--- [START SECURITY TEST] ---');

    try {
        // 1. จำลองการล็อกอินเป็น User A
        console.log('1. Logging in as User A...');
        const userA = await axios.post(`${API_URL}/auth/login`, {
            email: 'userA@test.com',
            password: 'password123'
        });
        const tokenA = userA.data.token;

        // 2. ลองยิงเข้าดึงข้อมูลดีลที่ไม่ใช่ของตนเอง (IDOR Attack Test)
        const targetDealId = 999; // ดีลสมมติของผู้อื่น
        console.log(`2. User A attempting IDOR attack on Deal ID: ${targetDealId}...`);

        try {
            await axios.get(`${API_URL}/deals/${targetDealId}`, {
                headers: { Authorization: `Bearer ${tokenA}` }
            });
            console.error('❌ VULNERABILITY DETECTED: IDOR test failed! User A can access unauthorized deal.');
        } catch (err) {
            if (err.response && (err.response.status === 403 || err.response.status === 404)) {
                console.log('✅ PASSED: IDOR protection works! Access denied correctly.');
            } else {
                console.error('⚠️ Unexpected response status:', err.response?.status);
            }
        }

    } catch (err) {
        console.error('Test setup error (Ensure server is running & credentials exist):', err.message);
    }
    console.log('--- [END SECURITY TEST] ---');
}

runSecurityTest();