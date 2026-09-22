import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    stages: [
        { duration: '10s', target: 20 },
        { duration: '30s', target: 100 },
        { duration: '10s', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'],
        http_req_failed: ['rate<0.01'],
    },
};

export default function () {
    const url = 'http://localhost:5000/api/auth/login';

    // แก้ไขข้อมูลตรงนี้ให้ตรงกับ Database ของคุณ
    const payload = JSON.stringify({
        email: 'testuser@example.com', // ใช้ Email ที่มีอยู่จริง
        password: 'Password123!',      // ใช้รหัสผ่านที่ถูกต้อง
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
        },
    };

    const res = http.post(url, payload, params);

    // พิมพ์ Error ออกมาดูเฉพาะตอนที่เชื่อมต่อไม่ได้หรือล็อกอินไม่ผ่าน
    if (res.status !== 200 && __VU === 1 && __ITER === 0) {
        console.log(`\n[🚨 Error Details] Status: ${res.status} | Body: ${res.body}\n`);
    }

    check(res, {
        'status is 200': (r) => r.status === 200,
    });

    sleep(1);
}