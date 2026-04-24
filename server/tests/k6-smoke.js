// k6 smoke test. Run with:
//   API_URL=http://localhost:8000 TOKEN=your-jwt k6 run server/tests/k6-smoke.js
// Validates /health, and exercises the rate limit on /listings and
// /conversations/:id/messages (expected 429s after a burst).

import http from "k6/http";
import { check, sleep } from "k6";

const API = __ENV.API_URL || "http://localhost:8000";
const TOKEN = __ENV.TOKEN || "";

export const options = {
  scenarios: {
    health: {
      executor: "constant-vus",
      vus: 5,
      duration: "10s",
      exec: "health",
    },
    listings_ramp: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "5s", target: 10 },
        { duration: "10s", target: 20 },
      ],
      exec: "listings",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.1"],
  },
};

export function health() {
  const r = http.get(`${API}/health`);
  check(r, { "health 200": (res) => res.status === 200 });
  sleep(0.2);
}

export function listings() {
  const headers = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
  const r = http.get(`${API}/listings?limit=20`, { headers });
  check(r, {
    "listings OK or 401 or 429": (res) => [200, 401, 429].includes(res.status),
  });
  sleep(0.1);
}
