// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
const jsonHeaders = (token) => ({ Accept: 'application/json', Authorization: `Bearer ${token}` });

export class AtelierProjectClient {
  constructor(config, { fetchImpl = fetch } = {}) {
    this.config = config;
    this.fetch = fetchImpl;
    this.basePath = `/api/tenants/${encodeURIComponent(config.tenantId)}/projects/${encodeURIComponent(config.projectId)}`;
  }

  async request(path) {
    const response = await this.fetch(`${this.config.origin}${this.basePath}${path}`, {
      method: 'GET',
      headers: jsonHeaders(this.config.token),
      redirect: 'error',
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const code = body?.error?.code ?? `HTTP_${response.status}`;
      const message = body?.error?.message ?? 'Atelier project request failed';
      throw new Error(`${code}: ${message}`);
    }
    return body;
  }

  model() {
    return this.request('/model');
  }
  search(query) {
    return this.request(`/search?q=${encodeURIComponent(query)}`);
  }
  components() {
    return this.request('/components');
  }

  async publishedComponent(id) {
    const component = await this.request(`/components/${encodeURIComponent(id)}`);
    if (component.status !== 'published')
      throw new Error('COMPONENT_UNAVAILABLE: component is not published');
    return component;
  }
}
