// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

const field = ({
  label,
  name,
  type = 'text',
  autocomplete,
  placeholder = '',
  maxlength = type === 'password' ? 256 : null,
}) =>
  `<label>${label}<input name="${name}" type="${type}" autocomplete="${autocomplete}"${placeholder ? ` placeholder="${placeholder}"` : ''} required${type === 'password' ? ' minlength="12"' : ''}${maxlength ? ` maxlength="${maxlength}"` : ''}></label>`;

function loginFields() {
  return `${field({ label: 'Email address', name: 'email', type: 'email', autocomplete: 'username', placeholder: 'you@company.com' })}${field({ label: 'Password', name: 'password', type: 'password', autocomplete: 'current-password', placeholder: 'At least 12 characters' })}<label>Verification or recovery code <span class="help">Only required when two-factor authentication is enabled.</span><input name="code" autocomplete="one-time-code" placeholder="Optional"></label>`;
}

function signupFields() {
  return `${field({ label: 'Your name', name: 'displayName', autocomplete: 'name', maxlength: 100 })}${field({ label: 'Work email', name: 'email', type: 'email', autocomplete: 'email', placeholder: 'you@company.com', maxlength: 254 })}${field({ label: 'Password', name: 'password', type: 'password', autocomplete: 'new-password', placeholder: 'At least 12 characters' })}`;
}

export function authScreen({ mode = 'login', joinToken = null, logo, arrowIcon }) {
  const joining = Boolean(joinToken);
  const signup = mode === 'signup' && !joining;
  const title = joining ? 'Join your team.' : signup ? 'Start your studio.' : 'Welcome back.';
  const description = joining
    ? 'Create an account or use your existing account password to accept this invitation.'
    : signup
      ? 'Create an account now. No email verification is required.'
      : 'Sign in to manage your projects and shape what comes next.';
  const fields = joining
    ? `${field({ label: 'Your name', name: 'displayName', autocomplete: 'name', maxlength: 100 })}${field({ label: 'Password', name: 'password', type: 'password', autocomplete: 'new-password', placeholder: 'At least 12 characters' })}`
    : signup
      ? signupFields()
      : loginFields();
  const submitLabel = joining ? 'Accept invitation' : signup ? 'Create account' : 'Sign in';
  const note = joining
    ? 'The invitation is single-use and expires automatically.'
    : signup
      ? 'Already have an account? <a href="/login" data-auth-route>Sign in</a>'
      : 'New to Atelier? <a href="/signup" data-auth-route>Create an account</a>';

  return `<div class="auth"><section class="auth-art"><a class="brand" href="/">${logo}atelier<sup>2.3</sup></a><h1>Good software.<br>A little more<br>personal.</h1><p>Understand your app. Discover what is missing. Build the workspace your users actually need.</p><div class="auth-modules"><div class="auth-module"><small>DISCOVER</small><strong>Your application.</strong></div><div class="auth-module"><small>EXTEND</small><strong>Your patterns.</strong></div></div><span class="eyebrow">Built for the apps you already use.</span></section><main class="auth-form-wrap" id="main"><div class="auth-box"><span class="eyebrow">${joining ? 'Workspace invitation' : signup ? 'Create your account' : 'Atelier Studio'}</span><h2>${title}</h2><p>${description}</p><form class="form" id="auth-form">${fields}<p class="form-error" role="alert"></p><button class="btn" type="submit">${submitLabel}${arrowIcon}</button></form><p class="auth-note">${note}</p></div></main><span class="auth-small">Atelier Studio</span></div>`;
}
