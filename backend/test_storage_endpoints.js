const http = require('http');

async function testStorageEndpoints() {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhOTQzZTk2NzMxMmFkZWEwZGZkYWM4YSIsImlhdCI6MTc5MDcxMzAxMCwiZXhwIjoxNzkxMzE3ODEwfQ.49mZNg436rvQ438ulQJtQr0ydKl9SuCwJLNM8HZ5USU';

  const endpoints = [
    '/api/resources/overview',
    '/api/resources/allocations',
    '/api/resources/history',
    '/api/resources/files',
    '/api/resources/ai-usage',
    '/api/resources/storage/reconciliation',
    '/api/resources/storage/b2-status'
  ];

  for (const ep of endpoints) {
    const start = Date.now();
    try {
      const res = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: 'localhost',
          port: 5000,
          path: ep,
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }, res => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
        });
        req.on('error', reject);
        req.end();
      });
      const elapsed = Date.now() - start;
      console.log(`[${ep}] Status: ${res.status}, Elapsed: ${elapsed}ms, Success: ${res.body.success}`);
      if (ep === '/api/resources/overview') {
        console.log('Overview University Count:', res.body.data?.storage?.universityOverview?.length);
        console.log('Overview B2 Usage:', res.body.data?.storage?.b2ActualUsage);
        console.log('Sample University:', res.body.data?.storage?.universityOverview?.[0]);
      }
    } catch (err) {
      console.error(`[${ep}] FAILED:`, err.message);
    }
  }
}

testStorageEndpoints();
