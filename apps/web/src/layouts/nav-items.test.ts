import { afterEach, describe, expect, it } from 'vitest';
import { i18n, setLocale } from '../i18n';
import { navItemsFor, showWorkspaceSettings, WORKSPACE_SETTINGS_ITEM } from './nav-items';

function labels(items: ReturnType<typeof navItemsFor>): string[] {
  return items.map((item) => i18n.global.t(item.labelKey));
}

afterEach(() => {
  setLocale('vi');
});

describe('navItemsFor', () => {
  it.each(['admin', 'recruiter'] as const)(
    'gives %s Ứng tuyển, Ứng viên and Vị trí tuyển dụng, in that order',
    (role) => {
      setLocale('vi');
      const items = navItemsFor(role);

      expect(items.map((item) => item.to)).toEqual(['/applications', '/candidates', '/jobs']);
      expect(labels(items)).toEqual(['Ứng tuyển', 'Ứng viên', 'Vị trí tuyển dụng']);
    },
  );

  it('gives a collaborator only Ứng tuyển của tôi and Vị trí của tôi', () => {
    setLocale('vi');
    const items = navItemsFor('collaborator');

    expect(items.map((item) => item.to)).toEqual(['/applications', '/jobs']);
    expect(labels(items)).toEqual(['Ứng tuyển của tôi', 'Vị trí của tôi']);
  });

  it('uses the person icon for Ứng viên only', () => {
    expect(navItemsFor('admin').map((item) => item.icon)).toEqual([
      'archive-box',
      'profile',
      'archive-box',
    ]);
  });

  it('has English labels', () => {
    setLocale('en');

    expect(labels(navItemsFor('recruiter'))).toEqual(['Applications', 'Candidates', 'Jobs']);
    expect(labels(navItemsFor('collaborator'))).toEqual(['My applications', 'My jobs']);
  });

  it('gives no items without a role', () => {
    expect(navItemsFor(null)).toEqual([]);
  });
});

describe('showWorkspaceSettings', () => {
  it('is true for admins only', () => {
    expect(showWorkspaceSettings('admin')).toBe(true);
    expect(showWorkspaceSettings('recruiter')).toBe(false);
    expect(showWorkspaceSettings('collaborator')).toBe(false);
    expect(showWorkspaceSettings(null)).toBe(false);
  });

  it('points the settings item at /settings/workspace', () => {
    setLocale('vi');

    expect(WORKSPACE_SETTINGS_ITEM.to).toBe('/settings/workspace');
    expect(i18n.global.t(WORKSPACE_SETTINGS_ITEM.labelKey)).toBe('Cài đặt không gian làm việc');
  });
});
