import { NextResponse } from 'next/server';

const BACKEND =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:8000';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/health`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: 'proxy_error', message: 'Backend is unreachable.' },
      { status: 502 }
    );
  }
}
