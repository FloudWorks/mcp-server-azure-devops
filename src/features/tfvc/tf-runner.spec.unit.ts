import { join } from 'path';
import {
  parseChangesetId,
  redact,
  toLocalPath,
  workspaceName,
} from './tf-runner';

describe('tf-runner helpers', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('maps server paths into the workspace root', () => {
    process.env.AZURE_DEVOPS_TFVC_WORKDIR = '/ws';
    expect(toLocalPath('$/NatPOS Cloud/Master/a.cs')).toBe(
      join('/ws', 'NatPOS Cloud', 'Master', 'a.cs'),
    );
    expect(() => toLocalPath('C:/x')).toThrow(/\$\//);
  });

  it('parses changeset numbers from tf output', () => {
    expect(
      parseChangesetId(
        'Checking in edit: a.cs\n\nChangeset #24790 checked in.',
      ),
    ).toBe(24790);
    expect(parseChangesetId('There are no pending changes.')).toBeUndefined();
  });

  it('redacts the PAT', () => {
    process.env.AZURE_DEVOPS_PAT = 'secret123';
    expect(redact('login secret123 failed')).toBe('login *** failed');
  });

  it('sanitises the workspace name', () => {
    process.env.AZURE_DEVOPS_TFVC_WORKSPACE = 'my ws/with;bad chars';
    expect(workspaceName()).toBe('my-ws-with-bad-chars');
  });
});
