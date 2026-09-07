// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

export const markupText = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
