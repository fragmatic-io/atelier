// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

const presets = [
  {
    id: 'research',
    name: 'Research analyst',
    description: 'Reconciles evidence across approved read tools.',
    instructions:
      'Investigate the question using only the available evidence. Reconcile conflicting results, name material uncertainty, and return a concise evidence brief for the primary assistant.',
  },
  {
    id: 'workflow',
    name: 'Workflow analyst',
    description: 'Finds process state, blockers and practical next actions.',
    instructions:
      'Analyze the current workflow state and identify blockers, dependencies and the safest useful next actions. Distinguish observed facts from recommendations.',
  },
  {
    id: 'explanation',
    name: 'Explanation specialist',
    description: 'Produces clear audience-appropriate explanations.',
    instructions:
      'Explain the supplied evidence clearly for the user context. Preserve important caveats, avoid unsupported claims, and give the primary assistant a structured explanation it can synthesize.',
  },
];

export function agentSetupFields({ profile, project, enabled, hasProvider, e, pill }) {
  const selected = new Set(
      profile?.tools?.map((tool) => tool.id) ?? enabled.map((tool) => tool.id),
    ),
    configured = new Map(
      profile?.specialists?.map((specialist) => [specialist.id, specialist]) ?? [],
    ),
    firstSetup = !profile;
  return `<label>Assistant name<input name="name" required value="${e(profile?.name ?? `${project.name} assistant`)}"></label><label>Product voice<textarea name="tone" required>${e(profile?.voice?.tone ?? 'Clear, calm and precise')}</textarea></label><div class="two-fields"><label>Locale<input name="locale" value="${e(profile?.voice?.locale ?? 'en')}" required></label><label>Retention days<input name="retentionDays" type="number" min="1" max="90" value="${profile?.retentionDays ?? 30}" required></label></div><fieldset class="tool-select"><legend>Approved browser tools</legend><p class="help">Each selected API operation runs in the signed-in customer browser. Commands keep their reviewed confirmation and CSRF policy.</p>${enabled.map((capability) => `<label class="checkbox"><input type="checkbox" name="tools" value="${e(capability.id)}" ${selected.has(capability.id) ? 'checked' : ''}>${e(capability.title ?? capability.id)} ${pill(capability.kind)}</label>`).join('')}</fieldset><fieldset class="tool-select specialist-select"><legend>Deep-answer specialists</legend><p class="help">Each enabled specialist is a separate, auditable model turn. It receives only the selected read tools and can never run commands or delegate again.</p>${presets
    .map((preset) => {
      const saved = configured.get(preset.id),
        checked = saved || firstSetup;
      return `<div class="specialist-card"><label class="checkbox"><input type="checkbox" name="specialists" value="${preset.id}" ${checked ? 'checked' : ''}><span><strong>${e(preset.name)}</strong><small>${e(preset.description)}</small></span></label><label>Instructions<textarea name="${preset.id}Instructions" maxlength="1200">${e(saved?.instructions ?? preset.instructions)}</textarea></label></div>`;
    })
    .join(
      '',
    )}<label>Maximum specialist consultations per answer<select name="maxDelegations"><option value="1" ${profile?.maxDelegations === 1 ? 'selected' : ''}>1</option><option value="2" ${!profile || profile.maxDelegations === 2 ? 'selected' : ''}>2</option><option value="3" ${profile?.maxDelegations === 3 ? 'selected' : ''}>3</option></select></label></fieldset><label class="checkbox"><input type="checkbox" name="voiceReviewed" required>I reviewed the voice, retention, complete tool allowlist and specialist instructions.</label>${hasProvider ? '' : `<div class="info-strip">No project provider is connected. Save the profile now, then <a href="/project/${project.id}/settings"><strong>connect a provider in Settings</strong></a>. Atelier will not claim the chatbot is ready until both facts exist.</div>`}`;
}

export function specialistSetup(form, capabilities, tools) {
  const readTools = tools.filter(
      (toolId) => capabilities.find((capability) => capability.id === toolId)?.kind === 'query',
    ),
    selected = new Set(new FormData(form).getAll('specialists'));
  if (selected.size && !readTools.length)
    throw new Error('Deep-answer specialists require at least one approved read tool.');
  return {
    specialists: presets
      .filter((preset) => selected.has(preset.id))
      .map((preset) => ({
        ...preset,
        instructions: form.elements[`${preset.id}Instructions`].value,
        toolIds: readTools,
      })),
    maxDelegations: selected.size ? Number(form.elements.maxDelegations.value) : 1,
  };
}
