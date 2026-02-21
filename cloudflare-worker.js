/**
 * AIShield Server-Side Worker v2.3.0
 * 
 * Handles:
 * - License Verification (HMAC signed)
 * - Premium Rules Distribution (HMAC signed)
 * - Stats Collection (HMAC signed)
 * 
 * Secrets (Set via wrangler secret put):
 * - LICENSE_SECRET: HMAC key for license verification
 * - RULES_SIGNING_KEY: HMAC key for rule signing
 * - STATS_SECRET: HMAC key for stats
 * - STRIPE_SECRET_KEY: Stripe API key (if using live billing)
 */

// === SECURITY UTILS ===
async function verifyHMAC(message, signature, secret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['verify']
  );
  
  // Convert hex signature back to bytes
  const signatureBytes = new Uint8Array(
    signature.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
  );
  
  return await crypto.subtle.verify('HMAC', cryptoKey, signatureBytes, messageData);
}

async function generateHMAC(message, secret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// === HANDLERS ===

async function handleLicenseVerify(request, env) {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  
  const headers = request.headers;
  const licenseKey = headers.get('X-License-Key');
  const extId = headers.get('X-Extension-Id');
  const timestamp = headers.get('X-Timestamp');
  const signature = headers.get('X-Signature');
  
  // Replay Attack Protection (5 min window)
  if (Math.abs(Date.now() - parseInt(timestamp)) > 300000) {
    return new Response(JSON.stringify({ error: true, message: 'Request expired' }), { 
      status: 401, headers: { 'Content-Type': 'application/json' } 
    });
  }

  // Signature Verification
  const payload = `${licenseKey}:${extId}:${timestamp}`;
  const isValid = await verifyHMAC(payload, signature, env.LICENSE_SECRET);
  
  if (!isValid) {
    return new Response(JSON.stringify({ error: true, message: 'Invalid signature' }), { 
      status: 403, headers: { 'Content-Type': 'application/json' } 
    });
  }

  // TODO: Database lookup (D1 or KV)
  // Mock logic for now
  if (licenseKey.startsWith('VALID')) {
    return new Response(JSON.stringify({
      valid: true,
      type: 'premium',
      expires: '2027-01-01'
    }), { headers: { 'Content-Type': 'application/json' } });
  } else {
    return new Response(JSON.stringify({
      valid: false,
      message: 'License not found'
    }), { headers: { 'Content-Type': 'application/json' } });
  }
}

async function handleRulesFetch(request, env) {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  
  const headers = request.headers;
  const licenseKey = headers.get('X-License-Key');
  const extId = headers.get('X-Extension-Id');
  const timestamp = headers.get('X-Timestamp');
  const signature = headers.get('X-Signature');

  const payload = `${licenseKey}:${extId}:${timestamp}`;
  const isValid = await verifyHMAC(payload, signature, env.LICENSE_SECRET); // Use license secret for auth

  if (!isValid) return new Response('Unauthorized', { status: 403 });

  // Dynamic Rules Payload
  const rules = [
    {
      "id": 20001,
      "priority": 1,
      "action": { "type": "block" },
      "condition": { "urlFilter": "malicious-tracker.com" }
    }
  ];

  // Sign the rules so client knows they're from us
  const rulesSignature = await generateHMAC(JSON.stringify(rules), env.LICENSE_SECRET);

  return new Response(JSON.stringify({
    rules: rules,
    signature: rulesSignature
  }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleStatsReport(request, env) {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  
  const bodyText = await request.text();
  const signature = request.headers.get('X-Signature');
  const timestamp = request.headers.get('X-Timestamp');

  // Verify
  const isValid = await verifyHMAC(bodyText, signature, env.LICENSE_SECRET);
  if (!isValid) return new Response('Invalid signature', { status: 403 });

  // Store in D1 or Analytics Engine (Mock)
  console.log('Stats received:', bodyText);

  return new Response(JSON.stringify({ success: true }), { 
    headers: { 'Content-Type': 'application/json' } 
  });
}

// === ROUTER ===
export default {
  async fetch(request, env, ctx) {
    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        }
      });
    }

    const url = new URL(request.url);
    const headers = { 'Access-Control-Allow-Origin': '*' };

    try {
      if (url.pathname === '/license/verify') {
        const res = await handleLicenseVerify(request, env);
        res.headers.set('Access-Control-Allow-Origin', '*');
        return res;
      }
      if (url.pathname === '/rules/fetch') {
        const res = await handleRulesFetch(request, env);
        res.headers.set('Access-Control-Allow-Origin', '*');
        return res;
      }
      if (url.pathname === '/stats/report') {
        const res = await handleStatsReport(request, env);
        res.headers.set('Access-Control-Allow-Origin', '*');
        return res;
      }

      return new Response('Not Found', { status: 404, headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: true, message: 'Internal Error' }), { 
        status: 500, headers: { 'Content-Type': 'application/json', ...headers } 
      });
    }
  }
};
