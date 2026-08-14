// 진단 전용(개발 모드에서만 동작) — 브라우저 안의 이미지를 파일로 떨어뜨려 눈으로 확인하기 위한 임시 경로.
// 배포 대상이 아니며, 진단이 끝나면 trash-can/으로 옮긴다.

import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const body = (await request.json()) as { name?: string; dataUrl?: string };
  const name = (body.name ?? 'dump').replace(/[^a-zA-Z0-9._-]/g, '_');
  const dataUrl = body.dataUrl ?? '';
  const m = /^data:image\/(png|jpeg);base64,(.+)$/s.exec(dataUrl);
  if (!m) return NextResponse.json({ ok: false, reason: 'bad dataUrl' }, { status: 400 });

  const dir = path.join(process.cwd(), 'tmp-diagnose');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}.${m[1] === 'jpeg' ? 'jpg' : 'png'}`);
  await writeFile(file, Buffer.from(m[2], 'base64'));
  return NextResponse.json({ ok: true, file });
}
