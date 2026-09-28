import { destroySession } from "@/lib/auth";

// Submitted by a plain <form method="post">, so logout works without client JS.
export async function POST() {
  await destroySession();
  // Relative Location avoids trusting the Host header behind proxies.
  return new Response(null, { status: 303, headers: { Location: "/login", "Cache-Control": "no-store" } });
}
