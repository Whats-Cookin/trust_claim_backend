import { isValidUri, userIdToUri, getBaseUrl } from '../src/lib/validators';

describe('Validators', () => {
  // Save original env vars
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env vars before each test
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original env vars
    process.env = originalEnv;
  });

  describe('getBaseUrl', () => {
    const testCases = [
      { env: {}, expected: 'https://live.linkedtrust.us' },
      { env: { BASE_URL: 'https://test.example.com' }, expected: 'https://test.example.com' },
      { env: { FRONTEND_URL: 'https://frontend.example.com' }, expected: 'https://frontend.example.com' },
      { 
        env: { BASE_URL: 'https://test.example.com', FRONTEND_URL: 'https://frontend.example.com' }, 
        expected: 'https://frontend.example.com' 
      },
    ];

    testCases.forEach(({ env, expected }) => {
      it(`should return ${expected} with env ${JSON.stringify(env)}`, () => {
        Object.assign(process.env, env);
        expect(getBaseUrl()).toBe(expected);
      });
    });
  });

  describe('isValidUri', () => {
    const validUris = [
      'https://example.com',
      'http://localhost:3000',
      'ftp://ftp.example.com',
      'urn:isbn:0451450523',
      'did:example:123456789abcdefghi',
      'mailto:test@example.com',
    ];

    const invalidUris = [
      null,
      undefined,
      '',
      123,
      '123',
      '456',
      'not a uri',
      'example.com',
      '//example.com',
      'http:/missing-slash',
    ];

    validUris.forEach(uri => {
      it(`should return true for valid URI: ${uri}`, () => {
        expect(isValidUri(uri)).toBe(true);
      });
    });

    invalidUris.forEach(uri => {
      it(`should return false for invalid URI: ${uri}`, () => {
        expect(isValidUri(uri as any)).toBe(false);
      });
    });
  });

  describe('userIdToUri', () => {
    beforeEach(() => {
      delete process.env.FRONTEND_URL;
      delete process.env.BASE_URL;
    });

    it('should return null for undefined userId', () => {
      expect(userIdToUri(undefined)).toBeNull();
    });

    it('should convert numeric ID to URI', () => {
      expect(userIdToUri(123)).toBe('https://live.linkedtrust.us/user/123');
    });

    it('should convert numeric string ID to URI', () => {
      expect(userIdToUri('456')).toBe('https://live.linkedtrust.us/user/456');
    });

    it('should return valid URI unchanged', () => {
      const uri = 'https://example.com/user/789';
      expect(userIdToUri(uri)).toBe(uri);
    });

    it('should return DID unchanged', () => {
      const did = 'did:example:123456789abcdefghi';
      expect(userIdToUri(did)).toBe(did);
    });

    it('should return null for invalid non-numeric string', () => {
      expect(userIdToUri('not-a-uri')).toBeNull();
    });

    it('should use FRONTEND_URL when set', () => {
      process.env.FRONTEND_URL = 'https://test.example.com';
      expect(userIdToUri(123)).toBe('https://test.example.com/user/123');
    });
  });
});
