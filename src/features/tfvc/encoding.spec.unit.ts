import {
  decodeText,
  encodeText,
  CP_UTF8,
  CP_UTF16LE,
  CP_1252,
  detectBom,
} from './encoding';

describe('tfvc encoding', () => {
  it('round-trips UTF-8 with BOM', () => {
    const buf = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('héllo\r\n', 'utf8'),
    ]);
    const d = decodeText(buf, CP_UTF8);
    expect(d).toEqual({ text: 'héllo\r\n', codePage: CP_UTF8, bom: true });
    expect(encodeText(d.text, d.codePage, d.bom).equals(buf)).toBe(true);
  });

  it('round-trips UTF-8 without BOM', () => {
    const buf = Buffer.from('plain', 'utf8');
    const d = decodeText(buf, CP_UTF8);
    expect(d.bom).toBe(false);
    expect(encodeText(d.text, d.codePage, d.bom).equals(buf)).toBe(true);
  });

  it('round-trips UTF-16LE with BOM', () => {
    const buf = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('añb', 'utf16le'),
    ]);
    const d = decodeText(buf, CP_UTF16LE);
    expect(d.text).toBe('añb');
    expect(encodeText(d.text, d.codePage, d.bom).equals(buf)).toBe(true);
  });

  it('round-trips Windows-1252 including the 0x80 range', () => {
    const buf = Buffer.from([0x80, 0x20, 0xe9, 0x93, 0x94]);
    const d = decodeText(buf, CP_1252);
    expect(d.text).toBe('€ é“”');
    expect(encodeText(d.text, CP_1252, false).equals(buf)).toBe(true);
  });

  it('rejects characters that do not fit Windows-1252', () => {
    expect(() => encodeText('漢', CP_1252, false)).toThrow(/Windows-1252/);
  });

  it('detects BOMs', () => {
    expect(detectBom(Buffer.from([0xef, 0xbb, 0xbf, 0x41]))).toBe(CP_UTF8);
    expect(detectBom(Buffer.from([0xff, 0xfe]))).toBe(CP_UTF16LE);
    expect(detectBom(Buffer.from('x'))).toBeUndefined();
  });
});
