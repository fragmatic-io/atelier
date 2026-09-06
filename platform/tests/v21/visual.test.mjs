import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, scanned, generated, runJob } from './helpers.mjs';
test('vision review uses image bytes and per-stage API routing; exact artifact approval is enforced', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  await scanned(f);
  const { releaseIds } = await generated(f, { variants: 1 });
  const c = f.service.createConnection(f.who, f.tenant.id, {
    name: 'Vision fixture',
    kind: 'openai',
    model: 'vision-test',
    apiKey: 'test-only-vision',
    projectId: f.project.id,
  });
  const p = f.service.project(f.who, f.tenant.id, f.project.id);
  f.service.updateProject(f.who, f.tenant.id, p.id, {
    revision: p.revision,
    providerId: c.id,
    model: 'vision-test',
    settings: {
      visualReviewRequired: true,
      modelRouting: { visual: { connectionId: c.id, model: 'vision-test' } },
    },
  });
  assert.throws(
    () =>
      f.service.approve(f.who, f.tenant.id, p.id, releaseIds[0], {
        approved: true,
        previewReviewed: true,
      }),
    /screenshot/i,
  );
  const image =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=';
  assert.throws(
    () =>
      f.service.queueVisualReview(f.who, f.tenant.id, p.id, releaseIds[0], {
        images: [{ dataUrl: image }],
      }),
    /redacted/,
  );
  f.service.queueVisualReview(f.who, f.tenant.id, p.id, releaseIds[0], {
    images: [{ dataUrl: image, state: 'ready' }],
    redacted: true,
  });
  let inspected = false;
  await runJob(f, {
    apiFactory: (config) => ({
      async generate(req) {
        assert.equal(config.model, 'vision-test');
        assert.equal(req.images[0].dataUrl, image);
        inspected = true;
        return {
          value: {
            approved: true,
            issues: [],
            strengths: ['Mocked vision response, not real aesthetic validation'],
          },
          model: 'vision-test',
          provider: 'fixture',
          usage: { inputTokens: 10, outputTokens: 10 },
        };
      },
    }),
  });
  assert.equal(inspected, true);
  assert.equal(
    f.service.approve(f.who, f.tenant.id, p.id, releaseIds[0], {
      approved: true,
      previewReviewed: true,
    }).status,
    'approved',
  );
});
