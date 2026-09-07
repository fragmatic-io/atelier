// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { canonical, hash } from '../../control-plane/src/util.mjs';
import { domBundle } from './template-dom.mjs';
import { nextBundle } from './template-next.mjs';
import { reactRouterBundle } from './template-react-router.mjs';

export function generateSurfaceInstall(input) {
  const seed = { ...input };
  delete seed.verificationKey;
  const bundleHash = hash(seed);
  const install = { ...input, bundleHash };
  const generated =
    install.framework === 'nextjs-app'
      ? nextBundle(install)
      : install.framework === 'react-router'
        ? reactRouterBundle(install)
        : domBundle(install);
  return {
    schemaVersion: 1,
    generatedAt: new Date(install.createdAt).toISOString(),
    install: {
      id: install.id,
      framework: install.framework,
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
    serverSecrets: {
      committed: false,
      required: ['ATELIER_HOST_TOKEN', 'ATELIER_CONFIRMATION_KEY'],
    },
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
