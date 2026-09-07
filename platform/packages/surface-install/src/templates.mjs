// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { canonical, hash } from '../../control-plane/src/util.mjs';
import { surfaceTargetProfile } from './target-profiles.mjs';
import { hostedScriptBundle } from './template-hosted.mjs';

export function generateSurfaceInstall(input) {
  const target = surfaceTargetProfile(input.framework);
  const seed = { ...input, target };
  delete seed.verificationKey;
  const bundleHash = hash(seed);
  const install = { ...input, target, bundleHash };
  const generated = hostedScriptBundle(install);
  return {
    schemaVersion: 1,
    generatedAt: new Date(install.createdAt).toISOString(),
    install: {
      id: install.id,
      framework: install.framework,
      target: install.target,
      mode: install.mode,
      applicationOrigin: install.applicationOrigin,
      routePath: install.routePath,
      navLabel: install.navLabel,
      bridgePath: install.bridgePath,
      slotId: install.slotId,
      environment: install.environment,
      designFingerprint: install.designFingerprint,
      bundleHash,
    },
    publicVerification: {
      key: install.verificationKey,
      endpoint: `${install.controlOrigin}/api/install/v1/events`,
      originBound: install.applicationOrigin,
      authority: 'Operational evidence only; never an authorization grant.',
    },
    serverSecrets: { committed: false, required: [] },
    files: generated.files,
    patches: generated.patches,
    verification: {
      requiredFacts: [
        'routeMounted',
        'bridgeReachable',
        'authorityConfigured',
        'designContractBound',
      ],
      completeOnlyWhenAllTrue: true,
    },
    digest: hash(canonical({ files: generated.files, patches: generated.patches, bundleHash })),
  };
}
