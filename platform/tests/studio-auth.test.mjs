import test from 'node:test';
import assert from 'node:assert/strict';
import { authScreen } from '../apps/studio/web/auth-screen.mjs';

const render = (input) => authScreen({ ...input, logo: '<i>logo</i>', arrowIcon: '<i>go</i>' });

test('signup screen asks only for name, email and a strong password', () => {
  const html = render({ mode: 'signup' });
  assert.match(html, /<h2>Start your studio\.<\/h2>/);
  assert.match(html, /name="displayName"[^>]*autocomplete="name"/);
  assert.match(html, /name="email"[^>]*type="email"[^>]*autocomplete="email"/);
  assert.match(html, /name="password"[^>]*autocomplete="new-password"[^>]*minlength="12"/);
  assert.match(html, />Create account</);
  assert.match(html, /href="\/login" data-auth-route>Sign in</);
  assert.doesNotMatch(html, /verification or recovery code/i);
});

test('login screen retains optional MFA and links to self-service signup', () => {
  const html = render({ mode: 'login' });
  assert.match(html, /Verification or recovery code/);
  assert.match(html, /href="\/signup" data-auth-route>Create an account</);
  assert.match(html, /autocomplete="current-password"/);
});

test('invitation screen remains separate from public account creation', () => {
  const html = render({ mode: 'login', joinToken: 'invite' });
  assert.match(html, /Workspace invitation/);
  assert.match(html, />Accept invitation</);
  assert.doesNotMatch(html, /name="email"/);
});
