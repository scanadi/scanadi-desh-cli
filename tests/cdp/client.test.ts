import { describe, it, expect } from 'vitest';
import { findDesignTab } from '../../src/cdp/client.js';
import type { CdpTab } from '../../src/cdp/protocol.js';

describe('findDesignTab', () => {
  const tabs: CdpTab[] = [
    { id: '1', title: 'Home', url: 'https://www.figma.com/files/recents', webSocketDebuggerUrl: 'ws://1', type: 'page' },
    { id: '2', title: 'My Design', url: 'https://www.figma.com/design/abc123/My-Design', webSocketDebuggerUrl: 'ws://2', type: 'page' },
    { id: '3', title: 'Other', url: 'https://www.figma.com/file/def456/Other', webSocketDebuggerUrl: 'ws://3', type: 'page' },
  ];

  it('prefers design tab over file tab', () => {
    expect(findDesignTab(tabs)?.id).toBe('2');
  });

  it('falls back to file tab', () => {
    const filtered = tabs.filter(t => t.id !== '2');
    expect(findDesignTab(filtered)?.id).toBe('3');
  });

  it('returns null when no design tabs', () => {
    expect(findDesignTab([tabs[0]])).toBeNull();
  });
});
