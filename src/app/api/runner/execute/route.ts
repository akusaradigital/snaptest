import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { exec } from 'child_process';
import { writeFileSync, unlinkSync, mkdirSync, readFileSync, rmSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function findFirstPng(dir: string): string | null {
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        const found = findFirstPng(full);
        if (found) return found;
      } else if (entry.endsWith('.png')) {
        return full;
      }
    }
  } catch {}
  return null;
}

export async function POST(request: Request) {
  if (!(await auth())?.user?.email) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

  // ponytail: pytest+playwright runner only exists locally - Vercel has no Python.
  if (process.env.VERCEL) {
    return NextResponse.json(
      { detail: 'Test Runner is only available when running locally (needs Python + Playwright).' },
      { status: 501 }
    );
  }

  const { script_content, url } = await request.json();
  if (!script_content || !url) {
    return NextResponse.json({ detail: 'Script content and URL are required' }, { status: 400 });
  }

  const ts = Date.now();
  const tmpFile = join(tmpdir(), `pw_test_${ts}.py`);
  const screenshotDir = join(tmpdir(), `pw_shots_${ts}`);
  mkdirSync(screenshotDir, { recursive: true });
  writeFileSync(tmpFile, script_content, 'utf8');

  return new Promise<Response>(resolve => {
    exec(
      `python -m pytest "${tmpFile}" -v --tb=short --no-header --screenshot=on --output="${screenshotDir}"`,
      { timeout: 60000, shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh' },
      (err: any, stdout: string, stderr: string) => {
        try { unlinkSync(tmpFile); } catch {}

        const output = stdout + '\n' + stderr;
        const steps = output.split('\n')
          .filter(l => / (PASSED|FAILED)/.test(l))
          .map(l => {
            const isPassed = l.includes(' PASSED');
            const name = l.split('::').pop()?.replace(/ (PASSED|FAILED).*/, '').trim() || l.trim();
            const errMatch = l.match(/FAILED .* - (.+)$/);
            return {
              action: 'test',
              target: name,
              status: isPassed ? 'passed' : 'failed',
              ...(errMatch ? { error: errMatch[1].substring(0, 150) } : {}),
            };
          });

        const passed = steps.length > 0 && steps.every(s => s.status === 'passed');
        const error = passed ? null : output.split('\n').filter(l => l.includes('Error') || l.includes('assert')).slice(0, 5).join('\n') || null;

        let screenshot: string | null = null;
        const pngPath = findFirstPng(screenshotDir);
        if (pngPath) {
          try { screenshot = readFileSync(pngPath).toString('base64'); } catch {}
        }
        try { rmSync(screenshotDir, { recursive: true, force: true }); } catch {}

        resolve(NextResponse.json({ passed, steps, error, screenshot }));
      }
    );
  });
}
