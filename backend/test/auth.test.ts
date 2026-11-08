import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, makeApp, newPhone, signUp, yearsAgo, type TestApp } from './helpers.js';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

describe('sign-in with an SMS code', () => {
  it('signs up a new number, then signs the same number back in', async () => {
    const phone = newPhone();
    const otp = await call(t, 'POST', '/auth/otp', undefined, { phone: phone.replace(/^0/, '+254') });
    expect(otp.status).toBe(200);
    expect(otp.body.devCode).toMatch(/^\d{6}$/);
    expect(t.sms.at(-1)).toContain(otp.body.devCode);

    const verify = await call(t, 'POST', '/auth/verify', undefined, { phone, code: otp.body.devCode });
    expect(verify.body).toMatchObject({ isNewUser: true });

    const signup = await call(t, 'POST', '/auth/signup', undefined, {
      signupToken: verify.body.signupToken, firstName: 'Amani', dateOfBirth: yearsAgo(24), goals: ['consistency', 'run_10k'], acceptTerms: true,
    });
    expect(signup.status).toBe(200);

    const me = await call(t, 'GET', '/me', signup.body.token);
    expect(me.body.termsVersion).toBe((await call(t, 'GET', '/terms')).body.member);
    expect(me.body.termsAcceptedAt).toBeTruthy();
    expect(me.body).toMatchObject({ firstName: 'Amani', canStake: true, goals: expect.arrayContaining(['consistency', 'run_10k']) });

    const again = await call(t, 'POST', '/auth/otp', undefined, { phone });
    const back = await call(t, 'POST', '/auth/verify', undefined, { phone, code: again.body.devCode });
    expect(back.body.isNewUser).toBe(false);
    expect(back.body.token).toBeTruthy();
  });

  it('rejects a wrong code and locks the code after 5 wrong tries', async () => {
    const phone = newPhone();
    const otp = await call(t, 'POST', '/auth/otp', undefined, { phone });
    const wrong = otp.body.devCode === '111111' ? '222222' : '111111';
    for (let i = 0; i < 5; i++) expect((await call(t, 'POST', '/auth/verify', undefined, { phone, code: wrong })).status).toBe(400);
    expect((await call(t, 'POST', '/auth/verify', undefined, { phone, code: otp.body.devCode })).status).toBe(429);
  });

  it('refuses numbers that are not Kenyan mobiles', async () => {
    const res = await call(t, 'POST', '/auth/otp', undefined, { phone: '12345' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Kenyan mobile number');
  });

  it('refuses sign-up without accepting the member terms', async () => {
    const phone = newPhone();
    const otp = await call(t, 'POST', '/auth/otp', undefined, { phone });
    const verify = await call(t, 'POST', '/auth/verify', undefined, { phone, code: otp.body.devCode });
    const res = await call(t, 'POST', '/auth/signup', undefined, { signupToken: verify.body.signupToken, firstName: 'Skip', dateOfBirth: yearsAgo(25) });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('accept the member terms');
  });

  it('refuses under-16s (rule enforced by the database)', async () => {
    const phone = newPhone();
    const otp = await call(t, 'POST', '/auth/otp', undefined, { phone });
    const verify = await call(t, 'POST', '/auth/verify', undefined, { phone, code: otp.body.devCode });
    const res = await call(t, 'POST', '/auth/signup', undefined, { signupToken: verify.body.signupToken, firstName: 'Teen', dateOfBirth: yearsAgo(15), acceptTerms: true });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('FitCircle is for ages 16 and up');
  });

  it('lets 16 and 17-year-olds in but marks them as unable to stake', async () => {
    const teen = await signUp(t, 'Zawadi', 17);
    const me = await call(t, 'GET', '/me', teen.token);
    expect(me.body).toMatchObject({ age: 17, canStake: false });
  });

  it('limits SMS code requests per IP address', async () => {
    const limited = await makeApp({ RATE_LIMIT: 'on' });
    try {
      const codes = [];
      for (let i = 0; i < 6; i++) codes.push((await call(limited, 'POST', '/auth/otp', undefined, { phone: newPhone() })).status);
      expect(codes).toEqual([200, 200, 200, 200, 200, 429]);
    } finally {
      await limited.close();
    }
  });

  it('requires a session for private routes', async () => {
    expect((await call(t, 'GET', '/me')).status).toBe(401);
    expect((await call(t, 'GET', '/me', 'not-a-token')).status).toBe(401);
  });
});
