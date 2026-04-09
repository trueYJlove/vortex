/**
 * Unit tests for session metadata sidecar (renameSession / tagSession).
 *
 * Uses a temp directory for CLAUDE_CONFIG_DIR so tests don't pollute the
 * user's real session store.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Dynamic import of the tested functions to allow env override before load
// ---------------------------------------------------------------------------

// Import after setting env so getClaudeConfigDir picks up our temp dir.
// We import directly (not via the re-export chain) so we don't need the full
// SDK to be bootable.
import {
  renameSession,
  tagSession,
  getSessionInfo,
  listSessions,
} from '../index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir = '';
let savedConfigDir: string | undefined;

/** Create a minimal (empty) transcript file so the session is "visible". */
async function createFakeTranscript(cwd: string, sessionId: string): Promise<void> {
  const projectDir = cwd.replace(/[^a-zA-Z0-9]/g, '-');
  const dir = join(tmpDir, 'projects', projectDir);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${sessionId}.jsonl`), '', 'utf-8');
}

/** Create a transcript with a real user message so firstPrompt can be extracted. */
async function createTranscriptWithPrompt(
  cwd: string,
  sessionId: string,
  promptText: string,
): Promise<void> {
  const projectDir = cwd.replace(/[^a-zA-Z0-9]/g, '-');
  const dir = join(tmpDir, 'projects', projectDir);
  await mkdir(dir, { recursive: true });
  const entry = JSON.stringify({
    type: 'user',
    uuid: 'uuid-test-1',
    sessionId,
    parentUuid: null,
    timestamp: new Date().toISOString(),
    isSidechain: false,
    message: { role: 'user', content: promptText },
  });
  await writeFile(join(dir, `${sessionId}.jsonl`), entry + '\n', 'utf-8');
}

beforeEach(async () => {
  // Create a fresh temp directory and redirect CLAUDE_CONFIG_DIR
  tmpDir = await mkdtemp(join(tmpdir(), 'sdk-meta-test-'));
  savedConfigDir = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
});

afterEach(async () => {
  // Restore env and remove temp directory
  if (savedConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR;
  } else {
    process.env.CLAUDE_CONFIG_DIR = savedConfigDir;
  }
  await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('renameSession', () => {
  it('writes a custom title to the metadata sidecar', async () => {
    const cwd = '/test/project';
    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000001';
    await createFakeTranscript(cwd, sessionId);

    await renameSession(sessionId, 'My Custom Title', { cwd });

    const info = await getSessionInfo(sessionId, { cwd });
    expect(info).toBeDefined();
    expect(info?.customTitle).toBe('My Custom Title');
  });

  it('overwrites an existing title', async () => {
    const cwd = '/test/project';
    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000002';
    await createFakeTranscript(cwd, sessionId);

    await renameSession(sessionId, 'First Title', { cwd });
    await renameSession(sessionId, 'Updated Title', { cwd });

    const info = await getSessionInfo(sessionId, { cwd });
    expect(info?.customTitle).toBe('Updated Title');
  });

  it('does not throw when transcript does not exist', async () => {
    // No transcript created — renameSession should be silent
    await expect(
      renameSession('nonexistent-session', 'Title', { cwd: '/missing' }),
    ).resolves.toBeUndefined();
  });
});

describe('tagSession', () => {
  it('writes a tag to the metadata sidecar', async () => {
    const cwd = '/test/project';
    const sessionId = 'bbbbbbbb-0000-0000-0000-000000000001';
    await createFakeTranscript(cwd, sessionId);

    await tagSession(sessionId, 'important', { cwd });

    const info = await getSessionInfo(sessionId, { cwd });
    expect(info?.tag).toBe('important');
  });

  it('clears the tag when null is passed', async () => {
    const cwd = '/test/project';
    const sessionId = 'bbbbbbbb-0000-0000-0000-000000000002';
    await createFakeTranscript(cwd, sessionId);

    await tagSession(sessionId, 'to-remove', { cwd });
    await tagSession(sessionId, null, { cwd });

    const info = await getSessionInfo(sessionId, { cwd });
    expect(info?.tag).toBeUndefined();
  });

  it('title and tag can coexist in the sidecar', async () => {
    const cwd = '/test/project';
    const sessionId = 'bbbbbbbb-0000-0000-0000-000000000003';
    await createFakeTranscript(cwd, sessionId);

    await renameSession(sessionId, 'My Session', { cwd });
    await tagSession(sessionId, 'wip', { cwd });

    const info = await getSessionInfo(sessionId, { cwd });
    expect(info?.customTitle).toBe('My Session');
    expect(info?.tag).toBe('wip');
  });
});

describe('listSessions with metadata', () => {
  it('includes customTitle from sidecar in listing', async () => {
    const cwd = '/test/project';
    const s1 = 'cccccccc-0000-0000-0000-000000000001';
    const s2 = 'cccccccc-0000-0000-0000-000000000002';
    await createFakeTranscript(cwd, s1);
    await createFakeTranscript(cwd, s2);

    await renameSession(s1, 'Session One', { cwd });
    await tagSession(s2, 'archived', { cwd });

    const sessions = await listSessions({ cwd });
    const info1 = sessions.find(s => s.sessionId === s1);
    const info2 = sessions.find(s => s.sessionId === s2);

    expect(info1?.customTitle).toBe('Session One');
    expect(info1?.tag).toBeUndefined();
    expect(info2?.customTitle).toBeUndefined();
    expect(info2?.tag).toBe('archived');
  });
});

describe('SDKSessionInfo timestamp types (CC SDK contract)', () => {
  it('lastModified is a number (ms since epoch), not a string', async () => {
    const cwd = '/test/project';
    const sessionId = 'dddddddd-0000-0000-0000-000000000001';
    await createFakeTranscript(cwd, sessionId);

    const info = await getSessionInfo(sessionId, { cwd });
    expect(info).toBeDefined();
    expect(typeof info?.lastModified).toBe('number');
    expect(info!.lastModified).toBeGreaterThan(0);
  });

  it('createdAt is a number (ms since epoch), not a string', async () => {
    const cwd = '/test/project';
    const sessionId = 'dddddddd-0000-0000-0000-000000000002';
    await createFakeTranscript(cwd, sessionId);

    const info = await getSessionInfo(sessionId, { cwd });
    expect(info).toBeDefined();
    expect(typeof info?.createdAt).toBe('number');
    expect(info!.createdAt).toBeGreaterThan(0);
  });

  it('listSessions returns numeric timestamps', async () => {
    const cwd = '/test/project';
    const sessionId = 'dddddddd-0000-0000-0000-000000000003';
    await createFakeTranscript(cwd, sessionId);

    const sessions = await listSessions({ cwd });
    const found = sessions.find(s => s.sessionId === sessionId);
    expect(found).toBeDefined();
    expect(typeof found?.lastModified).toBe('number');
    expect(found!.lastModified).toBeGreaterThan(0);
  });
});

describe('SDKSessionInfo firstPrompt and summary', () => {
  it('populates firstPrompt from the first user message in transcript', async () => {
    const cwd = '/test/project';
    const sessionId = 'eeeeeeee-0000-0000-0000-000000000001';
    await createTranscriptWithPrompt(cwd, sessionId, 'Write me a haiku.');

    const info = await getSessionInfo(sessionId, { cwd });
    expect(info).toBeDefined();
    expect(info?.firstPrompt).toBe('Write me a haiku.');
  });

  it('summary falls back to firstPrompt when no customTitle', async () => {
    const cwd = '/test/project';
    const sessionId = 'eeeeeeee-0000-0000-0000-000000000002';
    await createTranscriptWithPrompt(cwd, sessionId, 'Explain quantum entanglement.');

    const info = await getSessionInfo(sessionId, { cwd });
    expect(info?.summary).toBe('Explain quantum entanglement.');
  });

  it('summary prefers customTitle over firstPrompt', async () => {
    const cwd = '/test/project';
    const sessionId = 'eeeeeeee-0000-0000-0000-000000000003';
    await createTranscriptWithPrompt(cwd, sessionId, 'Some long prompt text.');
    await renameSession(sessionId, 'My Custom Title', { cwd });

    const info = await getSessionInfo(sessionId, { cwd });
    expect(info?.summary).toBe('My Custom Title');
    expect(info?.firstPrompt).toBe('Some long prompt text.');
  });

  it('summary falls back to sessionId when transcript is empty', async () => {
    const cwd = '/test/project';
    const sessionId = 'eeeeeeee-0000-0000-0000-000000000004';
    await createFakeTranscript(cwd, sessionId);

    const info = await getSessionInfo(sessionId, { cwd });
    expect(info?.summary).toBe(sessionId);
    expect(info?.firstPrompt).toBeUndefined();
  });

  it('listSessions includes firstPrompt for sessions with content', async () => {
    const cwd = '/test/project';
    const s1 = 'ffffffff-0000-0000-0000-000000000001';
    const s2 = 'ffffffff-0000-0000-0000-000000000002';
    await createTranscriptWithPrompt(cwd, s1, 'Hello, world!');
    await createFakeTranscript(cwd, s2);

    const sessions = await listSessions({ cwd });
    const i1 = sessions.find(s => s.sessionId === s1);
    const i2 = sessions.find(s => s.sessionId === s2);

    expect(i1?.firstPrompt).toBe('Hello, world!');
    expect(i1?.summary).toBe('Hello, world!');
    expect(i2?.firstPrompt).toBeUndefined();
    expect(i2?.summary).toBe(s2);
  });
});
