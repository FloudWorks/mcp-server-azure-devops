import { relativeNodePath } from './feature';

describe('relativeNodePath', () => {
  it('strips the project and group prefixes', () => {
    expect(
      relativeNodePath(
        'NatPOS Suite Development\\Release 2',
        'NatPOS Suite Development',
        'Iteration',
      ),
    ).toBe('Release 2');
    expect(
      relativeNodePath(
        'NatPOS Suite Development\\Iteration\\R2\\S1',
        'NatPOS Suite Development',
        'Iteration',
      ),
    ).toBe('R2/S1');
    expect(relativeNodePath('Release 2/Sprint 1', 'P', 'Iteration')).toBe(
      'Release 2/Sprint 1',
    );
    expect(relativeNodePath('P', 'P', 'Area')).toBeUndefined();
    expect(relativeNodePath(undefined, 'P', 'Area')).toBeUndefined();
  });
});
